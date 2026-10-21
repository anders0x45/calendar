/**
 * Sign-in screen. Full-height panel for unauthenticated boots with one
 * Google button plus local-only fallback when the Firebase config is a
 * placeholder. Renders into #view-root; chrome is hidden via body class.
 */

import { beginGoogleSignIn } from "../firebase/auth.js";
import { AUTH_ERROR_MS } from "../config.js";

/**
 * Mount the sign-in screen.
 * @param {{error?: string|null, localOnly?: boolean}} options
 *   error    — message from a failed sign-in attempt the boot caught
 *   localOnly— show the "continue without account" path (placeholder
 *              SDK config) instead of Google sign-in
 * @param {() => void} onOpen when the user proceeds to the app
 * @returns {HTMLElement}
 */
export function mountSignIn({ error = null, localOnly = false }, onOpen) {
  const root = document.createElement("div");
  root.className = "auth-screen";

  const card = document.createElement("div");
  card.className = "auth-card";

  const glyph = document.createElement("img");
  glyph.src = "icons/app-icon.svg";
  glyph.alt = "";
  glyph.className = "auth-card__glyph";
  glyph.width = 64;
  glyph.height = 64;

  const word = document.createElement("h1");
  word.className = "auth-card__word";
  word.textContent = "CHRONO.EXE";

  const tagline = document.createElement("p");
  tagline.className = "auth-card__tagline";
  tagline.textContent = localOnly
    ? "LOCAL DEVICE MODE // NO ACCOUNT"
    : "SIGN IN TO SYNC AND SHARE";

  card.append(glyph, word, tagline);

  const errorLine = document.createElement("p");
  errorLine.className = "auth-card__error";
  errorLine.setAttribute("role", "alert");
  errorLine.setAttribute("aria-live", "assertive");
  if (error) errorLine.textContent = error;
  card.append(errorLine);

  const actions = document.createElement("div");
  actions.className = "auth-card__actions";

  if (localOnly) {
    const offline = document.createElement("button");
    offline.type = "button";
    offline.className = "btn auth-card__btn btn--primary";
    offline.textContent = "[ USE LOCAL DEVICE ]";
    offline.addEventListener("click", onOpen);
    actions.append(offline);
  } else {
    const google = document.createElement("button");
    google.type = "button";
    google.className = "btn auth-card__btn btn--primary";
    google.textContent = "[ CONTINUE WITH GOOGLE ]";
    google.addEventListener("click", () => {
      google.disabled = true;
      beginGoogleSignIn().catch((reason) => {
        // The redirect itself failed (config/domain); reset the button
        // and surface it — the page is NOT navigating away.
        console.error("sign-in redirect failed", reason);
        google.disabled = false;
        showError("Sign-in could not start — check connection.");
      });
    });
    actions.append(google);
  }
  card.append(actions);

  const footnote = document.createElement("p");
  footnote.className = "auth-card__footnote";
  footnote.textContent = localOnly
    ? "Connect a Firebase project to enable sync. Data stays on this device until then."
    : "Events sync through your account. Sign out from Settings to clear this device.";
  card.append(footnote);

  root.append(card);
  return root;

  /** @param {string} message */
  function showError(message) {
    errorLine.textContent = message;
    window.setTimeout(() => {
      if (errorLine.textContent === message) errorLine.textContent = "";
    }, AUTH_ERROR_MS);
  }
}
