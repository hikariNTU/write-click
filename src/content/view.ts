import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { formatNumber, t } from "../shared/i18n";
import { COMMAND_ICONS, UNKNOWN_ICON } from "../shared/icons";
import { send } from "../shared/messages";
import type { TabGroupSummary, TabSummary } from "../shared/messages";
import { quantize } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";
import type { LocalSettings, SyncSettings } from "../shared/settings";
import { tabsOnSide } from "../shared/tabs";
import { Hud } from "./hud";
import type { Match } from "./hud";
import { createOverlay } from "./overlay";
import { TabGrid } from "./tab-grid";
import { Trail } from "./trail";

/** One tab list, and the groups the tabs in it belong to. */
interface TabList {
  tabs: readonly TabSummary[];
  groups: Record<number, TabGroupSummary>;
}

const EMPTY_TABS: TabList = { tabs: [], groups: {} };

/**
 * How many tabs a close-to-the-side command would take, using the same filter
 * the background uses, so the number shown and the number closed agree.
 * Undefined for every other command.
 */
function closingCount(command: CommandId, tabs: readonly TabSummary[]): number | undefined {
  if (command !== "tab.closeRight" && command !== "tab.closeLeft") return undefined;
  // Every window in the list has an active tab of its own, and the command only
  // ever touches this one's strip.
  const own = tabs.filter((tab) => tab.ownWindow);
  const active = own.find((tab) => tab.active);
  if (!active) return undefined;
  const side = command === "tab.closeRight" ? "right" : "left";
  return tabsOnSide(own, active.index, side).length;
}

function describe(
  stroke: string,
  command: CommandId | undefined,
  tabs: readonly TabSummary[],
): Match {
  if (!command) {
    return { stroke, label: t("hud_unassigned"), icon: UNKNOWN_ICON, state: "unassigned" };
  }

  const icon = COMMAND_ICONS[command];
  const count = closingCount(command, tabs);
  if (count === undefined) {
    return { stroke, label: t(COMMANDS[command].labelKey), icon, state: "matched" };
  }

  const right = command === "tab.closeRight";
  if (count === 0) {
    // Honest about doing nothing, rather than promising a close that cannot
    // happen because everything that way is pinned or there is nothing there.
    const key = right ? "hud_closeRight_none" : "hud_closeLeft_none";
    return { stroke, label: t(key), icon, state: "unassigned" };
  }

  // Separate singular and plural messages: chrome.i18n has no plural support,
  // and a language that pluralizes differently needs both strings anyway.
  const one = count === 1;
  const key = right
    ? one
      ? "hud_closeRight_one"
      : "hud_closeRight_other"
    : one
      ? "hud_closeLeft_one"
      : "hud_closeLeft_other";
  return { stroke, label: t(key, formatNumber(count)), icon, state: "matched" };
}

export interface View {
  /** Rebuilds anything rendered from settings: bindings, and their language. */
  refresh(): void;
  start(point: Point): void;
  move(point: Point): void;
  end(): void;
  cancel(): void;
}

/**
 * Everything drawn on screen, and nothing that runs a command. It lives only in
 * the top frame, and renders gestures drawn in sub-frames just the same, so a
 * stroke started inside an iframe still gets a trail across the whole page.
 */
/**
 * How long the trail keeps repainting after the tab grid opens: the panels'
 * reveal transition, plus a frame. See `settle`.
 */
const PANEL_SETTLE_MS = 200;

function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

export function createView(sync: SyncSettings, local: LocalSettings, onPick: () => void): View {
  const overlay = createOverlay();
  const hud = new Hud(overlay);
  const grid = sync.grid.enabled ? new TabGrid(overlay, sync.grid.size) : undefined;
  // Built last, and handed the grid: the stroke draws above the panels, and
  // thins out where it crosses one so the tile underneath stays readable.
  // Read through a function, not captured: `chrome.storage.onChanged` replaces
  // `sync.trail` wholesale, so a captured object would be the settings as they
  // were when the tab loaded.
  const trail = new Trail(
    overlay,
    () => sync.trail,
    () => grid?.panelRects() ?? [],
  );

  let points: Point[] = [];
  let stroke = "";
  let holding = false;
  let tabs: readonly TabSummary[] = [];
  let tabsPending: Promise<TabList> = Promise.resolve(EMPTY_TABS);
  let gridTimer = 0;
  /** The tab's page zoom, which the overlay cancels out so it holds its size. */
  let zoom = 1;

  /**
   * The overlay is drawn at the user's chosen size divided by the page zoom, so
   * it holds that size whatever the page around it is doing.
   */
  const applyScale = (): void => {
    const scale = (local.uiScale > 0 ? local.uiScale : 1) / (zoom > 0 ? zoom : 1);
    trail.setScale(scale);
    hud.setScale(scale);
    grid?.setScale(scale);
  };

  /**
   * Repaints the trail while the panels animate in.
   *
   * The panels appear under a stroke that is already drawn, and the trail only
   * repaints on movement — so without this it would stay at full strength
   * across them until the pointer moved again. Worse, one repaint is not
   * enough: the panels fade in on a scale transform, so a single frame cuts
   * the trail's mask from a box that is still 5% short of where the panel ends
   * up, and the mask stays that way. Repainting until the transform settles is
   * what keeps the fade lined up with the panel edge.
   */
  const settle = (): void => {
    const until = performance.now() + PANEL_SETTLE_MS;
    const tick = (): void => {
      trail.render(points);
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const paint = (): void => {
    if (sync.trail.showLabel && stroke) hud.show(describe(stroke, sync.gestures[stroke], tabs));
  };

  const clear = (): void => {
    points = [];
    stroke = "";
    holding = false;
    clearTimeout(gridTimer);
    trail.clear();
    hud.hide();
    grid?.hide();
  };

  const pick = (tabId: number): void => {
    onPick();
    clear();
    // Not fire-and-forget: a pick that fails silently looks identical to a tile
    // that never received the click, and the two have nothing in common to fix.
    void send({ type: "tabs.activate", tabId }).then((response) => {
      if (!response.ok) console.warn("[write-click] tabs.activate", tabId, response.error);
    });
  };

  /**
   * The press that picks a tile is seen here, on `mousedown`, rather than on
   * the tile.
   *
   * Two separate things rule out the obvious approaches. Blink captures mouse
   * events to the node that received the press for as long as a button is held,
   * and the grid opens after the trigger button is already down, so that node is
   * a page element and a listener on a tile never runs. And a *second* button
   * pressed while one is already held does not fire `pointerdown` at all: the
   * Pointer Events spec has chorded presses fire `pointermove`, since the
   * pointer is already in the active buttons state. `mousedown` is fired in
   * both cases, and still travels to this listener even though its target is
   * the captured node.
   *
   * With a keyboard trigger no button is held, nothing is captured and no press
   * is chorded, which is why picking worked there and nowhere else.
   */
  const onPress = (event: MouseEvent): void => {
    if (!grid?.visible || event.button !== 0) return;
    const tabId = grid.pickAt({ x: event.clientX, y: event.clientY });
    if (tabId === undefined) {
      console.debug("[write-click] press missed every tile", event.clientX, event.clientY);
      return;
    }
    // The capture node underneath is a page element, and it must not also be
    // clicked: picking a tab that happens to sit over a link would follow it.
    event.preventDefault();
    event.stopPropagation();
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.addEventListener("mouseup", swallow, { capture: true, once: true });
    setTimeout(() => {
      window.removeEventListener("click", swallow, true);
      window.removeEventListener("mouseup", swallow, true);
    }, 0);
    pick(tabId);
  };

  window.addEventListener("mousedown", onPress, { capture: true });

  /**
   * The tab list is fetched the moment the trigger goes down. Both the grid and
   * the readout's "close N tabs" count need it, so it is fetched even when the
   * grid is switched off.
   */
  const requestTabs = (): void => {
    tabs = [];
    // Read per gesture rather than once: the user can zoom the page at any
    // point, and a stale factor draws the overlay at the wrong size.
    void send({ type: "tabs.zoom" }).then((response) => {
      if (!response.ok || !("zoom" in response)) return;
      zoom = response.zoom;
      applyScale();
    });
    tabsPending = send({ type: "tabs.list", allWindows: sync.grid.allWindows }).then((response) => {
      if (response.ok && "tabs" in response)
        return { tabs: response.tabs, groups: response.groups };
      console.debug("[write-click] tab list failed", response);
      return EMPTY_TABS;
    });
    void tabsPending.then((list) => {
      if (!holding) return;
      tabs = list.tabs;
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
        if (holding && list.tabs.length > 0) {
          grid.show(list.tabs, list.groups);
          settle();
          return;
        }
        console.debug("[write-click] grid skipped", { holding, count: list.tabs.length });
      });
    }, sync.grid.holdMs);
  };

  const refresh = (): void => {
    applyScale();
    grid?.setGestures(sync.grid.cheatsheet ? sync.gestures : {});
  };
  refresh();

  return {
    refresh,
    start(point) {
      points = [point];
      stroke = "";
      holding = true;
      trail.render(points);
      requestTabs();
      scheduleGrid();
    },
    move(point) {
      points.push(point);
      trail.render(points);
      // :hover is frozen by the same capture, so the highlight is moved by hand.
      grid?.hoverAt(point);
      const next = quantize(points);
      if (next === stroke) return;
      stroke = next;
      paint();
    },
    end() {
      // Releasing over a tile switches to it. That is the whole point of the
      // option: the click that would otherwise be needed happens while the
      // trigger button is still down, and on release Chrome opens the context
      // menu the extension has no way to suppress (docs/SPEC.md §6.2).
      const tabId = sync.grid.pickOnRelease ? grid?.hoveredTabId : undefined;
      if (tabId !== undefined) {
        pick(tabId);
        return;
      }
      clear();
    },
    cancel: clear,
  };
}
