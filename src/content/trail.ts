import { distanceSquared } from "../shared/recognizer";
import type { Point } from "../shared/recognizer";
import { viewport } from "./viewport";

export interface TrailOptions {
  /** Draw the stroke at all. Everything else keeps running when this is off. */
  show: boolean;
  color: string;
  width: number;
}

/**
 * How far the pointer must travel before a sample joins the drawn line, in CSS
 * pixels.
 *
 * A mouse reports far more samples than a line needs, and `getCoalescedEvents`
 * hands over every one the compositor buffered — often several within a single
 * pixel. Those sub-pixel samples carry no shape, only the hand's tremor and the
 * sensor's rounding, and each one is a control point the curve is obliged to
 * pass through. Dropping them is what makes the line smooth; it costs nothing,
 * because a sample worth this little is not a sample anyone drew.
 */
const MIN_STEP = 3;

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
 * How far the change in strength is smeared across a panel's edge, in screen
 * pixels at scale 1. A hard boundary reads as a cut in the stroke; a gradient
 * reads as the stroke passing behind something.
 */
const FEATHER = 12;

/** A panel to fade over, in viewport pixels, corner radius included. */
export interface PanelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * The stroke being drawn: a wide, blurred underlay for the glow and a crisp
 * core on top, joined through midpoints so the line reads as one smooth
 * gesture instead of a polyline.
 */
export class Trail {
  readonly #canvas = document.createElement("canvas");
  readonly #context: CanvasRenderingContext2D | null;
  readonly #options: () => TrailOptions;
  /** Where the overlay's own panels are, so the stroke can thin out over them. */
  readonly #panels: () => readonly PanelBox[];
  /**
   * Somewhere to build the full-strength stroke before the panels are erased
   * out of it. The erase is `destination-out`, which would take the page with
   * it if it ran on a canvas that is composited over the page.
   */
  readonly #buffer = document.createElement("canvas");
  readonly #bufferContext: CanvasRenderingContext2D | null;
  /** Every sample as it arrived. The head of the line, and the head dot, are raw. */
  #points: readonly Point[] = [];
  /** The line actually drawn: decimated, and smoothed everywhere but the head. */
  #drawn: Point[] = [];
  /** How many raw samples `#drawn` has already been given. */
  #seen = 0;
  #frame = 0;
  /** Overlay scale: the user's size preference over the tab's page zoom. */
  #scale = 1;

  constructor(
    root: ShadowRoot,
    options: () => TrailOptions,
    panels: () => readonly PanelBox[] = () => [],
  ) {
    this.#options = options;
    this.#panels = panels;
    this.#bufferContext = this.#buffer.getContext("2d");
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

  /**
   * Sizes the backing stores to the canvas's own CSS box.
   *
   * The canvas is `fixed inset-0 h-full w-full`, so its CSS box is the layout
   * viewport, and `viewport()` is the only thing that reports that in both
   * rendering modes — hence not `window.innerWidth` and not
   * `documentElement.clientWidth` directly. Either one makes the bitmap a
   * different size from the box it is displayed in, the browser squeezes it to
   * fit, and everything drawn drifts away from the cursor.
   *
   * Re-checked per frame rather than only on `resize`, because a page that
   * grows tall enough to need a scrollbar changes the layout viewport without
   * firing one.
   */
  #resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const box = viewport();
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (this.#canvas.width === width && this.#canvas.height === height) return;
    for (const canvas of [this.#canvas, this.#buffer]) {
      canvas.width = width;
      canvas.height = height;
    }
    // Setting width resets the transform, so this scale never compounds.
    this.#context?.scale(ratio, ratio);
    this.#bufferContext?.scale(ratio, ratio);
  }

  /**
   * Folds new samples into the drawn line.
   *
   * Two things happen, and neither of them delays the head. Samples that have
   * not moved far enough are dropped outright, and a sample that has just
   * gained a successor — so it is interior, and no longer the head — is pulled
   * a quarter of the way towards each of its neighbours. Smoothing a point only
   * once it stops being the head is what keeps the line ahead of the cursor
   * rather than trailing it: the tip is always the raw sample that just
   * arrived, and only the part already behind the pointer is tidied up.
   */
  #absorb(points: readonly Point[]): void {
    // Fewer samples than last time means a different stroke, not this one.
    if (points.length < this.#seen) {
      this.#drawn = [];
      this.#seen = 0;
    }

    for (let i = this.#seen; i < points.length; i += 1) {
      const point = points[i];
      if (!point) break;
      const last = this.#drawn.at(-1);
      if (last && distanceSquared(last, point) < MIN_STEP ** 2) continue;
      this.#drawn.push(point);

      const n = this.#drawn.length;
      const before = this.#drawn[n - 3];
      const middle = this.#drawn[n - 2];
      const after = this.#drawn[n - 1];
      if (!before || !middle || !after) continue;
      this.#drawn[n - 2] = {
        x: (before.x + 2 * middle.x + after.x) / 4,
        y: (before.y + 2 * middle.y + after.y) / 4,
      };
    }

    this.#seen = points.length;
  }

  /**
   * The drawn line, with the newest raw sample on the end. Without it the line
   * would stop up to `MIN_STEP` short of the cursor, which reads as lag.
   */
  #line(): readonly Point[] {
    const head = this.#points.at(-1);
    if (!head || head === this.#drawn.at(-1)) return this.#drawn;
    return [...this.#drawn, head];
  }

  render(points: readonly Point[]): void {
    this.#points = points;
    this.#absorb(points);
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  #path(context: CanvasRenderingContext2D, line: readonly Point[]): void {
    const [first, second] = line;
    if (!first || !second) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let i = 1; i < line.length - 1; i += 1) {
      const point = line[i];
      const next = line[i + 1];
      if (!point || !next) break;
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = line.at(-1);
    if (last) context.lineTo(last.x, last.y);
  }

  /** The stroke itself, at `alpha` of its usual strength. */
  #stroke(context: CanvasRenderingContext2D, line: readonly Point[], alpha: number): void {
    const { color } = this.#options();
    const width = this.#options().width * this.#scale;
    context.lineCap = "round";
    context.lineJoin = "round";

    this.#path(context, line);
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
    this.#resize();
    const ratio = window.devicePixelRatio || 1;
    const width = this.#canvas.width / ratio;
    const height = this.#canvas.height / ratio;
    context.clearRect(0, 0, width, height);
    // Switched off draws nothing and stops there. The recognizer, the readout
    // and the grid never see this flag: what it hides is the line, not the
    // gesture.
    if (!this.#options().show) return;
    if (this.#points.length < 2) return;
    const line = this.#line();

    // A hidden panel still has a box; only one with area is in the way.
    const panels = this.#panels().filter((panel) => panel.width > 0 && panel.height > 0);
    const buffer = this.#bufferContext;
    if (panels.length === 0 || !buffer) {
      this.#stroke(context, line, 1);
      return;
    }

    // Faint across the whole stroke, then full strength painted back on
    // everywhere the panels are not. Two passes rather than two clips: a clip
    // has a hard edge by definition, and the whole point here is that it does
    // not.
    this.#stroke(context, line, PANEL_ALPHA);

    buffer.clearRect(0, 0, width, height);
    this.#stroke(buffer, line, 1);
    // Erased through a blur, so the strong stroke gives way to the faint one
    // across a gradient centred on the panel's edge instead of stopping at it.
    buffer.globalCompositeOperation = "destination-out";
    buffer.filter = `blur(${FEATHER * this.#scale}px)`;
    buffer.fillStyle = "#000000";
    for (const panel of panels) {
      buffer.beginPath();
      buffer.roundRect(panel.x, panel.y, panel.width, panel.height, panel.radius);
      buffer.fill();
    }
    buffer.filter = "none";
    buffer.globalCompositeOperation = "source-over";

    // The stroke passes leave both of these set, and drawImage would inherit them.
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.drawImage(this.#buffer, 0, 0, width, height);
  }

  clear(): void {
    this.render([]);
  }
}
