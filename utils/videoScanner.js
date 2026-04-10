/**
 * Skyplayr Video Scanner Utility
 *
 * Scans web pages for video elements and scores them for PiP suitability.
 * Uses intelligent heuristics to identify the most relevant video player:
 * - Size and viewport intersection
 * - Playback state (playing, paused, ready)
 * - Visibility and computed styles
 * - Site-specific scoring via profiles
 *
 * Works with Shadow DOM and iframe documents via the ShadowWalker utility.
 *
 * @fileoverview Video element discovery and scoring for PiP selection
 */

(function videoScannerModule() {
  /**
   * Namespace for the ShadowWalker utility dependency
   */
  const SHADOW_WALKER_NS = "SkyplayrShadowWalker";

  /**
   * Checks if a video element is visually visible using computed styles
   * Filters out hidden, invisible, or transparent elements
   *
   * @param {HTMLVideoElement} video - The video element to check
   * @returns {boolean} Whether the video is visually visible
   */
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

  /**
   * Checks if a rectangle intersects with the viewport
   * Used to filter out off-screen video elements
   *
   * @param {DOMRect} rect - The rectangle to check
   * @returns {boolean} Whether the rectangle intersects the viewport
   */
  function intersectsViewport(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    return rect.bottom > 0 && rect.right > 0 && rect.left < vw && rect.top < vh;
  }

  /**
   * Scores a video element for PiP suitability
   * Higher scores indicate better candidates for PiP
   *
   * @param {HTMLVideoElement} video - The video element to score
   * @param {Object} profile - Site-specific profile with scoring function
   * @param {Object} options - Additional scoring options
   * @returns {Object} Object with score and rectangle
   */
  function scoreVideo(video, profile, options) {
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const viewport = Math.max(1, window.innerWidth * window.innerHeight);
    const areaScore = Math.min(100, (area / viewport) * 100); // Percentage of viewport

    let score = areaScore;

    // Bonus for actively playing videos
    if (!video.paused && !video.ended) {
      score += 20;
    }

    // Bonus for videos that have started playing
    if (video.currentTime > 0) {
      score += 8;
    }

    // Bonus for videos that have loaded metadata
    if (video.readyState >= 2) {
      score += 4;
    }

    // Apply site-specific scoring if available
    if (typeof profile?.scoreVideo === "function") {
      score += profile.scoreVideo(video, { rect, options });
    }

    return { score, rect };
  }

  /**
   * Scans the entire page for video elements and returns scored candidates
   * Uses Shadow DOM traversal to find videos in complex web apps
   *
   * @param {Document} rootDocument - The root document to scan
   * @param {Object} options - Scanning options
   * @param {Object} options.profile - Site profile for scoring
   * @param {number} options.minWidth - Minimum video width
   * @param {number} options.minHeight - Minimum video height
   * @returns {Object} Scan results with candidates array and best candidate
   */
  function scan(rootDocument, options = {}) {
    const profile = options.profile || null;
    const minWidth = options.minWidth || 240;  // Default minimum dimensions
    const minHeight = options.minHeight || 135;

    // Get all DOM roots (documents + shadow roots) to search
    const walker = window[SHADOW_WALKER_NS];
    const roots = walker?.collectSearchRoots
      ? walker.collectSearchRoots(rootDocument)
      : [rootDocument];

    const unique = new Set();  // Prevent duplicate processing
    const candidates = [];

    // Scan each DOM root for video elements
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

        // Filter by minimum dimensions
        if (rect.width < minWidth || rect.height < minHeight) {
          continue;
        }

        // Filter by visibility and viewport intersection
        if (!getComputedVisibility(video) || !intersectsViewport(rect)) {
          continue;
        }

        // Score the video candidate
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

    // Sort candidates by score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    return {
      candidates,
      best: candidates[0] || null,
    };
  }

  // Expose the scanner API globally
  window.SkyplayrVideoScanner = {
    scan,
  };
})();
