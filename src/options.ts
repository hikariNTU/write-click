import { backupFilename, buildBackup, parseBackup } from "./shared/backup";
import { COMMANDS } from "./shared/commands";
import type { CommandId } from "./shared/commands";
import {
  LOCALES,
  applyStaticMessages,
  dynamic,
  formatNumber,
  formatPercent,
  setLocale,
  t,
} from "./shared/i18n";
import type { LanguageSetting, Localized, MessageKey } from "./shared/i18n";
import { BRAND_ICON, COMMAND_ICONS, UI_ICONS, strokeChipsHtml } from "./shared/icons";
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
import { menuFiresOnMouseDown } from "./shared/trigger";
import { modifierName, mouseGlyph, triggerName, triggerPad } from "./trigger-ui";
import type { Modifier, Trigger } from "./shared/trigger";
import { BUTTON, FIELD, card, el, icon, iconButton, paintIcon, row, select, toggle } from "./ui";

let sync: SyncSettings;
let local: LocalSettings;

const saved = document.querySelector<HTMLElement>("#saved");
let savedTimer = 0;

/**
 * Window listeners owned by a control that is on the page right now: the key
 * capture and the draw pad.
 *
 * Both used `{ once: true }`, which removes a listener after it fires and never
 * if it does not. A key capture the user walked away from stayed armed and
 * rebound the trigger to the next keystroke anywhere on the page; the pad's
 * Escape handler spent its one shot on whatever key came first. Aborted at the
 * top of `render`, which replaces the whole DOM under them.
 */
let transient = new AbortController();

function endTransient(): void {
  transient.abort();
  transient = new AbortController();
}

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
  { value: "2", label: t("options_trigger_button_right") },
  { value: "1", label: t("options_trigger_button_middle") },
  { value: "0", label: t("options_trigger_button_left") },
] as const;

const MODIFIERS = [
  { value: "", label: t("modifier_none") },
  { value: "Alt", label: modifierName("Alt") },
  { value: "Shift", label: modifierName("Shift") },
  { value: "Control", label: modifierName("Control") },
  { value: "Meta", label: modifierName("Meta") },
] as const;

/**
 * Explains what the current trigger does to the native context menu, which is
 * the one thing about this setting that surprises people. See docs/SPEC.md §3.
 * Only shown for a trigger the two-way choice cannot name: the presets carry
 * the same fact as their own description, where it is a statement of what was
 * picked rather than a warning about it.
 */
function triggerWarning(trigger: Trigger): Localized | undefined {
  if (trigger.kind === "key") return undefined;
  if (trigger.button !== 2) return undefined;
  if (!menuFiresOnMouseDown()) return t("options_warn_menu_mouseup");
  if (trigger.modifier) return t("options_warn_menu_modified");
  return t("options_warn_menu_suppressed");
}

/**
 * The decision behind the three raw controls is one question — keep the native
 * context menu or not — and these are its two answers. Everything else is a
 * trigger someone went looking for, and lives under Advanced.
 *
 * `Alt` is the modifier both presets use: it is the platform default already,
 * and `Control` is right-click emulation on macOS.
 */
type Preset = "plain" | "modified";

const PRESET_MODIFIER: Modifier = "Alt";

function presetOf(trigger: Trigger): Preset | undefined {
  if (trigger.kind !== "button" || trigger.button !== 2) return undefined;
  if (!trigger.modifier) return "plain";
  return trigger.modifier === PRESET_MODIFIER ? "modified" : undefined;
}

function presetTile(
  preset: Preset,
  chosen: Preset | undefined,
  title: Localized,
  description: Localized,
): HTMLElement {
  const on = preset === chosen;
  const tile = el(
    "label",
    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors " +
      (on
        ? "border-emerald-300/40 bg-emerald-400/10"
        : "border-white/10 bg-white/[0.02] hover:border-white/20"),
  );

  const radio = el("input", "mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-400");
  radio.type = "radio";
  radio.name = "trigger-preset";
  radio.checked = on;
  radio.addEventListener("change", () => {
    const trigger: Trigger = { kind: "button", button: 2 };
    if (preset === "modified") trigger.modifier = PRESET_MODIFIER;
    void patchLocal({ trigger });
  });

  const text = el("div", "min-w-0");
  text.append(
    el("div", "text-[13px] font-medium text-mist-200", title),
    el("div", "mt-0.5 text-[11px] leading-relaxed text-mist-400", description),
  );
  tile.append(radio, text);
  return tile;
}

/** The raw Hold / Button / Modifier controls, which live behind the fold. */
function triggerControls(): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const kind = select(
    [
      { value: "button", label: t("options_trigger_kind_button") },
      { value: "key", label: t("options_trigger_kind_key") },
    ],
    local.trigger.kind,
    (value) => {
      void patchLocal({
        trigger:
          value === "button" ? { kind: "button", button: 2 } : { kind: "key", code: "Space" },
      });
    },
  );
  rows.push(row(t("options_trigger_hold"), kind));

  if (local.trigger.kind === "button") {
    const trigger = local.trigger;
    rows.push(
      row(
        t("options_trigger_button"),
        select(BUTTONS, String(trigger.button) as "0" | "1" | "2", (value) => {
          void patchLocal({
            trigger: { ...trigger, button: Number(value) as 0 | 1 | 2 },
          });
        }),
      ),
      row(
        t("options_trigger_modifier"),
        select(MODIFIERS, (trigger.modifier ?? "") as Modifier | "", (value) => {
          const next: Trigger = { kind: "button", button: trigger.button };
          if (value) next.modifier = value as Modifier;
          void patchLocal({ trigger: next });
        }),
        t("options_trigger_modifier_hint"),
      ),
    );
    return rows;
  }

  const code = local.trigger.code;
  // The button carries the key code alone. Any label around it would have to
  // grow with the translation, and this row already sits beside a fixed-width
  // control column.
  const capture = el("button", FIELD + " min-w-32 text-left", dynamic(code));
  capture.type = "button";
  let armed = false;
  const disarm = (): void => {
    armed = false;
    endTransient();
    capture.textContent = dynamic(code);
  };
  capture.addEventListener("click", () => {
    // A second click is the way out for anyone who armed it by accident.
    if (armed) {
      disarm();
      return;
    }
    armed = true;
    capture.textContent = t("options_trigger_key_press");
    window.addEventListener(
      "keydown",
      (event) => {
        event.preventDefault();
        // Escape leaves rather than binds. Binding it would take the
        // recognizer's own cancel key with it, and it is what anyone who
        // changed their mind will press; Tab is the same reflex.
        if (event.key === "Escape" || event.key === "Tab") {
          disarm();
          return;
        }
        armed = false;
        void patchLocal({ trigger: { kind: "key", code: event.code } });
      },
      { capture: true, signal: transient.signal },
    );
    // Clicking anything else on the page is the third way out.
    capture.addEventListener("blur", disarm, { signal: transient.signal });
  });
  rows.push(row(t("options_trigger_key"), capture, t("options_trigger_key_hint")));
  return rows;
}

function triggerCard(): HTMLElement {
  const section = card(t("options_trigger_title"), t("options_trigger_desc"), UI_ICONS.trigger);
  const chosen = presetOf(local.trigger);

  const choice = el("div", "flex items-center gap-5");
  const tiles = el("div", "min-w-0 flex-1 space-y-2");
  tiles.append(
    el("p", "text-[11px] font-medium text-mist-400", t("options_trigger_preset_question")),
    presetTile(
      "plain",
      chosen,
      t("options_trigger_preset_plain"),
      menuFiresOnMouseDown()
        ? t("options_trigger_preset_plain_desc")
        : t("options_trigger_preset_plain_desc_mouseup"),
    ),
    presetTile(
      "modified",
      chosen,
      t("options_trigger_preset_modified", modifierName(PRESET_MODIFIER)),
      t("options_trigger_preset_modified_desc"),
    ),
  );
  if (chosen === undefined) {
    tiles.append(
      el(
        "p",
        "text-[11px] leading-relaxed text-mist-500",
        t("options_trigger_custom", triggerName(local.trigger)),
      ),
    );
  }
  // The glyph sits beside the choice rather than under it: it is a picture of
  // whichever row is selected, and reading the two together is the point.
  choice.append(tiles, mouseGlyph(local.trigger, "h-28 w-28"));
  section.append(choice);

  // The welcome page is opened once, on install, and is the only place the
  // trigger is taught from cold — so there has to be a way back to it.
  const tryHead = el("div", "mt-5 flex items-center justify-between gap-4");
  tryHead.append(
    el("p", "text-[11px] font-medium text-mist-400", t("options_trigger_try")),
    iconButton(UI_ICONS.openInNew, t("options_trigger_welcome"), () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    }),
  );
  section.append(tryHead, triggerPad(local.trigger, sync.gestures, sync.trail, transient.signal));

  // Not "Advanced": a middle button or a keyboard key is nobody's expert
  // setting, it is the third answer to the question above, and a fold that
  // calls it advanced tells the reader they are doing something unusual. It is
  // folded because it is rarer, and named for what is inside it.
  const other = el("details", "mt-5 border-t border-white/5 pt-3");
  // Open for a trigger neither preset can name, because the controls that set
  // it are the only place it is visible.
  other.open = chosen === undefined;
  other.append(
    el(
      "summary",
      "cursor-pointer text-[11px] font-medium text-mist-400 transition-colors hover:text-mist-200",
      t("options_trigger_other"),
    ),
    ...triggerControls(),
  );

  const warning = chosen === undefined ? triggerWarning(local.trigger) : undefined;
  if (warning) {
    other.append(el("p", "mt-2 text-[11px] leading-relaxed text-mist-500", warning));
  }
  section.append(other);
  return section;
}

/* --------------------------------------------------------------- gestures */

function chips(stroke: string): HTMLElement {
  const holder = el("div", "flex items-center gap-1 text-mist-300 [&>svg]:h-3.5 [&>svg]:w-3.5");
  if (stroke) holder.innerHTML = strokeChipsHtml(stroke);
  else holder.append(el("span", "text-[11px] italic text-mist-500", t("options_gestures_unbound")));
  return holder;
}

/**
 * Records a stroke the same way the content script does — same `quantize`, so
 * what you draw here is exactly what will match on a page.
 */
function drawPad(onDone: (stroke: string) => void, onCancel: () => void): HTMLElement {
  const pad = el(
    "div",
    "mt-2 grid h-56 cursor-crosshair select-none place-items-center rounded-xl border " +
      "border-dashed border-emerald-300/40 bg-emerald-400/5 px-6 text-center text-[11px] " +
      "text-emerald-200/80",
    t("options_gestures_pad"),
  );
  let points: Point[] = [];
  let drawing = false;

  const inside = (event: PointerEvent): boolean => {
    const box = pad.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  };

  const stop = (message: string): void => {
    drawing = false;
    points = [];
    pad.textContent = message;
  };

  pad.addEventListener("pointerdown", (event) => {
    drawing = true;
    points = [{ x: event.clientX, y: event.clientY }];
    // Capture keeps the stroke coherent if the pointer skims a child element,
    // but it also suppresses pointerleave, so leaving is detected by geometry
    // below rather than by a boundary event that will never arrive.
    pad.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  pad.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    if (!inside(event)) {
      // A stroke that wandered out of the pad was not drawn under the same
      // conditions it will be recognized in, so it is thrown away rather than
      // half-recorded.
      stop(t("options_gestures_pad_void"));
      return;
    }
    points.push({ x: event.clientX, y: event.clientY });
    pad.textContent = quantize(points) || "…";
  });
  pad.addEventListener("pointerup", (event) => {
    if (!drawing) return;
    drawing = false;
    if (!inside(event)) {
      stop(t("options_gestures_pad_void"));
      return;
    }
    onDone(quantize(points));
  });
  pad.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") onCancel();
    },
    { signal: transient.signal },
  );
  return pad;
}

function gestureRow(command: CommandId): HTMLElement {
  const stroke = strokeFor(sync.gestures, command) ?? "";
  const wrapper = el("div", "border-b border-white/5 py-3 last:border-0");
  const line = el("div", "flex items-center gap-3");

  const tile = el(
    "div",
    "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-mist-300 [&>svg]:h-5 [&>svg]:w-5",
  );
  tile.innerHTML = COMMAND_ICONS[command];

  const label = el("div", "min-w-0 flex-1");
  label.append(
    el("div", "text-[13px] font-medium text-mist-200", t(COMMANDS[command].labelKey)),
    el("div", "mt-0.5 font-mono text-[10px] text-mist-500", dynamic(command)),
  );

  const edit = el("button", BUTTON, t("options_gestures_draw"));
  edit.type = "button";
  const clear = el("button", BUTTON, t("options_gestures_clear"));
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
              notice(t("options_gestures_taken", drawn, t(COMMANDS[taken].labelKey)));
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
  const section = card(t("options_gestures_title"), t("options_gestures_desc"), UI_ICONS.gestures);
  for (const command of Object.keys(COMMANDS) as CommandId[]) section.append(gestureRow(command));
  return section;
}

/* --------------------------------------------------------------- language */

function languageCard(): HTMLElement {
  const section = card(t("options_language_title"), t("options_language_desc"), UI_ICONS.language);
  const options = [{ value: "auto" as const, label: t("options_language_auto") }, ...LOCALES];
  section.append(
    row(
      t("options_language_label"),
      select(options, sync.language, (value) => {
        // Applied before the re-render inside patchSync, so the page is already
        // in the new language when it repaints.
        setLocale(value as LanguageSetting);
        void patchSync({ language: value as LanguageSetting });
      }),
    ),
  );
  return section;
}

/* ---------------------------------------------------------------- overlay */

function overlayCard(): HTMLElement {
  const section = card(t("options_overlay_title"), t("options_overlay_desc"), UI_ICONS.overlay);

  const color = el(
    "input",
    "h-8 w-14 cursor-pointer rounded border border-white/10 bg-transparent",
  );
  color.type = "color";
  color.value = sync.trail.color;
  color.addEventListener("change", () => {
    void patchSync({ trail: { ...sync.trail, color: color.value } });
  });

  // Per device, so it lives in local settings: it answers a display, not a
  // preference, and the same account sees both a laptop and a desktop monitor.
  const scaleValue = el(
    "span",
    "w-12 shrink-0 text-right text-[11px] tabular-nums text-mist-400",
    dynamic(formatPercent(local.uiScale)),
  );
  const scale = el("input", "w-40 accent-emerald-400");
  scale.type = "range";
  scale.min = "50";
  scale.max = "200";
  scale.step = "5";
  scale.value = String(Math.round(local.uiScale * 100));
  scale.addEventListener("input", () => {
    scaleValue.textContent = formatPercent(Number(scale.value) / 100);
  });
  scale.addEventListener("change", () => {
    void patchLocal({ uiScale: Number(scale.value) / 100 });
  });
  const scaleControl = el("div", "flex items-center gap-3");
  scaleControl.append(scale, scaleValue);

  const width = el("input", "w-40 accent-emerald-400");
  width.type = "range";
  width.min = "2";
  width.max = "10";
  width.value = String(sync.trail.width);
  width.addEventListener("change", () => {
    void patchSync({ trail: { ...sync.trail, width: Number(width.value) } });
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
    row(t("options_overlay_scale"), scaleControl, t("options_overlay_scale_hint")),
    row(
      t("options_overlay_trail"),
      toggle(sync.trail.show, (value) => {
        void patchSync({ trail: { ...sync.trail, show: value } });
      }),
      t("options_overlay_trail_hint"),
    ),
    row(t("options_overlay_color"), color),
    row(t("options_overlay_width"), width),
    row(
      t("options_overlay_readout"),
      toggle(sync.trail.showLabel, (value) => {
        void patchSync({ trail: { ...sync.trail, showLabel: value } });
      }),
      t("options_overlay_readout_hint"),
    ),
    row(
      t("options_overlay_grid"),
      toggle(sync.grid.enabled, (value) => {
        void patchSync({ grid: { ...sync.grid, enabled: value } });
      }),
      t("options_overlay_grid_hint"),
    ),
    row(
      t("options_overlay_allWindows"),
      toggle(sync.grid.allWindows, (value) => {
        void patchSync({ grid: { ...sync.grid, allWindows: value } });
      }),
      t("options_overlay_allWindows_hint"),
    ),
    row(
      t("options_overlay_release"),
      toggle(sync.grid.pickOnRelease, (value) => {
        void patchSync({ grid: { ...sync.grid, pickOnRelease: value } });
      }),
      t("options_overlay_release_hint"),
    ),
    row(
      t("options_overlay_cheatsheet"),
      toggle(sync.grid.cheatsheet, (value) => {
        void patchSync({ grid: { ...sync.grid, cheatsheet: value } });
      }),
      t("options_overlay_cheatsheet_hint"),
    ),
    row(
      t("options_overlay_size"),
      select(
        [
          { value: "compact", label: t("options_size_compact") },
          { value: "normal", label: t("options_size_normal") },
          { value: "large", label: t("options_size_large") },
        ] as const,
        sync.grid.size,
        (value) => void patchSync({ grid: { ...sync.grid, size: value } }),
      ),
      t("options_overlay_size_hint"),
    ),
    row(t("options_overlay_delay"), hold, t("options_overlay_delay_hint")),
  );
  return section;
}

/* ----------------------------------------------------------------- backup */

/**
 * Hands the file to the browser through an object URL and a synthetic click.
 *
 * `chrome.downloads` would need a permission the extension asks for nothing
 * else, and this page is an ordinary tab, so the ordinary way works.
 */
function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = el("a", "hidden");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Held until the download has certainly started; revoking it in the same task
  // cancels the download in Chromium.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The text of a backup, whether it came from a file or from the textarea. */
async function restore(text: string): Promise<void> {
  const result = parseBackup(text);
  if (!result.ok) {
    notice(
      t(result.reason === "json" ? "options_backup_failed_json" : "options_backup_failed_shape"),
    );
    return;
  }

  // Written whole, not patched: an import restores a state, and merging would
  // leave behind whatever the file does not mention.
  await saveSync(result.sync);
  await saveLocal(result.local);
  ({ sync, local } = await loadSettings());
  setLocale(sync.language);
  flashSaved();
  render();
  if (result.dropped === 0) {
    notice(t("options_backup_done"));
    return;
  }
  const key = result.dropped === 1 ? "options_backup_dropped_one" : "options_backup_dropped_other";
  notice(t(key, formatNumber(result.dropped)));
}

function backupText(): string {
  return JSON.stringify(buildBackup(sync, local, chrome.runtime.getManifest().version), null, 2);
}

function backupCard(): HTMLElement {
  const section = card(t("options_backup_title"), t("options_backup_desc"), UI_ICONS.backup);

  const exportButton = iconButton(UI_ICONS.export, t("options_backup_export_action"), () => {
    download(backupText(), backupFilename());
  });

  // The input is what actually opens the picker; the button is only what it
  // looks like, because a file input cannot be styled to match the rest.
  const input = el("input", "hidden");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    // Cleared first: picking the same file twice in a row fires no change event
    // otherwise, which reads as an import that silently did nothing.
    input.value = "";
    if (file) void file.text().then(restore);
  });
  const importButton = iconButton(UI_ICONS.import, t("options_backup_import_action"), () =>
    input.click(),
  );

  // The whole backup, in the open. A file is the better backup, but moving one
  // between two computers means moving a file; this is the same contents in a
  // form that survives a clipboard, and it is also the only way to see what an
  // export actually contains before sending it anywhere.
  const area = el(
    "textarea",
    FIELD + " mt-2 h-40 w-full resize-y font-mono text-[11px] leading-relaxed",
  );
  area.value = backupText();
  area.spellcheck = false;
  area.autocapitalize = "off";
  area.setAttribute("autocorrect", "off");

  const copy = iconButton(UI_ICONS.copy, t("options_backup_copy"), () => {
    void navigator.clipboard.writeText(area.value).then(
      () => notice(t("options_backup_copied")),
      // Denied, or no focus. Selecting it leaves the keyboard shortcut, which
      // needs no permission and always works.
      () => area.select(),
    );
  });
  const apply = iconButton(UI_ICONS.import, t("options_backup_apply"), () => {
    void restore(area.value);
  });
  const actions = el("div", "mt-3 flex items-center gap-2");
  actions.append(copy, apply);

  const text = el("div", "border-t border-white/5 pt-4");
  text.append(
    el("div", "text-[13px] font-medium text-mist-200", t("options_backup_text")),
    el("div", "mt-0.5 text-[11px] text-mist-500", t("options_backup_text_hint")),
    area,
    actions,
  );

  section.append(
    row(t("options_backup_export"), exportButton, t("options_backup_export_hint")),
    row(t("options_backup_import"), importButton, t("options_backup_import_hint")),
    input,
    text,
  );
  return section;
}

/* ------------------------------------------------------------------ sites */

function sitesCard(): HTMLElement {
  const section = card(t("options_sites_title"), t("options_sites_desc"), UI_ICONS.sites);

  section.append(
    row(
      t("options_sites_device"),
      toggle(local.enabled, (value) => void patchLocal({ enabled: value })),
    ),
  );

  if (sync.disabledOrigins.length === 0) {
    const empty = el("div", "flex items-center gap-2 pt-2 text-[11px] italic text-mist-500");
    empty.append(
      icon(UI_ICONS.blocked, "h-3.5 w-3.5"),
      document.createTextNode(t("options_sites_none")),
    );
    section.append(empty);
    return section;
  }

  for (const origin of sync.disabledOrigins) {
    const remove = iconButton(UI_ICONS.remove, t("options_sites_remove"), () => {
      void patchSync({
        disabledOrigins: sync.disabledOrigins.filter((entry) => entry !== origin),
      });
    });
    section.append(row(dynamic(origin), remove));
  }
  return section;
}

/* ----------------------------------------------------------------- notice */

function notice(text: Localized): void {
  const node = el(
    "div",
    "fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-white/10 bg-mist-900/95 " +
      "px-4 py-2.5 text-xs text-mist-200 shadow-2xl backdrop-blur-[6px]",
    text,
  );
  document.body.append(node);
  setTimeout(() => node.remove(), 3200);
}

/* -------------------------------------------------------------------- nav */

/**
 * The page, in order. One table drives both the cards and the side navigation,
 * so a new section cannot appear in one and be forgotten in the other, and the
 * link is guaranteed to carry the same name as the card it scrolls to.
 */
const SECTIONS: readonly {
  id: string;
  titleKey: MessageKey;
  glyph: string;
  card: () => HTMLElement;
}[] = [
  {
    id: "language",
    titleKey: "options_language_title",
    glyph: UI_ICONS.language,
    card: languageCard,
  },
  { id: "trigger", titleKey: "options_trigger_title", glyph: UI_ICONS.trigger, card: triggerCard },
  {
    id: "gestures",
    titleKey: "options_gestures_title",
    glyph: UI_ICONS.gestures,
    card: gesturesCard,
  },
  { id: "overlay", titleKey: "options_overlay_title", glyph: UI_ICONS.overlay, card: overlayCard },
  { id: "sites", titleKey: "options_sites_title", glyph: UI_ICONS.sites, card: sitesCard },
  { id: "backup", titleKey: "options_backup_title", glyph: UI_ICONS.backup, card: backupCard },
];

const NAV_LINK =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors";
const NAV_IDLE = "text-mist-400 hover:bg-white/5 hover:text-mist-200";
const NAV_CURRENT = "bg-emerald-400/10 text-emerald-200";

/** How far down the viewport a section has to reach to count as the one in view. */
const NAV_THRESHOLD = 140;

function navList(): HTMLElement {
  const nav = el("nav", "flex flex-col gap-1");
  nav.setAttribute("aria-label", t("options_nav_label"));
  for (const section of SECTIONS) {
    const link = el("a", `${NAV_LINK} ${NAV_IDLE}`);
    link.href = `#${section.id}`;
    link.dataset.section = section.id;
    link.append(icon(section.glyph, "h-4 w-4"), el("span", "truncate", t(section.titleKey)));
    nav.append(link);
  }
  return nav;
}

/**
 * The section in view: the last one whose top has passed the threshold. The
 * final card can be shorter than the viewport, so scrolling to the bottom never
 * brings its top far enough up — hitting the end of the page selects it
 * outright, or the last link would be unreachable.
 */
function currentSection(): string {
  let current = SECTIONS[0]?.id ?? "";
  for (const { id } of SECTIONS) {
    const node = document.querySelector<HTMLElement>(`#${id}`);
    if (node && node.getBoundingClientRect().top <= NAV_THRESHOLD) current = id;
  }
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
    current = SECTIONS.at(-1)?.id ?? current;
  }
  return current;
}

function paintNav(): void {
  const active = currentSection();
  for (const link of document.querySelectorAll<HTMLElement>("[data-section]")) {
    const on = link.dataset.section === active;
    link.className = `${NAV_LINK} ${on ? NAV_CURRENT : NAV_IDLE}`;
    if (on) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
}

let navFrame = 0;
window.addEventListener(
  "scroll",
  () => {
    if (navFrame) return;
    navFrame = requestAnimationFrame(() => {
      navFrame = 0;
      paintNav();
    });
  },
  { passive: true },
);

/* ----------------------------------------------------------------- render */

function mount(id: string, content: HTMLElement): void {
  document.querySelector<HTMLElement>(`#${id}`)?.replaceChildren(content);
}

function render(): void {
  endTransient();
  for (const section of SECTIONS) mount(section.id, section.card());
  mount("nav", navList());
  paintNav();
}

document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => {
  void (async () => {
    await saveSync(defaultSyncSettings());
    await saveLocal(defaultLocalSettings());
    ({ sync, local } = await loadSettings());
    flashSaved();
    render();
    notice(t("options_resetDone"));
  })();
});

function decorateChrome(): void {
  applyStaticMessages();
  const brand = document.querySelector<HTMLElement>("#brand");
  if (brand) brand.innerHTML = BRAND_ICON;

  paintIcon("#saved-icon", UI_ICONS.saved);
  paintIcon("#reset-icon", UI_ICONS.reset);
}

void (async () => {
  ({ sync, local } = await loadSettings());
  setLocale(sync.language);
  decorateChrome();
  render();
})();
