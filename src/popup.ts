import { loadSettings, saveLocal, saveSync } from "./shared/settings";
import { applyStaticMessages, dynamic, setLocale, t } from "./shared/i18n";
import { BRAND_ICON, UI_ICONS } from "./shared/icons";
import { describeTrigger } from "./trigger-ui";
import { el, paintIcon, row, toggle } from "./ui";

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
        dynamic(new URL(origin).host),
      ),
    );
  } else {
    controls?.append(el("p", "py-2 text-[11px] italic text-mist-500", t("popup_notHere")));
  }

  paintIcon("#options-icon", UI_ICONS.settings);
  paintIcon("#options-open", UI_ICONS.openInNew);
  const options = document.querySelector<HTMLButtonElement>("#options");
  options?.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
})();
