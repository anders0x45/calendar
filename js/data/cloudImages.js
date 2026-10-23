/**
 * Image bytes against Firestore (calendars/{calendarId}/images/{eventId}).
 * Rules: bytes <= 256KB, writes by the event creator, reads as a member
 * via direct get only (no listing — export walks event ids instead).
 */

import { ensureFirestore } from "../firebase/sdk.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Bytes,
} from "../firebase/firestore-api.js";
import { getBackend, isCloud } from "./backend.js";

/** Mirror of the rules cap (bytes <= 256 * 1024). */
export const IMAGE_BYTES_CAP = 256 * 1024;

/**
 * @param {string} id
 */
function imageRef(id) {
  const { calendarId } = getBackend();
  if (!isCloud() || typeof calendarId !== "string") {
    throw new Error("cloud images requested without an active calendar");
  }
  return doc(ensureFirestore(), "calendars", calendarId, "images", id);
}

/**
 * One image attachment: {Timestamp, Bytes} -> null when absent.
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getImage(id) {
  const snapshot = await getDoc(imageRef(id));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const bytes = data?.bytes;
  if (bytes instanceof Bytes) {
    return new Blob([bytes.toUint8Array()], { type: "image/webp" });
  }
  return null;
}

/**
 * @param {string} id
 * @param {Blob} blob
 * @returns {Promise<void>}
 */
export async function saveImage(id, blob) {
  if (!(blob instanceof Blob)) throw new TypeError("image value must be a Blob");
  const raw = new Uint8Array(await blob.arrayBuffer());
  if (raw.length > IMAGE_BYTES_CAP) throw new Error("image exceeds the 256KB cap");
  await setDoc(imageRef(id), {
    bytes: Bytes.fromUint8Array(raw),
    updatedAt: serverTimestamp(),
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteImage(id) {
  await deleteDoc(imageRef(id));
}

/**
 * Direct-get bytes for the events the exporter asks for (rules forbid
 * listing images; walking ids stays member-legal). Absent ids are
 * skipped, matching the local lister's sparse output.
 * @param {string[]} ids
 * @returns {Promise<Record<string, Blob>>}
 */
export async function listImages(ids) {
  /** @type {Record<string, Blob>} */
  const out = {};
  for (const id of ids) {
    try {
      const blob = await getImage(id);
      if (blob) out[id] = blob;
    } catch (error) {
      console.error(`image read failed for ${id}`, error);
    }
  }
  return out;
}

/**
 * Bulk import for the share/migration flow: sequential writes, each
 * subject to the same rules as a single save.
 * @param {Record<string, Blob>} images
 * @returns {Promise<void>}
 */
export async function putImages(images) {
  for (const [id, blob] of Object.entries(images)) {
    try {
      await saveImage(id, blob);
    } catch (error) {
      console.error(`image import failed for ${id}`, error);
    }
  }
}
