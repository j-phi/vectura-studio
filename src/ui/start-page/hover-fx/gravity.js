/**
 * Start Page hover effect: Gravity Well (id "gravity").
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
  function setTex(gl, unit, tex, P, name) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); P.int(name, unit); }
  function prep(ctx) { const gl = ctx.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); gl.disable(gl.BLEND); }
  /* ==================================================================================================
   * 10 · GRAVITY WELL · forward mesh warp (P3b): every vertex of a fine plane is pulled toward a heavy,
   * spring-followed mass by a softened inverse-distance law, plus a frame-dragging swirl from the motion.
   * Fold-over-free (|∇D| < .7), the type rects calm the pull, release springs back with an elastic overshoot.
   * ================================================================================================== */
  const VS_GRAV = `attribute vec2 aUV; uniform vec4 uMeshRect; uniform vec4 uWell; uniform vec2 uVel; uniform float uSwirl, uCap;
varying vec2 vUV; varying vec2 vStage; varying float vComp;
vec2 Dat(vec2 p){
  vec2 d = p - uWell.xy; float r2 = dot(d, d);
  vec2 D = -uWell.z * d / pow(r2 + uWell.w * uWell.w, .75);
  float cr = uVel.x * d.y - uVel.y * d.x;                      // (v × d)_z
  D += uSwirl * cr * vec2(-d.y, d.x) / pow(r2 + 4. * uWell.w * uWell.w, 1.25);
  float m = length(D); D *= uCap * (1. - exp(-m / uCap)) / max(m, 1e-4);
  return D;
}
void main(){
  vec2 p = uMeshRect.xy + aUV * uMeshRect.zw; vec2 D = Dat(p);
  vec2 ex = Dat(p + vec2(6., 0.)) - D, ey = Dat(p + vec2(0., 6.)) - D;
  vComp = 1. - (1. + ex.x / 6.) * (1. + ey.y / 6.) + (ex.y / 6.) * (ey.x / 6.);  // 1 - det J  (> 0 where lines crowd)
  vStage = p; vUV = (p - uArtRect.xy) / uArtRect.zw;
  vec2 o = p + D; gl_Position = vec4(o.x / uStage.x * 2. - 1., 1. - o.y / uStage.y * 2., 0., 1.);
}`;
  const FS_GRAV = `varying vec2 vUV; varying vec2 vStage; varying float vComp;
void main(){ float a = artCoverage(vUV); vec3 ink = inkAt(vStage);
  ink = mix(ink, uBright, uDark * clamp(vComp, 0., 1.) * .5 * keepScale(vStage));
  gl_FragColor = vec4(mix(uPaper, ink, a), 1.); }`;
  register({
    id: 'gravity', name: 'Gravity Well', set: 'B', order: 10,
    blurb: 'Your pointer becomes a mass: every stroke on the sheet leans toward it, curls in its wake and springs back elastically.',
    init(ctx) {
      const s = ctx.state, P = ctx.pointer;
      s.mx = ctx.Spring({ x: P.sx || ctx.W / 2, f: 2.5, z: 0.7 }); s.my = ctx.Spring({ x: P.sy || ctx.H / 2, f: 2.5, z: 0.7 });
      s.G = ctx.Spring({ x: 0, f: 0.9, z: 0.9 }); s.sw = ctx.Spring({ x: 0, f: 1.5, z: 0.55 });
      s.vx = ctx.Spring({ f: 1.6, z: 0.6 }); s.vy = ctx.Spring({ f: 1.6, z: 0.6 });
      s.mesh = ctx.mesh(Math.round(120 * (ctx.quality.mesh || 1)), Math.round(76 * (ctx.quality.mesh || 1)));
      s.prog = ctx.program(VS_GRAV, FS_GRAV); s.on = false;
    },
    quality(ctx) { const s = ctx.state; s.mesh.dispose(); s.mesh = ctx.mesh(Math.round(120 * ctx.quality.mesh), Math.round(76 * ctx.quality.mesh)); },
    frame(ctx, dt) {
      const s = ctx.state, P = ctx.pointer, gl = ctx.gl, sc = Math.min(1.3, Math.max(0.65, Math.min(ctx.W, ctx.H) / 620));
      const soft = 90 * sc, cap = 36 * sc, Gmax = 551 * Math.pow(sc, 1.5);
      if (ctx.on !== s.on) { s.on = ctx.on; if (ctx.on) { s.G.f = 0.9; s.G.z = 0.9; if (Math.abs(s.G.x) < 1) { s.mx.snap(P.sx); s.my.snap(P.sy); } } else { s.G.f = 1.6; s.G.z = 0.38; } }
      s.G.target = ctx.on ? Gmax * ctx.k : 0;
      if (ctx.on) { s.mx.target = P.sx; s.my.target = P.sy; }
      s.mx.step(dt); s.my.step(dt); s.G.step(dt);
      s.vx.target = ctx.on ? clamp(P.vx, -2500, 2500) : 0; s.vy.target = ctx.on ? clamp(P.vy, -2500, 2500) : 0; s.vx.step(dt); s.vy.step(dt);
      s.sw.target = ctx.on ? 1 : 0; s.sw.step(dt);
      prep(ctx); ctx.clearSurface(ctx.pal.gl.paper);
      const Pr = ctx.bind(s.prog);
      Pr.set('uWell', [s.mx.x, s.my.x, s.G.x, soft]).set('uVel', [s.vx.x, s.vy.x]).set('uSwirl', 0.55 * s.sw.x * sc * sc).set('uCap', cap);
      const pad = cap * 1.6; s.mesh.draw(Pr, [-pad, -pad, ctx.W + pad * 2, ctx.H + pad * 2]);
      return Math.abs(s.G.x) / Gmax * 40 + Math.abs(s.G.v) / Gmax * 6 + (Math.abs(s.vx.x) + Math.abs(s.vy.x)) * s.sw.x * 0.01;
    },
    idle(ctx) { const s = ctx.state; return !ctx.on && Math.abs(s.G.x) < 1.5 && Math.abs(s.G.v) < 6 && Math.abs(s.vx.x) + Math.abs(s.vy.x) < 4; },
    reducedMotion(ctx) {
      const s = ctx.state, P = ctx.pointer, gl = ctx.gl, sc = Math.min(1.3, Math.max(0.65, Math.min(ctx.W, ctx.H) / 620));
      prep(ctx); ctx.clearSurface(ctx.pal.gl.paper);
      const Pr = ctx.bind(s.prog); Pr.set('uWell', [P.sx, P.sy, 551 * Math.pow(sc, 1.5) * 0.4, 90 * sc]).set('uVel', [0, 0]).set('uSwirl', 0).set('uCap', 36 * sc);
      s.mesh.draw(Pr, [-60, -60, ctx.W + 120, ctx.H + 120]);
    },
    dispose(ctx) { if (ctx.state.mesh) ctx.state.mesh.dispose(); }
  });
})();
