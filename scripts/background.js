// Live espresso swirl. Compiles the GLSL in the inline #bg-vert / #bg-frag <script> tags (kept in
// index.html so they can be read via textContent) and draws it into every <canvas data-swirl>:
// a marbled coffee gradient from fbm value noise + domain warping, drifting over time and
// churned by scroll. Used behind the hero and, quieter, behind the cards of the get block.
// Colours, tone and speed come from CSS custom properties read off each canvas, so a canvas can
// be tuned in CSS, and they are re-read on every theme switch: page and shader share one source.
(function(){
  const vertSrc = document.getElementById('bg-vert');
  const fragSrc = document.getElementById('bg-frag');
  if(!vertSrc || !fragSrc) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // baked-in look
  const SPEED = 2.55;   // time multiplier — how fast the swirl drifts (scaled per canvas by --swirl-speed)
  const SWIRL = 0.5;    // domain-warp strength (u_swirl)
  const SCROLL_INFLUENCE = 1.6;   // how strongly scroll progress churns the swirl
  const SCROLL_EASE = 2.764;      // scroll-follow smoothing (≙ ~0.045/frame at 60fps)
  // Cap rendering at ~60fps. The small tolerance keeps vsync timestamp jitter from skipping a
  // whole frame; the slow, low-frequency motion gains nothing from 120Hz+.
  const FRAME_MIN_MS = 1000 / 60 - 4;
  const MAX_DT = 0.05;            // a long pause is not dumped into the clock as one jump

  // Cache the scrollable height instead of reading scrollHeight every frame (a potential layout
  // read). ResizeObserver catches reflows (font swaps, etc.) that change the page height.
  let scrollMax = 0;
  const updateScrollMax = () => { scrollMax = document.documentElement.scrollHeight - innerHeight; };
  updateScrollMax();
  window.addEventListener('resize', updateScrollMax);
  if('ResizeObserver' in window) new ResizeObserver(updateScrollMax).observe(document.documentElement);
  const scrollProgress = () => scrollMax > 0 ? window.scrollY / scrollMax : 0;

  document.querySelectorAll('canvas[data-swirl]').forEach(createSwirl);

  function createSwirl(canvas){
    // alpha:false — the shader writes alpha 1.0 everywhere, so an opaque canvas spares the
    // compositor the blend. No hard edges on a full-screen triangle: no antialias/depth/stencil.
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false };
    const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    // No WebGL: the canvas stays transparent and the solid page background shows through.
    if(!gl) return;

    function compile(type, src){
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vertSrc.textContent));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc.textContent));
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
    const uSwirlBg   = gl.getUniformLocation(prog, 'u_swirlBg');
    const uSwirlFg   = gl.getUniformLocation(prog, 'u_swirlFg');
    const uToneFloor = gl.getUniformLocation(prog, 'u_toneFloor');
    const uToneLift  = gl.getUniformLocation(prog, 'u_toneLift');
    const uVignette  = gl.getUniformLocation(prog, 'u_vignette');

    // Tokens are read off the canvas itself, so CSS can tune one canvas without touching the
    // other. Colours go through a throwaway element so any CSS colour syntax resolves to rgb.
    let speed = 1;
    function applyTheme(){
      const style = getComputedStyle(canvas);
      const probe = document.createElement('div');
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const rgb = name => {
        probe.style.color = style.getPropertyValue(name).trim();
        const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
        return [(m[0]||0)/255, (m[1]||0)/255, (m[2]||0)/255];
      };
      gl.uniform3fv(uFade,    rgb('--bg-fade'));
      gl.uniform3fv(uSwirlBg, rgb('--swirl-bg'));
      gl.uniform3fv(uSwirlFg, rgb('--swirl-fg'));
      probe.remove();
      const num = (name, fallback) => {
        const v = parseFloat(style.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      gl.uniform1f(uToneFloor, num('--swirl-floor', 0.25));
      gl.uniform1f(uToneLift,  num('--swirl-lift',  0.20));
      gl.uniform1f(uVignette,  num('--bg-vignette', 0.55));
      speed = num('--swirl-speed', 1);
    }
    applyTheme();

    function resize(){
      // DPR capped at 1: the output is all low-frequency fbm gradients (no hard edges) and the
      // film-grain overlay supplies the fine texture at full resolution, so bilinear upscaling
      // is not distinguishable, at a quarter of the fragment work.
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      // Size to the canvas's CSS box, not innerWidth/innerHeight: on iOS Safari innerHeight
      // changes as the toolbar shows/hides, which would rescale the swirl (a visible "jump").
      const w = Math.floor(canvas.clientWidth  * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if(canvas.width !== w || canvas.height !== h){
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    }
    window.addEventListener('resize', resize);
    if('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    resize();

    let scrollSmooth = 0, simTime = 0, last = performance.now();
    function draw(){
      gl.uniform1f(uTime, simTime);
      gl.uniform1f(uScroll, scrollSmooth);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Theme switch (or a live OS change on 'auto'): re-read the tokens and repaint.
    window.addEventListener('themechange', () => { applyTheme(); draw(); });

    if(reduceMotion){
      // a single still frame, no animation loop
      scrollSmooth = scrollProgress() * SCROLL_INFLUENCE;
      draw();
      return;
    }

    let rafId = 0;
    function frame(now){
      rafId = requestAnimationFrame(frame);
      if(now - last < FRAME_MIN_MS) return;
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      simTime += dt * SPEED * speed;
      const scrollTarget = scrollProgress() * SCROLL_INFLUENCE;
      // dt-based easing so the scroll follow feels identical at any frame rate
      scrollSmooth += (scrollTarget - scrollSmooth) * (1.0 - Math.exp(-SCROLL_EASE * dt));
      draw();
    }

    // Render only while the canvas is on screen and the tab is visible. A WebGL canvas that keeps
    // rendering holds GPU memory resident (what trips Safari's "this page used a lot of memory"
    // reload), and two swirls on one page should never both run while only one can be seen.
    let onScreen = false;
    function update(){
      const run = onScreen && !document.hidden;
      if(run && !rafId){ last = performance.now(); rafId = requestAnimationFrame(frame); }
      else if(!run && rafId){ cancelAnimationFrame(rafId); rafId = 0; }
    }
    document.addEventListener('visibilitychange', update);
    if('IntersectionObserver' in window){
      new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); }).observe(canvas);
    } else {
      onScreen = true;
      update();
    }
  }
})();
