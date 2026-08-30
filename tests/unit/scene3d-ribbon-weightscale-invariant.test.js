/*
 * RGR — T4 (contract C3 rule 6 / the plan's §5 T4): every bucket-B path is a
 * real single-pen stroke; every bucket-C law keeps its genuinely different
 * pen widths.
 *
 * For each of the 12 bucket-B (variable-width) laws, EVERY path
 * `SurfaceFill.buildObject` emits must carry `weightScale === 1` — the whole
 * point of `ribbonize` is that nothing downstream ever again reconstructs a
 * width from a multiplier. For each of the 6 bucket-C (three-pen) laws, at
 * least 2 DISTINCT weightScale values must still appear, proving the
 * exemption survives (`isRibbonLaw()` must not accidentally flatten a pen
 * law).
 *
 * Hooked at `SurfaceFill.buildObject` (the same technique
 * `scene3d-tone-algo-default.test.js` uses) rather than at the composed
 * `scenePaths`, because the scene compositor only ATTACHES `meta.weightScale`
 * when it differs from 1 (`src/core/algorithms/scene3d.js` ~3221) — reading
 * raw `buildObject` output sees the true value on every path, including the
 * ones the compositor would otherwise silently agree with by omission. This
 * also reaches highlight runs and any other `out.push` producer inside
 * `surface-fill.js` that bypasses `ribbonize`/`splitByWeight` — the plan
 * names these as bypass points that must independently already be
 * weightScale-1 for bucket-B laws.
 *
 * PRE-EXISTING INVARIANT, NOT A REGRESSION TEST FOR THIS WIP. The "HARD ASSERT
 * (C3 rule 6)" `ribbonize` throws on is unchanged by commit `439319c0` — it
 * was already enforced before the WALLS class existed, and both code paths
 * (CLS_WALLS's `tag()` and CLS_RIBBON's) reuse the same tagging helper. Tried
 * against `1b157bc6` (verified manually via `scriptOverrides`): it ALSO
 * passes there, for the same reason. This file is therefore NOT an RGR proof
 * for the F3 fix — it is coverage for a contract the fix must not have
 * broken, and is reported as such rather than claimed as a fail-then-pass
 * regression test.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { preWipRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const RIBBON_LAWS = [
  'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand',
  'weightSmoothstep', 'ampSpacing', 'weaveDepth', 'interlockWeave',
  'trochoidLoop', 'amplitudeOnly', 'onePenDown',
];
const PEN_LAWS = [
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
];

describe('SurfaceFill — weightScale invariant (T4), torus', () => {
  let runtime;
  let V;
  let SF;
  const raw = {};

  const captureRaw = (primitive, toneLaw) => {
    const engine = new V.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const obj = engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = primitive;
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };

    const paths = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((p) => paths.push(p));
      return r;
    };
    try {
      engine.computeAllDisplayGeometry();
    } finally {
      SF.buildObject = orig;
    }
    return paths;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preWipRuntimeOptions() });
    V = runtime.window.Vectura;
    SF = V.Scene3D.SurfaceFill;

    [...RIBBON_LAWS, ...PEN_LAWS].forEach((toneLaw) => {
      raw[toneLaw] = captureRaw('torus', toneLaw);
    });
  }, 300000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(RIBBON_LAWS)('%s — every emitted path is weightScale 1', (law) => {
    const paths = raw[law];
    expect(paths.length).toBeGreaterThan(0);
    const bad = paths.filter((p) => p && p.weightScale !== undefined && p.weightScale !== 1);
    expect(bad.length).toBe(0);
  });

  test.each(PEN_LAWS)('%s — keeps at least 2 distinct real pen widths', (law) => {
    const paths = raw[law];
    expect(paths.length).toBeGreaterThan(0);
    const distinct = new Set(paths.map((p) => (p && Number.isFinite(p.weightScale) ? p.weightScale : 1)));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
