/**
 * Global constants. No magic numbers or strings elsewhere.
 */

/** @type {Record<string, string>} Preset event swatches (see css/tokens.css). */
export const EVENT_COLORS = {
  red: "#d9333b",
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

/** Shared art bridge response contract lives in bridge/worker.js. */

/** Diffusion steps for flux-1-schnell (4 is the documented fast setting). */
export const IMAGE_GEN_STEPS = 4;

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

/* ---------- Accounts (Firebase phase F2) ---------- */

/** Username character pattern (client mirror of the Firestore rule). */
export const USERNAME_PATTERN = "^[a-z0-9_]{3,20}$";

/** Username length bounds in characters. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/**
 * Names no account may claim: they collide with routes, storage paths or
 * support/store surfaces users might reasonably confuse them with.
 */
export const RESERVED_USERNAMES = [
  "admin", "api", "app", "auth", "chrono", "chronoexe", "config",
  "debug", "docs", "email", "events", "firebase", "google", "help",
  "images", "index", "info", "invite", "invites", "localhost", "main",
  "me", "none", "null", "oauth", "owner", "root", "settings", "share",
  "shared", "signup", "static", "status", "store", "support", "sw",
  "system", "terms", "test", "this", "undefined", "user", "users",
  "www", "you",
];

/** Debounce for live username availability checks, in milliseconds. */
export const USERNAME_CHECK_DEBOUNCE_MS = 400;

/** How long sign-in redirect errors stay visible on the sign-in screen. */
export const AUTH_ERROR_MS = 6000;
