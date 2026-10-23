/**
 * Event CRUD against the backend. UI never touches IndexedDB or
 * Firestore directly — everything goes through these functions. Pure
 * helpers (validation, ranges, drafts) are always local; the CRUD
 * surface dispatches to IndexedDB or Firestore depending on the boot
 * backend switch (js/data/backend.js).
 */

import { withTransaction } from "./db.js";
import { getBackend, isCloud } from "./backend.js";
import { EVENT_COLORS, DELETION_MODES } from "../config.js";
import { addDays, parseDate } from "../lib/dates.js";
import { instantToDateKey, zonedWallToInstant } from "../lib/timezones.js";
import { isValidHttpUrl, isValidTimeKey, isValidDateKey } from "../lib/validate.js";
import { occurrencesInRange } from "../lib/recurrence.js";
import { uuidV4 } from "../lib/uuid.js";

/** @typedef {{id: string, title: string, color: string, date: string,
 *   time: string|null, timezone: string, locationLink: string|null,
 *   imageStatus: "none"|"pending"|"ready"|"failed"|"removed",
 *   imageRequestedAt?: number|null,
 *   recurrence: import("../lib/recurrence.js").Recurrence|null,
 *   createdAt: number, updatedAt: number}} Event */

/**
 * Validate an event-shaped record. Used before writes and on import.
 * @param {unknown} value
 * @returns {{ok: true, event: Event} | {ok: false, reason: string}}
 */
export function validateEventRecord(value) {
  if (typeof value !== "object" || value === null) return { ok: false, reason: "not an object" };
  const e = /** @type {Record<string, unknown>} */ (value);
  if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > 128) {
    return { ok: false, reason: "invalid id" };
  }
  if (typeof e.title !== "string" || e.title.trim() === "" || e.title.length > 80) {
    return { ok: false, reason: "invalid title" };
  }
  if (typeof e.color !== "string" || !(e.color in EVENT_COLORS)) {
    return { ok: false, reason: "invalid color" };
  }
  if (!isValidDateKey(e.date)) return { ok: false, reason: "invalid date" };
  if (e.time !== null && !isValidTimeKey(e.time)) return { ok: false, reason: "invalid time" };
  if (e.timezone !== undefined && e.timezone !== null && typeof e.timezone !== "string") {
    return { ok: false, reason: "invalid timezone" };
  }
  if (e.locationLink != null && (e.locationLink === "" || !isValidHttpUrl(e.locationLink))) {
    return { ok: false, reason: "invalid locationLink" };
  }
  const imageStatuses = new Set(["none", "pending", "ready", "failed", "removed"]);
  if (typeof e.imageStatus !== "string" || !imageStatuses.has(e.imageStatus)) {
    return { ok: false, reason: "invalid imageStatus" };
  }
  if (e.recurrence !== null && e.recurrence !== undefined) {
    if (typeof e.recurrence !== "object") return { ok: false, reason: "invalid recurrence" };
    const r = /** @type {Record<string, unknown>} */ (e.recurrence);
    const freqs = new Set(["daily", "weekly", "monthly", "yearly"]);
    if (!freqs.has(/** @type {string} */ (r.freq))) return { ok: false, reason: "invalid recurrence freq" };
    if (!Number.isInteger(r.interval) || /** @type {number} */ (r.interval) < 1) {
      return { ok: false, reason: "invalid recurrence interval" };
    }
    if (r.until !== null && r.until !== undefined && !isValidDateKey(r.until)) {
      return { ok: false, reason: "invalid recurrence until" };
    }
    if (r.exceptions !== undefined &&
      (!Array.isArray(r.exceptions) || r.exceptions.some((x) => !isValidDateKey(x)))) {
      return { ok: false, reason: "invalid recurrence exceptions" };
    }
  }
  if (typeof e.createdAt !== "number" || !Number.isFinite(e.createdAt)) {
    return { ok: false, reason: "invalid createdAt" };
  }
  if (typeof e.updatedAt !== "number" || !Number.isFinite(e.updatedAt)) {
    return { ok: false, reason: "invalid updatedAt" };
  }
  if (e.imageRequestedAt != null &&
    (typeof e.imageRequestedAt !== "number" || !Number.isFinite(e.imageRequestedAt))) {
    return { ok: false, reason: "invalid imageRequestedAt" };
  }
  // Cloud-shape guard: rules cap recurrence interval at 365 and the
  // exceptions list at 366; catch it before a rejected write.
  if (e.recurrence) {
    const r = /** @type {Record<string, unknown>} */ (e.recurrence);
    if (Number(r.interval) > 365) return { ok: false, reason: "invalid recurrence interval" };
    if (Array.isArray(r.exceptions) && r.exceptions.length > 366) {
      return { ok: false, reason: "invalid recurrence exceptions" };
    }
  }
  return { ok: true, event: normalizeEvent(e) };
}

/**
 * Fill defaults and null-coerce optional fields on an event-shaped input.
 * @param {Record<string, unknown>} e
 * @returns {Event}
 */
function normalizeEvent(e) {
  return {
    id: e.id,
    title: e.title,
    color: e.color,
    date: e.date,
    time: e.time ?? null,
    timezone: e.timezone ?? null,
    locationLink: e.locationLink ?? null,
    imageStatus: e.imageStatus ?? "none",
    imageRequestedAt: e.imageRequestedAt ?? null,
    recurrence: e.recurrence ?? null,
    createdAt: e.createdAt ?? Date.now(),
    updatedAt: e.updatedAt ?? Date.now(),
  };
}

/**
 * List all events (recurrence expanded later, on demand, for a range).
 * @returns {Promise<Event[]>}
 */
export async function listEvents() {
  if (isCloud()) {
    const cloud = await import("./cloudEvents.js");
    return cloud.listEvents();
  }
  const rows = await withTransaction(["events"], "readonly", (stores) =>
    stores.events.getAll(),
  );
  return rows.filter((row) => validateEventRecord(row).ok);
}

/**
 * @param {string} id
 * @returns {Promise<Event | null>}
 */
export async function getEvent(id) {
  if (isCloud()) {
    const cloud = await import("./cloudEvents.js");
    return cloud.getEvent(id);
  }
  const row = await withTransaction(["events"], "readonly", (stores) => stores.events.get(id));
  if (!row) return null;
  const check = validateEventRecord(row);
  return check.ok ? check.event : null;
}

/**
 * Insert or update an event. Throws on invalid records.
 * @param {Event} event
 * @returns {Promise<Event>}
 */
export async function saveEvent(event) {
  const schema = { ...event, createdAt: event.createdAt ?? Date.now(), updatedAt: Date.now() };
  const check = validateEventRecord(schema);
  if (!check.ok) throw new TypeError(`cannot save event: ${check.reason}`);
  if (isCloud()) {
    const cloud = await import("./cloudEvents.js");
    return cloud.saveEvent(check.event);
  }
  await withTransaction(["events"], "readwrite", (stores) => stores.events.put(check.event));
  return check.event;
}

/**
 * Create a normalized draft (not yet persisted).
 * @param {{title: string, color: string, date: string, time: string|null,
 *   timezone: string, locationLink?: string|null,
 *   recurrence?: import("../lib/recurrence.js").Recurrence|null,
 *   imageStatus?: Event["imageStatus"]}} draft
 * @returns {Event}
 */
export function makeEvent(draft) {
  const now = Date.now();
  return {
    id: uuidV4(),
    title: draft.title,
    color: draft.color,
    date: draft.date,
    time: draft.time ?? null,
    timezone: draft.timezone,
    locationLink: draft.locationLink ?? null,
    imageStatus: draft.imageStatus ?? "none",
    recurrence: draft.recurrence ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteEvent(id) {
  if (isCloud()) {
    const cloud = await import("./cloudEvents.js");
    return cloud.deleteEvent(id);
  }
  await withTransaction(["events"], "readwrite", (stores) => {
    stores.events.delete(id);
  });
}

/**
 * Delete every occurrence of a recurring event after "date", by adding
 * the exception (mode "only") or removing the whole event ("all").
 * @param {Event} event
 * @param {"only"|"all"} mode see config DELETION_MODES
 * @param {string} occurrenceDate the occurrence being deleted
 * @returns {Promise<void>}
 */
export async function deleteOccurrence(event, mode, occurrenceDate) {
  if (mode === DELETION_MODES.ONLY) {
    const recurrence = event.recurrence;
    if (!recurrence || !Array.isArray(recurrence.exceptions)) return;
    const exceptions = [...new Set([...recurrence.exceptions, occurrenceDate])];
    await saveEvent({
      ...event,
      recurrence: { ...recurrence, exceptions },
      updatedAt: Date.now(),
    });
  } else {
    await deleteEvent(event.id);
  }
}

/**
 * Events whose series may intersect [startKey, endKey]: any base date in
 * range, or a recurring rule whose expansions touch the range.
 * Occurrence extraction for rendering returns one entry per occurrence:
 *   { event, date } where date is the occurrence's date key.
 *
 * viewerZone: when given, timed events are converted to that zone before
 * placement (a 23:30 event in another zone can land on a different day).
 * All-day events are pinned to their stored date. Without viewerZone no
 * conversion happens (unit tests, callers that handle zone logic).
 * @param {Event[]} events
 * @param {string} startKey
 * @param {string} endKey
 * @param {string} [viewerZone]
 * @returns {{event: Event, date: string}[]}
 */
export function eventsForRange(events, startKey, endKey, viewerZone) {
  /** @type {{event: Event, date: string}[]} */
  const out = [];
  const widen = viewerZone ? 1 : 0;
  const searchStart = addDays(startKey, -widen);
  const searchEnd = addDays(endKey, widen);
  for (const event of events) {
    const until = event.recurrence?.until;
    if (until && until < searchStart) continue;
    if (event.date > searchEnd) continue;
    for (const date of occurrencesInRange(event, searchStart, searchEnd)) {
      out.push({ event, date: placeDate(event, date, viewerZone) });
    }
  }
  return out.filter(({ date }) => date >= startKey && date <= endKey);
}

/**
 * Viewer-side placement date of an occurrence.
 * @param {Event} event @param {string} date @param {string} [viewerZone]
 * @returns {string}
 */
function placeDate(event, date, viewerZone) {
  if (!viewerZone) return date;
  if (!event.time) return date; // all-day stays on its stored date
  const instant = zonedWallToInstant(date, event.time, event.timezone ?? viewerZone);
  return instantToDateKey(instant, viewerZone);
}

/**
 * Raw count used by export/import previews.
 * @returns {Promise<number>}
 */
export async function countEvents() {
  const events = await listEvents();
  return events.length;
}

/**
 * Remove every LOCAL event record (factory reset affordance for the
 * device's own stores; cloud calendars are never wiped in bulk here —
 * per-event cloud deletion stays a creator/owner action).
 * @returns {Promise<void>}
 */
export async function deleteAllEvents() {
  await withTransaction(["events"], "readwrite", (stores) => stores.events.clear());
}
