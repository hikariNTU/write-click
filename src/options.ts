import { COMMANDS } from "./shared/commands";
import type { CommandId } from "./shared/commands";
import { COMMAND_ICONS, strokeChipsHtml } from "./shared/icons";
import { quantize } from "./shared/recognizer";
import type { Point } from "./shared/recognizer";
import {
  bind,
  defaultLocalSettings,
  defaultSyncSettings,
  loadSettings,
  saveLocal,
  saveSync,
  strokeFor,
  unbind,
} from "./shared/settings";
import type { LocalSettings, SyncSettings } from "./shared/settings";
import { detectPlatform, menuFiresOnMouseDown } from "./shared/trigger";
import type { Modifier, Trigger } from "./shared/trigger";
import { BUTTON, FIELD, card, el, row, select, toggle } from "./ui";

const platform = detectPlatform();
let sync: SyncSettings;
let local: LocalSettings;

const saved = document.querySelector<HTMLElement>("#saved");
let savedTimer = 0;

function flashSaved(): void {
  if (!saved) return;
  saved.style.opacity = "1";
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => (saved.style.opacity = "0"), 1200);
}

async function patchSync(patch: Partial<SyncSettings>): Promise<void> {
  sync = { ...sync, ...patch };
  await saveSync(patch);
  flashSaved();
  render();
}

async function patchLocal(patch: Partial<LocalSettings>): Promise<void> {
  local = { ...local, ...patch };
  await saveLocal(patch);
  flashSaved();
  render();
}

/* ---------------------------------------------------------------- trigger */

const BUTTONS = [
  { value: "2", label: "Right button" },
  { value: "1", label: "Middle button" },
  { value: "0", label: "Left button" },
] as const;

const MODIFIERS = [
  { value: "", label: "No modifier" },
  { value: "Alt", label: platform === "macos" ? "Option" : "Alt" },
  { value: "Shift", label: "Shift" },
  { value: "Control", label: "Control" },
  { value: "Meta", label: platform === "macos" ? "Command" : "Meta" },
] as const;

/**
 * Explains what the current trigger does to the native context menu, which is
 * the one thing about this setting that surprises people. See docs/SPEC.md §3.
 */
function triggerWarning(trigger: Trigger): string | undefined {
  if (trigger.kind === "key") return undefined;
  if (trigger.button !== 2) return undefined;
  if (!menuFiresOnMouseDown()) {
    return "The native context menu still opens on a plain right-click; it is only suppressed once you have actually drawn.";
  }
  if (trigger.modifier) {
    return "A plain right-click keeps its native context menu — only the modified one is taken over.";
  }
  return "On this platform the context menu opens on mouse-down, so a bare right button suppresses it entirely. Shift+right-click still forces it. Pick a modifier to keep the menu.";
}

function triggerCard(): HTMLElement {
  const section = card(
    "Trigger",
    "What you hold to draw. Stored for this device only, since the context menu behaves differently per platform.",
  );

  const kind = select(
    [
      { value: "button", label: "Mouse button" },
      { value: "key", label: "Keyboard key" },
    ],
    local.trigger.kind,
    (value) => {
      void patchLocal({
        trigger:
          value === "button" ? { kind: "button", button: 2 } : { kind: "key", code: "Space" },
      });
    },
  );
  section.append(row("Hold", kind));

  if (local.trigger.kind === "button") {
    const trigger = local.trigger;
    section.append(
      row(
        "Button",
        select(BUTTONS, String(trigger.button) as "0" | "1" | "2", (value) => {
          void patchLocal({
            trigger: { ...trigger, button: Number(value) as 0 | 1 | 2 },
          });
        }),
      ),
      row(
        "Modifier",
        select(MODIFIERS, (trigger.modifier ?? "") as Modifier | "", (value) => {
          const next: Trigger = { kind: "button", button: trigger.button };
          if (value) next.modifier = value as Modifier;
          void patchLocal({ trigger: next });
        }),
        "Held together with the button.",
      ),
    );
  } else {
    const code = local.trigger.code;
    const capture = el("button", FIELD + " min-w-40 text-left", `${code} — click to change`);
    capture.type = "button";
    capture.addEventListener("click", () => {
      capture.textContent = "Press any key…";
      window.addEventListener(
        "keydown",
        (event) => {
          event.preventDefault();
          void patchLocal({ trigger: { kind: "key", code: event.code } });
        },
        { capture: true, once: true },
      );
    });
    section.append(
      row("Key", capture, "Hold this key and move the mouse. Never touches the context menu."),
    );
  }

  const warning = triggerWarning(local.trigger);
  if (warning) {
    section.append(
      el(
        "p",
        "mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200",
        warning,
      ),
    );
  }
  return section;
}

/* --------------------------------------------------------------- gestures */

function chips(stroke: string): HTMLElement {
  const holder = el("div", "flex items-center gap-1 text-slate-300 [&>svg]:h-3.5 [&>svg]:w-3.5");
  if (stroke) holder.innerHTML = strokeChipsHtml(stroke);
  else holder.append(el("span", "text-[11px] italic text-slate-500", "unbound"));
  return holder;
}

/**
 * Records a stroke the same way the content script does — same `quantize`, so
 * what you draw here is exactly what will match on a page.
 */
function drawPad(onDone: (stroke: string) => void, onCancel: () => void): HTMLElement {
  const pad = el(
    "div",
    "mt-2 grid h-32 cursor-crosshair place-items-center rounded-xl border border-dashed " +
      "border-emerald-300/40 bg-emerald-400/5 text-[11px] text-emerald-200/80",
    "Draw here — hold any mouse button and move. Esc to cancel.",
  );
  let points: Point[] = [];
  let drawing = false;

  pad.addEventListener("pointerdown", (event) => {
    drawing = true;
    points = [{ x: event.clientX, y: event.clientY }];
    pad.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  pad.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    points.push({ x: event.clientX, y: event.clientY });
    pad.textContent = quantize(points) || "…";
  });
  pad.addEventListener("pointerup", () => {
    drawing = false;
    onDone(quantize(points));
  });
  pad.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") onCancel();
    },
    { once: true },
  );
  return pad;
}

function gestureRow(command: CommandId): HTMLElement {
  const stroke = strokeFor(sync.gestures, command) ?? "";
  const wrapper = el("div", "border-b border-white/5 py-3 last:border-0");
  const line = el("div", "flex items-center gap-3");

  const tile = el(
    "div",
    "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300 [&>svg]:h-5 [&>svg]:w-5",
  );
  tile.innerHTML = COMMAND_ICONS[command];

  const label = el("div", "min-w-0 flex-1");
  label.append(
    el("div", "text-[13px] font-medium text-slate-200", COMMANDS[command].label),
    el("div", "mt-0.5 font-mono text-[10px] text-slate-500", command),
  );

  const edit = el("button", BUTTON, "Draw");
  edit.type = "button";
  const clear = el("button", BUTTON, "Clear");
  clear.type = "button";
  clear.addEventListener(
    "click",
    () => void patchSync({ gestures: unbind(sync.gestures, command) }),
  );

  edit.addEventListener("click", () => {
    edit.disabled = true;
    wrapper.append(
      drawPad(
        (drawn) => {
          if (!drawn) {
            render();
            return;
          }
          const taken = sync.gestures[drawn];
          void patchSync({ gestures: bind(sync.gestures, command, drawn) }).then(() => {
            if (taken && taken !== command) {
              notice(`${drawn} taken from “${COMMANDS[taken].label}”, which is now unbound.`);
            }
          });
        },
        () => render(),
      ),
    );
  });

  line.append(tile, label, chips(stroke), edit, clear);
  wrapper.append(line);
  return wrapper;
}

function gesturesCard(): HTMLElement {
  const section = card(
    "Gestures",
    "One stroke per command. Drawing a stroke that is already taken moves it, leaving the old command unbound.",
  );
  for (const command of Object.keys(COMMANDS) as CommandId[]) section.append(gestureRow(command));
  return section;
}

/* ---------------------------------------------------------------- overlay */

function overlayCard(): HTMLElement {
  const section = card("Overlay", "How the trail, the readout and the tab grid look.");

  const color = el(
    "input",
    "h-8 w-14 cursor-pointer rounded border border-white/10 bg-transparent",
  );
  color.type = "color";
  color.value = sync.trail.color;
  color.addEventListener("change", () => {
    void patchSync({ trail: { ...sync.trail, color: color.value } });
  });

  const width = el("input", "w-40 accent-emerald-400");
  width.type = "range";
  width.min = "2";
  width.max = "10";
  width.value = String(sync.trail.width);
  width.addEventListener("change", () => {
    void patchSync({ trail: { ...sync.trail, width: Number(width.value) } });
  });

  const columns = el("input", FIELD + " w-20");
  columns.type = "number";
  columns.min = "2";
  columns.max = "8";
  columns.value = String(sync.grid.columns);
  columns.addEventListener("change", () => {
    void patchSync({ grid: { ...sync.grid, columns: Number(columns.value) } });
  });

  const hold = el("input", FIELD + " w-24");
  hold.type = "number";
  hold.min = "0";
  hold.max = "1000";
  hold.step = "20";
  hold.value = String(sync.grid.holdMs);
  hold.addEventListener("change", () => {
    void patchSync({ grid: { ...sync.grid, holdMs: Number(hold.value) } });
  });

  section.append(
    row("Trail colour", color),
    row("Trail thickness", width),
    row(
      "Show the readout",
      toggle(sync.trail.showLabel, (value) => {
        void patchSync({ trail: { ...sync.trail, showLabel: value } });
      }),
      "Names the command the current stroke matches.",
    ),
    row(
      "Show the tab grid",
      toggle(sync.grid.enabled, (value) => {
        void patchSync({ grid: { ...sync.grid, enabled: value } });
      }),
      "Appears while the trigger is held; click a tile to switch tabs.",
    ),
    row("Grid columns", columns),
    row(
      "Grid delay",
      hold,
      "Milliseconds before the grid appears, so quick strokes do not flash it.",
    ),
  );
  return section;
}

/* ------------------------------------------------------------------ sites */

function sitesCard(): HTMLElement {
  const section = card(
    "Disabled sites",
    "Gestures are off on these origins. Add the current site from the toolbar popup.",
  );

  section.append(
    row(
      "Gestures on this device",
      toggle(local.enabled, (value) => void patchLocal({ enabled: value })),
    ),
  );

  if (sync.disabledOrigins.length === 0) {
    section.append(el("p", "pt-2 text-[11px] italic text-slate-500", "No sites disabled."));
    return section;
  }

  for (const origin of sync.disabledOrigins) {
    const remove = el("button", BUTTON, "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      void patchSync({
        disabledOrigins: sync.disabledOrigins.filter((entry) => entry !== origin),
      });
    });
    section.append(row(origin, remove));
  }
  return section;
}

/* ----------------------------------------------------------------- notice */

function notice(text: string): void {
  const node = el(
    "div",
    "fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900/95 " +
      "px-4 py-2.5 text-xs text-slate-200 shadow-2xl backdrop-blur-[6px]",
    text,
  );
  document.body.append(node);
  setTimeout(() => node.remove(), 3200);
}

/* ----------------------------------------------------------------- render */

function mount(id: string, content: HTMLElement): void {
  document.querySelector<HTMLElement>(`#${id}`)?.replaceChildren(content);
}

function render(): void {
  mount("trigger", triggerCard());
  mount("gestures", gesturesCard());
  mount("overlay", overlayCard());
  mount("sites", sitesCard());
}

document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => {
  void (async () => {
    await saveSync(defaultSyncSettings());
    await saveLocal(defaultLocalSettings());
    ({ sync, local } = await loadSettings());
    flashSaved();
    render();
    notice("Everything is back to defaults.");
  })();
});

void (async () => {
  ({ sync, local } = await loadSettings());
  render();
})();
