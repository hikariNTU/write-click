# Store assets

Verify every dimension against the dashboard before finalising — these were correct at time of
writing and Google changes them without much noise.

## Listing images

| Asset              | Size                | Required          | Notes                                                     |
| ------------------ | ------------------- | ----------------- | --------------------------------------------------------- |
| Screenshot         | 1280×800 or 640×400 | Yes, at least one | Up to five. 1280×800 looks far better on the listing page |
| Small promo tile   | 440×280             | Yes               | Shown in search results and category pages                |
| Marquee promo tile | 1400×560            | No                | Only used if featured                                     |

The screenshots and the listing images they compose into are generated. The promo tiles are still
to do: 440×280 is required for the listing, 1400×560 is optional and only used if featured.

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

| #   | File                | Shows                                                               | Captured at |
| --- | ------------------- | ------------------------------------------------------------------- | ----------- |
| 1   | `1-gesture`         | A stroke mid-draw, with the readout naming what it matched          | 1.0.0       |
| 2   | `2-grid`            | The tab grid open, a tile under the pointer, one named group        | 1.0.0       |
| 3   | `3-options`         | The settings page, side nav, the trigger card and its pad           | 1.0.0       |
| 4   | `4-gestures`        | The gestures card, cropped                                          | 1.0.0       |
| 5   | `5-overlay`         | The overlay card, cropped                                           | 1.0.0       |
| 6   | `6-cheatsheet`      | The bottom of the window mid-gesture: the stroke and the cheatsheet | 1.0.0       |
| 7   | `7-welcome`         | The welcome page as a whole window                                  | 1.0.0       |
| 8   | `8-gestures-window` | The settings page scrolled to the gesture rows, at listing size     | 1.0.0       |
| 9   | `9-welcome-trigger` | The welcome page's trigger card, cropped                            | 1.0.0       |

1 and 2 carry the listing: between them they are the whole extension. 1 draws
`URD` — close the tabs to the right — because its readout says something a static feature list
cannot: how many tabs it would _actually_ close, counted with the same filter the background uses.

3, 7 and 8 are full windows at listing size. 4, 5, 6 and 9 are cut to one region and kept at 2×.
A crop is not only a README convenience: a region 624 CSS pixels wide is 1248 real pixels, so it
fills the width of a slide while still being downscaled — which is how the sentence naming the
trigger comes out large enough to read rather than merely recognise. 4 and 5 stay README material,
where they sit at whatever width the column is.

**Captured with reduced motion on.** The mouse glyph animates its press on a three second loop, and
an untimed screenshot lands wherever it lands: a stub of a stroke, or a button that happens to be
unlit. `prefers-reduced-motion` is a state the extension ships, and it is the frame worth keeping —
the lit button, the raised keycap and the finished stroke, held still.

**A capture is not a listing image.** These are bare screenshots. Composing one with a headline on a
background is the second stage below: the copy is the part that gets rewritten fifteen times, and
rewriting it must not mean re-capturing the set.

## The slides

```bash
npm run shots:slides   # shots/out/<locale>/ -> shots/submit/<locale>/
```

`scripts/slides.ts` renders each file in `shots/slides/` at 1280×800, once per listing language.
`shots/submit/` is emptied on every run, so a slide that was renamed or dropped cannot linger as an
uploadable PNG, and a slide asking for a capture that is not in `shots/out/` fails the run instead
of rendering a gap.

A slide is a bare HTML file: an empty `<h1>`, an empty `<p>`, and one or more
`<figure><img data-shot="…">`. It carries no words and no locale of its own. The copy lives in
`copy.json`, keyed slide → locale, and the capture is resolved at render time against the listing
being built — the interface inside the frame is in the listing's own language, since the extension
ships its whole interface in both.

**`copy.json` is governed by [`docs/wording.md`](wording.md)**, including its new section on listing
copy. A headline may be written to persuade; it may not overstate, drop the terminology table, or
let the Chinese read as a translated English sentence.

| #   | Slide          | Says                                             | Frames              |
| --- | -------------- | ------------------------------------------------ | ------------------- |
| 1   | `1-draw`       | The readout names and counts before the release  | `1-gesture`         |
| 2   | `2-grid`       | Hold the trigger and every tab becomes a tile    | `2-grid`            |
| 3   | `3-cheatsheet` | The gesture list stays on screen while drawing   | `6-cheatsheet`      |
| 4   | `4-yours`      | Every gesture is rebindable by drawing           | `8-gestures-window` |
| 5   | `5-welcome`    | The trigger is named for this device, on install | `9-welcome-trigger` |

They read in that order, and each names one thing that is true of the capture beside it.

**No slide holds three frames.** Three 1280×800 captures side by side put the extension's own 13px
interface text at about four pixels, which is a texture rather than a screenshot. Where a slide
needs to show more, the capture is cut tighter rather than shrunk further.

**Staleness works the same as for a capture.** A slide is stale when its capture is, and re-running
the composition is cheap; re-capturing is the expensive half, which is why the two stages are split.

## How the harness works

**No fixture to seed by hand.** Every piece of state this extension has is a `chrome.storage` key,
so the harness writes what each shot needs through the service worker and reloads. Nothing here
needs a person to click a permission prompt, which means a run is repeatable and cold-startable.

**The target is ours.** `shots/fixtures/page.html` is one page, dressed by two query parameters:
`?title=` names the tab and the heading, `?hue=` picks the whole palette. Gestures work over any
HTML5 document, so there is nothing to gain from automating somebody else's site and inheriting its
redesigns and sign-in walls — and a store screenshot showing an interface that does not exist is a
fabricated context. It is not a grey page, though: a wall of text under the overlay says nothing
about how the overlay reads over a real one, which is the only thing a screenshot of an overlay is
for.

**Every tab in the strip is a hostname, not `localhost`.** Chromium is launched with
`--host-resolver-rules=MAP * 127.0.0.1:<port>`, so `mail.example.com` and the rest resolve back to
the fixture server. The tiles show the host, and seven tiles all reading `localhost:8971` say
nothing about what the grid is for. The names sit under `example.com`, the domain reserved for
exactly this, and the pages behind them are still ours. Favicons are generated per hue by the same
server and served over http — `chrome.tabs` hands back a `data:` URL favicon verbatim, and the grid
only draws `http(s)` ones, so an embedded icon would come out as seven copies of the fallback glyph.

**Strokes are drawn by hand, not ruled.** Each leg bows out from its straight line, the corners are
cut rather than turned on a point, and every sample strays about a pixel. A ruled polyline is a
diagram of a gesture rather than a gesture. The noise is seeded, so two runs still capture the same
stroke, and the bows are small next to the legs — the recognizer quantizes by dominant direction, so
what is drawn is still what is matched.

Four more things are less obvious than they look, and each was a wrong screenshot first:

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
