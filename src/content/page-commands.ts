import type { ContentCommandId } from "../shared/messages";
import { send } from "../shared/messages";
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

/**
 * Puts text on the clipboard from a content script.
 *
 * The async Clipboard API is the path that works, and it is not always
 * available: a cross-origin frame without `allow="clipboard-write"` is refused
 * by permissions policy, and so is a document that is not focused. The
 * `execCommand` fallback is deprecated and still the only thing that works
 * there, so it stays until it stops.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Off-screen rather than hidden: a `display: none` textarea cannot be
    // selected, and selecting it is the whole mechanism.
    const pad = document.createElement("textarea");
    pad.value = text;
    pad.setAttribute("readonly", "");
    pad.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(pad);
    pad.select();
    // eslint-disable-next-line no-restricted-syntax -- the only fallback there is
    const copied = document.execCommand("copy");
    pad.remove();
    return copied;
  }
}

/**
 * Copies the tab's address or title, both of which come from the service
 * worker: the frame that drew the gesture may be a sub-frame, and its own
 * `location` is not the page the user is looking at.
 */
async function copyPageInfo(which: "url" | "title"): Promise<void> {
  const response = await send({ type: "page.info" });
  if (!("url" in response)) return;
  const text = which === "url" ? response.url : response.title;
  if (text && !(await copy(text))) console.warn("[write-click] could not write to the clipboard");
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
    case "page.copyUrl":
      void copyPageInfo("url");
      return;
    case "page.copyTitle":
      void copyPageInfo("title");
      return;
    case "page.print":
      // The dialog is modal and blocks this frame until it is dismissed, which
      // is why nothing runs after it.
      window.print();
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
