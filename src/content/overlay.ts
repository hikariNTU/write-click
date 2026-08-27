import { withPropertyFallback } from "./css-fallback";
import styles from "./styles.css?inline";

let sheet: CSSStyleSheet | undefined;

function sharedSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(withPropertyFallback(styles));
  }
  return sheet;
}

/**
 * The host's own styling, including everything the popover UA sheet would
 * otherwise impose on it: a popover comes with a border, padding, a background,
 * `width: fit-content` and `overflow: auto`, none of which belong on a
 * full-viewport inert layer. Inline styles beat the UA sheet, so they are all
 * spelled out here rather than left to chance.
 */
const HOST_STYLE = [
  "position: fixed",
  "inset: 0",
  "z-index: 2147483647",
  "pointer-events: none",
  "contain: strict",
  "margin: 0",
  "border: 0",
  "padding: 0",
  "background: transparent",
  "overflow: visible",
  "width: auto",
  "height: auto",
  "max-width: none",
  "max-height: none",
  "color: inherit",
].join(";");

/**
 * Whether this browser has the popover API, which is how the overlay reaches
 * the top layer. Chrome has had it since 114; without it the overlay is an
 * ordinary fixed element, exactly as it was before, and a fullscreen element
 * covers it.
 */
function promotable(host: HTMLElement): boolean {
  return typeof host.showPopover === "function";
}

/**
 * Puts the host in the top layer, or moves it back to the top of it.
 *
 * The top layer is a stack in insertion order, and a fullscreen element joins
 * it when the page goes fullscreen — after us, and therefore above us. Taking
 * the popover down and putting it straight back up re-inserts it at the top of
 * that stack, which is why this runs again on every `fullscreenchange` rather
 * than once at startup.
 */
function promote(host: HTMLElement): void {
  if (!promotable(host) || !host.isConnected) return;
  try {
    // Throws if it is not currently showing, which is the normal case on the
    // first call and after a page has moved the node.
    host.hidePopover();
  } catch {
    // Not showing. Nothing to take down.
  }
  try {
    host.showPopover();
  } catch (error) {
    // A page is free to do anything to a node in its own DOM, including moving
    // it somewhere a popover cannot be shown. Losing the top layer costs the
    // overlay nothing except its place above a fullscreen element.
    console.debug("[write-click] overlay stayed out of the top layer", error);
  }
}

/**
 * A closed shadow root pinned above the page. Closed so page scripts cannot
 * reach in through `.shadowRoot`, and `pointer-events: none` on the host so
 * the trail layer never eats clicks. Interactive children opt back in.
 *
 * The host is a manual popover, which is what gets it into the **top layer**.
 * `requestFullscreen()` promotes its element into that layer, and the layer
 * paints above every stacking context in the document — 2147483647 does not
 * compete with it, because the overlay was not in the layer at all. A manual
 * popover joins it without taking focus and without making the page inert, so
 * the page underneath keeps behaving exactly as it did. See docs/SPEC.md §7.5.
 */
export function createOverlay(): ShadowRoot {
  const host = document.createElement("div");
  host.style.cssText = HOST_STYLE;
  if (promotable(host)) host.popover = "manual";

  const root = host.attachShadow({ mode: "closed" });
  root.adoptedStyleSheets = [sharedSheet()];

  const mount = (): void => {
    document.documentElement.append(host);
    promote(host);
  };
  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  // Both directions: entering fullscreen puts an element above us, and leaving
  // it can drop the popover if the element that went fullscreen was an ancestor
  // of the host.
  document.addEventListener("fullscreenchange", () => promote(host), true);

  return root;
}
