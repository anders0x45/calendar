/**
 * Migration offer sheet: shows once per device when a signed-in cloud
 * session coexists with legacy device-local events.
 */

import { openSheet, renderSheetHead } from "./sheet.js";
import { showToast } from "./toast.js";
import { refreshEvents } from "./refresh.js";
import {
  importLegacyEvents,
  markMigrationOffered,
} from "../data/migration.js";

/**
 * Open the migrate sheet with a live count line.
 * @param {number} count
 * @returns {(() => void)} a close() handle
 */
export function openMigrationSheet(count) {
  const { body, close } = openSheet({ label: "Migration" });
  renderSheetHead(body, "IMPORT LEGACY EVENTS", close);

  const warn = document.createElement("p");
  warn.className = "scope-warn";
  warn.textContent = `This device has ${count} local event${count === 1 ? "" : "s"} and never synced. Import them into your cloud calendar?`;

  const status = document.createElement("p");
  status.className = "scope-warn";
  status.setAttribute("aria-live", "polite");

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn btn--primary scope-btn";
  yes.textContent = `[ IMPORT ${count} ]`;

  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn scope-btn";
  no.textContent = "[ NOT NOW ]";

  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "btn btn--danger scope-btn";
  discard.textContent = "[ DISCARD LOCAL COPY ]";

  body.append(warn, yes, no, discard);

  function disableAll() {
    yes.disabled = true;
    no.disabled = true;
    discard.disabled = true;
    body.append(status);
  }

  no.addEventListener("click", async () => {
    close();
    await markMigrationOffered();
  });

  yes.addEventListener("click", async () => {
    disableAll();
    status.textContent = "IMPORTING…";
    try {
      const { imported, skipped } = await importLegacyEvents();
      await markMigrationOffered();
      await refreshEvents();
      close();
      showToast({
        message: `Imported ${imported} event${imported === 1 ? "" : "s"}.`,
        subtext: skipped > 0 ? `${skipped} skipped (invalid)` : undefined,
      });
    } catch (error) {
      console.error("migration import failed", error);
      yes.disabled = false;
      no.disabled = false;
      discard.disabled = false;
      status.textContent = "Import failed — try again.";
    }
  });

  discard.addEventListener("click", async () => {
    disableAll();
    try {
      const { deleteAllEvents } = await import("../data/events.js");
      const { deleteAllImages } = await import("../data/images.js");
      await deleteAllEvents();
      await deleteAllImages();
      await markMigrationOffered();
      await refreshEvents();
      close();
      showToast({ message: "Local copy discarded." });
    } catch (error) {
      console.error("migration discard failed", error);
      yes.disabled = false;
      no.disabled = false;
      discard.disabled = false;
      status.textContent = "Discard failed — try again.";
    }
  });

  return close;
}
