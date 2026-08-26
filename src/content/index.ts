import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { isBackgroundCommand, send } from "../shared/messages";
import { loadSettings } from "../shared/settings";
import { Hud } from "./hud";
import type { Match } from "./hud";
import { COMMAND_ICONS, UNKNOWN_ICON } from "./icons";
import { createOverlay } from "./overlay";
import { runPageCommand } from "./page-commands";
import { quantize } from "./recognizer";
import type { Point } from "./recognizer";
import { TabGrid } from "./tab-grid";
import { Trail } from "./trail";
import { attachTrigger } from "./trigger-runtime";

function describe(stroke: string, command: CommandId | undefined): Match {
  if (!command) {
    return { stroke, label: "Unassigned", icon: UNKNOWN_ICON, state: "unassigned" };
  }
  return { stroke, label: COMMANDS[command].label, icon: COMMAND_ICONS[command], state: "matched" };
}

async function run(command: CommandId, at: Point): Promise<void> {
  if (!isBackgroundCommand(command)) {
    runPageCommand(command, at);
    return;
  }
  const response = await send({ type: "command", id: command });
  if (!response.ok) console.warn("[write-click]", command, response.error);
}

async function main(): Promise<void> {
  // Sub-frames get their own bridge in a later phase; for now the top frame
  // owns the overlay and the recognizer.
  if (window.top !== window) return;

  const { sync, local } = await loadSettings();
  if (!local.enabled || sync.disabledOrigins.includes(location.origin)) return;

  const overlay = createOverlay();
  const trail = new Trail(overlay, sync.trail);
  const hud = new Hud(overlay);
  const grid = sync.grid.enabled ? new TabGrid(overlay, sync.grid.columns) : undefined;
  let points: Point[] = [];
  let stroke = "";
  let holding = false;
  /** Set when a tile was clicked, so the stroke underneath is discarded. */
  let picked = false;
  let gridTimer = 0;

  const reset = (): void => {
    points = [];
    stroke = "";
    holding = false;
    clearTimeout(gridTimer);
    trail.clear();
    hud.hide();
    grid?.hide();
  };

  grid?.onSelect((tabId) => {
    picked = true;
    reset();
    void send({ type: "tabs.activate", tabId });
  });

  /**
   * The list is requested the moment the trigger goes down; the panel appears a
   * beat later so a quick flick gesture never flashes it. Movement does not
   * dismiss it — picking a tile means moving onto the tile, so anything that
   * treats movement as "the user is drawing instead" cancels the feature the
   * moment it is used.
   */
  const scheduleGrid = (): void => {
    if (!grid) return;
    const pending = send({ type: "tabs.list" });
    gridTimer = window.setTimeout(() => {
      void pending.then((response) => {
        if (holding && response.ok && "tabs" in response) {
          grid.show(response.tabs);
          return;
        }
        console.debug("[write-click] grid skipped", { holding, response });
      });
    }, sync.grid.holdMs);
  };

  attachTrigger(local.trigger, {
    onStart(point) {
      points = [point];
      stroke = "";
      holding = true;
      picked = false;
      trail.render(points);
      scheduleGrid();
    },
    onMove(point) {
      points.push(point);
      trail.render(points);
      const next = quantize(points);
      if (next === stroke) return;
      stroke = next;
      if (sync.trail.showLabel && stroke) hud.show(describe(stroke, sync.gestures[stroke]));
    },
    onEnd(drifted) {
      // A tile click wins outright: the stroke drawn underneath is ignored.
      const command = picked || !drifted || !stroke ? undefined : sync.gestures[stroke];
      // Scrolling targets where the gesture began, not where it ended: a long
      // stroke can finish well outside the panel the user meant to scroll.
      const at = points[0] ?? { x: 0, y: 0 };
      reset();
      if (command) void run(command, at);
    },
    onCancel: reset,
  });
}

void main();
