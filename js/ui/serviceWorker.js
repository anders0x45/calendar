/**
 * Service worker registration + "new version available" surface. The
 * worker never takes control mid-session; the user chooses when to
 * reload via a toast action.
 */

import { showToast } from "./toast.js";

/** @type {ServiceWorkerRegistration | null} */
let registration = null;
/** @type {boolean} */
let updateShown = false;

/** @returns {void} */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        registration = reg;
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
        const waiting = reg.waiting;
        if (waiting && navigator.serviceWorker.controller) showUpdateToast();
      })
      .catch((error) => console.error("sw registration failed", error));
  });
}

/** One prompt, skipWaiting on choice. */
function showUpdateToast() {
  if (updateShown || !registration?.waiting) return;
  updateShown = true;
  showToast({
    message: "New version available.",
    subtext: "Reload to update Chrono.exe",
    actionLabel: "RELOAD",
    onAction: () => {
      const worker = registration?.waiting;
      if (!worker) return;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
      worker.postMessage("skipWaiting");
    },
  });
}
