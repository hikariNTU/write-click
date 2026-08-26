import type { Point } from "../shared/recognizer";

export interface TrailOptions {
  color: string;
  width: number;
}

/**
 * How much of the stroke survives where it crosses a panel.
 *
 * The trail sits above the tab grid on purpose — feedback about what you are
 * drawing must never be the thing that gets covered up — but a full-strength
 * line straight through a tile hides the title the tile exists to show. Thirty
 * percent keeps the stroke legible as a stroke and the tile legible as a tab.
 */
const PANEL_ALPHA = 0.3;

/**
 * The stroke being drawn: a wide, blurred underlay for the glow and a crisp
 * core on top, joined through midpoints so the line reads as one smooth
 * gesture instead of a polyline.
 */
export class Trail {
  readonly #canvas = document.createElement("canvas");
  readonly #context: CanvasRenderingContext2D | null;
  readonly #options: TrailOptions;
  /** Where the overlay's own panels are, so the stroke can thin out over them. */
  readonly #panels: () => readonly DOMRect[];
  #points: readonly Point[] = [];
  #frame = 0;
  /** Overlay scale: the user's size preference over the tab's page zoom. */
  #scale = 1;

  constructor(
    root: ShadowRoot,
    options: TrailOptions,
    panels: () => readonly DOMRect[] = () => [],
  ) {
    this.#options = options;
    this.#panels = panels;
    // z-20: above the tab grid. The grid stays open while a stroke is being
    // drawn, and feedback about what you are drawing must never be the thing
    // that gets covered up.
    this.#canvas.className = "pointer-events-none fixed inset-0 z-20 h-full w-full";
    this.#context = this.#canvas.getContext("2d");
    root.append(this.#canvas);
    this.#resize();
    window.addEventListener("resize", () => this.#resize(), { passive: true });
  }

  /**
   * The stroke is drawn in the page's own coordinates — it has to follow the
   * cursor — so only its thickness is scaled. Page zoom would otherwise make
   * the line fatter as the page grows.
   */
  setScale(scale: number): void {
    this.#scale = scale > 0 ? scale : 1;
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

  /** The stroke itself, at `alpha` of its usual strength. */
  #stroke(context: CanvasRenderingContext2D, alpha: number): void {
    const { color } = this.#options;
    const width = this.#options.width * this.#scale;
    context.lineCap = "round";
    context.lineJoin = "round";

    this.#path(context);
    context.globalAlpha = 0.3 * alpha;
    context.lineWidth = width * 3;
    context.strokeStyle = color;
    context.shadowBlur = 24 * this.#scale;
    context.shadowColor = color;
    context.stroke();

    context.globalAlpha = alpha;
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

  #draw(): void {
    const context = this.#context;
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, this.#canvas.width / ratio, this.#canvas.height / ratio);
    if (this.#points.length < 2) return;

    // A hidden panel still has a box; only one with area is in the way.
    const panels = this.#panels().filter((rect) => rect.width > 0 && rect.height > 0);
    if (panels.length === 0) {
      this.#stroke(context, 1);
      return;
    }

    // Twice, clipped complementarily rather than drawn once and dimmed: the
    // stroke overlaps itself at every corner, and one translucent pass over
    // the whole path would darken those overlaps into knots.
    context.save();
    const outside = new Path2D();
    outside.rect(0, 0, window.innerWidth, window.innerHeight);
    for (const rect of panels) outside.rect(rect.x, rect.y, rect.width, rect.height);
    // Even-odd, so the panels punch holes in the viewport rather than adding to it.
    context.clip(outside, "evenodd");
    this.#stroke(context, 1);
    context.restore();

    context.save();
    const inside = new Path2D();
    for (const rect of panels) inside.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip(inside);
    this.#stroke(context, PANEL_ALPHA);
    context.restore();
  }

  clear(): void {
    this.render([]);
  }
}
