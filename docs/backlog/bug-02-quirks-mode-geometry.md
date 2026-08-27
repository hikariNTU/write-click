# BUG-02 — Quirks-mode pages break the overlay's geometry

- **Status:** done — fixed 2026-08-27 — both call sites read `viewport()` from `src/content/viewport.ts`
- **Severity:** high on affected pages
- **Area:** `src/content/trail.ts`, `src/content/tab-grid.ts`
- **Found:** 2026-08-27, repo review, confirmed in a loaded unpacked build

## Symptom

On any page served without a doctype — `document.compatMode === "BackCompat"` — the trail is drawn
squashed and offset from the cursor, and the tab grid's panel overruns its height budget and slides
under the cheatsheet panel.

## Evidence

Fixture page with no doctype, body 3000px tall, viewport 1200×739:

```
[wc-debug] {"scale":1,"clientH":3016,"room":{"width":1176,"height":2968},"cap":1484}
innerHeight 739
```

`clientHeight` came back as **3016** against an `innerHeight` of **739**. The tiles panel's cap
became 1484 instead of 345, and it rendered 537px tall, running under the cheatsheet. The trail's
head was painted near the top of the window while the pointer sat at 78% of its height.

Adding `<!doctype html>` to the same fixture restored `clientH: 739` and `cap: 345.5`.

## Cause

Two places read the viewport through the root element:

- `Trail.#resize()` sizes the canvas bitmap from `document.documentElement.clientWidth/clientHeight`
- `TabGrid.#room()` budgets both panels from the same pair

In standards mode those are the viewport. In quirks mode they are the root element's own box — the
whole document. The trail's bitmap then does not match its CSS box (`fixed inset-0 h-full w-full`)
and the browser squeezes it to fit, which is exactly the drift the existing comment in `#resize`
warns about for scrollbars, arriving through a different door.

## Fix

Both sites take the viewport from the right element:

```ts
const root = document.compatMode === "BackCompat" ? document.body : document.documentElement;
```

`clientWidth`/`clientHeight` on that element are the layout viewport in both modes, and the
scrollbar reasoning in `#resize`'s comment still holds — which is why `innerWidth`/`innerHeight`
are not the answer here.

Worth a note in SPEC §7.4 beside the scale rules: the layout viewport is read from `body` in quirks
mode, and design sizes stay screen sizes either way.
