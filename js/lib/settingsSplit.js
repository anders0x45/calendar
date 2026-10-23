/**
 * Pure helpers for the settings split: which fields mirror into the
 * cloud user doc, what subset shape is rules-valid, and how overlays
 * merge. No storage, no SDK imports — unit-testable as-is.
 */

/** Fields mirrored into users/{uid}.settings (rules close this set). */
export const CLOUD_FIELDS = ["weekStartsOn", "lastView", "activeCalendarId"];

/** @typedef {import("../data/settings.js").Settings} Settings */

/**
 * Rules-valid cloud subset of a (locally) merged settings object, or
 * null when a value would be rejected (write only valid shapes).
 * @param {Record<string, unknown>} merged
 * @returns {{weekStartsOn: 0|1, lastView: "month"|"week"|"day",
 *   activeCalendarId: string|null}|null}
 */
export function cloudSubset(merged) {
  if (merged.weekStartsOn !== 0 && merged.weekStartsOn !== 1) return null;
  if (merged.lastView !== "month" && merged.lastView !== "week" &&
    merged.lastView !== "day") {
    return null;
  }
  const activeCalendarId = typeof merged.activeCalendarId === "string" &&
    merged.activeCalendarId.length <= 128
    ? merged.activeCalendarId
    : null;
  return { weekStartsOn: merged.weekStartsOn, lastView: merged.lastView, activeCalendarId };
}

/**
 * Extract the cloud overlay from a users/{uid}.settings value, keeping
 * only known cloud fields.
 * @param {unknown} value
 * @returns {Partial<Settings>}
 */
export function cloudOverlay(value) {
  const overlay = /** @type {Partial<Settings>} */ ({});
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    for (const field of CLOUD_FIELDS) {
      if (record[field] !== undefined) {
        overlay[field] = /** @type {any} */ (record[field]);
      }
    }
  }
  return overlay;
}

/**
 * Overlay merge (cloud wins over local copy for the mirrored fields).
 * @template T
 * @param {T} local
 * @param {Partial<Settings>|null} overlay
 * @returns {T}
 */
export function applyOverlay(local, overlay) {
  return overlay ? { ...local, ...overlay } : local;
}
