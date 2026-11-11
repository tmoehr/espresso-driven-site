// Morning light backdrop. Compiles the GLSL in the inline #bg-vert / #bg-frag <script> tags (kept
// in index.html so they can be read via textContent) and draws it into the fixed #backdrop canvas
// behind the whole page: straight rays of window light, soft in the distance and hairline-sharp
// up close, drifting slowly. Scrolling moves the sun, as in the HelioPath story.
// Colours and strength come from CSS custom properties and are re-read on every theme switch:
// page and shader share one source.
(function(){
  const canvas  = document.getElementById('backdrop');
  const vertSrc = document.getElementById('bg-vert');
  const fragSrc = document.getElementById('bg-frag');
  if(!canvas || !vertSrc || !fragSrc) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPEED = 0.03;           // shader time per second: the light feels still until you watch it
  const SCROLL_EASE = 3.0;      // how quickly the sun follows the scroll position (1/s)
  const REST_STRENGTH = 0.7;    // presence below the hero; the hero itself gets 1
  // The hairline rays are a pixel wide, so unlike a pure gradient they need real pixels.
  // PERF: fragment work grows with dpr², so the cap stays at 2 even on 3x phones.
  const MAX_DPR = 2;
  // Cap rendering at ~60fps. The small tolerance keeps vsync timestamp jitter from skipping a
  // whole frame; the slow motion gains nothing from 120Hz+.
  const FRAME_MIN_MS = 1000 / 60 - 4;
  const MAX_DT = 0.05;          // a long pause is not dumped into the clock as one jump
  // The 'doppio' event (a word typed on the page, see app.js): a double shot for the backdrop.
  // For a few seconds the light drifts in time-lapse and the sun swings out and back.
  const DOPPIO_SECONDS = 7;
  const DOPPIO_RUSH = 45;       // peak clock speed, as a multiple of the normal drift
  const DOPPIO_SWING = 1.4;     // how far the sun swings at the peak, in full-page scrolls

  // Without WebGL the canvas is taken out and the solid page background shows.
  // (An inline style, because the stylesheet's display:block for canvases beats [hidden].)
  const fallBack = () => { canvas.style.display = 'none'; };

  // alpha:false — the shader writes alpha 1.0 everywhere, so an opaque canvas spares the
  // compositor the blend. No geometry edges on a full-screen triangle: no antialias/depth/stencil.
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false };
  const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  if(!gl) return fallBack();

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
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fallBack();
  gl.useProgram(prog);

  // full-screen triangle
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uniform = name => gl.getUniformLocation(prog, name);
  const uRes = uniform('u_resolution'), uPx = uniform('u_px');
  const uTime = uniform('u_time'), uSun = uniform('u_sun'), uStrength = uniform('u_strength');
  const uBg = uniform('u_bg'), uLit = uniform('u_lit'), uShade = uniform('u_shade');
  const uLitAmount = uniform('u_litAmount'), uShadeAmount = uniform('u_shadeAmount');

  // Colours go through a throwaway element so any CSS colour syntax resolves to rgb.
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
    gl.uniform3fv(uBg,    rgb('--bg'));
    gl.uniform3fv(uLit,   rgb('--rays-lit'));
    gl.uniform3fv(uShade, rgb('--rays-shade'));
    probe.remove();
    const num = name => parseFloat(style.getPropertyValue(name)) || 0;
    gl.uniform1f(uLitAmount,   num('--rays-lit-amount'));
    gl.uniform1f(uShadeAmount, num('--rays-shade-amount'));
  }

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    // Size to the canvas's CSS box, not innerWidth/innerHeight: on iOS Safari innerHeight
    // changes as the toolbar shows/hides, which would rescale the light (a visible "jump").
    const w = Math.floor(canvas.clientWidth  * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uPx, dpr);
    }
  }

  const scrollProgress = window.siteScroll.progress;   // scripts/scroll.js
  // Full strength in the hero, easing down to the resting level over the first screen.
  const strength = () => 1 - (1 - REST_STRENGTH) * Math.min(window.scrollY / innerHeight, 1);

  let sun = 0, sunSwing = 0, simTime = 0, last = performance.now();
  function draw(){
    gl.uniform1f(uTime, simTime);
    gl.uniform1f(uSun, sun + sunSwing);
    gl.uniform1f(uStrength, strength());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  applyTheme();
  resize();
  sun = scrollProgress();
  draw();

  window.addEventListener('resize', () => { resize(); draw(); });
  // Theme switch (or a live OS change on 'auto'): re-read the tokens and repaint.
  window.addEventListener('themechange', () => { applyTheme(); draw(); });

  // Reduced motion: the single still frame drawn above, no animation loop.
  if(reduceMotion) return;

  // 0 at rest, rising to 1 and back to 0 over one doppio: a sin² bump, so it starts and ends gently.
  let doppioLeft = 0;
  window.addEventListener('doppio', () => { doppioLeft = DOPPIO_SECONDS; });
  function doppioLevel(dt){
    if(doppioLeft <= 0) return 0;
    doppioLeft = Math.max(doppioLeft - dt, 0);
    const s = Math.sin(Math.PI * (1 - doppioLeft / DOPPIO_SECONDS));
    return s * s;
  }

  let rafId = 0;
  function frame(now){
    rafId = requestAnimationFrame(frame);
    if(now - last < FRAME_MIN_MS) return;
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const rush = doppioLevel(dt);
    simTime += dt * SPEED * (1 + (DOPPIO_RUSH - 1) * rush);
    sunSwing = DOPPIO_SWING * rush;
    // dt-based easing so the scroll follow feels identical at any frame rate
    sun += (scrollProgress() - sun) * (1.0 - Math.exp(-SCROLL_EASE * dt));
    draw();
  }

  // Render only while the tab is visible.
  // PERF: the loop also runs while the story film covers the viewport and hides the canvas.
  // The shader is a handful of hashes per pixel, so that is cheaper than tracking the film's
  // coverage; revisit if profiling on low-end phones says otherwise.
  function update(){
    const run = !document.hidden;
    if(run && !rafId){ last = performance.now(); rafId = requestAnimationFrame(frame); }
    else if(!run && rafId){ cancelAnimationFrame(rafId); rafId = 0; }
  }
  document.addEventListener('visibilitychange', update);
  update();
})();
