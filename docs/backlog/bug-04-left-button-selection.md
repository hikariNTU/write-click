# BUG-04 — A left-button trigger selects text and drags links

- **Status:** ongoing
- **Severity:** medium — only bites users who choose button 0
- **Area:** `src/content/trigger-runtime.ts`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

With the trigger set to the left button, drawing a gesture paints a text selection across the page
and can start a native link or image drag. The stroke still recognizes, but the page is left in a
mess and the drag ghost follows the cursor over the overlay.

## Cause

`onPointerDown` suppresses the browser's own behaviour for exactly one button:

```ts
// The middle button would otherwise start Chrome's autoscroll.
if (trigger.button === 1) event.preventDefault();
```

Nothing anywhere listens for `selectstart` or `dragstart`. The left button is offered in the
options page's button list, so this is a reachable configuration, not a theoretical one.

## Fix

While a button trigger is active, suppress the two page behaviours that fight it:

- `preventDefault()` on `pointerdown` for button 0 as well (this alone stops the drag)
- swallow `selectstart` and `dragstart` for the life of the stroke, added on start and removed on
  finish/cancel, the same shape as the existing `click`/`auxclick` swallow in `onPointerUp`

Do not blanket `preventDefault` every button: focus and caret placement on a plain click are the
page's, and the trigger only owns the gesture.
