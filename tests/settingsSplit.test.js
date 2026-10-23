/**
 * Unit tests for the settings split helpers (pure logic).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudSubset, cloudOverlay, applyOverlay, CLOUD_FIELDS } from "../js/lib/settingsSplit.js";

test("cloudFields is exactly the rules-closed set", () => {
  assert.deepEqual(CLOUD_FIELDS, ["weekStartsOn", "lastView", "activeCalendarId"]);
});

test("cloudSubset passes through valid merge results", () => {
  const subset = cloudSubset({
    weekStartsOn: 1,
    lastView: "week",
    activeCalendarId: "cal-abc",
    artSecret: "keep-out",
  });
  assert.deepEqual(subset, {
    weekStartsOn: 1,
    lastView: "week",
    activeCalendarId: "cal-abc",
  });
});

test("cloudSubset rejects shapes the rules would deny", () => {
  assert.equal(cloudSubset({ weekStartsOn: 2, lastView: "week" }), null);
  assert.equal(cloudSubset({ weekStartsOn: 1, lastView: "settings" }), null);
  // Disallowed value type for activeCalendarId keeps null rather than
  // risking a denied write.
  const coerced = cloudSubset({ weekStartsOn: 1, lastView: "day", activeCalendarId: 42 });
  assert.equal(coerced.activeCalendarId, null);
});

test("cloudSubset nulls missing activeCalendarId for exact cloud shapes", () => {
  const subset = cloudSubset({ weekStartsOn: 0, lastView: "month" });
  assert.deepEqual(subset, {
    weekStartsOn: 0,
    lastView: "month",
    activeCalendarId: null,
  });
});

test("cloudOverlay keeps only known cloud fields", () => {
  const overlay = cloudOverlay({
    weekStartsOn: 0,
    lastView: "day",
    activeCalendarId: "cal-x",
    artSecret: "never mirrors",
    militaryTime: false,
    unknownFutureField: 1,
  });
  assert.deepEqual(overlay, {
    weekStartsOn: 0,
    lastView: "day",
    activeCalendarId: "cal-x",
  });
});

test("cloudOverlay tolerates null/non-object cloud data", () => {
  assert.deepEqual(cloudOverlay(null), {});
  assert.deepEqual(cloudOverlay(undefined), {});
  assert.deepEqual(cloudOverlay("nope"), {});
});

test("applyOverlay lets the cloud copy win for mirrored fields", () => {
  const local = { weekStartsOn: 0, lastView: "month", artSecret: "local-secret" };
  const merged = applyOverlay(local, { weekStartsOn: 1, lastView: "week" });
  assert.equal(merged.weekStartsOn, 1);
  assert.equal(merged.lastView, "week");
  assert.equal(merged.artSecret, "local-secret");
});

test("applyOverlay without an overlay returns the local object intact", () => {
  const local = { weekStartsOn: 1, lastView: "day" };
  assert.equal(applyOverlay(local, null), local);
});
