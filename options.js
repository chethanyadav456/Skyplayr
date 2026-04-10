const SKYPLAYR_DEFAULTS = {
  autoEnterOnTabSwitch: false,
  restoreAfterAutoplay: true,
  showOverlayButton: true,
};

const fieldIds = Object.keys(SKYPLAYR_DEFAULTS);

function getField(id) {
  return document.getElementById(id);
}

function setStatus(message, kind) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.dataset.kind = kind;

  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
      delete status.dataset.kind;
    }
  }, 2200);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(SKYPLAYR_DEFAULTS);
  for (const id of fieldIds) {
    const field = getField(id);
    if (field) {
      field.checked = Boolean(settings[id]);
    }
  }
}

function collectSettingsFromUi() {
  const next = {};
  for (const id of fieldIds) {
    const field = getField(id);
    next[id] = Boolean(field?.checked);
  }
  return next;
}

async function saveSettings() {
  const payload = collectSettingsFromUi();
  await chrome.storage.sync.set(payload);
  setStatus("Settings saved", "success");
}

async function resetDefaults() {
  await chrome.storage.sync.set(SKYPLAYR_DEFAULTS);
  await loadSettings();
  setStatus("Defaults restored", "info");
}

function bindActions() {
  document.getElementById("saveButton")?.addEventListener("click", () => {
    saveSettings().catch((error) => {
      console.error("[Skyplayr] Failed to save settings", error);
      setStatus("Could not save settings", "error");
    });
  });

  document.getElementById("resetButton")?.addEventListener("click", () => {
    resetDefaults().catch((error) => {
      console.error("[Skyplayr] Failed to reset defaults", error);
      setStatus("Could not reset settings", "error");
    });
  });
}

loadSettings().catch((error) => {
  console.error("[Skyplayr] Failed to load settings", error);
  setStatus("Could not load settings", "error");
});
bindActions();
