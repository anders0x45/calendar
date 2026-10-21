/**
 * Firebase web-app credentials — the only place they appear.
 *
 * Fill in from the Firebase console (Project settings → Your apps → SDK
 * setup and configuration). While the placeholder values below are in
 * effect, {@link firebaseConfigReady} stays false and callers must keep
 * the app in its local-only mode; this file never throws.
 *
 * authDomain must be the domain the app is actually served from (the
 * Firebase hosting domain) so signInWithRedirect flows back there.
 * Extra serving domains must be registered via
 * `firebase auth:configure-domains` after the real project exists.
 */

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_API_KEY",
  authDomain: "REPLACE_WITH_AUTH_DOMAIN",
  projectId: "chrono-v2-placeholder",
  storageBucket: "",
  messagingSenderId: "",
  appId: "REPLACE_WITH_APP_ID",
};

/**
 * The Firestore rules appended event/image spinner tolerances live in
 * js/config.js; nothing else Firebase-related is constant here.
 */

/**
 * True when all values needed for a real connection are filled in.
 * @returns {boolean}
 */
export function firebaseConfigReady() {
  const c = firebaseConfig;
  return (
    typeof c.apiKey === "string" &&
    !c.apiKey.startsWith("REPLACE_WITH_") &&
    typeof c.authDomain === "string" &&
    !c.authDomain.startsWith("REPLACE_WITH_") &&
    typeof c.projectId === "string" &&
    c.projectId.length > 0 &&
    typeof c.appId === "string" &&
    !c.appId.startsWith("REPLACE_WITH_")
  );
}

/**
 * Emulator wiring is enabled when the app is served from localhost.
 * @param {string} [hostname] testing seam, defaults to location.hostname
 * @returns {boolean}
 */
export function usingEmulator(hostname = globalThis.location?.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * @typedef {Object} FirebaseAuthPorts Local emulator ports (firebase.json
 *   mirrors these).
 * @property {number} auth
 * @property {number} firestore
 */

/** Local emulator ports, mirrored in firebase.json.
 * @type {FirebaseAuthPorts}
 */
export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
};
