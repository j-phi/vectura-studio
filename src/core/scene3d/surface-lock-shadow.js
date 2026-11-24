/**
 * Scene3D.SurfaceLockShadow — the world-locked ground cast shadow (docs/surface-lock-contract.md §10).
 *
 *   supports({ shadow, light, ground, casters }) -> boolean
 *   bakeGround(groundSpec, shadowCfg, penWidth, seed) -> GroundHatch   (pose-free, camera- and light-free)
 *   frameShadow(groundHatch, casters, lightDirWorld, pose) -> { world: Float64Array(x0, z0, x1, z1 ...), runs: [{ pts, visible: true }] }
 *   receiveMap({ lights, casters, resolution? }) -> ReceiveMap       (light-space depth map, cached; see below)
 *
 * The shadow hatch lives in WORLD ground coordinates (plane y = 0). `bakeGround` lays parallel lines over
 * the ground extent once, nested like a MarkSet (gain 2, van der Corput rank). `frameShadow` intersects
 * each baked line with the caster footprints (sphere: exact ellipse; convex mesh: convex hull of the
 * projected vertices), merges the per-line intervals (no FillBoolean), grades them by the object's own
 * tone ladder as rank gating along distance-from-contact, and projects the interval ENDPOINTS (a ground
 * segment stays straight). Under a camera orbit the lines never move; only the footprint moves when the
 * light or a caster moves.
 *
 * Mirrors the pose-mode FLAT path of shadows.js (the default: shadowLayers false, hatch mark class) and
 * nothing else; `supports` is false for every configuration this does not reproduce.
 *
 * Caster records (built by the caller from the same objects Level S frames):
 *   { primitive, shape: 'sphere', center: { x, y, z }, radius }        world sphere
 *   { primitive, shape: 'hull',   points: [{ x, y, z } ... ] }         world vertices of a convex caster (box, ...)
 *
 * Pose is the contract §4 shape: pose.cam = { yaw, pitch, roll, scale, cx, cy, persp, focal, dist }.
 */
(function registerScene3DSurfaceLockShadow() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Tuning values live in Vectura.SCENE3D_SURFACE_LOCK.SHADOW (see `sync`); this table is the safe fallback when the
  // config is not loaded. MIN_ELEVATION_DEG / MIN_RUN_MM mirror shadows.js (grazing light stretches the footprint to
  // infinity; the run floor is applied in WORLD mm so it never flickers under an orbit). LUT_N is the tone-gating
  // look-up resolution over t = distContact / L, SEARCH_ITERS the ternary / bisection depth for the tone-gated
  // sub-interval of one line, ELLIPSE_SAMPLES the samples for the throw length L of a sphere footprint, MAX_LINES the
  // hard cap on baked lines, MIN_PITCH_MM the finest world pitch of the ground hatch, MEMO_MAX the bake memo LRU size.
  const DEFAULTS = {
    MIN_ELEVATION_DEG: 2,
    MIN_RUN_MM: 0.6,
    LUT_N: 512,
    SEARCH_ITERS: 26,
    ELLIPSE_SAMPLES: 96,
    MAX_LINES: 40000,
    MIN_PITCH_MM: 0.05,
    MEMO_MAX: 8,
    BASE_SUBDIV: 3,          // bake the ground hatch this x finer than the pose pitch (FX-J4)
    SPACING_FLOOR: 0.8,      // closest drawn pair of shadow lines >= this x the pose spacing on screen (owner Q3)
  };
  const TUNE = Object.assign({}, DEFAULTS);
  TUNE.MIN_ABS_DY = Math.sin(TUNE.MIN_ELEVATION_DEG * Math.PI / 180);
  const sync = () => {
    const own = (Vectura.SCENE3D_SURFACE_LOCK || {}).SHADOW || {};
    Object.keys(DEFAULTS).forEach((k) => { TUNE[k] = Number.isFinite(own[k]) ? own[k] : DEFAULTS[k]; });
    TUNE.MIN_ABS_DY = Math.sin(TUNE.MIN_ELEVATION_DEG * Math.PI / 180);
  };
  const LUT_SALT = 0x5a17;

  // Chart primitives whose ground footprint is exactly the convex hull of their projected vertices
  // (torus / torusKnot have a hole and are excluded: a hull would fill it) plus box.
  const CONVEX_PRIMITIVES = new Set(['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'superellipsoid', 'pyramid', 'box']);
  // Non-convex primitives whose footprint is the exact union of their projected triangles ({ shape: 'mesh' } records):
  // the hole of a torus stays open when the light makes it visible (A34).
  const MESH_PRIMITIVES = new Set(['torus', 'torusKnot']);

  const hash01 = (i, salt) => {
    let h = ((i | 0) * 73856093) ^ (salt | 0);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Van der Corput base 2 over the low 24 bits: ranks of consecutive indices are low-discrepancy, so
  // {rank < k} is a quasi-evenly spaced subset for any k (the gain-2 nested ladder, made continuous).
  const vdc2 = (n) => {
    let x = n >>> 0; // bit-reverse the 32-bit word, keep the (reversed) low 24 bits: exactly the 24-step radical inverse
    x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
    x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
    x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
    x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
    x = ((x >>> 16) | (x << 16)) >>> 0;
    return (x >>> 8) / 16777216;
  };
  const clz32 = Math.clz32;
  const ctz = (n) => { const x = n >>> 0; return x ? 31 - clz32(x & -x) : 31; };

  const lightDirOf = (light) => {
    if (!light) return null;
    if (light.dir && Number.isFinite(light.dir.x) && Number.isFinite(light.dir.y) && Number.isFinite(light.dir.z)) return light.dir;
    const L = Scene3D.Lighting;
    return L && typeof L.lightWorldDir === 'function' ? L.lightWorldDir(light) : null;
  };

  const normalize3 = (d) => {
    const l = Math.hypot(d.x, d.y, d.z);
    return l > 1e-12 ? { x: d.x / l, y: d.y / l, z: d.z / l } : null;
  };

  // ── supports ─────────────────────────────────────────────────────────────────
  // The flat hatch the pose path draws by default. Anything else (layers, inverse mode, follow-light
  // angle, a non-hatch Fill Style) is a look this module does not reproduce, so the scene is not Level S.
  const supports = ({ shadow, light, ground, casters } = {}) => {
    sync();
    const bag = shadow || {};
    if (bag.shadowLayers === true) return false;
    if (bag.shadowMode === 'inverse') return false;
    if (bag.shadowAngleFollowsLight === true) return false;
    const law = bag.shadowToneLaw;
    if (law != null && law !== 'ladder' && law !== 'none') return false;
    if (!ground || ground.enabled === false) return false;
    if (!light || Array.isArray(light) || light.type !== 'directional' || light.castShadows === false) return false;
    const d = lightDirOf(light);
    if (!d || !Number.isFinite(d.y) || Math.abs(d.y) < TUNE.MIN_ABS_DY) return false;
    if (!Array.isArray(casters)) return false;
    return casters.every((c) => {
      if (!c || typeof c !== 'object') return false;
      if (c.shape === 'mesh') return c.triangles != null && c.triangles.length >= 9;
      if (c.primitive != null && !CONVEX_PRIMITIVES.has(c.primitive) && !MESH_PRIMITIVES.has(c.primitive)) return false;
      if (c.shape === 'sphere' || c.shape === 'hull') return true;
      return c.primitive != null;
    });
  };

  // ── bake ─────────────────────────────────────────────────────────────────────
  const densityToCoverage = (density) => clamp(finite(density, 50) / 100, 0.02, 1);
  const coverageToSpacing = (coverage, penWidth) => {
    const R = Scene3D.Regions;
    if (R && typeof R.coverageToSpacing === 'function') return R.coverageToSpacing(coverage, penWidth);
    const pw = Math.max(0.05, finite(penWidth, 0.3));
    return Math.max(pw, pw / clamp(finite(coverage, 0.5), 0.02, 1));
  };
  const ladderCoverageAt = (I, tone) => {
    const R = Scene3D.Regions;
    if (!R || typeof R.band !== 'function' || typeof R.coverageFor !== 'function') return null;
    const b = R.band(clamp(finite(I, 0), 0, 1), tone);
    return R.coverageFor(b, tone);
  };

  const groundHalfExtents = (spec) => {
    const s = spec || {};
    if (Number.isFinite(s.halfX) && Number.isFinite(s.halfZ)) return { hx: Math.max(1, s.halfX), hz: Math.max(1, s.halfZ) };
    // Same rule as scene.js buildGroundRecord: span = 0.75 * the artboard's longer side, times scaleX / scaleZ.
    const span = Math.max(finite(s.width, 200), finite(s.height, 200)) * 0.75;
    return { hx: Math.max(1, span * Math.max(0, finite(s.scaleX, 1))), hz: Math.max(1, span * Math.max(0, finite(s.scaleZ, 1))) };
  };

  // keep(t): fraction of the finest lines kept at throw parameter t (0 at the contact, 1 at the far tip).
  // The pose-mode buildGradedSpacing law: duty = sMin / sTarget(ladder(1 - t)), keep = 1 - depth (1 - duty).
  // The LUT depends only on (tone, depth, pen), not on angle / seed / density / ground, and costs 513 ladder lookups, so a
  // re-bake with the same tone (a density or angle drag) reuses it. It is read-only after the bake; clearCache drops it.
  const lutMemo = new Map();
  const buildKeepLUT = (tone, depth, penWidth) => {
    if (!(depth > 0) || !tone || tone.enabled === false) return null;
    const lk = toneKey(tone) + '|' + depth.toFixed(6) + '|' + penWidth.toFixed(6);
    if (lutMemo.has(lk)) return lutMemo.get(lk);
    const lut = buildKeepLUTUncached(tone, depth, penWidth);
    lutMemo.set(lk, lut);
    while (lutMemo.size > 8) lutMemo.delete(lutMemo.keys().next().value);
    return lut;
  };
  const buildKeepLUTUncached = (tone, depth, penWidth) => {
    const maxCov = ladderCoverageAt(1, tone);
    if (maxCov == null || !(maxCov > 0)) return null;
    const sMin = coverageToSpacing(maxCov, penWidth);
    const lut = new Float64Array(TUNE.LUT_N + 1);
    let floor = 1;
    for (let k = 0; k <= TUNE.LUT_N; k += 1) {
      const cov = ladderCoverageAt(1 - k / TUNE.LUT_N, tone);
      const sT = coverageToSpacing(cov == null ? maxCov : cov, penWidth);
      const duty = clamp(sMin / sT, 0.02, 1);
      const keep = clamp(1 - depth * (1 - duty), 0.02, 1);
      floor = Math.min(floor, keep); // keep is non-increasing in t even for an odd ladder
      lut[k] = floor;
    }
    return lut;
  };

  const memo = new Map();
  const toneKey = (tone) => (tone ? JSON.stringify([tone.enabled, tone.thresholds, tone.ladder]) : 'none');

  const bakeGround = (groundSpec, shadowCfg, penWidth, seed) => {
    sync();
    const spec = groundSpec || {};
    const bag = shadowCfg || {};
    const pw = Math.max(0.05, finite(penWidth, 0.3));
    const { hx, hz } = groundHalfExtents(spec);
    const scaleRef = Math.max(0.05, finite(spec.scaleRef, 1));
    const noTone = bag.shadowToneLaw === 'none';
    const angleDeg = clamp(finite(bag.shadowAngle, 45), 0, 360) + (noTone ? 3 : 0); // pose 'none' recipe nudges +3 deg
    const depth = noTone ? 0 : clamp(finite(bag.shadowToneDepth, 0.75), 0, 1);
    const falloff = clamp(finite(bag.shadowFalloff, 0.5), 0.2, 1);
    const P = Scene3D.Params;
    const tone = bag.tone || (P && P.DEFAULT_TONE) || null;
    const salt = (seed && typeof seed === 'object') ? (seed.salt | 0) : (Number.isFinite(Number(seed)) ? (Number(seed) | 0) : 0);
    const coverage = bag.shadowDensity != null ? densityToCoverage(bag.shadowDensity) : 0.5;
    const sBase = coverageToSpacing(coverage, pw);
    // Finest world pitch: the pose-mode screen pitch at a top-down view (f = 1). frameShadow thins this
    // nested set to the pitch the current view needs, so the screen density stays at the pose-mode value.
    const subdiv = Math.max(1, Math.round(finite(TUNE.BASE_SUBDIV, 4)));
    // FX-J4: bake BASE_SUBDIV x finer than the pose pitch so frameShadow's whole-stride rounding overshoots by at most 1 / subdiv.
    const pitch = Math.max(TUNE.MIN_PITCH_MM / subdiv, sBase / scaleRef / subdiv);
    const key = ['gs2', subdiv, hx.toFixed(6), hz.toFixed(6), angleDeg.toFixed(6), pitch.toFixed(6), depth.toFixed(6),
      toneKey(tone), pw.toFixed(6), salt, scaleRef.toFixed(6)].join('|');
    if (memo.has(key)) { const hit = memo.get(key); memo.delete(key); memo.set(key, hit); return hit; }

    const th = angleDeg * Math.PI / 180;
    const ux = Math.cos(th); const uz = Math.sin(th);
    const nx = -uz; const nz = ux; // line normal (offset axis)
    const phase = hash01(salt, LUT_SALT);
    // Offset range that touches the rectangle: |d| <= hx |nx| + hz |nz|.
    const dMax = hx * Math.abs(nx) + hz * Math.abs(nz);
    let iMin = Math.ceil(-dMax / pitch - phase); let iMax = Math.floor(dMax / pitch - phase);
    if (iMax - iMin + 1 > TUNE.MAX_LINES) { const mid = Math.floor((iMin + iMax) / 2); iMin = mid - TUNE.MAX_LINES / 2; iMax = iMin + TUNE.MAX_LINES - 1; }
    const maxCount = Math.max(0, iMax - iMin + 1);
    const d = new Float64Array(maxCount); const t0 = new Float64Array(maxCount); const t1 = new Float64Array(maxCount);
    const rank = new Float64Array(maxCount); const level = new Uint8Array(maxCount);
    const maxLevels = Math.max(1, finite((Vectura.SCENE3D_SURFACE_LOCK || {}).MAX_LEVELS, 6));
    // Index into the arrays is i - iMin for every i in [iMin, iMax]; a line the rectangle misses keeps t0 > t1.
    // Math is read once: this loop runs once per baked line, and a global lookup per call is the dominant cost in a sandboxed realm.
    const mAbs = Math.abs; const mMin = Math.min; const mMax = Math.max;
    const uxFlat = mAbs(ux) < 1e-12; const uzFlat = mAbs(uz) < 1e-12;
    const cap = maxLevels - 1;
    for (let k = 0; k < maxCount; k += 1) {
      const off = (iMin + k + phase) * pitch;
      // Clip  s*u + off*n  to |x| <= hx, |z| <= hz (slab test).
      let lo = -Infinity; let hi = Infinity;
      let o = off * nx;
      if (uxFlat) { if (mAbs(o) > hx) { lo = Infinity; hi = -Infinity; } } else {
        const a = (-hx - o) / ux; const b = (hx - o) / ux;
        lo = mMax(lo, mMin(a, b)); hi = mMin(hi, mMax(a, b));
      }
      o = off * nz;
      if (uzFlat) { if (mAbs(o) > hz) { lo = Infinity; hi = -Infinity; } } else {
        const a = (-hz - o) / uz; const b = (hz - o) / uz;
        lo = mMax(lo, mMin(a, b)); hi = mMin(hi, mMax(a, b));
      }
      d[k] = off; t0[k] = lo; t1[k] = hi;
      rank[k] = vdc2(k);
      const c = ctz(k);
      level[k] = c < cap ? c : cap;
    }
    const hatch = {
      key, subdiv, angleDeg, dirX: ux, dirZ: uz, nX: nx, nZ: nz, pitch, phase, iMin, count: maxCount, hx, hz, scaleRef, penWidth: pw,
      toneDepth: depth, falloff, d, t0, t1, rank, level, keepLUT: buildKeepLUT(tone, depth, pw),
      bytes: maxCount * (8 * 4 + 1) + (depth > 0 ? (TUNE.LUT_N + 1) * 8 : 0),
    };
    memo.set(key, hatch);
    while (memo.size > TUNE.MEMO_MAX) memo.delete(memo.keys().next().value);
    return hatch;
  };

  // ── footprints ───────────────────────────────────────────────────────────────
  const cross2 = (ox, oz, ax, az, bx, bz) => (ax - ox) * (bz - oz) - (az - oz) * (bx - ox);

  const hullRing = (pts) => {
    const H = Scene3D.Shadows;
    let ring;
    if (H && typeof H.convexHull === 'function') ring = H.convexHull(pts.map((p) => ({ x: p.x, y: p.z }))).map((q) => ({ x: q.x, z: q.y }));
    else ring = null;
    if (!ring) return null;
    if (ring.length < 3) return null;
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) area += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    if (area < 0) ring.reverse();
    return ring; // CCW in (x, z)
  };

  const dist2Seg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax; const dz = bz - az;
    const L2 = dx * dx + dz * dz;
    let t = L2 > 1e-18 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - px; const qz = az + t * dz - pz;
    return qx * qx + qz * qz;
  };

  // Prepare one caster for a light direction d (unit, d.y < 0): footprint, contact set and throw length.
  const prepareCaster = (c, d, gy = 0) => {
    if (!c) return null;
    const shape = c.shape || (c.points ? 'hull' : (c.center && Number.isFinite(c.radius) ? 'sphere' : null));
    if (shape === 'sphere') {
      const C = c.center; const r = finite(c.radius, 0);
      if (!C || !(r > 1e-9) || !Number.isFinite(C.x) || !Number.isFinite(C.y) || !Number.isFinite(C.z)) return null;
      const t = (C.y - gy) / d.y; // <= 0 for a caster above the ground
      const cx = C.x - t * d.x; const cz = C.z - t * d.z; // footprint centre
      const hl = Math.hypot(d.x, d.z);
      const hx = hl > 1e-9 ? d.x / hl : 1; const hz = hl > 1e-9 ? d.z / hl : 0; // throw direction
      const A = r / Math.abs(d.y); const B = r;
      const fp = { kind: 'ellipse', cx, cz, hx, hz, A, B, px: -hz, pz: hx };
      const contact = { kind: 'disk', x: C.x, z: C.z, r };
      return finishCaster(fp, contact);
    }
    if (shape === 'hull') {
      const pts = Array.isArray(c.points) ? c.points : [];
      const proj = []; const nad = [];
      for (let i = 0; i < pts.length; i += 1) {
        const P = pts[i];
        if (!P || !Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) continue;
        if (P.y - gy < -1e-9) continue; // a vertex under the receiver is dropped (pose mode does the same)
        const t = (P.y - gy) / d.y;
        proj.push({ x: P.x - t * d.x, y: 0, z: P.z - t * d.z });
        nad.push({ x: P.x, y: 0, z: P.z });
      }
      const ring = hullRing(proj);
      const cring = hullRing(nad);
      if (!ring || !cring) return null;
      return finishCaster({ kind: 'poly', ring }, { kind: 'poly', ring: cring });
    }
    if (shape === 'mesh') {
      // The footprint depends on the triangles, the light and the receiver, not on the camera: an orbit frame reuses it.
      const hit = meshPrep.get(c.triangles);
      if (hit && hit.dx === d.x && hit.dy === d.y && hit.dz === d.z && hit.gy === gy) return hit.pc;
      const pc = prepareMesh(c, d, gy);
      meshPrep.set(c.triangles, { dx: d.x, dy: d.y, dz: d.z, gy, pc });
      return pc;
    }
    return null;
  };

  // Non-convex caster (A34): every triangle is projected along the light onto y = gy (each is a convex triangle) and the
  // footprint is their union, taken per baked line. Triangles are binned by the range of line indices their offset span
  // touches (CSR arrays), so a line tests only the triangles that can reach it. A triangle with a vertex under the receiver
  // is dropped, as the hull path drops such a vertex. The throw length / tone grading mirror the pose path: contact is the
  // convex hull of the vertices in the lowest slice (shadows.js nadirContact, h0 = max(0.5, 3 % of the height)).
  // Akl-Toussaint: drop the points strictly inside the octagon of the eight directional extremes before the hull sort
  // (a torus has thousands of projected vertices, nearly all interior); the hull of the survivors is the same polygon.
  const fastHull = (pts) => {
    if (pts.length < 64) return hullRing(pts);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const ext = dirs.map(() => null); const best = dirs.map(() => -Infinity);
    for (let i = 0; i < pts.length; i += 1) for (let k = 0; k < 8; k += 1) { const v = pts[i].x * dirs[k][0] + pts[i].z * dirs[k][1]; if (v > best[k]) { best[k] = v; ext[k] = pts[i]; } }
    // octagon (CCW by direction angle); a point is interior when strictly left of every edge
    const keep = [];
    for (let i = 0; i < pts.length; i += 1) {
      let inside = true;
      for (let k = 0; k < 8 && inside; k += 1) {
        const a = ext[k]; const b = ext[(k + 1) % 8];
        if ((b.x - a.x) * (pts[i].z - a.z) - (b.z - a.z) * (pts[i].x - a.x) <= 1e-9) inside = false;
      }
      if (!inside) keep.push(pts[i]);
    }
    return hullRing(keep.length >= 3 ? keep : pts);
  };
  const meshPrep = new WeakMap();
  const prepareMesh = (c, d, gy) => {
    const T = c.triangles;
    const n = Math.floor(T.length / 9);
    if (!n) return null;
    const proj = new Float64Array(n * 6); const kept = [];
    let minY = Infinity; let maxY = -Infinity;
    for (let t = 0; t < n; t += 1) {
      const o = 9 * t; let ok = true;
      for (let v = 0; v < 3; v += 1) { const y = T[o + 3 * v + 1]; if (!Number.isFinite(y) || !Number.isFinite(T[o + 3 * v]) || !Number.isFinite(T[o + 3 * v + 2]) || y - gy < -1e-9) ok = false; }
      if (!ok) continue;
      for (let v = 0; v < 3; v += 1) {
        const y = T[o + 3 * v + 1]; const k = (y - gy) / d.y;
        proj[6 * t + 2 * v] = T[o + 3 * v] - k * d.x; proj[6 * t + 2 * v + 1] = T[o + 3 * v + 2] - k * d.z;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      kept.push(t);
    }
    if (!kept.length) return null;
    // contact: lowest slice, widened until it holds a polygon
    let cring = null;
    const base = Math.max(minY, gy); const h0 = Math.max(0.5, 0.03 * Math.max(0, maxY - minY));
    for (let pass = 0; pass < 6 && !cring; pass += 1) {
      const cut = base + h0 * Math.pow(2, pass); const nad = [];
      for (let q = 0; q < kept.length; q += 1) {
        const o = 9 * kept[q];
        for (let v = 0; v < 3; v += 1) if (T[o + 3 * v + 1] <= cut) nad.push({ x: T[o + 3 * v], y: 0, z: T[o + 3 * v + 2] });
      }
      if (nad.length >= 3) cring = fastHull(nad);
    }
    if (cring && cring.length > MESH_CONTACT_MAX) { // an inscribed polygon: distances read at most a sagitta (< 0.3 mm at 30 mm radius) high
      const m = cring.length; const dec = [];
      for (let q = 0; q < MESH_CONTACT_MAX; q += 1) dec.push(cring[Math.floor(q * m / MESH_CONTACT_MAX)]);
      cring = dec;
    }
    const pts = [];
    for (let q = 0; q < kept.length; q += 1) for (let v = 0; v < 3; v += 1) pts.push({ x: proj[6 * kept[q] + 2 * v], y: 0, z: proj[6 * kept[q] + 2 * v + 1] });
    const outer = fastHull(pts);
    if (!outer || !cring) return null;
    const fp = { kind: 'mesh', proj, kept, ring: outer, bins: null, binLo: 0 };
    const pc = finishCaster(fp, { kind: 'poly', ring: cring });
    pc.cx = 0; pc.cz = 0;
    pts.forEach((q) => { pc.cx += q.x; pc.cz += q.z; });
    pc.cx /= pts.length; pc.cz /= pts.length;
    return pc;
  };

  // Bin the kept triangles by line index (CSR): bins.start[i - lo] .. bins.start[i - lo + 1] index bins.list.
  const binMesh = (fp, nx, nz, pitch, phase, iLo, iHi, hatch) => {
    if (fp.bins && fp.bins.hatch === hatch && fp.bins.lo === iLo && fp.bins.hi === iHi) return; // same hatch bake and range: kept
    const m = iHi - iLo + 1;
    const start = new Int32Array(m + 1);
    const ranges = new Int32Array(fp.kept.length * 2);
    const P = fp.proj;
    for (let q = 0; q < fp.kept.length; q += 1) {
      const o = 6 * fp.kept[q];
      const a = P[o] * nx + P[o + 1] * nz; const b = P[o + 2] * nx + P[o + 3] * nz; const c = P[o + 4] * nx + P[o + 5] * nz;
      const lo = Math.max(iLo, Math.ceil(Math.min(a, b, c) / pitch - phase)); const hi = Math.min(iHi, Math.floor(Math.max(a, b, c) / pitch - phase));
      ranges[2 * q] = lo; ranges[2 * q + 1] = hi;
      for (let i = lo; i <= hi; i += 1) start[i - iLo + 1] += 1;
    }
    for (let i = 0; i < m; i += 1) start[i + 1] += start[i];
    const fill = start.slice(0, m); const list = new Int32Array(start[m]);
    for (let q = 0; q < fp.kept.length; q += 1) for (let i = ranges[2 * q]; i <= ranges[2 * q + 1]; i += 1) list[fill[i - iLo]++] = fp.kept[q];
    fp.bins = { start, list, lo: iLo, hi: iHi, hatch, lines: new Map() };
  };

  const MESH_CONTACT_MAX = 24;
  const MESH_SEAM = 1e-7; // intervals of adjacent triangles meet at a seam to float error: bridge it
  // Merged intervals (flat [a0, b0, a1, b1 ...], ascending, disjoint) of line (off along n, direction u) inside the mesh footprint.
  const meshIntervals = (fp, ux, uz, nx, nz, off, i) => {
    let out;
    const B = fp.bins; const k = i - B.lo;
    const memoHit = B.lines.get(i); // per-line intervals depend on the hatch and the footprint only: an orbit frame reads them back
    if (memoHit) return memoHit;
    out = [];
    B.lines.set(i, out);
    if (k < 0 || k + 1 >= B.start.length) return out;
    const bx = off * nx; const bz = off * nz; const P = fp.proj;
    const tmp = [];
    for (let e = B.start[k]; e < B.start[k + 1]; e += 1) {
      const o = 6 * B.list[e];
      const ax = P[o]; const az = P[o + 1]; let b0x = P[o + 2]; let b0z = P[o + 3]; let c0x = P[o + 4]; let c0z = P[o + 5];
      const area = (b0x - ax) * (c0z - az) - (b0z - az) * (c0x - ax);
      if (Math.abs(area) < 1e-12) continue;
      if (area < 0) { const tx = b0x; const tz = b0z; b0x = c0x; b0z = c0z; c0x = tx; c0z = tz; }
      let lo = -Infinity; let hi = Infinity; let miss = false;
      for (let q = 0; q < 3 && !miss; q += 1) {
        const px = q === 0 ? ax : q === 1 ? b0x : c0x; const pz = q === 0 ? az : q === 1 ? b0z : c0z;
        const qx = q === 0 ? b0x : q === 1 ? c0x : ax; const qz = q === 0 ? b0z : q === 1 ? c0z : az;
        const ex = qx - px; const ez = qz - pz;
        const f0 = ex * (bz - pz) - ez * (bx - px); const fs = ex * uz - ez * ux;
        if (Math.abs(fs) < 1e-14) { if (f0 < 0) miss = true; continue; }
        const s = -f0 / fs;
        if (fs > 0) { if (s > lo) lo = s; } else if (s < hi) hi = s;
      }
      if (!miss && lo < hi) tmp.push(lo, hi);
    }
    const m = tmp.length / 2;
    if (!m) return out;
    const idx = new Array(m); for (let q = 0; q < m; q += 1) idx[q] = q;
    idx.sort((p, q) => tmp[2 * p] - tmp[2 * q]);
    let cs = tmp[2 * idx[0]]; let ce = tmp[2 * idx[0] + 1];
    for (let q = 1; q < m; q += 1) {
      const s = tmp[2 * idx[q]]; const e = tmp[2 * idx[q] + 1];
      if (s <= ce + MESH_SEAM) { if (e > ce) ce = e; } else { out.push(cs, ce); cs = s; ce = e; }
    }
    out.push(cs, ce);
    return out;
  };

  const contactDist = (contact, x, z) => {
    if (contact.kind === 'disk') { const r = Math.hypot(x - contact.x, z - contact.z) - contact.r; return r > 0 ? r : 0; }
    const ring = contact.ring; let inside = true; let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      if (cross2(ring[j].x, ring[j].z, ring[i].x, ring[i].z, x, z) < 0) inside = false;
      const q = dist2Seg(x, z, ring[j].x, ring[j].z, ring[i].x, ring[i].z);
      if (q < best) best = q;
    }
    return inside ? 0 : Math.sqrt(best);
  };

  const finishCaster = (fp, contact) => {
    let L = 0;
    if (fp.kind === 'ellipse') {
      for (let k = 0; k < TUNE.ELLIPSE_SAMPLES; k += 1) {
        const a = (k / TUNE.ELLIPSE_SAMPLES) * 2 * Math.PI;
        const ca = Math.cos(a) * fp.A; const sb = Math.sin(a) * fp.B;
        L = Math.max(L, contactDist(contact, fp.cx + fp.hx * ca + fp.px * sb, fp.cz + fp.hz * ca + fp.pz * sb));
      }
    } else if (fp.kind === 'mesh') {
      // contactDist is convex, so its max over the footprint is reached at an extreme point of the footprint, and those are
      // vertices of the outer hull ring (which are projected vertices, hence in the footprint)
      fp.ring.forEach((q) => { L = Math.max(L, contactDist(contact, q.x, q.z)); });
    } else {
      fp.ring.forEach((q) => { L = Math.max(L, contactDist(contact, q.x, q.z)); });
    }
    let cx = 0; let cz = 0;
    if (fp.kind === 'ellipse') { cx = fp.cx; cz = fp.cz; } else if (fp.kind === 'mesh') { /* set by prepareMesh */ } else {
      fp.ring.forEach((q) => { cx += q.x; cz += q.z; });
      cx /= fp.ring.length; cz /= fp.ring.length;
    }
    return { fp, contact, L, cx, cz };
  };

  // Offset range (along the line normal) the footprint spans.
  const offsetRange = (fp, nx, nz) => {
    if (fp.kind === 'ellipse') {
      const c = fp.cx * nx + fp.cz * nz;
      const ext = Math.hypot(fp.A * (fp.hx * nx + fp.hz * nz), fp.B * (fp.px * nx + fp.pz * nz));
      return [c - ext, c + ext];
    }
    let lo = Infinity; let hi = -Infinity; // hull and mesh: the (outer) ring bounds every projected vertex
    fp.ring.forEach((q) => { const v = q.x * nx + q.z * nz; if (v < lo) lo = v; if (v > hi) hi = v; });
    return [lo, hi];
  };

  // Interval of s where  s*u + off*n  lies inside the footprint, or null.
  const lineInterval = (fp, ux, uz, nx, nz, off) => {
    const bx = off * nx; const bz = off * nz;
    if (fp.kind === 'ellipse') {
      // Coordinates in the ellipse frame: a = (p - c) . h / A, b = (p - c) . perp / B.
      const qx = bx - fp.cx; const qz = bz - fp.cz;
      const a0 = (qx * fp.hx + qz * fp.hz) / fp.A; const b0 = (qx * fp.px + qz * fp.pz) / fp.B;
      const da = (ux * fp.hx + uz * fp.hz) / fp.A; const db = (ux * fp.px + uz * fp.pz) / fp.B;
      const qa = da * da + db * db; const qb = 2 * (a0 * da + b0 * db); const qc = a0 * a0 + b0 * b0 - 1;
      if (qa < 1e-18) return null;
      const disc = qb * qb - 4 * qa * qc;
      if (disc <= 0) return null;
      const sq = Math.sqrt(disc);
      return [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)];
    }
    // Cyrus-Beck against a CCW convex polygon: inside = cross(edge, p - a) >= 0 for every edge.
    let lo = -Infinity; let hi = Infinity;
    const ring = fp.ring;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const ex = ring[i].x - ring[j].x; const ez = ring[i].z - ring[j].z;
      const f0 = ex * (bz - ring[j].z) - ez * (bx - ring[j].x);
      const fs = ex * uz - ez * ux;
      if (Math.abs(fs) < 1e-14) { if (f0 < 0) return null; continue; }
      const s = -f0 / fs;
      if (fs > 0) { if (s > lo) lo = s; } else if (s < hi) hi = s;
    }
    return lo < hi ? [lo, hi] : null;
  };

  // Largest throw parameter whose keep exceeds `rank` (rank in [0, 1)): lines with that rank show up to
  // t* and not beyond. 1 means the whole throw.
  const tStarFor = (lut, rank) => {
    if (!lut) return 1;
    if (lut[TUNE.LUT_N] > rank) return 1;
    if (!(lut[0] > rank)) return 0;
    let lo = 0; let hi = TUNE.LUT_N; // lut[lo] > rank, lut[hi] <= rank
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lut[mid] > rank) lo = mid; else hi = mid; }
    return lo / TUNE.LUT_N;
  };

  // Sub-interval of [a, b] on line (base, u) where contactDist < D (a convex function of s: one interval).
  const gateInterval = (contact, bx, bz, ux, uz, a, b, D) => {
    if (contact.kind === 'disk') {
      // Closed form: dist < D  <=>  |p - c| < r + D, a quadratic in s along the unit direction.
      const R = contact.r + D; const qx = bx - contact.x; const qz = bz - contact.z;
      const bq = qx * ux + qz * uz; const disc = bq * bq - (qx * qx + qz * qz - R * R);
      if (disc <= 0) return null;
      const sq = Math.sqrt(disc);
      const left = Math.max(a, -bq - sq); const right = Math.min(b, -bq + sq);
      return right > left ? [left, right] : null;
    }
    const g = (s) => contactDist(contact, bx + ux * s, bz + uz * s);
    let lo = a; let hi = b;
    for (let i = 0; i < TUNE.SEARCH_ITERS; i += 1) {
      const m1 = lo + (hi - lo) / 3; const m2 = hi - (hi - lo) / 3;
      if (g(m1) < g(m2)) hi = m2; else lo = m1;
    }
    const sMin = (lo + hi) / 2;
    if (!(g(sMin) < D)) return null;
    let left = a;
    if (!(g(a) < D)) { let x0 = a; let x1 = sMin; for (let i = 0; i < TUNE.SEARCH_ITERS; i += 1) { const m = (x0 + x1) / 2; if (g(m) < D) x1 = m; else x0 = m; } left = x1; }
    let right = b;
    if (!(g(b) < D)) { let x0 = sMin; let x1 = b; for (let i = 0; i < TUNE.SEARCH_ITERS; i += 1) { const m = (x0 + x1) / 2; if (g(m) < D) x0 = m; else x1 = m; } right = x0; }
    return right > left ? [left, right] : null;
  };

  // ── pose projection (contract §4, exactly Geometry3D.rotatePoint + projectPoint) ─────────────────
  const makeProjector = (pose, gy = 0) => {
    const G3 = Vectura.Geometry3D;
    const cam = pose && pose.cam;
    if (!G3 || !cam || typeof G3.rotatePoint !== 'function' || typeof G3.projectPoint !== 'function') return null;
    const ang = { yaw: finite(cam.yaw, 0), pitch: finite(cam.pitch, 0), roll: finite(cam.roll, 0) };
    const persp = cam.persp === true || (Number.isFinite(cam.focal) && cam.focal > 0 && cam.persp !== false);
    const opts = {
      centerX: finite(cam.cx != null ? cam.cx : cam.centerX, 0), centerY: finite(cam.cy != null ? cam.cy : cam.centerY, 0),
      scale: finite(cam.scale, 1),
    };
    if (persp) { opts.focal = finite(cam.focal, 0); opts.cameraDist = finite(cam.dist != null ? cam.dist : cam.cameraDist, 0); }
    return (x, z) => {
      const c = G3.rotatePoint({ x, y: gy, z }, ang);
      const p = G3.projectPoint(c, opts);
      if (!p || p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return p;
    };
  };

  // Perpendicular screen pitch per unit world pitch of the hatch at (ox, oz): the nested set is thinned by
  // this factor so the screen density stays at the pose-mode value as the camera orbits.
  const screenPitchFactor = (project, hatch, ox, oz) => {
    const o = project(ox, oz); const pu = project(ox + hatch.dirX, oz + hatch.dirZ); const pn = project(ox + hatch.nX, oz + hatch.nZ);
    if (!o || !pu || !pn) return 0;
    const sux = pu.x - o.x; const suy = pu.y - o.y; const snx = pn.x - o.x; const sny = pn.y - o.y;
    const lu = Math.hypot(sux, suy);
    if (lu < 1e-6) return 0;
    return Math.abs(sux * sny - suy * snx) / lu;
  };

  // ── frame ────────────────────────────────────────────────────────────────────
  const EMPTY = () => ({ world: new Float64Array(0), runs: [] });

  const frameShadow = (hatch, casters, lightDirWorld, pose, opts) => {
    const gy = finite(opts && opts.groundY, 0); // floor height: the receiving plane is y = gy (0 => byte-identical)
    sync();
    if (!hatch || !hatch.count || !Array.isArray(casters) || !casters.length) return EMPTY();
    const d = lightDirWorld ? normalize3(lightDirWorld) : null;
    if (!d || Math.abs(d.y) < TUNE.MIN_ABS_DY) return EMPTY();
    const prepared = [];
    for (let i = 0; i < casters.length; i += 1) { const pc = prepareCaster(casters[i], d, gy); if (pc) prepared.push(pc); }
    if (!prepared.length) return EMPTY();

    const project = pose && pose.cam ? makeProjector(pose, gy) : null;
    // Thinning factor c in (0, 1]: 1 when no pose is given (the full baked set).
    // The baked set is hatch.subdiv x finer than the pose pitch, so the no-pose / top-down full set is every subdiv-th line.
    const sub = hatch.subdiv || 1;
    let thin = 1 / sub;
    if (project) {
      // Measured at the footprint (union centre of the casters), not at world (0, 0): under perspective
      // the screen pitch differs across the ground.
      let fx = 0; let fz = 0;
      prepared.forEach((pc) => { fx += pc.cx; fz += pc.cz; });
      const f = screenPitchFactor(project, hatch, fx / prepared.length, fz / prepared.length);
      thin = clamp(f / hatch.scaleRef, 0, 1) / sub;
      if (!(thin > 1e-6)) return EMPTY();
      // Spacing floor: the drawn gap is a whole number of baked lines, so thinning to exactly f / scaleRef would leave
      // gaps of floor(1 / thin) lines, denser than the pose pitch (foreshortened lines compress). Round the stride up
      // so the closest pair of drawn lines stays at least SPACING_FLOOR x the pose spacing on screen.
      if (thin < 1) thin = Math.min(thin, 1 / Math.max(1, Math.ceil(TUNE.SPACING_FLOOR / thin - 1e-9)));
    }

    const { dirX: ux, dirZ: uz, nX: nx, nZ: nz, pitch, phase, iMin, count } = hatch;
    const lut = hatch.keepLUT;
    // Candidate line indices: the union of the footprints' offset ranges.
    let iLo = Infinity; let iHi = -Infinity;
    const ranges = prepared.map((pc) => offsetRange(pc.fp, nx, nz));
    ranges.forEach(([lo, hi]) => { iLo = Math.min(iLo, Math.ceil(lo / pitch - phase)); iHi = Math.max(iHi, Math.floor(hi / pitch - phase)); });
    iLo = Math.max(iLo, iMin); iHi = Math.min(iHi, iMin + count - 1);

    const world = []; const runs = [];
    const iv = [];
    prepared.forEach((pc) => { if (pc.fp.kind === 'mesh' && iHi >= iLo) binMesh(pc.fp, nx, nz, pitch, phase, iLo, iHi, hatch); });
    for (let i = iLo; i <= iHi; i += 1) {
      const k = i - iMin;
      // Even thinning (Bresenham): line k is drawn when floor((k + 1) * thin) steps past floor(k * thin), so gaps
      // are floor(1 / thin) or ceil(1 / thin) lines and the density is exact. (A power-of-two stride is even too
      // but off by up to sqrt(2) in density.) The tone rank is the van der Corput rank of the drawn line's
      // ordinal, so the ladder keeps its nested, evenly spaced look.
      const j = thin < 1 ? Math.floor(k * thin) : k;
      if (thin < 1 && !(Math.floor((k + 1) * thin) > j)) continue;
      const r = thin < 1 ? vdc2(j) : hatch.rank[k];
      const lo0 = hatch.t0[k]; const hi0 = hatch.t1[k];
      if (!(lo0 < hi0)) continue;
      const off = hatch.d[k];
      const bx = off * nx; const bz = off * nz;
      iv.length = 0;
      for (let c = 0; c < prepared.length; c += 1) {
        const pc = prepared[c];
        if (pc.fp.kind === 'mesh') {
          // a non-convex footprint is several intervals per line; each is clipped and tone-gated on its own
          const mi = meshIntervals(pc.fp, ux, uz, nx, nz, off, i);
          for (let m = 0; m < mi.length; m += 2) {
            let a = Math.max(mi[m], lo0); let b = Math.min(mi[m + 1], hi0);
            if (!(b > a)) continue;
            if (lut && pc.L > 1e-9) {
              const ts = tStarFor(lut, r);
              if (ts < 1) {
                const g = ts > 0 ? gateInterval(pc.contact, bx, bz, ux, uz, a, b, pc.L * ts) : null;
                if (!g) continue;
                a = g[0]; b = g[1];
              }
            }
            iv.push(a, b);
          }
          continue;
        }
        const base = lineInterval(pc.fp, ux, uz, nx, nz, off);
        if (!base) continue;
        let a = Math.max(base[0], lo0); let b = Math.min(base[1], hi0);
        if (!(b > a)) continue;
        if (lut && pc.L > 1e-9) {
          const ts = tStarFor(lut, r);
          if (ts < 1) {
            const g = ts > 0 ? gateInterval(pc.contact, bx, bz, ux, uz, a, b, pc.L * ts) : null;
            if (!g) continue;
            a = g[0]; b = g[1];
          }
        }
        iv.push(a, b);
      }
      if (!iv.length) continue;
      // Merge per-line intervals (union of casters, no FillBoolean).
      const n = iv.length / 2; const idx = [];
      for (let q = 0; q < n; q += 1) idx.push(q);
      idx.sort((p, q) => iv[2 * p] - iv[2 * q]);
      let cs = iv[2 * idx[0]]; let ce = iv[2 * idx[0] + 1];
      const emit = (s0, s1) => {
        if (!(s1 - s0 >= TUNE.MIN_RUN_MM)) return;
        const x0 = bx + ux * s0; const z0 = bz + uz * s0; const x1 = bx + ux * s1; const z1 = bz + uz * s1;
        if (project) {
          const p0 = project(x0, z0); const p1 = project(x1, z1);
          if (!p0 || !p1) return;
          runs.push({ pts: [{ x: p0.x, y: p0.y, z: p0.z }, { x: p1.x, y: p1.y, z: p1.z }], visible: true });
        } else {
          runs.push({ pts: [{ x: x0, y: z0 }, { x: x1, y: z1 }], visible: true });
        }
        world.push(x0, z0, x1, z1);
      };
      for (let q = 1; q < n; q += 1) {
        const s = iv[2 * idx[q]]; const e = iv[2 * idx[q] + 1];
        if (s <= ce) { if (e > ce) ce = e; } else { emit(cs, ce); cs = s; ce = e; }
      }
      emit(cs, ce);
    }
    return { world: Float64Array.from(world), runs, footprints: prepared.map((pc) => footprintRing(pc.fp)) };
  };

  // The world (x, z) ring of a prepared footprint, CCW: the picking polygon of a cast shadow (pose mode emits the same
  // region ring as `pickPolygon`). An ellipse is sampled at 48 points; a hull is its ring.
  const footprintRing = (fp) => {
    if (!fp) return [];
    if (fp.kind === 'ellipse') {
      const n = 48; const ring = [];
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * 2 * Math.PI; const ca = Math.cos(a) * fp.A; const sb = Math.sin(a) * fp.B;
        ring.push({ x: fp.cx + fp.hx * ca + fp.px * sb, z: fp.cz + fp.hz * ca + fp.pz * sb });
      }
      return ring;
    }
    return (fp.ring || []).map((q) => ({ x: q.x, z: q.z }));
  };


  // ── receive shadows (light realism U9) ───────────────────────────────────────
  // receiveMap({ lights, casters }) -> ReceiveMap with
  //   visFn(nw, wp) -> vis in [0,1]   (1 lit, 0 in a cast shadow; several lights: n.L-weighted mean over shadow casters)
  //   visForLight(i, nw, wp) -> 0|1   shadowFn(P, light) -> true when blocked (Regions.shade opts.shadowFn)
  //   shadowFnFor(nw)                 shadowFn that also uses the receiver's normal (slope-scaled bias)
  // casters: [{ id, key?, triangles: [{a,b,c}] | faces: [{ worldVerts }] }] in WORLD space. `key` is the caller's
  // transform key (cheap); without it the vertices are hashed. The map is rebuilt only when the light set (type,
  // direction, position) or a caster's geometry changes. The camera is not an input, so an orbit is a cache hit.
  // Directional lights use the depth map; point/spot/area lights fall back to the exact ray test (slower, correct).
  const rcache = [];
  const RCACHE_MAX = 4;
  const rstats = { builds: 0, hits: 0, queries: 0, lastBuildMs: 0, lastTriangles: 0, lastRes: 0 };

  const hashTriangles = (tris) => {
    let h = 2166136261 >>> 0;
    const buf = new Float64Array(1); const u32 = new Uint32Array(buf.buffer);
    const mix = (x) => { buf[0] = Math.round(x * 1e4) / 1e4; h = Math.imul(h ^ u32[0], 16777619) >>> 0; h = Math.imul(h ^ u32[1], 16777619) >>> 0; };
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      mix(t.a.x); mix(t.a.y); mix(t.a.z); mix(t.b.x); mix(t.b.y); mix(t.b.z); mix(t.c.x); mix(t.c.y); mix(t.c.z);
    }
    return h.toString(36);
  };

  const casterTriangles = (c) => {
    if (Array.isArray(c.triangles)) return c.triangles;
    const out = [];
    (Array.isArray(c.faces) ? c.faces : []).forEach((f) => {
      const wv = f && f.worldVerts;
      if (!Array.isArray(wv) || wv.length < 3) return;
      for (let i = 1; i < wv.length - 1; i += 1) out.push({ a: wv[0], b: wv[i], c: wv[i + 1] });
    });
    return out;
  };

  const castingLights = (lights) => (Array.isArray(lights) ? lights : (lights ? [lights] : []))
    .filter((l) => l && l.type !== 'ambient' && l.castShadows !== false && l.enabled !== false);

  const lightSig = (l) => JSON.stringify([l.type || 'directional', l.azimuth, l.elevation, l.position ? [l.position.x, l.position.y, l.position.z] : null]);

  const receiveMap = (spec = {}) => {
    const SR = Scene3D.ShadowReceive;
    if (!SR || typeof SR.buildDepthMap !== 'function') throw new Error('SurfaceLockShadow.receiveMap: Scene3D.ShadowReceive is not loaded');
    const lights = castingLights(spec.lights);
    const casters = (Array.isArray(spec.casters) ? spec.casters : []).filter(Boolean);
    const res = spec.resolution ? JSON.stringify(spec.resolution) : '';
    const tris = casters.map(casterTriangles);
    const keys = casters.map((c, i) => `${c.id == null ? i : c.id}:${c.key != null ? c.key : hashTriangles(tris[i])}:${tris[i].length}`);
    const key = `${lights.map(lightSig).join('|')}#${keys.join('|')}#${res}`;
    for (let i = 0; i < rcache.length; i += 1) {
      if (rcache[i].key === key) {
        const hit = rcache.splice(i, 1)[0];
        rcache.unshift(hit);
        rstats.hits += 1;
        hit.lights = lights; // intensities may change without a rebuild
        return hit;
      }
    }
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const all = [].concat(...tris);
    const mapOpts = typeof spec.resolution === 'object' && spec.resolution ? spec.resolution : {};
    const maps = lights.map((l) => ((l.type || 'directional') === 'directional' ? SR.buildDepthMap(all, l, mapOpts) : null));
    let occ = null;
    const occluders = () => {
      if (!occ) {
        const groups = new Map();
        casters.forEach((c, i) => groups.set(c.id == null ? i : c.id, tris[i].map((t) => ({ a: t.a, b: t.b, c: t.c, objectId: c.id == null ? i : c.id }))));
        occ = SR.buildOccluderSet(Array.from(groups, ([id, ts]) => ({ id, faces: ts.map((t) => ({ worldVerts: [t.a, t.b, t.c] })) })));
      }
      return occ;
    };
    const towardOf = (l, P) => {
      if (l.type && l.type !== 'directional' && l.position) return normalize3({ x: l.position.x - P.x, y: l.position.y - P.y, z: l.position.z - P.z });
      const d = lightDirOf(l);
      return d ? normalize3({ x: -d.x, y: -d.y, z: -d.z }) : null;
    };
    const blockedBy = (i, P, nw) => {
      const m = maps[i];
      if (m) return SR.depthMapShadowed(m, P, nw);
      return SR.pointInShadow(P, map.lights[i], occluders());
    };
    const indexOfLight = (light) => {
      let k = map.lights.indexOf(light);
      if (k >= 0) return k;
      const sig = lightSig(light);
      k = map.lights.findIndex((l) => lightSig(l) === sig);
      return k;
    };
    const map = {
      key, lights, maps, triangles: all.length, res: maps[0] ? maps[0].res : 0, texel: maps[0] ? maps[0].texel : 0,
      visForLight: (i, nw, wp) => {
        if (!map.lights[i] || !wp) return 1;
        if (nw) {
          const L = towardOf(map.lights[i], wp);
          if (L && nw.x * L.x + nw.y * L.y + nw.z * L.z <= 0) return 1; // attached shadow: not a cast-shadow question
        }
        return blockedBy(i, wp, nw) ? 0 : 1;
      },
      visFn: (nw, wp) => {
        rstats.queries += 1;
        let num = 0; let den = 0;
        for (let i = 0; i < map.lights.length; i += 1) {
          const L = wp ? towardOf(map.lights[i], wp) : null;
          const nl = nw && L ? nw.x * L.x + nw.y * L.y + nw.z * L.z : 1;
          if (nl <= 0) continue;
          const wgt = nl * clamp(finite(map.lights[i].intensity, 1), 0, 1);
          if (wgt <= 0) continue;
          den += wgt;
          num += wgt * (blockedBy(i, wp, nw) ? 0 : 1);
        }
        return den > 0 ? num / den : 1;
      },
      shadowFn: (P, light) => {
        rstats.queries += 1;
        const i = indexOfLight(light);
        return i >= 0 ? blockedBy(i, P, null) : false;
      },
      shadowFnFor: (nw) => (P, light) => {
        rstats.queries += 1;
        const i = indexOfLight(light);
        return i >= 0 ? blockedBy(i, P, nw) : false;
      },
    };
    rstats.builds += 1;
    rstats.lastBuildMs = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    rstats.lastTriangles = all.length;
    rstats.lastRes = map.res;
    rcache.unshift(map);
    if (rcache.length > RCACHE_MAX) rcache.pop();
    return map;
  };

  Scene3D.SurfaceLockShadow = {
    supports,
    bakeGround,
    frameShadow,
    receiveMap,
    receiveStats: () => Object.assign({}, rstats),
    resetReceiveStats: () => { rstats.builds = 0; rstats.hits = 0; rstats.queries = 0; },
    clearCache: () => { memo.clear(); lutMemo.clear(); rcache.length = 0; },
    get MIN_ABS_DY() { return TUNE.MIN_ABS_DY; },
    get MIN_RUN_MM() { return TUNE.MIN_RUN_MM; },
    CONVEX_PRIMITIVES,
    MESH_PRIMITIVES,
  };
})();
