/**
 * Firebase Auth edge: sign-in with Google (redirect flow), redirect
 * result handling, auth-state watch, and the destructive sign-out that
 * detaches Firestore. Every SDK import in js/ lives inside js/firebase/.
 */

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  terminate,
  clearIndexedDbPersistence,
} from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ensureAuth, ensureFirestore, resetFirestoreInstance } from "./sdk.js";

/**
 * Watch the auth session. Calls back exactly once per resolution with
 * the current firebase user or null; keeps watching afterwards, so a
 * sign-out elsewhere in the app is observed too.
 * @param {(user: import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js").User|null) => void} cb
 */
export function watchAuthUser(cb) {
  return onAuthStateChanged(ensureAuth(), cb);
}

/**
 * Kick off the Google sign-in redirect. Resolving means the browser is
 * leaving; errors (bad domain config, popup blocked…) come back and the
 * caller surfaces them on the sign-in screen.
 * @returns {Promise<void>}
 */
export function beginGoogleSignIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithRedirect(ensureAuth(), provider);
}

/**
 * Consume a sign-in redirect (only meaningful on the boot after one).
 * @returns {Promise<{user: import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js").User|null}|
 *   {user: null, error: {code: string, message: string}}>}
 */
export async function consumeRedirect() {
  try {
    const result = await getRedirectResult(ensureAuth());
    return { user: result?.user ?? null };
  } catch (error) {
    return {
      user: null,
      error: {
        code: /** @type {any} */ (error)?.code ?? "unknown",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Sign out and make sure no listener, no Firestore worker and no
 * persisted shared-data cache outlives this call. Cache clearing comes
 * after terminate, the order the SDK requires.
 * @returns {Promise<void>}
 */
export async function signOutAndClearSession() {
  const auth = ensureAuth();
  try {
    await signOut(auth);
  } finally {
    try {
      await terminate(ensureFirestore());
    } catch {
      // Already terminated: fine.
    }
    resetFirestoreInstance();
    try {
      // A fresh instance is required for persistence clearing.
      await clearIndexedDbPersistence(ensureFirestore());
    } catch {
      // Nothing persisted, multi-tab, or already cleared: fine.
    }
  }
}
