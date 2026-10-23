/**
 * Event CRUD against Firestore (calendars/{calendarId}/events). Field
 * shapes are dictated by firestore.rules — closed key set, color keys,
 * server timestamps on create, immutable createdBy/createdAt. Local
 * Event.records keep numeric epoch timestamps, so conversion happens
 * here at the boundary.
 */

import { ensureFirestore } from "../firebase/sdk.js";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "../firebase/firestore-api.js";
import { getBackend, isCloud } from "./backend.js";
import { validateEventRecord } from "./events.js";

const EVENTS = "events";

/** Millisecond-timestamps cannot predate the epoch sensibly; rules pin
 * the shape, this guards conversions only. */
const MS_MAX_SAFE_DATE = 32503680000000; // year 3000

/**
 * Firestore event document → local Event record.
 * @param {Object} snapshot
 * @param {(options?: {serverTimestamps?: "estimate"}) => Record<string, unknown>} snapshot.data
 * @param {string} snapshot.id
 * @returns {Event|null} null when the stored payload fails validation
 */
export function fromFirestoreDoc(snapshot) {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  if (!data || typeof data !== "object") return null;
  const check = validateEventRecord(
    {
      ...data,
      id: snapshot.id,
      createdAt: tsToMillis(data.createdAt),
      updatedAt: tsToMillis(data.updatedAt),
      imageRequestedAt: tsToMillisOrNull(data.imageRequestedAt),
      imageUpdatedAt: tsToMillisOrNull(data.imageUpdatedAt),
    },
  );
  return check.ok ? check.event : null;
}

/** @param {unknown} value */
function tsToMillis(value) {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

/** @param {unknown} value */
function tsToMillisOrNull(value) {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/**
 * Local Event record → Firestore payload (full doc for creates; for
 * updates the omitted createdAt/createdBy fields simply stay untouched).
 * @param {Event} event
 * @param {{isNew: boolean}} opts
 */
function toFirestoreDoc(event, { isNew }) {
  const { uid } = getBackend();
  if (!uid) throw new Error("cloud events require a signed-in account");
  const statusNeedsImage = event.imageStatus === "pending" ||
    event.imageStatus === "ready" || event.imageStatus === "failed";
  const requestedAt =
    event.imageRequestedAt != null && event.imageRequestedAt <= MS_MAX_SAFE_DATE
      ? Timestamp.fromMillis(event.imageRequestedAt)
      : statusNeedsImage
        ? Timestamp.now()
        : null;
  return {
    title: event.title,
    color: event.color,
    date: event.date,
    time: event.time,
    timezone: event.timezone,
    locationLink: event.locationLink,
    recurrence: event.recurrence,
    imageStatus: event.imageStatus,
    imageRequestedAt: requestedAt,
    imageUpdatedAt: null,
    createdBy: uid,
    isRecurring: event.recurrence != null,
    createdAt: isNew ? serverTimestamp() : Timestamp.fromMillis(event.createdAt),
    updatedAt: serverTimestamp(),
  };
}

/** @returns {string} document path segment of the active calendar */
function calendarId() {
  const backend = getBackend();
  if (!isCloud() || typeof backend.calendarId !== "string") {
    throw new Error("cloud events requested without an active calendar");
  }
  return backend.calendarId;
}

/**
 * @param {string} id
 */
function eventRef(id) {
  return doc(ensureFirestore(), "calendars", calendarId(), EVENTS, id);
}

/**
 * List all events of the active calendar.
 * @returns {Promise<Event[]>}
 */
export async function listEvents() {
  const snapshot = await getDocs(collection(ensureFirestore(), "calendars", calendarId(), EVENTS));
  const events = [];
  for (const document of snapshot.docs) {
    const event = fromFirestoreDoc(document);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Apply one snapshot into app state (the pull-model refresh uses
 * listEvents; this is the live push path). Local records replace state
 * wholesale with the same validation discipline.
 * @param {Object} snapshot
 * @param {Array<{id: string}>} snapshot.docs
 */
export async function syncFirestoreSnapshot(snapshot) {
  const events = [];
  for (const document of snapshot.docs) {
    const event = fromFirestoreDoc(document);
    if (event) events.push(event);
  }
  const { setState } = await import("../state.js");
  setState({ events });
}

/**
 * @param {string} id
 * @returns {Promise<Event | null>}
 */
export async function getEvent(id) {
  const snapshot = await getDoc(eventRef(id));
  if (!snapshot.exists()) return null;
  return fromFirestoreDoc(snapshot);
}

/**
 * Insert or update an event. Throws on invalid records and rule failures
 * (caller surfaces the toast).
 * @param {Event} event
 * @returns {Promise<Event>}
 */
export async function saveEvent(event) {
  const existing = await getDoc(eventRef(event.id));
  const isNew = !existing.exists();
  await setDoc(eventRef(event.id), toFirestoreDoc(event, { isNew }));
  // Local reflections of timestamps stay epoch-millis; the server's own
  // createdAt/updatedAt land on the next read.
  return { ...event, updatedAt: Date.now() };
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteEvent(id) {
  await deleteDoc(eventRef(id));
}
