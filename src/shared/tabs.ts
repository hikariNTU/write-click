/** The parts of a tab both the background and the content script care about. */
export interface TabLike {
  index: number;
  pinned: boolean;
}

/**
 * The tabs a close-to-the-side command would remove. Shared so the count shown
 * in the readout and the tabs actually closed can never disagree — pinned tabs
 * survive, and the active tab is not included.
 */
export function tabsOnSide<T extends TabLike>(
  tabs: readonly T[],
  activeIndex: number,
  side: "left" | "right",
): T[] {
  return tabs.filter(
    (tab) => !tab.pinned && (side === "right" ? tab.index > activeIndex : tab.index < activeIndex),
  );
}

/** A tab a duplicate check can look at. `url` is absent until a tab has loaded. */
export interface UrlTabLike extends TabLike {
  url?: string;
}

/**
 * What counts as the same page.
 *
 * The fragment is dropped: `#comments` and `#top` are two places in one
 * document, and closing one of them as a duplicate of the other is what a user
 * would call a bug. The query string is kept, because it usually selects the
 * content rather than a position within it. A string that will not parse is
 * compared as it stands rather than thrown away — an unloaded tab has no URL at
 * all and can never match anything, which is the safe direction.
 */
function sameAs(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * The tabs a close-duplicates command would remove: every tab whose page is
 * already open further left. Shared with the readout for the same reason
 * `tabsOnSide` is.
 *
 * The leftmost copy survives, and pinned tabs survive whichever side they are
 * on — the same rule the bulk closers use — but a pinned tab still claims its
 * page, so an unpinned copy of a pinned tab is a duplicate.
 */
export function duplicateTabs<T extends UrlTabLike>(tabs: readonly T[]): T[] {
  const seen = new Set<string>();
  const doomed: T[] = [];
  for (const tab of tabs.toSorted((a, b) => a.index - b.index)) {
    const key = sameAs(tab.url);
    if (key === undefined) continue;
    if (seen.has(key)) {
      if (!tab.pinned) doomed.push(tab);
      continue;
    }
    seen.add(key);
  }
  return doomed;
}
