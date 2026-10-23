/**
 * Firebase SDK wrapper, shared by js/firebase/* only.
 *
 * The ONLY modules allowed to import the Firebase SDK live in this
 * directory (sdk.js, config.js, auth.js). Everything else in js/
 * reaches the SDK through functions with signatures that match the old
 * IndexedDB data layer, so swapping the storage backend never touches
 * the UI, and UI code can never smuggle in a direct Firebase call.
 *
 * The SDK loads statically (sw.js precaches it from gstatic, so this works
 * offline like the rest of the shell). Nothing here talks to production
 * while the placeholder config is in effect — the sign-in wiring itself
 * is Phase F2. For now this file provides the app/auth/firestore session
 * objects needed by the emulator-based rules tests.
 */

import { initializeApp, getApps, getApp } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
} from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, usingEmulator, EMULATOR_PORTS } from "./config.js";

/**
 * Boot the app instance exactly once...
 * @returns {import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js").FirebaseApp}
 */
export function ensureApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Get the Auth instance, wiring the emulator on localhost.
 * @returns {import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js").Auth}
 */
export function ensureAuth() {
  const auth = getAuth(ensureApp());
  if (usingEmulator()) {
    connectAuthEmulator(auth,
      `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { persistOnReload: true });
  }
  return auth;
}

/** @type {import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js").Firestore|null} */
let firestoreInstance = null;

/**
 * Get the Firestore instance with offline persistence and cross-tab
 * coordination (the sync pill and offline editing depend on both).
 * @returns {import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js").Firestore}
 */
export function ensureFirestore() {
  if (!firestoreInstance) {
    firestoreInstance = initializeFirestore(ensureApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  }
  return firestoreInstance;
}

/**
 * Drop the cached Firestore instance so the next ensureFirestore()
 * builds a fresh one. Used on sign-out: clearIndexedDbPersistence may
 * only run on an instance with no active work, and terminate() leaves
 * the old instance unusable.
 */
export function resetFirestoreInstance() {
  firestoreInstance = null;
}
