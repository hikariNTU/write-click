# Write Click

Chrome extension for mouse gestures. Hold the trigger, draw a stroke, release — the stroke runs a
tab or page command. While the trigger is held, a grid of open tabs appears and can be clicked to
jump straight to one.

Everything the extension draws lives in a closed shadow root above the page, so the host page's CSS
and scripts cannot see it, restyle it, or reach into it.

## Status

**Feature complete.** Gestures are captured, quantized and drawn as a glowing trail, the
matched command is named in a glass readout, and releasing the trigger runs it. Holding the trigger
opens a grid of the window's tabs: click one, with the trigger still held, to jump straight to it and
discard the stroke. Everything is configurable from the settings page. Gestures work inside iframes,
scrolling the frame they were drawn in.

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

| Stroke | Command       |     | Stroke | Command                 |
| ------ | ------------- | --- | ------ | ----------------------- |
| `L`    | previous tab  |     | `RD`   | close tab               |
| `R`    | next tab      |     | `LU`   | reopen closed tab       |
| `LRL`  | leftmost tab  |     | `URD`  | close tabs to the right |
| `RLR`  | rightmost tab |     | `ULD`  | close tabs to the left  |
| `U`    | page down     |     | `LD`   | minimize window         |
| `D`    | page up       |     | `RU`   | scroll to top           |
| `UD`   | reload        |     | `UDU`  | reload without cache    |

A single flick steps sideways through tabs; doubling back runs to that end of the strip; a leading
`R`/`L` with a `D` tail closes something.

The close-to-the-side strokes name their blast radius before you commit: the readout reads "Close 3
tabs to the right", counted with the same filter that does the closing, and pinned tabs are never
included.

Vertical strokes are inverted on purpose — `U` pushes the page up, which scrolls down, the way a
touch surface behaves.

Strokes are read as four cardinal directions with hysteresis, so a wobbly hand cannot turn one
corner into four letters. `RD` and `DR` are different strokes — order matters. All remappable once
the options page lands, and `page.end` ships unbound waiting for a stroke you like.

## Tab grid

Hold the trigger without moving and a panel of the current window's tabs fades in. Click a tile —
left button, trigger still held — to switch to that tab; whatever stroke was underway is thrown
away. Flick straight into a gesture and the panel never appears.

## Settings

Right-click the toolbar icon → Settings, or open it from the popup. Rebinding is done by drawing the
stroke in a pad that runs the same recognizer the content script does, so what you draw is what will
match. A stroke means one command: drawing one that is already taken moves it, and the page tells you
which command lost it.

The tab grid comes in Compact, Normal and Large. That sets how wide a tile wants to be — the number
per row follows from your window, rather than being pinned to a column count that is wrong on either
a laptop or an ultrawide.

The popup carries the two switches worth reaching in one click — gestures on/off for this device, and
on/off for the site you are on.

Changes apply to open tabs immediately, with no reload.

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
