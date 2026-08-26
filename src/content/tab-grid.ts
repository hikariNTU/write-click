import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { formatNumber, t } from "../shared/i18n";
import { FALLBACK_FAVICON, strokeChipsHtml } from "../shared/icons";
import type { TabSummary } from "../shared/messages";
import { containsPoint } from "../shared/geometry";
import type { Point } from "../shared/recognizer";
import type { GridSize } from "../shared/settings";
import type { PanelBox } from "./trail";

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
 * Deliberately a different colour from HOVER, not the same one: hover means
 * "release here and you land on this tab", and the current tab is the single
 * tile where releasing does nothing. Painting the two alike said the opposite.
 */
const ACTIVE = "border-sky-300/45 bg-sky-400/[0.12]";

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
  active: boolean;
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
  readonly #size: { tile: number; panel: number };
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
    this.#size = SIZES[size] ?? SIZES.normal;
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
    this.#grid.style.gridTemplateColumns = `repeat(auto-fit, minmax(${this.#size.tile}px, 1fr))`;
    this.#panel.append(this.#caption, this.#grid);
    this.#cheatPanel.append(this.#cheatsheet);
    this.#topBar.append(this.#panel);
    this.#bottomBar.append(this.#cheatPanel);
    this.#root.append(this.#topBar, this.#bottomBar);
    root.append(this.#root);
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
    // The active tab's tile already carries these classes; taking them off it
    // on the way out would strip its own styling. Leaving it unhoverable also
    // keeps a release over it from re-activating the tab already in front.
    const next = found && !found.active ? found : undefined;
    if (next === this.#hovered) return;
    this.#hovered?.node.classList.remove(...HOVER);
    this.#hovered = next;
    next?.node.classList.add(...HOVER);
  }

  #tileAt(point: Point): Tile | undefined {
    if (!this.#visible) return undefined;
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
    return {
      // The layout viewport, which is what the bars span — `window.innerWidth`
      // counts a classic scrollbar the bars do not reach across, so budgeting
      // against it lets a wide panel run out past the right edge and under it.
      width: document.documentElement.clientWidth / this.#scale - 2 * MARGIN,
      height: document.documentElement.clientHeight / this.#scale - 2 * EDGE_GAP,
    };
  }

  show(tabs: readonly TabSummary[]): void {
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
      node: this.#tile(tab),
      active: tab.active,
    }));
    this.#hovered = undefined;
    this.#grid.replaceChildren(...this.#tiles.map(({ node }) => node));
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

  #tile(tab: TabSummary): HTMLButtonElement {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className =
      "group flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left " +
      "transition-colors duration-100 " +
      (tab.active
        ? ACTIVE
        : "border-white/5 bg-white/[0.03] hover:border-emerald-300/40 hover:bg-emerald-400/10");

    const icon = document.createElement("div");
    icon.className =
      "grid h-5 w-5 shrink-0 place-items-center text-mist-400 [&>svg]:h-4 [&>svg]:w-4";
    icon.innerHTML = FALLBACK_FAVICON;
    if (tab.favIconUrl && /^https?:/.test(tab.favIconUrl)) {
      const image = document.createElement("img");
      image.src = tab.favIconUrl;
      image.className = "h-4 w-4 rounded-sm";
      // A blocked or broken favicon falls back to the bundled glyph.
      image.addEventListener("error", () => (icon.innerHTML = FALLBACK_FAVICON), { once: true });
      icon.replaceChildren(image);
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

    if (tab.active) {
      // Colour alone would carry this for most people and not for everyone.
      const dot = document.createElement("div");
      dot.className = "ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300";
      dot.title = t("grid_current");
      tile.append(dot);
    }

    return tile;
  }
}

function label(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
