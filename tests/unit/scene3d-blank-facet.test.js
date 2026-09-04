/**
 * A FACET THE DRAWING SHOWS MUST CARRY THE TONE IT WAS GIVEN.
 *
 * Round 9's review found, and Round 9's submission did not report, that seven
 * facets went from toned to BARE PAPER between `75b97a5` and `8c0f249`. The
 * cause was read as "the k-floor drop 0.12 → 0.02 lets an edge-on facet ask for
 * nothing", and the finding was filed under the limb.
 *
 * MEASURED IN ROUND 10, THE READING IS WRONG IN BOTH HALVES.
 *
 * 1. It is not a limb defect. Of the nine zero-fill facets on `W-lp-sun45`,
 *    FIVE are zone L — the CENTRE LIGHT — and two of those are the largest
 *    facets in the list (202.5 mm² at N·L 0.898, 188.8 mm² at N·L 0.950). Only
 *    two (zone T at N·L 0, zone R at N·L 0) are anywhere near the limb.
 *
 * 2. It is not entirely new. At `75b97a5`, `face:89` on `W-lp-sun45` and
 *    `face:39` / `face:78` on `R-lp-bands4` already carried zero fill. The
 *    review's "at 75b97a5 every facet with geometry carried fill" is false; the
 *    count was 1 and 2, not 0 and 0, and it went to 9 and 8, not 7 and 5.
 *
 * THERE ARE TWO CAUSES AND THEY ARE DIFFERENT DEFECTS. Instrumented on the live
 * call path (plane pitch, the facet's own in-plane extent across the rulings,
 * and `uvPitchFactor` k):
 *
 *   face   zone  screen pitch     k      plane pitch   facet extent
 *   26      L        15.873     0.5680      27.943        27.226   tone wider than the facet
 *   89      L        16.373     0.5209      31.431        25.226   tone wider than the facet
 *   21      L         4.584     0.0215     213.469        28.774   k blew the pitch up
 *   84      L         4.707     0.0873      53.936        31.843   k blew the pitch up
 *   38      T         1.980     0.0564      35.091        30.456   k blew the pitch up
 *
 * `hatchPolygon` places rulings at `pMin + i·spacing` for `i = 1 … floor(extent /
 * spacing)`. A spacing wider than the facet's own extent gives `count = 0` — the
 * facet is silently dropped from the drawing, at whatever tone it was asked for.
 * A well-lit 202 mm² facet in the middle of the form draws NOTHING, which is the
 * same defect §4.4 of the Round 9 scorecard found from the other side: two facets
 * at N·L 0.746 and 0.744 measuring D 0.000 and D 0.163.
 *
 * THE RULE THIS PINS. A family whose pitch exceeds the facet draws one ruling
 * instead of none — but ONLY when the facet's own width on paper can absorb one
 * ruling inside the zone's composed ceiling. The ceiling is the SAME law the
 * curved path already enforces (`TOTAL_DARK_CEIL × weight / DARKEST_WEIGHT`,
 * `surface-fill.js`), now stated once in `Regions.formCeiling` and read by both.
 *
 * That gate is what keeps the fix from being a flood: one ruling across the 9 mm²
 * near-edge-on sliver `face:21` lands 0.486 coverage against zone L's ceiling of
 * 0.0987 — 4.9x over — so that facet is still, correctly, left bare. One ruling
 * across the 202 mm² `face:26` lands 0.019 against the same ceiling, which is
 * within 3 % of the 0.019 its own recipe asked for, and is drawn.
 *
 * AND THE GLINT FACET IS THE HEADLINE. `face:26` and `face:89` are the two
 * largest, and both carry `glint`. `GLINT_GAIN_MULT` is a MULTIPLIER, and the
 * comment beside it says why in as many words:
 *
 *     "Capped, not emptied. A cube shows three faces, and emptying one reads as
 *      a hole rather than as a highlight (§5.4 #1 — a highlight is defined by the
 *      ink AROUND it)."
 *
 * On the low-poly geodesic it WAS emptied — not by any decision, but because the
 * capped pitch (15.9 mm) exceeded the facet's own width on paper (14 mm) and
 * `hatchPolygon` quantized it to zero. An invariant stated in the source and
 * violated in the drawing, at both `75b97a5` and `8c0f249`. O8's own clause is
 * "never a whole blank face bounded by the object's own edge"; this is that.
 *
 * Fixture from `tests/fixtures/scene3d-shadow-anatomy.js`. Nothing restated.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

const polyArea = (poly) => {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
};

// Every FRONT-FACING facet of the view's single object, with the fill ink laid
// inside it. Ink is read off the emitted paths' own `sceneTarget.faceId` — the
// renderer's own attribution, not a point-in-polygon reconstruction — so a facet
// reporting zero here drew nothing, with no instrument judgement in between.
const facetFill = (viewId) => {
  const np = FIX.buildParams(V, viewId);
  const paths = FIX.buildPaths(V, viewId);
  const G3 = V.Geometry3D;
  const scn = V.Scene3D.Scene.assembleScene(np, FIX.BOUNDS);
  const built = (scn.objects || []).find((o) => o.id === np.objects[0].id);
  if (!built || !Array.isArray(built.faces) || !Array.isArray(built.world)) return [];

  const inkByFace = new Map();
  paths.forEach((p) => {
    const m = p.meta || {}; const t = m.sceneTarget || {};
    if (m.kind !== 'sceneFill' || t.faceId == null) return;
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    inkByFace.set(t.faceId, (inkByFace.get(t.faceId) || 0) + L);
  });

  const N = built.world.length;
  const oc = built.world.reduce(
    (a, p) => ({ x: a.x + p.x / N, y: a.y + p.y / N, z: a.z + p.z / N }), { x: 0, y: 0, z: 0 },
  );
  const ys = built.world.map((p) => p.y).filter((y) => Number.isFinite(y));
  const gLo = Math.min(...ys); const gHi = Math.max(...ys);
  const ground = gHi > gLo ? { y0: gLo, height: gHi - gLo } : null;

  const out = [];
  built.faces.forEach((f, idx) => {
    const world = (f.indices || []).map((i) => built.world[i]).filter(Boolean);
    if (world.length < 3) return;
    const n0 = G3.cross(G3.sub(world[1], world[0]), G3.sub(world[2], world[0]));
    const L = Math.hypot(n0.x, n0.y, n0.z);
    if (L < 1e-9) return;
    let nrm = G3.mul(n0, 1 / L);
    const M = world.length;
    const cen = world.reduce(
      (a, p) => ({ x: a.x + p.x / M, y: a.y + p.y / M, z: a.z + p.z / M }), { x: 0, y: 0, z: 0 },
    );
    if (G3.dot(nrm, G3.sub(cen, oc)) < 0) nrm = G3.mul(nrm, -1);
    if (G3.rotatePoint(nrm, scn.camera).z <= 0) return;      // a back face is hidden, not blank
    const poly = (Array.isArray(f.polygon) && f.polygon.length >= 3)
      ? f.polygon.map((q) => ({ x: q.x, y: q.y }))
      : world.map((q) => scn.projectWorld(q)).filter(Boolean);
    if (poly.length < 3) return;
    const id = f.faceId != null ? f.faceId : `face:${idx}`;
    out.push({
      id,
      zone: V.Scene3D.Regions.formZone(nrm, cen, { tone: np.tone, lights: np.lights, ground }),
      NL: Math.max(0, V.Scene3D.Regions.signedLambert(nrm, cen, np.lights)),
      area: polyArea(poly),
      ink: inkByFace.get(id) || 0,
    });
  });
  return out;
};

// ── The zone ceiling, stated once ───────────────────────────────────────────
describe('the composed ink ceiling is one law, not two copies (§4.2)', () => {
  test('Regions.formCeiling reproduces the curved path\'s own arithmetic', () => {
    const R = V.Scene3D.Regions;
    expect(typeof R.formCeiling).toBe('function');
    // TOTAL_DARK_CEIL x (coverage + cross) / DARKEST_WEIGHT, the exact
    // expression at surface-fill.js:747. T saturates the ladder's top rung.
    expect(R.formCeiling('T')).toBeCloseTo(0.47, 6);
    expect(R.formCeiling('F')).toBeCloseTo(0.47 * (0.82 + 0.20) / 2.0, 6);
    expect(R.formCeiling('M')).toBeCloseTo(0.47 * 0.62 / 2.0, 6);
    // O6's own ceiling, the number that made the 0.10 bar unreachable.
    expect(R.formCeiling('L')).toBeCloseTo(0.47 * R.formInk('L').coverage / 2.0, 6);
    expect(R.formCeiling('H')).toBe(0);
  });
});

// ── The regression itself ───────────────────────────────────────────────────
//
// Pinned as a COUNT plus the surviving ids, per fixture, so a future round that
// blanks a facet has to say so. The two fixtures are the low-poly geodesic under
// the two suns; they are the only views in the set with enough facets for the
// count to mean anything.
describe('a visible facet is not silently dropped from the drawing (§4.1, §4.4)', () => {
  const survivors = (viewId) => facetFill(viewId).filter((f) => f.ink === 0);

  // The one bound that matters to the eye. A bare facet the size of a pen mark
  // is a texture; a bare facet a fifth the width of the form is a HOLE, and both
  // `75b97a5` (188.8 mm² and 147.7 mm² bare) and `8c0f249` (202.5 mm² as well)
  // had holes. 40 mm² is ~6 mm across at the fixture's scale, under two window
  // widths, and every facet the ceiling still refuses is below it.
  const BARE_AREA_MAX_MM2 = 40;

  test('W-lp-sun45 — no facet worth seeing is left bare', () => {
    const rows = facetFill('W-lp-sun45');
    expect(rows.length).toBe(90);
    const tooBigToBeBare = rows
      .filter((f) => f.ink === 0 && f.area > BARE_AREA_MAX_MM2)
      .map((f) => `${f.id} ${f.zone} ${f.area.toFixed(1)}mm2`);
    expect(tooBigToBeBare).toEqual([]);
  });

  test('R-lp-bands4 — no facet worth seeing is left bare', () => {
    const rows = facetFill('R-lp-bands4');
    expect(rows.length).toBe(40);
    const tooBigToBeBare = rows
      .filter((f) => f.ink === 0 && f.area > BARE_AREA_MAX_MM2)
      .map((f) => `${f.id} ${f.zone} ${f.area.toFixed(1)}mm2`);
    expect(tooBigToBeBare).toEqual([]);
  });

  test('the count of bare facets is pinned, per fixture', () => {
    // A ratchet, not an aspiration. What is left is what the zone ceiling
    // genuinely refuses — near-edge-on slivers where ONE ruling would land 1.1x
    // to 4.9x over the zone's own ceiling (face:21 at 0.486 against L's 0.0987).
    // That is now a DECISION with arithmetic behind it rather than the residue of
    // a k-floor chosen to keep the arithmetic finite, which is what the Round 9
    // review asked for. If a round moves either number it must say why.
    expect(survivors('W-lp-sun45').length).toBe(6);
    expect(survivors('R-lp-bands4').length).toBe(3);
  });
});
