import type { Point } from "../shared/recognizer";

export interface TrailOptions {
  color: string;
  width: number;
}

/**
 * The stroke being drawn: a wide, blurred underlay for the glow and a crisp
 * core on top, joined through midpoints so the line reads as one smooth
 * gesture instead of a polyline.
 */
export class Trail {
  readonly #canvas = document.createElement("canvas");
  readonly #context: CanvasRenderingContext2D | null;
  readonly #options: TrailOptions;
  #points: readonly Point[] = [];
  #frame = 0;

  constructor(root: ShadowRoot, options: TrailOptions) {
    this.#options = options;
    // z-20: above the tab grid. The grid stays open while a stroke is being
    // drawn, and feedback about what you are drawing must never be the thing
    // that gets covered up.
    this.#canvas.className = "pointer-events-none fixed inset-0 z-20 h-full w-full";
    this.#context = this.#canvas.getContext("2d");
    root.append(this.#canvas);
    this.#resize();
    window.addEventListener("resize", () => this.#resize(), { passive: true });
  }

  #resize(): void {
    const ratio = window.devicePixelRatio || 1;
    this.#canvas.width = Math.round(window.innerWidth * ratio);
    this.#canvas.height = Math.round(window.innerHeight * ratio);
    // Setting width resets the transform, so this scale never compounds.
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

  #path(context: CanvasRenderingContext2D): void {
    const [first, second] = this.#points;
    if (!first || !second) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let i = 1; i < this.#points.length - 1; i += 1) {
      const point = this.#points[i];
      const next = this.#points[i + 1];
      if (!point || !next) break;
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = this.#points.at(-1);
    if (last) context.lineTo(last.x, last.y);
  }

  #draw(): void {
    const context = this.#context;
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, this.#canvas.width / ratio, this.#canvas.height / ratio);
    if (this.#points.length < 2) return;

    const { color, width } = this.#options;
    context.lineCap = "round";
    context.lineJoin = "round";

    this.#path(context);
    context.globalAlpha = 0.3;
    context.lineWidth = width * 3;
    context.strokeStyle = color;
    context.shadowBlur = 24;
    context.shadowColor = color;
    context.stroke();

    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.lineWidth = width;
    context.stroke();

    const head = this.#points.at(-1);
    if (!head) return;
    context.beginPath();
    context.arc(head.x, head.y, width, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
  }

  clear(): void {
    this.render([]);
  }
}
