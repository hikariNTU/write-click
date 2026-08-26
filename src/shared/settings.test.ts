import assert from "node:assert/strict";
import { test } from "node:test";

import { loadSettings } from "./settings.ts";
import type { LocalSettings, SyncSettings } from "./settings.ts";

/**
 * Just enough of chrome.storage for `loadSettings`, modelling the part that
 * matters: `get` handed an **object** of defaults merges each object-valued
 * default into the stored value, one level deep, before returning it. That is
 * Chrome's own behaviour, and reading by name is the only way around it — so
 * the stub reproduces it rather than pretending the two forms agree.
 */
const area = (stored: Record<string, unknown>) => ({
  get: (query: string[] | Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    if (Array.isArray(query)) {
      for (const key of query) {
        if (key in stored) out[key] = stored[key];
      }
      return Promise.resolve(out);
    }
    for (const [key, fallback] of Object.entries(query)) {
      const value = stored[key];
      out[key] =
        typeof fallback === "object" &&
        fallback !== null &&
        !Array.isArray(fallback) &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
          ? { ...fallback, ...value }
          : (value ?? fallback);
    }
    return Promise.resolve(out);
  },
});

function stub(sync: Record<string, unknown>, local: Record<string, unknown>): void {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { sync: area(sync), local: area(local) },
  };
}

test("a field added after the user last saved comes from the defaults", async () => {
  // A `grid` written before `pickOnRelease` existed. Merging is what makes the
  // new field appear rather than reading back undefined.
  stub({ grid: { enabled: false, holdMs: 400 } }, {});
  const { sync } = await loadSettings();
  assert.equal(sync.grid.enabled, false);
  assert.equal(sync.grid.holdMs, 400);
  assert.equal(sync.grid.pickOnRelease, true);
  assert.equal(sync.grid.size, "normal");
});

test("a cleared trigger modifier stays cleared", async () => {
  // The options page writes a bare button trigger without the key at all. The
  // default on macOS and Linux carries `modifier: "Alt"`, and merging one into
  // the other used to hand back the modifier the user had just removed.
  stub({}, { trigger: { kind: "button", button: 2 } });
  const { local } = await loadSettings();
  assert.deepEqual(local.trigger, { kind: "button", button: 2 });
});

test("a key trigger does not keep the default's button fields", async () => {
  stub({}, { trigger: { kind: "key", code: "Space" } });
  const { local } = await loadSettings();
  assert.deepEqual(local.trigger, { kind: "key", code: "Space" });
});

test("nothing stored gives the defaults, both areas", async () => {
  stub({}, {});
  const { sync, local }: { sync: SyncSettings; local: LocalSettings } = await loadSettings();
  assert.equal(sync.version, 4);
  assert.equal(local.version, 2);
  assert.equal(local.uiScale, 1);
});
