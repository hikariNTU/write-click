import { menuFiresOnMouseDown } from "../shared/trigger";
import type { Modifier, Trigger } from "../shared/trigger";
import { DRIFT_THRESHOLD, distanceSquared } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";

/** Which way a chorded press travels. See docs/SPEC.md §3.6. */
export type Rocker = "back" | "forward";

export interface TriggerHandlers {
  onStart(point: Point): void;
  onMove(point: Point): void;
  /** `drifted` is false when the pointer never passed DRIFT_THRESHOLD. */
  onEnd(drifted: boolean): void;
  onCancel(): void;
  /**
   * A chorded mouse press. Returning false leaves the press alone — which is
   * what the tab grid needs while it is on screen, since the same press is how
   * a tile is picked.
   */
  onRocker?(rocker: Rocker): boolean;
  /** One wheel notch while the trigger is held. `1` is down, `-1` is up. */
  onWheel?(step: 1 | -1): void;
}

/**
 * Which of the two extras are live. Read at attach time rather than on every
 * event: the content script tears the trigger down and rebuilds it whenever
 * settings change, so there is nothing to keep in step.
 */
export interface TriggerOptions {
  rocker: boolean;
  wheel: boolean;
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

/**
 * True when a press is the trigger itself. Exported for the options page, which
 * has to tell a near miss — the right button with no modifier, when the trigger
 * wants one — from the real thing, and must decide that against the same rule
 * the page uses rather than a second copy of it.
 */
export function triggerMatches(trigger: Trigger, event: MouseEvent): boolean {
  if (trigger.kind !== "button") return false;
  return event.button === trigger.button && modifiersMatch(event, trigger.modifier);
}

/** The `buttons` bitmask for a `button` index: 0 -> 1, 1 -> 4, 2 -> 2. */
const BUTTON_MASK: Record<0 | 1 | 2, number> = { 0: 1, 1: 4, 2: 2 };

/**
 * Which rocker a press completes, from the buttons that were already down
 * before it.
 *
 * Only the two classic pairs count, and only when nothing else is held: the
 * middle button is left out because holding it means autoscroll on Windows and
 * paste on Linux, and a third button held alongside is somebody's thumb, not a
 * rocker.
 */
export function rockerFrom(held: number, button: number): Rocker | undefined {
  if (button === 0 && held === BUTTON_MASK[2]) return "back";
  if (button === 2 && held === BUTTON_MASK[0]) return "forward";
  return undefined;
}

/** How far the wheel has to travel for one step. Roughly a notch of a mouse wheel. */
const WHEEL_NOTCH = 40;
/** What `deltaMode` 1 and 2 are worth in pixels: a line, and a viewport-ish page. */
const WHEEL_LINE = 16;
const WHEEL_PAGE = 400;

/** A wheel event's vertical delta in pixels, whatever unit it was reported in. */
export function wheelPixels(event: { deltaY: number; deltaMode: number }): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE;
  if (event.deltaMode === 2) return event.deltaY * WHEEL_PAGE;
  return event.deltaY;
}

/**
 * Turns a stream of wheel deltas into whole steps.
 *
 * A mouse wheel reports one large delta per notch; a trackpad reports dozens of
 * small ones for the same flick. Firing per event would step one tab on the
 * wheel and thirty on the trackpad, so the deltas are banked and only whole
 * notches are spent. Reversing direction drops the bank rather than paying it
 * back: a change of mind should not owe half a step in the other direction.
 */
export function wheelCounter(): { take(pixels: number): number; reset(): void } {
  let bank = 0;
  return {
    reset(): void {
      bank = 0;
    },
    take(pixels: number): number {
      if (pixels === 0) return 0;
      if (bank !== 0 && Math.sign(pixels) !== Math.sign(bank)) bank = 0;
      // One event is worth at most one step. A mouse wheel reports a whole
      // notch in a single delta and how large that delta is differs by device
      // and platform — 100 on one, 120 on another — so an unclamped bank turns
      // one notch of the same wheel into two steps or three. Clamping makes a
      // notch a step everywhere, and leaves a trackpad's small deltas to
      // accumulate as before.
      bank += Math.sign(pixels) * Math.min(Math.abs(pixels), WHEEL_NOTCH);
      // `|| 0` only to turn the -0 that `Math.trunc` hands back for a delta
      // short of a notch into a plain zero.
      const steps = Math.trunc(bank / WHEEL_NOTCH) || 0;
      bank -= steps * WHEEL_NOTCH;
      return steps;
    },
  };
}

/**
 * How long after a rocker the context menu that press owes is still swallowed.
 *
 * The menu arrives at a different moment on each platform — with the press on
 * macOS and Linux, with the release on Windows (§3.2) — and the release may be
 * a held trigger the user takes their time over. A window rather than a flag
 * cleared on the next event, because the events in between differ by platform
 * too.
 */
const MENU_GRACE_MS = 1000;

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
export function attachTrigger(
  trigger: Trigger,
  handlers: TriggerHandlers,
  extras: TriggerOptions = { rocker: false, wheel: false },
): () => void {
  const options = { capture: true } as const;
  // Wheel listeners on window are passive by default in Chrome, and a passive
  // listener cannot stop the page scrolling under a gesture.
  const wheelOptions = { capture: true, passive: false } as const;
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
  /**
   * Live for exactly as long as a stroke is, and holds the listeners that stop
   * the page reacting to the drag underneath it.
   *
   * A held button drags: with a left-button trigger, drawing paints a text
   * selection across the page and can pick up a native link or image drag whose
   * ghost then follows the cursor over the overlay. `preventDefault` on the
   * `pointerdown` would stop both, but it would also take focus and caret
   * placement with it, and those belong to the page — the trigger owns the
   * gesture, not the click. Cancelling `selectstart` and `dragstart` costs
   * nothing a plain click needs.
   */
  let drawing: AbortController | undefined;
  /** Wheel deltas banked since the last whole step. */
  const notches = wheelCounter();
  /**
   * When a rocker last fired, on the same clock the events carry. The context
   * menu the press it was built from owes is swallowed for `MENU_GRACE_MS`
   * afterwards.
   */
  let rockedAt = 0;
  /**
   * Whether a wheel event has been seen during this gesture. Only to log the
   * first one: a wheel that does nothing looks identical whether the event
   * never arrived or the step was banked, and those have nothing in common to
   * fix.
   */
  let wheelSeen = false;

  /**
   * Swallows the `click`/`auxclick` a press has coming, and only that one: a
   * gesture or a rocker that ends on a link must not also follow it.
   */
  function swallowClick(): void {
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.addEventListener("auxclick", swallow, { capture: true, once: true });
    setTimeout(() => {
      window.removeEventListener("click", swallow, true);
      window.removeEventListener("auxclick", swallow, true);
    }, 0);
  }

  function start(point: Point): void {
    active = true;
    drifted = false;
    origin = point;
    notches.reset();
    wheelSeen = false;
    drawing?.abort();
    drawing = new AbortController();
    for (const type of ["selectstart", "dragstart"]) {
      window.addEventListener(type, swallow, { capture: true, signal: drawing.signal });
    }
    handlers.onStart(point);
  }

  function release(): void {
    drawing?.abort();
    drawing = undefined;
  }

  function finish(): void {
    waiting = false;
    release();
    if (!active) return;
    active = false;
    handlers.onEnd(drifted);
  }

  function cancel(): void {
    waiting = false;
    release();
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
    if (event.pointerType !== "mouse") return;
    if (!triggerMatches(trigger, event)) return;
    // The middle button would otherwise start Chrome's autoscroll.
    if (event.button === 1) event.preventDefault();
    start({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp(event: PointerEvent): void {
    if (trigger.kind !== "button" || event.button !== trigger.button) return;
    const suppressClick = active && drifted;
    finish();
    // A drag that ended on a link must not also activate it.
    if (suppressClick) swallowClick();
  }

  /**
   * A second mouse button pressed while a first is still held.
   *
   * Listened for on `mousedown`, not `pointerdown`: the Pointer Events spec has
   * a chorded press fire `pointermove`, since the pointer is already in the
   * active buttons state, so `pointerdown` never arrives for the second button
   * at all. This is the same reason the tab grid picks a tile on `mousedown`
   * (docs/SPEC.md §6.1).
   */
  function onChord(event: MouseEvent): void {
    if (!extras.rocker || !handlers.onRocker) return;
    if (event.button !== 0 && event.button !== 2) return;
    // `buttons` on a mousedown already carries the button going down, so it is
    // taken back out to leave what was held before it.
    const held = event.buttons & ~BUTTON_MASK[event.button];
    const rocker = rockerFrom(held, event.button);
    if (!rocker) return;
    // False means somebody else owns this press — the tab grid, while it is on
    // screen — so it is left exactly as it arrived, native effects and all.
    if (!handlers.onRocker(rocker)) return;
    rockedAt = event.timeStamp;
    swallow(event);
    swallowClick();
  }

  function onWheel(event: WheelEvent): void {
    if (!extras.wheel || !handlers.onWheel || !active) return;
    // The page must not scroll under a held gesture, whether or not this delta
    // completes a step.
    swallow(event);
    if (!wheelSeen) {
      wheelSeen = true;
      console.debug("[write-click] wheel under the trigger", event.deltaY, event.deltaMode);
    }
    const steps = notches.take(wheelPixels(event));
    const step = steps > 0 ? 1 : -1;
    for (let spent = 0; spent < Math.abs(steps); spent += 1) handlers.onWheel(step);
  }

  function onContextMenu(event: MouseEvent): void {
    // A rocker is built out of a right button, one way round or the other, and
    // that button still owes a menu. Swallowed whichever of the two presses it
    // belongs to, and whether or not the right button is the trigger.
    if (rockedAt !== 0 && event.timeStamp - rockedAt < MENU_GRACE_MS) {
      rockedAt = 0;
      event.preventDefault();
      return;
    }
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
  window.addEventListener("mousedown", onChord, options);
  window.addEventListener("wheel", onWheel, wheelOptions);
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
    window.removeEventListener("mousedown", onChord, options);
    window.removeEventListener("wheel", onWheel, wheelOptions);
    window.removeEventListener("pointermove", track, options);
    window.removeEventListener("pointerup", onPointerUp, options);
    window.removeEventListener("pointercancel", cancel, options);
    window.removeEventListener("contextmenu", onContextMenu, options);
    window.removeEventListener("keydown", onKeyDown, options);
    window.removeEventListener("keyup", onKeyUp, options);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", onVisibility);
    release();
  };
}
