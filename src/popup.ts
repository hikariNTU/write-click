import { loadSettings, saveLocal, saveSync } from "./shared/settings";
import type { Modifier, Trigger } from "./shared/trigger";
import { applyStaticMessages, setLocale, t } from "./shared/i18n";
import { BRAND_ICON, UI_ICONS } from "./shared/icons";
import { el, icon, row, toggle } from "./ui";

const BUTTON_KEYS = [
  "trigger_button_left",
  "trigger_button_middle",
  "trigger_button_right",
] as const;

function describeTrigger(trigger: Trigger): string {
  if (trigger.kind === "key") return t("trigger_hold_key", trigger.code);
  const button = t(BUTTON_KEYS[trigger.button]);
  const modifier: Modifier | undefined = trigger.modifier;
  return modifier ? t("trigger_with_modifier", modifier, button) : button;
}

async function originOfActiveTab(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return undefined;
  try {
    const { origin, protocol } = new URL(tab.url);
    // Gestures never run on browser-internal pages, so offering a toggle for
    // one would be a lie.
    return protocol === "http:" || protocol === "https:" ? origin : undefined;
  } catch {
    return undefined;
  }
}

void (async () => {
  const { sync, local } = await loadSettings();
  setLocale(sync.language);
  applyStaticMessages();
  const brand = document.querySelector<HTMLElement>("#brand");
  if (brand) brand.innerHTML = BRAND_ICON;

  const origin = await originOfActiveTab();
  const controls = document.querySelector<HTMLElement>("#controls");

  document
    .querySelector<HTMLElement>("#trigger")
    ?.replaceChildren(document.createTextNode(describeTrigger(local.trigger)));

  controls?.append(
    row(
      t("popup_gestures"),
      toggle(local.enabled, (value) => void saveLocal({ enabled: value })),
      t("popup_thisDevice"),
    ),
  );

  if (origin) {
    const disabled = sync.disabledOrigins.includes(origin);
    controls?.append(
      row(
        t("popup_enabledHere"),
        toggle(!disabled, (value) => {
          const next = value
            ? sync.disabledOrigins.filter((entry) => entry !== origin)
            : [...sync.disabledOrigins, origin];
          void saveSync({ disabledOrigins: next });
        }),
        new URL(origin).host,
      ),
    );
  } else {
    controls?.append(
      el("p", "py-2 text-[11px] italic text-slate-500", "Gestures do not run on this page."),
    );
  }

  const options = document.querySelector<HTMLButtonElement>("#options");
  options?.prepend(icon(UI_ICONS.settings, "h-3.5 w-3.5"));
  options?.append(icon(UI_ICONS.openInNew, "h-3 w-3"));
  options?.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
})();
