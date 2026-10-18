/**
 * Settings stored as the single key "app" in the settings store.
 * Never log or export cloudflareApiToken / cloudflareAccountId.
 */

import { withTransaction } from "./db.js";
import { userTimeZone } from "../lib/timezones.js";

/** @typedef {{artBridgeUrl: string|null, artSecret: string|null, imageModel: string, weekStartsOn: 0|1, lastView: "month"|"week"|"day", defaultDurationMin: 30|60|90, militaryTime: boolean, autoArt: boolean}|null} Settings */

const SETTINGS_KEY = "app";
/** @type {string[]} */
const SECRET_STRING_FIELDS = ["artBridgeUrl", "artSecret"];

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
  };
}

/** @returns {Promise<Settings>} always resolves with a full settings object */
export async function loadSettings() {
  try {
    const stored = await withTransaction(["settings"], "readonly", (stores) =>
      stores.settings.get(SETTINGS_KEY),
    );
    if (stored && typeof stored === "object") {
      // Merge over defaults so new fields keep working after upgrades;
      // drop the retired provider fields from older installs.
      const defaults = emptySettings();
      const merged = { ...defaults, ...stored };
      for (const legacy of ["geminiApiKey", "cloudflareApiToken", "cloudflareAccountId"]) {
        delete merged[legacy];
      }
      return merged;
    }
    return emptySettings();
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
  return merged;
}
