/**
 * Global state store. Views read state; render functions are idempotent.
 */

/** @typedef {{view: "month"|"week"|"day"|"settings", cursor: Date, selectedDay: Date|null}} AppState */

/** @type {AppState} */
let state = {
  view: "month",
  /** Presentation cursor (the period being displayed), local midnight. */
  cursor: null,
  /** Explicitly selected day, used by day sheets and the detail strip. */
  selectedDay: null,
};

/** @type {Set<(s: AppState) => void>} */
const subscribers = new Set();

/**
 * Read the current state. Freeze copies to avoid accidental mutation.
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Patch state and notify subscribers with the new snapshot.
 * @param {Partial<AppState>} patch
 */
export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of subscribers) {
    try {
      fn(state);
    } catch (error) {
      // A broken subscriber must not break the rest of the app.
      console.error("state subscriber failed", error);
    }
  }
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * @template T
 * @param {(s: AppState) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
