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
 *      node facets.js [viewDir] --o28 <viewA> <viewB>
 *
 * ── ROUND 10, INSTRUMENT REPAIR — THREE DEFECTS FOUND IN THE ROUND 9 REVIEW ──
 *
 * (17) THE OMITTED FACETS ARE NOW PRINTED. The header above has claimed since
 *      Round 8 that sub-window facets "are listed separately rather than
 *      silently dropped". They were counted and then dropped. Seven limb facets
 *      of `W-lp-sun45` went from toned to bare paper in Round 9 and every one of
 *      them was in that gap, which is why no instrument saw the change at the
 *      form's own contour (§4.1). A second table now carries them, with area and
 *      fill ink, sorted by area descending.
 *
 * (ZERO-FILL) EVERY visible facet now reports the FILL INK laid inside it, read
 *      straight off the emitted paths (`kind === 'sceneFill'` with a
 *      `sceneTarget.faceId`) — not off the raster, and not off what the renderer
 *      says it intended to spend. D cannot see this: a facet smaller than the
 *      4 mm window has no D at all, so "draws nothing" and "too small to score"
 *      were the same reading. They are now two different columns.
 *
 * (15) ARRANGEMENT, NOT ONLY THE MEAN. O21 passed on mean D(T) / mean D(below),
 *      which is blind to where the facets are, and O3's own clause is "visible
 *      as a BAND — not merely true in number". Facet adjacency now comes from
 *      the renderer's own `record.edges` (each `edge.faces` is a pair of face
 *      indices — the same list `Regions.smoothShadedFaces` reads), and each zone
 *      reports its connected-component structure under same-zone adjacency.
 *
 * (14/O28) BAND INDEX per facet, so "orbiting must not re-grade a face" is a
 *      measurement rather than an assertion. `--o28 <viewA> <viewB>` diffs the
 *      band index per faceId across two views and prints YES/NO with the ids
 *      that moved. It needs NO raster: band index is a function of the normal,
 *      the lights and the tone table only, so the O28 answer is available
 *      without a `density.json`.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const ARGV = process.argv.slice(2);
const O28_AT = ARGV.indexOf('--o28');
const O28_VIEWS = O28_AT >= 0 ? ARGV.slice(O28_AT + 1) : [];
const POSITIONAL = (O28_AT >= 0 ? ARGV.slice(0, O28_AT) : ARGV);
const DIR = POSITIONAL[0] || './r7a';
const VIEWS = POSITIONAL.slice(1);
const PATCH = 4;

// ── O3/O21 ARRANGEMENT THRESHOLD ────────────────────────────────────────────
// A zone reads as a BAND when its largest connected component holds at least
// this fraction of the zone's visible facets; below it the zone is speckle
// scattered over the form. 0.60 is a ROUND 10 INVENTION AWAITING RATIFICATION —
// it is not derived from anything and it is not in `criteria.md`. It is marked
// here exactly as `criteria.md` marks its other numbers `[inferred]`, and it
// must be ratified or replaced before any criterion is scored on it. What is
// NOT provisional is the component count itself; that is a fact about the mesh.
const BAND_FRACTION = 0.60;                                   // [inferred]

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

// ── FILL INK PER FACET, READ OFF THE DRAWING ────────────────────────────────
// The emitted paths, not the recipe. A path counts toward a facet when it is a
// `sceneFill` carrying that facet's `sceneTarget.faceId`; ink is the summed
// segment length. Keyed `objectId/faceId` so two objects in one view (the `Gp`
// trio) cannot pool their faces.
const fillInkByFace = (V, viewId) => {
  const paths = R7.buildPaths(V, viewId) || [];
  const byFace = new Map();
  paths.forEach((p) => {
    const meta = p.meta || {};
    if (meta.kind !== 'sceneFill') return;
    const t = meta.sceneTarget || {};
    if (t.faceId == null) return;
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    const key = `${t.objectId == null ? '?' : t.objectId}/${t.faceId}`;
    byFace.set(key, (byFace.get(key) || 0) + L);
  });
  return byFace;
};

// ── SAME-ZONE CONNECTED COMPONENTS OVER THE RENDERER'S OWN EDGE LIST ────────
// `edge.faces` is a pair of indices into `built.faces` — the identical field
// `Regions.smoothShadedFaces` consumes. Adjacency is NOT re-derived from shared
// vertex indices: a re-derived map is a second definition of the mesh, and this
// workstream has been burned five times by a second definition of anything.
const zoneComponents = (visibleIdx, edges, zoneOf) => {
  const parent = new Map();
  visibleIdx.forEach((i) => parent.set(i, i));
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(a) !== r) { const nx = parent.get(a); parent.set(a, r); a = nx; }
    return r;
  };
  let sharedEdges = 0;
  (edges || []).forEach((e) => {
    const f = e && e.faces;
    if (!f || f.length !== 2) return;
    const [a, b] = f;
    if (!parent.has(a) || !parent.has(b)) return;   // one side hidden — not a same-zone link
    sharedEdges += 1;
    if (zoneOf.get(a) !== zoneOf.get(b)) return;
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  });
  const comps = new Map();
  visibleIdx.forEach((i) => {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(i);
  });
  return { comps: Array.from(comps.values()), sharedEdges };
};

// ── THE MEASUREMENT — geometry always, D only when a raster exists ──────────
// Split out of the printer in Round 10 so `--o28` (band index) can run with no
// `density.json` at all. Returns null when the view has no assembled faces.
// `objIndex` selects which of the view's objects to measure; the scored report
// keeps the historic `objects[0]`, and `--o28` walks all of them, because the
// orbit views are a TRIO and objects[0] is the cube's three faces alone.
const measure = (V, viewId, density, objIndex = 0) => {
  const np = R7.buildParams(V, viewId);
  const S = V.Scene3D.Scene; const G3 = V.Geometry3D; const R = V.Scene3D.Regions;
  const scn = S.assembleScene(np, R7.BOUNDS);
  const obj = np.objects[objIndex];
  if (!obj) return null;

  // The faces the renderer assembled, not a re-derived mesh. `assembleScene`
  // hands back each object with `faces[]` carrying `indices` into `world[]`
  // plus the already-`projected` screen polygon, so the instrument measures the
  // exact facets that were drawn.
  const built = (scn.objects || []).find((o) => o.id === obj.id);
  if (!built || !Array.isArray(built.faces) || !Array.isArray(built.world)) {
    console.log(`${viewId}: object has no assembled faces (keys: ${built ? Object.keys(built).join(',') : 'none'})`);
    return null;
  }

  const g = density ? density[viewId] : null;
  const ink = fillInkByFace(V, viewId);
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
  // Face winding is not guaranteed consistent, so "outward" is decided against
  // the solid's own centroid — never by flipping the normal until it faces the
  // camera, which makes every BACK face masquerade as a front one. (First cut
  // did exactly that and scored all six faces of the cube, reporting the two
  // hidden faces' |N.L| as if they were lit.)
  const oc = built.world.reduce(
    (a, p) => ({ x: a.x + p.x / built.world.length, y: a.y + p.y / built.world.length, z: a.z + p.z / built.world.length }),
    { x: 0, y: 0, z: 0 },
  );
  // Facets dropped BEFORE the camera-facing test (degenerate: fewer than three
  // world verts, or a zero-length normal) are not visible facets and never were.
  // A facet dropped AFTER it passes that test would be a hole in the "every
  // visible facet appears in exactly one table" contract, so it is counted and
  // reported rather than assumed impossible.
  let degenerate = 0;
  let visibleButUnprojectable = 0;
  built.faces.forEach((f, idx) => {
    const world = (f.indices || []).map((i) => built.world[i]).filter(Boolean);
    if (world.length < 3) { degenerate += 1; return; }
    // face normal + centroid in world space
    const n0 = G3.cross(G3.sub(world[1], world[0]), G3.sub(world[2], world[0]));
    const L = Math.hypot(n0.x, n0.y, n0.z);
    if (L < 1e-9) { degenerate += 1; return; }
    let nrm = G3.mul(n0, 1 / L);
    const cen = world.reduce((a, p) => ({ x: a.x + p.x / world.length, y: a.y + p.y / world.length, z: a.z + p.z / world.length }), { x: 0, y: 0, z: 0 });
    // Orient outward from the solid's centroid, THEN drop anything facing away
    // from the camera. A back face is hidden, not re-orientable.
    if (G3.dot(nrm, G3.sub(cen, oc)) < 0) nrm = G3.mul(nrm, -1);
    if (G3.rotatePoint(nrm, scn.camera).z <= 0) return;
    const poly = Array.isArray(f.polygon) && f.polygon.length >= 3
      ? f.polygon.map((p) => ({ x: p.x, y: p.y }))
      : world.map((p) => scn.projectWorld(p)).filter(Boolean);
    if (poly.length < 3) { visibleButUnprojectable += 1; return; }
    const zoneCtx = { tone: np.tone, lights, ground: groundOf };
    // The renderer's own gate: anything NOT smooth-shaded is explicitly barred
    // from T (scene3d.js:721). Omitting the key is what made the old O22 line
    // decorative.
    if (!smoothSet.has(idx)) zoneCtx.terminator = false;
    const zone = R.formZone(nrm, cen, zoneCtx);
    const NL = Math.max(0, R.signedLambert ? R.signedLambert(nrm, cen, lights) : 0);
    // Band index by the SAME call `formZone` makes: combined intensity of this
    // normal at this world point under this view's lights, quantized by this
    // view's tone table. No camera term appears anywhere in that chain — which
    // is precisely what O28 asserts and has never had measured.
    const I = R.combinedIntensity(nrm, cen, lights);
    const bandIdx = R.band(I, np.tone);

    // windows wholly inside this facet
    const xs = poly.map((p) => p.x); const ys = poly.map((p) => p.y);
    const Ds = [];
    if (g) {
      for (let gy2 = Math.floor(Math.min(...ys) / PATCH); gy2 <= Math.floor(Math.max(...ys) / PATCH); gy2++) {
        for (let gx = Math.floor(Math.min(...xs) / PATCH); gx <= Math.floor(Math.max(...xs) / PATCH); gx++) {
          const row = g.g[gy2]; if (!row || row[gx] == null) continue;
          const x0 = gx * PATCH; const y0 = gy2 * PATCH;
          const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
          if (!corners.every(([X, Y]) => inPoly(X, Y, poly))) continue;
          Ds.push(row[gx]);
        }
      }
    }
    const faceId = f.faceId || idx;
    rows.push({
      faceIdx: idx, idx: faceId, zone, NL, I, band: bandIdx,
      areaMM: area2(poly), n: Ds.length,
      D: Ds.length ? Ds.reduce((a, b) => a + b, 0) / Ds.length : null,
      ink: ink.get(`${built.id}/${faceId}`) || 0,
    });
  });

  return {
    viewId, np, built, rows, groundOf, smoothSet, hasD: Boolean(g),
    degenerate, visibleButUnprojectable, totalFaces: built.faces.length,
    objectInk: rows.reduce((a, r) => a + r.ink, 0),
  };
};

const FACET_HEAD = '   facet       zone  band   N.L     area mm2   fill ink   n     D';
const facetLine = (r) => `   ${String(r.idx).padEnd(11)} ${r.zone.padEnd(4)}  ${String(r.band).padStart(4)}  ${r.NL.toFixed(3)}  `
  + `${r.areaMM.toFixed(1).padStart(9)}  ${r.ink.toFixed(1).padStart(9)}  ${String(r.n).padStart(3)}  ${r.D == null ? '  —  ' : r.D.toFixed(3)}`;

const report = (m) => {
  const { viewId, rows, built, groundOf, smoothSet, hasD } = m;
  const scored = rows.filter((r) => r.n > 0).sort((a, b) => b.NL - a.NL);
  const unscored = rows.filter((r) => r.n === 0).sort((a, b) => b.areaMM - a.areaMM);
  console.log(`   [instrument] ground ${groundOf ? `y0 ${groundOf.y0.toFixed(1)} h ${groundOf.height.toFixed(1)}` : '(none)'}`
    + `   smooth-shaded facets ${smoothSet.size}/${m.totalFaces} (dihedral gate at ${m.TERM_DEG} deg, READ from Regions)`);
  console.log(`\n== ${viewId} — per-facet D  (${scored.length} facets carry a whole 4 mm window; `
    + `${unscored.length} visible facets are smaller than the protocol's own window)`
    + `${hasD ? '' : '   [NO density.json — D and n are unmeasured on this run]'}`);
  console.log(FACET_HEAD);
  scored.forEach((r) => console.log(facetLine(r)));

  // ── (17) THE OMITTED FACETS, PRINTED ──────────────────────────────────────
  // The header has promised this table since Round 8. §4.1 hid in its absence.
  if (unscored.length) {
    console.log(`\n== ${viewId} — UNSCORED facets: visible, but no whole ${PATCH} mm window fits (n=0, D unmeasurable), by area`);
    console.log(FACET_HEAD);
    unscored.forEach((r) => console.log(facetLine(r)));
  }
  if (m.visibleButUnprojectable) {
    console.log(`   !! ${m.visibleButUnprojectable} facet(s) passed the camera-facing test but projected to < 3 points — NOT in either table`);
  }
  console.log(`   [instrument] ${rows.length} visible facets, ${m.degenerate} degenerate (dropped before the visibility test), `
    + `${m.totalFaces} in the mesh    total facet fill ink ${m.objectInk.toFixed(1)}`);

  // ── ZERO-FILL — the reading D cannot make ─────────────────────────────────
  // A facet with no fill ink and a facet too small to score both read `D —` in
  // the old instrument. Seven limb facets went from toned to bare paper inside
  // that ambiguity (§4.1). Ink is read off the emitted `sceneFill` paths.
  const zero = rows.filter((r) => r.ink <= 0).sort((a, b) => b.areaMM - a.areaMM);
  console.log(`   ZERO-FILL: ${zero.length} of ${rows.length} visible facets carry no fill ink at all`
    + `  (${zero.map((r) => r.idx).join(',') || 'none'})`);
  zero.forEach((r) => {
    console.log(`      ${String(r.idx).padEnd(9)} zone ${r.zone}  band ${r.band}  N.L ${r.NL.toFixed(3)}  area ${r.areaMM.toFixed(1).padStart(7)} mm2`
      + `  ${r.n > 0 ? `n ${r.n} D ${r.D.toFixed(3)}` : '(sub-window)'}`);
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

  // ── (15) O3/O21 ARRANGEMENT — components, not the mean ────────────────────
  // "Visible as a band — not merely true in number." A zone that is one large
  // connected run of facets is a band; a zone scattered into many small
  // components is speckle, and the aggregate ratio cannot tell the two apart.
  //
  // WHAT THIS DOES NOT SEE, stated so nobody quotes it for more than it is:
  // adjacency here is adjacency IN THE MESH (a shared edge), not on the paper.
  // On a convex solid the two coincide, which covers every fixture this script
  // is pointed at; on a concave or self-occluding form two mesh neighbours can
  // land far apart on screen and this counter would still call them one band.
  // It is also blind to VALUE: a contiguous zone whose facets carry wildly
  // different D still counts as one component. It answers "are the zone's
  // facets in one place", nothing more.
  const zoneOf = new Map(rows.map((r) => [r.faceIdx, r.zone]));
  const visibleIdx = rows.map((r) => r.faceIdx);
  const { comps, sharedEdges } = zoneComponents(visibleIdx, built.edges, zoneOf);
  const byZone = new Map();
  comps.forEach((c) => {
    const z = zoneOf.get(c[0]);
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(c);
  });
  // The counter must be able to say SPECKLE, and on these fixtures it returns
  // 100% for nearly every zone — the exact shape of an inert probe. CONTROL:
  // keep the SAME facets, the SAME adjacency and the SAME multiset of zone
  // labels, scramble only WHICH facet holds which label, recount. A genuinely
  // contiguous zone must collapse; a counter that cannot be collapsed is not
  // measuring arrangement. Reported per zone beside the observed figure, because
  // a 4-facet zone lands connected by chance and its control says so.
  // Averaged over CTRL_TRIALS deterministic scrambles (a single scramble is one
  // draw and a small zone can land connected by luck).
  const CTRL_TRIALS = 16;
  const labels = rows.map((r) => r.zone);
  const ctrlSum = new Map();
  for (let t = 0; t < CTRL_TRIALS; t++) {
    let s = (t + 1) * 2654435761 % 2147483647;                 // deterministic LCG
    const perm = rows.map((r, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {                 // Fisher-Yates
      s = (s * 1103515245 + 12345) % 2147483648;
      const j = s % (i + 1);
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    const scrambled = new Map();
    perm.forEach((oi, k) => scrambled.set(rows[oi].faceIdx, labels[k]));
    const cc = new Map();
    zoneComponents(visibleIdx, built.edges, scrambled).comps.forEach((c) => {
      const z = scrambled.get(c[0]);
      if (!cc.has(z)) cc.set(z, []);
      cc.get(z).push(c);
    });
    cc.forEach((cs, z) => {
      const nF = cs.reduce((a, c) => a + c.length, 0);
      ctrlSum.set(z, (ctrlSum.get(z) || 0) + Math.max(...cs.map((c) => c.length)) / nF / CTRL_TRIALS);
    });
  }
  const ctrlFrac = ctrlSum;

  console.log(`   [arrangement] ${visibleIdx.length} visible facets, ${sharedEdges} edges with BOTH faces visible `
    + `(adjacency from built.edges — the renderer's own list)`);
  Array.from(byZone.keys()).sort().forEach((z) => {
    const cs = byZone.get(z).slice().sort((a, b) => b.length - a.length);
    const nF = cs.reduce((a, c) => a + c.length, 0);
    const big = cs[0].length;
    const frac = big / nF;
    const verdict = frac >= BAND_FRACTION ? 'reads as a BAND' : 'SPECKLE, not a band';
    const ctl = ctrlFrac.has(z) ? `${(ctrlFrac.get(z) * 100).toFixed(0)}%` : 'n/a';
    console.log(`   O3/O21 arrangement  zone ${z}: ${nF} facets in ${cs.length} components, largest ${big} `
      + `(${(frac * 100).toFixed(0)}% of the zone) — ${verdict}   [scramble control ${ctl}]`);
  });
  console.log(`   O3/O21 arrangement  band threshold: largest component >= ${(BAND_FRACTION * 100).toFixed(0)}% of the zone [inferred — Round 10, awaiting ratification]`);
  // A zone whose CONTROL is already at or above the band threshold is too small
  // (or the mesh too coarse) for "one component" to mean anything — chance
  // connects it. Those zones are named, and the counter is only quotable if at
  // least one zone can be collapsed by the scramble.
  const zoneKeys = Array.from(byZone.keys());
  const collapsible = zoneKeys.filter((z) => (ctrlFrac.get(z) || 1) < BAND_FRACTION);
  const confounded = zoneKeys.filter((z) => (ctrlFrac.get(z) || 1) >= BAND_FRACTION);
  console.log(`   [probe check] scramble control (${CTRL_TRIALS} trials): ${collapsible.length}/${zoneKeys.length} zones collapse below `
    + `${(BAND_FRACTION * 100).toFixed(0)}% under a random assignment — `
    + `${collapsible.length ? 'the counter CAN say SPECKLE' : 'THE COUNTER IS INERT ON THIS VIEW, DO NOT QUOTE IT'}`
    + `${confounded.length ? `   chance-confounded (too few facets to distinguish): ${confounded.join(',')}` : ''}`);

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
  return m;
};

// ── (14) O28 — THE TONE GRADE IS A PROPERTY OF OBJECT AND LIGHT ─────────────
// "Orbiting must not re-grade a face." The two views differ ONLY in camera yaw
// (the fixture's own orbit pair), so every facet visible in both must sit in the
// same band. Compared per faceId, because a face INDEX is a position in an array
// and a faceId is the face. No raster is involved: band index is
// `Regions.band(combinedIntensity(n, p, lights), tone)` and no camera term
// enters that chain — so this answer is available with no `density.json`.
const o28 = (V, a, b) => {
  // EVERY object in the view, not `objects[0]`. The orbit views are the TRIO and
  // objects[0] is the cube: answering O28 on three facets would have been the
  // fifth restated-fixture-class error in this workstream — a criterion about
  // "a face" scored on a twentieth of the faces in the drawing.
  const collect = (viewId) => {
    const n = R7.buildParams(V, viewId).objects.length;
    const rows = []; let tone = null;
    for (let i = 0; i < n; i++) {
      const m = measure(V, viewId, null, i);
      if (!m) continue;
      tone = m.np.tone;
      m.rows.forEach((r) => rows.push({ ...r, key: `${m.built.id}/${r.idx}` }));
    }
    return { rows, tone, objects: n };
  };
  const A = collect(a);
  const B = collect(b);
  if (!A.rows.length || !B.rows.length) { console.log('O28: a view produced no assembled faces'); return; }
  const mapA = new Map(A.rows.map((r) => [r.key, r]));
  const mapB = new Map(B.rows.map((r) => [r.key, r]));
  const both = A.rows.filter((r) => mapB.has(r.key)).map((r) => r.key);
  const moved = both.filter((k) => mapA.get(k).band !== mapB.get(k).band);
  console.log(`\n== O28 — band index per facet across ${a} vs ${b}   (${A.objects} objects in the view, ALL measured)`);
  console.log(`   ${a}: ${A.rows.length} visible facets    ${b}: ${B.rows.length} visible facets    `
    + `${both.length} visible in BOTH (compared by objectId/faceId)`);
  console.log(`   only in ${a}: ${A.rows.filter((r) => !mapB.has(r.key)).length}    `
    + `only in ${b}: ${B.rows.filter((r) => !mapA.has(r.key)).length}   `
    + `(a face turning away from the camera is not a re-grade — it is not visible)`);
  const bandsOf = (m) => {
    const h = {};
    m.rows.forEach((r) => { h[r.band] = (h[r.band] || 0) + 1; });
    return Object.keys(h).sort().map((k) => `band ${k}: ${h[k]}`).join('   ');
  };
  console.log(`   ${a} band histogram   ${bandsOf(A)}`);
  console.log(`   ${b} band histogram   ${bandsOf(B)}`);
  const maxDI = both.reduce((w, k) => Math.max(w, Math.abs(mapA.get(k).I - mapB.get(k).I)), 0);
  console.log(`   largest |I(${a}) - I(${b})| over the shared facets: ${maxDI.toExponential(2)}   `
    + `(the INTENSITY itself, upstream of quantization)`);
  console.log(`   O28  band index identical across the orbit for every facet visible in both: `
    + `${moved.length === 0 ? 'YES' : 'NO'}   (${moved.length} of ${both.length} facets differ`
    + `${moved.length ? `: ${moved.map((k) => `${k} ${mapA.get(k).band}->${mapB.get(k).band}`).join(', ')}` : ''})`);
  // The probe must be able to say NO. Intensity is quantized by the tone table,
  // so a deliberately shifted tone MUST move band indices; if it does not, the
  // comparison above is not reading anything and its YES is worthless.
  const shifted = { ...A.tone, thresholds: (A.tone.thresholds || []).map((t) => t * 0.5) };
  const Rg = V.Scene3D.Regions;
  const wouldMove = A.rows.filter((r) => Rg.band(r.I, shifted) !== r.band).length;
  console.log(`   [probe check] with the tone thresholds halved, ${wouldMove} of ${A.rows.length} facets change band — `
    + `${wouldMove > 0 ? 'the comparison CAN say NO' : 'THE COMPARISON IS INERT, DO NOT QUOTE IT'}`);
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const TERM_DEG = V.Scene3D.Regions.TERMINATOR_SMOOTH_DEG;
  if (O28_VIEWS.length >= 2) {
    o28(V, O28_VIEWS[0], O28_VIEWS[1]);
    rt.cleanup();
    process.exit(0);
  }
  const dPath = path.resolve(DIR, 'density.json');
  let density = null;
  if (fs.existsSync(dPath)) density = JSON.parse(fs.readFileSync(dPath, 'utf8'));
  else console.log(`   [instrument] no density.json at ${dPath} — geometry, ink and band index only (D unmeasured)`);
  const list = VIEWS.length ? VIEWS : [
    'R-cube-bands2', 'R-cube-bands3', 'R-cube-bands4',
    'R-lp-bands2', 'R-lp-bands3', 'R-lp-bands4',
  ];
  list.forEach((v) => {
    if (density && !density[v]) console.log(`\n${v}: not in density.json — D unmeasured on this view`);
    const m = measure(V, v, density);
    if (m) report(Object.assign(m, { TERM_DEG }));
  });
  rt.cleanup();
  process.exit(0);
})();
