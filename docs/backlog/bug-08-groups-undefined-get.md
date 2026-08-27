# BUG-08 — `groupsOf` can call `tabGroups.get(undefined)`

- **Status:** done — fixed 2026-08-27 — `undefined` filtered the way `summarize` filters it
- **Severity:** low — swallowed, noise only
- **Area:** `src/background/service_worker.ts`
- **Found:** 2026-08-27, repo review, by inspection

## Symptom

A rejected promise per gesture on browsers where `chrome.tabs.Tab` carries no `groupId` field at
all. Caught, so the tab list still comes back; it only costs a console entry and a wasted round
trip.

## Cause

```ts
const ids = [...new Set(tabs.map((tab) => tab.groupId).filter((id) => id !== NO_GROUP))];
```

The filter drops `-1` but not `undefined`. `summarize()` guards both (`tab.groupId !== undefined &&
tab.groupId !== NO_GROUP`); this path does not.

## Fix

Filter the same way `summarize` does — `(id): id is number => id !== undefined && id !== NO_GROUP`.
