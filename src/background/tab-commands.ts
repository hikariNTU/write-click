import type { BackgroundCommandId } from "../shared/messages";

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
  const doomed = tabs
    .filter(
      (tab) =>
        !tab.pinned && (side === "right" ? tab.index > activeIndex : tab.index < activeIndex),
    )
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
    case "tab.close": {
      if (sender.id !== undefined) await chrome.tabs.remove(sender.id);
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
