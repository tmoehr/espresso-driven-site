// espressodriven.com
// The swirl in the hero is drawn by scripts/background.js.
// This file adds: the scroll-scrubbed HelioPath story, theme switching,
// navigation, and the copy-email button.

// ───────────────────────── Constants ─────────────────────────

const THEME_KEY = "theme";                  // same key as the live site
const THEME_COLOR = { dark: "#120d0a", light: "#f4efe8" };
const NAV_SCROLL_THRESHOLD = 8;
const COPY_RESET_MS = 2000;

// Story timeline, as fractions of the sticky scroll range.
const STORY_OPEN_END = 0.12;   // 0 → this: the film opens from a card to full bleed
const STORY_SMOOTHING = 10;    // higher follows scroll more tightly (per second, exponential)
const SEEK_EPSILON = 1 / 30;   // don't ask the decoder for changes smaller than a frame
// Portrait viewports get the 9:16 cut, everything else the 16:9 one.
const PORTRAIT_QUERY = "(orientation: portrait)";
const VIDEO_EXT = ".mp4";
const POSTER_EXT = ".jpg";

// Sunlight on the get block: the real sun over Stralsund, the way HelioPath thinks about it.
const STRALSUND = { lat: 54.309, lon: 13.082 };
const SUN_UPDATE_MS = 60_000;          // the sun moves ~0.25° a minute, so once a minute is plenty
const SUN_AZIMUTH_RANGE = [45, 315];   // NE sunrise to NW sunset at midsummer → left to right edge
const SUN_ELEVATION_MAX = 60;          // ~59° at midsummer noon in Stralsund → top edge
const SUN_ELEVATION_MIN = -12;         // nautical dusk: the glow has sunk below the cards

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ───────────────────────── Theme ─────────────────────────

function initTheme() {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  const meta = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    root.dataset.theme = theme;
    meta.content = THEME_COLOR[theme];
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    // background.js re-reads its colours from CSS on this event, and re-measures its canvas
    // on resize: light mode hides the canvas, so it drops to 0×0 there and stops costing GPU time.
    dispatchEvent(new Event("themechange"));
    dispatchEvent(new Event("resize"));
  }

  button.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: theme still switches */ }
    apply(next);
  });
  apply(root.dataset.theme === "light" ? "light" : "dark");
}

// ───────────────────────── Navigation ─────────────────────────

function initNav() {
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");

  const onScroll = () => { nav.dataset.scrolled = String(scrollY > NAV_SCROLL_THRESHOLD); };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    links.dataset.open = String(open);
    document.body.style.overflow = open ? "hidden" : "";
  }
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { setOpen(false); toggle.focus(); }
  });
}

// ───────────────────────── Story: scroll is the clock ─────────────────────────

function initStory() {
  const story = document.getElementById("story");
  const video = document.getElementById("story-video");
  const steps = [...document.querySelectorAll(".story-step")];

  const portrait = matchMedia(PORTRAIT_QUERY);
  const cutFor = () => (portrait.matches ? video.dataset.portrait : video.dataset.landscape);
  if (reducedMotion) {
    const showPoster = () => { video.poster = cutFor() + POSTER_EXT; };
    showPoster();
    portrait.addEventListener("change", showPoster);
    steps.forEach((s) => (s.dataset.active = "true"));
    return;
  }

  let active = 0;
  let shownTime = 0;          // smoothed playhead (seconds)
  let running = false;
  let last = 0;
  let warmedUp = false;       // true once the iOS warm-up play has started (or was refused)
  let shownOpen = "";         // last values written to the DOM, to skip identical writes
  let shownFilm = "";
  const frameBox = story.querySelector(".story-frame");
  const overlay = story.querySelector(".story-overlay");
  const railFill = story.querySelector(".story-rail-bar span");

  /** 0 at the moment the story pins, 1 when it unpins. */
  function progress() {
    const rect = story.getBoundingClientRect();
    const range = rect.height - innerHeight;
    return range > 0 ? clamp01(-rect.top / range) : 0;
  }

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    const p = progress();
    const open = clamp01(p / STORY_OPEN_END);
    const film = clamp01((p - STORY_OPEN_END) / (1 - STORY_OPEN_END));
    // Write only what changed, and only on the elements that read it: a custom property set
    // on .story would restyle the whole story subtree every frame, which phones feel.
    const openValue = open.toFixed(3);
    if (openValue !== shownOpen) {
      shownOpen = openValue;
      frameBox.style.setProperty("--frame", openValue);
      overlay.style.setProperty("--frame", openValue);
      frameBox.dataset.open = String(open === 1);
    }
    const filmValue = film.toFixed(3);
    if (filmValue !== shownFilm) {
      shownFilm = filmValue;
      railFill.style.setProperty("--p", filmValue);
    }

    // Scrub the video towards the scroll position; skip while a seek is in flight
    // so requests don't queue up behind a slow decoder.
    if (video.duration) {
      // Safari restarts muted inline videos by itself once they scroll into view, so after the
      // warm-up the pause is re-asserted every frame while the story is visible (no-op when paused).
      if (warmedUp && !video.paused) video.pause();
      const target = film * (video.duration - SEEK_EPSILON);
      shownTime += (target - shownTime) * (1 - Math.exp(-STORY_SMOOTHING * dt));
      if (!video.seeking && Math.abs(video.currentTime - shownTime) > SEEK_EPSILON) video.currentTime = shownTime;
    }

    const index = Math.min(steps.length - 1, Math.floor(film * steps.length));
    if (index !== active) {
      steps[active].dataset.active = "false";
      steps[index].dataset.active = "true";
      active = index;
    }
    requestAnimationFrame(frame);
  }

  // Only run while the story is near the viewport.
  new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting;
    if (running) { last = 0; requestAnimationFrame(frame); }
  }, { rootMargin: "100px 0px" }).observe(story);

  // The cut always matches the viewport's orientation. Rotating a phone or reshaping the
  // window to the other orientation swaps the source: that drops the buffered film, a
  // one-off reload that only happens on such a change. The frame loop seeks the new cut
  // back to the current scroll position as soon as its metadata is in.
  function loadCut() {
    const cut = cutFor();
    warmedUp = false;
    video.poster = cut + POSTER_EXT;
    video.src = cut + VIDEO_EXT;
  }
  loadCut();
  portrait.addEventListener("change", loadCut);

  // Scroll is the only clock: whatever starts playback (the iOS warm-up below, autoplay
  // quirks, a tap on the video), stop it the moment frames actually advance. The pause is
  // deferred by a task: WebKit reports a pause issued inside its own "playing" dispatch as
  // done but keeps the decoder running, so Safari would show the film playing on its own.
  video.addEventListener("playing", () => setTimeout(() => video.pause()));

  // iOS only decodes frames for seeking after the video has been played once, and again
  // after every source swap. Until that play has started, the frame loop must not pause it.
  // A refused play (autoplay blocked) ends the wait too.
  video.addEventListener("loadedmetadata", () => {
    video.play().then(() => video.pause(), () => {}).finally(() => { warmedUp = true; });
  });
}

// ───────────────────────── Sunlight ─────────────────────────

const DEG = Math.PI / 180;
const MS_PER_DAY = 86_400_000;
const J2000_FROM_UNIX_EPOCH = 2440587.5 - 2451545.0;   // Julian day offset

/**
 * Solar elevation and azimuth (degrees, azimuth clockwise from north) for a moment and place.
 * Low-precision almanac formulas, good to a fraction of a degree, which is far more than a glow needs.
 */
function sunPosition(date, lat, lon) {
  const d = date.getTime() / MS_PER_DAY + J2000_FROM_UNIX_EPOCH;
  const anomaly = (357.529 + 0.98560028 * d) * DEG;
  const meanLon = 280.459 + 0.98564736 * d;
  const eclipticLon = (meanLon + 1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly)) * DEG;
  const obliquity = (23.439 - 0.00000036 * d) * DEG;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon)) / DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const siderealDeg = (18.697374558 + 24.06570982441908 * d) * 15;
  const hourAngle = (siderealDeg + lon - rightAscension) * DEG;
  const phi = lat * DEG;

  const elevation = Math.asin(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)) / DEG;
  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(declination),
    Math.sin(declination) * Math.cos(phi) - Math.cos(declination) * Math.sin(phi) * Math.cos(hourAngle),
  ) / DEG;
  return { elevation, azimuth: (azimuth + 360) % 360 };
}

function initSunlight() {
  const block = document.getElementById("get");
  const cards = [...block.querySelectorAll(".sunlit")];
  const [azFrom, azTo] = SUN_AZIMUTH_RANGE;

  // Geometry: every card paints the block-sized gradient, offset to where the card sits.
  function measure() {
    const box = block.getBoundingClientRect();
    block.style.setProperty("--light-w", `${box.width}px`);
    block.style.setProperty("--light-h", `${box.height}px`);
    block.style.setProperty("--light-long", `${Math.max(box.width, box.height)}px`);
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--light-x", `${box.left - r.left}px`);
      card.style.setProperty("--light-y", `${box.top - r.top}px`);
    }
  }
  new ResizeObserver(measure).observe(block);

  // Position: azimuth runs left to right, elevation bottom to top. Below the horizon the
  // light sinks past the bottom edge, so at night only a faint rim is left.
  function place() {
    const { elevation, azimuth } = sunPosition(new Date(), STRALSUND.lat, STRALSUND.lon);
    const x = clamp01((azimuth - azFrom) / (azTo - azFrom));
    const y = 1 - Math.max(elevation, SUN_ELEVATION_MIN) / SUN_ELEVATION_MAX;
    block.style.setProperty("--sun-x", `${(x * 100).toFixed(1)}%`);
    block.style.setProperty("--sun-y", `${(y * 100).toFixed(1)}%`);
  }
  place();
  setInterval(place, SUN_UPDATE_MS);
}

// ───────────────────────── Copy email ─────────────────────────

function initCopy() {
  const button = document.getElementById("copy-mail");
  const status = document.getElementById("copy-status");
  let timer = 0;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch {
      location.href = `mailto:${button.dataset.copy}`;   // no clipboard access: open the mail app instead
      return;
    }
    button.dataset.copied = "true";
    status.textContent = "Email address copied";
    clearTimeout(timer);
    timer = setTimeout(() => { button.dataset.copied = "false"; status.textContent = ""; }, COPY_RESET_MS);
  });
}

document.getElementById("year").textContent = String(new Date().getFullYear());
initTheme();
initNav();
initStory();
initSunlight();
initCopy();
