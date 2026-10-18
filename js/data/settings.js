/**
 * Settings stored as the single key "app" in the settings store.
 * Never log or export geminiApiKey.
 */

import { withTransaction } from "./db.js";
import { userTimeZone } from "../lib/timezones.js";

/** @typedef {{geminiApiKey: string|null, imageModel: string, weekStartsOn: 0|1, lastView: "month"|"week"|"day", defaultDurationMin: 30|60|90, militaryTime: boolean, autoArt: boolean}|null} Settings */

const SETTINGS_KEY = "app";

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
    geminiApiKey: null,
    imageModel: null,
    weekStartsOn: defaultWeekStartsOn(),
    lastView: "month",
    // Implicit event end, day-view card sizing and display slicing.
    defaultDurationMin: 60,
    // hh:mm vs 11:59 pm (time is always imported/stored as "HH:mm").
    militaryTime: true,
    // Generate Gemini artwork for new events automatically.
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
      // Merge over defaults so new fields keep working after upgrades.
      const defaults = emptySettings();
      return { ...defaults, ...stored };
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
  if ("geminiApiKey" in merged) {
    if (typeof merged.geminiApiKey !== "string" || merged.geminiApiKey === "") {
      merged.geminiApiKey = null;
    } else {
      merged.geminiApiKey = String(merged.geminiApiKey);
    }
  }
  await withTransaction(["settings"], "readwrite", (stores) =>
    stores.settings.put(merged, SETTINGS_KEY),
  );
  return merged;
}
