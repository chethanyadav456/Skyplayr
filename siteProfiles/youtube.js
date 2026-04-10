(function youtubeProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "youtube",
    match: (hostname) => /(^|\.)youtube\.com$/.test(hostname) || /(^|\.)youtu\.be$/.test(hostname),
    scoreVideo: (video) => {
      let score = 0;
      if (video.closest("#movie_player, .html5-video-player")) {
        score += 20;
      }
      if (video.classList.contains("html5-main-video")) {
        score += 10;
      }
      return score;
    },
  });
})();
