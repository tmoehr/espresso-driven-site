// espressodriven.com
// The light behind the page is drawn by scripts/background.js.
// This file adds: the scroll-scrubbed HelioPath story, theme switching,
// navigation, the copy-email button, and two small things for the curious
// (a greeting in the console, and a word you can type).

// ───────────────────────── Constants ─────────────────────────

// Modes from scripts/theme.js, named like the menu of a coffee bar.
const THEME_NAMES = { auto: "House blend", light: "Light roast", dark: "Dark roast" };
const NAV_SCROLL_THRESHOLD = 8;
const CUE_DISMISS_AT = 0.15;    // the hero's scroll cue leaves after this share of a viewport
const COPY_RESET_MS = 2000;

// For the curious. The order is a nod to RFC 2324, the Hyper Text Coffee Pot Control Protocol.
const CONSOLE_CUP = String.raw`
      ) )
     ( (
   .-------.
   |       |]
   \       /
    '-----'`;
const CONSOLE_ORDER = "BREW /espresso HTCPCP/1.0  ->  200 OK";
const CONSOLE_HINT = "Fancy a double? Type its Italian name anywhere on the page.";
const CONSOLE_STYLE = "font-family: ui-monospace, monospace; color: #e8a453";   // crema; the console cannot read CSS tokens
const SECRET_WORD = "doppio";            // typed anywhere on the page
const SECRET_EVENT = "doppio";           // scripts/background.js answers with a time-lapse

// Story timeline, as fractions of the sticky scroll range.
const STORY_OPEN_END = 0.12;   // 0 → this: the film opens from a card to full bleed
const STORY_SMOOTHING = 10;    // higher follows scroll more tightly (per second, exponential)
const SEEK_EPSILON = 1 / 30;   // don't ask the decoder for changes smaller than a frame
// Portrait viewports get the 9:16 cut, everything else the 16:9 one.
const PORTRAIT_QUERY = "(orientation: portrait)";
const VIDEO_EXT = ".mp4";
const POSTER_EXT = ".jpg";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ───────────────────────── Theme ─────────────────────────

function initTheme() {
  // scripts/theme.js owns the mode and applies it; this only wires the switches and their labels.
  const theme = window.siteTheme;
  const buttons = [...document.querySelectorAll(".theme-toggle")];
  const next = () => theme.modes[(theme.modes.indexOf(theme.mode) + 1) % theme.modes.length];

  function label() {
    const text = `Theme ${THEME_NAMES[theme.mode]}${theme.mode === "auto" ? ", follows system" : ""}. Switch to ${THEME_NAMES[next()]}`;
    for (const button of buttons) {
      button.setAttribute("aria-label", text);
      button.title = text;
      const name = button.querySelector(".theme-name");
      if (name) name.textContent = THEME_NAMES[theme.mode];
    }
  }
  for (const button of buttons) button.addEventListener("click", () => { theme.set(next()); label(); });
  label();
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

// ───────────────────────── Hero scroll cue ─────────────────────────

// The cue has done its job once the visitor scrolls: fade it out for good.
function initHeroCue() {
  const cue = document.getElementById("hero-cue");
  function onScroll() {
    if (scrollY <= innerHeight * CUE_DISMISS_AT) return;
    cue.dataset.dismissed = "true";
    removeEventListener("scroll", onScroll);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
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
  let shownOverFilm = false;
  const nav = document.getElementById("nav");
  const frameBox = story.querySelector(".story-frame");
  const overlay = story.querySelector(".story-overlay");
  const railFill = story.querySelector(".story-rail-bar span");

  /** 0 at the moment the story pins, 1 when it unpins. */
  function progress(rect) {
    const range = rect.height - innerHeight;
    return range > 0 ? clamp01(-rect.top / range) : 0;
  }

  /** The nav drops its glass while the opened film is pinned behind it (see .nav[data-film]). */
  function setNavOverFilm(over) {
    if (over === shownOverFilm) return;
    shownOverFilm = over;
    nav.dataset.film = String(over);
  }

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    const rect = story.getBoundingClientRect();
    const p = progress(rect);
    const open = clamp01(p / STORY_OPEN_END);
    // Only while pinned: once the story scrolls on, its text passes under the bar and needs the glass.
    setNavOverFilm(open === 1 && p < 1);
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
    else setNavOverFilm(false);
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

// ───────────────────────── For the curious ─────────────────────────

function initConsoleGreeting() {
  console.log(`%c${CONSOLE_CUP}\n\n${CONSOLE_ORDER}\n${CONSOLE_HINT}`, CONSOLE_STYLE);
}

// Listens for the secret word, typed letter by letter outside of any form field.
function initSecretWord() {
  let typed = "";
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
    if (typed !== SECRET_WORD) return;
    typed = "";
    dispatchEvent(new Event(SECRET_EVENT));
  });
}

document.getElementById("year").textContent = String(new Date().getFullYear());
initTheme();
initNav();
initHeroCue();
initStory();
initCopy();
initConsoleGreeting();
initSecretWord();
