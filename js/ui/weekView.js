/**
 * Week view: 7-day strip header (tap to select a day) over a vertical
 * agenda of the whole week grouped by day. Renders from state only.
 */

import { getState, setState, subscribe } from "../state.js";
import { addDays, startOfWeek, todayKey, parseDate, pad2 } from "../lib/dates.js";
import { eventsForRange } from "../data/events.js";
import { userTimeZone } from "../lib/timezones.js";
import { agendaCard, agendaEmpty } from "./agendaCard.js";

const DAY_DOT_COLORS = {
  red: "var(--event-red)",
  green: "var(--event-green)",
  yellow: "var(--event-yellow)",
  orange: "var(--event-orange)",
  teal: "var(--event-teal)",
  blue: "var(--event-blue)",
  purple: "var(--event-purple)",
  pink: "var(--event-pink)",
};

/** @returns {HTMLElement} */
export function mountWeekView() {
  const root = document.createElement("div");
  root.className = "week-view";

  const strip = document.createElement("div");
  strip.className = "week-strip";
  const list = document.createElement("div");
  list.className = "week-list";

  root.append(strip, list);

  const render = () => {
    const { cursor, events, weekStartsOn, selectedDay } = getState();
    const weekStart = startOfWeek(cursor, weekStartsOn);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const entries = eventsForRange(events, weekStart, addDays(weekStart, 6), userTimeZone());

    /** @type {Map<string, import("../data/events.js").Event[]>} */
    const byDay = new Map();
    for (const day of days) byDay.set(day, []);
    for (const entry of entries) {
      const bucket = byDay.get(entry.date);
      if (bucket) bucket.push(entry.event);
    }
    for (const bucket of byDay.values()) {
      bucket.sort(
        (a, b) => (a.time ?? "24:00").localeCompare(b.time ?? "24:00") || a.title.localeCompare(b.title),
      );
    }

    renderStrip(strip, days, byDay, selectedDay, todayKey());
    renderList(list, days, byDay, selectedDay);
  };
  subscribe(render);
  render();

  strip.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const cell = target.closest(".week-strip__cell");
      if (cell instanceof HTMLElement && cell.dataset.date) {
        setState({ selectedDay: cell.dataset.date });
      }
    }
  });

  return root;
}

/**
 * @param {HTMLElement} strip
 * @param {string[]} days
 * @param {Map<string, import("../data/events.js").Event[]>} byDay
 * @param {string|null} selectedDay
 * @param {string} today
 */
function renderStrip(strip, days, byDay, selectedDay, today) {
  strip.replaceChildren();
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  for (const day of days) {
    const parts = parseDate(day);
    if (!parts) continue;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "week-strip__cell";
    cell.dataset.date = day;
    if (day === selectedDay) cell.classList.add("is-selected");
    if (day === today) cell.classList.add("is-today");

    const label = document.createElement("span");
    label.className = "week-strip__label";
    label.textContent = weekdayFmt.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day))).toUpperCase();
    const num = document.createElement("span");
    num.className = "week-strip__num";
    num.textContent = pad2(parts.day);

    const dots = document.createElement("span");
    dots.className = "week-strip__dots";
    dots.setAttribute("aria-hidden", "true");
    for (const evt of (byDay.get(day) ?? []).slice(0, 3)) {
      const dot = document.createElement("span");
      dot.className = "week-strip__dot";
      dot.style.background = DAY_DOT_COLORS[evt.color] ?? "var(--event-blue)";
      dots.append(dot);
    }

    cell.setAttribute(
      "aria-label",
      `${weekdayFmt.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))} ${pad2(parts.day)}, ${
        (byDay.get(day) ?? []).length
      } events`,
    );
    cell.append(label, num, dots);
    strip.append(cell);
  }
}

/**
 * Agenda of the week grouped by day; the selected day's section is
 * highlighted and kept in view.
 * @param {HTMLElement} list
 * @param {string[]} days
 * @param {Map<string, import("../data/events.js").Event[]>} byDay
 * @param {string|null} selectedDay
 */
function renderList(list, days, byDay, selectedDay) {
  list.replaceChildren();
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
  for (const day of days) {
    const entries = byDay.get(day) ?? [];
    const section = document.createElement("section");
    section.className = "week-section";
    if (day === selectedDay) section.classList.add("is-selected");
    section.dataset.date = day;

    const header = document.createElement("header");
    header.className = "week-section__head";
    const marker = document.createElement("span");
    marker.className = "week-section__marker";
    marker.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "week-section__title";
    title.textContent = `${dayFmt
      .format(new Date(...splitParts(day)))
      .toUpperCase()} // ${entries.length} ${entries.length === 1 ? "SLOT" : "SLOTS"}`;
    header.append(marker, title);
    section.append(header);

    if (entries.length === 0) {
      section.append(agendaEmpty("No events"));
    } else {
      for (const event of entries) {
        section.append(agendaCard(event, event.time ?? "ALL-DAY"));
      }
    }
    list.append(section);
  }
  if (selectedDay) {
    const target = /** @type {HTMLElement|null} */ (list.querySelector(`.week-section[data-date="${selectedDay}"]`));
    if (target) target.scrollIntoView({ block: "nearest" });
  }
}

/** @param {string} key @returns {[number, number, number]} */
function splitParts(key) {
  const parts = parseDate(key);
  if (!parts) return [1970, 0, 1];
  return [parts.year, parts.month - 1, parts.day];
}
