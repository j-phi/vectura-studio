/**
 * Scene3D.SurfaceLockMezzo — the surface-locked mezzotint baker (lawMezzoLocked, contract §9 "Mezzo").
 *
 *   FIT, supports(spec), bake(spec) -> MarkSet, toneLUT(spec, toneCtx) -> { lut, scaleFn }
 *
 * What it bakes: region seeds by 3D dart throwing in object mm; each region owns one constant 3D direction
 * (the pose-mode law's six angles 30 degrees apart, now measured in the seed's tangent plane); at a point
 * q of a region the hatch field is that vector projected into q's tangent plane. Streamlines follow the
 * field through the chart Jacobian (midpoint steps, each verified: the realised 3D distance must be within
 * STEP_TOL of the request or the step is halved), Jobard-Lefer style, LEVEL BY LEVEL: level l places lines
 * at separation d_l = p0 / 2^l against every vertex of levels <= l (stop at STOP_FACTOR * d_l, seed at
 * SEED_FACTOR * d_l), so the cumulative set of levels <= l has pitch p0 / 2^l and each level doubles the
 * ink. Inside a level the lines are ranked by greedy farthest-point order of their midpoints, so a rank
 * threshold keeps an even subset. Crosshatch adds a second family (direction rotated about the seed
 * normal) with its own occupancy.
 *
 * Pose, camera, light and object id never enter a bake (contract §3, §8). Randomness is the explicit-salt
 * hash only. The tone map (`toneLUT`) is the pose-mode mezzo `makeCtx` pitchFor, copied here as pure maths.
 */
(function registerScene3DSurfaceLockMezzo() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Every value below is the pose-mode mezzo's own number, or a bake tuning constant. The live values come from
  // Vectura.SCENE3D_SURFACE_LOCK.MEZZO (see `sync`); this table is the safe fallback when the config is not loaded.
  const K_DEFAULTS = {
    STEP_SCREEN: 0.34,       // surface-fill-mono streamFamily STEP (screen mm); object step = / scaleRef
    STEP_MULT: 1,            // object step = STEP_SCREEN x this / scaleRef (bake cost is about linear in 1 / step)
    STEP_TOL: 2.5,           // stepTo verification tolerance
    STEP_HALVINGS: 5,
    STOP_FACTOR: 0.80,       // a line stops this close (x d_l) to another line
    SEED_TIGHT: 0.86,        // the live seed radius is SEED_FACTOR x this x d_l: seeding closer than 0.95 fills the nested gaps (FX-M)
    SEED_FACTOR: 0.95,       // a new line starts at least this far (x d_l) from the others
    MAX_STEPS: 2600,         // per direction
    CELL_F: 2,               // occupancy cell edge, x the larger of the stop and seed radii
    OWN_SKIP: 1.5,           // same-line points within this arc (x d_l) are not "other lines"
    FIELD_MIN: 0.05,         // |projected direction| below this: the field vanishes, the line ends
    REGION_MIN_MM: 3.0,      // REG = max(REGION_MIN_MM, R * REGION_R_FRAC) / scaleRef
    REGION_R_FRAC: 0.20,
    REGION_MAX: 200,
    REGION_TRIES: 4000,
    REGION_ANGLES: 6,
    REGION_ANGLE_STEP: 30,
    NEIGHBOURS: 14,
    GAIN: 2,
    SEED_ARC_TIGHT: 0.5,     // the live seed spacing along a line is SEED_ARC_STEPS x this x STEP (denser seeds close more gaps)
    SEED_ARC_STEPS: 2,       // new seeds along an accepted line every max(d_l, this x STEP)
    MIN_MARK_PEN: 2,         // surface-fill MIN_MARK_PEN (private there)
    INK_SPREAD: 0.12,        // surface-fill INK_SPREAD (private there)
    A_DARK: 0.90,            // makeCtx dark end of the tone map
    CROSS_OBJ_DEG: 65,       // Regions.CROSS_OBJ_DEG fallback
    PLOT_FLOOR_PEN: 2.2,     // Regions.PLOT_FLOOR_PEN fallback
    LIT_MAX_PITCH_PEN: 12,   // Regions.LIT_MAX_PITCH_PEN fallback
    MAX_VERTICES: 200000,    // contract §2 budget per object per fill group
    FALLBACK_PER_AREA: 2,    // fallback candidates per d_l^2 of surface (0.5 left level 1 under-filled once occupancy was dense)
    FALLBACK_MIN: 200,
    FALLBACK_MAX: 5000,
    RANK_FPO_MAX: 6000,      // farthest-point ranking above this many lines falls back to bit reversal
    MIN_LINE_D: 2,           // Jobard-Lefer minimum line length (x d_l): a new level-l line shorter than this is dropped
    MIN_LINE_MM: 0,          // absolute floor on the minimum line length (object mm / scaleRef)
    PREV_SEED_D: 4,          // seeds beside lower-level lines every max(seedArc, this x d_l)
    FALLBACK_SEEDED: 100,    // random fallback candidates for levels > 0 (the lower-level seeds do the filling)
    CONT_MIN_D: 1,           // a continuation run shorter than this (x d_l) is dropped; the end stays open for the next level
  };
  const K = Object.assign({}, K_DEFAULTS);

  const FIT = Object.freeze([Object.freeze({
    mappers: Object.freeze(['hatch', 'crosshatch', 'contour']),
    laws: Object.freeze(['mezzoRegion']),
    primitives: Object.freeze(['sphere', 'ellipsoid', 'torus', 'cylinder', 'capsule']),
  })]);
  // Chart primitives the baker does not serve yet, with the reason (contract §9: others may refuse).
  const REFUSED = Object.freeze({
    cone: 'apex and cap singularities not yet verified',
    superellipsoid: 'chart speed is unbounded at the face-centre meridians',
    torusKnot: 'tube phase seam in b is a real discontinuity',
    pyramid: 'corner edges have discontinuous normals',
  });
  const CONVEX = new Set(['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'superellipsoid', 'pyramid']);

  const sc = () => Scene3D;
  const cfg = () => Vectura.SCENE3D_SURFACE_LOCK || {};
  const sync = () => {
    const own = cfg().MEZZO || {};
    Object.keys(K_DEFAULTS).forEach((k) => { K[k] = Number.isFinite(own[k]) ? own[k] : K_DEFAULTS[k]; });
  };
  const regionsLib = () => Scene3D.Regions || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const finite = (v, d) => (Number.isFinite(v) ? v : d);
  const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const supports = (spec) => {
    if (!spec) return false;
    return FIT.some((row) => row.laws.includes(spec.toneLaw)
      && row.mappers.includes(spec.mapper)
      && row.primitives.includes(spec.primitive));
  };

  /* ── tone map (copy of makeCtx's pitchFor, pure) ───────────────────────── */
  const toneParams = (spec) => {
    const R = regionsLib();
    const PEN = finite(spec.penWidth, 0.3);
    const INK = PEN * (1 + K.INK_SPREAD);
    const FLOOR = (Number.isFinite(R.PLOT_FLOOR_PEN) ? R.PLOT_FLOOR_PEN : K.PLOT_FLOOR_PEN) * PEN;
    const litMax = (Number.isFinite(R.LIT_MAX_PITCH_PEN) ? R.LIT_MAX_PITCH_PEN : K.LIT_MAX_PITCH_PEN) * PEN;
    const DS = clamp(finite(spec.style && spec.style.densityScale, 1), 0.25, 4);
    const PMAX0 = Math.max(FLOOR * 1.6, litMax);
    const PMAX = Math.max(FLOOR * 1.6, litMax / DS);
    return { PEN, INK, FLOOR, DS, PMAX0, PMAX };
  };
  const pitchForFn = (T) => {
    const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
    const invL = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
    const A_LIGHT = clamp(T.INK / T.PMAX0, 0.02, 0.5);
    const L_LIGHT = Lstar(1 - A_LIGHT);
    const L_DARK = Lstar(1 - K.A_DARK);
    const areaFor = (I) => clamp(1 - invL(L_DARK + (L_LIGHT - L_DARK) * clamp(finite(I, 0), 0, 1)), 0.02, K.A_DARK);
    return (I) => clamp(T.INK / areaFor(I) / T.DS, T.INK / K.A_DARK, T.PMAX);
  };

  const toneLUT = (spec) => {
    sync();
    const size = cfg().TONE_LUT_SIZE || 256;
    const pitchFor = pitchForFn(toneParams(spec));
    const lut = new Float32Array(size + 1);
    for (let k = 0; k <= size; k++) lut[k] = 1 / pitchFor(k / size);
    return { lut, scaleFn: null };
  };

  /* ── the bake ──────────────────────────────────────────────────────────── */
  const bake = (spec) => {
    sync();
    const t0 = clock();
    const Chart = sc().SurfaceLockChart; const MS = sc().SurfaceLockMarkSet;
    const MAX_LEVELS = cfg().MAX_LEVELS || 6;
    // Zoom headroom: scaleRef keeps s / scaleRef within sqrt(2); 1.5 also covers the perspective spread (review A2).
    const HEADROOM = Number.isFinite(cfg().ZOOM_HEADROOM) ? cfg().ZOOM_HEADROOM : 1.5;
    const PLOT_FLOOR_SLACK = Number.isFinite(cfg().PLOT_FLOOR_SLACK) ? cfg().PLOT_FLOOR_SLACK : 0.8;
    const M = Chart.metric(spec.mode, spec.sizes, spec.scale);
    if (!M) throw new Error(`SurfaceLockMezzo.bake: no chart for mode ${spec.mode}`);
    const style = spec.style || {};
    const seedSpec = spec.seed || {};
    const salt = (seedSpec.salt | 0); const phase = finite(seedSpec.phase, 0);
    const scaleRef = Math.max(1e-6, finite(spec.scaleRef, 1));
    const T = toneParams(spec);
    const p0 = T.PMAX / scaleRef;
    const STEP = (K.STEP_SCREEN * K.STEP_MULT) / scaleRef;
    const fillAngle = finite(style.fillAngle, 45);
    const crossDeg = (regionsLib().CROSS_OBJ_DEG || K.CROSS_OBJ_DEG) + (clamp(finite(style.crossAngleDelta, 90), 10, 170) - 90);
    const nFam = spec.mapper === 'crosshatch' ? 2 : 1;
    const wrap01 = (u) => ((u % 1) + 1) % 1;

    // Sampler: analytic for the sphere/ellipsoid chart (the hot path; ~10x cheaper than the finite-difference
    // metric, verified against it in the unit test), SurfaceLockChart.metric.sample for every other chart.
    let sample = M.sample;
    if (spec.mode === 'sphere' && spec.sizes) {
      const sz = spec.sizes; const sk = spec.scale || {};
      const Rx = finite(sz.sx, 20) * finite(sk.sx, 1); const Ry = finite(sz.sy, 20) * finite(sk.sy, 1); const Rz = finite(sz.sz, 20) * finite(sk.sz, 1);
      const TAU = Math.PI * 2;
      sample = (a, b) => {
        if (!(a >= 0 && a <= 1 && b >= 0 && b <= 1)) return null;
        const lat = (a - 0.5) * Math.PI; const lon = b * TAU;
        const cl = Math.cos(lat); const sl = Math.sin(lat); const co = Math.cos(lon); const so = Math.sin(lon);
        const x = cl * co * Rx; const y = sl * Ry; const z = cl * so * Rz;
        let nx = x / (Rx * Rx); let ny = y / (Ry * Ry); let nz = z / (Rz * Rz);
        if (cl < 1e-12) { nx = 0; nz = 0; ny = sl > 0 ? 1 : -1; } else { const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l; }
        return {
          x, y, z,
          dax: -Math.PI * sl * co * Rx, day: Math.PI * cl * Ry, daz: -Math.PI * sl * so * Rz,
          dbx: -TAU * cl * so * Rx, dby: 0, dbz: TAU * cl * co * Rz,
          nx, ny, nz,
        };
      };
    }

    // Bounds, surface area and the largest area element, from a coarse chart grid.
    const NG = 48;
    let minX = Infinity; let minY = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    let area = 0; let maxCross = 0; let cnt = 0;
    for (let i = 0; i <= NG; i++) for (let j = 0; j < NG; j++) {
      const S = sample(i / NG, (j + 0.5) / NG);
      if (!S) continue;
      minX = Math.min(minX, S.x); maxX = Math.max(maxX, S.x); minY = Math.min(minY, S.y); maxY = Math.max(maxY, S.y);
      minZ = Math.min(minZ, S.z); maxZ = Math.max(maxZ, S.z);
      const cx = S.day * S.dbz - S.daz * S.dby; const cy = S.daz * S.dbx - S.dax * S.dbz; const cz = S.dax * S.dby - S.day * S.dbx;
      const c = Math.sqrt(cx * cx + cy * cy + cz * cz);
      area += c; cnt += 1; maxCross = Math.max(maxCross, c);
    }
    if (!cnt || !(maxCross > 0)) throw new Error('SurfaceLockMezzo.bake: degenerate chart');
    area /= cnt;
    const Rm = Math.min(maxX - minX, maxY - minY, maxZ - minZ) / 2;

    // Levels (F-M1, contract A2): bake only levels that can be drawn. Level l is drawable at the largest in-octave
    // scale when its screen pitch PMAX * HEADROOM / 2^l is at least minPitch, the darkest pitch the law can ask for
    // (coverage <= A_DARK) and not below SLACK x the plot floor. So the finest level is floor(log2(...)).
    const minPitch = Math.max(PLOT_FLOOR_SLACK * T.FLOOR, T.INK / K.A_DARK);
    let L = clamp(1 + Math.floor(Math.log2(Math.max(1e-9, (T.PMAX * HEADROOM) / minPitch)) + 1e-9), 1, MAX_LEVELS);
    const estVerts = (lv) => (nFam * area) / ((p0 / 2 ** (lv - 1)) * 1.1) / STEP;
    while (L > 1 && estVerts(L) > K.MAX_VERTICES * 0.95) L -= 1;

    // Region seeds: 3D dart throwing, object mm.
    const REG = Math.max(K.REGION_MIN_MM, Rm * K.REGION_R_FRAC) / scaleRef;
    const regs = [];
    const norm3 = (x, y, z) => { const l = Math.sqrt(x * x + y * y + z * z) || 1; return [x / l, y / l, z / l]; };
    const crossA = (S) => {
      const cx = S.day * S.dbz - S.daz * S.dby; const cy = S.daz * S.dbx - S.dax * S.dbz; const cz = S.dax * S.dby - S.day * S.dbx;
      return Math.sqrt(cx * cx + cy * cy + cz * cz);
    };
    for (let t = 0; t < K.REGION_TRIES && regs.length < K.REGION_MAX; t++) {
      const a = Chart.hash(t * 11 + 5, 23, salt); const b = Chart.hash(t * 11 + 6, 29, salt);
      const S = sample(a, b);
      if (!S) continue;
      if (Chart.hash(t * 11 + 8, 37, salt) * maxCross > crossA(S)) continue;
      let ok = true;
      for (let i = 0; i < regs.length; i++) {
        const g = regs[i];
        const dx = g.x - S.x; const dy = g.y - S.y; const dz = g.z - S.z;
        if (dx * dx + dy * dy + dz * dz < REG * REG) { ok = false; break; }
      }
      if (!ok) continue;
      const ai = Math.floor(wrap01(Chart.hash(t * 11 + 7, 31, salt) + phase) * K.REGION_ANGLES) % K.REGION_ANGLES;
      const th = ((fillAngle + ai * K.REGION_ANGLE_STEP) * Math.PI) / 180;
      let e1 = [S.dax, S.day, S.daz];
      if (Math.sqrt(e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2]) < 1e-6) e1 = [1, 0, 0];
      const dn = e1[0] * S.nx + e1[1] * S.ny + e1[2] * S.nz;
      e1 = norm3(e1[0] - dn * S.nx, e1[1] - dn * S.ny, e1[2] - dn * S.nz);
      const e2 = [S.ny * e1[2] - S.nz * e1[1], S.nz * e1[0] - S.nx * e1[2], S.nx * e1[1] - S.ny * e1[0]];
      const c = Math.cos(th); const s = Math.sin(th);
      const d = [c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]];
      const nd = [S.ny * d[2] - S.nz * d[1], S.nz * d[0] - S.nx * d[2], S.nx * d[1] - S.ny * d[0]];
      const cc = Math.cos((crossDeg * Math.PI) / 180); const cs = Math.sin((crossDeg * Math.PI) / 180);
      const d2 = [cc * d[0] + cs * nd[0], cc * d[1] + cs * nd[1], cc * d[2] + cs * nd[2]];
      regs.push({ x: S.x, y: S.y, z: S.z, d, d2 });
    }
    if (!regs.length) throw new Error('SurfaceLockMezzo.bake: no region seeds');
    const nbr = regs.map((g, i) => {
      const order = regs.map((h, j) => ({ j, d: (h.x - g.x) ** 2 + (h.y - g.y) ** 2 + (h.z - g.z) ** 2 })).filter((o) => o.j !== i);
      order.sort((p, q) => p.d - q.d || p.j - q.j);
      return order.slice(0, K.NEIGHBOURS).map((o) => o.j);
    });
    // A point closer to its region seed than half the distance to the seed's nearest neighbour cannot belong to another
    // region: the walk skips the neighbour search there (exact, not an approximation).
    regs.forEach((g, i) => {
      const j = nbr[i][0];
      g.safe2 = j === undefined ? Infinity : ((regs[j].x - g.x) ** 2 + (regs[j].y - g.y) ** 2 + (regs[j].z - g.z) ** 2) * 0.25;
    });
    const nearestBrute = (x, y, z) => {
      let best = 0; let bd = Infinity;
      for (let i = 0; i < regs.length; i++) {
        const g = regs[i]; const d = (g.x - x) ** 2 + (g.y - y) ** 2 + (g.z - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const nearestFrom = (x, y, z, start) => {
      let cur = start;
      for (let it = 0; it < 64; it++) {
        const g = regs[cur]; let bd = (g.x - x) ** 2 + (g.y - y) ** 2 + (g.z - z) ** 2; let best = cur;
        const list = nbr[cur];
        for (let q = 0; q < list.length; q++) {
          const h = regs[list[q]]; const d = (h.x - x) ** 2 + (h.y - y) ** 2 + (h.z - z) ** 2;
          if (d < bd) { bd = d; best = list[q]; }
        }
        if (best === cur) break;
        cur = best;
      }
      return cur;
    };

    // The field: the region's constant 3D vector projected into the tangent plane, sign-continuous.
    const fieldAt = (S, fam, prev, reg) => {
      const g0 = regs[reg.i];
      if ((g0.x - S.x) ** 2 + (g0.y - S.y) ** 2 + (g0.z - S.z) ** 2 >= g0.safe2) reg.i = nearestFrom(S.x, S.y, S.z, reg.i);
      const D = fam ? regs[reg.i].d2 : regs[reg.i].d;
      const dn = D[0] * S.nx + D[1] * S.ny + D[2] * S.nz;
      let x = D[0] - dn * S.nx; let y = D[1] - dn * S.ny; let z = D[2] - dn * S.nz;
      const l = Math.sqrt(x * x + y * y + z * z);
      if (l < K.FIELD_MIN) return null;
      x /= l; y /= l; z /= l;
      if (prev && x * prev[0] + y * prev[1] + z * prev[2] < 0) { x = -x; y = -y; z = -z; }
      return [x, y, z];
    };

    // Verified chart step of length h along tangent vector v.
    const move = (cur, v, dist) => {
      const S = cur.S;
      const E = S.dax * S.dax + S.day * S.day + S.daz * S.daz;
      const F = S.dax * S.dbx + S.day * S.dby + S.daz * S.dbz;
      const G = S.dbx * S.dbx + S.dby * S.dby + S.dbz * S.dbz;
      const det = E * G - F * F;
      if (!(det > 1e-12 * E * G)) return null;
      let h = dist;
      for (let k = 0; k <= K.STEP_HALVINGS; k++, h /= 2) {
        const r1 = (v[0] * S.dax + v[1] * S.day + v[2] * S.daz) * h;
        const r2 = (v[0] * S.dbx + v[1] * S.dby + v[2] * S.dbz) * h;
        let a2 = cur.a + (G * r1 - F * r2) / det; let b2 = cur.b + (E * r2 - F * r1) / det;
        if (M.periodicA) a2 = wrap01(a2); else if (a2 < 0 || a2 > 1) continue;
        if (M.periodicB) b2 = wrap01(b2); else if (b2 < 0 || b2 > 1) continue;
        const S2 = sample(a2, b2);
        if (!S2) continue;
        const real = Math.sqrt((S2.x - S.x) ** 2 + (S2.y - S.y) ** 2 + (S2.z - S.z) ** 2);
        if (real <= K.STEP_TOL * h && real >= h / K.STEP_TOL) return { a: a2, b: b2, S: S2, dist: real };
      }
      return null;
    };

    // Per-family state.
    const prevPts = [[], []]; // flat x,y,z of vertices of lower levels, per family
    const prevStarts = [[], []]; // index into prevPts (3 per vertex) where each run starts
    const prevRuns = [[], []]; // per emitted run: { chain, sBase, sign, len, open: [start, end], ends: [{a,b,S,dir}, ...] }
    const CHAIN_BASE = 1e6; // occupancy line id of an emitted chain = CHAIN_BASE + chain (new lines of the current level use small ids)
    const chainCtr = [0, 0];
    const prevV = [[], []]; // vertex records { a, b, S } of lower-level runs, aligned with prevPts (seeds for the next level)
    const builder = MS.createBuilder({ bakerId: 'mezzo', key: String(spec.bakeKey || ''), objectId: spec.objectId, meta: {} });
    let totalVerts = 0;
    let bmin = [Infinity, Infinity, Infinity]; let bmax = [-Infinity, -Infinity, -Infinity]; let brad = 0;
    const emitted = [];

    const bitrev = (i) => { let r = 0; let f = 0.5; let n = i; while (n) { if (n & 1) r += f; n >>= 1; f /= 2; } return r; };

    const growLevel = (fam, lv) => {
      const d = p0 / 2 ** lv;
      const stopR = K.STOP_FACTOR * d; const seedR = K.SEED_FACTOR * K.SEED_TIGHT * d;
      // Occupancy: a chained integer hash over cells of one stop radius (a query touches at most 8 cells). Points carry
      // the line they belong to and their signed arc position so a line is not "another line" to itself.
      const cell = K.CELL_F * Math.max(stopR, seedR, 1e-3); const inv = 1 / cell;
      // Dense grid over the (padded) object bounds when it is small enough, else a mixed integer hash.
      const gi0 = Math.floor((minX - 2 * cell) * inv) | 0; const gj0 = Math.floor((minY - 2 * cell) * inv) | 0; const gk0 = Math.floor((minZ - 2 * cell) * inv) | 0;
      const gnx = (Math.floor((maxX + 2 * cell) * inv) | 0) - gi0 + 1; const gny = (Math.floor((maxY + 2 * cell) * inv) | 0) - gj0 + 1;
      const gnz = (Math.floor((maxZ + 2 * cell) * inv) | 0) - gk0 + 1;
      const dense = gnx * gny * gnz <= (1 << 22);
      const TBL = dense ? gnx * gny * gnz : 1 << 17; const MASK = TBL - 1;
      const head = new Int32Array(TBL).fill(-1);
      let cap = 4096; let P = new Float64Array(4 * cap); // x, y, z, arc position per occupancy point (one cache line)
      let nextP = new Int32Array(cap); let lineOf = new Int32Array(cap); let np = 0;
      const bucket = dense
        ? (i, j, k) => {
          const ii = i - gi0; const jj = j - gj0; const kk = k - gk0;
          return (ii < 0 || jj < 0 || kk < 0 || ii >= gnx || jj >= gny || kk >= gnz) ? 0 : ii + gnx * (jj + gny * kk);
        }
        : (i, j, k) => {
          let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791);
          h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
          return h & MASK;
        };
      const addPt = (x, y, z, line, s) => {
        if (np === cap) {
          cap *= 2;
          const g = (A, T) => { const B = new T(cap); B.set(A); return B; };
          const B = new Float64Array(4 * cap); B.set(P); P = B;
          nextP = g(nextP, Int32Array); lineOf = g(lineOf, Int32Array);
        }
        const bk = bucket(Math.floor(x * inv) | 0, Math.floor(y * inv) | 0, Math.floor(z * inv) | 0);
        const o = 4 * np; P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = s; lineOf[np] = line;
        nextP[np] = head[bk]; head[bk] = np; np += 1;
      };
      // F-M2: occupancy points no sparser than half the stop radius, so a streamline cannot slip between two samples
      // of another line. Lower-level runs are stored as vertices with run starts and densified here for this level.
      const occStep = 0.5 * stopR;
      const addSeg = (x0, y0, z0, x1, y1, z1, line, s0, s1) => {
        const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2);
        const n = Math.ceil(len / occStep);
        for (let k = 1; k < n; k++) {
          const f = k / n;
          addPt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, line, s0 + (s1 - s0) * f);
        }
      };
      // True when an interpolated point of the step (x0..x1) is within the stop radius of another line.
      const segBlocked = (x0, y0, z0, x1, y1, z1, line, s0, s1) => {
        const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2);
        const n = Math.ceil(len / occStep);
        for (let k = 1; k < n; k++) {
          const f = k / n;
          if (blocked(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, stopR, line, s0 + (s1 - s0) * f)) return true;
        }
        return false;
      };
      const pp = prevPts[fam]; const ps = prevStarts[fam]; const pr = prevRuns[fam]; const pv = prevV[fam];
      // Lower-level vertices keep their chain id and arc position, so a continuation is not blocked by its own parent.
      for (let i = 0, r = 0, rec = null, sv = 0; i < pp.length; i += 3) {
        const isStart = r < ps.length && ps[r] === i;
        let sPrev = sv;
        if (isStart) { rec = pr[r]; r += 1; sv = rec.sBase; sPrev = sv; } else {
          sv += rec.sign * Math.sqrt((pp[i] - pp[i - 3]) ** 2 + (pp[i + 1] - pp[i - 2]) ** 2 + (pp[i + 2] - pp[i - 1]) ** 2);
        }
        const lid = CHAIN_BASE + rec.chain;
        addPt(pp[i], pp[i + 1], pp[i + 2], lid, sv);
        if (!isStart) addSeg(pp[i - 3], pp[i - 2], pp[i - 1], pp[i], pp[i + 1], pp[i + 2], lid, sPrev, sv);
      }
      const ownSkip = K.OWN_SKIP * d;
      // Dense grid: clamp the cell range once and walk linear indices (the cells outside the padded bounds are empty).
      const blockedDense = (x, y, z, r, line, s) => {
        let i0 = (Math.floor((x - r) * inv) | 0) - gi0; let i1 = (Math.floor((x + r) * inv) | 0) - gi0;
        let j0 = (Math.floor((y - r) * inv) | 0) - gj0; let j1 = (Math.floor((y + r) * inv) | 0) - gj0;
        let k0 = (Math.floor((z - r) * inv) | 0) - gk0; let k1 = (Math.floor((z + r) * inv) | 0) - gk0;
        if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (k0 < 0) k0 = 0;
        if (i1 >= gnx) i1 = gnx - 1; if (j1 >= gny) j1 = gny - 1; if (k1 >= gnz) k1 = gnz - 1;
        const r2 = r * r;
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
          const base = gnx * (j + gny * k);
          for (let i = i0; i <= i1; i++) {
            for (let q = head[base + i]; q >= 0; q = nextP[q]) {
              const o = 4 * q; const dx = P[o] - x; const dy = P[o + 1] - y; const dz = P[o + 2] - z;
              if (dx * dx + dy * dy + dz * dz <= r2 && (lineOf[q] !== line || Math.abs(P[o + 3] - s) > ownSkip)) return true;
            }
          }
        }
        return false;
      };
      const blockedHash = (x, y, z, r, line, s) => {
        const i0 = Math.floor((x - r) * inv) | 0; const j0 = Math.floor((y - r) * inv) | 0; const k0 = Math.floor((z - r) * inv) | 0;
        const i1 = Math.floor((x + r) * inv) | 0; const j1 = Math.floor((y + r) * inv) | 0; const k1 = Math.floor((z + r) * inv) | 0;
        const r2 = r * r;
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          for (let q = head[bucket(i, j, k)]; q >= 0; q = nextP[q]) {
            const o = 4 * q; const dx = P[o] - x; const dy = P[o + 1] - y; const dz = P[o + 2] - z;
            if (dx * dx + dy * dy + dz * dz <= r2 && (lineOf[q] !== line || Math.abs(P[o + 3] - s) > ownSkip)) return true;
          }
        }
        return false;
      };
      const blocked = dense ? blockedDense : blockedHash;
      const lines = []; // each: { v: [vertex records] }
      const stack = [];
      const seedArc = Math.max(d, K.SEED_ARC_STEPS * K.SEED_ARC_TIGHT * STEP);
      let lineId = 0;
      const candN = clamp(Math.ceil((K.FALLBACK_PER_AREA * area) / (d * d)), K.FALLBACK_MIN, K.FALLBACK_MAX);
      let cand = 0;
      const candLim = lv > 0 ? Math.min(candN, K.FALLBACK_SEEDED) : candN;

      // Walk from a vertex along the field until the stop radius, a chart/field end or the vertex budget.
      const walkFrom = (st, prevDir, regI, s0, sgn, line) => {
        const out = [];
        let cur = { a: st.a, b: st.b, S: st.S }; let prev = prevDir; let s = s0;
        const r = { i: regI };
        for (let i = 0; i < K.MAX_STEPS && totalVerts + out.length < K.MAX_VERTICES; i++) {
          const t = fieldAt(cur.S, fam, prev, r);
          if (!t) break;
          // F-M3: a single Euler step. The field is region-constant, so the error is about kappa h^2 / 2.
          const nx = move(cur, t, STEP);
          if (!nx) break;
          const s1 = s;
          s += sgn * nx.dist;
          if (blocked(nx.S.x, nx.S.y, nx.S.z, stopR, line, s)) break;
          if (segBlocked(cur.S.x, cur.S.y, cur.S.z, nx.S.x, nx.S.y, nx.S.z, line, s1, s)) break;
          addSeg(cur.S.x, cur.S.y, cur.S.z, nx.S.x, nx.S.y, nx.S.z, line, s1, s);
          addPt(nx.S.x, nx.S.y, nx.S.z, line, s);
          out.push({ a: nx.a, b: nx.b, S: nx.S, t, s });
          prev = t; cur = nx;
        }
        return out;
      };
      // Drop the occupancy points added since np0 (they were pushed last, so each is the head of its bucket).
      const rollback = (np0) => {
        for (let q = np - 1; q >= np0; q--) {
          const bk = bucket(Math.floor(P[4 * q] * inv) | 0, Math.floor(P[4 * q + 1] * inv) | 0, Math.floor(P[4 * q + 2] * inv) | 0);
          head[bk] = nextP[q];
        }
        np = np0;
      };
      // A seed is a lazy "move d from V along q": the chart step (a sample) is only taken when it is popped, and a
      // cheap 3D pre-test drops the seed first when the target is already inside another line's seed radius.
      const pushSeed = (V, qx, qy, qz) => {
        if (blocked(V.S.x + qx * d, V.S.y + qy * d, V.S.z + qz * d, seedR * 0.97, -2, 0)) return;
        stack.push({ V, q: [qx, qy, qz] });
      };
      // New seeds along an accepted line, both sides, perpendicular in the tangent plane.
      const seedAlong = (verts) => {
        let acc = seedArc;
        for (let i = 0; i < verts.length; i++) {
          if (i) acc += Math.sqrt((verts[i].S.x - verts[i - 1].S.x) ** 2 + (verts[i].S.y - verts[i - 1].S.y) ** 2 + (verts[i].S.z - verts[i - 1].S.z) ** 2);
          if (acc < seedArc) continue;
          acc = 0;
          const V = verts[i]; const n = V.S;
          const qx = n.ny * V.t[2] - n.nz * V.t[1]; const qy = n.nz * V.t[0] - n.nx * V.t[2]; const qz = n.nx * V.t[1] - n.ny * V.t[0];
          for (let side = -1; side <= 1; side += 2) pushSeed(V, qx * side, qy * side, qz * side);
        }
      };

      const tryLine = (st) => {
        if (totalVerts >= K.MAX_VERTICES) return;
        const S = st.S;
        if (blocked(S.x, S.y, S.z, seedR, -2, 0)) return;
        const reg = { i: nearestBrute(S.x, S.y, S.z) };
        const t0 = fieldAt(S, fam, null, reg);
        if (!t0) return;
        const line = lineId++;
        const np0 = np;
        addPt(S.x, S.y, S.z, line, 0);
        const seedV = { a: st.a, b: st.b, S, t: t0, s: 0 };
        const fwd = walkFrom(st, t0, reg.i, 0, 1, line);
        const bwd = walkFrom(st, [-t0[0], -t0[1], -t0[2]], reg.i, 0, -1, line);
        const verts = bwd.reverse().concat([seedV], fwd);
        // Backward vertices carry tangents pointing the walking way; the line direction is only a line.
        if (verts.length < 2) { rollback(np0); return; }
        // Jobard-Lefer minimum line length: a fragment shorter than MIN_LINE_D x d_l is not kept.
        if (verts[verts.length - 1].s - verts[0].s < Math.max(K.MIN_LINE_D * d, K.MIN_LINE_MM / scaleRef)) { rollback(np0); return; }
        totalVerts += verts.length;
        lines.push({ v: verts, chain: chainCtr[fam]++, sBase: verts[0].s, sign: 1, cont: false });
        seedAlong(verts);
      };

      // Continuations (G6): extend each open lower-level line end with this level's smaller stop radius. The run
      // starts AT the parent's end vertex (shared) and belongs to level lv.
      const extendEnds = () => {
        const n0 = pr.length;
        for (let ri = 0; ri < n0; ri++) {
          const rec = pr[ri];
          for (let end = 1; end >= 0; end--) {
            if (!rec.open[end]) continue;
            if (totalVerts >= K.MAX_VERTICES) return;
            const E = rec.ends[end];
            const sOut = end ? rec.sign : -rec.sign;
            const sE = end ? rec.sBase + rec.sign * rec.len : rec.sBase;
            const line = CHAIN_BASE + rec.chain;
            const np0 = np;
            const out = walkFrom(E, E.dir, nearestBrute(E.S.x, E.S.y, E.S.z), sE, sOut, line);
            if (!out.length || Math.abs(out[out.length - 1].s - sE) < K.CONT_MIN_D * d) { rollback(np0); continue; }
            rec.open[end] = false;
            totalVerts += out.length;
            lines.push({ v: [{ a: E.a, b: E.b, S: E.S, t: E.dir, s: sE }].concat(out), chain: rec.chain, sBase: sE, sign: sOut, cont: true });
            seedAlong(out);
          }
        }
      };
      // Seeds beside every lower-level line, one level separation d_l away on both sides: the nested ladder places
      // level l midway between the level l-1 lines, so this fills the gaps systematically instead of by chance.
      const prevArc = Math.max(seedArc, K.PREV_SEED_D * d);
      const seedFromPrev = () => {
        for (let r = 0; r < pr.length; r++) {
          const v0 = ps[r] / 3; const v1 = r + 1 < ps.length ? ps[r + 1] / 3 : pv.length;
          let acc = prevArc;
          for (let q = v0; q < v1; q++) {
            const V = pv[q];
            if (q > v0) acc += Math.sqrt((V.S.x - pv[q - 1].S.x) ** 2 + (V.S.y - pv[q - 1].S.y) ** 2 + (V.S.z - pv[q - 1].S.z) ** 2);
            if (acc < prevArc) continue;
            acc = 0;
            const A = pv[Math.max(v0, q - 1)].S; const B = pv[Math.min(v1 - 1, q + 1)].S;
            const cx = B.x - A.x; const cy = B.y - A.y; const cz = B.z - A.z;
            const n = V.S;
            let qx = n.ny * cz - n.nz * cy; let qy = n.nz * cx - n.nx * cz; let qz = n.nx * cy - n.ny * cx;
            const ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
            if (!(ql > 1e-12)) continue;
            qx /= ql; qy /= ql; qz /= ql;
            for (let side = -1; side <= 1; side += 2) pushSeed(V, qx * side, qy * side, qz * side);
          }
        }
      };
      if (lv > 0) { seedFromPrev(); extendEnds(); }

      for (;;) {
        if (totalVerts >= K.MAX_VERTICES) break;
        if (stack.length) {
          const sd = stack.pop();
          const m = sd.V ? move(sd.V, sd.q, d) : sd;
          if (m) tryLine(m);
          continue;
        }
        if (cand >= candLim) break;
        const c = cand++;
        const a = Chart.hash(c * 13 + 1, 41 + lv * 7 + fam * 3, salt); const b = Chart.hash(c * 13 + 2, 43 + lv * 7 + fam * 3, salt);
        const S = sample(a, b);
        if (!S) continue;
        if (Chart.hash(c * 13 + 3, 47 + lv * 7 + fam * 3, salt) * maxCross > crossA(S)) continue;
        if (blocked(S.x, S.y, S.z, seedR, -2, 0)) continue;
        tryLine({ a, b, S });
      }

      // Rank: greedy farthest-point order of the line midpoints (an even subset at every threshold).
      const n = lines.length;
      const mids = lines.map((ln) => ln.v[ln.v.length >> 1].S);
      const order = new Array(n);
      if (n <= K.RANK_FPO_MAX) {
        const md = new Float64Array(n).fill(Infinity);
        let cur = n ? Math.floor(Chart.hash(lv * 7 + fam, 91, salt) * n) % n : 0;
        for (let k = 0; k < n; k++) {
          order[cur] = k;
          md[cur] = -1;
          const c = mids[cur]; let best = -1; let bd = -1;
          for (let j = 0; j < n; j++) {
            if (md[j] < 0) continue;
            const dd = (mids[j].x - c.x) ** 2 + (mids[j].y - c.y) ** 2 + (mids[j].z - c.z) ** 2;
            if (dd < md[j]) md[j] = dd;
            if (md[j] > bd) { bd = md[j]; best = j; }
          }
          cur = best;
        }
      } else {
        for (let j = 0; j < n; j++) order[j] = Math.round(bitrev(j) * n) % n;
      }
      for (let j = 0; j < n; j++) {
        const ln = lines[j];
        const rank = n ? Math.min(0.999984, order[j] / n) : 0;
        builder.beginRun(lv, rank, fam, 0);
        prevStarts[fam].push(pp.length);
        const nv = ln.v.length;
        const endRec = (q, o) => {
          const A = ln.v[q].S; const B = ln.v[o].S;
          const dx = A.x - B.x; const dy = A.y - B.y; const dz = A.z - B.z; const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          return { a: ln.v[q].a, b: ln.v[q].b, S: A, dir: [dx / l, dy / l, dz / l] };
        };
        const runLen = Math.abs(ln.v[nv - 1].s - ln.v[0].s);
        prevRuns[fam].push({
          chain: ln.chain, sBase: ln.sBase, sign: ln.sign, len: runLen,
          open: [!ln.cont, true], ends: [endRec(0, 1), endRec(nv - 1, nv - 2)],
        });
        for (let q = 0; q < ln.v.length; q++) {
          const S = ln.v[q].S;
          builder.vertex(S.x, S.y, S.z, S.nx, S.ny, S.nz);
          pp.push(S.x, S.y, S.z); pv.push(ln.v[q]);
          if (S.x < bmin[0]) bmin[0] = S.x; if (S.y < bmin[1]) bmin[1] = S.y; if (S.z < bmin[2]) bmin[2] = S.z;
          if (S.x > bmax[0]) bmax[0] = S.x; if (S.y > bmax[1]) bmax[1] = S.y; if (S.z > bmax[2]) bmax[2] = S.z;
          const rr = Math.sqrt(S.x * S.x + S.y * S.y + S.z * S.z); if (rr > brad) brad = rr;
        }
        builder.endRun();
      }
      emitted.push({ fam, lv, lines: n });
    };

    for (let fam = 0; fam < nFam; fam++) for (let lv = 0; lv < L; lv++) growLevel(fam, lv);

    const ms = builder.finish();
    ms.meta = {
      p0, gain: K.GAIN, toneModel: 'pitch', scaleRef,
      minMarkMM: K.MIN_MARK_PEN * T.PEN,
      // Contract §5 (O1): the pose mezzo's own legal dark limit, INK / A_DARK in pen widths, replaces the plot floor.
      minSepFrac: K.STOP_FACTOR,
      floorPitchPen: (T.INK / K.A_DARK) / T.PEN,
      bounds: { min: bmin, max: bmax, radius: brad },
      convex: CONVEX.has(spec.primitive),
      msBake: clock() - t0,
      // Baker-private data lives only under meta.debug (contract A5).
      debug: {
        regions: regs.map((g) => ({ p: [g.x, g.y, g.z], d: g.d.slice(), d2: g.d2.slice() })),
        regionSep: REG,
        levelRuns: emitted,
      },
    };
    return ms;
  };

  Scene3D.SurfaceLockMezzo = {
    id: 'mezzo',
    FIT,
    REFUSED,
    supports,
    bake,
    toneLUT,
  };
})();
