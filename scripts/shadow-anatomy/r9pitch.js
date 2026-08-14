/* ROUND 9 — THE PROJECTED-PITCH INSTRUMENT.
 *
 * Round 8's `+X` finding (D 0.891 on a 341 mm² face, against 0.186 on a 3242 mm²
 * face of the SAME zone with the SAME recipe) was diagnosed as "a cap stated on
 * a proxy one transform away from the metric": the faceted fill states its
 * plot-safety floor on the SURFACE pitch, and nothing in the harness ever
 * measured the pitch that actually lands ON PAPER.
 *
 * This measures it, and it never asks the renderer what spacing it intended.
 * For every visible facet:
 *   - take the drawn segments whose midpoint lies inside the facet's projected
 *     polygon,
 *   - build a length-weighted orientation histogram (mod 180) and pull out the
 *     dominant families,
 *   - for each family, project every segment onto that family's own normal,
 *     cluster the offsets into rulings, and report the MEDIAN GAP between
 *     adjacent rulings — i.e. the screen pitch, in mm and in pen widths.
 *
 * The bar is the renderer's own: PLOT_FLOOR_MULT_OBJ = 1.2 × pen width
 * (scene3d.js), which at the fixture's 0.3 mm pen is 0.36 mm. A family below
 * that is a pen sitting in a puddle.
 *
 * Fixture from render.js. Nothing restated.
 *
 * Run: node r9pitch.js <viewId ...>
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const VIEWS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['R2-cube-bands4', 'R-cube-bands4'];
const PEN = R7.BOUNDS.penWidth;
const FLOOR = 1.2 * PEN;          // scene3d.js PLOT_FLOOR_MULT_OBJ

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
const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

// ── families in a bag of segments, and each family's SCREEN pitch ────────────
const BINS = 36;                  // 5 deg
const familyPitches = (segs) => {
  if (!segs.length) return [];
  const h = new Float64Array(BINS);
  segs.forEach((s) => {
    const f = (s.ang / 180) * BINS;
    const k0 = Math.floor(f) % BINS; const fr = f - Math.floor(f);
    h[k0] += s.len * (1 - fr); h[(k0 + 1) % BINS] += s.len * fr;
  });
  const sm = new Float64Array(BINS);
  for (let i = 0; i < BINS; i++) sm[i] = 0.25 * h[(i + BINS - 1) % BINS] + 0.5 * h[i] + 0.25 * h[(i + 1) % BINS];
  const total = sm.reduce((a, b) => a + b, 0);
  // local maxima carrying >= 12 % of the ink
  const peaks = [];
  for (let i = 0; i < BINS; i++) {
    const p = sm[(i + BINS - 1) % BINS]; const n = sm[(i + 1) % BINS];
    if (sm[i] >= p && sm[i] >= n && sm[i] / total >= 0.03) peaks.push({ bin: i, w: sm[i] });
  }
  peaks.sort((a, b) => b.w - a.w);
  // drop peaks within 15 deg of a stronger one
  const kept = [];
  peaks.forEach((p) => {
    const clash = kept.some((q) => {
      const d = Math.abs(p.bin - q.bin);
      return Math.min(d, BINS - d) * (180 / BINS) < 15;
    });
    if (!clash) kept.push(p);
  });

  return kept.slice(0, 3).map((p) => {
    const theta = (p.bin + 0.5) * (180 / BINS);
    const t = (theta * Math.PI) / 180;
    const nx = -Math.sin(t); const ny = Math.cos(t);
    const mine = segs.filter((s) => {
      const d = Math.abs(s.ang - theta);
      return Math.min(d, 180 - d) <= 8;
    });
    if (mine.length < 3) return { theta, n: 0, pitch: null, share: p.w / total };
    // offsets of each segment's midpoint along the family normal
    const offs = mine.map((s) => s.mx * nx + s.my * ny).sort((a, b) => a - b);
    // cluster offsets belonging to the SAME ruling (collinear pieces of one line)
    const TOL = Math.max(0.02, PEN * 0.25);
    const rul = [offs[0]];
    for (let i = 1; i < offs.length; i++) if (offs[i] - rul[rul.length - 1] > TOL) rul.push(offs[i]);
    if (rul.length < 3) return { theta, n: rul.length, pitch: null, share: p.w / total };
    const gaps = [];
    for (let i = 1; i < rul.length; i++) gaps.push(rul[i] - rul[i - 1]);
    return { theta, n: rul.length, pitch: median(gaps), share: p.w / total };
  });
};

const run = (V, viewId) => {
  const np = R7.buildParams(V, viewId);
  const paths = R7.buildPaths(V, viewId);
  const S = V.Scene3D.Scene; const G3 = V.Geometry3D; const Rg = V.Scene3D.Regions;
  const scn = S.assembleScene(np, R7.BOUNDS);
  const obj = np.objects[0];
  const built = (scn.objects || []).find((o) => o.id === obj.id);
  if (!built || !Array.isArray(built.faces)) { console.log(`${viewId}: no assembled faces`); return; }

  const segs = [];
  paths.forEach((p) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) continue;
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      ang = ((ang % 180) + 180) % 180;
      segs.push({ mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, len: L, ang });
    }
  });

  const gy = built.world.map((p) => p.y).filter((y) => Number.isFinite(y));
  const gLo = Math.min(...gy); const gHi = Math.max(...gy);
  const groundOf = (gHi > gLo) ? { y0: gLo, height: gHi - gLo } : null;
  const oc = built.world.reduce(
    (a, p) => ({ x: a.x + p.x / built.world.length, y: a.y + p.y / built.world.length, z: a.z + p.z / built.world.length }),
    { x: 0, y: 0, z: 0 },
  );

  console.log(`\n== ${viewId} — SCREEN pitch per family, read off the drawing`);
  console.log(`   plot floor = 1.2 x pen = ${FLOOR.toFixed(3)} mm      pen ${PEN} mm`);
  console.log('   facet        zone  N.L    area mm2   coverage   family (deg)  rulings   pitch mm   pitch/pen   verdict');
  built.faces.forEach((f, idx) => {
    const world = (f.indices || []).map((i) => built.world[i]).filter(Boolean);
    if (world.length < 3) return;
    const n0 = G3.cross(G3.sub(world[1], world[0]), G3.sub(world[2], world[0]));
    const L = Math.hypot(n0.x, n0.y, n0.z);
    if (L < 1e-9) return;
    let nrm = G3.mul(n0, 1 / L);
    const cen = world.reduce((a, p) => ({ x: a.x + p.x / world.length, y: a.y + p.y / world.length, z: a.z + p.z / world.length }), { x: 0, y: 0, z: 0 });
    if (G3.dot(nrm, G3.sub(cen, oc)) < 0) nrm = G3.mul(nrm, -1);
    if (G3.rotatePoint(nrm, scn.camera).z <= 0) return;
    const poly = Array.isArray(f.polygon) && f.polygon.length >= 3
      ? f.polygon.map((p) => ({ x: p.x, y: p.y }))
      : world.map((p) => scn.projectWorld(p)).filter(Boolean);
    if (poly.length < 3) return;
    const zone = Rg.formZone(nrm, cen, { tone: np.tone, lights: np.lights, ground: groundOf });
    const NL = Math.max(0, Rg.signedLambert ? Rg.signedLambert(nrm, cen, np.lights) : 0);
    const mine = segs.filter((s) => inPoly(s.mx, s.my, poly));
    const fams = familyPitches(mine);
    const A = area2(poly);
    // Geometric projected coverage: the ink actually laid inside the facet,
    // widened by the pen, over the facet's own projected area. This is what D
    // tracks and it needs no family decomposition to be trustworthy.
    const cov = mine.reduce((a, s) => a + s.len, 0) * PEN / Math.max(1e-6, A);
    const label = `${String(f.faceId || idx).padEnd(10)}  ${zone.padEnd(4)}  ${NL.toFixed(3)}  ${A.toFixed(0).padStart(8)}  cov ${cov.toFixed(3)}`;
    if (!fams.length) { console.log(`   ${label}   (no families — ${mine.length} segments)`); return; }
    fams.forEach((fam, k) => {
      const pen = fam.pitch == null ? null : fam.pitch / PEN;
      const verdict = fam.pitch == null ? '—' : (fam.pitch >= FLOOR ? 'ok' : `FLOODS (${(FLOOR / fam.pitch).toFixed(1)}x under floor)`);
      console.log(`   ${k === 0 ? label : ' '.repeat(label.length)}   ${fam.theta.toFixed(0).padStart(10)}  ${String(fam.n).padStart(7)}   `
        + `${fam.pitch == null ? '   —   ' : fam.pitch.toFixed(3).padStart(7)}   ${pen == null ? '   —  ' : pen.toFixed(2).padStart(6)}     ${verdict}`);
    });
  });
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  VIEWS.forEach((v) => run(V, v));
  rt.cleanup();
  process.exit(0);
})();
