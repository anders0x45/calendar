/**
 * Rich agenda card (thumbnail + time + title + location) used by the
 * week agenda list and the day view's all-day section.
 */

import { EVENT_COLORS } from "../config.js";
import { inkForBackground } from "../lib/color.js";
import { getImage } from "../data/images.js";
import { openEventDetail } from "./eventDetail.js";

/** @typedef {import("../data/events.js").Event} Event */

/**
 * @param {Event} event
 * @param {string} timeLabel "HH:mm" | "ALL-DAY" | null (no time line)
 * @returns {HTMLElement} tappable card
 */
export function agendaCard(event, timeLabel) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "agenda-card";
  card.dataset.eventId = event.id;

  const media = document.createElement("span");
  media.className = "agenda-card__media";
  const color = EVENT_COLORS[event.color] ?? EVENT_COLORS.blue;
  media.style.background = color;
  media.style.color = inkForBackground(color);
  media.setAttribute("aria-hidden", "true");
  media.textContent = event.title.trim().charAt(0).toUpperCase() || "•";

  const body = document.createElement("span");
  body.className = "agenda-card__body";
  if (timeLabel) {
    const time = document.createElement("span");
    time.className = "agenda-card__time";
    time.textContent = timeLabel;
    body.append(time);
  }
  const title = document.createElement("span");
  title.className = "agenda-card__title";
  title.textContent = event.title;
  body.append(title);

  const metaBits = [];
  if (event.locationLink && /^https?:\/\//.test(event.locationLink)) {
    metaBits.push(urlShort(event.locationLink));
  }
  if (event.recurrence) {
    metaBits.push("Repeats " + event.recurrence.freq);
  }
  if (metaBits.length > 0) {
    const meta = document.createElement("span");
    meta.className = "agenda-card__meta";
    meta.textContent = metaBits.join("  ·  ");
    body.append(meta);
  }

  card.append(media, body);
  card.addEventListener("click", () => openEventDetail({ event }));

  // Stored artwork replaces the letter block once generation is done.
  if (event.imageStatus === "ready") {
    getImage(event.id).then((blob) => {
      if (blob && card.isConnected) {
        const img = document.createElement("img");
        img.className = "agenda-card__img";
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.src = URL.createObjectURL(blob);
        media.replaceWith(img);
      }
    });
  }
  return card;
}

/**
 * Empty-state line for a day with no events.
 * @param {string} message
 * @returns {HTMLElement}
 */
export function agendaEmpty(message) {
  const el = document.createElement("p");
  el.className = "agenda-empty";
  el.textContent = message;
  return el;
}

/** @param {string} url */
function urlShort(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
  } catch {
    return url;
  }
}
