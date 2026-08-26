import type { CommandId } from "../shared/commands";
import { isBackgroundCommand, send } from "../shared/messages";
import { quantize } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";
import { loadSettings } from "../shared/settings";
import { createBridge } from "./frame-bridge";
import type { Bridge } from "./frame-bridge";
import { runPageCommand } from "./page-commands";
import { attachTrigger } from "./trigger-runtime";
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

async function main(): Promise<void> {
  const { sync, local } = await loadSettings();
  const isTop = window.top === window;

  let points: Point[] = [];
  let stroke = "";
  /** A tab was picked from the grid, so the stroke drawn underneath is void. */
  let cancelled = false;
  let bridge: Bridge | undefined;

  // Drawing lives in the top frame; every frame runs its own recognizer and
  // executes its own commands, so a page command scrolls the frame the gesture
  // was actually drawn in.
  const view: View | undefined = isTop
    ? createView(sync, () => {
        cancelled = true;
        bridge?.cancelRemote();
      })
    : undefined;

  bridge = createBridge({
    isTop,
    onRemote: {
      onStart: (point) => view?.start(point),
      onMove: (point) => view?.move(point),
      onEnd: () => view?.end(),
      onCancel: () => view?.cancel(),
    },
    onCancelled: () => {
      cancelled = true;
    },
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
      if (view) view.end();
      else bridge?.forwardEnd();
      if (command) void run(command, at);
    },
    onCancel() {
      points = [];
      stroke = "";
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
    if (on) detach = attachTrigger(local.trigger, handlers);
  };

  apply();

  // Settings changed in the options page or the popup take effect here without
  // a reload, on every open tab.
  chrome.storage.onChanged.addListener(() => {
    void loadSettings().then((next) => {
      Object.assign(sync, next.sync);
      Object.assign(local, next.local);
      apply();
    });
  });
}

void main();
