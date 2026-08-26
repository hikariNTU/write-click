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
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # oxfmt .
```

Load `dist/`, never `src/`, as the unpacked extension. A phase is done when build, typecheck and
lint are all clean and the behaviour is verified in a loaded unpacked build.

## Layout

- `src/content/index.ts` — content script entry, top frame only for now
- `src/content/overlay.ts` — closed shadow root, adopts the Tailwind sheet
- `src/content/styles.css` — imported `?inline`, adopted into the shadow root so preflight is scoped
- `src/background/service_worker.ts` — tab commands
- `src/shared/trigger.ts` — trigger types, per-platform defaults, context-menu timing

## Invariants

- Overlay CSS is only ever adopted into a shadow root. Never inject a `<style>` into the page.
- The overlay host stays `pointer-events: none`; interactive children opt back in.
- Anything touching `contextmenu` goes through `menuFiresOnMouseDown()`. The Windows and macOS
  paths differ by design (spec §3.1) and neither is a fallback for the other.
- The trigger lives in `chrome.storage.local` — per device. Gesture maps live in `sync`.
- Page commands run in the frame that started the gesture, not the top frame.
- No custom context menu. That was considered and rejected (spec §3.1).
