/**
 * Settings screen. Key + reveal toggle, preferences (week start,
 * default duration, time format), auto-art toggle, archive buttons
 * (handlers land in milestone 9), storage estimate, and a guarded
 * factory reset.
 */

import { getState, setState, subscribe } from "../state.js";
import { saveSettings, loadSettings } from "../data/settings.js";
import { deleteAllEvents } from "../data/events.js";
import { deleteAllImages } from "../data/images.js";
import { openSheet, renderSheetHead } from "./sheet.js";
import { showToast } from "./toast.js";

/** @returns {HTMLElement} */
export function mountSettingsView() {
  const root = document.createElement("div");
  root.className = "settings-view";

  const heading = document.createElement("div");
  heading.className = "settings-heading";
  const h2 = document.createElement("h2");
  h2.className = "settings-heading__title";
  h2.textContent = "SYSTEM SETTINGS";
  const sub = document.createElement("span");
  sub.className = "settings-heading__sub";
  sub.textContent = "CHRONO.EXE // CONFIG_INTERFACE";
  heading.append(h2, sub);

  const apiCard = sectionCard("// API_CONFIG //", apiSection);
  const prefCard = sectionCard("// PREFERENCES //", preferencesSection);
  const artCard = sectionCard("// AUTO_ART //", artSection);
  const archiveCard = sectionCard("// ARCHIVE & PORTABILITY //", archiveSection);
  const dangerCard = sectionCard("// DANGER_ZONE //", dangerSection);
  apiCard.classList.add("raised-plate");
  prefCard.classList.add("raised-plate");
  artCard.classList.add("raised-plate");
  archiveCard.classList.add("raised-plate");
  dangerCard.classList.add("raised-plate");

  root.append(heading, apiCard, prefCard, artCard, archiveCard, dangerCard, footer());
  return root;
}

/** @param {string} title @param {() => HTMLElement} build */
function sectionCard(title, build) {
  const card = document.createElement("section");
  card.className = "settings-card";
  const label = document.createElement("span");
  label.className = "form-label";
  label.textContent = title;
  card.append(label, build());
  return card;
}

/** API key row with reveal toggle. */
function apiSection() {
  const row = document.createElement("div");
  row.className = "settings-row";

  const input = document.createElement("input");
  input.type = "password";
  input.className = "settings-key-input";
  input.placeholder = "AIza…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Gemini API key");
  input.addEventListener("change", async () => {
    await saveSettings({ geminiApiKey: input.value.trim() || null });
    showToast({ message: input.value.trim() ? "API key saved." : "API key cleared." });
  });

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "btn settings-key-reveal";
  reveal.setAttribute("aria-pressed", "false");
  reveal.textContent = "[ REVEAL ]";
  reveal.addEventListener("click", () => {
    const shown = input.type === "password";
    input.type = shown ? "text" : "password";
    reveal.textContent = shown ? "[ HIDE ]" : "[ REVEAL ]";
    reveal.setAttribute("aria-pressed", shown ? "true" : "false");
  });

  const hint = document.createElement("p");
  hint.className = "settings-hint";
  hint.textContent =
    "Paste a Gemini API key (aistudio.google.com). Stored on device only, used for event artwork.";

  row.append(input, reveal);

  const next = document.createElement("div");
  next.className = "settings-col";
  next.append(row, hint);

  loadSettings().then((settings) => {
    input.value = settings.geminiApiKey ?? "";
  });

  return next;
}

/** Week start, default duration, time format. */
function preferencesSection() {
  const col = document.createElement("div");
  col.className = "settings-col";

  col.append(labeledRow("WEEK STARTS ON", weekStartGroup()));
  col.append(labeledRow("DEFAULT DURATION", durationGroup()));

  const military = document.createElement("button");
  military.type = "button";
  military.className = "settings-toggle-switch";
  military.setAttribute("role", "switch");
  const milLabel = document.createElement("div");
  milLabel.className = "settings-toggle-label";
  milLabel.innerHTML = ""; // avoid injection pitfalls; textContent below
  const strong = document.createElement("strong");
  strong.textContent = "24-Hour Military Time";
  const small = document.createElement("small");
  small.textContent = "Switch between 11:59 PM and 23:59";
  milLabel.append(strong, small);
  const knob = document.createElement("span");
  knob.className = "settings-toggle-knob";
  knob.textContent = "24";
  military.append(milLabel, knob);
  const syncMilitary = (/** @type {boolean} */ on) => {
    military.setAttribute("aria-checked", on ? "true" : "false");
    knob.textContent = on ? "24" : "12";
    knob.classList.toggle("is-on", on);
  };
  const { militaryTime } = getState().settings ?? { militaryTime: true };
  syncMilitary(militaryTime);
  military.addEventListener("click", async () => {
    const next = !(military.getAttribute("aria-checked") === "true");
    syncMilitary(next);
    await saveSettings({ militaryTime: next });
    setState({ settings: await loadSettings() });
  });
  col.append(military);

  return col;
}

/** Auto artwork for new events. */
function artSection() {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "settings-toggle-switch";
  toggle.setAttribute("role", "switch");
  const label = document.createElement("div");
  label.className = "settings-toggle-label";
  const strong = document.createElement("strong");
  strong.textContent = "Generate Artwork";
  const small = document.createElement("small");
  small.textContent = "New events get pending status; art lands during idle time";
  label.append(strong, small);
  const knob = document.createElement("span");
  knob.className = "settings-toggle-knob";
  toggle.append(label, knob);
  const sync = (/** @type {boolean} */ on) => {
    toggle.setAttribute("aria-checked", on ? "true" : "false");
    knob.classList.toggle("is-on", on);
  };
  sync(getState().settings?.autoArt ?? true);
  const render = () => sync(getState().settings?.autoArt ?? true);
  subscribe(render);
  toggle.addEventListener("click", async () => {
    const next = !(toggle.getAttribute("aria-checked") === "true");
    await saveSettings({ autoArt: next });
    setState({ settings: await loadSettings() });
  });
  const col = document.createElement("div");
  col.className = "settings-col";
  col.append(toggle, settingsHint("No key or toggle off: banners keep the letter placeholder. Failures retry from the event sheet."));
  return col;
}

/** Archive buttons — handlers arrive with milestone 9. */
function archiveSection() {
  const grid = document.createElement("div");
  grid.className = "settings-button-grid";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn";
  exportBtn.textContent = "[ EXPORT JSON ]";
  exportBtn.disabled = true;
  exportBtn.title = "Available in the next milestone";

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "btn";
  importBtn.textContent = "[ IMPORT JSON ]";
  importBtn.disabled = true;
  importBtn.title = "Available in the next milestone";

  grid.append(exportBtn, importBtn);
  const col = document.createElement("div");
  col.className = "settings-col";
  col.append(grid, settingsHint("Backup lives entirely on this device; nothing is uploaded."));
  storageEstimateLine().then((line) => col.append(line));
  return col;
}

/** Guarded factory reset. */
function dangerSection() {
  const warn = document.createElement("p");
  warn.className = "settings-danger-warn";
  warn.textContent =
    "CAUTION: DESTRUCTIVE ACTION — wiping the local database removes all offline schedules and images permanently.";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn btn--danger";
  reset.textContent = "[ RESET DATABASE ]";
  reset.addEventListener("click", () => confirmReset(reset));

  const col = document.createElement("div");
  col.className = "settings-col";
  col.append(warn, reset);
  return col;
}

/**
 * @param {HTMLButtonElement} resetBtn
 */
function confirmReset(resetBtn) {
  const { body, close } = openSheet({ label: "Factory reset" });
  renderSheetHead(body, "SYS.WIPE", close);
  const warn = document.createElement("p");
  warn.className = "scope-warn";
  warn.textContent =
    "Wipe all local events and purge local database state? This cannot be undone.";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn btn--danger scope-btn";
  yes.textContent = "[ WIPE EVERYTHING ]";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn scope-btn";
  no.textContent = "[ CANCEL ]";
  yes.addEventListener("click", async () => {
    close();
    await resetDatabase(resetBtn);
  });
  no.addEventListener("click", close);
  body.append(warn, yes, no);
}

/** @param {HTMLButtonElement} resetBtn */
async function resetDatabase(resetBtn) {
  resetBtn.disabled = true;
  try {
    await deleteAllEvents();
    await deleteAllImages();
    await saveSettings({});
    const toast = showToast;
    toast({ message: "Database wiped.", subtext: "Local data cleared" });
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    console.error("reset failed", error);
    showToast({ message: "Reset failed — see console", isError: true });
    resetBtn.disabled = false;
  }
}

/**
 * @param {string} label
 * @param {HTMLElement} group
 * @returns {HTMLElement}
 */
function labeledRow(label, group) {
  const wrap = document.createElement("div");
  wrap.className = "settings-col";
  const span = document.createElement("span");
  span.className = "form-label";
  span.textContent = label;
  wrap.append(span, group);
  return wrap;
}

/** SUN/MON week start segment bound to settings + state. */
function weekStartGroup() {
  const row = document.createElement("div");
  row.className = "segmented";
  const sync = (/** @type {0|1} */ val) => {
    for (const btn of row.querySelectorAll(".segmented__option")) {
      const active = btn instanceof HTMLElement && btn.dataset.start === (val === 0 ? "sun" : "mon");
      if (btn instanceof HTMLElement) {
        btn.classList.toggle("is-selected", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
  };
  for (const [key, label] of [["sun", "SUN"], ["mon", "MON"]]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "segmented__option";
    btn.dataset.start = key;
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      await saveSettings({ weekStartsOn: key === "sun" ? 0 : 1 });
      setState({ weekStartsOn: key === "sun" ? 0 : 1 });
      sync(key === "sun" ? 0 : 1);
    });
    row.append(btn);
  }
  const value = getState().weekStartsOn;
  sync(value);
  subscribe(() => sync(getState().weekStartsOn));
  return row;
}

/** 30/60/90 default duration segment. */
function durationGroup() {
  const row = document.createElement("div");
  row.className = "segmented";
  for (const value of [30, 60, 90]) {
    const btn = /** @type {HTMLButtonElement} */ (document.createElement("button"));
    btn.type = "button";
    btn.className = "segmented__option";
    btn.dataset.duration = String(value);
    btn.textContent = `${value}m`;
    btn.addEventListener("click", async () => {
      await saveSettings({ defaultDurationMin: /** @type {30|60|90} */ (value) });
      setState({ settings: await loadSettings() });
    });
    row.append(btn);
  }
  const sync = () => {
    const current = getState().settings?.defaultDurationMin ?? 60;
    for (const btn of row.querySelectorAll(".segmented__option")) {
      if (btn instanceof HTMLElement) {
        const active = btn.dataset.duration === String(current);
        btn.classList.toggle("is-selected", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
  };
  sync();
  subscribe(sync);
  return row;
}

/** @param {string} text */
function settingsHint(text) {
  const p = document.createElement("p");
  p.className = "settings-hint";
  p.textContent = text;
  return p;
}

/** Async estimate -> line element appended by the caller. */
async function storageEstimateLine() {
  const line = document.createElement("p");
  line.className = "settings-hint settings-storage";
  let text = "STORAGE: unknown";
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage != null) {
      text = `STORAGE: ${Math.round(estimate.usage / 1024)} KB USED`;
    }
  } catch {
    /* keep the unknown line */
  }
  line.textContent = text;
  return line;
}

function footer() {
  const wrap = document.createElement("div");
  wrap.className = "settings-footer";
  const line1 = document.createElement("div");
  line1.className = "settings-footer__build";
  line1.textContent = "CHRONO CALENDAR v1.0 (MILESTONE 8)";
  const line2 = document.createElement("span");
  line2.className = "settings-footer__station";
  line2.textContent = "STATION-ID: LOCAL_DEVICE // ZERO TELEMETRY";
  wrap.append(line1, line2);
  return wrap;
}
