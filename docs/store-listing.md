# Chrome Web Store listing

Copy-paste source for the dashboard. Keep it in sync with the extension: the
listing is reviewed against what the code actually does.

Limits enforced by the dashboard: name 75 characters, short description 132,
detailed description 16,000, each permission justification 1,000.

---

## English (en) — default locale

### Name

```
Write Click
```

### Short description

```
Draw mouse gestures to switch, close and reopen tabs, scroll pages, and pick any open tab from a grid.
```

### Detailed description

```
Write Click turns a held mouse button into a drawing surface. Hold the trigger, draw a short stroke, release, and the command runs.

WHAT IT DOES

• Switch tabs — draw left or right for the previous or next tab, and longer strokes for the leftmost or rightmost one.
• Close tabs — close the current tab, every tab to the right, or every tab to the left. The readout names the exact number that will close before you release, and pinned tabs are never counted.
• Reopen what you closed, in order.
• Move around the page — scroll a screen at a time, or jump to the top or the bottom. Gestures work inside frames, and the page you drew on is the page that scrolls.
• Navigate — back, forward, reload, reload without cache.
• Tab grid — while the trigger is held, every open tab appears as a tile with its title, site and icon. Click one to switch to it, and the stroke drawn underneath is discarded. The gesture list sits below the grid, so the reference is on screen at the moment you need it.

THE TRIGGER IS YOURS

The context menu behaves differently on each platform, so the trigger is chosen per device rather than synced. On Windows the right button alone is the default: the menu is suppressed only once you have actually drawn, so an ordinary right-click still opens it. On macOS and Linux the menu opens the moment the button goes down, so the default there pairs the right button with Alt, leaving a plain right-click untouched. Any mouse button, any modifier, or a keyboard key that never touches the context menu at all — whichever you prefer. Shift and right-click always forces the native menu through.

EVERY GESTURE IS REBINDABLE

Rebind by drawing. The settings page recognises strokes with the same code the page does, so what you draw there is what will match later. Assigning a stroke that is already in use transfers it and leaves the previous command unassigned, and says so.

DESIGNED TO STAY OUT OF THE WAY

The trail, the readout and the tab grid live in a closed shadow root, so no page can restyle them and none of their styles can leak into the page. The overlay ignores pointer events except on the tiles you can click. Gestures can be switched off for individual sites from the toolbar popup, or entirely on one device.

PRIVACY

Write Click makes no network requests, contains no analytics, and sends nothing anywhere. Your settings are stored by Chrome and synced to your own account if you have sync switched on. Tab titles and URLs are read only to draw the tab grid, and only while it is open.

Available in English and 繁體中文.
```

### Category

```
Workflow & Planning
```

---

## 繁體中文 (zh-TW)

### Name

```
Write Click 手勢
```

### Short description

```
以滑鼠手勢切換、關閉與復原分頁，捲動頁面，並由分頁格線直接選取任一已開啟的分頁。
```

### Detailed description

```
Write Click 將按住的滑鼠按鍵轉為繪製區域。按住觸發鍵、畫出短筆畫、放開，指令即執行。

功能

• 切換分頁：向左或向右繪製，切換至上一個或下一個分頁；較長的筆畫可切換至最左側或最右側的分頁。
• 關閉分頁：關閉目前分頁、右側所有分頁或左側所有分頁。放開前，指令提示會顯示實際將關閉的數量，且不包含已釘選的分頁。
• 依序復原已關閉的分頁。
• 頁面捲動：一次捲動一個畫面，或直接捲動至頂端與底部。手勢在內嵌框架中同樣可用，繪製所在的頁面即為捲動的頁面。
• 瀏覽操作：上一頁、下一頁、重新載入、重新載入並略過快取。
• 分頁格線：按住觸發鍵時，所有已開啟的分頁會以項目形式顯示，含標題、網站與圖示。點選任一項目即可切換，且其下方所繪製的筆畫會被捨棄。手勢清單位於格線下方，需要時即在畫面上。

觸發鍵可自行選擇

各平台的右鍵選單行為不同，因此觸發鍵僅儲存於本裝置，不跨裝置同步。在 Windows 上預設為單獨使用滑鼠右鍵：僅在完成筆畫後才會攔截選單，因此一般的右鍵點選仍可開啟選單。在 macOS 與 Linux 上，選單於按下按鍵時即開啟，因此預設搭配 Alt 鍵，一般的右鍵點選不受影響。亦可選擇任一滑鼠按鍵、任一輔助鍵，或完全不影響右鍵選單的鍵盤按鍵。Shift 加右鍵一律可強制開啟系統選單。

所有手勢均可重新指派

以繪製方式重新指派。設定頁面採用與網頁相同的辨識程式碼，因此於設定頁面所繪製的筆畫，即為日後實際比對的筆畫。指派已被使用的筆畫時，該筆畫會轉移，原指令將變為未指派，並顯示提示。

不干擾原有操作

軌跡、指令提示與分頁格線置於封閉的 shadow root 中，網頁無法變更其樣式，其樣式亦不會影響網頁。除可點選的項目外，疊層不接收指標事件。可由工具列彈出視窗針對個別網站停用手勢，或於單一裝置整體停用。

隱私權

Write Click 不發送任何網路請求，不含任何分析工具，亦不將任何資料傳送至外部。設定由 Chrome 儲存，若已啟用同步功能，則同步至使用者本人的帳戶。分頁標題與網址僅用於繪製分頁格線，且僅於格線顯示期間讀取。

提供英文與繁體中文介面。
```

---

## Privacy practices tab

### Single purpose

```
Write Click has one purpose: to run browser and page commands from mouse gestures drawn by the user. A content script observes pointer input to recognise the stroke and draws the overlay that shows what it matched; the service worker carries out the resulting tab command.
```

### Permission justifications

**tabs**

```
Gesture commands act on tabs: switch to the previous, next, leftmost or rightmost tab; close the current tab, the tabs to the right, or the tabs to the left; duplicate, pin, mute, reload, or move a tab to a new window. The tab grid additionally reads the title, URL and favicon of the open tabs in the current window in order to draw a tile for each one, and to show how many tabs a bulk-close would affect before the user releases the button. This data is rendered on screen and never stored or transmitted.
```

**sessions**

```
Used by a single command, "Reopen closed tab", which calls chrome.sessions.restore to reopen the most recently closed tab in order. No session data is read, stored or transmitted.
```

**storage**

```
Stores the user's settings: the gesture-to-command map, overlay appearance, tab grid options, chosen language, and the list of sites where gestures are switched off. The trigger (which button or key starts a gesture) is stored in local storage rather than sync, because the correct default differs per platform. Nothing else is stored.
```

**host permissions (<all_urls>)**

```
A gesture can be started on any page, so the content script has to run everywhere in order to observe pointer input and draw the trail, the readout and the tab grid. It runs at document_start and in all frames, because a gesture drawn inside an iframe must scroll that frame rather than the top document. The script reads no page content: it uses pointer coordinates only, and its overlay is confined to a closed shadow root. Users can disable gestures for individual sites from the toolbar popup, or disable the extension on a device from the same popup.
```

**remote code**

```
No. All code is bundled in the package. Nothing is fetched or evaluated at runtime.
```

### Data usage disclosure

Tick nothing. The extension collects no user data, so all categories are left
unchecked, and the three certification statements can be accepted as written:
data is not sold, not used for unrelated purposes, and not used to determine
creditworthiness.

Justification if asked:

```
Write Click makes no network requests of any kind. It contains no analytics, no telemetry and no remote endpoint. Tab titles and URLs are read through the tabs API solely to render the tab grid on screen while it is open, and are never stored or transmitted. User settings are held in chrome.storage and, if the user has Chrome Sync enabled, synced by Chrome to that user's own account.
```

---

## Before uploading

1. `npm run bump 1.0.0` — 0.1.0 reads as unfinished on a public listing.
2. `npm run build`
3. `npm run pack:linux` (or `pack:windows`) to produce `dist.zip`.
4. Upload `dist.zip`. The store reads `default_locale`, so both listings can be
   filled in from the language selector in the dashboard.

### Screenshots to capture (1280x800)

The store shows up to five. In order of usefulness:

1. The tab grid open over a real page, with the trail drawn and the cheatsheet
   visible underneath.
2. The readout mid-gesture on a destructive command, showing the tab count —
   "Close 3 tabs to the right".
3. The settings page, gesture section, with the draw pad open.
4. The settings page, trigger section, showing the platform warning.
5. The toolbar popup on a site with gestures switched off.
