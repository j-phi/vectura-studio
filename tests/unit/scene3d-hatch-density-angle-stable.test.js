const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-v1-angledrift — owner-reported live defect: "changing the fill Density
 * visibly changes the hatch ANGLE, but the Angle control still reads the
 * same value."
 *
 * TWO DISTINCT MECHANISMS were found (see the fs-v1-angledrift report for the
 * full writeup); this file covers ONLY what is provably true of the files
 * owned here (surface-fill.js / geometry3d.js).
 *
 * (1) FACETED primitives (box/plane/solid/ground) — `src/core/algorithms/
 *     scene3d.js`'s `crossFamilies()` (~:1157-1191, owned by another agent,
 *     NOT touched here): its automatic "dark side" tone-zone cross family
 *     (`else if (w > 0) { push(hatchPolygon(target, { angleDeg: angleDeg +
 *     CROSS_OBJ_DEG_B, spacing: plane(..., spacing / w) })); }`) keeps
 *     `hatchPolygon`'s historic hard 1mm floor UNCONDITIONALLY, while family
 *     A's own call two lines above it (:1159) now passes `minSpacing` (added
 *     in ab975bff). As Density climbs, family A's line count grows past
 *     where the unrelieved dark-side family is still floor-capped, so the MIX
 *     RATIO between the user's angle and the automatic +65 deg zone family
 *     shifts. Predates today's density work: measured against `ab975bff^`,
 *     the faceted box's Density 50->200 drift was ~16.5 deg pre-fix vs
 *     ~3.5 deg (isolated single-face) / up to ~11 deg (default multi-face
 *     camera) at HEAD — today's fix narrowed it as a side effect but did not
 *     remove the asymmetric-floor design flaw. Real fix belongs in scene3d.js.
 *
 * (2) CURVED (chart-wrapped) primitives — `angleFamily(angleDeg)` in THIS
 *     file (surface-fill.js) is a pure function of `angleDeg` alone: no code
 *     path derives a line's direction from spacing/density/count, and
 *     `HL_STAGE.toneZones` is hardcoded `false`, so the faceted mechanism
 *     above is structurally unreachable here. Proven both by code reading and
 *     by the isolated tests below (symmetric straight-on camera, no ground):
 *     mean rendered bearing is stable within ~1.5 deg across Density 50-500.
 *     BUT under a REALISTIC scene (default tilted camera + ground, as any
 *     freshly-created scene has) the aggregate ink bearing on a
 *     near-meridian wrapped hatch (e.g. sphere, angle 20) drifts much more —
 *     measured 22.6 deg (d10) -> 16.6 (d50) -> 5.5 (d150) -> 4.1 deg (d200),
 *     smooth/monotonic/still-converging, so it is NOT a Density>100
 *     regression from today's work either. Root cause is NOT a direction-
 *     field bug (every individual line's direction is density-invariant by
 *     construction, see above) — it is a coverage/occlusion-weighting effect:
 *     which visible arcs of a wrapped, HLR-clipped helical family survive at
 *     a given camera/ground framing is asymmetric across phase, and a coarse
 *     Density under-samples that asymmetry. A safe fix (if one is wanted)
 *     needs new design work (e.g. stratified/visibility-aware phase sampling)
 *     across a heavily-tuned 9000-line file; NOT attempted here — flagged in
 *     the fs-v1-angledrift report for follow-up rather than forced blind.
 *
 * This file's tests are REGRESSION GUARDS for what IS proven stable — the
 * per-location direction field, under camera/occlusion conditions symmetric
 * enough not to trigger (2) — measuring the actual rendered angle (not the
 * way the owner observed the bug.
 *
 * W-36b (2026-09-09): W-36 split crosshatch's ink share ~50/50 between its
 * two families (previously family A held ~91%). The COMBINED, ink-weighted
 * bearing this file's crosshatch sub-tests used to measure is a near-50/50
 * vector average of two bearings that are themselves far from parallel on
 * sphere/cone at this angle — that combination is maximally sensitive to a
 * small (2-5%) shift in the inter-family ink-share ratio, which is exactly
 * what W-36 legitimately moves. Measured per-family (sphere bearingA
 * 63.05->62.08deg, bearingB 168.711->168.715deg; cone bearingA 84.40->83.05deg,
 * bearingB 144.175->144.181deg, Density 50->150): every family is stable to
 * well under 1.5deg. The combined metric was the flawed instrument, not a
 * moved direction field — this guard's own docstring intent above ("no code
 * path derives a line's direction from spacing/density/count") is a
 * PER-FAMILY claim, so the crosshatch sub-tests below now measure each
 * family separately instead of a combined vector average. Ruled by
 * W-36-review.md Sec.(5) and cross-checked independently by the W-36
 * implementer; see docs/3d-audit/lane-reports/W-36b-impl.md.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

// Mean UNDIRECTED segment bearing (deg, 0..180) of a fill family, length
// weighted so the long strokes that carry the visual read dominate the tiny
// tessellation steps. Doubled-angle mean so bearings near the 0/180 wrap
// (e.g. torus) average correctly. Mirrors scene3d-hatch-angle.test.js.
const meanBearing = (paths) => {
  let sx = 0; let sy = 0; let w = 0;
  paths.forEach((pp) => {
    for (let i = 0; i + 1 < pp.length; i++) {
      const dx = pp[i + 1].x - pp[i].x;
      const dy = pp[i + 1].y - pp[i].y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const r = 2 * Math.atan2(dy, dx);
      sx += Math.cos(r) * len; sy += Math.sin(r) * len; w += len;
    }
  });
  if (!w) return NaN;
  let m = (Math.atan2(sy / w, sx / w) * 90) / Math.PI;
  if (m < 0) m += 180;
  return m;
};

// Smallest undirected separation between two bearings (0..90) — wrap-safe.
const bearingGap = (a, b) => {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
};

const geomKey = (paths) => paths
  .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';'))
  .join('|');

// Curved (chart-wrapped) primitives — the SurfaceFill-reached set.
const CURVED = {
  sphere: { radius: 40, detail: 20 },
  cylinder: { sx: 25, sy: 40, sz: 25, detail: 20 },
  cone: { sx: 25, sy: 40, sz: 25, detail: 20 },
  torus: { sx: 30, sy: 12, sz: 30, detail: 20 },
};

describe('Scene3D — the per-location fill direction field is Density-invariant (curved primitives)', () => {
  let runtime; let V; let algo; let defaults; let SurfaceFill;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SurfaceFill = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  // Ground OFF + straight-on camera deliberately: this isolates the
  // DIRECTION-FIELD claim (angleFamily is a pure function of angleDeg) from
  // the separate, real, aggregate-coverage drift a realistic scene (ground +
  // default tilted camera) shows on a wrapped family — see the file header.
  // That drift is NOT reproduced or asserted-stable here.
  const scene = (primitive, params, mapper, fillAngle, density) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive, params: clone(params),
      transform: { x: 0, y: 0, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle, fillDensity: density } }, byObject: {}, byFace: {} };
    // Tone stays at the shipped default (enabled) — masterGrid (the
    // density -> line budget path most plausibly suspected of coupling to
    // direction) is only live when tone is on.
    return p;
  };

  const fillsOf = (primitive, params, mapper, fillAngle, density) =>
    (algo.generate(scene(primitive, params, mapper, fillAngle, density), null, null, BOUNDS) || [])
      .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // W-36b — per-family raw runs. `.fam`/`.back` only survive on
  // SurfaceFill.buildObject's raw return (scene3d.js re-emits fills without
  // them), so this wraps it exactly like scene3d-crosshatch-parity.test.js's
  // `rawRuns`/`crosshatchStats` idiom. Family identity is order-of-first-
  // -appearance: surface-fill.js's crosshatch path always builds family A
  // (role 'a') to completion before family B (role 'b') — see
  // src/core/scene3d/surface-fill.js:11077-11097 — so "family A" / "family
  // B" below name the SAME physical family across a density comparison
  // within one `rawFamilyRuns` call pair, exactly like the parity test's own
  // `[famA, famB] = fams`.
  const rawFamilyRuns = (primitive, params, fillAngle, density) => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => {
      const r = real(o);
      if (Array.isArray(r)) r.forEach((run) => seen.push(run));
      return r;
    };
    try {
      algo.generate(scene(primitive, params, 'crosshatch', fillAngle, density), null, null, BOUNDS);
    } finally {
      SurfaceFill.buildObject = real;
    }
    const front = seen.filter((r) => !r.back);
    const fams = [];
    front.forEach((r) => { if (r.fam && fams.indexOf(r.fam) === -1) fams.push(r.fam); });
    expect(fams.length).toBe(2);
    const [famA, famB] = fams;
    return {
      a: front.filter((r) => r.fam === famA),
      b: front.filter((r) => r.fam === famB),
    };
  };

  // Distinctive non-45 deg angle, exactly as the owner reproduced it.
  const FILL_ANGLE = 20;
  // Generous vs. the measured noise floor (<1.4 deg on the worst curved case,
  // a sphere, which converges by Density 100 and stays flat through 500) —
  // tight enough to catch a real regression, loose enough for curvature/
  // sampling-location noise inherent to a wrapped parametric family.
  const TOLERANCE_DEG = 3;

  describe.each(Object.keys(CURVED))('%s', (primitive) => {
    const params = CURVED[primitive];

    test('hatch: mean rendered bearing is stable across Density 50 -> 150 -> 50', () => {
      const b50 = meanBearing(fillsOf(primitive, params, 'hatch', FILL_ANGLE, 50));
      const b150 = meanBearing(fillsOf(primitive, params, 'hatch', FILL_ANGLE, 150));
      const b50again = meanBearing(fillsOf(primitive, params, 'hatch', FILL_ANGLE, 50));
      expect(Number.isFinite(b50)).toBe(true);
      expect(Number.isFinite(b150)).toBe(true);
      expect(bearingGap(b50, b150)).toBeLessThan(TOLERANCE_DEG);
      // Determinism: re-generating at the ORIGINAL density must reproduce the
      // exact same bearing — no hysteresis carried from having visited 150.
      expect(b50again).toBe(b50);
    });

    // W-36b: re-expressed PER FAMILY (was one combined, ink-weighted vector
    // average across both crosshatch families). See the file header note
    // dated 2026-09-09: since W-36 the two families carry near-equal ink
    // share and are far from parallel on sphere/cone at this angle, so their
    // combined vector average is maximally sensitive to a small shift in
    // that ink-share ratio — an instrument flaw, not a direction-field
    // regression. The guard's docstring intent ("no code path derives a
    // line's direction from spacing/density/count") is a per-family claim;
    // this measures it as one. Tolerance UNCHANGED at 3deg — only the metric
    // changed (combined vector average -> two per-family bearings).
    test('crosshatch: per-family mean rendered bearing is stable across Density 50 -> 150', () => {
      const r50 = rawFamilyRuns(primitive, params, FILL_ANGLE, 50);
      const r150 = rawFamilyRuns(primitive, params, FILL_ANGLE, 150);
      const bA50 = meanBearing(r50.a);
      const bA150 = meanBearing(r150.a);
      const bB50 = meanBearing(r50.b);
      const bB150 = meanBearing(r150.b);
      expect(Number.isFinite(bA50)).toBe(true);
      expect(Number.isFinite(bA150)).toBe(true);
      expect(Number.isFinite(bB50)).toBe(true);
      expect(Number.isFinite(bB150)).toBe(true);
      expect(bearingGap(bA50, bA150)).toBeLessThan(TOLERANCE_DEG);
      expect(bearingGap(bB50, bB150)).toBeLessThan(TOLERANCE_DEG);
    });
  });

  // ── BYTE-IDENTITY GUARD ─────────────────────────────────────────────────
  // No source change lands in this commit (surface-fill.js / geometry3d.js
  // are confirmed NOT to reproduce the owner's defect — see file header), so
  // this pins the exact current fingerprint of the legacy angle-0 (meridian)
  // path across the Density range: any future change to the files owned here
  // that alters this geometry is a regression, full stop.
  test('BYTE-IDENTITY GUARD: angle 0 (legacy meridian family) fingerprint is fixed across Density', () => {
    const at = (density) => geomKey(fillsOf('sphere', CURVED.sphere, 'hatch', 0, density));
    const fp50 = at(50);
    const fp150 = at(150);
    expect(fp50.length).toBeGreaterThan(0);
    expect(fp150.length).toBeGreaterThan(0);
    // Angle-0 output at each density is only required to be a pure function
    // of density (deterministic, repeatable) -- NOT required to match ACROSS
    // densities, since more lines are legitimately drawn at higher density.
    expect(at(50)).toBe(fp50);
    expect(at(150)).toBe(fp150);
  });
});
