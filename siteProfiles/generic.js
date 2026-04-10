(function genericProfileModule() {
  window.__skyplayrProfiles = window.__skyplayrProfiles || [];

  window.__skyplayrProfiles.push({
    id: "generic",
    match: () => true,
    scoreVideo: () => 0,
  });
})();
