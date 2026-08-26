/** Every action a stroke can be bound to. See docs/SPEC.md §5. */
export const COMMANDS = {
  "tab.next": { label: "Next tab", where: "background" },
  "tab.prev": { label: "Previous tab", where: "background" },
  "tab.close": { label: "Close tab", where: "background" },
  "tab.reopen": { label: "Reopen closed tab", where: "background" },
  "tab.closeRight": { label: "Close tabs to the right", where: "background" },
  "tab.closeLeft": { label: "Close tabs to the left", where: "background" },
  "tab.first": { label: "Leftmost tab", where: "background" },
  "tab.last": { label: "Rightmost tab", where: "background" },
  "window.minimize": { label: "Minimize window", where: "background" },
  "page.up": { label: "Page up", where: "content" },
  "page.down": { label: "Page down", where: "content" },
  "page.top": { label: "Scroll to top", where: "content" },
  "page.end": { label: "Scroll to bottom", where: "content" },
} as const satisfies Record<string, { label: string; where: "background" | "content" }>;

export type CommandId = keyof typeof COMMANDS;

/**
 * Order matters, so `RD` and `DR` are different strokes.
 *
 * The scheme: a single flick steps sideways through tabs, doubling back
 * (`LRL`, `RLR`) runs to that end of the strip, and a leading `R`/`L` with a
 * `D` tail closes something. Vertical strokes are inverted on purpose — `U`
 * pushes the page up, which scrolls down, the way a touch surface behaves.
 *
 * `page.end` ships unbound; there is no stroke left that does not collide.
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
};
