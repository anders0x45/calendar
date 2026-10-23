/**
 * Account/session orchestration — the module UI code talks to for
 * everything auth- and profile-shaped. No SDK imports live here; the
 * Firebase edge stays behind js/firebase/auth.js.
 *
 * Boot returns one of:
 *   {status:"unconfigured"}            SDK credentials are placeholders;
 *                                      the app keeps running local-only.
 *   {status:"signed-out", error?}      no session (or none reachable).
 *   {status:"onboarding", user}        signed in, no username claimed yet.
 *   {status:"ready", account}          signed in with a claimed username.
 */

import {
  firebaseConfigReady,
} from "../firebase/config.js";
import {
  watchAuthUser,
  consumeRedirect,
  signOutAndClearSession,
} from "../firebase/auth.js";
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "../firebase/firestore-api.js";
import { ensureFirestore } from "../firebase/sdk.js";
import { isUsernameValid, usernameIssue } from "../lib/usernames.js";
import { defaultWeekStartsOn } from "./settings.js";
import { uuidV4 } from "../lib/uuid.js";

/**
 * @typedef {Object} Account
 * @property {string} uid
 * @property {string} displayName
 * @property {string} email
 * @property {string|null} photoURL
 * @property {string} username
 */

/**
 * @typedef {Object} SessionUser
 * @property {string} uid
 * @property {string} displayName
 * @property {string} email
 * @property {string|null} photoURL
 */

/** @typedef {"unconfigured"|"signed-out"|"onboarding"|"ready"} SessionStatus */

const USERS = "users";
const USERNAMES = "usernames";

/**
 * Normalize SDK user fields into the SessionUser shape with safe
 * fallbacks (Google may omit displayName for email-only accounts).
 * @param {import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js").User} user
 * @returns {SessionUser}
 */
function sessionUser(user) {
  return {
    uid: user.uid,
    displayName: (user.displayName ?? "").trim().slice(0, 60),
    email: (user.email ?? "").trim().slice(0, 254),
    photoURL: typeof user.photoURL === "string" && user.photoURL.length <= 2048
      ? user.photoURL
      : null,
  };
}

/**
 * Resolve the boot-time session: redirect result, auth state, and the
 * users/{uid} profile behind it.
 * @returns {Promise<
 *   {status: SessionStatus} |
 *   {status: SessionStatus, error: string} |
 *   {status: "signed-out"|"onboarding", user: SessionUser|null} |
 *   {status: "onboarding", user: SessionUser, claimError?: string} |
 *   {status: "ready", account: Account}
 * >}
 */
export async function initSession() {
  if (!firebaseConfigReady()) {
    return { status: "unconfigured" };
  }
  // Catch post-redirect errors before the auth watch resolves, so a
  // cancelled/hard-failed redirect still ends on our sign-in screen.
  const redirect = await consumeRedirect();
  if (redirect.error) {
    return { status: "signed-out", error: redirectErrorMessage(redirect.error.code) };
  }

  const user = await new Promise((resolve) => {
    const detach = { current: () => {} };
    const stop = watchAuthUser((u) => {
      resolve(u);
      detach.current();
    });
    // onAuthStateChanged may fire synchronously during registration;
    // the indirection keeps the unsubscribe valid in either order.
    detach.current = stop;
  });
  if (!user) {
    return { status: "signed-out", user: null };
  }

  let profile;
  try {
    profile = await getDoc(doc(ensureFirestore(), USERS, user.uid));
  } catch {
    return { status: "signed-out", error: "Account service unreachable — retry." };
  }

  if (!profile.exists()) {
    return { status: "onboarding", user: sessionUser(user) };
  }
  const data = profile.data();
  if (!data || typeof data.username !== "string") {
    return { status: "onboarding", user: sessionUser(user) };
  }
  return {
    status: "ready",
    account: {
      uid: user.uid,
      displayName: String(data.displayName ?? "").slice(0, 60),
      email: String(data.email ?? "").slice(0, 254),
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      username: data.username,
    },
  };
}

/** @param {string} code */
function redirectErrorMessage(code) {
  if (code.includes("unauthorized-domain")) {
    return "This domain is not registered for sign-in.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Google sign-in is not enabled for this app.";
  }
  if (code.includes("network")) {
    return "Network trouble during sign-in — try again.";
  }
  return "Sign-in did not complete — try again.";
}

/**
 * Create the users/{uid} profile snapshot (username still unclaimed, so
 * the one-time claim can happen later exactly once). Idempotent up to a
 * final exists-check; a doc that appeared concurrently is left alone.
 * @param {SessionUser} user
 * @returns {Promise<void>}
 */
export async function ensureUserProfile(user) {
  const db = ensureFirestore();
  const ref = doc(db, USERS, user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    displayName: displayNameOrFallback(user),
    email: user.email ?? "",
    photoURL: user.photoURL,
    username: null,
    createdAt: serverTimestamp(),
    settings: {
      weekStartsOn: defaultWeekStartsOn(),
      lastView: "month",
      activeCalendarId: null,
    },
  });
}

/** @param {SessionUser} user */
function displayNameOrFallback(user) {
  if (user.displayName) return user.displayName;
  const local = user.email.split("@")[0];
  return local.length > 0 ? local : "There";
}

/**
 * Availability probe for the onboarding input.
 * @param {string} name
 * @returns {Promise<"invalid"|"taken"|"available">}
 */
export async function checkUsername(name) {
  if (!isUsernameValid(name)) return "invalid";
  try {
    const snapshot = await getDoc(doc(ensureFirestore(), USERNAMES, name));
    return snapshot.exists() ? "taken" : "available";
  } catch {
    // Unreachable registry: stay honest, not falsely available.
    return "invalid";
  }
}

/**
 * The atomic onboarding finisher, exactly the write pattern the rules
 * allow: profile first (idempotent), then ONE batch that (a) registers
 * usernames/{name}, (b) flips users/{uid}.username, (c) creates the
 * default calendar with the caller as sole owner entry.
 * @param {SessionUser} user
 * @param {string} username a validated, checked-available username
 * @returns {Promise<{ok: true} | {ok: false, reason: "taken-or-invalid"|"failed"}>}
 */
export async function completeOnboarding(user, username) {
  if (!isUsernameValid(username)) return { ok: false, reason: "taken-or-invalid" };
  const issue = usernameIssue(username);
  if (issue != null) return { ok: false, reason: "taken-or-invalid" };

  const db = ensureFirestore();
  try {
    await ensureUserProfile(user);
    const profileRef = doc(db, USERS, user.uid);
    const profile = await getDoc(profileRef);
    if (!profile.exists()) {
      return { ok: false, reason: "failed" };
    }
    const current = profile.data();
    if (typeof current?.username === "string" && current.username !== username) {
      // A name got claimed in a previous attempt; re-onboard with it.
      return { ok: true };
    }

    const displayName = displayNameOrFallback(user);
    const calId = `my-${uuidV4()}`;

    const batch = writeBatch(db);
    batch.set(doc(db, USERNAMES, username), {
      uid: user.uid,
      displayName,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
    });
    // Partial update (never a full set): existing createdAt must not be
    // re-sent, the update branch only patches the claim bits.
    batch.update(profileRef, {
      username,
      settings: {
        ...(current.settings ?? {}),
        activeCalendarId: calId,
      },
    });
    batch.set(doc(db, "calendars", calId), {
      name: "My calendar",
      ownerUid: user.uid,
      memberUids: [user.uid],
      members: {
        [user.uid]: {
          role: "owner",
          displayName,
          username,
          photoURL: user.photoURL,
          joinedAt: serverTimestamp(),
        },
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ok: true };
  } catch (/** @type {any} */ error) {
    if (error?.code === "permission-denied") {
      // Someone took the name between the availability check and this
      // batch — the atomic claim is what kept it from corrupting state.
      return { ok: false, reason: "taken-or-invalid" };
    }
    console.error("onboarding write failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Sign out: detach Firestore, wipe its persisted cache, and reload back
 * to the sign-in screen so no shared data lingers in the interface.
 * @returns {Promise<void>}
 */
export async function signOutAccount() {
  await signOutAndClearSession();
  window.location.reload();
}
