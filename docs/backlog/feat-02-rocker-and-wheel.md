# FEAT-02 — Rocker and wheel gestures

- **Status:** ongoing — currently a declared v1 non-goal (SPEC §1)
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
