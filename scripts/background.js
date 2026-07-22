// Live espresso-swirl background. Compiles the GLSL in the inline #bg-vert /
// #bg-frag <script> tags (kept in index.html so they can be read via textContent)
// into a WebGL program drawn behind all content: a marbled coffee gradient from
// fbm value noise + domain warping, drifting over time and churned by scroll.
// Colours and tone-mapping come from CSS custom properties (per theme), re-read on
// every theme switch, so the page and the shader share one source of truth.
(function(){
  const canvas = document.getElementById('bg-gl');
  // alpha:false — the shader writes alpha 1.0 everywhere, so an opaque canvas
  // spares the compositor the blend against the layers behind it. No hard edges on
  // a full-screen triangle, so no antialias/depth/stencil needed.
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false };
  const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  // No WebGL: leave the canvas transparent so the solid --bg on <html>
  // (the theme's dark/light background colour) shows through instead.
  if(!gl) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // baked-in look
  const SPEED = 2.55;   // time multiplier — how fast the swirl drifts
  const SWIRL = 0.5;    // domain-warp strength (u_swirl)
  const SCROLL_INFLUENCE = 1.6;   // how strongly scroll progress churns the swirl
  const SCROLL_EASE = 2.764;      // scroll-follow smoothing (≙ ~0.045/frame at 60fps)

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER,   document.getElementById('bg-vert').textContent));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, document.getElementById('bg-frag').textContent));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes    = gl.getUniformLocation(prog, 'u_resolution');
  const uTime   = gl.getUniformLocation(prog, 'u_time');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  gl.uniform1f(gl.getUniformLocation(prog, 'u_swirl'), SWIRL);   // constant, set once
  const uFade      = gl.getUniformLocation(prog, 'u_fadeColor');
  const uEspresso  = gl.getUniformLocation(prog, 'u_espresso');
  const uDarkBrown = gl.getUniformLocation(prog, 'u_darkBrown');
  const uMidBrown  = gl.getUniformLocation(prog, 'u_midBrown');
  const uCaramel   = gl.getUniformLocation(prog, 'u_caramel');
  const uCrema     = gl.getUniformLocation(prog, 'u_crema');
  const uToneFloor = gl.getUniformLocation(prog, 'u_toneFloor');
  const uToneLift  = gl.getUniformLocation(prog, 'u_toneLift');
  const uVignette  = gl.getUniformLocation(prog, 'u_vignette');
  const uSaturation = gl.getUniformLocation(prog, 'u_saturation');
  const uFacetDensity = gl.getUniformLocation(prog, 'u_facetDensity');

  // Colours + tone stay controllable from CSS, and the SAME tokens flip per theme
  // (dark default + light override block), so re-reading them is also how a theme
  // switch is applied. Colours go through a throwaway element so var() resolves to
  // the active theme's value; the scalars are plain custom properties read off :root.
  const rootEl = document.documentElement;
  function applyTheme(){
    const probe = document.createElement('div');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const rgb = name => {
      probe.style.color = 'var(' + name + ')';
      const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
      return [(m[0]||0)/255, (m[1]||0)/255, (m[2]||0)/255];
    };
    gl.uniform3fv(uFade,      rgb('--bg-fade'));
    gl.uniform3fv(uEspresso,  rgb('--espresso'));
    gl.uniform3fv(uDarkBrown, rgb('--dark-brown'));
    gl.uniform3fv(uMidBrown,  rgb('--mid-brown'));
    gl.uniform3fv(uCaramel,   rgb('--caramel'));
    gl.uniform3fv(uCrema,     rgb('--crema'));
    probe.remove();
    const num = (name, fallback) => {
      const v = parseFloat(getComputedStyle(rootEl).getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    gl.uniform1f(uToneFloor, num('--swirl-floor', 0.25));
    gl.uniform1f(uToneLift,  num('--swirl-lift',  0.20));
    gl.uniform1f(uVignette,  num('--bg-vignette', 0.55));
    gl.uniform1f(uSaturation, num('--swirl-saturation', 1.0));
    gl.uniform1f(uFacetDensity, num('--facet-density', 0));
  }
  applyTheme();

  function resize(){
    // DPR capped at 1: the shader output is all low-frequency fbm gradients (no hard
    // edges), and the film-grain overlay (body::after) supplies the high-frequency
    // texture at full resolution — bilinear upscaling of the canvas is not
    // distinguishable, at a quarter of the fragment work.
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    // Size to the canvas's CSS box (100vw/100vh), not innerWidth/innerHeight: on iOS
    // Safari innerHeight changes as the toolbar shows/hides while scrolling, which
    // would rescale the shader's aspect ratio (a visible horizontal "jump"). The
    // vh-based CSS box stays constant through those transitions, so swirls hold still.
    const w = Math.floor(canvas.clientWidth  * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // Cache the scrollable height instead of reading scrollHeight every frame (a
  // potential layout read). ResizeObserver catches content reflows (font swaps, etc.)
  // that change the page height without a window resize.
  let scrollMax = document.documentElement.scrollHeight - innerHeight;
  const updateScrollMax = () => { scrollMax = document.documentElement.scrollHeight - innerHeight; };
  window.addEventListener('resize', updateScrollMax);
  if('ResizeObserver' in window) new ResizeObserver(updateScrollMax).observe(document.documentElement);
  const scrollProgress = () => scrollMax > 0 ? window.scrollY / scrollMax : 0;

  let scrollTarget = 0, scrollSmooth = 0, simTime = 0, last = performance.now();

  function draw(){
    gl.uniform1f(uTime, simTime);
    gl.uniform1f(uScroll, scrollSmooth);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Theme switch (or live OS change on 'auto'): re-read the palette/tone uniforms and
  // repaint. Cheap. The draw() covers the reduced-motion case (no loop running); in
  // the animated case the next frame repaints anyway, so the extra draw is harmless.
  window.addEventListener('themechange', () => { applyTheme(); draw(); });

  if(reduceMotion){
    // render a single still frame, no animation loop
    scrollSmooth = scrollProgress() * SCROLL_INFLUENCE;
    draw();
    return;
  }

  // Cap rendering at ~60fps for smooth motion. The small tolerance keeps vsync
  // timestamp jitter from skipping a whole frame, and the cap still spares the GPU on
  // 120Hz+ displays where the slow, low-frequency motion gains nothing from extra frames.
  const FRAME_MIN_MS = 1000 / 60 - 4;
  let rafId = 0;
  function frame(now){
    rafId = requestAnimationFrame(frame);
    if(now - last < FRAME_MIN_MS) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    simTime += dt * SPEED;

    scrollTarget = scrollProgress() * SCROLL_INFLUENCE;   // gentle scroll influence
    // dt-based easing so the scroll follow feels identical at any frame rate
    scrollSmooth += (scrollTarget - scrollSmooth) * (1.0 - Math.exp(-SCROLL_EASE * dt));

    draw();
  }

  // Stop the loop while the tab is hidden. A WebGL canvas that keeps rendering holds
  // the GPU process memory resident — what trips Safari's "this page used a lot of
  // memory" reload. Fully halting lets the OS reclaim it; on return we reset `last`
  // so the paused interval doesn't dump into dt as one big jump.
  function start(){ if(!rafId){ last = performance.now(); rafId = requestAnimationFrame(frame); } }
  function stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId = 0; } }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  if(!document.hidden) start();
})();
