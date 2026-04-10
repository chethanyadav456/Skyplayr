(function courseraProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "coursera",
    match: (hostname) => /(^|\.)coursera\.org$/.test(hostname),
    scoreVideo: (video) => {
      let score = 0;
      if (video.closest(".rc-VideoViewer, .video-player")) {
        score += 16;
      }
      if (video.closest("[class*='c-video']")) {
        score += 8;
      }
      return score;
    },
  });
})();
