/**
 * Day view: all-day section plus a 24-hour timeline with absolutely
 * positioned event cards. Timed events are shown in the viewer's zone.
 */

import { getState, subscribe } from "../state.js";
import { todayKey } from "../lib/dates.js";
import { zonedWallToInstant, userTimeZone } from "../lib/timezones.js";
import { eventsForRange } from "../data/events.js";
import { agendaCard, agendaEmpty } from "./agendaCard.js";
import { openEventDetail } from "./eventDetail.js";

const HOUR_PX = 96;

/** @returns {HTMLElement} */
export function mountDayView() {
  const root = document.createElement("div");
  root.className = "day-view";

  const allday = document.createElement("section");
  allday.className = "day-all-day";
  const scroll = document.createElement("div");
  scroll.className = "day-scroll";
  const timeline = document.createElement("div");
  timeline.className = "day-timeline";
  scroll.append(timeline);

  root.append(allday, scroll);

  const render = () => {
    const { cursor, events } = getState();
    const viewerZone = userTimeZone();
    const entries = eventsForRange(events, cursor, cursor, viewerZone);
    renderAllDaySection(allday, entries);
    renderTimeline(timeline, entries, cursor, viewerZone);
  };
  subscribe(render);
  render();

  const alldayH = allday.offsetHeight + 16;

  requestAnimationFrame(function targetScroll() {
    if (!root.isConnected) {
      requestAnimationFrame(targetScroll);
      return;
    }
    const scroller = /** @type {HTMLElement|null} */ (root.closest(".view-root")) ?? root;
    const { cursor } = getState();
    if (cursor === todayKey()) {
      const now = new Date();
      scroller.scrollTop = Math.max(0, alldayH + ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX - 160);
    } else {
      scroller.scrollTop = alldayH + 8 * HOUR_PX - 80;
    }
  });

  return root;
}

/**
 * @param {HTMLElement} allday
 * @param {{ date: string, event: import("../data/events.js").Event }[]} entries
 */
function renderAllDaySection(allday, entries) {
  const allDayEvents = entries.filter((entry) => entry.event.time === null).map((entry) => entry.event);
  allday.replaceChildren();
  const label = document.createElement("span");
  label.className = "day-all-day__label";
  label.textContent = "ALL-DAY";
  allday.append(label);
  if (allDayEvents.length === 0) {
    allday.append(agendaEmpty("None"));
  } else {
    for (const event of allDayEvents) {
      allday.append(agendaCard(event, "ALL-DAY"));
    }
  }
}

/**
 * @param {HTMLElement} timeline
 * @param {{ date: string, event: import("../data/events.js").Event }[]} entries
 * @param {string} day
 * @param {string} viewerZone
 */
function renderTimeline(timeline, entries, day, viewerZone) {
  timeline.replaceChildren();
  timeline.style.setProperty("--hour-px", `${HOUR_PX}px`);

  const timed = entries
    .filter((entry) => entry.event.time !== null)
    .map((entry) => ({ event: entry.event, minute: viewerMinuteOf(entry, viewerZone) }))
    .sort((a, b) => a.minute - b.minute);

  for (let h = 0; h < 24; h += 1) {
    const row = document.createElement("div");
    row.className = "day-timeline__hour";
    row.style.top = `${h * HOUR_PX}px`;
    const label = document.createElement("span");
    label.className = "day-timeline__hour-label";
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    const line = document.createElement("span");
    line.className = "day-timeline__hour-line";
    row.append(label, line);
    timeline.append(row);
  }

  // Cards stack with a small horizontal offset when they collide.
  let lastEnd = -1;
  let overlapIndex = 0;
  for (const item of timed) {
    const top = (item.minute / 60) * HOUR_PX;
    if (item.minute < lastEnd) {
      overlapIndex += 1;
    } else {
      overlapIndex = 0;
    }
    lastEnd = Math.max(lastEnd, item.minute + 60);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "day-card";
    card.style.top = `${top}px`;
    if (overlapIndex > 0) {
      card.classList.add("is-overlap");
      card.style.setProperty("--overlap-x", `${overlapIndex * 12}px`);
    }
    const title = document.createElement("span");
    title.className = "day-card__title";
    title.textContent = item.event.title;
    const time = document.createElement("span");
    time.className = "day-card__time";
    time.textContent = timeLabel(item.minute, item.event.timezone, viewerZone);
    card.append(title, time);
    card.addEventListener("click", () => openEventDetail({ event: item.event }));
    timeline.append(card);
  }

  if (day === todayKey()) {
    const now = new Date();
    const line = document.createElement("div");
    line.className = "day-now-line";
    line.setAttribute("aria-hidden", "true");
    line.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px`;
    timeline.append(line);
  }
}

/**
 * UTC instant of the event's absolute start, expressed as minute-of-day
 * in the viewer's zone (= the wall clock a viewer should see).
 * @param {{ date: string, event: import("../data/events.js").Event }} entry
 * @param {string} viewerZone
 */
function viewerMinuteOf(entry, viewerZone) {
  const event = entry.event;
  const instantMs = zonedWallToInstant(entry.date, event.time ?? "00:00", event.timezone ?? viewerZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: viewerZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instantMs));
  const value = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Math.max(0, Math.min(24 * 60, value("hour") * 60 + value("minute")));
}

/** @param {number} minute @param {string|null} eventZone @param {string} viewerZone */
function timeLabel(minute, eventZone, viewerZone) {
  const hh = String(Math.floor(minute / 60) % 24).padStart(2, "0");
  const mm = String(((minute % 60) + 60) % 60).padStart(2, "0");
  if (eventZone === viewerZone) return `${hh}:${mm}`;
  return `${hh}:${mm} ${viewerZone}`;
}
