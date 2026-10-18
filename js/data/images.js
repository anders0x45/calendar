/**
 * Images live in their own store, keyed by event id, so event lists stay
 * fast. Values are Blobs (WebP, downscaled elsewhere); null deletes.
 */

import { withTransaction } from "./db.js";

/**
 * @param {string} eventId
 * @returns {Promise<Blob | null>}
 */
export async function getImage(eventId) {
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
  await withTransaction(["images"], "readwrite", (stores) => {
    stores.images.put(blob, eventId);
  });
}

/**
 * @param {string} eventId
 * @returns {Promise<void>}
 */
export async function deleteImage(eventId) {
  await withTransaction(["images"], "readwrite", (stores) => {
    stores.images.delete(eventId);
  });
}

/**
 * All image attachments as event-id -> Blob, for export.
 * getAll/getAllKeys iterate in the same (key) order, so index pairing
 * is safe. Two reads in two transactions keep the request plumbing of
 * withTransaction intact (no manual cursor handler juggling).
 * @returns {Promise<Record<string, Blob>>}
 */
export async function listImages() {
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
  const entries = Object.entries(images);
  if (entries.length === 0) return;
  await withTransaction(["images"], "readwrite", (stores) => {
    for (const [id, blob] of entries) {
      stores.images.put(blob, id);
    }
  });
}

/**
 * Drop every stored image (factory reset).
 * @returns {Promise<void>}
 */
export async function deleteAllImages() {
  await withTransaction(["images"], "readwrite", (stores) => stores.images.clear());
}
