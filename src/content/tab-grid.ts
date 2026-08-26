import { COMMANDS } from "../shared/commands";
import type { CommandId } from "../shared/commands";
import { FALLBACK_FAVICON, strokeChipsHtml } from "../shared/icons";
import type { TabSummary } from "../shared/messages";
import type { GridSize } from "../shared/settings";

const PANEL_HIDDEN = ["opacity-0", "scale-95"] as const;

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
  #onSelect: (tabId: number) => void = () => {};
  #visible = false;
  #teardown = 0;

  constructor(root: ShadowRoot, size: GridSize) {
    this.#size = SIZES[size] ?? SIZES.normal;
    // Toggled with `invisible`, not `hidden`: both `hidden` and `grid` set
    // `display`, so which one wins would come down to CSS source order.
    this.#root.className =
      "pointer-events-none invisible fixed inset-0 z-10 grid place-items-center";
    this.#panel.className =
      "pointer-events-auto max-h-[70vh] overflow-y-auto rounded-3xl " +
      "border border-white/10 bg-slate-950/70 p-4 text-slate-50 backdrop-blur-[6px] " +
      "shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] transition-all duration-150 ease-out " +
      PANEL_HIDDEN.join(" ");
    this.#caption.className =
      "mb-3 flex items-baseline justify-between px-1 text-[11px] font-medium text-slate-400";
    this.#panel.style.width = `min(${this.#size.panel}px, 86vw)`;
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
      COMMANDS[a].label.localeCompare(COMMANDS[b].label),
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
      name.textContent = COMMANDS[command].label;

      line.append(chips, name);
      wrap.append(line);
    }

    const heading = document.createElement("div");
    heading.className =
      "mb-2 mt-4 border-t border-white/5 px-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-slate-500";
    heading.textContent = "Gestures";

    this.#cheatsheet.replaceChildren(heading, wrap);
  }

  get visible(): boolean {
    return this.#visible;
  }

  onSelect(handler: (tabId: number) => void): void {
    this.#onSelect = handler;
  }

  show(tabs: readonly TabSummary[]): void {
    if (tabs.length === 0) return;
    // A fade may still be running from the last gesture.
    clearTimeout(this.#teardown);
    this.#panel.classList.remove("pointer-events-none");
    this.#caption.replaceChildren(
      label(`${tabs.length} tab${tabs.length === 1 ? "" : "s"}`),
      label("click to switch"),
    );
    this.#grid.replaceChildren(...tabs.map((tab) => this.#tile(tab)));
    // Never stretch a handful of tabs across the full panel: cap the panel at
    // the width the tiles there actually are would occupy.
    this.#panel.style.width = `min(${this.#size.panel}px, 86vw, ${tabs.length * (this.#size.tile + 8) + 32}px)`;
    this.#root.classList.remove("invisible");
    this.#visible = true;
    // One frame of layout before the transition, or it snaps in.
    requestAnimationFrame(() => this.#panel.classList.remove(...PANEL_HIDDEN));
  }

  hide(): void {
    if (!this.#visible) return;
    this.#visible = false;
    this.#panel.classList.add(...PANEL_HIDDEN);
    // Nothing may take a click during the fade: the gesture is already over.
    this.#panel.classList.add("pointer-events-none");
    // Tearing the panel down has to wait for the fade. Clearing the tiles or
    // flipping visibility now collapses the panel to nothing first, so what
    // fades out is an empty box rather than the grid the user was looking at.
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

    // pointerdown, not click: the right button is still held, and this has to
    // land before the trigger's own pointerup ends the gesture.
    tile.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.#onSelect(tab.id);
    });

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
