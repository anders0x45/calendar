import { test } from "node:test";
import assert from "node:assert/strict";

const { pickPending, processOne } = await import("../js/lib/imageQueue.js");
const { IMAGE_GEN_RETRY_DELAY_MS } = await import("../js/config.js");

/** @returns {{genCalls: number, images: Record<string,string>, statuses: string[], delays: number[], deps: any}} */
function stubDeps(result) {
  const state = {
    genCalls: 0,
    images: /** @type {Record<string, string>} */ ({}),
    delays: /** @type {number[]} */ ([]),
    statuses: /** @type {string[]} */ ([]),
    deps: /** @type {any} */ (null),
  };
  state.deps = {
    generate: async () => {
      state.genCalls += 1;
      return typeof result === "function" ? await result(state) : result;
    },
    saveImage: async (id, blob) => {
      state.images[id] = /** @type {string} */ (blob.type);
    },
    saveEvent: async (event) => {
      state.statuses.push(event.imageStatus);
      return event;
    },
    resize: async (blob) => blob,
    delay: async (ms) => {
      state.delays.push(ms);
    },
  };
  return state;
}

const base = /** @type {any} */ ({
  id: "e1",
  title: "Retro Night",
  color: "blue",
  date: "2026-10-16",
  time: "21:00",
  timezone: "UTC",
  locationLink: null,
  imageStatus: "pending",
  recurrence: null,
  createdAt: 1000,
  updatedAt: 1000,
});

test("pickPending keeps only pending events, oldest first", () => {
  const older = { ...base, id: "old", imageStatus: "pending", createdAt: 1 };
  const fresh = { ...base, id: "new", imageStatus: "pending", createdAt: 2 };
  const ready = { ...base, id: "done", imageStatus: "ready" };
  const none = { ...base, id: "na", imageStatus: "none" };
  const picked = pickPending([ready, fresh, none, older]);
  assert.deepEqual(picked.map((e) => e.id), ["old", "new"]);
});

test("processOne success stores the blob and flips status to ready", async () => {
  const stub = stubDeps({ ok: true, blob: new Blob(["x"], { type: "image/png" }) });
  const status = await processOne(base, stub.deps);
  assert.equal(status, "ready");
  assert.equal(stub.genCalls, 1);
  assert.equal(stub.images.e1, "image/png");
  assert.deepEqual(stub.statuses, ["ready"]);
  assert.deepEqual(stub.delays, []);
});

test("processOne retries once after the configured delay", async () => {
  const stub = stubDeps((state) =>
    state.genCalls < 2
      ? /** @type {any} */ ({ ok: false, reason: "HTTP 500" })
      : { ok: true, blob: new Blob(["x"], { type: "image/webp" }) },
  );
  const status = await processOne(base, stub.deps);
  assert.equal(status, "ready");
  assert.equal(stub.genCalls, 2);
  assert.deepEqual(stub.delays, [IMAGE_GEN_RETRY_DELAY_MS]);
  assert.deepEqual(stub.statuses, ["ready"]);
});

test("processOne two failures flips to failed without stored image", async () => {
  const stub = stubDeps({ ok: false, reason: "API key not valid" });
  const status = await processOne(base, stub.deps);
  assert.equal(status, "failed");
  assert.equal(stub.genCalls, 2);
  assert.deepEqual(Object.keys(stub.images), []);
  assert.deepEqual(stub.statuses, ["failed"]);
});

test("processOne storage errors also flip to failed", async () => {
  const stub = stubDeps({ ok: true, blob: new Blob(["x"], { type: "image/png" }) });
  stub.deps.saveImage = async () => {
    throw new Error("disk full");
  };
  const status = await processOne(base, stub.deps);
  assert.equal(status, "failed");
  assert.deepEqual(stub.statuses, ["failed"]);
});
