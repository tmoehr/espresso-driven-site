// Theme for every page. Loaded in <head> right after styles.css, so it runs before the first
// paint and can already read the CSS tokens.
// The visitor picks a mode: "auto" follows the system, "light" and "dark" force a theme, and
// dark is the default on a first visit. The page always gets a resolved data-theme (light or
// dark), so the stylesheet needs no media query, plus data-theme-mode for the switch icons.
(function () {
  var KEY = "theme";
  var MODES = ["auto", "light", "dark"];
  var DEFAULT_MODE = "dark";

  var root = document.documentElement;
  var systemLight = matchMedia("(prefers-color-scheme: light)");
  var meta = document.querySelector('meta[name="theme-color"]');
  var mode = DEFAULT_MODE;
  try {
    var stored = localStorage.getItem(KEY);
    if (MODES.indexOf(stored) >= 0) mode = stored;
  } catch (e) { /* storage blocked: the default stays */ }

  function apply(announce) {
    root.dataset.theme = mode === "auto" ? (systemLight.matches ? "light" : "dark") : mode;
    root.dataset.themeMode = mode;
    // iOS tints its bars with theme-color, so it follows the page background token.
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (announce) {
      // background.js re-reads its colours on themechange; resize lets a hidden canvas drop to 0×0.
      dispatchEvent(new Event("themechange"));
      dispatchEvent(new Event("resize"));
    }
  }

  systemLight.addEventListener("change", function () { if (mode === "auto") apply(true); });
  apply(false);

  window.siteTheme = {
    modes: MODES,
    get mode() { return mode; },
    set: function (next) {
      mode = next;
      try { localStorage.setItem(KEY, mode); } catch (e) { /* still switches for this visit */ }
      apply(true);
    },
  };
})();
