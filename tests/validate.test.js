import { test } from "node:test";
import assert from "node:assert/strict";

const { validateEventDraft } = await import("../js/lib/validate.js");

/** @param {string[]} keys @param {Record<string, string>} errors */
function assertErrors(errors, keys) {
  assert.deepEqual(Object.keys(errors).sort(), keys.sort());
}

/** @returns {Record<string, unknown>} a minimal valid draft */
function validDraft() {
  return {
    title: "Sync",
    date: "2026-10-16",
    time: "09:00",
    timezone: "UTC",
    locationLink: "",
    recurrence: null,
  };
}

test("valid draft yields no errors", () => {
  assertErrors(validateEventDraft(/** @type {any} */ (validDraft())), []);
});

test("recurrence: valid rule passes, interval and freq enforced", () => {
  const ok = { ...validDraft(), recurrence: { freq: "weekly", interval: 2, until: "2026-12-01" } };
  assertErrors(validateEventDraft(/** @type {any} */ (ok)), []);

  const badInterval = { ...ok, recurrence: { freq: "daily", interval: 0, until: null } };
  assertErrors(validateEventDraft(/** @type {any} */ (badInterval)), ["recurrence"]);

  const badFreq = { ...ok, recurrence: { freq: "hourly", interval: 1, until: null } };
  assertErrors(validateEventDraft(/** @type {any} */ (badFreq)), ["recurrence"]);

  const floatInterval = { ...ok, recurrence: { freq: "daily", interval: 1.5, until: null } };
  assertErrors(validateEventDraft(/** @type {any} */ (floatInterval)), ["recurrence"]);
});

test("recurrence: until must be a valid date and on or after the start", () => {
  const badFormat = {
    ...validDraft(),
    recurrence: { freq: "daily", interval: 1, until: "2026-13-40" },
  };
  assertErrors(validateEventDraft(/** @type {any} */ (badFormat)), ["recurrence"]);

  const before = {
    ...validDraft(),
    recurrence: { freq: "daily", interval: 1, until: "2026-10-15" },
  };
  assertErrors(validateEventDraft(/** @type {any} */ (before)), ["until"]);

  const sameDay = {
    ...validDraft(),
    recurrence: { freq: "daily", interval: 1, until: "2026-10-16" },
  };
  assertErrors(validateEventDraft(/** @type {any} */ (sameDay)), []);
});

test("recurrence: until earlier than start flags only until, not the rule", () => {
  const draft = {
    ...validDraft(),
    recurrence: { freq: "weekly", interval: 1, until: "2026-01-01" },
  };
  const errors = validateEventDraft(/** @type {any} */ (draft));
  assert.equal(errors.until, "End date must be on or after the start");
  assert.equal(errors.recurrence, undefined);
});

test("non-recurrence checks stay intact", () => {
  assertErrors(
    validateEventDraft(
      /** @type {any} */ ({
        ...validDraft(),
        title: "   ",
        date: "nope",
        time: "25:99",
        locationLink: "ftp://x",
      }),
    ),
    ["title", "date", "time", "locationLink"],
  );
});
