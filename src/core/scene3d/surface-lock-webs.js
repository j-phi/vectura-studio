/**
 * Scene3D.SurfaceLockWebs — the surface-locked baker for WEB laws (docs/surface-lock-contract.md §9, A32): fills whose marks are the
 * walls of a connected network rather than parallel rulings. Two laws: mazeFill (A32) and voronoiWeb (A33, bottom of this file).
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
    VORONOI_PAPER_BAND: 0.15,   // pose voronoi: the lightest share of the tone range that rolls off to paper (surface-fill-mono V2_PAPER_BAND)
    VORONOI_PAPER_DENS: 0.03,   // pose voronoi: relative density at and below which nothing is drawn (V2_PAPER_DENS)
    VORONOI_PITCH_X: 2,         // pose voronoi: the v2 sparse end runs to this x the legacy lit pitch (V2_PITCH_X)
    VORONOI_CELL_MIN_PEN: 3.25, // pose voronoi CELL_MIN, in pens
    VORONOI_CELL_R: 0.14,       // pose voronoi CELL_MAX = min(R x this, PMAX x VORONOI_CELL_PITCH)
    VORONOI_CELL_PITCH: 1.25,
    VORONOI_WEB_K: 0.76,        // pose voronoi v2: the relaxed seed set packs ~0.76 of the hexagonal-identity ink
    VORONOI_LEVEL_RATIO: 1.5,   // cell size ratio of successive levels (one level per tone band)
    VORONOI_GRID_DIV: 3,        // label grid spacing = cell / this
    VORONOI_RELAX: 2,           // damped Lloyd passes per level
    VORONOI_RELAX_STRIDE: 2,    // the Lloyd passes label every this-th grid node (the last pass is full)
    VORONOI_RELAX_K: 0.45,      // Lloyd step (pose: 0.45)
    VORONOI_TRIES: 8,           // dart throws per expected seed
    VORONOI_SEP: 1,             // minimum seed separation, x the level's cell size
    VORONOI_SIMPLIFY: 0.05,     // wall simplification tolerance (screen mm at the bake scale)
    VORONOI_STEP_MM: 1.2,       // longest polyline segment of a wall (screen mm)
    VORONOI_FLOOR_PEN: 0.7,     // meta.floorPitchPen (see MAZE_FLOOR_PEN)
    VORONOI_MAX_VERTS: 150000,  // finest levels are dropped until the estimate fits
    VORONOI_MAX_NODES: 1200000, // most label grid nodes per level (the grid is coarsened to fit)
    VORONOI_THIN_RANK: 0.5,     // chain ranks run over [0, this): the facing / paper thinning only starts where the tone demand falls under it (webs tear into fragments if thinned from 1)
    VORONOI_INK_X: 1.45,         // wall length calibration: cell sizes x this
  };
  const K = Object.assign({}, DEFAULTS);

  const MAZE_LAWS = ['mazeFill'];
  const VORONOI_LAWS = ['voronoiWeb'];
  const FIT_MAPPERS = ['hatch', 'crosshatch'];
  const FIT_PRIMITIVES = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus'];
  const PRIM_MODE = { sphere: 'sphere', ellipsoid: 'sphere', cylinder: 'cylinder', cone: 'cone', capsule: 'capsule', torus: 'torus' };
  const CONVEX_MODES = { sphere: true, cylinder: true, cone: true, capsule: true };
  // v2 only AND drag preview only (contract A32): `supports` needs spec.dragPreview === true (set from bounds.dragPreview).
  const FIT = Object.freeze([Object.freeze({
    v2Only: true,
    dragPreviewOnly: true,
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(MAZE_LAWS.slice()),
    primitives: Object.freeze(FIT_PRIMITIVES.slice()),
    refuse: Object.freeze({ tripleHatch: Object.freeze([true]) }),
  }), Object.freeze({
    v2Only: true,
    dragPreviewOnly: true,
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(VORONOI_LAWS.slice()),
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
  const targetOf = (T, paperBand) => {
    const aL = T.areaFor(1); const aD = T.areaFor(0);
    const band = Math.max(1e-3, Number.isFinite(paperBand) ? paperBand : K.V2_PAPER_BAND);
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
  const mazeLUT = (spec, toneCtx) => {
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
      && (!row.dragPreviewOnly || spec.dragPreview === true)
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
    if (spec && VORONOI_LAWS.indexOf(spec.toneLaw) !== -1) return bakeVoronoi(spec, opts);
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
    const emitPiece = (level, rank, x0, y0, x1, y1) => {
      const rt = ratioAt((x0 + x1) / 2, (y0 + y1) / 2);
      if (!(opts && opts.noThin) && (x0 === x1 ? rt < K.MAZE_THIN : rt > 1 / K.MAZE_THIN)) return;
      if (opts && opts.collect) opts.collect.push({ level, rank, x0, y0, x1, y1 });
      const p = latticeSample(x0, y0); const q = latticeSample(x1, y1);
      if (!p || !q) return;
      const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (!(len > 1e-4)) return;
      const n = Math.max(1, Math.ceil(len / stepObj));
      builder.beginRun(level, rank, 0, 0);
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
    const wall = (o, fixed, start, lvSlot, closed, closedRank, id) => {
      const len = S(lvSlot);
      const at = (s0, w) => (o === 'h' ? [start + s0, fixed, start + s0 + w, fixed] : [fixed, start + s0, fixed, start + s0 + w]);
      if (closed) {
        const c = at(0, len);
        emitPiece(lvSlot, closedRank, c[0], c[1], c[2], c[3]);
        return;
      }
      let pos = 0;
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
        emitPiece(k, Math.min(rA, rB), piece[0], piece[1], piece[2], piece[3]);
        pos = 2 * pos + bit;
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


  // ===================================================================================================================================
  // voronoiWeb (contract A33): a DRAG-PREVIEW-ONLY law. The pose law scatters seeds over the SCREEN, relaxes them, and draws the walls of
  // their Voronoi diagram; the cell size is the tone (finer in shadow). A different cell size is a different diagram, so unlike the maze
  // there is no keyed subset; the bake is one FULL web per tone level instead:
  //
  //   - level l has cell size D_l = CELL_TOP / ratio^l (the pose's own clamp range, CELL_MIN .. 2 x CELL_MAX), one web per level;
  //   - each level is a blue-noise seed set (dart throwing on the surface at separation D_l) relaxed by damped Lloyd passes, the walls are
  //     the label boundaries of the nearest-seed partition of a chart grid (grid spacing D_l / GRID_DIV), refined onto the true bisector
  //     (crossings by the chord equation, 3-way junctions by Gauss-Newton), chained through the junctions like the pose, simplified;
  //   - a run carries the TONE BAND [lo, hi] of its level (MarkSet.runBand): the I interval in which the pose cell size rounds (log) to
  //     that level. Bands tile [0, 1], so exactly one level draws at a vertex and the cell size follows the light with no rebake. Where
  //     one band meets the next, the web changes cell size (a seam; the two webs are independent diagrams and do not join up).
  //   - the lightest tones thin by RANK per wall chain (the pose's paper gate), the LUT is the gate g(I) / CELL_TOP.
  // The bake is POSE-FREE (contract §3, §8).
  // ===================================================================================================================================
  const rawChart = (spec) => {
    const SF = Scene3D.SurfaceFill;
    const prim = primitiveOf(spec);
    const mode = spec.mode || PRIM_MODE[prim];
    const raw = SF && typeof SF.chartFor === 'function' ? SF.chartFor(mode, spec.sizes || {}) : null;
    return typeof raw === 'function' ? raw : null;
  };
  const scaleOf = (spec) => {
    const sc = spec.scale || {};
    return { sx: finite(sc.sx, 1), sy: finite(sc.sy, 1), sz: finite(sc.sz, 1) };
  };
  // bounding radius of the scaled object, local mm (a 17 x 17 survey of the raw chart)
  const radiusOf = (spec) => {
    const raw = rawChart(spec); const sc = scaleOf(spec);
    if (!raw) return 0;
    let r2 = 0; const n = 17;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const q = raw(i / n, j / n);
      if (!q || !Number.isFinite(q.x + q.y + q.z)) continue;
      const x = q.x * sc.sx; const y = q.y * sc.sy; const z = q.z * sc.sz;
      r2 = Math.max(r2, x * x + y * y + z * z);
    }
    return Math.sqrt(r2);
  };
  const voroModel = (spec) => {
    const T = toneParams(spec);
    const scaleRef = finite(spec.scaleRef, 1) > 0 ? spec.scaleRef : 1;
    const R = radiusOf(spec) * scaleRef; // the form's screen radius, mm (pose: C.R)
    const CMIN = K.VORONOI_CELL_MIN_PEN * T.PEN;
    const CMAX = clamp(Math.min(R * K.VORONOI_CELL_R, T.PMAX * K.VORONOI_CELL_PITCH), CMIN * 3, CMIN * 14);
    const CTOP = CMAX * 2; // v2: the cell may grow to twice the legibility cap; past that the paper gate thins the web
    const areaMax = clamp((T.INK / (T.FLOOR * 1.05)) * T.DS, 0.02, K.A_DARK);
    const PMAXV = T.PMAX * K.VORONOI_PITCH_X;
    const pitchOfDens = (d) => clamp(T.INK / Math.max(1e-6, clamp(areaMax * d, 0, K.A_DARK)), T.INK / K.A_DARK, PMAXV);
    const WK = 2.31 * (T.PEN / T.INK) * K.VORONOI_WEB_K;
    const D = (d) => clamp(WK * pitchOfDens(d), CMIN, CTOP);
    const sparse = clamp((2.31 * T.PEN / CTOP) / (areaMax / 1.12), 0.05, 0.6);
    const dens = targetOf(T, K.VORONOI_PAPER_BAND);
    const ratio = Math.max(1.1, K.VORONOI_LEVEL_RATIO);
    // levels span exactly [D(1), CTOP]: the count is the least that keeps the step under the ratio, and the step is then spread evenly
    const Dmin = D(1);
    const Lmax = Math.max(1, Math.ceil(Math.log(CTOP / Dmin) / Math.log(ratio) - 1e-9));
    const step = Math.pow(CTOP / Dmin, 1 / Lmax);
    const lvOf = (d) => clamp(Math.round(Math.log(CTOP / D(d)) / Math.log(step)), 0, Lmax);
    return { T, scaleRef, R, CMIN, CTOP, D, dens, sparse, ratio: step, lvOf, Lmax, levelCell: (l) => CTOP / Math.pow(step, l) };
  };
  const voronoiLUT = (spec, toneCtx) => {
    const m = voroModel(spec);
    const size = cfg().TONE_LUT_SIZE || 256;
    const lut = new Float32Array(size + 1);
    const off = toneIsOff(toneCtx);
    const p0 = m.CTOP; // screen mm at the bake scale: dm = p0 x scaleRef-free x lut = the gate g
    for (let k = 0; k <= size; k++) {
      const d = m.dens(k / size);
      const g = off ? 1 : (d <= K.VORONOI_PAPER_DENS ? 0 : Math.min(1, d / m.sparse));
      lut[k] = 1.001 * g / p0;
    }
    return { lut, scaleFn: null };
  };

  const mulberry = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const bakeVoronoi = (spec, opts) => {
    sync();
    if (!supports(spec)) throw new Error(`SurfaceLockWebs.bake: unsupported spec (law ${spec && spec.toneLaw})`);
    const SM = MS(); const SC = CH();
    const prim = primitiveOf(spec);
    const mode = spec.mode || PRIM_MODE[prim];
    const sc = scaleOf(spec);
    const scaleRef = finite(spec.scaleRef, 1) > 0 ? spec.scaleRef : 1;
    const seed = (spec.seed && typeof spec.seed === 'object') ? spec.seed : {};
    const salt = finite(seed.salt, 0) | 0;
    const M = SC.metric(mode, spec.sizes || {}, sc);
    const raw = rawChart(spec);
    const builder = SM.createBuilder({ bakerId: 'webs', key: String(spec.key || ''), objectId: String(spec.objectId || '') });
    const emptyMeta = { p0: 1, gain: 2, toneModel: 'pitch', scaleRef, minMarkMM: 0, lawId: 'voronoiWeb', bounds: { min: [0, 0, 0], max: [0, 0, 0], radius: 0 }, convex: false };
    if (!M || !raw) { const e0 = builder.finish(); e0.bakerId = 'webs'; e0.meta = emptyMeta; return e0; }
    const tStart = Date.now();
    const model = voroModel(spec);
    const periodicA = !!M.periodicA; const periodicB = !!M.periodicB;
    const P = (u, v) => { // scaled local point of the raw chart (null off the chart)
      const q = raw(u, v);
      return q && Number.isFinite(q.x + q.y + q.z) ? q : null;
    };

    // ---- chart survey: area density (seed throwing), physical extent per chart unit (grid size), bounding box -------------------------
    const G = 25;
    const AW = new Float32Array(G * G); const la = []; const lb = []; let areaSum = 0; let areaMaxW = 0;
    const degHist = [0, 0, 0, 0, 0, 0, 0];
    const stats = { perLevel: [], degHist };
    const bmin0 = [Infinity, Infinity, Infinity]; const bmax0 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const s = M.sample((i + 0.5) / G, (j + 0.5) / G);
        if (!s) continue;
        const A = Math.hypot(s.dax, s.day, s.daz); const B = Math.hypot(s.dbx, s.dby, s.dbz);
        const cx = s.day * s.dbz - s.daz * s.dby; const cy = s.daz * s.dbx - s.dax * s.dbz; const cz = s.dax * s.dby - s.day * s.dbx;
        const w = Math.hypot(cx, cy, cz);
        AW[i * G + j] = w; areaSum += w; if (w > areaMaxW) areaMaxW = w;
        if (A > 1e-9) la.push(A); if (B > 1e-9) lb.push(B);
        if (s.x < bmin0[0]) bmin0[0] = s.x; if (s.y < bmin0[1]) bmin0[1] = s.y; if (s.z < bmin0[2]) bmin0[2] = s.z;
        if (s.x > bmax0[0]) bmax0[0] = s.x; if (s.y > bmax0[1]) bmax0[1] = s.y; if (s.z > bmax0[2]) bmax0[2] = s.z;
      }
    }
    const surfaceArea = areaSum / (G * G); // physical area of the whole chart, scaled mm^2
    if (!(surfaceArea > 0) || !la.length || !lb.length) { const e1 = builder.finish(); e1.bakerId = 'webs'; e1.meta = emptyMeta; return e1; }
    const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    const extA = pct(la, 0.9); const extB = pct(lb, 0.9);
    for (let a = 0; a < 3; a++) { bmin0[a] -= 1e-3; bmax0[a] += 1e-3; }
    stats.surveyMs = Date.now() - tStart;
    const stepObj = K.VORONOI_STEP_MM / scaleRef;
    const simpTol = K.VORONOI_SIMPLIFY / scaleRef;

    // ---- levels: drop the finest while the vertex estimate does not fit ---------------------------------------------------------------
    let Lc = model.Lmax;
    const estV = (l) => 1.6 * 2.31 * surfaceArea / (model.levelCell(l) / scaleRef * K.VORONOI_INK_X) / stepObj;
    for (;;) { let tot = 0; for (let l = 0; l <= Lc; l++) tot += estV(l); if (tot <= K.VORONOI_MAX_VERTS || Lc <= 0) break; Lc -= 1; }
    // tone band of each level: the I interval in which the pose cell size rounds to that level (bands tile [0, 1])
    const size = cfg().TONE_LUT_SIZE || 256;
    const bandLo = new Array(Lc + 1).fill(Infinity); const bandHi = new Array(Lc + 1).fill(-Infinity);
    for (let k = 0; k <= size; k++) {
      const l = Math.min(Lc, model.lvOf(model.dens(k / size)));
      bandLo[l] = Math.min(bandLo[l], (k - 0.5) / size); bandHi[l] = Math.max(bandHi[l], (k + 0.5) / size);
    }

    const bmin = [Infinity, Infinity, Infinity]; const bmax = [-Infinity, -Infinity, -Infinity]; let rmax2 = 0;
    let runs = 0; let vertsOut = 0; let junctions = 0; let cells = 0;
    const R2A = 0.7548776662466927; const R2B = 0.5698402909980532;


    // per-bake scratch buffers reused by every level (the finest level is the largest, so each grows once)
    const bufs = { f: [], i: [], b: [] };
    const take = (pool, k, n, Ctor) => { let a = pool[k]; if (!a || a.length < n) { a = new Ctor(n); pool[k] = a; } return a.subarray(0, n); };
    const bufF = (k, n) => take(bufs.f, k, n, Float32Array); const bufI = (k, n) => take(bufs.i, k, n, Int32Array); const bufB = (k, n) => take(bufs.b, k, n, Uint8Array);
    const buildLevel = (l) => {
      const Dl = model.levelCell(l) / scaleRef * K.VORONOI_INK_X; // cell size, scaled local mm
      const t0 = opts && opts.timing ? Date.now() : 0;
      // -- label grid -------------------------------------------------------------------------------------------------------------------
      let h = Dl / Math.max(2, K.VORONOI_GRID_DIV);
      let Nu = Math.max(8, Math.ceil(extA / h)); let Nv = Math.max(8, Math.ceil(extB / h));
      while (Nu * Nv > K.VORONOI_MAX_NODES) { Nu = Math.max(8, Math.round(Nu * 0.9)); Nv = Math.max(8, Math.round(Nv * 0.9)); if (Nu === 8 && Nv === 8) break; }
      const NNu = periodicA ? Nu : Nu + 1; const NNv = periodicB ? Nv : Nv + 1;
      const nn = NNu * NNv;
      const gx = bufF(0, nn); const gy = bufF(1, nn); const gz = bufF(2, nn);
      const gOk = bufB(0, nn).fill(0);
      for (let j = 0; j < NNv; j++) {
        for (let i = 0; i < NNu; i++) {
          const q = P(i / Nu, j / Nv); const k = j * NNu + i;
          if (q) { gx[k] = q.x * sc.sx; gy[k] = q.y * sc.sy; gz[k] = q.z * sc.sz; gOk[k] = 1; }
        }
      }
      const tg = opts && opts.timing ? Date.now() : 0;
      // -- seeds: blue-noise dart throwing on the surface -------------------------------------------------------------------------------
      const rng = mulberry(salt * 7919 + 104729 * (l + 1) + 12345);
      const sep = Dl * Math.max(0.5, K.VORONOI_SEP);
      const dims = (cs) => [Math.max(1, Math.ceil((bmax0[0] - bmin0[0]) / cs)), Math.max(1, Math.ceil((bmax0[1] - bmin0[1]) / cs)), Math.max(1, Math.ceil((bmax0[2] - bmin0[2]) / cs))];
      let seedsX = []; let seedsY = []; let seedsZ = [];
      {
        const cs = sep; const [hx, hy, hz] = dims(cs);
        const head = new Int32Array(hx * hy * hz).fill(-1); const next = [];
        const cx0 = (v) => Math.min(hx - 1, Math.max(0, Math.floor((v - bmin0[0]) / cs)));
        const cy0 = (v) => Math.min(hy - 1, Math.max(0, Math.floor((v - bmin0[1]) / cs)));
        const cz0 = (v) => Math.min(hz - 1, Math.max(0, Math.floor((v - bmin0[2]) / cs)));
        const nEst = Math.max(8, surfaceArea / (0.75 * sep * sep));
        const accept = Math.max(0.15, (areaSum / (G * G)) / Math.max(1e-9, areaMaxW));
        const tries = Math.min(400000, Math.ceil(K.VORONOI_TRIES * nEst / accept));
        const ou = rng(); const ov = rng(); const sep2 = sep * sep;
        for (let t = 1; t <= tries; t++) {
          const u = (ou + R2A * t) % 1; const v = (ov + R2B * t) % 1;
          if (rng() * areaMaxW > AW[Math.min(G - 1, Math.floor(u * G)) * G + Math.min(G - 1, Math.floor(v * G))]) continue;
          const q = P(u, v); if (!q) continue;
          const x = q.x * sc.sx; const y = q.y * sc.sy; const z = q.z * sc.sz;
          const ix = cx0(x); const iy = cy0(y); const iz = cz0(z);
          let blocked = false;
          for (let a = Math.max(0, ix - 1); a <= Math.min(hx - 1, ix + 1) && !blocked; a++) {
            for (let b = Math.max(0, iy - 1); b <= Math.min(hy - 1, iy + 1) && !blocked; b++) {
              for (let c = Math.max(0, iz - 1); c <= Math.min(hz - 1, iz + 1); c++) {
                for (let e = head[(a * hy + b) * hz + c]; e >= 0; e = next[e]) {
                  const dx = seedsX[e] - x; const dy = seedsY[e] - y; const dz = seedsZ[e] - z;
                  if (dx * dx + dy * dy + dz * dz < sep2) { blocked = true; break; }
                }
                if (blocked) break;
              }
            }
          }
          if (blocked) continue;
          const id = seedsX.length; seedsX.push(x); seedsY.push(y); seedsZ.push(z);
          const hk = (ix * hy + iy) * hz + iz; next.push(head[hk]); head[hk] = id;
        }
      }
      let ns = seedsX.length;
      if (ns < 3) return;
      const ts = opts && opts.timing ? Date.now() : 0;
      // -- labelling: nearest seed of every grid node (3D) -----------------------------------------------------------------------------
      const labels = bufI(2, nn);
      const label = (stride) => {
        const cs = Dl * 1.3; const [hx, hy, hz] = dims(cs);
        const head = new Int32Array(hx * hy * hz).fill(-1); const next = new Int32Array(ns);
        const ix = (v) => Math.min(hx - 1, Math.max(0, Math.floor((v - bmin0[0]) / cs)));
        const iy = (v) => Math.min(hy - 1, Math.max(0, Math.floor((v - bmin0[1]) / cs)));
        const iz = (v) => Math.min(hz - 1, Math.max(0, Math.floor((v - bmin0[2]) / cs)));
        for (let s = 0; s < ns; s++) { const hk = (ix(seedsX[s]) * hy + iy(seedsY[s])) * hz + iz(seedsZ[s]); next[s] = head[hk]; head[hk] = s; }
        // a node closer to its predecessor's seed than half that seed's nearest neighbour is certainly in that seed's cell (the 1-eval fast path)
        const rin2 = new Float64Array(ns);
        for (let s = 0; s < ns; s++) {
          const ci = ix(seedsX[s]); const cj = iy(seedsY[s]); const ck = iz(seedsZ[s]); let nd = Infinity;
          for (let a = Math.max(0, ci - 1); a <= Math.min(hx - 1, ci + 1); a++) for (let b = Math.max(0, cj - 1); b <= Math.min(hy - 1, cj + 1); b++) for (let c = Math.max(0, ck - 1); c <= Math.min(hz - 1, ck + 1); c++) {
            for (let e = head[(a * hy + b) * hz + c]; e >= 0; e = next[e]) { if (e === s) continue; const dx = seedsX[e] - seedsX[s]; const dy = seedsY[e] - seedsY[s]; const dz = seedsZ[e] - seedsZ[s]; const d2 = dx * dx + dy * dy + dz * dz; if (d2 < nd) nd = d2; }
          }
          rin2[s] = Number.isFinite(nd) ? nd * 0.25 : 0;
        }
        let prev = -1;
        for (let kk = 0; kk < nn; kk += 1) {
          const k = kk;
          if (stride > 1 && ((k % NNu) % stride !== 0 || Math.floor(k / NNu) % stride !== 0)) continue;
          if (!gOk[k]) { labels[k] = -1; continue; }
          const x = gx[k]; const y = gy[k]; const z = gz[k];
          if (prev >= 0) { const dx = seedsX[prev] - x; const dy = seedsY[prev] - y; const dz = seedsZ[prev] - z; if (dx * dx + dy * dy + dz * dz < rin2[prev] * 0.98) { labels[k] = prev; continue; } }
          const ci = ix(x); const cj = iy(y); const ck = iz(z);
          let best = -1; let bd = Infinity;
          for (let R = 1; R <= 4; R++) {
            if (R === 1 || best < 0 || Math.sqrt(bd) > (R - 1) * cs) {
              for (let a = Math.max(0, ci - R); a <= Math.min(hx - 1, ci + R); a++) {
                for (let b = Math.max(0, cj - R); b <= Math.min(hy - 1, cj + R); b++) {
                  for (let c = Math.max(0, ck - R); c <= Math.min(hz - 1, ck + R); c++) {
                    if (R > 1 && Math.abs(a - ci) < R && Math.abs(b - cj) < R && Math.abs(c - ck) < R) continue; // inner shell already scanned
                    for (let e = head[(a * hy + b) * hz + c]; e >= 0; e = next[e]) {
                      const dx = seedsX[e] - x; const dy = seedsY[e] - y; const dz = seedsZ[e] - z;
                      const d2 = dx * dx + dy * dy + dz * dz;
                      if (d2 < bd) { bd = d2; best = e; }
                    }
                  }
                }
              }
            }
            if (best >= 0 && Math.sqrt(bd) <= R * cs) break;
          }
          labels[k] = best; prev = best;
        }
      };
      const RS = Math.max(1, K.VORONOI_RELAX_STRIDE | 0);
      label(RS);
      // -- damped Lloyd: a seed moves 0.45 of the way to the centroid of its labelled nodes, onto the nearest grid node of its cell -------
      for (let pass = 0; pass < K.VORONOI_RELAX; pass++) {
        const sx = new Float64Array(ns); const sy = new Float64Array(ns); const sz = new Float64Array(ns); const cn = new Int32Array(ns);
        for (let k = 0; k < nn; k++) { if (RS > 1 && ((k % NNu) % RS !== 0 || Math.floor(k / NNu) % RS !== 0)) continue; const s = labels[k]; if (s < 0) continue; sx[s] += gx[k]; sy[s] += gy[k]; sz[s] += gz[k]; cn[s] += 1; }
        const tx = new Float64Array(ns); const ty = new Float64Array(ns); const tz = new Float64Array(ns);
        for (let s = 0; s < ns; s++) {
          if (!cn[s]) { tx[s] = seedsX[s]; ty[s] = seedsY[s]; tz[s] = seedsZ[s]; continue; }
          tx[s] = seedsX[s] + (sx[s] / cn[s] - seedsX[s]) * K.VORONOI_RELAX_K; ty[s] = seedsY[s] + (sy[s] / cn[s] - seedsY[s]) * K.VORONOI_RELAX_K; tz[s] = seedsZ[s] + (sz[s] / cn[s] - seedsZ[s]) * K.VORONOI_RELAX_K;
        }
        const bestK = new Int32Array(ns).fill(-1); const bestD = new Float64Array(ns).fill(Infinity);
        for (let k = 0; k < nn; k++) {
          if (RS > 1 && ((k % NNu) % RS !== 0 || Math.floor(k / NNu) % RS !== 0)) continue;
          const s = labels[k]; if (s < 0) continue;
          const dx = gx[k] - tx[s]; const dy = gy[k] - ty[s]; const dz = gz[k] - tz[s];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestD[s]) { bestD[s] = d2; bestK[s] = k; }
        }
        for (let s = 0; s < ns; s++) { const k = bestK[s]; if (k >= 0) { seedsX[s] = gx[k]; seedsY[s] = gy[k]; seedsZ[s] = gz[k]; } }
        label(pass === K.VORONOI_RELAX - 1 ? 1 : RS);
      }
      if (K.VORONOI_RELAX <= 0) label(1);
      const t1 = opts && opts.timing ? Date.now() : 0;
      cells += ns;
      // -- boundaries: crossings on the grid edges (chord bisector), a node at every cell holding 3 labels ----------------------------------
      const nu = []; const nv = []; // graph node chart coordinates (unwrapped; wrapped on use)
      const adjE = []; const adjC = []; const ea = []; const eb = []; // 4 incident-edge slots per node (a crossing has 2, a junction cell up to 4)
      const hCross = bufI(0, nn).fill(-1); const vCross = bufI(1, nn).fill(-1);
      const addNode = (u, v) => { nu.push(u); nv.push(v); adjE.push(-1, -1, -1, -1); adjC.push(0); return nu.length - 1; };
      const link = (n, e) => { if (adjC[n] < 4) { adjE[4 * n + adjC[n]] = e; adjC[n] += 1; } };
      const addEdge = (a, b) => { if (a === b) return; const e = ea.length; ea.push(a); eb.push(b); link(a, e); link(b, e); };
      const crossing = (k0, k1, u0, v0, u1, v1, store, key) => {
        let id = store[key];
        if (id >= 0) return id;
        const a = labels[k0]; const b = labels[k1];
        const f = (k) => { const x = gx[k]; const y = gy[k]; const z = gz[k];
          const ax = x - seedsX[a]; const ay = y - seedsY[a]; const az = z - seedsZ[a]; const bx = x - seedsX[b]; const by = y - seedsY[b]; const bz = z - seedsZ[b];
          return ax * ax + ay * ay + az * az - (bx * bx + by * by + bz * bz); };
        const f0 = f(k0); const f1 = f(k1);
        let t = f0 - f1 !== 0 ? f0 / (f0 - f1) : 0.5; t = clamp(t, 0.02, 0.98);
        id = addNode(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t); store[key] = id; return id;
      };
      const wrapI = (i) => (i >= NNu ? i - NNu : i); const wrapJ = (j) => (j >= NNv ? j - NNv : j);
      const centers = [];
      for (let j = 0; j < Nv; j++) {
        const j1 = wrapJ(j + 1);
        for (let i = 0; i < Nu; i++) {
          const i1 = wrapI(i + 1);
          const k00 = j * NNu + i; const k10 = j * NNu + i1; const k01 = j1 * NNu + i; const k11 = j1 * NNu + i1;
          const l00 = labels[k00]; const l10 = labels[k10]; const l01 = labels[k01]; const l11 = labels[k11];
          if (l00 === l10 && l00 === l01 && l00 === l11) continue;
          if (l00 < 0 || l10 < 0 || l01 < 0 || l11 < 0) continue;
          const uA = i / Nu; const uB = (i + 1) / Nu; const vA = j / Nv; const vB = (j + 1) / Nv;
          const cr = [];
          if (l00 !== l10) cr.push(crossing(k00, k10, uA, vA, uB, vA, hCross, k00));
          if (l10 !== l11) cr.push(crossing(k10, k11, uB, vA, uB, vB, vCross, k10));
          if (l01 !== l11) cr.push(crossing(k01, k11, uA, vB, uB, vB, hCross, k01));
          if (l00 !== l01) cr.push(crossing(k00, k01, uA, vA, uA, vB, vCross, k00));
          let distinct = 1; { const set = [l00]; [l10, l01, l11].forEach((q) => { if (set.indexOf(q) < 0) { set.push(q); distinct += 1; } }); }
          if (cr.length === 2 && distinct === 2) { addEdge(cr[0], cr[1]); continue; }
          const c = addNode((uA + uB) / 2, (vA + vB) / 2);
          cr.forEach((q) => addEdge(q, c));
          if (distinct === 3) centers.push({ c, i, j, l: [l00, l10, l01, l11] });
        }
      }
      const tb1 = opts && opts.timing ? Date.now() : 0;
      // -- junction refinement: Gauss-Newton onto the point equidistant from the cell's three seeds -----------------------------------
      centers.forEach((cn) => {
        const lab = []; cn.l.forEach((q) => { if (lab.indexOf(q) < 0) lab.push(q); });
        const [a, b, c] = lab;
        let u = nu[cn.c]; let v = nv[cn.c];
        const u0 = u; const v0 = v;
        const ev = (uu, vv) => {
          const q = P(((uu % 1) + 1) % 1, ((vv % 1) + 1) % 1); if (!q) return null;
          const x = q.x * sc.sx; const y = q.y * sc.sy; const z = q.z * sc.sz;
          const da = (x - seedsX[a]) ** 2 + (y - seedsY[a]) ** 2 + (z - seedsZ[a]) ** 2;
          const db = (x - seedsX[b]) ** 2 + (y - seedsY[b]) ** 2 + (z - seedsZ[b]) ** 2;
          const dc = (x - seedsX[c]) ** 2 + (y - seedsY[c]) ** 2 + (z - seedsZ[c]) ** 2;
          return [da - db, da - dc];
        };
        const du = 0.25 / Nu; const dv = 0.25 / Nv;
        for (let it = 0; it < 3; it++) {
          const f0 = ev(u, v); const fu = ev(u + du, v); const fv = ev(u, v + dv);
          if (!f0 || !fu || !fv) return;
          const j00 = (fu[0] - f0[0]) / du; const j01 = (fv[0] - f0[0]) / dv; const j10 = (fu[1] - f0[1]) / du; const j11 = (fv[1] - f0[1]) / dv;
          const det = j00 * j11 - j01 * j10;
          if (!(Math.abs(det) > 1e-12)) return;
          u -= (f0[0] * j11 - f0[1] * j01) / det; v -= (j00 * f0[1] - j10 * f0[0]) / det;
        }
        if (Math.abs(u - u0) <= 1.2 / Nu && Math.abs(v - v0) <= 1.2 / Nv) { nu[cn.c] = u; nv[cn.c] = v; }
      });
      const tb2 = opts && opts.timing ? Date.now() : 0;
      const nN = nu.length;
      if (!nN) return;
      junctions += centers.length;
      for (let n = 0; n < nN; n++) degHist[Math.min(6, adjC[n])] += 1;
      // node positions (3D)
      const px = new Float32Array(nN); const py = new Float32Array(nN); const pz = new Float32Array(nN); const pOk = new Uint8Array(nN);
      const wrapU = (u) => (periodicA ? ((u % 1) + 1) % 1 : clamp(u, 0, 1)); const wrapV = (v) => (periodicB ? ((v % 1) + 1) % 1 : clamp(v, 0, 1));
      for (let n = 0; n < nN; n++) {
        const q = P(wrapU(nu[n]), wrapV(nv[n]));
        if (q) { px[n] = q.x * sc.sx; py[n] = q.y * sc.sy; pz[n] = q.z * sc.sz; pOk[n] = 1; }
      }
      // -- chaining: long strokes through the junctions (the straightest continuation), junction / end starts first ----------------------
      const used = new Uint8Array(ea.length);
      const chains = [];
      const walk = (start) => {
        let cur = start; let dx = 0; let dy = 0; let dz = 0; let has = false;
        const pts = [cur];
        for (;;) {
          let best = -1; let bdot = -Infinity;
          for (let q = 0; q < adjC[cur]; q++) {
            const e = adjE[4 * cur + q]; if (used[e]) continue;
            const o = ea[e] === cur ? eb[e] : ea[e];
            const ex = px[o] - px[cur]; const ey = py[o] - py[cur]; const ez = pz[o] - pz[cur];
            const L = Math.hypot(ex, ey, ez) || 1;
            const dot = has ? (ex * dx + ey * dy + ez * dz) / L : 0;
            if (dot > bdot) { bdot = dot; best = e; }
          }
          if (best < 0) break;
          used[best] = 1;
          const o = ea[best] === cur ? eb[best] : ea[best];
          const ex = px[o] - px[cur]; const ey = py[o] - py[cur]; const ez = pz[o] - pz[cur];
          const L = Math.hypot(ex, ey, ez) || 1;
          dx = ex / L; dy = ey / L; dz = ez / L; has = true;
          cur = o; pts.push(cur);
        }
        if (pts.length >= 2) chains.push(pts);
      };
      for (let n = 0; n < nN; n++) if (adjC[n] !== 2) walk(n);
      for (let n = 0; n < nN; n++) { let any = false; for (let q = 0; q < adjC[n]; q++) if (!used[adjE[4 * n + q]]) any = true; if (any) walk(n); }
      const tb3 = opts && opts.timing ? Date.now() : 0;
      // -- simplify (RDP on the 3D polyline) and emit, resampled at the step ----------------------------------------------------------
      const keepIdx = new Uint8Array(0);
      const rdp = (pts) => {
        const n = pts.length; const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
        const stack = [[0, n - 1]];
        while (stack.length) {
          const [s, e] = stack.pop();
          if (e <= s + 1) continue;
          const A = pts[s]; const B = pts[e];
          const abx = px[B] - px[A]; const aby = py[B] - py[A]; const abz = pz[B] - pz[A];
          const l2 = abx * abx + aby * aby + abz * abz;
          let md = -1; let mi = -1;
          for (let q = s + 1; q < e; q++) {
            const N = pts[q];
            const apx = px[N] - px[A]; const apy = py[N] - py[A]; const apz = pz[N] - pz[A];
            const t = l2 > 0 ? clamp((apx * abx + apy * aby + apz * abz) / l2, 0, 1) : 0;
            const ex = apx - t * abx; const ey = apy - t * aby; const ez = apz - t * abz;
            const d = ex * ex + ey * ey + ez * ez;
            if (d > md) { md = d; mi = q; }
          }
          if (md > simpTol * simpTol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
        }
        const out = []; for (let q = 0; q < n; q++) if (keep[q]) out.push(pts[q]);
        return out;
      };
      void keepIdx;
      const lo = Math.max(0, bandLo[l]); const hi = Math.min(1, bandHi[l]);
      chains.forEach((chain, ci) => {
        const pts = rdp(chain);
        if (pts.length < 2) return;
        const rank = Math.min(0.99998, SC.hash(ci, l * 31 + 5, salt + 8821) * K.VORONOI_THIN_RANK);
        const closed = chain[0] === chain[chain.length - 1];
        builder.beginRun(0, rank, 0, closed ? SM.FLAG.CLOSED : 0, undefined, 0, 0, lo, hi);
        let pu = 0; let pv = 0; let n0 = 0; let ps = null;
        const put = (x, y, z, nx, ny, nz) => {
          builder.vertex(x, y, z, nx, ny, nz); n0 += 1;
          if (x < bmin[0]) bmin[0] = x; if (x > bmax[0]) bmax[0] = x;
          if (y < bmin[1]) bmin[1] = y; if (y > bmax[1]) bmax[1] = y;
          if (z < bmin[2]) bmin[2] = z; if (z > bmax[2]) bmax[2] = z;
          const r2 = x * x + y * y + z * z; if (r2 > rmax2) rmax2 = r2;
        };
        for (let q = 0; q < pts.length; q++) {
          const N = pts[q]; let u = nu[N]; let v = nv[N];
          if (q > 0) { // unwrap relative to the previous node, then subdivide: the chart point is exact, the normal is the end normals' blend
            if (periodicA) { while (u - pu > 0.5) u -= 1; while (u - pu < -0.5) u += 1; }
            if (periodicB) { while (v - pv > 0.5) v -= 1; while (v - pv < -0.5) v += 1; }
            const len = Math.hypot(px[N] - px[pts[q - 1]], py[N] - py[pts[q - 1]], pz[N] - pz[pts[q - 1]]);
            const m = Math.max(1, Math.ceil(len / stepObj));
            const s1 = M.sample(wrapU(u), wrapV(v));
            for (let w = 1; w <= m; w++) {
              if (w === m) { if (s1) put(s1.x, s1.y, s1.z, s1.nx, s1.ny, s1.nz); continue; }
              const f = w / m; const uu = pu + (u - pu) * f; const vv = pv + (v - pv) * f;
              const c = P(wrapU(uu), wrapV(vv));
              if (!c || !ps || !s1) continue;
              let nx = ps.nx + (s1.nx - ps.nx) * f; let ny = ps.ny + (s1.ny - ps.ny) * f; let nz = ps.nz + (s1.nz - ps.nz) * f;
              const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
              put(c.x * sc.sx, c.y * sc.sy, c.z * sc.sz, nx, ny, nz);
            }
            ps = s1;
          } else {
            ps = M.sample(wrapU(u), wrapV(v));
            if (ps) put(ps.x, ps.y, ps.z, ps.nx, ps.ny, ps.nz);
          }
          pu = u; pv = v;
        }
        if (builder.endRun()) { runs += 1; vertsOut += n0; }
      });
      if (opts && opts.timing) stats.perLevel.push({ l, D: +(Dl * scaleRef).toFixed(2), seeds: ns, nodes: nn, ms: [tg - t0, ts - tg, t1 - ts, tb1 - t1, tb2 - tb1, tb3 - tb2, Date.now() - tb3] });
    };
    const tLv = Date.now();
    for (let l = 0; l <= Lc; l++) buildLevel(l);
    stats.levelsMs = Date.now() - tLv; const tFin = Date.now();

    const ms = builder.finish();
    ms.bakerId = 'webs';
    stats.finishMs = Date.now() - tFin; stats.levels = Lc + 1;
    if (ms.vertexCount > 200000) throw new Error('SurfaceLockWebs.bake: vertex budget exceeded');
    const has = ms.vertexCount > 0;
    if (opts && opts.info) Object.assign(opts.info, stats, { bandLo, bandHi, CTOP: model.CTOP, CMIN: model.CMIN, Lc });
    ms.meta = {
      p0: model.CTOP / scaleRef, gain: 2, toneModel: 'pitch', scaleRef, minMarkMM: 0, lawId: 'voronoiWeb',
      toneScaleFree: true,
      floorPitchPen: K.VORONOI_FLOOR_PEN,
      voronoiLevels: Lc + 1, voronoiCells: cells, voronoiJunctions: junctions, voronoiRuns: runs, voronoiCTopMM: model.CTOP,
      voronoiBands: bandLo.map((a, i) => [a, bandHi[i]]),
      bounds: has ? { min: bmin.slice(), max: bmax.slice(), radius: Math.sqrt(rmax2) } : { min: [0, 0, 0], max: [0, 0, 0], radius: 0 },
      convex: typeof spec.convex === 'boolean' ? spec.convex : Boolean(CONVEX_MODES[mode]),
    };
    return ms;
  };

  const toneLUT = (spec, toneCtx) => (spec && VORONOI_LAWS.indexOf(spec.toneLaw) !== -1 ? (sync(), voronoiLUT(spec, toneCtx)) : mazeLUT(spec, toneCtx));
  const bake = (spec) => bakeCore(spec, null);
  // Test hook: the lattice pieces { level, rank, x0, y0, x1, y1 } of a bake (finest-cell units) and its geometry; `noThin` keeps every wall.
  const debugLattice = (spec, opts) => { const pieces = []; const info = {}; bakeCore(spec, { collect: pieces, info, noThin: !opts || opts.noThin !== false }); return { pieces, info }; };

  Scene3D.SurfaceLockWebs = { id: 'webs', FIT, supports, bake, toneLUT, debug: { lattice: debugLattice, voronoi: (spec, opts) => { const info = {}; const ms = bakeVoronoi(spec, Object.assign({ info, timing: true }, opts || {})); return { ms, info }; } } };
})();
