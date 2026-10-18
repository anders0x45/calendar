/**
 * Event detail sheet: large image banner, title, converted time with a
 * timezone relay note, venue link, and Edit/Delete actions. Delete
 * commits only after the undo toast expires; UNDO simply cancels it.
 */

import { openSheet, renderSheetHead } from "./sheet.js";
import { openEventForm } from "./eventSheet.js";
import { refreshEvents } from "./refresh.js";
import { showToast } from "./toast.js";
import { deleteEvent, deleteOccurrence, saveEvent } from "../data/events.js";
import { getImage } from "../data/images.js";
import { EVENT_COLORS, UNDO_TOAST_MS } from "../config.js";
import { isValidHttpUrl } from "../lib/validate.js";
import { inkForBackground } from "../lib/color.js";
import { zonedWallToInstant, instantToDateKey, instantToTimeKey, userTimeZone } from "../lib/timezones.js";

/** @typedef {import("../data/events.js").Event} Event */

/**
 * @param {{event: Event, onClose?: () => void}} options
 * @returns {() => void} close handle
 */
export function openEventDetail({ event, onClose }) {
  const { body, close } = openSheet({ label: "Event detail", onClose });
  body.classList.add("sheet--detail");
  render(body, event, close);
  // Head goes in last (then to the top): render() replaces body content.
  const { head } = renderSheetHead(body, "SYS.EVENT_LOG", close);
  body.prepend(head);
  return close;
}

/**
 * @param {HTMLElement} body @param {Event} event @param {() => void} close
 */
function render(body, event, close) {
  body.replaceChildren(
    detailBanner(event),
    titleCard(event),
    whenCard(event),
    venueCard(event),
    recurrenceCard(event),
  );

  const actions = document.createElement("div");
  actions.className = "detail-actions";

  const editBtn = button("[ EDIT EVENT ]", "btn detail-actions__edit");
  editBtn.addEventListener("click", () => {
    close();
    openEventForm({ existing: event });
  });
  const deleteBtn = button("[ DELETE ]", "btn btn--danger detail-actions__delete");
  deleteBtn.addEventListener("click", () => confirmDelete(event, close));
  actions.append(editBtn, deleteBtn);
  body.append(actions);
}

/**
 * Delete flow. Recurring events ask for scope first; the delete commits
 * only after the undo toast expires. Undo cancels the pending commit.
 * @param {Event} event
 * @param {() => void} closeDetail
 */
function confirmDelete(event, closeDetail) {
  /** @type {number | null} */
  let timer = null;

  const beginDeletion = (/** @type {"only"|"all"} */ scope) => {
    const apply = scope === "all"
      ? () => deleteEvent(event.id)
      : () => deleteOccurrence(event, "only", event.date);

    closeDetail();
    showToast({
      message: "Event deleted.",
      subtext: `"${event.title}" cleared`,
      onUndo: () => {
        if (timer !== null) clearTimeout(timer);
      },
    });
    timer = setTimeout(() => {
      apply()
        .then(refreshEvents)
        .catch((error) => console.error("delete failed", error));
    }, UNDO_TOAST_MS + 200);
  };

  if (event.recurrence) openScopeDialog(event, beginDeletion);
  else beginDeletion("all");
}

/** @param {string} label @param {string} className */
function button(label, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  return btn;
}

/**
 * @param {Event} event
 * @returns {HTMLElement}
 */
function detailBanner(event) {
  const banner = document.createElement("div");
  banner.className = "detail-banner";
  const placeholder = document.createElement("div");
  placeholder.className = "detail-banner__placeholder";
  const color = EVENT_COLORS[event.color] ?? EVENT_COLORS.blue;
  placeholder.style.background = color;
  placeholder.style.color = inkForBackground(color);
  placeholder.textContent = event.title.trim().charAt(0).toUpperCase() || "•";
  const tag = document.createElement("span");
  tag.className = "detail-banner__tag";
  tag.textContent = "REC_PREVIEW";
  banner.append(placeholder, tag);

  // Art status: ready -> real image; pending -> tag flips; failed -> tag
  // plus a regenerate action. Async blob load keeps render synchronous.
  if (event.imageStatus === "ready") {
    tag.textContent = "ART_READY";
    getImage(event.id).then((blob) => {
      if (blob && banner.isConnected) {
        const img = document.createElement("img");
        img.className = "detail-banner__img";
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.src = URL.createObjectURL(blob);
        banner.replaceChildren(img, tag);
      }
    });
  } else if (event.imageStatus === "pending") {
    tag.textContent = "GEN_QUEUED…";
  } else if (event.imageStatus === "failed") {
    tag.textContent = "GEN_FAILED";
    const retry = button("[ REGENERATE ]", "btn detail-banner__retry");
    retry.addEventListener("click", async () => {
      try {
        await saveEvent({ ...event, imageStatus: "pending", updatedAt: Date.now() });
        await refreshEvents();
        tag.textContent = "GEN_QUEUED…";
        retry.remove();
      } catch (error) {
        console.error("regenerate failed", error);
        showToast({ message: "Could not queue artwork", isError: true });
      }
    });
    banner.append(retry);
  }
  return banner;
}

/**
 * @param {Event} event
 * @returns {HTMLElement}
 */
function titleCard(event) {
  const card = document.createElement("div");
  card.className = "detail-card raised-plate";
  const h2 = document.createElement("h2");
  h2.className = "detail-card__title";
  h2.textContent = event.title;
  const meta = document.createElement("p");
  meta.className = "detail-card__meta";
  meta.textContent = event.color.toUpperCase();
  card.append(h2, meta);
  return card;
}

/**
 * Date + time card; includes the timezone relay note when the event's
 * stored zone differs from the viewer's.
 * @param {Event} event
 * @returns {HTMLElement}
 */
function whenCard(event) {
  const card = document.createElement("div");
  card.className = "detail-card raised-plate";
  const viewerZone = userTimeZone();
  const zoneDiffers = Boolean(event.time) && Boolean(event.timezone) && event.timezone !== viewerZone;

  let viewerDate = event.date;
  let viewerTime = event.time;
  if (zoneDiffers) {
    const instant = zonedWallToInstant(event.date, /** @type {string} */ (event.time), /** @type {string} */ (event.timezone));
    viewerDate = instantToDateKey(instant, viewerZone);
    viewerTime = instantToTimeKey(instant, viewerZone);
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(toDate(viewerDate));

  const dateLine = document.createElement("p");
  dateLine.className = "detail-card__date";
  dateLine.textContent = dateLabel.toUpperCase();
  card.append(dateLine);

  if (zoneDiffers) {
    const note = document.createElement("p");
    note.className = "detail-card__zone-note";
    note.textContent = `${event.time} ${event.timezone} = ${viewerTime} your time (${viewerZone})`;
    card.append(note);
  } else if (event.time) {
    const timeLine = document.createElement("p");
    timeLine.className = "detail-card__time";
    timeLine.textContent = event.time;
    card.append(timeLine);
  } else {
    const allDay = document.createElement("p");
    allDay.className = "detail-card__time";
    allDay.textContent = "ALL-DAY";
    card.append(allDay);
  }
  return card;
}

/**
 * Venue card with a safe external link.
 * @param {Event} event
 * @returns {HTMLElement}
 */
function venueCard(event) {
  const card = document.createElement("div");
  card.className = "detail-card raised-plate";
  const label = document.createElement("span");
  label.className = "form-label";
  label.textContent = "VENUE";
  card.append(label);
  const link = event.locationLink && isValidHttpUrl(event.locationLink) ? event.locationLink : null;
  const text = document.createElement("p");
  text.className = "detail-card__link-text";
  text.textContent = link ?? "No location set";
  card.append(text);
  if (link) {
    const open = document.createElement("a");
    open.className = "btn detail-card__map";
    open.href = link;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "OPEN LOCATION";
    card.append(open);
  }
  return card;
}

/**
 * Repeat summary when the event recurs.
 * @param {Event} event
 * @returns {HTMLElement}
 */
function recurrenceCard(event) {
  if (!event.recurrence) {
    return document.createElement("div");
  }
  const card = document.createElement("div");
  card.className = "detail-card raised-plate";
  const label = document.createElement("span");
  label.className = "form-label";
  label.textContent = "REPEATS";
  const text = document.createElement("p");
  text.className = "detail-card__recurrence";
  const r = event.recurrence;
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.freq] ?? r.freq;
  const plural = r.interval > 1 ? "s" : "";
  const until = r.until ? ` until ${r.until}` : ", no end";
  const skipped = r.exceptions.length > 0 ? `, ${r.exceptions.length} skipped` : "";
  text.textContent = `Every ${r.interval} ${unit}${plural}${until}${skipped}`;
  card.append(label, text);
  return card;
}

/**
 * Scope chooser for recurring deletes (this occurrence vs whole series).
 * @param {Event} event
 * @param {(scope: "only"|"all") => void} onChoose
 */
function openScopeDialog(event, onChoose) {
  const { body, close } = openSheet({ label: "Delete recurring event" });
  const warn = document.createElement("p");
  warn.className = "scope-warn";
  warn.textContent =
    "DELETE RECURRING EVENT — this is a repeating event. Which occurrences do you wish to remove from your agenda?";
  body.append(warn);
  const onlyBtn = button(`[ THIS EVENT ONLY ]  ${event.date}`, "btn scope-btn");
  const allBtn = button("[ ALL EVENTS IN SERIES ]", "btn btn--danger scope-btn");
  const cancelBtn = button("[ CANCEL ]", "btn scope-btn");
  onlyBtn.addEventListener("click", () => {
    close();
    onChoose("only");
  });
  allBtn.addEventListener("click", () => {
    close();
    onChoose("all");
  });
  cancelBtn.addEventListener("click", close);
  body.append(onlyBtn, allBtn, cancelBtn);
}

/** @param {string} key @returns {Date} */
function toDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
