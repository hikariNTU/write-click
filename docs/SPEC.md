# Write Click — specification

Frozen decisions for the implementation. If code and this file disagree, one of them is a bug.
Change the spec in the same commit that changes the behaviour.

## 1. Scope

A Chrome MV3 extension. The user holds a trigger, moves the mouse, releases; the stroke is matched
to a command and the command runs. While the trigger is held, a grid of open tabs is shown and can
be clicked to switch directly.

Non-goals for v1: Firefox, gesture recording by example, rocker/wheel gestures, per-site gesture
maps, syncing the trigger across devices, replacing the native context menu.

## 2. Terminology

- **Trigger** — what the user holds to start drawing.
- **Stroke** — the quantized direction string, e.g. `"RD"`.
- **Command** — a named action, e.g. `tab.close`.
- **Overlay** — the closed shadow root drawn above the page.
- **Tab grid** — the tab picker shown inside the overlay while the trigger is held.

## 3. Trigger model

```ts
type Modifier = "Alt" | "Control" | "Meta" | "Shift";
type Trigger =
  { kind: "button"; button: 0 | 1 | 2; modifier?: Modifier } | { kind: "key"; code: string };
```

The trigger is **per device**: it lives in `chrome.storage.local`, never in `sync`. A user with a
Windows desktop and a Mac laptop must be able to hold different things on each.

### 3.1 Why the default differs by platform

Chrome fires `contextmenu` at different times per OS. This is the single constraint the whole
trigger design is built around.

| Platform     | `contextmenu` fires on | Default trigger                  | Rationale                                                                                                                                                                                                                             |
| ------------ | ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows      | mouseup                | `{ button: 2 }`                  | Drift is already known when the event arrives, so the menu is suppressed **only** if the pointer moved. A plain right-click keeps the full native menu.                                                                               |
| macOS, Linux | mousedown              | `{ button: 2, modifier: "Alt" }` | The menu would open before any drift exists, and the native menu takes an event grab — once it is up, no `mousemove` arrives and no gesture can be drawn. A modifier is readable at mousedown, so `preventDefault` stays conditional. |

`Control` is never a default modifier: on macOS, Ctrl+click is right-click emulation.

Rejected alternatives, recorded so they do not come back:

- _Unconditional `preventDefault` on mac plus a custom shadow-DOM context menu._ Rejected: cannot
  reproduce Inspect Element, Save as, Translate, or spellcheck suggestions, so it is strictly worse
  than the native menu.
- _Drift-based suppression on mac._ Not implementable: the menu opens before drift exists.

### 3.2 Exact `contextmenu` rules

```
on contextmenu(e):
  if trigger.kind !== "button" or trigger.button !== 2:  do nothing
  if menuFiresOnMouseDown():                # macOS, Linux
      if modifierMatches(e):  e.preventDefault()   # gesture starts
      else:                   do nothing           # native menu, untouched
  else:                                     # Windows
      if gestureWasDrawn:     e.preventDefault()
      else:                   do nothing           # native menu, untouched
```

`gestureWasDrawn` means drift exceeded `DRIFT_THRESHOLD` since the trigger went down.

### 3.3 Key triggers

`{ kind: "key" }` never touches `contextmenu`. `keydown` starts capture, plain `mousemove` draws,
`keyup` ends it. Rules:

- Ignore `e.repeat`.
- Ignore when `document.activeElement` is an input, textarea, or `contenteditable`.
- `preventDefault` the `keyup` if a gesture ran, so releasing a bare `Alt` does not open Chrome's
  menu bar on Windows.

### 3.4 Suppressed side effects

A button gesture that drifted swallows the `click`/`auxclick` that follows, so a stroke ending on a
link does not also activate it. A middle-button trigger calls `preventDefault` on pointerdown to
stop Chrome's autoscroll. A key trigger calls `preventDefault` on the `keyup` that ended a gesture.

### 3.5 Escape hatches

Always available, on every platform: `Shift` + right-click forces the native menu (Chrome does this
itself, no code needed); a per-origin disable toggle; a global off switch.

## 4. Recognition

- Sample `pointermove` into a point list, expanding `getCoalescedEvents()` where available.
  Pointer events are used throughout for movement; `contextmenu` stays a `MouseEvent`.
- `DRIFT_THRESHOLD = 8` px, compared squared. Below it, the gesture is "not drawn".
- `SEGMENT_MIN = 32` px. Movement shorter than this does not emit a direction.
- Quantize to **four** cardinal directions: `U D L R`. Collapse consecutive repeats.
- `HYSTERESIS_DEG = 28`. The current direction is sticky: movement must be more than
  `45 + HYSTERESIS_DEG` degrees off it before the stroke changes letter. A real corner clears that
  easily; hand tremor does not. Without it a single corner reads as `RURU`.

Eight directions were tried and dropped. A single diagonal drag emitted `DR`, which is the same
string as the two-segment down-then-right stroke — one string, two gestures, no way to tell them
apart. Four directions removes the ambiguity and is what makes the hysteresis rule simple.

- Stroke = concatenation, e.g. `"RD"`. Max 6 segments; longer strokes are truncated and treated as
  unmatched.
- Unmatched stroke: show a brief "no gesture" label, run nothing.
- Cancel: `Escape`, losing the window, or a tab-grid selection (§6).

## 5. Commands

| Command id       | Action                                           | Runs in    | Default stroke |
| ---------------- | ------------------------------------------------ | ---------- | -------------- |
| `tab.next`       | Activate next tab, wrapping                      | background | `R`            |
| `tab.prev`       | Activate previous tab, wrapping                  | background | `L`            |
| `tab.close`      | Close the active tab                             | background | `DR`           |
| `tab.reopen`     | `chrome.sessions.restore()`                      | background | `UR`           |
| `tab.closeRight` | Close every unpinned tab right of the active one | background | `RD`           |
| `tab.closeLeft`  | Close every unpinned tab left of the active one  | background | `LD`           |
| `page.up`        | Scroll up one viewport                           | content    | `U`            |
| `page.down`      | Scroll down one viewport                         | content    | `D`            |
| `page.top`       | Scroll to top                                    | content    | `UL`           |
| `page.end`       | Scroll to bottom                                 | content    | `DL`           |

Mnemonic: `DR`/`UR` are destroy/undo on the tab itself; `RD`/`LD` point at the side being closed.
Order matters, so `DR` and `RD` are distinct strokes.

Rules:

- Tab commands never touch pinned tabs in the bulk closers.
- Page commands run in the frame that started the gesture, not the top frame, so gestures inside a
  scrollable iframe scroll that iframe.
- Within that frame they target the nearest scrollable ancestor of the point where the gesture
  **began**, so a stroke that ends outside a panel still scrolls the panel it started in.
- Scrolling uses `behavior: "smooth"` unless `prefers-reduced-motion` is set.

## 6. Tab grid

- Shown while the trigger is held, after `GRID_HOLD_MS = 180`. The delay keeps quick flick gestures
  from flashing it.
- Data comes from the background: `{ id, title, favIconUrl, active, index }` for the current window.
- Layout is a **grid** of tiles — favicon plus truncated title, active tab highlighted. A radial or
  pie layout was considered and dropped: it stops scaling past roughly eight tabs.
- Tiles get `pointer-events: auto`; the overlay host stays `none`.
- Hovering a tile highlights it. **Left-click while the trigger is still held** activates that tab
  and sets `cancelled`, so the pending stroke is discarded when the trigger is released.
- Moving off every tile and releasing the trigger falls through to normal stroke matching.
- `Escape` closes the grid and cancels the gesture.

## 7. Overlay

- One closed shadow root per frame, appended to `document.documentElement`.
- Host: `position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; contain: strict`.
- Tailwind is imported `?inline` and adopted via `adoptedStyleSheets`. Never inject a `<style>` tag
  into the page: preflight must not touch host styles.
- The trail is a `<canvas>` sized to the viewport times `devicePixelRatio`, redrawn on
  `requestAnimationFrame`: a wide blurred underlay for the glow, a crisp core on top, joined through
  midpoints with `quadraticCurveTo` so it reads as a stroke rather than a polyline.
- The readout is a glass card at the bottom of the viewport: icon tile, command name, and the stroke
  rendered as rotated arrows rather than letters. Emerald tint when the stroke matches, amber when
  it is unassigned.

### 7.1 Icons

Material Symbols **Rounded**, inlined at build time from `@material-symbols/svg-700` and imported
with `?raw`. An extension cannot fetch a webfont at runtime under its own CSP, and the dozen glyphs
actually used cost a few kB against the ~4 MB variable font.

Weight is **700** — the heaviest the Material Symbols `wght` axis defines. There is no 900 in this
family (`GRAD` also stops at 200), so 700 is the ceiling.

Each SVG is rewritten on import to carry `fill="currentColor"` and to drop its fixed `width`/
`height`, so size and colour come from Tailwind classes.

## 8. Frames

The content script runs in all frames at `document_start`. Sub-frames record pointer events and
forward them to the top frame via `postMessage`, offset-corrected; the top frame owns the overlay
and the recognizer. Page commands are routed back to the originating frame.

Cross-origin iframes that have not loaded yet, `chrome://` pages, the Web Store, the PDF viewer, and
`view-source:` cannot host a content script. Gestures do not work there; this is a platform limit,
not a bug to fix.

## 9. Storage

```ts
interface SyncSettings {
  // chrome.storage.sync
  version: 1;
  gestures: Record<string, CommandId>; // stroke -> command
  grid: { enabled: boolean; holdMs: number; columns: number };
  trail: { color: string; width: number; showLabel: boolean };
  disabledOrigins: string[];
}

interface LocalSettings {
  // chrome.storage.local, per device
  version: 1;
  trigger: Trigger;
  enabled: boolean;
}
```

`version` is bumped whenever a shape changes, with a migration in the service worker's
`onInstalled`.

## 10. Messaging

One typed union in `src/shared/messages.ts`. Content to background:

```ts
type Request =
  | { type: "command"; id: CommandId }
  | { type: "tabs.list" }
  | { type: "tabs.activate"; tabId: number };
```

Every handler is exhaustive over the union; adding a member must break the build.

## 11. Phases

1. **Scaffold** — done. Vite + crxjs + Tailwind + oxc, shadow-root overlay, trigger defaults.
2. **Trigger + recognizer** — done. All three trigger kinds, `contextmenu` rules from §3.2, stroke
   quantization, canvas trail. Commands logged, not run.
3. **Commands** — done. Background tab commands over a typed message union, content-local scroll
   commands, default map from §5.
4. **Tab grid** — §6 in full, including click-to-switch and gesture cancellation.
5. **Options** — trigger picker with key capture, gesture remap, per-origin disable, storage
   migrations.
6. **Frames and release** — sub-frame bridge, release workflow, icons, store listing.

Done criteria per phase: `npm run build`, `npm run typecheck`, and `npm run lint` all clean, and the
phase's behaviour verified in a loaded unpacked build.
