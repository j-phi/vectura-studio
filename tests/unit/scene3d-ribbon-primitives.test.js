/*
 * RGR — EVERY VARIABLE-WIDTH LAW MUST RIBBONIZE ON EVERY CURVED PRIMITIVE.
 *
 * WHAT WENT WRONG (judge A, 2026-08-29). Changing nothing but
 * `params.primitive` to `torus` made all twelve bucket-B laws refuse 40–58% of
 * their wide stretches and ship bare centrelines: `amplitudeOnly` 24 ribbons of
 * 57 wide, `ampSpacing` 44 of 82, `whiteBand` 25 of 42, `taperedEnds` 16 of 32.
 * Sphere, capsule and cylinder were clean. Every refusal was `clipEmpty` or
 * `erodeEmpty` and `noRing` was 0 everywhere — the ribbon RING always built, so
 * the failure was the CLIP against the traced visible region.
 *
 * THE CAUSE, measured. `sampleAt` used to orient each surface normal on its own
 * with `dot(nLocal, p0) < 0` — "outward, charts centre near origin". That
 * heuristic is false on a torus: `dot(n, p) = major·cos(2πv) + minor`, which
 * goes negative on the inner third of the tube, so 6837 of 24779 samples (27.6%)
 * came back with an INVERTED normal (sphere / capsule / cylinder: 0 inverted).
 * `front` therefore flipped across the locus `cos(2πv) = -minor/major`, and
 * `buildRegionRings` traced that locus as two extra "silhouettes" (measured
 * signed areas -422.77 and -464.05 against the true outer silhouette +1282.37).
 * Screen containment then classified both as HOLES and the clip region collapsed
 * from 1282.4 mm² to 399.6 mm² — 31% of the form. 12.6% of the fill vertices the
 * front test had itself proved on-surface fell outside their own clip region.
 *
 * A SPHERE-ONLY MATRIX IS HOW THIS HID. This one is per-primitive by
 * construction: every curved primitive the ribbon pipeline can reach is driven,
 * and a new one added to `CURVED` fails here until it is measured.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Every curved primitive `SurfaceFill.chartFor` can chart and the UI can pick.
// `torus` is the regression; the other three are the controls that were already
// clean and must STAY clean.
const CURVED = ['sphere', 'capsule', 'cylinder', 'torus'];

// Four bucket-B (variable-width) laws, chosen as the ones judge A measured
// collapsing. `onePenDown` is deliberately absent: it carries its own known
// 1-per-build erosion refusal (finding F3) and would confound this one.
const LAWS = ['taperedEnds', 'ampSpacing', 'whiteBand', 'amplitudeOnly'];

describe('SurfaceFill ribbons — every bucket-B law, every curved primitive', () => {
  let runtime;
  let V;
  const matrix = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
    CURVED.forEach((primitive) => {
      matrix[primitive] = {};
      LAWS.forEach((toneLaw) => {
        const engine = new V.VectorEngine();
        const groupId = engine.addLayer('scene3d');
        const obj = engine.getLayerDescendants(groupId)
          .filter((l) => l && l.type === 'object3d')[0];
        obj.params.primitive = primitive;
        obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
        obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
        engine.computeAllDisplayGeometry();
        matrix[primitive][toneLaw] = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      });
    });
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  // Guard the guard: a build that never widened anything would pass every
  // assertion below trivially, which is exactly how an inert pipeline hides.
  //
  // STALE-ASSERTION UPDATE (F3 fix, 2026-08-30): `ribbonize` now classifies a
  // stretch into one of THREE width classes instead of two — CLS_CENTRE
  // (<=1 pen), CLS_WALLS (1-2 pen, built analytically), CLS_RIBBON (>2 pen,
  // this file's original `wide`). Most of what this file measured as `wide`
  // pre-fix is now `walls`: the "actually widened" question is answered by
  // `wide + walls`, not `wide` alone — asserting `wide > 0` alone is exactly
  // the kind of stale assertion that would hide the WALLS class going inert.
  test.each(CURVED)('%s — the laws actually widen something to ribbonize', (primitive) => {
    LAWS.forEach((law) => {
      expect(matrix[primitive][law].ribbonLaw).toBe(true);
      expect(matrix[primitive][law].wide + matrix[primitive][law].walls).toBeGreaterThan(0);
    });
  });

  /*
   * The bar is ZERO refusals, and it is met on every primitive whose visible
   * region is simply connected.
   *
   * The torus keeps a small, NAMED allowance, and only because its hole is
   * barely open at the factory camera: 42.9 mm² of a 1282.4 mm² silhouette, a
   * lens 34 mm wide and 3.8 mm tall that PINCHES SHUT at both ends. A ruling
   * that reaches a pinch is on the surface and inside the hole's traced outline
   * at the same time, to within a fraction of a pen; widened sideways, what
   * survives the clip cannot hold a 0.3 mm pen, so it degenerates to one
   * centreline pass exactly as contract C3 rule 5 requires — the counters just
   * book that as `clipEmpty`/`erodeEmpty`. Measured after the fix: taperedEnds
   * 0 of 18, whiteBand 1 of 20, amplitudeOnly 2 of 46, ampSpacing 3 of 59 — all
   * of them inside x 123..158, y 82..87, which is the hole's own band, and none
   * of them anywhere near the outer limb. Raising the tracer from 72 to 144 and
   * to 216 cells per axis does not move any of these numbers, so they are not a
   * resolution artefact and there is nothing to tune.
   *
   * The defect this file exists for looked nothing like that: 16 of 32, 38 of
   * 82, 17 of 42, 33 of 57 — 40-58%, spread across the whole form.
   */
  const REFUSAL_ALLOWANCE = { sphere: 0, capsule: 0, cylinder: 0, torus: 3 };

  test.each(CURVED)('%s — every wide stretch becomes a ribbon, none is refused', (primitive) => {
    LAWS.forEach((law) => {
      const s = matrix[primitive][law];
      // `noRing` is zero on every primitive, always: ring CONSTRUCTION never
      // failed even at the height of the defect, and if it ever starts to, that
      // is a different bug and must not hide inside the hole-cusp allowance.
      expect({ law, noRing: s.noRing }).toEqual({ law, noRing: 0 });
      // Every wide stretch either became a ribbon or was booked as a refusal —
      // nothing may go missing between the two.
      expect({ law, wide: s.wide })
        .toEqual({ law, wide: s.ribbons + s.noRing + s.clipEmpty + s.erodeEmpty });
      expect(s.wide - s.ribbons).toBeLessThanOrEqual(REFUSAL_ALLOWANCE[primitive]);
    });
  });

  test.each(CURVED)('%s — the clip region is the real form, not a collapsed sliver', (primitive) => {
    LAWS.forEach((law) => {
      const s = matrix[primitive][law];
      expect(s.noRegion).toBe(0);
      expect(s.regionRings).toBeGreaterThan(0);
      // The traced region must cover the form. The torus's collapse showed up
      // here first: 399.6 mm² where the outer silhouette encloses 1282.4.
      expect(s.regionArea).toBeGreaterThan(600);
    });
  });

  // The torus is the only one of the four whose visible region has a genuine
  // HOLE, and the fix must not buy its ribbons by filling that hole in. Its
  // region is therefore strictly SMALLER than the area its outer silhouette
  // encloses — asserted against the outer ring's own area, measured live, so
  // the bar is independent of the camera and of the object's size.
  test('torus — the hole through the middle survives as a hole', () => {
    LAWS.forEach((law) => {
      const s = matrix.torus[law];
      expect(s.regionRings).toBeGreaterThanOrEqual(2);
      expect(s.regionArea).toBeLessThan(s.regionOuterArea);
      expect(s.regionArea).toBeGreaterThan(s.regionOuterArea * 0.8);
    });
  });

  /*
   * THE OTHER HALF OF THE SAME QUESTION — a fold is not a hole.
   *
   * Tip the camera down until the torus is nearly edge-on and its hole SHUTS.
   * The inner contour is still traced — it is still where the surface turns
   * away — but it is now a CREASE across a doubly-covered sheet, not an edge of
   * the drawing. Containment alone cannot tell the two apart and carved in both
   * cases: measured at pitch 5, region 515.1 mm² of an 818.9 mm² silhouette with
   * 4 wide stretches refused. The winding can: the fold ring winds the SAME way
   * as the silhouette (+303.8 here) where a real hole winds the other way
   * (-42.9 at the default pitch, asserted above).
   */
  test('torus — a fold across a doubly-covered sheet is NOT carved out', () => {
    const engine = new V.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);
    group.params.camera = { ...(group.params.camera || {}), pitch: 5 };
    const obj = engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: 'taperedEnds' };
    engine.computeAllDisplayGeometry();
    const s = V.Scene3D.SurfaceFill.lastRibbonStats;

    expect(s.wide).toBeGreaterThan(0);
    expect(s.regionRings).toBe(1);
    expect(s.regionArea).toBe(s.regionOuterArea);
    expect({ ribbons: s.ribbons, clipEmpty: s.clipEmpty, erodeEmpty: s.erodeEmpty })
      .toEqual({ ribbons: s.wide, clipEmpty: 0, erodeEmpty: 0 });
  }, 120000);
});
