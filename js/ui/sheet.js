/**
 * Generic bottom-sheet primitive: backdrop, focus trap, Escape and
 * backdrop-click close, focus restore. Content is built by the caller.
 */

/**
 * @param {{label: string, onClose?: () => void, fullHeight?: boolean}} options
 * @returns {{sheet: HTMLElement, body: HTMLElement, close: () => void}}
 */
export function openSheet({ label, onClose, fullHeight = false }) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "sheet" + (fullHeight ? " sheet--full" : "");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", label);
  // Focus lands on the sheet itself so screen readers announce the
  // dialog; the form sheet re-focuses its first input afterwards.
  sheet.tabIndex = -1;

  const grip = document.createElement("div");
  grip.className = "sheet__grip";
  sheet.append(grip);

  backdrop.append(sheet);
  document.body.append(backdrop);
  sheet.focus({ preventScroll: true });

  /** @type {HTMLElement|null} */
  const opener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function triggerClose() {
    backdrop.remove();
    document.removeEventListener("keydown", onKeydown);
    onClose?.();
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
      Array.from(
        sheet.querySelectorAll("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])"),
      ).filter((el) => !el.disabled && el.offsetParent !== null)
    );
    if (focusables.length === 0) return;
    if (document.activeElement === sheet) {
      event.preventDefault();
      focusables[0].focus();
      return;
    }
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

  return { sheet, body: sheet, close: triggerClose };
}

/**
 * Render a sheet head (title row + close button) into a sheet body.
 * @param {HTMLElement} sheet
 * @param {string} title
 * @param {() => void} onClose
 * @returns {{head: HTMLElement, closeBtn: HTMLButtonElement}}
 */
export function renderSheetHead(sheet, title, onClose) {
  const head = document.createElement("div");
  head.className = "sheet__head";
  const h2 = document.createElement("h2");
  h2.className = "sheet__title";
  h2.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"/></svg>';
  closeBtn.addEventListener("click", onClose);
  head.append(h2, closeBtn);
  sheet.append(head);
  return { head, closeBtn };
}
