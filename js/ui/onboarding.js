/**
 * Blocking username onboarding: shown after first sign-in (or after a
 * sign-in from an account that never claimed a username). A suggestion
 * chip from the Google display name, a live availability line, and a
 * continue button that runs the atomic profile+claim+calendar batch.
 * There is no skip: the app requires an owned calendar to function.
 */

import { completeOnboarding, checkUsername } from "../data/accounts.js";
import { slugUsername, usernameIssue, USERNAME_ISSUES } from "../lib/usernames.js";
import { USERNAME_CHECK_DEBOUNCE_MS } from "../config.js";

/**
 * Mount the onboarding screen.
 * @param {import("../data/accounts.js").SessionUser} user
 * @param {(account: import("../data/accounts.js").Account) => void} onDone
 * @returns {HTMLElement}
 */
export function mountOnboarding(user, onDone) {
  const root = document.createElement("div");
  root.className = "auth-screen";

  const card = document.createElement("div");
  card.className = "auth-card";

  const word = document.createElement("h1");
  word.className = "auth-card__word";
  word.textContent = "PICK YOUR HANDLE";

  const tagline = document.createElement("p");
  tagline.className = "auth-card__tagline";
  tagline.textContent =
    "INVITES AND SHARED CALENDARS ADDRESS YOU BY THIS NAME.";

  card.append(word, tagline);

  /** @type {"idle"|"checking"|"available"|"taken"|"invalid"|null} */
  let status = "idle";
  /** @type {string} */
  let value = "";
  /** @type {number|undefined} */
  let debounceTimer;

  const suggestion = slugUsername(user.displayName || "");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn auth-card__btn btn--primary";
  button.textContent = "[ CLAIM HANDLE ]";
  button.disabled = true;

  if (suggestion) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "auth-card__chip";
    chip.setAttribute("aria-label", `Use suggestion ${suggestion}`);
    chip.textContent = `@${suggestion}`;
    chip.addEventListener("click", () => {
      input.value = suggestion;
      input.dispatchEvent(new Event("input"));
    });
    card.append(chip);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "auth-card__input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "username";
  input.maxLength = 20;
  input.setAttribute("aria-label", "Username");
  input.setAttribute("autocapitalize", "none");
  input.addEventListener("input", () => {
    value = input.value.toLowerCase();
    if (input.value !== value) input.value = value;
    window.clearTimeout(debounceTimer);
    status = "checking";
    render("Checking availability…");
    debounceTimer = window.setTimeout(async () => {
      if (input.value !== value) return; // stale timer for an older input
      status = await probe(value);
      render();
    }, USERNAME_CHECK_DEBOUNCE_MS);
  });

  const statusLine = document.createElement("p");
  statusLine.className = "auth-card__status";
  statusLine.setAttribute("aria-live", "polite");

  const hint = document.createElement("p");
  hint.className = "auth-card__footnote";
  hint.textContent = "3-20 CHARACTERS // LOWERCASE LETTERS, DIGITS AND _";

  card.append(input, statusLine, button, hint);

  const busy = document.createElement("p");
  busy.className = "auth-card__tagline";
  busy.setAttribute("role", "status");

  root.append(card);

  button.addEventListener("click", () => runClaim());

  /**
   * Map the current input to a final status (checking stays pending).
   * @param {string} candidate
   * @returns {Promise<"idle"|"checking"|"available"|"taken"|"invalid">}
   */
  async function probe(candidate) {
    const issue = usernameIssue(candidate);
    if (issue != null) return "invalid";
    return await checkUsername(candidate);
  }

  /** @param {string} [message] */
  function render(message) {
    let text = "";
    let ok = false;
    switch (status) {
      case "available":
        text = "@handle available";
        ok = true;
        break;
      case "taken":
        text = "Taken — pick another";
        break;
      case "invalid": {
        const issue = usernameIssue(value);
        text = issue ? USERNAME_ISSUES[issue] : "";
        break;
      }
      case "checking":
        text = message ?? "Checking availability…";
        break;
      default:
        text = "";
    }
    statusLine.textContent = text;
    statusLine.classList.toggle("is-ok", ok);
    statusLine.classList.toggle("is-bad", !ok && status !== "idle");
    button.disabled = !ok || busy.textContent !== "";
  }

  async function runClaim() {
    if (status !== "available") return;
    button.disabled = true;
    busy.textContent = "SETTING UP YOUR CALENDAR…";
    card.append(busy);

    const started = performance.now();
    const result = await completeOnboarding(user, value);
    busy.textContent = "";

    if (result.ok) {
      onDone({
        uid: user.uid,
        displayName: user.displayName || "There",
        email: user.email,
        photoURL: user.photoURL,
        username: value,
      });
      return;
    }
    if (result.reason === "taken-or-invalid") {
      status = "taken";
      render();
    } else {
      statusLine.textContent = "Setup failed — try again.";
    }
    // Nudge the probe so a just-claimed race re-checks promptly.
    window.setTimeout(() => {
      if (status === "taken") void probe(input.value).then(render);
    }, Math.max(0, USERNAME_CHECK_DEBOUNCE_MS - (performance.now() - started)));
  }

  render();
  return root;
}
