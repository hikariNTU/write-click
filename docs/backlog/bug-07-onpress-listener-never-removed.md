# BUG-07 — `onPress` is the one listener `apply()` never tears down

- **Status:** ongoing
- **Severity:** low — no user-visible symptom today
- **Area:** `src/content/view.ts`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

None currently. Recorded because it is an inconsistency that will become a bug the moment the view
stops being a singleton.

## Cause

`createView` registers the grid's picking listener at module scope of the closure and returns no way
to remove it:

```ts
window.addEventListener("mousedown", onPress, { capture: true });
```

`attachTrigger` returns a detach function and `apply()` uses it on every settings change. The view's
own listener has no equivalent. It is currently harmless because exactly one view exists per frame
for the life of the document, and `onPress` returns early unless `grid?.visible`.

## Fix

Give `View` a `destroy()` that removes it, and call it if `createView` ever runs more than once —
which BUG-03's fix may well introduce, since rebuilding the grid is the obvious way to make the
toggle live. Worth fixing in the same pass.
