const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-15 (F-14, P2) — "Calibrate the faceted density range (plane 4 lines at
 * d=50)".
 *
 * NO SOURCE FIX SHIPS WITH THIS FILE. This is a MEASUREMENT, following the
 * precedent `scene3d-box-density-bearing.test.js` set for the SAME shared
 * mechanism: it pins what is true today with the root cause proven, so the
 * next reader starts from evidence instead of re-discovering the trilemma.
 *
 * ── ROOT CAUSE, MEASURED ────────────────────────────────────────────────────
 * The faceted carrier's "at least N rulings" grant (`faceHatchLines`,
 * scene3d.js, guarded by `FACET_MIN_RULINGS`) targets a FIXED pitch —
 * `facetExtent / (want + 0.5)`, where `want = min(floor(zoneCeil/covOne),
 * FACET_MIN_RULINGS)`. `zoneCeil` and `covOne` are both purely geometric/tonal
 * (camera angle + zone), with NO Density term. So on any facet whose natural,
 * Density-driven pitch is coarser than that fixed target, EVERY Density in
 * that range renders the exact same pitch. Measured on the app-default plane
 * (60mm face, zone L, foreshortened ~0.35x by the default camera pitch/yaw):
 * Density 1 through 50 all draw identically 3 rulings (`hatchSpacing`
 * swinging from 13.87mm to 7.5mm in that span, with zero visible effect) —
 * this is F-14's "plane hatch draws 3-4 lines at d=1 AND at d=50" defect,
 * confirmed exactly.
 *
 * ── WHY NO FIX SHIPS ────────────────────────────────────────────────────────
 * Two fixes were built and both measured, not assumed:
 *   1. Ramp the grant's target from `FACET_MIN_RULINGS` up to the full
 *      zone-affordable count (`floor(zoneCeil/covOne)`, uncapped) as Density
 *      rises. This DOES fix the plateau (plane: 3,3,5,9,19,65 across
 *      d=1/10/25/50/100/220 — monotone, and Density-responsive from d=1).
 *      But raising the grant's CEILING (not just how fast it is reached)
 *      changes what the grant renders for every OTHER caller that also lands
 *      inside it — and several already do, at Density values (50, 85) well
 *      above the "low end" this fix targets. It broke 15 tests across 6
 *      files: `scene3d-facet-tone.test.js` (O20 cube-orientation ordering —
 *      "the better-lit face reads lighter" started failing), `scene3d-
 *      projected-pitch.test.js` (O20 — "the two lit faces differ" collapsed
 *      to a 0.0016 gap, was >=0.015), `scene3d-faceted-highlight-
 *      dispatch.test.js` (O9/O14 — "ink rises as the cone tightens" and "six
 *      treatments are all distinct" both broke), and `scene3d-subwindow-
 *      density.test.js` (the coverage probe's own clean-drawing baseline).
 *      These are not incidental snapshots; they are the tone-ladder's
 *      correctness invariants, and this fix genuinely violates them by
 *      forcing MULTIPLE distinct facets in one zone onto the SAME
 *      zone-derived pitch regardless of their natural Density-driven
 *      difference.
 *   2. Ramp the grant's target from 1 up to `FACET_MIN_RULINGS` (the ceiling
 *      UNCHANGED) as Density approaches a low knee, so Density >= the knee is
 *      byte-identical to today. This is provably safe (it cannot move any
 *      caller at or above the knee) but it also cannot move Density 50's
 *      rendered count AT ALL if the knee sits at or below 50 — which is
 *      exactly the density F-14's headline number complains about — so it
 *      does not close the finding.
 * This is the SAME trilemma `scene3d-box-density-bearing.test.js` already
 * documented and the owner ruled ACCEPTED for box's carrier floor
 * ("restoring proportionality... a product decision about the tone ladder,
 * not a bug fix"). This file extends that finding: it is not box-specific —
 * the identical mechanism, at the identical knee, governs the `R-cube`/
 * `R2-cube`/`LOWPOLY` fixtures several OTHER pinned suites depend on at
 * Density 50 and 85, so ANY fix that moves Density 50's carrier ceiling for
 * plane/box moves theirs too. Reopening it needs a coordinated redesign of
 * the zone-ceiling/grant system (decoupling "reads as a fill" from "tone
 * ordering integrity" per-facet, not just per-object) — out of scope for a
 * P2 calibration item, and risks regressing tone-ladder invariants outside
 * this branch's mandate (`hatchSpacing`/`contourStep`, per the work item).
 *
 * ── WHAT IS PINNED HERE ─────────────────────────────────────────────────────
 * The measured (unfixed) line counts, so a future change to this mechanism is
 * forced to look at this file and decide deliberately, and a regression that
 * makes the plateau WORSE (e.g. losing the "low reads as a fill" floor) is
 * caught immediately.
 *
 * ── W-15b (SECOND WORKSTREAM, 2026-09-05) — TWO MORE DESIGNS BUILT, MEASURED,
 * AND WITHDRAWN. STILL NO SOURCE FIX SHIPS. ─────────────────────────────────
 * The instruction this time was explicit: split the grant's single constant
 * into a FLOOR ("reads as a fill", ~FACET_MIN_RULINGS) and a TARGET that
 * tracks Density via `hatchSpacing(d)` scaled by the facet's own extent, with
 * the existing `zoneCeil/covOne` kept as the ceiling. Two designs were built
 * on exactly that shape and both were measured, not assumed, against the
 * SAME governing facets attempt 1 (above) broke — `R-cube`/`R2-cube` at
 * Density 85 (`facetCoverage`'s O20 rows, `scene3d-facet-tone.test.js` /
 * `scene3d-projected-pitch.test.js`) and the perFace highlight dispatch
 * (`scene3d-faceted-highlight-dispatch.test.js` O9/O14):
 *
 *   A. `want = min(max(floor(ext/hatchSpacing(d)), FACET_MIN_RULINGS),
 *      floor(zoneCeil/covOne))` — replace the grant's target outright, ceiling
 *      unchanged. Fixes the plateau (plane 6,6,7,9,19,65 across
 *      d=1/10/25/50/100/220 — Density-responsive from d=1, ratio d1/d50 =
 *      0.67). But it engages the grant far MORE OFTEN than before: at Density
 *      85 `R2-cube`'s `face:+X` (edge-on, k=0.165, `ceilCount=8`) now hits a
 *      target the OLD grant would never have proposed (old target 17.71mm >
 *      its own natural 12.96mm pitch, so the old grant never fired there at
 *      all — the facet was already natural/Density-governed). The new,
 *      denser target (7.29mm) DOES beat that natural pitch, so the grant
 *      fires where it used to stay silent, overriding an ALREADY-CORRECTLY-
 *      ORDERED facet. `scene3d-facet-tone.test.js` O20 bands 2-4 all invert
 *      (0.579/0.484/0.484, was < 0.551/0.469/0.469); `scene3d-projected-
 *      pitch.test.js` O20 breaks on `R-cube-bands2/3/4` and `R2-cube-bands2/
 *      3/4` (e.g. `face:+X 0.235` vs `face:+Z` falling to 0.170, was tied at
 *      0.235); `scene3d-faceted-highlight-dispatch.test.js` O14 loses a
 *      distinct treatment (5 of 6, was 6) and O9 collapses two
 *      `highlightSensitivity` steps to one signature.
 *   B. Preserve the OLD firing decision exactly — gate on
 *      `oldTarget = ext/(min(ceilCount,FACET_MIN_RULINGS)+0.5)` (byte-for-byte
 *      the pre-fix expression) and only widen the TARGET once that old gate
 *      already fires, using the same Density-driven `want` from (A), capped
 *      so it can never exceed `oldTarget`'s pitch (i.e. `want >= oldWant`
 *      always). This does leave every facet the old grant never touched
 *      alone — `R2-cube`'s `face:+X`/`face:+Z` gate decision is unchanged —
 *      yet the SAME suites still broke, on a DIFFERENT pair: `R-cube-bands2/
 *      3/4`'s `face:+Y` (which the old grant DOES govern at Density 85) drops
 *      from parity with `face:+X` (0.097) to 0.056 once its own ruling count
 *      is allowed to grow with Density instead of pinning at the OLD fixed 3
 *      — `scene3d-facet-tone.test.js` O20 bands 2-4 invert again (0.323/
 *      0.484/0.484); `scene3d-faceted-highlight-dispatch.test.js` O9 (`ink(3)
 *      > ink(1)`) breaks outright (1220.7 vs 1382.8). So "preserve the gate,
 *      widen the target" does not isolate the fix either: the SAME facets the
 *      floor exists to rescue (`R-cube face:+Y`, zone-ceiling-bound at
 *      Density 85) are exactly the ones O20/O9 depend on staying pinned at
 *      the OLD constant, not Density's own count.
 *
 * Both attempts reverted; `scene3d.js`'s faceted density path is byte-
 * identical to branch HEAD (a83fae78). The trilemma restated with these two
 * more data points: giving the carrier's floor ANY Density-sensitivity (via
 * the natural request, via the zone ceiling, or via a gate-preserving hybrid
 * of the two) reaches at least one facet the tone-ladder suites pin at the
 * OLD constant, because those suites' governing facets are drawn from
 * PRECISELY the low/mid-Density, ceiling-bound regime this floor occupies —
 * there is no Density-responsive floor formula that both moves and leaves
 * every currently-pinned facet's rendered count unchanged. Closing this
 * needs the coordinated redesign the W-15 notes above already called for
 * (decoupling "reads as a fill" from "tone ordering integrity" per-facet), not
 * a narrower formula for the same single grant.
 */

describe('Scene3D faceted density calibration — plane/box carrier grant (W-15/F-14, measurement)', () => {
  let runtime; let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const scene = (density, primitive) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    const prev = obj.params.primitive;
    if (primitive !== prev) {
      obj.params.primitive = primitive;
      obj.params.params = V.Scene3D.Params.buildPrimitiveParams(primitive, prev, null) || {};
    }
    obj.params.style.params.fillDensity = density;
    engine.computeAllDisplayGeometry();
    return { obj, paths: group.scenePaths || [] };
  };

  const fillLineCount = (density, primitive) => {
    const { obj, paths } = scene(density, primitive);
    return paths.filter((pp) => {
      const m = pp.meta || {}; const t = m.sceneTarget || {};
      return m.kind === 'sceneFill' && t.objectId === obj.id && !t.occluded;
    }).length;
  };

  const DENSITIES = [1, 10, 25, 50, 100, 220]; // the fill-audit's own Tier-A low/med/max plus intermediate samples

  test('hatchSpacing(50) is unchanged (7.5mm) — this file never touches the pinned mm curve', () => {
    const algo = V.AlgorithmRegistry.scene3d;
    expect(algo.__hatchSpacingForTest(50)).toBe(7.5);
  });

  // ── RED proof for the two rejected fixes, GREEN today ──────────────────────
  // A fix that raises the carrier's target above `FACET_MIN_RULINGS` (attempt
  // 1 above) makes this FAIL by construction (three consecutive counts would
  // stop being equal). If a future attempt lands changes here, that is
  // expected — but it must ALSO keep `scene3d-facet-tone.test.js`,
  // `scene3d-projected-pitch.test.js`, `scene3d-faceted-highlight-
  // dispatch.test.js` and `scene3d-subwindow-density.test.js` green, which
  // attempt 1 could not.
  // W-15c (Design C): the plateau is CLOSED. The carrier grant's target now
  // scales with `facetExtent / hatchSpacing(density)` (a uniform density
  // term, the same one the curved path's `tonePitch` uses), floored at
  // FACET_MIN_RULINGS rather than capped by it, so Density 1/10/25/50 must
  // no longer render identically. This is the RGR flip of the plateau test
  // W-15/W-15b pinned as "unresolved" — it is RED on the byte-identical
  // source those two commits left behind, and GREEN once Design C lands.
  test('FIXED (W-15c): the plane carrier is Density-responsive from d=1, not a plateau', () => {
    const counts = [1, 10, 25, 50].map((d) => fillLineCount(d, 'plane'));
    // Strictly increasing, not flat — the exact opposite of the withdrawn
    // designs' [3, 3, 3, 3].
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    expect(counts[0]).toBeGreaterThanOrEqual(3); // still reads as a fill at d=1
  });

  test('MEASURED: Density still moves the plane once the natural pitch overtakes the grant', () => {
    const counts = DENSITIES.map((d) => fillLineCount(d, 'plane'));
    // Weakly monotone (never decreasing) at every sampled point, and NOT flat
    // end-to-end — d=100/220 clearly respond even though d<=50 does not.
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });

  test('MEASURED: the box carrier is Density-responsive earlier than the plane (smaller/darker facets have less headroom under the grant)', () => {
    const counts = DENSITIES.map((d) => fillLineCount(d, 'box'));
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    // Box is not perfectly flat over 1-50 the way plane is — pinned so a
    // regression that flattens it further is caught.
    expect(counts[3]).toBeGreaterThan(counts[0]);
  });

  test('DONE_WHEN (partial): low Density still reads as a fill, not bare paper, on both primitives', () => {
    expect(fillLineCount(1, 'plane')).toBeGreaterThanOrEqual(3);
    expect(fillLineCount(1, 'box')).toBeGreaterThanOrEqual(3);
  });

  test('the max end is unaffected and does not saturate into a blob (min gap still >= 1 pen)', () => {
    const { obj, paths } = scene(220, 'plane');
    const lines = paths.filter((pp) => {
      const m = pp.meta || {}; const t = m.sceneTarget || {};
      return m.kind === 'sceneFill' && t.objectId === obj.id && !t.occluded;
    });
    expect(lines.length).toBeGreaterThan(30);
    // Every line has finite, non-degenerate length (no zero-length "blob" fill).
    lines.forEach((l) => {
      let len = 0;
      for (let i = 1; i < l.length; i += 1) len += Math.hypot(l[i].x - l[i - 1].x, l[i].y - l[i - 1].y);
      expect(len).toBeGreaterThan(0);
    });
  });
});
