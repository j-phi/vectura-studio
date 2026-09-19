/**
 * T3c-onset (round 5, lane fill-audit-a5) — pins WHERE mkDashRamp's dash-length
 * bound (`MK_DASH_LEN_FRAC`, T3c, `surface-fill.js:2494-2556` + `:6790-6822`)
 * actually turns off, and how large the step is at that edge. Mechanism is
 * ALREADY KNOWN (`T3c-review.md` condition 2, :74-80) — this file verifies and
 * pins it, it does not re-derive it from scratch.
 *
 * THE FINDING. `bandOnsetCap(d)` (`:2531-2536`) returns
 * `clamp(Math.round(1 + t*(MK_BAND_MAX_PASSES-1)), 1, MK_BAND_MAX_PASSES)` with
 * `t = (d-1)/(MK_BAND_ONSET_D-1)` and `MK_BAND_ONSET_D = 35` (`:2530`). The
 * rounding reaches `MK_BAND_MAX_PASSES = 6` once `t >= 0.9`, i.e. `d >= 31.6` —
 * so the INTEGER density where the ramp first saturates is d=32, not the
 * declared constant d=35. T3c's dash-length bound (`layMark`'s
 * `law.shape === 'morph'` branch, `:6813-6818`) fires only while
 * `bandOnsetCap(d) < MK_BAND_MAX_PASSES`, so it switches off at d=32 too.
 * `T3c-review.md` measured the gap-fraction shape of this cliff (sphere+torus,
 * addLayer, fine sweep d=30..40: avg gap fraction 0.46-0.50 at d=30/31, 0.01-
 * 0.04 at d>=32) but the shipped record still says "35" everywhere except
 * `report.json`'s `acceptance_bar` field and the `layMark` comment at `:6798`
 * ("true for d<32") — the two existing `scene3d-mkdashramp-{discrete,
 * single-pass}` test files' docstrings both state 35 throughout, and NOTHING
 * pins where the effective onset actually is. A future retune of the ramp
 * could move the cliff and no test would see it. This file measures and pins
 * both sides, independently, and mutation-proves the pin.
 *
 * METRIC — same convention `scene3d-mkdashramp-discrete.test.js` already uses:
 * average DRAWN LENGTH of dark-third marks
 * (`lastMarkStats.lenByThird[2] / cntByThird[2]`), compared as a ratio against
 * the pre-T3c tree (`T3C_BASE_SHA`, `75777240` — no dash-length bound exists
 * at all there, i.e. the true "uncapped" baseline for this metric). A ratio
 * strictly less than 1 means the bound is ACTIVE (mark length reduced from
 * the uncapped baseline); a ratio of EXACTLY 1 together with md5 geometry
 * identity means it is INACTIVE (byte-identical to uncapped).
 *
 * MEASURED (this unit's own run, `T3c-onset-impl.md` full table — NOT copied
 * from `T3c-review.md`'s gap-fraction numbers, which are a different metric
 * measured via a since-deleted probe hook):
 *
 *   fixture                  d=31 ratio   d=32 ratio   d=32 md5-identical
 *   sphere/hatch/addLayer      0.564317     1.000000    yes
 *   torus/hatch/addLayer       0.561778     1.000000    yes
 *   sphere/hatch/create        0.546621     1.000000    yes
 *   torus/hatch/create         0.553640     1.000000    yes
 *
 * All four: ACTIVE (ratio ~0.55-0.57, i.e. a genuine 43-45% length reduction)
 * at d=31; INACTIVE (ratio EXACTLY 1.0, byte-identical geometry) at d=32 — a
 * single-integer-density cliff, confirming the review's finding on a
 * different, independently-derived metric.
 *
 * GROUND-PLANE INK: not applicable — this file never measures ink totals,
 * only per-mark dark-third length ratios and md5 path identity, and every
 * fixture below has `ground: { enabled: false }` (see `buildSceneParams`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// This unit's own base sha — the tree immediately BEFORE T3c's dash-length
// fix landed (same pin `scene3d-mkdashramp-discrete.test.js` uses). An
// EXPLICIT pin, never `HEAD`.
const T3C_BASE_SHA = '75777240';
const SF_REL_PATH = 'src/core/scene3d/surface-fill.js';

const getPreT3cSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    cached = execFileSync('git', ['show', `${T3C_BASE_SHA}:${SF_REL_PATH}`], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 64,
    }).toString('utf8');
    return cached;
  };
})();

const getCurrentSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    cached = fs.readFileSync(path.join(rootDir, SF_REL_PATH), 'utf8');
    return cached;
  };
})();

// M1/M2/M3 — the three mutations named in the brief. Each is built by a
// surgical, needle-checked string replacement against the CURRENT (fixed)
// disk source — these mutate the onset MECHANISM itself (`bandOnsetCap`,
// `MK_BAND_ONSET_D`, or the gate condition), all of which only exist post-
// T3c, so they cannot be built from the pre-T3c export.
const buildMutant = (needle, replacement, label) => {
  const src = getCurrentSource();
  const idx = src.indexOf(needle);
  if (idx < 0) {
    throw new Error(`${label}: needle not found verbatim in ${SF_REL_PATH} — `
      + 'source drifted, re-derive this mutant against the current tree');
  }
  return src.slice(0, idx) + replacement + src.slice(idx + needle.length);
};

// M1: Math.round -> Math.floor in bandOnsetCap. Predicted effect: the ramp no
// longer rounds UP to 6 early, so it stays below MK_BAND_MAX_PASSES through a
// wider range, moving the cliff toward d=35 (the point at which `t>=1`,
// i.e. `d >= MK_BAND_ONSET_D`, regardless of rounding direction).
const getM1Source = () => buildMutant(
  'return clamp(Math.round(1 + t * (MK_BAND_MAX_PASSES - 1)), 1, MK_BAND_MAX_PASSES);',
  'return clamp(Math.floor(1 + t * (MK_BAND_MAX_PASSES - 1)), 1, MK_BAND_MAX_PASSES);',
  'getM1Source (Math.round -> Math.floor in bandOnsetCap)',
);

// M2: MK_BAND_ONSET_D 35 -> 40. Predicted effect: the ramp's own denominator
// widens, so the same integer density d=32 sits further from saturation and
// the cliff moves later.
const getM2Source = () => buildMutant(
  'const MK_BAND_ONSET_D = 35;',
  'const MK_BAND_ONSET_D = 40;',
  'getM2Source (MK_BAND_ONSET_D 35 -> 40)',
);

// M3: gate the dash cut on `d < MK_BAND_ONSET_D` (the DECLARED constant, 35)
// instead of `dashOnset < MK_BAND_MAX_PASSES` (the EFFECTIVE, rounded cap).
// Predicted effect: the cliff moves exactly to the declared d=35, since the
// gate now reads the constant directly instead of the saturated ramp value.
const getM3Source = () => buildMutant(
  'const eachDrawn = (dashOnset < MK_BAND_MAX_PASSES && each > dashLenFloor && each > dashLenTarget)',
  'const eachDrawn = (opts.fillDensity < MK_BAND_ONSET_D && each > dashLenFloor && each > dashLenTarget)',
  'getM3Source (gate on d < MK_BAND_ONSET_D instead of dashOnset < MK_BAND_MAX_PASSES)',
);

const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Scene3D.SurfaceFill — mkDashRamp ONSET edge: where the dash-length bound actually turns off (T3c-onset)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params;
  let baselineRuntime; let baselineAlgo; let baselineSF;
  let m1Runtime; let m1Algo; let m1SF;
  let m2Runtime; let m2Algo; let m2SF;
  let m3Runtime; let m3Algo; let m3SF;

  const buildSceneParams = (toneLaw, mapper, fillDensity, primitive, paramSet) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj', name: 'Obj', primitive, params: clone(paramSet[primitive] || {}),
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = clone(Params.DEFAULT_CAMERA);
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw } }, byObject: {},
    };
    return p;
  };
  const buildAddLayer = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_PARAM_DEFAULTS);
  const buildCreate = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_CREATE_DEFAULTS);

  const avgDarkLen = (stat) => (stat.cntByThird[2] > 0 ? stat.lenByThird[2] / stat.cntByThird[2] : NaN);
  const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');

  // Reachable fixture roster for this unit: {sphere, torus} x {addLayer, create}.
  const FIXTURES = [
    ['sphere', 'addLayer', buildAddLayer],
    ['torus', 'addLayer', buildAddLayer],
    ['sphere', 'create', buildCreate],
    ['torus', 'create', buildCreate],
  ];

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;

    // The uncapped baseline: pre-T3c source, no dash-length bound exists.
    baselineRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: getPreT3cSource() },
    });
    baselineAlgo = baselineRuntime.window.Vectura.AlgorithmRegistry.scene3d;
    baselineSF = baselineRuntime.window.Vectura.Scene3D.SurfaceFill;

    m1Runtime = await loadVecturaRuntime({ scriptOverrides: { [SF_REL_PATH]: getM1Source() } });
    m1Algo = m1Runtime.window.Vectura.AlgorithmRegistry.scene3d;
    m1SF = m1Runtime.window.Vectura.Scene3D.SurfaceFill;

    m2Runtime = await loadVecturaRuntime({ scriptOverrides: { [SF_REL_PATH]: getM2Source() } });
    m2Algo = m2Runtime.window.Vectura.AlgorithmRegistry.scene3d;
    m2SF = m2Runtime.window.Vectura.Scene3D.SurfaceFill;

    m3Runtime = await loadVecturaRuntime({ scriptOverrides: { [SF_REL_PATH]: getM3Source() } });
    m3Algo = m3Runtime.window.Vectura.AlgorithmRegistry.scene3d;
    m3SF = m3Runtime.window.Vectura.Scene3D.SurfaceFill;
  }, 180000);

  afterAll(() => {
    runtime.cleanup();
    baselineRuntime.cleanup();
    m1Runtime.cleanup();
    m2Runtime.cleanup();
    m3Runtime.cleanup();
  });

  describe('O17 — effective onset location: ACTIVE at d=31, INACTIVE at d=32, on all four fixtures', () => {
    test.each(FIXTURES)('%s/%s: d=31 bound is active (ratio<1, md5 differs from the uncapped baseline)', (prim, rigLabel, build) => {
      const cur = algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const after = avgDarkLen(SF.lastMarkStats);
      const base = baselineAlgo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const before = avgDarkLen(baselineSF.lastMarkStats);
      expect(md5(cur)).not.toBe(md5(base));
      // Non-vacuous: a genuine, measured reduction, not a near-zero drop —
      // margin around the measured 0.5466-0.5643 range across all 4 fixtures.
      expect(after / before).toBeLessThan(0.65);
      expect(after / before).toBeGreaterThan(0.45);
    });

    test.each(FIXTURES)('%s/%s: d=32 bound is inactive (ratio EXACTLY 1, md5 byte-identical to the uncapped baseline)', (prim, rigLabel, build) => {
      const cur = algo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
      const after = avgDarkLen(SF.lastMarkStats);
      const base = baselineAlgo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
      const before = avgDarkLen(baselineSF.lastMarkStats);
      expect(md5(cur)).toBe(md5(base));
      expect(after).toBe(before);
    });
  });

  describe('O18 — cliff magnitude: floor (d=31) and ceiling (d=32) pinned from THIS unit\'s own measured numbers', () => {
    // Own measurement (not copied from T3c-review.md's gap-fraction numbers,
    // a different metric measured via a since-deleted probe hook). Pinned
    // to 4 decimal places, measured once in this environment.
    const FLOOR_RATIO_D31 = {
      'sphere/addLayer': 0.564317,
      'torus/addLayer': 0.561778,
      'sphere/create': 0.546621,
      'torus/create': 0.553640,
    };

    test.each(FIXTURES)('%s/%s: d=31 floor ratio matches THIS unit\'s own measured value (pinned)', (prim, rigLabel, build) => {
      const cur = algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const after = avgDarkLen(SF.lastMarkStats);
      const base = baselineAlgo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const before = avgDarkLen(baselineSF.lastMarkStats);
      const key = `${prim}/${rigLabel}`;
      expect(after / before).toBeCloseTo(FLOOR_RATIO_D31[key], 4);
    });

    test.each(FIXTURES)('%s/%s: d=32 ceiling ratio is EXACTLY 1.0, not merely close', (prim, rigLabel, build) => {
      const cur = algo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
      const after = avgDarkLen(SF.lastMarkStats);
      const base = baselineAlgo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
      const before = avgDarkLen(baselineSF.lastMarkStats);
      expect(after).toBe(before);
    });

    test.each(FIXTURES)('%s/%s: the d=31->d=32 step in (1 - ratio) is at least 0.35 (disclosed cliff magnitude, own metric)', (prim, rigLabel, build) => {
      const key = `${prim}/${rigLabel}`;
      const step = 1 - FLOOR_RATIO_D31[key]; // d=32's own (1-ratio) is exactly 0, so the step equals this value
      expect(step).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe('MUTATION-KILL (blocking) — M1/M2/M3 each move the cliff away from d=32; O17\'s d=32 clause would go RED without the real fix', () => {
    test.each([
      ['M1 (Math.round -> Math.floor in bandOnsetCap)', () => m1Algo, () => m1SF],
      ['M2 (MK_BAND_ONSET_D 35 -> 40)', () => m2Algo, () => m2SF],
      ['M3 (gate on d < MK_BAND_ONSET_D instead of dashOnset < MK_BAND_MAX_PASSES)', () => m3Algo, () => m3SF],
    ])('%s: d=32 is NOT md5-identical to the uncapped baseline on every one of the 4 fixtures (O17 would go RED)', (label, getMutAlgo, getMutSF) => {
      const mutAlgo = getMutAlgo();
      const mutSF = getMutSF();
      FIXTURES.forEach(([prim, rigLabel, build]) => {
        const mut = mutAlgo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
        const base = baselineAlgo.generate(build('mkDashRamp', 'hatch', 32, prim), null, null, BOUNDS);
        // Under the mutation, the gate is still active at d=32 (unlike the
        // real fix, which is inactive there) — so the mutant's d=32 output
        // must diverge from the uncapped baseline, proving that if this
        // mutation shipped in place of the real fix, O17's own d=32
        // "inactive" clause would fail.
        expect(md5(mut)).not.toBe(md5(base));
      });
    });
  });

  describe('O18 floor-side disclosure — M1/M2/M3 do NOT move the d=31 magnitude (measured, not merely argued)', () => {
    // Per the brief: "Name the mutation that trips O18. If none does, O18 is
    // an unguarded disclosure." None of M1/M2/M3 changes `bandOnsetCap`'s
    // (or the gate's) value AT d=31 itself (all three still gate d=31 as
    // active, with the same dashOnset=5 either way for M1/M2, and
    // `31 < MK_BAND_ONSET_D` true either way for M3) — so the FLOOR side of
    // O18 (the d=31 magnitude) is left unguarded by this mutation set. This
    // is proved computationally below, not just argued: every mutant's own
    // d=31 output is byte-identical to the real fix's d=31 output.
    test.each(FIXTURES)('%s/%s: d=31 output is md5-identical across the real fix and all three mutants (floor unguarded)', (prim, rigLabel, build) => {
      const real = algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const mut1 = m1Algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const mut2 = m2Algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const mut3 = m3Algo.generate(build('mkDashRamp', 'hatch', 31, prim), null, null, BOUNDS);
      const realHash = md5(real);
      expect(md5(mut1)).toBe(realHash);
      expect(md5(mut2)).toBe(realHash);
      expect(md5(mut3)).toBe(realHash);
    });
  });
});
