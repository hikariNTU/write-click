# FEAT-02 — Rocker and wheel gestures

- **Status:** **done** — the design decision the deferral was waiting for is made and written down,
  as SPEC §3.6 and §3.7: **while the tab grid is on screen it owns the second mouse button and the
  wheel, and neither reaches a gesture until the panel is gone.** Both ship off by default.
- **Priority:** high; the two most-cited features of the category
- **Area:** `src/content/trigger-runtime.ts`, `src/shared/settings.ts`
- **Found:** 2026-08-27, repo review

## The gap

**Rocker** — hold one mouse button, click the other. Left-then-right and right-then-left map to
forward and back. No stroke, no delay, and it is the feature people name first when comparing
crxMouse, Gesturefy, Smooth Gestures and FoxyGestures.

**Wheel** — hold the trigger and turn the wheel to step through tabs. Same appeal: no stroke to
draw, and it lands on the muscle memory people already have from ctrl+tab.

Both are listed as non-goals for v1 in SPEC §1. v1 has shipped; this entry is the note that the
decision is worth revisiting, not a claim that it was wrong.

## Notes before building

- Both are _trigger_ features, not commands. They belong in `attachTrigger`, beside the chorded-press
  handling the tab grid already depends on — and the grid's own picking press is itself a chorded
  press, so the interaction between "second button pressed while the trigger is held" and "rocker"
  has to be decided, not discovered.
- A rocker fires on button-down of the second button, which is the same event `view.onPress` uses to
  pick a tile. If the grid is open, the grid wins.
- Wheel while the trigger is held must `preventDefault` or the page scrolls underneath.
- Both ship **off**, behind the Advanced fold (`ux-01-advanced-fold.md`). They change what a plain
  click does, which is the one thing a gesture extension must not do by surprise.

## What was decided

The deferral was never about the two gestures. It was about the tab grid holding the same button and
the same wheel, and either answer being a design decision rather than a patch. The answer:

- **The grid takes the second button while it is up.** That press is how a tile is picked, and the
  two are the same event. A rocker that fired when the press missed a tile would make missing the
  tile do something, which is worse than not having the rocker.
- **The wheel drives the grid rather than competing with it.** A notch moves the highlight one tab
  and the release switches to it, so the wheel is how the picker already on screen is worked without
  moving the mouse. The first shape of this scrolled the panel instead, which was the wrong answer
  twice over: the panel usually fits without overflow, so the wheel looked dead, and stepping tabs
  by command duplicated a picker that was already open. The wheel's two commands survive only for
  the case where the grid is switched off.

## What it took

- `rockerFrom` reads the chord off `mousedown`, not `pointerdown` — a chorded press fires
  `pointermove`, the same constraint BUG-01's investigation turned up for the grid (§6.1). Only the
  two classic pairs count, and the middle button is left out: holding it means autoscroll on Windows
  and paste on Linux.
- The context menu a rocker owes is swallowed for a second afterwards. It arrives with the press on
  macOS and Linux and with the release on Windows, so a flag cleared on the next event would be
  right on one platform and wrong on the other.
- Wheel deltas are banked and spent in whole notches. Firing per event steps one tab on a mouse
  wheel and about thirty on a trackpad, which report the same flick as dozens of small deltas.
- Both are handed to `attachTrigger` in the top frame only. Each is answered against the grid, the
  grid lives in the top frame, and a sub-frame that guessed would fire a rocker over an open panel.
- Both void the stroke without ending the gesture, so a second rocker fires without letting go of
  the trigger — which is how anyone walks back through history.
- New settings card: rocker and wheel, with a command picker per direction, between gestures and
  overlay. Sync settings are at v7, and the migration brings both in switched off whatever else the
  profile carries.

## Verified

In a loaded unpacked build, headless, six checks on the first pass: the rocker fires from either
pair with the grid off, stays quiet while switched off, the wheel steps tabs with the grid off, and
with the grid on screen neither the wheel nor the second button runs anything.

## What the first two builds got wrong

Both were found by using it rather than by testing it, and both are recorded because the synthetic
checks passed in each case.

1. **One notch was three steps.** `deltaY` for a physical notch is 100 on one platform and 120 on
   another, and a flat 40px bank spent all of it. The highlight jumped to the end of the strip.
2. **The highlight never survived a notch on a real mouse.** Turning a wheel moves the mouse, each
   movement is a `pointermove`, and `hoverAt` reads a pointer in the middle of the window as "over
   no tile" and clears the highlight. A synthetic wheel moves no pointer, so every check passed
   while the feature was invisible in the hand. The wheel now holds the highlight within 24px of
   where it claimed it.
