# Backlog — open findings

> **STATUS: ONGOING — 8 of 17 open.** The list came out of a full-repo review on **2026-08-27**,
> against `8da32d3`. **Every bug is done.** BUG-01, BUG-02, BUG-03 and BUG-09 went first, then
> BUG-04 through BUG-08; each was verified against a real loaded `dist/` where it had a visible
> symptom — 7 of 7 checks on the first pass, 6 of 6 on the second, BUG-04 with a negative control.
> What is left is the nine features, store items and interface items: no bug among them.
>
> Read this index before starting new work on write-click.
>
> When an item is done, change its `Status` line to `done` inside its own file, tick it here, and
> say so in the same commit that fixes it. When the last one is ticked, this banner goes.

One file per finding. Each carries a status, the area it touches, and enough detail to start from
cold — the evidence, the cause, and the shape of the fix.

## Bugs

| ID                                                 | Status   | Severity | Finding                                                                                                                                                   |
| -------------------------------------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BUG-01](bug-01-occluded-tiles-pickable.md)        | **done** | high     | Tiles scrolled out of the panel's clip stay pickable — a release over blank page switches to a tab the user never saw. **Confirmed in a loaded build.**   |
| [BUG-02](bug-02-quirks-mode-geometry.md)           | **done** | high     | Quirks-mode pages break the overlay's geometry: the trail draws offset from the cursor and the grid overruns its budget. **Confirmed in a loaded build.** |
| [BUG-03](bug-03-grid-settings-not-live.md)         | **done** | medium   | The grid toggle and grid size need a page reload; every other setting is live.                                                                            |
| [BUG-04](bug-04-left-button-selection.md)          | **done** | medium   | A left-button trigger selects text and drags links.                                                                                                       |
| [BUG-05](bug-05-key-capture-armed-forever.md)      | **done** | medium   | The options key capture stays armed — the next keystroke anywhere rebinds the trigger.                                                                    |
| [BUG-06](bug-06-drawpad-escape-eats-first-key.md)  | **done** | low      | The draw pad's Escape handler is consumed by the first key of any kind.                                                                                   |
| [BUG-07](bug-07-onpress-listener-never-removed.md) | **done** | low      | `onPress` is the one listener `apply()` never tears down.                                                                                                 |
| [BUG-08](bug-08-groups-undefined-get.md)           | **done** | low      | `groupsOf` can call `tabGroups.get(undefined)`.                                                                                                           |
| [BUG-09](bug-09-fullscreen-loses-maximized.md)     | **done** | low      | Leaving fullscreen restores "normal", losing a maximized window.                                                                                          |

## Features

| ID                                      | Status  | Finding                                                                                     |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| [FEAT-01](feat-01-onboarding.md)        | ongoing | Nothing tells a new user what their trigger is. Highest-value gap on this page.             |
| [FEAT-02](feat-02-rocker-and-wheel.md)  | ongoing | Rocker and wheel gestures — a declared v1 non-goal, worth revisiting now v1 has shipped.    |
| [FEAT-03](feat-03-context-targets.md)   | ongoing | No command knows what is under the cursor: links, images, selections.                       |
| [FEAT-04](feat-04-command-catalogue.md) | ongoing | Catalogue gaps — clipboard, Chrome pages, tab-group writes, moving tabs, print, `commands`. |

## Store listing

| ID                                     | Status  | Finding                                                                                                         |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| [STORE-01](store-01-slide-pipeline.md) | ongoing | Compose listing images from the captures. `danmaku-ninja` has a working reference.                              |
| [STORE-02](store-02-capture-fixes.md)  | ongoing | Reshoot before composing: a clipped tile row, a warning box in frame, nothing showing groups or the cheatsheet. |

## Interface

| ID                                 | Status  | Finding                                                                                              |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| [UX-01](ux-01-advanced-fold.md)    | ongoing | An Advanced fold for the dozen knobs that are constants today.                                       |
| [UX-02](ux-02-trigger-tutorial.md) | ongoing | Teach the trigger instead of describing it: reframe the question, add a try-it pad and an animation. |

## Suggested order

~~1. **BUG-01, BUG-02** — silent wrong behaviour, both confirmed, both small.~~ done
~~2. **BUG-03** — a setting that looks dead.~~ done.
~~3. **BUG-04 – BUG-08** — the rest of the bugs.~~ done. 4. **FEAT-01 + UX-02** — the trigger confusion, which is the one thing costing first-run users. 5. **STORE-01 + STORE-02** — needed before the listing can be finished; the promo tiles are still
outstanding in `docs/store-assets.md` too. 6. Everything else, in whatever order the appetite runs.
