/**
 * One-time migration: legacy device-local events (and their image
 * bytes) import into the active cloud calendar after first successful
 * sign-in. The offer shows once per device ("not now" keeps it for the
 * next session); a discard deletes the local copy without import.
 */

import { withTransaction } from "./db.js";
import { isCloud, getBackend } from "./backend.js";
import { validateEventRecord, saveEvent, deleteAllEvents } from "./events.js";
import { putImages, deleteAllImages } from "./images.js";

const OFFER_FLAG_KEY = "migration-offered-v1";

/**
 * @returns {Promise<number>} number of stored device-local events
 */
export async function countLegacyEvents() {
  try {
    const rows = await withTransaction(["events"], "readonly", (stores) =>
      stores.events.getAll(),
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<boolean>} true when a local legacy payload exists
 */
export async function hasLegacyEvents() {
  return (await countLegacyEvents()) > 0;
}

/**
 * @returns {Promise<boolean>} true when the one-time offer already ran
 */
export async function wasMigrationOffered() {
  try {
    const flagged = await withTransaction(["settings"], "readonly", (stores) =>
      stores.settings.get(OFFER_FLAG_KEY),
    );
    return flagged === "offered";
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<void>}
 */
export async function markMigrationOffered() {
  await withTransaction(["settings"], "readwrite", (stores) => {
    stores.settings.put("offered", OFFER_FLAG_KEY);
  });
}

/**
 * Import validation-checked local events into the cloud calendar, carry
 * their image bytes over, then clear the local stores. Progress from
 * return value (imported/skipped); thrown errors abort before any
 * deletion.
 * @returns {Promise<{imported: number, skipped: number}>}
 */
export async function importLegacyEvents() {
  if (!isCloud()) throw new Error("migration requires a cloud backend");
  const uid = getBackend().uid;
  if (!uid) throw new Error("migration requires a signed-in account");

  const rows = await withTransaction(["events"], "readonly", (stores) =>
    stores.events.getAll(),
  );
  /** @type {import("./events.js").Event[]} */
  const events = [];
  let skipped = 0;
  for (const row of rows ?? []) {
    const check = validateEventRecord(row);
    if (check.ok) events.push(check.event);
    else skipped += 1;
  }

  for (const event of events) {
    // Cloud save stamps createdBy = the importing uid; createdAt is
    // intentionally rebased to server time (chronology of import).
    await saveEvent(event);
  }

  // Image bytes: bypass the backend dispatch (a cloud listImages()
  // walks event ids against Firestore); legacy blobs are the device's
  // IndexedDB records keyed by event id.
  const [legacyValues, legacyKeys] = await Promise.all([
    withTransaction(["images"], "readonly", (stores) => stores.images.getAll()),
    withTransaction(["images"], "readonly", (stores) => stores.images.getAllKeys()),
  ]);
  const targets = {};
  if (Array.isArray(legacyValues) && Array.isArray(legacyKeys)) {
    const until = Math.min(legacyValues.length, legacyKeys.length);
    for (let i = 0; i < until; i += 1) {
      const id = String(legacyKeys[i]);
      const wanted = events.some((event) => event.id === id);
      const blob = legacyValues[i];
      if (wanted && blob instanceof Blob) targets[id] = blob;
    }
  }
  if (Object.keys(targets).length > 0) {
    await putImages(targets);
  }

  // Only after everything landed, clear the device stores.
  await deleteAllEvents();
  await deleteAllImages();
  return { imported: events.length, skipped };
}
