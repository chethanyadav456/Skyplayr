/**
 * Skyplayr Options Page Script
 *
 * Manages the extension's settings page functionality:
 * - Loads and displays current settings from Chrome storage
 * - Handles save/reset operations with user feedback
 * - Provides form validation and error handling
 * - Syncs settings across devices via Chrome sync storage
 *
 * @fileoverview Options page JavaScript for Skyplayr PiP extension
 */

/**
 * Default settings that match the background script defaults
 * Used for initialization and reset operations
 */
const SKYPLAYR_DEFAULTS = {
  autoEnterOnTabSwitch: false,  // Auto-enter PiP when switching tabs
  restoreAfterAutoplay: true,   // Restore PiP after video autoplay
  showOverlayButton: true,      // Show floating overlay button on videos
};

/**
 * Array of setting field IDs for iteration
 * Derived from the defaults object keys
 */
const fieldIds = Object.keys(SKYPLAYR_DEFAULTS);

/**
 * Gets a DOM element by ID with null safety
 *
 * @param {string} id - The element ID to retrieve
 * @returns {HTMLElement|null} The element or null if not found
 */
function getField(id) {
  return document.getElementById(id);
}

/**
 * Shows a temporary status message to the user
 * Automatically clears after a delay
 *
 * @param {string} message - The message to display
 * @param {string} kind - The message type (success, error, info)
 */
function setStatus(message, kind) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.dataset.kind = kind;

  // Clear status after 2.2 seconds if still showing the same message
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
      delete status.dataset.kind;
    }
  }, 2200);
}

/**
 * Loads settings from Chrome sync storage and updates UI
 * Called on page load to initialize form values
 *
 * @returns {Promise<void>}
 */
async function loadSettings() {
  const settings = await chrome.storage.sync.get(SKYPLAYR_DEFAULTS);
  for (const id of fieldIds) {
    const field = getField(id);
    if (field) {
      field.checked = Boolean(settings[id]);
    }
  }
}

/**
 * Collects current settings from the UI form fields
 * Returns an object ready for storage
 *
 * @returns {Object} Settings object with current form values
 */
function collectSettingsFromUi() {
  const next = {};
  for (const id of fieldIds) {
    const field = getField(id);
    next[id] = Boolean(field?.checked);
  }
  return next;
}

/**
 * Saves current UI settings to Chrome sync storage
 * Shows success status on completion
 *
 * @returns {Promise<void>}
 */
async function saveSettings() {
  const payload = collectSettingsFromUi();
  await chrome.storage.sync.set(payload);
  setStatus("Settings saved", "success");
}

/**
 * Resets all settings to defaults and reloads the UI
 * Shows info status on completion
 *
 * @returns {Promise<void>}
 */
async function resetDefaults() {
  await chrome.storage.sync.set(SKYPLAYR_DEFAULTS);
  await loadSettings();
  setStatus("Defaults restored", "info");
}

/**
 * Binds event listeners to action buttons
 * Handles save and reset button clicks with error handling
 */
function bindActions() {
  // Save button handler
  document.getElementById("saveButton")?.addEventListener("click", () => {
    saveSettings().catch((error) => {
      console.error("[Skyplayr] Failed to save settings", error);
      setStatus("Could not save settings", "error");
    });
  });

  // Reset button handler
  document.getElementById("resetButton")?.addEventListener("click", () => {
    resetDefaults().catch((error) => {
      console.error("[Skyplayr] Failed to reset defaults", error);
      setStatus("Could not reset settings", "error");
    });
  });
}

// Initialize the options page
loadSettings().catch((error) => {
  console.error("[Skyplayr] Failed to load settings", error);
  setStatus("Could not load settings", "error");
});
bindActions();
