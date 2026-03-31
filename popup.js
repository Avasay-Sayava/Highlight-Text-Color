const enabledCheckbox = document.getElementById("enabled");
const modeSelect = document.getElementById("mode");
const includeRegexesInput = document.getElementById("includeRegexes");
const excludeRegexesInput = document.getElementById("excludeRegexes");
const statusMessage = document.getElementById("statusMessage");
const { MESSAGE_TYPES, loadSettings, storageSet, broadcast } = window.HTC;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const settings = await loadSettings();
    enabledCheckbox.checked = settings.enabled;
    modeSelect.value = settings.mode;
    includeRegexesInput.value = settings.includeRegexes || "";
    excludeRegexesInput.value = settings.excludeRegexes || "";
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
});

enabledCheckbox.addEventListener("change", () => {
  saveSettings("enabled");
});

modeSelect.addEventListener("change", () => {
  saveSettings("mode");
});

includeRegexesInput.addEventListener("input", () => {
  saveSettings("settings");
});

excludeRegexesInput.addEventListener("input", () => {
  saveSettings("settings");
});

async function saveSettings(changedField) {
  try {
    const settings = {
      enabled: enabledCheckbox.checked,
      mode: modeSelect.value,
      includeRegexes: includeRegexesInput.value,
      excludeRegexes: excludeRegexesInput.value,
    };

    await storageSet(settings);
    showMessage("Settings saved!", "success");

    if (changedField === "enabled") {
      await broadcast({
        type: MESSAGE_TYPES.TOGGLE,
        enabled: enabledCheckbox.checked,
      });
    } else {
      await broadcast({
        type: MESSAGE_TYPES.RELOAD_SETTINGS,
      });
    }
  } catch (error) {
    console.error("Failed to save settings:", error);
    showMessage("Failed to save settings", "error");
  }
}

function showMessage(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message show ${type}`;

  setTimeout(() => {
    statusMessage.classList.remove("show");
  }, 2000);
}
