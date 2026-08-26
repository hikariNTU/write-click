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
 * A closed shadow root pinned above the page. Closed so page scripts cannot
 * reach in through `.shadowRoot`, and `pointer-events: none` on the host so
 * the trail layer never eats clicks. Interactive children opt back in.
 */
export function createOverlay(): ShadowRoot {
  const host = document.createElement("div");
  host.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 2147483647",
    "pointer-events: none",
    "contain: strict",
  ].join(";");

  const root = host.attachShadow({ mode: "closed" });
  root.adoptedStyleSheets = [sharedSheet()];

  const mount = () => document.documentElement.append(host);
  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  return root;
}
