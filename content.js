/**
 * Skyplayr Content Script Runtime
 *
 * This is the main content script that runs on every web page to provide
 * universal Picture-in-Picture functionality. It handles:
 * - Video detection and scoring across different sites
 * - PiP entry/exit with intelligent fallbacks
 * - UI overlay with draggable button and tooltips
 * - Auto-recovery after DOM changes and route transitions
 * - Netflix-specific resilience features
 * - Settings synchronization and keyboard shortcuts
 *
 * The script uses a class-based architecture for maintainability and
 * includes comprehensive error handling and logging.
 *
 * @fileoverview Main content script for Skyplayr PiP extension
 */

(function skyplayrContentBootstrap() {
  // Only run in top-level frames to avoid conflicts
  if (window.top !== window) {
    return;
  }

  /**
   * Retry delays for PiP attempts (immediate, 300ms, 1000ms)
   * Allows for timing-sensitive video player initialization
   */
  const RETRY_DELAYS_MS = [0, 300, 1000];

  /**
   * Default settings that match the background script defaults
   * Used for local state management and fallbacks
   */
  const SETTINGS_DEFAULTS = {
    autoEnterOnTabSwitch: false,  // Auto-enter PiP when switching tabs
    restoreAfterAutoplay: true,   // Restore PiP after video autoplay
    showOverlayButton: true,      // Show floating overlay button on videos
  };

  /**
   * Main runtime class for Skyplayr PiP functionality
   *
   * Manages the complete PiP lifecycle including video detection,
   * UI rendering, event handling, and state management.
   */
  class SkyplayrRuntime {
    constructor() {
      // User settings loaded from Chrome storage
      this.settings = { ...SETTINGS_DEFAULTS };

      // Currently active video element for PiP operations
      this.activeVideo = null;

      // Last video that successfully entered PiP (for auto-restore)
      this.lastKnownPiPVideo = null;

      // Reason for last PiP failure (for debugging)
      this.lastFailureReason = "";

      // Auto-restore state management
      this.autoRestoreArmed = false;           // Whether auto-restore is enabled
      this.suppressAutoRestoreUntil = 0;       // Timestamp until auto-restore is suppressed
      this.pendingManualExit = false;          // Whether user manually exited PiP

      // UI drag state for overlay positioning
      this.dragState = null;

      // DOM observer for detecting video changes
      this.observer = null;

      // Timer IDs for auto-hide and recovery scheduling
      this.autoHideTimer = 0;
      this.recoveryTimer = 0;

      // UI element references
      this.ui = {
        root: null,           // Root overlay container
        button: null,         // Main toggle button
        tooltip: null,        // Status tooltip
        toastContainer: null, // Toast notification container
      };

      // Pre-bound event handlers to avoid memory leaks
      this.boundOnFullscreen = this.onFullscreenChange.bind(this);
      this.boundOnRoute = this.onRouteChange.bind(this);
      this.boundOnPiPLeave = this.onLeavePictureInPicture.bind(this);
      this.boundOnMouseMove = this.onMouseMove.bind(this);
    }

    /**
     * Initializes the Skyplayr runtime
     * Sets up all event listeners, UI, observers, and loads settings
     *
     * @returns {Promise<void>}
     */
    async init() {
      this.patchHistoryForSpa();      // Enable SPA route detection
      this.bindWindowEvents();        // Bind global event listeners
      this.mountOverlay();            // Create and mount UI overlay
      this.observeDomChanges();       // Start DOM mutation observer
      this.bindRuntimeMessages();     // Listen for extension messages
      this.bindKeyboardShortcut();    // Bind in-page keyboard shortcut
      await this.loadSettings();      // Load user settings from storage
      this.rebindToBestVideo("boot"); // Find initial video
      this.setTooltip("Ready", "ready"); // Set initial UI state
      this.pingBackground();          // Notify background script of readiness
    }

    /**
     * Loads user settings from Chrome sync storage
     * Merges with defaults and applies UI visibility settings
     *
     * @returns {Promise<void>}
     */
    async loadSettings() {
      try {
        const settings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
        this.settings = { ...SETTINGS_DEFAULTS, ...settings };
        this.applyOverlayVisibility();
      } catch (error) {
        console.warn("[Skyplayr] Failed to load settings", error);
      }
    }

    /**
     * Binds listeners for Chrome extension runtime messages
     * Handles toggle commands and settings changes from background script
     */
    bindRuntimeMessages() {
      // Listen for toggle commands from background script
      chrome.runtime.onMessage.addListener((message) => {
        if (!message || typeof message !== "object") {
          return;
        }

        if (message.type === "SKYPLAYR_TOGGLE") {
          this.togglePiP(message.trigger || "runtime");
        }
      });

      // Listen for settings changes from options page
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") {
          return;
        }

        let touched = false;
        for (const key of Object.keys(SETTINGS_DEFAULTS)) {
          if (changes[key]) {
            this.settings[key] = changes[key].newValue;
            touched = true;
          }
        }

        if (touched) {
          this.applyOverlayVisibility();
        }
      });
    }

    /**
     * Binds keyboard shortcuts and visibility change events
     * Handles in-page Ctrl+Shift+P shortcut and tab switch auto-enter
     */
    bindKeyboardShortcut() {
      // Bind Ctrl+Shift+P keyboard shortcut
      window.addEventListener(
        "keydown",
        (event) => {
          const key = event.key?.toLowerCase();
          const ctrlOrCmd = event.ctrlKey || event.metaKey;
          if (!ctrlOrCmd || !event.shiftKey || key !== "p") {
            return;
          }

          event.preventDefault();
          this.togglePiP("in-page-shortcut");
        },
        true
      );

      // Handle tab visibility changes for auto-enter feature
      document.addEventListener(
        "visibilitychange",
        () => {
          if (!document.hidden || !this.settings.autoEnterOnTabSwitch) {
            return;
          }

          this.tryAutoEnter("tab-switch");
        },
        true
      );
    }

    /**
     * Binds global window and document event listeners
     * Handles fullscreen changes, route changes, and PiP exit events
     */
    bindWindowEvents() {
      // Fullscreen state change detection
      document.addEventListener("fullscreenchange", this.boundOnFullscreen, true);
      document.addEventListener("webkitfullscreenchange", this.boundOnFullscreen, true);

      // SPA route change detection
      window.addEventListener("skyplayr-route-change", this.boundOnRoute, true);
      window.addEventListener("popstate", this.boundOnRoute, true);
      window.addEventListener("hashchange", this.boundOnRoute, true);

      // Mouse movement for overlay auto-hide
      window.addEventListener("mousemove", this.boundOnMouseMove, { passive: true });

      // PiP exit listener for existing PiP elements
      if (document.pictureInPictureElement) {
        document.pictureInPictureElement.addEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
      }
    }

    /**
     * Patches browser history API for SPA route detection
     * Dispatches custom events when pushState/replaceState are called
     */
    patchHistoryForSpa() {
      const wrap = (name) => {
        const original = history[name];
        if (typeof original !== "function") {
          return;
        }

        history[name] = (...args) => {
          const value = original.apply(history, args);
          window.dispatchEvent(new Event("skyplayr-route-change"));
          return value;
        };
      };

      wrap("pushState");
      wrap("replaceState");
    }

    /**
     * Handles mouse movement for overlay auto-hide functionality
     * Shows overlay on mouse movement and hides after delay
     */
    onMouseMove() {
      if (!this.ui.root || !this.settings.showOverlayButton) {
        return;
      }

      this.ui.root.classList.remove("skyplayr-hidden");
      window.clearTimeout(this.autoHideTimer);
      this.autoHideTimer = window.setTimeout(() => {
        this.ui.root.classList.add("skyplayr-hidden");
      }, 2400);
    }

    /**
     * Sets up DOM mutation observer to detect video element changes
     * Triggers recovery when DOM structure changes
     */
    observeDomChanges() {
      if (!document.documentElement) {
        return;
      }

      this.observer = new MutationObserver(() => {
        this.scheduleRecovery("dom-mutation");
      });

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "src"],
      });
    }

    /**
     * Applies overlay visibility based on user settings
     * Shows/hides the floating button overlay
     */
    applyOverlayVisibility() {
      if (!this.ui.root) {
        return;
      }

      this.ui.root.style.display = this.settings.showOverlayButton ? "flex" : "none";
    }

    /**
     * Handles SPA route changes
     * Rebinds to new video elements after navigation
     */
    onRouteChange() {
      this.log("SPA route transition detected");
      this.scheduleRecovery("route-change");
    }

    /**
     * Handles fullscreen state changes
     * Rebinds video elements when entering/exiting fullscreen
     */
    onFullscreenChange() {
      this.log("Fullscreen state changed");
      this.scheduleRecovery("fullscreen-change", true);
    }

    /**
     * Handles PiP exit events
     * Resets auto-restore state and suppresses auto-restore temporarily
     */
    onLeavePictureInPicture() {
      this.pendingManualExit = false;
      this.autoRestoreArmed = false;
      this.suppressAutoRestoreUntil = Date.now() + 3000; // Suppress for 3 seconds
      this.setTooltip("Ready", "ready");
      this.toast("PiP closed", "info");
    }

    /**
     * Checks if auto-restore is currently allowed
     * Considers suppression timer and armed state
     *
     * @returns {boolean} Whether auto-restore can proceed
     */
    canAutoRestoreNow() {
      return this.autoRestoreArmed && Date.now() >= this.suppressAutoRestoreUntil;
    }

    /**
     * Schedules a recovery operation with optional urgency
     * Debounces multiple rapid calls and handles urgent requests
     *
     * @param {string} reason - Reason for recovery (for logging)
     * @param {boolean} urgent - Whether this is an urgent recovery request
     */
    scheduleRecovery(reason, urgent = false) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = window.setTimeout(
        () => {
          this.rebindToBestVideo(reason);
          // Auto-restore if urgent and conditions are met
          if (urgent && this.lastKnownPiPVideo && !document.pictureInPictureElement && this.canAutoRestoreNow()) {
            this.tryEnterPiPWithFallback(reason);
          }
        },
        urgent ? 80 : 220 // Shorter delay for urgent requests
      );
    }

    /**
     * Logs a message to the background script for debugging
     * Includes hostname context for multi-tab debugging
     *
     * @param {string} message - The message to log
     */
    log(message) {
      chrome.runtime.sendMessage(
        {
          type: "SKYPLAYR_LOG",
          payload: `[${location.hostname}] ${message}`,
        },
        () => {
          void chrome.runtime.lastError; // Ignore send errors
        }
      );
    }

    /**
     * Gets the site-specific profile for video detection
     * Falls back to generic profile if site profiles aren't loaded
     *
     * @returns {Object} Site profile with id and scoreVideo function
     */
    getProfile() {
      if (window.SkyplayrSiteProfiles && typeof window.SkyplayrSiteProfiles.detect === "function") {
        return window.SkyplayrSiteProfiles.detect(location.hostname);
      }

      return {
        id: "generic",
        scoreVideo: () => 0,
      };
    }

    /**
     * Checks if the current profile is Netflix-specific
     *
     * @param {Object} profile - The site profile to check
     * @returns {boolean} Whether this is a Netflix profile
     */
    isNetflixProfile(profile) {
      return Boolean(profile && profile.id === "netflix");
    }

    /**
     * Collects Netflix-specific video candidates as fallback
     * Uses shadow DOM traversal and scoring for Netflix's complex player structure
     *
     * @param {Object} profile - The Netflix site profile
     * @returns {Array} Array of video candidate objects with score
     */
    collectNetflixCandidates(profile) {
      const walker = window.SkyplayrShadowWalker;
      const roots = walker?.collectSearchRoots ? walker.collectSearchRoots(document) : [document];
      const seen = new Set();
      const candidates = [];

      for (const root of roots) {
        if (!root || !root.querySelectorAll) {
          continue;
        }

        // Find all video elements in shadow DOM
        for (const video of root.querySelectorAll("video")) {
          if (!video || seen.has(video) || !video.isConnected) {
            continue;
          }

          seen.add(video);
          const rect = video.getBoundingClientRect();
          const naturalArea = Math.max(1, video.videoWidth * video.videoHeight);
          const rectArea = Math.max(1, rect.width * rect.height);
          const activeBonus = !video.paused && !video.ended ? 1000000 : 0; // Boost active videos
          const score = activeBonus + naturalArea + rectArea;

          candidates.push({
            video,
            score,
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      this.log(`Netflix fallback candidates: ${candidates.length}`);
      return candidates;
    }

    /**
     * Finds and scores video candidates using site-specific profiles
     * Returns candidates sorted by relevance score
     *
     * @returns {Object} Object with candidates array and detected profile
     */
    findVideos() {
      const profile = this.getProfile();
      const scanner = window.SkyplayrVideoScanner;
      if (!scanner || typeof scanner.scan !== "function") {
        return { candidates: [], profile };
      }

      // Use different size thresholds for Netflix vs other sites
      const result = scanner.scan(document, {
        profile,
        minWidth: this.isNetflixProfile(profile) ? 80 : 220,
        minHeight: this.isNetflixProfile(profile) ? 45 : 124,
      });

      return { candidates: result.candidates || [], profile };
    }

    /**
     * Rebinds to the best available video element
     * Detaches from old video and attaches listeners to new one
     *
     * @param {string} reason - Reason for rebinding (for logging)
     */
    rebindToBestVideo(reason) {
      const { candidates } = this.findVideos();
      const best = candidates[0]?.video || null;

      if (!best) {
        this.activeVideo = null;
        return;
      }

      if (this.activeVideo === best) {
        return; // Already bound to this video
      }

      // Detach from previous video
      if (this.activeVideo) {
        this.detachVideoListeners(this.activeVideo);
      }

      this.activeVideo = best;
      this.attachVideoListeners(best);
      this.log(`Active player rebound (${reason})`);
    }

    /**
     * Attaches event listeners to a video element
     * Listens for play, emptied, and loadedmetadata events
     *
     * @param {HTMLVideoElement} video - The video element to attach listeners to
     */
    attachVideoListeners(video) {
      const onPlay = () => {
        // Auto-restore PiP after autoplay if enabled and conditions met
        if (
          this.settings.restoreAfterAutoplay &&
          this.lastKnownPiPVideo &&
          !document.pictureInPictureElement &&
          this.canAutoRestoreNow()
        ) {
          this.tryEnterPiPWithFallback("autoplay-restore");
        }
      };

      const onEmptied = () => {
        this.scheduleRecovery("video-emptied");
      };

      const onLoaded = () => {
        this.scheduleRecovery("loaded-metadata");
      };

      // Store handlers for later cleanup
      video.__skyplayrHandlers = {
        onPlay,
        onEmptied,
        onLoaded,
      };

      video.addEventListener("play", onPlay, true);
      video.addEventListener("emptied", onEmptied, true);
      video.addEventListener("loadedmetadata", onLoaded, true);
    }

    /**
     * Detaches event listeners from a video element
     * Cleans up handlers stored during attachment
     *
     * @param {HTMLVideoElement} video - The video element to detach listeners from
     */
    detachVideoListeners(video) {
      const handlers = video.__skyplayrHandlers;
      if (!handlers) {
        return;
      }

      video.removeEventListener("play", handlers.onPlay, true);
      video.removeEventListener("emptied", handlers.onEmptied, true);
      video.removeEventListener("loadedmetadata", handlers.onLoaded, true);
      delete video.__skyplayrHandlers;
    }

    /**
     * Toggles Picture-in-Picture mode
     * Exits PiP if active, otherwise attempts to enter PiP
     *
     * @param {string} trigger - Source of the toggle request (e.g., "toolbar", "shortcut")
     * @returns {Promise<void>}
     */
    async togglePiP(trigger) {
      if (document.pictureInPictureElement) {
        // Exit PiP mode
        try {
          this.pendingManualExit = true;
          this.autoRestoreArmed = false;
          this.suppressAutoRestoreUntil = Date.now() + 3000; // Suppress auto-restore
          await document.exitPictureInPicture();
          this.toast("PiP disabled", "info");
          this.setTooltip("Ready", "ready");
          this.log(`PiP exited (${trigger})`);
        } catch (error) {
          this.toast("Could not exit PiP", "error");
          this.setTooltip("Failed", "failed");
          this.log(`PiP exit failed: ${error.message}`);
        }
        return;
      }

      // Enter PiP mode
      await this.tryEnterPiPWithFallback(trigger);
    }

    /**
     * Attempts to auto-enter PiP mode (for tab switches)
     * Only proceeds if auto-enter is enabled and no PiP is active
     *
     * @param {string} trigger - Source of the auto-enter request
     * @returns {Promise<void>}
     */
    async tryAutoEnter(trigger) {
      if (!this.settings.autoEnterOnTabSwitch || document.pictureInPictureElement) {
        return;
      }

      await this.tryEnterPiPWithFallback(trigger);
    }

    /**
     * Attempts to enter PiP with intelligent fallback strategies
     * Tries multiple candidates with retry delays and Netflix-specific handling
     *
     * @param {string} trigger - Source of the PiP request
     * @returns {Promise<boolean>} Whether PiP entry was successful
     */
    async tryEnterPiPWithFallback(trigger) {
      const { candidates, profile } = this.findVideos();
      let finalCandidates = [...candidates];

      // Add Netflix fallback candidates if needed
      if (this.isNetflixProfile(profile)) {
        const netflixFallback = this.collectNetflixCandidates(profile);
        const merged = new Set(finalCandidates.map((entry) => entry.video));
        for (const entry of netflixFallback) {
          if (!merged.has(entry.video)) {
            finalCandidates.push(entry);
            merged.add(entry.video);
          }
        }
      }

      if (finalCandidates.length === 0) {
        this.lastFailureReason = `${profile.id}: no visible video candidates`;
        this.setTooltip("Failed", "failed");
        this.toast("No compatible player found", "error");
        this.log(this.lastFailureReason);
        return false;
      }

      this.setTooltip("Retry", "retry");

      // Try candidates with progressive retry delays
      for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) {
          await this.sleep(delay);
        }

        for (const candidate of finalCandidates) {
          const ok = await this.trySingleCandidate(candidate.video, profile, trigger, delay);
          if (ok) {
            return true;
          }
        }
      }

      // All attempts failed
      this.setTooltip("Failed", "failed");
      this.toast("Skyplayr could not enter PiP", "error");
      this.log(`Fallback exhausted: ${this.lastFailureReason}`);
      return false;
    }

    /**
     * Attempts PiP entry on a single video candidate
     * Handles Netflix-specific disablePictureInPicture overrides
     *
     * @param {HTMLVideoElement} video - The video element to try
     * @param {Object} profile - The site profile
     * @param {string} trigger - Source of the request
     * @param {number} delay - Retry delay used (for logging)
     * @returns {Promise<boolean>} Whether PiP entry succeeded
     */
    async trySingleCandidate(video, profile, trigger, delay) {
      if (!video || !video.isConnected) {
        this.lastFailureReason = `${profile.id}: candidate detached before request`;
        return false;
      }

      const netflixMode = this.isNetflixProfile(profile);
      const hadDisableFlag = Boolean(video.disablePictureInPicture);
      let overrideApplied = false;

      // Temporarily override disablePictureInPicture for Netflix
      if (hadDisableFlag && netflixMode) {
        try {
          video.disablePictureInPicture = false;
          overrideApplied = true;
        } catch (_error) {
          overrideApplied = false;
        }
      }

      // Check if PiP is disabled
      if (video.disablePictureInPicture) {
        this.lastFailureReason = `${profile.id}: disablePictureInPicture flag is set`;
        return false;
      }

      // Check if PiP is supported globally
      if (!document.pictureInPictureEnabled) {
        this.lastFailureReason = `${profile.id}: document.pictureInPictureEnabled is false`;
        return false;
      }

      // Attempt PiP entry
      try {
        await video.requestPictureInPicture();
        this.lastKnownPiPVideo = video;
        this.autoRestoreArmed = true;
        this.suppressAutoRestoreUntil = 0;
        this.pendingManualExit = false;
        this.bindPiPExitListener(video);
        this.setTooltip("Active", "active");
        this.toast("Skyplayr PiP active", "success");
        this.log(`PiP active on ${profile.id} via ${trigger} (retry=${delay}ms)`);
        return true;
      } catch (error) {
        this.lastFailureReason = `${profile.id}: ${error.name || "Error"} ${error.message || "requestPictureInPicture failed"}`;
        this.log(`PiP attempt failed: ${this.lastFailureReason}`);
        return false;
      } finally {
        // Restore original disablePictureInPicture flag
        if (overrideApplied && hadDisableFlag) {
          try {
            video.disablePictureInPicture = true;
          } catch (_error) {
            // Ignore restoration errors for locked video wrappers
          }
        }
      }
    }

    /**
     * Binds PiP exit listener to a video element
     * Ensures we detect when PiP mode ends
     *
     * @param {HTMLVideoElement} video - The video element in PiP mode
     */
    bindPiPExitListener(video) {
      video.removeEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
      video.addEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
    }

    /**
     * Creates and mounts the floating UI overlay
     * Includes the toggle button, tooltip, and toast container
     */
    mountOverlay() {
      const root = document.createElement("div");
      root.className = "skyplayr-overlay";
      root.setAttribute("aria-live", "polite"); // Screen reader announcements

      const button = document.createElement("button");
      button.type = "button";
      button.className = "skyplayr-button";
      button.title = "Toggle Skyplayr Picture-in-Picture";
      button.innerHTML = "<span class=\"skyplayr-glyph\">\u25A3</span><span class=\"skyplayr-label\">Skyplayr</span>";

      const tooltip = document.createElement("div");
      tooltip.className = "skyplayr-tooltip";
      tooltip.textContent = "Ready";

      const toasts = document.createElement("div");
      toasts.className = "skyplayr-toast-stack";

      root.appendChild(button);
      root.appendChild(tooltip);
      root.appendChild(toasts);
      document.documentElement.appendChild(root);

      // Store UI element references
      this.ui.root = root;
      this.ui.button = button;
      this.ui.tooltip = tooltip;
      this.ui.toastContainer = toasts;

      this.applyOverlayVisibility();
      this.makeDraggable(root, button);

      // Bind click handler for PiP toggle
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePiP("overlay-button");
      });
    }

    /**
     * Makes the overlay draggable by the user
     * Constrains movement within viewport bounds
     *
     * @param {HTMLElement} root - The overlay root element
     * @param {HTMLElement} handle - The element that initiates dragging
     */
    makeDraggable(root, handle) {
      const onPointerMove = (event) => {
        if (!this.dragState) {
          return;
        }

        // Constrain to viewport with minimum margins
        const x = Math.max(8, Math.min(window.innerWidth - 120, event.clientX - this.dragState.offsetX));
        const y = Math.max(8, Math.min(window.innerHeight - 56, event.clientY - this.dragState.offsetY));
        root.style.left = `${x}px`;
        root.style.top = `${y}px`;
        root.style.right = "auto";
        root.style.bottom = "auto";
      };

      const onPointerUp = () => {
        this.dragState = null;
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
      };

      // Start dragging on pointer down
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) { // Only left mouse button
          return;
        }

        const rect = root.getBoundingClientRect();
        this.dragState = {
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };

        window.addEventListener("pointermove", onPointerMove, true);
        window.addEventListener("pointerup", onPointerUp, true);
      });
    }

    /**
     * Updates the tooltip text and state
     * Changes visual appearance based on state
     *
     * @param {string} text - The tooltip text to display
     * @param {string} state - The state class (ready, active, failed, retry)
     */
    setTooltip(text, state) {
      if (!this.ui.tooltip || !this.ui.root) {
        return;
      }

      this.ui.tooltip.textContent = text;
      this.ui.root.dataset.state = state;
    }

    /**
     * Shows a temporary toast notification
     * Automatically animates in and out
     *
     * @param {string} message - The message to display
     * @param {string} kind - The toast type (info, success, error)
     */
    toast(message, kind) {
      if (!this.ui.toastContainer) {
        return;
      }

      const item = document.createElement("div");
      item.className = `skyplayr-toast skyplayr-toast-${kind}`;
      item.textContent = message;
      this.ui.toastContainer.appendChild(item);

      // Start fade-out animation
      window.setTimeout(() => {
        item.classList.add("skyplayr-toast-out");
      }, 1600);

      // Remove element after animation
      window.setTimeout(() => {
        item.remove();
      }, 2200);
    }

    /**
     * Utility method for async delays
     *
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    /**
     * Pings the background script to confirm extension is active
     * Used for debugging and extension detection
     */
    pingBackground() {
      chrome.runtime.sendMessage({ type: "SKYPLAYR_PING" }, () => {
        void chrome.runtime.lastError; // Ignore send errors
      });
    }
  }

  // Initialize the Skyplayr runtime
  const runtime = new SkyplayrRuntime();
  runtime.init();
})();
