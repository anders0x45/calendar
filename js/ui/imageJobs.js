/**
 * Idle-time image job runner for the browser. Reads pending events
 * from state, runs the queue when the API key allows, schedules the
 * next batch on idle, and refreshes state after changes.
 */

import { pickPending, processOne } from "../lib/imageQueue.js";
import { generateEventImage, resizeImageBlob } from "../lib/genai.js";
import { saveImage } from "../data/images.js";
import { saveEvent } from "../data/events.js";
import { getState, subscribe } from "../state.js";
import { refreshEvents } from "./refresh.js";

/** @type {boolean} */
let running = false;
/** @type {boolean} */
let pendingKick = false;
/** @type {(() => void) | null} */
let unsub = null;

/** @returns {void} */
export function startImageJobs() {
  if (unsub) return;
  unsub = subscribe(() => kick());
  kick();
}

/** Coalesced idle kick. */
function kick() {
  if (running) {
    pendingKick = true;
    return;
  }
  const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback : (cb) => setTimeout(cb, 800);
  idle(() => {
    void runOnce();
  });
}

/** @returns {Promise<boolean>} true when work was done (re-kick may follow) */
async function runOnce() {
  const { settings, events } = getState();
  const apiKey = settings?.geminiApiKey ?? null;
  const autoArt = settings?.autoArt ?? true;
  const pending = (apiKey && autoArt) ? pickPending(events).slice(0, 1) : [];
  if (pending.length === 0) {
    running = false;
    if (pendingKick) {
      pendingKick = false;
      kick();
    }
    return false;
  }
  running = true;
  try {
    for (const event of pending) {
      await processOne(event, {
        generate: (e) => generateEventImage({ apiKey: /** @type {string} */ (apiKey), title: e.title }),
        saveImage,
        saveEvent,
        resize: (blob) => resizeImageBlob(blob, 512),
        delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (message) => console.info(`image job [${event.title}]: ${message}`),
      });
    }
    await refreshEvents();
    return true;
  } catch (error) {
    console.error("image job crashed", error);
    return false;
  } finally {
    running = false;
    if (pendingKick) {
      pendingKick = false;
      kick();
      return;
    }
    // Idle again so slow networks can't hog the CPU; picks up retries.
    kick();
  }
}
