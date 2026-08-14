/* VIEW R's instrument — per-FACET D on the cube and the low-poly sphere.
 *
 * O19/O20/O21/O22/O26 are all statements about individual facets, and there has
 * never been an instrument that could see one. "The cube's top face is lighter
 * than its sides" was being judged off a full-frame screenshot.
 *
 * Method. Every visible facet is taken from the same mesh the renderer builds,
 * projected with the same camera, and used as a mask: a 4 mm window counts
 * toward a facet only when it lies WHOLLY INSIDE that facet's projected
 * polygon. D is then read from `density.json`, i.e. from the rasterised drawing
 * — never from ink length, which is additive and double-counts every crossing.
 *
 * Facets too small to contain a whole 4 mm window report `n=0` and are listed
 * separately rather than silently dropped: on a frequency-2 geodesic most
 * facets are smaller than the measurement protocol's own window, and that is a
 * fact about the fixture the designer needs to see, not something to hide by
 * shrinking the window.
 *
 * The fixture is NOT restated here. Camera, light, tone and object list all
 * come from render.js.
 *
 * Run: node facets.js <viewDir> [viewId ...]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const DIR = process.argv[2] || './r7a';
const VIEWS = process.argv.slice(3);
const PATCH = 4;

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};
const area2 = (poly) => {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(s) / 2;
};

const perFacet = (V, density, viewId) => {
  const g = density[viewId];
  if (!g) { console.log(`${viewId}: not in density.json`); return; }
  const np = R7.buildParams(V, viewId);
  const S = V.Scene3D.Scene; const G3 = V.Geometry3D; const R = V.Scene3D.Regions;
  const scn = S.assembleScene(np, R7.BOUNDS);
  const obj = np.objects[0];

  // The faces the renderer assembled, not a re-derived mesh. `assembleScene`
  // hands back each object with `faces[]` carrying `indices` into `world[]`
  // plus the already-`projected` screen polygon, so the instrument measures the
  // exact facets that were drawn.
  const built = (scn.objects || []).find((o) => o.id === obj.id);
  if (!built || !Array.isArray(built.faces) || !Array.isArray(built.world)) {
    console.log(`${viewId}: object has no assembled faces (keys: ${built ? Object.keys(built).join(',') : 'none'})`);
    return;
  }

  const lights = np.lights;
  const rows = [];
  // ── INSTRUMENT REPAIR (Round 8) — the ground is the OBJECT'S OWN, not 2*46 ──
  // This line used to read `ground: { y0: 0, height: 2 * 46 }`. 46 is the BALL's
  // radius, hardcoded into an instrument whose only two fixtures are the cube and
  // the geodesic — the "a harness never restates a fixture" rule broken inside the
  // very instrument written to answer it. The renderer passes `recordGround(record)`,
  // which is min/max world y over the object's own vertices; that is computed here
  // from the assembled `world[]`, so it tracks whatever fixture is loaded.
  const gy = built.world.map((p) => p.y).filter((y) => Number.isFinite(y));
  const gLo = Math.min(...gy); const gHi = Math.max(...gy);
  const groundOf = (gHi > gLo) ? { y0: gLo, height: gHi - gLo } : null;

  // ── INSTRUMENT REPAIR (Round 9) — THE DIHEDRAL GATE IS READ, NOT MIRRORED ──
  // Round 8 copied `TERMINATOR_SMOOTH_DEG = 40` here with the comment
  // "scene3d.js:556 — mirrored, not guessed", and built its own edge map over
  // `f.indices` while the renderer built one from `record.edges`. Honest, and
  // inert on these fixtures — but a mirrored constant is a restated fixture with
  // extra steps, and two edge maps that agree today are not the same code path.
  // The predicate now lives in `Regions` and BOTH call it, on the renderer's own
  // `record.edges` adjacency.
  const smoothFaces = R.smoothShadedFaces(built.faces, built.edges);
  const smoothSet = new Set();
  built.faces.forEach((f, i) => { if (smoothFaces.has(f)) smoothSet.add(i); });
  console.log(`   [instrument] ground ${groundOf ? `y0 ${groundOf.y0.toFixed(1)} h ${groundOf.height.toFixed(1)}` : '(none)'}`
    + `   smooth-shaded facets ${smoothSet.size}/${built.faces.length} (dihedral gate at ${R.TERMINATOR_SMOOTH_DEG} deg, READ from Regions)`);
  // Face winding is not guaranteed consistent, so "outward" is decided against
  // the solid's own centroid — never by flipping the normal until it faces the
  // camera, which makes every BACK face masquerade as a front one. (First cut
  // did exactly that and scored all six faces of the cube, reporting the two
  // hidden faces' |N.L| as if they were lit.)
  const oc = built.world.reduce(
    (a, p) => ({ x: a.x + p.x / built.world.length, y: a.y + p.y / built.world.length, z: a.z + p.z / built.world.length }),
    { x: 0, y: 0, z: 0 },
  );
  built.faces.forEach((f, idx) => {
    const world = (f.indices || []).map((i) => built.world[i]).filter(Boolean);
    if (world.length < 3) return;
    // face normal + centroid in world space
    const n0 = G3.cross(G3.sub(world[1], world[0]), G3.sub(world[2], world[0]));
    const L = Math.hypot(n0.x, n0.y, n0.z);
    if (L < 1e-9) return;
    let nrm = G3.mul(n0, 1 / L);
    const cen = world.reduce((a, p) => ({ x: a.x + p.x / world.length, y: a.y + p.y / world.length, z: a.z + p.z / world.length }), { x: 0, y: 0, z: 0 });
    // Orient outward from the solid's centroid, THEN drop anything facing away
    // from the camera. A back face is hidden, not re-orientable.
    if (G3.dot(nrm, G3.sub(cen, oc)) < 0) nrm = G3.mul(nrm, -1);
    if (G3.rotatePoint(nrm, scn.camera).z <= 0) return;
    const poly = Array.isArray(f.polygon) && f.polygon.length >= 3
      ? f.polygon.map((p) => ({ x: p.x, y: p.y }))
      : world.map((p) => scn.projectWorld(p)).filter(Boolean);
    if (poly.length < 3) return;
    const zoneCtx = { tone: np.tone, lights, ground: groundOf };
    // The renderer's own gate: anything NOT smooth-shaded is explicitly barred
    // from T (scene3d.js:721). Omitting the key is what made the old O22 line
    // decorative.
    if (!smoothSet.has(idx)) zoneCtx.terminator = false;
    const zone = R.formZone(nrm, cen, zoneCtx);
    const NL = Math.max(0, R.signedLambert ? R.signedLambert(nrm, cen, lights) : 0);

    // windows wholly inside this facet
    const xs = poly.map((p) => p.x); const ys = poly.map((p) => p.y);
    const Ds = [];
    for (let gy = Math.floor(Math.min(...ys) / PATCH); gy <= Math.floor(Math.max(...ys) / PATCH); gy++) {
      for (let gx = Math.floor(Math.min(...xs) / PATCH); gx <= Math.floor(Math.max(...xs) / PATCH); gx++) {
        const row = g.g[gy]; if (!row || row[gx] == null) continue;
        const x0 = gx * PATCH; const y0 = gy * PATCH;
        const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
        if (!corners.every(([X, Y]) => inPoly(X, Y, poly))) continue;
        Ds.push(row[gx]);
      }
    }
    rows.push({
      idx: f.faceId || idx, zone, NL, areaMM: area2(poly), n: Ds.length,
      D: Ds.length ? Ds.reduce((a, b) => a + b, 0) / Ds.length : null,
    });
  });

  const scored = rows.filter((r) => r.n > 0).sort((a, b) => b.NL - a.NL);
  const unscored = rows.filter((r) => r.n === 0);
  console.log(`\n== ${viewId} — per-facet D  (${scored.length} facets carry a whole 4 mm window; `
    + `${unscored.length} visible facets are smaller than the protocol's own window)`);
  console.log('   facet   zone   N.L     area mm2   n    D');
  scored.forEach((r) => {
    console.log(`   ${String(r.idx).padEnd(9)}   ${r.zone.padEnd(4)}  ${r.NL.toFixed(3)}  ${r.areaMM.toFixed(0).padStart(8)}  ${String(r.n).padStart(3)}  ${r.D.toFixed(3)}`);
  });

  // O20 — the cube's three visible faces must read as three values, ordered by
  // how nearly each faces the light.
  if (scored.length >= 2 && scored.length <= 8) {
    const byD = scored.slice().sort((a, b) => a.D - b.D);
    const lightest = byD[0]; const darkest = byD[byD.length - 1];
    console.log(`   O20  lightest facet D ${lightest.D.toFixed(3)} (N.L ${lightest.NL.toFixed(3)})  `
      + `darkest D ${darkest.D.toFixed(3)} (N.L ${darkest.NL.toFixed(3)})  spread ${(darkest.D / Math.max(1e-6, lightest.D)).toFixed(2)}x`);
    // monotonic in intensity? (5.5.1: "a facet's value out of order with its
    // neighbours' N.L is a BUG")
    const inOrder = scored.every((r, i) => i === 0 || scored[i - 1].D <= r.D + 0.02);
    console.log(`   O20  values monotonic in N.L (brightest facet = lightest ink): ${inOrder ? 'YES' : 'NO — OUT OF ORDER'}`);
    const pairwise = [];
    for (let i = 1; i < scored.length; i++) pairwise.push(Math.abs(scored[i].D - scored[i - 1].D));
    console.log(`   O20  adjacent-face D differences: ${pairwise.map((v) => v.toFixed(3)).join(', ')}  (all must be readable, > ~0.03)`);
  }
  // O21 — the low-poly terminator must be a BAND of facets darker than those
  // below it.
  const T = scored.filter((r) => r.zone === 'T');
  const below = scored.filter((r) => r.zone === 'F' || r.zone === 'R');
  if (T.length && below.length) {
    const mT = T.reduce((a, r) => a + r.D, 0) / T.length;
    const mB = below.reduce((a, r) => a + r.D, 0) / below.length;
    console.log(`   O21  D(terminator facets) ${mT.toFixed(3)} (n=${T.length}) / D(facets below) ${mB.toFixed(3)} (n=${below.length}) = ${(mT / mB).toFixed(2)}x   need >= 1.25`);
  } else {
    console.log(`   O21  terminator facets n=${T.length}, facets below n=${below.length} — not scoreable on this view`);
  }
  // O22 — a cube must have NO terminator facet at all.
  console.log(`   O22  facets classified T: ${scored.filter((r) => r.zone === 'T').map((r) => r.idx).join(',') || 'none'}`);
  // O23 — the FACETED reflected lift. Added in Round 8: this instrument produced
  // view R and printed every facet's zone, but never scored O23, so the miss
  // (0.72x on a single facet) had to be found by hand in the instrument's own
  // output. A criterion the harness can compute and does not print is a criterion
  // that will be missed again.
  const Rf = scored.filter((r) => r.zone === 'R');
  const Ff = scored.filter((r) => r.zone === 'F');
  if (Rf.length && Ff.length) {
    const mR = Rf.reduce((a, b) => a + b.D, 0) / Rf.length;
    const mF = Ff.reduce((a, b) => a + b.D, 0) / Ff.length;
    const ok = mR / mF <= 0.60;
    console.log(`   O23  D(reflected facets) ${mR.toFixed(3)} (n=${Rf.length}: ${Rf.map((r) => r.idx).join(',')})`
      + ` / D(form-shadow facets) ${mF.toFixed(3)} (n=${Ff.length}) = ${(mR / mF).toFixed(2)}x   need <= 0.60   ${ok ? 'OK' : 'MISS'}`
      + `${Rf.length < 3 ? '   [n < 3 — a ring, not a facet: treat as UNMEASURED]' : ''}`);
  } else {
    console.log(`   O23  reflected facets n=${Rf.length}, form-shadow facets n=${Ff.length} — not scoreable on this view`);
  }
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const density = require(path.resolve(DIR, 'density.json'));
  const list = VIEWS.length ? VIEWS : [
    'R-cube-bands2', 'R-cube-bands3', 'R-cube-bands4',
    'R-lp-bands2', 'R-lp-bands3', 'R-lp-bands4',
  ];
  list.forEach((v) => perFacet(V, density, v));
  rt.cleanup();
  process.exit(0);
})();
