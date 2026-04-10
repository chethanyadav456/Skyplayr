(function disneyProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "disneyplus",
    match: (hostname) => /(^|\.)disneyplus\.com$/.test(hostname),
    scoreVideo: (video) => {
      let score = 0;
      if (video.closest(".btm-media-player, .media-player")) {
        score += 20;
      }
      if (video.closest("[data-testid='video-player']")) {
        score += 10;
      }
      return score;
    },
  });
})();
