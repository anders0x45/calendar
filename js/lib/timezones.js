/**
 * Timezone conversion built only on Intl.DateTimeFormat.
 * Events store wall-clock date/time plus an IANA zone; conversion to a
 * UTC instant and back must survive DST gaps and overlaps:
 * - A wall time inside a spring-forward gap is shifted forward out of the gap.
 * - An ambiguous wall time (fall-back overlap) resolves to the first
 *   (earliest) instant.
 */

/** @typedef {{year: number, month: number, day: number, hour: number, minute: number, second: number}} ZonedParts */

const HOUR_MS = 3600000;

/** @type {Map<string, Intl.DateTimeFormat>} */
const partsFormatters = new Map();

/**
 * @param {string} zone IANA zone name
 * @returns {Intl.DateTimeFormat} en-US, h23, numeric parts formatter
 */
function getFormatter(zone) {
  let formatter = partsFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * Wall-clock parts of an instant rendered in a zone.
 * @param {number} instantMs epoch milliseconds
 * @param {string} zone
 * @returns {ZonedParts}
 */
export function getZonedParts(instantMs, zone) {
  const parts = getFormatter(zone).formatToParts(new Date(instantMs));
  const read = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * Offset of a zone at an instant, in minutes (wall - utc).
 * @param {number} instantMs
 * @param {string} zone
 * @returns {number}
 */
export function zoneOffsetMinutes(instantMs, zone) {
  const p = getZonedParts(instantMs, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instantMs) / 60000);
}

/**
 * Convert wall-clock (date, time) in a zone to its UTC instant.
 * @param {string} dateKey "YYYY-MM-DD"
 * @param {string} timeKey "HH:mm"
 * @param {string} zone IANA name
 * @returns {number} epoch milliseconds
 */
export function zonedWallToInstant(dateKey, timeKey, zone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeKey);
  if (!match || !timeMatch) {
    throw new TypeError(`expected "YYYY-MM-DD"/"HH:mm", got "${dateKey}" "${timeKey}"`);
  }
  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );

  // Iterate offset correction to a fixpoint. On a fixpoint, wall(t) === naive.
  let t = naive;
  let tPrev = null;
  for (let i = 0; i < 6; i += 1) {
    tPrev = t;
    t = naive - zoneOffsetMinutes(tPrev, zone) * 60000;
    if (t === tPrev) break;
  }

  if (t !== tPrev) {
    // Non-convergent oscillation: the wall time falls into a spring-forward
    // gap. Shift forward to the first valid instant (later fixpoint).
    t = Math.max(tPrev, t);
    return t;
  }

  // Convergent: resolve a fall-back overlap to the earliest instant by
  // probing backwards by candidate DST delta sizes (60 and 30 minutes).
  for (const delta of [30, 60]) {
    const earlier = t - delta * 60000;
    const earlierWall =
      instantToDateKey(earlier, zone) + "T" + instantToTimeKey(earlier, zone);
    const targetWall =
      instantToDateKey(t, zone) + "T" + instantToTimeKey(t, zone);
    if (earlier < t && earlierWall === targetWall) {
      t = earlier;
    }
  }
  return t;
}

/**
 * "HH:mm" wall clock of an instant in a zone.
 * @param {number} instantMs @param {string} zone
 * @returns {string}
 */
export function instantToTimeKey(instantMs, zone) {
  const p = getZonedParts(instantMs, zone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" wall date of an instant in a zone.
 * @param {number} instantMs @param {string} zone
 * @returns {string}
 */
export function instantToDateKey(instantMs, zone) {
  const p = getZonedParts(instantMs, zone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * The user's current IANA zone.
 * @returns {string}
 */
export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * All zone names the runtime supports, sorted for search lists.
 * @returns {string[]}
 */
export function supportedTimeZones() {
  const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
  return [...zones].sort((a, b) => a.localeCompare(b));
}

/** @param {string} zone @returns {boolean} */
export function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
