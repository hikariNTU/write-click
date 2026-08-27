# Write Click — specification

Frozen decisions for the implementation. If code and this file disagree, one of them is a bug.
Change the spec in the same commit that changes the behaviour.

## 1. Scope

A Chrome MV3 extension. The user holds a trigger, moves the mouse, releases; the stroke is matched
to a command and the command runs. While the trigger is held, a grid of open tabs is shown and can
be clicked to switch directly.

Non-goals for v1: Firefox, gesture recording by example, per-site gesture maps, syncing the trigger
across devices, replacing the native context menu. Rocker and wheel gestures were a v1 non-goal too;
they ship since §3.6 and §3.7, off by default, and the reason they waited is the tab grid holding the
same button and the same wheel.

## 2. Terminology

- **Trigger** — what the user holds to start drawing.
- **Stroke** — the quantized direction string, e.g. `"RD"`.
- **Command** — a named action, e.g. `tab.close`.
- **Overlay** — the closed shadow root drawn above the page.
- **Tab grid** — the tab picker shown inside the overlay while the trigger is held.
- **Readout** — the card naming the command the stroke currently matches.
- **Cheatsheet** — the list of bound gestures shown while the trigger is held.
- **Overlay scale** — the factor everything the overlay draws is multiplied by, the user's size
  preference divided by the tab's page zoom; §7.4.

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
- The stroke starts where the pointer was **last seen**, and if it has never been seen the start
  waits for the first `pointermove` and takes its position as the origin. There is no API for asking
  where the cursor is, and a position that is not known is not 0,0: seeding the corner drew every
  such gesture as a line from the top-left of the window to wherever the cursor actually was.

### 3.4 Suppressed side effects

A button gesture that drifted swallows the `click`/`auxclick` that follows, so a stroke ending on a
link does not also activate it. A middle-button trigger calls `preventDefault` on pointerdown to
stop Chrome's autoscroll. A key trigger calls `preventDefault` on the `keyup` that ended a gesture.

For as long as a stroke is being drawn, `selectstart` and `dragstart` are cancelled: a held button
drags, and with a left-button trigger the gesture otherwise paints a text selection across the page
and can pick up a native link or image drag whose ghost then follows the cursor over the overlay.
Cancelling those two events rather than the `pointerdown` is deliberate — `preventDefault` on the
press would stop the drag as well, but it would take focus and caret placement with it, and a plain
click belongs to the page. The listeners are added when the stroke starts and removed when it ends,
cancels, or the trigger is detached.

### 3.5 Escape hatches

Always available, on every platform: `Shift` + right-click forces the native menu (Chrome does this
itself, no code needed); a per-origin disable toggle; a global off switch.

### 3.6 The rocker

`rocker.enabled`, **off by default**. A chorded mouse press — one button clicked while another is
already held. Right held plus left clicked runs `rocker.back`; left held plus right clicked runs
`rocker.forward`. Both slots hold any command in the catalogue; they ship as `nav.back` and
`nav.forward`, which is where every other product in the category puts them.

- **The pair is what fires it, not the trigger.** A rocker is defined against the two buttons
  themselves, so both directions work whatever the trigger is set to — including a key trigger,
  where no button is held and no chord is possible, so nothing fires at all.
- **Listened for on `mousedown`, never `pointerdown`.** A chorded press fires `pointermove` rather
  than `pointerdown`: the pointer is already in the active buttons state. This is the same
  constraint the tab grid hit in §6.1.
- Only the two classic pairs count. The middle button is left out — holding it means autoscroll on
  Windows and paste on Linux — and a third button held alongside is a thumb resting on the mouse.
- **While the tab grid is on screen, the grid owns the second button.** That press is how a tile is
  picked (§6.1), and the two are the same event: a rocker firing on a missed tile would make missing
  the tile do something. The content script asks the grid first and leaves the press untouched when
  the answer is yes, native effects and all.
- The press is swallowed along with the `click` it owes, and so is the context menu: a rocker is
  built out of a right button one way round or the other, and that menu arrives with the press on
  macOS and Linux and with the release on Windows (§3.2). It is suppressed for a second after a
  rocker fires, which is a window rather than a flag because the events in between differ by
  platform.
- A rocker **voids the stroke** drawn under it without ending the gesture. The trigger is still held,
  so a second rocker can fire without letting go — which is how anyone walks back through history —
  and the release runs no command.

### 3.7 The wheel

`wheel.enabled`, **off by default**. A notch turned while the trigger is held **moves the tab grid's
highlight one tab**, and releasing the trigger switches to the tab it landed on (§6.3). Hold, wheel
up twice, let go: two tabs back, with both of them named on screen on the way past.

This is the whole feature. The wheel is not a second way to run a command, it is how the picker that
is already on screen is driven without moving the mouse — which is also what settles the conflict
FEAT-02 was deferred over. The panel does not fight the wheel for it; the panel is what the wheel is
for.

- Only while a gesture is in progress. With nothing held the wheel is the page's.
- **A notch opens the grid early.** The hold delay (§6) exists so a quick flick never flashes the
  panel, and a notch turned under a held trigger is not a flick. Notches turned before the tab list
  arrives are banked and spent the moment the panel appears, so a fast hand lands where it asked.
- The highlight is counted from wherever it already is, and from **this window's active tab** when it
  is nowhere — so the first notch up is the tab before the one in front. It is **clamped at both
  ends, never wrapped**: a wheel is turned in a hurry, and running off one end to reappear at the
  other would switch to the far side of the session three notches after asking for the tab next
  door.
- **The wheel holds the highlight against the jitter it causes.** Turning a wheel moves the mouse,
  every one of those movements is a `pointermove`, and `hoverAt` reads a pointer in the middle of the
  window — where the stroke is drawn, nowhere near a tile — as "over no tile" and clears what the
  notch just set. The highlight therefore survives pointer movement within 24px of where the wheel
  last claimed it, and a deliberate move beyond that hands it back. Without this the feature looked
  completely dead on a real mouse while passing every synthetic test, which move a pointer only when
  told to.
- Landing back on the current tab's tile clears the highlight rather than setting it, which is the
  same rule the pointer follows (§6.3) and makes a notch up followed by a notch down mean no switch.
- A landing scrolled past the panel's clip is scrolled into view. That clip is what `#tileAt`
  rejects points outside of (§6.1); a highlight beyond it would be a tab the user cannot see and is
  about to switch to.
- **`wheel.up` and `wheel.down` run only when the tab grid is switched off**, shipping as `tab.prev`
  and `tab.next`. With no picker on screen there is nothing to highlight, and a wheel that did
  nothing at all would be a switched-on feature with no effect. A step taken that way voids the
  stroke, the way a rocker does.
- The wheel event is cancelled for as long as the trigger is held, whether or not the notch
  completes a step: the page must not scroll out from under a stroke. The listener is registered
  `passive: false`, since a wheel listener on `window` is passive by default in Chrome and a passive
  listener cannot cancel anything.
- **Deltas are banked, and one event is worth at most one step.** A mouse wheel reports a whole notch
  in a single delta, but how large that delta is differs by device and platform — 100 on one, 120 on
  another — so an unbounded bank turns one notch of the same wheel into three steps. Clamping each
  event to a notch makes a notch a step everywhere, while a trackpad's dozens of small deltas for
  one flick still accumulate. Reversing direction drops the bank rather than paying it back.

### 3.8 Both live in the top frame

`attachTrigger` runs in every frame, but the rocker and the wheel are handed to it only in the top
one. Both are answered against the tab grid, and the grid lives in the top frame: a sub-frame has no
way to ask whether the panel is on screen, and one that guessed would fire a rocker over an open
grid. A gesture drawn inside an iframe still draws, still matches and still runs its command
(§8) — it simply has no rocker.

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

| Command id             | Action                                           | Runs in    | Default stroke |
| ---------------------- | ------------------------------------------------ | ---------- | -------------- |
| `tab.prev`             | Activate previous tab, wrapping                  | background | `L`            |
| `tab.next`             | Activate next tab, wrapping                      | background | `R`            |
| `tab.first`            | Activate the leftmost tab                        | background | `LRL`          |
| `tab.last`             | Activate the rightmost tab                       | background | `RLR`          |
| `tab.close`            | Close the active tab                             | background | `RD`           |
| `tab.reopen`           | `chrome.sessions.restore()`                      | background | `LU`           |
| `tab.closeRight`       | Close every unpinned tab right of the active one | background | `URD`          |
| `tab.closeLeft`        | Close every unpinned tab left of the active one  | background | `ULD`          |
| `window.minimize`      | Minimize the current window                      | background | `LD`           |
| `page.top`             | Scroll to top                                    | content    | `RU`           |
| `page.down`            | Scroll down one viewport                         | content    | `U`            |
| `page.up`              | Scroll up one viewport                           | content    | `D`            |
| `page.end`             | Scroll to bottom                                 | content    | _(unbound)_    |
| `tab.moveLeft`         | Move the tab one place left in the strip         | background | _(unbound)_    |
| `tab.moveRight`        | Move the tab one place right in the strip        | background | _(unbound)_    |
| `tab.moveToStart`      | Move the tab to the head of the strip            | background | _(unbound)_    |
| `tab.moveToEnd`        | Move the tab to the end of the strip             | background | _(unbound)_    |
| `tab.closeDuplicates`  | Close every tab whose page is already open       | background | _(unbound)_    |
| `tab.muteAll`          | Mute every tab in the window                     | background | _(unbound)_    |
| `tab.group`            | Put the tab in a new group                       | background | _(unbound)_    |
| `tab.ungroup`          | Take the tab out of its group                    | background | _(unbound)_    |
| `group.collapseOthers` | Collapse every group but the tab's own           | background | _(unbound)_    |
| `open.history`         | Open `chrome://history/`                         | background | _(unbound)_    |
| `open.downloads`       | Open `chrome://downloads/`                       | background | _(unbound)_    |
| `open.bookmarks`       | Open `chrome://bookmarks/`                       | background | _(unbound)_    |
| `open.extensions`      | Open `chrome://extensions/`                      | background | _(unbound)_    |
| `page.viewSource`      | Open `view-source:` for the page                 | background | _(unbound)_    |
| `page.copyUrl`         | Copy the tab's address                           | content    | _(unbound)_    |
| `page.copyTitle`       | Copy the tab's title                             | content    | _(unbound)_    |
| `page.print`           | `window.print()`                                 | content    | _(unbound)_    |
| `app.options`          | Open this extension's settings page              | background | `DLUR`         |

The scheme: a single flick steps sideways through tabs, doubling back (`LRL`, `RLR`) runs to that
end of the strip, and a leading `R`/`L` with a `D` tail closes something. Order matters, so `RD` and
`DR` are distinct strokes.

Vertical page strokes are **inverted on purpose**: `U` pushes the page up, which scrolls down, the
way a touch surface behaves. Do not "fix" this.

`app.options` takes a four-leg `DLUR`. It opens a page rather than acting on one, so it should not
be reachable by a slip of the hand, and the short strokes are spent anyway.

Back and forward take `DL` and `DR`, mirroring the direction they travel. Every other gesture product
puts them on a plain `L`/`R`; those are spent on tab switching here.

There is **one keyboard shortcut**, `toggle-enabled`, declared in the manifest with no key of its
own. Turning gestures off is what someone reaches for when a stroke is fighting a web app, and
reaching for it with the mouse means drawing a gesture — the thing that is not working. It ships
unassigned because every combination worth having is taken by Chrome or by a site, and a shortcut
chosen on the user's behalf is one they have to find and undo. It is assigned from
`chrome://extensions/shortcuts`.

Most of the catalogue ships **unbound**. There is no short stroke left that does not collide, and
inventing bindings nobody asked for is worse than leaving them for the options page. `page.end` is in
the same position.

`nav.stop` has no extension API — the frame calling `window.stop()` on itself is the only way, so it
is a content command. Home page and bookmark toggling are absent for the same reason: Chrome exposes
no API for either.

Rules:

- Moving a tab clamps to its own half of the strip. Chrome keeps the pinned tabs in a block at the
  head and rejects a move that would put an unpinned tab among them, so `tab.moveLeft` and friends
  compute the range they are allowed and stop at its edge rather than throwing.
- `tab.closeDuplicates` keeps the **leftmost** copy of each page and never closes a pinned tab, though
  a pinned tab still claims its page — so an unpinned copy of a pinned tab is a duplicate. Sameness
  is origin, path and query: the fragment is dropped, because `#comments` and `#top` are two places
  in one document. A tab that has not loaded has no URL and can never match. The rule lives in
  `duplicateTabs()` in `src/shared/tabs.ts`, beside `tabsOnSide()` and for the same reason.
- Chrome's own pages open through `tabs.create`, which is the only way in: navigating an existing tab
  to a `chrome://` URL is refused, creating one with it is not. The URLs are written in canonical
  form, since `tabs.create` does not resolve `chrome://history` the way the omnibox does.
- `page.viewSource` only acts on a page that was fetched over HTTP, which is all `view-source:`
  accepts.
- `tab.ungroup` on a tab that is in no group is an error rather than a no-op, so it checks first.
  `groupId` is `-1` for an ungrouped tab and absent on a browser with no tab groups; neither is
  something to ungroup.
- `page.copyUrl` and `page.copyTitle` take the address and title **from the service worker**, not
  from `location`. Page commands run in the frame that drew the gesture, and a cross-origin sub-frame
  sees only its own document — copying an ad frame's URL is never what the gesture meant.
- The clipboard write tries `navigator.clipboard.writeText` first and falls back to an off-screen
  textarea with `execCommand("copy")`. The fallback is deprecated and is still the only thing that
  works in a frame that permissions policy refuses the Clipboard API to.
- Tab commands never touch pinned tabs in the bulk closers.
- `window.minimize` uses `chrome.windows.update`, which needs no extra permission.
- `window.fullscreen` remembers what the window was before, in `chrome.storage.session`, and puts it
  back. `"normal"` is not a safe guess on the way out: a maximized window that went fullscreen came
  back un-maximized. Two things about the exit are platform behaviour rather than choices — leaving
  fullscreen and asking for a state in one `windows.update` drops the state, and a second call issued
  immediately is dropped too, because the exit is animated and the window is still fullscreen when
  the first call returns. So the exit is its own call, and the restore waits for the reported state
  to stop being `"fullscreen"` (56–110ms, measured) before it is applied.
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
- **The grid is built whether or not it is switched on, and asked at the moment it would be shown.**
  Constructing it from `grid.enabled` meant the toggle did nothing on a tab that was already open,
  and neither did the size, which was fixed at construction — while every other setting took effect
  immediately through `chrome.storage.onChanged`. An unused grid is a handful of nodes in a closed
  shadow root that nothing ever reveals; a setting that looks dead is worse.
- **Movement must not dismiss it.** Picking a tile means moving the pointer onto the tile, so any
  rule that reads movement as "the user is drawing instead" cancels the feature at exactly the
  moment it is being used. This was tried with an 8px threshold and again with 32px; both made the
  grid unreachable. Do not reintroduce it.
- The stroke keeps being recognized while the panel is open, and the readout keeps naming it. A
  release with no tile picked runs that stroke as usual. So holding still opens it; flicking straight into a stroke never does.
- The tab list is requested the instant the trigger goes down, in parallel with that timer, so the
  panel has no fetch latency when it appears.
- Data comes from the background: `{ id, title, favIconUrl, active, index, pinned, windowId,
ownWindow, groupId }` per tab, plus the groups those tabs belong to. Which windows it covers is
  §6.5.
- Layout is a **grid** of tiles — favicon plus truncated title, active tab marked. A radial or
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
- Selection listens on `mousedown`, not `click` — the trigger button is still held, and the pick has
  to land before the trigger's own release ends the gesture. Why `mousedown` and not `pointerdown`
  is §6.1.
- A tab with no usable favicon, or one whose favicon fails to load, falls back to a bundled glyph.
  The glyph is what is drawn first and the favicon replaces it on `load`, so the slot is never an
  empty square while the image is still being fetched.
- A tile carries its **audio state**: a speaker for a tab making sound, a crossed speaker for one
  that is muted, in a trailing slot shared with the active dot so the two cannot fight over the same
  margin. Which tab is making the noise is most of the reason for opening a picker, and it was the
  one thing the tab strip showed that this did not. A muted tab is marked whether or not it has
  anything to play, matching the strip: `muted` is a state the user set, `audible` is one the page
  is in.
- Hovering a tile highlights it. **Left-click while the trigger is still held** activates that tab
  and sets `cancelled`, so the pending stroke is discarded when the trigger is released.
- Moving off every tile and releasing the trigger falls through to normal stroke matching.
- Along the bottom edge sits the **cheatsheet**, in its own panel: every bound gesture, as arrow
  chips beside its command name. It is on screen while the trigger is held, which is exactly when
  someone wonders what else they could draw, so the reference belongs there rather than buried in
  settings. It can be switched off, and the panel goes with it — an empty one would dim the bottom
  of the window for nothing. It never takes pointer events.
- **Releasing the trigger over a tile switches to it**, without a click. On by default; §6.3.
- The panel is **docked to the top edge**, and holds one size at every page zoom level; §6.4.
- **The second mouse button and the wheel are how it is worked.** The button picks a tile, and a
  wheel notch moves the highlight one tab; neither reaches a rocker or a wheel command while the
  panel is up. §3.6, §3.7.
- `Escape` closes the grid and cancels the gesture.

### 6.1 Picking a tile under mouse capture

A tile is picked by hit testing, not by a listener on the tile.

Blink captures mouse and pointer events to the node that received the press, for as long as a button
is held. The grid opens a beat _after_ the trigger button goes down, so that node is whatever page
element sat under the cursor beforehand — never a tile. Events still travel through the tree, so a
window-level listener sees them, but their target is that page element and a listener on a tile never
runs. With a keyboard trigger no button is down, nothing is captured, and a tile listener worked
fine, which is what made this look like a packed-build problem rather than a mouse one.

So the top frame listens on `window` in the capture phase, and `TabGrid.pickAt()` finds the tile
whose box contains the pointer. The press is then cancelled and the following `click` and `mouseup`
are swallowed: the capture node underneath is a page element, and picking a tab that happens to sit
over a link must not also follow it.

**Hit testing is clipped to the panel first.** The panel scrolls its own overflow, so a tile
scrolled past that clip keeps a viewport rect — one that lands in the middle of the window, which is
exactly where the stroke is drawn. Testing tiles alone therefore picked tabs that were never on
screen: a release over blank page, with no highlight anywhere to warn of it, switched to whatever
tile happened to have been scrolled under the pointer. `#tileAt()` rejects any point outside
`#panel.getBoundingClientRect()` before it looks at a tile, and both `pickAt()` and `hoverAt()` go
through it.

`:hover` is frozen by the same capture, so the highlight is moved by hand in `hoverAt()`.

### 6.2 The menu after a pick — not solvable from here

On Windows, picking a tile switches tabs while the trigger button is still held, so the release lands
in a tab that never saw the press and the context menu opens there. **This was attempted and
reverted. Do not try it again without new information.**

What was built: the service worker sent the destination tab a `menu.suppress` message and that tab
swallowed its next `contextmenu`. It was armed before the switch rather than after, to rule out a
race with a fast release, and instrumented at both ends.

It never suppressed anything. The press happened in the previous tab's renderer, and the menu that
follows the release is not produced by dispatching a `contextmenu` event through the new tab's page —
so there is no default action for a content script to prevent. `preventDefault()` cannot cancel a
menu the page is never told about.

Approaches that will not help, for the same reason:

- Arming earlier, or for longer.
- Suppressing in the source tab: it is hidden by then, and its `visibilitychange` has already
  cancelled the gesture.
- `chrome.contextMenus`: it customises the menu's contents, and cannot stop it from opening.

The answer is to not need a click at all: see §6.3.

Failing that the workaround belongs to the user, not the code: release the button before clicking, or
use a keyboard trigger, where no button is held during a pick and no menu follows.

### 6.3 Switching on release

`grid.pickOnRelease`, on by default. Releasing the trigger while a tile is highlighted switches to
that tab and voids the stroke drawn underneath, exactly as a click would.

This is what makes §6.2 stop mattering. The menu only follows a pick because the pick happens
mid-gesture, with the button still down; a release that _is_ the pick has no button left to open one.
Hover and release, and nothing is left over.

Two rules keep it from firing on a tab nobody chose:

- The highlight is only ever set by a **move**, or by a **wheel notch** (§3.7) — both deliberate, and
  a notch holds it against the small movements turning a wheel produces. A
  panel that happens to open under a resting cursor therefore has nothing highlighted, and a release
  there falls through to normal stroke matching.
- **This window's active tab is never highlighted**, so releasing over it does nothing rather than
  re-activating the tab already in front. Another window's active tab is not that tab: it is
  somewhere the user is not, picking it is the point of listing that window at all, so it stays an
  ordinary target and is only marked. It carries its own marking instead — a
  brighter neutral than a resting tile, plus a dot, since brightness alone carries it for most
  people and not for everyone. It is deliberately not a second accent colour: hover means "release
  here and you land on this tab", so the accent belongs to the tile that does something, and the
  current tab's tile is only stating where you already are.

**Sub-frames hold their command until the top frame answers.** A gesture drawn in an iframe runs its
command in that frame, but only the top frame owns the grid and knows whether the release landed on a
tile — and it learns that a postMessage hop later, long after the sub-frame has already decided. So
`end` is now answered: the top frame replies `cancel` (a tab was picked) or `resume` (nothing was),
and the sub-frame runs its held command only on `resume`. A reply that never arrives — a top frame
without the content script — falls back to running it after 300ms, which is what used to happen
unconditionally.

### 6.4 Where the overlay sits

Three bands, and the middle one is deliberately empty:

| Band   | What                        |
| ------ | --------------------------- |
| Top    | the tab tiles               |
| Middle | the stroke, and the readout |
| Bottom | the gesture cheatsheet      |

**The middle belongs to the gesture.** It is where the stroke is drawn, and it is the part of the
window the cursor crosses on the way to anywhere. A panel there sits under the stroke and takes the
clicks meant for the page. So the two panels are docked to the edges, each capped at a share of the
window's height, and the readout — which takes no pointer events at all — has the centre to itself.

Each panel grows away from the edge it is pinned to (`transform-origin: top center` and
`bottom center`), or scaling it up would push its own border off the screen. Both keep a gap from
their edge, and that gap is scaled by hand: the strips holding them are not themselves scaled, so a
larger overlay would otherwise sit the same distance from the edge as a small one.

Anchoring the tab panel to the cursor was tried and removed: it reads as clanky, because the panel
lands somewhere new on every gesture and the eye has to find it each time. A fixed position is
somewhere the eye can go before the panel is even there. Do not reintroduce it.

Only `opacity` and `transform` transition. `transition-all` animates the box metrics too, and the
panel visibly reflows as the tab count lands.

## 6.5 Every window, and tab groups

`grid.allWindows` lists the tabs of every window in the profile, not only the one the gesture is in.
On by default, and a toggle in settings: someone working in one window gains nothing from the
headings, and someone working in four gets the whole session in one picker.

- **Incognito never mixes with the rest, in either direction.** A gesture drawn in an ordinary
  window must not put private tabs on screen — the extension can only see them at all if the user
  has allowed it in incognito — and a gesture drawn in a private window listing every ordinary tab
  is the same surprise the other way round. The background filters to tabs whose `incognito` matches
  the sender's, so each side sees its own and the toggle changes nothing about that.
- `windowType: "normal"` on the query: devtools windows and app popups have no tab strip worth
  switching through.
- Order is the layout. The background sorts own window first, then the other windows in a stable
  order, each window's tabs in strip order, and the grid renders exactly that. A window heading is
  drawn at each boundary, and only when more than one window is on screen — with a single one it
  would be a label for everything.
- **Picking a tab in another window raises that window.** `tabs.update` alone changes something the
  user cannot see; `windows.update({ focused: true })` is the other half of the pick.
- The close-to-the-side count in the readout filters to `ownWindow` first. Every window in the list
  has an active tab of its own, and those commands only ever touch this window's strip.

Tab groups need the `tabGroups` permission, which adds no install warning of its own on top of
`tabs`. A group's colour runs down the left edge of every tile in it — a rounded pill inset in the
tile rather than a thick left border, which the corner radius would have dragged into a wedge and
mitred against the thin top and bottom borders — and a heading carries the
colour and the group's name at the start of each run — Chrome allows an untitled group, which reads
as its colour alone in the strip and does the same here. Group runs are contiguous by construction:
a group is contiguous in the strip, and the sort keeps strip order. The nine colours are set as
inline styles from a palette in `tab-grid.ts`, since the build never sees those class names, and
they are Chrome's own dark-background tones so a group looks like itself. A collapsed group's tabs
are dimmed rather than dropped: picking one still works, and expands the group.

## 7. Overlay

- One closed shadow root per frame, appended to `document.documentElement`.
- Host: `position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; contain: strict`.
- Tailwind is imported `?inline` and adopted via `adoptedStyleSheets`. Never inject a `<style>` tag
  into the page: preflight must not touch host styles.
- The trail is a `<canvas>` sized to the viewport times `devicePixelRatio`, redrawn on
  `requestAnimationFrame`: a wide blurred underlay for the glow, a crisp core on top, joined through
  midpoints with `quadraticCurveTo` so it reads as a stroke rather than a polyline.
- **The drawn line is not the sample list.** A mouse reports far more samples than a line needs, and
  `getCoalescedEvents` hands over every one the compositor buffered — several within a single pixel,
  carrying the hand's tremor and the sensor's rounding but no shape, and each one a control point the
  curve is obliged to pass through. Two things fix that, and **neither may delay the head**, because
  the trail is the only feedback that the gesture is being seen at all:
  - Samples less than **3 CSS pixels** from the last kept one are dropped.
  - A kept sample is smoothed — pulled a quarter of the way towards each neighbour — only once it
    has a successor and is no longer the tip. Smoothing the head instead is what makes a trail lag
    behind the cursor; here the tip is always the raw sample that just arrived, and only the part
    already behind the pointer is tidied.

  The line drawn ends with the newest raw sample, so it reaches the cursor rather than stopping up to
  a step short of it. The recognizer never sees any of this: it quantizes the raw points, so
  smoothing cannot change which command a stroke matches.

- **`trail.show` turns the line off without turning anything else off.** The recognizer, the readout,
  the tab grid and every command keep running — it hides the drawing, not the gesture. Trail options
  are read through a function rather than captured, because `storage.onChanged` replaces
  `sync.trail` wholesale and a captured object would be the settings as they were at page load.
- Glass surfaces blur the backdrop by **6px**. Heavier blurs turn the page behind into an unreadable
  smear, which matters here because the overlay covers content the user is still reading.
- Layering inside the shadow root is explicit, not append order: tab grid `z-10`, trail `z-20`,
  readout `z-30`. The trail sits **above** the grid because the grid stays open while a stroke is
  being drawn, so putting the trail underneath would hide the feedback exactly when it is needed.
  Where it crosses a panel it drops to **30% strength**, which is the other half of that trade: at
  full strength it hides the tile title the tile exists to show. Drawn faint across the whole stroke,
  then full strength composited back on everywhere the panels are not — through a mask erased with
  `blur()`, so the two strengths meet in a gradient centred on the panel's edge rather than a step.
  Clipping is what a first version did, and a clip has a hard edge by definition.

  Overlapping the two passes is safe because a single `stroke()` composites the whole path at once:
  a self-crossing is painted exactly as dark as a plain segment, verified rather than assumed.

  The mask is cut from `getBoundingClientRect()`, which is the only thing that reports where a
  transformed box actually is. The panels fade in on a scale transform, so a mask cut on the first
  frame is 5% short of where the panel ends up — the trail keeps repainting until the transform
  settles (§6.4).

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

### 7.3 Tailwind inside the shadow root

Tailwind v4 declares its internal variables with `@property` and utilities read them: `.border`
emits `border-style: var(--tw-border-style)` and depends on that registration's
`initial-value: solid`.

Registrations are document-global and are **ignored inside a shadow tree**. The overlay stylesheet
is only ever adopted into the closed shadow root, so in a packed build none of them take effect,
every `var()` resolves to nothing, and borders, transforms and shadows disappear. A dev build hides
this: Vite also puts the stylesheet in the document, which registers them.

**The dev server freezes this stylesheet.** The content script imports it with `?inline`, and the
dev server writes that import to disk as its own module once, at startup. Editing a `.ts` file
rewrites that file's module and not the stylesheet, so a utility class used for the first time never
reaches the shadow root: the class is simply absent, and the overlay collapses to unstyled boxes in
the top-left corner. Touching the CSS entry to make Tailwind regenerate does not help — the writer
still does not re-emit it. **Restart `npm run dev` after introducing a class the overlay has not used
before**, or check the behaviour in a `npm run build` load, which is what AGENTS.md asks for anyway.

Tailwind's own fallback sits behind an `@supports` test that Chrome passes, so it never applies.
`withPropertyFallback()` in `src/content/css-fallback.ts` rebuilds it from the registrations found in
the sheet — one zero-specificity rule that any utility setting the variable still overrides. Do not
"fix" this by injecting the stylesheet into the document; §7 and AGENTS.md forbid it.

### 7.4 Overlay scale

Everything the overlay draws is sized by one number:

```
scale = uiScale / pageZoom
```

`uiScale` is the user's own setting, per device (§9) and exposed as a slider from 50% to 200%. It
exists because a size that reads well on a 13-inch laptop is small on a 32-inch 4K monitor, and that
is a property of the display, not of the person — so it must not sync.

`pageZoom` is the tab's zoom, divided out so the overlay holds its size while the page around it
grows. It is read from the background with `chrome.tabs.getZoom`, once per gesture since the user can
zoom at any time. A content script cannot work it out for itself: `devicePixelRatio` folds page zoom
together with the display's scale factor and the two cannot be separated.

**Every design size in the overlay is a screen size.** A panel's layout box is multiplied by the
scale before it lands on screen, so a layout width of 900 is 900 screen pixels whatever the zoom —
the constant is written as-is and the transform does the work. Dividing it by the scale as well
double-counts the zoom and was a bug. The conversion runs the other way for anything measured _from_
the page: the layout viewport is in the page's own pixels, so it is divided by the scale before
being compared with a design size. `TabGrid.#room()` is that conversion, and every fit decision goes
through it.

**The layout viewport comes from `viewport()` in `src/content/viewport.ts`, never from a property
read directly.** Neither obvious choice is that number in every case. `window.innerWidth` counts a
classic scrollbar the overlay's fixed boxes do not reach across, which drifts everything the trail
draws to the left of the cursor. `documentElement.clientWidth/clientHeight` is the layout viewport
only in standards mode; in quirks mode — any page served without a doctype — it is the root element's
own box, so on a long page it reports the whole document. Measured at 3016 against an `innerHeight`
of 739, which let the tab grid budget itself several times the height of the window and slide under
the gesture list, and made the trail's bitmap disagree with its CSS box so the stroke was drawn well
away from the pointer. `viewport()` reads the client box of `body` in quirks mode and of
`documentElement` otherwise, which is right in both.

Applied three different ways, because the three layers are different kinds of thing:

- **Tab grid** and **readout**: `transform: scale(…)`, with the entrance animation folded into the
  same transform. One property, so the two cannot fight over it.
- **Trail**: line width, glow radius and head radius only. The stroke is drawn in the page's own
  coordinates because it has to follow the cursor, so scaling the canvas would move the line off the
  pointer.

## 7.5 The top layer

**The overlay host is a manual popover, and that is what keeps it above a fullscreen element.**

`element.requestFullscreen()` promotes its element into the browser's **top layer**, which paints
above every stacking context the document has. `z-index: 2147483647` does not compete with it: the
number is only meaningful among siblings in the document, and the fullscreen element is no longer
being ordered against them. Before this the overlay was still in the DOM and the canvas was still
being drawn — underneath a surface the page has no say over. What the user saw was a gesture that
did nothing on a fullscreen video.

- `popover="manual"` is the way into the top layer without side effects. `<dialog>.showModal()`
  reaches it too, and takes focus and makes the rest of the page inert, which would break the page
  under a passive overlay. A manual popover does neither, and never light-dismisses.
- **The top layer is a stack in insertion order.** An element that enters it later paints above one
  already there — so a page going fullscreen after the overlay was shown covers it again. Hiding the
  popover and showing it straight back re-inserts it at the top, which is why `promote()` runs on
  every `fullscreenchange` rather than once at startup. The same call covers leaving fullscreen,
  where the element that was promoted may have been an ancestor of the host.
- The UA stylesheet gives a popover a border, padding, a background, `width: fit-content` and
  `overflow: auto`. Every one of them is overridden in the host's inline style, which beats the UA
  sheet, rather than being left to chance.
- `pointer-events: none` on the host still holds in the top layer, so the page underneath keeps
  every click that is not on a tile — and a tile in the top layer takes its press ahead of the
  fullscreen element, which is what makes picking a tab work there at all.
- **Feature-detected.** Chrome has had the popover API since 114; without `showPopover` the overlay
  is an ordinary fixed element, exactly as it was, and a fullscreen element covers it. Nothing else
  in the extension depends on it, so this raises no floor.
- Only fullscreen is handled. A page that shows its own popover or modal dialog after the overlay
  went up is above it in the same stack, by the same rule. Nobody has asked for that and re-promoting
  on every top-layer change is not something the platform reports.

Measured, both ways: with the popover the grid, readout and trail all draw over a fullscreen element
and a tile click switches tabs there; with it stashed out, the same gesture on the same page paints
nothing. Pointer events reached the content script identically in both runs — the events were never
the problem, the paint order was.

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
a trail around and nothing else. The messages that travel **down** are the top frame's answer to an
`end` — `cancel` ("a tab was picked, drop your held command") or `resume` ("nothing was, run it") —
relayed along the same chain in reverse. §6.3 covers why the answer is needed and what happens when
it never comes.

Cross-origin iframes that have not loaded yet, `chrome://` pages, the Web Store, the PDF viewer, and
`view-source:` cannot host a content script. Gestures do not work there; this is a platform limit,
not a bug to fix.

## 9. Storage

```ts
interface SyncSettings {
  // chrome.storage.sync
  version: 7;
  language: "auto" | Locale; // §10.2
  gestures: Record<string, CommandId>; // stroke -> command
  grid: {
    enabled: boolean;
    holdMs: number;
    size: "compact" | "normal" | "large";
    cheatsheet: boolean;
    pickOnRelease: boolean; // §6.3
    allWindows: boolean; // §6.5
  };
  rocker: { enabled: boolean; back: CommandId; forward: CommandId }; // §3.6
  // up/down run only when the grid is off; with it on, the wheel steers the grid. §3.7
  wheel: { enabled: boolean; up: CommandId; down: CommandId };
  trail: { show: boolean; color: string; width: number; showLabel: boolean };
  disabledOrigins: string[];
}

interface LocalSettings {
  // chrome.storage.local, per device
  version: 2;
  trigger: Trigger;
  enabled: boolean;
  uiScale: number; // 1 is the designed size; §7.4
}
```

`version` is bumped whenever a shape changes, with a migration in the service worker's
`onInstalled`, which runs on both install and update. v2 replaced the grid's `columns` with `size`;
v3 added the language override; v4 added `pickOnRelease`; v5 added `app.options` to the default map;
v6 added `allWindows`; v7 added the rocker and the wheel. Local v2 added `uiScale`. Both of v7's
additions arrive switched off whatever else a profile carries: an update is not a moment to change
what somebody's plain click does.

Reads merge defaults **one level deep**. Storage is written per top-level key, so a stored `grid`
written before a field existed would otherwise replace the whole default object and leave that field
`undefined` — a shallow merge makes every future nested addition a crash waiting for the next
release. `migrate()` fills in fields the stored object
never had rather than letting a reader find `undefined`.

Two things about that merge are load-bearing, and both were bugs first.

**Settings are read by key name, never by handing `chrome.storage.get` an object of defaults.**
Given an object, Chrome performs a one-level merge of its own — the default is merged _into_ the
stored value before anything is returned. Asking for `{ trigger: <default> }` when
`{ kind: "button", button: 2 }` is stored returns `{ kind: "button", button: 2, modifier: "Alt" }`
on a platform whose default carries a modifier. That merge happens upstream of our code, so the only
way to control it is not to ask for it: `get(Object.keys(defaults))` returns exactly what is stored,
and missing keys fall back to the defaults here.

**`trigger` and `gestures` replace their defaults rather than merging into them.** A `Trigger` is a discriminated union
(§3), and merging one variant into another produces neither. The options page writes a bare button
trigger with no `modifier` key at all, so any merge — Chrome's or ours — hands the modifier back and
clearing it silently does not stick. On Windows the default has no modifier and the bug is invisible;
on macOS and Linux it made the bare right button unselectable. `gestures` is a map rather than a bag
of fields: merged into the defaults, every binding the user cleared reappears on the next load, and
removing one is impossible by construction — a stored map is the whole map, and a binding added to
the defaults reaches existing profiles through `migrate()`. Every other settings object is a bag of
independent fields, where merging is exactly what makes a newly added field appear.

### 9.1 Export and import

Settings go out as one JSON file — `src/shared/backup.ts` — and come back through `parseBackup()`.

```ts
interface BackupFile {
  app: "write-click"; // refuses a file belonging to something else
  format: 1; // the file shape, not `version` above
  extension: string; // which build wrote it, for a person reading it
  exportedAt: string;
  sync: SyncSettings;
  local: LocalSettings;
}
```

**Both areas travel together**, the per-device ones included. The trigger and `uiScale` are never
synced (§3, §7.4), but an export is a thing someone asked for by name, and a backup that restores
everything except the button you press is not a backup. An imported trigger gets the same
context-menu warning as one chosen by hand.

**The file is untrusted input.** It came off a disk, and every value in it reaches a canvas, a stored
gesture map or a pointer listener. Each field is checked against what the matching control can
produce and clamped into its range; anything unreadable falls back to that field's default rather
than failing the whole import, because one bad colour should not cost someone their gesture map. Only
a file that is not JSON, or does not carry `app: "write-click"`, is refused outright — those two
cases are reported separately, since one is the wrong file and the other is a damaged one.

Bindings are filtered rather than clamped: a stroke outside `[UDLR]{1,MAX_SEGMENTS}`, a command this
build does not have, and a second stroke for a command that already has one are all dropped, and the
count is reported. A binding that cannot fire looks exactly like a missing one on the options page,
except that it also occupies a stroke. A gesture map that is present and empty stays empty — someone
cleared it, and an import restores what was exported.

`version` is this build's, never the file's: an old file goes through the same defaults every field
does, so there is no second migration path to keep in step with `migrate()`.

The import writes each area **whole**, not as a patch: it restores a state, and a merge would leave
behind whatever the file does not mention.

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
save button. Sections: language, trigger, gestures, rocker and wheel, overlay, disabled sites,
backup, reset.

Icons are bundled with the module, which runs after the first paint, so every glyph the static
shell shows has an empty box of its final size waiting for it in the markup — `paintIcon` fills the
box rather than appending to a button that is already on screen, which would shift the label beside
it. The label sits in its own `data-i18n` span for the same reason: `applyStaticMessages` writes
`textContent`, which would wipe a sibling placeholder out of the button.

A **side navigation** lists those sections and highlights the one in view. One table in `options.ts`
drives both it and the cards, so a new section cannot appear in one and be forgotten in the other,
and a link is guaranteed to carry the same name as the card it scrolls to. It is hidden below `lg`,
where there is no room beside the cards and the page is short enough to scroll.

Rebinding is done by **drawing**, in a pad that calls the same `quantize` the content script does —
what you draw in the pad is by construction what will match on a page. A stroke means exactly one
command, so drawing one that is already taken moves it and leaves the previous owner unbound, which
the page says out loud rather than silently dropping.

The trigger section asks **one question rather than three**. Hold / Button / Modifier are three
controls for a single decision — keep the native context menu or not — so the card leads with that
decision as two rows, `Right button` and `Alt + right button`, and the sentence that used to be an
amber warning becomes the description of the row the reader picked. Both rows write a whole
`Trigger`; nothing about them is a separate setting. The raw three move behind a closed fold named
**Another button or key** — not "Advanced": a middle button or a keyboard key is nobody's expert
setting, it is the third answer to the same question, and a fold that calls it advanced tells the
reader they are doing something unusual. It is folded because it is rarer, and named for what is
inside it. It opens by itself for a trigger neither row can name, because the controls that set it
are then the only place it is visible. The per-platform wording still follows §3.1, and the modifier
is named as the keyboard prints it: Option and Command on macOS.

Beside the rows is the **trigger glyph**: the key held above, a mouse with the chosen button lit,
and the stroke both of them draw, looping. The keycap carries the modifier under the name the
keyboard prints on it, or the key code for a key trigger, and goes down on the same beat as the
button, because the two are held together and that is the fact three separate dropdowns hid. A
trigger with no key has no cap rather than an empty one. It is artwork, so it lives in `src/icons/` and never in `src/icons/material/`, which
`scripts/sync-icons.mjs` empties on every build; the clipPath id inside it is rewritten per instance,
since two glyphs on one page would otherwise both be clipped by whichever shape came first. The loop
stops under `prefers-reduced-motion`, keeping the lit button and the finished stroke.

Under them is a **try-it pad** wired through the real `attachTrigger`. The gestures pad records a
stroke from any pointer press, which teaches nothing about the trigger; this one answers the
configured trigger and nothing else, and names a near miss — "right button is not the trigger. Hold
Option + right button." — because a first gesture drawn with the wrong thing held is exactly the
failure this card exists for, and on a real page that failure is silent.

The pad draws **while the stroke is being drawn**: the line on its own canvas in the trail's
configured colour and width, the arrows, and the name of the command the stroke would run right now,
all per sample. A pad that only answered on release would teach the wrong model of the thing — on a
page the readout names the command before the button comes up, and bending the stroke changes the
answer. The line stays up after the release, as the answer to what was just drawn, and is cleared
when the next stroke starts. The overlay's `Trail` is deliberately not reused: it owns a
viewport-sized canvas inside the content script's shadow root and decimates and smooths for a line
that runs across a whole page, none of which applies to a box 160 pixels tall. What has to agree is
the colour and the width, and those come from the same settings. `attachTrigger` listens
on the window, so strokes begun elsewhere on the page are dropped by geometry; its context-menu
suppression is window-wide while the pad is mounted, which is the same behaviour the trigger has on
a page and the point of trying it. Beside the pad's heading is a link back to the welcome page
(§10.3), which otherwise opens exactly once in the life of the extension and is the only place the
trigger is taught from cold.

Two controls listen on the `window` rather than on themselves — the key capture, which has to read a
keystroke wherever focus is, and the draw pad, whose Escape cancels. Both hang off one
`AbortController` that `render` aborts before it rebuilds the page, because `render` replaces the
DOM underneath them and a listener bound to a button that no longer exists still fires. The key
capture additionally leaves on Escape or Tab, on a second click of its own button, and on blur; it
never binds Escape, which is the recognizer's own cancel key and the key anyone who changed their
mind will press.

The backup section is two buttons and a textarea over §9.1, both paths through the same
`restore(text)`. The textarea holds the same contents as the file, because moving a backup between
two computers otherwise means moving a file, and it is the only way to read what an export contains
before sending it anywhere. It is rebuilt from stored settings on every render, so it never shows a
state that is not the current one; `Copy` falls back to selecting the text when the clipboard is
denied, which leaves the keyboard shortcut. The download goes through an object URL and a
synthetic click rather than `chrome.downloads`, which would need a permission nothing else here
wants; the object URL is revoked on a timer, because revoking it in the same task cancels the
download in Chromium. The file input is hidden behind a styled button and cleared after every pick,
since choosing the same file twice in a row fires no `change` event and would read as an import that
did nothing.

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

## 10.3 Welcome page

`src/welcome.html` + `src/welcome.ts`, opened by the service worker from `chrome.runtime.onInstalled`
on `reason === "install"` and never on `"update"`: an update that opens a tab under someone who did
not ask for one is what extensions are disliked for, and there is nothing on the page an existing
user has not seen.

It exists because the trigger is per device and platform-dependent, and on macOS and Linux the
default pairs the right button with a modifier (§3.1). A new user's first instinct is a bare
right-drag, which does nothing and says nothing. The options page explains that in a paragraph and
the popup prints it as a line, and neither is read before the first gesture fails; this page is read,
because it opens itself. Four beats: what the trigger is **on this machine**, computed rather than
described; the glyph from §10.1; **the strokes that are already assigned**, as arrows and names, in
the same order the overlay's cheatsheet uses — a page that teaches the trigger and stops there
leaves someone holding the right key with nothing to draw; and the same try-it pad, so the first
successful gesture happens here instead of on a page where failure is silent.

It is reachable afterwards from the Trigger card in settings, which is the section it teaches;
without that link a page that opens itself once can never be read twice.

Nothing in the manifest points at it, so Vite would not emit it — it is named in
`build.rollupOptions.input`. `options.html` and `popup.html` need no such entry, because
`options_ui` and `default_popup` reach them.

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
7. **Fit and finish** — done. Switching on release (§6.3), the three-band overlay layout (§6.4), an
   overlay scale that cancels page zoom and exposes a per-device size (§7.4), and a side navigation
   on the settings page (§10.1).

Done criteria per phase: `npm run build`, `npm run typecheck`, and `npm run lint` all clean, and the
phase's behaviour verified in a loaded unpacked build.

## 12. Known gaps

The fullscreen gap that stood here — a fullscreen element painting over the overlay — is fixed in
§7.5.

Everything else outstanding lives in [`docs/backlog/`](backlog/README.md), one file per finding,
from the full-repo review of 2026-08-27. **2 of the 17 are still open, and neither is a bug**: what
is left is one feature and one interface item. FEAT-02 is done — the rocker and the wheel are §3.6
and §3.7, and the design decision it was held for is the grid owning the second button and the wheel
while it is on screen. FEAT-04 folded the catalogue additions into §5
and the manifest shortcut with them; FEAT-01 and UX-02 added §10.3 and rewrote the trigger section
of §10.1; STORE-01 and STORE-02 are store assets and live in `docs/store-assets.md`, not here. Every fix that contradicted this spec has
had its reasoning folded in: BUG-01 into §6.1, BUG-02 into §7.4, BUG-03 into §6, BUG-04 into §3.4,
BUG-05 and BUG-06 into §10.1, BUG-09 into §5. BUG-07 and BUG-08 were internal and changed nothing
this spec describes.
