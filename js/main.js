import { initRouter, navigate, registerView, currentViewName } from "./router.js";
import { setState } from "./state.js";

/**
 * Entry point: boot the app shell, mount the initial view.
 * Milestone 1 mounts placeholder views; real views land in later
 * milestones.
 */

function main() {
  initRouter();
  wireViewPlaceholders();
  wireFab();
}

/** Placeholder renderers until real views land in later milestones. */
function wireViewPlaceholders() {
  for (const view of ["month", "week", "day"]) {
    registerView(view, () => setState({ view }));
  }
  registerView("settings", () => setState({ view: "settings" }));
  requestAnimationFrame(() => navigate("month"));
}

function wireFab() {
  document.getElementById("btn-fab")?.addEventListener("click", () => {
    // Real event sheet arrives in milestone 5.
    navigate(currentViewName());
  });
}

main();
