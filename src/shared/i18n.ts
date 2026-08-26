import en from "../public/_locales/en/messages.json";
import zhTW from "../public/_locales/zh_TW/messages.json";

/**
 * Message keys, typed from the English catalogue. English is the default
 * locale, so it is the one that must be complete; anything a translation is
 * missing falls back to it.
 */
export type MessageKey = keyof typeof en;

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

/**
 * Catalogues are bundled rather than fetched from _locales at runtime. Fetching
 * would mean exposing them as web-accessible resources for the content script,
 * and asynchronous loading before the first label is drawn. At two locales the
 * bundled cost is a few kB; past a handful, revisit that trade.
 */
const CATALOGUES: Record<string, Record<string, Entry>> = { en, zh_TW: zhTW };

/** Offered in settings, named in the language itself. */
export const LOCALES = [
  { value: "en", label: "English" },
  { value: "zh_TW", label: "繁體中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["value"];
/** "auto" follows the browser's UI language, which is what most people want. */
export type LanguageSetting = Locale | "auto";

let override: Locale | undefined;

/**
 * chrome.i18n always follows the browser's UI language and cannot be told to
 * use another one, so an in-extension language picker has to resolve messages
 * itself. Only "auto" goes through chrome.i18n.
 */
export function setLocale(language: LanguageSetting): void {
  override = language === "auto" ? undefined : language;
}

function substitute(entry: Entry, substitutions: string[]): string {
  let out = entry.message;
  for (const [name, { content }] of Object.entries(entry.placeholders ?? {})) {
    const index = Number.parseInt(content.slice(1), 10) - 1;
    out = out.replaceAll(`$${name.toUpperCase()}$`, substitutions[index] ?? "");
  }
  return out;
}

/**
 * Looks a message up for the chosen language.
 *
 * Falls back to the key rather than an empty string: an untranslated screen
 * showing `options_trigger_title` is obviously broken and names the missing
 * key, while one showing nothing at all looks like a rendering bug.
 */
export function t(key: MessageKey, ...substitutions: string[]): string {
  if (override) {
    const entry = CATALOGUES[override]?.[key] ?? (en as Record<string, Entry>)[key];
    if (entry) return substitute(entry, substitutions);
  }
  return chrome.i18n?.getMessage(key, substitutions) || key;
}

/**
 * Fills in every `data-i18n` element in a static page. Attribute rather than
 * markup so the HTML stays readable and the English text stays visible in the
 * source as documentation.
 */
export function applyStaticMessages(root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = node.dataset.i18n as MessageKey | undefined;
    if (key) node.textContent = t(key);
  }
}
