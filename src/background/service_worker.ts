import type { Request, Response, TabMessage, TabSummary } from "../shared/messages";
import { migrate } from "../shared/settings";
import { runTabCommand } from "./tab-commands";

function summarize(tab: chrome.tabs.Tab): TabSummary | undefined {
  if (tab.id === undefined) return undefined;
  return {
    id: tab.id,
    index: tab.index,
    title: tab.title ?? tab.url ?? "",
    url: tab.url ?? "",
    favIconUrl: tab.favIconUrl,
    active: tab.active === true,
    pinned: tab.pinned === true,
  };
}

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<Response> {
  const tab = sender.tab;
  if (!tab || tab.id === undefined) return { ok: false, error: "no sender tab" };

  switch (request.type) {
    case "command":
      await runTabCommand(request.id, tab);
      return { ok: true };
    case "tabs.list": {
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      return {
        ok: true,
        tabs: tabs
          .toSorted((a, b) => a.index - b.index)
          .map(summarize)
          .filter((entry): entry is TabSummary => entry !== undefined),
      };
    }
    case "tabs.activate": {
      // Armed before the switch, not after. The trigger button is still held,
      // and the release can land the instant the tab changes; arming afterwards
      // races that release over two more round trips.
      const notice: TabMessage = { type: "menu.suppress" };
      try {
        await chrome.tabs.sendMessage(request.tabId, notice);
      } catch {
        // A tab with no content script — a settings page, the web store — has
        // no menu of ours to suppress, and cannot be reached anyway.
      }
      await chrome.tabs.update(request.tabId, { active: true });
      return { ok: true };
    }
    default: {
      const unreachable: never = request;
      return { ok: false, error: `unhandled request ${JSON.stringify(unreachable)}` };
    }
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, respond) => {
  handle(request, sender)
    .then(respond)
    .catch((error: unknown) => respond({ ok: false, error: String(error) }));
  // Keeps the message channel open for the async handler.
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[write-click] installed", details.reason);
  void migrate();
});
