/**
 * Shared control deck above month/week/day views: prev/next buttons, a
 * tappable title that opens the picker, Today, and the view switcher.
 * The deck owns no rendering logic; callers pass lifecycle callbacks.
 */

import { getState, setState, subscribe } from "../state.js";
import { addDays, addMonths, startOfWeek, todayKey } from "../lib/dates.js";

/** @typedef {{onSwitch: (v: "month"|"week"|"day") => void, onOpenPicker: () => void, onPrev: () => void, onNext: () => void}} DeckHooks */

const CHEVRON_PREV =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.5 8.5 12 15 18.5l-1.4 1.4L5.7 12l7.9-7.9L15 5.5Z"/></svg>';
const CHEVRON_NEXT =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5 15.5 12 9 5.5l1.4-1.4L18.3 12l-7.9 7.9L9 18.5Z"/></svg>';
const CARET =
  '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7Z"/></svg>';

/**
 * Build the deck and keep it in sync with state.
 * @param {DeckHooks} hooks
 * @returns {HTMLElement}
 */
export function mountControlDeck(hooks) {
  const root = document.createElement("div");
  root.className = "view-chrome";

  const row = document.createElement("div");
  row.className = "deck-row";

  const prev = iconButton("Previous period", CHEVRON_PREV);
  const next = iconButton("Next period", CHEVRON_NEXT);
  prev.addEventListener("click", hooks.onPrev);
  next.addEventListener("click", hooks.onNext);

  const titleBtn = document.createElement("button");
  titleBtn.type = "button";
  titleBtn.id = "btn-title";
  titleBtn.className = "deck-title";
  titleBtn.setAttribute("aria-haspopup", "dialog");
  const titleText = document.createElement("span");
  titleText.className = "deck-title__text";
  titleText.id = "deck-title-text";
  titleBtn.append(titleText);
  titleBtn.insertAdjacentHTML("beforeend", CARET);
  titleBtn.addEventListener("click", hooks.onOpenPicker);

  const today = document.createElement("button");
  today.type = "button";
  today.id = "btn-today";
  today.className = "btn deck-today";
  today.textContent = "TODAY";
  today.addEventListener("click", () => {
    setState({ cursor: todayKey(), selectedDay: todayKey() });
  });

  row.append(prev, next, titleBtn, today);

  const segmented = document.createElement("div");
  segmented.className = "segmented";
  segmented.setAttribute("role", "group");
  segmented.setAttribute("aria-label", "View");
  for (const [value, label] of [["day", "Day"], ["week", "Week"], ["month", "Month"]]) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "segmented__option";
    opt.dataset.switch = /** @type {string} */ (value);
    opt.textContent = /** @type {string} */ (label).toUpperCase();
    opt.addEventListener("click", () =>
      hooks.onSwitch(/** @type {"month"|"week"|"day"} */ (value)),
    );
    segmented.append(opt);
  }

  root.append(row, segmented);

  const refresh = () => {
    const { view, cursor } = getState();
    titleText.textContent = periodTitle(view, cursor);
    for (const opt of segmented.querySelectorAll(".segmented__option")) {
      if (opt instanceof HTMLElement) {
        opt.setAttribute("aria-pressed", opt.dataset.switch === view ? "true" : "false");
        opt.classList.toggle("is-selected", opt.dataset.switch === view);
      }
    }
  };
  subscribe(refresh);
  refresh();

  return root;
}

/** @param {string} label @param {string} svg @returns {HTMLButtonElement} */
function iconButton(label, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn icon-btn--raised";
  btn.setAttribute("aria-label", label);
  btn.innerHTML = svg;
  return btn;
}

/**
 * Title text for the current period.
 * @param {"month"|"week"|"day"|"settings"} view
 * @param {string} cursor
 * @returns {string}
 */
function periodTitle(view, cursor) {
  if (view === "month") {
    const [year, month] = cursor.split("-").map(Number);
    const label = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
      new Date(year, month - 1, 1),
    );
    return label.toUpperCase();
  }
  if (view === "week") {
    const start = startOfWeek(cursor, getState().weekStartsOn);
    const end = addDays(start, 6);
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    return `${fmt.format(toDate(start)).toUpperCase()} – ${fmt.format(toDate(end)).toUpperCase()}`;
  }
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return fmt.format(toDate(cursor)).toUpperCase();
}

/** @param {string} key @returns {Date} */
function toDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Move the cursor by one period in the current view.
 * @param {1|-1} direction
 */
export function shiftPeriod(direction) {
  const { view, cursor } = getState();
  let next = cursor;
  if (view === "month") next = addMonths(cursor, direction);
  else if (view === "week") next = addDays(cursor, 7 * direction);
  else if (view === "day") next = addDays(cursor, direction);
  else return;
  setState({ cursor: next });
}
