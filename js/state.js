/**
 * Global state store. Views read state; render functions are idempotent.
 */

import { todayKey } from "./lib/dates.js";

/**
 * @typedef {import("./data/events.js").Event} Event
 * @typedef {import("./data/settings.js").Settings} Settings
 * @typedef {import("./data/accounts.js").Account} Account
 * @typedef {{
 *   view: "month"|"week"|"day"|"settings",
 *   cursor: string,
 *   selectedDay: string|null,
 *   events: Event[],
 *   weekStartsOn: 0|1,
 *   settings: Settings,
 *   account: Account|null,
 * }} AppState
 */

/** @type {AppState} */
let state = {
  view: "month",
  /** Presentation cursor (the period being displayed), local date key. */
  cursor: todayKey(),
  /** Explicitly selected day key, drives selection + the info strip. */
  selectedDay: todayKey(),
  events: [],
  weekStartsOn: 1,
  settings: null,
  account: null,
};

/** @type {Set<(s: AppState) => void>} */
const subscribers = new Set();

/** @returns {AppState} */
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
