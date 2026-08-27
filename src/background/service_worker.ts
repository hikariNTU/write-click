import type { Request, Response, TabGroupSummary, TabSummary } from "../shared/messages";
import { loadSettings, migrate, saveLocal } from "../shared/settings";
import { priorStateKey, runTabCommand } from "./tab-commands";

const NO_GROUP = -1;

function summarize(tab: chrome.tabs.Tab, ownWindowId: number): TabSummary | undefined {
  if (tab.id === undefined) return undefined;
  const summary: TabSummary = {
    id: tab.id,
    index: tab.index,
    title: tab.title ?? tab.url ?? "",
    url: tab.url ?? "",
    favIconUrl: tab.favIconUrl,
    active: tab.active === true,
    pinned: tab.pinned === true,
    audible: tab.audible === true,
    muted: tab.mutedInfo?.muted === true,
    windowId: tab.windowId,
    ownWindow: tab.windowId === ownWindowId,
  };
  if (tab.groupId !== undefined && tab.groupId !== NO_GROUP) summary.groupId = tab.groupId;
  return summary;
}

/**
 * The tabs the grid may list.
 *
 * Incognito never mixes with the rest, in either direction. A gesture drawn in
 * a normal window must not put private tabs on screen — the extension only sees
 * them at all if the user has allowed it in incognito — and a gesture drawn in
 * a private window listing every ordinary tab is the same surprise the other way
 * round. Each side sees its own.
 *
 * `windowType: "normal"` keeps devtools windows and app popups out; neither has
 * a tab strip worth switching through.
 */
async function listTabs(sender: chrome.tabs.Tab, allWindows: boolean): Promise<chrome.tabs.Tab[]> {
  const query: chrome.tabs.QueryInfo = allWindows
    ? { windowType: "normal" }
    : { windowId: sender.windowId };
  const tabs = await chrome.tabs.query(query);
  const secret = sender.incognito === true;
  return tabs.filter((tab) => (tab.incognito === true) === secret);
}

/**
 * The groups the listed tabs belong to. Read one by one rather than through
 * `tabGroups.query({})`, which would also hand back groups in windows nothing
 * on screen came from.
 */
async function groupsOf(
  tabs: readonly chrome.tabs.Tab[],
): Promise<Record<number, TabGroupSummary>> {
  // Absent whenever the running extension does not carry the `tabGroups`
  // permission — most often a build loaded from before it was added. The tab
  // list is the feature and the group colours are decoration on top of it, so
  // losing them must not take the list down with them.
  const api = chrome.tabGroups as typeof chrome.tabGroups | undefined;
  if (!api) return {};

  // `groupId` is absent, not `-1`, on a browser with no tab groups at all, and
  // `tabGroups.get(undefined)` is a rejected promise per gesture. Guarded the
  // same way `summarize` guards it.
  const ids = [
    ...new Set(
      tabs
        .map((tab) => tab.groupId)
        .filter((id): id is number => id !== undefined && id !== NO_GROUP),
    ),
  ];
  const groups: Record<number, TabGroupSummary> = {};
  await Promise.all(
    ids.map(async (id) => {
      // A group can be dissolved between the tab query and this one.
      const group = await api.get(id).catch(() => undefined);
      if (!group) return;
      groups[id] = {
        id,
        title: group.title || undefined,
        color: group.color,
        collapsed: group.collapsed === true,
      };
    }),
  );
  return groups;
}

/**
 * Own window first, then the others in a stable order, and each window's tabs
 * in strip order. The grid draws them in exactly this order, so the sort is the
 * layout.
 */
function order(a: TabSummary, b: TabSummary): number {
  if (a.ownWindow !== b.ownWindow) return a.ownWindow ? -1 : 1;
  if (a.windowId !== b.windowId) return a.windowId - b.windowId;
  return a.index - b.index;
}

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<Response> {
  const tab = sender.tab;
  if (!tab || tab.id === undefined) return { ok: false, error: "no sender tab" };

  switch (request.type) {
    case "command":
      await runTabCommand(request.id, tab);
      return { ok: true };
    case "tabs.list": {
      const tabs = await listTabs(tab, request.allWindows);
      return {
        ok: true,
        tabs: tabs
          .map((entry) => summarize(entry, tab.windowId))
          .filter((entry): entry is TabSummary => entry !== undefined)
          .toSorted(order),
        groups: await groupsOf(tabs),
      };
    }
    case "page.info":
      return { ok: true, url: tab.url ?? "", title: tab.title ?? "" };
    // Page zoom is not readable from a content script: devicePixelRatio folds
    // it together with the display's scale factor. The overlay needs it to hold
    // its size while the page around it grows.
    case "tabs.zoom":
      return { ok: true, zoom: await chrome.tabs.getZoom(tab.id) };
    case "tabs.activate": {
      const target = await chrome.tabs.update(request.tabId, { active: true });
      // Activating a tab in a window that is not in front changes nothing the
      // user can see. Raising the window is the other half of the pick.
      if (target && target.windowId !== tab.windowId) {
        await chrome.windows.update(target.windowId, { focused: true });
      }
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

// A window that is gone is never coming back to a state, and its note in
// session storage would otherwise sit there until the browser closes.
chrome.windows.onRemoved.addListener((windowId) => {
  void chrome.storage.session.remove(priorStateKey(windowId));
});

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[write-click] installed", details.reason);
  void migrate();
});

/**
 * The one keyboard shortcut, and it ships with no key of its own: every
 * combination worth having is taken by Chrome or by a site, and a shortcut the
 * extension chose for the user is a shortcut they have to find and undo. It is
 * assigned from chrome://extensions/shortcuts.
 *
 * Turning gestures off is what someone reaches for when a stroke is fighting a
 * web app, and reaching for it with the mouse means drawing a gesture — which
 * is the thing that is not working.
 */
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "toggle-enabled") return;
  void loadSettings().then(async ({ local }) => saveLocal({ enabled: !local.enabled }));
});
