import type { Point } from "../shared/recognizer";

const CHANNEL = "write-click";

type Up =
  | { channel: typeof CHANNEL; dir: "up"; type: "start" | "move"; x: number; y: number }
  | { channel: typeof CHANNEL; dir: "up"; type: "end" | "cancel" };

type Down = { channel: typeof CHANNEL; dir: "down"; type: "cancel" };

function isUp(data: unknown): data is Up {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Partial<Up>;
  return message.channel === CHANNEL && message.dir === "up";
}

function isDown(data: unknown): data is Down {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Partial<Down>;
  return message.channel === CHANNEL && message.dir === "down";
}

/**
 * Where a child frame's viewport starts inside this one. The iframe element is
 * found by comparing `contentWindow`, which works across origins, and the
 * content box is the border box minus border and padding.
 */
function frameOffset(source: MessageEventSource | null): Point | undefined {
  if (!source) return undefined;
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame.contentWindow !== source) continue;
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    return {
      x:
        rect.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
      y: rect.top + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop),
    };
  }
  return undefined;
}

export interface RemoteHandlers {
  onStart(point: Point): void;
  onMove(point: Point): void;
  onEnd(): void;
  onCancel(): void;
}

export interface Bridge {
  forwardStart(point: Point): void;
  forwardMove(point: Point): void;
  forwardEnd(): void;
  forwardCancel(): void;
  /** Top frame: tell whichever frame is drawing to drop its pending command. */
  cancelRemote(): void;
}

/**
 * Relays a gesture drawn in a sub-frame up to the top frame, one hop at a time,
 * each hop adding that frame's offset. Hopping rather than posting straight to
 * `window.top` is what makes nested iframes work: only the immediate parent can
 * locate a child's iframe element and know where it sits.
 *
 * Only the drawing is relayed. Commands run in the frame that owns the trigger,
 * so a spoofed message can move a trail around but cannot make anything happen.
 */
export function createBridge(options: {
  isTop: boolean;
  onRemote: RemoteHandlers;
  /** Sub-frame: the top frame picked a tab, so this gesture is void. */
  onCancelled: () => void;
}): Bridge {
  let lastChild: MessageEventSource | null = null;

  const post = (message: Up): void => {
    if (options.isTop) return;
    window.parent.postMessage(message, "*");
  };

  const deliver = (message: Up): void => {
    switch (message.type) {
      case "start":
        options.onRemote.onStart({ x: message.x, y: message.y });
        return;
      case "move":
        options.onRemote.onMove({ x: message.x, y: message.y });
        return;
      case "end":
        options.onRemote.onEnd();
        return;
      case "cancel":
        options.onRemote.onCancel();
    }
  };

  window.addEventListener("message", (event) => {
    if (isUp(event.data)) {
      const offset = frameOffset(event.source);
      // Not one of our child frames: a page script talking to itself.
      if (!offset) return;
      lastChild = event.source;
      const message: Up =
        event.data.type === "start" || event.data.type === "move"
          ? { ...event.data, x: event.data.x + offset.x, y: event.data.y + offset.y }
          : event.data;
      if (options.isTop) deliver(message);
      else post(message);
      return;
    }

    if (isDown(event.data) && event.source === window.parent) {
      if (lastChild) (lastChild as Window).postMessage(event.data, "*");
      else options.onCancelled();
    }
  });

  return {
    forwardStart: (point) => post({ channel: CHANNEL, dir: "up", type: "start", ...point }),
    forwardMove: (point) => post({ channel: CHANNEL, dir: "up", type: "move", ...point }),
    forwardEnd: () => post({ channel: CHANNEL, dir: "up", type: "end" }),
    forwardCancel: () => post({ channel: CHANNEL, dir: "up", type: "cancel" }),
    cancelRemote: () => {
      if (lastChild)
        (lastChild as Window).postMessage({ channel: CHANNEL, dir: "down", type: "cancel" }, "*");
      lastChild = null;
    },
  };
}
