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
  currentView = view;
  setState({ view });
  const subtitle = { month: "Month", week: "Week", day: "Day", settings: "Config" }[view];
  const subtitleEl = document.getElementById("header-subtitle");
  if (subtitleEl) subtitleEl.textContent = subtitle;
  const fab = document.getElementById("btn-fab");
  if (fab) fab.hidden = view === "settings";
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

/** Wire static chrome listeners. Called once from main.js. */
export function initRouter() {
  document.querySelector(".bottom-nav")?.addEventListener("click", (event) => {
    const item = event.target.closest(".bottom-nav__item");
    if (item instanceof HTMLElement) navigate(item.dataset.view);
  });
  const settingsBtn = document.getElementById("btn-settings");
  settingsBtn?.addEventListener("click", () => navigate("settings"));
}
