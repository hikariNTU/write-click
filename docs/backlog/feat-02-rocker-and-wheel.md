# FEAT-02 — Rocker and wheel gestures

- **Status:** ongoing — **deferred on 2026-08-27**, deliberately, not for want of appetite. Both
  gestures fight the tab grid, which is held open under exactly the same trigger. A wheel tick over
  the grid is how someone scrolls the panel to reach a tile that is past the clip, and spending it on
  a tab switch instead takes a working interaction away to add another one. The rocker has the same
  problem from the other side: the grid is picked with a click of the other button while the trigger
  is still held, which is a rocker press by any definition. Neither ships until there is an answer to
  that — the obvious one being that the grid swallows the wheel and the second button while it is on
  screen, and the gesture only sees them when it is not. That is a design decision, not a patch, and
  it belongs in SPEC §6 before any of this is written.
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
