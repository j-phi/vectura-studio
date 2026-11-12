/**
 * Scene3D.SurfaceLockLaws — the good-fit mono tone laws as LUT + run-treatment layers over the locked ladder
 * rulings (docs/surface-lock-contract.md §9 "Laws", §12 FIT row, W3-B).
 *
 *   FIT, supports(spec), bake(spec) -> MarkSet, toneLUT(spec, toneCtx) -> { lut, scaleFn: null }
 *
 * Done here: dutyConst, endShorten, mergeLadder, phaseBlue on hatch / crosshatch. Not done (follow-ups):
 * creviceAO (needs an AO tone term in the frame's toneFn), jitterOverdraw, transReserveMono.
 *
 * Every law is the SurfaceLockLadder's rulings (read-only: `Ladder.bake` on a derived spec) plus
 *   (1) a tone LUT that is the pose-mode law's own tone map written as a gate threshold, and
 *   (2) a bake-time run treatment that re-keys / splits the rulings so the frame's single rule
 *       "a point is drawn iff key < t(I)" (contract §5) reproduces the law.
 * A run's key is `level 0: rank`, `level L >= 1: 2^(L-1) (1 + rank)` (gain 2). The treatments choose keys:
 *   - dutyConst   : fixed-pitch rulings cut into period cells; each cell is split into centre-out BANDS whose
 *                   key is the duty at which the band switches on. The LUT is the duty. Constant mark count.
 *   - endShorten  : fixed-pitch rulings, key = the ladder's even-subset order, LUT = drawn fraction, so ends
 *                   retract along an even, staggered envelope and no ruling is ever absent in the shadow.
 *   - mergeLadder : ladder pitch law for the pitch leg, dash bands (key = tone at which the dash grows) for
 *                   rulings coarser than the plot floor, whole rulings beyond the touch point.
 *   - phaseBlue   : ladder pitch law; every ruling is shifted sideways by a low-discrepancy phase.
 * The bake is pose-free (contract §3, §8): it reads geometry, style, pen, scaleRef and seed only.
 */
(function registerScene3DSurfaceLockLaws() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Constants. Live values may come from Vectura.SCENE3D_SURFACE_LOCK.LAWS (not yet in the config: orchestrator wires it).
  const DEFAULTS = {
    INK_SPREAD: 0.12,       // surface-fill INK_SPREAD (private there)
    A_DARK: 0.90,           // makeCtx dark end of the tone map
    PLOT_FLOOR_PEN: 2.2,    // Regions.PLOT_FLOOR_PEN fallback
    LIT_MAX_PITCH_PEN: 12,  // Regions.LIT_MAX_PITCH_PEN fallback
    MIN_MARK_MM: 0.6,       // pose MIN_RUN_MM
    MIN_MARK_PEN: 2,        // pose: minMarkMM = max(MIN_RUN_MM, 2 pen)
    DUTY_PERIOD_FLOOR: 2.0, // dutyConst mark period, x plot floor (pose: FLOOR * 2.0)
    DUTY_PITCH_FLOOR: 1.05, // dutyConst ruling pitch, x plot floor
    END_PITCH_FLOOR: 1.15,  // endShorten ruling pitch, x plot floor
    END_RETRACT: 0.84,      // endShorten: fraction of a ruling spent at full light (2 x 0.42 span)
    MERGE_PERIOD_FLOOR: 1.8,// mergeLadder mark period, x plot floor
    MERGE_M_MIN: 0.03,
    MERGE_TOUCH_INK: 0.98,
    BANDS: 4,               // centre-out dash bands per cell (duty resolution; more = more, shorter runs)
    JIT_FRAC: 0.2,          // phaseBlue: peak-to-peak sideways shift, x the finest ruling pitch (keeps the 0.8 bar)
    V2_TOL_MM: 0.02,        // tone model v2: chord tolerance of the decimated polylines (object mm)
    V2_MAX_SEG_MM: 2.0,     // tone model v2: longest segment left after decimation (the tone is sampled at vertices)
    V2_PAPER_BAND: 0.15,    // tone model v2: the lightest 15 % of the tone range rolls off to paper (no lit floor)
    MAX_VERTS: 200000,      // contract §2 budget
    HATCH_D_MAX: 100,
    GOLDEN: 0.6180339887498949,
  };
  const K = Object.assign({}, DEFAULTS);

  const LAW_IDS = ['dutyConst', 'endShorten', 'mergeLadder', 'phaseBlue'];
  const FIT_MAPPERS = ['hatch', 'crosshatch'];
  const FIT_PRIMITIVES = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus'];
  const FIT = Object.freeze([Object.freeze({
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(LAW_IDS.slice()),
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
  const ladder = () => Scene3D.SurfaceLockLadder;
  const MS = () => Scene3D.SurfaceLockMarkSet;

  // ---- tone parameters: copies of makeCtx's pure maths --------------------------------------------------------
  const toneParams = (spec) => {
    const R = regions();
    const PEN = Math.max(0.02, finite(spec && spec.penWidth, 0.3));
    const INK = PEN * (1 + K.INK_SPREAD);
    const FLOOR = (Number.isFinite(R.PLOT_FLOOR_PEN) ? R.PLOT_FLOOR_PEN : K.PLOT_FLOOR_PEN) * PEN;
    const litMax = (Number.isFinite(R.LIT_MAX_PITCH_PEN) ? R.LIT_MAX_PITCH_PEN : K.LIT_MAX_PITCH_PEN) * PEN;
    const DS = clamp(finite(spec && spec.style && spec.style.densityScale, 1), 0.25, 4);
    const PMAX0 = Math.max(FLOOR * 1.6, litMax);
    const PMAX = Math.max(FLOOR * 1.6, litMax / DS);
    const SPARSE = Math.max(1, 1 / DS);
    const MARKMIN = Math.max(K.MIN_MARK_MM, K.MIN_MARK_PEN * PEN);
    const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
    const invL = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
    const A_LIGHT = clamp(INK / PMAX0, 0.02, 0.5);
    const L_LIGHT = Lstar(1 - A_LIGHT); const L_DARK = Lstar(1 - K.A_DARK);
    const areaFor = (I) => clamp(1 - invL(L_DARK + (L_LIGHT - L_DARK) * clamp(finite(I, 0), 0, 1)), 0.02, K.A_DARK);
    const pitchFor = (I) => clamp(INK / areaFor(I) / DS, INK / K.A_DARK, PMAX);
    return { PEN, INK, FLOOR, litMax, DS, PMAX0, PMAX, SPARSE, MARKMIN, areaFor, pitchFor };
  };

  // ---- per-law tone maps. Each returns { theta(I) -> gate threshold >= 0, pitch (nominal screen pitch) } ----------
  // The LUT entry is theta(I) / pitch for the fixed-pitch laws (the frame multiplies by p0 * s, so t = rho * theta at
  // the bake scale; the bake folds rho into the keys) and 1 / pitch(I) for the pitch laws.
  const dutyModel = (T) => {
    const P0 = T.FLOOR * K.DUTY_PITCH_FLOOR * T.SPARSE;
    const tDense = clamp((1 - 1 / T.DS) / (1 - 1 / 4), 0, 1);
    const cov0 = T.PEN / P0;
    const P = tDense > 0 ? T.PEN / (cov0 + (1 - cov0) * tDense) : P0;
    const PERIOD = T.FLOOR * K.DUTY_PERIOD_FLOOR;
    const aLight = T.areaFor(1); const aDark = T.areaFor(0);
    const duty = (I) => clamp(0.18 + 0.82 * ((T.areaFor(I) - aLight) / Math.max(1e-6, aDark - aLight)), 0.18, 1);
    const minDuty = clamp(T.MARKMIN / PERIOD, 0, 0.95);
    // Pose emitScr refuses a dash shorter than MINMARK, so those tones draw nothing.
    return { pitch: P, period: PERIOD, minDuty, theta: (I) => { const d = duty(I); return d * PERIOD < T.MARKMIN ? 0 : d; } };
  };
  const endModel = (T) => ({
    pitch: T.FLOOR * K.END_PITCH_FLOOR * T.SPARSE,
    theta: (I) => { const x = clamp(finite(I, 0), 0, 1); return 1 - K.END_RETRACT * (x * x * (3 - 2 * x)); },
  });
  const mergeModel = (T) => {
    const full = T.INK / T.FLOOR;
    const mOf = (I) => {
      const want = T.areaFor(I);
      return clamp(want / full, K.MERGE_M_MIN, 1) + clamp((want - full) / Math.max(1e-6, 1 - full), 0, 1);
    };
    const touch = T.INK * K.MERGE_TOUCH_INK;
    const pitchOfM = (m) => clamp(m <= 1 ? T.FLOOR + (T.PMAX - T.FLOOR) * (1 - m)
      : Math.max(touch, T.FLOOR - (T.FLOOR - touch) * (m - 1)), T.INK * 0.9, T.PMAX);
    const PERIOD = T.FLOOR * K.MERGE_PERIOD_FLOOR;
    const minDuty = clamp(T.MARKMIN / PERIOD, 0, 0.95);
    return { mOf, pitchOfM, period: PERIOD, minDuty, pitchAt: (I) => pitchOfM(mOf(I)), lutAt: (I) => { const m = mOf(I); return m * PERIOD < T.MARKMIN ? 0 : 1 / pitchOfM(m); } };
  };

  // ---- tone model (light-realism U4) -----------------------------------------------------------------------------
  // `spec.toneModel` ('legacy' | 'v2'; the hub copies p.tone.model there) is part of the bake: dutyConst v2 bakes whole-cell
  // runs, so it is v2 only when the spec says so. A law whose v2 bake is the legacy MarkSet (endShorten) may also take the
  // model from the toneCtx (`light.model`, else `tone.model`). Absent everywhere = legacy, byte-identical.
  const bakeIsV2 = (spec) => !!spec && spec.toneModel === 'v2';
  const lutIsV2 = (spec, toneCtx) => {
    if (bakeIsV2(spec)) return true;
    if (spec && spec.toneLaw === 'dutyConst') return false;
    if (spec && typeof spec.toneModel === 'string') return false;
    const c = toneCtx || {};
    return ((c.light && c.light.model) || (c.tone && c.tone.model)) === 'v2';
  };
  const toneIsOff = (toneCtx) => !!toneCtx && ((toneCtx.tone && toneCtx.tone.enabled === false)
    || (toneCtx.light && Array.isArray(toneCtx.light.lights) && toneCtx.light.lights.length === 0));
  // v2 target: the law's own L*-linear span (areaFor) mapped to [0, 1] with NO lit floor (paper at the lightest tones),
  // times a short roll-off so the last PAPER_BAND of the tone range reaches paper. Coverage ~ this x the full-duty ink.
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

  const toneLUT = (spec, toneCtx) => {
    sync();
    const T = toneParams(spec);
    const size = cfg().TONE_LUT_SIZE || 256;
    const lut = new Float32Array(size + 1);
    const law = spec && spec.toneLaw;
    let fn;
    if ((law === 'dutyConst' || law === 'endShorten') && lutIsV2(spec, toneCtx)) {
      const pitch = (law === 'dutyConst' ? dutyModel(T) : endModel(T)).pitch;
      if (toneIsOff(toneCtx)) { // contract §5: tone off draws the uniform Density = the ladder's own tone-off ink (one ruling per lit pitch)
        const off = clamp(pitch / T.PMAX, 0, 1) / pitch;
        fn = () => off;
      } else { const D = targetOf(T); fn = (I) => D(I) / pitch; }
    }
    else if (law === 'dutyConst') { const M = dutyModel(T); fn = (I) => M.theta(I) / M.pitch; }
    else if (law === 'endShorten') { const M = endModel(T); fn = (I) => M.theta(I) / M.pitch; }
    else if (law === 'mergeLadder') { fn = mergeModel(T).lutAt; }
    else if (law === 'phaseBlue') { fn = (I) => 1 / T.pitchFor(I); }
    else throw new Error(`SurfaceLockLaws.toneLUT: unsupported law ${law}`);
    for (let k = 0; k <= size; k++) lut[k] = fn(k / size);
    return { lut, scaleFn: null };
  };

  // ---- supports ------------------------------------------------------------------------------------------------
  const primitiveOf = (spec) => (spec && typeof spec.primitive === 'string' && spec.primitive ? spec.primitive : (spec && spec.mode) || '');
  const supports = (spec) => {
    if (!spec || typeof spec !== 'object') return false;
    const prim = primitiveOf(spec);
    const style = spec.style || {};
    return FIT.some((row) => row.laws.indexOf(spec.toneLaw) !== -1
      && row.mappers.indexOf(spec.mapper) !== -1
      && row.primitives.indexOf(prim) !== -1
      && !Object.keys(row.refuse).some((k) => row.refuse[k].indexOf(style[k]) !== -1));
  };

  // ---- the ladder underneath ---------------------------------------------------------------------------------
  // Pose Density 0..100 -> hatchSpacing (ladder's private map, algorithms/scene3d.js hatchSpacing). The ladder's level-0
  // pitch is max(hatchSpacing(density), LIT_MAX_PITCH_PEN * pen), so a derived density sets the law's own p0.
  const densityForSpacing = (p) => clamp((14 - p) / 0.13, 0, K.HATCH_D_MAX);
  const ladderSpec = (spec, p0Screen) => Object.assign({}, spec, {
    toneLaw: 'ladder',
    style: Object.assign({}, spec.style, { fillDensity: densityForSpacing(p0Screen) }),
  });
  const bakeLadder = (spec, p0Screen) => {
    const L = ladder();
    const ls = ladderSpec(spec, p0Screen);
    if (!L || !L.supports(ls)) throw new Error('SurfaceLockLaws.bake: the ladder does not support this spec');
    return L.bake(ls);
  };

  // key <-> (level, rank), gain 2 (contract §5)
  const keyOfRun = (ms, r) => { const l = ms.runLevel[r]; const rk = MS().rankOf(ms, r); return l === 0 ? rk : Math.pow(2, l - 1) * (1 + rk); };
  const encodeKey = (k) => {
    const key = Math.max(0, k);
    if (key < 1) return { level: 0, rank: key };
    const level = Math.min(5, Math.floor(Math.log2(key)) + 1);
    return { level, rank: clamp(key / Math.pow(2, level - 1) - 1, 0, 0.999983) };
  };

  // ---- polyline helpers --------------------------------------------------------------------------------------
  const readRun = (ms, r, out) => {
    const v0 = ms.runStart[r]; const v1 = ms.runStart[r + 1];
    const closed = (ms.runFlags[r] & MS().FLAG.CLOSED) !== 0;
    const n = v1 - v0 + (closed ? 1 : 0);
    const px = new Float64Array(n); const py = new Float64Array(n); const pz = new Float64Array(n);
    const nx = new Float64Array(n); const ny = new Float64Array(n); const nz = new Float64Array(n);
    const s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = v0 + (i % (v1 - v0));
      px[i] = ms.positions[3 * v]; py[i] = ms.positions[3 * v + 1]; pz[i] = ms.positions[3 * v + 2];
      MS().octDecode(ms.normals, 2 * v, out); nx[i] = out[0]; ny[i] = out[1]; nz[i] = out[2];
      if (i) s[i] = s[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1], pz[i] - pz[i - 1]);
    }
    return { n, px, py, pz, nx, ny, nz, s, total: s[n - 1] };
  };
  const emitSub = (B, R, sa, sb, key, fam, tmp) => {
    if (!(sb - sa > 1e-6)) return 0;
    const at = (x) => { // segment index with s[i] <= x <= s[i+1]
      let lo = 0; let hi = R.n - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R.s[mid] <= x) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const pt = (x) => {
      const i = at(x); const d = R.s[i + 1] - R.s[i]; const u = d > 0 ? clamp((x - R.s[i]) / d, 0, 1) : 0;
      let ax = R.nx[i] + (R.nx[i + 1] - R.nx[i]) * u; let ay = R.ny[i] + (R.ny[i + 1] - R.ny[i]) * u; let az = R.nz[i] + (R.nz[i + 1] - R.nz[i]) * u;
      const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
      B.vertex(R.px[i] + (R.px[i + 1] - R.px[i]) * u, R.py[i] + (R.py[i + 1] - R.py[i]) * u, R.pz[i] + (R.pz[i + 1] - R.pz[i]) * u, ax, ay, az);
    };
    const e = encodeKey(key);
    B.beginRun(e.level, e.rank, fam, 0, tmp.capRank);
    pt(sa);
    for (let i = at(sa) + 1; i < R.n && R.s[i] < sb - 1e-9; i++) if (R.s[i] > sa + 1e-9) B.vertex(R.px[i], R.py[i], R.pz[i], R.nx[i], R.ny[i], R.nz[i]);
    pt(sb);
    tmp.count += 1;
    return B.endRun() ? 1 : 0;
  };
  const copyRun = (B, ms, r, key, fam, tmp, dx, dy, dz) => {
    const e = encodeKey(key);
    B.beginRun(e.level, e.rank, fam, ms.runFlags[r]);
    const out = [0, 0, 0];
    for (let v = ms.runStart[r]; v < ms.runStart[r + 1]; v++) {
      MS().octDecode(ms.normals, 2 * v, out);
      B.vertex(ms.positions[3 * v] + (dx ? dx[v - ms.runStart[r]] : 0), ms.positions[3 * v + 1] + (dy ? dy[v - ms.runStart[r]] : 0), ms.positions[3 * v + 2] + (dz ? dz[v - ms.runStart[r]] : 0), out[0], out[1], out[2]);
    }
    tmp.count += ms.runStart[r + 1] - ms.runStart[r];
    B.endRun();
  };

  // ---- tone model v2 helpers: decimated polylines (vertices are the frame's cost, contract §2) ---------------------------
  const vdc2 = (i) => { let x = 0; let f = 0.5; let n = i | 0; while (n > 0) { if (n & 1) x += f; n >>= 1; f *= 0.5; } return x; };
  const rawPoints = (R) => {
    const P = new Array(R.n);
    for (let i = 0; i < R.n; i++) P[i] = [R.px[i], R.py[i], R.pz[i], R.nx[i], R.ny[i], R.nz[i]];
    return P;
  };
  const lerpPt = (a, b, u) => {
    let nx = a[3] + (b[3] - a[3]) * u; let ny = a[4] + (b[4] - a[4]) * u; let nz = a[5] + (b[5] - a[5]) * u;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, nx, ny, nz];
  };
  // Points of the ruling between arc lengths sa and sb: interpolated ends plus the original vertices strictly inside.
  const cellPoints = (R, sa, sb) => {
    const at = (x) => {
      let lo = 0; let hi = R.n - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R.s[mid] <= x) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const pt = (x) => {
      const i = at(x); const d = R.s[i + 1] - R.s[i]; const u = d > 0 ? clamp((x - R.s[i]) / d, 0, 1) : 0;
      return lerpPt([R.px[i], R.py[i], R.pz[i], R.nx[i], R.ny[i], R.nz[i]], [R.px[i + 1], R.py[i + 1], R.pz[i + 1], R.nx[i + 1], R.ny[i + 1], R.nz[i + 1]], u);
    };
    const out = [pt(sa)];
    for (let i = at(sa) + 1; i < R.n && R.s[i] < sb - 1e-9; i++) if (R.s[i] > sa + 1e-9) out.push([R.px[i], R.py[i], R.pz[i], R.nx[i], R.ny[i], R.nz[i]]);
    out.push(pt(sb));
    return out;
  };
  // Douglas-Peucker to `tol` (GeometryUtils.simplifyKeep3, the shared simplifier), then no segment longer than `maxSeg` (the tone
  // is sampled at vertices, so long straight runs would be gated by their two ends only).
  const decimate = (P, tol, maxSeg) => {
    const keep = Vectura.GeometryUtils.simplifyKeep3(P, tol);
    const n = P.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!keep[i]) continue;
      if (out.length) {
        const a = out[out.length - 1]; const len = Math.hypot(P[i][0] - a[0], P[i][1] - a[1], P[i][2] - a[2]);
        const k = Math.ceil(len / maxSeg);
        for (let j = 1; j < k; j++) out.push(lerpPt(a, P[i], j / k));
      }
      out.push(P[i]);
    }
    return out;
  };
  const emitPoly = (B, P, key, fam, flags, capRank, tmp) => {
    const e = encodeKey(key);
    B.beginRun(e.level, e.rank, fam, flags || 0, capRank);
    for (let i = 0; i < P.length; i++) B.vertex(P[i][0], P[i][1], P[i][2], P[i][3], P[i][4], P[i][5]);
    tmp.count += P.length;
    B.endRun();
  };

  // Centre-out band edges in duty: [0, minDuty, ... 1], BANDS bands. Band j >= 1 switches on at its midpoint.
  const bandEdges = (minDuty) => {
    const nb = Math.max(2, Math.round(K.BANDS)); const e = [0, minDuty];
    for (let j = 2; j <= nb; j++) e.push(minDuty + (1 - minDuty) * (j - 1) / (nb - 1));
    return e;
  };
  // Cut one ruling into period cells and each cell into centre-out bands; keyOfBand(j) -> run key.
  const dashRun = (B, R, cellLen, phase01, edges, keyOfBand, fam, tmp) => {
    const half = cellLen / 2;
    const budget = () => { if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded'); };
    for (let c0 = -phase01 * cellLen; c0 < R.total; c0 += cellLen) {
      const c = c0 + half;
      // Emitted in order ALONG the ruling (outermost left band ... centre ... outermost right band), so bands that touch are
      // consecutive runs and the frame can join them back into one dash (meta.joinTouching).
      const nb = edges.length - 1;
      for (let j = nb - 1; j >= 1; j--) emitSub(B, R, clamp(c - edges[j + 1] * half, 0, R.total), clamp(c - edges[j] * half, 0, R.total), keyOfBand(j), fam, tmp);
      emitSub(B, R, clamp(c - edges[1] * half, 0, R.total), clamp(c + edges[1] * half, 0, R.total), keyOfBand(0), fam, tmp);
      for (let j = 1; j < nb; j++) emitSub(B, R, clamp(c + edges[j] * half, 0, R.total), clamp(c + edges[j + 1] * half, 0, R.total), keyOfBand(j), fam, tmp);
      budget();
    }
  };

  // ---- the bake ----------------------------------------------------------------------------------------------
  const bake = (spec) => {
    sync();
    const law = spec && spec.toneLaw;
    if (!supports(spec)) throw new Error(`SurfaceLockLaws.bake: unsupported spec (law ${law})`);
    const T = toneParams(spec);
    const scaleRef = finite(spec.scaleRef, 1) > 0 ? spec.scaleRef : 1;
    const phase = Number.isFinite(spec.seed && spec.seed.phase) ? frac(spec.seed.phase) : 0;
    const litCap = (Number.isFinite(regions().LIT_MAX_PITCH_PEN) ? regions().LIT_MAX_PITCH_PEN : K.LIT_MAX_PITCH_PEN) * T.PEN;
    const fixed = law === 'dutyConst' || law === 'endShorten';
    const v2 = fixed && bakeIsV2(spec);
    let model = null; let lstar = 0; let p0Screen;
    if (fixed) {
      model = law === 'dutyConst' ? dutyModel(T) : endModel(T);
      lstar = Math.max(0, Math.ceil(Math.log2(litCap / model.pitch)));
      p0Screen = model.pitch * Math.pow(2, lstar);
    } else p0Screen = T.PMAX;
    const lad = bakeLadder(spec, p0Screen);
    const SM = MS();
    const B = SM.createBuilder({ bakerId: 'laws', key: String(spec.key || ''), objectId: String(spec.objectId || '') });
    const tmp = { count: 0 };
    const meta = Object.assign({}, lad.meta, { lawId: law, gain: 2, toneModel: 'pitch', scaleRef });
    const out = [0, 0, 0];
    const nr = lad.runCount;

    if (fixed) {
      const gate = Math.pow(2, lstar);
      const pEff = lad.meta.p0 / gate;            // the single ruling pitch (object mm)
      const rho = (pEff * scaleRef) / model.pitch; // t = rho * theta at the bake scale
      meta.p0 = pEff; meta.rho = rho; meta.lstar = lstar;
      // Fixed-pitch laws: tone is a function of the light alone, so the frame reads it at the bake scale (contract §16 A10).
      meta.toneScaleFree = true;
      let idx = 0;
      if (v2) { meta.toneModelV2 = true; meta.v2Tol = K.V2_TOL_MM; }
      if (law === 'endShorten') {
        for (let r = 0; r < nr; r++) {
          if (lad.runLevel[r] > lstar) continue;
          const closedRun = (lad.runFlags[r] & SM.FLAG.CLOSED) !== 0;
          if (v2 && !closedRun) {
            const R = readRun(lad, r, out);
            emitPoly(B, decimate(rawPoints(R), K.V2_TOL_MM, K.V2_MAX_SEG_MM), rho * keyOfRun(lad, r) / gate, lad.runFamily[r], lad.runFlags[r], undefined, tmp);
            if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded');
            continue;
          }
          copyRun(B, lad, r, rho * keyOfRun(lad, r) / gate, lad.runFamily[r], tmp);
          if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded');
        }
      } else if (v2) {
        // v2 dutyConst: one run per period cell (2 vertices on a gentle surface). The tone is the FRACTION of cells drawn:
        // a cell is on iff the target duty exceeds its low-discrepancy key, so coverage is exactly graded from a continuous
        // ruling in the shadow to paper in the light (no minimum-dash cliff) and the on-cells of a tone are a subset of the
        // on-cells of every darker tone (monotone by construction). Touching cells are joined by the frame (A11).
        const cellLen = model.period / scaleRef;
        const minCell = T.MARKMIN / scaleRef;
        let idx = 0;
        for (let r = 0; r < nr; r++) {
          if (lad.runLevel[r] > lstar) continue;
          const R = readRun(lad, r, out);
          const capRank = keyOfRun(lad, r) / gate;
          const ph = frac((idx + 1) * K.GOLDEN + phase);
          let c = 0;
          for (let c0 = -ph * cellLen; c0 < R.total; c0 += cellLen, c++) {
            const sa = clamp(c0, 0, R.total); const sb = clamp(c0 + cellLen, 0, R.total);
            if (!(sb - sa >= minCell)) continue;
            emitPoly(B, decimate(cellPoints(R, sa, sb), K.V2_TOL_MM, K.V2_MAX_SEG_MM), rho * frac(vdc2(c) + ph), lad.runFamily[r], 0, capRank, tmp);
          }
          if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded');
          idx += 1;
        }
        meta.minMarkMM = T.MARKMIN;
        meta.capKey = 'ruling';
        meta.joinTouching = true;
      } else {
        const edges = bandEdges(model.minDuty);
        const mids = edges.map((e, j) => (j === 0 ? 0 : (e + edges[j + 1] ) / 2)); // last entry unused
        for (let j = 1; j < edges.length - 1; j++) mids[j] = (edges[j] + edges[j + 1]) / 2;
        for (let r = 0; r < nr; r++) {
          if (lad.runLevel[r] > lstar) continue;
          const R = readRun(lad, r, out);
          // Every band of ruling r carries the ruling's own ladder rank as its CAP key (contract A13): the plot-floor cap thins
          // RULINGS (their key space), never duty bands (which would shrink every dash to its centre band).
          tmp.capRank = keyOfRun(lad, r) / gate;
          dashRun(B, R, model.period / scaleRef, frac((idx + 1) * K.GOLDEN + phase), edges, (j) => (j === 0 ? 0 : rho * mids[j]), lad.runFamily[r], tmp);
          tmp.capRank = undefined;
          idx += 1;
        }
        meta.minMarkMM = 0;
        meta.minDuty = model.minDuty;
        meta.capKey = 'ruling';
        meta.joinTouching = true; // the duty bands of one dash are separate runs; the frame joins the ones that touch (A11)
      }
    } else if (law === 'mergeLadder') {
      const M = mergeModel(T);
      const p0Eff = lad.meta.p0 * scaleRef;                // screen mm at the bake scale
      const touchKey = p0Eff / T.FLOOR;                    // density multiple at which the pitch reaches the plot floor (m = 1)
      meta.touchKey = touchKey; meta.minMarkMM = 0; meta.minDuty = M.minDuty;
      const edges = bandEdges(M.minDuty);
      const bandKey = edges.map((e, j) => (j === 0 ? 0 : p0Eff / M.pitchOfM((e + edges[j + 1]) / 2)));
      for (let r = 0; r < nr; r++) {
        const kR = keyOfRun(lad, r);
        if (kR >= touchKey) { copyRun(B, lad, r, kR, lad.runFamily[r], tmp); continue; }
        const R = readRun(lad, r, out);
        dashRun(B, R, M.period / scaleRef, 0, edges, (j) => Math.max(kR, bandKey[j]), lad.runFamily[r], tmp);
        if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded');
      }
    } else { // phaseBlue
      const pf = lad.meta.p0 / Math.pow(2, Math.max(0, lad.levels - 1));
      meta.jitterFrac = K.JIT_FRAC;
      for (let r = 0; r < nr; r++) {
        const v0 = lad.runStart[r]; const n = lad.runStart[r + 1] - v0;
        const d = (frac((r + 1) * K.GOLDEN + phase) - 0.5) * K.JIT_FRAC * pf;
        const dx = new Float64Array(n); const dy = new Float64Array(n); const dz = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const a = v0 + Math.max(0, i - 1); const b = v0 + Math.min(n - 1, i + 1);
          const tx = lad.positions[3 * b] - lad.positions[3 * a]; const ty = lad.positions[3 * b + 1] - lad.positions[3 * a + 1]; const tz = lad.positions[3 * b + 2] - lad.positions[3 * a + 2];
          SM.octDecode(lad.normals, 2 * (v0 + i), out);
          let mx = out[1] * tz - out[2] * ty; let my = out[2] * tx - out[0] * tz; let mz = out[0] * ty - out[1] * tx;
          const l = Math.hypot(mx, my, mz);
          if (l > 1e-12) { mx /= l; my /= l; mz /= l; dx[i] = mx * d; dy[i] = my * d; dz[i] = mz * d; }
        }
        copyRun(B, lad, r, keyOfRun(lad, r), lad.runFamily[r], tmp, dx, dy, dz);
      }
    }
    const ms = B.finish();
    ms.bakerId = 'laws';
    if (law === 'phaseBlue' || law === 'endShorten') meta.minMarkMM = finite(lad.meta.minMarkMM, 2 * T.PEN);
    if (law === 'phaseBlue') meta.p0 = lad.meta.p0;
    if (law === 'mergeLadder') meta.p0 = lad.meta.p0;
    ms.meta = meta;
    return ms;
  };

  Scene3D.SurfaceLockLaws = {
    id: 'laws',
    FIT,
    supports,
    bake,
    toneLUT,
    debug: { ladderFor: (spec) => { sync(); const T = toneParams(spec); return bakeLadder(spec, T.PMAX); } },
  };
})();
