import { defaultTrigger, detectPlatform } from "./shared/trigger";

const platform = detectPlatform();
const status = document.querySelector<HTMLParagraphElement>("#status");
if (status) {
  status.textContent = `${platform} · default trigger ${JSON.stringify(defaultTrigger(platform))}`;
}
