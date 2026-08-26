import type { Point } from "./recognizer";

/** The part of a DOMRect a hit test needs. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Whether a point falls inside a box, edges included.
 *
 * The tab grid hit-tests its tiles by hand because Blink captures mouse events
 * to the element that received the press, so the element under the cursor never
 * hears about them. See docs/SPEC.md §6.
 */
export function containsPoint(box: Box, point: Point): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}
