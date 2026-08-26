import assert from "node:assert/strict";
import { test } from "node:test";
import { tabsOnSide } from "./tabs.ts";

const strip = [
  { index: 0, pinned: true },
  { index: 1, pinned: false },
  { index: 2, pinned: false },
  { index: 3, pinned: false },
];

test("takes only the unpinned tabs on the named side", () => {
  assert.deepEqual(tabsOnSide(strip, 2, "right"), [{ index: 3, pinned: false }]);
  assert.deepEqual(tabsOnSide(strip, 2, "left"), [{ index: 1, pinned: false }]);
});

test("never includes the active tab", () => {
  assert.equal(tabsOnSide(strip, 3, "right").length, 0);
  assert.equal(
    tabsOnSide(strip, 3, "left").some((tab) => tab.index === 3),
    false,
  );
});

test("a strip of only pinned tabs closes nothing", () => {
  const pinned = [
    { index: 0, pinned: true },
    { index: 1, pinned: true },
  ];
  assert.equal(tabsOnSide(pinned, 0, "right").length, 0);
});
