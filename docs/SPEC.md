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

`quantize` is covered by `src/content/recognizer.test.ts`. Reversals are the case that breaks: a
buggy angle comparison can read a 180° turn as 0° apart and hold the old direction forever, which
looks like `LRL` collapsing to `L`.

Eight directions were tried and dropped. A single diagonal drag emitted `DR`, which is the same
string as the two-segment down-then-right stroke — one string, two gestures, no way to tell them
apart. Four directions removes the ambiguity and is what makes the hysteresis rule simple.

- Stroke = concatenation, e.g. `"RD"`. Max 6 segments; longer strokes are truncated and treated as
  unmatched.
- Unmatched stroke: show a brief "no gesture" label, run nothing.
- Cancel: `Escape`, losing the window, or a tab-grid selection (§6).

## 5. Commands

| Command id        | Action                                           | Runs in    | Default stroke |
| ----------------- | ------------------------------------------------ | ---------- | -------------- |
| `tab.prev`        | Activate previous tab, wrapping                  | background | `L`            |
| `tab.next`        | Activate next tab, wrapping                      | background | `R`            |
| `tab.first`       | Activate the leftmost tab                        | background | `LRL`          |
| `tab.last`        | Activate the rightmost tab                       | background | `RLR`          |
| `tab.close`       | Close the active tab                             | background | `RD`           |
| `tab.reopen`      | `chrome.sessions.restore()`                      | background | `LU`           |
| `tab.closeRight`  | Close every unpinned tab right of the active one | background | `URD`          |
| `tab.closeLeft`   | Close every unpinned tab left of the active one  | background | `ULD`          |
| `window.minimize` | Minimize the current window                      | background | `LD`           |
| `page.top`        | Scroll to top                                    | content    | `RU`           |
| `page.down`       | Scroll down one viewport                         | content    | `U`            |
| `page.up`         | Scroll up one viewport                           | content    | `D`            |
| `page.end`        | Scroll to bottom                                 | content    | _(unbound)_    |

The scheme: a single flick steps sideways through tabs, doubling back (`LRL`, `RLR`) runs to that
end of the strip, and a leading `R`/`L` with a `D` tail closes something. Order matters, so `RD` and
`DR` are distinct strokes.

Vertical page strokes are **inverted on purpose**: `U` pushes the page up, which scrolls down, the
way a touch surface behaves. Do not "fix" this.

`page.end` ships unbound — every remaining short stroke collides with something. It exists so it can
be bound in options.

Rules:

- Tab commands never touch pinned tabs in the bulk closers.
- `window.minimize` uses `chrome.windows.update`, which needs no extra permission.
- Page commands run in the frame that started the gesture, not the top frame, so gestures inside a
  scrollable iframe scroll that iframe.
- Within that frame they target the nearest scrollable ancestor of the point where the gesture
  **began**, so a stroke that ends outside a panel still scrolls the panel it started in.
- Scrolling uses `behavior: "smooth"` unless `prefers-reduced-motion` is set.

## 6. Tab grid

- Shown while the trigger is held, after `GRID_HOLD_MS = 180`. The delay is only there so a quick
  flick gesture, which is over before the timer fires, never flashes it.
- **Movement must not dismiss it.** Picking a tile means moving the pointer onto the tile, so any
  rule that reads movement as "the user is drawing instead" cancels the feature at exactly the
  moment it is being used. This was tried with an 8px threshold and again with 32px; both made the
  grid unreachable. Do not reintroduce it.
- The stroke keeps being recognized while the panel is open, and the readout keeps naming it. A
  release with no tile picked runs that stroke as usual. So holding still opens it; flicking straight into a stroke never does.
- The tab list is requested the instant the trigger goes down, in parallel with that timer, so the
  panel has no fetch latency when it appears.
- Data comes from the background: `{ id, title, favIconUrl, active, index }` for the current window.
- Layout is a **grid** of tiles — favicon plus truncated title, active tab highlighted. A radial or
  pie layout was considered and dropped: it stops scaling past roughly eight tabs.
- Tiles get `pointer-events: auto`; the overlay host stays `none`. Visibility is toggled with
  `invisible`, never `hidden`: `hidden` and `grid` are both `display` utilities, so which one won
  would come down to CSS source order.
- Selection listens on `pointerdown`, not `click` — the right button is still held, and the pick has
  to land before the trigger's own `pointerup` ends the gesture.
- A tab with no usable favicon, or one whose favicon fails to load, falls back to a bundled glyph.
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
- Glass surfaces blur the backdrop by **6px**. Heavier blurs turn the page behind into an unreadable
  smear, which matters here because the overlay covers content the user is still reading.
- Layering inside the shadow root is explicit, not append order: tab grid `z-10`, trail `z-20`,
  readout `z-30`. The trail sits **above** the grid because the grid stays open while a stroke is
  being drawn, so putting the trail underneath would hide the feedback exactly when it is needed.
- The readout is a glass card at the bottom of the viewport: icon tile, command name, and the stroke
  rendered as rotated arrows rather than letters. Emerald tint when the stroke matches, amber when
  it is unassigned.

### 7.1 Icons

Material Symbols **Rounded**, vendored into `src/icons/` by `scripts/sync-icons.mjs` and imported
with `?raw`. An extension cannot fetch a webfont at runtime under its own CSP, and the dozen glyphs
actually used cost a few kB against the ~4 MB variable font.

They are copied under the root rather than imported from `node_modules` directly. Vite's root is
`src/`, so a `?raw` import from outside it is served over a `/@fs/` URL, which the dev server then
resolves against the root and turns into `src/@fs/...` — an ENOENT on every content-script load in
`npm run dev`. The build resolves those on disk and never sees it, so this only ever breaks dev.

The copies are committed, and `prebuild`/`predev` re-sync them. Adding a glyph means adding its name
to the `ICONS` list in that script, not a new import path into `node_modules`.

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
`onInstalled`, which runs on both install and update. `migrate()` fills in fields the stored object
never had rather than letting a reader find `undefined`.

Content scripts subscribe to `chrome.storage.onChanged` and re-apply without a reload: gesture and
overlay changes take effect on the next stroke, and a trigger change tears down its listeners and
re-attaches. Turning gestures off, globally or for the origin, detaches them entirely.

## 10. Messaging

`send()` never rejects. A sleeping, reloading or crashed service worker makes `sendMessage` throw
`Could not establish connection`, and an unhandled rejection there makes a whole feature disappear
with an empty console. Failures come back as `{ ok: false, error }` and are logged at the call site.

One typed union in `src/shared/messages.ts`. Content to background:

```ts
type Request =
  | { type: "command"; id: CommandId }
  | { type: "tabs.list" }
  | { type: "tabs.activate"; tabId: number };
```

Every handler is exhaustive over the union; adding a member must break the build.

## 10.1 Options page

`src/options.html` + `src/options.ts`, opened in a tab. Every control writes on change; there is no
save button. Sections: trigger, gestures, overlay, disabled sites, reset.

Rebinding is done by **drawing**, in a pad that calls the same `quantize` the content script does —
what you draw in the pad is by construction what will match on a page. A stroke means exactly one
command, so drawing one that is already taken moves it and leaves the previous owner unbound, which
the page says out loud rather than silently dropping.

The trigger section shows what the current choice does to the native context menu, since that is the
part that surprises people, and the wording follows §3.1 per platform.

The popup carries only what is worth reaching in one click: gestures on/off for the device, and
on/off for the current origin. It offers no origin toggle on browser-internal pages, where a content
script cannot run and the toggle would be a lie.

## 11. Phases

1. **Scaffold** — done. Vite + crxjs + Tailwind + oxc, shadow-root overlay, trigger defaults.
2. **Trigger + recognizer** — done. All three trigger kinds, `contextmenu` rules from §3.2, stroke
   quantization, canvas trail. Commands logged, not run.
3. **Commands** — done. Background tab commands over a typed message union, content-local scroll
   commands, default map from §5.
4. **Tab grid** — done. §6 in full, including click-to-switch and gesture cancellation.
5. **Options** — done. Trigger picker with key capture, gesture remap by drawing, overlay
   appearance, per-origin disable, reset, and storage migrations. The toolbar popup carries the two
   switches worth reaching quickly.
6. **Frames and release** — sub-frame bridge, release workflow, icons, store listing.

Done criteria per phase: `npm run build`, `npm run typecheck`, and `npm run lint` all clean, and the
phase's behaviour verified in a loaded unpacked build.
