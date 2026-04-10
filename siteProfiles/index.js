/**
 * Skyplayr Site Profiles Resolver
 *
 * Loads and manages site-specific video detection profiles.
 * Each profile provides custom scoring logic for different video platforms.
 *
 * Profiles are registered in the global __skyplayrProfiles array by individual
 * profile modules, then this resolver matches them to hostnames.
 *
 * Falls back to a generic profile if no specific match is found.
 *
 * @fileoverview Site profile detection and resolution for Skyplayr
 */

(function profileResolverModule() {
  /**
   * Detects the appropriate site profile for a given hostname
   * Iterates through registered profiles and returns the first match
   *
   * @param {string} hostname - The hostname to find a profile for
   * @returns {Object} The matching profile or generic fallback
   */
  function detect(hostname) {
    const profiles = window.__skyplayrProfiles || [];

    // Try each profile's match function
    for (const profile of profiles) {
      try {
        if (profile.match(hostname)) {
          return profile;
        }
      } catch (_error) {
        // Keep profile detection resilient to profile-level exceptions.
        // If a profile's match function throws, skip it and continue.
      }
    }

    // Return generic fallback profile if no match
    return {
      id: "generic",
      scoreVideo: () => 0,  // No additional scoring for generic sites
    };
  }

  // Expose the profile resolver API globally
  window.SkyplayrSiteProfiles = {
    detect,
  };
})();
