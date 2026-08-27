import assert from "node:assert/strict";
import { test } from "node:test";
import { duplicateTabs, tabsOnSide } from "./tabs.ts";

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

test("duplicate tabs keep the leftmost copy", () => {
  const tabs = [
    { index: 0, pinned: false, url: "https://example.com/a" },
    { index: 1, pinned: false, url: "https://example.com/b" },
    { index: 2, pinned: false, url: "https://example.com/a" },
    { index: 3, pinned: false, url: "https://example.com/a#later" },
  ];
  assert.deepEqual(
    duplicateTabs(tabs).map((tab) => tab.index),
    [2, 3],
  );
});

test("duplicate tabs never include a pinned tab", () => {
  const tabs = [
    { index: 0, pinned: false, url: "https://example.com/" },
    { index: 1, pinned: true, url: "https://example.com/" },
  ];
  assert.deepEqual(duplicateTabs(tabs), []);
});

test("a pinned tab still claims its page", () => {
  const tabs = [
    { index: 0, pinned: true, url: "https://example.com/" },
    { index: 1, pinned: false, url: "https://example.com/" },
  ];
  assert.deepEqual(
    duplicateTabs(tabs).map((tab) => tab.index),
    [1],
  );
});

test("a query string distinguishes pages, a fragment does not", () => {
  const tabs = [
    { index: 0, pinned: false, url: "https://example.com/?q=1" },
    { index: 1, pinned: false, url: "https://example.com/?q=2" },
    { index: 2, pinned: false, url: "https://example.com/?q=1#x" },
  ];
  assert.deepEqual(
    duplicateTabs(tabs).map((tab) => tab.index),
    [2],
  );
});

test("a tab with no url yet is never a duplicate", () => {
  const tabs = [
    { index: 0, pinned: false, url: "https://example.com/" },
    { index: 1, pinned: false },
    { index: 2, pinned: false },
  ];
  assert.deepEqual(duplicateTabs(tabs), []);
});
