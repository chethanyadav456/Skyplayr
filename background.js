const SKYPLAYR_DEFAULT_SETTINGS = {
  autoEnterOnTabSwitch: false,
  restoreAfterAutoplay: true,
  showOverlayButton: true,
};

async function ensureDefaultSettings() {
  const current = await chrome.storage.sync.get(SKYPLAYR_DEFAULT_SETTINGS);
  const patch = {};

  for (const key of Object.keys(SKYPLAYR_DEFAULT_SETTINGS)) {
    if (typeof current[key] === "undefined") {
      patch[key] = SKYPLAYR_DEFAULT_SETTINGS[key];
    }
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.warn("[Skyplayr] Unable to initialize default settings", error);
  });
});

function sendToggleToTab(tabId, trigger) {
  if (!tabId || tabId < 0) {
    return;
  }

  chrome.tabs.sendMessage(tabId, { type: "SKYPLAYR_TOGGLE", trigger }, () => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || "Unknown error";
      if (!msg.includes("Receiving end does not exist")) {
        console.debug("[Skyplayr] Toggle delivery warning", msg);
      }
    }
  });
}

chrome.action.onClicked.addListener((tab) => {
  sendToggleToTab(tab.id, "toolbar");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") {
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    sendToggleToTab(activeTab.id, "shortcut");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "SKYPLAYR_LOG") {
    const scope = sender.tab?.url ? new URL(sender.tab.url).hostname : "unknown";
    console.info("[Skyplayr][%s] %s", scope, message.payload || "");
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SKYPLAYR_PING") {
    sendResponse({ ok: true, product: "Skyplayr" });
    return true;
  }

  return false;
});
