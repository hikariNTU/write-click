import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { isBackgroundCommand, send } from "../shared/messages";
import type { TabSummary } from "../shared/messages";
import { loadSettings } from "../shared/settings";
import { Hud } from "./hud";
import type { Match } from "./hud";
import { COMMAND_ICONS, UNKNOWN_ICON } from "../shared/icons";
import { createOverlay } from "./overlay";
import { runPageCommand } from "./page-commands";
import { quantize } from "../shared/recognizer";
import { tabsOnSide } from "../shared/tabs";
import type { Point } from "../shared/recognizer";
import { TabGrid } from "./tab-grid";
import { Trail } from "./trail";
import { attachTrigger } from "./trigger-runtime";

/**
 * How many tabs a close-to-the-side command would take, using the same filter
 * the background uses, so the number shown and the number closed agree.
 * Undefined for every other command.
 */
function closingCount(command: CommandId, tabs: readonly TabSummary[]): number | undefined {
  if (command !== "tab.closeRight" && command !== "tab.closeLeft") return undefined;
  const active = tabs.find((tab) => tab.active);
  if (!active) return undefined;
  const side = command === "tab.closeRight" ? "right" : "left";
  return tabsOnSide(tabs, active.index, side).length;
}

function describe(
  stroke: string,
  command: CommandId | undefined,
  tabs: readonly TabSummary[],
): Match {
  if (!command) {
    return { stroke, label: "Unassigned", icon: UNKNOWN_ICON, state: "unassigned" };
  }

  const icon = COMMAND_ICONS[command];
  const count = closingCount(command, tabs);
  if (count === undefined) {
    return { stroke, label: COMMANDS[command].label, icon, state: "matched" };
  }

  const side = command === "tab.closeRight" ? "right" : "left";
  if (count === 0) {
    // Honest about doing nothing, rather than promising a close that cannot
    // happen because everything that way is pinned or there is nothing there.
    return { stroke, label: `No tabs to close to the ${side}`, icon, state: "unassigned" };
  }
  return {
    stroke,
    label: `Close ${count} tab${count === 1 ? "" : "s"} to the ${side}`,
    icon,
    state: "matched",
  };
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
  const overlay = createOverlay();
  const trail = new Trail(overlay, sync.trail);
  const hud = new Hud(overlay);
  const grid = sync.grid.enabled ? new TabGrid(overlay, sync.grid.columns) : undefined;
  let points: Point[] = [];
  let stroke = "";
  let holding = false;
  let tabs: readonly TabSummary[] = [];
  let tabsPending: Promise<readonly TabSummary[]> = Promise.resolve([]);
  /** Set when a tile was clicked, so the stroke underneath is discarded. */
  let picked = false;
  let gridTimer = 0;

  const paint = (): void => {
    if (sync.trail.showLabel && stroke) hud.show(describe(stroke, sync.gestures[stroke], tabs));
  };

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
   * The tab list is fetched the moment the trigger goes down. Both the grid and
   * the readout's "close N tabs" count need it, so it is fetched even when the
   * grid is switched off.
   */
  const requestTabs = (): void => {
    tabs = [];
    tabsPending = send({ type: "tabs.list" }).then((response) => {
      if (response.ok && "tabs" in response) return response.tabs;
      console.debug("[write-click] tab list failed", response);
      return [];
    });
    void tabsPending.then((list) => {
      if (!holding) return;
      tabs = list;
      // The stroke may already be drawn and labelled without a count.
      paint();
    });
  };

  /**
   * The panel appears a beat after the trigger goes down, so a quick flick
   * gesture never flashes it. Movement does not dismiss it — picking a tile
   * means moving onto the tile, so anything that treats movement as "the user
   * is drawing instead" cancels the feature the moment it is used.
   */
  const scheduleGrid = (): void => {
    if (!grid) return;
    gridTimer = window.setTimeout(() => {
      void tabsPending.then((list) => {
        if (holding && list.length > 0) {
          grid.show(list);
          return;
        }
        console.debug("[write-click] grid skipped", { holding, count: list.length });
      });
    }, sync.grid.holdMs);
  };

  const handlers = {
    onStart(point: Point) {
      points = [point];
      stroke = "";
      holding = true;
      picked = false;
      trail.render(points);
      requestTabs();
      scheduleGrid();
    },
    onMove(point: Point) {
      points.push(point);
      trail.render(points);
      const next = quantize(points);
      if (next === stroke) return;
      stroke = next;
      paint();
    },
    onEnd(drifted: boolean) {
      // A tile click wins outright: the stroke drawn underneath is ignored.
      const command = picked || !drifted || !stroke ? undefined : sync.gestures[stroke];
      // Scrolling targets where the gesture began, not where it ended: a long
      // stroke can finish well outside the panel the user meant to scroll.
      const at = points[0] ?? { x: 0, y: 0 };
      reset();
      if (command) void run(command, at);
    },
    onCancel: reset,
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
    reset();
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
