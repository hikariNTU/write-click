import assert from "node:assert/strict";
import { test } from "node:test";
import { quantize } from "./recognizer.ts";
import type { Point } from "./recognizer.ts";

/** Straight drag from `from`, sampled every 4px, the way a mouse reports. */
function drag(from: Point, dx: number, dy: number, steps = 40): Point[] {
  const points: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    points.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps });
  }
  return points;
}

function stroke(...legs: [number, number][]): string {
  let at: Point = { x: 500, y: 500 };
  const points: Point[] = [at];
  for (const [dx, dy] of legs) {
    points.push(...drag(at, dx, dy));
    at = { x: at.x + dx, y: at.y + dy };
  }
  return quantize(points);
}

test("a single flick reads as one letter", () => {
  assert.equal(stroke([-200, 0]), "L");
  assert.equal(stroke([200, 0]), "R");
  assert.equal(stroke([0, -200]), "U");
  assert.equal(stroke([0, 200]), "D");
});

test("doubling back reverses the letter", () => {
  assert.equal(stroke([-200, 0], [200, 0], [-200, 0]), "LRL");
  assert.equal(stroke([200, 0], [-200, 0], [200, 0]), "RLR");
});

test("vertical reversals read as separate letters", () => {
  assert.equal(stroke([0, -200], [0, 200]), "UD");
  assert.equal(stroke([0, -200], [0, 200], [0, -200]), "UDU");
});

test("corners read as two letters", () => {
  assert.equal(stroke([200, 0], [0, 200]), "RD");
  assert.equal(stroke([0, -200], [200, 0], [0, 200]), "URD");
  assert.equal(stroke([0, -200], [-200, 0], [0, 200]), "ULD");
});

test("a wobbly line stays one letter", () => {
  const points: Point[] = [];
  for (let i = 0; i <= 200; i += 4) {
    // ±6px of tremor across a 200px rightward drag.
    points.push({ x: 500 + i, y: 500 + Math.sin(i / 9) * 6 });
  }
  assert.equal(quantize(points), "R");
});

test("movement under the drift threshold produces nothing", () => {
  assert.equal(stroke([6, 0]), "");
});
