/**
 * Message keys, typed from the English catalogue. English is the default
 * locale, so it is the one that must be complete; Chrome falls back to it for
 * anything a translation is missing.
 */
export type MessageKey = keyof typeof import("../public/_locales/en/messages.json");

/**
 * Looks a message up for the browser's locale.
 *
 * Falls back to the key rather than an empty string: an untranslated screen
 * showing `options_trigger_title` is obviously broken, while one showing
 * nothing at all looks like a rendering bug and hides which key is missing.
 */
export function t(key: MessageKey, ...substitutions: string[]): string {
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
