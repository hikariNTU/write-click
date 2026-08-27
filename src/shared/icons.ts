import add from "../icons/material/add.svg?raw";
import arrowBack from "../icons/material/arrow_back.svg?raw";
import zoomReset from "../icons/material/center_focus_weak.svg?raw";
import chevronLeft from "../icons/material/chevron_left.svg?raw";
import chevronRight from "../icons/material/chevron_right.svg?raw";
import duplicate from "../icons/material/content_copy.svg?raw";
import fullscreen from "../icons/material/fullscreen.svg?raw";
import keep from "../icons/material/keep.svg?raw";
import newWindow from "../icons/material/select_window_2.svg?raw";
import stopCircle from "../icons/material/stop_circle.svg?raw";
import tabCloseInactive from "../icons/material/tab_close_inactive.svg?raw";
import mute from "../icons/material/volume_off.svg?raw";
import zoomIn from "../icons/material/zoom_in.svg?raw";
import zoomOut from "../icons/material/zoom_out.svg?raw";
import arrowForward from "../icons/material/arrow_forward.svg?raw";
import help from "../icons/material/help.svg?raw";
import doubleDown from "../icons/material/keyboard_double_arrow_down.svg?raw";
import doubleLeft from "../icons/material/keyboard_double_arrow_left.svg?raw";
import doubleRight from "../icons/material/keyboard_double_arrow_right.svg?raw";
import doubleUp from "../icons/material/keyboard_double_arrow_up.svg?raw";
import globe from "../icons/material/public.svg?raw";
import block from "../icons/material/block.svg?raw";
import backup from "../icons/material/package_2.svg?raw";
import download from "../icons/material/download.svg?raw";
import upload from "../icons/material/upload.svg?raw";
import cached from "../icons/material/cached.svg?raw";
import checkCircle from "../icons/material/check_circle.svg?raw";
import close from "../icons/material/close.svg?raw";
import trash from "../icons/material/delete.svg?raw";
import draw from "../icons/material/draw.svg?raw";
import gridView from "../icons/material/grid_view.svg?raw";
import language from "../icons/material/language.svg?raw";
import minimize from "../icons/material/minimize.svg?raw";
import mouse from "../icons/material/mouse.svg?raw";
import openInNew from "../icons/material/open_in_new.svg?raw";
import palette from "../icons/material/palette.svg?raw";
import restartAlt from "../icons/material/restart_alt.svg?raw";
import refresh from "../icons/material/refresh.svg?raw";
import settings from "../icons/material/settings.svg?raw";
import swipe from "../icons/material/swipe.svg?raw";
import swapHoriz from "../icons/material/swap_horiz.svg?raw";
import restore from "../icons/material/restore_from_trash.svg?raw";
import tabCloseRight from "../icons/material/tab_close_right.svg?raw";
import translate from "../icons/material/translate.svg?raw";
import tabClose from "../icons/material/tab_close.svg?raw";
import alignBottom from "../icons/material/vertical_align_bottom.svg?raw";
import alignTop from "../icons/material/vertical_align_top.svg?raw";
import bookmarks from "../icons/material/bookmarks.svg?raw";
import collapseAll from "../icons/material/collapse_all.svg?raw";
import code from "../icons/material/code.svg?raw";
import east from "../icons/material/east.svg?raw";
import extension from "../icons/material/extension.svg?raw";
import firstPage from "../icons/material/first_page.svg?raw";
import groupAdd from "../icons/material/group_add.svg?raw";
import groupRemove from "../icons/material/group_remove.svg?raw";
import history from "../icons/material/history.svg?raw";
import lastPage from "../icons/material/last_page.svg?raw";
import link from "../icons/material/link.svg?raw";
import playlistRemove from "../icons/material/playlist_remove.svg?raw";
import print from "../icons/material/print.svg?raw";
import title from "../icons/material/title.svg?raw";
import west from "../icons/material/west.svg?raw";
import volumeUp from "../icons/material/volume_up.svg?raw";
import type { CommandId } from "../shared/commands";
import brand from "../icons/write-click.svg?raw";
import type { Direction } from "./recognizer";

/**
 * Material Symbols Rounded, vendored into src/icons/material by
 * scripts/sync-icons.mjs
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
  // Chevrons step through the strip; the plain arrows are history, which is
  // what they mean everywhere else in a browser.
  "app.options": prepare(settings),
  "tab.next": prepare(chevronRight),
  "tab.prev": prepare(chevronLeft),
  "nav.back": prepare(arrowBack),
  "nav.forward": prepare(arrowForward),
  "nav.stop": prepare(stopCircle),
  "tab.new": prepare(add),
  "tab.duplicate": prepare(duplicate),
  "tab.closeOthers": prepare(tabCloseInactive),
  "tab.togglePin": prepare(keep),
  "tab.toggleMute": prepare(mute),
  "tab.detach": prepare(newWindow),
  "window.new": prepare(newWindow),
  "window.fullscreen": prepare(fullscreen),
  "zoom.in": prepare(zoomIn),
  "zoom.out": prepare(zoomOut),
  "zoom.reset": prepare(zoomReset),
  "tab.close": prepare(tabClose),
  "tab.reopen": prepare(restore),
  "tab.closeRight": prepare(tabCloseRight),
  // Material Symbols ships no left-hand twin, so the right one is mirrored.
  "tab.closeLeft": prepare(tabCloseRight).replace("<svg ", '<svg class="scale-x-[-1]" '),
  "tab.first": prepare(doubleLeft),
  "tab.last": prepare(doubleRight),
  "window.minimize": prepare(minimize),
  "tab.reload": prepare(refresh),
  "tab.reloadHard": prepare(cached),
  "page.up": prepare(doubleUp),
  "page.down": prepare(doubleDown),
  "page.top": prepare(alignTop),
  // Compass arrows move a tab; the chevrons above only change which one is
  // active, and the two pairs have to be told apart at a glance.
  "tab.moveLeft": prepare(west),
  "tab.moveRight": prepare(east),
  "tab.moveToStart": prepare(firstPage),
  "tab.moveToEnd": prepare(lastPage),
  "tab.closeDuplicates": prepare(playlistRemove),
  // The same glyph as the per-tab mute: one is the other applied to everything,
  // and the labels carry the difference.
  "tab.muteAll": prepare(mute),
  "tab.group": prepare(groupAdd),
  "tab.ungroup": prepare(groupRemove),
  "group.collapseOthers": prepare(collapseAll),
  "open.history": prepare(history),
  "open.downloads": prepare(download),
  "open.bookmarks": prepare(bookmarks),
  "open.extensions": prepare(extension),
  "page.viewSource": prepare(code),
  "page.copyUrl": prepare(link),
  "page.copyTitle": prepare(title),
  "page.print": prepare(print),
  "page.end": prepare(alignBottom),
};

export const UNKNOWN_ICON = prepare(help);

/**
 * The extension's own mark. Unlike the glyphs it keeps its own gradients, so it
 * is embedded as authored — no currentColor rewrite.
 */
export const BRAND_ICON = brand;

/** Icons for the options page and the popup, not for any gesture. */
export const UI_ICONS = {
  trigger: prepare(mouse),
  gestures: prepare(swipe),
  chords: prepare(swapHoriz),
  overlay: prepare(palette),
  sites: prepare(language),
  language: prepare(translate),
  grid: prepare(gridView),
  draw: prepare(draw),
  clear: prepare(close),
  remove: prepare(trash),
  reset: prepare(restartAlt),
  saved: prepare(checkCircle),
  settings: prepare(settings),
  openInNew: prepare(openInNew),
  blocked: prepare(block),
  backup: prepare(backup),
  copy: prepare(duplicate),
  export: prepare(download),
  import: prepare(upload),
  audible: prepare(volumeUp),
  muted: prepare(mute),
} as const;

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
