/*
 * RGR — F5 REGRESSION: CLS_WALLS'S CLIP TARGET MUST NOT FABRICATE A PHANTOM
 * LOBE AT THE TORUS'S INNER-HOLE FOLD CUSP.
 *
 * Commit `e047c9a7` introduced `visibleRegionInsetRings()` — the CLS_WALLS
 * width class's clip target, built by unioning the whole fold-resolved
 * front-face silhouette (`visibleRegionRings`) and eroding THAT ENTIRE
 * self-occluding shape by `penWidth / 2` via
 * `GeometryUtils.insetMultiPolygon`. On a torus, the inner-hole fold cusp is
 * exactly the near-degenerate feature `insetMultiPolygon`'s own header warns
 * fabricates phantom lobes: the eroded boundary bulged PAST the true
 * occlusion cusp, so CLS_WALLS clipped against a corrupted target instead of
 * the true silhouette. Reported as "lines that should be obscured by the
 * front of the object are being shown", below the inner-right of the hole;
 * measured ~+22% ink in that screen region on `weightSmoothstep`.
 *
 * The fix (in the working tree, uncommitted at the time this test was
 * written) deletes `visibleRegionInsetRings` and clips the analytic wall ring
 * straight to the RAW visible region (`region = visibleRegionRings(!back)`)
 * instead — see the CLS_WALLS comment block in `surface-fill.js`.
 *
 * ORACLE — RAW-REGION CONTAINMENT (area/perimeter form), independent of the
 * code under test. `RibbonGeometry.clipMultiPolygonToRegion` is the one
 * function both the CLS_WALLS class and the CLS_RIBBON ("wide") class call to
 * clip their swept geometry. The WIDE class has ALWAYS clipped straight to
 * the same raw `region` on both sides of the fix — that call site is
 * untouched by the diff. So the WIDE class's own clip calls, captured live
 * during the SAME build via `captureWallVsWideClips`
 * (`tests/helpers/scene3d-wall-clip-oracle.js`), are ground truth for "the
 * true visible region" that never runs through `visibleRegionInsetRings` —
 * the region-EROSION code that broke — even though both classes share the
 * region-TRACER (`visibleRegionRings`) that did not break.
 *
 * A direct vertex/edge containment check of the FINAL emitted CLS_WALLS ring
 * geometry against that ground truth (tried first, this session) never found
 * an escaped point on this fixture at any pitch/law/torus-scale combination
 * tried — no sampled wall stretch happened to cross the affected sliver. The
 * defect is nonetheless real and directly measurable one level up, on the
 * CLIP TARGET CLS_WALLS actually builds: eroding a solid region's hole
 * boundary by `inset` can grow the hole's area by AT MOST
 * `perimeter * inset` (the Minkowski bound, exact for a convex hole, an
 * upper bound for any hole) — any bigger und it is not erosion, it is a
 * fabricated lobe. `e047c9a7`'s CLS_WALLS clip target blows through that
 * bound at the torus's fold-cusp pitch (measured this session: raw hole
 * 10.78 mm^2, legitimate-erosion ceiling 22.75 mm^2, actual 58.27 mm^2 — a
 * 2.56x overshoot, with the ring's own vertex count exploding from 128 to
 * 300+, i.e. self-intersection thrashing). The fixed tree's clip target IS
 * the raw region (same object), so its hole area is bit-identical to ground
 * truth — nowhere near the ceiling.
 *
 * RED against `e047c9a7`: run with `VECTURA_PRE_WALLS_FIX=1`.
 *   VECTURA_PRE_WALLS_FIX=1 npx vitest run tests/unit/scene3d-ribbon-wall-region-clip.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { preWallsFixRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureWallVsWideClips, ringArea, ringPerimeter } = require('../helpers/scene3d-wall-clip-oracle');

const PEN_WIDTH = 0.3;
const TONE_LAW = 'taperedEnds';
// The "just barely open hole" fold-cusp regime: at pitch 18.5 the torus's
// inner hole has just pulled apart from a shut fold into a genuine (small)
// opening — regionRings flips from 1 to 2 in the 18.00-18.02 range on this
// fixture (measured this session) — which is exactly where
// `insetMultiPolygon`'s own header says an offset comparable to local
// feature size is most likely to misbehave.
const CAMERA_PITCH = 18.5;
// Legitimate erosion of a hole boundary by `inset` grows its area by at most
// `perimeter * inset` (exact for a convex hole; an upper bound in general —
// concavities only reduce the swept band's net area contribution). A little
// headroom over that theoretical ceiling absorbs polygon-clipping's own
// snap-grid and RDP-retry jitter without weakening the assertion: the
// measured buggy overshoot (2.56x) is far past any plausible jitter budget.
const EROSION_HEADROOM = 1.5;

describe('SurfaceFill CLS_WALLS — clip target must not fabricate a phantom lobe at the torus inner-hole fold cusp', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preWallsFixRuntimeOptions() });
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => runtime && runtime.cleanup());

  test('CLS_WALLS\'s clip-target hole does not grow past the raw region\'s legitimate erosion ceiling', () => {
    const engine = new V.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);
    const obj = engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: TONE_LAW };
    group.params.camera = { ...group.params.camera, pitch: CAMERA_PITCH };

    const cap = captureWallVsWideClips(V);
    engine.computeAllDisplayGeometry();
    cap.restore();

    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(stats).toBeTruthy();
    expect(stats.penWidth).toBe(PEN_WIDTH);
    // Sanity: this is the genuinely-open-hole regime (a two-ring region), not
    // the fully-shut fold (one ring) — the defect needs a hole to corrupt.
    expect(stats.regionRings).toBe(2);

    const calls = cap.calls.filter((c) => c.minHalfWidth != null);
    const widths = [...new Set(calls.map((c) => c.minHalfWidth))].sort((a, b) => a - b);
    // Both width classes must actually have fired and been distinguishable —
    // otherwise there is no independent WIDE-class region to check against,
    // and the assertions below would be vacuous.
    expect(widths.length).toBe(2);
    const [wallsWidth, wideWidth] = widths;
    const wallsCalls = calls.filter((c) => c.minHalfWidth === wallsWidth);
    const wideCalls = calls.filter((c) => c.minHalfWidth === wideWidth);
    expect(wallsCalls.length).toBeGreaterThan(0);
    expect(wideCalls.length).toBeGreaterThan(0);
    // Guard against a mislabelled pairing: WALLS is the near-zero pen-relative
    // floor, WIDE is the ribbon's own half-pen floor.
    expect(wallsWidth).toBeLessThan(wideWidth);

    // Ground truth: the raw region the WIDE class actually clipped against —
    // untouched by the diff either side of the fix. Two rings: outer shell +
    // inner hole. The hole is the smaller-area ring.
    const rawRegion = wideCalls[0].region;
    expect(Array.isArray(rawRegion) && rawRegion.length).toBe(2);
    const rawSorted = [...rawRegion].sort((a, b) => ringArea(a) - ringArea(b));
    const rawHole = rawSorted[0];
    const rawHoleArea = ringArea(rawHole);
    const rawHolePerimeter = ringPerimeter(rawHole);
    // There must be a real hole to protect, or the ceiling below is vacuous.
    expect(rawHoleArea).toBeGreaterThan(0.5);

    const legitimateCeiling = rawHoleArea + rawHolePerimeter * (PEN_WIDTH / 2) * EROSION_HEADROOM;

    // The clip target CLS_WALLS actually built and passed to
    // `clipMultiPolygonToRegion` this build.
    const wallsRegion = wallsCalls[0].region;
    expect(Array.isArray(wallsRegion) && wallsRegion.length).toBeGreaterThanOrEqual(1);
    const wallsSorted = [...wallsRegion].sort((a, b) => ringArea(a) - ringArea(b));
    const wallsHoleArea = ringArea(wallsSorted[0]);

    // THE CLAIM. CLS_WALLS's own clip-target hole may only have grown by a
    // legitimate erosion margin over the independently-sourced raw hole —
    // never fabricated a phantom lobe past it.
    expect(wallsHoleArea).toBeLessThanOrEqual(legitimateCeiling);
  }, 120000);
});
