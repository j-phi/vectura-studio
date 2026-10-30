/**
 * Start Page hover effect: Paper Breeze (id "breeze").
 * Ported from mockup shared/fx-a.js per specs/HOVERFX-V2-SPEC.md. Registers on StartPageHoverFxCore;
 * loaded lazily by hover-fx/index.js only when this effect is chosen.
 */
(() => {
  'use strict';
  const VH = window.Vectura && window.Vectura.StartPageHoverFxCore; if (!VH) return;
  const { register } = VH;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));

  /* ------------------------------------------------------------ matrices without allocation */
  function mulInto(o, a, b) { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function Cam() {
    const T1 = new Float32Array(16), RY = new Float32Array(16), RX = new Float32Array(16), T2 = new Float32Array(16), PR = new Float32Array(16), A = new Float32Array(16), B = new Float32Array(16), out = new Float32Array(16);
    /* same model as core mat4.tilt: stage px in, clip out; identity at rx=ry=0, scale 1 */
    return function (W, H, rx, ry, persp, sc, cx, cy) {
      cx = cx == null ? W / 2 : cx; cy = cy == null ? H / 2 : cy; sc = sc || 1;
      const cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry);
      T1.set([sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, -cx * sc, -cy * sc, 0, 1]);
      RY.set([cY, 0, -sY, 0, 0, 1, 0, 0, sY, 0, cY, 0, 0, 0, 0, 1]);
      RX.set([1, 0, 0, 0, 0, cX, sX, 0, 0, -sX, cX, 0, 0, 0, 0, 1]);
      T2.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx - W / 2, cy - H / 2, 0, 1]);
      PR.set([2 / W, 0, 0, 0, 0, -2 / H, 0, 0, 0, 0, -1 / (persp * 4), -1 / persp, 0, 0, 0, 1]);
      mulInto(A, RY, T1); mulInto(B, RX, A); mulInto(A, T2, B); return mulInto(out, PR, A);
    };
  }
  /* ------------------------------------------------------------ shared GLSL bits */
  const LUMA = `float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
/* light stock: tint toward a hue without ever getting lighter than the original ink (lines stay legible) */
vec3 noLighter(vec3 c, vec3 ref){ float l = luma(c), r = max(luma(ref) * 1.02, .12); return l > r ? c * (r / max(l, 1e-4)) : c; }`;
  const bindTex = (ctx, P, name, unit, tex) => { const gl = ctx.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); P.int(name, unit); };
  const meshVS = `attribute vec2 aUV; uniform mat4 uMVP; uniform vec4 uMeshRect; varying vec2 vUV; varying vec2 vStage;
void main(){ vec2 p = uMeshRect.xy + aUV * uMeshRect.zw; vStage = p; vUV = (p - uArtRect.xy) / uArtRect.zw; gl_Position = uMVP * vec4(p, 0., 1.); }`;
  /* shared "flat" camera (identity) cached per size */
  function flatMVP(ctx) { const s = ctx.state; if (!s._flat || s._fw !== ctx.W || s._fh !== ctx.H) { s._flat = ctx.mat4.tilt(ctx.W, ctx.H, 0, 0); s._fw = ctx.W; s._fh = ctx.H; } return s._flat; }

  /* =================================================================== 2. PAPER BREEZE */
  const BREEZE_VS = `attribute vec2 aUV; uniform mat4 uMVP; uniform vec4 uMeshRect; uniform float uTime;
uniform vec2 uWind; uniform vec4 uWave; /* A px, L px, phase, k rad/px */ uniform vec2 uLiftAx;
varying vec2 vUV; varying vec2 vStage; varying vec3 vN; varying float vZ;
float zf(vec2 p){
  vec2 c = p - uStage * .5; float D = length(uStage);
  float u = dot(c, uWind), v = dot(c, vec2(-uWind.y, uWind.x));
  float un = u / D + .5;                                   /* 0 upwind (the pointer side) .. 1 downwind */
  float env = .4 + .6 * smoothstep(1.05, .05, un);         /* pinned loosely at the far side */
  float ph = u * uWave.w - uWave.z + .85 * snoise(vec2(v / D * 1.5, uTime * .07)) + .35 * snoise(vec2(v / D * 3.1 + 7., uTime * .11));
  float z = uWave.x * env * sin(ph);
  /* the edge / corner nearest the pointer lifts more: a directional ramp, never a disc */
  float pr = clamp(dot(p / uStage - .5, uLiftAx) + .5, 0., 1.);
  float e = smoothstep(.4, 1.05, pr);
  return z + uWave.y * e * e * (1. + .25 * snoise(vec2(v / D * 2.2, 3.1)));
}
void main(){
  vec2 p = uMeshRect.xy + aUV * uMeshRect.zw; vStage = p; vUV = (p - uArtRect.xy) / uArtRect.zw;
  float z = zf(p), e = 5.;
  float dx = (zf(p + vec2(e, 0.)) - zf(p - vec2(e, 0.))) / (2. * e), dy = (zf(p + vec2(0., e)) - zf(p - vec2(0., e))) / (2. * e);
  vN = normalize(vec3(-dx, -dy, 1.)); vZ = z;
  gl_Position = uMVP * vec4(p, z, 1.);
}`;
  const BREEZE_FS = `varying vec2 vUV; varying vec2 vStage; varying vec3 vN; varying float vZ;
uniform float uZmax;
${LUMA}
void main(){
  float a = artCoverage(vUV);
  vec3 N = normalize(vN);
  const vec3 L = vec3(-.42, -.58, .7);                     /* light from the upper left, in front */
  float l0 = .7 / length(L), sh = dot(N, normalize(L)) - l0; /* 0 at rest */
  float g = sh * 5.2;
  float ks = keepScale(vStage);
  float crest = clamp(vZ / max(uZmax, 1.), -1., 1.);
  /* paper is shaded in place: troughs fall toward the under-sheet tone, lit faces lift toward sheen */
  vec3 paper = g < 0. ? mix(uPaper, uUnder, clamp(-g * 1.15, 0., 1.5)) : mix(uPaper, uSheen, clamp(g * ks * (1. + uDark), 0., 1.));
  paper *= 1. - clamp(-crest, 0., 1.) * .035 * uDark;
  vec3 ink = inkAt(vStage);
  ink *= 1. - .15 * clamp(-g * 1.3, 0., 1.);               /* lines darken in troughs */
  if (uDark > .5) ink = mix(ink, uBright, clamp(g * 1.6, 0., 1.) * .3 * ks + clamp(crest, 0., 1.) * .06 * ks);
  gl_FragColor = vec4(mix(paper, ink, a), 1.);
}`;
  register({
    id: 'breeze', name: 'Paper Breeze', set: 'A', order: 2,
    blurb: 'The sheet lifts off the table and billows in the breeze of your hand.',
    init(ctx) {
      const s = ctx.state;
      s.A = ctx.Spring({ f: 0.8, z: 0.5 }); s.L = ctx.Spring({ f: 0.8, z: 0.5 });
      s.wx = ctx.Spring({ x: 1, f: 0.6, z: 0.9 }); s.wy = ctx.Spring({ x: 0, f: 0.6, z: 0.9 });
      s.lx = ctx.Spring({ x: 0.7, f: 0.9, z: 0.8 }); s.ly = ctx.Spring({ x: 0.7, f: 0.9, z: 0.8 });
      s.phase = 0; s.spd = 0; s.cam = Cam();
      s.mesh = ctx.mesh(Math.round(80 * ctx.quality.mesh), Math.round(50 * ctx.quality.mesh));
      s.prog = ctx.program(BREEZE_VS, BREEZE_FS);
      s.rect = [0, 0, 0, 0]; s.wind = new Float32Array(2); s.wave = new Float32Array(4); s.lax = new Float32Array(2);
    },
    quality(ctx, q) { const s = ctx.state; s.mesh.dispose(); s.mesh = ctx.mesh(Math.round(80 * q.mesh), Math.round(50 * q.mesh)); },
    pointer(ctx, ev) { if (ev.type === 'flick' || ev.type === 'tap') ctx.state.A.impulse(ctx.W * 0.05); },
    draw(ctx, A, L, wx, wy, lx, ly) {
      const s = ctx.state, gl = ctx.gl, W = ctx.W, H = ctx.H;
      const persp = H * 0.5 / Math.tan(17.5 * DEG);   /* 35° fov */
      ctx.clearSurface(ctx.pal.gl.under);
      const wl = Math.hypot(wx, wy) || 1; s.wind[0] = wx / wl; s.wind[1] = wy / wl;
      const along = Math.abs(W * s.wind[0]) + Math.abs(H * s.wind[1]);
      s.wave[0] = A; s.wave[1] = L; s.wave[2] = s.phase; s.wave[3] = TAU * 1.6 / along;
      const ll = Math.hypot(lx, ly) || 1; s.lax[0] = lx / ll * 0.9; s.lax[1] = ly / ll * 0.9;
      const P = ctx.bind(s.prog);
      P.set('uMVP', s.cam(W, H, 0, 0, persp, 1)).set('uWind', s.wind).set('uWave', s.wave).set('uLiftAx', s.lax).set('uZmax', W * 0.04);
      gl.disable(gl.BLEND);
      s.rect[0] = -W * 0.06; s.rect[1] = -H * 0.06; s.rect[2] = W * 1.12; s.rect[3] = H * 1.12; s.mesh.draw(P, s.rect);
    },
    frame(ctx, dt) {
      const s = ctx.state, P = ctx.pointer, W = ctx.W, H = ctx.H;
      s.spd = ease(s.spd, P.speed, dt, P.speed > s.spd ? 0.12 : 0.6);
      /* wind: from the pointer along its motion; when nearly still, from the pointer toward the sheet centre */
      let tx, ty; if (P.speed > 80) { tx = P.vx / P.speed; ty = P.vy / P.speed; } else { tx = W / 2 - P.sx; ty = H / 2 - P.sy; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; }
      if (ctx.on) { s.wx.target = tx; s.wy.target = ty; }
      s.wx.step(dt); s.wy.step(dt);
      /* lift axis: from the centre toward the pointer, so the nearest edge / corner rises */
      if (ctx.on) { const cx = P.sx / W - 0.5, cy = P.sy / H - 0.5, l = Math.hypot(cx, cy) || 1; s.lx.target = cx / l; s.ly.target = cy / l; }
      s.lx.step(dt); s.ly.step(dt);
      const calm = Math.exp(-Math.max(0, P.dwell - 1.2) / 1.4);
      s.A.target = ctx.on ? ctx.k * W * 0.034 * clamp(0.26 * calm + s.spd / 1000, 0, 1) : 0;
      s.L.target = ctx.on ? ctx.k * W * 0.022 * (0.55 * calm + 0.45 * clamp(s.spd / 1200, 0, 1)) : 0;
      s.A.z = s.L.z = ctx.on ? 0.5 : 0.68; s.A.step(dt); s.L.step(dt);
      s.A.x = clamp(s.A.x, -W * 0.04, W * 0.04); s.L.x = clamp(s.L.x, -W * 0.012, W * 0.03);
      s.phase += TAU * 0.9 * dt; if (s.phase > 1e4) s.phase -= TAU * 1000;
      this.draw(ctx, s.A.x, s.L.x, s.wx.x, s.wy.x, s.lx.x, s.ly.x);
      return Math.abs(s.A.x) + Math.abs(s.A.v) * 0.3 + Math.abs(s.L.x) + Math.abs(s.L.v) * 0.3;
    },
    idle(ctx) { const s = ctx.state; return s.A.settled(0.2, 0.5) && s.L.settled(0.2, 0.5); },
    reducedMotion(ctx) {
      /* a static, gently curled sheet: one fixed lift at the pointer-nearest corner (1.5% z) */
      const s = ctx.state, P = ctx.pointer, cx = P.sx / ctx.W - 0.5, cy = P.sy / ctx.H - 0.5;
      this.draw(ctx, 0, ctx.W * 0.015, 1, 0, cx || 0.5, cy || 0.5);
    },
    dispose(ctx) { const s = ctx.state; s.mesh && s.mesh.dispose(); }
  });
})();
