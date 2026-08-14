/**
 * O1 / O2 / O3 — THE FORM LADDER'S RATIOS, PINNED.
 *
 * The Round 7 review noted a protection gap in as many words: "Nothing pins T/F.
 * The plot-safety test asserts max ≤ 0.56 and a coarse ramp shape. Round 8 is
 * free to move F without fighting a test." That is true of F/M and R/F as well.
 * Every one of these ratios has been re-measured by hand, in a review document,
 * every round for eight rounds — and a number that lives only in a review
 * document is a number that regresses silently.
 *
 * So the ladder is asserted here, in the spec's own terms:
 *
 *   O1  D(T) / D(F)  >= 1.25          (§6.3)
 *   O3  T > F > R                     — rises to a peak, then falls twice
 *   O2  D(R) / D(F)  <= 0.60          (§6.3)
 *   F/M              in [1.45, 1.70]  — the Round 7 rebuild target for F,
 *                                       which F overshot at 2.02-2.23
 *
 * D is the FRACTION OF DARK PIXELS in a 4 mm window (§6.1) — rasterised, never
 * summed from ink length, because ink x pen / area is additive and double-counts
 * every crossing. The stroke is stamped into a boolean grid, exactly as
 * `scene3d-plot-safety.test.js` does, so a pixel inked twice is still one dark
 * pixel. Zones come from `Regions.formZone`, the classifier the fill itself
 * consults.
 *
 * RED/GREEN PROVENANCE
 * --------------------
 * At `0b32ee5` F/M measures 2.25 against a 1.70 ceiling and the F/M assertion
 * fails. T/F, T>F>R and R/F pass there and must keep passing.
 *
 * ROUND 10 — O6's BAR CHANGED, AND IT WAS CHANGED HERE FIRST.
 * ----------------------------------------------------------
 *   O6  D(L) >= 1 / LIT_MAX_PITCH_PEN = 0.083   (boolean grid, this file's
 *                                                instrument, the one CI gates on)
 *
 * The old bar was 0.10. It was RETIRED by the Round 9 reviewer (the visual
 * designer scoring Round 9, ruling §1.4 of
 * `docs/shadow-anatomy/round9-scorecard-and-round10-plan.md`, at branch
 * `shadow-anatomy` HEAD `8c0f249`) as a mis-statement of §5.4 #1, which states
 * the same clause in pen widths — and 12 x pen is a dark fraction of 1/12 =
 * 0.083, not 0.10. The pen-width form wins because it is in the medium's own
 * units and is checkable with a ruler; the raster fraction is instrument-
 * dependent by ~8-12 %. See the long note on the O6 test below for the ruling's
 * own words, and for what Round 10 measured against the lever it prescribed.
 *
 * The bar landed here BEFORE any source moved (Round 10 plan item 5), so the
 * round is measured against the ruling and not against the number it replaced.
 * `criteria.md` O6 is owed the same edit and is written by another hand.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

const { BOUNDS } = FIX;
const PATCH = 4;
const CELL = 0.1;

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

// ROUND 9 — the fixture is no longer restated here either. These four views are
// the harness's own ladder set, and "the four-fixture ladder is the unit of
// report" is a protected item: a ratio that survives one fixture is an anecdote.
const FIXTURES = [
  { view: 'E-bands4', radius: 46 },
  { view: 'V-E-bands4-sun45', radius: 46 },
  { view: 'W-bigball-bands4', radius: 92 },
  { view: 'W-bigball-sun45', radius: 92 },
];

const build = ({ view, radius }) => ({
  np: FIX.buildParams(V, view), paths: FIX.buildPaths(V, view), radius,
});

// Boolean-grid rasteriser: D(window) = filled fraction. Same quantity as the
// designer's dark-pixel instrument, no browser required, immune to overlap.
const darkGrid = (paths, penWidth) => {
  const W = Math.ceil(BOUNDS.width / CELL); const H = Math.ceil(BOUNDS.height / CELL);
  const grid = new Uint8Array(W * H);
  const r = penWidth / 2; const rc = Math.ceil(r / CELL);
  const stamp = (x, y) => {
    const ci = Math.round(x / CELL); const cj = Math.round(y / CELL);
    for (let j = cj - rc; j <= cj + rc; j++) {
      if (j < 0 || j >= H) continue;
      for (let i = ci - rc; i <= ci + rc; i++) {
        if (i < 0 || i >= W) continue;
        const dx = i * CELL - x; const dy = j * CELL - y;
        if (dx * dx + dy * dy <= r * r) grid[j * W + i] = 1;
      }
    }
  };
  paths.forEach((p) => {
    if (!p || p.length < 2) return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(L > 0)) continue;
      const n = Math.max(1, Math.ceil(L / (CELL / 2)));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
    }
  });
  return { grid, W, H };
};
// null when the window is not WHOLLY on the page. A partly-off-page window has
// less paper to be dark, so scoring it reports the page edge, not the drawing:
// the 92 mm ball overruns the top of the 220 mm page, which is exactly where the
// terminator sits, and counting those windows as D=0 dragged T under F and
// reported T/F 0.87 where the harness measures 1.35.
const windowD = ({ grid, W, H }, gx, gy) => {
  const i0 = Math.round((gx * PATCH) / CELL); const j0 = Math.round((gy * PATCH) / CELL);
  const span = Math.round(PATCH / CELL);
  if (i0 < 0 || j0 < 0 || i0 + span > W || j0 + span > H) return null;
  let dark = 0; let n = 0;
  for (let j = j0; j < j0 + span; j++) {
    for (let i = i0; i < i0 + span; i++) {
      n += 1; if (grid[j * W + i]) dark += 1;
    }
  }
  return n ? dark / n : 0;
};

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};
const hull = (pts) => {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; const up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
};

const ladder = ({ np, paths, radius }) => {
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const scn = Sc.assembleScene(np, BOUNDS);
  const obj = np.objects[0];
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: radius, sy: radius, sz: radius });
  const E = 1e-3; const N = Math.max(200, Math.round(200 * (radius / 46)));
  const cell = {}; const pts = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const a = i / N; const b = j / N;
      const p0 = chart(a, b); const pa = chart(Math.min(1, a + E), b); const pb = chart(a, Math.min(1, b + E));
      if (!p0 || !pa || !pb) continue;
      let nn = G3.cross(G3.sub(pa, p0), G3.sub(pb, p0));
      const L = Math.hypot(nn.x, nn.y, nn.z); if (L < 1e-9) continue;
      nn = G3.mul(nn, 1 / L);
      if (G3.dot(nn, p0) < 0) nn = G3.mul(nn, -1);
      const world = Sc.applyObjectTransform(p0, obj.transform);
      if (G3.rotatePoint(nn, scn.camera).z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, {
        tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * radius },
      });
      pts.push({ x: scr.x, y: scr.y });
      const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
      (cell[k] = cell[k] || {})[z] = (cell[k][z] || 0) + 1;
    }
  }
  const sil = hull(pts);
  const g = darkGrid(paths, BOUNDS.penWidth);
  const acc = {};
  Object.entries(cell).forEach(([k, h]) => {
    const [gy, gx] = k.split(',').map(Number);
    const x0 = gx * PATCH; const y0 = gy * PATCH;
    const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
    if (!corners.every(([X, Y]) => inPoly(X, Y, sil))) return;
    const tot = Object.values(h).reduce((s, v) => s + v, 0);
    if (tot < 20) return;
    const dom = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * tot) return;
    const D = windowD(g, gx, gy);
    if (D == null) return;
    (acc[dom[0]] = acc[dom[0]] || []).push(D);
  });
  const mean = (a) => (a && a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const all = Object.values(acc).flat();
  return {
    L: mean(acc.L), M: mean(acc.M), T: mean(acc.T), F: mean(acc.F), R: mean(acc.R),
    max: all.length ? Math.max(...all) : NaN, n: acc,
  };
};

// ── §5.4 #1 / O6 / plan item 16 — ONE CONSTANT, NOT TWO STATEMENTS ──────────
//
// Round 9's second-order ruling: "`LIT_MAX_PITCH_PEN` is, at every value from 6
// to 12, inert with respect to the criterion it cites in its own comment. It is
// not a lever; it is a comment. Either wire it to `ceil(L)` so the two
// statements of §5.4 #1 cannot drift apart again, or delete it."
//
// I re-swept it and the inertness is worse than reported. Four-fixture D(L),
// boolean grid, `FORM_INK.L.coverage` 0.42, `GLINT_KEEP` 0.6:
//
//   LIT_MAX_PITCH_PEN   E-b4    V-E45   W-bb    W-45    worst
//        12            .0694   .0678   .0762   .0865   .0678
//        10            .0694   .0678   .0762   .0865   .0678   bit-identical
//         8            .0694   .0678   .0762   .0865   .0678   bit-identical
//         6            .0694   .0678   .0785   .0918   .0678   worst unmoved
//         4            .0684   .0657   .0740   .0857   .0657   WORSE, and F/M
//                                                              1.719 breaches
//                                                              the protected
//                                                              [1.45, 1.70]
//
// At 4 the constant does not merely fail to help — it drives D(L) DOWN and
// breaches a protected item, because `o6Pitch` then falls under `PLOT_FLOOR_PEN`
// and the surplus spills into a third direction that dilutes every zone. A
// constant whose comment names O6 and whose only measurable effect on O6 is
// negative is the thing the ruling forbids surviving Round 10.
//
// WIRED, not deleted. `LIT_MAX_PITCH_PEN` now lives in `regions.js` beside
// `FORM_INK` and floors `formCeiling('L')` at `1 / LIT_MAX_PITCH_PEN`, and this
// test file reads its O6 bar from the same constant. The floor is L-only —
// §5.4 #1 is about the centre light, and a global floor would give the glint
// zone H a ceiling, which it must not have.
//
// It is SLACK AT 12 and that is stated rather than hidden: the weight term
// gives 0.47 x 0.42 / 2.0 = 0.0987 against a floor of 0.0833, so the wiring is
// output-neutral at the shipped value and every protected number is unchanged.
// What it buys is that the ceiling can never again be put UNDER the bar by a
// coverage edit made somewhere else — which is precisely how O6 came to be
// unreachable by construction in the first place.
describe('§5.4 #1 — O6\'s bar and the ceiling that permits it are one constant', () => {
  test('LIT_MAX_PITCH_PEN is published by Regions and is the bar\'s only source', () => {
    const R = V.Scene3D.Regions;
    expect(R.LIT_MAX_PITCH_PEN).toBe(12);
    expect(1 / R.LIT_MAX_PITCH_PEN).toBeCloseTo(0.0833, 4);
  });

  test('formCeiling(L) may never sit below the bar it has to permit', () => {
    const R = V.Scene3D.Regions;
    expect(R.formCeiling('L')).toBeGreaterThanOrEqual(1 / R.LIT_MAX_PITCH_PEN);
    // ...and the floor is L-only: H is the glint, and it carries no ink at all.
    expect(R.formCeiling('H')).toBe(0);
    // Slack at the shipped value, so the wiring moves nothing: the weight term
    // still wins on L, and every other zone is untouched arithmetic.
    expect(R.formCeiling('L')).toBeCloseTo(0.47 * R.formInk('L').coverage / 2.0, 6);
    expect(R.formCeiling('T')).toBeCloseTo(0.47, 6);
  });
});

describe('the form ladder holds its ratios (O1 / O2 / O3 / O6)', () => {
  FIXTURES.forEach((fx) => {
    describe(fx.view, () => {
      let m;
      beforeAll(() => { m = ladder(build(fx)); });

      test('O3 — the dip is a shape: T > F > R', () => {
        expect(m.T).toBeGreaterThan(m.F);
        expect(m.F).toBeGreaterThan(m.R);
      });

      test('O1 — the terminator out-inks the form shadow by >= 1.25x', () => {
        expect(m.T / m.F).toBeGreaterThanOrEqual(1.25);
      });

      test('O2 — the reflected rim lifts: R <= 0.60 x F', () => {
        expect(m.R / m.F).toBeLessThanOrEqual(0.60);
      });

      test('the form shadow sits in its own band above the halftone: F/M in [1.45, 1.70]', () => {
        expect(m.F / m.M).toBeGreaterThanOrEqual(1.45);
        expect(m.F / m.M).toBeLessThanOrEqual(1.70);
      });

      // ── O6 — THE BAR IS 0.083, AND IT IS STILL NOT MET. ────────────────────
      //
      // THE RULING (Round 9 reviewer, `round9-scorecard-and-round10-plan.md`
      // §1.4, landed here before any source moved, per Round 10 plan item 5):
      //
      //   "O6's 0.10 gives. The bar becomes D(L) >= 0.083, i.e.
      //    1 / LIT_MAX_PITCH_PEN."
      //
      // O6 and §5.4 #1 are ONE CLAUSE IN TWO UNITS — "the centre light carries
      // visible tone", stated once as a raster fraction (0.10) and once as a
      // pitch in pen widths (12 x pen). They disagreed by 20 %. The pen-width
      // statement is the real one: it is in the medium's own units, it survives
      // a pen change, and a plotter operator can check it with a ruler. The
      // raster fraction is instrument-dependent — the boolean grid and the
      // browser raster differ by ~8-12 % on the same drawing, which is most of
      // the gap that was being argued about. And 0.10 is the only one of the
      // three numbers with no derivation on record.
      //
      // So the bar below is not written as a literal. It is READ FROM
      // `Regions.LIT_MAX_PITCH_PEN`, which is also what floors `formCeiling('L')`.
      // The two statements of §5.4 #1 are now one constant and cannot drift
      // apart again — which was the second-order ruling (plan item 16).
      //
      // ROUND 10 MEASURED THE PRESCRIBED LEVER AND IT IS DISPROVED TOO.
      // Four-fixture D(L), this instrument (boolean grid, 0.1 mm), each row a
      // full re-run, worst-of-four in the last column:
      //
      //   FORM_INK.L.coverage / GLINT_KEEP        E-b4   V-E45  W-bb   W-45   worst   L/M worst
      //   0.42 / 0.6  (HEAD)                     .0694  .0678  .0762  .0865   .0678    0.723
      //   0.42 / 0.8                             .0694  .0678  .0785  .0918   .0678    0.767  X O4
      //   0.42 / 1.0                             .0694  .0678  .0785  .0918   .0678    0.767  X O4
      //   0.50 / 0.6  <- THE PRESCRIBED LEVER    .0746  .0736  .0793  .0898   .0736    0.751  X O4
      //   0.50 / 0.8                             .0783  .0744  .0803  .0926   .0744    0.775  X O4
      //   0.50 / 1.0                             .0783  .0744  .0803  .0926   .0744    0.775  X O4
      //   0.46 / 0.6                             .0746  .0717  .0770  .0873   .0717    0.731
      //   0.48 / 0.6                             .0746  .0736  .0793  .0898   .0736    0.751  X O4
      //   0.55 / 0.6                             .0810  .0782  .0839  .0974   .0782    0.814  X O4
      //   0.60 / 0.6                             .0941  .0872  .0897  .1012   .0872    0.846  X O4
      //   0.60 / 0.6, M.coverage 0.62 -> 0.656   .0942  .0872  .0897  .1012   .0872    0.810  X O4
      //                                          (and F/M down to 1.474, 1.7 % off its floor)
      //
      // Three findings, and the first two are against the ruling that sent them:
      //
      //  1. `GLINT_KEEP` NEVER BECOMES LIVE. The ruling says raise L.coverage
      //     "and THEN, and only then, GLINT_KEEP becomes live". It does not. At
      //     coverage 0.50, GLINT_KEEP 0.8 and 1.0 are BIT-IDENTICAL on all four
      //     fixtures, and 0.6 -> 0.8 buys +0.0008 on the binding fixture while
      //     spending 0.024 of the O4 margin. The composed ceiling binds below
      //     the requested coverage at every GLINT_KEEP, so there is one live
      //     ceiling here, not two in series.
      //
      //  2. `L.coverage` 0.42 -> 0.50 DOES NOT REACH THE BAR, AND ALREADY
      //     BREACHES O4. It lands the worst fixture at 0.0736 (11 % short of
      //     0.083) and takes L/M to 0.7510 against the 0.75 floor. The largest
      //     coverage that keeps O4 green is ~0.47, worth D(L) ~0.072.
      //
      //  3. THE COST MODEL IN THE RULING ASSUMED A PER-FIXTURE LEVER. Its
      //     predicted L/M of 0.634/0.679/0.725/0.723 is each fixture's own M
      //     divided into 0.083 — i.e. every fixture landing exactly ON the bar.
      //     `FORM_INK.L.coverage` is global, and the four fixtures span
      //     0.0678-0.0865 (a 28 % spread). Lifting the minimum to 0.083 lifts
      //     the maximum to ~0.106, and O4 is scored on THAT fixture. Measured
      //     at coverage 0.60: L/M 0.846. Spending the WHOLE remaining F/M
      //     margin on M (0.62 -> 0.656, F/M floor 1.45 reached at 1.474) only
      //     brings it to 0.810. It does not fit.
      //
      // So O6 at 0.083 and O4 at `L <= 0.75 x M` are two-way unsatisfiable
      // through the ladder's coverage rows, exactly as O6 at 0.10 was. Nothing
      // is tuned toward the bar here: no `FORM_INK` row moved, and the ratchet
      // below is tightened only to what HEAD actually measures.
      //
      // Note for whoever rules next: O4 is marked [inferred] in `criteria.md`,
      // was invented in Round 9 and pinned in the same round. It is now the
      // BINDING constraint on O6. That is exactly the near-circularity the
      // Round 9 reviewer flagged when they pinned it, and it should be ruled on
      // before another round spends itself on the L zone.
      test('O6 — the centre light carries tone (bar 1/LIT_MAX_PITCH_PEN = 0.083; ratcheted at the measured level)', () => {
        const bar = 1 / V.Scene3D.Regions.LIT_MAX_PITCH_PEN;
        expect(bar).toBeCloseTo(0.0833, 4);
        expect(m.L).toBeGreaterThanOrEqual(0.067); // ratchet: measured worst 0.0678
      });

      // O4/O7 — and the step above it stays open. This is the bar the only
      // working O6 lever would breach, so it is pinned before anyone spends it.
      test('O4/O7 — the lit -> halftone step stays open: L <= 0.75 x M', () => {
        expect(m.L / m.M).toBeLessThanOrEqual(0.75);
      });

      // O13 / C2 — the object's darkest patch, ON EVERY FIXTURE. Round 7
      // protected `max(object) <= 0.56` and Round 8 protected "the four-fixture
      // ladder is the unit of report" precisely because Round 8 reported this
      // number from the single fixture where it had improved while the
      // worst-of-four went the other way. Asserting it per fixture is what makes
      // "worst of four" a fact rather than a reporting convention.
      test('O13 — the object never out-inks the contact collar: max(object) <= 0.56', () => {
        expect(m.max).toBeLessThanOrEqual(0.56);
      });
    });
  });
});
