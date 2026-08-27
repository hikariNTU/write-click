import { applyStaticMessages, setLocale, t } from "./shared/i18n";
import { BRAND_ICON, UI_ICONS } from "./shared/icons";
import { loadSettings } from "./shared/settings";
import { menuFiresOnMouseDown } from "./shared/trigger";
import { gestureList, mouseGlyph, triggerName, triggerPad } from "./trigger-ui";
import { BUTTON, card, el, icon } from "./ui";

/**
 * Opened once, on install, and never on update.
 *
 * The trigger is per device and platform-dependent — on macOS and Linux the
 * default pairs the right button with a modifier — so a first bare right-drag
 * does nothing and says nothing. The options page explains that in a paragraph
 * and the popup prints it as a line, and neither is read before the first
 * gesture fails. This page is read, because it opens itself.
 */
void (async () => {
  const { sync, local } = await loadSettings();
  setLocale(sync.language);
  applyStaticMessages();

  const brand = document.querySelector<HTMLElement>("#brand");
  if (brand) brand.innerHTML = BRAND_ICON;

  const name = triggerName(local.trigger);

  const trigger = card(
    t("welcome_trigger_title"),
    t("welcome_trigger_body", name),
    UI_ICONS.trigger,
  );
  const shown = el("div", "flex items-center gap-6");
  const text = el("div", "min-w-0 flex-1");
  text.append(
    el("div", "text-lg font-semibold tracking-tight text-emerald-200", name),
    el(
      "p",
      "mt-2 text-xs leading-relaxed text-mist-400",
      menuFiresOnMouseDown() && local.trigger.kind === "button" && !local.trigger.modifier
        ? t("options_warn_menu_suppressed")
        : t("welcome_trigger_device"),
    ),
  );
  shown.append(text, mouseGlyph(local.trigger));
  trigger.append(shown);
  document.querySelector("#trigger")?.replaceChildren(trigger);

  // The page is torn down only with the tab, so the pad's listeners live as
  // long as it does; the controller exists because triggerPad takes one.
  // What to draw, before the place to draw it: a page that teaches the trigger
  // and stops there leaves someone holding the right key with nothing to do.
  const known = card(t("welcome_gestures_title"), t("welcome_gestures_body"), UI_ICONS.gestures);
  known.append(gestureList(sync.gestures));
  document.querySelector("#gestures")?.replaceChildren(known);

  const life = new AbortController();
  const tryIt = card(t("welcome_try_title"), t("welcome_try_body"), UI_ICONS.draw);
  tryIt.append(triggerPad(local.trigger, sync.gestures, sync.trail, life.signal));
  document.querySelector("#try")?.replaceChildren(tryIt);

  const next = card(t("welcome_next_title"), t("welcome_next_body"), UI_ICONS.settings);
  const open = el("button", `${BUTTON} inline-flex items-center gap-1.5`);
  open.type = "button";
  open.append(
    icon(UI_ICONS.settings, "h-3.5 w-3.5"),
    document.createTextNode(t("welcome_open_settings")),
    icon(UI_ICONS.openInNew, "h-3 w-3"),
  );
  open.addEventListener("click", () => void chrome.runtime.openOptionsPage());
  next.append(open);
  document.querySelector("#next")?.replaceChildren(next);
})();
