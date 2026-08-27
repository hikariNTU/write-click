# UX-02 — Teach the trigger, do not describe it

- **Status:** done — 2026-08-27. All three pieces: the two-way question with the raw controls
  behind a fold in the Trigger card, the animated mouse glyph, and the try-it pad. Eleven checks
  against a real loaded `dist/`, including a near miss being named and both rows writing the
  trigger they promise.
- **Priority:** high — this is the confusion, not a polish item
- **Area:** `src/options.ts`, new welcome page
- **Found:** 2026-08-27, repo review

## The problem

The trigger is per-device, platform-dependent, and its default on macOS and Linux is **Alt + right
button**. Today the user is asked to assemble that understanding from three dropdowns (Hold /
Button / Modifier) and an amber warning paragraph. The popup prints the trigger as a sentence. None
of it is read before the first gesture fails, and a failed gesture is silent.

## Reframe the question first

The decision behind those three dropdowns is really one question: **do you want to keep the native
context menu?** Lead the Trigger card with that, as a two-way choice:

- **Right button** — fastest. The context menu is suppressed; Shift+right-click still opens it.
- **Option + right button** — the context menu stays.

The raw Hold / Button / Modifier controls move behind the Advanced fold
(`ux-01-advanced-fold.md`) — shipped here as a closed `<details>` in the Trigger card alone, since
UX-01's own knobs need a storage change this did not. The fold opens by itself for a trigger neither
row can name, because the controls that set it are then the only place it is visible. The warning paragraph stops being a warning and becomes the description
of the option the user picked.

The two-way choice is platform-shaped: `menuFiresOnMouseDown()` already knows which explanation is
true here, and SPEC §3.1 records why the platforms differ.

## Three pieces, cheapest first

**1. A try-it pad in the Trigger card.** `drawPad()` already exists in the Gestures card, but it
responds to _any_ pointer press, so it teaches nothing about the trigger. A second pad, wired
through the real `attachTrigger(local.trigger, …)`, responds only to the configured trigger and has
three states:

- idle — "hold ⌥ and the right button, then draw"
- wrong input — "that was a plain right button. Hold ⌥ as well."
- success — the stroke, and the command it matched

Mostly existing code. This _is_ the tutorial; everything else is decoration on it.

**2. An animated mouse glyph** beside the trigger rows. Inline SVG mouse, the selected button lit,
a looping CSS animation: press, drag an `L`, release, with the path revealed through
`stroke-dasharray`. Redrawn when the trigger changes. Static under `prefers-reduced-motion`. It ties
three abstract dropdowns to one picture, which is what a first-time reader needs.

**3. The welcome page** — see `feat-01-onboarding.md`, which reuses both of the above rather than
duplicating them.

## Constraint

The glyph is artwork, so it goes in `src/icons/` beside `write-click.svg` — never in
`src/icons/material/`, which `scripts/sync-icons.mjs` wipes on every build. Shipped as
`src/icons/mouse-trigger.svg`, with its keyframes in `src/mouse-glyph.css`; the clipPath id is
rewritten per instance, or a second glyph on the page is clipped by the first one's shape.

## One more thing it needed

The modifier is named as the keyboard prints it — Option and Command on macOS — everywhere the
trigger is stated, not only in the dropdown that already did it. `modifierName` in
`src/trigger-ui.ts` is now the single place that decides, and the popup's own copy of the trigger
sentence was deleted in favour of it.
