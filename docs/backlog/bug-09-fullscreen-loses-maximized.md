# BUG-09 — Leaving fullscreen loses a maximized window

- **Status:** done — fixed 2026-08-27 — prior state in `storage.session`, exit polled before restoring
- **Severity:** low
- **Area:** `src/background/tab-commands.ts`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

Draw the fullscreen gesture on a maximized window, then draw it again. The window comes back
"normal" — restored to whatever size it had before it was maximized — rather than maximized.

## Cause

```ts
const current = await chrome.windows.get(windowId);
const state = current.state === "fullscreen" ? "normal" : "fullscreen";
```

`"normal"` is hard-coded as the way out, so the state the window was in before fullscreen is not
remembered.

## Fix

Remember the pre-fullscreen state per window id in the service worker's memory and restore it,
falling back to `"normal"` when nothing is recorded — a service worker restart between the two
gestures is the normal case, not an error.
