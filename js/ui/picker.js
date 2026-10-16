/**
 * Month/year picker as a bottom sheet: year grid with paging, month
 * grid, confirm button, "jump to today" and an exact jump-to-date row.
 * Sheet is created per open; focus moves in on open and returns on close.
 */

import { setState } from "../state.js";
import { dateKey, todayKey } from "../lib/dates.js";

/**
 * Open the picker sheet.
 * @param {() => void} onClose called after the sheet is removed
 * @returns {() => void} a close() handle
 */
export function openPickerSheet(onClose) {
  const today = todayKey();
  /** Picked state; month/year default to the current month. */
  const picked = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Select period");

  sheet.innerHTML =
    '<div class="sheet__grip"></div>' +
    '<div class="sheet__head">' +
    '<h2 class="sheet__title">SELECT PERIOD</h2>' +
    '<button type="button" class="icon-btn" data-close aria-label="Close picker"></button>' +
    "</div>" +
    '<div class="year-row">' +
    '<button type="button" class="icon-btn icon-btn--raised" data-year-prev aria-label="Earlier years"></button>' +
    '<span class="year-row__label" data-year-label></span>' +
    '<button type="button" class="icon-btn icon-btn--raised" data-year-next aria-label="Later years"></button>' +
    "</div>" +
    '<div class="year-grid" data-year-grid></div>' +
    '<div class="month-grid-picker" data-month-grid></div>' +
    '<button type="button" class="btn btn--wide" data-jump-today>[ JUMP TO TODAY ]</button>' +
    '<div class="jumprow">' +
    '<label class="jumprow__label" for="jump-date">JUMP TO DATE</label>' +
    '<input type="date" id="jump-date" class="jumprow__input" />' +
    '<button type="button" class="btn" data-jump-date>GO</button>' +
    "</div>" +
    '<button type="button" class="btn btn--primary btn--wide" data-confirm>[ CONFIRM SELECTION ]</button>';

  closeBtn(sheet).innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"/></svg>';
  sheet.querySelector("[data-year-prev]").innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.5 8.5 12 15 18.5l-1.4 1.4L5.7 12l7.9-7.9L15 5.5Z"/></svg>';
  sheet.querySelector("[data-year-next]").innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5 15.5 12 9 5.5l1.4-1.4L18.3 12l-7.9 7.9L9 18.5Z"/></svg>';

  backdrop.append(sheet);
  document.body.append(backdrop);

  /** @type {HTMLElement|null} */
  let opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const yearGrid = /** @type {HTMLElement} */ (sheet.querySelector("[data-year-grid]"));
  const monthGridEl = /** @type {HTMLElement} */ (sheet.querySelector("[data-month-grid]"));
  const yearLabel = /** @type {HTMLElement} */ (sheet.querySelector("[data-year-label]"));

  /** @type {number} */
  let pageYear = picked.year;

  function render() {
    yearLabel.textContent = String(pageYear);
    yearGrid.replaceChildren();
    const base = pageYear - 2;
    for (let i = 0; i < 6; i += 1) {
      const y = base + i;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "year-grid__cell" + (y === picked.year ? " is-selected" : "");
      btn.textContent = String(y);
      btn.setAttribute("aria-pressed", y === picked.year ? "true" : "false");
      btn.addEventListener("click", () => {
        picked.year = y;
        pageYear = y;
        render();
      });
      yearGrid.append(btn);
    }
    monthGridEl.replaceChildren();
    for (let m = 1; m <= 12; m += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "month-picker__cell" + (m === picked.month ? " is-selected" : "");
      btn.textContent = new Intl.DateTimeFormat(undefined, { month: "short" })
        .format(new Date(2026, m - 1, 1))
        .toUpperCase();
      btn.setAttribute("aria-pressed", m === picked.month ? "true" : "false");
      btn.addEventListener("click", () => {
        picked.month = m;
        render();
      });
      monthGridEl.append(btn);
    }
  }

  sheet.querySelector("[data-year-prev]").addEventListener("click", () => {
    pageYear -= 6;
    render();
  });
  sheet.querySelector("[data-year-next]").addEventListener("click", () => {
    pageYear += 6;
    render();
  });

  function triggerClose() {
    backdrop.remove();
    document.removeEventListener("keydown", onKeydown);
    onClose();
    opener?.focus();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      triggerClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = /** @type {HTMLElement[]} */ (
      Array.from(sheet.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])")).filter(
        (el) => !/** @type {HTMLElement} */ (el).disabled && /** @type {HTMLElement} */ (el).offsetParent !== null,
      )
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onKeydown);

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) triggerClose();
  });

  sheet.querySelector("[data-close]").addEventListener("click", triggerClose);

  sheet.querySelector("[data-jump-today]").addEventListener("click", () => {
    setState({ cursor: today, selectedDay: today });
    triggerClose();
  });

  sheet.querySelector("[data-jump-date]").addEventListener("click", () => {
    const input = /** @type {HTMLInputElement} */ (sheet.querySelector("#jump-date"));
    const value = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : null;
    if (value) {
      setState({ cursor: value, selectedDay: value });
      triggerClose();
    }
  });

  sheet.querySelector("[data-confirm]").addEventListener("click", () => {
    const key = dateKey(picked.year, picked.month, 1);
    setState({ cursor: key, selectedDay: key });
    triggerClose();
  });

  render();
  // Move focus in on open.
  const closeBtnEl = /** @type {HTMLElement} */ (sheet.querySelector("[data-close]"));
  closeBtnEl.focus();

  return triggerClose;
}

/** @param {HTMLElement} sheet @returns {HTMLElement|null} */
function closeBtn(sheet) {
  return /** @type {HTMLElement|null} */ (sheet.querySelector("[data-close]"));
}
