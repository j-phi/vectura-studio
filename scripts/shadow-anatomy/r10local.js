/* ROUND 10 — THE SUB-WINDOW INSTRUMENT (C15, O17).
 *
 * Every density bar in this workstream is stated over a 4 mm window (§6.1), and
 * live verification found the thing that breaks the drawing INSIDE one:
 *
 *   "A radiating starburst knot sits at the pole, where every meridian ruling
 *    converges at the chart's UV singularity. It is the brightest, densest thing
 *    in the drawing by a wide margin... The knot is smaller than the 4 mm scoring
 *    window, so `windowD` averages it away and `r8probe-o17` never samples inside
 *    it."   [Round 9 scorecard §5.4]
 *
 * C15 as WRITTEN therefore passes while a pen digs a hole in the paper. That is
 * an instrument gap, and this closes it: local ink coverage read at PEN SCALE
 * rather than window scale, with no rasteriser.
 *
 * METHOD. Ink coverage in a disc of radius R around a point is
 * `pen x (ink length inside the disc) / (pi R^2)`. Probing at every segment
 * midpoint finds the worst place without a search grid, because the densest
 * point of a line drawing is always on a line. A uniform grid at pitch p covers
 * `pen/p`, so the reading is directly comparable to D and to the plot floor:
 *
 *   PLOT_FLOOR_PEN = 2.2 (curved, surface-fill.js) -> a legal family tops out at
 *   1/2.2 = 0.4545. Anything above that is ruling closer than the craft rule
 *   allows, and past ~1.0 the pen is sitting in a puddle.
 *
 * The default radius is 1 mm — over three pen widths at the fixture's 0.3 mm pen,
 * so a single stroke reads ~0.10 and cannot masquerade as a flood, and small
 * enough that a 4 mm window contains sixteen of them.
 *
 * WHY NOT JUST RASTERISE SMALLER. A raster at pen scale measures the pen's own
 * width and anti-aliasing as much as the drawing; this measures ink LENGTH per
 * area, which is what a plotter spends and what the plot floor is stated in.
 *
 * Fixture from render.js. Nothing restated.
 *
 * Run: node r10local.js [--r 1.0] [viewId ...]
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const argv = process.argv.slice(2);
let RADIUS = 1.0;
const rAt = argv.indexOf('--r');
if (rAt >= 0) { RADIUS = Number(argv[rAt + 1]) || 1.0; argv.splice(rAt, 2); }
const VIEWS = argv.length ? argv : ['E-bands4', 'W-bigball-bands4'];
const PEN = R7.BOUNDS.penWidth;
const FLOOR_PEN = 2.2;                 // surface-fill.js PLOT_FLOOR_PEN (curved)
const FAMILY_CEIL = 1 / FLOOR_PEN;     // the coverage a legal single family tops out at

// ── THE PROBE MUST BE ABLE TO SAY NO (criteria.md §0) ──────────────────────
//
// Two SYNTHETIC controls, run before any real number is printed, because a
// density instrument that silently reads low would have reported the pole
// caustic as clean — which is exactly what the 4 mm window did.
//
//   sparse — one isolated ruling longer than the disc. It must read exactly
//            `pen x 2R / (pi R^2)`; there is no other answer.
//   dense  — a uniform grid at the plot floor (2.2 x pen). It must read 1/2.2.
//
// NOTE the first control is NOT the same as "the sparsest probe in the drawing".
// The curved fill emits each ruling as a POLYLINE of short segments, many
// shorter than 2R, so a probe at such a midpoint legitimately reads below the
// isolated-ruling value. Reading the drawing's own minimum as a calibration was
// the first thing this instrument got wrong, and it said so.

// Length of the part of segment [a,b] lying inside the disc of radius R at c.
// Exact, by clipping the segment's parameter interval against |p(t) - c| = R.
const lenInDisc = (a, b, c, R) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const fx = a.x - c.x; const fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (!(A > 1e-12)) return 0;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - R * R;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  let t0 = (-B - s) / (2 * A);
  let t1 = (-B + s) / (2 * A);
  if (t0 < 0) t0 = 0;
  if (t1 > 1) t1 = 1;
  if (t1 <= t0) return 0;
  return (t1 - t0) * Math.sqrt(A);
};

// Ink coverage in the disc at `c`, over an arbitrary segment list.
const coverageAt = (list, c, R) => {
  let ink = 0;
  for (let i = 0; i < list.length; i++) ink += lenInDisc(list[i].a, list[i].b, c, R);
  return (ink * PEN) / (Math.PI * R * R);
};

// A disc centred ON a ruling weights its neighbours by CHORD length, so a
// uniform grid at pitch p reads more than the areal `pen / p`. The bias is
// exact and computable, so the control is checked against the closed form
// rather than against a tolerance:
//
//     cov_disc(p) = pen / (pi R^2) * SUM over n of 2 sqrt(R^2 - (n p)^2),  |n p| < R
//
// At R = 1 mm, pen 0.3 and the 2.2 x pen floor that is 0.4779 against an areal
// 0.4545 — a fixed +5.1 %. Every MAX quoted by this instrument therefore reads
// about 5 % above the uniform-grid equivalent, and that is stated rather than
// tuned away: the pole's 0.957 is an areal ~0.911, and W-bigball's 1.069 is an
// areal ~1.017, still past solid.
const discGridCoverage = (pitch, R) => {
  let chord = 0;
  for (let n = -Math.ceil(R / pitch); n <= Math.ceil(R / pitch); n++) {
    const d = Math.abs(n * pitch);
    if (d < R) chord += 2 * Math.sqrt(R * R - d * d);
  }
  return (chord * PEN) / (Math.PI * R * R);
};

const probeCheck = () => {
  const lone = coverageAt([{ a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }], { x: 0, y: 0 }, RADIUS);
  const want = (PEN * 2 * RADIUS) / (Math.PI * RADIUS * RADIUS);
  const pitch = 2.2 * PEN;                       // the curved plot floor
  const grid = [];
  for (let n = -60; n <= 60; n++) grid.push({ a: { x: -10, y: n * pitch }, b: { x: 10, y: n * pitch } });
  const dense = coverageAt(grid, { x: 0, y: 0 }, RADIUS);
  const wantDense = discGridCoverage(pitch, RADIUS);
  const okLone = Math.abs(lone - want) < 1e-9;
  const okDense = Math.abs(dense - wantDense) < 1e-9;
  return `isolated ruling ${lone.toFixed(4)} = ${want.toFixed(4)} ${okLone ? 'OK' : 'WRONG'}`
    + `   |   grid at the 2.2 x pen floor ${dense.toFixed(4)} = ${wantDense.toFixed(4)} ${okDense ? 'OK' : 'WRONG'}`
    + `   [areal equivalent ${(1 / 2.2).toFixed(4)}, so readings run +${((wantDense / (1 / 2.2) - 1) * 100).toFixed(1)} %]`
    + `${okLone && okDense ? '' : '   — DO NOT QUOTE THIS RUN'}`;
};

const run = (V, viewId) => {
  const paths = R7.buildPaths(V, viewId);
  // Object ink only. The cast shadow is protected and separately scored, and a
  // ground border is not a form.
  const segs = [];
  paths.forEach((p) => {
    const m = p.meta || {}; const t = m.sceneTarget || {};
    if (m.kind !== 'sceneFill') return;
    if (t.objectId === 'ground' || t.shadowLayer != null || t.regionClass === 'castShadow') return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(L > 1e-9)) continue;
      segs.push({ a, b, len: L, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
  });
  if (!segs.length) { console.log(`\n== ${viewId}: no object fill ink`); return; }

  // Uniform grid over the segments' bounding boxes, cell = RADIUS, so a probe
  // only has to visit the 3x3 neighbourhood of its own cell.
  const CELL = RADIUS;
  const key = (i, j) => `${i}|${j}`;
  const grid = new Map();
  segs.forEach((s, idx) => {
    const i0 = Math.floor(Math.min(s.a.x, s.b.x) / CELL); const i1 = Math.floor(Math.max(s.a.x, s.b.x) / CELL);
    const j0 = Math.floor(Math.min(s.a.y, s.b.y) / CELL); const j1 = Math.floor(Math.max(s.a.y, s.b.y) / CELL);
    // A long ruling spans many cells; register it in each so no probe misses it.
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        const bucket = grid.get(k);
        if (bucket) bucket.push(idx); else grid.set(k, [idx]);
      }
    }
  });

  const area = Math.PI * RADIUS * RADIUS;
  let worst = null;
  const covs = [];
  const probes = [];
  segs.forEach((probe) => {
    const c = { x: probe.mx, y: probe.my };
    const ci = Math.floor(c.x / CELL); const cj = Math.floor(c.y / CELL);
    const seen = new Set();
    let ink = 0;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const bucket = grid.get(key(i, j));
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n++) {
          const idx = bucket[n];
          if (seen.has(idx)) continue;
          seen.add(idx);
          const s = segs[idx];
          ink += lenInDisc(s.a, s.b, c, RADIUS);
        }
      }
    }
    const cov = (ink * PEN) / area;
    covs.push(cov);
    probes.push({ cov, x: c.x, y: c.y, ink });
    if (!worst || cov > worst.cov) worst = { cov, x: c.x, y: c.y, ink };
  });

  // The hot spots, spatially declustered — "one converging knot" and "the whole
  // dark side is too dense" are different diagnoses and the max cannot tell them
  // apart. Take the worst probe, suppress everything within 4 mm (one scoring
  // window) of it, repeat.
  const ranked = probes.slice().sort((a, b) => b.cov - a.cov);
  const spots = [];
  for (let i = 0; i < ranked.length && spots.length < 5; i++) {
    const p = ranked[i];
    if (spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 4)) continue;
    spots.push(p);
  }

  covs.sort((a, b) => a - b);
  const q = (f) => covs[Math.min(covs.length - 1, Math.floor(f * covs.length))];
  // Compared against the DISC equivalent of the floor, not the areal one, so
  // the count is not inflated by the instrument's own +5.1 % chord bias.
  const familyCeilDisc = discGridCoverage(FLOOR_PEN * PEN, RADIUS);
  const over = covs.filter((c) => c > familyCeilDisc).length;
  const flooded = covs.filter((c) => c >= 1.0).length;
  console.log(`\n== ${viewId} — LOCAL coverage at r = ${RADIUS} mm  (${segs.length} object-fill segments)`);
  console.log(`   median ${q(0.5).toFixed(3)}   p90 ${q(0.9).toFixed(3)}   p99 ${q(0.99).toFixed(3)}   MAX ${worst.cov.toFixed(3)}`);
  console.log(`   worst point (${worst.x.toFixed(1)}, ${worst.y.toFixed(1)}) mm — ${worst.ink.toFixed(2)} mm of ink in a ${(2 * RADIUS).toFixed(1)} mm disc`);
  console.log(`   probes above a legal single family (disc-equivalent of the ${FLOOR_PEN} x pen floor = ${familyCeilDisc.toFixed(4)}): `
    + `${over} of ${covs.length} (${((100 * over) / covs.length).toFixed(2)} %)`);
  console.log(`   probes at or past SOLID (1.000): ${flooded} (${((100 * flooded) / covs.length).toFixed(2)} %)`);
  console.log(`   4 mm-window bars cannot see any of this: a knot ${(2 * RADIUS).toFixed(1)} mm across`
    + ` occupies ${((area / 16) * 100).toFixed(0)} % of one window.`);
  console.log('   hot spots, declustered at one 4 mm window:');
  spots.forEach((s, i) => console.log(`     ${i + 1}. cov ${s.cov.toFixed(3)} at (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`));
  console.log(`   [probe check] ${probeCheck()}`);
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  VIEWS.forEach((v) => run(V, v));
  rt.cleanup();
  process.exit(0);
})();
