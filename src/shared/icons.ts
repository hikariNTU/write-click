import arrowBack from "../icons/arrow_back.svg?raw";
import arrowForward from "../icons/arrow_forward.svg?raw";
import help from "../icons/help.svg?raw";
import doubleDown from "../icons/keyboard_double_arrow_down.svg?raw";
import doubleLeft from "../icons/keyboard_double_arrow_left.svg?raw";
import doubleRight from "../icons/keyboard_double_arrow_right.svg?raw";
import doubleUp from "../icons/keyboard_double_arrow_up.svg?raw";
import globe from "../icons/public.svg?raw";
import minimize from "../icons/minimize.svg?raw";
import restore from "../icons/restore_from_trash.svg?raw";
import tabCloseRight from "../icons/tab_close_right.svg?raw";
import tabClose from "../icons/tab_close.svg?raw";
import alignBottom from "../icons/vertical_align_bottom.svg?raw";
import alignTop from "../icons/vertical_align_top.svg?raw";
import type { CommandId } from "../shared/commands";
import type { Direction } from "./recognizer";

/**
 * Material Symbols Rounded, vendored into src/icons by scripts/sync-icons.mjs
 * and bundled at build time — an extension cannot pull
 * a webfont at runtime under its own CSP, and inlining the dozen glyphs we
 * actually use costs a few kB against the ~4 MB variable font.
 *
 * Weight is 700, the heaviest the Material Symbols `wght` axis defines. There
 * is no 900 in this family.
 */
function prepare(svg: string): string {
  return svg
    .replace("<svg ", '<svg fill="currentColor" aria-hidden="true" ')
    .replaceAll(/ (?:width|height)="48"/g, "");
}

export const COMMAND_ICONS: Record<CommandId, string> = {
  "tab.next": prepare(arrowForward),
  "tab.prev": prepare(arrowBack),
  "tab.close": prepare(tabClose),
  "tab.reopen": prepare(restore),
  "tab.closeRight": prepare(tabCloseRight),
  // Material Symbols ships no left-hand twin, so the right one is mirrored.
  "tab.closeLeft": prepare(tabCloseRight).replace("<svg ", '<svg class="scale-x-[-1]" '),
  "tab.first": prepare(doubleLeft),
  "tab.last": prepare(doubleRight),
  "window.minimize": prepare(minimize),
  "page.up": prepare(doubleUp),
  "page.down": prepare(doubleDown),
  "page.top": prepare(alignTop),
  "page.end": prepare(alignBottom),
};

export const UNKNOWN_ICON = prepare(help);

/** Stands in when a tab has no favicon, or its favicon fails to load. */
export const FALLBACK_FAVICON = prepare(globe);

/** One glyph, rotated, so a stroke renders as the arrows it was drawn as. */
export const DIRECTION_ICON = prepare(arrowForward);

export const DIRECTION_ROTATION: Record<Direction, string> = {
  R: "rotate-0",
  D: "rotate-90",
  L: "rotate-180",
  U: "-rotate-90",
};

/** Renders a stroke as the arrows it was drawn as, not as letters. */
export function strokeChipsHtml(stroke: string): string {
  return [...stroke]
    .map((letter) => {
      const rotation = DIRECTION_ROTATION[letter as Direction] ?? "rotate-0";
      return DIRECTION_ICON.replace("<svg ", `<svg class="${rotation}" `);
    })
    .join("");
}
