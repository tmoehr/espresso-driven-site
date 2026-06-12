// Live espresso-swirl background. Compiles the GLSL in the inline #bg-vert /
// #bg-frag <script> tags (kept in index.html so they can be read via textContent)
// into a WebGL program drawn behind all content, churned by scroll position.
(function(){
  const canvas = document.getElementById('bg-gl');
  // alpha:false — the shader writes alpha 1.0 everywhere, so an opaque canvas
  // spares the compositor the blend against the layers behind it. No edges to
  // antialias on a full-screen triangle, no depth/stencil needed.
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false };
  const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  // No WebGL: leave the canvas transparent so the static espresso_bg.webp
  // fallback (body::before, z-index:-3) shows through instead.
  if(!gl) return;
  // Shader is live — hide the fallback image (see html.has-webgl in styles.css).
  document.documentElement.classList.add('has-webgl');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // baked-in look
  const SPEED = 1.55;
  const SWIRL = 1.0;

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, document.getElementById('bg-vert').textContent));
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
  gl.uniform1f(gl.getUniformLocation(prog, 'u_swirl'), SWIRL);
  const uFade      = gl.getUniformLocation(prog, 'u_fadeColor');
  const uEspresso  = gl.getUniformLocation(prog, 'u_espresso');
  const uDarkBrown = gl.getUniformLocation(prog, 'u_darkBrown');
  const uMidBrown  = gl.getUniformLocation(prog, 'u_midBrown');
  const uCaramel   = gl.getUniformLocation(prog, 'u_caramel');
  const uCrema     = gl.getUniformLocation(prog, 'u_crema');

  // Colours stay controllable from CSS: resolve each custom property (which may
  // itself reference other vars) to a normalised rgb triple via a throwaway
  // element, then hand them to the shader. Set once — they don't change at runtime.
  (function(){
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
  })();

  function resize(){
    // DPR capped at 1: the shader output is all low-frequency fbm gradients
    // (no hard edges), and the film-grain overlay (body::after) supplies the
    // high-frequency texture at full resolution — bilinear upscaling of the
    // canvas is not distinguishable, at a quarter of the fragment work.
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    // Size the drawing buffer to the canvas's actual CSS box (100vw/100vh), not
    // innerWidth/innerHeight. On iOS Safari innerHeight changes as the toolbar
    // shows/hides while scrolling, which would resize the buffer and rescale the
    // shader's aspect ratio — a visible horizontal "jump". The vh-based CSS box
    // stays constant through those toolbar transitions, so the swirls hold still.
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

  let scrollTarget = 0, scrollSmooth = 0, simTime = 0, last = performance.now();
  // Cache the scrollable height instead of reading scrollHeight every frame
  // (a potential layout read). The ResizeObserver catches content reflows
  // (font swaps, etc.) that change the page height without a window resize.
  let scrollMax = document.body.scrollHeight - innerHeight;
  const updateScrollMax = () => { scrollMax = document.body.scrollHeight - innerHeight; };
  window.addEventListener('resize', updateScrollMax);
  if(window.ResizeObserver) new ResizeObserver(updateScrollMax).observe(document.body);
  function scrollProgress(){
    return scrollMax > 0 ? window.scrollY / scrollMax : 0;
  }

  function draw(){
    gl.uniform1f(uTime, simTime);
    gl.uniform1f(uScroll, scrollSmooth);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if(reduceMotion){
    // render a single still frame, no animation loop
    scrollSmooth = scrollProgress() * 1.6;
    draw();
    return;
  }

  // Cap rendering at ~30fps: the motion is slow enough (time coefficients
  // 0.025–0.045) that per-frame displacement stays sub-pixel, so 30fps is
  // indistinguishable from 60/120 — at a half/quarter of the GPU work. The
  // small tolerance keeps vsync timestamp jitter from skipping a whole frame.
  const FRAME_MIN_MS = 1000 / 30 - 4;
  function frame(now){
    requestAnimationFrame(frame);
    if(now - last < FRAME_MIN_MS) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    simTime += dt * SPEED;

    scrollTarget = scrollProgress() * 1.6;       // gentle scroll influence
    // dt-based easing (≙ 0.045/frame at 60fps), so the scroll follow feels
    // identical at any frame rate
    scrollSmooth += (scrollTarget - scrollSmooth) * (1.0 - Math.exp(-2.764 * dt));

    draw();
  }
  requestAnimationFrame(frame);
})();
