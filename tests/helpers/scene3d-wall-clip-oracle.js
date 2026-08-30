/**
 * Independent oracle for the CLS_WALLS phantom-lobe regression fixed on
 * `sf/integration` (bug introduced at `e047c9a7`, fixed in the working tree —
 * see `src/core/scene3d/surface-fill.js`'s CLS_WALLS comment block).
 *
 * The bug: CLS_WALLS clipped its analytic wall ring against
 * `visibleRegionInsetRings()` — the WHOLE fold-resolved front-face silhouette
 * unioned and then eroded by `penWidth/2` via `GeometryUtils.insetMultiPolygon`.
 * The fix clips CLS_WALLS straight to the RAW visible region instead.
 *
 * `RibbonGeometry.clipMultiPolygonToRegion(subjectMP, clipRings)` is the ONE
 * function both the CLS_WALLS class and the CLS_RIBBON ("wide") class call to
 * clip their swept geometry. The WIDE class has ALWAYS clipped straight to the
 * raw, un-eroded visible-region rings (`region = visibleRegionRings(!back)`)
 * on both sides of the fix — that call site is untouched by the diff. So the
 * WIDE class's own clip calls, captured live during the SAME build, are an
 * oracle for "the true visible region" that never runs through the code path
 * under test (CLS_WALLS's clip-target construction).
 *
 * Calls are told apart by `minHalfWidth`, the one `buildRibbonMultiPolygon`
 * option that differs between the two classes (WALLS clamps to a near-zero
 * pen-relative floor; WIDE uses the ribbon's own half-pen floor) — captured
 * via a WeakMap keyed on the exact multipolygon object `buildRibbonMultiPolygon`
 * returns, so pairing with the later clip call needs no assumption about call
 * order or count.
 *
 * MEASURED MECHANISM (this session, on the factory torus, `taperedEnds`,
 * camera pitch 18.5 — the "just barely open hole" fold-cusp regime): a
 * vertex-level or even edge-sampled containment check of the FINAL emitted
 * CLS_WALLS ring geometry against the raw region never found an escaped
 * point for any (law, pitch, torus-scale) combination tried — no wall
 * stretch's own samples happened to land in the affected sliver. But the
 * CLIP TARGET itself (`e047c9a7`'s `inset`, i.e. `wallsCalls[i].region`
 * below) is directly, grossly wrong: at pitch 18.5 the raw hole ring is
 * 10.78 mm², a `penWidth/2` (0.15 mm) erosion of its ~27 mm perimeter should
 * grow that to at most ~22.8 mm² (`area + perimeter * inset`, the Minkowski
 * bound for ANY erosion, convex or not) — measured actual: 58.27 mm², a
 * 2.56x overshoot with the ring's own vertex count jumping 128 -> ~300+
 * (self-intersection thrashing). That is `insetMultiPolygon` fabricating a
 * phantom lobe exactly as its own header warns, directly on the object
 * CLS_WALLS clips against, independent of whether any sampled wall stretch
 * happens to cross the affected sliver in a given scene.
 */
const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return Math.abs(a) / 2;
};

const ringPerimeter = (ring) => {
  let p = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    p += Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y);
  }
  return p;
};
const captureWallVsWideClips = (Vectura) => {
  const RGm = Vectura.RibbonGeometry;
  const origBuild = RGm.buildRibbonMultiPolygon;
  const origClip = RGm.clipMultiPolygonToRegion;
  const classOf = new WeakMap();
  const calls = [];
  RGm.buildRibbonMultiPolygon = function patchedBuild(centre, halfWidths, opts) {
    const mp = origBuild.apply(this, arguments);
    const mhw = opts && Number.isFinite(opts.minHalfWidth) ? opts.minHalfWidth : null;
    if (mp && mhw !== null) classOf.set(mp, mhw);
    return mp;
  };
  RGm.clipMultiPolygonToRegion = function patchedClip(subjectMP, clipRings) {
    const res = origClip.apply(this, arguments);
    calls.push({ minHalfWidth: classOf.get(subjectMP), region: clipRings, result: res });
    return res;
  };
  return {
    calls,
    restore: () => {
      RGm.buildRibbonMultiPolygon = origBuild;
      RGm.clipMultiPolygonToRegion = origClip;
    },
  };
};

module.exports = { captureWallVsWideClips, ringArea, ringPerimeter };
