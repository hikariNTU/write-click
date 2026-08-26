import type { Point } from "./recognizer";

export interface TrailOptions {
  color: string;
  width: number;
  showLabel: boolean;
}

/**
 * The stroke being drawn, plus a label naming whatever it currently matches.
 * Lives inside the overlay's shadow root; the canvas never takes pointer
 * events, so the page underneath keeps behaving normally.
 */
export class Trail {
  readonly #canvas = document.createElement("canvas");
  readonly #context: CanvasRenderingContext2D | null;
  readonly #label = document.createElement("div");
  readonly #options: TrailOptions;
  #points: readonly Point[] = [];
  #frame = 0;

  constructor(root: ShadowRoot, options: TrailOptions) {
    this.#options = options;
    this.#canvas.className = "pointer-events-none fixed inset-0 h-full w-full";
    this.#label.className =
      "pointer-events-none fixed bottom-8 left-1/2 hidden -translate-x-1/2 rounded-full " +
      "bg-slate-900/90 px-4 py-1.5 text-sm font-medium text-slate-100 shadow-lg " +
      "ring-1 ring-white/10";
    this.#context = this.#canvas.getContext("2d");
    root.append(this.#canvas, this.#label);
    this.#resize();
    window.addEventListener("resize", () => this.#resize(), { passive: true });
  }

  #resize(): void {
    const ratio = window.devicePixelRatio || 1;
    this.#canvas.width = Math.round(window.innerWidth * ratio);
    this.#canvas.height = Math.round(window.innerHeight * ratio);
    this.#context?.scale(ratio, ratio);
  }

  render(points: readonly Point[]): void {
    this.#points = points;
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  #draw(): void {
    const context = this.#context;
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, this.#canvas.width / ratio, this.#canvas.height / ratio);
    if (this.#points.length < 2) return;

    context.beginPath();
    const [first, ...rest] = this.#points;
    if (!first) return;
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);

    context.lineWidth = this.#options.width;
    context.strokeStyle = this.#options.color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  setLabel(text: string): void {
    if (!this.#options.showLabel || !text) {
      this.#label.classList.add("hidden");
      return;
    }
    this.#label.textContent = text;
    this.#label.classList.remove("hidden");
  }

  clear(): void {
    this.render([]);
    this.setLabel("");
  }
}
