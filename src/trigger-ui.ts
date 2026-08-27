import { attachTrigger, triggerMatches } from "./content/trigger-runtime";
import type { CommandId } from "./shared/commands";
import { COMMANDS } from "./shared/commands";
import { dynamic, t } from "./shared/i18n";
import type { Localized } from "./shared/i18n";
import { COMMAND_ICONS, strokeChipsHtml } from "./shared/icons";
import mouseArt from "./icons/mouse-trigger.svg?raw";
import { quantize } from "./shared/recognizer";
import type { Point } from "./shared/recognizer";
import { detectPlatform } from "./shared/trigger";
import type { Modifier, Trigger } from "./shared/trigger";
import { el } from "./ui";

/**
 * The trigger, shown rather than spelled out. Shared by the options page, the
 * popup and the welcome page: all three describe the same setting, and three
 * descriptions that drift apart is the confusion this is meant to end.
 */

const BUTTON_KEYS = [
  "trigger_button_left",
  "trigger_button_middle",
  "trigger_button_right",
] as const;

/**
 * A modifier under the name the keyboard in front of the reader prints on it.
 * The stored value is always the DOM name — `Alt`, `Meta` — and a mac keyboard
 * says Option and Command, which is what someone hunting for the key needs.
 */
export function modifierName(modifier: Modifier): Localized {
  const macos = detectPlatform() === "macos";
  if (modifier === "Alt") return t(macos ? "modifier_option" : "modifier_alt");
  if (modifier === "Meta") return t(macos ? "modifier_command" : "modifier_meta");
  return t(modifier === "Shift" ? "modifier_shift" : "modifier_control");
}

/** The trigger as a noun phrase: "Option + right button", "Space". */
export function triggerName(trigger: Trigger): Localized {
  if (trigger.kind === "key") return dynamic(trigger.code);
  const button = t(BUTTON_KEYS[trigger.button]);
  const modifier: Modifier | undefined = trigger.modifier;
  return modifier ? t("trigger_with_modifier", modifierName(modifier), button) : button;
}

/** The trigger as the popup states it: "hold Space", "Option + right button". */
export function describeTrigger(trigger: Trigger): Localized {
  if (trigger.kind === "key") return t("trigger_hold_key", trigger.code);
  return triggerName(trigger);
}

const MODIFIER_ORDER: readonly [Modifier, keyof MouseEvent][] = [
  ["Alt", "altKey"],
  ["Shift", "shiftKey"],
  ["Control", "ctrlKey"],
  ["Meta", "metaKey"],
];

/** What was actually pressed, named the same way the trigger is. */
export function describeInput(event: MouseEvent): Localized {
  const button = t(BUTTON_KEYS[Math.min(event.button, 2) as 0 | 1 | 2]);
  const held = MODIFIER_ORDER.find(([, key]) => event[key] === true);
  return held ? t("trigger_with_modifier", modifierName(held[0]), button) : button;
}

/**
 * One instance per glyph on the page. The artwork carries a clipPath, and an id
 * that appears twice in one document is resolved to whichever came first, so
 * the second mouse would be clipped by the first one's shape.
 */
let glyphSeq = 0;

/**
 * The mouse with the trigger's button lit and the stroke it draws. Three
 * dropdowns describe the trigger; this shows it, which is what a first reading
 * needs. A key trigger lights no button — there is none to light — and keeps
 * the stroke.
 */
export function mouseGlyph(trigger: Trigger, className = "h-32 w-32"): HTMLElement {
  const id = `wc-mouse-body-${++glyphSeq}`;
  const holder = el("div", `shrink-0 text-emerald-300 [&>svg]:h-full [&>svg]:w-full ${className}`);
  holder.innerHTML = mouseArt.replaceAll("wc-mouse-body", id);

  const svg = holder.firstElementChild;
  if (!svg) return holder;
  if (trigger.kind === "button") {
    svg.querySelector(`[data-button="${trigger.button}"]`)?.classList.add("wc-press");
  }
  svg.querySelector("[data-trail]")?.classList.add("wc-trail");

  // The key is held down with the button, so it is drawn being held: a cap
  // above the mouse that goes down on the same beat. A trigger with no key —
  // a bare button — has no cap rather than an empty one.
  const cap = svg.querySelector("[data-key]");
  const label: Localized | undefined =
    trigger.kind === "key"
      ? dynamic(trigger.code)
      : trigger.modifier && modifierName(trigger.modifier);
  if (!cap) return holder;
  if (!label) {
    cap.remove();
    return holder;
  }
  const text = cap.querySelector("[data-key-label]");
  if (text) {
    text.textContent = label;
    // 52 units of cap is about six characters at the design size, and a key
    // code — ArrowLeft, ControlLeft — runs longer than any modifier name.
    if (label.length > 6) text.setAttribute("font-size", label.length > 9 ? "7" : "9");
  }
  cap.classList.add("wc-key");
  return holder;
}

const PAD =
  "relative mt-4 flex h-40 cursor-crosshair select-none flex-col items-center justify-center " +
  "gap-2 overflow-hidden rounded-xl border border-dashed border-emerald-300/40 " +
  "bg-emerald-400/5 px-6 text-center";

/** The trail's look, as the overlay would draw it. */
export interface TrailLook {
  color: string;
  width: number;
}

/**
 * Redraws the whole stroke, in the pad's own coordinates.
 *
 * The overlay's `Trail` is not reused: it owns a viewport-sized canvas inside
 * the content script's shadow root, decimates and smooths for a line that is
 * metres long across a whole page, and reads its size from the layout viewport.
 * None of that applies to a box 160 pixels tall. What matters here is that the
 * colour and the width are the ones the page will use, so the line looks like
 * the line it is a preview of.
 */
function drawStroke(
  canvas: HTMLCanvasElement,
  points: readonly Point[],
  box: DOMRect,
  look: TrailLook,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(box.width * ratio);
  const height = Math.round(box.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  // Set rather than multiplied: this runs on every sample, and scale() compounds.
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  if (points.length < 2) return;

  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = look.color;
  context.shadowColor = look.color;
  context.shadowBlur = look.width * 2.5;
  context.lineWidth = look.width;
  context.beginPath();
  const [head, ...rest] = points;
  if (!head) return;
  context.moveTo(head.x - box.left, head.y - box.top);
  for (const point of rest) context.lineTo(point.x - box.left, point.y - box.top);
  context.stroke();
}

/**
 * A pad that answers the configured trigger and nothing else, and shows what is
 * being drawn while it is being drawn.
 *
 * The gestures pad in the Gestures card records a stroke from any pointer
 * press, which teaches nothing about the trigger — the whole failure this is
 * for is a first gesture drawn with the wrong thing held, on a page where
 * failure is silent. Here a near miss says so.
 *
 * The line, the arrows and the command name all update per sample, because a
 * gesture is recognized as it is drawn and a pad that only answers on release
 * teaches the wrong model of the thing: on a real page the readout names the
 * command before the button comes up, and changing the shape changes the answer.
 *
 * `attachTrigger` listens on the window, so the strokes it reports include ones
 * begun elsewhere on the page; those are dropped by geometry. Its context-menu
 * suppression is window-wide for as long as the pad is mounted, which is the
 * same behaviour the trigger has on a real page and the point of trying it.
 */
export function triggerPad(
  trigger: Trigger,
  gestures: Record<string, CommandId>,
  look: TrailLook,
  signal: AbortSignal,
): HTMLElement {
  const pad = el("div", PAD);
  const canvas = el("canvas", "pointer-events-none absolute inset-0 h-full w-full");
  const chips = el(
    "div",
    "relative flex h-4 items-center gap-1 text-emerald-200 [&>svg]:h-4 [&>svg]:w-4",
  );
  const line = el("div", "relative text-[11px] leading-relaxed text-emerald-200/80");
  pad.append(canvas, chips, line);

  let points: Point[] | undefined;
  /** Measured once per stroke: the box cannot move while a button is held. */
  let box: DOMRect | undefined;

  function say(message: Localized, tone: "idle" | "wrong" = "idle"): void {
    line.className = `relative text-[11px] leading-relaxed ${
      tone === "wrong" ? "text-amber-200" : "text-emerald-200/80"
    }`;
    line.textContent = message;
  }

  function clear(): void {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** The stroke as it stands: its arrows, and what it would run right now. */
  function report(stroke: string): void {
    if (stroke) chips.innerHTML = strokeChipsHtml(stroke);
    else chips.replaceChildren();

    if (!stroke) {
      say(t("options_trigger_pad_idle", triggerName(trigger)));
      return;
    }
    const command = gestures[stroke];
    say(
      command
        ? t("options_trigger_pad_matched", t(COMMANDS[command].labelKey))
        : t("options_trigger_pad_unassigned"),
    );
  }

  function reset(): void {
    points = undefined;
    box = undefined;
    clear();
    report("");
  }

  reset();

  const detach = attachTrigger(trigger, {
    onStart(point) {
      const rect = pad.getBoundingClientRect();
      const within =
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom;
      if (!within) {
        points = undefined;
        return;
      }
      points = [point];
      box = rect;
      clear();
      report("");
    },
    onMove(point) {
      if (!points || !box) return;
      points.push(point);
      drawStroke(canvas, points, box, look);
      report(quantize(points));
    },
    onEnd() {
      if (!points) return;
      const stroke = quantize(points);
      points = undefined;
      // The line stays up after the release. It is the answer to "what did I
      // just draw", and it is gone the moment the next stroke starts.
      if (!stroke) {
        say(t("options_trigger_pad_none"));
        return;
      }
      report(stroke);
    },
    onCancel: reset,
  });

  // Anything else pressed on the pad is the mistake this card exists to catch,
  // so it is named rather than ignored.
  pad.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || triggerMatches(trigger, event)) return;
    chips.replaceChildren();
    clear();
    say(t("options_trigger_pad_wrong", describeInput(event), triggerName(trigger)), "wrong");
  });
  pad.addEventListener("contextmenu", (event) => event.preventDefault());

  signal.addEventListener("abort", detach, { once: true });
  return pad;
}

/**
 * Every stroke that is assigned, as arrows and a name.
 *
 * A first-run page that teaches the trigger and stops there has taught half of
 * it: someone who now knows what to hold still has nothing to draw. Sorted by
 * command name, the same order and the same `strokeChipsHtml` the overlay's
 * cheatsheet uses, so the list read here is the list seen on a page.
 */
export function gestureList(gestures: Record<string, CommandId>): HTMLElement {
  const wrap = el("div", "grid gap-x-6 gap-y-2");
  wrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";

  const entries = Object.entries(gestures).toSorted(([, a], [, b]) =>
    t(COMMANDS[a].labelKey).localeCompare(t(COMMANDS[b].labelKey)),
  );
  for (const [stroke, command] of entries) {
    const row = el("div", "flex min-w-0 items-center gap-2.5");
    const glyph = el(
      "div",
      "grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/5 text-mist-300 " +
        "[&>svg]:h-3.5 [&>svg]:w-3.5",
    );
    glyph.innerHTML = COMMAND_ICONS[command];
    const arrows = el(
      "div",
      "flex shrink-0 items-center gap-0.5 text-emerald-200/80 [&>svg]:h-3 [&>svg]:w-3",
    );
    arrows.innerHTML = strokeChipsHtml(stroke);
    row.append(
      glyph,
      arrows,
      el("span", "truncate text-[11px] text-mist-400", t(COMMANDS[command].labelKey)),
    );
    wrap.append(row);
  }
  return wrap;
}
