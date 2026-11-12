// The pressure gauge on the not-found page (404.html). Draws the dial into <svg data-gauge>:
// rim, scale, the highlighted brewing pressure and the needle. The needle is drawn resting at
// 0 bar; the stylesheet in 404.html turns it (it starts at brewing pressure and drops).
(function () {
  var svg = document.querySelector("svg[data-gauge]");
  if (!svg) return;

  var NS = "http://www.w3.org/2000/svg";
  var CENTER = 100;            // the dial's centre in the 200-unit viewBox
  var RADIUS = 78;             // outer end of the scale ticks
  var RIM_GAP = 10;            // the rim sits this far outside the scale
  var MAX_BAR = 12;
  var START_DEG = 225;         // 0 bar points to the lower left ...
  var SWEEP_DEG = 270;         // ... and the scale runs clockwise over the top
  var BREW_ZONE = [8.5, 9.5];  // espresso is pulled at about 9 bar
  var ZONE_INSET = 4;
  var TICK_MAJOR = 11, TICK_MINOR = 6;   // tick lengths
  var LABEL_EVERY = 3;         // a number at every third bar
  var LABEL_INSET = 24;
  var NEEDLE_INSET = 34;       // the needle ends inside the ring of figures, so it never strikes through one
  var HUB_RADIUS = 6;
  var UNIT_OFFSET = 34;        // "bar" below the hub

  function el(name, attrs, text) {
    var node = document.createElementNS(NS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return svg.appendChild(node);
  }
  function point(bar, radius) {
    var angle = (START_DEG - SWEEP_DEG * bar / MAX_BAR) * Math.PI / 180;
    return [CENTER + radius * Math.cos(angle), CENTER - radius * Math.sin(angle)];
  }
  function arc(from, to, radius) {
    var a = point(from, radius), b = point(to, radius);
    var large = (to - from) / MAX_BAR * SWEEP_DEG > 180 ? 1 : 0;
    return "M" + a[0] + " " + a[1] + "A" + radius + " " + radius + " 0 " + large + " 1 " + b[0] + " " + b[1];
  }

  el("path", { "class": "gauge-rim", d: arc(0, MAX_BAR, RADIUS + RIM_GAP) });
  el("path", { "class": "gauge-zone", d: arc(BREW_ZONE[0], BREW_ZONE[1], RADIUS - ZONE_INSET) });
  for (var half = 0; half <= MAX_BAR * 2; half++) {
    var bar = half / 2, major = half % 2 === 0;
    var outer = point(bar, RADIUS), inner = point(bar, RADIUS - (major ? TICK_MAJOR : TICK_MINOR));
    el("line", { "class": major ? "gauge-tick gauge-tick-major" : "gauge-tick", x1: outer[0], y1: outer[1], x2: inner[0], y2: inner[1] });
    if (major && bar % LABEL_EVERY === 0) {
      var at = point(bar, RADIUS - LABEL_INSET);
      el("text", { x: at[0], y: at[1] }, bar);
    }
  }
  el("text", { x: CENTER, y: CENTER + UNIT_OFFSET }, "bar");
  var tip = point(0, RADIUS - NEEDLE_INSET);
  var needle = el("line", { "class": "gauge-needle", x1: CENTER, y1: CENTER, x2: tip[0], y2: tip[1] });
  // The needle turns about the hub. The viewBox is not square, so its centre is not the hub:
  // the pivot has to be given in viewBox units (the stylesheet sets transform-box: view-box).
  needle.style.transformOrigin = CENTER + "px " + CENTER + "px";
  el("circle", { "class": "gauge-hub", cx: CENTER, cy: CENTER, r: HUB_RADIUS });
})();
