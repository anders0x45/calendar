/**
 * Bridge between the data layer and global state: reload events after
 * any mutation so subscribed views re-render from fresh data.
 */

import { setState } from "../state.js";
import { listEvents } from "../data/events.js";

/**
 * Reload all events from IndexedDB into state. Never throws.
 * @returns {Promise<void>}
 */
export async function refreshEvents() {
  try {
    const events = await listEvents();
    setState({ events });
  } catch (error) {
    console.error("event refresh failed", error);
    showToastError();
  }
}

/** @returns {void} */
function showToastError() {
  // Lazy import to avoid a cycle with toast.js.
  import("./toast.js").then(({ showToast }) =>
    showToast({ message: "Could not reload events", isError: true }),
  );
}
