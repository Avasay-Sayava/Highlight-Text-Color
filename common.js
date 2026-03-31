(function () {
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mode: "highlight",
    includeRegexes: "",
    excludeRegexes: "",
  });

  const MESSAGE_TYPES = Object.freeze({
    TOGGLE: "TOGGLE",
    RELOAD_SETTINGS: "reloadSettings",
  });

  function storageGet(keys) {
    return browser.storage.local.get(keys);
  }

  function storageSet(values) {
    return browser.storage.local.set(values);
  }

  function withDefaults(values) {
    return {
      ...DEFAULT_SETTINGS,
      ...(values || {}),
    };
  }

  async function loadSettings() {
    const values = await storageGet([
      "enabled",
      "mode",
      "includeRegexes",
      "excludeRegexes",
      // Legacy key used before include/exclude split.
      "filterRegexes",
    ]);

    const merged = withDefaults(values);

    // Backward compatibility: if includeRegexes is empty, fall back to old filterRegexes.
    if (!merged.includeRegexes && typeof values.filterRegexes === "string") {
      merged.includeRegexes = values.filterRegexes;
    }

    return merged;
  }

  function toTabIds(tabs) {
    return tabs
      .map((tab) => tab && tab.id)
      .filter((id) => Number.isInteger(id));
  }

  async function sendMessageToTabs(tabIds, message) {
    await Promise.all(
      tabIds.map((tabId) =>
        browser.tabs.sendMessage(tabId, message).catch(() => {
          return null;
        }),
      ),
    );
  }

  async function broadcast(message) {
    const tabs = await browser.tabs.query({});
    return sendMessageToTabs(toTabIds(tabs), message);
  }

  window.HTC = {
    DEFAULT_SETTINGS,
    MESSAGE_TYPES,
    storageGet,
    storageSet,
    withDefaults,
    loadSettings,
    toTabIds,
    sendMessageToTabs,
    broadcast,
  };
})();
