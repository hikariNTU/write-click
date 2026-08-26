import arrowBack from "@material-symbols/svg-700/rounded/arrow_back.svg?raw";
import arrowForward from "@material-symbols/svg-700/rounded/arrow_forward.svg?raw";
import firstPage from "@material-symbols/svg-700/rounded/first_page.svg?raw";
import help from "@material-symbols/svg-700/rounded/help.svg?raw";
import doubleDown from "@material-symbols/svg-700/rounded/keyboard_double_arrow_down.svg?raw";
import doubleUp from "@material-symbols/svg-700/rounded/keyboard_double_arrow_up.svg?raw";
import lastPage from "@material-symbols/svg-700/rounded/last_page.svg?raw";
import globe from "@material-symbols/svg-700/rounded/public.svg?raw";
import restore from "@material-symbols/svg-700/rounded/restore_from_trash.svg?raw";
import tabClose from "@material-symbols/svg-700/rounded/tab_close.svg?raw";
import alignBottom from "@material-symbols/svg-700/rounded/vertical_align_bottom.svg?raw";
import alignTop from "@material-symbols/svg-700/rounded/vertical_align_top.svg?raw";
import type { CommandId } from "../shared/commands";
import type { Direction } from "./recognizer";

/**
 * Material Symbols Rounded, bundled at build time — an extension cannot pull
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
  "tab.closeRight": prepare(lastPage),
  "tab.closeLeft": prepare(firstPage),
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
