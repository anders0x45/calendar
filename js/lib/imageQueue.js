/**
 * Image generation queue. "Pending" events get their artwork generated
 * one at a time, once, with a single retry; the result lands in the
 * images store and the event record's imageStatus flips to ready/failed.
 * All side effects are injected, so the flow is unit-testable.
 */

import { IMAGE_GEN_RETRY_DELAY_MS, IMAGE_MAX_DIMENSION } from "../config.js";
import { generateEventImage, resizeImageBlob } from "./genai.js";

/** @typedef {import("../data/events.js").Event} Event */
/** @typedef {(event: Event) => {ok: true, blob: Blob} | {ok: false, reason: string}} GenerateFn */
/** @typedef {{bridgeUrl: string|null, artSecret: string|null, autoArt?: boolean}} QueueConfig */

/**
 * Events eligible for generation: pending status, recursion-free by
 * construction (caller passes events array), oldest first.
 * @param {Event[]} events
 * @returns {Event[]}
 */
export function pickPending(events) {
  return events
    .filter((event) => event.imageStatus === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * @typedef {{
 *   generate: GenerateFn,
 *   saveImage: (eventId: string, blob: Blob) => Promise<void>,
 *   saveEvent: (event: Event) => Promise<Event>,
 *   resize: (blob: Blob) => Promise<Blob>,
 *   delay: (ms: number) => Promise<void>,
 *   log?: (message: string) => void,
 * }} QueueDeps
 */

/** @type {QueueDeps} */
export function defaultDeps(config) {
  return {
    generate: (event) =>
      generateEventImage({
        bridgeUrl: config?.bridgeUrl ?? "",
        artSecret: config?.artSecret ?? "",
        title: event.title,
      }),
    saveImage: (id, blob) => import("../data/images.js").then((m) => m.saveImage(id, blob)),
    saveEvent: (event) => import("../data/events.js").then((m) => m.saveEvent(event)),
    resize: (blob) => resizeImageBlob(blob, IMAGE_MAX_DIMENSION),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/**
 * Process a single pending event: generate (with one retry), store the
 * resized blob, flip imageStatus. Returns the new status.
 * @param {Event} event
 * @param {QueueDeps} deps
 * @returns {Promise<"ready"|"failed">}
 */
export async function processOne(event, deps) {
  let result = await deps.generate(event);
  if (!result.ok) {
    deps.log?.(`first attempt failed: ${result.reason}`);
    await deps.delay(IMAGE_GEN_RETRY_DELAY_MS);
    result = await deps.generate(event);
  }
  if (!result.ok) {
    await deps.saveEvent({ ...event, imageStatus: "failed", updatedAt: Date.now() });
    return "failed";
  }
  try {
    const sized = await deps.resize(result.blob);
    await deps.saveImage(event.id, sized);
    await deps.saveEvent({ ...event, imageStatus: "ready", updatedAt: Date.now() });
    return "ready";
  } catch (error) {
    deps.log?.(`store failed: ${error instanceof Error ? error.message : "unknown"}`);
    await deps.saveEvent({ ...event, imageStatus: "failed", updatedAt: Date.now() });
    return "failed";
  }
}

/**
 * Drain one batch: pending events from `events`, sequential, cap per
 * run so a slow connection can't monopolize the CPU/network.
 * @param {Event[]} events
 * @param {QueueDeps} deps
 * @param {{limit?: number}} [options]
 * @returns {Promise<number>} processed count
 */
export async function drainQueue(events, deps, { limit = 2 } = {}) {
  const pending = pickPending(events).slice(0, limit);
  let processed = 0;
  for (const event of pending) {
    await processOne(event, deps);
    processed += 1;
  }
  return processed;
}
