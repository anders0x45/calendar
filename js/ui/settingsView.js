/**
 * Settings screen. Key + reveal toggle, preferences (week start,
 * default duration, time format), auto-art toggle, archive buttons
 * (handlers land in milestone 9), storage estimate, and a guarded
 * factory reset.
 */

import { getState, setState, subscribe } from "../state.js";
import { saveSettings, loadSettings } from "../data/settings.js";
import { signOutAccount } from "../data/accounts.js";
import { deleteAllEvents, saveEvent } from "../data/events.js";
import { deleteAllImages, listImages, putImages } from "../data/images.js";
import {
  createInvite,
  declineInvite,
  acceptInvite,
  getCalendarSummary,
  listIncomingInvites,
  listMyCalendars,
  switchCalendar,
  leaveCalendar,
} from "../data/sharing.js";
import { isCloud, getBackend } from "../data/backend.js";
import { isUsernameValid } from "../lib/usernames.js";
import { buildExport, decodeImages, exportFilename, parseImportPayload } from "../lib/backup.js";
import { refreshEvents } from "./refresh.js";
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
  const accountCard = sectionCard("// ACCOUNT //", accountSection);
  const prefCard = sectionCard("// PREFERENCES //", preferencesSection);
  const sharingCard = isCloud() ? sectionCard("// SHARING //", sharingSection) : null;
  const artCard = sectionCard("// AUTO_ART //", artSection);
  const archiveCard = sectionCard("// ARCHIVE & PORTABILITY //", archiveSection);
  const dangerCard = sectionCard("// DANGER_ZONE //", dangerSection);
  apiCard.classList.add("raised-plate");
  accountCard.classList.add("raised-plate");
  prefCard.classList.add("raised-plate");
  sharingCard?.classList.add("raised-plate");
  artCard.classList.add("raised-plate");
  archiveCard.classList.add("raised-plate");
  dangerCard.classList.add("raised-plate");

  const cards = [heading, apiCard, accountCard, prefCard, sharingCard, artCard, archiveCard, dangerCard, footer()].filter(
    (part) => part != null,
  );
  root.append(...cards);
  return root;
}

/**
 * Signed-in identity: avatar, name, email, @username (copy) and sign
 * out. Hidden entirely in local-device mode (no account configured).
 */
function accountSection() {
  const account = getState().account;

  const col = document.createElement("div");
  col.className = "settings-col";
  if (!account) {
    const local = document.createElement("p");
    local.className = "settings-hint";
    local.textContent = "LOCAL DEVICE MODE // NO ACCOUNT CONNECTED";
    col.append(local);
    return col;
  }

  const row = document.createElement("div");
  row.className = "account-row";

  const avatar = account.photoURL
    ? createPhotoAvatar(account.photoURL)
    : initialBadge(account.displayName.slice(0, 1) || "?");

  const meta = document.createElement("div");
  meta.className = "account-row__meta";
  const name = document.createElement("strong");
  name.textContent = account.displayName;
  const email = document.createElement("span");
  email.textContent = account.email; // own account only — safe, still textContent
  meta.append(name, email);

  row.append(avatar, meta);

  const handleRow = document.createElement("div");
  handleRow.className = "account-row__handle";
  const handle = document.createElement("span");
  handle.textContent = `@${account.username}`;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn";
  copy.textContent = "[ COPY ]";
  copy.setAttribute("aria-label", "Copy your username");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(account.username);
      showToast({ message: "Username copied." });
    } catch {
      showToast({ message: "Copy failed", isError: true });
    }
  });
  handleRow.append(handle, copy);

  const signOut = document.createElement("button");
  signOut.type = "button";
  signOut.className = "btn btn--danger";
  signOut.textContent = "[ SIGN OUT ]";
  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    showToast({ message: "Signing out…" });
    try {
      await signOutAccount(); // reloads on success
      signOut.disabled = false;
      showToast({ message: "Sign-out failed", isError: true });
    } catch (error) {
      console.error("sign out failed", error);
      signOut.disabled = false;
      showToast({ message: "Sign-out failed", isError: true });
    }
  });

  col.append(row, handleRow, signOut, settingsHint(
    "Sign-out clears this browser's synced calendar cache.",
  ));
  return col;

  /**
   * @param {string} src @returns {HTMLImageElement}
   */
  function createPhotoAvatar(src) {
    const img = document.createElement("img");
    img.className = "account-row__avatar";
    img.alt = "";
    img.width = 40;
    img.height = 40;
    img.src = src;
    img.referrerPolicy = "no-referrer";
    return img;
  }

  /** @param {string} letter @returns {HTMLElement} */
  function initialBadge(letter) {
    const span = document.createElement("span");
    span.className = "account-row__avatar account-row__avatar--initial";
    span.textContent = letter.toUpperCase();
    return span;
  }
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

/**
 * Sharing: invites by @username (owner), incoming invites with
 * accept/decline, calendar switcher and leave. This section only
 * exists under a cloud backend; async loads fill the card in place.
 */
function sharingSection() {
  const col = document.createElement("div");
  col.className = "settings-col";

  const head = document.createElement("p");
  head.className = "settings-hint";
  head.setAttribute("aria-live", "polite");
  head.textContent = "LOADING CALENDAR…";
  col.append(head);

  const inviteRow = document.createElement("div");
  inviteRow.className = "settings-row";
  const inviteInput = document.createElement("input");
  inviteInput.type = "text";
  inviteInput.className = "settings-key-input";
  inviteInput.placeholder = "@handle";
  inviteInput.autocomplete = "off";
  inviteInput.spellcheck = false;
  inviteInput.setAttribute("aria-label", "Invite a user by username");
  const inviteBtn = document.createElement("button");
  inviteBtn.type = "button";
  inviteBtn.className = "btn";
  inviteBtn.textContent = "[ INVITE ]";
  inviteRow.append(inviteInput, inviteBtn);
  inviteRow.hidden = true;

  const parts = document.createElement("div");
  parts.className = "settings-col";

  inviteBtn.addEventListener("click", async () => {
    const raw = inviteInput.value.trim().replace(/^@+/, "").toLowerCase();
    if (!isUsernameValid(raw)) {
      showToast({ message: "That handle is not valid", isError: true });
      return;
    }
    inviteBtn.disabled = true;
    const result = await createInvite(raw);
    inviteBtn.disabled = false;
    const messages = {
      unknown: "No such handle.",
      self: "That is your own handle.",
      "not-owner": "Only the calendar owner can invite.",
      taken: "They are already a member.",
      failed: "Invite failed — try again.",
    };
    if (result.ok) {
      inviteInput.value = "";
      showToast({ message: `Invite sent to @${raw}.` });
    } else {
      showToast({
        message: messages[result.reason] ?? "Invite failed",
        isError: true,
      });
    }
  });

  void loadSharingState();

  async function loadSharingState() {
    const { calendarId, uid } = getBackend();
    try {
      const calendar = await getCalendarSummary(calendarId);
      if (!calendar) {
        head.textContent = "CALENDAR UNAVAILABLE";
        head.classList.add("settings-hint--error");
        return;
      }
      head.textContent =
        `ACTIVE // ${calendar.name} · ${calendar.memberUids.length} MEMBER${calendar.memberUids.length === 1 ? "" : "S"}`;
      inviteRow.hidden = calendar.ownerUid !== uid;
      if (!inviteRow.hidden) col.insertBefore(inviteRow, parts);

      const [myCalendars, inbox] = await Promise.all([
        listMyCalendars(),
        listIncomingInvites(),
      ]);
      parts.replaceChildren(
        calendarList(myCalendars),
        inboxList(inbox),
        leaveRow(calendar),
      );
      col.append(parts);
    } catch (error) {
      console.error("sharing section load failed", error);
      head.textContent = "SHARING DATA UNAVAILABLE";
    }
  }

  /** @returns {HTMLElement} */
  function calendarList(myCalendars) {
    const label = document.createElement("span");
    label.className = "form-label";
    label.textContent = "MY CALENDARS";
    const list = document.createElement("div");
    list.className = "settings-col";
    const current = getBackend().calendarId;
    for (const candidate of myCalendars) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const name = document.createElement("span");
      const owned = candidate.ownerUid === getBackend().uid;
      name.textContent = `${candidate.id === current ? "▸ " : ""}${candidate.name}${owned ? " (owner)" : ""}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = candidate.id === current ? "[ ACTIVE ]" : "[ SWITCH ]";
      btn.disabled = candidate.id === current;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await switchCalendar(candidate.id);
          window.location.reload();
        } catch (error) {
          console.error("calendar switch failed", error);
          btn.disabled = false;
          showToast({ message: "Switch failed", isError: true });
        }
      });
      row.append(name, btn);
      list.append(row);
    }
    const wrap = document.createElement("div");
    wrap.append(label, list);
    return wrap;
  }

  /** @returns {HTMLElement} */
  function inboxList(inbox) {
    const label = document.createElement("span");
    label.className = "form-label";
    label.textContent = "INVITES";
    const list = document.createElement("div");
    list.className = "settings-col";
    if (inbox.length === 0) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = "No pending invites.";
      list.append(empty);
    }
    for (const invite of inbox) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const name = document.createElement("span");
      name.textContent = `${invite.calendarName} — via ${sliceName(invite.inviterName)}`;
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "btn btn--primary";
      yes.textContent = "[ ACCEPT ]";
      yes.addEventListener("click", async () => {
        disable([yes, noButtons.get(invite.inviteId)]);
        const result = await acceptInvite(invite);
        if (result.ok) {
          await switchCalendar(invite.calendarId);
          window.location.reload();
        } else {
          enable([yes, noButtons.get(invite.inviteId)]);
          showToast({
            message: result.reason === "gone" ? "Invite expired." : "Accept failed",
            isError: true,
          });
          void loadSharingState();
        }
      });
      const no = document.createElement("button");
      no.type = "button";
      no.className = "btn";
      no.textContent = "[ DECLINE ]";
      no.addEventListener("click", async () => {
        disable([yes, noButtons.get(invite.inviteId)]);
        try {
          await declineInvite(invite);
          void loadSharingState();
        } catch (error) {
          console.error("invite decline failed", error);
          enable([yes, noButtons.get(invite.inviteId)]);
          showToast({ message: "Decline failed", isError: true });
        }
      });
      const noButtons = new Map([[invite.inviteId, no]]);
      row.append(name, yes, no);
      list.append(row);
    }
    const wrap = document.createElement("div");
    wrap.append(label, list);
    return wrap;
  }

  /** @returns {HTMLElement|null} null when I own the active calendar */
  function leaveRow(calendar) {
    if (calendar.ownerUid === getBackend().uid) return null;
    const label = document.createElement("span");
    label.className = "form-label";
    label.textContent = "MEMBERSHIP";
    const leaveBtn = document.createElement("button");
    leaveBtn.type = "button";
    leaveBtn.className = "btn btn--danger";
    leaveBtn.textContent = "[ LEAVE CALENDAR ]";
    leaveBtn.addEventListener("click", async () => {
      leaveBtn.disabled = true;
      const mine = await listMyCalendars();
      const next = mine.find((candidate) => candidate.id !== calendar.id && candidate.ownerUid === getBackend().uid);
      if (!next) {
        leaveBtn.disabled = false;
        showToast({ message: "Keep at least one calendar you own.", isError: true });
        return;
      }
      const result = await leaveCalendar(calendar.id);
      if (result.ok) {
        await switchCalendar(next.id);
        window.location.reload();
      } else {
        leaveBtn.disabled = false;
        showToast({ message: "Leave failed", isError: true });
      }
    });
    const wrap = document.createElement("div");
    wrap.append(label, leaveBtn);
    return wrap;
  }

  col.append(parts);
  return col;

  /** @param {string} name */
  function sliceName(name) {
    return name.length > 18 ? `${name.slice(0, 17)}…` : name;
  }
  /** @param {(HTMLButtonElement|undefined|null)[]} buttons */
  function disable(buttons) {
    for (const button of buttons) if (button) button.disabled = true;
  }
  /** @param {(HTMLButtonElement|undefined|null)[]} buttons */
  function enable(buttons) {
    for (const button of buttons) if (button) button.disabled = false;
  }
}

/** Art bridge endpoint + shared secret (revealable). */
function apiSection() {
  const col = document.createElement("div");
  col.className = "settings-col";

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "settings-key-input";
  urlInput.placeholder = "https://chrono-art-bridge.<subdomain>.workers.dev";
  urlInput.autocomplete = "off";
  urlInput.spellcheck = false;
  urlInput.setAttribute("aria-label", "Art bridge URL");
  urlInput.addEventListener("change", async () => {
    await saveSettings({ artBridgeUrl: urlInput.value.trim() || null });
    setState({ settings: await loadSettings() });
    showToast({ message: urlInput.value.trim() ? "Bridge URL saved." : "Bridge URL cleared." });
  });

  const urlHint = document.createElement("p");
  urlHint.className = "settings-hint";
  urlHint.textContent =
    "Art bridge worker URL (bridge/ in the repo; see bridge/README.md). Used for event artwork.";

  const row = document.createElement("div");
  row.className = "settings-row";

  const secretInput = document.createElement("input");
  secretInput.type = "password";
  secretInput.className = "settings-key-input";
  secretInput.placeholder = "shared secret…";
  secretInput.autocomplete = "off";
  secretInput.spellcheck = false;
  secretInput.setAttribute("aria-label", "Art bridge secret");
  secretInput.addEventListener("change", async () => {
    await saveSettings({ artSecret: secretInput.value.trim() || null });
    setState({ settings: await loadSettings() });
    showToast({ message: secretInput.value.trim() ? "Secret saved." : "Secret cleared." });
  });

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "btn settings-key-reveal";
  reveal.setAttribute("aria-pressed", "false");
  reveal.textContent = "[ REVEAL ]";
  reveal.addEventListener("click", () => {
    const shown = secretInput.type === "password";
    secretInput.type = shown ? "text" : "password";
    reveal.textContent = shown ? "[ HIDE ]" : "[ REVEAL ]";
    reveal.setAttribute("aria-pressed", shown ? "true" : "false");
  });

  const secretHint = document.createElement("p");
  secretHint.className = "settings-hint";
  secretHint.textContent =
    "ART_SECRET of the bridge worker (x-art-secret header). Stored on device only.";

  row.append(secretInput, reveal);

  /** @param {string} text @returns {HTMLSpanElement} */
  const label = (text) => {
    const span = document.createElement("span");
    span.className = "form-label";
    span.textContent = text;
    return span;
  };
  col.append(
    label("ART BRIDGE URL"),
    urlInput,
    urlHint,
    label("SHARED SECRET"),
    row,
    secretHint,
  );

  loadSettings().then((settings) => {
    urlInput.value = settings.artBridgeUrl ?? "";
    secretInput.value = settings.artSecret ?? "";
  });

  return col;
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

/** Archive buttons: export writes a JSON file, import upserts events. */
function archiveSection() {
  const grid = document.createElement("div");
  grid.className = "settings-button-grid";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn";
  exportBtn.textContent = "[ EXPORT JSON ]";
  exportBtn.addEventListener("click", () => {
    runExport(exportBtn).catch((error) => {
      console.error("export failed", error);
      showToast({ message: "Export failed", isError: true });
      exportBtn.disabled = false;
    });
  });

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "btn";
  importBtn.textContent = "[ IMPORT JSON ]";
  importBtn.addEventListener("click", () => {
    void runImportFlow(importBtn);
  });

  grid.append(exportBtn, importBtn);
  const col = document.createElement("div");
  col.className = "settings-col";
  col.append(grid, settingsHint("Backup is a plain JSON file of your events and artwork; keep it somewhere safe."));
  storageEstimateLine().then((line) => col.append(line));
  return col;
}

/** Build + download the backup file. */
async function runExport(exportBtn) {
  exportBtn.disabled = true;
  const { events } = getState();
  const images = await listImages(events.map((event) => event.id));
  const envelope = await buildExport({ events, images });
  const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename();
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  exportBtn.disabled = false;
  showToast({ message: "Backup downloaded.", subtext: `${events.length} events` });
}

/**
 * File picker -> validate -> upsert events + decode/store images.
 * @param {HTMLButtonElement} importBtn
 */
async function runImportFlow(importBtn) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.setAttribute("aria-hidden", "true");
  fileInput.style.display = "none";
  document.body.append(fileInput);
  fileInput.click();
  fileInput.addEventListener("change", async () => {
    fileInput.remove();
    const file = fileInput.files?.[0];
    if (!file) return;
    importBtn.disabled = true;
    try {
      const text = await file.text();
      const parsed = parseImportPayload(text);
      if (!parsed.ok) {
        showToast({ message: `Import rejected: ${parsed.reason}`, isError: true });
        return;
      }
      await putImages(decodeImages(parsed.images));
      let imported = 0;
      for (const event of parsed.events) {
        try {
          await saveEvent(event);
          imported += 1;
        } catch (error) {
          console.error("import event failed", error);
        }
      }
      await refreshEvents();
      const skipped = parsed.skipped + (parsed.events.length - imported);
      showToast({
        message: `Imported ${imported} event${imported === 1 ? "" : "s"}.`,
        subtext: skipped > 0 ? `Skipped ${skipped} invalid` : "All records valid",
      });
    } catch (error) {
      console.error("import failed", error);
      showToast({ message: "Import failed", isError: true });
    } finally {
      importBtn.disabled = false;
    }
  });
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
  line1.textContent = "CHRONO CALENDAR v1.1 (MILESTONE 11)";
  const line2 = document.createElement("span");
  line2.className = "settings-footer__station";
  line2.textContent = "STATION-ID: LOCAL_DEVICE // ZERO TELEMETRY";
  wrap.append(line1, line2);
  return wrap;
}
