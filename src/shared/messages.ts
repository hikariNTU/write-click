import type { CommandId } from "./commands";
import { COMMANDS } from "./commands";

export type BackgroundCommandId = {
  [K in CommandId]: (typeof COMMANDS)[K]["where"] extends "background" ? K : never;
}[CommandId];

export type ContentCommandId = Exclude<CommandId, BackgroundCommandId>;

export interface TabSummary {
  id: number;
  index: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  windowId: number;
  /** The window the gesture is being drawn in, which the grid lists first. */
  ownWindow: boolean;
  /** Absent for an ungrouped tab. Keys into the `groups` map of the response. */
  groupId?: number;
}

/**
 * A tab group, as much of one as a picker needs. Chrome allows an untitled
 * group, which shows as its colour alone in the tab strip and does the same
 * here.
 */
export interface TabGroupSummary {
  id: number;
  title?: string;
  color: string;
  collapsed: boolean;
}

export type Request =
  | { type: "command"; id: BackgroundCommandId }
  | { type: "tabs.list"; allWindows: boolean }
  | { type: "tabs.activate"; tabId: number }
  | { type: "tabs.zoom" };

export type Response =
  | { ok: true }
  | { ok: true; tabs: TabSummary[]; groups: Record<number, TabGroupSummary> }
  | { ok: true; zoom: number }
  | { ok: false; error: string };

export function isBackgroundCommand(id: CommandId): id is BackgroundCommandId {
  return COMMANDS[id].where === "background";
}

/**
 * Never rejects. A sleeping, reloaded or crashed service worker makes
 * sendMessage throw "Could not establish connection", and an unhandled
 * rejection here would make features fail with an empty console.
 */
export async function send(request: Request): Promise<Response> {
  try {
    const response = (await chrome.runtime.sendMessage(request)) as Response | undefined;
    return response ?? { ok: false, error: "no response from the service worker" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
