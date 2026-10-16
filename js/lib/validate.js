/**
 * Input validation helpers. Pure; used by the event sheet and import.
 */

import { TITLE_MAX_LENGTH } from "../config.js";
import { parseDate } from "./dates.js";

/**
 * @param {unknown} value
 * @returns {boolean} true for http/https URLs
 */
export function isValidHttpUrl(value) {
  if (typeof value !== "string" || value === "") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** @param {string} s @returns {boolean} */
export function isValidTimeKey(s) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

/** @param {string} s @returns {boolean} */
export function isValidDateKey(s) {
  return parseDate(s) !== null;
}

/**
 * Title rules: required, non-empty after trim, within max length.
 * @param {unknown} value
 * @returns {string | null} error message or null when valid
 */
export function validateTitle(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Title is required";
  }
  if (value.trim().length > TITLE_MAX_LENGTH) {
    return `Title must be at most ${TITLE_MAX_LENGTH} characters`;
  }
  return null;
}

/**
 * Full draft validation for the event form.
 * @typedef {{title: string, date: string, time: string|null, timezone: string,
 *   locationLink: string, recurrence: {freq: string, interval: number,
 *   until: string|null}|null}} EventDraft
 * @param {EventDraft} draft
 * @returns {Record<string, string>} field -> error message (empty = valid)
 */
export function validateEventDraft(draft) {
  /** @type {Record<string, string>} */
  const errors = {};
  const titleError = validateTitle(draft.title);
  if (titleError) errors.title = titleError;
  if (!isValidDateKey(draft.date)) errors.date = "Enter a valid date";
  if (draft.time !== null && !isValidTimeKey(draft.time)) errors.time = "Enter a valid time";
  if (draft.locationLink && !isValidHttpUrl(draft.locationLink)) {
    errors.locationLink = "Link must start with http:// or https://";
  }
  return errors;
}
