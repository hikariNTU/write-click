# Store assets

Verify every dimension against the dashboard before finalising — these were correct at time of
writing and Google changes them without much noise.

## Listing images

| Asset              | Size                | Required          | Notes                                                     |
| ------------------ | ------------------- | ----------------- | --------------------------------------------------------- |
| Screenshot         | 1280×800 or 640×400 | Yes, at least one | Up to five. 1280×800 looks far better on the listing page |
| Small promo tile   | 440×280             | Yes               | Shown in search results and category pages                |
| Marquee promo tile | 1400×560            | No                | Only used if featured                                     |

Only the screenshots are generated so far. The promo tiles are still to do.

## The captures

```bash
npm run shots      # -> shots/out/<locale>/
```

`scripts/shots.ts` drives a freshly built `dist/` through Playwright, headless, at 2× into 1280×800.
It rebuilds first: `npm run dev` writes to `dist-dev/` so it cannot poison the output, but a stale
`dist/` is still a screenshot of the wrong extension. `shots/out/` is emptied on every run, so a
shot that stops being taken stops being on disk — a PNG from two runs ago is indistinguishable from
a fresh one, and just as uploadable.

**Captured at** records the extension version in the image. It is how staleness becomes a recorded
fact rather than a remembered one: at each release, ask whether anything in that release's changelog
entry changes what one of these shows, and re-capture only those. A listing edit is reviewed but
needs no version bump, so a re-capture can be submitted on its own.

| #   | File         | Shows                                                               | Captured at |
| --- | ------------ | ------------------------------------------------------------------- | ----------- |
| 1   | `1-gesture`  | A stroke mid-draw, with the readout naming what it matched          | —           |
| 2   | `2-grid`     | The tab grid open, a tile under the pointer, the gesture list below | —           |
| 3   | `3-options`  | The settings page, side nav and the first cards                     | —           |
| 4   | `4-gestures` | The gestures card, cropped                                          | —           |
| 5   | `5-overlay`  | The overlay card, cropped                                           | —           |

1 and 2 carry the listing: between them they are the whole extension. 1 draws
`URD` — close the tabs to the right — because its readout says something a static feature list
cannot: how many tabs it would _actually_ close, counted with the same filter the background uses.

3 is a full window at listing size. 4 and 5 are cropped to their card and kept at 2×, for the
README, where they sit at whatever width the column is.

**A capture is not a listing image.** These are bare screenshots. Composing one with a headline on a
background is a separate step and deliberately not built yet: the copy is the part that gets
rewritten fifteen times, and rewriting it should not mean re-capturing the set.

## How the harness works

**No fixture to seed by hand.** Every piece of state this extension has is a `chrome.storage` key,
so the harness writes what each shot needs through the service worker and reloads. Nothing here
needs a person to click a permission prompt, which means a run is repeatable and cold-startable.

**The target is ours.** `shots/fixtures/page.html` is a plain page with a `<title>` set from
`?title=`, served over `localhost`. Gestures work over any HTML5 document, so there is nothing to
gain from automating somebody else's site and inheriting its redesigns and sign-in walls — and a
store screenshot showing an interface that does not exist is a fabricated context.

Four things about it are less obvious than they look, and each was a wrong screenshot first:

**It waits for `migrate()` before seeding anything.** The migration reads storage and writes the
merged result back, and a fresh profile means it is running at exactly the moment the harness
connects. A seed written between those two moments is read as absent and overwritten by the
defaults — which showed up as a gesture that never fired at all, because the platform default pairs
the right button with Alt and the seed had cleared it.

**It seeds a bare right button rather than the platform default.** The default is
platform-dependent (§3), and a capture that changes shape with the host machine is not a capture.

**The tab strip is built through `chrome.tabs`, not `context.newPage()`.** The grid lists one
window's tabs, and Playwright makes no promise about which window a new page lands in. Created from
the worker against the shot tab's own `windowId`, every tab is a tab of the window the shot is taken
in, at a known index — which is what gives close-to-the-right a number. The run asserts the strip
came out the length it asked for.

**Escape cancels each stroke before the button comes up.** Shot 1 draws _close the tabs to the
right_. Released normally it closes four of the harness's own tabs, and the grid shot then
photographs the three survivors and calls it a seven-tab strip. `intact()` re-checks the strip after
every locale so a gesture that escapes cannot pass silently.

## Locales

One folder per locale the extension ships — `en` and `zh_TW` — because the dashboard takes its own
images per listing language. Seeding a language is one `storage.sync` write and a reload, so
capturing both costs a loop rather than a second session.

The fixture page underneath stays English. It is the page being drawn _over_, not extension
interface, and what a visitor reads in these images is the readout, the tiles and the cards.
