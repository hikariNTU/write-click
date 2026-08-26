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
