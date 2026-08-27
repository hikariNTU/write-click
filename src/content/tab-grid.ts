import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { formatNumber, t } from "../shared/i18n";
import { FALLBACK_FAVICON, strokeChipsHtml, UI_ICONS } from "../shared/icons";
import type { TabGroupSummary, TabSummary } from "../shared/messages";
import { containsPoint } from "../shared/geometry";
import type { Point } from "../shared/recognizer";
import type { GridSize } from "../shared/settings";
import type { PanelBox } from "./trail";
import { viewport } from "./viewport";

/** Kept clear of the left and right edges, so a panel's border is never clipped. */
const MARGIN = 12;

/** How far the docked panels sit from the top and bottom edges. */
const EDGE_GAP = 24;

/**
 * How much of the window's height each docked panel may take. The middle is
 * left free on purpose: it is where the gesture is drawn, and a panel there
 * would sit under the stroke and take the clicks meant for the page.
 */
const TILES_SHARE = 0.5;
const CHEATSHEET_SHARE = 0.28;

/**
 * The corner radius `rounded-3xl` gives the panels, in CSS pixels. Duplicated
 * here for the trail's feathered mask, which needs the shape in numbers rather
 * than in a class — keep the two in step.
 */
const PANEL_RADIUS = 24;

const PANEL_CHROME =
  "overflow-y-auto rounded-3xl border border-white/10 bg-mist-950/70 text-mist-50 " +
  "backdrop-blur-[6px] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] " +
  // Only opacity and transform transition. `transition-all` would animate the
  // box metrics too, and the panel would visibly reflow as tabs are counted.
  "transition-[opacity,transform] duration-150 ease-out";

/** A fixed strip pinned to one edge, holding a panel centred across the window. */
function bar(edge: "top" | "bottom"): HTMLDivElement {
  const node = document.createElement("div");
  // Spelled out rather than interpolated: Tailwind only sees complete class
  // strings in the source, and `${edge}-0` is not one.
  node.className =
    edge === "top"
      ? "pointer-events-none fixed inset-x-0 top-0 grid justify-items-center"
      : "pointer-events-none fixed inset-x-0 bottom-0 grid justify-items-center";
  return node;
}

/**
 * Applied by hand rather than by `:hover`. While a mouse button is held, Blink
 * captures events to the node that received the press, and hover stops
 * following the cursor with it.
 */
const HOVER = ["border-emerald-300/40", "bg-emerald-400/10"] as const;

/**
 * The tile for the tab already in front.
 *
 * Neutral, and deliberately not a second accent colour: hover means "release
 * here and you land on this tab", so the accent belongs to the tile that does
 * something. This one is only stating where you already are — brighter than a
 * resting tile, and out of the way of the highlight that matters.
 */
const ACTIVE = "border-mist-300/35 bg-mist-100/[0.09]";

/** Must match the panel's `duration-150`, or the teardown cuts the fade short. */
const FADE_MS = 150;

/**
 * Tiles are sized, not counted. The track list is auto-fit, so the number per
 * row falls out of the window width and the panel stays balanced whether there
 * are three tabs open or thirty. `panel` caps how wide it can grow on a large
 * display; `tile` is the width a tile wants before the row wraps.
 */
const SIZES: Record<GridSize, { tile: number; panel: number }> = {
  compact: { tile: 150, panel: 720 },
  normal: { tile: 220, panel: 900 },
  large: { tile: 300, panel: 1120 },
};

interface Tile {
  tabId: number;
  node: HTMLElement;
  /** The tab already in front of the user: this window's active tab, and only it. */
  current: boolean;
}

/**
 * Chrome's tab group palette, in the tones it uses on a dark background. The
 * colour is the whole identity of an untitled group, so it has to be the one
 * the user already sees in the tab strip rather than something approximate.
 */
const GROUP_COLORS: Record<string, string> = {
  grey: "#9aa0a6",
  blue: "#8ab4f8",
  red: "#f28b82",
  yellow: "#fdd663",
  green: "#81c995",
  pink: "#ff8bcb",
  purple: "#d7aefb",
  cyan: "#78d9ec",
  orange: "#fcad70",
};

function groupColor(group: TabGroupSummary | undefined): string | undefined {
  if (!group) return undefined;
  return GROUP_COLORS[group.color] ?? GROUP_COLORS.grey;
}

/** A full-width row between tiles. The grid's tracks are auto-fit, so a header
 * has to be told to span them all or it would sit in the first column as a
 * tile-sized box. */
function headerRow(className: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  node.style.gridColumn = "1 / -1";
  return node;
}

/**
 * The tab picker shown while the trigger is held. Tiles are the only part of
 * the overlay that take pointer events; the host stays inert so the page keeps
 * working underneath.
 */
export class TabGrid {
  readonly #root = document.createElement("div");
  readonly #topBar = bar("top");
  readonly #bottomBar = bar("bottom");
  readonly #panel = document.createElement("div");
  readonly #grid = document.createElement("div");
  readonly #caption = document.createElement("div");
  #size: { tile: number; panel: number } = SIZES.normal;
  readonly #cheatPanel = document.createElement("div");
  readonly #cheatsheet = document.createElement("div");
  #visible = false;
  #teardown = 0;
  /** Tiles in view, for hit testing the pointer against their boxes. */
  #tiles: Tile[] = [];
  #hovered: Tile | undefined;
  /**
   * Overlay scale: the user's size preference over the tab's page zoom. The
   * panel is laid out in the page's CSS pixels; multiplying by this gives what
   * lands on screen.
   */
  #scale = 1;

  constructor(root: ShadowRoot, size: GridSize) {
    // Toggled with `invisible`, not `hidden`: both `hidden` and `grid` set
    // `display`, so which one wins would come down to CSS source order.
    this.#root.className = "pointer-events-none invisible fixed inset-0 z-10";
    // Docked to the edges rather than centred, and each grows away from the
    // edge it is pinned to — otherwise a scaled-up panel would push its own
    // border off the screen.
    this.#panel.className = `pointer-events-auto p-4 ${PANEL_CHROME}`;
    this.#panel.style.transformOrigin = "top center";
    // Reference text, never a target: it must not take a click meant for the
    // page underneath.
    this.#cheatPanel.className = `pointer-events-none px-4 py-3 ${PANEL_CHROME}`;
    this.#cheatPanel.style.transformOrigin = "bottom center";
    this.#reveal(false);
    this.#caption.className =
      "mb-3 flex items-baseline justify-between px-1 text-[11px] font-medium text-mist-400";
    this.#grid.className = "grid gap-2";
    this.setSize(size);
    this.#panel.append(this.#caption, this.#grid);
    this.#cheatPanel.append(this.#cheatsheet);
    this.#topBar.append(this.#panel);
    this.#bottomBar.append(this.#cheatPanel);
    this.#root.append(this.#topBar, this.#bottomBar);
    root.append(this.#root);
  }

  /**
   * How wide a tile wants to be, and therefore how many fit per row.
   *
   * Settable rather than fixed at construction, so changing the size in options
   * reaches tabs that are already open — everything else about the overlay
   * already follows `chrome.storage.onChanged` without a reload. The panel's own
   * width and height are recomputed by `show()`, so only the track list has to
   * be rewritten here.
   */
  setSize(size: GridSize): void {
    this.#size = SIZES[size] ?? SIZES.normal;
    this.#grid.style.gridTemplateColumns = `repeat(auto-fit, minmax(${this.#size.tile}px, 1fr))`;
  }

  /**
   * The gesture list, in its own panel along the bottom edge. It is on screen
   * while the trigger is held, which is exactly the moment someone is wondering
   * what else they could draw — so the reference belongs here rather than
   * buried in settings.
   */
  setGestures(gestures: Record<string, CommandId>): void {
    const entries = Object.entries(gestures).toSorted(([, a], [, b]) =>
      t(COMMANDS[a].labelKey).localeCompare(t(COMMANDS[b].labelKey)),
    );
    // An empty panel is worse than no panel: it would still dim the bottom of
    // the window for nothing.
    this.#bottomBar.style.display = entries.length === 0 ? "none" : "";
    if (entries.length === 0) {
      this.#cheatsheet.replaceChildren();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "grid gap-x-4 gap-y-1.5";
    wrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";

    for (const [stroke, command] of entries) {
      const line = document.createElement("div");
      line.className = "flex min-w-0 items-center gap-2";

      const chips = document.createElement("div");
      chips.className = "flex shrink-0 items-center gap-0.5 text-mist-300 [&>svg]:h-3 [&>svg]:w-3";
      chips.innerHTML = strokeChipsHtml(stroke);

      const name = document.createElement("span");
      name.className = "truncate text-[11px] text-mist-400";
      name.textContent = t(COMMANDS[command].labelKey);

      line.append(chips, name);
      wrap.append(line);
    }

    const heading = document.createElement("div");
    heading.className = "mb-2 px-1 text-[10px] font-medium uppercase tracking-wider text-mist-500";
    heading.textContent = t("grid_cheatsheet");

    this.#cheatsheet.replaceChildren(heading, wrap);
  }

  get visible(): boolean {
    return this.#visible;
  }

  /**
   * Where the panels are, in viewport pixels, for anything drawing over them.
   * Empty while the grid is hidden, so a stroke on its own is never clipped.
   */
  panelRects(): readonly PanelBox[] {
    if (!this.#visible) return [];
    // Measured, not computed: the panels carry a scale transform that is still
    // animating for the first frames after they appear, and `getBoundingClientRect`
    // is the only thing that reports where a transformed box actually is right now.
    // The radius is scaled by hand, because that part is not in the rect.
    return [this.#panel, this.#cheatPanel].map((panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        radius: PANEL_RADIUS * this.#scale,
      };
    });
  }

  /**
   * The tab whose tile is under a point, if any.
   *
   * The grid opens while a mouse button is already held, and Blink captures
   * mouse and pointer events to the node that received that press — a page
   * element, since the grid did not exist yet. A listener on a tile therefore
   * never fires for the click that picks it. Hit testing the boxes from a
   * window-level listener is the way to see the press at all; see docs/SPEC.md
   * §6.
   */
  pickAt(point: Point): number | undefined {
    return this.#tileAt(point)?.tabId;
  }

  /**
   * The tab the highlight is on, if any.
   *
   * Only ever set by a move, so a panel that happens to open under a resting
   * cursor cannot switch tabs on release without the user going near a tile.
   */
  get hoveredTabId(): number | undefined {
    return this.#visible ? this.#hovered?.tabId : undefined;
  }

  /** Moves the highlight, since `:hover` is frozen by the same capture. */
  hoverAt(point: Point): void {
    if (!this.#visible) return;
    const found = this.#tileAt(point);
    // The current tab's tile already carries these classes; taking them off it
    // on the way out would strip its own styling. Leaving it unhoverable also
    // keeps a release over it from re-activating the tab already in front.
    const next = found && !found.current ? found : undefined;
    if (next === this.#hovered) return;
    this.#hovered?.node.classList.remove(...HOVER);
    this.#hovered = next;
    next?.node.classList.add(...HOVER);
  }

  /**
   * Clipped against the panel first, and only then against each tile.
   *
   * The panel scrolls its own overflow, so a tile past that clip keeps a
   * viewport rect — one that lands in the middle of the window, which is
   * exactly where the stroke is drawn. Testing tiles alone therefore picked
   * tabs that were never on screen: a release over blank page, with no
   * highlight anywhere to warn of it, switched to whatever tile happened to
   * have been scrolled under the pointer.
   */
  #tileAt(point: Point): Tile | undefined {
    if (!this.#visible) return undefined;
    if (!containsPoint(this.#panel.getBoundingClientRect(), point)) return undefined;
    return this.#tiles.find(({ node }) => containsPoint(node.getBoundingClientRect(), point));
  }

  setScale(scale: number): void {
    this.#scale = scale > 0 ? scale : 1;
    // The strips are not scaled themselves, so their gap has to be scaled by
    // hand or a larger overlay would sit the same distance from the edge.
    this.#topBar.style.paddingTop = `${EDGE_GAP * this.#scale}px`;
    this.#bottomBar.style.paddingBottom = `${EDGE_GAP * this.#scale}px`;
    if (this.#visible) this.#reveal(true);
  }

  #reveal(shown: boolean): void {
    // The entrance scale is folded into the overlay scale: one transform
    // property, so the two cannot fight over it.
    const transform = `scale(${shown ? this.#scale : this.#scale * 0.95})`;
    for (const panel of [this.#panel, this.#cheatPanel]) {
      panel.style.opacity = shown ? "1" : "0";
      panel.style.transform = transform;
    }
  }

  /**
   * The window, measured in the units the panels are laid out in.
   *
   * A panel's layout box is multiplied by the overlay scale before it lands on
   * screen, so every design size here is a screen size and every viewport
   * measurement has to be divided into the same unit before the two can be
   * compared.
   */
  #room(): { width: number; height: number } {
    // The layout viewport, which is what the bars span, read through
    // `viewport()` because neither `window.innerWidth` nor
    // `documentElement.clientWidth` is that number in every case: the first
    // counts a classic scrollbar the bars do not reach across, and the second
    // is the whole document on a quirks-mode page, which let this panel budget
    // itself several times the height of the window.
    const box = viewport();
    return {
      width: box.width / this.#scale - 2 * MARGIN,
      height: box.height / this.#scale - 2 * EDGE_GAP,
    };
  }

  show(tabs: readonly TabSummary[], groups: Record<number, TabGroupSummary> = {}): void {
    if (tabs.length === 0) return;
    // A fade may still be running from the last gesture.
    clearTimeout(this.#teardown);
    this.#panel.classList.remove("pointer-events-none");
    this.#caption.replaceChildren(
      label(t(tabs.length === 1 ? "grid_tabs_one" : "grid_tabs_other", formatNumber(tabs.length))),
      label(t("grid_hint")),
    );
    this.#tiles = tabs.map((tab) => ({
      tabId: tab.id,
      node: this.#tile(tab, groups[tab.groupId ?? -1]),
      current: tab.active && tab.ownWindow,
    }));
    this.#hovered = undefined;
    this.#grid.replaceChildren(...this.#rows(tabs, groups));
    const room = this.#room();
    // Never stretch a handful of tabs across the full panel: cap it at the
    // width the tiles actually present would occupy.
    this.#panel.style.width = `${Math.min(
      this.#size.panel,
      tabs.length * (this.#size.tile + 8) + 32,
      room.width,
    )}px`;
    this.#panel.style.maxHeight = `${room.height * TILES_SHARE}px`;
    this.#cheatPanel.style.width = `${Math.min(this.#size.panel, room.width)}px`;
    this.#cheatPanel.style.maxHeight = `${room.height * CHEATSHEET_SHARE}px`;
    this.#root.classList.remove("invisible");
    this.#visible = true;
    // One frame of layout before the transition, or it snaps in.
    requestAnimationFrame(() => this.#reveal(true));
  }

  hide(): void {
    if (!this.#visible) return;
    this.#visible = false;
    this.#reveal(false);
    // Nothing may take a click during the fade: the gesture is already over.
    this.#panel.classList.add("pointer-events-none");
    // Tearing the panel down has to wait for the fade. Clearing the tiles or
    // flipping visibility now collapses the panel to nothing first, so what
    // fades out is an empty box rather than the grid the user was looking at.
    this.#hovered = undefined;
    this.#tiles = [];
    this.#teardown = window.setTimeout(() => {
      this.#root.classList.add("invisible");
      this.#grid.replaceChildren();
    }, FADE_MS);
  }

  /**
   * Tiles with their headings folded in, in the order the background sorted
   * them: this window first, then each other window, and each window's tabs in
   * strip order. A window heading only appears once there is more than one
   * window on screen — with a single one it would be a label for everything.
   *
   * Group runs are contiguous by construction, since a group is contiguous in
   * the strip and the sort keeps the strip order.
   */
  #rows(tabs: readonly TabSummary[], groups: Record<number, TabGroupSummary>): HTMLElement[] {
    const manyWindows = new Set(tabs.map((tab) => tab.windowId)).size > 1;
    const rows: HTMLElement[] = [];
    let windowId: number | undefined;
    let groupId: number | undefined;

    tabs.forEach((tab, index) => {
      if (manyWindows && tab.windowId !== windowId) {
        rows.push(windowHeader(tab.ownWindow, rows.length > 0));
        // A window boundary restarts the group run: two windows can hold
        // groups that happen to sit next to each other in this list.
        groupId = undefined;
      }
      windowId = tab.windowId;

      if (tab.groupId !== groupId) {
        groupId = tab.groupId;
        const summary = groupId === undefined ? undefined : groups[groupId];
        if (summary) rows.push(groupHeader(summary));
      }

      const tile = this.#tiles[index];
      if (tile) rows.push(tile.node);
    });

    return rows;
  }

  #tile(tab: TabSummary, group: TabGroupSummary | undefined): HTMLButtonElement {
    // Only this window's active tab is the tab you are already on. Another
    // window's active tab is somewhere you are not, and picking it is the
    // whole point of listing that window — so it stays an ordinary target and
    // is marked, not fenced off.
    const current = tab.active && tab.ownWindow;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className =
      "group relative flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left " +
      "transition-colors duration-100 " +
      (current
        ? ACTIVE
        : "border-white/5 bg-white/[0.03] hover:border-emerald-300/40 hover:bg-emerald-400/10");

    const color = groupColor(group);
    if (color) {
      // The group's colour marks the left edge of every tile in it, which is
      // where Chrome puts it in the strip. A thick left *border* would be
      // mitred into the thin top and bottom ones and dragged around the corner
      // radius, which reads as a wedge rather than a bar — so it is a rounded
      // pill laid inside the tile instead, with the border left uniform.
      const stripe = document.createElement("span");
      stripe.className =
        "pointer-events-none absolute left-1.5 top-2 bottom-2 w-[3px] rounded-full";
      // Set on the element rather than through a class: the palette is nine
      // colours the build never sees.
      stripe.style.backgroundColor = color;
      tile.append(stripe);
      // Room for the stripe, so it never sits under the favicon.
      tile.style.paddingLeft = "0.875rem";
      // A collapsed group is not on screen in the strip. Picking one of its
      // tabs still works and expands it, so it is dimmed rather than dropped.
      if (group?.collapsed) tile.style.opacity = "0.65";
    }

    const icon = document.createElement("div");
    icon.className =
      "grid h-5 w-5 shrink-0 place-items-center text-mist-400 [&>svg]:h-4 [&>svg]:w-4";
    icon.innerHTML = FALLBACK_FAVICON;
    if (tab.favIconUrl && /^https?:/.test(tab.favIconUrl)) {
      const image = document.createElement("img");
      image.src = tab.favIconUrl;
      image.className = "h-4 w-4 rounded-sm";
      // The glyph holds the slot until the favicon has actually decoded. Swapping
      // it in up front leaves an empty square for as long as the fetch takes, and
      // a blocked or broken favicon never fills it at all.
      image.addEventListener("load", () => icon.replaceChildren(image), { once: true });
    }

    const text = document.createElement("div");
    text.className = "flex min-w-0 flex-col";
    const title = document.createElement("div");
    title.className = "truncate text-[12px] font-medium leading-tight text-mist-100";
    title.textContent = tab.title || tab.url;
    const host = document.createElement("div");
    host.className = "truncate text-[10px] leading-tight text-mist-400";
    host.textContent = hostOf(tab.url);
    text.append(title, host);
    tile.append(icon, text);

    // One trailing slot for both marks, so the audio badge and the active dot
    // cannot fight over `ml-auto`.
    const marks = document.createElement("div");
    marks.className = "ml-auto flex shrink-0 items-center gap-1.5";

    // Which tab is making the noise is most of the reason for opening a picker
    // at all, and it is the one thing the strip shows that this did not. A
    // muted tab is marked whether or not it has anything to play, matching the
    // strip: `muted` is a state the user set, `audible` is one the page is in.
    const sound = tab.muted ? "muted" : tab.audible ? "audible" : undefined;
    if (sound) {
      const badge = document.createElement("div");
      badge.className = `grid h-3.5 w-3.5 place-items-center [&>svg]:h-3.5 [&>svg]:w-3.5 ${
        sound === "muted" ? "text-mist-500" : "text-emerald-300"
      }`;
      badge.innerHTML = UI_ICONS[sound];
      badge.title = t(sound === "muted" ? "grid_muted" : "grid_audible");
      marks.append(badge);
    }

    if (tab.active) {
      // Colour alone would carry this for most people and not for everyone.
      const dot = document.createElement("div");
      dot.className = "h-1.5 w-1.5 shrink-0 rounded-full bg-mist-300";
      dot.title = t(current ? "grid_current" : "grid_current_other");
      marks.append(dot);
    }

    if (marks.childElementCount > 0) tile.append(marks);

    return tile;
  }
}

function label(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

/** A heading for the run of tabs belonging to one window. */
function windowHeader(own: boolean, spaced: boolean): HTMLElement {
  const node = headerRow(
    "px-1 text-[10px] font-medium uppercase tracking-wider text-mist-500 " +
      (spaced ? "mt-3 border-t border-white/5 pt-3" : ""),
  );
  node.textContent = t(own ? "grid_window_this" : "grid_window_other");
  return node;
}

/**
 * A heading for the run of tabs in one group: the group's colour, and its name
 * when it has one. Chrome allows a group with no name, which reads as its
 * colour alone in the strip and does the same here.
 */
function groupHeader(group: TabGroupSummary): HTMLElement {
  const node = headerRow("flex items-center gap-2 px-1 pt-1");
  const swatch = document.createElement("span");
  swatch.className = "h-1.5 w-6 shrink-0 rounded-full";
  swatch.style.backgroundColor = groupColor(group) ?? "";
  node.append(swatch);
  if (group.title) {
    const name = document.createElement("span");
    name.className = "truncate text-[10px] font-medium tracking-wide text-mist-300";
    name.textContent = group.title;
    node.append(name);
  }
  return node;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
