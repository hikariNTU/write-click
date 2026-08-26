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
}

export type Request =
  | { type: "command"; id: BackgroundCommandId }
  | { type: "tabs.list" }
  | { type: "tabs.activate"; tabId: number };

/**
 * Sent by the service worker to the tab a pick just switched to. Content
 * scripts receive it; the service worker never does.
 */
export type TabMessage = { type: "menu.suppress" };

export type Response =
  | { ok: true }
  | { ok: true; tabs: TabSummary[] }
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
