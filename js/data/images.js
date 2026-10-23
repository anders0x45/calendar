/**
 * Images live in their own store, keyed by event id, so event lists stay
 * fast. Values are Blobs (WebP, downscaled elsewhere); null deletes.
 * Under a cloud backend the bytes move to Firestore
 * (calendars/{cal}/images/{id}) through the same function signatures; a
 * small in-memory cache avoids re-reading bytes per render in both
 * modes.
 */

import { withTransaction } from "./db.js";
import { isCloud } from "./backend.js";

/** @type {Map<string, Blob|null>} */
const memoryCache = new Map();

/** Invalidate one cache entry (callers: after any value change). */
function forget(id) {
  memoryCache.delete(id);
}

async function loadImage(id) {
  if (memoryCache.has(id)) return memoryCache.get(id) ?? null;
  const blob = await (isCloud()
    ? (await import("./cloudImages.js")).getImage(id)
    : readLocalBlob(id));
  memoryCache.set(id, blob);
  return blob;
}

/**
 * @param {string} eventId
 * @returns {Promise<Blob | null>}
 */
export async function getImage(eventId) {
  return loadImage(eventId);
}

/** Local-get helper kept out of the cached path. */
async function readLocalBlob(eventId) {
  try {
    const blob = await withTransaction(["images"], "readonly", (stores) =>
      stores.images.get(eventId),
    );
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} eventId @param {Blob} blob
 * @returns {Promise<void>}
 */
export async function saveImage(eventId, blob) {
  if (!(blob instanceof Blob)) throw new TypeError("image value must be a Blob");
  try {
    if (isCloud()) {
      await (await import("./cloudImages.js")).saveImage(eventId, blob);
    } else {
      await withTransaction(["images"], "readwrite", (stores) => {
        stores.images.put(blob, eventId);
      });
    }
    forget(eventId);
  } catch (error) {
    forget(eventId);
    throw error;
  }
}

/**
 * @param {string} eventId
 * @returns {Promise<void>}
 */
export async function deleteImage(eventId) {
  try {
    if (isCloud()) {
      await (await import("./cloudImages.js")).deleteImage(eventId);
    } else {
      await withTransaction(["images"], "readwrite", (stores) => {
        stores.images.delete(eventId);
      });
    }
    forget(eventId);
  } catch (error) {
    forget(eventId);
    throw error;
  }
}

/**
 * All image attachments as event-id -> Blob, for export. Cloud mode
 * cannot list (rules): the caller supplies the candidate event ids and
 * only attachments the backend actually holds come back.
 * @param {string[]|null} [eventIds] required under a cloud backend
 * @returns {Promise<Record<string, Blob>>}
 */
export async function listImages(eventIds = null) {
  if (isCloud()) {
    if (!Array.isArray(eventIds) || eventIds.length === 0) return {};
    return (await import("./cloudImages.js")).listImages(eventIds);
  }
  const values = await withTransaction(["images"], "readonly", (stores) =>
    stores.images.getAll(),
  );
  const keys = await withTransaction(["images"], "readonly", (stores) =>
    stores.images.getAllKeys(),
  );
  /** @type {Record<string, Blob>} */
  const out = {};
  if (Array.isArray(values) && Array.isArray(keys)) {
    const until = Math.min(values.length, keys.length);
    for (let i = 0; i < until; i += 1) {
      const id = /** @type {IDBValidKey} */ (keys[i]);
      out[String(id)] = /** @type {Blob} */ (values[i]);
    }
  }
  return out;
}

/**
 * Import images in bulk (from JSON base64 values decoded elsewhere).
 * @param {Record<string, Blob>} images
 * @returns {Promise<void>}
 */
export async function putImages(images) {
  if (isCloud()) {
    await (await import("./cloudImages.js")).putImages(images);
    for (const id of Object.keys(images)) forget(id);
    return;
  }
  const entries = Object.entries(images);
  if (entries.length === 0) return;
  await withTransaction(["images"], "readwrite", (stores) => {
    for (const [id, blob] of entries) {
      stores.images.put(blob, id);
    }
  });
  for (const id of Object.keys(images)) forget(id);
}

/**
 * Drop every LOCAL image record (factory reset affordance for the
 * device's stores; cloud calendars are never wiped in bulk here).
 * @returns {Promise<void>}
 */
export async function deleteAllImages() {
  memoryCache.clear();
  await withTransaction(["images"], "readwrite", (stores) => stores.images.clear());
}
