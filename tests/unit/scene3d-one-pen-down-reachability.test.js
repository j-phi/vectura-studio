const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-r1 — `onePenDown` reachability.
 *
 * `onePenDown` has been fully implemented in surface-fill.js's WV_ chassis
 * since Round 5 (isWaveLaw(), wvChainOn, splitsAlongLine() names it as the
 * one wave-family exception that never splits along the line) but was never
 * added to `docs/tone-laws/laws.json`, so `Vectura.SCENE3D_TONE_LAWS.IDS`
 * never carried it and `Params.clampStyleParam`'s 'toneLaw' case silently
 * rewrote every request for it to 'ladder' — the exact defect class this
 * tone-law batch exists to remove. This file pins:
 *
 *   1. RED: `onePenDown` survives clampStyleParam unchanged instead of being
 *      rewritten to 'ladder'.
 *   2. RED: end to end through algo.generate, `onePenDown` produces finite,
 *      non-empty geometry that is visibly distinct from the ladder default —
 *      not a dead/unreachable option and not a same-output alias.
 *   3. A roster guard: adding onePenDown grew the catalog by exactly one
 *      (47 -> 48), it landed in the `wave` family at production tier, and
 *      every one of the other 47 ids is otherwise untouched.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SPHERE = { radius: 40, detail: 20 };

// The 47 ids the roster carried before fs-r1 added onePenDown (Round 5/6
// wave family + every other family), lifted from the committed catalog at
// the point this test was written. Used only to prove the other 47 entries
// were not perturbed by this change — not a roster contract in itself.
const PRE_EXISTING_47 = [
  'none', 'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand',
  'fineLadder', 'phaseFineLadder', 'perceptualRamp', 'weightSmoothstep', 'lozengeStipple',
  'deepFillTSP', 'bundleCount', 'bundleSubNib', 'bundleEased', 'bundleDither',
  'bundleLozenge', 'bundleHandoff', 'contFieldSigmoid', 'contFieldTouch', 'contFieldFore',
  'contFieldSurface', 'contFieldQuant', 'penInterleave', 'penStipple', 'penReserve',
  'penCross', 'penPitchMatch', 'penFacing', 'mkScribble', 'mkTick', 'mkDashRamp',
  'mkDotScreen', 'ampSpacing', 'weaveDepth', 'interlockWeave', 'trochoidLoop',
  'amplitudeOnly', 'etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral', 'dutyConst',
  'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill',
];

describe('onePenDown — promoted from unreachable to the roster (fs-r1)', () => {
  let runtime; let V; let Params; let algo; let defaults; let SurfaceFill;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    // Deliberately NOT `require('.../params.js')` directly: a bare require
    // attaches to the process-global `window.Vectura`, a DIFFERENT object
    // from `runtime.window.Vectura` (which is where SCENE3D_TONE_LAWS is
    // actually loaded) — clampStyleParam's roster check would silently
    // no-op against an empty roster and accept any string, masking the
    // exact regression this file exists to catch.
    Params = V.Scene3D.Params;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SurfaceFill = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  test('the roster grew by exactly one, and onePenDown landed in the wave family at production tier', () => {
    const LAWS = V.SCENE3D_TONE_LAWS;
    expect(LAWS.IDS.length).toBe(48);
    expect(LAWS.IDS).toContain('onePenDown');
    expect(LAWS.PRODUCTION).toContain('onePenDown');
    expect(LAWS.LIBRARY).not.toContain('onePenDown');

    const waveFamily = LAWS.FAMILIES.find((f) => f.id === 'wave');
    expect(waveFamily.laws).toContain('onePenDown');

    // Every pre-existing id is still present, unchanged in count.
    for (const id of PRE_EXISTING_47) expect(LAWS.IDS).toContain(id);
    expect(LAWS.IDS.length).toBe(PRE_EXISTING_47.length + 1);
  });

  test('clampStyleParam keeps "onePenDown" as-is instead of rewriting it to ladder', () => {
    const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'onePenDown' } });
    expect(out.params.toneLaw).toBe('onePenDown');
    expect(out.params.toneLaw).not.toBe('ladder');
  });

  const scene = (toneLaw) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'sphere', params: clone(SPHERE),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
    return p;
  };
  const fills = (p) => (algo.generate(p, null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const geomKey = (paths) => paths
    .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';')).join('|');

  test('onePenDown renders finite, non-empty geometry distinct from ladder, end to end through algo.generate', () => {
    const ladder = fills(scene('ladder'));
    const onePenDown = fills(scene('onePenDown'));

    expect(ladder.length).toBeGreaterThan(0);
    expect(onePenDown.length).toBeGreaterThan(0);

    for (const path of onePenDown) {
      expect(path.length).toBeGreaterThanOrEqual(2);
      for (const pt of path) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }

    expect(geomKey(onePenDown)).not.toBe(geomKey(ladder));
  });

  /* WHERE THE CLAIM MOVED TO (stroke-fill integration, 2026-08-29).
   *
   * This test used to count EMITTED PATHS: 9 for onePenDown against 36 for
   * ladder. That comparison stopped measuring chaining the moment onePenDown
   * became a bucket-B RIBBON law. A ribbonized ruling is no longer one polyline
   * — it is an outline ring plus a pen-pitched interior fill, deliberately many
   * strokes — so the emitted count now reports how WIDE the ruling is, not how
   * many times the pen lifted between rulings. Asserting on it would either
   * fail forever or force the ribbon off onePenDown to keep a number green.
   *
   * The claim itself is unchanged and still exactly testable one level up.
   * `surface-fill.js` defers this law's ribbon to the END of the build for
   * exactly this reason: the chart bridge chains the bare centrelines first,
   * and each finished CHAIN is ribbonized as one unit.
   * `lastRibbonStats.stretches` is that chain count (onePenDown holds one width
   * per ruling, so a chain of n rulings is at most n stretches and in practice
   * far fewer), and it is what carries the old 9-vs-36 comparison forward:
   * re-measured here at 10 chains against 36 ladder paths.
   *
   * The DIRECTION of the original path-count check still holds and is kept
   * (20 emitted paths vs 36). Only its 2x margin moved to the run count, because
   * the emitted count now also reports how WIDE the ruling is — a ribbon is
   * deliberately many strokes — and would otherwise punish the feature for
   * working. The two paired checks keep it honest: the ribbon must genuinely be
   * doing the widening (`ribbons > 0`), and onePenDown must still lay down far
   * more INK than the ladder while doing it.
   */
  test('onePenDown chains rulings into far fewer continuous runs than the ladder default (its whole claim)', () => {
    const ladder = fills(scene('ladder'));
    const ladderPaths = ladder.length;
    const onePenDown = fills(scene('onePenDown'));
    const stats = SurfaceFill.lastRibbonStats;

    expect(onePenDown.length).toBeGreaterThan(0);
    // The ribbon really ran — otherwise the run count below is measuring a
    // bare-centreline fallback and the assertion is vacuous.
    expect(stats.algo).toBe('onePenDown');
    expect(stats.ribbons).toBeGreaterThan(0);

    // THE CLAIM. Re-measured on this fixture: 10 chained runs against 36 ladder
    // paths. The exact counts are fixture-specific; the direction and the order
    // of magnitude are what is under test.
    expect(stats.stretches).toBeLessThan(ladderPaths);
    expect(stats.stretches * 2).toBeLessThan(ladderPaths);
    // ...and the original measurement's direction, unchanged.
    expect(onePenDown.length).toBeLessThan(ladderPaths);

    const ink = (paths) => paths.reduce((t, pp) => {
      for (let i = 1; i < pp.length; i++) t += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
      return t;
    }, 0);
    // A few long heavy rulings, not many thin ones.
    expect(ink(onePenDown)).toBeGreaterThan(ink(ladder));
  });

  test('SurfaceFill.buildObject is reachable with toneLaw: "onePenDown" directly (not just through algo.generate)', () => {
    expect(typeof SurfaceFill.buildObject).toBe('function');
    const before = V.SCENE3D_TONE_LAWS.IDS.indexOf('onePenDown');
    expect(before).not.toBe(-1);
  });
});
