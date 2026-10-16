import { initRouter, navigate, registerView, onAfterSwitch } from "./router.js";
import { setState, getState } from "./state.js";
import { mountControlDeck, shiftPeriod } from "./ui/header.js";
import { mountMonthView } from "./ui/monthView.js";
import { mountWeekView } from "./ui/weekView.js";
import { mountDayView } from "./ui/dayView.js";
import { openPickerSheet } from "./ui/picker.js";
import { attachSwipe } from "./ui/gestures.js";
import { openEventForm } from "./ui/eventSheet.js";
import { loadSettings, emptySettings, saveSettings } from "./data/settings.js";
import { listEvents } from "./data/events.js";
import { requestPersistentStorage } from "./data/db.js";
import { todayKey } from "./lib/dates.js";

/**
 * Entry point: boot storage, mount shared chrome and the last-used view.
 * Milestone 4 ships the month view; week/day render until-then
 * placeholders (replaced in milestone 6).
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

async function main() {
  requestPersistentStorage();

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
      onSwitch: (view) => navigate(view),
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
    cursor: todayKey(),
    selectedDay: todayKey(),
  });

  registerView("month", renderMonth);
  registerView("week", renderWeek);
  registerView("day", renderDay);
  registerView("settings", renderSettings);
  onAfterSwitch(rememberLastView);

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

/**
 * @param {string} message
 */
function renderComingSoon(message) {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = false;
  contentHost.replaceChildren(placeholderBox("Coming soon", message));
}

function renderSettings() {
  if (!contentHost || !deckHost) return;
  deckHost.hidden = true;
  contentHost.replaceChildren(
    placeholderBox("Config", "The settings screen arrives in milestone 8."),
  );
}

/**
 * @param {string} title @param {string} body
 * @returns {HTMLElement}
 */
function placeholderBox(title, body) {
  const box = document.createElement("section");
  box.className = "placeholder-view raised-plate";
  const h2 = document.createElement("h2");
  h2.className = "placeholder-view__title";
  h2.textContent = title;
  const p = document.createElement("p");
  p.className = "placeholder-view__body";
  p.textContent = body;
  box.append(h2, p);
  return box;
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
