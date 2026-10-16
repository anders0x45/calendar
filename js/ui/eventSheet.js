/**
 * Event create/edit sheet. One form serves both modes. Validation is
 * inline; Save stays disabled while the draft is invalid. The image area
 * is a placeholder until milestone 8.
 */

import { openSheet, renderSheetHead } from "./sheet.js";
import { EVENT_COLORS, TITLE_MAX_LENGTH } from "../config.js";
import { validateEventDraft } from "../lib/validate.js";
import { makeEvent, saveEvent } from "../data/events.js";
import { userTimeZone, supportedTimeZones, isValidTimeZone } from "../lib/timezones.js";
import { todayKey } from "../lib/dates.js";
import { inkForBackground } from "../lib/color.js";
import { refreshEvents } from "./refresh.js";

/** @typedef {import("../data/events.js").Event} Event */

/**
 * @param {{existing?: Event|null, defaultDate?: string, onClose?: () => void}} [options]
 * @returns {() => void} close handle
 */
export function openEventForm({ existing = null, defaultDate, onClose } = {}) {
  const isEdit = Boolean(existing);

  const draft = isEdit
    ? {
        color: existing.color,
        allDay: !existing.time,
        repeatOn: Boolean(existing.recurrence),
      }
    : {
        color: "blue",
        allDay: false,
        repeatOn: false,
      };

  const { body, close } = openSheet({
    label: isEdit ? "Edit event" : "New event",
    fullHeight: true,
    onClose,
  });
  renderSheetHead(body, isEdit ? "EDIT EVENT" : "NEW EVENT", close);

  const titleInput = input("text", {
    id: "ev-title",
    maxLength: TITLE_MAX_LENGTH,
    placeholder: "What's happening?",
    value: existing?.title ?? "",
  });
  const titleError = errorLine();

  const swatchRow = buildSwatches(draft.color);

  const allDayToggle = input("checkbox", {}, draft.allDay);
  allDayToggle.className = "toggle";
  const timeInput = input("time", { value: existing?.time ?? "09:00" });
  const dateInput = input("date", { value: existing?.date ?? defaultDate ?? todayKey() });
  const dateError = errorLine();
  const timeError = errorLine();

  const zoneInput = input("text", {
    value: existing?.timezone ?? userTimeZone(),
    autocomplete: "off",
  });
  const zoneList = document.createElement("datalist");
  zoneList.id = "ev-zone-list";
  for (const zone of supportedTimeZones()) {
    const option = document.createElement("option");
    option.value = zone;
    zoneList.append(option);
  }
  const zoneError = errorLine();

  const locationInput = input("url", { placeholder: "https://…", value: existing?.locationLink ?? "" });
  const locationError = errorLine();

  const repeatToggle = input("checkbox", {}, draft.repeatOn);
  repeatToggle.className = "toggle";
  const freqRow = buildFreqRow(existing?.recurrence?.freq ?? "weekly");
  const intervalInput = input("number", {
    min: "1",
    max: "999",
    value: String(existing?.recurrence?.interval ?? 1),
  });
  intervalInput.setAttribute("aria-label", "Repeat every N periods");
  const intervalError = errorLine();
  const untilInput = input("date", { value: existing?.recurrence?.until ?? "" });
  untilInput.setAttribute("aria-label", "Repeat until (optional end date)");
  const untilError = errorLine();
  const summary = document.createElement("p");
  summary.className = "form-summary";

  const seriesNote =
    isEdit && existing.recurrence ? buildSeriesNote(existing.recurrence.exceptions.length) : null;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary";
  saveBtn.textContent = "SAVE";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn";
  cancelBtn.textContent = "CANCEL";
  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.append(cancelBtn, saveBtn);

  body.append(
    field("TITLE / DESIGNATION", [titleInput, titleError]),
    field("INDEX MARKER COLOR", [swatchRow]),
    toggleRow(allDayToggle, "All-Day", "Lock agenda for a 24-hour block"),
    field("DATE", [dateInput, dateError]),
    field("START TIME", [timeInput, timeError]),
    field("CHRONO-ZONE", [zoneInput, zoneList, zoneError]),
    field("LOCATION OR LINK", [locationInput, locationError]),
    toggleRow(repeatToggle, "Repeat", "Daily, weekly, monthly or yearly"),
    buildRepeatSection(),
    actions,
  );
  if (seriesNote) body.prepend(seriesNote);

  /** DOM detail helpers (kept local: one form, one set of widgets). */

  function input(type, attrs = {}, checked) {
    const el = /** @type {HTMLInputElement} */ (document.createElement("input"));
    el.type = type;
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "value") el.value = /** @type {string} */ (value);
      else el.setAttribute(key, /** @type {string} */ (value));
    }
    if (checked !== undefined) el.checked = checked;
    return el;
  }

  function field(labelText, children) {
    const block = document.createElement("div");
    block.className = "field-block raised-plate";
    const label = document.createElement("span");
    label.className = "form-label";
    label.textContent = labelText;
    block.append(label, ...children.filter(Boolean));
    return block;
  }

  function errorLine() {
    const el = document.createElement("span");
    el.className = "field-error";
    el.setAttribute("role", "alert");
    return el;
  }

  function toggleRow(toggleEl, title, sub) {
    const label = document.createElement("label");
    label.className = "toggle-row";
    const text = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = sub;
    text.append(strong, small);
    label.append(toggleEl, text);
    return label;
  }

  function buildSwatches(selected) {
    const row = document.createElement("div");
    row.className = "swatch-row";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Event color");
    for (const [name, hex] of Object.entries(EVENT_COLORS)) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.dataset.color = name;
      swatch.style.background = hex;
      swatch.style.setProperty("--swatch-ink", inkForBackground(hex));
      swatch.setAttribute("role", "radio");
      swatch.setAttribute("aria-label", `${name} color`);
      swatch.setAttribute("aria-checked", name === selected ? "true" : "false");
      swatch.addEventListener("click", () => {
        draft.color = name;
        for (const s of row.querySelectorAll(".swatch")) {
          s.setAttribute("aria-checked", s.dataset.color === name ? "true" : "false");
        }
      });
      row.append(swatch);
    }
    return row;
  }

  /** @param {string} initial */
  function buildFreqRow(initial) {
    const row = document.createElement("div");
    row.className = "segmented";
    for (const [value, label] of [["daily", "DAILY"], ["weekly", "WEEKLY"], ["monthly", "MONTHLY"], ["yearly", "YEARLY"]]) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "segmented__option";
      opt.dataset.freq = value;
      opt.textContent = label;
      opt.addEventListener("click", () => {
        draft.freq = value;
        syncFreqRow();
      });
      row.append(opt);
    }
    draft.freq = initial;
    return row;
  }

  function repeatSection() {
    const block = document.createElement("div");
    block.className = "repeat-block";
    freqRow && block.append(freqRow);
    const intervalLabel = document.createElement("span");
    intervalLabel.className = "repeat-details__label";
    intervalLabel.id = "repeat-interval-label";
    const row = document.createElement("div");
    row.className = "form-row";
    row.append(intervalLabel, intervalInput);
    block.append(row, summary);
    draft.intervalLabel = intervalLabel;
    return block;
  }

  /**
   * Notice shown when editing a recurring event: edits apply to the
   * whole series; deleted occurrences stay skipped.
   * @param {number} skippedCount
   * @returns {HTMLElement}
   */
  function buildSeriesNote(skippedCount) {
    const note = document.createElement("p");
    note.className = "form-summary form-summary--series";
    note.setAttribute("role", "note");
    const skipped = skippedCount > 0 ? ` ${skippedCount} skipped date${skippedCount === 1 ? "" : "s"} stay skipped.` : "";
    note.textContent = `SERIES EDIT — changes apply to every occurrence.${skipped}`;
    return note;
  }
  function buildRepeatSection() {
    const block = repeatSection();
    const untilRow = document.createElement("div");
    untilRow.className = "form-row";
    const untilLabel = document.createElement("span");
    untilLabel.className = "repeat-details__label";
    untilLabel.textContent = "UNTIL (OPTIONAL)";
    untilRow.append(untilLabel, untilInput);
    block.append(untilRow, intervalError, untilError);
    block.hidden = !draft.repeatOn;
    draft.repeatBlock = block;
    return block;
  }

  function syncFreqRow() {
    for (const opt of freqRow.querySelectorAll(".segmented__option")) {
      const active = opt.dataset.freq === draft.freq;
      opt.setAttribute("aria-pressed", active ? "true" : "false");
      opt.classList.toggle("is-selected", active);
    }
    const period = draft.freq === "daily" ? "DAYS" : draft.freq === "weekly" ? "WEEKS" : draft.freq === "monthly" ? "MONTHS" : "YEARS";
    draft.intervalLabel.textContent = `EVERY ${period}`;
    updateSummary();
  }

  /**
   * Current form values as a plain draft.
   */
  function fields() {
    return {
      title: titleInput.value,
      date: dateInput.value,
      time: draft.allDay ? null : timeInput.value || null,
      timezone: zoneInput.value.trim(),
      locationLink: locationInput.value.trim(),
      color: draft.color,
    };
  }

  function recurrenceFields() {
    if (!repeatToggle.checked) return null;
    return {
      freq: /** @type {"daily"|"weekly"|"monthly"|"yearly"} */ (draft.freq),
      interval: Math.round(Number(intervalInput.value)) || 1,
      until: untilInput.value || null,
      exceptions: existing?.recurrence?.exceptions ?? [],
    };
  }

  function validate() {
    const allDay = allDayToggle.checked;
    const rec = recurrenceFields();
    const errors = validateEventDraft({
      ...fields(),
      time: allDay ? null : timeInput.value || null,
      recurrence: rec,
    });
    if (!isValidTimeZone(zoneInput.value.trim())) {
      errors.timezone = "Unknown timezone";
    }
    titleError.textContent = errors.title ?? "";
    dateError.textContent = errors.date ?? "";
    timeError.textContent = errors.time ?? "";
    zoneError.textContent = errors.timezone ?? "";
    locationError.textContent = errors.locationLink ?? "";
    untilError.textContent = errors.until ?? "";
    intervalError.textContent = errors.recurrence ?? "";
    saveBtn.disabled = Object.keys(errors).length > 0;
  }

  function updateSummary() {
    draft.repeatBlock.hidden = !repeatToggle.checked;
    if (!repeatToggle.checked) {
      summary.textContent = "";
      validate();
      return;
    }
    const interval = Math.max(1, Number(intervalInput.value) || 1);
    const unit = draft.freq === "daily" ? "day" : draft.freq === "weekly" ? "week" : draft.freq === "monthly" ? "month" : "year";
    const plural = interval > 1 ? "s" : "";
    const until = untilInput.value ? `until ${untilInput.value}` : "no end";
    const skipNote =
      (existing?.recurrence?.exceptions.length ?? 0) > 0
        ? `, ${existing.recurrence.exceptions.length} skipped`
        : "";
    summary.textContent = `Every ${interval} ${unit}${plural}, ${until}${skipNote}`;
    validate();
  }

  async function persist() {
    if (saveBtn.disabled) return;
    const rec = recurrenceFields();
    const base = {
      title: titleInput.value.trim(),
      color: draft.color,
      date: dateInput.value,
      time: allDayToggle.checked ? null : timeInput.value || null,
      timezone: zoneInput.value.trim() || userTimeZone(),
      locationLink: locationInput.value.trim() || null,
      recurrence: rec,
    };
    try {
      await saveEvent(
        isEdit
          ? { ...existing, ...base, updatedAt: Date.now() }
          : makeEvent({ ...base, imageStatus: "none" }),
      );
      await refreshEvents();
      close();
    } catch (error) {
      titleError.textContent = "Could not save — storage may be unavailable";
      throw error;
    }
  }

  // Listeners
  allDayToggle.addEventListener("change", () => {
    timeInput.closest(".field-block")?.classList.toggle("field-block--dim", allDayToggle.checked);
    validate();
  });
  titleInput.addEventListener("input", validate);
  titleInput.addEventListener("blur", validate);
  dateInput.addEventListener("input", validate);
  timeInput.addEventListener("input", validate);
  zoneInput.addEventListener("input", validate);
  locationInput.addEventListener("input", validate);
  intervalInput.addEventListener("input", updateSummary);
  untilInput.addEventListener("input", updateSummary);
  repeatToggle.addEventListener("change", () => {
    syncFreqRow();
    updateSummary();
  });
  cancelBtn.addEventListener("click", close);
  saveBtn.addEventListener("click", () => {
    persist().catch((error) => console.error("save rejected", error));
  });

  syncFreqRow();
  validate();
  titleInput.focus();

  return close;
}
