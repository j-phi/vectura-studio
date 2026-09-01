/*
 * RGR — THE CLS_WALLS CLASS (1-2 PEN WIDTHS) MUST FIRE AND MUST BE COVERAGE-CLEAN.
 *
 * Contract: F3/F4 (`~/.claude/plans/stroke-fill-plan.md`). Before this WIP
 * (commit `1b157bc6`), `ribbonize` classified a stretch as either "narrow"
 * (<=1.1 pen, one centreline) or "wide" (>1.1 pen, erode-based outline+fill).
 * Everything from 1.1 to ~2 pens went through the SAME erode(region, pen/2)
 * pipeline as a genuinely wide ribbon — a boolean asked to resolve two offset
 * curves less than one pen apart, which is not reliable there (measured: a
 * constant 1.58-pen `weightSmoothstep` ribbon eroded into three fragments with
 * a coverage of 0.824; `taperedEnds` lost both tapered ends outright at 0.49).
 *
 * The fix adds a third class, CLS_WALLS, built ANALYTICALLY
 * (`RibbonGeometry.buildRibbonMultiPolygon` / `clipMultiPolygonToRegion`
 * against a pre-inset region) instead of by erosion. This file proves BOTH
 * halves of the fix on a TORUS, across all twelve bucket-B laws:
 *
 *   1. the WALLS class actually fires (non-zero `wallRings` — a law that
 *      quietly fell back to bare centrelines everywhere is a FAILURE, not a
 *      pass, exactly the "inert ribbon" defect this file's sibling tests
 *      guard elsewhere); and
 *   2. the ribbon geometry it clips is actually INKED: ring-fill-rate
 *      (contract C2's T1 method — 4 samples per pen width, independent
 *      rasterizer, see `tests/helpers/scene3d-ring-coverage.js`) is >= 0.995.
 *
 * RED against `1b157bc6`, reproducibly: run this file with `VECTURA_PRE_WIP=1`
 * and 29 of 36 assertions fail. `lastRibbonStats.wallRings` is `undefined`
 * on every law (the field, and the class, did not exist) — `undefined > 0` is
 * false, so assertion 1 fails for the right reason: the feature was absent.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { preWipRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureClipGroups, captureSelfOcclusionFootprint, measureRingFillRate } = require('../helpers/scene3d-ring-coverage');

const LAWS = [
  'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand',
  'weightSmoothstep', 'ampSpacing', 'weaveDepth', 'interlockWeave',
  'trochoidLoop', 'amplitudeOnly', 'onePenDown',
];
const PEN_WIDTH = 0.3; // BOUNDS default (see tests/fixtures/scene3d-shadow-anatomy.js)

describe('SurfaceFill CLS_WALLS — every bucket-B law, torus', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preWipRuntimeOptions() });
    V = runtime.window.Vectura;

    LAWS.forEach((toneLaw) => {
      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === groupId);
      const obj = engine.getLayerDescendants(groupId)
        .filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };

      const cap = captureClipGroups(V);
      // F7 — observes exactly which final-line stretches self-occlusion
      // alone removed during THIS SAME build (see scene3d-ring-coverage.js's
      // own header). Empty under VECTURA_PRE_F7=1 or on any non-torus
      // primitive — see that file's "F7 CORRECTION" comment for why that
      // makes the disabled-self-occlusion safeguard hold exactly, not
      // approximately.
      const occlusionCap = captureSelfOcclusionFootprint(V);
      engine.computeAllDisplayGeometry();
      cap.restore();
      occlusionCap.restore();

      const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH,
        { selfOccludedSegments: occlusionCap.segments });
      results[toneLaw] = { stats, coverage, groupCount: cap.groups.length };
    });
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — is not silently inert (widens something)', (law) => {
    const { stats } = results[law];
    expect(stats.ribbonLaw).toBe(true);
    expect(stats.wide + stats.walls).toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — the CLS_WALLS class actually executes on a torus', (law) => {
    const { stats } = results[law];
    expect(stats.wallRings).toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — near-pen ribbons are coverage-clean (ring-fill-rate >= 0.995)', (law) => {
    const { coverage, groupCount } = results[law];
    // A law with nothing to rasterize would pass >= 0.995 vacuously — guard
    // the guard.
    expect(groupCount).toBeGreaterThan(0);
    expect(coverage.ringFillRate).not.toBeNull();
    expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
  });
});
