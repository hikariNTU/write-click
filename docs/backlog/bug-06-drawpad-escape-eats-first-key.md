# BUG-06 — The draw pad's Escape handler eats the first key, whatever it is

- **Status:** ongoing
- **Severity:** low
- **Area:** `src/options.ts`, `drawPad()`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

Open the draw pad for a gesture and press any key that is not Escape — Shift on the way to
something else is enough. Escape no longer cancels the pad. The listener is also never removed, so a
stray Escape long after the pad has closed re-renders the page for no reason.

## Cause

```ts
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") onCancel();
  },
  { once: true },
);
```

`{ once: true }` fires on the first keydown of any kind and then removes itself, so a non-Escape key
consumes the one shot the handler gets.

## Fix

Drop `once`, and tear the listener down explicitly when the pad completes or cancels — an
`AbortController` shared with BUG-05's fix covers both.
