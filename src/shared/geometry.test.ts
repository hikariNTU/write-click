import assert from "node:assert/strict";
import { test } from "node:test";
import { containsPoint } from "./geometry.ts";

const box = { left: 10, right: 110, top: 20, bottom: 70 };

test("a point in the middle is inside", () => {
  assert.equal(containsPoint(box, { x: 60, y: 45 }), true);
});

test("the edges count as inside", () => {
  // A tile's own border is part of it: a press one pixel in from the visible
  // edge must not fall through to the page underneath.
  assert.equal(containsPoint(box, { x: 10, y: 20 }), true);
  assert.equal(containsPoint(box, { x: 110, y: 70 }), true);
});

test("a point outside on any side is outside", () => {
  assert.equal(containsPoint(box, { x: 9, y: 45 }), false);
  assert.equal(containsPoint(box, { x: 111, y: 45 }), false);
  assert.equal(containsPoint(box, { x: 60, y: 19 }), false);
  assert.equal(containsPoint(box, { x: 60, y: 71 }), false);
});
