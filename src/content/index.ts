import type { CommandId } from "../shared/commands";
import { isBackgroundCommand, send } from "../shared/messages";
import { quantize } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";
import { setLocale } from "../shared/i18n";
import { loadSettings } from "../shared/settings";
import { createBridge } from "./frame-bridge";
import type { Bridge } from "./frame-bridge";
import { runPageCommand } from "./page-commands";
import { attachTrigger } from "./trigger-runtime";
import type { Rocker } from "./trigger-runtime";
import { createView } from "./view";
import type { View } from "./view";

async function run(command: CommandId, at: Point): Promise<void> {
  if (!isBackgroundCommand(command)) {
    runPageCommand(command, at);
    return;
  }
  const response = await send({ type: "command", id: command });
  if (!response.ok) console.warn("[write-click]", command, response.error);
}

/**
 * How long a sub-frame waits for the top frame's answer before running its
 * command anyway. Long enough for a postMessage round trip through nested
 * frames, short enough to pass for instant.
 */
const ANSWER_TIMEOUT_MS = 300;

/** Where a content command lands when no pointer sample has been taken yet. */
const ORIGIN: Point = { x: 0, y: 0 };

async function main(): Promise<void> {
  const { sync, local } = await loadSettings();
  setLocale(sync.language);
  const isTop = window.top === window;

  let points: Point[] = [];
  let stroke = "";
  /** A tab was picked from the grid, so the stroke drawn underneath is void. */
  let cancelled = false;
  let bridge: Bridge | undefined;
  /**
   * Sub-frames only: the command this frame's gesture matched, held until the
   * top frame says whether the release picked a tab instead.
   */
  let pending: { command: CommandId; at: Point } | undefined;
  let pendingTimer = 0;

  const flush = (): void => {
    clearTimeout(pendingTimer);
    const held = pending;
    pending = undefined;
    if (held) void run(held.command, held.at);
  };

  const drop = (): void => {
    clearTimeout(pendingTimer);
    pending = undefined;
  };

  // Drawing lives in the top frame; every frame runs its own recognizer and
  // executes its own commands, so a page command scrolls the frame the gesture
  // was actually drawn in.
  /**
   * The stroke drawn under something that has already acted — a tab picked from
   * the grid, a rocker, a wheel step — is void. The trigger stays held, so the
   * gesture is not cancelled: it is the command at the end of it that is
   * dropped, and a rocker can fire again without letting go.
   */
  const voidStroke = (): void => {
    cancelled = true;
    bridge?.cancelRemote();
  };

  const view: View | undefined = isTop ? createView(sync, local, voidStroke) : undefined;

  bridge = createBridge({
    isTop,
    onRemote: {
      onStart: (point) => view?.start(point),
      onMove: (point) => view?.move(point),
      onEnd: () => {
        view?.end();
        // Answers the frame that drew, either way: it is holding its command
        // until it hears back. `end` may have picked a tab, in which case
        // `onPick` already sent the cancel and this is a no-op.
        bridge?.resumeRemote();
      },
      onCancel: () => view?.cancel(),
    },
    onCancelled: () => {
      cancelled = true;
      drop();
    },
    onResumed: flush,
  });

  const handlers = {
    onStart(point: Point) {
      points = [point];
      stroke = "";
      cancelled = false;
      if (view) view.start(point);
      else bridge?.forwardStart(point);
    },
    onMove(point: Point) {
      points.push(point);
      stroke = quantize(points);
      if (view) view.move(point);
      else bridge?.forwardMove(point);
    },
    onEnd(drifted: boolean) {
      const command = cancelled || !drifted || !stroke ? undefined : sync.gestures[stroke];
      // Scrolling targets where the gesture began, not where it ended: a long
      // stroke can finish well outside the panel the user meant to scroll.
      const at = points[0] ?? { x: 0, y: 0 };
      points = [];
      stroke = "";

      if (view) {
        // Releasing over a tile in the grid switches tabs, and voids the stroke
        // drawn underneath — `view.end` picks, which sets `cancelled` through
        // `onPick`. So the command is only decided after it has run.
        view.end();
        if (command && !cancelled) void run(command, at);
        return;
      }

      // A sub-frame cannot decide yet: the grid lives in the top frame and only
      // that frame knows where the release landed. The command waits for its
      // answer. The timer is the fallback for a top frame that never replies —
      // one without the content script — where the gesture used to run anyway.
      pending = command ? { command, at } : undefined;
      if (pending) pendingTimer = window.setTimeout(flush, ANSWER_TIMEOUT_MS);
      bridge?.forwardEnd();
    },
    onRocker(rocker: Rocker): boolean {
      // While the tab grid is on screen the second button belongs to it: that
      // press is how a tile is picked, and a rocker firing on a missed tile
      // would make missing do something. docs/SPEC.md §3.6.
      if (view?.gridUp()) return false;
      voidStroke();
      void run(rocker === "back" ? sync.rocker.back : sync.rocker.forward, points.at(-1) ?? ORIGIN);
      return true;
    },
    onWheel(step: 1 | -1) {
      // The grid takes every notch while it is up: it is the only thing on
      // screen that scrolls, and reaching a tile past its clip is what the
      // wheel is for at that moment. docs/SPEC.md §3.7.
      if (view?.wheelStep(step)) return;
      voidStroke();
      void run(step > 0 ? sync.wheel.down : sync.wheel.up, points.at(-1) ?? ORIGIN);
    },
    onCancel() {
      points = [];
      stroke = "";
      drop();
      if (view) view.cancel();
      else bridge?.forwardCancel();
    },
  };

  let detach: (() => void) | undefined;

  /**
   * Attached only while gestures are on for this device and this origin, and
   * re-attached from scratch when the trigger changes — the trigger owns its
   * own listeners, so swapping it means tearing them down.
   */
  const apply = (): void => {
    const on = local.enabled && !sync.disabledOrigins.includes(location.origin);
    detach?.();
    detach = undefined;
    view?.cancel();
    view?.refresh();
    if (!on) return;
    detach = attachTrigger(local.trigger, handlers, {
      // Top frame only. Both are answered against the tab grid, and the grid
      // lives in the top frame — a sub-frame has no way to ask whether it is on
      // screen, and one that guessed would fire a rocker over an open panel.
      rocker: isTop && sync.rocker.enabled,
      wheel: isTop && sync.wheel.enabled,
    });
  };

  apply();

  // Settings changed in the options page or the popup take effect here without
  // a reload, on every open tab.
  chrome.storage.onChanged.addListener(() => {
    void loadSettings().then((next) => {
      Object.assign(sync, next.sync);
      Object.assign(local, next.local);
      setLocale(sync.language);
      apply();
    });
  });
}

void main();
