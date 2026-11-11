/**
 * Scene3D.SurfaceLockShadow — the world-locked ground cast shadow (docs/surface-lock-contract.md §10).
 *
 *   supports({ shadow, light, ground, casters }) -> boolean
 *   bakeGround(groundSpec, shadowCfg, penWidth, seed) -> GroundHatch   (pose-free, camera- and light-free)
 *   frameShadow(groundHatch, casters, lightDirWorld, pose) -> { world: Float64Array(x0, z0, x1, z1 ...), runs: [{ pts, visible: true }] }
 *   receiveMap(...)                                                  (stub: W3-C)
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

  const hash01 = (i, salt) => {
    let h = ((i | 0) * 73856093) ^ (salt | 0);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Van der Corput base 2 over the low 24 bits: ranks of consecutive indices are low-discrepancy, so
  // {rank < k} is a quasi-evenly spaced subset for any k (the gain-2 nested ladder, made continuous).
  const vdc2 = (n) => {
    let x = n >>> 0; let r = 0; let f = 0.5;
    for (let b = 0; b < 24; b += 1) { if (x & 1) r += f; x >>>= 1; f *= 0.5; }
    return r;
  };
  const ctz = (n) => { if (!n) return 31; let c = 0; let x = n >>> 0; while (!(x & 1)) { x >>>= 1; c += 1; } return c; };

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
      if (c.primitive != null && !CONVEX_PRIMITIVES.has(c.primitive)) return false;
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
  const buildKeepLUT = (tone, depth, penWidth) => {
    if (!(depth > 0) || !tone || tone.enabled === false) return null;
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
    const pitch = Math.max(TUNE.MIN_PITCH_MM, sBase / scaleRef);
    const key = ['gs1', hx.toFixed(6), hz.toFixed(6), angleDeg.toFixed(6), pitch.toFixed(6), depth.toFixed(6),
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
    for (let k = 0; k < maxCount; k += 1) {
      const off = (iMin + k + phase) * pitch;
      // Clip  s*u + off*n  to |x| <= hx, |z| <= hz (slab test).
      let lo = -Infinity; let hi = Infinity;
      const slab = (u, o, h) => {
        if (Math.abs(u) < 1e-12) { if (Math.abs(o) > h) { lo = Infinity; hi = -Infinity; } return; }
        const a = (-h - o) / u; const b = (h - o) / u;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      };
      slab(ux, off * nx, hx); slab(uz, off * nz, hz);
      d[k] = off; t0[k] = lo; t1[k] = hi;
      rank[k] = vdc2(k);
      level[k] = Math.min(ctz(k), maxLevels - 1);
    }
    const hatch = {
      key, angleDeg, dirX: ux, dirZ: uz, nX: nx, nZ: nz, pitch, phase, iMin, count: maxCount, hx, hz, scaleRef, penWidth: pw,
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
  const prepareCaster = (c, d) => {
    if (!c) return null;
    const shape = c.shape || (c.points ? 'hull' : (c.center && Number.isFinite(c.radius) ? 'sphere' : null));
    if (shape === 'sphere') {
      const C = c.center; const r = finite(c.radius, 0);
      if (!C || !(r > 1e-9) || !Number.isFinite(C.x) || !Number.isFinite(C.y) || !Number.isFinite(C.z)) return null;
      const t = C.y / d.y; // <= 0 for a caster above the ground
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
        if (P.y < -1e-9) continue; // a vertex under the receiver is dropped (pose mode does the same)
        const t = P.y / d.y;
        proj.push({ x: P.x - t * d.x, y: 0, z: P.z - t * d.z });
        nad.push({ x: P.x, y: 0, z: P.z });
      }
      const ring = hullRing(proj);
      const cring = hullRing(nad);
      if (!ring || !cring) return null;
      return finishCaster({ kind: 'poly', ring }, { kind: 'poly', ring: cring });
    }
    return null;
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
    } else {
      fp.ring.forEach((q) => { L = Math.max(L, contactDist(contact, q.x, q.z)); });
    }
    let cx = 0; let cz = 0;
    if (fp.kind === 'ellipse') { cx = fp.cx; cz = fp.cz; } else {
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
    let lo = Infinity; let hi = -Infinity;
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
  const makeProjector = (pose) => {
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
      const c = G3.rotatePoint({ x, y: 0, z }, ang);
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

  const frameShadow = (hatch, casters, lightDirWorld, pose) => {
    sync();
    if (!hatch || !hatch.count || !Array.isArray(casters) || !casters.length) return EMPTY();
    const d = lightDirWorld ? normalize3(lightDirWorld) : null;
    if (!d || Math.abs(d.y) < TUNE.MIN_ABS_DY) return EMPTY();
    const prepared = [];
    for (let i = 0; i < casters.length; i += 1) { const pc = prepareCaster(casters[i], d); if (pc) prepared.push(pc); }
    if (!prepared.length) return EMPTY();

    const project = pose && pose.cam ? makeProjector(pose) : null;
    // Thinning factor c in (0, 1]: 1 when no pose is given (the full baked set).
    let thin = 1;
    if (project) {
      // Measured at the footprint (union centre of the casters), not at world (0, 0): under perspective
      // the screen pitch differs across the ground.
      let fx = 0; let fz = 0;
      prepared.forEach((pc) => { fx += pc.cx; fz += pc.cz; });
      const f = screenPitchFactor(project, hatch, fx / prepared.length, fz / prepared.length);
      thin = clamp(f / hatch.scaleRef, 0, 1);
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

  Scene3D.SurfaceLockShadow = {
    supports,
    bakeGround,
    frameShadow,
    receiveMap: () => { throw new Error('SurfaceLockShadow.receiveMap: not implemented (surface-lock unit W3-C)'); },
    clearCache: () => memo.clear(),
    get MIN_ABS_DY() { return TUNE.MIN_ABS_DY; },
    get MIN_RUN_MM() { return TUNE.MIN_RUN_MM; },
    CONVEX_PRIMITIVES,
  };
})();
