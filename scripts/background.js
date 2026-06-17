// Live low-poly relief background. A triangulated surface (irregular triangles,
// per-face flat normals, per-vertex ambient occlusion) is generated on the CPU
// once per canvas size, uploaded as a static mesh, and lit by a SINGLE
// directional light whose direction slowly wanders — and wanders faster while
// scrolling, proportional to scroll speed. The geometry never changes at
// runtime; only the light direction does, so each frame is just one cheap draw.
//
// Pipeline (CPU, once per size): Poisson-disk sampling (even spacing -> controlled
// polygon-size variation) -> Bowyer-Watson Delaunay triangulation (irregular
// triangles) -> value-noise height field (coherent ridges/valleys) -> per-face
// normals (the facets) + per-vertex AO (the soft in-polygon shadow gradients).
// The GLSL lives in the inline #bg-vert / #bg-frag <script> tags in index.html.
(function(){
  const canvas = document.getElementById('bg-gl');
  // antialias smooths the silhouette where the mesh meets the viewport border;
  // alpha:false lets the compositor skip blending the opaque canvas.
  const attrs = { alpha: false, antialias: true, depth: false, stencil: false };
  const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  // No WebGL: leave the canvas transparent so the static espresso_bg.webp
  // fallback (body::before, z-index:-3) shows through instead.
  if(!gl) return;
  // Shader is live — hide the fallback image (see html.has-webgl in styles.css).
  document.documentElement.classList.add('has-webgl');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Mesh shape -----------------------------------------------------------
  // Poisson radius is tied to the viewport's short side so polygons keep a
  // sensible on-screen size on any device; clamped so phones don't get a coarse
  // handful of huge triangles nor desktops a dense mesh.
  const POLY_DENSITY_DIV   = 2;     // radius = min(W,H) / this
  const POLY_MIN_RADIUS_PX = 70;
  const POLY_MAX_RADIUS_PX = 130;
  const POISSON_TRIES      = 30;    // Bridson candidate count per active sample
  // Relief height as a fraction of the polygon radius: keeps facet steepness
  // (and therefore the lighting contrast) constant regardless of polygon size.
  const HEIGHT_SCALE_FACTOR = 1.5;
  const NOISE_SCALE_PX      = 0.0045; // height-field frequency (1/px): hills span a few polygons

  // --- Ambient occlusion (baked per vertex) ---------------------------------
  const AO_HEIGHT_FLOOR = 0.35;  // darkest AO from height alone (lowest vertex)
  const AO_CURV_GAIN    = 0.6;   // extra darkening for vertices sitting in a dip

  // --- The single light -----------------------------------------------------
  const LIGHT_BASE_ANGLE = Math.PI * 0.72; // azimuth ~130° -> from upper-left
  const LIGHT_XY_RADIUS  = 1.0;            // lateral component of the light vector
  const LIGHT_Z          = 0.272;           // toward-viewer component (smaller = more grazing/contrast)
  const LIGHT_WANDER_AMP = 0.6;            // radians the azimuth sweeps back and forth
  const LIGHT_BASE_SPEED = 0.62;           // idle wander speed (rad/s of phase)
  const SCROLL_LIGHT_GAIN = 0.25;         // extra phase speed per px/frame of scroll
  const SCROLL_VEL_EASE   = 6.0;           // how quickly the scroll-speed reading settles

  // ---------------------------------------------------------------------------
  // value noise (smooth, coherent) for the height field
  // ---------------------------------------------------------------------------
  function makeNoise(seed){
    const hash = (x, y) => {
      const h = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
      return h - Math.floor(h);
    };
    const vnoise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const a = hash(xi, yi),     b = hash(xi + 1, yi);
      const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    };
    return (x, y) => {                 // 3-octave fBm
      let s = 0, amp = 0.5, freq = 1;
      for(let i = 0; i < 3; i++){ s += amp * vnoise(x * freq, y * freq); freq *= 2; amp *= 0.5; }
      return s;
    };
  }

  // ---------------------------------------------------------------------------
  // Poisson-disk sampling (Bridson) over [0,w]×[0,h] with a minimum spacing of
  // `radius` — this even spacing is what keeps polygon sizes from varying wildly.
  // ---------------------------------------------------------------------------
  function poisson(w, h, radius){
    const cell = radius / Math.SQRT2;            // at most one sample per cell
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const grid = new Int32Array(gw * gh).fill(-1);
    const pts = [], active = [];
    const r2 = radius * radius;
    const cellOf = (x, y) => Math.floor(x / cell) + Math.floor(y / cell) * gw;
    const add = p => { const id = pts.length; pts.push(p); active.push(id); grid[cellOf(p[0], p[1])] = id; };
    add([Math.random() * w, Math.random() * h]);
    while(active.length){
      const ai = (Math.random() * active.length) | 0;
      const p = pts[active[ai]];
      let placed = false;
      for(let i = 0; i < POISSON_TRIES; i++){
        const ang = Math.random() * Math.PI * 2;
        const rad = radius * (1 + Math.random());   // ring [r, 2r)
        const nx = p[0] + Math.cos(ang) * rad, ny = p[1] + Math.sin(ang) * rad;
        if(nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const gx = Math.floor(nx / cell), gy = Math.floor(ny / cell);
        let ok = true;
        for(let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && ok; yy++)
          for(let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2) && ok; xx++){
            const id = grid[xx + yy * gw];
            if(id >= 0){ const q = pts[id], dx = q[0] - nx, dy = q[1] - ny; if(dx*dx + dy*dy < r2) ok = false; }
          }
        if(ok){ add([nx, ny]); placed = true; break; }
      }
      if(!placed) active.splice(ai, 1);
    }
    return pts;
  }

  // ---------------------------------------------------------------------------
  // Bowyer-Watson Delaunay triangulation. O(n²) but n is a few hundred, run once
  // per resize — well under a frame. Returns index triples into `points`.
  // ---------------------------------------------------------------------------
  function triangulate(points){
    const n = points.length;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const p of points){
      if(p[0] < minX) minX = p[0]; if(p[0] > maxX) maxX = p[0];
      if(p[1] < minY) minY = p[1]; if(p[1] > maxY) maxY = p[1];
    }
    const dmax = Math.max(maxX - minX, maxY - minY) || 1;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    // super-triangle, large enough to enclose every point
    const pts = points.concat([
      [midX - 20 * dmax, midY - dmax],
      [midX,             midY + 20 * dmax],
      [midX + 20 * dmax, midY - dmax],
    ]);
    let tris = [[n, n + 1, n + 2]];

    const inCircum = (t, p) => {
      const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      const ax = a[0]-p[0], ay = a[1]-p[1];
      const bx = b[0]-p[0], by = b[1]-p[1];
      const cx = c[0]-p[0], cy = c[1]-p[1];
      const dA = ax*ax+ay*ay, dB = bx*bx+by*by, dC = cx*cx+cy*cy;
      const det = ax*(by*dC - dB*cy) - ay*(bx*dC - dB*cx) + dA*(bx*cy - by*cx);
      const ori = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]); // winding sign
      return ori > 0 ? det > 0 : det < 0;
    };
    const key = (a, b) => a < b ? a + '_' + b : b + '_' + a;

    for(let ip = 0; ip < n; ip++){
      const p = pts[ip];
      const bad = [], keep = [];
      for(const t of tris){ (inCircum(t, p) ? bad : keep).push(t); }
      // count edges of the cavity; those used once form its boundary
      const edges = new Map();
      for(const t of bad){
        const e = [[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]];
        for(const [a, b] of e){ const k = key(a, b); edges.set(k, (edges.get(k) || 0) + 1); }
      }
      tris = keep;
      for(const t of bad){
        const e = [[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]];
        for(const [a, b] of e){ if(edges.get(key(a, b)) === 1) tris.push([a, b, ip]); }
      }
    }
    // drop triangles still touching the super-triangle
    return tris.filter(t => t[0] < n && t[1] < n && t[2] < n);
  }

  // ---------------------------------------------------------------------------
  // Build the GPU mesh for the current canvas size and upload it.
  // Interleaved layout per vertex: [posX, posY, nX, nY, nZ, ao, baryX, baryY] (8 floats).
  // baryX/baryY are two of the corner's barycentric coords (the third is implied as
  // 1-x-y); the shader uses them to find each fragment's distance to the nearest
  // polygon edge for the single-pass accent edge-glint.
  // ---------------------------------------------------------------------------
  const FLOATS_PER_VERT = 8;
  // The three triangle corners, in vertex order, get these barycentric coords.
  const BARY = [[1, 0], [0, 1], [0, 0]];
  const SEED = 1234.5;                       // fixed height pattern; point layout is random per load
  let vertexCount = 0;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  function buildMesh(W, H){
    const radius = Math.min(POLY_MAX_RADIUS_PX, Math.max(POLY_MIN_RADIUS_PX, Math.min(W, H) / POLY_DENSITY_DIV));
    const m = radius;                         // margin so the mesh overspills the screen
    // Sample over an expanded rect, shift back, then pin the 4 far corners so the
    // convex hull strictly contains the viewport (no uncovered edges/corners).
    const pts = poisson(W + 2 * m, H + 2 * m, radius).map(p => [p[0] - m, p[1] - m]);
    pts.push([-m, -m], [W + m, -m], [-m, H + m], [W + m, H + m]);

    const tris = triangulate(pts);
    const noise = makeNoise(SEED);
    const heightScale = radius * HEIGHT_SCALE_FACTOR;

    // per-vertex heights + their range (for normalising AO)
    const heights = pts.map(p => noise(p[0] * NOISE_SCALE_PX, p[1] * NOISE_SCALE_PX));
    let hMin = Infinity, hMax = -Infinity;
    for(const h of heights){ if(h < hMin) hMin = h; if(h > hMax) hMax = h; }
    const range = (hMax - hMin) || 1;

    // neighbour-height average per vertex -> concavity (a vertex lower than its
    // neighbours sits in a dip and gets extra occlusion)
    const nSum = new Float64Array(pts.length), nCnt = new Uint32Array(pts.length);
    const link = (a, b) => { nSum[a] += heights[b]; nCnt[a]++; };
    for(const t of tris){
      link(t[0],t[1]); link(t[1],t[0]);
      link(t[1],t[2]); link(t[2],t[1]);
      link(t[2],t[0]); link(t[0],t[2]);
    }
    const ao = pts.map((p, i) => {
      const hN = (heights[i] - hMin) / range;                 // 0 (low) .. 1 (high)
      const avg = nCnt[i] ? nSum[i] / nCnt[i] : heights[i];
      const concavity = (avg - heights[i]) / range;           // >0 -> in a dip
      return clamp01(AO_HEIGHT_FLOOR + (1 - AO_HEIGHT_FLOOR) * hN - AO_CURV_GAIN * Math.max(concavity, 0));
    });

    // world-space positions (y up, z = relief) for face normals; clip-space x/y
    // for the vertex shader. Screen y grows downward, so world/clip y = flip.
    const wx = i => pts[i][0];
    const wy = i => H - pts[i][1];
    const wz = i => heights[i] * heightScale;
    const ndcX = i => pts[i][0] / W * 2 - 1;
    const ndcY = i => 1 - pts[i][1] / H * 2;

    const data = new Float32Array(tris.length * 3 * FLOATS_PER_VERT);
    let o = 0;
    for(const t of tris){
      const [i0, i1, i2] = t;
      // flat face normal from the triangle's world-space edges
      const e1x = wx(i1)-wx(i0), e1y = wy(i1)-wy(i0), e1z = wz(i1)-wz(i0);
      const e2x = wx(i2)-wx(i0), e2y = wy(i2)-wy(i0), e2z = wz(i2)-wz(i0);
      let nx = e1y*e2z - e1z*e2y;
      let ny = e1z*e2x - e1x*e2z;
      let nz = e1x*e2y - e1y*e2x;
      if(nz < 0){ nx = -nx; ny = -ny; nz = -nz; }      // face the viewer (+z)
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= inv; ny *= inv; nz *= inv;
      for(let c = 0; c < 3; c++){                       // same normal on all 3 -> flat facet
        const i = t[c];
        data[o++] = ndcX(i);   data[o++] = ndcY(i);
        data[o++] = nx;        data[o++] = ny;  data[o++] = nz;
        data[o++] = ao[i];
        data[o++] = BARY[c][0]; data[o++] = BARY[c][1]; // distinct per corner -> edge distance
      }
    }
    vertexCount = tris.length * 3;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);    // replaces the bound buffer's contents
  }

  // ---------------------------------------------------------------------------
  // GL program + buffer setup
  // ---------------------------------------------------------------------------
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

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);          // stays bound; buildMesh re-uploads into it

  const STRIDE = FLOATS_PER_VERT * 4;           // bytes
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  const aNor = gl.getAttribLocation(prog, 'a_normal');
  const aAo  = gl.getAttribLocation(prog, 'a_ao');
  const aBary = gl.getAttribLocation(prog, 'a_bary');
  gl.enableVertexAttribArray(aPos);  gl.vertexAttribPointer(aPos,  2, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(aNor);  gl.vertexAttribPointer(aNor,  3, gl.FLOAT, false, STRIDE, 8);
  gl.enableVertexAttribArray(aAo);   gl.vertexAttribPointer(aAo,   1, gl.FLOAT, false, STRIDE, 20);
  gl.enableVertexAttribArray(aBary); gl.vertexAttribPointer(aBary, 2, gl.FLOAT, false, STRIDE, 24);

  const uRes            = gl.getUniformLocation(prog, 'u_resolution');
  const uLightDir       = gl.getUniformLocation(prog, 'u_lightDir');
  const uBase           = gl.getUniformLocation(prog, 'u_base');
  const uFade           = gl.getUniformLocation(prog, 'u_fadeColor');
  const uShadowLevel    = gl.getUniformLocation(prog, 'u_shadowLevel');
  const uHighlightLevel = gl.getUniformLocation(prog, 'u_highlightLevel');
  const uAoFloor        = gl.getUniformLocation(prog, 'u_aoFloor');
  const uVignette       = gl.getUniformLocation(prog, 'u_vignette');
  const uGlint          = gl.getUniformLocation(prog, 'u_glint');
  const uGlintStrength  = gl.getUniformLocation(prog, 'u_glintStrength');

  // Colours + tone-mapping stay controllable from CSS, and the SAME tokens flip
  // per theme (dark default + light override block), so re-reading them is also how
  // a theme switch is applied. Colours go through a throwaway element so var()
  // resolves to the active theme's value; the scalars are plain custom properties
  // read off :root. The mesh is theme-independent, so a switch never rebuilds it.
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
    gl.uniform3fv(uBase, rgb('--bg-poly'));
    gl.uniform3fv(uFade, rgb('--bg-fade'));
    gl.uniform3fv(uGlint, rgb('--bg-glint'));
    probe.remove();
    const num = (name, fallback) => {
      const v = parseFloat(getComputedStyle(rootEl).getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    gl.uniform1f(uShadowLevel,    num('--bg-shadow-level',    0.42));
    gl.uniform1f(uHighlightLevel, num('--bg-highlight-level', 1.18));
    gl.uniform1f(uAoFloor,        num('--bg-ao-floor',        0.55));
    gl.uniform1f(uVignette,       num('--bg-vignette',        0.45));
    gl.uniform1f(uGlintStrength,  num('--bg-glint-strength',  0.5));
  }
  applyTheme();

  // DPR capped at 2: the facets have hard edges, so some device-pixel density
  // helps crispness, but the fragment shader is a single dot product — cheap
  // enough that 2× is fine while still sparing huge 3×+ phone buffers.
  const DPR_CAP = 2;
  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    // Size to the canvas's CSS box (100vw/100vh), not innerWidth/innerHeight: on
    // iOS Safari innerHeight changes as the toolbar shows/hides while scrolling,
    // which would rebuild the mesh mid-scroll. The vh-based CSS box stays constant
    // through those transitions, so the mesh holds still.
    const w = Math.floor(canvas.clientWidth  * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      buildMesh(w, h);                          // regenerate the mesh for the new size
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // light direction from a wander phase
  function setLight(phase){
    const a = LIGHT_BASE_ANGLE + LIGHT_WANDER_AMP * Math.sin(phase);
    let x = Math.cos(a) * LIGHT_XY_RADIUS, y = Math.sin(a) * LIGHT_XY_RADIUS, z = LIGHT_Z;
    const inv = 1 / Math.hypot(x, y, z);
    gl.uniform3f(uLightDir, x * inv, y * inv, z * inv);
  }
  function draw(){ gl.drawArrays(gl.TRIANGLES, 0, vertexCount); }

  // Theme switch (or live OS change on 'auto'): re-read the palette/tone uniforms
  // and repaint. Cheap — no mesh rebuild. The draw() covers the reduced-motion
  // case (no loop running); in the animated case the next frame would repaint
  // anyway, so the extra draw is harmless.
  window.addEventListener('themechange', () => { applyTheme(); draw(); });

  if(reduceMotion){
    setLight(0);                                // single still frame at the base angle
    draw();
    return;
  }

  // Cap at ~60fps: the wander is slow and low-frequency, so 120Hz+ displays gain
  // nothing from extra frames. Small tolerance absorbs vsync timestamp jitter.
  const FRAME_MIN_MS = 1000 / 60 - 4;
  let phase = 0, scrollVel = 0, lastScrollY = window.scrollY;
  let last = performance.now(), rafId = 0;

  function frame(now){
    rafId = requestAnimationFrame(frame);
    if(now - last < FRAME_MIN_MS) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // scroll speed (px since last frame), eased so the light's speed-up is smooth
    const sy = window.scrollY;
    const inst = Math.abs(sy - lastScrollY);
    lastScrollY = sy;
    scrollVel += (inst - scrollVel) * (1 - Math.exp(-SCROLL_VEL_EASE * dt));

    // phase advances at a slow idle rate, faster the quicker you scroll
    phase += dt * (LIGHT_BASE_SPEED + SCROLL_LIGHT_GAIN * scrollVel);
    setLight(phase);
    draw();
  }

  // Stop the loop while the tab is hidden: a WebGL canvas that keeps rendering
  // holds GPU process memory resident (what trips Safari's "used a lot of memory"
  // reload). On return, reset `last`/`lastScrollY` so the paused gap doesn't dump
  // into dt or read as one huge scroll jump.
  function start(){
    if(!rafId){ last = performance.now(); lastScrollY = window.scrollY; rafId = requestAnimationFrame(frame); }
  }
  function stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId = 0; } }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  if(!document.hidden) start();
})();
