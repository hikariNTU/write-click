import type { BackgroundCommandId } from "../shared/messages";
import { duplicateTabs, tabsOnSide } from "../shared/tabs";

/**
 * Chrome's own pages, as a map rather than four near-identical cases.
 *
 * These are the canonical URLs, not the shorthands the omnibox accepts:
 * `tabs.create` does not resolve `chrome://history` to the trailing-slash form
 * the way typing it does.
 */
const CHROME_PAGES = {
  "open.history": "chrome://history/",
  "open.downloads": "chrome://downloads/",
  "open.bookmarks": "chrome://bookmarks/",
  "open.extensions": "chrome://extensions/",
} as const;

/**
 * A tab's group id is `-1` when it is in no group, and absent altogether on a
 * browser with no tab groups. Neither is something to ungroup.
 */
function inGroup(groupId: number | undefined): boolean {
  return groupId !== undefined && groupId !== -1;
}

/**
 * Where a window's pre-fullscreen state is remembered.
 *
 * Chrome reports only `"fullscreen"` while a window is there, so leaving has to
 * be told what to go back to, and `"normal"` is not a safe guess: a maximized
 * window that went fullscreen and came back was un-maximized, losing a state
 * the user never asked to leave.
 *
 * `storage.session` rather than a module-level Map. The two gestures are one
 * user action apart in intent and can be minutes apart in fact, and this worker
 * does not live that long — a Map was measured forgetting between them within
 * seconds. Session storage outlives the worker, is cleared when the browser
 * closes, never touches the disk, and rides on the `storage` permission the
 * extension already holds.
 */
export function priorStateKey(windowId: number): string {
  return `window.priorState.${windowId}`;
}

/**
 * Waits for a window to have actually left fullscreen.
 *
 * `windows.update` resolves as soon as the request is accepted, and on macOS
 * the exit is animated, so the window is still fullscreen when the call comes
 * back. A second state applied in that gap is dropped — which is why leaving
 * fullscreen and asking for `maximized` cannot be one call, and why two calls
 * back to back are not enough either. Measured: the reported state flips
 * 56–110ms after the request, and applying `maximized` the instant it flips is
 * honoured every time.
 *
 * Bounded, and gives up quietly. The window may also have been closed, in which
 * case there is nothing to restore and nothing to report.
 */
async function leftFullscreen(windowId: number): Promise<void> {
  // A poll is sequential by definition: there is nothing here to run in
  // parallel, which is what `no-await-in-loop` is for.
  /* eslint-disable no-await-in-loop */
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const window = await chrome.windows.get(windowId).catch(() => undefined);
    if (!window || window.state !== "fullscreen") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  /* eslint-enable no-await-in-loop */
}

/** Only the two states there is any point putting a window back into. */
function restorable(state: unknown): state is "normal" | "maximized" {
  return state === "normal" || state === "maximized";
}

/** Tabs of the sender's window, in strip order. */
async function siblings(windowId: number): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.toSorted((a, b) => a.index - b.index);
}

function activate(tab: chrome.tabs.Tab | undefined): Promise<unknown> | undefined {
  if (tab?.id === undefined) return undefined;
  return chrome.tabs.update(tab.id, { active: true });
}

/** Bulk closers never touch pinned tabs. docs/SPEC.md §5. */
async function closeSide(
  windowId: number,
  activeIndex: number,
  side: "left" | "right",
): Promise<void> {
  const tabs = await siblings(windowId);
  const doomed = tabsOnSide(tabs, activeIndex, side)
    .map((tab) => tab.id)
    .filter((id): id is number => id !== undefined);
  if (doomed.length > 0) await chrome.tabs.remove(doomed);
}

/**
 * Where a tab is allowed to sit. Chrome keeps the pinned tabs in a block at the
 * head of the strip and rejects a move that would put an unpinned tab among
 * them, so a move command clamps to its own half rather than throwing.
 */
function movableRange(tabs: readonly chrome.tabs.Tab[], pinned: boolean): [number, number] {
  const pinnedCount = tabs.filter((tab) => tab.pinned).length;
  return pinned ? [0, Math.max(pinnedCount - 1, 0)] : [pinnedCount, Math.max(tabs.length - 1, 0)];
}

/**
 * Opens one of Chrome's own pages beside the current tab.
 *
 * `tabs.create` is the only way in: navigating an existing tab to a `chrome://`
 * URL is refused, `tabs.create` is not.
 */
async function openPage(sender: chrome.tabs.Tab, url: string): Promise<void> {
  await chrome.tabs.create({ windowId: sender.windowId, index: sender.index + 1, url });
}

export async function runTabCommand(
  id: BackgroundCommandId,
  sender: chrome.tabs.Tab,
): Promise<void> {
  const windowId = sender.windowId;

  switch (id) {
    case "tab.next":
    case "tab.prev": {
      const tabs = await siblings(windowId);
      const at = tabs.findIndex((tab) => tab.id === sender.id);
      if (at === -1 || tabs.length < 2) return;
      const step = id === "tab.next" ? 1 : -1;
      await activate(tabs[(at + step + tabs.length) % tabs.length]);
      return;
    }
    case "tab.first":
    case "tab.last": {
      const tabs = await siblings(windowId);
      await activate(id === "tab.first" ? tabs[0] : tabs.at(-1));
      return;
    }
    case "window.minimize": {
      await chrome.windows.update(windowId, { state: "minimized" });
      return;
    }
    case "tab.reload":
    case "tab.reloadHard": {
      if (sender.id === undefined) return;
      await chrome.tabs.reload(sender.id, { bypassCache: id === "tab.reloadHard" });
      return;
    }
    case "tab.new": {
      await chrome.tabs.create({ windowId, index: sender.index + 1, active: true });
      return;
    }
    case "tab.duplicate": {
      if (sender.id !== undefined) await chrome.tabs.duplicate(sender.id);
      return;
    }
    case "tab.closeOthers": {
      const tabs = await siblings(windowId);
      const doomed = tabs
        .filter((tab) => !tab.pinned && tab.id !== sender.id)
        .map((tab) => tab.id)
        .filter((tabId): tabId is number => tabId !== undefined);
      if (doomed.length > 0) await chrome.tabs.remove(doomed);
      return;
    }
    case "tab.togglePin": {
      if (sender.id !== undefined) await chrome.tabs.update(sender.id, { pinned: !sender.pinned });
      return;
    }
    case "tab.toggleMute": {
      if (sender.id === undefined) return;
      await chrome.tabs.update(sender.id, { muted: sender.mutedInfo?.muted !== true });
      return;
    }
    case "tab.detach": {
      // A window of one: pointless, and Chrome would just close the old one.
      const tabs = await siblings(windowId);
      if (sender.id === undefined || tabs.length < 2) return;
      await chrome.windows.create({ tabId: sender.id });
      return;
    }
    case "nav.back": {
      if (sender.id !== undefined) await chrome.tabs.goBack(sender.id);
      return;
    }
    case "nav.forward": {
      if (sender.id !== undefined) await chrome.tabs.goForward(sender.id);
      return;
    }
    case "window.new": {
      await chrome.windows.create({});
      return;
    }
    case "window.fullscreen": {
      const current = await chrome.windows.get(windowId);
      const key = priorStateKey(windowId);
      if (current.state === "fullscreen") {
        const stored: unknown = (await chrome.storage.session.get(key))[key];
        await chrome.storage.session.remove(key);
        // The exit is always its own call: asking to leave fullscreen and to be
        // maximized in one update lands on `normal`, because Chrome takes the
        // window out of fullscreen and ignores the rest.
        await chrome.windows.update(windowId, { state: "normal" });
        if (stored !== "maximized") return;
        await leftFullscreen(windowId);
        await chrome.windows.update(windowId, { state: "maximized" });
        return;
      }
      // ChromeOS's locked fullscreen and a minimized window are not somewhere
      // to put a window back, so anything else clears the note rather than
      // keeping one that would be wrong.
      if (restorable(current.state)) await chrome.storage.session.set({ [key]: current.state });
      else await chrome.storage.session.remove(key);
      await chrome.windows.update(windowId, { state: "fullscreen" });
      return;
    }
    case "zoom.in":
    case "zoom.out":
    case "zoom.reset": {
      if (sender.id === undefined) return;
      if (id === "zoom.reset") {
        await chrome.tabs.setZoom(sender.id, 0);
        return;
      }
      const zoom = await chrome.tabs.getZoom(sender.id);
      const step = id === "zoom.in" ? 1.1 : 1 / 1.1;
      // Chrome clamps to its own range, but keeping it sane avoids a no-op
      // gesture that looks broken at the extremes.
      await chrome.tabs.setZoom(sender.id, Math.min(Math.max(zoom * step, 0.25), 5));
      return;
    }
    case "tab.close": {
      if (sender.id !== undefined) await chrome.tabs.remove(sender.id);
      return;
    }
    case "app.options": {
      // `openOptionsPage` focuses the tab if the page is already open, which is
      // the behaviour anyone drawing this twice expects.
      await chrome.runtime.openOptionsPage();
      return;
    }
    case "tab.reopen": {
      await chrome.sessions.restore();
      return;
    }
    case "tab.closeRight": {
      await closeSide(windowId, sender.index, "right");
      return;
    }
    case "tab.closeLeft": {
      await closeSide(windowId, sender.index, "left");
      return;
    }
    case "tab.moveLeft":
    case "tab.moveRight": {
      if (sender.id === undefined) return;
      const tabs = await siblings(windowId);
      const [low, high] = movableRange(tabs, sender.pinned === true);
      const step = id === "tab.moveRight" ? 1 : -1;
      const index = sender.index + step;
      if (index < low || index > high) return;
      await chrome.tabs.move(sender.id, { index });
      return;
    }
    case "tab.moveToStart":
    case "tab.moveToEnd": {
      if (sender.id === undefined) return;
      const tabs = await siblings(windowId);
      const [low, high] = movableRange(tabs, sender.pinned === true);
      await chrome.tabs.move(sender.id, { index: id === "tab.moveToStart" ? low : high });
      return;
    }
    case "tab.closeDuplicates": {
      const tabs = await siblings(windowId);
      const doomed = duplicateTabs(tabs)
        .map((tab) => tab.id)
        .filter((tabId): tabId is number => tabId !== undefined);
      if (doomed.length > 0) await chrome.tabs.remove(doomed);
      return;
    }
    case "tab.muteAll": {
      const tabs = await siblings(windowId);
      await Promise.all(
        tabs
          .filter((tab) => tab.id !== undefined && tab.mutedInfo?.muted !== true)
          .map(async (tab) => chrome.tabs.update(tab.id as number, { muted: true })),
      );
      return;
    }
    case "tab.group": {
      if (sender.id === undefined) return;
      await chrome.tabs.group({ tabIds: [sender.id], createProperties: { windowId } });
      return;
    }
    case "tab.ungroup": {
      // Ungrouping a tab that is in no group is an error, not a no-op.
      if (sender.id === undefined || !inGroup(sender.groupId)) return;
      await chrome.tabs.ungroup(sender.id);
      return;
    }
    case "group.collapseOthers": {
      const api = chrome.tabGroups as typeof chrome.tabGroups | undefined;
      if (!api) return;
      const groups = await api.query({ windowId });
      await Promise.all(
        groups
          .filter((group) => group.id !== sender.groupId && !group.collapsed)
          // A group can be dissolved between the query and the update.
          .map(async (group) => api.update(group.id, { collapsed: true }).catch(() => undefined)),
      );
      return;
    }
    case "open.history":
    case "open.downloads":
    case "open.bookmarks":
    case "open.extensions": {
      await openPage(sender, CHROME_PAGES[id]);
      return;
    }
    case "page.viewSource": {
      // Only a page that was fetched has a source to view, and `view-source:`
      // refuses everything else outright.
      if (!sender.url?.startsWith("http")) return;
      await openPage(sender, `view-source:${sender.url}`);
      return;
    }
    default: {
      // Exhaustive: adding a background command must break this build.
      const unreachable: never = id;
      throw new Error(`unhandled command ${String(unreachable)}`);
    }
  }
}
