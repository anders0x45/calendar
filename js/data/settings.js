/**
 * Settings split:
 *   cloud-only prefs (when signed in): weekStartsOn, lastView,
 *     activeCalendarId — mirrored into users/{uid}.settings exactly in
 *     the shape the rules allow (those three keys, nothing else).
 *   device-local secrets and prefs: artBridgeUrl, artSecret, imageModel,
 *     defaultDurationMin, militaryTime, autoArt.
 * loadSettings/saveSettings keep their signature and store shape; the
 * split happens inside.
 */

import { withTransaction } from "./db.js";
import { getBackend, isCloud } from "./backend.js";
import { cloudSubset, cloudOverlay, CLOUD_FIELDS } from "../lib/settingsSplit.js";
import { userTimeZone } from "../lib/timezones.js";

/** @typedef {{artBridgeUrl: string|null, artSecret: string|null, imageModel: string, weekStartsOn: 0|1, lastView: "month"|"week"|"day", defaultDurationMin: 30|60|90, militaryTime: boolean, autoArt: boolean, activeCalendarId: string|null}|null} Settings */

/** Fields mirrored to users/{uid}.settings (rules close this set). */
const SETTINGS_KEY = "app";
/** @type {string[]} */
const SECRET_STRING_FIELDS = ["artBridgeUrl", "artSecret"];

/** Latest cloud view of the prefs overlay (primed at boot, updated on
 * every cloud save). @type {Partial<Settings>|null} */
let cloudSnapshot = null;

/**
 * Infer default week start: 0 (Sunday) if Intl weekInfo says so, else 1.
 * @returns {0|1}
 */
export function defaultWeekStartsOn() {
  try {
    const locale = new Intl.Locale(navigator.language);
    const firstDay = locale.weekInfo?.firstDay;
    if (firstDay === 7 || firstDay === 0) return 0; // 0/7 = Sunday in BCP47
    return 1;
  } catch {
    return 1;
  }
}

/**
 * Blank settings with device-appropriate defaults.
 * @returns {Settings}
 */
export function emptySettings() {
  return {
    artBridgeUrl: null,
    artSecret: null,
    imageModel: null,
    weekStartsOn: defaultWeekStartsOn(),
    lastView: "month",
    // Implicit event end, day-view card sizing and display slicing.
    defaultDurationMin: 60,
    // hh:mm vs 11:59 pm (time is always imported/stored as "HH:mm").
    militaryTime: true,
    // Generate Workers AI artwork for new events automatically.
    autoArt: true,
    // Which calendar the calendar views operate on (cloud copies claim).
    activeCalendarId: null,
  };
}

/**
 * Fetch the cloud prefs overlay into {@link cloudSnapshot} (called from
 * the boot before the first loadSettings of a signed-in session).
 * @param {string} uid
 * @returns {Promise<Partial<Settings>>}
 */
export async function readCloudSettings(uid) {
  // Dynamic import: keeps static imports node-test-safe (the gstatic SDK
  // cannot load in plain node) and delays loading in local-only boots.
  const [{ doc, getDoc }, sdk] = await Promise.all([
    import("../firebase/firestore-api.js"),
    import("../firebase/sdk.js"),
  ]);
  const snapshot = await getDoc(doc(sdk.ensureFirestore(), "users", uid));
  const data = snapshot.data()?.settings;
  const overlay = cloudOverlay(data);
  cloudSnapshot = { ...cloudSnapshot, ...overlay };
  return overlay;
}

/** Forget the cloud prefs overlay (used when backing out to local mode). */
export function dropCloudSettings() {
  cloudSnapshot = null;
}

/** @returns {Promise<Settings>} always resolves with a full settings object */
export async function loadSettings() {
  try {
    const stored = await withTransaction(["settings"], "readonly", (stores) =>
      stores.settings.get(SETTINGS_KEY),
    );
    const defaults = emptySettings();
    let merged = { ...defaults };
    if (stored && typeof stored === "object") {
      // Merge over defaults so new fields keep working after upgrades;
      // drop the retired provider fields from older installs.
      merged = { ...merged, ...stored };
      for (const legacy of ["geminiApiKey", "cloudflareApiToken", "cloudflareAccountId"]) {
        delete merged[legacy];
      }
    }
    // Cloud prefs overlay: only meaningful with a live cloud backend.
    let overlay = cloudSnapshot;
    if (overlay == null && isCloud()) {
      const uid = getBackend().uid;
      if (uid) {
        overlay = await readCloudSettings(uid).catch(() => null);
      }
    }
    if (overlay) {
      merged = { ...merged, ...overlay };
    }
    return merged;
  } catch {
    // Error paths must not crash the app; empty settings = first run.
    return emptySettings();
  }
}

/**
 * Persist settings. Accepts a partial patch of the current saved shape.
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>} the merged settings that were saved
 */
export async function saveSettings(patch) {
  const current = (await loadSettings()) ?? emptySettings();
  const merged = { ...current, ...patch };
  for (const field of SECRET_STRING_FIELDS) {
    if (field in merged) {
      if (typeof merged[field] !== "string" || merged[field] === "") {
        merged[field] = null;
      } else {
        merged[field] = String(/** @type {any} */ (merged[field]));
      }
    }
  }
  await withTransaction(["settings"], "readwrite", (stores) =>
    stores.settings.put(merged, SETTINGS_KEY),
  );
  if (isCloud()) {
    const uid = getBackend().uid;
    const subset = cloudSubset(merged);
    if (uid && subset) {
      // Offline-safe: persistentLocalCache queues the write until sync.
      const [{ doc, updateDoc }, sdk] = await Promise.all([
        import("../firebase/firestore-api.js"),
        import("../firebase/sdk.js"),
      ]);
      await updateDoc(doc(sdk.ensureFirestore(), "users", uid), {
        settings: subset,
      }).then(() => {
        cloudSnapshot = { ...cloudSnapshot, ...subset };
      }, (error) => {
        console.error("cloud settings save failed", error);
      });
    }
  }
  return merged;
}
