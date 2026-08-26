import type { Request, Response, TabSummary } from "../shared/messages";
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
    // Page zoom is not readable from a content script: devicePixelRatio folds
    // it together with the display's scale factor. The overlay needs it to hold
    // its size while the page around it grows.
    case "tabs.zoom":
      return { ok: true, zoom: await chrome.tabs.getZoom(tab.id) };
    case "tabs.activate":
      await chrome.tabs.update(request.tabId, { active: true });
      return { ok: true };
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
