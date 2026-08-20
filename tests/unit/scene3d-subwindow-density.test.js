/**
 * C15 HAS NO SUB-WINDOW CLAUSE, AND THE WORST POINT OF THE DRAWING IS INSIDE ONE.
 *
 * Every density bar in this workstream is stated over a 4 mm window (§6.1). Live
 * verification in Round 9 found the thing that actually breaks the drawing
 * sitting inside one of them:
 *
 *   "A radiating starburst knot sits at the pole, where every meridian ruling
 *    converges at the chart's UV singularity. It is the brightest, densest thing
 *    in the drawing by a wide margin... The knot is smaller than the 4 mm scoring
 *    window, so `windowD` averages it away."     [Round 9 scorecard §5.4]
 *
 * C15 as WRITTEN passes while a pen digs a hole in the paper. Round 9's reviewer
 * called that an instrument gap rather than a scoring dodge and owed C15 a
 * sub-window clause. This is that clause, and it is a RATCHET RECORDING A MISS —
 * the same idiom `scene3d-projected-pitch.test.js` uses for O20's unmet lit-face
 * clause. Nothing here is fixed yet; what changes is that the miss is now a
 * number instead of a sentence.
 *
 * WHAT IS MEASURED. Local ink coverage at PEN SCALE: `pen x (ink length inside a
 * disc of radius 1 mm) / (pi x 1 mm^2)`, probed at every object-fill segment
 * midpoint. No rasteriser — a raster at pen scale measures the pen's own width
 * and its anti-aliasing as much as the drawing, while this measures ink LENGTH
 * per area, which is what a plotter spends and what the plot floor is stated in.
 *
 * THE INSTRUMENT IS CALIBRATED, EXACTLY, BY TWO CLOSED FORMS (criteria.md §0
 * requires a probe to be shown able to say NO before it is quoted):
 *
 *   an isolated ruling  ->  pen x 2R / (pi R^2)                    = 0.1910
 *   a grid at pitch p   ->  pen / (pi R^2) x SUM 2 sqrt(R^2-(np)^2)
 *
 * The second is the disc's chord bias written down rather than tuned away: a
 * disc centred ON a ruling weights its neighbours by chord length, so a uniform
 * grid at the 2.2 x pen floor reads 0.4779 where the areal coverage is 0.4545, a
 * fixed +5.1 %. Every number below therefore runs ~5 % above its uniform-grid
 * equivalent, which is stated so the reader can subtract it.
 *
 * MEASURED, FOUR-FIXTURE, WORST-OF-FOUR:
 *
 *   fixture              local MAX (r = 1 mm)   4 mm-window max (boolean grid)
 *   E-bands4                    0.957                    0.5062
 *   V-E-bands4-sun45            0.960                    0.4750
 *   W-bigball-bands4            1.069                    0.4700
 *   W-bigball-sun45             1.069                    0.5056
 *   R2-cube-bands4              0.382                    (control: no caustic)
 *
 * **The enforcing instrument under-reads the drawing's worst point by 2.1x**, and
 * on the big ball the worst point is PAST SOLID even after the +5.1 % is
 * subtracted (areal ~1.017).
 *
 * AND IT IS THE CHART, NOT THE LIGHT. `W-bigball-bands4` and `W-bigball-sun45`
 * put their worst point at the SAME screen coordinate, (115.2, -21.8), under two
 * different suns. A lighting feature moves when the sun moves; a parameterisation
 * artefact does not. The five worst spots on each fixture also decluster into one
 * neighbourhood, so this is a KNOT and not a generally over-inked dark side —
 * the two diagnoses have different fixes and the max alone cannot separate them.
 *
 * Fixture from `tests/fixtures/scene3d-shadow-anatomy.js`. Nothing restated.
 * The same measurement is available interactively as
 * `scripts/shadow-anatomy/r10local.js`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, coverageCap: false).
// These two assertions are correct and unmodified — they record a KNOWN,
// unfixed pole-caustic miss against the composed-coverage ceiling, which is
// switched off. Flip `coverageCap` to true and they re-arm automatically. See
// docs/pre-release-hardening-log.md PRH-027 and
// tests/unit/scene3d-hl-stage-roster.test.js, which pins this roster. The
// calibration describe above (§0) is structural and unaffected — it stays
// green.
const STAGE = readHlStageSync();
const whenCoverageCap = STAGE.coverageCap ? describe : describe.skip;

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

const PEN = FIX.BOUNDS.penWidth;
const R = 1.0;                       // probe radius, mm — 3.3 pen widths
const DISC_AREA = Math.PI * R * R;

// Length of segment [a,b] inside the disc of radius R at c. Exact: clip the
// segment's parameter interval against |p(t) - c| = R.
const lenInDisc = (a, b, c) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const fx = a.x - c.x; const fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (!(A > 1e-12)) return 0;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - R * R;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A));
  const t1 = Math.min(1, (-B + s) / (2 * A));
  return t1 > t0 ? (t1 - t0) * Math.sqrt(A) : 0;
};

const coverageAt = (list, c) => {
  let ink = 0;
  for (let i = 0; i < list.length; i++) ink += lenInDisc(list[i].a, list[i].b, c);
  return (ink * PEN) / DISC_AREA;
};

const objectFillSegments = (viewId) => {
  const segs = [];
  FIX.buildPaths(V, viewId).forEach((p) => {
    const m = p.meta || {}; const t = m.sceneTarget || {};
    if (m.kind !== 'sceneFill') return;
    if (t.objectId === 'ground' || t.shadowLayer != null || t.regionClass === 'castShadow') return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) segs.push({ a, b });
    }
  });
  return segs;
};

// Worst local coverage, and where. A uniform grid at cell = R keeps the probe to
// its own 3x3 neighbourhood; a long ruling is registered in every cell it spans
// so no probe can miss one.
const worstLocal = (viewId) => {
  const segs = objectFillSegments(viewId);
  const grid = new Map();
  const key = (i, j) => `${i}|${j}`;
  segs.forEach((s, idx) => {
    const i0 = Math.floor(Math.min(s.a.x, s.b.x) / R); const i1 = Math.floor(Math.max(s.a.x, s.b.x) / R);
    const j0 = Math.floor(Math.min(s.a.y, s.b.y) / R); const j1 = Math.floor(Math.max(s.a.y, s.b.y) / R);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        const bucket = grid.get(k);
        if (bucket) bucket.push(idx); else grid.set(k, [idx]);
      }
    }
  });
  let worst = { cov: 0, x: 0, y: 0 };
  segs.forEach((probe) => {
    const c = { x: (probe.a.x + probe.b.x) / 2, y: (probe.a.y + probe.b.y) / 2 };
    const ci = Math.floor(c.x / R); const cj = Math.floor(c.y / R);
    const seen = new Set(); const near = [];
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const bucket = grid.get(key(i, j));
        if (!bucket) continue;
        bucket.forEach((idx) => { if (!seen.has(idx)) { seen.add(idx); near.push(segs[idx]); } });
      }
    }
    const cov = coverageAt(near, c);
    if (cov > worst.cov) worst = { cov, x: c.x, y: c.y };
  });
  return worst;
};

describe('the sub-window instrument is calibrated before it is quoted (§0)', () => {
  test('an isolated ruling reads pen x 2R / (pi R^2), to the digit', () => {
    const lone = coverageAt([{ a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }], { x: 0, y: 0 });
    expect(lone).toBeCloseTo((PEN * 2 * R) / DISC_AREA, 12);
    expect(lone).toBeCloseTo(0.1910, 4);
  });

  test('a grid at the 2.2 x pen plot floor reads its own closed form, and the bias is +5.1 %', () => {
    const pitch = 2.2 * PEN;
    const grid = [];
    for (let n = -60; n <= 60; n++) grid.push({ a: { x: -10, y: n * pitch }, b: { x: 10, y: n * pitch } });
    let chord = 0;
    for (let n = -Math.ceil(R / pitch); n <= Math.ceil(R / pitch); n++) {
      const d = Math.abs(n * pitch);
      if (d < R) chord += 2 * Math.sqrt(R * R - d * d);
    }
    const closed = (chord * PEN) / DISC_AREA;
    expect(coverageAt(grid, { x: 0, y: 0 })).toBeCloseTo(closed, 12);
    // The disc's chord bias against the areal 1/2.2, written down not tuned away.
    expect(closed / (1 / 2.2)).toBeCloseTo(1.051, 3);
  });

  test('the probe can say NO — a drawing with no caustic reads clean', () => {
    // R2-cube is the control: a faceted cube has no UV singularity anywhere, and
    // an instrument that flagged it would be flagging its own arithmetic.
    const w = worstLocal('R2-cube-bands4');
    expect(w.cov).toBeLessThan(0.40);
  });
});

// BOTH TESTS BELOW WERE RED FOR THE p4 MERGE. NOTHING HERE MOVED — the drawing
// did, and then moved back, and both numbers are the Round 10 ones again.
//
// The merge integrator read the p4-merged state as an improvement: worst-of-four
// local coverage 1.069 -> 0.950, `W-bigball-sun45` at 0.894 just under the 0.90
// per-fixture line, and the second test failing by 30.19 mm because the global
// argmax was no longer the pole knot but an ordinary lighting-driven dark patch,
// which legitimately follows the sun. That reading was right about the effect and
// wrong about the cause — it was not p4's culls suppressing the starburst, it was
// `HYST_RANK`'s flat re-start margin killing rulings all over the sphere,
// including the ones that converge on the pole. With the margin charged as a
// share of the local coverage instead (`hystFor` in `surface-fill.js`), both W
// fixtures again put their worst point at 1.069, at (115.2, -21.8), under two
// different suns — the exact coordinate and value this file's header records.
//
// So the miss is intact and is still a miss. Do not read these two as passing
// criteria: they assert that a known, unfixed defect is still present at the
// size it was measured. The first one says so in its own words — "if a round
// improves this it must lower the ratchet deliberately and say by how much".
whenCoverageCap('C15 sub-window clause — RECORDING A MISS, not asserting a pass', () => {
  // The four-fixture ladder is the unit of report and worst-of-four is the rule.
  const LADDER = ['E-bands4', 'V-E-bands4-sun45', 'W-bigball-bands4', 'W-bigball-sun45'];

  test('the pole caustic is past every ceiling in the document, at pen scale', () => {
    const rows = LADDER.map((id) => ({ id, ...worstLocal(id) }));
    const worst = rows.reduce((a, r) => (r.cov > a.cov ? r : a), rows[0]);
    // RATCHET, and it records a FAILURE. C15's own clauses are "no window may
    // reach D >= 0.90" and "a run of windows at D >= 0.80 is a breach"; read at
    // pen scale the drawing breaches BOTH, on all four fixtures, while the 4 mm
    // instrument that enforces C15 reads 0.47-0.51 and passes.
    rows.forEach((r) => {
      expect(`${r.id} local max ${r.cov.toFixed(3)}`)
        .toBe(`${r.id} local max ${Math.max(r.cov, 0.90).toFixed(3)}`);
    });
    // Worst-of-four is past SOLID even after the instrument's own +5.1 % bias is
    // taken off (1.069 / 1.051 = 1.017). If a round improves this it must lower
    // the ratchet deliberately and say by how much.
    expect(worst.cov).toBeGreaterThan(1.0);
    expect(worst.cov).toBeLessThan(1.15);
  });

  test('the caustic is a property of the chart, not of the light', () => {
    // Same object and camera, two different suns. A lighting feature moves when
    // the sun moves; a parameterisation artefact does not.
    const a = worstLocal('W-bigball-bands4');
    const b = worstLocal('W-bigball-sun45');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
    expect(Math.abs(a.cov - b.cov)).toBeLessThan(0.02);
  });
});
