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

  const toneLUT = (spec) => {
    sync();
    const T = toneParams(spec);
    const size = cfg().TONE_LUT_SIZE || 256;
    const lut = new Float32Array(size + 1);
    const law = spec && spec.toneLaw;
    let fn;
    if (law === 'dutyConst') { const M = dutyModel(T); fn = (I) => M.theta(I) / M.pitch; }
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
    B.beginRun(e.level, e.rank, fam, 0);
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
      for (let j = 0; j < edges.length - 1; j++) {
        const key = keyOfBand(j);
        const a = edges[j] * half; const b = edges[j + 1] * half;
        if (j === 0) emitSub(B, R, clamp(c - b, 0, R.total), clamp(c + b, 0, R.total), key, fam, tmp);
        else {
          emitSub(B, R, clamp(c - b, 0, R.total), clamp(c - a, 0, R.total), key, fam, tmp);
          emitSub(B, R, clamp(c + a, 0, R.total), clamp(c + b, 0, R.total), key, fam, tmp);
        }
      }
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
      let idx = 0;
      if (law === 'endShorten') {
        for (let r = 0; r < nr; r++) {
          if (lad.runLevel[r] > lstar) continue;
          copyRun(B, lad, r, rho * keyOfRun(lad, r) / gate, lad.runFamily[r], tmp);
          if (tmp.count > K.MAX_VERTS) throw new Error('SurfaceLockLaws.bake: vertex budget exceeded');
        }
      } else {
        const edges = bandEdges(model.minDuty);
        const mids = edges.map((e, j) => (j === 0 ? 0 : (e + edges[j + 1] ) / 2)); // last entry unused
        for (let j = 1; j < edges.length - 1; j++) mids[j] = (edges[j] + edges[j + 1]) / 2;
        for (let r = 0; r < nr; r++) {
          if (lad.runLevel[r] > lstar) continue;
          const R = readRun(lad, r, out);
          dashRun(B, R, model.period / scaleRef, frac((idx + 1) * K.GOLDEN + phase), edges, (j) => (j === 0 ? 0 : rho * mids[j]), lad.runFamily[r], tmp);
          idx += 1;
        }
        meta.minMarkMM = 0;
        meta.minDuty = model.minDuty;
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
