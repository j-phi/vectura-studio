/**
 * Start Page hover effect: Hologram Foil (id "holo").
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

  /* ------------------------------------------------------------ stroke rasters (P2-lite, strata masks) */
  const hashJ = j => ((Math.imul(j + 1, 2654435761) >>> 0) / 4294967296);
  function rasterKey(ctx) { const a = ctx.art, r = a.rect; return [r.w.toFixed(1), r.h.toFixed(1), a.s.toFixed(5), (a.ox - r.x).toFixed(2), (a.oy - r.y).toFixed(2), a.lw, ctx.geom && ctx.geom.npts].join('|'); }
  function upload(ctx, tex, cv, pm) { const gl = ctx.gl; gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!pm); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); }
  /* iterate segments in canvas px of a raster that spans art.rect at scale q */
  function forSegs(ctx, q, fn) {
    const a = ctx.art, r = a.rect, g = ctx.geom, s = a.s * q, ox = (a.ox - r.x) * q, oy = (a.oy - r.y) * q, P = g.polys;
    for (let j = 0; j < P.length; j++) { const p = P[j]; for (let i = 2; i < p.length; i += 2) fn(j, p[i - 2] * s + ox, p[i - 1] * s + oy, p[i] * s + ox, p[i + 1] * s + oy, i === 2); }
  }
  const store = new WeakMap();   /* per-ctx cache shared by all Set A effects (survives effect switches) */
  function cache(ctx) { let c = store.get(ctx); if (!c) { c = {}; store.set(ctx, c); } return c; }

  /* tangent G-buffer: RG = doubled-angle tangent, B = stroke-hash bucket, A = coverage (lines 1.4×lw + 2 px) */
  function strokeAttr(ctx) {
    const C = cache(ctx), key = rasterKey(ctx);
    if (C.attr && C.attr.key === key) return C.attr;
    const t0 = performance.now(), a = ctx.art, r = a.rect, q = Math.min(1.25, 2048 / Math.max(r.w, r.h));
    const cw = Math.max(1, Math.ceil(r.w * q)), ch = Math.max(1, Math.ceil(r.h * q));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const c = cv.getContext('2d');
    const NB = 24, NH = 6, paths = new Array(NB * NH), W = ctx.geom.widths;
    let lastB = -1, lastJ = -1;
    forSegs(ctx, q, (j, x0, y0, x1, y1, first) => {
      let th = Math.atan2(y1 - y0, x1 - x0); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI;
      const b = ((th / Math.PI * NB) | 0) % NB, k = b * NH + ((hashJ(j) * NH) | 0);
      const p = paths[k] || (paths[k] = new Path2D());
      if (first || k !== lastB || j !== lastJ) p.moveTo(x0, y0); p.lineTo(x1, y1); lastB = k; lastJ = j;
    });
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = ((a.lw || 1) * 1.4 * (W && W.length ? Math.max(...W.slice(0, 64)) || 1 : 1) + 2) * q;
    for (let k = 0; k < paths.length; k++) {
      if (!paths[k]) continue; const b = (k / NH) | 0, h = k % NH, th = (b + 0.5) / NB * Math.PI;
      c.strokeStyle = `rgb(${Math.round((Math.cos(2 * th) * 0.5 + 0.5) * 255)},${Math.round((Math.sin(2 * th) * 0.5 + 0.5) * 255)},${Math.round((h + 0.5) / NH * 255)})`; c.stroke(paths[k]);
    }
    const tex = C.attr ? C.attr.tex : ctx.texture({ linear: true }); upload(ctx, tex, cv, true);
    C.attr = { key, tex, ms: performance.now() - t0 };
    return C.attr;
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

  /* =================================================================== 1. HOLOGRAM FOIL */
  const HOLO_FS = `varying vec2 vUV; varying vec2 vStage;
uniform sampler2D uAttr; uniform vec2 uTilt; uniform float uIr, uMaxT, uLift; uniform vec2 uVel;
${LUMA}
float tri(float x){ return abs(fract(x) - .5) * 2.; }
void main(){
  float a = artCoverage(vUV);
  vec2 q = vStage / uStage;
  vec3 ink = inkAt(vStage);
  float ks = keepScale(vStage);
  vec2 tn = uTilt / uMaxT;                         /* normalised tilt (rx, ry) */
  float tm = length(tn);
  /* tilt axis in doubled-angle form, so a line's response depends on its own direction against the axis */
  vec2 ax = tm > 1e-4 ? vec2(tn.y, -tn.x) / tm : vec2(.7071, .7071);
  vec2 ax2 = vec2(ax.x * ax.x - ax.y * ax.y, 2. * ax.x * ax.y);
  vec4 at = texture2D(uAttr, clamp(vUV, 0., 1.));
  vec2 t2 = at.a > .01 ? (at.rg / max(at.a, 1e-3)) * 2. - 1. : vec2(1., 0.);  /* premultiplied upload → un-premultiply after filtering */
  float g = dot(t2, ax2);
  /* diffraction: hue from line direction vs axis + view angle across the sheet + tilt (inherits the spring motion) */
  float view = dot(q - .5, vec2(tn.y, tn.x) * .9 + vec2(.32, .2));
  float h = tri(g * .42 + view * .85 + (tn.y - tn.x) * .55 + at.b * .12 + .25);
  vec3 sp = spectrum(h);
  /* order-two flash where the grating faces the light: lines aligned with the axis catch a brighter band */
  float flash = pow(max(0., g), 6.) * clamp(tm * 1.4, 0., 1.);
  /* broad, soft sheen band sliding across the sheet opposite the tilt (~35% sheet width) */
  float pos = .5 - tn.y * .6 + tn.x * .35;
  float d = (q.x * .82 + q.y * .38) - (pos * 1.2);
  float band = exp(-d * d / .045) * clamp(tm * 1.6, 0., 1.);
  float S = uIr * ks;
  vec3 lineC;
  if (uDark > .5) {
    lineC = mix(ink, sp * 1.12, .7 * S) + sp * (.16 * band + .22 * flash) * S;
  } else {
    lineC = noLighter(mix(ink, sp, .75 * S + .2 * flash * S), ink);
  }
  /* paper takes tone only: the sheen band + a whisper of spectral wash on dark stock, and a faint tilt gradient */
  float grad = dot(q - .5, vec2(tn.y, -tn.x)) * .9 * clamp(tm, 0., 1.);
  vec3 paper = mix(uPaper, uSheen, band * .2 * ks * uIr);
  paper = mix(paper, uUnder, clamp(grad, 0., 1.) * .35 * uIr);
  if (uDark > .5) paper += sp * .045 * uIr * ks * (.4 + .6 * band);
  gl_FragColor = vec4(mix(paper, lineC, a), 1.);
}`;
  register({
    id: 'holo', name: 'Hologram Foil', set: 'A', order: 1,
    blurb: 'The whole sheet rocks like a foil card; every line flashes colour by its own direction.',
    init(ctx) {
      const s = ctx.state;
      s.rx = ctx.Spring({ f: 1.4, z: 0.42 }); s.ry = ctx.Spring({ f: 1.4, z: 0.42 }); s.lift = ctx.Spring({ f: 1.1, z: 0.7 });
      s.ir = 0; s.cam = Cam(); s.maxT = 8 * DEG;
      s.mesh = ctx.mesh(12, 8); s.rect = [0, 0, 0, 0]; s.tilt = new Float32Array(2);
      s.prog = ctx.program(meshVS, HOLO_FS); s.attr = strokeAttr(ctx);
    },
    onArt(ctx) { ctx.state.attr = strokeAttr(ctx); }, resize(ctx) { ctx.state.attr = strokeAttr(ctx); },
    pointer(ctx, ev) {
      const s = ctx.state; if (ev.type === 'flick' || ev.type === 'tap') { s.rx.impulse(clamp(-ev.vy * 0.00012, -0.35, 0.35)); s.ry.impulse(clamp(ev.vx * 0.00012, -0.35, 0.35)); }
    },
    draw(ctx, rx, ry, ir, lift) {
      const s = ctx.state, gl = ctx.gl, W = ctx.W, H = ctx.H;
      ctx.clearSurface(ctx.pal.gl.under);
      const mvp = s.cam(W, H, rx, ry, 1400, 1 + 0.03 * lift);
      const P = ctx.bind(s.prog); s.tilt[0] = rx; s.tilt[1] = ry;
      P.set('uMVP', mvp).set('uTilt', s.tilt).set('uIr', ir).set('uMaxT', s.maxT).set('uLift', lift);
      bindTex(ctx, P, 'uAttr', 2, s.attr.tex);
      gl.disable(gl.BLEND);
      /* overscan: the plane extends 8% past the stage so a tilted sheet never shows a hole; the art continues naturally */
      s.rect[0] = -W * 0.08; s.rect[1] = -H * 0.08; s.rect[2] = W * 1.16; s.rect[3] = H * 1.16; s.mesh.draw(P, s.rect);
    },
    frame(ctx, dt) {
      const s = ctx.state, P = ctx.pointer, m = s.maxT;
      const nx = clamp(P.sx / ctx.W - 0.5, -0.5, 0.5) * 2, ny = clamp(P.sy / ctx.H - 0.5, -0.5, 0.5) * 2;
      s.rx.target = ctx.on ? -ny * m * ctx.k : 0; s.ry.target = ctx.on ? nx * m * ctx.k : 0;
      /* pointer velocity is a torque: a swipe makes the sheet rock past its target and swing back */
      if (ctx.on) { s.rx.v += -P.vy * 0.0026 * dt * ctx.k; s.ry.v += P.vx * 0.0026 * dt * ctx.k; }
      s.rx.step(dt); s.ry.step(dt);
      const lim = 9 * DEG; if (Math.abs(s.rx.x) > lim) { s.rx.x = clamp(s.rx.x, -lim, lim); s.rx.v *= -0.3; } if (Math.abs(s.ry.x) > lim) { s.ry.x = clamp(s.ry.x, -lim, lim); s.ry.v *= -0.3; }
      s.lift.target = ctx.on ? ctx.k : 0; s.lift.step(dt);
      /* iridescence envelope: up fast, fades to ink ~1.2 s after the rocking stops */
      const tiltMag = (Math.abs(s.rx.x) + Math.abs(s.ry.x)) / m, moving = Math.abs(s.rx.v) + Math.abs(s.ry.v);
      s.ir = ease(s.ir, ctx.on ? 1 : Math.min(1, tiltMag * 5 + moving * 6), dt, ctx.on ? 0.25 : 0.2);
      if (!ctx.on && s.ir < 0.012) s.ir = 0;
      const lift = Math.max(0, s.lift.x);
      this.draw(ctx, s.rx.x, s.ry.x, s.ir, lift);
      return (Math.abs(s.rx.x) + Math.abs(s.ry.x)) / DEG + moving / DEG * 0.2 + s.ir + Math.abs(s.lift.x) + Math.abs(s.lift.v);
    },
    idle(ctx) { const s = ctx.state, e = 0.12 * DEG; return s.rx.settled(e, e * 5) && s.ry.settled(e, e * 5) && s.ir === 0 && s.lift.settled(0.004, 0.02); },
    reducedMotion(ctx) {
      /* static foil: flat sheet, iridescence for a fixed tilt derived from where the pointer rests */
      const s = ctx.state, P = ctx.pointer, nx = clamp(P.sx / ctx.W - 0.5, -0.5, 0.5) * 2, ny = clamp(P.sy / ctx.H - 0.5, -0.5, 0.5) * 2;
      const S = ctx.state, keep = S.cam; S.cam = (W, H) => flatMVP(ctx);
      this.draw(ctx, -ny * s.maxT * 0.7, nx * s.maxT * 0.7, 0.85, 0); S.cam = keep;
    },
    dispose(ctx) { const s = ctx.state; s.mesh && s.mesh.dispose(); }
  });
})();
