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
  readonly #options: TrailOptions;
  /** Where the overlay's own panels are, so the stroke can thin out over them. */
  readonly #panels: () => readonly PanelBox[];
  /**
   * Somewhere to build the full-strength stroke before the panels are erased
   * out of it. The erase is `destination-out`, which would take the page with
   * it if it ran on a canvas that is composited over the page.
   */
  readonly #buffer = document.createElement("canvas");
  readonly #bufferContext: CanvasRenderingContext2D | null;
  #points: readonly Point[] = [];
  #frame = 0;
  /** Overlay scale: the user's size preference over the tab's page zoom. */
  #scale = 1;

  constructor(
    root: ShadowRoot,
    options: TrailOptions,
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
   * `clientWidth`, not `window.innerWidth`: the two differ by the width of a
   * classic scrollbar, and the canvas is `fixed inset-0 h-full w-full`, so its
   * CSS box is the layout viewport. Sizing the bitmap from `innerWidth` makes
   * it wider than the box it is displayed in, and the browser squeezes it to
   * fit — so everything drawn drifts left of the cursor, by nothing at the left
   * edge and by the whole scrollbar at the right.
   *
   * Re-checked per frame rather than only on `resize`, because a page that
   * grows tall enough to need a scrollbar changes the layout viewport without
   * firing one.
   */
  #resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(document.documentElement.clientWidth * ratio);
    const height = Math.round(document.documentElement.clientHeight * ratio);
    if (this.#canvas.width === width && this.#canvas.height === height) return;
    for (const canvas of [this.#canvas, this.#buffer]) {
      canvas.width = width;
      canvas.height = height;
    }
    // Setting width resets the transform, so this scale never compounds.
    this.#context?.scale(ratio, ratio);
    this.#bufferContext?.scale(ratio, ratio);
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
    this.#resize();
    const ratio = window.devicePixelRatio || 1;
    const width = this.#canvas.width / ratio;
    const height = this.#canvas.height / ratio;
    context.clearRect(0, 0, width, height);
    if (this.#points.length < 2) return;

    // A hidden panel still has a box; only one with area is in the way.
    const panels = this.#panels().filter((panel) => panel.width > 0 && panel.height > 0);
    const buffer = this.#bufferContext;
    if (panels.length === 0 || !buffer) {
      this.#stroke(context, 1);
      return;
    }

    // Faint across the whole stroke, then full strength painted back on
    // everywhere the panels are not. Two passes rather than two clips: a clip
    // has a hard edge by definition, and the whole point here is that it does
    // not.
    this.#stroke(context, PANEL_ALPHA);

    buffer.clearRect(0, 0, width, height);
    this.#stroke(buffer, 1);
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
