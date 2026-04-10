(function profileResolverModule() {
  function detect(hostname) {
    const profiles = window.__skyplayrProfiles || [];
    for (const profile of profiles) {
      try {
        if (profile.match(hostname)) {
          return profile;
        }
      } catch (_error) {
        // Keep profile detection resilient to profile-level exceptions.
      }
    }

    return {
      id: "generic",
      scoreVideo: () => 0,
    };
  }

  window.SkyplayrSiteProfiles = {
    detect,
  };
})();
