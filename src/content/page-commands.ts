import type { ContentCommandId } from "../shared/messages";
import type { Point } from "../shared/recognizer";

function smooth(): ScrollBehavior {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * The nearest ancestor that actually scrolls, so a gesture drawn inside a
 * scrollable panel moves that panel rather than the document behind it.
 */
function scroller(at: Point): Element {
  let node = document.elementFromPoint(at.x, at.y);
  while (node) {
    const style = getComputedStyle(node);
    const scrollable = /auto|scroll|overlay/.test(style.overflowY);
    if (scrollable && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

export function runPageCommand(id: ContentCommandId, at: Point): void {
  const target = scroller(at);
  const behavior = smooth();
  const page = Math.max(target.clientHeight - 64, 120);

  switch (id) {
    case "page.up":
      target.scrollBy({ top: -page, behavior });
      return;
    case "page.down":
      target.scrollBy({ top: page, behavior });
      return;
    case "page.top":
      target.scrollTo({ top: 0, behavior });
      return;
    case "page.end":
      target.scrollTo({ top: target.scrollHeight, behavior });
      return;
    case "nav.stop":
      // No extension API for this; the frame stopping itself is the only way.
      window.stop();
      return;
    default: {
      // Exhaustive: adding a content command must break this build.
      const unreachable: never = id;
      throw new Error(`unhandled command ${String(unreachable)}`);
    }
  }
}
