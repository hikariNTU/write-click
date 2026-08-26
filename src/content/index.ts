import { defaultTrigger, detectPlatform, menuFiresOnMouseDown } from "../shared/trigger";
import { createOverlay } from "./overlay";

// Only the top frame owns the overlay; sub-frames will forward their pointer
// events up in a later phase.
if (window.top === window) {
  const platform = detectPlatform();
  const trigger = defaultTrigger(platform);

  const root = createOverlay();
  const badge = document.createElement("div");
  badge.className =
    "pointer-events-none fixed bottom-4 left-4 rounded-md bg-slate-900/90 px-3 py-2 " +
    "font-mono text-xs text-emerald-300 shadow-lg ring-1 ring-emerald-400/30";
  badge.textContent = `write-click ready · ${platform} · trigger=${JSON.stringify(trigger)}`;
  root.append(badge);

  setTimeout(() => badge.remove(), 4000);

  console.info("[write-click] content script up", {
    platform,
    trigger,
    menuOnMouseDown: menuFiresOnMouseDown(platform),
  });
}
