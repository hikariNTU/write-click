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
}

export type Request =
  | { type: "command"; id: BackgroundCommandId }
  | { type: "tabs.list" }
  | { type: "tabs.activate"; tabId: number };

export type Response =
  | { ok: true }
  | { ok: true; tabs: TabSummary[] }
  | { ok: false; error: string };

export function isBackgroundCommand(id: CommandId): id is BackgroundCommandId {
  return COMMANDS[id].where === "background";
}

export async function send(request: Request): Promise<Response> {
  return (await chrome.runtime.sendMessage(request)) as Response;
}
