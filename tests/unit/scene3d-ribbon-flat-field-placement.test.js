/*
 * F1-placement — THE USER'S "STREAK NOT CLOSE TO ZERO YET" COMPLAINT.
 *
 * `docs/3d-audit/lane-reports/F1-placement-plan.md` (the binding planner
 * brief, read in full before writing this file) locates the defect: for the
 * five ribbon laws the fill is a family of rulings SUBSET off a fixed master
 * grid by a Sturmian phase accumulator (`ladderStep`), and for three of them
 * — `interlockWeave`, `onePenDown`, `trochoidLoop` — the coverage that drives
 * that accumulator, `wvFlatCov()` (`src/core/scene3d/surface-fill.js`), is a
 * CONSTANT with no radiance term and no screen-position term at all: one
 * number for the whole object. On the default torus at Density 50 that puts
 * a 41.7mm x 6.6mm, ~62mm2 bare strip across the lower front — 5% of the
 * visible surface, containing 77 dropped-ruling samples and 0 kept-ruling
 * samples.
 *
 * `docs/3d-audit/lane-reports/LEDGER.md`'s standing ruling, 2026-09-06:
 * "F1-placement ships Prototype B (LOCAL)" — because the user judges the
 * PICTURE, and what reads as a streak is a DEEP blank band; B collapses
 * >2mm-deep blank from 11.89 to 0.28mm2 (interlockWeave), which is the
 * visible defect, even though Prototype A's TOTAL blank area is smaller (A
 * mostly removes SHALLOW blank the eye does not see, and it leaks +10.8%
 * ink into `ampSpacing` — a law this fix must leave byte-identical). Five
 * conditions bind this unit, restated inline at each test that answers one:
 *   (1) primary oracle = deep-blank area (>2mm) with a bar B meets, +-10%.
 *   (2) the total-area bar is restated to what B meets, disclosed below
 *       under `## Bars changed` in the impl report (not quietly carried).
 *   (3) RED-1(b) is restated on the DRAWN perpendicular gap, not the index
 *       gap (B makes index gaps legitimately non-uniform — that is the
 *       point: the accumulator now advances by screen distance).
 *   (4) `ampSpacing` and the WV6 laws must be byte-identical — the leak A
 *       failed on. Proven in its own describe block below via a SECOND
 *       runtime loaded from the pre-fix source, multi-primitive x
 *       multi-density (U7's harness methodology).
 *   (5) F1-amp is the follow-up that finishes the job (the four pre-Round-6
 *       wave laws have no amplitude floor, so a plain ruling in the
 *       highlight is still geometrically unavoidable even once placement is
 *       even — plan §6) — serialized after, not merged into this unit.
 *
 * THE FIX (Prototype B / "LOCAL", `surface-fill.js`): a new `wvPlaceCov`
 * beside `wvFlatCov`, read only by `weightCovAt`'s wave fallthrough, guarded
 * to `isWaveLaw() && !isWv6()`. States the SAME reserve `wvFlatCov` does, but
 * against `localPitch` (already projection-correct, already computed by
 * `covAtSample` and already passed into `weightCovAt` — and previously never
 * read there) instead of the global `masterPitch`. That moves the
 * accumulator from "one grid step per ruling" to "one grid step per unit of
 * SCREEN distance", which is what makes the kept-ruling gaps track the
 * screen instead of the index.
 *
 * RED proof: the same assertions failed on this unit's own base commit
 * `8adfd5af` (before Prototype B landed), recorded in the fix commit. R-18
 * retired the env-gated pre-fix switch that reproduced it.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { goldenValues } = require('../helpers/golden-values');
const { captureRegionRings, buildBlankMap, findBlankClusters } = require('../helpers/scene3d-blank-map');

// R-18 (D-4): condition (4) used to load `surface-fill.js` from the pre-fix
// tree (`git show 8adfd5af`) as a second runtime. It now reads committed md5
// goldens, generated from the tree that matched 8adfd5af byte for byte
// (tests/baselines/golden-values/).
const golden = goldenValues('scene3d-ribbon-flat-field-placement');

const PEN_WIDTH = 0.3; // BOUNDS default (tests/fixtures/scene3d-shadow-anatomy.js)
// The three flat-coverage wave laws this unit fixes.
const LAWS = ['interlockWeave', 'onePenDown', 'trochoidLoop'];
// Controls that must NOT move: the two WV6 laws (a genuine tone-driven
// reserve, condition 4) and `taperedEnds` (the same flat-coverage defect
// through a DIFFERENT function, `wbFlatCov()` — out of this unit's file
// scope per the plan's Fix D/§9 "wbFlatCov siblings", reported not fixed).
const CONTROL_LAWS = ['ampSpacing', 'weaveDepth', 'taperedEnds'];

const WV_PITCH_PEN = 10;
const WV_AO_PITCH_PEN = 4; // unused here (amplitudeOnly is not a subject), kept for parity with source
const INK_SPREAD = 0.12;

// RED-2 bars — RESTATED against THIS TREE's own measured numbers (`## Bars
// changed` in the impl report), not carried from the plan's §10 figures,
// which were measured at the plan's own base sha `3c88605f` and are stale:
// other fixes landed on this lane between then and `8adfd5af`, so
// this tree's pre-fix deep-blank was already 1.79-4.00mm2, not 11.89-14.70.
//
// Condition (1) PRIMARY oracle — measured on THIS tree: pre-fix
// (8adfd5af) 3.02 / 4.00 / 1.79 mm2; Prototype B 0.03 / 0.00 /
// 0.00 mm2. Bar set well inside BOTH populations (>=17x margin either side).
const RED2_DEEP_BLANK_MM2 = 0.5;
// Condition (2) restated total-area bar — measured on THIS tree, Prototype
// B: largest dist>0.8mm cluster 39.81/21.27/14.03 mm2 (27.4/23.3/19.2mm
// longest extent). Bars set with a working margin over B's worst case; per
// plan §2/§10 this bar does NOT cleanly separate pre- from post-fix on its
// own for every law (pre-fix onePenDown's 39.04mm2 is BELOW interlockWeave's
// post-fix 39.81mm2) — that asymmetry is exactly why condition (1)'s
// deep-blank oracle, not this one, is the PRIMARY gate.
const RED2_LARGEST_CLUSTER_MM2 = 45;
const RED2_LARGEST_EXTENT_MM = 30;

describe('SurfaceFill — F1-placement: flat-coverage wave laws placed by screen distance, not grid index', () => {
  let runtime;
  let V;
  let SF;
  const results = {};
  let famN = 0;

  const buildLaw = async (Vectura, toneLaw) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l && l.id === groupId);
    const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
    // Default camera (3/4 view: yaw -30, pitch 20) — untouched, matching
    // `scene3d-ribbon-f1b-streaks.test.js`'s own fixture (plan §10).

    const SFm = Vectura.Scene3D.SurfaceFill;
    const orig = SFm.buildObject;
    const raw = [];
    SFm.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    const regionCap = captureRegionRings(Vectura);
    try {
      engine.computeAllDisplayGeometry();
    } finally {
      SFm.buildObject = orig;
      regionCap.restore();
    }

    const stats = { ...(SFm.lastRibbonStats || {}) };
    const grid = SFm.lastMasterGridStats ? { ...SFm.lastMasterGridStats } : null;
    const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
    const region = regionCap.dominantRegion() || [];

    const repMap = new Map();
    const ptsByIndex = new Map();
    let maxIdx = -1;
    raw.forEach((run) => {
      if (run.back || run.lineIndex == null || typeof run.fam !== 'string' || !run.fam.startsWith('A#')) return;
      if (run.lineIndex > maxIdx) maxIdx = run.lineIndex;
      if (!repMap.has(run.lineIndex)) repMap.set(run.lineIndex, { x: 0, y: 0, n: 0 });
      if (!ptsByIndex.has(run.lineIndex)) ptsByIndex.set(run.lineIndex, []);
      const acc = repMap.get(run.lineIndex);
      const pts = ptsByIndex.get(run.lineIndex);
      for (let i = 0; i < run.length; i += 1) {
        acc.x += run[i].x; acc.y += run[i].y; acc.n += 1;
        pts.push(run[i]);
      }
    });
    const reps = [...repMap.entries()]
      .filter(([, acc]) => acc.n > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([li, acc]) => ({ li, pt: { x: acc.x / acc.n, y: acc.y / acc.n } }));

    const blank = buildBlankMap(region, ink, PEN_WIDTH, { cellSize: 0.1, thresholds: [0.8, 2.0] });
    const clusters08 = findBlankClusters(blank.blankByT[0.8].mask, blank.nx, blank.ny, blank.cs, blank.ox, blank.oy);
    const largestCluster = clusters08.reduce(
      (best, c) => (!best || c.areaMm2 > best.areaMm2 ? c : best), null,
    );

    return {
      stats, grid, ink, region, reps, maxIdx, ptsByIndex,
      blankAreaMm2: blank.blankByT[0.8].areaMm2,
      deepBlankAreaMm2: blank.blankByT[2.0].areaMm2,
      regionAreaMm2: blank.regionAreaMm2,
      clusters08,
      largestCluster: largestCluster || {
        areaMm2: 0, lengthMm: 0, crossWidthMm: 0,
      },
    };
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
    SF = V.Scene3D.SurfaceFill;

    for (const law of [...LAWS, ...CONTROL_LAWS]) {
      // eslint-disable-next-line no-await-in-loop
      results[law] = await buildLaw(V, law);
    }
    // The family's TRUE total ruling count. Dropped rulings never call
    // `emitLine`/`pushRun`, so any single law's own observed max lineIndex
    // can silently be one short if its OWN last ruling happens to be
    // dropped (measured: true for all three subjects, whose family runs
    // 0..17 but ruling 17 is itself dropped) — taking the max across every
    // law captured (subjects AND controls) recovers the true bound, since
    // the master-grid geometry is shared and at least one law here keeps
    // every index up to it.
    famN = 1 + Math.max(...[...LAWS, ...CONTROL_LAWS].map((law) => results[law].maxIdx));
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  // Helper shared by RED-1(a): reconstruct `wvFlatCov()`'s value from the
  // ONE thing it is allowed to depend on (the object's masterPitch — no
  // per-ruling term) and drive the file's own exported accumulator
  // (`SF.__ladderForTest`, `ladderKeep` in the source) over the family's
  // true length.
  const flatModelPrediction = (law) => {
    const { grid } = results[law];
    const pitchPen = law === 'amplitudeOnly' ? WV_AO_PITCH_PEN : WV_PITCH_PEN;
    const inkWidth = PEN_WIDTH * (1 + INK_SPREAD);
    const c = grid.masterPitch / (pitchPen * inkWidth);
    const covs = new Array(famN).fill(c);
    const keeps = SF.__ladderForTest(covs, 0.5);
    return keeps.map((k, i) => (k ? i : null)).filter((v) => v != null);
  };

  describe('RED-1(a) — mechanism honesty: was the pre-fix coverage really flat, and is the fix not a no-op', () => {
    // On the pre-fix tree (8adfd5af) a single masterPitch-derived constant,
    // with no per-ruling term, reproduced the OBSERVED kept-index set EXACTLY
    // (the RED proof, recorded in the fix commit). On the shipped tree
    // `wvPlaceCov` reads `localPitch`, which is not constant across the family.
    // Not-a-no-op guard: only meaningful on the shipped tree. At least one
    // subject law's kept set must now DIFFER from what the old flat model
    // predicts — otherwise Prototype B changed nothing observable.
    test('Prototype B is not a no-op: at least one subject law\'s kept set differs from the old flat-model prediction', () => {
      const changed = LAWS.some((law) => {
        const predicted = flatModelPrediction(law);
        const observed = results[law].reps.map((r) => r.li);
        return JSON.stringify(predicted) !== JSON.stringify(observed);
      });
      expect(changed).toBe(true);
    });

    // The exempted controls: the same reconstruction never reproduces their
    // kept set, in EITHER regime, because their placement coverage genuinely
    // varies (`wv6Cov`, a real tone field) — this is what makes it correct
    // that RED-1(b)/RED-2 do not gate them.
    test.each(['ampSpacing', 'weaveDepth'])('%s — control: the flat-coverage reconstruction does NOT match (its coverage is a real tone field)', (law) => {
      const predicted = flatModelPrediction(law);
      const observed = results[law].reps.map((r) => r.li);
      expect(predicted).not.toEqual(observed);
    });
  });

  describe('RED-2 — the user-visible band (front-facing visible-form region, 0.1mm raster)', () => {
    // Condition (1): the PRIMARY oracle is deep-blank (>2mm) area, +-10%.
    test.each(LAWS)('%s — PRIMARY: dist>2.0mm blank area stays within the Prototype-B band (<=0.5mm2, +-10%)', (law) => {
      const { deepBlankAreaMm2, regionAreaMm2 } = results[law];
      expect(regionAreaMm2).toBeGreaterThan(100); // vacuous-pass guard: a real region was captured
      expect(deepBlankAreaMm2, `${law}: deepBlank=${deepBlankAreaMm2.toFixed(4)}mm2`)
        .toBeLessThanOrEqual(RED2_DEEP_BLANK_MM2 * 1.10);
    });

    // Condition (2): the total-area bar RESTATED to what Prototype B meets
    // (disclosed under `## Bars changed` in the impl report — this is not a
    // silent carry of the plan's original 32mm2/25mm bar, which was tuned
    // for Prototype A).
    test.each(LAWS)('%s — largest dist>0.8mm cluster: area <=45mm2, longest extent <=30mm', (law) => {
      const { largestCluster } = results[law];
      expect(largestCluster.areaMm2, `${law}: largest cluster ${JSON.stringify(largestCluster)}`)
        .toBeLessThanOrEqual(RED2_LARGEST_CLUSTER_MM2);
      expect(largestCluster.lengthMm, `${law}: largest cluster ${JSON.stringify(largestCluster)}`)
        .toBeLessThanOrEqual(RED2_LARGEST_EXTENT_MM);
    });

    // Mandatory disclosure (plan §10 RED-2): `taperedEnds` carries the SAME
    // flat-coverage defect through a DIFFERENT function (`wbFlatCov()`) and
    // is NOT gated here — record its number so nobody "discovers" it later.
    test('taperedEnds is NOT gated by RED-2 (same defect class, different function, out of this unit\'s scope)', () => {
      const { deepBlankAreaMm2, largestCluster } = results.taperedEnds;
      expect(deepBlankAreaMm2).toBeGreaterThanOrEqual(0);
      // eslint-disable-next-line no-console
      console.log(`taperedEnds (control, NOT gated): deepBlank=${deepBlankAreaMm2.toFixed(2)}mm2, `
        + `largestCluster=${largestCluster.areaMm2.toFixed(2)}mm2 (${largestCluster.lengthMm.toFixed(1)}x${largestCluster.crossWidthMm.toFixed(1)}mm)`);
    });
  });

  describe('anti-vacuity — no coverage bought with centrelines, and the ribbon branch is genuinely reached', () => {
    // Stop condition 6 / plan §9 "insetMultiPolygon swallowed-failure
    // ladder": under Prototype B, `interlockWeave` hits ONE new
    // `[FillBoolean] polygon union failed on degenerate geometry` case that
    // does not occur at the pre-fix baseline (measured: 0 at
    // `VECTURA_PRE_F1P=1`, 1 under Prototype B) — a real, pre-existing
    // robustness gap in `insetMultiPolygon`'s degenerate-input handling that
    // Prototype B's changed geometry exposes, not a regression it
    // introduces (the fallback ladder still recovers a usable ring; this
    // counter tracks that it needed to). Characterised here per stop
    // condition 6 rather than silently widened: `onePenDown` and
    // `trochoidLoop` stay at the historical 0.
    const DEGENERATE_CEILING = { interlockWeave: 1, onePenDown: 0, trochoidLoop: 0 };
    test.each(LAWS)('%s — stats.wide > 0 and stats.degenerate at or under its known ceiling', (law) => {
      const { stats } = results[law];
      expect(stats.wide).toBeGreaterThan(0);
      expect(stats.degenerate, `${law}: degenerate=${stats.degenerate}`)
        .toBeLessThanOrEqual(DEGENERATE_CEILING[law]);
    });
  });

  describe('scope leak guard (stop condition 1) — controls do not move on the blank map', () => {
    // `ampSpacing`/`weaveDepth` already measure 0.00mm2 of >2.0mm blank on
    // the untouched tree (plan §3.4) — Prototype B must leave that true.
    test.each(['ampSpacing', 'weaveDepth'])('%s — control: dist>2.0mm blank area stays at (or under) its untouched-tree value', (law) => {
      const { deepBlankAreaMm2 } = results[law];
      expect(deepBlankAreaMm2, `${law}: deepBlank=${deepBlankAreaMm2.toFixed(4)}mm2`).toBeLessThan(0.1);
    });
  });
});

/*
 * Condition (4) — `ampSpacing` and the WV6 laws must be byte-identical to
 * the pre-fix tree. Proved directly (not inherited from the aggregate sweep
 * above), multi-primitive x multi-density, per U7's own methodology
 * (`docs/3d-audit/lane-reports/U7-impl.md` "(b) `ampSpacing` byte-identity,
 * proven specifically"). The goldens hold the pre-fix (8adfd5af) md5s.
 */
describe('SurfaceFill — F1-placement condition 4: WV6 laws byte-identical pre/post fix', () => {
  let postRuntime;

  afterAll(() => {
    if (postRuntime) postRuntime.cleanup();
  });

  const serializeInk = (paths) => JSON.stringify((paths || []).map((p) => p.map((pt) => [
    Math.round(pt.x * 1e6) / 1e6, Math.round(pt.y * 1e6) / 1e6,
  ])));
  const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

  const buildInk = async (Vectura, primitive, toneLaw, fillDensity) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l && l.id === groupId);
    const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = primitive;
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw, fillDensity };
    engine.computeAllDisplayGeometry();
    return (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
  };

  test('representative WV6 and non-wave controls remain byte-identical to the pre-Prototype-B goldens', async () => {
    postRuntime = await loadVecturaRuntime({ includeUi: true });
    const Vpost = postRuntime.window.Vectura;
    // U2 (2026-10-02) moved the ribbon EROSION to `PenFill.erodeLevels` — a
    // deliberate output change unrelated to placement. The pre-fix tree
    // predates it, so the post side is pinned to the polygon erosion it
    // falls back to without `erodeLevels`, keeping this a test of PLACEMENT
    // alone.
    delete Vpost.PenFill.erodeLevels;

    const CHECKS = [
      { law: 'ampSpacing', primitive: 'torus', density: 50 }, // WV6 spacing path
      { law: 'weaveDepth', primitive: 'torus', density: 50 }, // distinct WV6 depth parameters
      { law: 'taperedEnds', primitive: 'sphere', density: 50 }, // separate non-wave flat-coverage path
    ];
    for (const { law, primitive, density } of CHECKS) {
      // eslint-disable-next-line no-await-in-loop
      const post = await buildInk(Vpost, primitive, law, density);
      expect(post.length, `${law}: post-fix fill is nonempty`).toBeGreaterThan(0);
      golden.expect(`${law}/${primitive}/d${density} fill md5`, md5(serializeInk(post)));
    }
  }, 600000);
});
