import { loadSettings, saveLocal, saveSync } from "./shared/settings";
import type { Modifier, Trigger } from "./shared/trigger";
import { BRAND_ICON, UI_ICONS } from "./shared/icons";
import { el, icon, row, toggle } from "./ui";

function describeTrigger(trigger: Trigger): string {
  if (trigger.kind === "key") return `hold ${trigger.code}`;
  const button = ["left", "middle", "right"][trigger.button] ?? "button";
  const modifier: Modifier | undefined = trigger.modifier;
  return modifier ? `${modifier} + ${button}` : button;
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
  const brand = document.querySelector<HTMLElement>("#brand");
  if (brand) brand.innerHTML = BRAND_ICON;

  const { sync, local } = await loadSettings();
  const origin = await originOfActiveTab();
  const controls = document.querySelector<HTMLElement>("#controls");

  document
    .querySelector<HTMLElement>("#trigger")
    ?.replaceChildren(document.createTextNode(describeTrigger(local.trigger)));

  controls?.append(
    row(
      "Gestures",
      toggle(local.enabled, (value) => void saveLocal({ enabled: value })),
      "This device.",
    ),
  );

  if (origin) {
    const disabled = sync.disabledOrigins.includes(origin);
    controls?.append(
      row(
        "Enabled here",
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
