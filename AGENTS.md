# AGENTS.md

**Read [`docs/SPEC.md`](docs/SPEC.md) first.** It holds the frozen decisions — trigger model,
stroke table, tab grid behaviour, storage shape, phase plan. If code and spec disagree, one is a
bug. Behaviour changes update the spec in the same commit.

## Stack

Vite + `@crxjs/vite-plugin` (MV3), TypeScript strict, Tailwind v4 via `@tailwindcss/vite`,
oxlint + oxfmt. `root` is `src/`, output is `dist/`. `src/manifest.json` is the build entry:
content scripts and the service worker are listed there as `.ts` paths and crxjs rewrites them.

## Commands

```bash
npm run build      # src/ -> dist/
npm run dev        # watch mode, writes dist-dev/ (never dist/)
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # oxfmt .
npm test           # node --test through @oxc-node/core, runs *.test.ts directly
npm run shots      # store screenshots -> shots/out/ (docs/store-assets.md)
npm run assets     # re-sync glyphs and re-render icon PNGs (prebuild/predev do this)
npm run bump patch # or minor / major — versions must agree across all three files
```

Generated assets are committed, and CI fails if a build changes them.

Load `dist/`, never `src/`, as the unpacked extension — or `dist-dev/` when running `npm run dev`. A phase is done when build, typecheck and
lint are all clean and the behaviour is verified in a loaded unpacked build.

## Layout

- `src/content/index.ts` — content script entry, top frame only for now
- `src/content/overlay.ts` — closed shadow root, adopts the Tailwind sheet
- `src/content/styles.css` — imported `?inline`, adopted into the shadow root so preflight is scoped
- `src/background/service_worker.ts` — tab commands
- `src/shared/trigger.ts` — trigger types, per-platform defaults, context-menu timing
- `src/icons/material/` — vendored Material Symbols glyphs, **generated**; `scripts/sync-icons.mjs`
  wipes this directory on every build. Never put hand-authored artwork in it.
- `src/icons/` — hand-authored artwork: `write-click.svg`, plus `write-click-small.svg` for 16/32px
  (detail below 48px reads as mud, so the small variant is the W alone)
- `src/images/` — **generated** PNGs rendered from that SVG by `scripts/render-icons.mjs`
- `src/shared/icons.ts`, `src/shared/recognizer.ts` — shared by the content script and the options
  page; the options draw pad must keep using the same `quantize`
- `src/options.ts`, `src/popup.ts`, `src/ui.ts` — extension pages and their shared DOM helpers
- `src/public/_locales/` — message catalogues, copied to `dist/_locales` by Vite's public dir
- `src/shared/i18n.ts` — `t()`, with keys typed from the English catalogue

## Tests

Tests run on Node's built-in runner, no framework, loaded through `@oxc-node/core` — Node's own type
stripping does not resolve extensionless specifiers, so anything importing `./commands` is
untestable without it. Pure functions with
tricky geometry get tests; anything touching the DOM or chrome APIs does not. The angle maths in the
recognizer was wrong for months of edits and only a test caught it — keep the cases there honest.

## Invariants

- Overlay CSS is only ever adopted into a shadow root. Never inject a `<style>` into the page.
- The overlay host stays `pointer-events: none`; interactive children opt back in.
- Anything touching `contextmenu` goes through `menuFiresOnMouseDown()`. The Windows and macOS
  paths differ by design (spec §3.1) and neither is a fallback for the other.
- The trigger lives in `chrome.storage.local` — per device. Gesture maps live in `sync`.
- Page commands run in the frame that started the gesture, not the top frame.
- No custom context menu. That was considered and rejected (spec §3.1).
- Never toggle overlay visibility with `hidden` on an element that also carries a `display`
  utility such as `grid` or `flex`. Use `invisible`.
- The grid never relies on its own listeners or `:hover` while a button is held. Blink captures
  events to the node that took the press, so tiles are hit-tested from a window listener, and the
  highlight is moved by hand (spec §6.1). Listen on `mousedown`: a chorded press fires no
  `pointerdown` at all.
- The overlay is sized by `uiScale / pageZoom` and nothing else (spec §7.4). Anything new the
  overlay draws goes through that number, or it grows with the page.
- The middle of the window stays free of anything that takes pointer events. The tab tiles dock to
  the top edge and the gesture list to the bottom; the centre belongs to the stroke and the readout
  (spec §6.4). Anchoring the tab panel to the cursor was tried and removed for being clanky.
- Overlay design sizes are screen sizes and are written as-is; anything measured from the page is
  divided by the overlay scale first (spec §7.4). Dividing a design size by the scale as well
  double-counts the zoom.
- A sub-frame never runs its gesture command before the top frame answers its `end`. Only the top
  frame knows whether the release picked a tab (spec §6.3).
- `build.outDir` stays **absolute**. The dev server resolves a relative one two ways — against Vite's
  root for its per-script writes, against the working directory for its rollup pass — and the half
  that carries the manifest lands outside the project, leaving a directory Chrome refuses.
- The dev server never writes to `dist/`. It has its own `dist-dev/` and does not empty it: emptying
  a directory Chrome has loaded makes the extension vanish mid-session.
- Generated directories get wiped without warning. `src/icons/material/` and `src/images/` are
  generated; anything authored goes beside them, never inside them.
- Never import an asset from `node_modules` with `?raw`. Vite's root is `src/`, so it is served
  over `/@fs/` and the dev server resolves that against the root, yielding `src/@fs/...` and an
  ENOENT — in dev only, so the build will not catch it. Vendor the file with
  `scripts/sync-icons.mjs` instead.
- **[`docs/wording.md`](docs/wording.md) governs every user-visible string**, in both languages:
  register, fixed terminology, and the i18n mechanics. Tests enforce the parts that can be checked.
- UI helpers take `Localized`, which only `t()` and `dynamic()` produce. If a label will not
  typecheck, the fix is a message key — never a cast.
- No user-facing English in code. Add a key to `src/public/_locales/en/messages.json` and use `t()`;
  static markup uses `data-i18n`. Counted strings need separate `_one` / `_other` messages, because
  `chrome.i18n` has no plural support.
- Tailwind only sees complete class strings in the source. Never build a class name by
  concatenating fragments at runtime.
- Restart `npm run dev` after using a utility class the overlay has not used before. The dev server
  writes the content script's `?inline` stylesheet once at startup and never re-emits it, so the new
  class is missing and the overlay renders as unstyled boxes in the top-left corner (spec §7.3).
- Never hand `chrome.storage.get` an object of defaults. Chrome merges an object-valued default
  _into_ the stored value before returning it, upstream of anything we can control, so a field the
  user cleared comes straight back. Read by key name (spec §9).
- `trigger` replaces its default outright; every other settings object merges. It is a discriminated
  union, and merging one variant into another produces neither (spec §9).
- `npm run shots` cancels every stroke with Escape before releasing the button. A capture that
  releases normally runs the gesture it just drew, and the next shot photographs the aftermath.

## Release

Push to `main` with a bumped version and the workflow tags `vX.Y.Z` and attaches `dist.zip`. A push
without a bump is a no-op, since the tag already exists. `npm run bump` keeps `package.json`,
`package-lock.json` and `src/manifest.json` in agreement — Chrome reads the manifest and the
workflow reads package.json, so a mismatch ships a build tagged as something it is not.
