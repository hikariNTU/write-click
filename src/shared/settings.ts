import { DEFAULT_GESTURES } from "./commands";
import type { CommandId } from "./commands";
import { defaultTrigger } from "./trigger";
import type { Trigger } from "./trigger";

/** Shared across devices. */
export interface SyncSettings {
  version: 1;
  gestures: Record<string, CommandId>;
  grid: { enabled: boolean; holdMs: number; columns: number };
  trail: { color: string; width: number; showLabel: boolean };
  disabledOrigins: string[];
}

/** Per device. The trigger is deliberately never synced: see docs/SPEC.md §3. */
export interface LocalSettings {
  version: 1;
  trigger: Trigger;
  enabled: boolean;
}

export function defaultSyncSettings(): SyncSettings {
  return {
    version: 1,
    gestures: { ...DEFAULT_GESTURES },
    grid: { enabled: true, holdMs: 180, columns: 4 },
    trail: { color: "#34d399", width: 4, showLabel: true },
    disabledOrigins: [],
  };
}

export function defaultLocalSettings(): LocalSettings {
  return { version: 1, trigger: defaultTrigger(), enabled: true };
}

/** Reads an area, filling in anything the user has never set. */
async function read<T extends object>(area: chrome.storage.StorageArea, defaults: T): Promise<T> {
  const stored = await area.get(defaults as Record<string, unknown>);
  return { ...defaults, ...stored } as unknown as T;
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
  const sync = (await chrome.storage.sync.get(null)) as Partial<SyncSettings>;
  const local = (await chrome.storage.local.get(null)) as Partial<LocalSettings>;

  if (sync.version !== 1)
    await chrome.storage.sync.set({ ...defaultSyncSettings(), ...sync, version: 1 });
  if (local.version !== 1) {
    await chrome.storage.local.set({ ...defaultLocalSettings(), ...local, version: 1 });
  }
}
