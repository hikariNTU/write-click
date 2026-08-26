# Write Click

Chrome extension for mouse gestures. Hold the trigger, draw a stroke, release — the stroke runs a
tab or page command. While the trigger is held, a grid of open tabs appears and can be clicked to
jump straight to one.

Everything the extension draws lives in a closed shadow root above the page, so the host page's CSS
and scripts cannot see it, restyle it, or reach into it.

## Status

**Phase 3 of 6 — commands run.** Gestures are captured, quantized and drawn as a glowing trail, the
matched command is named in a glass readout, and releasing the trigger runs it. Next up: the tab
grid, then the options page.

Full design is frozen in [`docs/SPEC.md`](docs/SPEC.md). Read that before changing behaviour.

## Trigger

The trigger is stored **per device**, not synced, because Chrome does not fire `contextmenu` at the
same moment on every OS:

| Platform     | `contextmenu` fires on | Default trigger           |
| ------------ | ---------------------- | ------------------------- |
| Windows      | mouseup                | right button, no modifier |
| macOS, Linux | mousedown              | right button + `Alt`      |

On Windows the menu is suppressed only once the pointer has actually moved, so a plain right-click
keeps its full native menu. On macOS and Linux the menu would open before any movement exists — and
the native menu takes an event grab, which stops `mousemove` entirely — so a modifier readable at
mousedown gates it instead. A plain right-click there is also untouched.

A keyboard trigger (hold a key, move the mouse) is supported too and never touches the context menu
at all. `Control` is never a default modifier: on macOS that is right-click emulation.

`Shift` + right-click always forces the native menu, on every platform.

## Gestures

| Stroke | Command                 |     | Stroke | Command          |
| ------ | ----------------------- | --- | ------ | ---------------- |
| `R`    | next tab                |     | `U`    | page up          |
| `L`    | previous tab            |     | `D`    | page down        |
| `DR`   | close tab               |     | `UL`   | scroll to top    |
| `UR`   | reopen closed tab       |     | `DL`   | scroll to bottom |
| `RD`   | close tabs to the right |     |        |                  |
| `LD`   | close tabs to the left  |     |        |                  |

Strokes are read as four cardinal directions with hysteresis, so a wobbly hand cannot turn one
corner into four letters. `DR` and `RD` are different strokes — order matters. `DR`/`UR` act on the tab itself; `RD`/`LD`
point at the side being closed. All remappable in options once phase 5 lands.

## Develop

```bash
npm install
npm run dev        # watch build, auto-reloads the unpacked extension
npm run build      # src/ -> dist/
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # oxfmt .
```

Load `dist/`, not `src/`, as an unpacked extension at `chrome://extensions`.

## Stack

Vite, `@crxjs/vite-plugin` (MV3), TypeScript strict, Tailwind v4, oxlint + oxfmt.

Icons are Material Symbols Rounded at weight 700 — the heaviest the family's `wght` axis defines —
inlined as SVG at build time, since an extension cannot fetch a webfont at runtime under its own
CSP.
