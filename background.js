/**
 * Skyplayr Chrome Extension Background Service Worker
 *
 * This service worker handles extension-wide events and coordination:
 * - Manages default settings initialization on install
 * - Handles toolbar button clicks and keyboard shortcuts
 * - Routes toggle commands to active content scripts
 * - Provides logging and ping endpoints for debugging
 *
 * @fileoverview Background script for Skyplayr PiP extension
 */

/**
 * Default extension settings that are initialized on first install
 * These control various PiP behaviors and UI elements
 */
const SKYPLAYR_DEFAULT_SETTINGS = {
  autoEnterOnTabSwitch: false,  // Auto-enter PiP when switching tabs
  restoreAfterAutoplay: true,   // Restore PiP after video autoplay
  showOverlayButton: true,      // Show floating overlay button on videos
};

/**
 * Ensures default settings are present in Chrome storage
 * Called during extension installation to initialize user preferences
 *
 * @returns {Promise<void>}
 */
async function ensureDefaultSettings() {
  // Get current settings from sync storage
  const current = await chrome.storage.sync.get(SKYPLAYR_DEFAULT_SETTINGS);
  const patch = {};

  // Check each default setting and add missing ones to patch
  for (const key of Object.keys(SKYPLAYR_DEFAULT_SETTINGS)) {
    if (typeof current[key] === "undefined") {
      patch[key] = SKYPLAYR_DEFAULT_SETTINGS[key];
    }
  }

  // Apply any missing defaults to storage
  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }
}

// Initialize default settings when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.warn("[Skyplayr] Unable to initialize default settings", error);
  });
});

/**
 * Sends a toggle PiP command to a specific tab's content script
 *
 * @param {number} tabId - The ID of the tab to send the command to
 * @param {string} trigger - The source of the toggle request (e.g., "toolbar", "shortcut")
 */
function sendToggleToTab(tabId, trigger) {
  // Validate tab ID
  if (!tabId || tabId < 0) {
    return;
  }

  // Send toggle message to content script
  chrome.tabs.sendMessage(tabId, { type: "SKYPLAYR_TOGGLE", trigger }, () => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || "Unknown error";
      // Ignore "Receiving end does not exist" errors (content script not loaded)
      if (!msg.includes("Receiving end does not exist")) {
        console.debug("[Skyplayr] Toggle delivery warning", msg);
      }
    }
  });
}

// Handle toolbar button clicks
chrome.action.onClicked.addListener((tab) => {
  sendToggleToTab(tab.id, "toolbar");
});

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") {
    return;
  }

  // Get the currently active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    sendToggleToTab(activeTab.id, "shortcut");
  }
});

// Handle messages from content scripts and other extension parts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message format
  if (!message || typeof message !== "object") {
    return false;
  }

  // Handle logging requests from content scripts
  if (message.type === "SKYPLAYR_LOG") {
    // Extract hostname from sender tab URL for context
    const scope = sender.tab?.url ? new URL(sender.tab.url).hostname : "unknown";
    console.info("[Skyplayr][%s] %s", scope, message.payload || "");
    sendResponse({ ok: true });
    return true; // Keep message channel open for async response
  }

  // Handle ping requests for extension detection
  if (message.type === "SKYPLAYR_PING") {
    sendResponse({ ok: true, product: "Skyplayr" });
    return true; // Keep message channel open for async response
  }

  // Message not handled
  return false;
});
