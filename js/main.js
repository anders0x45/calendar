import { initRouter, navigate, registerView, onAfterSwitch } from "./router.js";
import { setState, getState } from "./state.js";
import { mountControlDeck, shiftPeriod } from "./ui/header.js";
import { mountMonthView } from "./ui/monthView.js";
import { mountWeekView } from "./ui/weekView.js";
import { mountDayView } from "./ui/dayView.js";
import { mountSettingsView } from "./ui/settingsView.js";
import { startImageJobs } from "./ui/imageJobs.js";
import { openPickerSheet } from "./ui/picker.js";
import { attachSwipe } from "./ui/gestures.js";
import { openEventForm } from "./ui/eventSheet.js";
import { loadSettings, emptySettings, saveSettings, readCloudSettings, dropCloudSettings } from "./data/settings.js";
import { listEvents } from "./data/events.js";
import { setBackend } from "./data/backend.js";
import { requestPersistentStorage } from "./data/db.js";
import { initSession } from "./data/accounts.js";
import { mountSignIn } from "./ui/signin.js";
import { mountOnboarding } from "./ui/onboarding.js";
import { todayKey } from "./lib/dates.js";
import { registerServiceWorker } from "./ui/serviceWorker.js";

/**
 * Entry point: resolve the account session first, then either run the
 * auth screens (sign-in / blocking username onboarding) or boot storage
 * and mount shared chrome plus the last-used view.
 */

/** @type {HTMLElement|null} */
let deckHost = null;
/** @type {HTMLElement|null} */
let contentHost = null;
/** @type {import("./ui/monthView.js").ReturnType<typeof mountMonthView> | null} */
let monthViewEl = null;
/** @type {import("./ui/weekView.js").ReturnType<typeof mountWeekView> | null} */
let weekViewEl = null;
/** @type {import("./ui/dayView.js").ReturnType<typeof mountDayView> | null} */
let dayViewEl = null;
/** @type {import("./ui/settingsView.js").ReturnType<typeof mountSettingsView> | null} */
let settingsViewEl = null;

async function main() {
  requestPersistentStorage();
  registerServiceWorker();

  const root = document.getElementById("view-root");
  if (!root) return;

  const session = await initSession();
  switch (session.status) {
    case "unconfigured":
      // Placeholder SDK credentials: still fully local, shown clearly.
      showAuthChrome();
      root.replaceChildren(
        mountSignIn({ localOnly: true }, () => {
          hideAuthChrome();
          bootCalendar();
        }),
      );
      return;
    case "signed-out":
      showAuthChrome();
      root.replaceChildren(
        mountSignIn({ error: session.error ?? null }, () => {}),
      );
      return;
    case "onboarding":
      showAuthChrome();
      root.replaceChildren(
        mountOnboarding(session.user, (account) => {
          setState({ account });
          hideAuthChrome();
          bootCalendar();
        }),
      );
      return;
    default:
      break;
  }

  if (session.status === "ready") {
    setState({ account: session.account });
  }

  // The events store may be cloud-backed when signed in with a claimed
  // calendar; it stays local-only otherwise. Both paths share this boot.
  const account = getState().account;
  if (account) {
    const cloud = await readCloudSettings(account.uid).catch((error) => {
      console.error("boot: cloud settings unavailable", error);
      return null;
    });
    if (typeof cloud?.activeCalendarId === "string") {
      // Cloud-backed events for the claimed default calendar.
      setBackend({ mode: "cloud", uid: account.uid, calendarId: cloud.activeCalendarId });
      bootCalendar();
      return;
    }
    // Signed in but the claim batch never completed (tab closed mid-
    // onboarding): re-enter the blocking onboarding with stored profile.
    showAuthChrome();
    root.replaceChildren(
      mountOnboarding(account, () => {
        hideAuthChrome();
        main().catch((error) => console.error("re-entry boot failed", error));
      }),
    );
    return;
  }
  dropCloudSettings();
  bootCalendar();
}

/**
 * Swap the header action area for the sign-in affordance and hide
 * calendar chrome while an auth screen owns the viewport.
 */
function showAuthChrome() {
  document.body.classList.add("is-auth");
  const fab = document.getElementById("btn-fab");
  if (fab) fab.hidden = true;
}

/** Restore the normal calendar chrome after auth resolves. */
function hideAuthChrome() {
  document.body.classList.remove("is-auth");
  const fab = document.getElementById("btn-fab");
  if (fab) fab.hidden = false;
}

/** The classic boot: storage load, deck, views, router. */
async function bootCalendar() {

  const root = document.getElementById("view-root");
  const fab = document.getElementById("btn-fab");
  if (!root) return;

  deckHost = document.createElement("div");
  deckHost.id = "control-deck";
  contentHost = document.createElement("div");
  contentHost.id = "view-content";
  root.replaceChildren(deckHost, contentHost);

  deckHost.replaceChildren(
    mountControlDeck({
      onOpenPicker: () => openPickerSheet(() => {}),
      onPrev: () => shiftPeriod(-1),
      onNext: () => shiftPeriod(1),
    }),
  );

  attachSwipe(root, {
    onPrev: () => shiftPeriod(-1),
    onNext: () => shiftPeriod(1),
  });

  if (fab) {
    fab.addEventListener("click", () => {
      openEventForm({ defaultDate: getState().selectedDay ?? getState().cursor });
    });
  }

  const settings = await loadSettings();
  let events = [];
  try {
    events = await listEvents();
  } catch (error) {
    console.error("boot: event load failed, starting empty", error);
  }
  setState({
    weekStartsOn: settings.weekStartsOn,
    events,
    settings,
    cursor: todayKey(),
    selectedDay: todayKey(),
  });

  registerView("month", renderMonth);
  registerView("week", renderWeek);
  registerView("day", renderDay);
  registerView("settings", renderSettings);
  onAfterSwitch(rememberLastView);

  startImageJobs();
  initRouter();
  navigate(settings.lastView);
}

/** @returns {"month"|"week"|"day"} current view constrained to switchable ones */
function navigableView() {
  const { view } = getState();
  return view === "month" || view === "week" || view === "day" ? view : "month";
}

function renderMonth() {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = false;
  if (!monthViewEl) monthViewEl = mountMonthView();
  contentHost.replaceChildren(monthViewEl);
}

function renderWeek() {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = false;
  if (!weekViewEl) weekViewEl = mountWeekView();
  contentHost.replaceChildren(weekViewEl);
}

function renderDay() {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = false;
  if (!dayViewEl) dayViewEl = mountDayView();
  contentHost.replaceChildren(dayViewEl);
}

function renderSettings() {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = true;
  if (!settingsViewEl) settingsViewEl = mountSettingsView();
  contentHost.replaceChildren(settingsViewEl);
}

/**
 * Persist the last-used calendar view (settings screen is excluded).
 * @param {"month"|"week"|"day"|"settings"} view
 */
function rememberLastView(view) {
  if (view === "settings") return;
  saveSettings({ lastView: view }).catch((error) => {
    console.error("could not persist last view", error);
  });
}

main();
