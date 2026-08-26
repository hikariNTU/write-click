import { menuFiresOnMouseDown } from "../shared/trigger";
import type { Modifier, Trigger } from "../shared/trigger";
import { DRIFT_THRESHOLD, distanceSquared } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";

export interface TriggerHandlers {
  onStart(point: Point): void;
  onMove(point: Point): void;
  /** `drifted` is false when the pointer never passed DRIFT_THRESHOLD. */
  onEnd(drifted: boolean): void;
  onCancel(): void;
}

interface ModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_KEYS: Record<Modifier, keyof ModifierState> = {
  Alt: "altKey",
  Control: "ctrlKey",
  Meta: "metaKey",
  Shift: "shiftKey",
};

/**
 * Exact match: the required modifier must be down and every other modifier up.
 * That is what keeps Shift+right-click free as the native-menu escape hatch.
 */
function modifiersMatch(event: ModifierState, required: Modifier | undefined): boolean {
  for (const [name, key] of Object.entries(MODIFIER_KEYS) as [Modifier, keyof ModifierState][]) {
    if (event[key] !== (name === required)) return false;
  }
  return true;
}

/** The `buttons` bitmask for a `button` index: 0 -> 1, 1 -> 4, 2 -> 2. */
const BUTTON_MASK: Record<0 | 1 | 2, number> = { 0: 1, 1: 4, 2: 2 };

function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Turns one Trigger into start/move/end/cancel callbacks, and owns every
 * native side effect that has to be suppressed: the context menu (docs/SPEC.md
 * §3.2), the click that would follow a button gesture, and the keyup that
 * would open Chrome's menu bar after a bare Alt.
 */
export function attachTrigger(trigger: Trigger, handlers: TriggerHandlers): () => void {
  const options = { capture: true } as const;
  let active = false;
  let drifted = false;
  let origin: Point | undefined;
  /**
   * Where the pointer was last seen, or undefined until it has moved once.
   *
   * Not seeded with the top-left corner: a key trigger held before the page has
   * ever seen a `pointermove` would start the stroke at 0,0 and the trail's
   * first leg would be a line from the corner to wherever the cursor really is.
   * There is no way to ask for the cursor's position, so an unknown position is
   * carried as unknown.
   */
  let pointer: Point | undefined;
  /** A key trigger held down while `pointer` was still unknown. See `track`. */
  let waiting = false;

  function start(point: Point): void {
    active = true;
    drifted = false;
    origin = point;
    handlers.onStart(point);
  }

  function finish(): void {
    waiting = false;
    if (!active) return;
    active = false;
    handlers.onEnd(drifted);
  }

  function cancel(): void {
    waiting = false;
    if (!active) return;
    active = false;
    drifted = false;
    handlers.onCancel();
  }

  function track(event: PointerEvent): void {
    const at = { x: event.clientX, y: event.clientY };
    pointer = at;
    // The trigger went down before the cursor's position was known, so this
    // sample is the stroke's origin rather than a move within it.
    if (waiting) {
      waiting = false;
      start(at);
      return;
    }
    if (!active) return;

    // The pointer stays live outside the window while a button is held, and a
    // stroke that overshoots the viewport edge is perfectly normal, so leaving
    // is not a reason to stop. A button that is no longer down is: the release
    // happened somewhere we never saw it — another app took focus, or a native
    // menu grabbed the pointer — and every point since then is noise.
    if (trigger.kind === "button" && (event.buttons & BUTTON_MASK[trigger.button]) === 0) {
      cancel();
      return;
    }

    const events = event.getCoalescedEvents?.() ?? [event];
    for (const sample of events) handlers.onMove({ x: sample.clientX, y: sample.clientY });

    if (!drifted && origin && distanceSquared(origin, at) > DRIFT_THRESHOLD ** 2) {
      drifted = true;
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (trigger.kind !== "button" || event.pointerType !== "mouse") return;
    if (event.button !== trigger.button) return;
    if (!modifiersMatch(event, trigger.modifier)) return;
    // The middle button would otherwise start Chrome's autoscroll.
    if (trigger.button === 1) event.preventDefault();
    start({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp(event: PointerEvent): void {
    if (trigger.kind !== "button" || event.button !== trigger.button) return;
    const suppressClick = active && drifted;
    finish();
    if (!suppressClick) return;
    // A drag that ended on a link must not also activate it.
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.addEventListener("auxclick", swallow, { capture: true, once: true });
    setTimeout(() => {
      window.removeEventListener("click", swallow, true);
      window.removeEventListener("auxclick", swallow, true);
    }, 0);
  }

  function onContextMenu(event: MouseEvent): void {
    if (trigger.kind !== "button" || trigger.button !== 2) return;
    if (menuFiresOnMouseDown()) {
      // macOS, Linux: the menu would open before any drift exists, so the
      // modifier read off this very event is the only usable signal.
      if (modifiersMatch(event, trigger.modifier)) event.preventDefault();
    } else if (drifted) {
      // Windows: fires on mouseup, so drift is already known. A plain
      // right-click keeps its native menu.
      event.preventDefault();
    }
  }

  function onVisibility(): void {
    if (document.hidden) cancel();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancel();
      return;
    }
    if (trigger.kind !== "key" || event.repeat) return;
    if (event.code !== trigger.code || isEditable(event.target)) return;
    if (active || waiting) return;
    if (pointer) start(pointer);
    else waiting = true;
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (trigger.kind !== "key" || event.code !== trigger.code) return;
    const ran = active && drifted;
    finish();
    // Stops a bare Alt release from focusing Chrome's menu bar on Windows.
    if (ran) event.preventDefault();
  }

  window.addEventListener("pointerdown", onPointerDown, options);
  window.addEventListener("pointermove", track, options);
  window.addEventListener("pointerup", onPointerUp, options);
  window.addEventListener("pointercancel", cancel, options);
  window.addEventListener("contextmenu", onContextMenu, options);
  window.addEventListener("keydown", onKeyDown, options);
  window.addEventListener("keyup", onKeyUp, options);
  window.addEventListener("blur", cancel);
  // Cmd-Tab, Mission Control, a lock screen: the release will never arrive.
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pointerdown", onPointerDown, options);
    window.removeEventListener("pointermove", track, options);
    window.removeEventListener("pointerup", onPointerUp, options);
    window.removeEventListener("pointercancel", cancel, options);
    window.removeEventListener("contextmenu", onContextMenu, options);
    window.removeEventListener("keydown", onKeyDown, options);
    window.removeEventListener("keyup", onKeyUp, options);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
