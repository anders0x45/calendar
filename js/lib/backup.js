/**
 * Backup envelope build/parse. Export takes the events + image blobs and
 * produces a versioned JSON payload (images as base64, never the API
 * key). Parsing validates the envelope and every event record strictly
 * (validateEventRecord), so corrupt imports are skipped, not stored.
 */

import { EXPORT_APP_ID, EXPORT_VERSION } from "../config.js";
import { validateEventRecord } from "../data/events.js";

/** @typedef {import("../data/events.js").Event} Event */

/**
 * Build the export envelope. Callers pass events and an id->Blob map;
 * images become {mimeType, data} with data as base64.
 * @param {{events: Event[], images: Record<string, Blob>}} input
 * @returns {Promise<unknown>} JSON-serializable envelope
 */
export async function buildExport({ events, images }) {
  /** @type {Record<string, {mimeType: string, data: string}>} */
  const imagePayload = {};
  for (const [id, blob] of Object.entries(images)) {
    imagePayload[id] = {
      mimeType: blob.type || "image/webp",
      data: bytesToBase64(await blob.arrayBuffer()),
    };
  }
  return {
    app: EXPORT_APP_ID,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    events: events.map((event) => ({ ...event })),
    images: imagePayload,
  };
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bytesToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Parse a raw JSON text into a validated import payload.
 * @typedef {{ok: true, events: Event[], images: Record<string, {mimeType: string, data: string}>, skipped: number} |
 *           {ok: false, reason: string}} ParseResult
 * @param {string} text
 * @returns {ParseResult}
 */
export function parseImportPayload(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Not valid JSON" };
  }
  if (typeof envelope !== "object" || envelope === null) {
    return { ok: false, reason: "Not an object" };
  }
  if (envelope.app !== EXPORT_APP_ID) {
    return { ok: false, reason: "Wrong app in envelope" };
  }
  if (envelope.version !== EXPORT_VERSION) {
    return { ok: false, reason: `Unsupported version ${JSON.stringify(envelope.version)}` };
  }
  if (!Array.isArray(envelope.events)) {
    return { ok: false, reason: "Missing events array" };
  }
  /** @type {Event[]} */
  const events = [];
  let skipped = 0;
  for (const raw of envelope.events) {
    const check = validateEventRecord(raw);
    if (check.ok) events.push(check.event);
    else skipped += 1;
  }
  const images = typeof envelope.images === "object" && envelope.images !== null
    ? envelope.images
    : {};
  return { ok: true, events, images, skipped };
}

/**
 * Decode imported image entries into Blobs, skipping malformed ones.
 * @param {Record<string, {mimeType: string, data: string}>} images
 * @returns {Record<string, Blob>}
 */
export function decodeImages(images) {
  /** @type {Record<string, Blob>} */
  const out = {};
  for (const [id, entry] of Object.entries(images)) {
    if (typeof id !== "string" || typeof entry !== "object" || entry === null) continue;
    if (typeof entry.data !== "string" || typeof entry.mimeType !== "string") continue;
    try {
      const bytes = Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0));
      out[id] = new Blob([bytes], { type: entry.mimeType });
    } catch {
      // skip malformed base64
    }
  }
  return out;
}

/**
 * Filename used for the backup download.
 * @param {string} [nowIso]
 * @returns {string}
 */
export function exportFilename(nowIso = new Date().toISOString()) {
  return `${EXPORT_APP_ID}-backup-${nowIso.slice(0, 10)}.json`;
}
