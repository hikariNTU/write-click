import assert from "node:assert/strict";
import { test } from "node:test";

import { backupFilename, buildBackup, parseBackup } from "./backup.ts";
import { defaultLocalSettings, defaultSyncSettings } from "./settings.ts";

/** A file as `buildBackup` writes one, with `edit` applied to the sync half. */
function file(edit: Partial<ReturnType<typeof defaultSyncSettings>> = {}): string {
  const sync = { ...defaultSyncSettings(), ...edit };
  return JSON.stringify(buildBackup(sync, defaultLocalSettings(), "1.0.0"));
}

test("a backup written here reads back unchanged", () => {
  const sync = defaultSyncSettings();
  const local = defaultLocalSettings();
  const result = parseBackup(JSON.stringify(buildBackup(sync, local, "1.0.0")));
  assert.ok(result.ok);
  assert.deepEqual(result.sync, sync);
  assert.deepEqual(result.local, local);
  assert.equal(result.dropped, 0);
});

test("the filename carries the date it was written", () => {
  assert.equal(
    backupFilename(new Date("2026-08-27T22:10:00Z")),
    "write-click-settings-2026-08-27.json",
  );
});

test("text that is not JSON is refused as such", () => {
  const result = parseBackup("not a file");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "json");
});

test("JSON belonging to something else is refused", () => {
  for (const text of ['{"app":"other","sync":{}}', "[]", "null", "{}"]) {
    const result = parseBackup(text);
    assert.equal(result.ok, false, text);
    assert.equal(result.reason, "shape", text);
  }
});

test("unusable bindings are dropped and counted", () => {
  const result = parseBackup(
    JSON.stringify({
      app: "write-click",
      sync: {
        gestures: {
          R: "tab.next",
          // Not a stroke any recognizer produces, a command that does not
          // exist, and a second stroke for a command that already has one.
          XY: "tab.prev",
          UU: "tab.doesNotExist",
          LLL: "tab.next",
        },
      },
    }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.sync.gestures, { R: "tab.next" });
  assert.equal(result.dropped, 3);
});

test("an emptied gesture map stays empty rather than reverting to the defaults", () => {
  const result = parseBackup(file({ gestures: {} }));
  assert.ok(result.ok);
  assert.deepEqual(result.sync.gestures, {});
});

test("values outside what a control can produce fall back or clamp", () => {
  const result = parseBackup(
    JSON.stringify({
      app: "write-click",
      sync: {
        language: "kl_KL",
        grid: { holdMs: 99_999, size: "enormous", enabled: "yes" },
        trail: { color: "javascript:alert(1)", width: -4 },
        disabledOrigins: ["https://example.com", "https://example.com/path", 7, "nonsense"],
      },
      local: { uiScale: 40, trigger: { kind: "wheel" } },
    }),
  );
  assert.ok(result.ok);
  const defaults = defaultSyncSettings();
  assert.equal(result.sync.language, "auto");
  assert.equal(result.sync.grid.holdMs, 1000);
  assert.equal(result.sync.grid.size, defaults.grid.size);
  assert.equal(result.sync.grid.enabled, defaults.grid.enabled);
  assert.equal(result.sync.trail.color, defaults.trail.color);
  assert.equal(result.sync.trail.width, 2);
  assert.deepEqual(result.sync.disabledOrigins, ["https://example.com"]);
  assert.equal(result.local.uiScale, 2);
  assert.deepEqual(result.local.trigger, defaultLocalSettings().trigger);
});

test("a cleared modifier survives the round trip", () => {
  // The whole reason `trigger` replaces its default instead of merging into it:
  // a bare right button must not come back carrying a modifier.
  const result = parseBackup(
    JSON.stringify({ app: "write-click", local: { trigger: { kind: "button", button: 2 } } }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.local.trigger, { kind: "button", button: 2 });
});

test("a key trigger keeps its code, and a nonsensical one does not", () => {
  const keyed = parseBackup(
    JSON.stringify({ app: "write-click", local: { trigger: { kind: "key", code: "Space" } } }),
  );
  assert.ok(keyed.ok);
  assert.deepEqual(keyed.local.trigger, { kind: "key", code: "Space" });

  const junk = parseBackup(
    JSON.stringify({ app: "write-click", local: { trigger: { kind: "key", code: "<img>" } } }),
  );
  assert.ok(junk.ok);
  assert.deepEqual(junk.local.trigger, defaultLocalSettings().trigger);
});

test("the stored version is this build's, not the file's", () => {
  const result = parseBackup(JSON.stringify({ app: "write-click", sync: { version: 2 } }));
  assert.ok(result.ok);
  assert.equal(result.sync.version, defaultSyncSettings().version);
  assert.equal(result.local.version, defaultLocalSettings().version);
});
