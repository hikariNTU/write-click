# AGENTS.md

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
Load `dist/`, never `src/`, as the unpacked extension.

## Layout
- `src/content/index.ts` — content script entry, top frame only for now
- `src/content/overlay.ts` — closed shadow root, adopts the Tailwind sheet
- `src/content/styles.css` — imported `?inline`, adopted into the shadow root so preflight is scoped
- `src/background/service_worker.ts` — tab commands
- `src/shared/trigger.ts` — trigger types, per-platform defaults, context-menu timing

## Rules
- Overlay CSS is only ever adopted into a shadow root. Never inject a `<style>` into the page.
- The host element stays `pointer-events: none`; interactive children opt back in.
- Anything touching `contextmenu` must go through `menuFiresOnMouseDown()` — the Windows and
  macOS paths differ and neither is a fallback for the other.
