import { attachTrigger, triggerMatches } from "./content/trigger-runtime";
import type { CommandId } from "./shared/commands";
import { COMMANDS } from "./shared/commands";
import { dynamic, t } from "./shared/i18n";
import type { Localized } from "./shared/i18n";
import { strokeChipsHtml } from "./shared/icons";
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
  "mt-4 flex h-40 cursor-crosshair select-none flex-col items-center justify-center gap-2 " +
  "rounded-xl border border-dashed border-emerald-300/40 bg-emerald-400/5 px-6 text-center";

/**
 * A pad that answers the configured trigger and nothing else.
 *
 * The gestures pad in the Gestures card records a stroke from any pointer
 * press, which teaches nothing about the trigger — the whole failure this is
 * for is a first gesture drawn with the wrong thing held, on a page where
 * failure is silent. Here a near miss says so, and a hit names the command it
 * matched.
 *
 * `attachTrigger` listens on the window, so the strokes it reports include ones
 * begun elsewhere on the page; those are dropped by geometry. Its context-menu
 * suppression is window-wide for as long as the pad is mounted, which is the
 * same behaviour the trigger has on a real page and the point of trying it.
 */
export function triggerPad(
  trigger: Trigger,
  gestures: Record<string, CommandId>,
  signal: AbortSignal,
): HTMLElement {
  const pad = el("div", PAD);
  const chips = el("div", "flex h-4 items-center gap-1 text-emerald-200 [&>svg]:h-4 [&>svg]:w-4");
  const line = el("div", "text-[11px] leading-relaxed text-emerald-200/80");
  pad.append(chips, line);

  let points: Point[] | undefined;

  function say(message: Localized, tone: "idle" | "wrong" = "idle"): void {
    line.className = `text-[11px] leading-relaxed ${
      tone === "wrong" ? "text-amber-200" : "text-emerald-200/80"
    }`;
    line.textContent = message;
  }

  function reset(): void {
    points = undefined;
    chips.replaceChildren();
    say(t("options_trigger_pad_idle", triggerName(trigger)));
  }

  function inside(point: Point): boolean {
    const box = pad.getBoundingClientRect();
    return (
      point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
    );
  }

  function paint(stroke: string): void {
    if (stroke) chips.innerHTML = strokeChipsHtml(stroke);
    else chips.replaceChildren();
  }

  reset();

  const detach = attachTrigger(trigger, {
    onStart(point) {
      points = inside(point) ? [point] : undefined;
      if (points) {
        chips.replaceChildren();
        say(t("options_trigger_pad_idle", triggerName(trigger)));
      }
    },
    onMove(point) {
      if (!points) return;
      points.push(point);
      paint(quantize(points));
    },
    onEnd() {
      if (!points) return;
      const stroke = quantize(points);
      points = undefined;
      paint(stroke);
      if (!stroke) {
        say(t("options_trigger_pad_none"));
        return;
      }
      const command = gestures[stroke];
      say(
        command
          ? t("options_trigger_pad_matched", t(COMMANDS[command].labelKey))
          : t("options_trigger_pad_unassigned"),
      );
    },
    onCancel: reset,
  });

  // Anything else pressed on the pad is the mistake this card exists to catch,
  // so it is named rather than ignored.
  pad.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || triggerMatches(trigger, event)) return;
    chips.replaceChildren();
    say(t("options_trigger_pad_wrong", describeInput(event), triggerName(trigger)), "wrong");
  });
  pad.addEventListener("contextmenu", (event) => event.preventDefault());

  signal.addEventListener("abort", detach, { once: true });
  return pad;
}
