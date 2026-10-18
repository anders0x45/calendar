/**
 * Retro notification toast with optional UNDO affordance. Uses
 * role="status" so screen readers announce it without stealing focus.
 */

import { UNDO_TOAST_MS, TOAST_MS } from "../config.js";

/**
 * @param {{message: string, subtext?: string|null, onUndo?: () => void,
 *   actionLabel?: string, onAction?: () => void, isError?: boolean}} options
 * @returns {() => void} dismiss handle
 */
export function showToast({ message, subtext = null, onUndo, actionLabel, onAction, isError = false }) {
  const hasAction = Boolean(onUndo || (actionLabel && onAction));
  const durationMs = hasAction ? UNDO_TOAST_MS : TOAST_MS;
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " toast--error" : "");
  toast.setAttribute("role", isError ? "alert" : "status");

  const text = document.createElement("div");
  text.className = "toast__text";
  const title = document.createElement("span");
  title.className = "toast__title";
  title.textContent = message;
  text.append(title);
  if (subtext) {
    const sub = document.createElement("span");
    sub.className = "toast__sub";
    sub.textContent = subtext;
    text.append(sub);
  }
  toast.append(text);

  let done = false;
  if (onUndo || (actionLabel && onAction)) {
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "btn toast__undo";
    undoBtn.textContent = onUndo ? "[ UNDO ]" : (`[ ${actionLabel} ]`);
    undoBtn.addEventListener("click", () => {
      done = true;
      clearTimeout(timer);
      dismiss();
      if (onUndo) onUndo();
      else onAction?.();
    });
    toast.append(undoBtn);
  }

  document.body.append(toast);

  function dismiss() {
    toast.remove();
  }

  const timer = setTimeout(dismiss, durationMs);
  return () => {
    clearTimeout(timer);
    dismiss();
  };
}
