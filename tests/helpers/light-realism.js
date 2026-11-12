/*
 * Light-realism harness for Scene3D fills (docs: scratchpad light-plan.md section 2.3, metrics M1-M9).
 *
 * Measures INK COVERAGE (pen width x drawn length / area) of a composed scene against the lighting that
 * produced it, binned by signed n.L and by L* (diffuse luminance), from SCREEN position. This is the
 * probe1 method (strategist) plus the tone-audit mesh raster (researcher), promoted into one reusable helper.
 * Read-only for every later unit. CommonJS, no test framework dependency, no DOM.
 *
 * ------------------------------------------------------------------------------------------------
 * API (all pure unless noted; "s" = the scene returned by buildSurfaceLockScene)
 * ------------------------------------------------------------------------------------------------
 *   const LR = require('../helpers/light-realism');
 *   const rt = await LR.loadRuntime();                          // = loadSurfaceLockRuntime(); rt.V, rt.cleanup()
 *
 *   Scene setup
 *   LR.LIGHTS                       camera-space toward-light unit vectors: front, upperRight, side, back
 *   LR.buildCase(V, { object:'sphere'|'box'|'torus'|'cylinder', mapper:'hatch', law:'ladder'|'dutyConst'|..,
 *                     markSpace:'surface'|'pose', density:50, angle:45, style:{..}, toneOff:false,
 *                     tone:{..merged into group.params.tone..}, ground:false, shadow:false }) -> s
 *   LR.setLightCam(s, [x,y,z])      aim the scene light at a CAMERA-space toward-light vector -> {world, az, el}
 *   LR.setLightAzEl(s, az, el)      aim the scene light by azimuth/elevation
 *   LR.lightCamVec(V, s, light?)    camera-space toward-light {x,y,z} of the scene's first light
 *
 *   Measurement
 *   LR.measure(s, opts?) -> profile  composeFull() once, then sample the object on a 0.25 mm screen grid.
 *     opts: { model:'legacy'|'v2' (default: s.group.params.tone.model || 'legacy'), preview:false,
 *             penWidth:0.3, cell:0.25, rimFrac:0.85 (sphere disc cut), paths (reuse an earlier compose),
 *             shade:(nw,wp,ctx)=>({L,S}) override, shininess, ks, ambient, visFn:(nw,wp)=>0|1 (shadow) }
 *     Sphere uses the exact analytic disc (silhouette edge fit); other objects use a z-buffered mesh raster.
 *     L* comes from Regions.shade when it exists (U1) and model is 'v2'; otherwise the legacy
 *     max(0, n.L) (ambient 0). S comes from Regions.shade or the analytic Blinn term (n.H^shininess).
 *   profile = { cells:{nl,L,S,rad,ink,vis (Float32Array)}, n, cell, areaCell, totalInk, penWidth, lightCam:{x,y,z},
 *               eyeWorld, lightWorld, H (world half vector), model, discR, discC:[x,y], paths }
 *   LR.bins(profile, 'L'|'nl'|'S', { n:10, lo:0, hi:1, minArea:15, where:(i)=>bool }) -> [{lo,hi,area,ink,cov}]
 *       cov = penWidth*ink/area, null when area < minArea (mm^2). 'nl' default range is [-1,1].
 *   LR.covAt(profile, 'L', lo, hi, where?) -> number|null                      coverage in one slab
 *   LR.topFractionCoverage(profile, 'S', 0.01) -> number                       coverage of the top 1 % of visible area by S
 *
 *   Metrics (each returns { pass, value|..., detail } so a unit can assert on .pass or on the number)
 *   LR.m1Monotone(profile)                      M1  max rise <= 0.02 between L* bins, Spearman <= -0.9 if >= 4 bins
 *   LR.m2Highlight(profile, { specular })       M2  glint area cov <= 0.01 (<= 0.02 at L*>=0.95 when specular is off); glint centre <= 3 deg
 *   LR.m3Range(profile, density)                M3  cov(L*<0.1) - cov(L*>0.9) >= 0.25 (d50) / 0.15 (d20)
 *   LR.m4Terminator(profile)                    M4  steepest change in n.L in [-0.05, 0.15]; attached shadow >= (0.1..0.2) + 0.05
 *   LR.m5CrossLaw({ lawId: profile, ... }, { cDark, cLight=0 })   M5  per-law |cov - target| <= 0.06, spread <= 0.10
 *   LR.m6PoseSurface(surfaceProfile, poseProfile)  M6  per L* bin |delta| <= 0.04
 *   LR.m7LimbCentre(profile)                    M7  per L* bin, limb third vs centre third of the disc <= 0.04 (sphere)
 *   LR.m8Shadow(profile, { cAmbient })          M8  cov inside shadow (vis 0) >= cov(L*=A) - 0.03 (needs opts.visFn at measure)
 *   LR.m9Widget(V, light, cam, drawn?)          M9  expected widget state {z, behind, radiusFrac}; with `drawn` checks it
 *   Glint:  LR.glintAnalytic(profile) -> world normal H; LR.glintMeasured(profile) -> { normal, angleDeg } (smoothed ink minimum)
 *
 *   Counters (cost gates; SurfaceLock.stats)
 *   LR.orbitCounters(s, yaws, { pitch, warm }) -> stats delta over pure camera-orbit preview frames (warm compose unless warm:false);
 *       tone memo fills lazily as vertices are revealed: assert toneEvals==0 on a REPEATED sweep, not the first
 *   LR.lightMoveCounters(s, [{az,el}...]) -> stats delta over light moves
 *
 *   Reference numbers (strategist probe, legacy): see LR.REF_LEGACY (default light, dutyConst d50 a45, sphere).
 *
 * Budget: one measure() = one composeFull + ~20k cell samples (sphere) -> well under 1 s. Reuse profiles; do not
 * recompose per assertion.
 */
const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('./surface-lock-scene');

const DEG = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// Light directions in CAMERA space: x right, y up, z toward the viewer (toward-light vectors).
const LIGHTS = Object.freeze({
  front: norm([0, 0, 1]),
  upperRight: norm([0.55, 0.55, 0.63]),
  side: norm([1, 0, 0.02]),
  back: norm([0.35, 0.35, -0.87]),
});

// Strategist probe numbers (section 1b) kept as regression anchors: default light az135/el45, default camera,
// dutyConst d50 a45, sphere. Ladder front-light plateau 0.08 at I >= 0.9 (lit floor).
const REF_LEGACY = Object.freeze({
  defaultLightCam: Object.freeze({ x: 0.68, y: 0.73, z: 0.07 }),
  darkAreaMm2: 752, discAreaMm2: 1430,
  ladderFrontCovHighlight: 0.08,
});

const loadRuntime = (options) => loadSurfaceLockRuntime(options);

// ---- scene setup ------------------------------------------------------------------------------------
const clone = (v) => JSON.parse(JSON.stringify(v));

const camAngles = (s) => {
  const cam = s.group.params.camera;
  return { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll || 0 };
};

// columns of the camera rotation: col[i] = R e_i, so world = sum_i c_i * (R e_i row form) i.e. R^T c
const camBasis = (V, s) => {
  const G = V.Geometry3D; const ang = camAngles(s);
  const col = [G.rotatePoint({ x: 1, y: 0, z: 0 }, ang), G.rotatePoint({ x: 0, y: 1, z: 0 }, ang), G.rotatePoint({ x: 0, y: 0, z: 1 }, ang)];
  const camToWorld = (n) => ({
    x: col[0].x * n.x + col[0].y * n.y + col[0].z * n.z,
    y: col[1].x * n.x + col[1].y * n.y + col[1].z * n.z,
    z: col[2].x * n.x + col[2].y * n.y + col[2].z * n.z,
  });
  return { ang, camToWorld, worldToCam: (w) => G.rotatePoint(w, ang) };
};

const lightLayers = (s) => s.eng.getLayerDescendants(s.gid).filter((l) => l && l.type === 'sceneLight3d');
const firstLight = (s) => { const l = lightLayers(s)[0]; return l ? l.params : ((s.group.params.lights || [])[0] || {}); };

const setLightAzEl = (s, az, el) => {
  lightLayers(s).forEach((l) => { Object.assign(l.params, { azimuth: az, elevation: el }); });
  (s.group.params.lights || []).forEach((l) => { Object.assign(l, { azimuth: az, elevation: el }); });
  return { az, el };
};

const setLightCam = (s, camVec) => {
  const { camToWorld } = camBasis(s.V, s);
  const w = camToWorld({ x: camVec[0], y: camVec[1], z: camVec[2] });
  const az = (Math.atan2(w.x, w.z) / DEG + 360) % 360;
  const el = Math.asin(Math.max(-1, Math.min(1, w.y))) / DEG;
  setLightAzEl(s, az, el);
  return { world: w, az, el };
};

const lightWorldToward = (V, light) => V.Scene3D.Regions.towardLight(light);
const lightCamVec = (V, s, light) => {
  const t = lightWorldToward(V, light || firstLight(s));
  return camBasis(V, s).worldToCam(t);
};

const buildCase = (V, c = {}) => {
  const o = { object: 'sphere', mapper: 'hatch', law: 'ladder', density: 50, angle: 45, ground: false, shadow: false, ...c };
  const s = buildSurfaceLockScene(V, { kind: 'sphere', ground: o.ground, shadow: o.shadow });
  const first = s.objectsOf()[0];
  if (o.object !== 'sphere') {
    const P = V.Scene3D.Params;
    first.params.primitive = o.object;
    first.params.params = clone((P.PRIMITIVE_CREATE_DEFAULTS || P.PRIMITIVE_PARAM_DEFAULTS)[o.object]);
    first.params.transform = { ...first.params.transform, y: 0 };
  }
  const st = first.params.style || (first.params.style = { penId: null, mapper: 'hatch', params: {} });
  st.mapper = o.mapper;
  st.params = st.params || {};
  Object.assign(st.params, { fillAngle: o.angle, fillDensity: o.density });
  if (o.law && o.law !== 'ladder') st.params.toneLaw = o.law;
  if (o.markSpace) st.params.markSpace = o.markSpace;
  if (o.style) Object.assign(st.params, clone(o.style));
  if (o.toneOff || o.tone) {
    s.group.params.tone = Object.assign({}, s.group.params.tone, o.tone || {}, o.toneOff ? { enabled: false } : {});
  }
  if (o.lightCam) setLightCam(s, o.lightCam);
  else if (o.azimuth !== undefined) setLightAzEl(s, o.azimuth, o.elevation === undefined ? 45 : o.elevation);
  return s;
};

// ---- luminance model (mirrors Regions.shade when it exists) --------------------------------------------
const shininessFor = (V, tone) => {
  const R = V.Scene3D.Regions;
  const size = tone && tone.specular && Number.isFinite(tone.specular.size) ? tone.specular.size : 1;
  return typeof R.shininessForSize === 'function' ? R.shininessForSize(size) : 32 / Math.max(0.2, size);
};

const evalLight = (V, nw, wp, ctx) => {
  const R = V.Scene3D.Regions;
  if (ctx.shade) return ctx.shade(nw, wp, ctx);
  if (ctx.model === 'v2' && typeof R.shade === 'function') {
    const r = R.shade(nw, wp, ctx.lights, { model: 'v2', eye: ctx.eyeWorld, ambient: ctx.ambient, bounce: ctx.bounce, shininess: ctx.shininess, ks: ctx.ks, shadowFn: ctx.visFn ? (() => !(ctx.visFn(nw, wp) > 0.5)) : null });
    return { L: r.L, S: r.S || 0 };
  }
  const nl = nw.x * ctx.lightWorld.x + nw.y * ctx.lightWorld.y + nw.z * ctx.lightWorld.z;
  const vis = ctx.visFn ? ctx.visFn(nw, wp) : 1;
  const L = nl > 0 ? Math.min(1, nl * vis) : 0;
  const nh = nw.x * ctx.H.x + nw.y * ctx.H.y + nw.z * ctx.H.z;
  const S = nl > 0 && nh > 0 ? ctx.ks * Math.pow(nh, ctx.shininess) * vis : 0;
  return { L, S };
};

// ---- ink raster (length per cell) ----------------------------------------------------------------------
const rasteriseInk = (paths, cell) => {
  const ink = new Map(); let total = 0;
  paths.forEach((p) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); if (!(d > 0)) continue;
      const n = Math.max(1, Math.ceil(d / (cell * 0.2)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n; const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const key = Math.floor(x / cell) + ',' + Math.floor(y / cell);
        ink.set(key, (ink.get(key) || 0) + d / n); total += d / n;
      }
    }
  });
  return { ink, total };
};

// Mesh raster (z-buffered) for non-sphere objects: per cell, the visible world normal + point.
const meshCells = (V, s, cell) => {
  const G = V.Geometry3D, Sc = V.Scene3D.Scene;
  const leaf = s.objectsOf()[0];
  const obj = { id: 'o', name: 'o', primitive: leaf.params.primitive, params: leaf.params.params, transform: leaf.params.transform, visibility: 'solid' };
  const mesh = Sc.buildPrimitiveMesh(obj, 1);
  const t = obj.transform;
  const W = mesh.vertices.map((pt) => Sc.applyObjectTransform(pt, t));
  const cam = s.group.params.camera; const ang = camAngles(s);
  const prof = s.eng.currentProfile;
  const po = Sc.buildProjOpts(cam, { width: prof.width, height: prof.height });
  const camPts = W.map((p) => G.rotatePoint(p, ang));
  const proj = camPts.map((p) => G.projectPoint(p, po));
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const nrm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  const flat = obj.primitive === 'box' || obj.primitive === 'pyramid';
  const key = (p) => `${Math.round(p.x * 1e3)}|${Math.round(p.y * 1e3)}|${Math.round(p.z * 1e3)}`;
  const acc = new Map(); const tris = [];
  mesh.faces.forEach((f) => {
    for (let i = 1; i + 1 < f.length; i += 1) {
      const a = f[0], b = f[i], c = f[i + 1]; const n = cross(sub(W[b], W[a]), sub(W[c], W[a]));
      tris.push([a, b, c, n]);
      [a, b, c].forEach((vi) => { const k = key(W[vi]); const cur = acc.get(k) || { x: 0, y: 0, z: 0 }; acc.set(k, { x: cur.x + n.x, y: cur.y + n.y, z: cur.z + n.z }); });
    }
  });
  const vn = (vi, faceN) => (flat ? nrm(faceN) : nrm(acc.get(key(W[vi]))));
  const zb = new Map(); const out = new Map();
  tris.forEach(([a, b, c, n0]) => {
    const pa = proj[a], pb = proj[b], pc = proj[c]; if (!pa || !pb || !pc) return;
    const ns = [a, b, c].map((vi) => vn(vi, n0));
    const den = (pb.y - pc.y) * (pa.x - pc.x) + (pc.x - pb.x) * (pa.y - pc.y); if (Math.abs(den) < 1e-12) return;
    const x0 = Math.floor(Math.min(pa.x, pb.x, pc.x) / cell), x1 = Math.ceil(Math.max(pa.x, pb.x, pc.x) / cell);
    const y0 = Math.floor(Math.min(pa.y, pb.y, pc.y) / cell), y1 = Math.ceil(Math.max(pa.y, pb.y, pc.y) / cell);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
      const l1 = ((pb.y - pc.y) * (px - pc.x) + (pc.x - pb.x) * (py - pc.y)) / den;
      const l2 = ((pc.y - pa.y) * (px - pc.x) + (pa.x - pc.x) * (py - pc.y)) / den;
      const l3 = 1 - l1 - l2; if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const z = l1 * camPts[a].z + l2 * camPts[b].z + l3 * camPts[c].z;
      const k = gx + ',' + gy; if (zb.has(k) && z <= zb.get(k)) continue;
      let nx = l1 * ns[0].x + l2 * ns[1].x + l3 * ns[2].x, ny = l1 * ns[0].y + l2 * ns[1].y + l3 * ns[2].y, nz = l1 * ns[0].z + l2 * ns[1].z + l3 * ns[2].z;
      const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      // the nearest surface faces the viewer: flip mixed-winding normals so camera-space z >= 0
      if (G.rotatePoint({ x: nx, y: ny, z: nz }, ang).z < 0) { nx = -nx; ny = -ny; nz = -nz; }
      zb.set(k, z);
      out.set(k, { gx, gy, n: { x: nx, y: ny, z: nz }, p: { x: l1 * W[a].x + l2 * W[b].x + l3 * W[c].x, y: l1 * W[a].y + l2 * W[b].y + l3 * W[c].y, z: l1 * W[a].z + l2 * W[b].z + l3 * W[c].z } });
    }
  });
  return [...out.values()];
};

// ---- measure ---------------------------------------------------------------------------------------------
const measure = (s, opts = {}) => {
  const V = s.V; const cell = opts.cell || 0.25; const rimFrac = opts.rimFrac || 0.85;
  const tone = s.group.params.tone || {};
  const model = opts.model || tone.model || 'legacy';
  const penWidth = opts.penWidth || 0.3;
  const paths = opts.paths || (opts.preview ? s.composePreview() : s.composeFull());
  const fills = s.fills(paths);
  const { ink, total } = rasteriseInk(fills, cell);
  const { camToWorld, worldToCam } = camBasis(V, s);
  const light = firstLight(s);
  const lightWorld = lightWorldToward(V, light);
  const eyeWorld = camToWorld({ x: 0, y: 0, z: 1 });
  const Hs = { x: lightWorld.x + eyeWorld.x, y: lightWorld.y + eyeWorld.y, z: lightWorld.z + eyeWorld.z };
  const hl = Math.hypot(Hs.x, Hs.y, Hs.z) || 1; const H = { x: Hs.x / hl, y: Hs.y / hl, z: Hs.z / hl };
  const ctx = { model, lights: [light], lightWorld, eyeWorld, H, shininess: opts.shininess || shininessFor(V, tone), ks: opts.ks === undefined ? 1 : opts.ks, ambient: opts.ambient, bounce: opts.bounce, visFn: opts.visFn, shade: opts.shade };

  let samples; let discC = null; let discR = null;
  const primitive = s.objectsOf()[0].params.primitive;
  if (primitive === 'sphere') {
    const xs = []; const ys = [];
    s.edges(paths).filter((e) => e.meta && e.meta.sceneTarget && e.meta.sceneTarget.edgeClass === 'silhouette' && e.meta.sceneTarget.objectId !== 'ground')
      .forEach((p) => p.forEach((q) => { xs.push(q.x); ys.push(q.y); }));
    if (!xs.length) throw new Error('light-realism.measure: no silhouette edge found (edges must be on)');
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, R = Math.max(maxx - minx, maxy - miny) / 2;
    discC = [cx, cy]; discR = R; samples = [];
    for (let gx = Math.floor((cx - R) / cell); gx <= Math.ceil((cx + R) / cell); gx++) for (let gy = Math.floor((cy - R) / cell); gy <= Math.ceil((cy + R) / cell); gy++) {
      const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell; const dx = (x - cx) / R, dy = (y - cy) / R; const r2 = dx * dx + dy * dy;
      if (r2 > rimFrac * rimFrac) continue;
      samples.push({ gx, gy, n: camToWorld({ x: dx, y: -dy, z: Math.sqrt(1 - r2) }), p: null, rad: Math.sqrt(r2) / rimFrac });
    }
  } else {
    samples = meshCells(V, s, cell);
  }
  const N = samples.length;
  const cells = { nl: new Float32Array(N), L: new Float32Array(N), S: new Float32Array(N), rad: new Float32Array(N), ink: new Float32Array(N), vis: new Float32Array(N) };
  samples.forEach((sm, i) => {
    const nl = sm.n.x * lightWorld.x + sm.n.y * lightWorld.y + sm.n.z * lightWorld.z;
    const r = evalLight(V, sm.n, sm.p, ctx);
    cells.nl[i] = nl; cells.L[i] = r.L; cells.S[i] = r.S || 0; cells.rad[i] = sm.rad === undefined ? 0 : sm.rad;
    cells.ink[i] = ink.get(sm.gx + ',' + sm.gy) || 0;
    cells.vis[i] = ctx.visFn ? ctx.visFn(sm.n, sm.p) : 1;
  });
  return {
    cells, n: N, cell, areaCell: cell * cell, totalInk: total, penWidth, model, discC, discR, paths,
    samples, lightWorld, eyeWorld, H, lightCam: worldToCam(lightWorld), grid: null,
  };
};

// ---- binning -------------------------------------------------------------------------------------------------
const RANGE = { L: [0, 1], nl: [-1, 1], S: [0, 1] };
const bins = (profile, key, o = {}) => {
  const [dlo, dhi] = RANGE[key] || [0, 1];
  const n = o.n || 10, lo = o.lo === undefined ? dlo : o.lo, hi = o.hi === undefined ? dhi : o.hi, minArea = o.minArea === undefined ? 15 : o.minArea;
  const out = Array.from({ length: n }, (_, i) => ({ lo: lo + (hi - lo) * i / n, hi: lo + (hi - lo) * (i + 1) / n, area: 0, ink: 0, cov: null }));
  const arr = profile.cells[key];
  for (let i = 0; i < profile.n; i++) {
    if (o.where && !o.where(i)) continue;
    const v = arr[i]; if (v < lo || v > hi) continue;
    const b = out[Math.min(n - 1, Math.floor((v - lo) / (hi - lo) * n))];
    b.area += profile.areaCell; b.ink += profile.cells.ink[i];
  }
  out.forEach((b) => { b.cov = b.area >= minArea ? profile.penWidth * b.ink / b.area : null; });
  return out;
};

const covAt = (profile, key, lo, hi, where) => {
  let area = 0, ink = 0;
  for (let i = 0; i < profile.n; i++) {
    const v = profile.cells[key][i]; if (v < lo || v >= hi) continue; if (where && !where(i)) continue;
    area += profile.areaCell; ink += profile.cells.ink[i];
  }
  return area > 0 ? profile.penWidth * ink / area : null;
};

const topFractionCoverage = (profile, key, frac) => {
  const idx = Array.from({ length: profile.n }, (_, i) => i).sort((a, b) => profile.cells[key][b] - profile.cells[key][a]);
  const m = Math.max(1, Math.round(profile.n * frac)); let ink = 0;
  for (let k = 0; k < m; k++) ink += profile.cells.ink[idx[k]];
  return profile.penWidth * ink / (m * profile.areaCell);
};

const spearman = (xs, ys) => {
  const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); o.forEach((e, i) => { r[e[1]] = i; }); return r; };
  const n = xs.length; if (n < 3) return NaN;
  const rx = rank(xs), ry = rank(ys), mx = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - mx); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - mx) ** 2; }
  return sxy / Math.sqrt(sxx * syy || 1);
};

// ---- glint ---------------------------------------------------------------------------------------------------
const glintAnalytic = (profile) => ({ ...profile.H });

// Smoothed-ink minimum among the cells with S within 30 % of the peak: where the drawn glint actually sits.
const glintMeasured = (profile, radiusMm = 2) => {
  const { cells } = profile; let smax = 0;
  for (let i = 0; i < profile.n; i++) if (cells.S[i] > smax) smax = cells.S[i];
  if (!(smax > 0)) return { normal: null, angleDeg: null };
  const pos = new Map(); profile.samples.forEach((sm, i) => pos.set(sm.gx + ',' + sm.gy, i));
  const r = Math.round(radiusMm / profile.cell);
  let best = Infinity; let acc = [];
  for (let i = 0; i < profile.n; i++) {
    if (cells.S[i] < 0.3 * smax) continue;
    const sm = profile.samples[i]; let a = 0, k = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const j = pos.get((sm.gx + dx) + ',' + (sm.gy + dy)); if (j === undefined) continue;
      a += cells.ink[j]; k++;
    }
    const c = k ? a / (k * profile.areaCell) : Infinity;
    if (c < best - 1e-9) { best = c; acc = [i]; } else if (Math.abs(c - best) <= 1e-9) acc.push(i);
  }
  // centroid of the tied minimum (an empty glint is a plateau of zero-ink cells), then its mean normal
  let nx = 0, ny = 0, nz = 0; acc.forEach((i) => { const n = profile.samples[i].n; nx += n.x; ny += n.y; nz += n.z; });
  const l = Math.hypot(nx, ny, nz) || 1; const normal = { x: nx / l, y: ny / l, z: nz / l };
  const H = profile.H; const dot = Math.max(-1, Math.min(1, normal.x * H.x + normal.y * H.y + normal.z * H.z));
  return { normal, angleDeg: Math.acos(dot) / DEG, cells: acc.length };
};

// ---- metrics ---------------------------------------------------------------------------------------------------
const valid = (arr) => arr.filter((b) => b.cov !== null);

const m1Monotone = (profile, o = {}) => {
  const b = valid(bins(profile, 'L', o));
  let maxRise = 0; for (let i = 1; i < b.length; i++) maxRise = Math.max(maxRise, b[i].cov - b[i - 1].cov);
  const rho = b.length >= 4 ? spearman(b.map((x) => (x.lo + x.hi) / 2), b.map((x) => x.cov)) : null;
  const pass = maxRise <= 0.02 + 1e-9 && (rho === null || rho <= -0.9);
  return { pass, maxRise, rho, bins: b.length, detail: b.map((x) => +x.cov.toFixed(3)) };
};

const m2Highlight = (profile, o = {}) => {
  const specular = o.specular !== false;
  if (!specular) {
    const c = covAt(profile, 'L', 0.95, 1.0001);
    return { pass: c === null || c <= 0.02, value: c, mode: 'specular-off' };
  }
  const top = topFractionCoverage(profile, 'S', 0.01);
  const g = glintMeasured(profile);
  const front = profile.lightCam.z >= 0.9;
  return { pass: top <= 0.01 && g.angleDeg !== null && g.angleDeg <= 3, value: top, angleDeg: g.angleDeg, frontLight: front, mode: 'specular-on' };
};

const m3Range = (profile, density = 50) => {
  const dark = covAt(profile, 'L', 0, 0.1), bright = covAt(profile, 'L', 0.9, 1.0001);
  const need = density >= 50 ? 0.25 : 0.15;
  const value = dark === null || bright === null ? null : dark - bright;
  return { pass: value !== null && value >= need, value, need, dark, bright };
};

const m4Terminator = (profile) => {
  const b = bins(profile, 'nl', { n: 20, lo: -0.5, hi: 0.5, minArea: 8 });
  let bestDrop = 0, at = null;
  for (let i = 1; i < b.length; i++) {
    if (b[i].cov === null || b[i - 1].cov === null) continue;
    const drop = b[i - 1].cov - b[i].cov; // coverage falls as n.L rises through the terminator
    if (drop > bestDrop) { bestDrop = drop; at = (b[i].lo + b[i - 1].lo) / 2 + 0.025; }
  }
  const shadow = covAt(profile, 'nl', -0.3, 0), lit = covAt(profile, 'nl', 0.1, 0.2);
  const atOk = at !== null && at >= -0.05 - 1e-9 && at <= 0.15 + 1e-9;
  const attOk = shadow !== null && lit !== null && shadow >= lit + 0.05;
  return { pass: atOk && attOk, steepestAt: at, steepest: bestDrop, attachedShadow: shadow, nearTerminatorLit: lit };
};

const targetCov = (Lstar, cDark, cLight = 0) => cDark - (cDark - cLight) * Lstar;

const m5CrossLaw = (profilesByLaw, o = {}) => {
  const cDark = o.cDark, cLight = o.cLight || 0; const perLaw = {}; let worst = 0; const byBin = {};
  Object.keys(profilesByLaw).forEach((law) => {
    const b = bins(profilesByLaw[law], 'L', o); perLaw[law] = 0;
    b.forEach((x, i) => {
      if (x.cov === null) return;
      const d = Math.abs(x.cov - targetCov((x.lo + x.hi) / 2, cDark, cLight));
      perLaw[law] = Math.max(perLaw[law], d); worst = Math.max(worst, d);
      (byBin[i] = byBin[i] || []).push(x.cov);
    });
  });
  const spread = Math.max(0, ...Object.keys(byBin).map((i) => Math.max(...byBin[i]) - Math.min(...byBin[i])));
  return { pass: worst <= 0.06 && spread <= 0.10, worst, spread, perLaw };
};

const m6PoseSurface = (surf, pose, o = {}) => {
  const a = bins(surf, 'L', o), b = bins(pose, 'L', o); let worst = 0; const per = [];
  a.forEach((x, i) => { if (x.cov === null || b[i].cov === null) return; const d = Math.abs(x.cov - b[i].cov); per.push(+d.toFixed(3)); worst = Math.max(worst, d); });
  return { pass: worst <= 0.04, worst, per };
};

const m7LimbCentre = (profile, o = {}) => {
  const third = (lo, hi) => (i) => profile.cells.rad[i] >= lo && profile.cells.rad[i] < hi;
  const centre = bins(profile, 'L', { ...o, where: third(0, 1 / 3) }), limb = bins(profile, 'L', { ...o, where: third(2 / 3, 1.0001), minArea: o.minArea === undefined ? 8 : o.minArea });
  let worst = 0; const per = [];
  centre.forEach((c, i) => { if (c.cov === null || limb[i].cov === null) return; const d = Math.abs(c.cov - limb[i].cov); per.push(+d.toFixed(3)); worst = Math.max(worst, d); });
  return { pass: worst <= 0.04, worst, per };
};

const m8Shadow = (profile, o = {}) => {
  const cA = o.cAmbient === undefined ? covAt(profile, 'L', 0, 0.12, (i) => profile.cells.vis[i] > 0.5) : o.cAmbient;
  const shaded = covAt(profile, 'L', 0, 2, (i) => profile.cells.vis[i] < 0.5);
  return { pass: shaded !== null && cA !== null && shaded >= cA - 0.03, shaded, reference: cA };
};

// M9: what the sun widget should show for a light under a camera, from the same maths the app uses.
const m9Widget = (V, light, cam, drawn) => {
  const t = V.Scene3D.Regions.towardLight(light);
  const c = V.Geometry3D.rotatePoint(t, { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll || 0 });
  const expected = { z: c.z, behind: c.z < 0, radiusFrac: Math.hypot(c.x, c.y), camVec: c };
  if (!drawn) return { pass: true, expected };
  const okBehind = drawn.behind === expected.behind;
  const okR = Math.abs(drawn.radiusFrac - expected.radiusFrac) <= 0.02;
  return { pass: okBehind && okR, expected, drawn };
};

// ---- counters ----------------------------------------------------------------------------------------------------
const SL = (s) => s.V.Scene3D.SurfaceLock;
const diffStats = (a, b) => { const o = {}; Object.keys(b).forEach((k) => { if (typeof b[k] === 'number') o[k] = b[k] - (a[k] || 0); }); return o; };

// NOTE: tone is memoized per vertex and filled lazily as rotation reveals vertices, so a FIRST sweep may show toneEvals > 0.
// Call twice (second with { warm: false }) to assert "a repeated orbit evaluates no tone".
const orbitCounters = (s, yaws, o = {}) => {
  if (o.warm !== false) s.composeFull();
  const sl = SL(s); sl.resetStats(); const a = { ...sl.stats };
  yaws.forEach((y) => { s.setPose({ camYaw: y, camPitch: o.pitch === undefined ? 20 : o.pitch }); s.composePreview(); });
  return diffStats(a, { ...sl.stats });
};

const lightMoveCounters = (s, azels) => {
  s.composeFull();
  const sl = SL(s); sl.resetStats(); const a = { ...sl.stats };
  azels.forEach((l) => { setLightAzEl(s, l.az, l.el); s.composePreview(); });
  return diffStats(a, { ...sl.stats });
};

module.exports = {
  LIGHTS, REF_LEGACY, loadRuntime, buildCase, setLightCam, setLightAzEl, lightCamVec, camBasis, firstLight,
  measure, bins, covAt, topFractionCoverage, spearman, glintAnalytic, glintMeasured, targetCov,
  m1Monotone, m2Highlight, m3Range, m4Terminator, m5CrossLaw, m6PoseSurface, m7LimbCentre, m8Shadow, m9Widget,
  orbitCounters, lightMoveCounters,
};
