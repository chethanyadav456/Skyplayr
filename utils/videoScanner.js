(function videoScannerModule() {
  const SHADOW_WALKER_NS = "SkyplayrShadowWalker";

  function getComputedVisibility(video) {
    const style = window.getComputedStyle(video);
    if (!style) {
      return false;
    }

    return !(
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) <= 0.05
    );
  }

  function intersectsViewport(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    return rect.bottom > 0 && rect.right > 0 && rect.left < vw && rect.top < vh;
  }

  function scoreVideo(video, profile, options) {
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const viewport = Math.max(1, window.innerWidth * window.innerHeight);
    const areaScore = Math.min(100, (area / viewport) * 100);

    let score = areaScore;
    if (!video.paused && !video.ended) {
      score += 20;
    }

    if (video.currentTime > 0) {
      score += 8;
    }

    if (video.readyState >= 2) {
      score += 4;
    }

    if (typeof profile?.scoreVideo === "function") {
      score += profile.scoreVideo(video, { rect, options });
    }

    return { score, rect };
  }

  function scan(rootDocument, options = {}) {
    const profile = options.profile || null;
    const minWidth = options.minWidth || 240;
    const minHeight = options.minHeight || 135;

    const walker = window[SHADOW_WALKER_NS];
    const roots = walker?.collectSearchRoots
      ? walker.collectSearchRoots(rootDocument)
      : [rootDocument];

    const unique = new Set();
    const candidates = [];

    for (const root of roots) {
      if (!root || !root.querySelectorAll) {
        continue;
      }

      const videos = root.querySelectorAll("video");
      for (const video of videos) {
        if (unique.has(video)) {
          continue;
        }

        unique.add(video);

        const rect = video.getBoundingClientRect();
        if (rect.width < minWidth || rect.height < minHeight) {
          continue;
        }

        if (!getComputedVisibility(video) || !intersectsViewport(rect)) {
          continue;
        }

        const scored = scoreVideo(video, profile, options);
        candidates.push({
          video,
          score: scored.score,
          rect: scored.rect,
          muted: video.muted,
          paused: video.paused,
          readyState: video.readyState,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      candidates,
      best: candidates[0] || null,
    };
  }

  window.SkyplayrVideoScanner = {
    scan,
  };
})();
