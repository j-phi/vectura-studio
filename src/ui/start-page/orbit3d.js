/* ===================== StartPageOrbit3D: live, drag-to-rotate 3D line art in plotter style =====================
 * window.Vectura.StartPageOrbit3D.mount(el, {type, presetId, model, colorway, hint, disc, label, duration, plotted, paper})  (plotted: show finished at once, no plot-in)
 *   -> {setModel, setColorway, destroy, model, info, matrix, plotted}
 * Port of the reference mockup's orbit3d.js. Models are chosen by Vectura algorithm type via modelFor(type, presetId):
 *   topoform -> torus, spiralizer -> coiled-sphere, terrain -> terrain (terrain-alpine when the preset id says alpine),
 *   polyhedron -> icosahedron, scene3d / object3d -> 'scene:<presetId>', or 'scene:<key>' for a scene registered with
 *   registerScene(key, sceneFromDoc(payload), name) (a saved work's own scene), anything else -> null (no live model).
 *   A 'scene:' id is drawn by StartPageSceneOrbit (real renders), never by mount() here.
 * The models are drawn live in the manner of the piece, not the exports; labels say so.
 * Motion: Still (StartPageInk.isStill / the vectura:start-page-motion event) or prefers-reduced-motion means no plot-in,
 * no sway and no inertia. `colorway` is { paper, ink, ink2? } or a () => that object; recolor live with setColorway.
 * Off-screen models are PAUSED, not destroyed: the IntersectionObserver stops the frame loop when the model leaves the viewport and the
 * canvas, matrix and plot state stay as they were; scrolling back kicks it again (nothing is rebuilt or re-plotted).
 * Idle cost: the sway redraws at ~15 fps (not the display rate), stops after SWAY_MAX (~20 s) with no interaction, and
 * resumes on pointer enter, focus or scrolling back into view. The z-buffer is reused while the view matrix is unchanged.
 * `disc:true` gives the Plate 4 look: round, on a slightly lighter paper, with no ring, border or outline. */
(function (W, D) {
  'use strict';
  const Vectura = (W.Vectura = W.Vectura || {});
  if (Vectura.StartPageOrbit3D) return;
  const T = Math.PI * 2, CAM = 6;
    const reducedMQ = () => { try { return W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  /* Motion contract: Still (StartPageInk.isStill, else the vectura:start-page-motion event) or prefers-reduced-motion */
  let stillEvt = false;
  const isStill = () => { try { const I = Vectura.StartPageInk; if (I && typeof I.isStill === 'function') return !!I.isStill(); } catch (e) { /* fall through */ } return stillEvt || reducedMQ(); };
  const motionOK = () => !isStill();

  /* ---------- 3×3 row-major matrices ---------- */
  const mul = (A, B) => { const C = new Float64Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
  const rx = a => { const c = Math.cos(a), s = Math.sin(a); return Float64Array.of(1, 0, 0, 0, c, -s, 0, s, c); };
  const ry = a => { const c = Math.cos(a), s = Math.sin(a); return Float64Array.of(c, 0, s, 0, 1, 0, -s, 0, c); };
  const rz = a => { const c = Math.cos(a), s = Math.sin(a); return Float64Array.of(c, -s, 0, s, c, 0, 0, 0, 1); };
  function orthonorm(M) {
    const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    let a = n([M[0], M[1], M[2]]), b = [M[3], M[4], M[5]]; const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = n([b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]);
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return Float64Array.of(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* ---------- seeded value noise for the terrains ---------- */
  function noise2(seed) {
    const P = new Uint8Array(512); let s = seed >>> 0 || 1; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    const G = [...Array(256)].map(() => { const a = rnd() * T; return [Math.cos(a), Math.sin(a)]; });
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y;
      const g = (i, j, dx, dy) => { const v = G[P[(P[(X + i) & 255] + Y + j) & 255]]; return v[0] * dx + v[1] * dy; };
      const u = fade(fx), v = fade(fy), a = g(0, 0, fx, fy), b = g(1, 0, fx - 1, fy), c = g(0, 1, fx, fy - 1), d = g(1, 1, fx - 1, fy - 1);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v; };
  }

  /* ---------- models (object-space polylines, flat xyz) ---------- */
  const BUILD = {
    torus() { // Topoform: a torus sliced on parallel planes; each contour one closed stroke
      const R = 1, r = .42, N = 46, polys = [];
      for (let k = 0; k < N; k++) {
        const c = -(R + r) + (k + .5) * 2 * (R + r) / N, ac = Math.abs(c);
        const pt = (v, sg) => { const w = R + r * Math.cos(v), u = Math.acos(Math.max(-1, Math.min(1, c / w))); return [c, sg * w * Math.sin(u), r * Math.sin(v)]; };
        if (ac <= R - r) { for (const sg of [1, -1]) { const q = []; for (let i = 0; i <= 150; i++) q.push(...pt(i / 150 * T, sg)); polys.push(q); } }
        else { const vb = Math.acos(Math.max(-1, Math.min(1, (ac - R) / r))), q = [], K = 80;
          for (let i = 0; i <= K; i++) q.push(...pt(-vb + 2 * vb * i / K, 1)); for (let i = K; i >= 0; i--) q.push(...pt(-vb + 2 * vb * i / K, -1)); polys.push(q); }
      }
      const U = 72, Wn = 32, verts = new Float32Array(U * Wn * 3), tris = [];
      for (let i = 0; i < U; i++) for (let j = 0; j < Wn; j++) { const u = i / U * T, v = j / Wn * T, w = R + r * Math.cos(v), o = (i * Wn + j) * 3; verts[o] = w * Math.cos(u); verts[o + 1] = w * Math.sin(u); verts[o + 2] = r * Math.sin(v); }
      for (let i = 0; i < U; i++) for (let j = 0; j < Wn; j++) { const a = i * Wn + j, b = ((i + 1) % U) * Wn + j, c = ((i + 1) % U) * Wn + (j + 1) % Wn, d = i * Wn + (j + 1) % Wn; tris.push(a, b, c, a, c, d); }
      return { title: 'Torus Contours', algo: 'Topoform', note: N + ' slices · hidden lines removed', file: 'topoform-torus-contours.svg', rad: 1.42, home: mul(rx(-1.02), rz(.5)), polys, mesh: { verts, tris: Uint32Array.from(tris) }, kind: 'zbuf', eps: .045 };
    },
    'coiled-sphere'() { // Spiralizer: one spiral wound pole to pole; the far side is dashed, as the app previews it
      const turns = 16, n = turns * 140, q = [], rho = 1.25;
      for (let i = 0; i <= n; i++) { const t = i / n, th = Math.PI * t, ph = T * turns * t; q.push(rho * Math.sin(th) * Math.cos(ph), rho * Math.cos(th), rho * Math.sin(th) * Math.sin(ph)); }
      return { title: 'Coiled Sphere', algo: 'Spiralizer', note: turns + ' turns · one stroke · far side dashed', file: 'spiralizer-spherical-wrap.svg', rad: 1.25, home: mul(rx(.36), rz(-.22)), polys: [q], kind: 'sphere', rho, dashBack: true, fill: .76 };
    },
    icosahedron() { // Polyhedron: faces hatched in four tone bands from a view-space light
      const g = (1 + Math.sqrt(5)) / 2, rho = 1.3, V0 = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
      const Vs = V0.map(v => { const l = Math.hypot(...v); return v.map(x => x * rho / l); });
      const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
      function hatch(tri, d, gap) {
        const cen = [0, 1, 2].map(i => (tri[0][i] + tri[1][i] + tri[2][i]) / 3), P = tri.map(p => p.map((x, i) => cen[i] + (x - cen[i]) * .9));
        const n = nrm(cross(sub(P[1], P[0]), sub(P[2], P[0]))), e = nrm(cross(n, d)), s = P.map(p => dot(p, e)), lo = Math.min(...s), hi = Math.max(...s), out = [];
        for (let t = lo + gap * .5; t < hi; t += gap) { const hit = [];
          for (let k = 0; k < 3; k++) { const a = P[k], b = P[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3]; if ((sa - t) * (sb - t) < 0) { const f = (t - sa) / (sb - sa); hit.push(a.map((x, i) => x + (b[i] - x) * f)); } }
          if (hit.length === 2) out.push([...hit[0], ...hit[1]]); }
        return out;
      }
      const faces = F.map(f => { const tri = f.map(i => Vs[i]), n = nrm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))), d = nrm(cross(n, [.31, 1, .17])), d2 = nrm(cross(n, d));
        return { f, n, cen: [0, 1, 2].map(i => (tri[0][i] + tri[1][i] + tri[2][i]) / 3), h1: hatch(tri, d, .15), h2: hatch(tri, d, .075), h3: hatch(tri, d2, .075) }; });
      return { title: 'Icosahedron', algo: 'Polyhedron', note: '20 faces · tone in 4 hatch bands', file: null, rad: 1.3, home: mul(rx(.38), ry(.52)), V: Vs, faces, kind: 'poly' };
    },
    terrain() { return terrainModel({ seed: 7, title: 'High Sierra', file: 'terrain-mountain-range.svg', alpine: false }); },
    'terrain-alpine'() { return terrainModel({ seed: 23, title: 'Alpine Ridge', file: 'terrain-alpine.svg', alpine: true }); }
  };
  function terrainModel(o) { // Terrain: a heightfield drawn as ridgelines, back to front, hidden lines removed
    const n = noise2(o.seed), NX = 120, NY = 46, SX = 2.7, SY = 1.7, h = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = i / (NX - 1) - .5, y = j / (NY - 1) - .5; let a = 0, f = 2.2, amp = 1;
      for (let k = 0; k < 5; k++) { const v = 1 - Math.abs(n(x * f + 11.3, y * f + 3.7)); a += v * v * amp; f *= 2.05; amp *= .5; }
      const env = o.alpine ? Math.exp(-(x * x) / .045 - (y * y) / .07) * 1.25 + .1 : Math.exp(-((y + .02) * (y + .02)) / .06) * (.75 + .25 * Math.cos(x * 5.2)) + .08;
      h[j * NX + i] = Math.max(0, a * .5 * env - (o.alpine ? .02 : .05)) * (o.alpine ? 1.25 : .95);
    }
    const P = (i, j) => [(i / (NX - 1) - .5) * SX, (j / (NY - 1) - .5) * SY, h[j * NX + i] - .25];
    const polys = []; for (let j = NY - 1; j >= 0; j--) { const q = []; for (let i = 0; i < NX; i++) q.push(...P(i, j)); polys.push(q); }
    const verts = new Float32Array(NX * NY * 3), tris = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) verts.set(P(i, j), (j * NX + i) * 3);
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX + 1, d = a + NX; tris.push(a, b, c, a, c, d); }
    return { title: o.title, algo: 'Terrain', note: NY + ' ridgelines · hidden lines removed', file: o.file, rad: 1.45, home: mul(rx(-1.18), rz(-.08)), polys, mesh: { verts, tris: Uint32Array.from(tris) }, kind: 'zbuf', eps: .03, rx: 1.5, ry: .9 };
  }

  /* ---------- 3D Scene pieces: recognised here, drawn elsewhere ----------
   * A 3D Scene (a scene3d / object3d preset, or a saved work's scene registered with registerScene) gets the model id
   * 'scene:<key>' so the Start Page knows the piece turns, but this module does NOT draw it: StartPageSceneOrbit turns
   * the piece's own drawing with real renders from the app's scene pipeline, so its fills and shadow shapes match the app.
   * mount() returns null for a scene id. */
  const SCENE_TYPES = { scene3d: 1, object3d: 1 };
  const presetById = id => { try { return (Vectura.PRESETS || []).find(p => p && p.id === id) || null; } catch (e) { return null; } };
  const sceneOf = preset => {
    const P = preset && preset.params; if (!P) return null;
    if (preset.preset_system === 'object3d' || (P.primitive && !Array.isArray(P.objects))) return { objects: [P], camera: P.camera, ground: P.ground };
    return Array.isArray(P.objects) ? P : null;
  };
  /* scenes registered at run time (a saved work's own scene, see registerScene / sceneFromDoc), by key */
  const SCENES = {};
  /* The first 3D Scene in a saved .vectura payload: a monolith scene3d layer's params, or a scene group's tree
   * collected back into that shape (Scene3D.Params.collectSceneParams, as the engine's compositor does). Null if none. */
  function sceneFromDoc(doc) {
    const st = doc && (doc.state || doc), eng = st && (st.engine || st), layers = eng && Array.isArray(eng.layers) ? eng.layers : null;
    if (!layers) return null;
    const live = l => l && l.visible !== false && l.params;
    const mono = layers.find(l => live(l) && l.type === 'scene3d' && !l.isGroup && Array.isArray(l.params.objects) && l.params.objects.length);
    if (mono) return mono.params;
    const g = layers.find(l => l && l.type === 'scene3d' && l.isGroup && l.containerRole === 'scene' && l.visible !== false);
    if (!g) return null;
    const kids = id => layers.filter(l => l && l.parentId === id), collected = [];
    const walk = id => kids(id).forEach(l => { if (!live(l)) return;
      if (l.type === 'object3d') collected.push({ kind: 'object', id: l.id, params: l.params });
      else if (l.type === 'booleanGroup3d') collected.push({ kind: 'boolean', id: l.id, params: l.params, children: kids(l.id).filter(c => c && c.type === 'object3d').map(c => c.id) });
      else if (l.type === 'sceneLight3d') collected.push({ kind: 'light', id: l.id, params: l.params });
      else if (l.type === 'sceneGround3d') collected.push({ kind: 'ground', id: l.id, params: l.params });
      if (l.isGroup) walk(l.id); });
    walk(g.id);
    const Params = Vectura.Scene3D && Vectura.Scene3D.Params, gp = g.params || {};
    let scene = null; try { scene = Params && typeof Params.collectSceneParams === 'function' ? Params.collectSceneParams(gp, collected) : null; } catch (e) { scene = null; }
    if (!scene) scene = Object.assign({}, gp, { objects: (gp.objects || []).concat(collected.filter(c => c.kind === 'object').map(c => c.params)), ground: { enabled: collected.some(c => c.kind === 'ground') } });
    return Array.isArray(scene.objects) && scene.objects.length ? scene : null;
  }
  /* a scene worth turning: one with at least one object */
  function sceneModel(id) {
    const reg = SCENES[id] || null, scene = reg ? reg.scene : sceneOf(presetById(id));
    return !!(scene && Array.isArray(scene.objects) && scene.objects.some(o => o && typeof o === 'object'));
  }
  const CACHE = {};
  const ALIAS = { sphere: 'coiled-sphere', spiralizer: 'coiled-sphere', topoform: 'torus', polyhedron: 'icosahedron', 'high-sierra': 'terrain', alpine: 'terrain-alpine' };
  const SCENE = /^scene:/;
  /* a 'scene:<key>' id is a live 3D Scene only while its scene has an object */
  const SCENE_OK = {};
  const sceneOK = m => { if (!(m in SCENE_OK)) SCENE_OK[m] = sceneModel(m.slice(6)); return !!SCENE_OK[m]; };
  /* register (or refresh) a scene under `key`; modelFor(type, key) then gives 'scene:<key>'. Returns that id, or null */
  const registerScene = (key, scene, name) => {
    key = String(key || ''); if (!key || !scene || typeof scene !== 'object') return null;
    SCENES[key] = { scene, name: name || 'Scene' }; delete SCENE_OK['scene:' + key];
    return sceneOK('scene:' + key) ? 'scene:' + key : null;
  };
  const norm = m => { m = String(m || 'torus').toLowerCase(); m = ALIAS[m] || m; return BUILD[m] ? m : 'torus'; };
  const model = m => (CACHE[m = norm(m)] || (CACHE[m] = BUILD[m]()));
  const MAP = { topoform: 'torus', spiralizer: 'coiled-sphere', terrain: 'terrain', polyhedron: 'icosahedron' };
  const ALPINE = /alpine/i;
  /* Vectura algorithm type (+ optional preset id) -> model name, or null when the piece has no live model. */
  const modelFor = (type, presetId) => {
    const t = String(type || '').toLowerCase();
    if (presetId && SCENES[presetId]) return sceneOK('scene:' + presetId) ? 'scene:' + presetId : null; /* a registered scene, whatever its label */
    if (SCENE_TYPES[t]) { const id = presetId ? 'scene:' + presetId : ''; return id && sceneOK(id) ? id : null; }
    const m = MAP[t] || null;
    return m === 'terrain' && presetId && ALPINE.test(String(presetId)) ? 'terrain-alpine' : m;
  };

/* ---------- styles, once ---------- */
  function css() {
    if (D.getElementById('vorbit-css')) return;
    const s = D.createElement('style'); s.id = 'vorbit-css';
    s.textContent = '.vorbit{position:relative;transition:background-color 460ms cubic-bezier(.2,.7,.2,1)}.vorbit>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;border-radius:inherit}.vorbit>canvas.drag{cursor:grabbing}.vorbit>canvas:focus-visible{outline:2px solid var(--vorbit-ink,currentColor);outline-offset:3px}.vorbit-hint{position:absolute;right:10px;bottom:8px;font:400 10px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.04em;color:var(--vorbit-ink,currentColor);opacity:.5;pointer-events:none;user-select:none;transition:opacity .4s}.vorbit:hover .vorbit-hint{opacity:.72}@media (prefers-reduced-motion: reduce){.vorbit{transition:none}}html[data-start-page-still] .vorbit{transition:none}.vorbit>canvas.drag:focus-visible{outline:none}.vorbit>canvas{-webkit-tap-highlight-color:transparent}';
    D.head.appendChild(s);
  }
  const hex = h => { h = String(h || '').trim(); if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map(c => c + c).join(''); return /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); if (!A || !B) return b; return 'rgb(' + A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',') + ')'; };
  const L = nrm([-.45, .62, .64]);
  const NB = 4, ALPHA = [.4, .58, .78, 1];

  /* ================= mount ================= */
  function mount(el, opts) {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return null; if (el._vorbit) el._vorbit.destroy();
    if (opts && SCENE.test(String(opts.model || ''))) return null; /* a 3D Scene turns through StartPageSceneOrbit, not here */
    opts = Object.assign({ model: null, type: null, presetId: null, colorway: null, hint: true, duration: 1700, plotted: false, paper: true, disc: false }, opts || {});
    css(); el.classList.add('vorbit');
    if (opts.disc) el.style.borderRadius = '50%'; /* Plate 4: a slightly lighter disc; deliberately no ring, border or outline */
    const cv = D.createElement('canvas'); cv.tabIndex = 0; cv.setAttribute('role', 'application'); cv.setAttribute('aria-roledescription', '3D viewer');
    cv.style.willChange = 'transform'; /* own compositor layer: a sway frame repaints the canvas only, never the plate around it */
    el.appendChild(cv); const ctx = cv.getContext('2d');
    let hintEl = null; if (opts.hint) { hintEl = D.createElement('span'); hintEl.className = 'vorbit-hint'; hintEl.setAttribute('aria-hidden', 'true'); hintEl.textContent = typeof opts.hint === 'string' ? opts.hint : 'Drag to rotate'; el.appendChild(hintEl); }

    let name = norm(opts.model || modelFor(opts.type, opts.presetId) || 'torus'), M0 = model(name), M = M0.home, cwOpt = opts.colorway;
    let vel = [0, 0], drag = null, lastAct = -1e9, swayT = 0, swayA = [0, 0], dirty = true, plot = 0, plotting = null, shown = false, running = 0, visible = false, alive = true;
    let Wd = 0, Hd = 0, dpr = 1, ink = '#000', ink2 = null, inkFrom = null, inkT0 = 0, tPrev = 0;
    const SWAY = [.10, .04], SWAY_P = [8.5, 12.5], IDLE = 1800, SWAY_MAX = 20000, SWAY_MS = 1000 / 15;
    let timer = 0, lastR = -1e9;
    const dispM = () => (swayA[0] || swayA[1]) ? mul(mul(rx(swayA[1]), ry(swayA[0])), M) : M;
    const bake = () => { M = orthonorm(dispM()); swayA = [0, 0]; swayT = 0; };
    const label = () => (opts.label || (M0.title + ', ' + M0.algo)) + ', drawn live in 3D. Drag, or use the arrow keys, to rotate.';
    cv.setAttribute('aria-label', label());

    /* color */
    const lighten = (c, t) => { const A = hex(c); if (!A) return c; const lum = (0.299 * A[0] + 0.587 * A[1] + 0.114 * A[2]) / 255; const to = [255, 255, 255]; const k = lum < .5 ? t : t * 1.6; return 'rgb(' + A.map((x, n) => Math.round(x + (to[n] - x) * k)).join(',') + ')'; };
    function resolveCw() {
      let cw = null;
      if (typeof cwOpt === 'function') cw = cwOpt();
      else if (cwOpt && typeof cwOpt === 'object') cw = cwOpt;
      return Object.assign({ paper: '#ffffff', ink: '#111111', ink2: null }, cw || {});
    }
    const curInk = now => { if (!inkFrom) return [ink, ink2 || ink]; const t = Math.min(1, (now - inkT0) / 460); if (t >= 1) { inkFrom = null; return [ink, ink2 || ink]; } return [mix(inkFrom[0], ink, t), mix(inkFrom[1], ink2 || ink, t)]; };
    function color(animate) {
      const cw = resolveCw();
      if (opts.paper !== false) el.style.backgroundColor = opts.disc ? lighten(cw.paper, .07) : cw.paper;
      if (animate && motionOK() && shown) { inkFrom = curInk(performance.now()); inkT0 = performance.now(); } else inkFrom = null;
      ink = cw.ink; ink2 = cw.ink2 || null; el.style.setProperty('--vorbit-ink', cw.ink); kick();
    }

    /* size */
    function resize() { const r = el.getBoundingClientRect(); dpr = Math.min(2, W.devicePixelRatio || 1); Wd = Math.max(1, Math.round(r.width)); Hd = Math.max(1, Math.round(r.height)); cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr); kick(); }
    const ro = 'ResizeObserver' in W ? new ResizeObserver(resize) : null; ro ? ro.observe(el) : W.addEventListener('resize', resize); resize();

    /* render */
    let zhits = 0, zb = null, zw = 0, zh = 0, PX = new Float32Array(0), PY = PX, PZ = PX, SEG = new Float32Array(6 * 8192), ns = 0;
    const ZS = 2;
    let zkey = null, zmodel = null;
    function zbuffer(m, Md, S, cx, cy) {
      const w = Math.ceil(Wd / ZS), h = Math.ceil(Hd / ZS);
      /* the depth map depends only on the model, the matrix and the fit: reuse it while none of them moved */
      const key = [w, h, S, cx, cy, Md[0], Md[1], Md[2], Md[3], Md[4], Md[5], Md[6], Md[7], Md[8]];
      if (zb && zmodel === m && zw === w && zh === h && zkey && key.every((v, i) => v === zkey[i])) { zhits++; return; }
      zkey = key; zmodel = m;
      if (!zb || zw !== w || zh !== h) { zb = new Float32Array(w * h); zw = w; zh = h; } zb.fill(-1e9);
      const v = m.mesh.verts, n = v.length / 3, tris = m.mesh.tris;
      if (PX.length < n) { PX = new Float32Array(n); PY = new Float32Array(n); PZ = new Float32Array(n); }
      for (let i = 0; i < n; i++) { const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        const X = Md[0] * x + Md[1] * y + Md[2] * z, Y = Md[3] * x + Md[4] * y + Md[5] * z, Z = Md[6] * x + Md[7] * y + Md[8] * z, f = CAM / (CAM - Z);
        PX[i] = (cx + X * f * S) / ZS; PY[i] = (cy - Y * f * S) / ZS; PZ[i] = Z; }
      for (let t = 0; t < tris.length; t += 3) {
        const a = tris[t], b = tris[t + 1], c = tris[t + 2], ax = PX[a], ay = PY[a], bx = PX[b], by = PY[b], qx = PX[c], qy = PY[c];
        const area = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax); if (Math.abs(area) < 1e-6) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, qx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, qx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, qy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, qy)));
        const za = PZ[a], zbv = PZ[b], zc = PZ[c], ia = 1 / area;
        for (let y = y0; y <= y1; y++) { const py = y + .5;
          for (let x = x0; x <= x1; x++) { const px = x + .5;
            const w0 = ((bx - px) * (qy - py) - (by - py) * (qx - px)) * ia, w1 = ((qx - px) * (ay - py) - (qy - py) * (ax - px)) * ia, w2 = 1 - w0 - w1;
            if (w0 < -.02 || w1 < -.02 || w2 < -.02) continue;
            const z = w0 * za + w1 * zbv + w2 * zc, k = y * w + x; if (z > zb[k]) zb[k] = z; } }
      }
    }
    const push = (x0, y0, x1, y1, b, j) => { if (ns * 6 + 6 > SEG.length) { const g = new Float32Array(SEG.length * 2); g.set(SEG); SEG = g; } const o = ns * 6; SEG[o] = x0; SEG[o + 1] = y0; SEG[o + 2] = x1; SEG[o + 3] = y1; SEG[o + 4] = b; SEG[o + 5] = j; ns++; };
    function strokes(m, Md, S, cx, cy) {
      ns = 0; const rad = m.rad;
      const proj = (x, y, z, out) => { const X = Md[0] * x + Md[1] * y + Md[2] * z, Y = Md[3] * x + Md[4] * y + Md[5] * z, Z = Md[6] * x + Md[7] * y + Md[8] * z, f = CAM / (CAM - Z); out[0] = cx + X * f * S; out[1] = cy - Y * f * S; out[2] = Z; return out; };
      const bucket = z => { const t = m.kind === 'sphere' ? z / rad : z / rad * .5 + .5; return Math.max(0, Math.min(NB - 1, Math.floor(t * NB))); };
      if (m.kind === 'poly') {
        const vp = m.V.map(v => proj(v[0], v[1], v[2], [0, 0, 0])), seen = new Set(), vis = [];
        m.faces.forEach(fc => { const n = fc.n, c = fc.cen;
          const nv = [Md[0] * n[0] + Md[1] * n[1] + Md[2] * n[2], Md[3] * n[0] + Md[4] * n[1] + Md[5] * n[2], Md[6] * n[0] + Md[7] * n[1] + Md[8] * n[2]];
          const cxv = Md[0] * c[0] + Md[1] * c[1] + Md[2] * c[2], cyv = Md[3] * c[0] + Md[4] * c[1] + Md[5] * c[2], cz = Md[6] * c[0] + Md[7] * c[1] + Md[8] * c[2];
          if (-nv[0] * cxv - nv[1] * cyv + nv[2] * (CAM - cz) <= 0) return;
          const li = dot(nv, L); vis.push({ fc, band: li > .72 ? 0 : li > .42 ? 1 : li > .12 ? 2 : 3, z: cz }); });
        vis.forEach(({ fc }) => { for (let k = 0; k < 3; k++) { const a = fc.f[k], b = fc.f[(k + 1) % 3], key = a < b ? a + '-' + b : b + '-' + a; if (seen.has(key)) continue; seen.add(key); push(vp[a][0], vp[a][1], vp[b][0], vp[b][1], NB - 1, 0); } });
        const p0 = [0, 0, 0], p1 = [0, 0, 0];
        vis.forEach(({ fc, band, z }) => { if (!band) return; const b = bucket(z) > 1 ? NB - 2 : NB - 3;
          (band === 1 ? [fc.h1] : band === 2 ? [fc.h2] : [fc.h2, fc.h3]).forEach(hs => hs.forEach(h => { proj(h[0], h[1], h[2], p0); proj(h[3], h[4], h[5], p1); push(p0[0], p0[1], p1[0], p1[1], b, 0); })); });
        return;
      }
      const isZ = m.kind === 'zbuf', lim = m.kind === 'sphere' ? m.rho * m.rho / CAM : 0, eps = m.eps || .04, dash = !!m.dashBack;
      const vis = (x, y, z) => { if (!isZ) return z > lim; const X = Math.floor(x / ZS), Y = Math.floor(y / ZS); if (X < 0 || Y < 0 || X >= zw || Y >= zh) return true; return z >= zb[Y * zw + X] - eps; };
      const a = [0, 0, 0], b = [0, 0, 0];
      m.polys.forEach(q => { proj(q[0], q[1], q[2], a); let va = vis(a[0], a[1], a[2]), joined = 0, jb = 0;
        for (let i = 3; i < q.length; i += 3) { proj(q[i], q[i + 1], q[i + 2], b); const vb = vis(b[0], b[1], b[2]);
          if (va && vb) { push(a[0], a[1], b[0], b[1], bucket((a[2] + b[2]) / 2), joined); joined = 1; jb = 0; }
          else { joined = 0; if (dash && !va && !vb) { push(a[0], a[1], b[0], b[1], NB, jb); jb = 1; } else jb = 0; }
          a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; va = vb; } });
    }
    function render(now) {
      lastR = now;
      const m = M0, Md = dispM(), S = Math.min(Wd / (2 * (m.rx || m.rad)), Hd / (2 * (m.ry || m.rad))) * (m.fill || .86), cx = Wd / 2, cy = Hd / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, Wd, Hd);
      if (!shown || typeof Path2D === 'undefined') return; /* no canvas path support (a headless test DOM): nothing to draw */
      if (m.kind === 'zbuf') zbuffer(m, Md, S, cx, cy);
      strokes(m, Md, S, cx, cy);
      let total = 0; if (plot < 1) for (let i = 0; i < ns; i++) { const o = i * 6; total += Math.hypot(SEG[o + 2] - SEG[o], SEG[o + 3] - SEG[o + 1]); }
      let budget = plot < 1 ? total * plot : Infinity;
      const [i1, i2] = curInk(now); let style = i1; if (i2 !== i1) { style = ctx.createLinearGradient(0, 0, Wd, Hd); style.addColorStop(0, i1); style.addColorStop(1, i2); }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(.9, Math.min(1.25, Wd / 620)); ctx.strokeStyle = style;
      const paths = []; for (let k = 0; k <= NB; k++) paths.push(new Path2D());
      let prevB = -1;
      for (let i = 0; i < ns && budget > 0; i++) { const o = i * 6, x0 = SEG[o], y0 = SEG[o + 1]; let x1 = SEG[o + 2], y1 = SEG[o + 3]; const bk = SEG[o + 4], j = SEG[o + 5];
        const len = Math.hypot(x1 - x0, y1 - y0); if (len > budget) { const f = budget / len; x1 = x0 + (x1 - x0) * f; y1 = y0 + (y1 - y0) * f; } budget -= len;
        const p = paths[bk]; if (!j || bk !== prevB) p.moveTo(x0, y0); p.lineTo(x1, y1); prevB = bk; }
      for (let k = 0; k < NB; k++) { ctx.globalAlpha = ALPHA[k]; ctx.stroke(paths[k]); }
      ctx.globalAlpha = .42; ctx.setLineDash([3, 3.5]); ctx.stroke(paths[NB]); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    /* loop: redraws only while something moves */
    function frame(now) {
      running = 0; if (!alive) return; const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now; let more = false; const ok = motionOK();
      if (plotting) { const k = Math.min(1, (now - plotting.t0) / plotting.dur); plot = k * .35 + (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * .65; if (k >= 1 || !ok) { plotting = null; plot = 1; lastAct = now - IDLE + 600; } more = true; }
      if (!drag && ok && (Math.abs(vel[0]) > 1e-3 || Math.abs(vel[1]) > 1e-3)) { M = orthonorm(mul(mul(rx(vel[1] * dt), ry(vel[0] * dt)), M)); const k = Math.exp(-4.2 * dt); vel[0] *= k; vel[1] *= k; lastAct = now; more = true; }
      else if (!drag) vel = [0, 0];
      if (ok && !plotting && !drag && visible && shown && now - lastAct > IDLE && now - lastAct < IDLE + SWAY_MAX) {
        swayT += dt; const r = Math.min(1, swayT / 2.5), e = r * r * (3 - 2 * r);
        swayA = [SWAY[0] * e * Math.sin(T * swayT / SWAY_P[0]), SWAY[1] * e * Math.sin(T * swayT / SWAY_P[1])]; more = true; }
      if (inkFrom) more = true;
      if (more || dirty) render(now); dirty = false;
      /* a sway that has run its course is parked in place (baked, so resuming is seamless) and the loop ends */
      if (ok && !plotting && !drag && swayT > 0 && now - lastAct >= IDLE + SWAY_MAX) bake();
      const waitSway = ok && shown && !drag && !plotting && now - lastAct < IDLE + SWAY_MAX;
      const busy = plotting || drag || inkFrom || dirty || Math.abs(vel[0]) > 1e-3 || Math.abs(vel[1]) > 1e-3;
      if ((more || waitSway) && visible) {
        if (!running) {
          /* sway alone redraws at ~15 fps; anything interactive keeps the display rate */
          const delay = !busy ? SWAY_MS - (performance.now() - now) - 2 : 0;
          if (delay > 3) { running = 1; timer = setTimeout(() => { timer = 0; running = requestAnimationFrame(frame); }, delay); } else running = requestAnimationFrame(frame);
        }
      } else tPrev = 0;
    }
    /* resume the idle sway (pointer enter, focus, scrolling back into view) */
    function wake() { if (performance.now() - lastAct >= IDLE + SWAY_MAX - 1) lastAct = performance.now(); kick(); }
    function kick() { dirty = true; if (!alive) return; if (timer) { clearTimeout(timer); timer = 0; running = 0; } if (!running) running = requestAnimationFrame(frame); }
    function plotIn(dur) { shown = true; if (!motionOK() || !dur) { plot = 1; plotting = null; lastAct = performance.now(); } else { plot = 0; plotting = { t0: performance.now(), dur }; } kick(); }
    const io = 'IntersectionObserver' in W ? new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (visible && !shown && e.intersectionRatio >= .3) plotIn(opts.duration); if (visible) wake(); }), { threshold: [0, .3] }) : null;
    io ? io.observe(el) : (visible = true, plotIn(0));
    if (opts.plotted) plotIn(0); /* a piece the visitor has already seen (a remounted plate) is shown finished at once, not blank until 30 % visible */

    /* input */
    const touch = now => { if (plotting) { plotting = null; plot = 1; } bake(); lastAct = now; };
    const onDown = e => { if (e.button > 0 || !shown) return; e.preventDefault(); try { cv.focus({ preventScroll: true }); } catch (_) {} try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      touch(performance.now()); vel = [0, 0]; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; cv.classList.add('drag'); kick(); };
    const onMove = e => { if (!drag || e.pointerId !== drag.id) return; const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, now - drag.t) / 1000, k = 3.4 / Math.max(240, Math.min(Wd, Hd));
      M = orthonorm(mul(mul(rx(dy * k), ry(dx * k)), M)); const a = Math.min(1, dt * 18); vel = [vel[0] + (dx * k / dt - vel[0]) * a, vel[1] + (dy * k / dt - vel[1]) * a];
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now; lastAct = now; kick(); };
    const onUp = e => { if (!drag || e.pointerId !== drag.id) return; const now = performance.now(); if (now - drag.t > 90 || !motionOK()) vel = [0, 0]; else vel = vel.map(v => Math.max(-9, Math.min(9, v)));
      drag = null; cv.classList.remove('drag'); lastAct = now; kick(); };
    const onKey = e => { const K = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!K || !shown) return; e.preventDefault();
      touch(performance.now()); const s = e.shiftKey ? 2.5 : 1;
      if (!motionOK()) M = orthonorm(mul(mul(rx(K[1] * .21 * s), ry(K[0] * .21 * s)), M)); else { vel[0] += K[0] * 1.15 * s; vel[1] += K[1] * 1.15 * s; }
      kick(); };
    cv.addEventListener('pointerenter', wake); cv.addEventListener('focus', wake); cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('lostpointercapture', onUp); cv.addEventListener('keydown', onKey);
        const onMotion = (e) => { if (e && e.detail && typeof e.detail.still === 'boolean') stillEvt = e.detail.still; if (!motionOK()) { bake(); vel = [0, 0]; if (plotting) { plotting = null; plot = 1; } inkFrom = null; } kick(); };
    W.addEventListener('vectura:start-page-motion', onMotion); let mq = null; try { mq = W.matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener && mq.addEventListener('change', onMotion); } catch (e) { mq = null; }
    color(false);

    const handle = {
      el, canvas: cv,
      get model() { return name; },
      get info() { return { title: M0.title, algo: M0.algo, note: M0.note, file: M0.file }; },
      get matrix() { return Array.from(dispM()); },
      get plotted() { return plot; },
      get stats() { return { zbufferReuses: zhits, swaying: !!(running && swayT > 0), lastRender: lastR }; },
      setModel(m, o) { o = o || {}; name = norm(m); M0 = model(name); M = M0.home; vel = [0, 0]; swayA = [0, 0]; swayT = 0; if (o.label !== undefined) opts.label = o.label;
        cv.setAttribute('aria-label', label()); color(false); if (shown) plotIn(o.replot === false ? 0 : 1100); return handle; },
      setColorway(cw) { cwOpt = cw || null; color(true); return handle; },
      destroy() { alive = false; if (timer) { clearTimeout(timer); timer = 0; } else if (running) cancelAnimationFrame(running); io && io.disconnect(); ro && ro.disconnect(); W.removeEventListener('vectura:start-page-motion', onMotion); mq && mq.removeEventListener && mq.removeEventListener('change', onMotion);
        cv.removeEventListener('pointerenter', wake); cv.removeEventListener('focus', wake); cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('lostpointercapture', onUp); cv.removeEventListener('keydown', onKey);
        cv.remove(); hintEl && hintEl.remove(); el.classList.remove('vorbit'); if (opts.paper !== false) el.style.backgroundColor = ''; if (opts.disc) el.style.borderRadius = ''; el.style.removeProperty('--vorbit-ink'); delete el._vorbit; }
    };
    el._vorbit = handle; return handle;
  }

  Vectura.StartPageOrbit3D = { mount, modelFor, registerScene, sceneFromDoc, isScene: m => SCENE.test(String(m || '')), MAP, models: Object.keys(BUILD), isStill, info: m => { const x = model(m); return { title: x.title, algo: x.algo, note: x.note, file: x.file }; } };
})(window, document);
