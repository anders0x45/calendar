/**
 * Service worker registration + auto-update surface. The worker
 * activates new versions via skipWaiting in sw.js; when the page was
 * already controlled (an upgrade), a controllerchange reloads it once
 * so the fresh shell takes over immediately.
 */

/** @type {boolean} */
let hadController = false;
/** @type {boolean} */
let reloading = false;

/** @returns {void} */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  window.addEventListener("load", () => {
    hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => console.error("sw registration failed", error));
  });
}
