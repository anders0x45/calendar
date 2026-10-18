import { test } from "node:test";
import assert from "node:assert/strict";

const { buildExport, parseImportPayload, decodeImages, exportFilename } = await import(
  "../js/lib/backup.js"
);

/** @returns {Record<string, unknown>} valid stored-shape event */
function rawEvent(id = "e1") {
  return {
    id,
    title: "Retro Karaoke",
    color: "pink",
    date: "2026-10-18",
    time: "21:00",
    timezone: "Europe/Berlin",
    locationLink: "https://example.com",
    imageStatus: "none",
    recurrence: { freq: "weekly", interval: 1, until: null, exceptions: [] },
    createdAt: 100,
    updatedAt: 200,
  };
}

test("buildExport produces an envelope with base64 images and no settings", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
  const envelope = await buildExport({ events: [rawEvent()], images: { e1: blob } });
  const data = /** @type {any} */ (envelope);
  assert.equal(data.app, "calendar");
  assert.equal(data.version, 1);
  assert.equal(typeof data.exportedAt, "string");
  assert.equal(data.events.length, 1);
  assert.equal(JSON.parse(JSON.stringify(envelope)).events[0].color, "pink");
  assert.ok(data.images.e1.data.length > 0);
  assert.equal(data.images.e1.mimeType, "image/webp");
});

test("parseImportPayload round-trips a valid export", async () => {
  const envelope = await buildExport({
    events: [rawEvent("a"), rawEvent("b")],
    images: {},
  });
  const parsed = parseImportPayload(JSON.stringify(envelope));
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.skipped, 0);
  }
});

test("parseImportPayload skips invalid events but keeps valid ones", async () => {
  const envelope = await buildExport({ events: [], images: {} });
  const data = /** @type {any} */ (JSON.parse(JSON.stringify(envelope)));
  data.events.push(rawEvent("good"), { id: "", title: "broken" }, { nope: true });
  const parsed = parseImportPayload(JSON.stringify(data));
  assert.ok(parsed.ok);
  assert.equal(/** @type {any} */ (parsed).events.length, 1);
  assert.equal(/** @type {any} */ (parsed).skipped, 2);
});

test("parseImportPayload rejects wrong app, version, shape", () => {
  assert.ok(!parseImportPayload("{bad json").ok);
  const wrongApp = /** @type {any} */ (parseImportPayload('{"app":"other","version":1,"events":[]}'));
  assert.ok(!wrongApp.ok);
  const wrongVersion = /** @type {any} */ (parseImportPayload('{"app":"calendar","version":99,"events":[]}'));
  assert.ok(!wrongVersion.ok);
  const noEvents = /** @type {any} */ (parseImportPayload('{"app":"calendar","version":1}'));
  assert.ok(!noEvents.ok);
});

test("decodeImages skips malformed entries", () => {
  const decoded = decodeImages({
    good: { mimeType: "image/webp", data: "AQID" },
    badData: { mimeType: "image/webp", data: 42 },
    badBase64: { mimeType: "image/webp", data: "!!!" },
  });
  assert.deepEqual(Object.keys(decoded), ["good"]);
  assert.equal(decoded.good.type, "image/webp");
});

test("exportFilename is date-stamped", () => {
  assert.equal(exportFilename("2026-10-18T10:00:00.000Z"), "calendar-backup-2026-10-18.json");
});
