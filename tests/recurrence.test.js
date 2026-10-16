import { test } from "node:test";
import assert from "node:assert/strict";
import { isRuleValid, occurrencesInRange } from "../js/lib/recurrence.js";

const NON_RECURRING = { date: "2026-10-21", recurrence: null };

test("non-recurring event: base in and out of range", () => {
  assert.deepEqual(occurrencesInRange(NON_RECURRING, "2026-10-01", "2026-10-31"), ["2026-10-21"]);
  assert.deepEqual(occurrencesInRange(NON_RECURRING, "2026-10-22", "2026-10-31"), []);
  assert.deepEqual(occurrencesInRange(NON_RECURRING, "2026-10-21", "2026-10-21"), ["2026-10-21"]);
});

test("monthly on the 31st clamps to month length", () => {
  const event = {
    date: "2026-01-31",
    recurrence: { freq: "monthly", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-01-01", "2026-04-30"),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  );
});

test("monthly on Feb 29 in leap year clamps in common years", () => {
  const event = {
    date: "2028-02-29",
    recurrence: { freq: "monthly", interval: 1, until: null, exceptions: [] },
  };
  // Occurrences never precede the base date; Mar/Apr land on day 29.
  assert.deepEqual(
    occurrencesInRange(event, "2028-01-01", "2028-04-30"),
    ["2028-02-29", "2028-03-29", "2028-04-29"],
  );
});

test("yearly Feb 29 clamps to Feb 28 in common years", () => {
  const event = {
    date: "2028-02-29",
    recurrence: { freq: "yearly", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2027-01-01", "2029-12-31"),
    ["2028-02-29", "2029-02-28"],
  );
});

test("yearly keeps the same month and clamped day", () => {
  const event = {
    date: "2026-01-31",
    recurrence: { freq: "yearly", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-01-01", "2029-12-31"),
    ["2026-01-31", "2027-01-31", "2028-01-31", "2029-01-31"],
  );
});

test("weekly keeps the base weekday", () => {
  const event = {
    date: "2026-10-15", // Thursday
    recurrence: { freq: "weekly", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-10-01", "2026-11-04"),
    ["2026-10-15", "2026-10-22", "2026-10-29"],
  );
});

test("weekly interval 2 skips alternate weeks", () => {
  const event = {
    date: "2026-10-15",
    recurrence: { freq: "weekly", interval: 2, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-10-01", "2026-12-01"),
    ["2026-10-15", "2026-10-29", "2026-11-12", "2026-11-26"],
  );
});

test("daily interval 3", () => {
  const event = {
    date: "2026-10-01",
    recurrence: { freq: "daily", interval: 3, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-10-01", "2026-10-15"),
    ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10", "2026-10-13"],
  );
});

test("daily expansion is seed-forwarded over long distances", () => {
  const event = {
    date: "2020-01-01",
    recurrence: { freq: "daily", interval: 1, until: null, exceptions: [] },
  };
  const result = occurrencesInRange(event, "2026-10-20", "2026-10-21");
  assert.deepEqual(result, ["2026-10-20", "2026-10-21"]);
});

test("until is inclusive", () => {
  const event = {
    date: "2026-10-01",
    recurrence: {
      freq: "daily",
      interval: 1,
      until: "2026-10-03",
      exceptions: [],
    },
  };
  assert.deepEqual(occurrencesInRange(event, "2026-10-01", "2026-10-31"), [
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
  assert.deepEqual(occurrencesInRange(event, "2026-10-04", "2026-10-31"), []);
});

test("exceptions remove single occurrences", () => {
  const event = {
    date: "2026-10-01",
    recurrence: {
      freq: "daily",
      interval: 1,
      until: null,
      exceptions: ["2026-10-03", "2026-10-05"],
    },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-10-01", "2026-10-06"),
    ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-06"],
  );
});

test("until before base yields nothing", () => {
  const event = {
    date: "2026-10-10",
    recurrence: {
      freq: "daily",
      interval: 1,
      until: "2026-10-01",
      exceptions: [],
    },
  };
  assert.deepEqual(occurrencesInRange(event, "2026-01-01", "2026-12-31"), []);
});

test("empty range yields nothing", () => {
  const event = {
    date: "2026-10-10",
    recurrence: { freq: "daily", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(occurrencesInRange(event, "2026-10-11", "2026-10-10"), []);
});

test("monthly expansion starting years before the range", () => {
  const event = {
    date: "2010-12-31",
    recurrence: { freq: "monthly", interval: 1, until: null, exceptions: [] },
  };
  const result = occurrencesInRange(event, "2026-10-01", "2026-10-31");
  assert.deepEqual(result, ["2026-10-31"]);
});

test("yearly on Feb 29 clamped lens lands in October range correctly", () => {
  const event = {
    date: "2024-02-29",
    recurrence: { freq: "yearly", interval: 2, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2025-01-01", "2031-12-31"),
    ["2026-02-28", "2028-02-29", "2030-02-28"],
  );
});

test("monthly on every month end: 31st through 2026", () => {
  const event = {
    date: "2026-10-31",
    recurrence: { freq: "monthly", interval: 1, until: null, exceptions: [] },
  };
  assert.deepEqual(
    occurrencesInRange(event, "2026-10-01", "2027-03-01"),
    ["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"],
  );
});

test("isRuleValid rejects malformed rules", () => {
  assert.equal(isRuleValid({ freq: "daily", interval: 1, until: null, exceptions: [] }), true);
  assert.equal(isRuleValid({ freq: "hourly", interval: 1 }), false);
  assert.equal(isRuleValid({ freq: "daily", interval: 0 }), false);
  assert.equal(isRuleValid({ freq: "daily", interval: 1, until: "bad" }), false);
  assert.equal(isRuleValid({ freq: "daily", interval: 1, exceptions: "no" }), false);
  assert.equal(isRuleValid(null), false);
  assert.equal(isRuleValid("daily"), false);
});
