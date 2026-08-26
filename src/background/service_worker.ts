chrome.runtime.onInstalled.addListener((details) => {
  console.info("[write-click] installed", details.reason);
});
