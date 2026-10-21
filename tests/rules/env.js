/**
 * Shared harness for the Firestore security-rules suites. Each suite gets
 * its own throwaway projectId inside the single shared emulator instance
 * (firebase.json: singleProjectInstance), so data never leaks between
 * files and suites can run regardless of order.
 *
 * Factories below mirror the document shapes enforced by firestore.rules
 * (see docs/firebase-design.md); seeds written through the admin context
 * deliberately bypass rules so suites only exercise the WRITE path under
 * test, not the correctness of unrelated factories.
 *
 * The compat import is load-bearing: @firebase/rules-unit-testing runs
 * its own SDK copy, and only the compat layer attaches the ref/batch API
 * (get, set, update, batch) to those classes. Use `db.batch()` for
 * atomic multi-doc writes; the plain ESM `writeBatch()` helper cannot
 * operate on this Firestore instance.
 */
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import "firebase/compat/firestore";
import { serverTimestamp, Timestamp, Bytes } from "firebase/firestore";

/** @typedef {import("firebase/firestore").Firestore} Firestore */

export { serverTimestamp, Timestamp, Bytes };

const rulesSource = readFileSync(
  new URL("../../firestore.rules", import.meta.url),
  "utf8",
);

/**
 * Creates a suite-local test environment: its own projectId inside the
 * shared emulator (no data cross-pollution), rules already loaded.
 *
 * @param {string} suiteName
 * @returns {Promise<import("@firebase/rules-unit-testing").RulesTestEnvironment>}
 */
export async function loadFirebaseRulesEnv(suiteName) {
  return initializeTestEnvironment({
    projectId: "rules-" + suiteName,
    firestore: { rules: rulesSource },
  });
}

/** @param {string|null} uid */
export function dbAs(env, uid) {
  return uid === null
    ? env.unauthenticatedContext().firestore()
    : env.authenticatedContext(uid).firestore();
}

export function dbUnauth(env) {
  return env.unauthenticatedContext().firestore();
}

/**
 * Run seed/dataset-building writes with rules disabled. The owner
 * context only lives inside the wrapped callback, so all admin writes
 * must happen inside `fn`.
 *
 * @template T
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {(admin: Firestore) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withAdmin(env, fn) {
  return env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

/** Default settings payload that satisfies users rules. */
export function defaultSettings() {
  return { weekStartsOn: 1, lastView: "month", activeCalendarId: null };
}

export async function seedUser(admin, uid, opts) {
  const { displayName, email, username = null, photoURL = null } = opts;
  await admin.collection("users").doc(uid).set({
    displayName,
    email,
    photoURL,
    username,
    createdAt: Timestamp.now(),
    settings: defaultSettings(),
  });
  if (username) {
    await admin.collection("usernames").doc(username).set({
      uid,
      displayName,
      photoURL,
      createdAt: Timestamp.now(),
    });
  }
}

/**
 * @param {Array<{uid: string, role: string, displayName: string,
 *   username: string, photoURL?: string|null}>} members
 */
export async function seedCalendar(admin, calId, opts) {
  const { name, ownerUid, members } = opts;
  const entries = {};
  const memberUids = members.map((m) => m.uid);
  for (const m of members) {
    entries[m.uid] = {
      role: m.role,
      displayName: m.displayName,
      username: m.username,
      photoURL: m.photoURL ?? null,
      joinedAt: Timestamp.now(),
    };
  }
  await admin.collection("calendars").doc(calId).set({
    name,
    ownerUid,
    memberUids,
    members: entries,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function seedEvent(admin, calId, eventId, opts) {
  const {
    createdBy,
    title = "Seed plan",
    color = "red",
    date = "2026-10-21",
    time = null,
    timezone = null,
    locationLink = null,
    imageStatus = "none",
    recurrence = null,
    imageRequestedAt = null,
  } = opts;
  await admin
    .collection("calendars")
    .doc(calId)
    .collection("events")
    .doc(eventId)
    .set({
      title,
      color,
      date,
      time,
      timezone,
      locationLink,
      recurrence,
      imageStatus,
      imageRequestedAt:
        imageStatus === "pending" && !imageRequestedAt
          ? Timestamp.now()
          : imageRequestedAt,
      imageUpdatedAt: null,
      createdBy,
      isRecurring: recurrence != null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
}

export async function seedInvite(admin, calId, opts) {
  const { inviteeUid, inviteeUsername, inviterName, calendarName } = opts;
  await admin
    .collection("invites")
    .doc(`${calId}__${inviteeUid}`)
    .set({
      calendarId: calId,
      calendarName,
      inviteeUid,
      inviteeUsername,
      inviterName,
      createdAt: Timestamp.now(),
    });
}

/** Seed image blob placeholder (well under the 256KB cap). */
export function imageBytes(size = 1024) {
  const raw = new Uint8Array(size).fill(7);
  return Bytes.fromUint8Array(raw);
}

/**
 * A full, rules-valid event document payload for USER-context writes
 * (server timestamps), with overrides patched in per test.
 */
export function userWriteEvent(createdBy, overrides = {}) {
  return {
    title: "New plan",
    color: "blue",
    date: "2026-10-21",
    time: null,
    timezone: null,
    locationLink: null,
    recurrence: null,
    imageStatus: "none",
    imageRequestedAt: null,
    imageUpdatedAt: null,
    createdBy,
    isRecurring: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}
