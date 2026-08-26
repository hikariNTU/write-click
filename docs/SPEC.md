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
- Cancel: `Escape`, losing the window, the tab being hidden, a `pointercancel`, a release the
  extension never saw, or a tab-grid selection (§6).

**Leaving the viewport does not cancel.** Chrome keeps delivering pointer events outside the window
while a button is held, so recognition stays correct and the canvas simply clips the drawing.
Overshooting an edge is normal — on a maximized window a downward or rightward stroke crosses the
boundary constantly — and cancelling there would break gestures precisely where the pointer already
is when right-clicking near a screen edge.

A button that is **no longer down** does cancel. If `pointermove` arrives without the trigger's bit
set in `event.buttons`, the release happened somewhere the page never saw it — another app took
focus, a native menu grabbed the pointer — and every point after that is noise. Without this the
gesture stays armed and the trail sticks on screen until the next click.

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

Back and forward take `DL` and `DR`, mirroring the direction they travel. Every other gesture product
puts them on a plain `L`/`R`; those are spent on tab switching here.

Most of the catalogue ships **unbound**. There is no short stroke left that does not collide, and
inventing bindings nobody asked for is worse than leaving them for the options page. `page.end` is in
the same position.

`nav.stop` has no extension API — the frame calling `window.stop()` on itself is the only way, so it
is a content command. Home page and bookmark toggling are absent for the same reason: Chrome exposes
no API for either.

Rules:

- Tab commands never touch pinned tabs in the bulk closers.
- `window.minimize` uses `chrome.windows.update`, which needs no extra permission.
- `tab.reloadHard` is `chrome.tabs.reload` with `bypassCache: true`.
- The tabs a bulk closer removes come from `tabsOnSide()` in `src/shared/tabs.ts`, which the readout
  also counts with. Both sides must keep using it: a count that disagrees with what actually closes
  is worse than no count.
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
- Tiles are **sized, not counted**: the track list is `repeat(auto-fit, minmax(<tile>px, 1fr))`, so
  how many fit per row falls out of the window width. A fixed column count was tried first and made
  the panel wrong at both ends — cramped on a laptop, sparse on a wide display.
- Three presets, exposed in options as Compact / Normal / Large: tile widths 150 / 220 / 300px,
  panel caps 720 / 900 / 1120px. The panel is additionally capped at the width the tiles actually
  present would occupy, so three open tabs do not stretch across the whole screen.
- Hiding fades the panel and only tears it down once the fade has finished. Clearing the tiles or
  flipping visibility in the same frame collapses the panel first, so what fades out is an empty box
  rather than the grid — it reads as a snap-shrink followed by a fade. The teardown delay must stay
  in step with the panel's transition duration, and the panel goes `pointer-events: none` for the
  fade so a stray click cannot land on a tile after the gesture is over.
- Tiles get `pointer-events: auto`; the overlay host stays `none`. Visibility is toggled with
  `invisible`, never `hidden`: `hidden` and `grid` are both `display` utilities, so which one won
  would come down to CSS source order.
- Selection listens on `pointerdown`, not `click` — the right button is still held, and the pick has
  to land before the trigger's own `pointerup` ends the gesture.
- A tab with no usable favicon, or one whose favicon fails to load, falls back to a bundled glyph.
- Hovering a tile highlights it. **Left-click while the trigger is still held** activates that tab
  and sets `cancelled`, so the pending stroke is discarded when the trigger is released.
- Moving off every tile and releasing the trigger falls through to normal stroke matching.
- Under the tiles sits the **cheatsheet**: every bound gesture, as arrow chips beside its command
  name. The panel is already open while the trigger is held, which is exactly when someone wonders
  what else they could draw, so the reference belongs there rather than buried in settings. It can
  be switched off.
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
- For `tab.closeRight` / `tab.closeLeft` the readout names the number of tabs that will actually
  close — "Close 3 tabs to the right" — because the stroke is destructive and undo is per-tab, so
  one gesture can cost several. When nothing would close, it says so and takes the unassigned tone
  rather than promising a close that cannot happen. The tab list is fetched on trigger-down for
  this, whether or not the grid is switched on.
- The readout is a glass card at the bottom of the viewport: icon tile, command name, and the stroke
  rendered as rotated arrows rather than letters. Emerald tint when the stroke matches, amber when
  it is unassigned.

### 7.1 Extension icon

`src/icons/write-click.svg` is the source art, and `src/icons/write-click-small.svg` a simplified
variant for the toolbar sizes. `scripts/render-icons.mjs` rasterizes them to
`src/images/icon-{16,32,48,128}.png`, which is what the manifest points at — Chrome accepts no SVG
for `icons` or `action.default_icon`. Rendering uses `@resvg/resvg-js` rather than a headless
browser, so the build needs no Chrome, and the PNGs are committed with CI failing if a build changes
them.

16px and 32px come from the simplified drawing. The full mark's mouse body, button split and blurred
glow all land on similar values at toolbar size and average into one muddy blob, so the small variant
keeps only the W — no silhouette, no filter, no cursor node — scaled up and thickened to a 16px
stroke width against the 128 viewBox. 48px and up use the full art, where the detail is legible.

### 7.2 Command icons

Material Symbols **Rounded**, vendored into `src/icons/material/` by `scripts/sync-icons.mjs` and imported
with `?raw`. An extension cannot fetch a webfont at runtime under its own CSP, and the dozen glyphs
actually used cost a few kB against the ~4 MB variable font.

They are copied under the root rather than imported from `node_modules` directly. Vite's root is
`src/`, so a `?raw` import from outside it is served over a `/@fs/` URL, which the dev server then
resolves against the root and turns into `src/@fs/...` — an ENOENT on every content-script load in
`npm run dev`. The build resolves those on disk and never sees it, so this only ever breaks dev.

The script **wipes its target directory** before copying, so it targets `src/icons/material/` and
hand-authored artwork lives one level up in `src/icons/`. The copies are committed, and
`prebuild`/`predev` re-sync them. Adding a glyph means adding its name
to the `ICONS` list in that script, not a new import path into `node_modules`.

Weight is **700** — the heaviest the Material Symbols `wght` axis defines. There is no 900 in this
family (`GRAD` also stops at 200), so 700 is the ceiling.

Each SVG is rewritten on import to carry `fill="currentColor"` and to drop its fixed `width`/
`height`, so size and colour come from Tailwind classes.

## 8. Frames

The content script runs in all frames at `document_start`. **Every frame runs its own trigger and
recognizer and executes its own commands** — that is what makes a page command scroll the frame the
gesture was actually drawn in, with no routing back down.

Only the _drawing_ is relayed. A sub-frame posts its points to `window.parent`, one hop at a time,
each hop adding that frame's offset (the child's iframe content box, found by comparing
`contentWindow`, which works across origins). Hopping rather than posting straight to `window.top`
is what makes nested iframes work: only the immediate parent can locate a child's iframe element.
The top frame owns the overlay and renders sub-frame gestures identically.

Because commands never travel over `postMessage`, a page script that spoofs these messages can move
a trail around and nothing else. The one message that travels **down** is the grid's "a tab was
picked, drop your pending command", relayed along the same chain in reverse.

Cross-origin iframes that have not loaded yet, `chrome://` pages, the Web Store, the PDF viewer, and
`view-source:` cannot host a content script. Gestures do not work there; this is a platform limit,
not a bug to fix.

## 9. Storage

```ts
interface SyncSettings {
  // chrome.storage.sync
  version: 1;
  gestures: Record<string, CommandId>; // stroke -> command
  grid: { enabled: boolean; holdMs: number; size: "compact" | "normal" | "large" };
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
`onInstalled`, which runs on both install and update. v2 replaced the grid's `columns` with `size`.

Reads merge defaults **one level deep**. Storage is written per top-level key, so a stored `grid`
written before a field existed would otherwise replace the whole default object and leave that field
`undefined` — a shallow merge makes every future nested addition a crash waiting for the next
release. `migrate()` fills in fields the stored object
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

## 10.2 Localization

Messages live in `src/public/_locales/<locale>/messages.json` and reach `dist/_locales` through
Vite's public directory. `default_locale` is `en`, and the manifest's `name` and `description` go
through `__MSG_extName__` / `__MSG_extDescription__`.

`t()` in `src/shared/i18n.ts` wraps `chrome.i18n.getMessage`. Its key type is derived from the
English catalogue with `keyof typeof import(...)`, a type-only import, so a typo or a message deleted
from the catalogue is a build error rather than a blank label at runtime. A missing message falls
back to the key itself: a screen reading `options_trigger_title` is visibly broken and names what is
missing, while an empty string looks like a rendering bug.

Commands carry a `labelKey`, never English text. Static markup carries `data-i18n` attributes, with
the English left in the HTML as documentation, filled in by `applyStaticMessages()` on load.

`chrome.i18n` has **no plural support**, so counted strings ship as separate singular and plural
messages — `hud_closeRight_one` / `hud_closeRight_other`. A language that pluralizes differently needs
both strings anyway.

Copy follows [`wording.md`](wording.md), adapted from the CanWas repo's `CONTEXT.md` and
`docs/ui-guidelines.md`: plain statements, no filler or chatty asides, fixed terminology in both
languages, and third-person objective register in zh-Hant.

`src/shared/i18n.test.ts` enforces what can be checked mechanically — that every translation has
exactly the English key set, that placeholders survive translation and are still referenced in the
translated string, that every command's `labelKey` exists, that English copy carries no filler or
banned asides, that zh-Hant copy stays third-person, and that "unbound" never reappears alongside
"unassigned".

Counts go through `formatNumber()`, which is `Intl.NumberFormat` on the active locale.

`t()` returns a branded `Localized` string and the helpers in `src/ui.ts` accept only that, so a
hard-coded label fails to compile. Untranslatable text — a key code, an origin, a command id — is
wrapped in `dynamic()`. The brand was added after five literals survived a catalogue rewrite and
shipped a half-translated settings page; typecheck then found three more that a grep had missed.

Shipping: `en` (default) and `zh_TW`.

### Language override

`sync.language` is `auto` (follow the browser) or a locale id. `chrome.i18n` always follows the
browser's UI language and cannot be told to use another, so a picker has to resolve messages itself:
`setLocale()` stores the override and `t()` reads the bundled catalogue directly, falling through to
English for a missing key. Only `auto` goes through `chrome.i18n`.

Catalogues are **bundled**, not fetched from `_locales` at runtime — fetching would mean exposing
them as web-accessible resources for the content script, plus asynchronous loading before the first
label is drawn. At two locales that costs a few kB. Past a handful, revisit it.

The manifest's name and description cannot be overridden: Chrome renders those itself, from the
browser's language. The settings page says so rather than leaving it as a puzzle.

Every entry point calls `setLocale()` right after loading settings, and content scripts re-apply on
`storage.onChanged`, which also rebuilds the cheatsheet so a language change reaches open tabs
without a reload.

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
6. **Frames and release** — done. Sub-frame bridge, extension icons rendered from the source SVG,
   CI, and a release workflow that tags and attaches `dist.zip` on a version bump.

Done criteria per phase: `npm run build`, `npm run typecheck`, and `npm run lint` all clean, and the
phase's behaviour verified in a loaded unpacked build.
