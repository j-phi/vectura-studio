/**
 * Scene3D.SurfaceLockWebs — the surface-locked baker for WEB laws (docs/surface-lock-contract.md §9, A32): fills whose marks are the
 * walls of a connected network rather than parallel rulings. Today one law: mazeFill.
 *
 *   FIT, supports(spec) -> boolean, bake(spec) -> MarkSet, toneLUT(spec, toneCtx) -> { lut, scaleFn: null }
 *
 * mazeFill is a DRAG-PREVIEW-ONLY law (FIT row `v2Only` + `dragPreviewOnly`, like A28 / A29): while a 3D drag / orbit is in progress the frame
 * is this bake; settled and export output is the pose compose, byte for byte. The pose law carves a randomised spanning tree on a screen grid
 * whose cell size is the tone (finer in the shadow) and draws the walls. That is not a keyed subset (a finer grid is a different maze), so
 * the bake is its EXACT keyed-subset cousin, a recursive-division maze in the object's chart (a, b):
 *
 *   - the chart is cut into na x nb ROOT chambers of about p0 (the coarsest cell the tone ever asks for); every chamber of level l is
 *     divided by a cross into four chambers of level l + 1, down to the finest level K (the plot-floor cell);
 *   - the perfect-maze rule: of the four half-walls of a cross, exactly one is closed and three carry a single gap, so the four
 *     children are connected by a spanning tree; the root chambers are joined by a random spanning tree the same way;
 *   - one cell edge is the unit of a wall: the gap of a half-wall is ONE cell edge of the finest level drawn, so a half-wall is stored as
 *     the nested chain of pieces that appear as the finer levels do. The piece of level k is keyed by the finer of the two chambers
 *     it separates (rank = min of the two chamber ranks), so a gap never spans two cells of a finer neighbour (no loop is ever drawn);
 *   - a mark of level k (k >= 1) has key 2^(k-1) (1 + rank), exactly the ladder's gain-2 key. Any tone threshold t = p0 / cell(I) therefore
 *     draws a perfect maze whose chambers are divided down to cell size ~ p0 / t, a random subset of the next level included, so the
 *     cell size follows the light continuously with no rebake. The LUT is 1 / cell(I) of the pose law's own cell size.
 *   - chambers whose physical shape is too thin or too wide (sphere poles, a torus's inner equator) drop the wall across their short
 *     side: rings or meridian lanes instead of a squeezed lattice.
 * The bake is POSE-FREE (contract §3, §8): geometry, style, pen, scaleRef and seed only.
 */
(function registerScene3DSurfaceLockWebs() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Live values come from Vectura.SCENE3D_SURFACE_LOCK.LAWS (MAZE_*); the table is the safe fallback.
  const DEFAULTS = {
    INK_SPREAD: 0.12,        // surface-fill INK_SPREAD (private there)
    A_DARK: 0.90,            // makeCtx dark end of the tone map
    PLOT_FLOOR_PEN: 2.2,     // Regions.PLOT_FLOOR_PEN fallback
    LIT_MAX_PITCH_PEN: 12,   // Regions.LIT_MAX_PITCH_PEN fallback
    V2_PAPER_BAND: 0.18,     // the lightest share of the tone range that rolls off to paper (laws' own)
    MAZE_PAPER_DENS: 0.03,   // pose maze: the relative density at and below which nothing is drawn (surface-fill-mono V2_PAPER_DENS)
    MAZE_PITCH_X: 0.6,       // pose maze: cell = max(floor, MAZE_PITCH_X x pitchOfDens) x MAZE_CELL_X
    MAZE_CELL_X: 1.05,
    MAZE_V2_PITCH_X: 2,      // pose v2: the sparse end runs to this x the legacy lit pitch (surface-fill-mono V2_PITCH_X)
    MAZE_OFF_DENS: 0.5,      // tone OFF: the uniform maze of this relative density
    MAZE_LEVEL_MAX: 5,       // finest level (the MarkSet carries levels 0..5)
    MAZE_THIN: 0.6,          // a chamber whose physical width / height is under this (or over its inverse) drops its wall across the short side
    MAZE_STEP_MM: 1.2,       // longest polyline segment of a wall (screen mm at the bake scale)
    MAZE_FLOOR_PEN: 0.7,     // meta.floorPitchPen: the frame's plot-floor cap, in pens
    MAZE_INK_X: 1,           // LUT calibration: 1 / cell x this (the maze's ink is ~ pen / cell at any tone)
    MAZE_KNEE_N: 4,          // the pose cell is max(floor, 0.6 x pitch); the lock takes the smooth maximum (p^n + floor^n)^(1/n), so the dark end keeps grading
    MAZE_FINE: 1.1,          // the finest baked cell is the floor cell / this (the lock walls are shorter than the pose's per cell: the pose ink at the dark end)
    MAZE_MAX_VERTS: 150000,  // finest level is lowered until the estimate fits
    MAZE_SURVEY: 25,         // chart survey grid
    MAZE_RANK_JITTER: 0.3,   // random share of a chamber rank (the rest is a low-discrepancy lattice)
    MAZE_ROOT_MAX: 6000,     // most root chambers
    MAZE_RUN: 4,             // longest straight wall, in cells of the tone it is drawn at: a longer wall is drawn as runs of this many cells with a one-cell gap
    MAZE_RING_OPEN: 0.2,     // chambers on the thin side of the chart (poles, torus inner equator): the share of the ring / lane walls that keep their one gap (the rest are closed rings)
  };
  const K = Object.assign({}, DEFAULTS);

  const MAZE_LAWS = ['mazeFill'];
  const FIT_MAPPERS = ['hatch', 'crosshatch'];
  const FIT_PRIMITIVES = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus'];
  const PRIM_MODE = { sphere: 'sphere', ellipsoid: 'sphere', cylinder: 'cylinder', cone: 'cone', capsule: 'capsule', torus: 'torus' };
  const CONVEX_MODES = { sphere: true, cylinder: true, cone: true, capsule: true };
  // v2 only (contract A32, amended: no longer drag-preview only): the bake is the drag frame AND the settled / export frame (Level S at rest).
  const FIT = Object.freeze([Object.freeze({
    v2Only: true,
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(MAZE_LAWS.slice()),
    primitives: Object.freeze(FIT_PRIMITIVES.slice()),
    refuse: Object.freeze({ tripleHatch: Object.freeze([true]) }),
  })]);

  const finite = (v, d) => (Number.isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const frac = (v) => v - Math.floor(v);
  const cfg = () => Vectura.SCENE3D_SURFACE_LOCK || {};
  const sync = () => {
    const own = cfg().LAWS || {};
    Object.keys(DEFAULTS).forEach((k) => { K[k] = Number.isFinite(own[k]) ? own[k] : DEFAULTS[k]; });
  };
  const regions = () => Scene3D.Regions || {};
  const MS = () => Scene3D.SurfaceLockMarkSet;
  const CH = () => Scene3D.SurfaceLockChart;

  // ---- tone: copies of the laws' pure maths (surface-lock-laws toneParams / targetOf, v2) ------------------------------------------
  const v2FloorPen = () => { const v = cfg().V2 && cfg().V2.FLOOR_PEN; return Number.isFinite(v) && v > 1 ? v : 1.4; };
  const toneParams = (spec) => {
    const R = regions();
    const PEN = Math.max(0.02, finite(spec && spec.penWidth, 0.3));
    const INK = PEN * (1 + K.INK_SPREAD);
    const FLOOR = v2FloorPen() * PEN;
    const litMax = (Number.isFinite(R.LIT_MAX_PITCH_PEN) ? R.LIT_MAX_PITCH_PEN : K.LIT_MAX_PITCH_PEN) * PEN;
    const DS = clamp(finite(spec && spec.style && spec.style.densityScale, 1), 0.25, 4);
    const PMAX0 = Math.max(FLOOR * 1.6, litMax);
    const PMAX = Math.max(FLOOR * 1.6, litMax / DS);
    const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
    const invL = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
    const A_LIGHT = clamp(INK / PMAX0, 0.02, 0.5);
    const L_LIGHT = Lstar(1 - A_LIGHT); const L_DARK = Lstar(1 - K.A_DARK);
    const areaFor = (I) => clamp(1 - invL(L_DARK + (L_LIGHT - L_DARK) * clamp(finite(I, 0), 0, 1)), 0.02, K.A_DARK);
    return { PEN, INK, FLOOR, DS, PMAX, areaFor };
  };
  // relative density: the law's own L*-linear span mapped to [0, 1], no lit floor, a short roll-off to paper
  const targetOf = (T) => {
    const aL = T.areaFor(1); const aD = T.areaFor(0);
    const band = Math.max(1e-3, K.V2_PAPER_BAND);
    return (I) => {
      const x = clamp(finite(I, 0), 0, 1);
      const d = clamp((T.areaFor(x) - aL) / Math.max(1e-6, aD - aL), 0, 1);
      const u = clamp((1 - x) / band, 0, 1);
      return d * u * u * (3 - 2 * u);
    };
  };
  // The pose maze's cell (screen mm) at a relative density, without the limb wrap: max(floor, 0.6 x pitchOfDens) x 1.05.
  const cellModel = (spec) => {
    const T = toneParams(spec);
    const areaMax = clamp((T.INK / (T.FLOOR * 1.05)) * T.DS, 0.02, K.A_DARK);
    const pmaxV = T.PMAX * K.MAZE_V2_PITCH_X;
    const pitchOfDens = (d) => clamp(T.INK / Math.max(1e-6, clamp(areaMax * d, 0, K.A_DARK)), T.INK / K.A_DARK, pmaxV);
    const cellPose = (d) => Math.max(T.FLOOR, K.MAZE_PITCH_X * pitchOfDens(d)) * K.MAZE_CELL_X;
    const nk = Math.max(1, K.MAZE_KNEE_N);
    const cell = (d) => { const cp = K.MAZE_PITCH_X * pitchOfDens(d) * K.MAZE_CELL_X; const cf = T.FLOOR * K.MAZE_CELL_X; return Math.pow(Math.pow(cp, nk) + Math.pow(cf, nk), 1 / nk); };
    return { T, cell, cmin: T.FLOOR * K.MAZE_CELL_X / K.MAZE_FINE, cmax: cellPose(K.MAZE_PAPER_DENS + 1e-6) };
  };

  const toneIsOff = (toneCtx) => !!toneCtx && ((toneCtx.tone && toneCtx.tone.enabled === false)
    || (toneCtx.light && Array.isArray(toneCtx.light.lights) && toneCtx.light.lights.length === 0));
  const toneLUT = (spec, toneCtx) => {
    sync();
    const { T, cell } = cellModel(spec);
    const size = cfg().TONE_LUT_SIZE || 256;
    const lut = new Float32Array(size + 1);
    const D = targetOf(T);
    const off = toneIsOff(toneCtx);
    const offVal = K.MAZE_INK_X / cell(K.MAZE_OFF_DENS);
    for (let k = 0; k <= size; k++) {
      const d = D(k / size);
      lut[k] = off ? offVal : (d > K.MAZE_PAPER_DENS ? K.MAZE_INK_X / cell(d) : 0);
    }
    return { lut, scaleFn: null };
  };

  // ---- supports ------------------------------------------------------------------------------------------------
  const primitiveOf = (spec) => (spec && typeof spec.primitive === 'string' && spec.primitive ? spec.primitive : (spec && spec.mode) || '');
  const supports = (spec) => {
    if (!spec || typeof spec !== 'object') return false;
    const prim = primitiveOf(spec);
    const style = spec.style || {};
    return FIT.some((row) => row.laws.indexOf(spec.toneLaw) !== -1
      && (!row.v2Only || spec.toneModel === 'v2')
      && row.mappers.indexOf(spec.mapper) !== -1
      && row.primitives.indexOf(prim) !== -1
      && (spec.mode === undefined || spec.mode === PRIM_MODE[prim])
      && !Object.keys(row.refuse).some((k) => row.refuse[k].indexOf(style[k]) !== -1));
  };

  const median = (arr) => {
    if (!arr.length) return 0;
    const s = Float64Array.from(arr).sort();
    return s[s.length >> 1];
  };

  // ---- the bake ----------------------------------------------------------------------------------------------
  const bakeCore = (spec, opts) => {
    sync();
    if (!supports(spec)) throw new Error(`SurfaceLockWebs.bake: unsupported spec (law ${spec && spec.toneLaw})`);
    const SM = MS(); const SC = CH();
    const prim = primitiveOf(spec);
    const mode = spec.mode || PRIM_MODE[prim];
    const sc = spec.scale || {};
    const scale = { sx: finite(sc.sx, 1), sy: finite(sc.sy, 1), sz: finite(sc.sz, 1) };
    const scaleRef = finite(spec.scaleRef, 1) > 0 ? spec.scaleRef : 1;
    const seed = (spec.seed && typeof spec.seed === 'object') ? spec.seed : {};
    const salt = finite(seed.salt, 0) | 0;
    const M = SC.metric(mode, spec.sizes || {}, scale);
    const builder = SM.createBuilder({ bakerId: 'webs', key: String(spec.key || ''), objectId: String(spec.objectId || '') });
    const emptyMeta = { p0: 1, gain: 2, toneModel: 'pitch', scaleRef, minMarkMM: 0, lawId: 'mazeFill', bounds: { min: [0, 0, 0], max: [0, 0, 0], radius: 0 }, convex: false };
    if (!M) { const e0 = builder.finish(); e0.bakerId = 'webs'; e0.meta = emptyMeta; return e0; }

    const { cmin, cmax } = cellModel(spec);
    const Lc = clamp(Math.ceil(Math.log2(Math.max(1.0001, cmax / cmin)) - 1e-9), 1, Math.min(K.MAZE_LEVEL_MAX, (cfg().MAX_LEVELS || 6) - 1));
    const p0S = cmin * Math.pow(2, Lc);       // the coarsest cell, screen mm at the bake scale
    const p0 = p0S / scaleRef;                // ... in scaled local mm

    // chart survey: physical mm per chart unit along a and b, on a grid (the chamber shape test and the root counts read it)
    const G = Math.max(5, Math.round(K.MAZE_SURVEY));
    const WA = new Float32Array(G * G); const WB = new Float32Array(G * G);
    const la = []; const lb = []; let area = 0; let cnt = 0;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const s = M.sample((i + 0.5) / G, (j + 0.5) / G);
        let A = 0; let B = 0;
        if (s) {
          A = Math.hypot(s.dax, s.day, s.daz); B = Math.hypot(s.dbx, s.dby, s.dbz);
          if (A > 1e-9 && B > 1e-9) {
            const cx = s.day * s.dbz - s.daz * s.dby; const cy = s.daz * s.dbx - s.dax * s.dbz; const cz = s.dax * s.dby - s.day * s.dbx;
            area += Math.hypot(cx, cy, cz); cnt += 1; la.push(A); lb.push(B);
          } else { A = 0; B = 0; }
        }
        WA[i * G + j] = A; WB[i * G + j] = B;
      }
    }
    const medA = median(la); const medB = median(lb);
    const surfaceArea = cnt ? area / cnt : 0;
    if (!(medA > 1e-9) || !(medB > 1e-9) || !(surfaceArea > 0)) { const e1 = builder.finish(); e1.bakerId = 'webs'; e1.meta = emptyMeta; return e1; }

    let na = Math.max(1, Math.round(medA / p0)); let nb = Math.max(1, Math.round(medB / p0));
    while (na * nb > K.MAZE_ROOT_MAX) { na = Math.max(1, Math.round(na * 0.8)); nb = Math.max(1, Math.round(nb * 0.8)); if (na === 1 && nb === 1) break; }
    // finest level: lowered until the vertex estimate (about two vertices per cell) fits the budget
    let Kf = Lc;
    const estVerts = (k) => 2.4 * surfaceArea / Math.pow(p0 / Math.pow(2, k), 2);
    while (Kf > 1 && estVerts(Kf) > K.MAZE_MAX_VERTS) Kf -= 1;
    const UA = na * Math.pow(2, Kf); const UB = nb * Math.pow(2, Kf); // chart extent in finest-cell units
    const S = (l) => Math.pow(2, Kf - l);                              // chamber side of level l, in units
    const NA = (l) => na * Math.pow(2, l); const NB = (l) => nb * Math.pow(2, l);
    const periodicA = !!M.periodicA; const periodicB = !!M.periodicB;

    // ---- chamber ranks, hashes, shape ------------------------------------------------------------------------
    const R2A = 0.7548776662466927; const R2B = 0.5698402909980532;
    const rankOf = (l, i, j) => {
      const ii = ((i % NA(l)) + NA(l)) % NA(l); const jj = ((j % NB(l)) + NB(l)) % NB(l);
      const h = SC.hash(ii, jj, salt + 977 * (l + 1));
      const r = frac(0.5 + ii * R2A + jj * R2B + 0.3183098861837907 * l + K.MAZE_RANK_JITTER * (h - 0.5));
      return Math.min(0.99998, Math.max(0, r));
    };
    // Pointwise shape of the chart at a lattice point: width / height of a cell there. A vertical wall (constant a) is dropped where the
    // cell is too thin across a (a pole, a torus's inner equator), a horizontal one where it is too wide: rings / lanes instead of a fan.
    const ratioAt = (x, y) => {
      const q = Math.floor(clamp(x / UA, 0, 0.9999) * G) * G + Math.floor(clamp(y / UB, 0, 0.9999) * G);
      const w = WA[q] / UA; const h = WB[q] / UB;
      return w > 0 && h > 0 ? w / h : 1;
    };

    // ---- vertex sampling on the finest lattice (cached) ----------------------------------------------------
    const bmin = [Infinity, Infinity, Infinity]; const bmax = [-Infinity, -Infinity, -Infinity]; let rmax2 = 0;
    const cache = new Map();
    const stepObj = K.MAZE_STEP_MM / scaleRef;
    const sampleAt = (x, y) => M.sample(clamp(x / UA, 0, 1), clamp(y / UB, 0, 1));
    const latticeSample = (x, y) => {
      const key = x * (UB + 1) + y;
      let s = cache.get(key);
      if (s === undefined) { s = sampleAt(x, y); cache.set(key, s); }
      return s;
    };
    let pieces = 0;
    const emitPiece = (level, rank, x0, y0, x1, y1, bLo, bHi, dash) => {
      const rt = ratioAt((x0 + x1) / 2, (y0 + y1) / 2);
      if (!(opts && opts.noThin) && (x0 === x1 ? rt < K.MAZE_THIN : rt > 1 / K.MAZE_THIN)) return;
      if (opts && opts.collect) opts.collect.push({ level, rank, x0, y0, x1, y1, band: bLo !== undefined, dash: dash === true });
      const p = latticeSample(x0, y0); const q = latticeSample(x1, y1);
      if (!p || !q) return;
      const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (!(len > 1e-4)) return;
      const n = Math.max(1, Math.ceil(len / stepObj));
      if (bLo === undefined) builder.beginRun(level, rank, 0, 0); else builder.beginRun(level, rank, 0, 0, undefined, 0, 0, bLo, bHi);
      for (let u = 0; u <= n; u++) {
        const s = u === 0 ? p : (u === n ? q : sampleAt(x0 + (x1 - x0) * u / n, y0 + (y1 - y0) * u / n));
        if (!s) continue;
        builder.vertex(s.x, s.y, s.z, s.nx, s.ny, s.nz);
        if (s.x < bmin[0]) bmin[0] = s.x; if (s.x > bmax[0]) bmax[0] = s.x;
        if (s.y < bmin[1]) bmin[1] = s.y; if (s.y > bmax[1]) bmax[1] = s.y;
        if (s.z < bmin[2]) bmin[2] = s.z; if (s.z > bmax[2]) bmax[2] = s.z;
        { const r2 = s.x * s.x + s.y * s.y + s.z * s.z; if (r2 > rmax2) rmax2 = r2; }
      }
      builder.endRun();
      pieces += 1;
    };

    // A wall of side S(lvSlot) on the line `fixed`, starting at `start`. o 'h': y = fixed, x runs; o 'v': x = fixed, y runs. Closed: one piece
    // keyed (closedLevel, closedRank). Open: the nested chain of gap pieces (one per finer level), each keyed by the finer of the two chambers
    // it separates at the level above.
    const bitOf = (id, k) => SC.hash(id | 0, k * 131 + 7, salt + 4099) < 0.5 ? 0 : 1;
    // Long straight walls. A wall of slot level l is 2^(m - l) cells long at the tone level m. Past MAZE_RUN cells it is drawn as runs of MAZE_RUN
    // cells with a one-cell gap instead (a few extra doors: the maze is perfect up to that tone and braided past it). Ink is monotone in the key
    // but a gap is not, so the broken copies are tone BANDS (runBand, A28): the whole wall up to level mB - 1 in the band t < 2^(mB - 1), then one
    // dashed copy per finer level m in the band t in [2^(m - 1), 2^m).
    const lutT = toneLUT(spec, null).lut; const lutN = lutT.length - 1;
    const p0Screen = cmin * Math.pow(2, Lc);
    const iCross = (T) => { // the I at which the tone threshold t = lut(I) x p0 falls to T (t falls as I rises)
      for (let q = 0; q <= lutN; q++) if (lutT[q] * p0Screen < T) return clamp((q - 0.5) / lutN, 0, 1);
      return 1;
    };
    const runCells = Math.max(1, Math.round(K.MAZE_RUN));
    const firstBroken = Math.floor(Math.log2(runCells)) + 1; // levels below a slot at which the wall first exceeds runCells
    const noBreak = !!(opts && opts.noBreak);
    const bandCache = new Map();
    const bandOf = (m) => { let v = bandCache.get(m); if (v === undefined) { v = iCross(Math.pow(2, m)); bandCache.set(m, v); } return v; };
    const wall = (o, fixed, start, lvSlot, closed, closedRank, id) => {
      const len = S(lvSlot);
      const at = (s0, w) => (o === 'h' ? [start + s0, fixed, start + s0 + w, fixed] : [fixed, start + s0, fixed, start + s0 + w]);
      // a wall on the thin side of the chart (a ring at a pole, a lane on a torus's inner equator) is a ring: closed, with a few gaps
      let ring = false;
      { const c = at(len / 2, 0); const rt = ratioAt(c[0], c[1]); ring = o === 'h' ? rt < K.MAZE_THIN : rt > 1 / K.MAZE_THIN; }
      if (ring && !closed && !(opts && opts.noThin) && SC.hash(id | 0, 17, salt + 733) >= K.MAZE_RING_OPEN) closed = true;
      // a ring is keyed as ONE mark per line and level: it appears whole at one tone, not as scattered arcs
      const ringRank = SC.hash(o === 'h' ? 1 : 2, fixed * 131 + lvSlot, salt + 89) * 0.999;
      if (ring) closedRank = ringRank;
      const mB = lvSlot + firstBroken;
      const broken = !noBreak && !ring && mB <= Kf;
      const uLo = broken ? bandOf(mB - 1) : undefined; // the whole wall draws where t < 2^(mB - 1), i.e. I >= iCross(2^(mB - 1))
      if (closed) {
        const c = at(0, len);
        if (broken) emitPiece(lvSlot, closedRank, c[0], c[1], c[2], c[3], uLo, 1);
        else emitPiece(lvSlot, closedRank, c[0], c[1], c[2], c[3]);
      }
      let pos = 0;
      const gapPos = [lvSlot === Kf ? 0 : -1]; // gapPos[m - lvSlot]: the real gap cell of an open wall at level m
      if (!closed) {
        for (let k = lvSlot + 1; k <= Kf; k++) {
          const bit = bitOf(id, k);
          const sk = S(k); const sp = S(k - 1);
          const sib = 2 * pos + (1 - bit);
          // chambers of level k - 1 on the two sides of the slot of level k - 1
          const s0 = start + pos * sp;
          let rA; let rB;
          if (o === 'h') { const ci = Math.floor(s0 / sp); const cj = fixed / sp; rA = rankOf(k - 1, ci, cj - 1); rB = rankOf(k - 1, ci, cj); }
          else { const cj = Math.floor(s0 / sp); const ci = fixed / sp; rA = rankOf(k - 1, ci - 1, cj); rB = rankOf(k - 1, ci, cj); }
          const piece = o === 'h' ? [start + sib * sk, fixed, start + (sib + 1) * sk, fixed] : [fixed, start + sib * sk, fixed, start + (sib + 1) * sk];
          pos = 2 * pos + bit; gapPos[k - lvSlot] = pos;
          if (broken && k >= mB) continue;
          if (broken) emitPiece(k, ring ? ringRank : Math.min(rA, rB), piece[0], piece[1], piece[2], piece[3], uLo, 1);
          else emitPiece(k, ring ? ringRank : Math.min(rA, rB), piece[0], piece[1], piece[2], piece[3]);
        }
      }
      if (!broken) return;
      // the dashed copies: runs of runCells cells (of the level m) with a one-cell gap, and the wall's real gap
      const period = runCells + 1;
      for (let m = mB; m <= Kf; m++) {
        const n = Math.pow(2, m - lvSlot); const sm = S(m);
        const off = Math.floor(SC.hash(id | 0, m * 31 + 3, salt + 5003) * period);
        const real = closed ? -1 : gapPos[m - lvSlot];
        const lo = m === Kf ? 0 : bandOf(m); const hi = bandOf(m - 1);
        if (!(hi > lo)) continue;
        let c = 0;
        while (c < n) {
          const isGap = (q) => q === real || (q + off) % period === 0;
          while (c < n && isGap(c)) c += 1;
          const c0 = c;
          while (c < n && !isGap(c)) c += 1;
          if (c > c0) {
            const w = at(c0 * sm, (c - c0) * sm);
            emitPiece(Math.max(0, m - 1), 0, w[0], w[1], w[2], w[3], lo, hi, true);
          }
        }
      }
    };

    // ---- the root chambers: a random spanning tree; every other root edge is a full wall -------------------------------
    const roots = na * nb; const parent = new Int32Array(roots);
    for (let q = 0; q < roots; q++) parent[q] = q;
    const find = (q) => { while (parent[q] !== q) { parent[q] = parent[parent[q]]; q = parent[q]; } return q; };
    const edges = [];
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        if (i + 1 < na) edges.push({ o: 'v', i, j, i2: i + 1, j2: j, x: (i + 1) * S(0), y: j * S(0) });
        else if (periodicA && na > 1) edges.push({ o: 'v', i, j, i2: 0, j2: j, x: 0, y: j * S(0) });
        if (j + 1 < nb) edges.push({ o: 'h', i, j, i2: i, j2: j + 1, x: i * S(0), y: (j + 1) * S(0) });
        else if (periodicB && nb > 1) edges.push({ o: 'h', i, j, i2: i, j2: 0, x: i * S(0), y: 0 });
      }
    }
    edges.forEach((e, q) => { e.w = SC.hash(q, e.i * 3 + e.j * 7, salt + 313); });
    edges.slice().sort((a, b) => a.w - b.w).forEach((e) => {
      const a = find(e.j * na + e.i); const b = find(e.j2 * na + e.i2);
      if (a !== b) { parent[a] = b; e.open = true; }
    });
    edges.forEach((e, q) => {
      if (e.o === 'v') wall('v', e.x, e.y, 0, !e.open, SC.hash(q, 5, salt + 61) * 0.999, q * 5 + 1);
      else wall('h', e.y, e.x, 0, !e.open, SC.hash(q, 5, salt + 61) * 0.999, q * 5 + 1);
    });

    // ---- the crosses of every chamber, depth first ----------------------------------------------------------------
    const divide = (l, i, j) => {
      if (l >= Kf) return;
      const sl = S(l); const half = sl / 2;
      const x0 = i * sl; const y0 = j * sl; const xc = x0 + half; const yc = y0 + half;
      const rk = rankOf(l, i, j);
      const closedSide = Math.min(3, Math.floor(SC.hash(i * 5 + l, j, salt + 211 + l * 17) * 4));
      const id = (((l * 7919 + i) * 104729 + j) * 8) + 11;
      // 0 L, 1 R (y = yc), 2 B, 3 T (x = xc)
      wall('h', yc, x0, l + 1, closedSide === 0, rk, id + 0);
      wall('h', yc, xc, l + 1, closedSide === 1, rk, id + 1);
      wall('v', xc, y0, l + 1, closedSide === 2, rk, id + 2);
      wall('v', xc, yc, l + 1, closedSide === 3, rk, id + 3);
      divide(l + 1, 2 * i, 2 * j); divide(l + 1, 2 * i + 1, 2 * j); divide(l + 1, 2 * i, 2 * j + 1); divide(l + 1, 2 * i + 1, 2 * j + 1);
    };
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) divide(0, i, j);

    const ms = builder.finish();
    ms.bakerId = 'webs';
    const has = ms.vertexCount > 0;
    if (ms.vertexCount > 200000) throw new Error('SurfaceLockWebs.bake: vertex budget exceeded');
    if (opts && opts.info) Object.assign(opts.info, { Kf, na, nb, UA, UB, periodicA, periodicB });
    ms.meta = {
      p0, gain: 2, toneModel: 'pitch', scaleRef, minMarkMM: 0, lawId: 'mazeFill',
      noFacingComp: true,
      floorPitchPen: K.MAZE_FLOOR_PEN, // the frame's plot-floor cap is a ruling-pitch rule; a maze wall may sit this close (x pen) before the cap bites
      mazeLevels: Kf, mazeRoots: [na, nb], mazePieces: pieces, mazeP0MM: p0S,
      bounds: has ? { min: bmin.slice(), max: bmax.slice(), radius: Math.sqrt(rmax2) } : { min: [0, 0, 0], max: [0, 0, 0], radius: 0 },
      convex: typeof spec.convex === 'boolean' ? spec.convex : Boolean(CONVEX_MODES[mode]),
    };
    return ms;
  };

  const bake = (spec) => bakeCore(spec, null);
  // Test hook: the lattice pieces { level, rank, x0, y0, x1, y1 } of a bake (finest-cell units) and its geometry; `noThin` keeps every wall and closes no ring, `noBreak` keeps every wall whole (the perfect-maze skeleton); both default on.
  const debugLattice = (spec, opts) => { const pieces = []; const info = {}; bakeCore(spec, { collect: pieces, info, noThin: !opts || opts.noThin !== false, noBreak: !opts || opts.noBreak !== false }); return { pieces, info }; };

  Scene3D.SurfaceLockWebs = { id: 'webs', FIT, supports, bake, toneLUT, debug: { lattice: debugLattice } };
})();
