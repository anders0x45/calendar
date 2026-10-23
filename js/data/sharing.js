/**
 * Sharing: username invites, incoming invite inbox, calendar switcher,
 * and leave. The write shapes mirror the rules' tested branches:
 *   - invites: top-level invites/{calId}__{inviteeUid}, owner-only
 *     create, invitee reads its own inbox (equality query)
 *   - accept: ONE batch — calendar update (adds exactly me as 'member'
 *     with username verbatim from users/{me}) + invite delete
 *   - decline: invite delete only
 *   - leave: member-leave update (drops exactly my uid + entry)
 *   - switch: users/{uid} settings.activeCalendarId patch
 */

import { ensureFirestore } from "../firebase/sdk.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "../firebase/firestore-api.js";
import { collection, getDocs } from "../firebase/firestore-api.js";
import { getBackend, isCloud, setBackend } from "./backend.js";
import { dropCloudSettings, readCloudSettings } from "./settings.js";

const USERS = "users";
const USERNAMES = "usernames";
const CALENDARS = "calendars";
const INVITES = "invites";

/** @returns {void} */
function requireCloud() {
  if (!isCloud()) {
    throw new Error("sharing requires a cloud backend");
  }
}

/**
 * @param {string} id
 * @returns {Promise<{id: string, name: string, ownerUid: string, memberUids: string[], members: Record<string, {role: string, username: string, displayName: string, photoURL: unknown}>} | null>}
 */
export async function getCalendarSummary(id) {
  requireCloud();
  const snapshot = await getDoc(doc(ensureFirestore(), CALENDARS, id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: typeof data?.name === "string" ? data.name : "",
    ownerUid: typeof data?.ownerUid === "string" ? data.ownerUid : "",
    memberUids: Array.isArray(data?.memberUids)
      ? data.memberUids.filter((uid) => typeof uid === "string") : [],
    members: data?.members && typeof data.members === "object"
      ? data.members : {},
  };
}

/**
 * @param {string} name
 * @returns {Promise<{uid: string, username: string, displayName: string, photoURL: unknown} | null>}
 */
async function resolveUsername(name) {
  const snapshot = await getDoc(doc(ensureFirestore(), USERNAMES, name));
  const data = snapshot.exists() ? snapshot.data() : null;
  if (typeof data?.uid !== "string") return null;
  return {
    uid: data.uid,
    username: name,
    displayName: typeof data.displayName === "string" ? data.displayName : name,
    photoURL: data.photoURL ?? null,
  };
}

/**
 * Invite someone by handle to MY active calendar.
 * @param {string} targetUsername
 * @returns {Promise<{ok: true} | {ok: false, reason: "unknown"|"self"|"not-owner"|"taken"|"failed"}>}
 */
export async function createInvite(targetUsername) {
  requireCloud();
  const { uid, calendarId } = getBackendShape();
  if (!calendarId) return { ok: false, reason: "failed" };
  try {
    const calendar = await getCalendarSummary(calendarId);
    if (!calendar) return { ok: false, reason: "failed" };
    if (calendar.ownerUid !== uid) return { ok: false, reason: "not-owner" };
    const resolved = await resolveUsername(targetUsername);
    if (!resolved) return { ok: false, reason: "unknown" };
    if (resolved.uid === uid) return { ok: false, reason: "self" };
    if (calendar.memberUids.includes(resolved.uid)) return { ok: false, reason: "taken" };
    const me = accountName(uid);
    await setDoc(doc(ensureFirestore(), INVITES, inviteId(calendarId, resolved.uid)), {
      calendarId,
      calendarName: calendar.name,
      inviteeUid: resolved.uid,
      inviteeUsername: resolved.username,
      inviterName: me,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (/** @type {any} */ error) {
    if (error?.code === "permission-denied") {
      return { ok: false, reason: "not-owner" };
    }
    console.error("invite create failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Display name recorded on the active account (client-side header only). */
async function accountName(uid) {
  const { getState } = await import("../state.js");
  const account = getState().account;
  return account?.displayName ?? uid.slice(0, 8);
}

/**
 * Inbox of invites addressed to me (equality query the rules allow).
 * @returns {Promise<Array<{inviteId: string, calendarId: string, calendarName: string, inviterName: string, createdAt: number}>>}
 */
export async function listIncomingInvites() {
  requireCloud();
  const { uid } = getBackendShape();
  if (!uid) return [];
  const snapshot = await getDocs(
    query(collection(ensureFirestore(), INVITES), where("inviteeUid", "==", uid)),
  );
  return snapshot.docs
    .map((document) => {
      const data = document.data({ serverTimestamps: "estimate" });
      const createdAt = data?.createdAt?.toMillis?.() ?? 0;
      return {
        inviteId: document.id,
        calendarId: typeof data?.calendarId === "string" ? data.calendarId : "",
        calendarName: typeof data?.calendarName === "string" ? data.calendarName : "",
        inviterName: typeof data?.inviterName === "string" ? data.inviterName : "",
        createdAt,
      };
    })
    .filter((invite) => invite.calendarId !== "");
}

/** @param {string} calId @param {string} inviteeUid */
function inviteId(calId, inviteeUid) {
  return `${calId}__${inviteeUid}`;
}

/** @returns {{uid: string, calendarId: string}} */
function getBackendShape() {
  const backend = getBackend();
  return {
    uid: typeof backend.uid === "string" ? backend.uid : "",
    calendarId: typeof backend.calendarId === "string" ? backend.calendarId : "",
  };
}

/**
 * Accept one invite: single batch adds me to the calendar (accept
 * branch) and consumes the ticket.
 * @param {{inviteId: string, calendarId: string}} invite
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function acceptInvite(invite) {
  requireCloud();
  const { uid } = getBackendShape();
  if (!uid) return { ok: false, reason: "failed" };
  try {
    const db = ensureFirestore();
    const calendarRef = doc(db, CALENDARS, invite.calendarId);
    const snapshot = await getDoc(calendarRef);
    if (!snapshot.exists()) {
      await deleteDoc(doc(db, INVITES, invite.inviteId)).catch(() => {});
      return { ok: false, reason: "gone" };
    }
    const calendar = snapshot.data();
    if (Array.isArray(calendar?.memberUids) && calendar.memberUids.includes(uid)) {
      await deleteDoc(doc(db, INVITES, invite.inviteId));
      return { ok: true };
    }
    const profile = await getDoc(doc(db, USERS, uid));
    const me = profile.data();
    /** @type {Record<string, unknown>} */
    const members = { ...(calendar?.members ?? {}) };
    members[uid] = {
      role: "member",
      displayName: typeof me?.displayName === "string" ? me.displayName : uid.slice(0, 8),
      username: typeof me?.username === "string" ? me.username : "",
      photoURL: me?.photoURL ?? null,
      joinedAt: serverTimestamp(),
    };
    const batch = writeBatch(db);
    batch.update(calendarRef, {
      memberUids: [...(calendar?.memberUids ?? []), uid],
      members,
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, INVITES, invite.inviteId));
    await batch.commit();
    return { ok: true };
  } catch (/** @type {any} */ error) {
    console.error("invite accept failed", error);
    return { ok: false, reason: error?.code ?? "failed" };
  }
}

/**
 * Decline (invitee) / invite has been consumed elsewhere.
 * @param {{inviteId: string}} invite
 * @returns {Promise<void>}
 */
export async function declineInvite(invite) {
  requireCloud();
  await deleteDoc(doc(ensureFirestore(), INVITES, invite.inviteId));
}

/**
 * All calendars whose member list holds me (switch candidates).
 * @returns {Promise<Array<{id: string, name: string, ownerUid: string}>>}
 */
export async function listMyCalendars() {
  requireCloud();
  const { uid } = getBackendShape();
  if (!uid) return [];
  const snapshot = await getDocs(
    query(
      collection(ensureFirestore(), CALENDARS),
      where("memberUids", "array-contains", uid),
    ),
  );
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: typeof data?.name === "string" ? data.name : "",
      ownerUid: typeof data?.ownerUid === "string" ? data.ownerUid : "",
    };
  });
}

/**
 * Point the session (users/{uid}.settings.activeCalendarId + local
 * backend) at another calendar I belong to, then re-resolve storage.
 * @param {string} nextCalendarId
 * @returns {Promise<boolean>} switched (caller re-boots data plumbing)
 */
export async function switchCalendar(nextCalendarId) {
  requireCloud();
  const { uid } = getBackendShape();
  if (!uid) return false;
  // Rules require the exact three-key map; fall back to defaults
  // whenever the stored overlay is missing or partial.
  const cloud = await readCloudSettings(uid).catch(() => null);
  await updateDoc(doc(ensureFirestore(), USERS, uid), {
    settings: {
      weekStartsOn:
        cloud?.weekStartsOn === 0 || cloud?.weekStartsOn === 1
          ? cloud.weekStartsOn
          : 0,
      lastView:
        cloud?.lastView === "week" || cloud?.lastView === "day"
          ? cloud.lastView
          : "month",
      activeCalendarId: nextCalendarId,
    },
  });
  setBackend({ mode: "cloud", uid, calendarId: nextCalendarId });
  dropCloudSettings();
  return true;
}

/**
 * Drop my membership in a calendar (member-leave branch; owners exit
 * through deletion instead). On success the caller re-boots.
 * @param {string} calId
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function leaveCalendar(calId) {
  requireCloud();
  const { uid } = getBackendShape();
  if (!uid) return { ok: false, reason: "failed" };
  try {
    const calendarRef = doc(ensureFirestore(), CALENDARS, calId);
    const snapshot = await getDoc(calendarRef);
    if (!snapshot.exists()) return { ok: false, reason: "gone" };
    const calendar = snapshot.data();
    if (calendar?.ownerUid === uid) return { ok: false, reason: "owner" };
    /** @type {Record<string, unknown>} */
    const members = {};
    for (const [key, value] of Object.entries(calendar?.members ?? {})) {
      if (key !== uid) members[key] = value;
    }
    await updateDoc(calendarRef, {
      memberUids: (calendar?.memberUids ?? []).filter((k) => k !== uid),
      members,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (/** @type {any} */ error) {
    console.error("leave failed", error);
    return { ok: false, reason: error?.code ?? "failed" };
  }
}
