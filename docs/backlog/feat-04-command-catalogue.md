# FEAT-04 — Command catalogue gaps

- **Status:** ongoing
- **Priority:** medium — each item is small; together they are most of what a competitor lists
- **Area:** `src/shared/commands.ts`, `src/background/tab-commands.ts`
- **Found:** 2026-08-27, repo review

Everything here is cheap. None of it needs a new architecture, and most of it is one API call.
Each ships **unbound**, per the rule in SPEC §5.

## Clipboard

- `page.copyUrl`, `page.copyTitle` — content commands, `navigator.clipboard.writeText`.
  (Link and image URLs belong with `feat-03-context-targets.md`.)

## Chrome's own pages

- `open.history`, `open.downloads`, `open.bookmarks`, `open.extensions` — one
  `chrome.tabs.create({ url: "chrome://…" })` each.

## Tab groups — the permission is granted and only ever read

`tabGroups` is in the manifest and the code only calls `get`. The write side is free:

- `tab.group` / `tab.ungroup` — `chrome.tabs.group({ tabIds })`, `chrome.tabs.ungroup`
- `group.collapseOthers` — `chrome.tabGroups.update(id, { collapsed: true })`

## Moving tabs

- `tab.moveLeft`, `tab.moveRight`, `tab.moveToStart`, `tab.moveToEnd` —
  `chrome.tabs.move`. Distinct from `tab.first`/`tab.last`, which _activate_ rather than move, and
  the two are easy to confuse in the options list, so the labels have to work harder than usual
  (see `docs/wording.md`).

## Bulk

- `tab.closeDuplicates` — group by normalized URL, keep the leftmost, respect the pinned rule the
  other bulk closers use (`tabsOnSide` in `src/shared/tabs.ts` is the precedent: one helper, shared
  with the readout, so the count shown and the tabs closed cannot disagree)
- `tab.muteAll`

## Page

- `page.print` — `window.print()`, content command
- `page.viewSource` — `chrome.tabs.create({ url: "view-source:" + url })`

## Manifest `commands`

No keyboard shortcut exists for anything. At minimum a toggle for `local.enabled`, which is the
switch someone reaches for when a gesture is fighting a web app.

## Still correctly absent

Home page and bookmark toggling. Chrome exposes no API for either — SPEC §5 already records this
and it should stay recorded.
