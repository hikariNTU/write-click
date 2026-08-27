import { COMMANDS } from "./commands";
import type { CommandId } from "./commands";
import { LOCALES } from "./i18n";
import type { LanguageSetting } from "./i18n";
import { MAX_SEGMENTS } from "./recognizer";
import { defaultLocalSettings, defaultSyncSettings } from "./settings";
import type { GridSize, LocalSettings, SyncSettings } from "./settings";
import type { Modifier, Trigger } from "./trigger";

/**
 * The file `buildBackup` writes and `parseBackup` reads.
 *
 * Both areas travel together. The trigger and the overlay scale are per device
 * by design (docs/SPEC.md §3, §7.4) and syncing them silently would be wrong —
 * but an export is a thing a person asked for by name, and a backup that
 * restores everything except the button you press is not a backup. The options
 * page shows what an imported trigger does to the context menu, the same way it
 * does for one chosen by hand.
 */
export interface BackupFile {
  /** Guards against importing a settings file belonging to something else. */
  app: "write-click";
  /** The backup format, not the settings version. Bumped only if this shape changes. */
  format: 1;
  /** Which build wrote it, and when. Read by people, never by the importer. */
  extension: string;
  exportedAt: string;
  sync: SyncSettings;
  local: LocalSettings;
}

export const BACKUP_FORMAT = 1;

export function buildBackup(
  sync: SyncSettings,
  local: LocalSettings,
  extension: string,
  now: Date = new Date(),
): BackupFile {
  return {
    app: "write-click",
    format: BACKUP_FORMAT,
    extension,
    exportedAt: now.toISOString(),
    sync,
    local,
  };
}

/** `write-click-settings-2026-08-27.json`. Sorts by name, and says what it is. */
export function backupFilename(now: Date = new Date()): string {
  return `write-click-settings-${now.toISOString().slice(0, 10)}.json`;
}

export type BackupResult =
  | {
      ok: true;
      sync: SyncSettings;
      local: LocalSettings;
      /** Bindings the file carried that this build cannot honour. */
      dropped: number;
    }
  /** The text is not JSON at all. */
  | { ok: false; reason: "json" }
  /** It parsed, but it is not one of these files. */
  | { ok: false; reason: "shape" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** A finite number inside the range the matching control offers, or the default. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** The colour input writes `#rrggbb`, and the canvas is handed this verbatim. */
function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

const STROKE = new RegExp(`^[UDLR]{1,${MAX_SEGMENTS}}$`);

/**
 * Keeps the bindings this build can act on, and counts the rest.
 *
 * A file can carry a stroke no recognizer will ever produce, or a command that
 * has since been removed — the map is data, and it arrived from a file. Both
 * are dropped rather than stored: a binding that cannot fire is indistinguishable
 * from a missing one on the options page, except that it also occupies a stroke.
 * A command bound twice keeps its first stroke, because the options page reads
 * one stroke per command and the second would be invisible.
 *
 * A file with no gestures at all restores none, rather than the defaults: a map
 * someone deliberately emptied is a map, and an import restores what was
 * exported.
 */
function gestures(value: unknown): { gestures: Record<string, CommandId>; dropped: number } {
  if (!isPlainObject(value)) return { gestures: {}, dropped: 0 };
  const kept: Record<string, CommandId> = {};
  const spoken = new Set<string>();
  let dropped = 0;
  for (const [stroke, command] of Object.entries(value)) {
    const known = typeof command === "string" && command in COMMANDS;
    if (!STROKE.test(stroke) || !known || spoken.has(command as string)) {
      dropped += 1;
      continue;
    }
    kept[stroke] = command as CommandId;
    spoken.add(command as string);
  }
  return { gestures: kept, dropped };
}

const MODIFIERS = new Set<string>(["Alt", "Control", "Meta", "Shift"]);

/**
 * A `Trigger` is a discriminated union, so it is rebuilt variant by variant
 * rather than merged: half of one and half of the other is neither, and the
 * whole trigger is read on every pointer event.
 */
function trigger(value: unknown, fallback: Trigger): Trigger {
  if (!isPlainObject(value)) return fallback;
  if (value.kind === "key") {
    // A KeyboardEvent code, which is what the capture button stores. Bounded
    // because it is shown as-is on the options page.
    const code = value.code;
    if (typeof code !== "string" || !/^[A-Za-z0-9]{1,24}$/.test(code)) return fallback;
    return { kind: "key", code };
  }
  if (value.kind !== "button") return fallback;
  const button = value.button === 0 || value.button === 1 || value.button === 2 ? value.button : 2;
  const next: Trigger = { kind: "button", button };
  // Absent, not undefined: settings.ts replaces `trigger` outright precisely so
  // a cleared modifier stays cleared, and a present `modifier: undefined` key
  // would survive the round trip through JSON as nothing at all anyway.
  if (typeof value.modifier === "string" && MODIFIERS.has(value.modifier)) {
    next.modifier = value.modifier as Modifier;
  }
  return next;
}

/**
 * Origins as `location.origin` writes them, which is what the content script
 * compares against: anything else in this list is an entry that can never match
 * a page and can never be removed except by hand.
 *
 * Parsed in a `try` rather than through `URL.canParse`, which needs Chrome 120
 * and this is the only call site that would set that floor.
 */
function isOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function origins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isOrigin))];
}

const LANGUAGES: readonly LanguageSetting[] = ["auto", ...LOCALES.map((locale) => locale.value)];
const SIZES: readonly GridSize[] = ["compact", "normal", "large"];

/**
 * Reads a backup file into settings, field by field.
 *
 * Nothing is trusted: the file is text the user picked off a disk, and every
 * value in it reaches a canvas, a stored gesture map or a pointer listener.
 * Each field is checked and clamped to what the matching control can produce,
 * and anything unreadable falls back to the default rather than failing the
 * whole import — one bad colour should not cost someone their gesture map.
 * Only a file that is not JSON, or not one of ours, is refused outright.
 */
export function parseBackup(text: string): BackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!isPlainObject(raw) || raw.app !== "write-click") return { ok: false, reason: "shape" };

  const syncDefaults = defaultSyncSettings();
  const localDefaults = defaultLocalSettings();
  const storedSync = isPlainObject(raw.sync) ? raw.sync : {};
  const storedLocal = isPlainObject(raw.local) ? raw.local : {};
  const grid = isPlainObject(storedSync.grid) ? storedSync.grid : {};
  const trail = isPlainObject(storedSync.trail) ? storedSync.trail : {};
  const bindings = gestures(storedSync.gestures);

  return {
    ok: true,
    dropped: bindings.dropped,
    sync: {
      version: syncDefaults.version,
      language: pick(storedSync.language, LANGUAGES, syncDefaults.language),
      gestures: bindings.gestures,
      grid: {
        enabled: bool(grid.enabled, syncDefaults.grid.enabled),
        holdMs: Math.round(num(grid.holdMs, syncDefaults.grid.holdMs, 0, 1000)),
        size: pick(grid.size, SIZES, syncDefaults.grid.size),
        cheatsheet: bool(grid.cheatsheet, syncDefaults.grid.cheatsheet),
        pickOnRelease: bool(grid.pickOnRelease, syncDefaults.grid.pickOnRelease),
        allWindows: bool(grid.allWindows, syncDefaults.grid.allWindows),
      },
      trail: {
        show: bool(trail.show, syncDefaults.trail.show),
        color: color(trail.color, syncDefaults.trail.color),
        width: Math.round(num(trail.width, syncDefaults.trail.width, 2, 10)),
        showLabel: bool(trail.showLabel, syncDefaults.trail.showLabel),
      },
      disabledOrigins: origins(storedSync.disabledOrigins),
    },
    local: {
      version: localDefaults.version,
      trigger: trigger(storedLocal.trigger, localDefaults.trigger),
      enabled: bool(storedLocal.enabled, localDefaults.enabled),
      uiScale: num(storedLocal.uiScale, localDefaults.uiScale, 0.5, 2),
    },
  };
}
