/**
 * Month/year picker sheet: year grid with paging, month grid, confirm,
 * "jump to today" and an exact jump-to-date row.
 */

import { setState } from "../state.js";
import { dateKey, todayKey } from "../lib/dates.js";
import { openSheet, renderSheetHead } from "./sheet.js";

/**
 * Open the picker sheet. Focus moves in on open and returns on close.
 * @param {() => void} [onClose]
 * @returns {() => void} a close() handle
 */
export function openPickerSheet(onClose) {
  const today = todayKey();
  /** Picked state; defaults to the current month. */
  const picked = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  /** @type {number} */
  let pageYear = picked.year;

  const { sheet, body, close } = openSheet({ label: "Select period", onClose });
  renderSheetHead(body, "SELECT PERIOD", close);
  body.insertAdjacentHTML(
    "beforeend",
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
      '<button type="button" class="btn btn--primary btn--wide" data-confirm>[ CONFIRM SELECTION ]</button>',
  );
  sheet.querySelector("[data-year-prev]").innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.5 8.5 12 15 18.5l-1.4 1.4L5.7 12l7.9-7.9L15 5.5Z"/></svg>';
  sheet.querySelector("[data-year-next]").innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5 15.5 12 9 5.5l1.4-1.4L18.3 12l-7.9 7.9L9 18.5Z"/></svg>';

  const yearGrid = /** @type {HTMLElement} */ (sheet.querySelector("[data-year-grid]"));
  const monthGridEl = /** @type {HTMLElement} */ (sheet.querySelector("[data-month-grid]"));
  const yearLabel = /** @type {HTMLElement} */ (sheet.querySelector("[data-year-label]"));

  function render() {
    yearLabel.textContent = String(pageYear);
    yearGrid.replaceChildren();
    const base = pageYear - 2;
    for (let i = 0; i < 6; i += 1) {
      const year = base + i;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "year-grid__cell" + (year === picked.year ? " is-selected" : "");
      btn.textContent = String(year);
      btn.setAttribute("aria-pressed", year === picked.year ? "true" : "false");
      btn.addEventListener("click", () => {
        picked.year = year;
        pageYear = year;
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

  sheet.querySelector("[data-jump-today]").addEventListener("click", () => {
    setState({ cursor: today, selectedDay: today });
    close();
  });

  sheet.querySelector("[data-jump-date]").addEventListener("click", () => {
    const input = /** @type {HTMLInputElement} */ (sheet.querySelector("#jump-date"));
    const value = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : null;
    if (value) {
      setState({ cursor: value, selectedDay: value });
      close();
    }
  });

  sheet.querySelector("[data-confirm]").addEventListener("click", () => {
    setState({ cursor: dateKey(picked.year, picked.month, 1), selectedDay: dateKey(picked.year, picked.month, 1) });
    close();
  });

  render();
  return close;
}
