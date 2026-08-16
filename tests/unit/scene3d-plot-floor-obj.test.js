/**
 * THE OBJECT PLOT FLOOR MUST BE ABLE TO ENFORCE THE CRITERION IT CITES.
 *
 * Round 9 scorecard §4.2, unreported by the round that shipped it:
 *
 *   > `PLOT_FLOOR_MULT_OBJ = 1.2` floors a single family at 1.2 x pen. A single
 *   > family at 1.2 x pen has coverage `pen / (1.2 x pen)` = 0.833. C15's own
 *   > clause is "a run of windows at D >= 0.80 is a breach". The plot floor
 *   > legalises, by construction, a single family that breaches C15.
 *
 * This is the same class of defect Round 9 had just fixed — a cap stated on a
 * proxy one transform away from the metric — one level up. The Round 9 fix made
 * the floor bind on the right quantity; it left the floor's own VALUE unable to
 * enforce anything.
 *
 * WHY THIS TEST IS ARITHMETIC AND NOT A DRAWING
 * ---------------------------------------------
 * The claim is a claim about the FLOOR, not about any particular scene: "no
 * legal configuration of a single family can breach C15". A drawing can only
 * ever show that the floor did not bind today. `scene3d-plot-safety.js` already
 * makes the same argument for the cast shadow's collar and gives the reason:
 * composed coverage is not observable from the emitted paths, because a pitch
 * only shows up as a measurable spacing where two adjacent rulings both survive
 * clipping. So the floor is read through a seam and the arithmetic is done here,
 * where the implementation cannot re-bless its own answer.
 *
 * THE NUMBER
 * ----------
 * Coverage of one family at `mult x pen` is `pen / (mult x pen)` = `1 / mult`,
 * independent of pen width. So:
 *
 *     mult    coverage   verdict against C15's 0.80 clause
 *     1.20     0.8333    BREACH  (this is HEAD)
 *     1.25     0.8000    BREACH  — the review said ">= 1.25"; at exactly 1.25
 *                                 the coverage is exactly the breach threshold,
 *                                 not under it. `>=` is the wrong relation.
 *     1.40     0.7143    under geometrically, but see the instrument below
 *     1.50     0.6667    under, with margin, on both instruments
 *
 * AND THE INSTRUMENT, because `criteria.md` §0 says a bar quoted without one is
 * ambiguous by about 10 %: coverage `pen / pitch` is an IDEAL quantity and the
 * boolean grid is its closest instrument; the browser raster reads 8-12 % HIGHER
 * on the same drawing (anti-aliasing and round caps broaden every stroke). C15's
 * 0.80 has no named instrument, so the floor has to clear it on the worse one:
 *
 *     1 / 1.40 x 1.12 = 0.800   — lands exactly on the bar. No margin.
 *     1 / 1.50 x 1.12 = 0.747   — clears it on the browser raster too.
 *
 * 1.5 is therefore the value: strictly under 0.80 geometrically (0.667), and
 * still strictly under after the worst measured instrument spread.
 *
 * RED/GREEN PROVENANCE
 * --------------------
 * At `82789c4` the seam reports `mult 1.2 / coverage 0.8333` and the first two
 * tests below fail (0.8333 is not < 0.80; and 0.8333 x 1.12 = 0.9333 is not <
 * 0.80 — it is past C15's HARD 0.90 clause as well).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// C15, both clauses. Quoted from `docs/shadow-anatomy/criteria.md`.
const C15_RUN_BREACH = 0.80;
const C15_HARD = 0.90;
// `criteria.md` §0: "The boolean grid reads ~8-12 % under the browser raster on
// the same drawing." The worse end of the measured spread.
const RASTER_OVER_GRID = 1.12;

let floor;
let Regions;

beforeAll(async () => {
  const runtime = await loadVecturaRuntime();
  const algo = runtime.window.Vectura.AlgorithmRegistry.scene3d;
  expect(typeof algo.__plotFloorForTest).toBe('function'); // the seam exists
  floor = algo.__plotFloorForTest();
  Regions = runtime.window.Vectura.Scene3D.Regions;
});

describe('§4.2 / C15 — a single family AT the floor cannot breach C15', () => {
  test('the seam reports the floor the emitter actually uses', () => {
    expect(Number.isFinite(floor.mult)).toBe(true);
    expect(floor.mult).toBeGreaterThan(1);
    // Coverage is 1/mult by construction; the seam must agree, or the test is
    // measuring a different quantity from the one the emitter floors.
    expect(floor.coverage).toBeCloseTo(1 / floor.mult, 12);
  });

  test('single-family coverage at the floor is strictly under C15\'s 0.80 run clause', () => {
    expect(floor.coverage).toBeLessThan(C15_RUN_BREACH);
  });

  test('and still under 0.80 once read on the browser raster (the worse instrument)', () => {
    expect(floor.coverage * RASTER_OVER_GRID).toBeLessThan(C15_RUN_BREACH);
  });

  test('and nowhere near C15\'s hard 0.90 clause on either instrument', () => {
    expect(floor.coverage).toBeLessThan(C15_HARD);
    expect(floor.coverage * RASTER_OVER_GRID).toBeLessThan(C15_HARD);
  });

  test('1.25 is NOT sufficient — the review\'s ">= 1.25" is off by the relation', () => {
    // Stated as a test rather than a comment so the next round cannot quietly
    // "fix" the floor back down to the number the review named.
    expect(1 / 1.25).toBe(C15_RUN_BREACH);           // exactly the breach threshold
    expect(1 / 1.25).not.toBeLessThan(C15_RUN_BREACH);
    expect(floor.mult).toBeGreaterThan(1.25);
  });

  // §0: a probe may not be quoted until it has been shown able to say NO.
  describe('the arithmetic can say NO', () => {
    const coverage = (mult) => 1 / mult;
    test('the HEAD floor (1.2) is reported as a breach', () => {
      expect(coverage(1.2)).toBeGreaterThan(C15_RUN_BREACH);
      expect(coverage(1.2) * RASTER_OVER_GRID).toBeGreaterThan(C15_HARD);
    });
    test('1.4 clears the geometric bar but NOT the raster one', () => {
      expect(coverage(1.4)).toBeLessThan(C15_RUN_BREACH);
      expect(coverage(1.4) * RASTER_OVER_GRID).not.toBeLessThan(C15_RUN_BREACH);
    });
  });
});

// ── WHAT THE FLOOR STILL CANNOT DO, PINNED SO IT STAYS VISIBLE ──────────────
//
// §4.2's other half is "the composed budget must own the cross", and it is
// right: a floor bounds ONE family and C15 is measured on the composed patch.
// The composed budget is NOT landed this round (see the ruling below); this
// block records exactly how much of the hole the floor closes and how much is
// left, so the next round argues against a number instead of a paragraph.
//
// Composition follows this workstream's own convention, stated in
// `scene3d-plot-safety.test.js`: families are independent, so the CLEAR fraction
// multiplies and coverage is `1 - PROD(1 - pen/pitch)`.
//
// A zone's cross family runs at `formInk(zone).cross` times the carrier's
// coverage (`crossWeightFor` → `Regions.formInk().cross`; measured on the
// faceted path as 0.20 for F and 1.00 for T). So with BOTH families driven to
// the floor:
//
//   zone    cross w   old floor 1.2      new floor 1.5
//   F        0.20     0.8611  BREACH     0.7111  clear
//   T        1.00     0.9722  BREACH,    0.8889  still over the 0.80 run
//                             past the           clause; under the 0.90
//                             HARD 0.90          hard clause
//
// So the floor change alone takes the worst composable case from past C15's
// HARD clause to under it, and closes zone F outright. Zone T remains, and the
// mechanism that would close it is `Regions.formCeiling('T') = 0.47`, which is
// well under 0.80.
describe('the floor bounds a single family; the composed pair is a separate claim', () => {
  const composed = (covs) => 1 - covs.reduce((clear, c) => clear * (1 - c), 1);

  test('at the floor, a zone with a 0.20 cross (F) composes clear of C15', () => {
    const a = floor.coverage;
    expect(composed([a, 0.20 * a])).toBeLessThan(C15_RUN_BREACH);
  });

  test('KNOWN RESIDUAL: a zone with a 1.00 cross (T) still composes over 0.80', () => {
    const a = floor.coverage;
    const t = composed([a, Regions.formInk('T').cross * a]);
    expect(Regions.formInk('T').cross).toBe(1);  // T crosses a WHOLE second family
    expect(t).toBeGreaterThan(C15_RUN_BREACH);   // the hole that is left
    expect(t).toBeLessThan(C15_HARD);            // but no longer past the hard clause
    // At the old 1.2 floor this was 0.9722 — past the hard clause too.
    expect(composed([1 / 1.2, 1 / 1.2])).toBeGreaterThan(C15_HARD);
  });

  test('the mechanism that would close it exists and is tight enough', () => {
    // `Regions.formCeiling` is the composed ceiling the CURVED path has always
    // enforced and which Round 10 brought into `regions.js`. If the faceted fill
    // were held to it, T could not reach C15's run clause at all. NOT LANDED —
    // measured across five faceted views, 0 of 179 planned facets are over their
    // zone ceiling today (worst: zone T composed 0.2801 against 0.47), so the
    // clamp would be inert on every fixture and its redistribution rule would be
    // an unmeasured tone lever. See the round report.
    expect(Regions.formCeiling('T')).toBeLessThan(C15_RUN_BREACH);
  });
});

describe('the floor is a MINIMUM PITCH, so raising it can only remove ink', () => {
  test('coverage is monotonically decreasing in the multiplier', () => {
    // The property that makes this change safe to land without re-tuning: the
    // floor enters as `Math.max(requestedPitch, mult x pen)`, so it can only
    // widen a pitch, never tighten one. A drawing whose requested pitches are
    // all above the floor is byte-identical before and after.
    const cov = (mult) => 1 / mult;
    expect(cov(floor.mult)).toBeLessThan(cov(1.2));
  });

  test('at the shadow-anatomy pen (0.3 mm) the floor sits far below any asked-for pitch', () => {
    // Predicted before measuring, and the reason this change is expected to move
    // no number: the fixture's requested screen pitches are ~2 mm, the floor is
    // 0.3 x mult mm. Read the pen from the fixture, never restated.
    // eslint-disable-next-line global-require
    const FIX = require('../fixtures/scene3d-shadow-anatomy');
    const pen = FIX.BOUNDS.penWidth;
    expect(floor.mult * pen).toBeLessThan(1.0);
  });
});
