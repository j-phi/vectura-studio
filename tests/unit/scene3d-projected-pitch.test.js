/**
 * THE FACETED FILL LANDS ITS TONE ON PAPER, NOT IN THE FACE PLANE.
 *
 * Round 8 measured `R2-cube-bands4`'s `+X` face at D 0.891 over 7 windows — the
 * darkest thing in the drawing by a wide margin, darker than the contact shadow,
 * and dark enough that a real pen would sit in a puddle. Round 9's diagnosis:
 *
 *   `+X` and `+Z` are the SAME ZONE with the SAME RECIPE. Intercepted on the
 *   live call path, both receive zone F, spacing 1.9799, family A at plane
 *   spacing 2.3346 and family B at 11.6732 — identical to four decimal places.
 *   The only difference between them is the projection: `+X` is turned nearly
 *   edge-on (341 mm² projected against 3242).
 *
 * The faceted fill already compensates for foreshortening — it divides the plane
 * spacing by `uvCompression`, the length of one unit ACROSS the rulings under
 * the uv→screen map. But the quantity that sets the pitch ON PAPER is the
 * PERPENDICULAR distance between adjacent rulings after the map, which is
 * `|det M| / |M · d|` for a family ruling along `d`. The two agree when the map
 * has no shear and diverge without bound as a facet turns edge-on:
 *
 *              across-length   TRUE perpendicular
 *   +X  fam A       0.8480               0.1650      5.1x under-spaced
 *   +X  fam B       0.1523               0.0893      (and fam B was being
 *   +Z  fam A       0.8480               0.8467       compensated with fam A's
 *   +Z  fam B       0.9896               0.9858       factor, 1.7x more)
 *
 * So the cap was stated on a proxy one transform away from the metric — this
 * workstream's signature bug, and the fourth time it has appeared. The plot
 * floor rode on the same proxy, which is why it never bound.
 *
 * WHAT IS MEASURED HERE. Projected coverage: the ink actually drawn inside a
 * facet's projected polygon, widened by the pen, over that polygon's own area.
 * It is the geometric twin of the D the offline harness reads off a raster, and
 * it needs no rasteriser:
 *
 *   R2-cube-bands4  +Z   coverage 0.179   harness D 0.186
 *   R2-cube-bands4  +X   coverage 1.046   harness D 0.891
 *
 * The bar is the object's own protected ceiling, `max(object) <= 0.56`.
 *
 * Fixture from `tests/fixtures/scene3d-shadow-anatomy.js`. Nothing restated.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

const PEN = FIX.BOUNDS.penWidth;
const OBJECT_DARK_CEIL = 0.56;   // the protected max(object) bound

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y))
      && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};
const polyArea = (poly) => {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(s) / 2;
};

// Every FRONT-FACING facet of the view's single object, with the projected ink
// coverage that lands inside it. The facets come from the same `assembleScene`
// the renderer drew, so these are the polygons that were filled.
const facetCoverage = (viewId) => {
  const np = FIX.buildParams(V, viewId);
  const paths = FIX.buildPaths(V, viewId);
  const G3 = V.Geometry3D;
  const scn = V.Scene3D.Scene.assembleScene(np, FIX.BOUNDS);
  const built = (scn.objects || []).find((o) => o.id === np.objects[0].id);

  const segs = [];
  paths.forEach((p) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(L > 1e-6)) continue;
      segs.push({ mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, len: L });
    }
  });

  // "Outward" is decided against the solid's own centroid, never by flipping the
  // normal until it faces the camera — that makes every BACK face masquerade as
  // a front one.
  const N = built.world.length;
  const oc = built.world.reduce(
    (a, p) => ({ x: a.x + p.x / N, y: a.y + p.y / N, z: a.z + p.z / N }), { x: 0, y: 0, z: 0 },
  );

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
    if (G3.rotatePoint(nrm, scn.camera).z <= 0) return;
    const poly = (Array.isArray(f.polygon) && f.polygon.length >= 3)
      ? f.polygon.map((q) => ({ x: q.x, y: q.y }))
      : world.map((q) => scn.projectWorld(q)).filter(Boolean);
    if (poly.length < 3) return;
    const area = polyArea(poly);
    if (!(area > 1)) return;
    const ink = segs.reduce((a, s) => a + (inPoly(s.mx, s.my, poly) ? s.len : 0), 0);
    out.push({ id: f.faceId || `face:${idx}`, area, coverage: (ink * PEN) / area });
  });
  return out;
};

describe('a foreshortened facet lands the tone it asked for (C15, O20)', () => {
  [2, 3, 4].forEach((bands) => {
    test(`R2-cube-bands${bands} — no visible facet floods past the object ceiling`, () => {
      const facets = facetCoverage(`R2-cube-bands${bands}`);
      expect(facets.length).toBeGreaterThanOrEqual(3);
      facets.forEach((f) => {
        expect(`${f.id} coverage ${f.coverage.toFixed(3)}`)
          .toBe(`${f.id} coverage ${Math.min(f.coverage, OBJECT_DARK_CEIL).toFixed(3)}`);
      });
    });
  });

  test('R2-cube-bands4 — the two form-shadow faces read alike, however they are turned', () => {
    // `+X` (341 mm²) and `+Z` (3242 mm²) are both zone F under the same light and
    // receive an identical fill recipe. A 9.5x projected-area difference must not
    // become a tone difference: §5.5.1 says a facet out of order with its
    // neighbours' N.L is a bug, and this is the extreme of that.
    const by = {};
    facetCoverage('R2-cube-bands4').forEach((f) => { by[f.id] = f.coverage; });
    expect(by['face:+X']).toBeDefined();
    expect(by['face:+Z']).toBeDefined();
    const ratio = by['face:+X'] / by['face:+Z'];
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
  });

  test('R-cube-bands4 — the first cube fixture is not disturbed', () => {
    const facets = facetCoverage('R-cube-bands4');
    facets.forEach((f) => { expect(f.coverage).toBeLessThanOrEqual(OBJECT_DARK_CEIL); });
  });
});

// ── O20 — three values, in the right order, on BOTH cube fixtures ────────────
//
// §5.5.1: a facet whose value is out of order with its neighbours' N.L is a BUG.
// Round 8 measured `R2-cube` OUT OF ORDER at all three band counts — `+X` at
// N.L 0.053 was the darkest face in the drawing while `+Z` at N.L 0.000 was
// three times lighter. It is in order now, and this is what keeps it so.
//
// The second clause is the one Round 7's review separated out and Round 8 did
// not land: O20 is about the two LIT faces differing from EACH OTHER. The max/min
// spread is dominated by the unlit face and reads as a pass while the two lit
// faces sit 0.005 apart. Scored here as the clause, never the ratio.
describe('a cube reads as three values, ordered by how nearly each face meets the light (O20)', () => {
  const litOrdered = (viewId) => {
    const np = FIX.buildParams(V, viewId);
    const G3 = V.Geometry3D;
    const scn = V.Scene3D.Scene.assembleScene(np, FIX.BOUNDS);
    const built = (scn.objects || []).find((o) => o.id === np.objects[0].id);
    const byId = {};
    facetCoverage(viewId).forEach((f) => { byId[f.id] = f.coverage; });
    const N = built.world.length;
    const oc = built.world.reduce(
      (a, p) => ({ x: a.x + p.x / N, y: a.y + p.y / N, z: a.z + p.z / N }), { x: 0, y: 0, z: 0 },
    );
    const rows = [];
    built.faces.forEach((f, idx) => {
      const id = f.faceId || `face:${idx}`;
      if (byId[id] === undefined) return;
      const world = (f.indices || []).map((i) => built.world[i]).filter(Boolean);
      const n0 = G3.cross(G3.sub(world[1], world[0]), G3.sub(world[2], world[0]));
      const L = Math.hypot(n0.x, n0.y, n0.z);
      let nrm = G3.mul(n0, 1 / L);
      const M = world.length;
      const cen = world.reduce(
        (a, p) => ({ x: a.x + p.x / M, y: a.y + p.y / M, z: a.z + p.z / M }), { x: 0, y: 0, z: 0 },
      );
      if (G3.dot(nrm, G3.sub(cen, oc)) < 0) nrm = G3.mul(nrm, -1);
      rows.push({
        id,
        NL: Math.max(0, V.Scene3D.Regions.signedLambert(nrm, cen, np.lights)),
        coverage: byId[id],
      });
    });
    return rows.sort((a, b) => b.NL - a.NL);
  };

  ['R-cube', 'R2-cube'].forEach((fixture) => {
    [2, 3, 4].forEach((bands) => {
      const view = `${fixture}-bands${bands}`;

      test(`${view} — the better-lit face carries the lighter ink, with no exception`, () => {
        const rows = litOrdered(view);
        expect(rows.length).toBe(3);
        for (let i = 1; i < rows.length; i++) {
          expect(`${rows[i - 1].id} ${rows[i - 1].coverage.toFixed(3)}`
            + ` must be lighter than ${rows[i].id} ${rows[i].coverage.toFixed(3)}`)
            .toBe(`${rows[i - 1].id} ${rows[i - 1].coverage.toFixed(3)}`
              + ` must be lighter than ${rows[i].id} ${Math.max(rows[i].coverage, rows[i - 1].coverage).toFixed(3)}`);
        }
      });

      // RATCHETED, and the spec's bar is 0.03. NOT MET, and the numbers say so.
      // Projected coverage between the two LIT faces, at bands 2 / 3 / 4:
      //
      //             75b97a5              HEAD
      //   R-cube    0.034 0.017 0.035    0.027 0.019 0.036
      //   R2-cube   0.945 0.976 1.019    0.096 0.090 0.121
      //
      // R2-cube's "difference" at 75b97a5 was the flood — its brightest face was
      // nearly solid black — so only the R-cube column is a like-for-like read,
      // and there bands 3 has sat under the bar through two rounds (0.017, now
      // 0.019) while bands 2 fell 0.034 -> 0.027. THE FIX DID NOT BUY THIS
      // CLAUSE and it is not claimed. It is pinned so it cannot silently sit at
      // 0.005 for a third round.
      //
      // The raster-D instrument reads the same clause on R-cube as
      // 0.021 / 0.005 / 0.030 before and 0.027 / 0.021 / 0.025 after — it agrees
      // on bands 2 and 3 improving and disagrees on bands 4. The two instruments
      // differ by more than the margin being measured, which is itself a reason
      // the criterion cannot yet be closed.
      test(`${view} — the two LIT faces differ from each other (spec bar 0.03; ratcheted)`, () => {
        const lit = litOrdered(view).filter((r) => r.NL > 0.02);
        expect(lit.length).toBeGreaterThanOrEqual(2);
        expect(Math.abs(lit[0].coverage - lit[1].coverage)).toBeGreaterThanOrEqual(0.015);
      });
    });
  });
});
