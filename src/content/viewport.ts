/**
 * The layout viewport, in CSS pixels, in both rendering modes.
 *
 * `document.documentElement.clientWidth/clientHeight` is the layout viewport
 * only in standards mode. In quirks mode — any page served without a doctype,
 * of which there are still plenty — those properties report the root element's
 * own box, which on a long page is the whole document: measured at 3016 against
 * an `innerHeight` of 739. The overlay sizes its canvas bitmap and budgets its
 * panels from this number, so reading the document instead of the window drew
 * the stroke offset from the cursor and let the tab grid overrun its share of
 * the window and slide under the gesture list.
 *
 * `innerWidth`/`innerHeight` are deliberately not used: they count a classic
 * scrollbar that the overlay's own fixed boxes do not reach across, and sizing
 * the trail's bitmap from them drifts everything drawn to the left of the
 * cursor — by nothing at the left edge and by the whole scrollbar at the right.
 * The client box of the right element has neither problem. See docs/SPEC.md
 * §7.4.
 */
export function viewport(): { width: number; height: number } {
  // `body` can still be null: the content script runs at `document_start`.
  const root =
    (document.compatMode === "BackCompat" ? document.body : document.documentElement) ??
    document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}
