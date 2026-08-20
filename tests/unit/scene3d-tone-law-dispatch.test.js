const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE 46-WAY TONE-LAW DISPATCH MATRIX.
 *
 * `TONE_ALGO` was a module-level `const 'ladder'` inside `surface-fill.js`.
 * This unit makes it a per-call value read from `opts.toneLaw`, by shadowing
 * it with a local `const TONE_ALGO` at the top of `buildObject` — every one of
 * the 179 in-closure references now reads the per-call law with zero edits at
 * the call sites. The one genuine risk is `isMarkLaw` (`surface-fill.js:1097`
 * pre-refactor), which lived at MODULE scope and therefore closed over the
 * module constant instead of the per-call one. If that relocation is missed,
 * every mark law (`mkDotScreen`, `mkTick`, `mkDashRamp`, `mkScribble`) silently
 * falls back to `ladder`'s dispatch while everything else in the closure
 * believes the law changed — and nothing else in the suite would catch it,
 * because no other test drives any law but the default.
 *
 * So assertion (3) below compares EVERY one of the 45 non-`ladder` laws
 * against the `ladder` baseline and names the law on failure. It is written to
 * fail loudly, and specifically, if `isMarkLaw` is left reading the module
 * constant: the 4 mark laws (and only those 4, on top of any other unconverted
 * law) will come back byte-identical to `ladder`. Proven directly: with the
 * relocation reverted (module-scope `isMarkLaw` reading the module constant),
 * this assertion fails naming exactly `mkDotScreen`, `mkTick`, `mkDashRamp`,
 * `mkScribble` as offenders (see this unit's report for the pasted output);
 * with the relocation in place, it passes.
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
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const SUN_ALT = { id: 'sun', type: 'directional', azimuth: 20, elevation: 70, castShadows: false };

const LIBRARY_LAWS = [
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
  'deepFillTSP', 'bundleDither', 'amplitudeOnly', 'contFieldTouch', 'bundleSubNib',
];
const MONO_LAWS = [
  'etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral',
  'dutyConst', 'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill',
];
const MARK_LAW_IDS = ['mkDotScreen', 'mkTick', 'mkDashRamp', 'mkScribble'];

// The full 46-id roster (production 36 + library 10 — see
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

// Slow: each law is a real buildObject() call over a sphere with real
// sampling, and CI machines running this alongside sibling test files can be
// heavily contended. Generous, not open-ended.
const SLOW = 120000;

describe('Scene3D.SurfaceFill — per-call TONE_ALGO dispatch (46-way matrix)', () => {
  let runtime; let V; let algo; let defaults; let SF;
  let hatchOpts; let hatchOptsAltLight; let crossOpts;

  // Captures the REAL opts bag `scene3d.js` builds for a chart-wrapped
  // primitive, by wrapping buildObject during one real `algo.generate` pass —
  // no hand-rolled projection/transform stand-in. The wrapper records each
  // call's own (opts, result) pair so picking "the representative call" never
  // re-invokes buildObject.
  const captureOpts = (mapper, light) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [light || SUN];

    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      const result = orig.call(this, opts);
      calls.push({ opts, result });
      return result;
    };
    try {
      algo.generate(p, null, null, BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    // The representative call: the one with the most output (the front-face
    // curved fill, as opposed to a back-face or degenerate call).
    let best = calls[0];
    for (const c of calls) {
      if ((c.result || []).length > (best.result || []).length) best = c;
    }
    return best.opts;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    hatchOpts = captureOpts('hatch');
    hatchOptsAltLight = captureOpts('hatch', SUN_ALT);
    crossOpts = captureOpts('crosshatch');
  }, SLOW);
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
  }, SLOW);

  test('3. every law differs from "ladder" (the isMarkLaw guard)', () => {
    const baseline = signature(run(hatchOpts, 'ladder'));
    const offenders = [];
    for (const law of ALL_LAWS) {
      if (law === 'ladder') continue;
      const sig = signature(run(hatchOpts, law));
      if (same(sig, baseline)) offenders.push(law);
    }
    expect(offenders, `these laws produced byte-identical output to "ladder" — dispatch did not happen: ${offenders.join(', ')}`).toEqual([]);
  }, SLOW);

  test('4. mark laws specifically: a large, not marginal, departure from ladder', () => {
    // Redundant with (3) by design — belt and braces on the one line that can
    // silently break. Mark-language mechanisms vary widely (mkDotScreen: many
    // small filled discs; mkTick/mkDashRamp: many short abutting marks;
    // mkScribble: one long zigzag polyline per row, same row count as ladder
    // but far more points/length per row) — no single-metric-direction
    // ("shorter", "more paths") holds across all four. What DOES hold, and is
    // exactly what breaks if `isMarkLaw` mis-dispatches to `ladder`, is a
    // large relative departure in at least one of {count, points, length}.
    const baseline = signature(run(hatchOpts, 'ladder'));
    for (const law of MARK_LAW_IDS) {
      const sig = signature(run(hatchOpts, law));
      const relDelta = Math.max(
        Math.abs(sig.count - baseline.count) / Math.max(1, baseline.count),
        Math.abs(sig.pts - baseline.pts) / Math.max(1, baseline.pts),
        Math.abs(sig.len - baseline.len) / Math.max(1, baseline.len),
      );
      expect(relDelta, `mark law "${law}" only drifted ${(relDelta * 100).toFixed(1)}% from ladder in count/pts/len — too close to be a real dispatch`).toBeGreaterThan(0.5);
    }
  }, SLOW);

  test('5. "none" is Stage 0: light-invariant (the tone apparatus is fully switched off), and lands where the corpus measured it', () => {
    // docs/tone-laws/laws.json's own "NO TONE" entry: "Not a law but the Stage
    // 0 reference: the same build with the tone apparatus switched off
    // (masterGrid and dither both false). Every ruling of the density grid is
    // drawn, at one pitch and one weight, so it is what the fill looks like
    // with nothing modulating it" — and separately, measured as carrying
    // "among the lowest ... ink cost of the whole roster" (masterGrid's floor
    // raise is what pushes `ladder` and the other laws above it, not below).
    //
    // The robust, law-agnostic way to test "nothing is modulating it" without
    // depending on any particular fixture's ink totals: 'none' output must be
    // IDENTICAL regardless of the light direction, because the whole
    // apparatus that reads per-sample intensity to decide coverage/dropping
    // (dither) is off. 'ladder' at the shipped Stage 1 default is NOT
    // light-invariant (already covered generically by
    // tests/unit/scene3d-tone.test.js; reasserted here for contrast).
    const noneA = run(hatchOpts, 'none');
    const noneB = run(hatchOptsAltLight, 'none');
    expect(noneA).toEqual(noneB);

    const ladderA = run(hatchOpts, 'ladder');
    const ladderB = run(hatchOptsAltLight, 'ladder');
    expect(ladderA).not.toEqual(ladderB);

    // And the ink-cost direction the corpus actually measured: less than the
    // shipped default, not more (masterGrid's darkest-zone floor raise is
    // what makes 'ladder' outspend the flat Stage-0 grid).
    expect(totalLen(noneA)).toBeLessThan(totalLen(ladderA));
  }, SLOW);

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
  }, SLOW);
});
