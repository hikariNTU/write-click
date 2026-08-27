# BUG-01 — Tiles outside the panel's clip stay pickable

- **Status:** done — fixed 2026-08-27 — `#tileAt` clips against the panel rect first
- **Severity:** high — silent wrong behaviour
- **Area:** `src/content/tab-grid.ts`
- **Found:** 2026-08-27, repo review, confirmed in a loaded unpacked build

## Symptom

Releasing the trigger over blank page, nowhere near a visible tile, switches to a tab the user
never saw. No highlight appears anywhere on screen first, so there is no warning and no way to
connect the result to the action.

## Evidence

31 tabs, standards-mode page, 1200×739 viewport. The tiles panel is capped at half the window and
its bottom edge measured at y≈369. The trigger was held, the pointer moved to y=576 — the empty
band between the tiles panel and the cheatsheet panel — and released. Chrome switched to **Tab-24**,
whose tile is scrolled out of the panel's overflow clip.

Reproduced independently of BUG-02: the run above was on a page with a doctype, where the panel's
height budget is computed correctly.

## Cause

```ts
#tileAt(point: Point): Tile | undefined {
  if (!this.#visible) return undefined;
  return this.#tiles.find(({ node }) => containsPoint(node.getBoundingClientRect(), point));
}
```

Every tile is hit-tested against its own viewport rect and nothing else. The panel is
`overflow-y-auto` with a `max-height`, so a tile scrolled past the clip still has a rect — one that
lands far below the panel, in the middle of the window where the stroke is drawn.

Both `pickAt()` and `hoverAt()` go through `#tileAt`, so the phantom tile is also what
`hoveredTabId` reports, which is what `pickOnRelease` acts on.

## Fix

Intersect against the panel's own box before accepting a hit:

- take `this.#panel.getBoundingClientRect()` once per call
- reject any tile whose rect is not inside it (a centre-point test is enough, and it also drops the
  half-row that straddles the clip edge)

## Related

A second-order problem the fix does not solve: with the panel capped at half the window and no way
to scroll it while a button is held, tabs below the fold are simply unreachable. See
`feat-04-command-catalogue.md` and `ux-01-advanced-fold.md` for the panel-budget knob.
