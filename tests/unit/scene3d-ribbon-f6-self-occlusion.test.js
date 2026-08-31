/*
 * RGR — F6 REGRESSION: THE REGION A RIBBON CLIPS AGAINST MUST NEVER
 * SELF-INTERSECT AT THE TORUS'S INNER-HOLE FOLD CUSP.
 *
 * Reported: at a torus's default 3/4 view, the inner-hole silhouette carries
 * short filled triangular wedge stubs near 4 and 8 o'clock (geometry from the
 * far side of the tube drawn over the near side), and the wall/fill band on
 * the right flank (roughly 2-4 o'clock) comes out broken where it should run
 * continuous. Both are the SAME defect.
 *
 * DIAGNOSIS (see the "F6 — A SINGLE RING CAN CROSS ITSELF, TOO" comment
 * block in `surface-fill.js`, right before `resolveFoldRings`). Two
 * hypotheses were tried and rejected before this one:
 *
 *   1. Split a ribbon STRETCH wherever its own centreline self-intersects
 *      (mirroring how a self-crossing ribbon centreline is already handled
 *      elsewhere). Rejected: instrumented every `RibbonGeometry.
 *      buildRibbonMultiPolygon` call on this fixture — 0 of 47 centrelines
 *      self-intersect. The stretches are individually simple; the defect is
 *      not there.
 *   2. Detect genuine 3-D self-occlusion between DIFFERENT stretches via a
 *      dense self-depth field (`Scene3D.Depth`, built from the same (a, b)
 *      grid `buildRegionRings` samples) and split stretches at the
 *      near/far disagreement. Rejected: at the reported default view the
 *      region is already a genuine 2-ring silhouette (no fold ring is ever
 *      dropped there, per `resolveFoldRings`'s own contract), so the field
 *      had NOTHING to act on and produced a byte-identical render before and
 *      after. Un-gated, it also fabricated multi-mm-to-30mm phantom "self-
 *      occlusion" from its own grid's linear interpolation across fast-
 *      foreshortened regions, breaking five DECORATIVE self-crossing laws
 *      (onePenDown/trochoidLoop/interlockWeave/weaveDepth/ampSpacing — F1's
 *      territory) that must not regress.
 *
 * The actual root cause: `buildRegionRings`'s marching-squares tracer can
 * produce ONE region ring that crosses ITSELF at the cusp — where the true
 * 3-D silhouette's inner and outer rims meet tangentially — instead of two
 * clean rings (measured: a 128-point ring self-crosses 3 times within ~30mm
 * of the object's centre on this exact fixture). `RibbonGeometry.
 * clipMultiPolygonToRegion` — a pure polygon-clipping boolean, like every
 * clip-ring consumer in this codebase — has no defined answer for a
 * self-intersecting clip boundary. That undefined behaviour is the wedge
 * (ink let through outside the true silhouette) and the flank dashing (ink
 * wrongly cut inside it), at once, from the SAME corrupted ring.
 *
 * The fix (`resolveRingSelfIntersections` in `surface-fill.js`, applied to
 * every ring `buildRegionRings` traces before `resolveFoldRings` ever sees
 * it) splits a self-crossing ring at its own crossing point(s) — cutting a
 * figure-8 back into its constituent loops, exactly as traced, with NO
 * external re-orientation — and keeps only the loop(s) above a tiny sliver
 * floor. (A generic `FillBoolean.union` self-union was tried first and
 * rejected: polygon-clipping normalises winding, which silently flipped the
 * torus's true inner-hole ring into a same-winding "fold" and
 * `resolveFoldRings` dropped it outright — `regionArea` came back EQUAL to
 * `regionOuterArea`, erasing the hole. Worse than the wedge it was meant to
 * fix.)
 *
 * ORACLE — see `tests/helpers/scene3d-region-ring-oracle.js` for why a
 * per-vertex ink/depth comparison was rejected as unreliable on this
 * fixture, and why "every captured region ring is simple" is nonetheless an
 * INDEPENDENT claim: it is checked by a self-intersection test written fresh
 * in the helper, never calling `ringHasSelfIntersection` /
 * `resolveRingSelfIntersections` or any other code this fix touches.
 *
 * RED against `ecc50c16` (the commit this fix starts from), reproducibly:
 *   VECTURA_PRE_F6=1 npx vitest run tests/unit/scene3d-ribbon-f6-self-occlusion.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureRegionRings, findSelfIntersectingRings } = require('../helpers/scene3d-region-ring-oracle');

const F6_BASELINE_SHA = 'ecc50c16';
const preF6RuntimeOptions = makePreShaRuntimeOptions(F6_BASELINE_SHA, 'VECTURA_PRE_F6');

const LAWS = ['taperedEnds', 'weightSmoothstep'];

describe('SurfaceFill ribbon — F6 region self-intersection at the torus inner-hole fold cusp', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preF6RuntimeOptions() });
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — no region ring handed to the ribbon/wall clip self-intersects', (toneLaw) => {
    const engine = new V.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);
    const obj = engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
    // Default camera (3/4 view: yaw -30, pitch 20) — untouched, matching the
    // reported view.

    const cap = captureRegionRings(V);
    engine.computeAllDisplayGeometry();
    cap.restore();

    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(stats).toBeTruthy();
    expect(stats.ribbonLaw).toBe(true);
    // Guard the guard: this fixture must actually reach the WALLS/RIBBON
    // branches (an inert ribbon that silently fell back to bare centrelines
    // would pass the assertion below vacuously — harness-clean is not
    // app-clean), and must actually build a real hole to have a cusp at all.
    expect(stats.wide + stats.walls).toBeGreaterThan(0);
    expect(stats.regionRings).toBeGreaterThanOrEqual(2);
    expect(cap.regions.length).toBeGreaterThan(0);

    // THE CLAIM. Every region ring this build handed to
    // `clipMultiPolygonToRegion` is a simple polygon.
    const hits = findSelfIntersectingRings(cap.regions);
    expect(hits).toEqual([]);
  }, 120000);
});
