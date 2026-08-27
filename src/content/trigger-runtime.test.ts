import assert from "node:assert/strict";
import { test } from "node:test";

import { rockerFrom, wheelCounter, wheelPixels } from "./trigger-runtime.ts";

/*
 * The two pure halves of the rocker and the wheel. Everything else in
 * trigger-runtime.ts is listeners on `window`, which needs a browser; these are
 * the parts where a wrong answer is silent — a rocker that fires on a thumb
 * button, or a trackpad that steps thirty tabs on one flick.
 */

test("the two classic pairs are the only chords that rock", () => {
  // Right held, left clicked, and the other way round.
  assert.equal(rockerFrom(2, 0), "back");
  assert.equal(rockerFrom(1, 2), "forward");
});

test("a press with nothing held is not a chord", () => {
  assert.equal(rockerFrom(0, 0), undefined);
  assert.equal(rockerFrom(0, 2), undefined);
});

test("the middle button neither rocks nor rides along", () => {
  // Holding it means autoscroll on Windows and paste on Linux.
  assert.equal(rockerFrom(4, 0), undefined);
  assert.equal(rockerFrom(4, 2), undefined);
  assert.equal(rockerFrom(2, 1), undefined);
  // Left and middle held together is a hand resting on the mouse, not a rocker.
  assert.equal(rockerFrom(1 | 4, 2), undefined);
});

test("the same button pressed twice is not a chord", () => {
  assert.equal(rockerFrom(1, 0), undefined);
  assert.equal(rockerFrom(2, 2), undefined);
});

test("a delta is read in the unit it was reported in", () => {
  assert.equal(wheelPixels({ deltaY: 120, deltaMode: 0 }), 120);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }), 48);
  assert.equal(wheelPixels({ deltaY: -1, deltaMode: 2 }), -400);
});

test("one notch of a mouse wheel is one step", () => {
  const notches = wheelCounter();
  assert.equal(notches.take(120), 3);
});

test("a trackpad's dozen small deltas add up to the steps a wheel would give", () => {
  const notches = wheelCounter();
  const steps = Array.from({ length: 12 }, () => notches.take(10)).reduce((sum, n) => sum + n, 0);
  assert.equal(steps, 3);
});

test("a change of direction drops the bank rather than paying it back", () => {
  const notches = wheelCounter();
  assert.equal(notches.take(30), 0);
  // Without the reset this would sit at -10 and owe a step downwards.
  assert.equal(notches.take(-30), 0);
  assert.equal(notches.take(-10), -1);
});

test("steps are signed, and the remainder is carried", () => {
  const notches = wheelCounter();
  assert.equal(notches.take(-50), -1);
  assert.equal(notches.take(-30), -1);
});

test("a reset drops what has not been spent", () => {
  const notches = wheelCounter();
  assert.equal(notches.take(30), 0);
  notches.reset();
  assert.equal(notches.take(30), 0);
});
