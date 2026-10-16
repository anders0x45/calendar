import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getZonedParts,
  instantToDateKey,
  instantToTimeKey,
  isValidTimeZone,
  userTimeZone,
  zonedWallToInstant,
  zoneOffsetMinutes,
} from "../js/lib/timezones.js";

const UTC = "UTC";

/** Helper: wall time in a zone as "(date)(time)" for assertions. */
function wall(instantMs, zone) {
  return instantToDateKey(instantMs, zone) + "T" + instantToTimeKey(instantMs, zone);
}

test("getZonedParts and zoneOffsetMinutes on a fixed-offset zone", () => {
  const t = Date.UTC(2026, 2, 15, 9, 0);
  assert.equal(zoneOffsetMinutes(t, "Africa/Addis_Ababa"), 180);
  assert.deepEqual(getZonedParts(t, "Africa/Addis_Ababa"), {
    year: 2026, month: 3, day: 15, hour: 12, minute: 0, second: 0,
  });
});

test("fixed zone round trip: Addis Ababa (+3, no DST)", () => {
  const t = zonedWallToInstant("2026-01-15", "12:00", "Africa/Addis_Ababa");
  assert.equal(new Date(t).toISOString(), "2026-01-15T09:00:00.000Z");
  assert.equal(wall(t, "Africa/Addis_Ababa"), "2026-01-15T12:00");
});

test("New York winter and summer", () => {
  const winter = zonedWallToInstant("2026-01-15", "12:00", "America/New_York");
  assert.equal(new Date(winter).toISOString(), "2026-01-15T17:00:00.000Z");
  const summer = zonedWallToInstant("2026-07-15", "12:00", "America/New_York");
  assert.equal(new Date(summer).toISOString(), "2026-07-15T16:00:00.000Z");
});

test("Berlin winter and summer", () => {
  const winter = zonedWallToInstant("2026-01-15", "12:00", "Europe/Berlin");
  assert.equal(new Date(winter).toISOString(), "2026-01-15T11:00:00.000Z");
  const summer = zonedWallToInstant("2026-07-15", "12:00", "Europe/Berlin");
  assert.equal(new Date(summer).toISOString(), "2026-07-15T10:00:00.000Z");
});

test("spring-forward gap shifts to the first valid instant", () => {
  // US DST 2026: clocks jump 02:00 -> 03:00 on Mar 8, so 02:30 does not exist.
  const t = zonedWallToInstant("2026-03-08", "02:30", "America/New_York");
  assert.equal(wall(t, "America/New_York"), "2026-03-08T03:30");
  // Berlin 2026: 02:00 -> 03:00 CET on Mar 29.
  const tBerlin = zonedWallToInstant("2026-03-29", "02:30", "Europe/Berlin");
  assert.equal(wall(tBerlin, "Europe/Berlin"), "2026-03-29T03:30");
});

test("fall-back overlap resolves to the first (earlier) instant", () => {
  // US DST 2026: 01:30 EDT and 01:30 EST both exist on Nov 1.
  const t = zonedWallToInstant("2026-11-01", "01:30", "America/New_York");
  // First occurrence is 01:30 EDT = 05:30 UTC.
  assert.equal(new Date(t).toISOString(), "2026-11-01T05:30:00.000Z");
  const tBerlin = zonedWallToInstant("2026-10-25", "02:30", "Europe/Berlin");
  assert.equal(new Date(tBerlin).toISOString(), "2026-10-25T00:30:00.000Z"); // CEST
});

test("+14 zone: Pacific/Kiritimati near the date line", () => {
  const t = zonedWallToInstant("2026-01-15", "12:00", "Pacific/Kiritimati");
  assert.equal(new Date(t).toISOString(), "2026-01-14T22:00:00.000Z");
});

test("negative zone near the date line: Pacific/Niue (-11)", () => {
  const t = zonedWallToInstant("2026-01-15", "12:00", "Pacific/Niue");
  assert.equal(new Date(t).toISOString(), "2026-01-15T23:00:00.000Z");
});

test("late event crosses the day line when converted to a far-east viewer", () => {
  // 23:30 Niue (-11) = 10:30 UTC on the next UTC day; Tokyo (+9) sees 19:30 on 03-11.
  const t = zonedWallToInstant("2026-03-10", "23:30", "Pacific/Niue");
  assert.equal(instantToDateKey(t, "Asia/Tokyo"), "2026-03-11");
  assert.equal(instantToTimeKey(t, "Asia/Tokyo"), "19:30");
});

test("early event lands on the previous day for a west-side viewer", () => {
  // 00:30 Tokyo (+9) = 15:30 UTC on 03-09; NY viewer (EDT, -4) sees 11:30 on 03-09.
  const t = zonedWallToInstant("2026-03-10", "00:30", "Asia/Tokyo");
  assert.equal(instantToDateKey(t, "America/New_York"), "2026-03-09");
  assert.equal(instantToTimeKey(t, "America/New_York"), "11:30");
});

test("recurring wall time stays fixed across DST in the event zone", () => {
  // 09:00 New York on a day before and after spring forward: instants differ.
  const before = zonedWallToInstant("2026-03-07", "09:00", "America/New_York");
  const after = zonedWallToInstant("2026-03-09", "09:00", "America/New_York");
  assert.equal(new Date(before).toISOString(), "2026-03-07T14:00:00.000Z");
  assert.equal(new Date(after).toISOString(), "2026-03-09T13:00:00.000Z");
});

test("round trip through Berlin across both transitions", () => {
  for (const dateKey of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26"]) {
    const t = zonedWallToInstant(dateKey, "08:00", "Europe/Berlin");
    if (dateKey === "2026-03-29") {
      // 02:00-03:00 does not exist; 08:00 is unaffected either way.
      assert.equal(wall(t, "Europe/Berlin"), dateKey + "T08:00");
    } else {
      assert.equal(wall(t, "Europe/Berlin"), dateKey + "T08:00");
    }
  }
});

test("zoneOffsetMinutes flips across the New York spring transition", () => {
  const pre = zoneOffsetMinutes(Date.UTC(2026, 2, 8, 5, 0), "America/New_York");
  const post = zoneOffsetMinutes(Date.UTC(2026, 2, 8, 7, 0), "America/New_York");
  assert.equal(pre, -300);
  assert.equal(post, -240);
});

test("userTimeZone returns a valid IANA name", () => {
  assert.equal(isValidTimeZone(userTimeZone()), true);
});

test("isValidTimeZone rejects junk", () => {
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("UTC itself works", () => {
  const t = zonedWallToInstant("2026-01-01", "00:00", UTC);
  assert.equal(new Date(t).toISOString(), "2026-01-01T00:00:00.000Z");
});
