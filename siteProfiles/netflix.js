/**
 * Skyplayr Netflix Site Profile
 *
 * Specialized video detection and scoring for Netflix.com
 * Netflix uses complex Shadow DOM structures and dynamic player containers,
 * so this profile provides targeted scoring to identify the main video player.
 *
 * Key Netflix selectors and scoring:
 * - .watch-video, .NFPlayer, [data-uia='video-canvas']: Main player containers (+30)
 * - .watch-video--player-view: Player view wrapper (+20)
 * - Class names containing player/nfplayer/watch: Additional player indicators (+8)
 *
 * @fileoverview Netflix-specific video scoring profile for Skyplayr
 */

(function netflixProfileModule() {
  // Initialize global profiles array if it doesn't exist
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  // Register Netflix profile
  window.__skyplayrProfiles.push({
    /**
     * Unique identifier for this profile
     */
    id: "netflix",

    /**
     * Hostname matching function for Netflix domains
     * Matches netflix.com and subdomains
     *
     * @param {string} hostname - The hostname to test
     * @returns {boolean} Whether this profile applies to the hostname
     */
    match: (hostname) => /(^|\.)netflix\.com$/.test(hostname),

    /**
     * Scores Netflix video elements for PiP suitability
     * Higher scores for elements in known Netflix player containers
     *
     * @param {HTMLVideoElement} video - The video element to score
     * @returns {number} Additional score points for this video
     */
    scoreVideo: (video) => {
      let score = 0;

      // Major bonus for videos in main Netflix player containers
      if (video.closest(".watch-video, .NFPlayer, [data-uia='video-canvas']")) {
        score += 30;
      }

      // Additional bonus for player view wrapper
      if (video.closest(".watch-video--player-view")) {
        score += 20;
      }

      // Minor bonus for videos with player-related class names
      if (video.className && /player|nfplayer|watch/i.test(video.className)) {
        score += 8;
      }

      return score;
    },
  });
})();
