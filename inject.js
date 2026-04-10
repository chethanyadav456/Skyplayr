(function skyplayrPageRuntime() {
  if (window.__skyplayrPageRuntime) {
    return;
  }

  window.__skyplayrPageRuntime = true;

  const PAGE_EVENT = "SKYPLAYR_PAGE_EVENT";
  const PAGE_COMMAND = "SKYPLAYR_COMMAND";
  const SOURCE_EXTENSION = "skyplayr-extension";
  const SOURCE_PAGE = "skyplayr-page";
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
      this.overlayVisible = true;

      this.ui = {
        root: null,
        button: null,
        tooltip: null,
        toastContainer: null,
      };

      this.boundHandleMessage = this.handleWindowMessage.bind(this);
      this.boundOnFullscreen = this.onFullscreenChange.bind(this);
      this.boundOnRoute = this.onRouteChange.bind(this);
      this.boundOnPiPLeave = this.onLeavePictureInPicture.bind(this);
      this.boundOnMouseMove = this.onMouseMove.bind(this);
    }

    init() {
      this.patchHistoryForSpa();
      this.bindWindowEvents();
      this.mountOverlay();
      this.observeDomChanges();
      this.rebindToBestVideo("boot");
      this.setTooltip("Ready", "ready");
    }

    bindWindowEvents() {
      window.addEventListener("message", this.boundHandleMessage);
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

    handleWindowMessage(event) {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }

      if (event.data.source !== SOURCE_EXTENSION || event.data.type !== PAGE_COMMAND) {
        return;
      }

      const payload = event.data.payload || {};

      if (payload.action === "SETTINGS_UPDATE") {
        this.settings = { ...SETTINGS_DEFAULTS, ...(payload.settings || {}) };
        this.applyOverlayVisibility();
        return;
      }

      if (payload.action === "TOGGLE_PIP") {
        this.togglePiP(payload.trigger || "toggle");
        return;
      }

      if (payload.action === "AUTO_ENTER_PIP") {
        this.tryAutoEnter(payload.trigger || "auto");
      }
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

    postEvent(payload) {
      window.postMessage(
        {
          source: SOURCE_PAGE,
          type: PAGE_EVENT,
          payload,
        },
        "*"
      );
    }

    log(message) {
      this.postEvent({ log: `[${location.hostname}] ${message}` });
    }

    getProfile() {
      if (window.SkyplayrSiteProfiles && typeof window.SkyplayrSiteProfiles.detect === "function") {
        return window.SkyplayrSiteProfiles.detect(location.hostname);
      }

      return {
        id: "generic",
        name: "Generic",
        scoreVideo: () => 0,
      };
    }

    findVideos() {
      const profile = this.getProfile();
      const scanner = window.SkyplayrVideoScanner;
      if (!scanner || typeof scanner.scan !== "function") {
        return { candidates: [], profile };
      }

      const result = scanner.scan(document, {
        profile,
        minWidth: 220,
        minHeight: 124,
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
      if (candidates.length === 0) {
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

        for (const candidate of candidates) {
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

      if (video.disablePictureInPicture) {
        this.lastFailureReason = `${profile.id}: disablePictureInPicture flag is set`;
        return false;
      }

      if (!document.pictureInPictureEnabled) {
        this.lastFailureReason = `${profile.id}: document.pictureInPictureEnabled is false`;
        return false;
      }

      try {
        if (video.readyState < 2) {
          await video.play().catch(() => null);
        }

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
  }

  const runtime = new SkyplayrRuntime();
  runtime.init();
})();
