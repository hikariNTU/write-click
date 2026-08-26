import { menuFiresOnMouseDown } from "../shared/trigger";
import type { Modifier, Trigger } from "../shared/trigger";
import { DRIFT_THRESHOLD, distanceSquared } from "./recognizer";
import type { Point } from "./recognizer";

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
  let pointer: Point = { x: 0, y: 0 };

  function start(point: Point): void {
    active = true;
    drifted = false;
    origin = point;
    handlers.onStart(point);
  }

  function finish(): void {
    if (!active) return;
    active = false;
    handlers.onEnd(drifted);
  }

  function cancel(): void {
    if (!active) return;
    active = false;
    drifted = false;
    handlers.onCancel();
  }

  function track(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    if (!active) return;

    const events = event.getCoalescedEvents?.() ?? [event];
    for (const sample of events) handlers.onMove({ x: sample.clientX, y: sample.clientY });

    if (!drifted && origin && distanceSquared(origin, pointer) > DRIFT_THRESHOLD ** 2) {
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

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancel();
      return;
    }
    if (trigger.kind !== "key" || event.repeat) return;
    if (event.code !== trigger.code || isEditable(event.target)) return;
    if (active) return;
    start(pointer);
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

  return () => {
    window.removeEventListener("pointerdown", onPointerDown, options);
    window.removeEventListener("pointermove", track, options);
    window.removeEventListener("pointerup", onPointerUp, options);
    window.removeEventListener("pointercancel", cancel, options);
    window.removeEventListener("contextmenu", onContextMenu, options);
    window.removeEventListener("keydown", onKeyDown, options);
    window.removeEventListener("keyup", onKeyUp, options);
    window.removeEventListener("blur", cancel);
  };
}
