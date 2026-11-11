// How far the page is scrolled, 0 at the top and 1 at the very end. One shared source for
// everything that follows the scroll position: the backdrop's sun (scripts/background.js) and
// the cup in the nav (scripts/app.js). Loaded before both.
(function () {
  // Cache the scrollable height instead of reading scrollHeight on every call (a potential
  // layout read). ResizeObserver catches reflows (font swaps, etc.) that change the page height.
  var max = 0;
  function measure() { max = document.documentElement.scrollHeight - innerHeight; }
  measure();
  addEventListener("resize", measure);
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.documentElement);

  window.siteScroll = {
    progress: function () { return max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0; },
  };
})();
