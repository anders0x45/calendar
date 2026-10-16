/**
 * Global constants. No magic numbers or strings elsewhere.
 */

/** @type {Record<string, string>} Preset event swatches (see css/tokens.css). */
export const EVENT_COLORS = {
  red: "#e5484d",
  green: "#3da35d",
  yellow: "#f2c230",
  orange: "#e2861f",
  teal: "#2ba3a0",
  blue: "#3b6fe0",
  purple: "#8b5cd6",
  pink: "#e05a9c",
};

/** Max length of an event title in characters. */
export const TITLE_MAX_LENGTH = 80;

/** Max stored image long-edge in pixels. */
export const IMAGE_MAX_DIMENSION = 512;

/** Index of the "day" chip capacity inside a month cell before "+N". */
export const MONTH_CELL_MAX_CHIPS = 2;

/** Undo toast duration in milliseconds. */
export const UNDO_TOAST_MS = 6000;

/** Default (non-undo) toast duration in milliseconds. */
export const TOAST_MS = 4500;

/** Restore point after deleting recurring events. */
export const DELETION_MODES = { ONLY: "only", ALL: "all" };

/** Gemini image generation model kept in one place for easy swapping. */
export const IMAGE_MODEL_ID = "gemini-2.0-flash-preview-image-generation";

/** Image generation REST endpoint shape (Google Generative Language API). */
export const IMAGE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Background phase used for generated illustrations. */
export const IMAGE_PROMPT_TEMPLATE =
  "A simple, charming retro illustration representing: {title}. " +
  "Single centered subject, flat colors with a subtle 3D bevel look, " +
  "plain background, no text, no letters. Square output.";

/** Request timeout for one image generation attempt, in milliseconds. */
export const IMAGE_GEN_TIMEOUT_MS = 30000;

/** Backoff before the single retry of a failed generation. */
export const IMAGE_GEN_RETRY_DELAY_MS = 2000;

/** Export envelope. */
export const EXPORT_APP_ID = "calendar";
export const EXPORT_VERSION = 1;
