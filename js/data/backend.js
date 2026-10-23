/**
 * Backend switch for the data layer. Set once during boot: "local" keeps
 * the IndexedDB stores (local-only mode), "cloud" addresses
 * calendars/{activeCalendarId} through Firestore. UI modules never read
 * this — only js/data/* dispatch on it.
 */

/**
 * @typedef {{mode: "local"|"cloud", uid: string|null,
 *   calendarId: string|null}} BackendState
 */

let backend = /** @type {BackendState} */ ({ mode: "local", uid: null, calendarId: null });

/**
 * @param {Partial<BackendState>} patch
 */
export function setBackend(patch) {
  backend = { ...backend, ...patch };
}

/** @returns {BackendState} */
export function getBackend() {
  return { ...backend };
}

/** @returns {boolean} true when writes/reads must go through Firestore */
export function isCloud() {
  return backend.mode === "cloud" && typeof backend.calendarId === "string";
}
