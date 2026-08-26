# Write Click

Chrome extension for mouse gestures. Hold the trigger, draw a stroke, get a tab or page command.
Draws over every page from a closed shadow root, so the host page's CSS and scripts cannot see or
restyle the overlay.

## Status

Phase 1: scaffold. Content script mounts, Tailwind loads into the shadow root, trigger defaults
resolve per platform. No gestures yet.

## Trigger

The trigger is stored per device, because the native context menu does not fire at the same time on
every OS:

| Platform | `contextmenu` fires on | Default trigger | Why |
| --- | --- | --- | --- |
| Windows | mouseup | right button, no modifier | Drift is known before the menu opens, so the menu can be suppressed only when the pointer actually moved. |
| macOS, Linux | mousedown | right button + `Alt` | The menu would open before any drift exists. A modifier is readable at mousedown, so `preventDefault` stays conditional and the plain right-click keeps its native menu. |

A keyboard-only trigger (hold a key, move the mouse) is also supported and never touches the context
menu at all. `Control` is never a default modifier: on macOS it is right-click emulation.

## Develop

```bash
npm run dev        # watch build, auto-reloads the unpacked extension
npm run build      # src/ -> dist/
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # oxfmt
```

Load `dist/` as an unpacked extension at `chrome://extensions`.
