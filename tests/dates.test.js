import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  addYears,
  compareDateKeys,
  diffDays,
  daysInMonth,
  isLeapYear,
  monthGrid,
  parseDate,
  startOfWeek,
  todayKey,
  weekdayOf,
} from "../js/lib/dates.js";

test("parseDate accepts valid keys and rejects malformed input", () => {
  assert.deepEqual(parseDate("2026-02-28"), { year: 2026, month: 2, day: 28 });
  assert.equal(parseDate("2026-2-28"), null);
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate("2026-02-29"), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(123), null);
});

test("parseDate accepts Feb 29 in leap years", () => {
  assert.deepEqual(parseDate("2028-02-29"), { year: 2028, month: 2, day: 29 });
});

test("daysInMonth and isLeapYear", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 7), 31);
  assert.notEqual(isLeapYear(2026), isLeapYear(2024)); // only one is leap
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
});

test("addDays crosses month and year boundaries in UTC math", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("addMonths clamps day-of-month in shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-05-31", 1), "2026-06-30");
  assert.equal(addMonths("2026-02-28", 12), "2027-02-28");
});

test("addYears clamps Feb 29 to Feb 28 in common years", () => {
  assert.equal(addYears("2024-02-29", 1), "2025-02-28");
  assert.equal(addYears("2024-02-29", 4), "2028-02-29");
});

test("diffDays and compareDateKeys", () => {
  assert.equal(diffDays("2026-01-01", "2026-01-31"), 30);
  assert.equal(diffDays("2026-01-31", "2026-01-01"), -30);
  assert.equal(compareDateKeys("2026-01-01", "2026-01-02"), -1);
  assert.equal(compareDateKeys("2026-01-02", "2026-01-02"), 0);
});

test("weekdayOf follows Calendar.getUTCDay convention", () => {
  assert.equal(weekdayOf("2026-10-15"), 4); // Thursday
  assert.equal(weekdayOf("2026-10-18"), 0); // Sunday
  assert.equal(weekdayOf("1970-01-01"), 4);
});

test("startOfWeek honors weekStartsOn 0 and 1", () => {
  assert.equal(startOfWeek("2026-10-15", 1), "2026-10-12"); // Monday
  assert.equal(startOfWeek("2026-10-15", 0), "2026-10-11"); // Sunday
  assert.equal(startOfWeek("2026-10-18", 1), "2026-10-12");
  assert.equal(startOfWeek("2026-10-18", 0), "2026-10-18");
});

const weekStarts = [0, 1];

for (const weekStartsOn of weekStarts) {
  // Build months that start on each weekday in 2025-2026.
  const monthStarts = [
    "2025-06-01", // Sunday
    "2025-09-01", // Monday
    "2025-10-01", // Wednesday
    "2026-01-01", // Thursday
    "2026-05-01", // Friday
    "2026-08-01", // Saturday
    "2025-02-01", // Saturday again
  ];
  for (const monthStart of monthStarts) {
    test(`monthGrid ${monthStart} weekStart=${weekStartsOn} is 42 aligned cells`, () => {
      const grid = monthGrid(monthStart, weekStartsOn);
      assert.equal(grid.length, 42);
      const { year, month } = parseDate(monthStart);
      for (let i = 0; i < grid.length; i += 1) {
        const cell = parseDate(grid[i]);
        if (i % 7 === 0) {
          assert.equal(weekdayOf(grid[i]), weekStartsOn, `row ${i / 7} must start correctly`);
        }
        if (cell.year === year && cell.month === month) {
          assert.ok(cell.day >= 1 && cell.day <= daysInMonth(year, month));
        }
      }
      // First in-month cell is day 1 in exactly one spot.
      assert.equal(grid.filter((k) => parseDate(k).day === 1 && parseDate(k).month === month).length, 1);
    });
  }
}

test("todayKey uses local year/month/day", () => {
  const now = new Date(2026, 0, 2, 23, 59, 59);
  assert.equal(todayKey(now), "2026-01-02");
});
