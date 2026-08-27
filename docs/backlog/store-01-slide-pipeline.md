# STORE-01 — Compose listing images from the captures

- **Status:** ongoing
- **Area:** new `scripts/slides.ts`, new `shots/slides/`, `docs/store-assets.md`
- **Found:** 2026-08-27, repo review

## The gap

`docs/store-assets.md` says it plainly: "A capture is not a listing image… Composing one with a
headline on a background is a separate step and deliberately not built yet." That is still true, and
the reason given — the copy gets rewritten fifteen times and rewriting it should not mean
re-capturing the set — is exactly the reason to build it as a _second_ stage rather than fold it
into `scripts/shots.ts`.

## The reference implementation

`danmaku-ninja` (sibling repo) has this working. Worth reading before writing anything:

- `scripts/slides.mjs` — the renderer
- `shots/slides/slide.css` — one 1280×800 slide
- `shots/slides/copy.json` — the words
- `shots/slides/1-replay.html`, `4-yours.html` — a single-frame and a three-frame slide

How it is put together:

- Two stages. `npm run shots` writes raw captures to `shots/out/<locale>/`; `npm run shots:slides`
  composes them into `shots/submit/<locale>/`. `shots/submit` is wiped each run, so a slide that was
  renamed or dropped cannot linger as an uploadable PNG.
- A slide is a bare HTML file: an empty `<h1>`, an empty `<p>`, and one or more
  `<figure><img src="../out/X.png">`. It carries no words of its own.
- Copy lives in `copy.json`, keyed slide → locale → `{ h1, p }`, injected at render time.
  `*asterisks*` in the h1 mark the phrase that takes the accent gradient — a marker rather than
  markup, so the copy file stays something a person can edit.
- `slide.css`: header locked to a fixed 128px so slides seen in a row do not jump; the fixture's own
  mesh gradient, dimmed, as the background; captures scaled to fit and never cropped, because the
  crop always takes the corner the interesting thing lives in; `.pair` and `.trio` variants that
  size by width and by height respectively.
- Playwright at `deviceScaleFactor: 2` with `scale: "css"` — Chrome's downscale of a 2× render is
  sharper than a 1× render. Waits `networkidle`, then `document.fonts.ready`. Collects
  `requestfailed` so a slide pointing at a capture that is not there fails the run instead of
  rendering a gap.
- Per-locale font stack set on `body` at render time.

## For write-click

- Two locales, `en` and `zh_TW`, matching what `src/public/_locales` ships — the dashboard derives
  the language list from the package.
- `.ts` rather than `.mjs`, run the way `npm run shots` is:
  `node --import @oxc-node/core/register ./scripts/slides.ts`.
- The captures underneath stay as they are; only the composition is new.
- Keep `docs/store-assets.md`'s "Captured at" discipline. It applies to slides too: a slide is stale
  when its capture is.

## Related

`store-02-capture-fixes.md` — what to reshoot before composing anything.
