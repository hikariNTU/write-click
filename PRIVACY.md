# Privacy policy

_Write Click browser extension. Last updated: 26 August 2026._

## 一、Data collected

Write Click collects no user data. The extension performs no network requests,
contains no analytics or telemetry, and has no server component of any kind.

## 二、Data processed on the device

The following is read in order to operate, is used only to render what is shown
on screen, and is neither stored beyond the moment of use nor transmitted:

1. Pointer coordinates on the page where a gesture is drawn, used to recognise
   the stroke. No other page content is read.
2. The title, address and icon of the tabs open in the current window, used to
   draw the tab grid while it is displayed, and to state how many tabs a
   bulk-close command would affect.

## 三、Data stored

The extension's own settings are stored through the browser's extension storage:
the gesture-to-command map, overlay appearance, tab grid options, the selected
interface language, the list of sites on which gestures are disabled, and the
trigger button or key. Where the user has enabled browser synchronisation, the
browser synchronises the shared portion of these settings to that user's own
account. The developer has no access to it.

The tab grid displays each tab's icon by its address. The request for that image
is made by the browser to the site concerned, as it is when the tab itself is
displayed.

## 四、Permissions

Permissions are requested solely for the functions described above: `tabs` for
tab commands and the tab grid, `sessions` for reopening a closed tab, `storage`
for settings, and host access for the content script that observes the gesture
and draws the overlay. The extension can be disabled for individual sites, or
for an entire device, from its toolbar popup.

## 五、Contact

Questions regarding this policy may be raised as an issue in the project
repository.
