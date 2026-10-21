/**
 * Username input pipeline: validation, issue labels, and suggestion
 * slugs. Pure logic — no DOM, no storage.
 */

import {
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_PATTERN,
  RESERVED_USERNAMES,
} from "../config.js";

/** @typedef {"available"|"taken"|"checking"|"invalid"} UsernameStatus */

/**
 * True when the input is a claimable username shape (see the Firestore
 * rule: ^[a-z0-9_]{3,20}$, not reserved).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUsernameValid(value) {
  if (typeof value !== "string") return false;
  return (
    new RegExp(USERNAME_PATTERN).test(value) && !RESERVED_USERNAMES.includes(value)
  );
}

/**
 * Why an input cannot be claimed, or null when it is claimable.
 * @param {unknown} value
 * @returns {"empty"|"short"|"long"|"characters"|"reserved"|null}
 */
export function usernameIssue(value) {
  if (typeof value !== "string" || value === "") return "empty";
  if (value.length < USERNAME_MIN) return "short";
  if (value.length > USERNAME_MAX) return "long";
  if (!/^[a-z0-9_]+$/.test(value)) return "characters";
  if (RESERVED_USERNAMES.includes(value)) return "reserved";
  return null;
}

/** Human line for each issue (kept here so UI modules stay dumb). */
export const USERNAME_ISSUES = {
  empty: "",
  short: "At least 3 characters",
  long: "20 characters max",
  characters: "Lowercase letters, numbers and _ only",
  reserved: "That name is reserved",
};

/**
 * Slugify a display name into a username-shaped suggestion: ascii
 * letters/digits downcase to [a-z0-9_], spaces become _, the rest is
 * dropped; trimmed to the pattern with a numeric suffix if empty/short.
 * Never returns an invalid username (the input may not be sluggable, so
 * the result is forced into shape).
 * @param {string} source display name or similar free text
 * @returns {string}
 */
export function slugUsername(source) {
  const slug =
    source
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, " ")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "";
  const shaped = slug
    .slice(0, USERNAME_MAX)
    .replace(/_+$/g, "")
    .replace(/[^a-z0-9_]/g, "");
  if (shaped.length >= USERNAME_MIN && !RESERVED_USERNAMES.includes(shaped)) {
    return shaped;
  }
  return withSuffix(shaped);
}

/**
 * Pad/retry a too-short or reserved slug with a numeric suffix ("i2" ->
 * "i2_1"; reserved or empty slugs get "user" + a number). Never returns a
 * reserved word.
 * @param {string} shaped
 * @returns {string}
 */
function withSuffix(shaped) {
  const base = shaped.length >= USERNAME_MIN ? shaped : "user";
  for (let n = 1; n <= 999; n += 1) {
    let padded = `${base}_${n}`.slice(0, USERNAME_MAX);
    while (padded.length < USERNAME_MIN) {
      padded += "_";
    }
    if (!RESERVED_USERNAMES.includes(padded)) {
      return padded;
    }
  }
  return "user_999_".slice(0, USERNAME_MAX);
}
