import type { BackgroundCommandId } from "../shared/messages";
import { tabsOnSide } from "../shared/tabs";

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
      const state = current.state === "fullscreen" ? "normal" : "fullscreen";
      await chrome.windows.update(windowId, { state });
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
    default: {
      // Exhaustive: adding a background command must break this build.
      const unreachable: never = id;
      throw new Error(`unhandled command ${String(unreachable)}`);
    }
  }
}
