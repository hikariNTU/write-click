/**
 * What the user holds down to draw a gesture. Stored per device in
 * chrome.storage.sync, so the same account can use a bare right button on
 * Windows and a modified one on macOS.
 */
export type Modifier = "Alt" | "Control" | "Meta" | "Shift";

export type Trigger =
  /** Hold a mouse button, optionally with a modifier key. */
  | { kind: "button"; button: 0 | 1 | 2; modifier?: Modifier }
  /** Hold a keyboard key and move the mouse. Never touches the context menu. */
  | { kind: "key"; code: string };

/**
 * Windows fires `contextmenu` on mouseup, so a bare right button can be
 * suppressed after the fact, once we know the pointer actually moved.
 * macOS and Linux fire it on mousedown, before any drift exists, so the
 * default there pairs the button with a modifier we can read at mousedown.
 * `Control` is deliberately avoided: on macOS it is right-click emulation.
 */
export function defaultTrigger(platform: string = detectPlatform()): Trigger {
  if (platform === "windows") return { kind: "button", button: 2 };
  return { kind: "button", button: 2, modifier: "Alt" };
}

export type Platform = "windows" | "macos" | "linux" | "other";

export function detectPlatform(): Platform {
  const raw = navigator.userAgentData?.platform ?? navigator.platform;
  if (/win/i.test(raw)) return "windows";
  if (/mac/i.test(raw)) return "macos";
  if (/linux|x11|cros/i.test(raw)) return "linux";
  return "other";
}

/** True when the native context menu arrives on mousedown rather than mouseup. */
export function menuFiresOnMouseDown(platform: Platform = detectPlatform()): boolean {
  return platform !== "windows";
}
