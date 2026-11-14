/**
 * Scene3D.SurfaceLockLadder — the surface-locked ladder-family bakers: hatch, crosshatch, contour,
 * spiral, stipple (docs/surface-lock-contract.md §9 "Ladder family").
 *
 *   supports(spec) -> boolean       exactly the FIT rows minus their refuse rules
 *   bake(spec) -> MarkSet           pure and deterministic; reads geometry, style, pen, scaleRef and seed only
 *   toneLUT(spec, toneCtx) -> { lut, scaleFn }
 *
 * The bake is POSE-FREE: every spacing is measured in object millimetres through the chart metric
 * (SurfaceLockChart), never on screen, never from a camera, light or tone setting.
 *
 * Layout of the marks (all levels, one MarkSet):
 *   - level 0 is the sparsest pitch the law ever asks for (`p0`); level l adds marks so that every level
 *     <= l has pitch p0 / 2^l (lines: gain 2, dots: gain 4 = pitch / 2 in both axes);
 *   - line families (hatch, crosshatch family 0, contour) are straight chart lines on a dyadic grid of
 *     intercepts: ruling m of N = n0 * 2^(L-1) cells gets level L-1-ctz(m) and a bit-reversed rank inside its
 *     level, so every threshold subset is evenly spaced. Where the chart converges (poles, the inside of a
 *     torus) the local pitch of a level would drop under 0.8 of its target: finer rulings are cut there and
 *     the coarse ones thin out by halves, exactly like a fan;
 *   - the 65 degree cross (crosshatch family 1) is built in the tangent plane: streamlines of the
 *     family-0 direction rotated about the surface normal, placed by Jobard-Lefer with 3D occupancy, level by
 *     level (each level inserts into the gaps of the levels before it);
 *   - spiral: one helix at level 0; level l adds the 2^(l-1) helices that interleave it, chained into ONE run
 *     through the poles when the chart has poles at both ends of a;
 *   - stipple: rows at equal arc length along a (nested dyadically), a power-of-two column count per row
 *     (nested dyadically), level = max(row level, column level), DOT runs.
 * The pose-mode ladder accumulator, feather and hysteresis are NOT ported (they are sequential, not nested).
 */
(function registerScene3DSurfaceLockLadder() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // ---- constants: tuning values live in Vectura.SCENE3D_SURFACE_LOCK (LADDER namespace + shared keys). The table
  // below is the safe fallback when the config is not loaded; `sync()` refreshes `C` from the config on every bake.
  const DEFAULTS = {
    STEP_MM: 0.5,
    GRID: 25,
    TONE_SUBDIV: 5,
    GLINT_KEEP: 0.6,
    LIT_FLOOR: 0.12,
    THIN_RATIO: 0.95,
    MIN_SEP_FRAC: 0.84, // measured worst local ruling pitch / nominal (hatch, default sphere); the law's separation bar reads it
    V_EXTRA: 4,
    MAX_VERTS: 150000,
    MAX_CELLS: 4096,
    JL_SEED_FRAC: 0.9,
    JL_STOP_FRAC: 0.85,
    JL_HASH_DIV: 2.5,
    JL_MAX_STEPS: 2600,
    FD_EPS: 1 / 65536,
    FD_EDGE: 2e-3,
    GOLDEN: 0.6180339887498949,
    DOT_SEGS: 8,
    DOT_COL_FILL: 0.85,
    DOT_CLEAR: 2.4,
    PLOT_FLOOR_SLACK: 0.8,
    ZOOM_HEADROOM: 1.5,
    RELABEL_MIN_MM: 4, // FX-R: a relabel piece shorter than this (object mm) takes its finer neighbour's label
    RELABEL_STAGGER: 0.5, // FX-R: relabel fronts shift toward the coarse side by up to this x the coarse piece, per ruling
    V2_P0_PEN: 3.6, // tone model v2: the darkest pitch at Density 0, in pens (mirrors the config)
    V2_DENSITY_EXP: 14, // tone model v2: Density -> darkest pitch curve (mirrors the config)
    V2_TAIL_PEN: 0.24, // tone model v2: Density 50..200 tail of the darkest pitch, in pens (mirrors the config)
    V2_TAIL_EXP: 1.0, //
    V2_DARK_MIN_PEN: 1.25, // tone model v2: the densest darkest pitch (Density 200), in pens (mirrors the config) tone model v2: exponent of that tail (mirrors the config)
    V2_PAPER_BAND: 0.15, // tone model v2: the lightest 15 % of the tone range rolls off to paper (no lit floor)
  };
  const C = Object.assign({}, DEFAULTS);
  const CONVEX_MODES = { sphere: true, cylinder: true, cone: true, capsule: true };

  const FIT_MAPPERS = ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'];
  const FIT_PRIMITIVES = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus'];
  const FIT = Object.freeze([Object.freeze({
    mappers: Object.freeze(FIT_MAPPERS.slice()),
    laws: Object.freeze(['ladder']),
    primitives: Object.freeze(FIT_PRIMITIVES.slice()),
    refuse: Object.freeze({
      tripleHatch: Object.freeze([true]),
      spiralMode: Object.freeze(['flatClip']),
      contourStyle: Object.freeze(['region']),
      dotShape: Object.freeze(['ring', 'cross', 'plus', 'tick']),
    }),
  })]);
  const PRIM_MODE = { sphere: 'sphere', ellipsoid: 'sphere', cylinder: 'cylinder', cone: 'cone', capsule: 'capsule', torus: 'torus' };

  // ---- small helpers ---------------------------------------------------------------------------------------
  const finite = (v, d) => (Number.isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cfg = () => Vectura.SCENE3D_SURFACE_LOCK || {};
  const sync = () => {
    const t = cfg(); const own = t.LADDER || {};
    Object.keys(DEFAULTS).forEach((k) => { const v = Object.prototype.hasOwnProperty.call(own, k) ? own[k] : t[k]; C[k] = Number.isFinite(v) ? v : DEFAULTS[k]; });
    return C;
  };
  const MS = () => Scene3D.SurfaceLockMarkSet;
  const CH = () => Scene3D.SurfaceLockChart;
  const regions = () => Scene3D.Regions || {};
  const plotFloorPen = () => (Number.isFinite(regions().PLOT_FLOOR_PEN) ? regions().PLOT_FLOOR_PEN : 2.2);
  // Tone model v2 has its own, lower plot floor (config V2.FLOOR_PEN, owner decision "go darker"); legacy keeps plotFloorPen().
  const v2GuardPen = () => { const v = cfg().V2 && cfg().V2.GUARD_PEN; return Number.isFinite(v) && v > 1 ? v : 1.3; };
  const v2FloorPen = () => { const v = cfg().V2 && cfg().V2.FLOOR_PEN; return Number.isFinite(v) && v > 1 ? v : 1.4; };
  const litMaxPitchPen = () => (Number.isFinite(regions().LIT_MAX_PITCH_PEN) ? regions().LIT_MAX_PITCH_PEN : 12);
  const ctz = (m) => (m === 0 ? 99 : 31 - Math.clz32(m & -m));
  const vdc2 = (i) => {
    let n = i >>> 0; let r = 0; let f = 0.5;
    while (n) { if (n & 1) r += f; n >>>= 1; f *= 0.5; }
    return r;
  };
  const frac = (v) => v - Math.floor(v);
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = Float64Array.from(arr).sort();
    return s[s.length >> 1];
  };
  const now = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : 0);

  // ---- FIT / supports --------------------------------------------------------------------------------------
  const primitiveOf = (spec) => {
    if (spec && typeof spec.primitive === 'string' && spec.primitive) return spec.primitive;
    const m = spec && spec.mode;
    return m === 'sphere' ? 'sphere' : (typeof m === 'string' ? m : '');
  };
  const supports = (spec) => {
    if (!spec || typeof spec !== 'object') return false;
    const law = spec.toneLaw;
    const prim = primitiveOf(spec);
    const style = spec.style || {};
    return FIT.some((row) => {
      if (row.mappers.indexOf(spec.mapper) === -1) return false;
      if (!(law === undefined || law === null || law === '' || row.laws.indexOf(law) !== -1)) return false;
      if (row.primitives.indexOf(prim) === -1) return false;
      if (spec.mode !== undefined && spec.mode !== PRIM_MODE[prim]) return false;
      return !Object.keys(row.refuse || {}).some((k) => row.refuse[k].indexOf(style[k]) !== -1);
    });
  };

  // ---- the pitch law (shared by bake and toneLUT) ----------------------------------------------------------
  // Screen spacing of the user's Density (algorithms/scene3d.js hatchSpacing, 0..200; flat above).
  const hatchSpacing = (density) => {
    const d = clamp(finite(density, 50), 0, 500);
    if (d <= 100) return Math.max(1, 14 - 0.13 * d);
    return 1 - Math.min(1, (d - 100) / 100) * 0.55;
  };
  const read = (spec) => {
    const st = (spec && spec.style) || {};
    const pen = Math.max(0.02, finite(spec && spec.penWidth, 0.3));
    const sc = (spec && spec.scale) || {};
    return {
      st, pen,
      density: clamp(finite(st.fillDensity, 50), 0, 500),
      angle: finite(st.fillAngle, 45),
      crossDelta: clamp(finite(st.crossAngleDelta, 90), 10, 170),
      crossRatio: clamp(finite(st.crossDensityRatio, 1), 0.25, 2),
      dotR: clamp(finite(st.dotSize, 0.7), 0.1, 3),
      scaleRef: finite(spec && spec.scaleRef, 1) > 0 ? spec.scaleRef : 1,
      scale: { sx: finite(sc.sx, 1), sy: finite(sc.sy, 1), sz: finite(sc.sz, 1) },
      seed: (spec && spec.seed && typeof spec.seed === 'object') ? spec.seed : {},
      stipple: spec && spec.mapper === 'stipple',
      v2: !!spec && spec.toneModel === 'v2',
      cross: !!spec && spec.mapper === 'crosshatch',
    };
  };
  const floorOf = (r) => {
    const f = (r.v2 ? v2FloorPen() : plotFloorPen()) * r.pen;
    return r.stipple ? Math.max(f, C.DOT_CLEAR * r.dotR) : f;
  };
  const masterPitch = (r) => Math.max(floorOf(r), hatchSpacing(r.density) / C.TONE_SUBDIV);
  const litCap = (r) => litMaxPitchPen() * r.pen;
  const p0Screen = (r) => Math.max(hatchSpacing(r.density), litCap(r));

  // Coverage the pose-mode ladder asks for at intensity I (surface-fill coverageForSample).
  const coverageAt = (I, tone, specOn, specSize) => {
    const R = regions();
    const nB = tone.ladder.filter(Number.isFinite).length;
    const b = R.band(I, tone);
    let cov = R.coverageFor(nB - 1 - b, tone);
    if (b === nB - 1) {
      const raw = cov;
      if (specOn) cov *= clamp(1 - 0.5 * specSize, 0, 1);
      cov = Math.max(cov, raw * C.GLINT_KEEP, C.LIT_FLOOR);
    }
    return clamp(cov, 0, 1);
  };

  // ---- tone model v2 (light-realism U6) ---------------------------------------------------------------------------
  // `spec.toneModel === 'v2'` (the hub copies p.tone.model there; it is part of the bake key) selects a continuous, L*-linear
  // tone curve with NO lit floor: coverage runs from the Density-set dark coverage down to paper, with a short roll-off over
  // the lightest V2_PAPER_BAND. Absent or 'legacy' = the three-band curve below, byte-identical.
  const isV2 = (spec) => !!spec && spec.toneModel === 'v2';
  // Darkest pitch (screen mm). Density runs 0..200 across the WHOLE range (the legacy master pitch hits the plot floor at about
  // Density 82, so 100 and 200 were identical): floor + (P0 - floor) * (1 - d/200)^exp.
  // The tail term keeps Density 100 and 200 apart (the v2 plot floor is reached by about Density 80 otherwise): see V2_TAIL_PEN.
  const darkPitchV2 = (r) => {
    const floor = r.stipple ? floorOf(r) : Math.max(C.V2_DARK_MIN_PEN * r.pen, v2GuardPen() * r.pen);
    const g = clamp(1 - r.density / 200, 0, 1);
    const tail = Math.max(0, C.V2_TAIL_PEN) * r.pen;
    const p0 = Math.max(floor * 2.2, C.V2_P0_PEN * r.pen);
    let pd = floor + tail * Math.pow(g, Math.max(0.2, C.V2_TAIL_EXP)) + Math.max(0, p0 - floor - tail) * Math.pow(g, Math.max(0.2, C.V2_DENSITY_EXP));
    // Crosshatch draws TWO families whose coverages add (a union 1 - (1 - a)^2): each carries the share that makes the pair reach the
    // same dark end as a single family does.
    if (r.cross && !r.stipple) { const c1 = clamp(r.pen / pd, 0.02, 0.95); pd = r.pen / (1 - Math.sqrt(1 - c1)); }
    return pd;
  };
  const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
  const invLstar = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
  // Relative darkness d(I) in [0, 1]: 1 at I = 0, 0 at I = 1; L*-linear between paper and the dark coverage, times the roll-off.
  const relDarkV2 = (covDark) => {
    const lDark = Lstar(1 - covDark); const lLight = Lstar(1);
    const band = Math.max(1e-3, C.V2_PAPER_BAND);
    return (I) => {
      const x = clamp(finite(I, 0), 0, 1);
      const cov = 1 - invLstar(lDark + (lLight - lDark) * x);
      const u = clamp((1 - x) / band, 0, 1);
      return clamp(1.1 * cov / covDark, 0, 1) * u * u * (3 - 2 * u); // 1.1: a short dark shoulder (the finest level cannot quite reach the nominal dark pitch)
    };
  };
  const toneIsOffV2 = (ctx) => !!ctx && ((ctx.tone && ctx.tone.enabled === false)
    || (ctx.light && Array.isArray(ctx.light.lights) && ctx.light.lights.length === 0));
  const toneLutV2 = (spec, toneCtx) => {
    sync();
    const r = read(spec);
    const n = (cfg().TONE_LUT_SIZE || 256) + 1;
    const lut = new Float32Array(n);
    if (toneIsOffV2(toneCtx) || !(toneCtx && toneCtx.tone)) { // contract §5: tone off = the user's Density, uniform
      lut.fill(1 / Math.max(floorOf(r), hatchSpacing(r.density)));
      return { lut, scaleFn: null };
    }
    const pd = darkPitchV2(r);
    const covDark = r.stipple ? clamp(Math.PI * r.dotR * r.dotR / (pd * pd), 0.02, 0.95) : clamp(r.pen / pd, 0.02, 0.95);
    const rel = relDarkV2(covDark);
    for (let k = 0; k < n; k++) {
      const d = rel(k / (n - 1));
      // lines: coverage ~ 1 / pitch; dots: coverage ~ area ~ 1 / pitch^2. The specular glint is the hub's scaleFn (U1 specularKeep).
      lut[k] = (r.stipple ? Math.sqrt(d) : d) / pd;
    }
    return { lut, scaleFn: null };
  };

  const toneLUT = (spec, toneCtx) => {
    if (isV2(spec)) return toneLutV2(spec, toneCtx);
    sync();
    const r = read(spec);
    const ctx = toneCtx || {};
    const tone = ctx.tone || null;
    const n = (cfg().TONE_LUT_SIZE || 256) + 1;
    const lut = new Float32Array(n);
    const floor = floorOf(r);
    const toneOn = Boolean(tone && tone.enabled && Array.isArray(tone.ladder)
      && tone.ladder.filter(Number.isFinite).length >= 1
      && typeof regions().band === 'function' && typeof regions().coverageFor === 'function');
    if (!toneOn) {
      // Tone off: the user's Density, uniform (pose mode: hatching is light-invariant).
      const pitch = Math.max(floor, hatchSpacing(r.density));
      lut.fill(1 / pitch);
      return { lut, scaleFn: null };
    }
    const noHL = ctx.noHighlight === true || ctx.highlight === 'none';
    const specOn = Boolean(!noHL && tone.specular && tone.specular.enabled !== false);
    const specSize = specOn ? clamp(finite(tone.specular.size, 1), 0, 3) : 0;
    const master = masterPitch(r); const cap = litCap(r);
    for (let k = 0; k < n; k++) {
      const cov = Math.max(1e-6, coverageAt((k / (n - 1)), tone, specOn, specSize));
      // lines: pitch = master / coverage (a coverage IS a pitch field); dots: area ~ coverage, pitch = master / sqrt.
      const pitch = Math.min(r.stipple ? master / Math.sqrt(cov) : master / cov, cap);
      lut[k] = 1 / Math.max(floor, pitch);
    }
    // The glint cap is a function of intensity only in pose mode, so it is folded into the LUT; scaleFn stays null.
    return { lut, scaleFn: null };
  };

  // ---- chart survey ----------------------------------------------------------------------------------------
  const survey = (M) => {
    const G = C.GRID; const n = G * G;
    const pa = new Float64Array(3 * n); const pb = new Float64Array(3 * n);
    const la = []; const lb = []; const perpA = []; const perpB = [];
    let area = 0; let cnt = 0;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const s = M.sample((i + 0.5) / G, (j + 0.5) / G);
        if (!s) continue;
        const A = Math.hypot(s.dax, s.day, s.daz); const B = Math.hypot(s.dbx, s.dby, s.dbz);
        if (!(A > 1e-9) || !(B > 1e-9)) continue;
        const cx = s.day * s.dbz - s.daz * s.dby; const cy = s.daz * s.dbx - s.dax * s.dbz; const cz = s.dax * s.dby - s.day * s.dbx;
        area += Math.hypot(cx, cy, cz); cnt += 1;
        la.push(A); lb.push(B);
        const d = (s.dax * s.dbx + s.day * s.dby + s.daz * s.dbz) / (A * B);
        perpA.push(A * Math.sqrt(Math.max(0, 1 - d * d))); perpB.push(B * Math.sqrt(Math.max(0, 1 - d * d)));
      }
    }
    return { medA: median(la), medB: median(lb), perpA: median(perpA), perpB: median(perpB), area: cnt ? area / cnt : 0 };
  };

  // Perpendicular mm per unit of the intercept parameter: |u - (u . t)t| with u = dP/d(intercept), t = ruling tangent.
  const perpOf = (ux, uy, uz, tx, ty, tz) => {
    const tl = Math.hypot(tx, ty, tz) || 1; const ex = tx / tl; const ey = ty / tl; const ez = tz / tl;
    const d = ux * ex + uy * ey + uz * ez;
    return Math.hypot(ux - d * ex, uy - d * ey, uz - d * ez);
  };

  // ---- the bake --------------------------------------------------------------------------------------------
  const bake = (spec) => {
    sync();
    const t0 = now();
    const SM = MS(); const SC = CH();
    const r = read(spec);
    const prim = primitiveOf(spec);
    const mode = spec.mode || PRIM_MODE[prim];
    const M = SC.metric(mode, spec.sizes || {}, r.scale);
    const maxLevels = cfg().MAX_LEVELS || 6;
    const salt = finite(r.seed.salt, 0) | 0;
    const phase = Number.isFinite(r.seed.phase) ? frac(r.seed.phase) : SC.hash(salt, 7, 11);
    const dots = r.stipple;
    const gain = dots ? 4 : 2;
    const mapper = spec.mapper;
    const cross = mapper === 'crosshatch';

    const meta = { bakerId: 'ladder', key: String(spec.key || ''), objectId: String(spec.objectId || '') };
    if (!M) {
      const b0 = SM.createBuilder(meta);
      const ms0 = b0.finish();
      ms0.meta = { p0: 1, gain, toneModel: dots ? 'area' : 'pitch', scaleRef: r.scaleRef, minMarkMM: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0], radius: 0 }, convex: false, msBake: 0 };
      return ms0;
    }
    const S = survey(M);
    const floor = floorOf(r);
    const p0S = p0Screen(r);
    const p0 = p0S / r.scaleRef;                       // level-0 pitch, scaled local mm
    // Level count (contract §9) with a vertex budget guard.
    // minPitch is the darkest screen pitch the law can ever ask for (coverage <= 1): finer levels are never drawn.
    // The level count is the legacy one for v2 too: SurfaceLockLaws (dutyConst / endShorten, U4) bakes its ladder through this
    // function with the same spec.toneModel, and its v2 curves are tuned to these levels. The v2 darkest pitch sits within the
    // finest level's reach (finest <= master / 1.5).
    // Tone model v2 (a plain ladder, not a law's ruling set): the finest level must reach the Density-set DARKEST pitch (the dark end
    // is ~0.67 coverage), not the legacy master pitch (spacing / 5), or the dark end is quantised to an octave far too coarse.
    const minPitch = Math.max(C.PLOT_FLOOR_SLACK * floor, !r.v2 ? masterPitch(r) : (spec.lawBake ? (finite(spec.lawFinest, 0) > 0 ? spec.lawFinest : masterPitch(r)) : darkPitchV2(r)));
    let L = clamp(1 + Math.ceil(Math.log2(Math.max(1, p0S * C.ZOOM_HEADROOM / minPitch))), 1, maxLevels);
    const families = cross ? 2 : 1;
    const estVerts = (levels) => {
      const pf = p0 / Math.pow(2, levels - 1);
      const share = cross ? (1 + 1 / r.crossRatio) : 1;
      return dots ? S.area / (pf * pf) : (S.area / pf) * share / C.STEP_MM;
    };
    while (L > 1 && estVerts(L) > C.MAX_VERTS) L -= 1;

    const builder = SM.createBuilder(meta);
    const FLAG = SM.FLAG;
    const bmin = [Infinity, Infinity, Infinity]; const bmax = [-Infinity, -Infinity, -Infinity]; let rmax2 = 0;
    const emit = (s) => {
      builder.vertex(s.x, s.y, s.z, s.nx, s.ny, s.nz);
      if (s.x < bmin[0]) bmin[0] = s.x; if (s.x > bmax[0]) bmax[0] = s.x;
      if (s.y < bmin[1]) bmin[1] = s.y; if (s.y > bmax[1]) bmax[1] = s.y;
      if (s.z < bmin[2]) bmin[2] = s.z; if (s.z > bmax[2]) bmax[2] = s.z;
      { const r2 = s.x * s.x + s.y * s.y + s.z * s.z; if (r2 > rmax2) rmax2 = r2; }
    };
    const wrapB = (b) => (M.periodicB ? frac(b) : b);
    const wrapA = (a) => (M.periodicA ? frac(a) : a);
    // Fast sampler: forward differences (3 chart evaluations instead of 5); falls back to the exact metric at the
    // poles / seams / domain edges. Error of the frame ~ C.FD_EPS * pi rad (< 5e-5), under the octahedral budget.
    const raw = (Scene3D.SurfaceFill && typeof Scene3D.SurfaceFill.chartFor === 'function') ? Scene3D.SurfaceFill.chartFor(mode, spec.sizes || {}) : null;
    const sxs = r.scale.sx; const sys = r.scale.sy; const szs = r.scale.sz; const ori = M.orientation;
    const fast = (a, b) => {
      if (!raw || a < C.FD_EDGE || a > 1 - C.FD_EDGE || b < 0 || b > 1 - 2 * C.FD_EPS) return M.sample(a, b);
      const p = raw(a, b); const qa = raw(a + C.FD_EPS, b); const qb = raw(a, b + C.FD_EPS);
      if (!p || !qa || !qb) return M.sample(a, b);
      const ia = 1 / C.FD_EPS;
      const dax = (qa.x - p.x) * ia * sxs; const day = (qa.y - p.y) * ia * sys; const daz = (qa.z - p.z) * ia * szs;
      const dbx = (qb.x - p.x) * ia * sxs; const dby = (qb.y - p.y) * ia * sys; const dbz = (qb.z - p.z) * ia * szs;
      let nx = ((day * dbz - daz * dby) * ori) / sxs; let ny = ((daz * dbx - dax * dbz) * ori) / sys; let nz = ((dax * dby - day * dbx) * ori) / szs;
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 1e-9)) return M.sample(a, b);
      nx /= nl; ny /= nl; nz /= nl;
      return { x: p.x * sxs, y: p.y * sys, z: p.z * szs, dax, day, daz, dbx, dby, dbz, nx, ny, nz };
    };
    const at = (a, b) => fast(clamp(wrapA(a), 0, 1), clamp(wrapB(b), 0, 1));


    // ---- FX-R: relabel stubs and cut fronts (H3) ---------------------------------------------------------------
    // Both passes only ever RAISE a vertex's effective level (finer = drawn later), so local spacing can only grow.
    //  1. Stagger: each relabel front moves toward the coarse side by hash(ruling) x RELABEL_STAGGER x the coarse piece,
    //     so the rulings of one latitude stop ending on one straight line.
    //  2. Hysteresis: an interior piece (a neighbour on both sides) shorter than RELABEL_MIN_MM takes the finer
    //     neighbour's label and merges into it; the shared boundary vertex of the FX-L chain is kept.
    const retime = (verts, m, famId) => {
      const n = verts.length;
      const usable = (q) => verts[q].s && verts[q].eff >= 0;
      const dist = (q) => Math.hypot(verts[q].s.x - verts[q - 1].s.x, verts[q].s.y - verts[q - 1].s.y, verts[q].s.z - verts[q - 1].s.z);
      const pieces = () => {
        const out = [];
        for (let q = 0; q < n;) {
          if (!usable(q)) { q += 1; continue; }
          let e = q;
          while (e + 1 < n && usable(e + 1)) e += 1;
          let a = q;
          for (let k = q + 1; k <= e + 1; k++) {
            if (k > e || verts[k].eff !== verts[a].eff) {
              out.push({ a, b: k - 1, eff: verts[a].eff, first: a === q, last: k > e });
              a = k;
            }
          }
          q = e + 1;
        }
        return out;
      };
      const runLength = (pc) => {
        let len = 0;
        const end = pc.last ? pc.b : pc.b + 1;
        for (let q = pc.a + 1; q <= end; q++) len += dist(q);
        return len;
      };
      const stag = Math.max(0, C.RELABEL_STAGGER);
      if (stag > 0) {
        const pcs = pieces(); const eff0 = verts.map((v) => v.eff);
        for (let i = 0; i + 1 < pcs.length; i++) {
          const A = pcs[i]; const B = pcs[i + 1];
          if (A.last || A.b + 1 !== B.a) continue;
          const coarseIsA = A.eff < B.eff; const coarse = coarseIsA ? A : B; const fine = coarseIsA ? B : A;
          const reach = stag * SC.hash(salt, 101 + m, 43 + famId) * Math.min(runLength(coarse), runLength(fine));
          let d = 0;
          if (coarseIsA) {
            for (let q = A.b; q >= A.a && eff0[q] === coarse.eff; q--) { d += dist(q + 1); if (d > reach) break; verts[q].eff = Math.max(verts[q].eff, fine.eff); }
          } else {
            for (let q = B.a; q <= B.b && eff0[q] === coarse.eff; q++) { if (q > B.a) d += dist(q); if (d > reach) break; verts[q].eff = Math.max(verts[q].eff, fine.eff); }
          }
        }
      }
      const minLen = Math.max(0, C.RELABEL_MIN_MM);
      if (minLen > 0) {
        for (let guard = 0; guard < 64; guard++) {
          const pcs = pieces(); let changed = false;
          for (let i = 1; i + 1 < pcs.length && !changed; i++) {
            const P = pcs[i]; const Pp = pcs[i - 1]; const Pn = pcs[i + 1];
            if (Pp.b + 1 !== P.a || P.b + 1 !== Pn.a) continue;
            const target = Math.max(Pp.eff, Pn.eff);
            if (target <= P.eff || runLength(P) >= minLen) continue;
            for (let q = P.a; q <= P.b; q++) verts[q].eff = target;
            changed = true;
          }
          if (!changed) break;
        }
      }
    };

    // ---- line families on the dyadic intercept grid ------------------------------------------------------
    // theta: tangent-plane angle from the meridian (dP/da), degrees. P: level-0 pitch (local mm).
    let effPitch = 0;
    const ruleFamily = (famId, thetaDeg, P) => {
      const th = (thetaDeg * Math.PI) / 180;
      let ca = Math.cos(th) / Math.max(1e-9, S.medA); let cb = Math.sin(th) / Math.max(1e-9, S.medB);
      if (Math.abs(Math.sin(th)) < 1e-9) cb = 0;
      if (Math.abs(Math.cos(th)) < 1e-9) ca = 0;
      if (ca < 0 || (ca === 0 && cb < 0)) { ca = -ca; cb = -cb; }
      const aDom = Math.abs(cb) <= Math.abs(ca);
      let K = aDom ? cb / ca : ca / cb;            // a-dom: b = u + K a ; b-dom: a = u + K b
      if (!aDom && Math.abs(K) < 0.01) K = 0;
      const rings = !aDom && K === 0;
      const w = (aDom || rings) ? 1 : Math.abs(K);
      const uPeriodic = aDom ? M.periodicB : (rings ? M.periodicA : true);
      const tan = aDom ? [1, K] : [K, 1];
      // pm_ref: median perpendicular mm per unit intercept over the survey.
      const pms = [];
      for (let i = 0; i < C.GRID; i++) {
        for (let j = 0; j < C.GRID; j++) {
          const s = M.sample((i + 0.5) / C.GRID, (j + 0.5) / C.GRID);
          if (!s) continue;
          const tx = tan[0] * s.dax + tan[1] * s.dbx; const ty = tan[0] * s.day + tan[1] * s.dby; const tz = tan[0] * s.daz + tan[1] * s.dbz;
          const pm = aDom ? perpOf(s.dbx, s.dby, s.dbz, tx, ty, tz) : perpOf(s.dax, s.day, s.daz, tx, ty, tz);
          if (pm > 1e-9) pms.push(pm);
        }
      }
      const pmRef = median(pms);
      if (!(pmRef > 0)) return;
      // n0 is a power of two so every coarser set {ctz >= v} is evenly spaced (a fan thins by halves).
      // Legacy: the level-0 ruling count is a power of two, so the ruling pitch lands within x1.41 of the one asked for. Tone model v2 takes
      // ANY integer count (the coarser sets {ctz >= v} are evenly spaced whatever n0 is): the effective pitch is within a few percent of
      // the asked one. The dark end (~0.67 coverage) sits within 1.2 x the plot floor, where a x0.8 miss made the frame's crowd guard
      // drop every other ruling (coverage 0.42 instead of 0.67).
      const maxK = Math.floor(Math.log2(C.MAX_CELLS)) - (L - 1);
      const n0 = r.v2
        ? clamp(Math.round(Math.max(1e-9, (pmRef * w) / P)), 1, Math.max(1, Math.floor(C.MAX_CELLS / Math.pow(2, L - 1))))
        : Math.pow(2, Math.max(0, clamp(Math.round(Math.log2(Math.max(1e-9, (pmRef * w) / P))), 0, maxK)));
      const N = n0 * Math.pow(2, L - 1);
      const logN = Math.round(Math.log2(N));
      effPitch = (pmRef * w) / n0;
      const phi = SC.hash(salt, famId, 3) * 0.999;
      const mFrom = (uPeriodic ? 0 : 1);
      const mTo = (uPeriodic ? N - 1 : N - 1);
      const closedLine = (aDom && K === 0 && M.periodicA) || (rings && M.periodicB);
      for (let m = mFrom; m <= mTo; m++) {
        const v = Math.min(ctz(m), L - 1 + C.V_EXTRA, logN);
        const lvl = Math.max(0, L - 1 - v);
        const extra = Math.max(0, v - (L - 1));
        // chord, not arc: around a periodic axis a gap of g of the full circle has chord/arc = sinc(pi g).
        const g = Math.pow(2, v) / N;
        const chord = (uPeriodic && g < 1) ? Math.sin(Math.PI * g) / (Math.PI * g) : 1;
        const u = ((m + phi) / N) * w;
        // parameter range along the ruling
        let tau0 = 0; let tau1 = 1;
        const chartAt = aDom ? (tau) => [tau, u + K * tau] : (rings ? (tau) => [u, tau] : (tau) => [u + K * tau, tau]);
        if (!aDom && !rings) {
          // a = u + K b, unrolled until a leaves [0, 1]; K > 0 here.
          tau0 = (0 - u) / K; tau1 = (1 - u) / K;
          if (tau1 - tau0 > 400) continue;
        }
        // trace
        const xs = []; // sub-run buffer of samples
        let tau = tau0; let guard = 0; let curEff = 0;
        // Rank inside the effective level: level-0 rulings keep their dyadic index; a relabelled or finer ruling ranks by
        // its own odd multiple so each band of a level stays nested and evenly spread.
        const rankOf = (eff) => vdc2(eff === 0 ? (m >> (L - 1)) : (m >> (v + 1)));
        const flush = (closedFull) => {
          if (xs.length >= 2 || (closedFull && xs.length >= 3)) {
            builder.beginRun(curEff, rankOf(curEff), famId, closedFull ? FLAG.CLOSED : 0);
            for (let q = 0; q < xs.length; q++) emit(xs[q]);
            builder.endRun();
          }
          xs.length = 0;
        };
        let allSame = true; let firstEff = -2;
        const verts = [];
        for (;;) {
          const ab = chartAt(tau);
          const s = at(ab[0], ab[1]);
          if (s) {
            const tx = tan[0] * s.dax + tan[1] * s.dbx; const ty = tan[0] * s.day + tan[1] * s.dby; const tz = tan[0] * s.daz + tan[1] * s.dbz;
            const pm = aDom ? perpOf(s.dbx, s.dby, s.dbz, tx, ty, tz) : perpOf(s.dax, s.day, s.daz, tx, ty, tz);
            // Compression-aware level (contract section 9, A11): where the chart converges, rho < C.THIN_RATIO and the
            // ruling's marks sit closer than its level's target. Instead of cutting it, relabel it j levels finer
            // (it then appears only when the law asks for that much density), j = ceil(log2(C.THIN_RATIO / rho)).
            // Coarse rulings above level 0 first absorb their own `extra` halvings.
            const rho = (pm / pmRef) * chord;
            const jj = rho >= C.THIN_RATIO ? 0 : (rho > 1e-9 ? Math.max(0, Math.ceil(Math.log2(C.THIN_RATIO / rho))) : 99);
            const eff = lvl > 0 ? lvl + jj : Math.max(0, jj - extra);
            const kept = eff <= L - 1;
            verts.push({ s, eff: kept ? eff : -1 });
            if (firstEff === -2) firstEff = kept ? eff : -1;
            if (!kept || eff !== firstEff) allSame = false;
            const tl = Math.hypot(tx, ty, tz);
            const dTau = tl > 1e-9 ? clamp(C.STEP_MM / tl, 1e-5, 0.1) : 0.01;
            if (tau >= tau1) break;
            tau = Math.min(tau1, tau + dTau);
          } else {
            allSame = false; verts.push({ s: null, eff: -1 });
            if (tau >= tau1) break;
            tau = Math.min(tau1, tau + 0.01);
          }
          if (++guard > 20000) break;
        }
        if (!(closedLine && allSame)) retime(verts, m, famId);
        if (closedLine && allSame && verts.length > 3) {
          curEff = firstEff;
          for (let q = 0; q < verts.length - 1; q++) xs.push(verts[q].s);
          flush(true);
          continue;
        }
        for (let q = 0; q < verts.length; q++) {
          const ve = verts[q].eff;
          if (ve < 0 || !verts[q].s) { flush(false); continue; }
          if (ve !== curEff) {
            // Shared boundary vertex: the old run ends AT this vertex and the new run starts at it (no plotted gap).
            const share = xs.length > 0;
            if (share) xs.push(verts[q].s);
            flush(false); curEff = ve;
            if (share) xs.push(verts[q].s);
            continue;
          }
          xs.push(verts[q].s);
        }
        flush(false);
      }
    };

    // ---- the 65 degree cross: tangent-plane streamlines, Jobard-Lefer, level by level -------------------
    const crossFamily = (famId, famTheta, P, deltaDeg) => {
      const dr = (deltaDeg * Math.PI) / 180; const cd = Math.cos(dr); const sd = Math.sin(dr);
      // family-0 chart direction at the survey reference (same rule as ruleFamily).
      const th = (famTheta * Math.PI) / 180;
      let ca = Math.cos(th) / Math.max(1e-9, S.medA); let cb = Math.sin(th) / Math.max(1e-9, S.medB);
      if (Math.abs(Math.sin(th)) < 1e-9) cb = 0;
      if (Math.abs(Math.cos(th)) < 1e-9) ca = 0;
      if (ca < 0 || (ca === 0 && cb < 0)) { ca = -ca; cb = -cb; }
      const aDom0 = Math.abs(cb) <= Math.abs(ca);
      let K0 = aDom0 ? cb / ca : ca / cb;
      if (!aDom0 && Math.abs(K0) < 0.01) K0 = 0;
      const tan0 = aDom0 ? [1, K0] : [K0, 1];
      // unit tangent of the rotated direction at a sample, plus the chart step per mm.
      const field = (s, prev) => {
        let tx = tan0[0] * s.dax + tan0[1] * s.dbx; let ty = tan0[0] * s.day + tan0[1] * s.dby; let tz = tan0[0] * s.daz + tan0[1] * s.dbz;
        const tl = Math.hypot(tx, ty, tz); if (!(tl > 1e-9)) return null;
        tx /= tl; ty /= tl; tz /= tl;
        // rotate about the outward normal: cos t + sin (n x t)
        const cx = s.ny * tz - s.nz * ty; const cy = s.nz * tx - s.nx * tz; const cz = s.nx * ty - s.ny * tx;
        let wx = cd * tx + sd * cx; let wy = cd * ty + sd * cy; let wz = cd * tz + sd * cz;
        const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
        if (prev && wx * prev[0] + wy * prev[1] + wz * prev[2] < 0) { wx = -wx; wy = -wy; wz = -wz; }
        // chart coordinates of w: solve [Pa Pb] (da, db) = w in the least-squares sense.
        const g11 = s.dax * s.dax + s.day * s.day + s.daz * s.daz; const g22 = s.dbx * s.dbx + s.dby * s.dby + s.dbz * s.dbz;
        const g12 = s.dax * s.dbx + s.day * s.dby + s.daz * s.dbz;
        const det = g11 * g22 - g12 * g12;
        if (!(det > 1e-12 * g11 * g22) || !(det > 1e-12)) return null;
        const r1 = s.dax * wx + s.day * wy + s.daz * wz; const r2 = s.dbx * wx + s.dby * wy + s.dbz * wz;
        return { w: [wx, wy, wz], da: (g22 * r1 - g12 * r2) / det, db: (g11 * r2 - g12 * r1) / det };
      };
      const lines = []; // { level, a:[], b:[], s:[] }
      const placed = []; // all lines in placement order
      for (let level = 0; level < L; level++) {
        const dsep = P / Math.pow(2, level);
        const stop = C.JL_STOP_FRAC * dsep; const seedD = C.JL_SEED_FRAC * dsep;
        const hash = SC.spatialHash3(dsep);
        const insertLine = (ln) => {
          const sp = dsep / C.JL_HASH_DIV;
          const pts = ln.s;
          for (let q = 0; q < pts.length; q++) {
            const p = pts[q];
            hash.insert(p.x, p.y, p.z, 0);
            if (q + 1 < pts.length) {
              const nx = pts[q + 1];
              const d = Math.hypot(nx.x - p.x, nx.y - p.y, nx.z - p.z);
              const k = Math.floor(d / sp);
              for (let c = 1; c <= k; c++) {
                const f = c / (k + 1);
                hash.insert(p.x + (nx.x - p.x) * f, p.y + (nx.y - p.y) * f, p.z + (nx.z - p.z) * f, 0);
              }
            }
          }
        };
        placed.forEach(insertLine);
        const near = (x, y, z, rad) => hash.near(x, y, z, rad, () => true);
        const trace = (a0, b0, sign) => {
          const out = [];
          let a = a0; let b = b0; let prev = null;
          for (let step = 0; step < C.JL_MAX_STEPS; step++) {
            const s = at(a, b);
            if (!s) break;
            if (a < 1e-3 || a > 1 - 1e-3) break;
            const f = field(s, prev || (sign < 0 ? null : null));
            if (!f) break;
            let wx = f.w[0] * sign; let wy = f.w[1] * sign; let wz = f.w[2] * sign;
            let da = f.da * sign; let db = f.db * sign;
            if (prev && wx * prev[0] + wy * prev[1] + wz * prev[2] < 0) { wx = -wx; wy = -wy; wz = -wz; da = -da; db = -db; }
            if (step > 0 && near(s.x, s.y, s.z, stop)) break;
            out.push({ s, a: wrapA(a), b: wrapB(b) });
            prev = [wx, wy, wz];
            a += da * C.STEP_MM; b += db * C.STEP_MM;
            if (!M.periodicA && (a < 0 || a > 1)) break;
          }
          return out;
        };
        const placeFrom = (a0, b0) => {
          const s0 = at(a0, b0);
          if (!s0 || a0 < 2e-3 || a0 > 1 - 2e-3) return null;
          if (near(s0.x, s0.y, s0.z, seedD)) return null;
          const fw = trace(a0, b0, 1);
          const bw = trace(a0, b0, -1);
          const seq = bw.slice(1).reverse().concat(fw);
          if (seq.length < 3) return null;
          let len = 0; for (let q = 1; q < seq.length; q++) len += Math.hypot(seq[q].s.x - seq[q - 1].s.x, seq[q].s.y - seq[q - 1].s.y, seq[q].s.z - seq[q - 1].s.z);
          if (len < dsep) return null;
          return { level, a: seq.map((q) => q.a), b: seq.map((q) => q.b), s: seq.map((q) => q.s) };
        };
        const lvLines = [];
        const queue = placed.slice();
        const tryAdd = (ln) => {
          if (!ln) return false;
          insertLine(ln); placed.push(ln); lvLines.push(ln); queue.push(ln);
          return true;
        };
        const seedAround = (ln) => {
          const stride = Math.max(1, Math.round(dsep / C.STEP_MM));
          for (let q = 0; q < ln.s.length; q += stride) {
            const s = ln.s[q];
            const f = field(s, null);
            if (!f) continue;
            // perpendicular in the tangent plane: n x w
            const px = s.ny * f.w[2] - s.nz * f.w[1]; const py = s.nz * f.w[0] - s.nx * f.w[2]; const pz = s.nx * f.w[1] - s.ny * f.w[0];
            const g11 = s.dax * s.dax + s.day * s.day + s.daz * s.daz; const g22 = s.dbx * s.dbx + s.dby * s.dby + s.dbz * s.dbz;
            const g12 = s.dax * s.dbx + s.day * s.dby + s.daz * s.dbz; const det = g11 * g22 - g12 * g12;
            if (!(det > 1e-12)) continue;
            const r1 = s.dax * px + s.day * py + s.daz * pz; const r2 = s.dbx * px + s.dby * py + s.dbz * pz;
            const dA = (g22 * r1 - g12 * r2) / det; const dB = (g11 * r2 - g12 * r1) / det;
            for (let side = -1; side <= 1; side += 2) {
              tryAdd(placeFrom(ln.a[q] + side * dA * dsep, ln.b[q] + side * dB * dsep));
            }
          }
        };
        if (!placed.length) {
          // first seed: deterministic, salt-dependent, away from the poles.
          const a0 = 0.35 + 0.3 * SC.hash(salt, famId, 17); const b0 = SC.hash(salt, famId, 29);
          tryAdd(placeFrom(a0, b0));
        }
        for (let qi = 0; qi < queue.length; qi++) seedAround(queue[qi]);
        // islands the walk could not reach: scan a coarse chart grid.
        const SCAN = 28;
        for (let i = 0; i < SCAN; i++) {
          for (let j = 0; j < SCAN; j++) {
            const added = tryAdd(placeFrom((i + 0.5 + 0.25 * phase) / SCAN, (j + 0.5) / SCAN));
            if (added) { for (let qi = queue.length - 1; qi < queue.length; qi++) seedAround(queue[qi]); }
          }
        }
        // rank: greedy farthest point over the level's lines (midpoint vertex), so every prefix is spread out.
        const nL = lvLines.length;
        if (nL) {
          const rep = lvLines.map((ln) => ln.s[ln.s.length >> 1]);
          const order = [0]; const dmin = new Float64Array(nL).fill(Infinity);
          for (let k = 1; k < nL; k++) {
            const last = rep[order[k - 1]]; let best = -1; let bd = -1;
            for (let c = 0; c < nL; c++) {
              const d = Math.hypot(rep[c].x - last.x, rep[c].y - last.y, rep[c].z - last.z);
              if (d < dmin[c]) dmin[c] = d;
            }
            for (let c = 0; c < nL; c++) { if (dmin[c] > bd && !(dmin[c] === 0)) { bd = dmin[c]; best = c; } }
            if (best < 0) break;
            order.push(best); dmin[best] = 0;
          }
          const seen = new Set(order);
          for (let c = 0; c < nL; c++) if (!seen.has(c)) order.push(c);
          order.forEach((li, k) => { lvLines[li].rank = k / nL; });
        }
        lvLines.forEach((ln) => lines.push(ln));
      }
      lines.forEach((ln) => {
        builder.beginRun(ln.level, Math.min(0.999999, ln.rank || 0), famId, 0);
        for (let q = 0; q < ln.s.length; q++) emit(ln.s[q]);
        builder.endRun();
      });
    };

    // ---- spiral: interleaved helices chained through the poles ------------------------------------------
    const spiral = () => {
      const T = Math.max(1, Math.round(S.perpA / p0));
      const polar = (() => {
        const s0 = M.sample(0, 0.3); const s1 = M.sample(1, 0.3);
        return Boolean(s0 && s1 && Math.hypot(s0.dbx, s0.dby, s0.dbz) < 0.02 * S.medB && Math.hypot(s1.dbx, s1.dby, s1.dbz) < 0.02 * S.medB);
      })();
      const phi0 = SC.hash(salt, 5, 3);
      const helix = (ph) => {
        const pts = [];
        let a = 0; let guard = 0;
        for (;;) {
          const b = ph + T * a;
          const s = at(a, b);
          if (s) pts.push(s);
          if (a >= 1) break;
          const tl = s ? Math.hypot(s.dax + T * s.dbx, s.day + T * s.dby, s.daz + T * s.dbz) : 0;
          a = Math.min(1, a + (tl > 1e-9 ? clamp(C.STEP_MM / tl, 1e-6, 0.05) : 0.01));
          if (++guard > 400000) break;
        }
        return pts;
      };
      for (let level = 0; level < L; level++) {
        const count = level === 0 ? 1 : Math.pow(2, level - 1);
        const phases = [];
        for (let i = 0; i < count; i++) phases.push(level === 0 ? phi0 : frac(phi0 + (2 * i + 1) / Math.pow(2, level)));
        if (polar || count === 1) {
          if (polar) {
            const run = [];
            phases.forEach((ph, i) => {
              let h = helix(ph);
              if (i % 2 === 1) h = h.reverse();
              const skip = run.length && h.length && Math.hypot(h[0].x - run[run.length - 1].x, h[0].y - run[run.length - 1].y, h[0].z - run[run.length - 1].z) < 1e-6 ? 1 : 0;
              for (let q = skip; q < h.length; q++) run.push(h[q]);
            });
            if (run.length >= 2) { builder.beginRun(level, 0.5, 0, 0); run.forEach(emit); builder.endRun(); }
          } else {
            const h = helix(phases[0]);
            const closed = M.periodicA && h.length > 3;
            if (h.length >= 2) { builder.beginRun(level, 0.5, 0, closed ? FLAG.CLOSED : 0); for (let q = 0; q < h.length - (closed ? 1 : 0); q++) emit(h[q]); builder.endRun(); }
          }
        } else {
          phases.forEach((ph, i) => {
            const h = helix(ph);
            const closed = M.periodicA && h.length > 3;
            if (h.length >= 2) { builder.beginRun(level, vdc2(i), 0, closed ? FLAG.CLOSED : 0); for (let q = 0; q < h.length - (closed ? 1 : 0); q++) emit(h[q]); builder.endRun(); }
          });
        }
      }
    };

    // ---- stipple: nested dyadic rows x columns ------------------------------------------------------------
    const stipple = () => {
      const bRef = 0.37; const AS = 256;
      const cum = new Float64Array(AS + 1);
      let prev = M.sample(0, bRef);
      for (let i = 1; i <= AS; i++) {
        const s = M.sample(i / AS, bRef);
        const sa = s ? Math.hypot(s.dax, s.day, s.daz) : 0; const sp = prev ? Math.hypot(prev.dax, prev.day, prev.daz) : sa;
        cum[i] = cum[i - 1] + 0.5 * (sa + sp) / AS; prev = s;
      }
      const Slen = cum[AS];
      if (!(Slen > 0)) return;
      const aAtArc = (f) => {
        const target = clamp(f, 0, 1) * Slen;
        let lo = 0; let hi = AS;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
        const span = cum[hi] - cum[lo];
        return (lo + (span > 0 ? (target - cum[lo]) / span : 0)) / AS;
      };
      const R0 = Math.max(1, Math.round(Slen / p0));
      const Rf = Math.min(C.MAX_CELLS, R0 * Math.pow(2, L - 1));
      const pf = p0 / Math.pow(2, L - 1);
      const phi = SC.hash(salt, 9, 3) * 0.999; const phi2 = SC.hash(salt, 9, 5);
      const rowStart = M.periodicA ? 0 : 1;
      const byLevel = [];
      for (let l = 0; l < L; l++) byLevel.push([]);
      const BS = 24;
      for (let i = rowStart; i < Rf; i++) {
        const a = aAtArc((i + phi) / Rf);
        const lr = Math.max(0, L - 1 - ctz(i));
        // row circumference and arc-length table along b
        const tab = new Float64Array(BS + 1);
        let pv = M.sample(a, 0);
        for (let q = 1; q <= BS; q++) {
          const s = M.sample(a, q / BS);
          const sb = s ? Math.hypot(s.dbx, s.dby, s.dbz) : 0; const sp = pv ? Math.hypot(pv.dbx, pv.dby, pv.dbz) : sb;
          tab[q] = tab[q - 1] + 0.5 * (sb + sp) / BS; pv = s;
        }
        const c = tab[BS];
        if (!(c > 0)) continue;
        const k = Math.max(0, Math.min(14, Math.floor(Math.log2(c / (C.DOT_COL_FILL * pf)))));
        const ncols = Math.pow(2, k);
        const coarse = Math.max(1, Math.pow(2, k - (L - 1)));       // columns at level 0
        const shift = frac(i * C.GOLDEN + phi2) / coarse;               // fraction of a level-0 column period
        for (let j = 0; j < ncols; j++) {
          const lc = j === 0 ? 0 : Math.max(0, L - 1 - Math.min(ctz(j), L - 1));
          const lvl = Math.max(lr, lc);
          const arc = frac(j / ncols + shift / 1) * c;
          let lo = 0; let hi = BS;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid] <= arc) lo = mid; else hi = mid; }
          const span = tab[hi] - tab[lo];
          const b = (lo + (span > 0 ? (arc - tab[lo]) / span : 0)) / BS;
          byLevel[lvl].push([a, b]);
        }
      }
      byLevel.forEach((list, lvl) => {
        list.forEach((ab, idx) => {
          const s = M.sample(ab[0], clamp(ab[1], 0, 1));
          if (!s) return;
          builder.beginRun(lvl, Math.min(0.999999, vdc2(idx)), 0, FLAG.DOT);
          emit(s);
          builder.endRun();
        });
      });
    };

    // ---- dispatch ---------------------------------------------------------------------------------------
    let p0Eff = p0;
    if (mapper === 'hatch') {
      ruleFamily(0, r.angle, p0); if (effPitch > 0) p0Eff = effPitch;
    } else if (mapper === 'crosshatch') {
      ruleFamily(0, r.angle, p0); if (effPitch > 0) p0Eff = effPitch;
      crossFamily(1, r.angle, p0Eff * r.crossRatio, 65 + (r.crossDelta - 90));
    } else if (mapper === 'contour') {
      ruleFamily(0, 90, p0); if (effPitch > 0) p0Eff = effPitch;
    } else if (mapper === 'spiral') {
      spiral();
    } else if (mapper === 'stipple') {
      stipple();
    }

    const ms = builder.finish();
    const ext = Math.max(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]);
    const has = Number.isFinite(bmin[0]);
    ms.bakerId = 'ladder';
    ms.meta = {
      p0: p0Eff,
      gain,
      toneModel: dots ? 'area' : 'pitch',
      scaleRef: r.scaleRef,
      minMarkMM: 2 * r.pen,
      sepBarFrac: C.MIN_SEP_FRAC, // O3: informational spacing bar only; no minSepFrac, so the frame cap never thins the ladder
      bounds: has ? { min: bmin.slice(), max: bmax.slice(), radius: Math.sqrt(rmax2) } : { min: [0, 0, 0], max: [0, 0, 0], radius: 0 },
      convex: typeof spec.convex === 'boolean' ? spec.convex : Boolean(CONVEX_MODES[mode]),
      levelsDesigned: L,
      msBake: now() - t0,
    };
    if (dots) ms.meta.glyph = { kind: 'circle', r: r.dotR, segs: C.DOT_SEGS };
    void ext;
    return ms;
  };

  Scene3D.SurfaceLockLadder = {
    id: 'ladder', FIT, supports, bake, toneLUT,
    // shared with the faceted baker (tone model v2)
    v2: { isV2, darkPitch: (spec) => { sync(); return darkPitchV2(read(spec)); }, toneLUT: toneLutV2, relDark: relDarkV2 },
  };
})();
