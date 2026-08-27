# BUG-03 — The grid toggle and grid size need a page reload

- **Status:** done — fixed 2026-08-27 — the grid is always built, `setSize()` is live, `scheduleGrid` reads `enabled`
- **Severity:** medium — a setting that looks dead
- **Area:** `src/content/view.ts`, `src/content/tab-grid.ts`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

Turning the tab grid on in options does nothing on tabs that are already open. Changing the size
between compact / normal / large does nothing either. Every other setting — trail, colour, readout,
cheatsheet, hold delay, trigger, per-origin disable — applies live through `storage.onChanged`, so
these two read as broken rather than as needing a reload.

## Cause

`createView` builds the grid once, and takes the size as a constructor argument:

```ts
const grid = sync.grid.enabled ? new TabGrid(overlay, sync.grid.size) : undefined;
```

`refresh()` only calls `setScale` and `setGestures`. There is no path that constructs a grid that
was absent at load, drops one that has been switched off, or changes `#size` on a live one.

Contrast `Trail`, which is handed `() => sync.trail` precisely so a replaced settings object is
picked up — the pattern to follow is already in the file.

## Fix

Either rebuild the grid in `refresh()` when `enabled` or `size` has changed since it was built, or
give `TabGrid` a `setSize()` and have `refresh()` construct/tear down on the toggle. The second is
less churn: the panel is already re-laid-out on every `show()`, so `#size` only has to be swapped
before the next one.
