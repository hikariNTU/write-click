# UX-01 — An Advanced fold for the knobs that are constants today

- **Status:** ongoing
- **Area:** `src/options.ts`, `src/shared/settings.ts`
- **Found:** 2026-08-27, repo review

## The gap

Everything below is a hardcoded constant. Each is a setting a competing extension exposes, and each
is one someone eventually files an issue about. They do not belong in the main flow — the options
page is currently readable precisely because it is short — so they go behind a closed `<details>`
inside the card they belong to.

## The knobs

**Recognition** — `src/shared/recognizer.ts`

- `SEGMENT_MIN` (32), `HYSTERESIS_DEG` (28), `DRIFT_THRESHOLD` (8), `MAX_SEGMENTS` (6)

Every competitor ships these as one "sensitivity" slider. Do that: a single control that moves
`SEGMENT_MIN` and `HYSTERESIS_DEG` together, with the raw four behind the fold for anyone who wants
them. Note that the options draw pad shares `quantize`, so a sensitivity change is visible in the
pad immediately — which is the demo.

**Gesture timeout** — does not exist. A trigger held forever keeps the overlay alive forever.

**Trail** — `src/content/trail.ts`: `MIN_STEP` (3), the glow multiplier, `PANEL_ALPHA` (0.3),
`FEATHER` (12).

**Grid** — `src/content/tab-grid.ts`: `TILES_SHARE` (0.5) and `CHEATSHEET_SHARE` (0.28), a cap on
how many tabs are listed, and "skip tabs in collapsed groups". The panel budget matters more than it
looks: with many tabs open, half the window is not enough to reach them all, and the panel cannot be
scrolled while a button is held.

**Custom command: open a URL**, with `%s` for the current selection. One row in the gestures list,
no new API, and it hands the user search-with-anything, a home page, and bookmarklets in a single
feature.

**Rocker / wheel toggles** once `feat-02-rocker-and-wheel.md` exists. Off by default, and this is
where they live.

**Diagnostics switch.** Five `console.debug` sites fire unconditionally in the content script today.

## Storage

One `advanced` object on `SyncSettings` with defaults. `read()` merges one level deep for exactly
this reason, so new fields inside it appear without a migration step — but the version bump and the
`migrate()` entry are still required by SPEC §9, and `advanced` must **not** join `REPLACED`.

## Fold mechanics

A closed `<details>` inside `card()`, summary carrying the section name plus "Advanced". Keep the
summary a `Localized` string like everything else — `docs/wording.md` governs it.
