import { DEFAULT_GESTURES } from "./commands";
import type { CommandId } from "./commands";
import type { LanguageSetting } from "./i18n";
import { defaultTrigger } from "./trigger";
import type { Trigger } from "./trigger";

/** How wide the tab grid's tiles are, and therefore how many fit per row. */
export type GridSize = "compact" | "normal" | "large";

/** Shared across devices. */
export interface SyncSettings {
  version: 5;
  language: LanguageSetting;
  gestures: Record<string, CommandId>;
  grid: {
    enabled: boolean;
    holdMs: number;
    size: GridSize;
    cheatsheet: boolean;
    /** Release the trigger over a tile to switch to it, without clicking. */
    pickOnRelease: boolean;
  };
  trail: {
    /** Draw the stroke at all. Off leaves the recognizer and every command running. */
    show: boolean;
    color: string;
    width: number;
    showLabel: boolean;
  };
  disabledOrigins: string[];
}

/** Per device. The trigger is deliberately never synced: see docs/SPEC.md §3. */
export interface LocalSettings {
  version: 2;
  trigger: Trigger;
  enabled: boolean;
  /**
   * How large the overlay is drawn, 1 being its designed size. Per device, and
   * deliberately so: it exists to answer a display, not a preference — the same
   * account can sit in front of a 13-inch laptop and a 32-inch 4K monitor.
   */
  uiScale: number;
}

export function defaultSyncSettings(): SyncSettings {
  return {
    version: 5,
    language: "auto",
    gestures: { ...DEFAULT_GESTURES },
    grid: { enabled: true, holdMs: 180, size: "normal", cheatsheet: true, pickOnRelease: true },
    trail: { show: true, color: "#34d399", width: 4, showLabel: true },
    disabledOrigins: [],
  };
}

export function defaultLocalSettings(): LocalSettings {
  return { version: 2, trigger: defaultTrigger(), enabled: true, uiScale: 1 };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keys whose stored value replaces the default outright instead of merging into
 * it.
 *
 * `trigger` is a discriminated union, and merging one variant into another
 * produces neither: a stored `{ kind: "button", button: 2 }` — what the options
 * page writes when the modifier is cleared — merged into a macOS default of
 * `{ kind: "button", button: 2, modifier: "Alt" }` hands back the modifier the
 * user just removed. Every other settings object is a bag of independent
 * fields, where merging is exactly what makes a newly added field appear.
 *
 * `gestures` is a map, not a bag of fields. Merging the defaults into it makes
 * every binding the user has cleared reappear on the next load, and there is no
 * way to remove one at all — a stored map is the whole map. A binding added to
 * the defaults reaches existing profiles through `migrate()`, which is where a
 * decision about somebody else's gesture map belongs.
 */
const REPLACED = new Set(["trigger", "gestures"]);

/**
 * Reads an area, filling in anything the user has never set. The merge goes one
 * level deep on purpose: settings are stored per top-level key, so a stored
 * `grid` written before a field existed would otherwise replace the defaults
 * wholesale and leave that field undefined.
 */
async function read<T extends object>(area: chrome.storage.StorageArea, defaults: T): Promise<T> {
  // Asked for by name, never by handing `get` an object of defaults.
  //
  // Chrome merges an object-valued default into the stored value itself, one
  // level deep, before returning anything: ask for `{ trigger: <default> }` and
  // a stored `{ kind: "button", button: 2 }` comes back carrying the default's
  // `modifier`. That merge happens upstream of everything here, so the only way
  // to control it is never to ask for it. A key that is not stored is simply
  // absent from the result, and the defaults below fill it in.
  const stored = await area.get(Object.keys(defaults));
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of Object.entries(stored)) {
    const fallback = merged[key];
    merged[key] =
      !REPLACED.has(key) && isPlainObject(fallback) && isPlainObject(value)
        ? { ...fallback, ...value }
        : value;
  }
  return merged as unknown as T;
}

export async function loadSettings(): Promise<{ sync: SyncSettings; local: LocalSettings }> {
  const [sync, local] = await Promise.all([
    read(chrome.storage.sync, defaultSyncSettings()),
    read(chrome.storage.local, defaultLocalSettings()),
  ]);
  return { sync, local };
}

export async function saveSync(patch: Partial<SyncSettings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export async function saveLocal(patch: Partial<LocalSettings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** The stroke currently bound to a command, if any. */
export function strokeFor(
  gestures: Record<string, CommandId>,
  command: CommandId,
): string | undefined {
  return Object.keys(gestures).find((stroke) => gestures[stroke] === command);
}

/**
 * Binds a stroke to a command, dropping whatever that command was bound to
 * before. A stroke can only mean one thing, so an existing owner loses it —
 * the caller is expected to say so.
 */
export function bind(
  gestures: Record<string, CommandId>,
  command: CommandId,
  stroke: string,
): Record<string, CommandId> {
  const next = { ...gestures };
  const previous = strokeFor(next, command);
  if (previous) delete next[previous];
  if (stroke) next[stroke] = command;
  return next;
}

export function unbind(
  gestures: Record<string, CommandId>,
  command: CommandId,
): Record<string, CommandId> {
  const next = { ...gestures };
  const previous = strokeFor(next, command);
  if (previous) delete next[previous];
  return next;
}

/**
 * Brings stored settings up to the current shape. Runs on install and on
 * update; every future version bump adds a step here rather than silently
 * reading a field that is not there.
 */
export async function migrate(): Promise<void> {
  const stored = (await chrome.storage.sync.get(null)) as Partial<SyncSettings>;
  const local = (await chrome.storage.local.get(null)) as { version?: number };
  const defaults = defaultSyncSettings();

  if (stored.version !== 5) {
    // v1 sized the grid by a fixed column count; v2 sizes it by tile width.
    // v3 added the language override, which defaults to following the browser.
    // v4 added picking on release.
    const grid = { ...defaults.grid, ...stored.grid };
    delete (grid as { columns?: number }).columns;

    // v5 added `app.options`, on the stroke it ships with. Merging the whole
    // default map back in would resurrect every binding the user has cleared,
    // so only this one command is added, and only if nothing already holds
    // either it or its stroke.
    const gestures = { ...(stored.gestures ?? defaults.gestures) };
    const spoken = Object.values(gestures).includes("app.options");
    if (!spoken && !gestures.DLUR) gestures.DLUR = "app.options";

    await chrome.storage.sync.set({ ...defaults, ...stored, gestures, grid, version: 5 });
  }

  // v2 added the overlay scale.
  if (local.version !== 2) {
    await chrome.storage.local.set({ ...defaultLocalSettings(), ...local, version: 2 });
  }
}
