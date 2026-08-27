# FEAT-03 — Nothing knows what is under the cursor

- **Status:** ongoing
- **Priority:** high — a whole missing command family
- **Area:** `src/content/page-commands.ts`, `src/shared/commands.ts`
- **Found:** 2026-08-27, repo review

## The gap

Every command in the catalogue acts on the tab, the window or the scroll position. Not one of them
looks at what the gesture was drawn _on_. The competing extensions all do, and crxMouse's headline
feature is exactly this: draw on a link, get "open in a background tab"; drag a link or a run of
selected text off the page, get "open it" or "search for it".

Missing commands in this family:

- `link.openBackground`, `link.openForeground`, `link.openWindow`
- `link.copyUrl`
- `image.open`, `image.copyUrl`
- `selection.search` — needs `chrome.search.query`, which is a new permission
- `selection.copy`

## Notes before building

- The target is already available: `page-commands.ts` calls `document.elementFromPoint(at.x, at.y)`
  for `scroller()`. The same point resolves the link or image. The gesture's **start** point is the
  right one, for the same reason scrolling uses it.
- Opening a tab is a background command; reading the element is a content one. This is the first
  command that needs both halves, so the message union grows a payload — currently
  `{ type: "command"; id }` carries no data.
- A command that only makes sense over a link needs a story for being drawn over nothing. The
  readout already has the vocabulary for this: `describe()` returns `state: "unassigned"` with its
  own label when a bound command would do nothing, which is how `tab.closeRight` reports "no tabs
  to the right".
