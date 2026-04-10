(function netflixProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "netflix",
    match: (hostname) => /(^|\.)netflix\.com$/.test(hostname),
    scoreVideo: (video) => {
      let score = 0;

      if (video.closest(".watch-video, .NFPlayer, [data-uia='video-canvas']")) {
        score += 30;
      }

      if (video.closest(".watch-video--player-view")) {
        score += 20;
      }

      if (video.className && /player|nfplayer|watch/i.test(video.className)) {
        score += 8;
      }

      return score;
    },
  });
})();
