(function skyplayrContentBootstrap() {
  if (window.top !== window) {
    return;
  }

  const RETRY_DELAYS_MS = [0, 300, 1000];
  const SETTINGS_DEFAULTS = {
    autoEnterOnTabSwitch: false,
    restoreAfterAutoplay: true,
    showOverlayButton: true,
  };

  class SkyplayrRuntime {
    constructor() {
      this.settings = { ...SETTINGS_DEFAULTS };
      this.activeVideo = null;
      this.lastKnownPiPVideo = null;
      this.lastFailureReason = "";
      this.dragState = null;
      this.observer = null;
      this.autoHideTimer = 0;
      this.recoveryTimer = 0;

      this.ui = {
        root: null,
        button: null,
        tooltip: null,
        toastContainer: null,
      };

      this.boundOnFullscreen = this.onFullscreenChange.bind(this);
      this.boundOnRoute = this.onRouteChange.bind(this);
      this.boundOnPiPLeave = this.onLeavePictureInPicture.bind(this);
      this.boundOnMouseMove = this.onMouseMove.bind(this);
    }

    async init() {
      this.patchHistoryForSpa();
      this.bindWindowEvents();
      this.mountOverlay();
      this.observeDomChanges();
      this.bindRuntimeMessages();
      this.bindKeyboardShortcut();
      await this.loadSettings();
      this.rebindToBestVideo("boot");
      this.setTooltip("Ready", "ready");
      this.pingBackground();
    }

    async loadSettings() {
      try {
        const settings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
        this.settings = { ...SETTINGS_DEFAULTS, ...settings };
        this.applyOverlayVisibility();
      } catch (error) {
        console.warn("[Skyplayr] Failed to load settings", error);
      }
    }

    bindRuntimeMessages() {
      chrome.runtime.onMessage.addListener((message) => {
        if (!message || typeof message !== "object") {
          return;
        }

        if (message.type === "SKYPLAYR_TOGGLE") {
          this.togglePiP(message.trigger || "runtime");
        }
      });

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

    bindKeyboardShortcut() {
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

    bindWindowEvents() {
      document.addEventListener("fullscreenchange", this.boundOnFullscreen, true);
      document.addEventListener("webkitfullscreenchange", this.boundOnFullscreen, true);
      window.addEventListener("skyplayr-route-change", this.boundOnRoute, true);
      window.addEventListener("popstate", this.boundOnRoute, true);
      window.addEventListener("hashchange", this.boundOnRoute, true);
      window.addEventListener("mousemove", this.boundOnMouseMove, { passive: true });

      if (document.pictureInPictureElement) {
        document.pictureInPictureElement.addEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
      }
    }

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

    applyOverlayVisibility() {
      if (!this.ui.root) {
        return;
      }

      this.ui.root.style.display = this.settings.showOverlayButton ? "flex" : "none";
    }

    onRouteChange() {
      this.log("SPA route transition detected");
      this.scheduleRecovery("route-change");
    }

    onFullscreenChange() {
      this.log("Fullscreen state changed");
      this.scheduleRecovery("fullscreen-change", true);
    }

    onLeavePictureInPicture() {
      this.setTooltip("Ready", "ready");
      this.toast("PiP closed", "info");
    }

    scheduleRecovery(reason, urgent = false) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = window.setTimeout(
        () => {
          this.rebindToBestVideo(reason);
          if (urgent && this.lastKnownPiPVideo && !document.pictureInPictureElement) {
            this.tryEnterPiPWithFallback(reason);
          }
        },
        urgent ? 80 : 220
      );
    }

    log(message) {
      chrome.runtime.sendMessage(
        {
          type: "SKYPLAYR_LOG",
          payload: `[${location.hostname}] ${message}`,
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }

    getProfile() {
      if (window.SkyplayrSiteProfiles && typeof window.SkyplayrSiteProfiles.detect === "function") {
        return window.SkyplayrSiteProfiles.detect(location.hostname);
      }

      return {
        id: "generic",
        scoreVideo: () => 0,
      };
    }

    isNetflixProfile(profile) {
      return Boolean(profile && profile.id === "netflix");
    }

    collectNetflixCandidates(profile) {
      const walker = window.SkyplayrShadowWalker;
      const roots = walker?.collectSearchRoots ? walker.collectSearchRoots(document) : [document];
      const seen = new Set();
      const candidates = [];

      for (const root of roots) {
        if (!root || !root.querySelectorAll) {
          continue;
        }

        for (const video of root.querySelectorAll("video")) {
          if (!video || seen.has(video) || !video.isConnected) {
            continue;
          }

          seen.add(video);
          const rect = video.getBoundingClientRect();
          const naturalArea = Math.max(1, video.videoWidth * video.videoHeight);
          const rectArea = Math.max(1, rect.width * rect.height);
          const activeBonus = !video.paused && !video.ended ? 1000000 : 0;
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

    findVideos() {
      const profile = this.getProfile();
      const scanner = window.SkyplayrVideoScanner;
      if (!scanner || typeof scanner.scan !== "function") {
        return { candidates: [], profile };
      }

      const result = scanner.scan(document, {
        profile,
        minWidth: this.isNetflixProfile(profile) ? 80 : 220,
        minHeight: this.isNetflixProfile(profile) ? 45 : 124,
      });

      return { candidates: result.candidates || [], profile };
    }

    rebindToBestVideo(reason) {
      const { candidates } = this.findVideos();
      const best = candidates[0]?.video || null;

      if (!best) {
        this.activeVideo = null;
        return;
      }

      if (this.activeVideo === best) {
        return;
      }

      if (this.activeVideo) {
        this.detachVideoListeners(this.activeVideo);
      }

      this.activeVideo = best;
      this.attachVideoListeners(best);
      this.log(`Active player rebound (${reason})`);
    }

    attachVideoListeners(video) {
      const onPlay = () => {
        if (this.settings.restoreAfterAutoplay && this.lastKnownPiPVideo && !document.pictureInPictureElement) {
          this.tryEnterPiPWithFallback("autoplay-restore");
        }
      };

      const onEmptied = () => {
        this.scheduleRecovery("video-emptied");
      };

      const onLoaded = () => {
        this.scheduleRecovery("loaded-metadata");
      };

      video.__skyplayrHandlers = {
        onPlay,
        onEmptied,
        onLoaded,
      };

      video.addEventListener("play", onPlay, true);
      video.addEventListener("emptied", onEmptied, true);
      video.addEventListener("loadedmetadata", onLoaded, true);
    }

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

    async togglePiP(trigger) {
      if (document.pictureInPictureElement) {
        try {
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

      await this.tryEnterPiPWithFallback(trigger);
    }

    async tryAutoEnter(trigger) {
      if (!this.settings.autoEnterOnTabSwitch || document.pictureInPictureElement) {
        return;
      }

      await this.tryEnterPiPWithFallback(trigger);
    }

    async tryEnterPiPWithFallback(trigger) {
      const { candidates, profile } = this.findVideos();
      let finalCandidates = [...candidates];

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

      this.setTooltip("Failed", "failed");
      this.toast("Skyplayr could not enter PiP", "error");
      this.log(`Fallback exhausted: ${this.lastFailureReason}`);
      return false;
    }

    async trySingleCandidate(video, profile, trigger, delay) {
      if (!video || !video.isConnected) {
        this.lastFailureReason = `${profile.id}: candidate detached before request`;
        return false;
      }

      const netflixMode = this.isNetflixProfile(profile);
      const hadDisableFlag = Boolean(video.disablePictureInPicture);
      let overrideApplied = false;

      if (hadDisableFlag && netflixMode) {
        try {
          video.disablePictureInPicture = false;
          overrideApplied = true;
        } catch (_error) {
          overrideApplied = false;
        }
      }

      if (video.disablePictureInPicture) {
        this.lastFailureReason = `${profile.id}: disablePictureInPicture flag is set`;
        return false;
      }

      if (!document.pictureInPictureEnabled) {
        this.lastFailureReason = `${profile.id}: document.pictureInPictureEnabled is false`;
        return false;
      }

      try {
        await video.requestPictureInPicture();
        this.lastKnownPiPVideo = video;
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
        if (overrideApplied && hadDisableFlag) {
          try {
            video.disablePictureInPicture = true;
          } catch (_error) {
            // Ignore restoration errors for locked video wrappers.
          }
        }
      }
    }

    bindPiPExitListener(video) {
      video.removeEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
      video.addEventListener("leavepictureinpicture", this.boundOnPiPLeave, true);
    }

    mountOverlay() {
      const root = document.createElement("div");
      root.className = "skyplayr-overlay";
      root.setAttribute("aria-live", "polite");

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

      this.ui.root = root;
      this.ui.button = button;
      this.ui.tooltip = tooltip;
      this.ui.toastContainer = toasts;

      this.applyOverlayVisibility();
      this.makeDraggable(root, button);

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePiP("overlay-button");
      });
    }

    makeDraggable(root, handle) {
      const onPointerMove = (event) => {
        if (!this.dragState) {
          return;
        }

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

      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
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

    setTooltip(text, state) {
      if (!this.ui.tooltip || !this.ui.root) {
        return;
      }

      this.ui.tooltip.textContent = text;
      this.ui.root.dataset.state = state;
    }

    toast(message, kind) {
      if (!this.ui.toastContainer) {
        return;
      }

      const item = document.createElement("div");
      item.className = `skyplayr-toast skyplayr-toast-${kind}`;
      item.textContent = message;
      this.ui.toastContainer.appendChild(item);

      window.setTimeout(() => {
        item.classList.add("skyplayr-toast-out");
      }, 1600);

      window.setTimeout(() => {
        item.remove();
      }, 2200);
    }

    sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    pingBackground() {
      chrome.runtime.sendMessage({ type: "SKYPLAYR_PING" }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  const runtime = new SkyplayrRuntime();
  runtime.init();
})();
