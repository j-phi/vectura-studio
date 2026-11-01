/**
 * Start Page hover effects core (Vectura.StartPageHoverFxCore).
 *
 * Port of the VHoverFX v2 core (mockup shared-final/hover-fx.js) onto the Start Page art runtime.
 * An effect owns the art while it is active: a WebGL canvas (inside the hovered art element, above the
 * ink layer) redraws the strokes from the handle's parsed geometry, the ink layer is hidden in the same
 * frame, and at rest the ink layer comes back and the rAF loop stops. Effects register themselves from
 * their own files (hover-fx/<id>.js), loaded lazily by hover-fx/index.js.
 *
 * Differences from the mockup core: one effect per controller, attached to the hovered art element only;
 * art texture comes from handle.parsed (same strokes and line look as the plot-in canvas); motion state
 * comes from StartPageHoverFx.isStill(); everything draws inside the art element's box.
 */
(() => {
  'use strict';
  const W = window;
  const D = document;
  const Vectura = (W.Vectura = W.Vectura || {});
  const Geo = Vectura.StartPageArtGeometry;
  if (Vectura.StartPageHoverFxCore) return;
  const TAU = Math.PI * 2;
  /* ================================================================ color */
  const hx = h => { h = String(h || '#000').trim(); const m = h.match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(/[\s,/]+/).slice(0, 3).map(Number); h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const delin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
  const lum = h => { const [r, g, b] = hx(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const rgba = (h, a) => { const [r, g, b] = hx(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
  const vec3 = h => hx(h).map(v => v / 255);
  function toHsl(h) { let [r, g, b] = hx(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let H = 0, S = 0; if (mx !== mn) { const d = mx - mn; S = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; } return [H, S, l]; }
  function hsl(H, S, L) { H = ((H % 360) + 360) % 360 / 360; const q = L < .5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return toHex([f(H + 1 / 3), f(H), f(H - 1 / 3)].map(v => v * 255)); }
  /* OKLab / OKLCh */
  function toOklab(h) { const [r, g, b] = hx(h).map(lin); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]; }
  function fromOklab(L, a, b) { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3; return toHex([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(delin)); }
  const oklch = (L, C, Hdeg) => fromOklab(L, C * Math.cos(Hdeg * Math.PI / 180), C * Math.sin(Hdeg * Math.PI / 180));

  /* palette: v1 vocabulary + v2 additions (under, sheen, spectrum) */
  function palette(cw) {
    const paper = cw.paper || '#ffffff', ink = cw.ink || '#111111', ink2 = cw.ink2 || null;
    const dark = lum(paper) < 0.22;
    const [h, s, l] = toHsl(ink), [ph, ps] = toHsl(paper);
    const grey = s < 0.16 || l < 0.07 || l > 0.94;
    const hue = grey ? (ps > 0.2 ? ph + 180 : (dark ? 200 : 214)) : h;
    const comp = hue + 180;
    const [iL, ia, ib] = toOklab(ink), inkH = Math.atan2(ib, ia) * 180 / Math.PI, [pL, pa, pb] = toOklab(paper);
    const under = (() => { const P = hx(paper).map(lin), I = hx(ink).map(lin), Pl = P.map(v => v * 0.78), m = 0.08; return toHex(Pl.map((v, i) => delin(v + (I[i] * 0.78 - v) * m))); })();
    const sheen = fromOklab(Math.min(1, pL + 0.12), pa * 0.9, pb * 0.9);
    const chroma = dark ? 0.16 : 0.14, sL = dark ? 0.78 : 0.52;
    const P = {
      paper, ink, ink2: ink2 || ink, dark, hue,
      bright: dark ? hsl(hue, grey ? 0.75 : Math.max(0.7, s), 0.72) : hsl(hue, grey ? 0.8 : Math.max(0.72, s), 0.44),
      accent: dark ? hsl(comp, 0.9, 0.66) : hsl(comp, 0.82, 0.44),
      warm: dark ? hsl(hue + 150, 0.95, 0.66) : hsl(hue + 150, 0.85, 0.46),
      cool: dark ? hsl(hue - 30, 0.9, 0.7) : hsl(hue - 30, 0.85, 0.42),
      hot: dark ? '#fffaf0' : hsl(hue, 0.95, 0.5),
      faint: mix(paper, ink, 0.22),
      add: dark ? 'lighter' : 'multiply',
      under, sheen,
      /* spectrum(t): OKLCh ramp centered on the ink hue, ±150°, chroma clamped per stock */
      spectrum: t => oklch(sL, chroma, (grey ? hue : inkH) + (t - 0.5) * 300),
      inkHue: grey ? hue : inkH
    };
    /* GL-ready linear-ish vec3s (sRGB 0..1; shaders work in sRGB like the page does) */
    P.gl = {}; ['paper', 'ink', 'ink2', 'bright', 'accent', 'warm', 'cool', 'hot', 'faint', 'under', 'sheen'].forEach(k => { P.gl[k] = vec3(P[k]); });
    P.gl.spectrum = Array.from({ length: 8 }, (_, i) => vec3(P.spectrum(i / 7)));
    return P;
  }

  /* ================================================================ geometry (v1 buildGeom, ≤ 5000 samples) */
  const GEO = new WeakMap();
  const MAX_SAMPLES = 5000;
  function buildGeom(art) {
    if (GEO.has(art)) return GEO.get(art);
    const t0 = performance.now();
    const polys = art.polys, vb = art.vb, vx = vb[0], vy = vb[1], vw = vb[2], vh = vb[3];
    const cs = Math.max(vw, vh) / 90, gw = Math.max(1, Math.ceil(vw / cs) + 1), gh = Math.max(1, Math.ceil(vh / cs) + 1);
    const cell = (v, o, g) => Math.max(0, Math.min(g - 1, Math.floor((v - o) / cs)));
    let total = 0; const lens = new Float32Array(polys.length);
    for (let j = 0; j < polys.length; j++) { const p = polys[j]; let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); lens[j] = L; total += L; }
    const NS = Math.max(1, Math.min(MAX_SAMPLES, Math.round(total / (Math.max(vw, vh) / 1100))));
    const step = total / NS;
    const sx = new Float32Array(NS), sy = new Float32Array(NS), sj = new Int32Array(NS), sp = new Float32Array(NS), tx = new Float32Array(NS), ty = new Float32Array(NS), sarc = new Float32Array(NS), sn = new Float32Array(NS);
    let k = 0, acc = step * 0.5;
    for (let j = 0; j < polys.length && k < NS; j++) {
      const p = polys[j]; let along = 0;
      for (let i = 2; i < p.length && k < NS; i += 2) {
        const dx = p[i] - p[i - 2], dy = p[i + 1] - p[i - 1], L = Math.hypot(dx, dy);
        while (acc <= L && k < NS) { const f = L ? acc / L : 0; sx[k] = p[i - 2] + dx * f; sy[k] = p[i - 1] + dy * f; sj[k] = j; sp[k] = (i - 2) / 2 + f; tx[k] = L ? dx / L : 1; ty[k] = L ? dy / L : 0; sarc[k] = along + acc; sn[k] = lens[j] ? (along + acc) / lens[j] : 0; k++; acc += step; }
        acc -= L; along += L;
      }
    }
    const ns = k;
    const scnt = new Int32Array(gw * gh + 1);
    for (let i = 0; i < ns; i++) scnt[cell(sy[i], vy, gh) * gw + cell(sx[i], vx, gw) + 1]++;
    for (let c = 0; c < gw * gh; c++) scnt[c + 1] += scnt[c];
    const sids = new Int32Array(ns), sf = scnt.slice(0, gw * gh);
    for (let i = 0; i < ns; i++) sids[sf[cell(sy[i], vy, gh) * gw + cell(sx[i], vx, gw)]++] = i;
    let npts = 0; polys.forEach(p => { npts += p.length >> 1; });
    const g = { vb, polys, widths: art.widths, lens, total, npts, cs, gw, gh, ns, sx, sy, sj, sp, tx, ty, sarc, sn, soff: scnt, sids, sbuf: new Int32Array(ns), ms: 0 };
    g.ms = performance.now() - t0; GEO.set(art, g); return g;
  }

  /* ================================================================ simplex noise (JS) + GLSL chunks */
  const Noise = (() => {
    const perm = new Uint8Array(512), grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
    let s = 1337; const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;
    function simplex2(x, y) {
      const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2, x0 = x - i + t, y0 = y - j + t;
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1, x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
      let n = 0, tt;
      tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { const g = grad3[perm[ii + perm[jj]] % 12]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { const g = grad3[perm[ii + i1 + perm[jj + j1]] % 12]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { const g = grad3[perm[ii + 1 + perm[jj + 1]] % 12]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2); }
      return 70 * n;
    }
    function simplex3(x, y, z) {
      const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G3;
      const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t; let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
      else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
      const c = [[x0, y0, z0, 0, 0, 0], [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1], [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2], [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1]];
      const ii = i & 255, jj = j & 255, kk = k & 255; let n = 0;
      for (const [X, Y, Z, a, b, d] of c) { let tt = 0.6 - X * X - Y * Y - Z * Z; if (tt > 0) { const g = grad3[perm[ii + a + perm[jj + b + perm[kk + d]]] % 12]; tt *= tt; n += tt * tt * (g[0] * X + g[1] * Y + g[2] * Z); } }
      return 32 * n;
    }
    const fbm2 = (x, y, oct) => { let a = 0, f = 1, w = 0.5; for (let o = 0; o < (oct || 4); o++) { a += w * simplex2(x * f, y * f); f *= 2; w *= 0.5; } return a; };
    return { simplex2, simplex3, fbm2 };
  })();
  /* GLSL ES 1.00 snippets (work in WebGL1 and WebGL2) */
  const GLSL = {
    /* Ashima/stegu simplex noise, MIT */
    noise: `
vec3 _m289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 _m289(vec4 x){return x-floor(x*(1./289.))*289.;}vec2 _m289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 _perm(vec3 x){return _m289(((x*34.)+1.)*x);}vec4 _perm(vec4 x){return _m289(((x*34.)+1.)*x);}
float snoise(vec2 v){const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=_m289(i);vec3 p=_perm(_perm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;m*=1.79284291400159-.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=_m289(i);vec4 p=_perm(_perm(_perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=1.79284291400159-.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec2 p){float a=0.,w=.5;for(int i=0;i<4;i++){a+=w*snoise(p);p*=2.02;w*=.5;}return a;}
`,
    /* common uniforms every core-bound program receives (call ctx.bind(prog)) */
    common: `
uniform sampler2D uArt;      // art texture: ink coverage in alpha (premultiplied white)
uniform sampler2D uKeep;     // type keep-out mask, ¼ res, R = 1 under type
uniform vec4 uArtRect;       // art box in stage px (x, y, w, h)
uniform vec2 uStage;         // stage size in CSS px
uniform vec3 uPaper, uInk, uInk2, uUnder, uSheen, uBright, uAccent;
uniform vec4 uDuo;           // duo gradient start/end in stage px (x0,y0,x1,y1); uInk2==uInk when not duo
uniform vec2 uPointer;       // smoothed pointer, stage px
uniform float uK, uTime, uDark;
vec2 stageToArtUV(vec2 p){ return (p - uArtRect.xy) / uArtRect.zw; }
float artCoverage(vec2 artUV){ if(artUV.x<0.||artUV.y<0.||artUV.x>1.||artUV.y>1.) return 0.; return texture2D(uArt, artUV).a; }
vec3 inkAt(vec2 stagePx){ vec2 d = uDuo.zw - uDuo.xy; float t = clamp(dot(stagePx - uDuo.xy, d) / max(1., dot(d, d)), 0., 1.); return mix(uInk, uInk2, t); }
float keepOut(vec2 stagePx){ return texture2D(uKeep, stagePx / uStage).r; }
float keepScale(vec2 stagePx){ return mix(1.0, 0.35, keepOut(stagePx)); }   // multiply ADDED luminance by this
vec3 spectrum(float t);       // defined by the core prelude below
`,
    spectrum: `uniform vec3 uSpec[8]; vec3 spectrum(float t){ t = clamp(fract(t), 0., 1.) * 7.; int i = int(floor(t)); float f = fract(t); vec3 a = uSpec[0], b = uSpec[1];
for(int k=0;k<7;k++){ if(k==i){ a = uSpec[k]; b = uSpec[k+1]; } } return mix(a, b, f); }`
  };

  /* ================================================================ springs, maths */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  /* semi-implicit damped spring. f in Hz, z damping ratio (1 = critical) */
  function Spring(o) {
    o = o || {};
    const s = { x: o.x || 0, v: 0, target: o.target == null ? (o.x || 0) : o.target, f: o.f || 1.4, z: o.z == null ? 0.42 : o.z };
    s.step = dt => { const w = TAU * s.f; let left = dt; while (left > 0) { const h = Math.min(left, 1 / 120); s.v += (-2 * s.z * w * s.v - w * w * (s.x - s.target)) * h; s.x += s.v * h; left -= h; } return s.x; };
    s.impulse = dv => { s.v += dv; };
    s.settled = (eps, veps) => Math.abs(s.x - s.target) < (eps == null ? 0.25 : eps) && Math.abs(s.v) < (veps == null ? (eps == null ? 0.25 : eps) * 4 : veps);
    s.snap = v => { s.x = s.target = v == null ? s.target : v; s.v = 0; };
    return s;
  }
  const mat4 = {
    ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    /* a pixel-exact camera: stage px in, clip out; at zero rotation it maps the stage rect onto the canvas 1:1.
       rx/ry in radians about (cx,cy); persp = CSS-like perspective distance in px; z = lift in px */
    tilt(Wd, Ht, rx, ry, o) {
      o = o || {}; const cx = o.cx == null ? Wd / 2 : o.cx, cy = o.cy == null ? Ht / 2 : o.cy, P = o.persp || 1400, z = o.z || 0, sc = o.scale || 1;
      const cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry);
      /* model: translate(-c) → scale → rotY → rotX → translate(c) + z; then perspective about stage center */
      const T1 = new Float32Array([sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, -cx * sc, -cy * sc, 0, 1]);
      const RY = new Float32Array([cY, 0, -sY, 0, 0, 1, 0, 0, sY, 0, cY, 0, 0, 0, 0, 1]);
      const RX = new Float32Array([1, 0, 0, 0, 0, cX, sX, 0, 0, -sX, cX, 0, 0, 0, 0, 1]);
      const T2 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx - Wd / 2, cy - Ht / 2, z, 1]);
      /* perspective: x' = x / (1 - z/P); then to clip (y down) */
      const PR = new Float32Array([2 / Wd, 0, 0, 0, 0, -2 / Ht, 0, 0, 0, 0, -1 / (P * 4), -1 / P, 0, 0, 0, 1]);
      return mat4.mul(PR, mat4.mul(T2, mat4.mul(RX, mat4.mul(RY, T1))));
    }
  };

  /* ================================================================ CPU fields: scalar grid (P5) + wave solver (P4) */
  /* Field: cols×rows×ch Float32 grid over the stage. Uploads as RGBA8 with a [lo,hi] range per field. */
  function Field(ctx, cols, rows, ch, o) {
    o = o || {}; ch = ch || 1;
    const f = { cols, rows, ch, data: new Float32Array(cols * rows * ch), tmp: new Float32Array(cols * rows * ch), lo: o.lo == null ? 0 : o.lo, hi: o.hi == null ? 1 : o.hi, tex: null, bytes: new Uint8Array(cols * rows * 4) };
    const cw = () => ctx.W / cols, chh = () => ctx.H / rows;
    /* gaussian splat at stage px; r in px; amt added to channel c (or vec of channels) */
    f.splat = (x, y, r, amt, c) => {
      const gx = x / cw() - 0.5, gy = y / chh() - 0.5, rx = r / cw(), ry = r / chh(), R = Math.ceil(Math.max(rx, ry) * 2.5);
      const x0 = Math.max(0, Math.floor(gx - R)), x1 = Math.min(cols - 1, Math.ceil(gx + R)), y0 = Math.max(0, Math.floor(gy - R)), y1 = Math.min(rows - 1, Math.ceil(gy + R));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const d = ((i - gx) / rx) ** 2 + ((j - gy) / ry) ** 2; if (d > 6.25) continue; const w = Math.exp(-d), b = (j * cols + i) * ch;
        if (Array.isArray(amt)) for (let q = 0; q < ch; q++) f.data[b + q] += amt[q] * w; else f.data[b + (c || 0)] += amt * w;
      }
    };
    f.diffuse = k => { const d = f.data, t = f.tmp; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) for (let q = 0; q < ch; q++) { const b = (j * cols + i) * ch + q, l = i > 0 ? d[b - ch] : d[b], r = i < cols - 1 ? d[b + ch] : d[b], u = j > 0 ? d[b - cols * ch] : d[b], dn = j < rows - 1 ? d[b + cols * ch] : d[b]; t[b] = d[b] + k * (l + r + u + dn - 4 * d[b]); } f.data = t; f.tmp = d; };
    /* semi-Lagrangian advection by a velocity field (another 2-channel Field in cells/s, or fn(i,j,out)) */
    f.advect = (vel, dt) => {
      const d = f.data, t = f.tmp, o2 = [0, 0];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (typeof vel === 'function') vel(i, j, o2); else { const b = (j * cols + i) * 2; o2[0] = vel.data[b]; o2[1] = vel.data[b + 1]; }
        const sx = clamp(i - o2[0] * dt, 0, cols - 1.001), sy = clamp(j - o2[1] * dt, 0, rows - 1.001), i0 = sx | 0, j0 = sy | 0, fx = sx - i0, fy = sy - j0;
        for (let q = 0; q < ch; q++) { const a = d[(j0 * cols + i0) * ch + q], b2 = d[(j0 * cols + i0 + 1) * ch + q], c2 = d[((j0 + 1) * cols + i0) * ch + q], e = d[((j0 + 1) * cols + i0 + 1) * ch + q]; t[(j * cols + i) * ch + q] = (a * (1 - fx) + b2 * fx) * (1 - fy) + (c2 * (1 - fx) + e * fx) * fy; }
      }
      f.data = t; f.tmp = d;
    };
    f.decay = (tau, dt) => { const m = Math.exp(-dt / tau), d = f.data; for (let i = 0; i < d.length; i++) d[i] *= m; };
    f.clear = () => f.data.fill(0);
    f.sum = () => { let s = 0; const d = f.data; for (let i = 0; i < d.length; i++) s += Math.abs(d[i]); return s; };
    f.sample = (x, y, c) => { const gx = clamp(x / cw() - 0.5, 0, cols - 1.001), gy = clamp(y / chh() - 0.5, 0, rows - 1.001), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, d = f.data, q = c || 0; return (d[(j * cols + i) * ch + q] * (1 - fx) + d[(j * cols + i + 1) * ch + q] * fx) * (1 - fy) + (d[((j + 1) * cols + i) * ch + q] * (1 - fx) + d[((j + 1) * cols + i + 1) * ch + q] * fx) * fy; };
    /* upload → RGBA8 texture, value v encoded as (v-lo)/(hi-lo). Shader: lo + texel*(hi-lo). */
    f.upload = () => {
      const gl = ctx.gl; if (!gl) return null; const d = f.data, B = f.bytes, s = 255 / (f.hi - f.lo || 1);
      for (let i = 0, n = cols * rows; i < n; i++) for (let q = 0; q < 4; q++) B[i * 4 + q] = q < ch ? clamp((d[i * ch + q] - f.lo) * s, 0, 255) : 255;
      if (!f.tex) { f.tex = ctx.texture({ w: cols, h: rows, linear: true }); }
      gl.bindTexture(gl.TEXTURE_2D, f.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, B);
      return f.tex;
    };
    f.dispose = () => { if (f.tex && ctx.gl) ctx.gl.deleteTexture(f.tex); f.tex = null; };
    return f;
  }

  /* ================================================================ type keep-out mask (P10) */
  const DEFAULT_KEEPOUT = '[data-sp-keepout]';
  function KeepOut(ctx, selector) {
    const S = 4; /* ¼ res */
    const k = { cv: D.createElement('canvas'), rects: [], tex: null, data: null, w: 0, h: 0, sc: 1 };
    k.c = k.cv.getContext('2d', { willReadFrequently: true });
    k.refresh = () => {
      const st = ctx.stage, sr = st.getBoundingClientRect(), w = Math.max(1, Math.ceil(ctx.W / S)), h = Math.max(1, Math.ceil(ctx.H / S));
      k.sc = sr.width ? ctx.W / sr.width : 1; k.w = w; k.h = h; k.cv.width = w; k.cv.height = h; const c = k.c; c.clearRect(0, 0, w, h);
      k.rects = [];
      st.querySelectorAll(selector).forEach(el => {
        if (el.closest('.sp-hfx-wrap')) return; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const fs = parseFloat(getComputedStyle(el).fontSize) || 14, inf = fs * 0.35;
        k.rects.push({ x: (r.left - sr.left) * k.sc - inf, y: (r.top - sr.top) * k.sc - inf, w: r.width + inf * 2, h: r.height + inf * 2 });
      });
      /* 24 px feather */
      if (!k.rects.length) { k.data = new Float32Array(w * h); const gl0 = ctx.gl; if (gl0) { if (!k.tex) k.tex = ctx.texture({ linear: true }); gl0.bindTexture(gl0.TEXTURE_2D, k.tex); gl0.texImage2D(gl0.TEXTURE_2D, 0, gl0.RGBA, gl0.RGBA, gl0.UNSIGNED_BYTE, k.cv); } return; }
      c.filter = `blur(${(24 / S / 2).toFixed(1)}px)`; c.fillStyle = '#fff';
      k.rects.forEach(r => c.fillRect(r.x / S, r.y / S, r.w / S, r.h / S));
      c.filter = 'none'; k.rects.forEach(r => c.fillRect((r.x + 12) / S, (r.y + 12) / S, Math.max(0, r.w - 24) / S, Math.max(0, r.h - 24) / S));
      const id = c.getImageData(0, 0, w, h).data; k.data = new Float32Array(w * h); for (let i = 0; i < w * h; i++) k.data[i] = id[i * 4] / 255;
      const gl = ctx.gl; if (gl) { if (!k.tex) k.tex = ctx.texture({ linear: true }); gl.bindTexture(gl.TEXTURE_2D, k.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, k.cv); }
    };
    k.at = (x, y) => { if (!k.data) return 0; const i = clamp((x / S) | 0, 0, k.w - 1), j = clamp((y / S) | 0, 0, k.h - 1); return k.data[j * k.w + i]; };
    k.scale = (x, y) => 1 - 0.65 * k.at(x, y);
    return k;
  }

  /* ================================================================ GL helpers (P0) */
  function makeGL(cv) {
    const opts = { premultipliedAlpha: true, antialias: false, alpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' };
    let gl = null, v2 = false;
    try { gl = cv.getContext('webgl2', opts); v2 = !!gl; } catch (e) { /* none */ }
    if (!gl) try { gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    if (gl) gl.isWebGL2 = v2;
    return gl;
  }
  const VS_QUAD = `attribute vec2 aPos; varying vec2 vUV; void main(){ vUV = aPos * .5 + .5; vUV.y = 1. - vUV.y; gl_Position = vec4(aPos, 0., 1.); }`;
  /* mesh vertex shader: aUV over the ART rect, uMVP from mat4.tilt; optional height texture via uHeight */
  const VS_MESH = `attribute vec2 aUV; uniform mat4 uMVP; uniform vec4 uArtRect; uniform vec4 uMeshRect; varying vec2 vUV; varying vec2 vStage;
void main(){ vec2 p = uMeshRect.xy + aUV * uMeshRect.zw; vStage = p; vUV = (p - uArtRect.xy) / uArtRect.zw; gl_Position = uMVP * vec4(p, 0., 1.); }`;


  /* ================================================================ registry */
  const FX = [];
  const hooks = { registered: [] };
  function register(def) {
    if (!def || !def.id || typeof def.frame !== 'function') { if (W.console) W.console.warn('[StartPageHoverFx] register: need {id, frame}'); return; }
    const i = FX.findIndex((f) => f.id === def.id); if (i >= 0) FX.splice(i, 1);
    FX.push(Object.assign({ name: def.id, blurb: '', set: '?', needsGL: true }, def));
    hooks.registered.forEach((fn) => { try { fn(def.id); } catch (e) { /* listener */ } });
  }
  const byId = (id) => FX.find((f) => f.id === id);
  const glOK = (() => { let ok = null; return () => { if (ok == null) { try { const c = D.createElement('canvas'); ok = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { ok = false; } } return ok; }; })();
  /* Still / reduced motion: the loader owns the answer; fall back to the media query */
  const mqReduced = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const motionAllowed = () => {
    try { const H = Vectura.StartPageHoverFx; if (H && typeof H.isStill === 'function') return !H.isStill(); } catch (e) { /* fall through */ }
    return !(mqReduced && mqReduced.matches);
  };
  const nowMs = () => (W.performance && W.performance.now ? W.performance.now() : Date.now());

  /* ================================================================ attach */
  function attach(el, effectId, opts) {
    opts = opts || {};
    if (typeof el === 'string') el = D.querySelector(el);
    const stage = el;
    const handle = opts.handle || (el && el._spInk) || null;
    const manual = !!opts.manual; /* tests / harness: no rAF, drive with ctl._advance(seconds) */
    const ctl = {
      el: stage, effect: effectId, paused: false, destroyed: false, manual,
      stats: { frames: 0, worst: 0, sum: 0, over16: 0, rasterMs: 0, buildMs: 0, list: [], reset() { this.frames = 0; this.worst = 0; this.sum = 0; this.over16 = 0; this.list = []; }, get avg() { return this.frames ? this.sum / this.frames : 0; }, get p95() { const a = this.list.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length * 0.95)] : 0; } },
      get reduced() { return !allowed(); },
      get active() { return running; },
      get handed() { return handed; },
      get idle() { return !running && !handed; },
      destroy, input, _advance: advance, pause: () => { ctl.paused = true; stop(true); }, resume: () => { ctl.paused = false; wake(); },
    };
    function allowed() { return motionAllowed(); }

    if (!stage || !handle) { ctl.ready = Promise.resolve(ctl); ctl.destroyed = true; return ctl; }
    if (W.getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    stage.classList.add('sp-hfx-stage');
    const wrap = D.createElement('div'); wrap.className = 'sp-hfx-wrap'; wrap.setAttribute('aria-hidden', 'true');
    const cv = D.createElement('canvas'); cv.className = 'sp-hfx-surface'; wrap.appendChild(cv);
    if (handle.box && handle.box.parentElement === stage) handle.box.after(wrap); else stage.appendChild(wrap);
    const def0 = byId(effectId);
    const gl = (def0 && def0.needsGL === false) ? null : makeGL(cv);

    /* ---------------------------------------------------------------- ctx (what effects receive) */
    const ctx = {
      stage, wrap, canvas: cv, gl, webgl2: !!(gl && gl.isWebGL2), W: 0, H: 0, dpr: 1,
      t: 0, dt: 0, k: 0, on: false, energy: 0, reduced: false, quality: { level: 0, dpr: 1, field: 1, mesh: 1 },
      pointer: { x: 0, y: 0, sx: 0, sy: 0, vx: 0, vy: 0, speed: 0, pressure: 0.5, type: 'mouse', inside: false, down: false, dwell: 0, idle: 0, flick: false },
      art: { rect: { x: 0, y: 0, w: 0, h: 0 }, tex: null, ready: false, lw: 1, alpha: 1, duo: [0, 0, 1, 1], vb: [0, 0, 1, 1], s: 1, ox: 0, oy: 0 },
      samples: null, geom: null, pal: palette({}), keep: null, state: {},
      noise: Noise, glsl: GLSL, Spring: (o) => Spring(o), mat4, VS: { quad: VS_QUAD, mesh: VS_MESH },
      field: (c, r, ch, o) => Field(ctx, c, r, ch, o),
      program, bind, texture, target, pingpong, mesh, quad, particles, c2d, drawArt, toStage, toArt, wake, clearSurface,
      overscan(on, scale) { wrap.style.transform = on ? `scale(${scale || 1.06})` : ''; },
    };
    let inst = null; let raf = 0; let last = 0; let visible = true; let inside = false; let running = false; let handed = false; let stillShown = false; let stillT = 0;
    let fadeT = 0; let cwOverride = opts.colorway || null;

    /* ------------------------------------------------ GL resources */
    const progCache = new Map(); let quadBuf = null;
    function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('[VHoverFX] shader: ' + log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n').slice(0, 4000)); } return s; }
    /* program(vs, fs): fs gets the precision line, GLSL.common, GLSL.spectrum and GLSL.noise prepended when it references them */
    function program(vs, fs) {
      const key = vs + '\0' + fs; if (progCache.has(key)) return progCache.get(key);
      const pre = 'precision highp float;\n', usesNoise = /snoise|fbm\(/.test(fs);
      const fsrc = pre + GLSL.common + GLSL.spectrum + (usesNoise ? GLSL.noise : '') + fs;
      const vsrc = pre + (/uArtRect|uStage/.test(vs) && !/uniform vec4 uArtRect/.test(vs) ? 'uniform vec4 uArtRect; uniform vec2 uStage;\n' : '') + (/snoise|fbm\(/.test(vs) ? GLSL.noise : '') + vs;
      const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vsrc)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[VHoverFX] link: ' + gl.getProgramInfoLog(p));
      const U = {}, A = {}; const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(p, i), n = u.name.replace(/\[0\]$/, ''); U[n] = gl.getUniformLocation(p, u.name); }
      const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); A[a.name] = gl.getAttribLocation(p, a.name); }
      const P = { p, U, A, use() { gl.useProgram(p); return P; }, set(name, v) { const l = U[name]; if (l == null) return P; if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 2) gl.uniform2fv(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else if (v.length === 4) gl.uniform4fv(l, v); else if (v.length === 16) gl.uniformMatrix4fv(l, false, v); else gl.uniform1fv(l, v); return P; }, int(name, v) { if (U[name] != null) gl.uniform1i(U[name], v); return P; } };
      progCache.set(key, P); return P;
    }
    /* bind(prog): uploads the common uniforms; art on unit 0, keep-out on unit 1. Effects use units ≥ 2. */
    function bind(P) {
      P.use(); const a = ctx.art, pg = ctx.pal.gl;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex || blankTex()); P.int('uArt', 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (ctx.keep && ctx.keep.tex) || blankTex()); P.int('uKeep', 1);
      P.set('uArtRect', [a.rect.x, a.rect.y, a.rect.w, a.rect.h]).set('uStage', [ctx.W, ctx.H]).set('uPaper', pg.paper).set('uInk', pg.ink).set('uInk2', pg.ink2).set('uUnder', pg.under).set('uSheen', pg.sheen).set('uBright', pg.bright).set('uAccent', pg.accent)
        .set('uDuo', a.duo).set('uPointer', [ctx.pointer.sx, ctx.pointer.sy]).set('uK', ctx.k).set('uTime', ctx.t).set('uDark', ctx.pal.dark ? 1 : 0);
      if (P.U.uSpec != null) gl.uniform3fv(P.U.uSpec, new Float32Array([].concat(...pg.spectrum)));
      return P;
    }
    let blank = null; function blankTex() { if (!blank) { blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, blank); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } return blank; }
    function texture(o) { o = o || {}; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); const f = o.linear === false ? gl.NEAREST : gl.LINEAR; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); if (o.w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, o.w, o.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; }
    let halfFloat = null;
    function floatFmt() {
      if (halfFloat !== null) return halfFloat;
      if (gl.isWebGL2) { halfFloat = gl.getExtension('EXT_color_buffer_float') ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : false; }
      else { const e = gl.getExtension('OES_texture_half_float'); gl.getExtension('OES_texture_half_float_linear'); halfFloat = e && gl.getExtension('EXT_color_buffer_half_float') ? { internal: gl.RGBA, type: e.HALF_FLOAT_OES } : false; }
      return halfFloat;
    }
    /* target(w,h,{float}): an FBO + texture; float falls back to RGBA8 when half-float rendering is unavailable */
    function target(w, h, o) {
      o = o || {}; const t = texture(o), ff = o.float ? floatFmt() : false;
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (ff) gl.texImage2D(gl.TEXTURE_2D, 0, ff.internal, w, h, 0, gl.RGBA, ff.type, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: t, fb, w, h, float: !!ff, bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); }, dispose() { gl.deleteTexture(t); gl.deleteFramebuffer(fb); } };
    }
    function pingpong(w, h, o) { const a = target(w, h, o), b = target(w, h, o); const pp = { read: a, write: b, swap() { const t = pp.read; pp.read = pp.write; pp.write = t; }, dispose() { a.dispose(); b.dispose(); } }; return pp; }
    /* quad(prog): draw a full-viewport quad (attribute aPos) */
    function quad(P) {
      if (!quadBuf) { quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); }
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); const a = P.A.aPos; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    /* mesh(cols, rows): a tessellated plane, attribute aUV in 0..1. draw(prog, rect) sets uMeshRect (stage px; default = art rect). */
    function mesh(cols, rows) {
      cols = Math.max(1, Math.round(cols)); rows = Math.max(1, Math.round(rows));
      const v = new Float32Array((cols + 1) * (rows + 1) * 2); let k = 0; for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { v[k++] = i / cols; v[k++] = j / rows; }
      const idx = new Uint16Array(cols * rows * 6); k = 0; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6; }
      const vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      return { cols, rows, uv: v, draw(P, rect) { const r = rect || ctx.art.rect; P.set('uMeshRect', Array.isArray(r) ? r : [r.x, r.y, r.w, r.h]); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); const a = P.A.aUV; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0); }, dispose() { gl.deleteBuffer(vb); gl.deleteBuffer(ib); } };
    }
    /* particles(n, stride): CPU-side Float32 buffer + VBO. draw(prog, {aName:[size, offsetFloats]}, count) */
    function particles(n, stride) {
      stride = stride || 4; const data = new Float32Array(n * stride), buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      return { n, stride, data, count: 0, upload(count) { this.count = count == null ? n : count; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, this.count * stride)); },
        draw(P, layout, count) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); for (const name in layout) { const a = P.A[name]; if (a == null) continue; gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, layout[name][0], gl.FLOAT, false, stride * 4, layout[name][1] * 4); } gl.drawArrays(gl.POINTS, 0, count == null ? this.count : count); },
        /* seed one particle per sample (or `per` jittered dots per sample): writes x,y,tx,ty,s,stroke-hash into the first 6 floats when stride ≥ 6 */
        seedFromSamples(per, jitter) { const S = ctx.samples; per = per || 1; let k = 0; for (let i = 0; i < S.n && k < n; i++) for (let q = 0; q < per && k < n; q++, k++) { const b = k * stride, j = (Math.random() - .5) * (jitter || 0); data[b] = S.x[i] + S.ty[i] * j; data[b + 1] = S.y[i] - S.tx[i] * j; if (stride > 2) data[b + 2] = S.tx[i]; if (stride > 3) data[b + 3] = S.ty[i]; if (stride > 4) data[b + 4] = S.s[i]; if (stride > 5) data[b + 5] = ((S.stroke[i] * 2654435761) >>> 0) / 4294967296; } this.upload(k); return k; },
        dispose() { gl.deleteBuffer(buf); } };
    }
    /* c2d(): a lazily created Canvas2D overlay above the GL canvas (same size, DPR-scaled, inside the wrapper) */
    let c2dCv = null, c2dCtx = null;
    function c2d() { if (!c2dCv) { c2dCv = D.createElement('canvas'); c2dCv.className = 'vhfx2-2d'; wrap.appendChild(c2dCv); c2dCtx = c2dCv.getContext('2d'); sizeC2d(); } return c2dCtx; }
    function sizeC2d() { if (!c2dCv) return; const w = Math.round(ctx.W * ctx.dpr), h = Math.round(ctx.H * ctx.dpr); if (c2dCv.width !== w || c2dCv.height !== h) { c2dCv.width = w; c2dCv.height = h; } c2dCtx.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0); }
    /* drawArt({mvp, mesh, paper:true|false, tint:[r,g,b,amount]}): the plain art (rest image), optionally through a camera */
    let artMesh = null;
    const FS_ART = `varying vec2 vUV; varying vec2 vStage; uniform float uPaperOn; uniform vec4 uTint;
void main(){ float a = artCoverage(vUV); vec3 ink = mix(inkAt(vStage), uTint.rgb, uTint.a); vec3 col = mix(uPaper, ink, a); gl_FragColor = uPaperOn > .5 ? vec4(col, 1.) : vec4(ink * a, a); }`;
    function drawArt(o) {
      o = o || {}; if (!gl) return;
      const P = bind(program(VS_MESH, FS_ART)); P.set('uMVP', o.mvp || mat4.tilt(ctx.W, ctx.H, 0, 0)).set('uPaperOn', o.paper ? 1 : 0).set('uTint', o.tint || [0, 0, 0, 0]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (o.paper) { const m = o.mesh || (artMesh || (artMesh = mesh(1, 1))); P.set('uMeshRect', [0, 0, ctx.W, ctx.H]); m.draw(P, [0, 0, ctx.W, ctx.H]); }
      else (o.mesh || (artMesh || (artMesh = mesh(1, 1)))).draw(P);
    }
    function clearSurface(col) { if (!gl) return; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); if (col) gl.clearColor(col[0], col[1], col[2], col.length > 3 ? col[3] : 1); else gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    /* viewBox → stage px, and stage px → art uv */
    function toStage(vx, vy, out) { const a = ctx.art; out = out || [0, 0]; out[0] = vx * a.s + a.ox; out[1] = vy * a.s + a.oy; return out; }
    function toArt(x, y, out) { const r = ctx.art.rect; out = out || [0, 0]; out[0] = (x - r.x) / r.w; out[1] = (y - r.y) / r.h; return out; }

    /* ------------------------------------------------ art: geometry, samples, stroke texture */
    const colorway = () => Object.assign({}, handle.colorway || {}, (typeof cwOverride === 'function' ? cwOverride() : cwOverride) || {});
    function refreshPalette() { ctx.pal = palette(colorway()); }
    /* layout size of the stage: clientWidth ignores transforms (a tilted tile is never measured small) */
    function viewWindow() {
      const p = handle.parsed;
      if (opts.crop && Geo && Geo.artWindow) return Geo.artWindow(p, handle.w, handle.h, handle.fit, opts.crop);
      return handle.win || p.vb;
    }
    function map() {
      const g = ctx.geom; if (!g || !handle.box) return;
      const sr = stage.getBoundingClientRect(), r = handle.box.getBoundingClientRect(), a = ctx.art;
      const sc = sr.width ? ctx.W / sr.width : 1, bw = handle.w || r.width * sc, bh = handle.h || r.height * sc;
      const dp = Math.min(2, W.devicePixelRatio || 1) * 1;
      /* the browser snaps the ink layer's box to whole device pixels; the texture lies on the same grid, so it is drawn 1:1 */
      const bx = Math.round((r.left - sr.left) * sc * dp) / dp, by = Math.round((r.top - sr.top) * sc * dp) / dp;
      a.rect.x = bx; a.rect.y = by; a.rect.w = Math.max(1, Math.ceil(bw * dp)) / dp; a.rect.h = Math.max(1, Math.ceil(bh * dp)) / dp;
      const [vx, vy, vw, vh] = viewWindow(), s = Math.min(bw / vw, bh / vh);
      a.s = s; a.ox = bx + (bw - vw * s) / 2 - vx * s; a.oy = by + (bh - vh * s) / 2 - vy * s; a.vb = g.vb;
      a.duo = [vx * s + a.ox, vy * s + a.oy, (vx + vw) * s + a.ox, (vy + vh) * s + a.oy];
      if (handle.look) { a.lw = handle.look.lw || 1; a.alpha = handle.look.alpha == null ? 1 : handle.look.alpha; }
      const S = ctx.samples; if (S) for (let i = 0; i < S.n; i++) { S.x[i] = g.sx[i] * s + a.ox; S.y[i] = g.sy[i] * s + a.oy; S.len[i] = g.sarc[i] * s; }
    }
    function buildSamples(g) {
      const n = g.ns, S = { n, x: new Float32Array(n), y: new Float32Array(n), tx: g.tx, ty: g.ty, s: g.sn, len: new Float32Array(n), stroke: g.sj, buf: g.sbuf, count: 0,
        near(x, y, r) { const a = ctx.art; return qSamples(g, (x - a.ox) / a.s, (y - a.oy) / a.s, r / a.s); },
        nearest(x, y, r) { const m = S.near(x, y, r); let best = -1, bd = Infinity; for (let k = 0; k < m; k++) { const id = g.sbuf[k], d = (S.x[id] - x) ** 2 + (S.y[id] - y) ** 2; if (d < bd) { bd = d; best = id; } } return best; },
        next(i) { return i + 1 < n && g.sj[i + 1] === g.sj[i] ? i + 1 : -1; }, prev(i) { return i > 0 && g.sj[i - 1] === g.sj[i] ? i - 1 : -1; } };
      return S;
    }
    function qSamples(g, x, y, r) {
      const [vx, vy] = g.vb, cs = g.cs, gw = g.gw, gh = g.gh, r2 = r * r;
      const i0 = Math.max(0, Math.floor((x - r - vx) / cs)), i1 = Math.min(gw - 1, Math.floor((x + r - vx) / cs)), j0 = Math.max(0, Math.floor((y - r - vy) / cs)), j1 = Math.min(gh - 1, Math.floor((y + r - vy) / cs));
      let n = 0; const O = g.soff, I = g.sids, B = g.sbuf;
      for (let cy = j0; cy <= j1; cy++) for (let cx = i0; cx <= i1; cx++) { const c = cy * gw + cx; for (let k = O[c], e = O[c + 1]; k < e; k++) { const id = I[k], dx = g.sx[id] - x, dy = g.sy[id] - y; if (dx * dx + dy * dy <= r2) B[n++] = id; } }
      return n;
    }
    /* The art texture: white strokes, coverage in alpha, so the surface at rest equals the ink layer.
       Canvas-mode tiles: drawn from the parsed geometry with the same window, line weight and alpha as the plot-in canvas
       (pixel-identical). SVG-mode tiles: the live inline SVG is serialised with its computed look and rendered by the
       browser's own SVG renderer, so the hand-off swap is invisible. */
    let rasterGen = 0;
    function polysCanvas(tw, th, dpr) {
      const a = ctx.art, p = handle.parsed, bw = handle.w, bh = handle.h;
      const [vx, vy, vw, vh] = viewWindow(), S = Math.min(bw / vw, bh / vh), OX = (bw - vw * S) / 2 - vx * S, OY = (bh - vh * S) / 2 - vy * S;
      const pc = D.createElement('canvas'); pc.width = tw; pc.height = th; const c = pc.getContext('2d');
      if (c) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#ffffff'; c.globalAlpha = a.alpha;
        const lw = a.lw;
        for (let j = 0; j < p.polys.length; j++) {
          const P = p.polys[j]; if (P.length < 4) continue;
          c.lineWidth = lw * Math.max(0.5, p.widths[j] / 0.3); c.beginPath(); c.moveTo(P[0] * S + OX, P[1] * S + OY);
          for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] * S + OX, P[i + 1] * S + OY);
          c.stroke();
        }
      }
      return pc;
    }
    function svgCanvas(tw, th, dpr) {
      const svg = handle.svg; if (!svg || !W.Image || !W.Blob || !W.URL || !W.XMLSerializer) return Promise.resolve(null);
      const a = ctx.art, vbv = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (vbv.length !== 4 || vbv.some((v) => !Number.isFinite(v))) return Promise.resolve(null);
      const [vx, vy, vw, vh] = vbv, kx = handle.w * dpr / vw, ky = handle.h * dpr / vh, L = a.lw * dpr;
      const cl = svg.cloneNode(true);
      cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); cl.setAttribute('width', tw); cl.setAttribute('height', th); cl.removeAttribute('class'); cl.removeAttribute('style');
      cl.setAttribute('viewBox', `${vx} ${vy} ${tw / kx} ${th / ky}`); cl.setAttribute('preserveAspectRatio', 'none'); cl.querySelectorAll('defs').forEach((d) => d.remove());
      const st = D.createElementNS('http://www.w3.org/2000/svg', 'style');
      st.textContent = `svg{fill:none;stroke:#fff;stroke-width:${L}px;stroke-opacity:${a.alpha};stroke-linecap:round;stroke-linejoin:round}g{stroke:#fff}
path,circle,polyline,polygon,line{vector-effect:non-scaling-stroke}[style*="--sp-w"]{stroke-width:calc(${L}px * var(--sp-w))}`;
      cl.insertBefore(st, cl.firstChild);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new W.XMLSerializer().serializeToString(cl))}`;
      return new Promise((res) => {
        const im = new W.Image(); im.decoding = 'async';
        im.onload = () => { const pc = D.createElement('canvas'); pc.width = tw; pc.height = th; const c = pc.getContext('2d'); if (c) c.drawImage(im, 0, 0); res(pc); };
        im.onerror = () => res(null);
        im.src = url;
      });
    }
    function rasterize() {
      if (!gl || !handle.parsed || !handle.w) return Promise.resolve();
      const t0 = nowMs(); map(); const gen = ++rasterGen;
      const a = ctx.art, dpr = Math.min(2, W.devicePixelRatio || 1), tw = Math.max(1, Math.round(a.rect.w * dpr)), th = Math.max(1, Math.round(a.rect.h * dpr));
      const src = handle.mode === 'svg' && handle.svg ? svgCanvas(tw, th, dpr) : Promise.resolve(null);
      return src.then((svgPc) => {
        if (gen !== rasterGen || ctl.destroyed || !gl) return;
        const pc = svgPc || polysCanvas(tw, th, dpr);
        if (!a.tex) a.tex = texture({ linear: true });
        gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pc); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        a.texW = tw; a.texH = th; a.canvas = pc; a.ready = true; ctl.stats.rasterMs = nowMs() - t0; ctl.stats.rasterSource = svgPc ? 'svg' : 'polys';
        if (inst && inst.def.onArt) try { inst.def.onArt(ctx); } catch (e) { warn(e); }
      });
    }
    const warn = (e) => { if (W.console) W.console.warn('[StartPageHoverFx]', e); };
    function size() {
      ctx.W = stage.clientWidth || stage.getBoundingClientRect().width; ctx.H = stage.clientHeight || stage.getBoundingClientRect().height;
      const dpr = Math.min(2, W.devicePixelRatio || 1) * ctx.quality.dpr; ctx.dpr = dpr;
      const w = Math.max(1, Math.round(ctx.W * dpr)), h = Math.max(1, Math.round(ctx.H * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      sizeC2d(); map();
    }
    let resizeT = 0;
    function onResize() { if (ctl.destroyed) return; size(); clearTimeout(resizeT); resizeT = setTimeout(() => { if (ctl.destroyed) return; if (ctx.keep) ctx.keep.refresh(); rasterize(); if (inst && inst.def.resize) try { inst.def.resize(ctx); } catch (e) { warn(e); } }, 200); }

    const ready = (async () => {
      if (handle.ready) await handle.ready;
      if (ctl.destroyed || !handle.parsed || !handle.alive()) return ctl;
      ctx.geom = buildGeom(handle.parsed); ctx.samples = buildSamples(ctx.geom); ctl.stats.buildMs = ctx.geom.ms;
      refreshPalette(); size();
      ctx.keep = KeepOut(ctx, opts.keepOut || DEFAULT_KEEPOUT); ctx.keep.refresh();
      await rasterize();
      if (ctl.destroyed) return ctl;
      setEffect(effectId);
      if (opts.pointer && typeof opts.pointer.x === 'number') { const p = opts.pointer; if (p.clientX == null) input('enter', p.x, p.y); }
      else if (opts.pointer && opts.pointer.clientX != null) { const sr = stage.getBoundingClientRect(), sc = sr.width ? ctx.W / sr.width : 1; input('enter', (opts.pointer.clientX - sr.left) * sc, (opts.pointer.clientY - sr.top) * sc); }
      return ctl;
    })();
    ctl.ready = ready.catch((e) => { warn(e); return ctl; });
    ctl.ctx = ctx;

    /* ------------------------------------------------ effect lifecycle */
    function setEffect(id) {
      stop(true);
      if (inst) { try { inst.def.dispose && inst.def.dispose(ctx); } catch (e) { warn(e); } }
      ctl.effect = id; ctx.state = {}; ctx.energy = 0; inst = null;
      const def = byId(id);
      if (def && ctx.geom && (!def.needsGL || gl)) { inst = { def }; try { def.init && def.init(ctx); } catch (e) { warn('init ' + id + ': ' + (e && e.message)); inst = null; } }
      ctl.ok = !!inst;
      if (!allowed()) { ctx.reduced = true; }
    }
    /* hand-off: the surface's first frame equals the rest image; the ink layer hides in the same frame */
    function handOff() {
      if (handed) return; handed = true; clearTimeout(fadeT);
      const xf = !!gl && !manual; wrap.classList.toggle('xfade', xf);   /* a 180 ms cross-fade hides any anti-aliasing difference between the browser's SVG renderer and the surface */ wrap.classList.add('on');
      if (!xf) { if (handle.box) handle.box.style.visibility = 'hidden'; return; }
      W.requestAnimationFrame && W.requestAnimationFrame(() => { wrap.classList.add('in'); fadeT = setTimeout(() => { if (handed && handle.box) handle.box.style.visibility = 'hidden'; }, 200); });
    }
    function handBack() {
      if (!handed) return; handed = false; clearTimeout(fadeT);
      if (handle.box) handle.box.style.visibility = '';
      const done = () => { if (!handed) { wrap.classList.remove('on', 'in', 'xfade'); wrap.style.transform = ''; clearSurface(); if (c2dCtx) c2dCtx.clearRect(0, 0, ctx.W, ctx.H); } };
      if (wrap.classList.contains('xfade')) { wrap.classList.remove('in'); fadeT = setTimeout(done, 200); }
      else if (manual || !W.requestAnimationFrame) done(); else W.requestAnimationFrame(done);
    }
    function wake() {
      if (running || ctl.paused || !visible || !inst || !allowed() || ctl.destroyed || !ctx.art.ready && gl) return;
      running = true; last = 0;
      if (!manual) raf = W.requestAnimationFrame(tick);
    }
    function stop(immediate) { if (raf && W.cancelAnimationFrame) W.cancelAnimationFrame(raf); raf = 0; running = false; if (immediate) handBack(); }
    function tick(now) {
      raf = 0; if (!running) return;
      const dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 1 / 60; last = now;
      if (!stepFrame(dt)) return;
      raf = W.requestAnimationFrame(tick);
    }
    /* one frame of simulated time; returns false once the effect is at rest (and the ink layer is back) */
    function stepFrame(dt) {
      if (ctl.paused || !visible || ctl.destroyed || !inst || !allowed() || (handle.alive && !handle.alive())) { running = false; handBack(); if (handle.alive && !handle.alive()) destroy(); return false; }
      ctx.dt = dt; ctx.t += dt;
      ctx.on = inside; ctx.k = ctx.on ? Math.min(1, ctx.k + dt / 0.25) : Math.max(0, ctx.k - dt / 0.75);
      const P = ctx.pointer, w = TAU * 16, f = 1 - Math.exp(-w * dt * 0.5);
      P.sx += (P.x - P.sx) * f; P.sy += (P.y - P.sy) * f;
      P.vx *= Math.exp(-dt * 6); P.vy *= Math.exp(-dt * 6); P.speed = Math.hypot(P.vx, P.vy);
      P.idle += dt; P.dwell = P.speed < 40 && P.inside ? P.dwell + dt : 0;
      if (ctl.stats.frames % 30 === 0) map();
      const t0 = nowMs();
      if (gl) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); }
      let res;
      try { res = inst.def.frame(ctx, dt); } catch (e) { warn('frame ' + ctl.effect + ': ' + (e && e.message)); running = false; handBack(); return false; }
      handOff();
      P.flick = false;
      if (opts.syncTiming && gl) { if (!ctl._px) ctl._px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ctl._px); }
      const ms = nowMs() - t0, S = ctl.stats;
      adapt(ms); S.frames++; S.sum += ms; if (ms > S.worst) S.worst = ms; if (ms > 16.7) S.over16++; if (S.list.length < 3000) S.list.push(ms);
      if (typeof res === 'number') ctx.energy = res;
      const idle = inst.def.idle ? inst.def.idle(ctx) : ctx.energy < 1e-3;
      if (!ctx.on && ctx.k <= 0 && idle) { if (gl) { clearSurface(); drawArt({ paper: true }); } running = false; handBack(); return false; }   /* the last frame is the exact rest image */
      return true;
    }
    function advance(seconds, step) {
      const h = step || 1 / 60; let t = 0;
      while (t < seconds && running) { if (!stepFrame(h)) break; t += h; }
      return t;
    }
    /* adaptive quality: step 1 dpr, step 2 halve fields, step 3 halve mesh; never shrink reach */
    let ema = 0;
    function adapt(ms) {
      const S = ctl.stats; ema = S.frames < 3 ? Math.max(ema, ms * 0.6) : ema * 0.9 + ms * 0.1;
      const q = ctx.quality; if (S.frames > 8 && ema > 9 && q.level < 3 && !manual) {
        q.level++; ema = 4;
        if (q.level === 1) { q.dpr = Math.min(1, 1.25 / Math.min(2, W.devicePixelRatio || 1)); size(); }
        if (q.level === 2) q.field = 0.5; if (q.level === 3) q.mesh = 0.5;
        if (inst && inst.def.quality) try { inst.def.quality(ctx, q); } catch (e) { warn(e); }
      }
    }

    /* ------------------------------------------------ input */
    let lastFeed = 0;
    function feed(x, y, now, pressure) {
      const P = ctx.pointer, dtm = Math.max(8, now - (lastFeed || now - 16)) / 1000; lastFeed = now;
      const vx = (x - P.x) / dtm, vy = (y - P.y) / dtm;
      if (ctx.k <= 0 && !ctx.on) { P.sx = x; P.sy = y; P.vx = 0; P.vy = 0; }
      else { P.vx += (clamp(vx, -4000, 4000) - P.vx) * 0.5; P.vy += (clamp(vy, -4000, 4000) - P.vy) * 0.5; }
      P.x = x; P.y = y; P.idle = 0; if (pressure != null) P.pressure = pressure;
      const sp = Math.hypot(P.vx, P.vy); if (sp > 1800 && !P._fl) { P.flick = true; P._fl = true; send('flick', x, y); } else if (sp < 900) P._fl = false;
    }
    function send(type, x, y, e) {
      const P = ctx.pointer;
      if (!allowed()) { stillInput(type, x, y); return; }
      if (inst && inst.def.pointer) try { inst.def.pointer(ctx, { type, x, y, vx: P.vx, vy: P.vy, speed: P.speed, pressure: P.pressure, pointerType: P.type, event: e || null }); } catch (er) { warn(er); }
    }
    /* input(type, x, y): the same path the DOM listeners use (stage px). Types: enter, move, leave, down, up, tap. */
    function input(type, x, y, now) {
      if (ctl.destroyed) return;
      const P = ctx.pointer, t = now == null ? nowMs() : now;
      if (type === 'enter' || (type === 'move' && !inside)) {
        if (!inside) { inside = true; P.inside = true; if (ctx.k <= 0) { P.x = P.sx = x; P.y = P.sy = y; } send('enter', x, y); }
        if (type === 'enter') { feed(x, y, t); wake(); return; }
      }
      if (type === 'move') { feed(x, y, t); send('move', x, y); wake(); }
      else if (type === 'down') { P.down = true; input('move', x, y, t); send('down', x, y); }
      else if (type === 'up') { P.down = false; send('up', x, y); }
      else if (type === 'tap') { send('tap', x, y); if (allowed()) { P.flick = true; send('flick', x, y); } wake(); }
      else if (type === 'leave') { inside = false; P.inside = false; send('leave', P.x, P.y); wake(); }
    }
    const local = (e) => { const r = stage.getBoundingClientRect(), sc = r.width ? ctx.W / r.width : 1; return [(e.clientX - r.left) * sc, (e.clientY - r.top) * sc]; };
    let downAt = 0; let downXY = [0, 0];
    const onMove = (e) => { const [x, y] = local(e); ctx.pointer.type = e.pointerType || 'mouse'; input('move', x, y, nowMs()); };
    const onLeave = (e) => { const P = ctx.pointer; if (e.pointerType === 'touch') { setTimeout(() => { inside = false; P.inside = false; }, 900); } else input('leave', P.x, P.y); };
    const onDown = (e) => { downAt = nowMs(); downXY = local(e); ctx.pointer.type = e.pointerType || 'mouse'; input('down', downXY[0], downXY[1], downAt); };
    const onUp = (e) => { const [x, y] = local(e); input('up', x, y); if (nowMs() - downAt < 300 && Math.hypot(x - downXY[0], y - downXY[1]) < 10) input('tap', x, y); };
    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerdown', onDown, { passive: true });
    stage.addEventListener('pointerup', onUp, { passive: true });
    stage.addEventListener('pointerleave', onLeave, { passive: true });
    stage.addEventListener('pointercancel', onLeave, { passive: true });

    /* ------------------------------------------------ still (reduced-motion): the effect's still frame, 300 ms opacity fade only */
    let restT = 0;
    function stillInput(type, x, y) {
      if (type === 'enter' || type === 'tap') showStill(true, x, y);
      else if (type === 'move') { clearTimeout(restT); restT = setTimeout(() => showStill(true, x, y), 400); }
      else if (type === 'leave') { clearTimeout(restT); hideStill(); }
    }
    function showStill(on, x, y) {
      if (ctl.destroyed || !on || !inst || !inst.def.reducedMotion || !ctx.art.ready) { hideStill(); return; }
      const P = ctx.pointer; P.x = P.sx = x == null ? P.x : x; P.y = P.sy = y == null ? P.y : y; P.vx = P.vy = P.speed = 0; ctx.k = 1;
      if (gl) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); }
      try { inst.def.reducedMotion(ctx); } catch (e) { warn(e); return; }
      clearTimeout(stillT); wrap.classList.add('on', 'still'); stillShown = true;
      if (W.requestAnimationFrame) W.requestAnimationFrame(() => wrap.classList.add('still-in')); else wrap.classList.add('still-in');
      stillT = setTimeout(() => { if (stillShown && handle.box) handle.box.style.visibility = 'hidden'; }, 320);
    }
    function hideStill() {
      if (!stillShown) return; stillShown = false; clearTimeout(stillT);
      if (handle.box) handle.box.style.visibility = '';
      wrap.classList.remove('still-in');
      stillT = setTimeout(() => { if (!stillShown) { wrap.classList.remove('on', 'still'); clearSurface(); } }, 320);
    }

    /* ------------------------------------------------ observers, motion gating, recolor */
    const ro = typeof W.ResizeObserver !== 'undefined' ? new W.ResizeObserver(onResize) : null; if (ro) { ro.observe(stage); if (handle.box) ro.observe(handle.box); }
    const io = typeof W.IntersectionObserver !== 'undefined' ? new W.IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting && !D.hidden; if (visible) wake(); }, { threshold: 0.01 }) : null; if (io) io.observe(stage);
    const onVis = () => { visible = !D.hidden; if (visible) wake(); };
    D.addEventListener('visibilitychange', onVis);
    const onMotion = () => { ctx.reduced = !allowed(); if (ctx.reduced) { stop(true); ctx.k = 0; } else hideStill(); };
    W.addEventListener('vectura:start-page-motion', onMotion);
    if (mqReduced && mqReduced.addEventListener) mqReduced.addEventListener('change', onMotion);
    ctx.reduced = !allowed();
    /* recolor: the handle's colorway changed (live recolor) */
    ctl.recolor = () => { refreshPalette(); rasterize(); if (inst && inst.def.recolor) try { inst.def.recolor(ctx); } catch (e) { warn(e); } wake(); };
    ctl.setColorway = (cw) => { cwOverride = cw || null; ctl.recolor(); };
    if (gl) {
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(true); ctx.art.tex = null; ctx.art.ready = false; progCache.clear(); quadBuf = null; blank = null; artMesh = null; if (ctx.keep) ctx.keep.tex = null; });
      cv.addEventListener('webglcontextrestored', () => { if (ctx.keep) ctx.keep.refresh(); rasterize().then(() => setEffect(ctl.effect)); });
    }

    function destroy() {
      if (ctl.destroyed) return; ctl.destroyed = true; clearTimeout(resizeT); clearTimeout(restT); clearTimeout(stillT); clearTimeout(fadeT);
      stop(false); stillShown = false;
      if (inst) try { inst.def.dispose && inst.def.dispose(ctx); } catch (e) { /* ignore */ }
      if (handle.box) handle.box.style.visibility = '';
      stage.removeEventListener('pointermove', onMove); stage.removeEventListener('pointerdown', onDown); stage.removeEventListener('pointerup', onUp); stage.removeEventListener('pointerleave', onLeave); stage.removeEventListener('pointercancel', onLeave);
      D.removeEventListener('visibilitychange', onVis); W.removeEventListener('vectura:start-page-motion', onMotion); if (mqReduced && mqReduced.removeEventListener) mqReduced.removeEventListener('change', onMotion);
      ro && ro.disconnect(); io && io.disconnect();
      try { const lose = gl && gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext(); } catch (e) { /* ignore */ }
      wrap.remove(); stage.classList.remove('sp-hfx-stage');
    }
    return ctl;
  }

  Vectura.StartPageHoverFxCore = {
    version: '1', register, attach, byId, glOK, list: () => FX.map((f) => ({ id: f.id, name: f.name, blurb: f.blurb, still: !!f.reducedMotion })),
    onRegister: (fn) => { hooks.registered.push(fn); },
    palette, Spring, mat4, Field, Noise, GLSL, clamp, smooth, buildGeom,
    core: { oklch, toOklab, fromOklab, hx, lum, mix },
  };
})();
