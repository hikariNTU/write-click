import type { MessageKey } from "./i18n";

/** Every action a stroke can be bound to. See docs/SPEC.md §5. */
export const COMMANDS = {
  "tab.next": { labelKey: "cmd_tab_next", where: "background" },
  "tab.prev": { labelKey: "cmd_tab_prev", where: "background" },
  "tab.close": { labelKey: "cmd_tab_close", where: "background" },
  "tab.reopen": { labelKey: "cmd_tab_reopen", where: "background" },
  "tab.closeRight": { labelKey: "cmd_tab_closeRight", where: "background" },
  "tab.closeLeft": { labelKey: "cmd_tab_closeLeft", where: "background" },
  "tab.first": { labelKey: "cmd_tab_first", where: "background" },
  "tab.last": { labelKey: "cmd_tab_last", where: "background" },
  "window.minimize": { labelKey: "cmd_window_minimize", where: "background" },
  "tab.reload": { labelKey: "cmd_tab_reload", where: "background" },
  "tab.reloadHard": { labelKey: "cmd_tab_reloadHard", where: "background" },
  "tab.new": { labelKey: "cmd_tab_new", where: "background" },
  "tab.duplicate": { labelKey: "cmd_tab_duplicate", where: "background" },
  "tab.closeOthers": { labelKey: "cmd_tab_closeOthers", where: "background" },
  "tab.togglePin": { labelKey: "cmd_tab_togglePin", where: "background" },
  "tab.toggleMute": { labelKey: "cmd_tab_toggleMute", where: "background" },
  "tab.detach": { labelKey: "cmd_tab_detach", where: "background" },
  "nav.back": { labelKey: "cmd_nav_back", where: "background" },
  "nav.forward": { labelKey: "cmd_nav_forward", where: "background" },
  "nav.stop": { labelKey: "cmd_nav_stop", where: "content" },
  "window.new": { labelKey: "cmd_window_new", where: "background" },
  "window.fullscreen": { labelKey: "cmd_window_fullscreen", where: "background" },
  "zoom.in": { labelKey: "cmd_zoom_in", where: "background" },
  "zoom.out": { labelKey: "cmd_zoom_out", where: "background" },
  "zoom.reset": { labelKey: "cmd_zoom_reset", where: "background" },
  "page.up": { labelKey: "cmd_page_up", where: "content" },
  "page.down": { labelKey: "cmd_page_down", where: "content" },
  "page.top": { labelKey: "cmd_page_top", where: "content" },
  "page.end": { labelKey: "cmd_page_end", where: "content" },
  "app.options": { labelKey: "cmd_app_options", where: "background" },
} as const satisfies Record<string, { labelKey: MessageKey; where: "background" | "content" }>;

export type CommandId = keyof typeof COMMANDS;

/**
 * Order matters, so `RD` and `DR` are different strokes.
 *
 * The scheme: a single flick steps sideways through tabs, doubling back
 * (`LRL`, `RLR`) runs to that end of the strip, and a leading `R`/`L` with a
 * `D` tail closes something. Vertical strokes are inverted on purpose — `U`
 * pushes the page up, which scrolls down, the way a touch surface behaves.
 *
 * Back and forward get `DL` and `DR`, mirroring the direction they travel.
 * Other gesture products put them on a plain `L`/`R`, but those are spent on
 * tab switching here.
 *
 * `page.end` and the rest of the catalogue ship unbound: there is no short
 * stroke left that does not collide, and guessing at bindings nobody asked for
 * is worse than leaving them for the options page.
 */
export const DEFAULT_GESTURES: Record<string, CommandId> = {
  L: "tab.prev",
  R: "tab.next",
  LRL: "tab.first",
  RLR: "tab.last",
  URD: "tab.closeRight",
  ULD: "tab.closeLeft",
  RU: "page.top",
  RD: "tab.close",
  LU: "tab.reopen",
  LD: "window.minimize",
  U: "page.down",
  D: "page.up",
  UD: "tab.reload",
  UDU: "tab.reloadHard",
  DL: "nav.back",
  DR: "nav.forward",
  DU: "tab.new",
};
