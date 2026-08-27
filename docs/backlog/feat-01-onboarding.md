# FEAT-01 — Nothing tells a new user what their trigger is

- **Status:** ongoing
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
duplicates.
