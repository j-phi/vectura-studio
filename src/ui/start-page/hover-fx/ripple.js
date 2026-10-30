/**
 * Start Page hover effect: Pressure Ripple (id "ripple").
 * Ported from mockup shared/fx-b.js per specs/HOVERFX-V2-SPEC.md. Registers on StartPageHoverFxCore;
 * loaded lazily by hover-fx/index.js only when this effect is chosen.
 */
(() => {
  'use strict';
  const VH = window.Vectura && window.Vectura.StartPageHoverFxCore; if (!VH) return;
  const { register } = VH;
  const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hash = (a, b) => ((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 2246822519)) >>> 0) / 4294967296;
  /* ------------------------------------------------------------------ shared per-ctx cache (survives effect switches) */
  const CACHE = new WeakMap();
  const shared = ctx => { let c = CACHE.get(ctx); if (!c) { c = {}; CACHE.set(ctx, c); } return c; };
  /* ------------------------------------------------------------------ GLSL helpers shared by Set B */
  const GL_B = `
#define PI 3.14159265
vec3 restCol(vec2 p){ return mix(uPaper, inkAt(p), artCoverage(stageToArtUV(p))); }
/* sign-free stroke normal from the flow texture (doubled angle) */
vec2 flowNormal(sampler2D fl, vec2 suv){ vec2 d = texture2D(fl, suv).rg * 2. - 1.; float th = .5 * atan(d.y, d.x + 1e-6); return vec2(-sin(th), cos(th)); }
/* RGBA8 signed decode with an exactly representable zero (128) */
vec2 dec8(vec2 t, float range){ return (t * 255. - 128.) / 127. * range; }
/* paper tone must never reveal the type panels (solid paper backgrounds + paper glow): soft rounded-rect mask */
uniform vec4 uPanel[6]; uniform float uNPanel;
float panelMask(vec2 p){ float m = 0.; for (int i = 0; i < 6; i++) { if (float(i) >= uNPanel) break; vec4 r = uPanel[i]; vec2 d = abs(p - r.xy - r.zw * .5) - r.zw * .5; float sd = length(max(d, 0.)) + min(max(d.x, d.y), 0.); m = max(m, 1. - smoothstep(0., 60., sd)); } return m; }
`;
  /* opaque-background type panels (cover lines, "on the cover" card, pill), measured once per init/resize (no per-frame DOM) */
  const PANEL_SEL = '[data-sp-keepout]';
  function panels(ctx) {
    const sh = shared(ctx), out = new Float32Array(24); let n = 0;
    try {
      const sr = ctx.stage.getBoundingClientRect();
      ctx.stage.querySelectorAll(PANEL_SEL).forEach(el => {
        if (n >= 6 || el.closest('.sp-hfx-wrap')) return; const bg = getComputedStyle(el).backgroundColor, m = bg && bg.match(/rgba?\(([^)]+)\)/);
        const al = m ? (m[1].split(/[\s,/]+/)[3] == null ? 1 : parseFloat(m[1].split(/[\s,/]+/)[3])) : 0; if (!(al > 0.5)) return;
        const r = el.getBoundingClientRect(); if (!r.width) return; out.set([r.left - sr.left, r.top - sr.top, r.width, r.height], n * 4); n++;
      });
    } catch (e) { /* no DOM */ }
    sh.panels = { rects: out, n }; return sh.panels;
  }
  function setPanels(ctx, P) { const pn = shared(ctx).panels || panels(ctx); ctx.gl.uniform4fv(P.U.uPanel, pn.rects); P.set('uNPanel', pn.n); }
  /* CPU twin of dec8 */
  const enc8 = (v, range) => clamp(Math.round(128 + v / range * 127), 1, 255);

  function setTex(gl, unit, tex, P, name) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); P.int(name, unit); }
  function prep(ctx) { const gl = ctx.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); gl.disable(gl.BLEND); }

  /* ==================================================================================================
   * 3 · PRESSURE RIPPLE · GPU damped wave equation (9-point isotropic Laplacian), fixed 300 substeps/s,
   * reflective edges; refracts the art by ∇h and lights crest faces in paper/ink terms.
   * ================================================================================================== */
  const RIPPLE_RATE = 300, RIPPLE_HALF = 0.9, RIPPLE_RANGE = 22;
  const FS_RSTEP = `varying vec2 vUV; uniform sampler2D uSim; uniform vec2 uTexel; uniform float uC2, uDamp, uPacked; uniform vec4 uImp[8]; uniform float uNImp;
float d16(vec2 c){ return dot(floor(c * 255. + .5), vec2(256., 1.)) / 65535. * 4. - 2.; }
vec2 e16(float v){ float x = floor(clamp((v + 2.) / 4., 0., 1.) * 65535. + .5); float hi = floor(x / 256.); return vec2(hi, x - hi * 256.) / 255.; }
vec2 dec(vec4 t){ return uPacked > .5 ? vec2(d16(t.rg), d16(t.ba)) : t.rg; }
vec4 enc(vec2 v){ return uPacked > .5 ? vec4(e16(v.x), e16(v.y)) : vec4(v, 0., 1.); }
float H(vec2 o){ return dec(texture2D(uSim, vUV + o * uTexel)).x; }
void main(){
  vec2 c = dec(texture2D(uSim, vUV));
  float lap = (4. * (H(vec2(-1,0)) + H(vec2(1,0)) + H(vec2(0,-1)) + H(vec2(0,1))) + H(vec2(-1,-1)) + H(vec2(1,-1)) + H(vec2(-1,1)) + H(vec2(1,1)) - 20. * c.x) / 6.;
  float h = 2. * c.x - c.y + uC2 * lap - uDamp * (c.x - c.y);
  vec2 p = vUV * uStage;
  for (int i = 0; i < 8; i++) { if (float(i) >= uNImp) break; vec4 im = uImp[i]; vec2 d = (p - im.xy) / im.z; h += im.w * exp(-dot(d, d)); }
  gl_FragColor = enc(vec2(clamp(h, -1.9, 1.9), c.x));
}`;
  /* displacement + light at sim res → RGBA8 (R,G = D px, B = lit slope), linear-filtered by the composite */
  const FS_RDISP = `varying vec2 vUV; uniform sampler2D uSim; uniform vec2 uTexel; uniform float uPacked, uGain, uCell, uRange;
float d16(vec2 c){ return dot(floor(c * 255. + .5), vec2(256., 1.)) / 65535. * 4. - 2.; }
float H(vec2 o){ vec4 t = texture2D(uSim, vUV + o * uTexel); return uPacked > .5 ? d16(t.rg) : t.r; }
void main(){
  vec2 g = vec2(H(vec2(1,0)) - H(vec2(-1,0)), H(vec2(0,1)) - H(vec2(0,-1))) / (2. * uCell);   // per px
  vec2 D = -g * uGain; float m = length(D); D *= uRange * .9 * (1. - exp(-m / (uRange * .9))) / max(m, 1e-5); // soft cap: far ripples stay visible, near ones never tear
  float lit = clamp(dot(-g, normalize(vec2(-.55, -.83))) * uGain * .16, -1., 1.);
  gl_FragColor = vec4((128. + D / uRange * 127.) / 255., (128. + lit * 127.) / 255., 1.);
}`;
  const FS_RCOMP = GL_B + `varying vec2 vUV; uniform sampler2D uDisp; uniform float uRange, uStr;
void main(){
  vec2 p = vUV * uStage; vec4 t = texture2D(uDisp, vUV);
  float K = keepOut(p), ks = mix(1., .35, K);
  vec2 D = dec8(t.rg, uRange) * mix(1., .55, K);
  float lit = dec8(t.bb, 1.).x * uStr;
  vec2 q = p - D; float a = artCoverage(stageToArtUV(q));
  float hi = pow(max(lit, 0.), 1.4) * ks, lo = max(-lit, 0.) * ks, pk = 1. - panelMask(p);
  vec3 paper = mix(uPaper, uSheen, .34 * hi * pk); paper = mix(paper, uUnder, .16 * lo * pk);
  vec3 ink = inkAt(q); ink = mix(ink, uBright, (uDark > .5 ? .34 : .14) * hi); ink = mix(ink, ink * .82, .10 * lo * (1. - uDark));
  gl_FragColor = vec4(mix(paper, ink, a), 1.);
}`;

  function rippleSim(ctx) {
    const s = ctx.state;
    if (s.pp) { s.pp.dispose(); s.dt2 && s.dt2.dispose(); }
    const cols = Math.round(clamp(ctx.W / 5, 96, 256) * (ctx.quality.field || 1)), rows = Math.max(24, Math.round(cols * ctx.H / ctx.W));
    s.cols = cols; s.rows = rows; s.cell = ctx.W / cols;
    s.pp = ctx.pingpong(cols, rows, { float: true, linear: false }); s.packed = s.pp.read.float ? 0 : 1;
    s.dt2 = ctx.target(cols, rows, { linear: true });
    rippleClear(ctx);
  }
  function rippleClear(ctx) {
    const s = ctx.state, gl = ctx.gl; /* packed zero encodes as (128, 0) per 16-bit pair */
    for (const t of [s.pp.read, s.pp.write]) { t.bind(); if (s.packed) gl.clearColor(128 / 255, 0, 128 / 255, 0); else gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    s.dt2.bind(); gl.clearColor(128 / 255, 128 / 255, 128 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); s.clean = true; s.E = 0;
  }
  function rippleStep(ctx, n) {
    const s = ctx.state, gl = ctx.gl;
    const cCells = 0.55 * ctx.W / s.cell / RIPPLE_RATE, damp = 2 * Math.LN2 / ((s.half || RIPPLE_HALF) * RIPPLE_RATE);
    const P = ctx.bind(s.pStep); P.set('uTexel', [1 / s.cols, 1 / s.rows]).set('uC2', cCells * cCells).set('uDamp', damp).set('uPacked', s.packed);
    gl.disable(gl.BLEND);
    for (let k = 0; k < n; k++) {
      P.set('uNImp', k === 0 ? s.nImp : 0); if (k === 0 && s.nImp) gl.uniform4fv(P.U.uImp, s.imp);
      s.pp.write.bind(); setTex(gl, 2, s.pp.read.tex, P, 'uSim'); ctx.quad(P); s.pp.swap();
    }
    s.nImp = 0;
  }
  function rippleDisp(ctx) {
    const s = ctx.state, gl = ctx.gl;
    const P = ctx.bind(s.pDisp); P.set('uTexel', [1 / s.cols, 1 / s.rows]).set('uPacked', s.packed).set('uGain', s.gain).set('uCell', s.cell).set('uRange', RIPPLE_RANGE);
    s.dt2.bind(); setTex(gl, 2, s.pp.read.tex, P, 'uSim'); ctx.quad(P);
  }
  function rippleComp(ctx, str) {
    const s = ctx.state, gl = ctx.gl; prep(ctx);
    const P = ctx.bind(s.pComp); P.set('uRange', RIPPLE_RANGE).set('uStr', str == null ? 1 : str); setPanels(ctx, P); setTex(gl, 2, s.dt2.tex, P, 'uDisp'); ctx.quad(P);
  }
  function ripplePush(ctx, x, y, r, amp) {
    const s = ctx.state; if (s.nImp >= 8) { /* merge into the strongest slot */ s.imp[3] += amp * 0.5; return; }
    const b = s.nImp * 4; s.imp[b] = x; s.imp[b + 1] = y; s.imp[b + 2] = r; s.imp[b + 3] = amp; s.nImp++; s.E = Math.min(1.2, s.E + Math.abs(amp)); s.clean = false;
  }

  register({
    id: 'ripple', name: 'Pressure Ripple', set: 'B', order: 3,
    blurb: 'The sheet turns to water: pressure waves roll out from your hand, refract every line, reflect off the edges and interfere.',
    init(ctx) {
      const s = ctx.state; s.imp = new Float32Array(32); s.nImp = 0; s.E = 0; s.acc = 0; s.lastImp = -1; s.travel = 0; s.lx = null; s.ly = null; s.downT = -9;
      s.gain = 820;
      s.pStep = ctx.program(ctx.VS.quad, FS_RSTEP); s.pDisp = ctx.program(ctx.VS.quad, FS_RDISP); s.pComp = ctx.program(ctx.VS.quad, FS_RCOMP);
      rippleSim(ctx); panels(ctx);
    },
    resize(ctx) { rippleSim(ctx); panels(ctx); }, quality(ctx) { rippleSim(ctx); },
    pointer(ctx, ev) {
      const s = ctx.state, t = ctx.t;
      if (ev.type === 'down' || ev.type === 'tap') { if (t - s.downT > 0.25) { ripplePush(ctx, ev.x, ev.y, 26, 1.1); s.downT = t; } return; }
      if (ev.type === 'flick') { if (t - s.downT > 0.3) { ripplePush(ctx, ev.x, ev.y, 30, 0.85 * Math.max(0.4, ctx.k)); s.downT = t; } return; }
      if (ev.type === 'enter') { s.lx = ev.x; s.ly = ev.y; ripplePush(ctx, ev.x, ev.y, 30, 0.45); s.lastImp = t; return; }
      if (ev.type !== 'move') return;
      if (s.lx == null) { s.lx = ev.x; s.ly = ev.y; }
      s.travel += Math.hypot(ev.x - s.lx, ev.y - s.ly); s.lx = ev.x; s.ly = ev.y;
      /* a wake along the path: impulses every ~16 px, capped at 30/s, scaled by speed */
      if (s.travel > 16 && t - s.lastImp > 1 / 30) {
        const amp = clamp(ev.speed / 1700, 0.07, 0.62) * 0.55 * Math.max(0.2, ctx.k);
        ripplePush(ctx, ev.x, ev.y, 24, amp); s.travel = 0; s.lastImp = t;
      }
    },
    frame(ctx, dt) {
      const s = ctx.state;
      /* once the hand has gone the water settles faster, so the sheet is at rest well inside the 2.6 s teardown window */
      s.half = ctx.on ? RIPPLE_HALF : RIPPLE_HALF * 0.45;
      if (s.E < 0.04 && !s.nImp) { if (!s.clean) rippleClear(ctx); prep(ctx); ctx.drawArt({ paper: true }); return 0; }
      s.acc += dt * RIPPLE_RATE; let n = Math.floor(s.acc); s.acc -= n; n = Math.min(n, 12); if (s.nImp && n < 1) { n = 1; }
      if (n) rippleStep(ctx, n);
      rippleDisp(ctx); rippleComp(ctx);
      s.E *= Math.pow(0.5, dt / s.half);
      return s.E;
    },
    idle(ctx) { return ctx.state.E < 0.05; },
    reducedMotion(ctx) {
      /* a single static interference still: one impulse at the pointer, solved to t = 0.7 s */
      const s = ctx.state; rippleClear(ctx); ripplePush(ctx, ctx.pointer.sx, ctx.pointer.sy, 28, 1.0);
      rippleStep(ctx, Math.round(0.7 * RIPPLE_RATE)); rippleDisp(ctx); rippleComp(ctx, 0.8); s.E = 0; s.clean = false;
    },
    dispose(ctx) { const s = ctx.state; if (s.pp) s.pp.dispose(); if (s.dt2) s.dt2.dispose(); }
  });
})();
