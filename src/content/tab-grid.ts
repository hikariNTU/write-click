import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { formatNumber, t } from "../shared/i18n";
import { FALLBACK_FAVICON, strokeChipsHtml } from "../shared/icons";
import type { TabSummary } from "../shared/messages";
import { containsPoint } from "../shared/geometry";
import type { Point } from "../shared/recognizer";
import type { GridSize } from "../shared/settings";

/** Kept clear of the viewport edge, so the panel's border is never clipped. */
const MARGIN = 12;

/** How far the panel sits from the cursor, on whichever side it opens. */
const GAP = 16;

/**
 * Applied by hand rather than by `:hover`. While a mouse button is held, Blink
 * captures events to the node that received the press, and hover stops
 * following the cursor with it.
 */
const HOVER = ["border-emerald-300/40", "bg-emerald-400/10"] as const;

/** Must match the panel's `duration-150`, or the teardown cuts the fade short. */
const FADE_MS = 150;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

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
  readonly #panel = document.createElement("div");
  readonly #grid = document.createElement("div");
  readonly #caption = document.createElement("div");
  readonly #size: { tile: number; panel: number };
  readonly #cheatsheet = document.createElement("div");
  #visible = false;
  #teardown = 0;
  /** Tiles in view, for hit testing the pointer against their boxes. */
  #tiles: Tile[] = [];
  #hovered: Tile | undefined;
  /**
   * Counter-scale for the tab's page zoom, so the panel keeps one size at every
   * zoom level. Everything the panel is measured and placed by is in the page's
   * CSS pixels; multiplying by this converts to what lands on screen.
   */
  #scale = 1;

  constructor(root: ShadowRoot, size: GridSize) {
    this.#size = SIZES[size] ?? SIZES.normal;
    // Toggled with `invisible`, not `hidden`: both `hidden` and `grid` set
    // `display`, so which one wins would come down to CSS source order.
    this.#root.className = "pointer-events-none invisible fixed inset-0 z-10";
    // Only opacity and transform transition. `transition-all` would animate
    // left and top too, and the panel would slide across the page from wherever
    // the last gesture left it.
    this.#panel.className =
      "pointer-events-auto absolute overflow-y-auto rounded-3xl " +
      "border border-white/10 bg-slate-950/70 p-4 text-slate-50 backdrop-blur-[6px] " +
      "shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] transition-[opacity,transform] " +
      "duration-150 ease-out";
    // Scaled from the corner it is anchored by, so the entrance grows out of
    // the cursor rather than drifting toward it.
    this.#panel.style.transformOrigin = "top left";
    this.#reveal(false);
    this.#caption.className =
      "mb-3 flex items-baseline justify-between px-1 text-[11px] font-medium text-slate-400";
    this.#grid.className = "grid gap-2";
    this.#grid.style.gridTemplateColumns = `repeat(auto-fit, minmax(${this.#size.tile}px, 1fr))`;
    this.#panel.append(this.#caption, this.#grid, this.#cheatsheet);
    this.#root.append(this.#panel);
    root.append(this.#root);
  }

  /**
   * The gesture list, under the tiles. The panel is already on screen while the
   * trigger is held, which is exactly the moment someone is wondering what else
   * they could draw — so the reference belongs here rather than buried in
   * settings.
   */
  setGestures(gestures: Record<string, CommandId>): void {
    const entries = Object.entries(gestures).toSorted(([, a], [, b]) =>
      t(COMMANDS[a].labelKey).localeCompare(t(COMMANDS[b].labelKey)),
    );
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
      chips.className = "flex shrink-0 items-center gap-0.5 text-slate-300 [&>svg]:h-3 [&>svg]:w-3";
      chips.innerHTML = strokeChipsHtml(stroke);

      const name = document.createElement("span");
      name.className = "truncate text-[11px] text-slate-400";
      name.textContent = t(COMMANDS[command].labelKey);

      line.append(chips, name);
      wrap.append(line);
    }

    const heading = document.createElement("div");
    heading.className =
      "mb-2 mt-4 border-t border-white/5 px-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500";
    heading.textContent = t("grid_cheatsheet");

    this.#cheatsheet.replaceChildren(heading, wrap);
  }

  get visible(): boolean {
    return this.#visible;
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

  #reveal(shown: boolean): void {
    this.#panel.style.opacity = shown ? "1" : "0";
    // The entrance scale is folded into the zoom counter-scale: one transform
    // property, so the two cannot fight over it.
    this.#panel.style.transform = `scale(${shown ? this.#scale : this.#scale * 0.95})`;
  }

  /**
   * Anchors the panel beside the cursor.
   *
   * It opens down and to the right, and flips to the other side of the cursor
   * when there is no room. Either way the cursor lands outside the panel: a
   * panel that opened under it would put a tile beneath a cursor the user never
   * moved there.
   */
  #place(at: Point): void {
    const width = this.#panel.offsetWidth * this.#scale;
    const height = this.#panel.offsetHeight * this.#scale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = at.x + GAP;
    if (left + width > vw - MARGIN) left = at.x - GAP - width;
    let top = at.y + GAP;
    if (top + height > vh - MARGIN) top = at.y - GAP - height;

    // Clamped last, and to the near edge when the panel is larger than the
    // window: a panel the cursor overlaps beats one whose border is off-screen.
    this.#panel.style.left = `${clamp(left, MARGIN, vw - width - MARGIN)}px`;
    this.#panel.style.top = `${clamp(top, MARGIN, vh - height - MARGIN)}px`;
  }

  /**
   * @param at   Where the cursor is now, in the top frame's client coordinates.
   * @param zoom The tab's page zoom, which the panel cancels out.
   */
  show(tabs: readonly TabSummary[], at: Point, zoom: number): void {
    if (tabs.length === 0) return;
    // A fade may still be running from the last gesture.
    clearTimeout(this.#teardown);
    this.#scale = 1 / (zoom > 0 ? zoom : 1);
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
    // Sized in the pixels it will occupy on screen, then divided back out of
    // the counter-scale. Never stretch a handful of tabs across the full panel:
    // cap it at the width the tiles there actually are would occupy.
    const width = Math.min(
      this.#size.panel,
      tabs.length * (this.#size.tile + 8) + 32,
      window.innerWidth - 2 * MARGIN,
    );
    this.#panel.style.width = `${width / this.#scale}px`;
    this.#panel.style.maxHeight = `${(window.innerHeight - 2 * MARGIN) / this.#scale}px`;
    this.#root.classList.remove("invisible");
    this.#visible = true;
    // Placed before the reveal, off a layout that is already final: the panel
    // must not animate in from wherever the last gesture left it.
    this.#place(at);
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
        ? "border-emerald-300/40 bg-emerald-400/10"
        : "border-white/5 bg-white/[0.03] hover:border-emerald-300/40 hover:bg-emerald-400/10");

    const icon = document.createElement("div");
    icon.className =
      "grid h-5 w-5 shrink-0 place-items-center text-slate-400 [&>svg]:h-4 [&>svg]:w-4";
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
    title.className = "truncate text-[12px] font-medium leading-tight text-slate-100";
    title.textContent = tab.title || tab.url;
    const host = document.createElement("div");
    host.className = "truncate text-[10px] leading-tight text-slate-400";
    host.textContent = hostOf(tab.url);
    text.append(title, host);
    tile.append(icon, text);

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
