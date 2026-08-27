# BUG-05 — The options key capture stays armed after the user walks away

- **Status:** ongoing
- **Severity:** medium
- **Area:** `src/options.ts`, `triggerCard()`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

Click "press a key" to pick a key trigger, then change your mind and click elsewhere. The capture is
still listening. The next keystroke anywhere on the options page rebinds the trigger to it —
including Escape, which binds the trigger to Escape and takes the recognizer's own cancel key with
it.

## Cause

```ts
capture.addEventListener("click", () => {
  capture.textContent = t("options_trigger_key_press");
  window.addEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      void patchLocal({ trigger: { kind: "key", code: event.code } });
    },
    { capture: true, once: true },
  );
});
```

`{ once: true }` removes the listener after it fires, but nothing removes it if it never fires.
There is no cancel path, no blur handler, and Escape is not special-cased.

## Fix

- Escape (and Tab) cancel the capture instead of being bound
- an `AbortController` whose signal is passed to the listener, aborted on a second click of the
  button, on blur, and on the next `render()`
- restore the button's label on cancel

Same shape of bug as BUG-06; fixing both together is one pass over the page's ad-hoc `window`
listeners.
