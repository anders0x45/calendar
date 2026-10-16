/**
 * Month view: a 6-row grid over the cursor month, compact event chips,
 * today + selection styling, and a selected-day info strip.
 * Renders idempotently from state; click targets are event-delegated.
 */

import { getState, setState, subscribe } from "../state.js";
import { monthGrid, parseDate, todayKey } from "../lib/dates.js";
import { eventsForRange } from "../data/events.js";
import { EVENT_COLORS, MONTH_CELL_MAX_CHIPS } from "../config.js";
import { inkForBackground } from "../lib/color.js";
import { userTimeZone } from "../lib/timezones.js";
import { openEventDetail } from "./eventDetail.js";

/** @returns {HTMLElement} */
export function mountMonthView() {
  const root = document.createElement("div");
  root.className = "month-view";

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "month-weekdays";

  const grid = document.createElement("div");
  grid.className = "month-grid";

  const strip = document.createElement("div");
  strip.className = "day-strip";

  root.append(weekdayRow, grid, strip);

  const render = () => {
    const { cursor, events, weekStartsOn, selectedDay } = getState();
    renderWeekdays(weekdayRow, weekStartsOn);
    renderGrid(grid, cursor, events, weekStartsOn, selectedDay, todayKey());
    renderStrip(strip, selectedDay, events);
  };
  subscribe(render);
  render();

  grid.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const chipEl = /** @type {HTMLElement} */ (target.closest(".event-chip"));
    if (chipEl) {
      const found = findEntry(chipEl.dataset.eventId ?? "");
      if (found) {
        openEventDetail({ event: found });
        return;
      }
    }
    const cell = target.closest(".month-cell");
    if (cell instanceof HTMLElement && cell.dataset.date) {
      setState({ selectedDay: cell.dataset.date });
    }
  });

  return root;
}

/**
 * Look up an event by id in the current state.
 * @param {string} id
 * @returns {{event: import("../data/events.js").Event} | null}
 */
function findEntry(id) {
  return getState().events.find((event) => event.id === id) ?? null;
}

/**
 * @param {HTMLElement} row
 * @param {0|1} weekStartsOn
 */
function renderWeekdays(row, weekStartsOn) {
  row.replaceChildren();
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  // Reference week: Sunday 2026-01-04 .. Saturday 2026-01-10
  for (let i = 0; i < 7; i += 1) {
    const weekdayIndex = (weekStartsOn + i) % 7;
    const label = fmt.format(new Date(Date.UTC(2026, 0, 4 + weekdayIndex)));
    const cell = document.createElement("span");
    cell.className = "month-weekdays__cell" + (weekdayIndex === 6 ? " is-sunday" : "");
    cell.textContent = label.toUpperCase();
    row.append(cell);
  }
}

/**
 * @param {HTMLElement} grid
 * @param {string} cursor
 * @param {import("../data/events.js").Event[]} events
 * @param {0|1} weekStartsOn
 * @param {string|null} selectedDay
 * @param {string} today
 */
function renderGrid(grid, cursor, events, weekStartsOn, selectedDay, today) {
  const cells = monthGrid(cursor, weekStartsOn);
  const monthOfCursor = cursor.slice(0, 7);
  const entries = eventsForRange(events, cells[0], cells[cells.length - 1], userTimeZone());

  /** @type {Map<string, {event: import("../data/events.js").Event}[]>} */
  const byDay = new Map();
  for (const entry of entries) {
    if (!byDay.has(entry.date)) byDay.set(entry.date, []);
    byDay.get(entry.date).push({ event: entry.event });
  }

  grid.replaceChildren();
  for (const key of cells) {
    grid.append(monthCell(key, monthOfCursor, byDay, selectedDay, today));
  }
}

/**
 * @param {string} key
 * @param {string} monthOfCursor "YYYY-MM"
 * @param {Map<string, {event: import("../data/events.js").Event}[]>} byDay
 * @param {string|null} selectedDay
 * @param {string} today
 * @returns {HTMLElement}
 */
function monthCell(key, monthOfCursor, byDay, selectedDay, today) {
  const cell = document.createElement("div");
  cell.className = "month-cell";
  cell.dataset.date = key;
  cell.setAttribute("role", "button");
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-label", dateLabel(key, byDay));

  const inMonth = key.slice(0, 7) === monthOfCursor;
  if (!inMonth) cell.classList.add("is-outside");
  if (key === today) cell.classList.add("is-today");
  if (key === selectedDay) cell.classList.add("is-selected");
  cell.setAttribute("aria-current", key === today ? "date" : "false");

  const dayHead = document.createElement("div");
  dayHead.className = "month-cell__head";
  const dayNum = document.createElement("span");
  dayNum.className = "month-cell__day";
  dayNum.textContent = String(parseDate(key).day).padStart(2, "0");
  dayHead.append(dayNum);
  if (key === today) {
    const badge = document.createElement("span");
    badge.className = "month-cell__today";
    badge.textContent = "TODAY";
    dayHead.prepend(badge);
  }

  cell.append(dayHead);

  const dayEvents = byDay.get(key) ?? [];
  const shown = dayEvents.slice(0, MONTH_CELL_MAX_CHIPS);
  for (const { event } of shown) {
    cell.append(chip(event));
  }
  if (dayEvents.length > MONTH_CELL_MAX_CHIPS) {
    const extra = document.createElement("span");
    extra.className = "month-cell__more";
    extra.textContent = `+${dayEvents.length - MONTH_CELL_MAX_CHIPS}`;
    cell.append(extra);
  }
  return cell;
}

/**
 * @param {import("../data/events.js").Event} event
 * @returns {HTMLElement}
 */
function chip(event) {
  const chipEl = document.createElement("button");
  chipEl.type = "button";
  chipEl.className = "event-chip";
  chipEl.dataset.eventId = event.id;
  const color = EVENT_COLORS[event.color] ?? EVENT_COLORS.blue;
  const ink = inkForBackground(color);
  chipEl.style.background = color;
  chipEl.style.color = ink;
  chipEl.textContent = event.title;
  return chipEl;
}

/** Accessible label of a day cell. */
function dateLabel(key, byDay) {
  const count = (byDay.get(key) ?? []).length;
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
  const base = fmt.format(toDateObj(key));
  return count === 0 ? base : `${base}, ${count} ${count === 1 ? "event" : "events"}`;
}

/** @param {string} key @returns {Date} */
function toDateObj(key) {
  const { year, month, day } = parseDate(key);
  return new Date(year, month - 1, day);
}

/**
 * Selected-day info strip (design's "quick info" line).
 * @param {HTMLElement} strip
 * @param {string|null} selectedDay
 * @param {import("../data/events.js").Event[]} events
 */
function renderStrip(strip, selectedDay, events) {
  strip.replaceChildren();
  if (!selectedDay) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const viewerZone = userTimeZone();
  const entries = eventsForRange(events, selectedDay, selectedDay, viewerZone).sort(compareByTime);

  const badge = document.createElement("div");
  badge.className = "day-strip__badge";
  const { day } = parseDate(selectedDay);
  badge.textContent = String(day).padStart(2, "0");

  const info = document.createElement("div");
  info.className = "day-strip__info";
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
  const title = document.createElement("span");
  title.className = "day-strip__title";
  title.textContent = `${fmt
    .format(toDateObj(selectedDay))
    .toUpperCase()} // ${entries.length} SCHEDULED ${entries.length === 1 ? "EVENT" : "EVENTS"}`;
  const next = document.createElement("span");
  next.className = "day-strip__next";
  const nextEntry = firstUpcoming(entries, selectedDay);
  next.textContent = nextEntry
    ? `Next: ${nextEntry.event.title} (${timeLabel(nextEntry)})`
    : "No events";
  info.append(title, next);

  strip.append(badge, info);
}

/**
 * First entry at-or-after "now" on the selected day, else first entry.
 */
function firstUpcoming(entries, selectedDay) {
  const nowTime = new Date().getHours() * 60 + new Date().getMinutes();
  if (selectedDay !== todayKey()) return entries[0] ?? null;
  return (
    entries.find((entry) => minutesOf(entry) >= nowTime) ?? entries[0] ?? null
  );
}

/** @param {{event: import("../data/events.js").Event}} entry */
function minutesOf(entry) {
  if (!entry.event.time) return 0;
  const [h, m] = entry.event.time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * @param {{event: import("../data/events.js").Event, date: string}} a
 * @param {{event: import("../data/events.js").Event, date: string}} b
 */
function compareByTime(a, b) {
  const at = a.event.time ?? "99:99";
  const bt = b.event.time ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.event.title.localeCompare(b.event.title);
}

/** @param {{event: import("../data/events.js").Event}} entry */
function timeLabel(entry) {
  if (!entry.event.time) return "All-day";
  return entry.event.time;
}
