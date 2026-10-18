import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

const { openDb, withTransaction, closeDb, requestPersistentStorage } = await import(
  "../js/data/db.js"
);
const { loadSettings, saveSettings, defaultWeekStartsOn, emptySettings } = await import(
  "../js/data/settings.js"
);
const {
  validateEventRecord,
  makeEvent,
  saveEvent,
  getEvent,
  listEvents,
  deleteEvent,
  deleteOccurrence,
  countEvents,
  eventsForRange,
} = await import("../js/data/events.js");

beforeEach(async () => {
  // Fresh database per test: close the cached connection, then wipe.
  await closeDb();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("calendar");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

test("openDb creates the calendar database with expected stores", async () => {
  const db = await openDb();
  assert.deepEqual([...db.objectStoreNames].sort(), ["events", "images", "settings"]);
});

test("settings round trip and defaults", async () => {
  const loaded = await loadSettings();
  assert.deepEqual(loaded, emptySettings());
  const saved = await saveSettings({
    artBridgeUrl: "https://chrono-art-bridge.test.workers.dev",
    artSecret: "secret-token",
    lastView: "week",
  });
  assert.equal(saved.artBridgeUrl, "https://chrono-art-bridge.test.workers.dev");
  assert.equal(saved.artSecret, "secret-token");
  assert.equal(saved.lastView, "week");
  const reloaded = await loadSettings();
  assert.equal(reloaded.artBridgeUrl, "https://chrono-art-bridge.test.workers.dev");
  assert.equal(reloaded.artSecret, "secret-token");
  assert.equal(reloaded.lastView, "week");
  // empty-string credentials are normalized to null (never allow empty keeper)
  const cleared = await saveSettings({ artBridgeUrl: "", artSecret: "" });
  assert.equal(cleared.artBridgeUrl, null);
  assert.equal(cleared.artSecret, null);
  // the retired Gemini field is dropped on load
  await saveSettings({ geminiApiKey: "legacy" });
  const postLegacy = await loadSettings();
  assert.equal("geminiApiKey" in postLegacy, false);
});

test("image store round trip and listing", async () => {
  const { saveImage, getImage, deleteImage, listImages } = await import("../js/data/images.js");
  const blob = new Blob([new Uint8Array([9, 8, 7])], { type: "image/webp" });
  const other = new Blob([new Uint8Array([1])], { type: "image/png" });
  await saveImage("ev1", blob);
  await saveImage("ev2", other);
  const listed = await listImages();
  assert.deepEqual(Object.keys(listed).sort(), ["ev1", "ev2"]);
  assert.equal(listed.ev1.type, "image/webp");
  const got = await getImage("ev1");
  assert.ok(got instanceof Blob);
  await deleteImage("ev2");
  assert.equal(await getImage("ev2"), null);
  await deleteImage("ev1");
});

test("defaultWeekStartsOn returns 0 or 1", () => {
  const start = defaultWeekStartsOn();
  assert.ok(start === 0 || start === 1);
});

test("event CRUD, validation and filtering", async () => {
  const draft = makeEvent({
    title: "Standup",
    color: "teal",
    date: "2026-10-16",
    time: "09:00",
    timezone: "UTC",
    locationLink: null,
  });
  await saveEvent(draft);
  const fetched = await getEvent(draft.id);
  assert.equal(fetched?.title, "Standup");
  assert.equal((await listEvents()).length, 1);
  assert.equal(await countEvents(), 1);

  // invalid records are rejected
  await assert.rejects(
    (async () => {
      await saveEvent({ ...draft, id: "other", title: "" });
    }),
    /invalid title/,
  );
  await assert.rejects(
    (async () => {
      await saveEvent({ ...draft, id: "bad", date: "2026-02-30" });
    }),
    /invalid date/,
  );

  await deleteEvent(draft.id);
  assert.equal((await listEvents()).length, 0);
});

test("validateEventRecord reasons", () => {
  const base = makeEvent({ title: "T", color: "blue", date: "2026-01-01", time: null, timezone: "UTC" });
  assert.equal(validateEventRecord({ ...base, color: "magenta" }).ok, false);
  assert.equal(validateEventRecord({ ...base, time: "25:00" }).ok, false);
  assert.equal(validateEventRecord({ ...base, locationLink: "javascript:alert(1)" }).ok, false);
  assert.equal(validateEventRecord({ ...base, imageStatus: "weird" }).ok, false);
  assert.equal(
    validateEventRecord({
      ...base,
      recurrence: { freq: "daily", interval: 2, until: null, exceptions: [] },
    }).ok,
    true,
  );
  assert.equal(
    validateEventRecord({
      ...base,
      recurrence: { freq: "daily", interval: 0, until: null, exceptions: [] },
    }).ok,
    false,
  );
});

test("deleteOccurrence adds an exception or removes the series", async () => {
  const event = makeEvent({
    title: "Weekly sync",
    color: "blue",
    date: "2026-10-01",
    time: "10:00",
    timezone: "UTC",
    recurrence: { freq: "weekly", interval: 1, until: null, exceptions: [] },
  });
  await saveEvent(event);

  await deleteOccurrence(event, "only", "2026-10-08");
  const withException = await getEvent(event.id);
  assert.deepEqual(withException?.recurrence?.exceptions, ["2026-10-08"]);

  await deleteOccurrence(event, "all", "2026-10-08");
  const removed = await getEvent(event.id);
  assert.equal(removed, null);
});

test("eventsForRange expands one entry per occurrence", async () => {
  const single = makeEvent({
    title: "SA",
    color: "teal",
    date: "2026-10-16",
    time: "09:00",
    timezone: "UTC",
  });
  const recurring = makeEvent({
    title: "RA",
    color: "red",
    date: "2026-10-14",
    time: "18:00",
    timezone: "UTC",
    recurrence: { freq: "daily", interval: 2, until: null, exceptions: [] },
  });
  for (const e of [single, recurring]) await saveEvent(e);

  const all = await listEvents();
  const entries = eventsForRange(all, "2026-10-14", "2026-10-16");
  const days = entries.map((x) => `${x.date}:${x.event.title}`).sort();
  assert.deepEqual(days, [
    "2026-10-14:RA",
    "2026-10-16:RA",
    "2026-10-16:SA",
  ]);
});

test("requestPersistentStorage does not throw outside browsers", () => {
  requestPersistentStorage();
});
