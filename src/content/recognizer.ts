export interface Point {
  x: number;
  y: number;
}

/** Movement below this is "the pointer never really moved". docs/SPEC.md §4. */
export const DRIFT_THRESHOLD = 8;
/** A segment shorter than this emits no direction. */
export const SEGMENT_MIN = 32;
/**
 * Extra angle, on top of the 45° sector edge, that the pointer must swing
 * through before the stroke is allowed to change direction. Without it a
 * wobbly hand alternates letters and a single corner reads as `RURU`.
 */
export const HYSTERESIS_DEG = 28;
/**
 * How far the pointer may wander before the tab grid is treated as a stroke
 * instead of a hold. Deliberately much larger than DRIFT_THRESHOLD: pressing a
 * mouse button shifts the cursor several pixels, and that must not count as
 * "the user started drawing".
 */
export const GRID_CANCEL_PX = SEGMENT_MIN;

/** Longer strokes are truncated and will simply not match anything. */
export const MAX_SEGMENTS = 6;

/**
 * Four cardinal directions only. Eight would make a single diagonal drag emit
 * `DR`, which is indistinguishable from the two-segment `DR` in the gesture
 * map — the same string would mean two different gestures.
 */
const DIRECTIONS = ["R", "D", "L", "U"] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** Screen space: y grows down, so index 1 (`D`) sits at +90°. */
function canonicalDegrees(direction: Direction): number {
  return DIRECTIONS.indexOf(direction) * 90;
}

/** Shortest distance between two angles, in degrees, always 0..180. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function nearest(degrees: number): Direction {
  const step = Math.round(degrees / 90);
  return DIRECTIONS[((step % 4) + 4) % 4] as Direction;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Walks the sampled points, emitting a direction every time the pointer gets
 * `SEGMENT_MIN` away from the last anchor. The current direction is sticky:
 * it only gives way once the movement is more than `45 + HYSTERESIS_DEG` off
 * it, which a real corner clears easily and hand tremor never does.
 */
export function quantize(points: readonly Point[]): string {
  const out: Direction[] = [];
  let anchor = points[0];
  if (!anchor) return "";
  let current: Direction | undefined;

  for (const point of points) {
    if (distanceSquared(anchor, point) < SEGMENT_MIN * SEGMENT_MIN) continue;

    const degrees = (Math.atan2(point.y - anchor.y, point.x - anchor.x) * 180) / Math.PI;
    const sticky =
      current !== undefined &&
      angularDistance(degrees, canonicalDegrees(current)) <= 45 + HYSTERESIS_DEG;
    const dir = sticky && current ? current : nearest(degrees);

    if (dir !== current) {
      out.push(dir);
      current = dir;
    }
    anchor = point;
    if (out.length >= MAX_SEGMENTS) break;
  }

  return out.join("");
}
