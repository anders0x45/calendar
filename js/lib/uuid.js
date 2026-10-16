/**
 * Small RFC 4122 v4 UUID helper using Web Crypto.
 * Pure, no DOM dependency; Node's crypto.webcrypto matches the API.
 * @returns {string}
 */
export function uuidV4() {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new Error("crypto.randomUUID is unavailable in this environment");
  }
  return crypto.randomUUID();
}
