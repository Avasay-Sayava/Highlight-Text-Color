const { DEFAULT_SETTINGS, MESSAGE_TYPES, storageGet, storageSet } = window.HTC;

async function sendToggle(tabId, enabled) {
  await browser.tabs.sendMessage(tabId, {
    type: MESSAGE_TYPES.TOGGLE,
    enabled,
  });
}

async function handleActionClick(tab) {
  const tabId = tab && tab.id;
  if (!tabId) return;

  const data = await storageGet(["enabled"]);
  const current = data.enabled ?? true;
  const next = !current;

  await storageSet({ enabled: next });

  try {
    await sendToggle(tabId, next);
  } catch (e) {
    console.error("Failed to send message:", e);
  }
}

browser.browserAction.onClicked.addListener(handleActionClick);

browser.runtime.onInstalled.addListener(() => {
  storageSet({ enabled: DEFAULT_SETTINGS.enabled });
});
