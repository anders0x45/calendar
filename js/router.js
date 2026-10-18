/**
 * Minimal view router for the four chrome surfaces: month, week, day,
 * settings. Views register render callbacks; the router only switches
 * which one is mounted and keeps the bottom nav in sync.
 */

import { setState } from "./state.js";

/** @type {"month"|"week"|"day"|"settings"} */
let currentView = "month";

/** @type {Record<string, () => void>} */
const renderers = {};

/** @type {(() => void) | null} */
let onSwitch = null;

/**
 * Header action button icons. The gear opens settings; on the settings
 * screen the same button renders as a back chevron leading to the last
 * calendar view.
 */
const GEAR_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/><path d="m10.6 2 .5 2.4c-.7.2-1.3.5-1.9.9L7.2 3.9 3.9 7.2l1.4 2c-.4.6-.7 1.2-.9 1.9L2 10.6v4.8l2.4.5c.2.7.5 1.3.9 1.9l-1.4 2 3.3 3.3 2-1.4c.6.4 1.2.7 1.9.9l.5 2.4h4.8l.5-2.4c.7-.2 1.3-.5 1.9-.9l2 1.4 3.3-3.3-1.4-2c.4-.6.7-1.2.9-1.9l2.4-.5v-4.8l-2.4-.5c-.2-.7-.5-1.3-.9-1.9l1.4-2-3.3-3.3-2 1.4c-.6-.4-1.2-.7-1.9-.9L16.4 2h-4.8Zm1.4 2h1l.4 2.1.9.3c.5.2 1 .4 1.4.7l.8-.5 1.8 1.8-.5.8c.3.4.5.9.7 1.4l.3.9 2.1.4v1l-2.1.4-.3.9c-.2.5-.4 1-.7 1.4l.5.8-1.8 1.8-.8-.5c-.4.3-.9.5-1.4.7l-.3.9-.4 2.1h-1l-.4-2.1-.9-.3c-.5-.2-1-.4-1.4-.7l-.8.5-1.8-1.8.5-.8c-.3-.4-.5-.9-.7-1.4l-.3-.9L4 13.4v-1l2.1-.4.3-.9c.2-.5.4-1 .7-1.4l-.5-.8 1.8-1.8.8.5c.4-.3.9-.5 1.4-.7l.3-.9.4-2.1Z"/></svg>';
const BACK_SVG =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5 2.5 12l6.5 6.5 1.4-1.4L5.3 12l5.1-5.1L9 5.5Zm7 0L9.5 12l6.5 6.5 1.4-1.4L12.3 12l5.1-5.1L16 5.5Z"/></svg>';

/** Last calendar view to return to when leaving settings. */
let lastCalendarView = "month";

/**
 * Register (or replace) the renderer for a view.
 * @param {"month"|"week"|"day"|"settings"} view
 * @param {() => void} render
 */
export function registerView(view, render) {
  renderers[view] = render;
}

/**
 * Change the active view and re-render.
 * @param {"month"|"week"|"day"|"settings"} view
 */
export function navigate(view) {
  if (!renderers[view]) {
    throw new Error(`No view registered for "${view}"`);
  }
  if (view !== "settings") lastCalendarView = view;
  currentView = view;
  setState({ view });
  const subtitle = { month: "Month", week: "Week", day: "Day", settings: "Config" }[view];
  const subtitleEl = document.getElementById("header-subtitle");
  if (subtitleEl) subtitleEl.textContent = subtitle;
  const fab = document.getElementById("btn-fab");
  if (fab) fab.hidden = view === "settings";
  syncHeaderAction(view);
  renderers[view]();
  syncBottomNav(view);
  if (onSwitch) onSwitch(view);
}

/** @returns {"month"|"week"|"day"|"settings"} */
export function currentViewName() {
  return currentView;
}

/**
 * Optional hook fired after every successful switch.
 * @param {(view: "month"|"week"|"day"|"settings") => void} fn
 */
export function onAfterSwitch(fn) {
  onSwitch = fn;
}

/** @param {"month"|"week"|"day"|"settings"} view */
function syncBottomNav(view) {
  for (const item of document.querySelectorAll(".bottom-nav__item")) {
    const isActive = item.dataset.view === view;
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  }
}

/**
 * On the settings screen the header action button becomes a back
 * chevron to the last calendar view; elsewhere it stays a gear.
 * @param {"month"|"week"|"day"|"settings"} view
 */
function syncHeaderAction(view) {
  const btn = document.getElementById("btn-settings");
  if (!(btn instanceof HTMLButtonElement)) return;
  const back = view === "settings";
  btn.innerHTML = back ? BACK_SVG : GEAR_SVG;
  btn.setAttribute("aria-label", back ? "Back to calendar" : "Open settings");
}

/** Wire static chrome listeners. Called once from main.js. */
export function initRouter() {
  document.querySelector(".bottom-nav")?.addEventListener("click", (event) => {
    const item = event.target.closest(".bottom-nav__item");
    if (item instanceof HTMLElement) navigate(item.dataset.view);
  });
  const settingsBtn = document.getElementById("btn-settings");
  settingsBtn?.addEventListener("click", () => {
    if (currentView === "settings") {
      navigate(lastCalendarView);
    } else {
      navigate("settings");
    }
  });
}
