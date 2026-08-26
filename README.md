# Write Click

Chrome extension for mouse gestures. Hold the trigger, draw a stroke, release — the stroke runs a
tab or page command. While the trigger is held, a grid of open tabs appears: release the trigger
over a tile to jump straight to that tab.

Everything the extension draws lives in a closed shadow root above the page, so the host page's CSS
and scripts cannot see it, restyle it, or reach into it.

## Status

**Feature complete.** Gestures are captured, quantized and drawn as a glowing trail, the
matched command is named in a glass readout, and releasing the trigger runs it. Holding the trigger
opens a grid of the window's tabs: release over a tile to jump straight to it and discard the
stroke. Everything is configurable from the settings page, including how large the overlay is drawn.
Gestures work inside iframes, scrolling the frame they were drawn in.

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
| `DL`   | back          |     | `DR`   | forward                 |
| `DU`   | new tab       |     |        |                         |

Another dozen commands ship unbound, waiting for a stroke you pick: duplicate tab, close other tabs,
pin, mute, move to a new window, new window, fullscreen, zoom in/out/reset, stop loading, and scroll
to bottom.

A single flick steps sideways through tabs; doubling back runs to that end of the strip; a leading
`R`/`L` with a `D` tail closes something.

The close-to-the-side strokes name their blast radius before you commit: the readout reads "Close 3
tabs to the right", counted with the same filter that does the closing, and pinned tabs are never
included.

Vertical strokes are inverted on purpose — `U` pushes the page up, which scrolls down, the way a
touch surface behaves.

Strokes are read as four cardinal directions with hysteresis, so a wobbly hand cannot turn one
corner into four letters. `RD` and `DR` are different strokes — order matters. All remappable from the
settings page, and `page.end` ships unbound waiting for a stroke you like.

## Tab grid

Hold the trigger without moving and a panel of the current window's tabs fades in at the top of the
window, with every bound gesture listed as a cheatsheet along the bottom. Flick straight into a
gesture and neither appears.

The two panels are docked to the edges on purpose: the middle of the window is where the stroke gets
drawn, so nothing that takes pointer events is allowed to sit there. The readout naming the matched
command does sit in the centre, and ignores the pointer entirely.

Move onto a tile and **release the trigger** to switch to that tab. Nothing is clicked, so no context
menu follows the switch. Clicking a tile with the trigger still held works too. Either way, whatever
stroke was underway is thrown away.

## Settings

Right-click the toolbar icon → Settings, or open it from the popup. Rebinding is done by drawing the
stroke in a pad that runs the same recognizer the content script does, so what you draw is what will
match. A stroke means one command: drawing one that is already taken moves it, and the page tells you
which command lost it.

The tab grid comes in Compact, Normal and Large. That sets how wide a tile wants to be — the number
per row follows from your window, rather than being pinned to a column count that is wrong on either
a laptop or an ultrawide. Switching on release can be turned off, leaving the click as the only way
to pick.

Overlay size is a slider, 50% to 200%, stored per device. It scales the trail, the readout and the
tab grid together, for a display where the designed size reads too small or too large. It is
separate from page zoom, which the overlay cancels out: the grid is the same size on a page zoomed
to 150% as on one at 100%.

**Backup** writes every setting to a JSON file and reads one back — after a reinstall, or onto a
second computer. It carries the trigger and the overlay size too, which are otherwise per device: an
export is asked for by name, and a backup that restores everything except the button you press is
not a backup. An import replaces what is there, and leaves out any binding this version does not
recognise rather than storing one that can never fire. The same contents sit in a textarea below,
for moving settings between two computers without moving a file — copy it out, paste it in over
there, apply.

The popup carries the two switches worth reaching in one click — gestures on/off for this device, and
on/off for the site you are on.

Changes apply to open tabs immediately, with no reload.

## Languages

English and 繁體中文, following the browser by default and switchable in settings — the extension's
own language, that is; the name Chrome shows in its menus always follows the browser.

Adding one is a file: copy `src/public/_locales/en/messages.json` to
`src/public/_locales/<locale>/`, translate the `message` values, and `npm test` will tell you if a
key or a `$PLACEHOLDER$` went missing.

## Publishing

Listing copy for both languages, the permission justifications and the privacy
answers live in [`docs/store-listing.md`](docs/store-listing.md). The policy
itself is [`PRIVACY.md`](PRIVACY.md).

## Develop

```bash
npm install
npm run dev        # src/ -> dist-dev/, auto-reloads the unpacked extension
npm run build      # src/ -> dist/
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # oxfmt .
npm run shots      # store screenshots -> shots/out/
```

Load `dist/`, not `src/`, as an unpacked extension at `chrome://extensions`.

The dev server writes its own unpacked extension to `dist-dev/`, so load that one instead while
running `npm run dev`. Keep only one of the two enabled at a time — both loaded means two content
scripts on every page.

The overlay's stylesheet is written once when the dev server starts, so restart it after using a
Tailwind class the overlay has not used before; otherwise that class is missing and the overlay
renders unstyled.

## Stack

Vite, `@crxjs/vite-plugin` (MV3), TypeScript strict, Tailwind v4, oxlint + oxfmt.

Icons are Material Symbols Rounded at weight 700 — the heaviest the family's `wght` axis defines —
inlined as SVG at build time, since an extension cannot fetch a webfont at runtime under its own
CSP.
