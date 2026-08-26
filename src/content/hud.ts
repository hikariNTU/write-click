import { strokeChipsHtml } from "../shared/icons";

export type MatchState = "matched" | "unassigned";

export interface Match {
  stroke: string;
  label: string;
  icon: string;
  state: MatchState;
}

/** How far above the bottom edge the readout sits, at scale 1. */
const BOTTOM_GAP = 40;

/** How far it slides up on the way in, at scale 1. */
const RISE = 8;

const TILE_TONE: Record<MatchState, string> = {
  matched: "bg-emerald-400/15 text-emerald-300 ring-emerald-300/25",
  unassigned: "bg-amber-400/15 text-amber-300 ring-amber-300/25",
};

/**
 * The floating readout naming whatever the stroke currently matches. It sits
 * in the overlay's shadow root, so none of these classes can leak into the
 * page and nothing the page ships can restyle it.
 */
export class Hud {
  readonly #anchor = document.createElement("div");
  readonly #card = document.createElement("div");
  readonly #tile = document.createElement("div");
  readonly #label = document.createElement("div");
  readonly #chips = document.createElement("div");
  #state: MatchState = "matched";
  #shown = false;
  /** Overlay scale: the user's size preference over the tab's page zoom. */
  #scale = 1;

  constructor(root: ShadowRoot) {
    this.#anchor.className =
      "pointer-events-none fixed inset-x-0 bottom-10 z-30 grid place-items-center";
    // Hidden and shown by inline transform rather than utilities, so the
    // entrance and the overlay scale share one property instead of fighting
    // over it. Only opacity and transform transition, never the offset.
    this.#card.className =
      "flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 " +
      "text-slate-50 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-[6px] " +
      "transition-[opacity,transform] duration-150 ease-out";
    this.#card.style.transformOrigin = "bottom center";
    this.#reveal();
    this.#tile.className =
      `grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${TILE_TONE.matched} ` +
      "[&>svg]:h-6 [&>svg]:w-6";
    this.#chips.className = "flex items-center gap-1 text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5";

    const text = document.createElement("div");
    text.className = "flex min-w-0 flex-col gap-1";
    this.#label.className = "truncate text-[13px] font-semibold leading-none tracking-tight";
    text.append(this.#label, this.#chips);

    this.#card.append(this.#tile, text);
    this.#anchor.append(this.#card);
    root.append(this.#anchor);
  }

  /**
   * Resizes the readout without moving it off the bottom edge: the card is
   * scaled and the gap it sits above is scaled with it, so the whole thing
   * grows as one piece.
   */
  setScale(scale: number): void {
    this.#scale = scale > 0 ? scale : 1;
    this.#anchor.style.bottom = `${BOTTOM_GAP * this.#scale}px`;
    this.#reveal();
  }

  #reveal(): void {
    this.#card.style.opacity = this.#shown ? "1" : "0";
    this.#card.style.transform = this.#shown
      ? `scale(${this.#scale})`
      : `translateY(${RISE * this.#scale}px) scale(${this.#scale * 0.95})`;
  }

  show(match: Match): void {
    if (match.state !== this.#state) {
      this.#tile.className = this.#tile.className.replace(
        TILE_TONE[this.#state],
        TILE_TONE[match.state],
      );
      this.#state = match.state;
    }
    this.#tile.innerHTML = match.icon;
    this.#label.textContent = match.label;
    this.#chips.replaceChildren(...chips(match.stroke));
    this.#shown = true;
    this.#reveal();
  }

  hide(): void {
    this.#shown = false;
    this.#reveal();
  }
}

function chips(stroke: string): Element[] {
  const holder = document.createElement("div");
  holder.innerHTML = strokeChipsHtml(stroke);
  return [...holder.children];
}
