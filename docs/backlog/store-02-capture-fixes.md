# STORE-02 — Fix the captures before composing slides

- **Status:** ongoing
- **Area:** `scripts/shots.ts`, `shots/fixtures/page.html`, `docs/store-assets.md`
- **Found:** 2026-08-27, repo review of `shots/out/en/`

## Per capture

**`1-gesture`** — the strongest of the five. The readout naming "Close 4 tabs to the right" with a
real count is the thing that sells the extension, and no static feature list can say it. Two
problems for a listing image: the stroke's tail crosses body text on its way down, and the readout
card lands on top of the "Read the match" heading. Move the stroke into clear space, or move the
fixture's content out from under it.

**`2-grid`** — the bottom row of tiles ("Notes — this week") is cut through the middle by the
panel's `max-height`. It reads as a broken image rather than as a list that continues. Size the
fixture's tab strip so the last row lands whole. This is the same clipping as `bug-01`, seen from
the outside.

**`3-options`** — weakest as a listing image. The left third is empty navigation, only three cards
are visible, and the most eye-catching object in the frame is the amber context-menu warning. A
store visitor's eye lands on a warning. Crop to the Gestures card, or scroll past the trigger card.

**`4-gestures`, `5-overlay`** — README material, fine as they are, and `store-assets.md` already
says that is what they are for.

## Missing captures

Nothing in the set shows either of the two newest features:

- the **cheatsheet** panel on its own — the gesture list that appears while the trigger is held is
  the answer to "how would I ever remember these", and it is invisible in the current set
- **tab groups and a second window** in the grid — `2-grid` predates both

## Proposed slide set

Five, the store maximum.

| #   | Headline                                  | Frames                                            |
| --- | ----------------------------------------- | ------------------------------------------------- |
| 1   | Draw a gesture, get a command             | `1-gesture`                                       |
| 2   | Hold still and every tab is a tile        | `2-grid`, reshot with a group and a second window |
| 3   | Every stroke is yours                     | `4-gestures` + the draw pad, `.pair`              |
| 4   | It teaches you the strokes while you draw | new cheatsheet capture                            |
| 5   | Your machine, your rules                  | trigger / overlay / sites, `.trio`                |

Copy is a `copy.json` question, not a capture question — see `store-01-slide-pipeline.md`.

## Also outstanding

`docs/store-assets.md` still records the promo tiles as not done: 440×280 is **required** for the
listing, 1400×560 is optional and only used if featured.
