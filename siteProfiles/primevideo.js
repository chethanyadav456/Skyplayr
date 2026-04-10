(function primeProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "primevideo",
    match: (hostname) => /(^|\.)primevideo\.com$/.test(hostname),
    scoreVideo: (video) => {
      let score = 0;
      if (video.closest(".webPlayerSDKContainer, .atvwebplayersdk-container")) {
        score += 22;
      }
      if (video.closest("[class*='dv-web-player']")) {
        score += 10;
      }
      return score;
    },
  });
})();
