/** Every action a stroke can be bound to. See docs/SPEC.md §5. */
export const COMMANDS = {
  "tab.next": { label: "Next tab", where: "background" },
  "tab.prev": { label: "Previous tab", where: "background" },
  "tab.close": { label: "Close tab", where: "background" },
  "tab.reopen": { label: "Reopen closed tab", where: "background" },
  "tab.closeRight": { label: "Close tabs to the right", where: "background" },
  "tab.closeLeft": { label: "Close tabs to the left", where: "background" },
  "page.up": { label: "Page up", where: "content" },
  "page.down": { label: "Page down", where: "content" },
  "page.top": { label: "Scroll to top", where: "content" },
  "page.end": { label: "Scroll to bottom", where: "content" },
} as const satisfies Record<string, { label: string; where: "background" | "content" }>;

export type CommandId = keyof typeof COMMANDS;

/**
 * Order matters, so `DR` and `RD` are different strokes: `DR`/`UR` act on the
 * tab itself, `RD`/`LD` point at the side being closed.
 */
export const DEFAULT_GESTURES: Record<string, CommandId> = {
  R: "tab.next",
  L: "tab.prev",
  DR: "tab.close",
  UR: "tab.reopen",
  RD: "tab.closeRight",
  LD: "tab.closeLeft",
  U: "page.up",
  D: "page.down",
  UL: "page.top",
  DL: "page.end",
};
