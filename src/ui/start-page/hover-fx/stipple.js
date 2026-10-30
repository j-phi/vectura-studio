/**
 * Start Page hover effect: Stipple Weather (id "stipple").
 * Ported from mockup shared/fx-c.js per specs/HOVERFX-V2-SPEC.md. Registers on StartPageHoverFxCore;
 * loaded lazily by hover-fx/index.js only when this effect is chosen.
 */
(() => {
  'use strict';
  const VH = window.Vectura && window.Vectura.StartPageHoverFxCore; if (!VH) return;
  const { register } = VH, TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* grid dims over the stage at the stage's aspect */
  const dims = (ctx, base) => { const c = Math.max(24, Math.round(base * (ctx.quality.field || 1))); return [c, Math.max(14, Math.round(c * ctx.H / Math.max(1, ctx.W)))]; };

  /* ---------------------------------------------------------------- shared GLSL */
  const G_NOISE = `
float c_h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float c_vn(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(c_h21(i), c_h21(i + vec2(1., 0.)), f.x), mix(c_h21(i + vec2(0., 1.)), c_h21(i + vec2(1., 1.)), f.x), f.y); }
`;
  /* Stipple dissolve: identical in the line pass and the dot pass, so dots appear exactly where lines erode */
  const G_DISSOLVE = `
float c_dissolve(vec2 p, float M, float t){
  float n = fbm(p * .0042 + vec2(t * .021, -t * .013));
  float n2 = snoise(p * .016 + vec2(-t * .03, t * .04));
  return smoothstep(.15, .6, M * (.7 + .6 * clamp(.5 + .8 * n, 0., 1.)) + .07 * n2);
}
`;
  /* ---------------------------------------------------------------- P5 helper: coarse curl-noise wind grid */
  /* CurlGrid: divergence-free 2-octave curl noise on a small grid over the stage, unit-ish magnitude.
     sample(x,y,out) bilinear in stage px; upload() → RGBA8 texture (RG = v*0.5+0.5). */
  function CurlGrid(ctx, cols, rows, freq, speed) {
    const g = { cols, rows, vx: new Float32Array(cols * rows), vy: new Float32Array(cols * rows), tex: null, bytes: new Uint8Array(cols * rows * 4) };
    const N = ctx.noise;
    g.update = t => {
      const W = ctx.W, H = ctx.H, e = 0.35;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) / cols * W * freq + t * speed, y = (j + 0.5) / rows * H * freq - t * speed * 0.7;
        const dy = N.simplex2(x, y + e) - N.simplex2(x, y - e) + 0.5 * (N.simplex2(x * 2.3 + 7, y * 2.3 + e * 2.3) - N.simplex2(x * 2.3 + 7, y * 2.3 - e * 2.3));
        const dx = N.simplex2(x + e, y) - N.simplex2(x - e, y) + 0.5 * (N.simplex2(x * 2.3 + 7 + e * 2.3, y * 2.3) - N.simplex2(x * 2.3 + 7 - e * 2.3, y * 2.3));
        const k = j * cols + i; g.vx[k] = dy / (2 * e) * 0.45; g.vy[k] = -dx / (2 * e) * 0.45;
      }
    };
    g.sample = (x, y, out) => {
      const gx = clamp(x / ctx.W * cols - 0.5, 0, cols - 1.001), gy = clamp(y / ctx.H * rows - 0.5, 0, rows - 1.001), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, a = j * cols + i;
      out[0] = (g.vx[a] * (1 - fx) + g.vx[a + 1] * fx) * (1 - fy) + (g.vx[a + cols] * (1 - fx) + g.vx[a + cols + 1] * fx) * fy;
      out[1] = (g.vy[a] * (1 - fx) + g.vy[a + 1] * fx) * (1 - fy) + (g.vy[a + cols] * (1 - fx) + g.vy[a + cols + 1] * fx) * fy;
      return out;
    };
    g.upload = (ox, oy) => {
      const gl = ctx.gl; if (!gl) return null; const B = g.bytes;
      for (let k = 0, n = cols * rows; k < n; k++) { B[k * 4] = clamp((g.vx[k] + (ox || 0)) * 127.5 + 127.5, 0, 255); B[k * 4 + 1] = clamp((g.vy[k] + (oy || 0)) * 127.5 + 127.5, 0, 255); B[k * 4 + 2] = 0; B[k * 4 + 3] = 255; }
      if (!g.tex) g.tex = ctx.texture({ w: cols, h: rows, linear: true });
      gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, B); return g.tex;
    };
    g.dispose = () => { if (g.tex && ctx.gl) ctx.gl.deleteTexture(g.tex); g.tex = null; };
    return g;
  }
  /* bind a texture to unit u and point sampler `name` at it */
  function tex(ctx, P, name, t, u) { const gl = ctx.gl; gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); P.int(name, u); }
  /* upload a field's texture on unit 7 so the core's units 0/1 keep their bindings */
  function upload(ctx, f) { ctx.gl.activeTexture(ctx.gl.TEXTURE7); return f.upload(); }
  /* =================================================================== 5 · STIPPLE WEATHER */
  /* The pointer paints a dissolve field M (P5) that diffuses and is carried by a slow curl-noise wind plus a mean
     drift that turns toward the direction of travel. Inside M the lines erode (grain-dithered, so they break into
     fragments rather than fading) and ~15k pen dots (P8, seeded along the strokes) take over, drifting on the same
     wind. M's edge is fbm-modulated at two scales, so the region is a cloud, never a disc. As M decays the dots
     slide home (offset ∝ M^1.4) and the lines re-stitch. */
  const ST_FS = G_NOISE + G_DISSOLVE + `
varying vec2 vUV; uniform sampler2D uM; uniform float uMhi, uT;
void main(){
  vec2 p = vUV * uStage;
  float M = texture2D(uM, vUV).r * uMhi;
  float d = c_dissolve(p, M, uT);
  float a = artCoverage(stageToArtUV(p));
  float g = c_vn(p / 2.3) * .9 + .1;
  float keep = smoothstep(d * 1.2 - .08, d * 1.2 + .08, g);
  gl_FragColor = vec4(mix(uPaper, inkAt(p), a * keep), 1.);
}`;
  const ST_VS = (vtf) => (vtf ? '' : '#define CPU_FIELD 1\n') + G_DISSOLVE + `
attribute vec4 aD;            // origin x, y (stage px), hash, ink2 flag
#ifdef CPU_FIELD
attribute vec4 aF;            // M, wind x, wind y, keep-out
#else
uniform sampler2D uM, uWind, uKeep;
#endif
uniform float uMhi, uT, uDpr, uDrift, uDark, uSz;
uniform vec3 uInk, uInk2, uBright; uniform vec4 uDuo; uniform vec2 uMean;
varying vec4 vC; varying float vR; varying float vS;
vec2 c_curl(vec3 q){ float e = .5;
  float a = snoise(q + vec3(0., e, 0.)), b = snoise(q - vec3(0., e, 0.)), c = snoise(q + vec3(e, 0., 0.)), d = snoise(q - vec3(e, 0., 0.));
  return vec2(a - b, -(c - d)) / (2. * e); }
void main(){
  vec2 o = aD.xy, uv = o / uStage; float h = aD.z;
#ifdef CPU_FIELD
  float M = aF.x; vec2 w = aF.yz; float K = aF.w;
#else
  float M = texture2D(uM, uv).r * uMhi; vec2 w = texture2D(uWind, uv).rg * 2. - 1.; float K = 0.;
#endif
  float d = c_dissolve(o, M, uT);
  float vis = smoothstep(h * .85, h * .85 + .12, d);
  if (vis < .003) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vC = vec4(0.); vR = 0.; vS = 1.; return; }
  float m = pow(clamp(M, 0., 1.3), 1.4);
  vec2 c = c_curl(vec3(o * .0045, uT * .05));
  vec2 cf = c_curl(vec3(o * .021 + h * 2.3, uT * .16 + h));
  vec2 off = m * (c * 22. + (w + uMean) * 26. + cf * 7.) * uDrift;
  vec2 pos = o + off;
#ifndef CPU_FIELD
  K = texture2D(uKeep, pos / uStage).r;
#endif
  vec2 cl = pos / uStage * 2. - 1.; gl_Position = vec4(cl.x, -cl.y, 0., 1.);
  float sz = (.9 + .9 * fract(h * 7.31)) * uSz;
  vS = (sz + 1.6) * uDpr; gl_PointSize = vS; vR = sz * uDpr * .5;
  vec2 dd = uDuo.zw - uDuo.xy; float tt = clamp(dot(o - uDuo.xy, dd) / max(1., dot(dd, dd)), 0., 1.);
  vec3 ink = mix(mix(uInk, uInk2, tt), uInk2, aD.w);
  ink = mix(ink, uBright, uDark * .38 * smoothstep(.55, 1.2, M));
  vC = vec4(ink, vis * (.7 + .3 * fract(h * 13.7)) * mix(1., .35, K));
}`;
  const ST_DOT_FS = `varying vec4 vC; varying float vR; varying float vS;
void main(){ float r = length(gl_PointCoord - .5) * vS; float a = (1. - smoothstep(vR - .55, vR + .55, r)) * vC.a; gl_FragColor = vec4(vC.rgb * a, a); }`;

  function stSeed(ctx, s) {
    /* dots are distributed by arc length (not per sample), so dense pieces get proportionally more dots */
    const S = ctx.samples, n = S.n, coarse = matchMedia && matchMedia('(pointer: coarse)').matches, MAX = coarse ? 8000 : 24000;
    const R = rng(91), lw = Math.max(0.8, ctx.art.lw || 1);
    let sp = 0, sc = 0; for (let i = 0; i < n; i++) { const j = S.next(i); if (j >= 0) { sp += Math.hypot(S.x[j] - S.x[i], S.y[j] - S.y[i]); sc++; } }
    const spacing = sc ? sp / sc : 4, total = Math.max(1, sp + (n - sc) * spacing), pitch = Math.max(1.6, total / MAX);
    if (!s.dots) s.dots = ctx.particles(MAX, 4);
    const D = s.dots.data; let k = 0, carry = 0;
    for (let i = 0; i < n && k < MAX; i++) {
      const j = S.next(i); let seg = j >= 0 ? Math.hypot(S.x[j] - S.x[i], S.y[j] - S.y[i]) : spacing; if (seg > spacing * 3) seg = spacing;
      carry += seg / pitch; const per = Math.floor(carry); carry -= per;
      for (let q = 0; q < per && k < MAX; q++, k++) {
        const u = (q + R()) / per, jit = (R() - 0.5) * 1.2 * lw, b = k * 4;
        D[b] = S.x[i] + S.tx[i] * u * seg - S.ty[i] * jit; D[b + 1] = S.y[i] + S.ty[i] * u * seg + S.tx[i] * jit;
        D[b + 2] = R(); D[b + 3] = R() < 0.15 ? 1 : 0;
      }
    }
    s.nd = k; s.dots.upload(k);
    if (!s.vtf) { if (!s.fbuf) { s.fdata = new Float32Array(MAX * 4); s.fbuf = ctx.gl.createBuffer(); ctx.gl.bindBuffer(ctx.gl.ARRAY_BUFFER, s.fbuf); ctx.gl.bufferData(ctx.gl.ARRAY_BUFFER, s.fdata.byteLength, ctx.gl.DYNAMIC_DRAW); } }
  }
  function stFields(ctx, s) {
    if (s.M) s.M.dispose(); if (s.curl) s.curl.dispose();
    const [c, r] = dims(ctx, 96); s.M = ctx.field(c, r, 1, { lo: 0, hi: 1.3 });
    s.curl = CurlGrid(ctx, 32, Math.max(12, Math.round(32 * ctx.H / ctx.W)), 0.0028, 0.035);
  }
  function stDraw(ctx, s, drift) {
    const gl = ctx.gl, M = upload(ctx, s.M);
    if (s.vtf) { gl.activeTexture(gl.TEXTURE7); s.curl.upload(); }
    let P = ctx.bind(s.lp); tex(ctx, P, 'uM', M, 2); P.set('uMhi', 1.3).set('uT', s.t);
    gl.disable(gl.BLEND); ctx.quad(P);
    if (s.maxM * 1.3 < 0.14 || !s.nd) return;
    P = ctx.bind(s.dp);
    if (s.vtf) { tex(ctx, P, 'uM', M, 2); tex(ctx, P, 'uWind', s.curl.tex, 3); }
    else {
      const F = s.fdata, Dd = s.dots.data, o = s.o2;
      for (let k = 0; k < s.nd; k++) { const x = Dd[k * 4], y = Dd[k * 4 + 1]; F[k * 4] = s.M.sample(x, y); s.curl.sample(x, y, o); F[k * 4 + 1] = o[0]; F[k * 4 + 2] = o[1]; F[k * 4 + 3] = ctx.keep ? ctx.keep.at(x, y) : 0; }
      gl.bindBuffer(gl.ARRAY_BUFFER, s.fbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, F.subarray(0, s.nd * 4));
      const a = P.A.aF; if (a != null) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 16, 0); }
    }
    P.set('uMhi', 1.3).set('uT', s.t).set('uDpr', ctx.dpr).set('uDrift', drift).set('uSz', Math.max(1, (ctx.art.lw || 1) * 0.9)).set('uMean', s.meanU);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    s.dots.draw(P, { aD: [4, 0] }, s.nd);
    if (!s.vtf && P.A.aF != null) gl.disableVertexAttribArray(P.A.aF);
  }
  register({
    id: 'stipple', name: 'Stipple Weather', set: 'C', order: 5,
    blurb: 'Lines dissolve into pen dots that drift away on a weather system, then re-form.',
    init(ctx) {
      const s = ctx.state, gl = ctx.gl;
      s.vtf = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) >= 4;
      s.lp = ctx.program(ctx.VS.quad, ST_FS); s.dp = ctx.program(ST_VS(s.vtf), ST_DOT_FS);
      stFields(ctx, s); stSeed(ctx, s);
      s.t = 0; s.maxM = 0; s.o2 = [0, 0]; s.mean = [5, -2]; s.meanU = new Float32Array([0, 0]); s.lx = null; s.ly = null; s.travel = 0;
      s.adv = (i, j, out) => { s.curl.sample((i + 0.5) * s.cw, (j + 0.5) * s.ch, out); out[0] = (out[0] * 25 + s.mean[0]) / s.cw; out[1] = (out[1] * 25 + s.mean[1]) / s.ch; };
    },
    resize(ctx) { stSeed(ctx, ctx.state); }, onArt(ctx) { stSeed(ctx, ctx.state); },
    quality(ctx) { stFields(ctx, ctx.state); },
    frame(ctx, dt) {
      const s = ctx.state, P = ctx.pointer, M = s.M; s.t += dt;
      s.cw = ctx.W / M.cols; s.ch = ctx.H / M.rows;
      /* mean drift: turns toward the direction of travel, relaxes to a gentle breeze */
      if (ctx.on && P.speed > 160) { const k = 1 - Math.exp(-dt * 1.2); s.mean[0] += (P.vx / P.speed * 22 - s.mean[0]) * k; s.mean[1] += (P.vy / P.speed * 22 - s.mean[1]) * k; }
      else { const k = 1 - Math.exp(-dt * 0.25); s.mean[0] += (5 - s.mean[0]) * k; s.mean[1] += (-2 - s.mean[1]) * k; }
      /* deposit along the smoothed path: sub-stepped so fast passes leave continuous streaks */
      if (ctx.on && ctx.k > 0) {
        const x = P.sx, y = P.sy, R = 0.07 * Math.min(ctx.W, ctx.H) + 30;
        if (s.lx == null) { s.lx = x; s.ly = y; }
        const dx = x - s.lx, dy = y - s.ly, L = Math.hypot(dx, dy), steps = Math.min(12, Math.ceil(L / (R * 0.4)));
        for (let q = 1; q <= steps; q++) {
          const px = s.lx + dx * q / steps, py = s.ly + dy * q / steps, nf = 0.55 + 0.9 * clamp(0.5 + ctx.noise.fbm2(px * 0.004, py * 0.004 + s.t * 0.07, 3), 0, 1);
          M.splat(px, py, R * (1 + Math.min(1, P.speed / 1600) * 0.5), (L / steps) * 0.0042 * nf * ctx.k, 0);
        }
        /* dwelling grows the cloud */
        const nf = 0.6 + 0.8 * clamp(0.5 + ctx.noise.fbm2(x * 0.004 + 3, y * 0.004 + s.t * 0.07, 3), 0, 1);
        M.splat(x, y, R * (1 + Math.min(P.dwell, 2.5) * 0.35), dt * 0.55 * nf * ctx.k, 0);
        s.lx = x; s.ly = y;
      } else { s.lx = null; }
      s.curl.update(s.t);
      M.advect(s.adv, dt);
      M.diffuse(clamp(0.12 * dt * 60, 0, 0.24));
      const active = ctx.on && P.idle < 0.6;
      M.decay(active ? 7 : ctx.on ? 2.8 : 0.8, dt);
      let mx = 0; const d = M.data, tail = active ? 0 : dt * (ctx.on ? 0.05 : 0.1);
      for (let i = 0; i < d.length; i++) { let v = d[i] - tail; v = v < 0 ? 0 : v > 1.3 ? 1.3 : v; d[i] = v; if (v > mx) mx = v; }
      s.maxM = mx; s.meanU[0] = s.mean[0] / 40; s.meanU[1] = s.mean[1] / 40;
      stDraw(ctx, s, 1);
      return mx;
    },
    idle(ctx) { return ctx.state.maxM * 1.3 < 0.14; },
    reducedMotion(ctx) {
      /* a static stipple patch: a noise-shaped cloud at the pointer, dissolved into dots in place */
      const s = ctx.state, M = s.M, P = ctx.pointer, R = 0.36 * Math.min(ctx.W, ctx.H), d = M.data, cw = ctx.W / M.cols, ch = ctx.H / M.rows;
      let mx = 0;
      for (let j = 0; j < M.rows; j++) for (let i = 0; i < M.cols; i++) {
        const x = (i + 0.5) * cw, y = (j + 0.5) * ch, r = Math.hypot(x - P.sx, y - P.sy) / R, n = ctx.noise.fbm2(x * 0.005, y * 0.005, 3);
        const v = clamp(1.25 * Math.exp(-r * r * 1.6) * (0.7 + 0.8 * n + 0.3), 0, 1.3); d[j * M.cols + i] = v; if (v > mx) mx = v;
      }
      s.maxM = mx; s.t = 0; s.meanU[0] = s.meanU[1] = 0; stDraw(ctx, s, 0); M.clear(); s.maxM = 0;
    },
    dispose(ctx) { const s = ctx.state; if (s.M) s.M.dispose(); if (s.curl) s.curl.dispose(); if (s.dots) s.dots.dispose(); if (s.fbuf) ctx.gl.deleteBuffer(s.fbuf); }
  });
})();
