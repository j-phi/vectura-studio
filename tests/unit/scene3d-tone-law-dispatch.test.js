const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE 46-WAY TONE-LAW DISPATCH MATRIX.
 *
 * `TONE_ALGO` was a module-level `const 'ladder'` inside `surface-fill.js`.
 * This unit makes it a per-call value read from `opts.toneLaw`, by shadowing
 * it with a local `const TONE_ALGO` at the top of `buildObject` — every one of
 * the 179 in-closure references now reads the per-call law with zero edits at
 * the call sites. The one genuine risk is `isMarkLaw` (`surface-fill.js:1097`),
 * which lived at MODULE scope and therefore closed over the module constant
 * instead of the per-call one. If that relocation is missed, every mark law
 * (`mkDotScreen`, `mkTick`, `mkDashRamp`, `mkScribble`) silently falls back to
 * `ladder`'s dispatch while everything else in the closure believes the law
 * changed — and nothing else in the suite would catch it, because no other
 * test drives any law but the default.
 *
 * So assertion (3) below compares EVERY one of the 45 non-`ladder` laws
 * against the `ladder` baseline and names the law on failure. It is written to
 * fail loudly, and specifically, if `isMarkLaw` is left reading the module
 * constant: the 4 mark laws (and only those 4, on top of any other unconverted
 * law) will come back byte-identical to `ladder`.
 *
 * `SurfaceFill.buildObject` is a plain options bag with no registry of its
 * own (surface-fill.js:1317) — it is driven with a REAL `opts` bag captured by
 * wrapping it during one `algo.generate` pass over an app-default sphere, so
 * this test does not hand-roll the projection/transform machinery. The
 * captured bag is read-only reused (buildObject never mutates `opts`), with
 * `toneLaw` overridden per law under test.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

const LIBRARY_LAWS = [
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
  'deepFillTSP', 'bundleDither', 'amplitudeOnly', 'contFieldTouch', 'bundleSubNib',
];
const MONO_LAWS = [
  'etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral',
  'dutyConst', 'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill',
];
const MARK_LAW_IDS = ['mkDotScreen', 'mkTick', 'mkDashRamp', 'mkScribble'];

// The full 46-id roster (production 36 + library 10 — `deepFillTSP` etc. — see
// tone-integration-plan.md §2.1). Pulled from docs/tone-laws/laws.json ids,
// minus 'NO TONE' (mapped to 'none' and tested separately as Stage 0).
const ALL_LAWS = [
  'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand', 'weightSmoothstep',
  'fineLadder', 'phaseFineLadder', 'perceptualRamp', 'lozengeStipple',
  'bundleCount', 'bundleEased', 'bundleLozenge', 'bundleHandoff',
  'contFieldSigmoid', 'contFieldFore', 'contFieldSurface', 'contFieldQuant',
  'mkScribble', 'mkTick', 'mkDashRamp', 'mkDotScreen',
  'ampSpacing', 'weaveDepth', 'interlockWeave', 'trochoidLoop',
  ...MONO_LAWS,
  ...LIBRARY_LAWS,
];

describe('Scene3D.SurfaceFill — per-call TONE_ALGO dispatch (46-way matrix)', () => {
  let runtime; let V; let algo; let defaults; let SF;
  let hatchOpts; let crossOpts;

  const captureOpts = (mapper) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false }];

    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      calls.push(opts);
      return orig.call(this, opts);
    };
    try {
      algo.generate(p, null, null, BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    // The front-face curved-fill call — the first non-null-yielding call is the
    // representative one this matrix drives.
    const withOutput = calls.find((o) => orig.call(SF, o));
    return withOutput || calls[0];
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    hatchOpts = captureOpts('hatch');
    crossOpts = captureOpts('crosshatch');
  });
  afterAll(() => runtime.cleanup());

  const run = (opts, toneLaw) => SF.buildObject(toneLaw === undefined ? opts : { ...opts, toneLaw });
  const totalPts = (paths) => (paths || []).reduce((acc, pp) => acc + (pp ? pp.length : 0), 0);
  const totalLen = (paths) => (paths || []).reduce((acc, pp) => {
    if (!pp) return acc;
    let len = 0;
    for (let i = 1; i < pp.length; i += 1) len += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    return acc + len;
  }, 0);
  const signature = (paths) => ({ count: (paths || []).length, pts: totalPts(paths), len: Math.round(totalLen(paths) * 1000) / 1000 });
  const same = (a, b) => a.count === b.count && a.pts === b.pts && a.len === b.len;

  test('1. baseline identity: unset, "ladder" and an unknown law all resolve to the same committed default', () => {
    const a = run(hatchOpts);
    const b = run(hatchOpts, 'ladder');
    const c = run(hatchOpts, 'bogusName');
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  test('2. every one of the 46 laws draws (non-null, at least one path with >= 2 points)', () => {
    for (const law of ALL_LAWS) {
      const out = run(hatchOpts, law);
      expect(out, `law "${law}" returned null/undefined`).toBeTruthy();
      const hasRealPath = (out || []).some((p) => p && p.length >= 2);
      expect(hasRealPath, `law "${law}" emitted no path with >= 2 points`).toBe(true);
    }
  });

  test('3. every law differs from "ladder" (the isMarkLaw guard)', () => {
    const baseline = signature(run(hatchOpts, 'ladder'));
    const offenders = [];
    for (const law of ALL_LAWS) {
      if (law === 'ladder') continue;
      const sig = signature(run(hatchOpts, law));
      if (same(sig, baseline)) offenders.push(law);
    }
    expect(offenders, `these laws produced byte-identical output to "ladder" — dispatch did not happen: ${offenders.join(', ')}`).toEqual([]);
  });

  test('4. mark laws specifically: short runs, many paths — a signature "ladder" does not have', () => {
    const baseline = run(hatchOpts, 'ladder');
    const baseAvgLen = totalPts(baseline) / Math.max(1, baseline.length);
    for (const law of MARK_LAW_IDS) {
      const out = run(hatchOpts, law);
      expect(out.length, `mark law "${law}" should emit many short marks`).toBeGreaterThan(0);
      const avgLen = totalPts(out) / Math.max(1, out.length);
      expect(avgLen, `mark law "${law}" average path length should read shorter than ladder's`).toBeLessThan(baseAvgLen + 1e-9);
      expect(avgLen === baseAvgLen && out.length === baseline.length).toBe(false);
    }
  });

  test('5. "none" is Stage 0: strictly more ink than "ladder", nothing dropped', () => {
    const a = run(hatchOpts, 'ladder');
    const b = run(hatchOpts, 'none');
    expect(totalLen(b)).toBeGreaterThan(totalLen(a));
  });

  test('6. hlStage is a defensive copy', () => {
    const first = SF.hlStage;
    expect(typeof first).toBe('object');
    first.toneZones = true;
    const second = SF.hlStage;
    expect(second.toneZones).toBe(false);
  });

  test('7. crosshatch smoke: the 9 mono laws all draw and differ from ladder under crosshatch too', () => {
    const baseline = signature(run(crossOpts, 'ladder'));
    for (const law of MONO_LAWS) {
      const out = run(crossOpts, law);
      expect(out, `mono law "${law}" returned null/undefined on crosshatch`).toBeTruthy();
      expect((out || []).some((p) => p && p.length >= 2), `mono law "${law}" emitted no real path on crosshatch`).toBe(true);
      const sig = signature(out);
      expect(same(sig, baseline), `mono law "${law}" was byte-identical to ladder on crosshatch`).toBe(false);
    }
  });
});
