/**
 * Touch swipe + keyboard period navigation. Horizontal swipes are
 * recognized only past a threshold that also dominates vertical travel,
 * so scrolling is never hijacked. All touch listeners are passive.
 */

/**
 * @param {HTMLElement} element
 * @param {{onPrev: () => void, onNext: () => void}} hooks
 * @returns {() => void} detach function
 */
export function attachSwipe(element, hooks) {
  const START_THRESHOLD_PX = 24;
  const COMMIT_THRESHOLD_PX = 64;

  /** @type {number|null} */ let startX = null;
  /** @type {number|null} */ let startY = null;

  const reset = () => {
    startX = null;
    startY = null;
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    // Ignore swipes that start on interactive children (buttons, chips).
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("button, a, input, select, [role='dialog']")) {
      reset();
      return;
    }
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  };

  const onTouchMove = (event) => {
    if (startX === null || startY === null) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (Math.abs(dx) < START_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    // Horizontal intent: commit once, then stop tracking this gesture.
    reset();
    if (dx > COMMIT_THRESHOLD_PX) hooks.onPrev();
    else if (dx < -COMMIT_THRESHOLD_PX) hooks.onNext();
  };
  const onTouchEnd = reset;

  // RTL-less app: left swipe -> next, right swipe -> prev.
  const opts = { passive: true };
  element.addEventListener("touchstart", onTouchStart, opts);
  element.addEventListener("touchmove", onTouchMove, opts);
  element.addEventListener("touchend", onTouchEnd, opts);
  element.addEventListener("touchcancel", onTouchEnd, opts);

  const onKeydown = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const active = /** @type {HTMLElement} */ (document.activeElement);
    if (active && active.matches("input, textarea, select, [role='dialog']")) return;
    if (document.querySelector(".sheet-backdrop")) return;
    if (event.key === "ArrowLeft") hooks.onPrev();
    else if (event.key === "ArrowRight") hooks.onNext();
    else return;
    event.preventDefault();
  };
  document.addEventListener("keydown", onKeydown);

  return () => {
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchmove", onTouchMove);
    element.removeEventListener("touchend", onTouchEnd);
    element.removeEventListener("touchcancel", onTouchEnd);
    document.removeEventListener("keydown", onKeydown);
  };
}
