import type { TabSummary } from "../shared/messages";
import { FALLBACK_FAVICON } from "./icons";

const PANEL_HIDDEN = ["opacity-0", "scale-95"] as const;

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
  readonly #columns: number;
  #onSelect: (tabId: number) => void = () => {};
  #visible = false;

  constructor(root: ShadowRoot, columns: number) {
    this.#columns = columns;
    // Toggled with `invisible`, not `hidden`: both `hidden` and `grid` set
    // `display`, so which one wins would come down to CSS source order.
    this.#root.className = "pointer-events-none invisible fixed inset-0 grid place-items-center";
    this.#panel.className =
      "pointer-events-auto max-h-[70vh] w-[min(880px,86vw)] overflow-y-auto rounded-3xl " +
      "border border-white/10 bg-slate-950/70 p-4 text-slate-50 backdrop-blur-2xl " +
      "shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] transition-all duration-150 ease-out " +
      PANEL_HIDDEN.join(" ");
    this.#caption.className =
      "mb-3 flex items-baseline justify-between px-1 text-[11px] font-medium text-slate-400";
    this.#grid.className = "grid gap-2";
    this.#grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    this.#panel.append(this.#caption, this.#grid);
    this.#root.append(this.#panel);
    root.append(this.#root);
  }

  get visible(): boolean {
    return this.#visible;
  }

  onSelect(handler: (tabId: number) => void): void {
    this.#onSelect = handler;
  }

  show(tabs: readonly TabSummary[]): void {
    if (tabs.length === 0) return;
    this.#caption.replaceChildren(
      label(`${tabs.length} tab${tabs.length === 1 ? "" : "s"}`),
      label("click to switch"),
    );
    this.#grid.replaceChildren(...tabs.map((tab) => this.#tile(tab)));
    this.#grid.style.gridTemplateColumns = `repeat(${Math.min(this.#columns, tabs.length)}, minmax(0, 1fr))`;
    this.#root.classList.remove("invisible");
    this.#visible = true;
    // One frame of layout before the transition, or it snaps in.
    requestAnimationFrame(() => this.#panel.classList.remove(...PANEL_HIDDEN));
  }

  hide(): void {
    if (!this.#visible) return;
    this.#visible = false;
    this.#panel.classList.add(...PANEL_HIDDEN);
    this.#root.classList.add("invisible");
    this.#grid.replaceChildren();
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
