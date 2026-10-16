/**
 * Lazy recurrence expansion. Occurrences are computed on the fly for the
 * requested range and never stored. "Until" is inclusive, exceptions are
 * skipped, and monthly/yearly dates clamp to shorter months / common years.
 */

import { addDays, addMonths, addYears, compareDateKeys, diffDays, parseDate } from "./dates.js";

/** @typedef {{freq: "daily"|"weekly"|"monthly"|"yearly", interval: number, until: string|null, exceptions: string[]}} Recurrence */

/** Hard cap on iterations so a hostile/malformed rule can't hang the app. */
const MAX_ITERATIONS = 100000;

/** Placeholder guard to keep loops bounded. */
function guard(n) {
  if (n > MAX_ITERATIONS) throw new RangeError("recurrence expansion exceeded cap");
}

/**
 * All occurrence date keys of an event within [startKey, endKey],
 * inclusive. A non-recurring event yields [event.date] when in range.
 * @param {{date: string, recurrence: Recurrence|null}} event
 * @param {string} startKey
 * @param {string} endKey
 * @returns {string[]}
 */
export function occurrencesInRange(event, startKey, endKey) {
  const base = parseDate(event.date) ? event.date : null;
  if (!base || compareDateKeys(startKey, endKey) > 0) return [];
  if (compareDateKeys(base, endKey) > 0) return [];

  const rule = event.recurrence;
  if (!rule || !isRuleValid(rule)) {
    return baseInclusive(base, startKey, endKey, rule) ? [base] : [];
  }

  const until = rule.until && parseDate(rule.until) ? rule.until : null;
  if (until && compareDateKeys(until, base) < 0) return [];

  const rangeEnd = until && compareDateKeys(until, endKey) < 0 ? until : endKey;
  const exceptions = new Set(rule.exceptions ?? []);

  const results = [];
  const emit = (key) => {
    if (
      compareDateKeys(key, base) >= 0 &&
      compareDateKeys(key, startKey) >= 0 &&
      compareDateKeys(key, rangeEnd) <= 0 &&
      !exceptions.has(key)
    ) {
      results.push(key);
    }
  };

  switch (rule.freq) {
    case "daily":
      expandStride(base, (n) => addDays(base, n * rule.interval), startKey, rangeEnd, emit);
      break;
    case "weekly":
      expandStride(base, (n) => addDays(base, n * 7 * rule.interval), startKey, rangeEnd, emit);
      break;
    case "monthly":
      expandStride(base, (n) => addMonths(base, n * rule.interval), startKey, rangeEnd, emit);
      break;
    case "yearly":
      expandStride(base, (n) => addYears(base, n * rule.interval), startKey, rangeEnd, emit);
      break;
  }
  return results;
}

/**
 * Non-recurring: base counts only when inside the range.
 * @param {string} base @param {string} startKey @param {string} endKey @param {Recurrence|null} rule
 */
function baseInclusive(base, startKey, endKey) {
  return compareDateKeys(base, startKey) >= 0 && compareDateKeys(base, endKey) <= 0;
}

/**
 * Stride expansion: candidates are base + n*stride and never clamp.
 * n is seed-forwarded so large ranges don't iterate from the base date.
 * @param {string} base
 * @param {(n: number) => string} candidateAt
 * @param {string} startKey
 * @param {string} endKey
 * @param {(k: string) => void} emit
 */
function expandStride(base, candidateAt, startKey, endKey, emit) {
  let n = 0;
  if (compareDateKeys(candidateAt(0), startKey) < 0) {
    const days = Math.max(1, diffDays(base, startKey));
    const approxStride = Math.max(1, diffDays(candidateAt(0), candidateAt(1)));
    n = Math.floor(days / approxStride);
  }
  // Walk back one step to stay safe against clamped strides.
  if (n > 0) n -= 1;
  guard(n);
  let candidate = candidateAt(n);
  while (compareDateKeys(candidate, startKey) < 0) {
    n += 1;
    guard(n);
    candidate = candidateAt(n);
  }
  while (compareDateKeys(candidate, endKey) <= 0) {
    emit(candidate);
    n += 1;
    guard(n);
    candidate = candidateAt(n);
  }
}

/**
 * @param {Recurrence} rule
 * @returns {boolean}
 */
export function isRuleValid(rule) {
  if (typeof rule !== "object" || rule === null) return false;
  const freqs = new Set(["daily", "weekly", "monthly", "yearly"]);
  if (!freqs.has(rule.freq)) return false;
  if (!Number.isInteger(rule.interval) || rule.interval < 1) return false;
  if (rule.until !== null && rule.until !== undefined && !parseDate(rule.until)) return false;
  if (rule.exceptions !== undefined && !Array.isArray(rule.exceptions)) return false;
  return true;
}
