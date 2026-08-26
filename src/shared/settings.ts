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
