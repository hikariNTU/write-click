export interface Point {
  x: number;
  y: number;
}

/** Movement below this is "the pointer never really moved". docs/SPEC.md §4. */
export const DRIFT_THRESHOLD = 8;
/** A segment shorter than this emits no direction. */
export const SEGMENT_MIN = 20;
/** Longer strokes are truncated and will simply not match anything. */
export const MAX_SEGMENTS = 6;

/** Index 0 is due right, stepping clockwise in screen space (y grows down). */
const DIRECTIONS = ["R", "DR", "D", "DL", "L", "UL", "U", "UR"] as const;

export type Direction = (typeof DIRECTIONS)[number];

function direction(dx: number, dy: number): Direction {
  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTIONS[((step % 8) + 8) % 8] as Direction;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Walks the sampled points, emitting a direction every time the pointer gets
 * `SEGMENT_MIN` away from the last anchor, and collapsing consecutive repeats
 * so a long straight drag stays one letter.
 */
export function quantize(points: readonly Point[]): string {
  const out: Direction[] = [];
  let anchor = points[0];
  if (!anchor) return "";

  for (const point of points) {
    if (distanceSquared(anchor, point) < SEGMENT_MIN * SEGMENT_MIN) continue;
    const dir = direction(point.x - anchor.x, point.y - anchor.y);
    if (dir !== out.at(-1)) out.push(dir);
    anchor = point;
    if (out.length >= MAX_SEGMENTS) break;
  }

  return out.join("");
}
