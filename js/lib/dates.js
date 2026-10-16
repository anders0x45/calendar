/**
 * Pure date-string helpers. Dates are always "YYYY-MM-DD" strings
 * (1-based months) and times are "HH:mm". Never construct Date from a
 * date-only string (it parses as UTC); use the helpers below.
 */

/** @typedef {{year: number, month: number, day: number}} DateParts */

const MS_PER_DAY = 86400000;

/** @param {number} n @returns {string} */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Parse "YYYY-MM-DD" into parts, or null when malformed.
 * @param {string} s
 * @returns {DateParts | null}
 */
export function parseDate(s) {
  if (typeof s !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** @param {number} year @param {number} month (1-based) @returns {number} */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Serialize parts to a date key without range shifting.
 * @param {number} year @param {number} month @param {number} day
 * @returns {string} "YYYY-MM-DD"
 */
export function dateKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Local "today" as a date key.
 * @param {Date} [now] injectable for tests
 * @returns {string}
 */
export function todayKey(now = new Date()) {
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Add years with monthly-day clamping (Feb 29 -> Feb 28 in common years).
 * @param {string} key @param {number} n
 * @returns {string}
 */
export function addYears(key, n) {
  const { year, month, day } = parseDate(key);
  const newYear = year + n;
  return dateKey(newYear, month, Math.min(day, daysInMonth(newYear, month)));
}

/**
 * Add months, clamping day-of-month to the target month's length.
 * @param {string} key @param {number} n
 * @returns {string}
 */
export function addMonths(key, n) {
  const { year, month, day } = parseDate(key);
  const total = (year * 12 + (month - 1)) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return dateKey(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
}

/**
 * Add days using UTC math on the parsed parts (no zone involvement).
 * @param {string} key @param {number} n
 * @returns {string}
 */
export function addDays(key, n) {
  const { year, month, day } = parseDate(key);
  const base = Date.UTC(year, month - 1, day) + n * MS_PER_DAY;
  const date = new Date(base);
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Whole days from a to b (b - a).
 * @param {string} a @param {string} b
 * @returns {number}
 */
export function diffDays(a, b) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / MS_PER_DAY,
  );
}

/** @param {string} a @param {string} b @returns {number} -1|0|1 */
export function compareDateKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Day of week, 0 = Sunday .. 6 = Saturday.
 * @param {string} key
 * @returns {number}
 */
export function weekdayOf(key) {
  const { year, month, day } = parseDate(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * First day of the week containing key, honoring weekStartsOn (0 = Sun).
 * @param {string} key @param {0|1} weekStartsOn
 * @returns {string}
 */
export function startOfWeek(key, weekStartsOn = 1) {
  const offset = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

/**
 * 6x7 grid of date keys for the month containing key, aligned to
 * weekStartsOn (0 = Sunday, 1 = Monday). Cells outside the month are
 * included so the grid is always 42 entries.
 * @param {string} key any date in the target month
 * @param {0|1} weekStartsOn
 * @returns {string[]}
 */
export function monthGrid(key, weekStartsOn = 1) {
  const { year, month } = parseDate(key);
  const first = dateKey(year, month, 1);
  const gridStart = startOfWeek(first, weekStartsOn);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(addDays(gridStart, i));
  }
  return cells;
}

/** @param {string} key @returns {string} "YYYY-MM" */
export function monthKey(key) {
  return key.slice(0, 7);
}

/** @param {number} year @param {number} month (1-based) @returns {boolean} */
export function isLeapYear(year) {
  return daysInMonth(year, 2) === 29;
}
