# FEAT-01 — Nothing tells a new user what their trigger is

- **Status:** done — 2026-08-27. `src/welcome.html` + `src/welcome.ts`, opened from `onInstalled`
  on `reason === "install"` only. Verified against a real loaded `dist/`: the tab opens itself, the
  page names this machine's trigger, the glyph lights the trigger's button, and a stroke drawn in
  the pad is matched to its command.
- **Priority:** highest of the feature gaps
- **Area:** `src/background/service_worker.ts`, new `welcome.html`
- **Found:** 2026-08-27, repo review

## The gap

`chrome.runtime.onInstalled` logs a line and runs `migrate()`. Nothing else happens on install.

The trigger is per-device, platform-dependent, and on macOS and Linux the default is **Alt + right
button** (`defaultTrigger()` in `src/shared/trigger.ts`). A new user's first instinct is a bare
right-drag, which does nothing, and there is no surface that tells them otherwise before they try.
The options page explains it in an amber warning paragraph; the popup prints the trigger as text.
Neither is read before the first gesture fails.

Every comparable extension opens something on install for exactly this reason.

## Shape

`onInstalled` with `details.reason === "install"` opens `welcome.html`, three beats:

1. **What your trigger is on this machine** — computed from `detectPlatform()`, not a generic
   sentence. "Hold **Option** and the **right button**, then draw."
2. The animated mouse glyph from `ux-02-trigger-tutorial.md`.
3. A live pad wired through the real `attachTrigger`, so the first successful gesture happens here
   rather than on a page where failure is silent.

Do not open anything on `reason === "update"`.

## Related

`ux-02-trigger-tutorial.md` — the pad and the animation, which this page reuses rather than
duplicates. Both landed together; `mouseGlyph` and `triggerPad` live in `src/trigger-ui.ts` and are
built once for the options page, the popup and this one.

## What it needed beyond the shape above

Nothing in the manifest points at `welcome.html`, so nothing in the build graph reaches it and Vite
emitted no such file: it is named in `build.rollupOptions.input`. `options.html` and `popup.html`
need no entry, because `options_ui` and `default_popup` reach them.
