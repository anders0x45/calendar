/**
 * Bridge between the data layer and global state: reload events after
 * any mutation (pull) AND subscribe to live cloud snapshots when a
 * backend is active (push). Subscribed views always render from state.
 */

import { setState } from "../state.js";
import { listEvents } from "../data/events.js";
import { getBackend, isCloud } from "../data/backend.js";

/** @type {(() => void) | null} */
let liveUnsub = null;
/**
 * Reload all events from the active store into state. Never throws.
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

/**
 * Live cloud events: onSnapshot keeps state fresh across devices and
 * tabs, independent of the pull path (whose calls stay harmless).
 * Local stores listen via their own resolves; calling this on a local
 * backend does nothing.
 * @returns {Promise<void>}
 */
export async function startLiveEvents() {
  if (liveUnsub || !isCloud()) return;
  const calendarId = getBackend().calendarId;
  if (typeof calendarId !== "string") return;
  try {
    const [{ collection, onSnapshot }, { ensureFirestore }, cloud] = await Promise.all([
      import("../firebase/firestore-api.js"),
      import("../firebase/sdk.js"),
      import("../data/cloudEvents.js"),
    ]);
    liveUnsub = onSnapshot(
      collection(ensureFirestore(), "calendars", calendarId, "events"),
      (snapshot) => {
        cloud.syncFirestoreSnapshot(snapshot);
      },
      (error) => {
        console.error("live event stream failed", error);
        showToastError();
      },
    );
  } catch (error) {
    console.error("live events setup failed", error);
  }
}

/** Stop the live stream (never needed by the reload-based sign-out). */
export function stopLiveEvents() {
  if (liveUnsub) {
    liveUnsub();
    liveUnsub = null;
  }
}

/** @returns {void} */
function showToastError() {
  // Lazy import to avoid a cycle with toast.js.
  import("./toast.js").then(({ showToast }) =>
    showToast({ message: "Could not reload events", isError: true }),
  );
}
