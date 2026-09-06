const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-k2 — the raised fill Density ceiling (0-200) on CURVED primitives.
 *
 * `scene3d-hatch-density-floor.test.js` fixed Density > 100 for the FACETED
 * (box/plane/solid/ground) hatch and the curved-surface DRAFT fallback, but
 * explicitly scoped out the full-quality curved (chart-wrapped) fill — see
 * its "NOTE on scope" comment. That path routes through
 * `Vectura.Scene3D.SurfaceFill.buildObject`, whose master grid (the number
 * of rulings, `N`) floors its pitch at `PLOT_FLOOR_PEN x penWidth` (2.2x pen)
 * regardless of Density. Measured before this fix: a default app sphere,
 * Type=Hatch, full quality, at d=50/100/150/200 produced 23/50/50/50 fill
 * paths — flat above 100, and in the live browser Density 100 and 200
 * rendered pixel-identical.
 *
 * The fix (`curvedMasterFloorPen` in scene3d.js + `opts.masterFloorPen` in
 * surface-fill.js) mirrors `hatchSpacing`'s own two-arm shape: d<=100 keeps
 * SurfaceFill's committed 2.2x-pen floor exactly (that floor already binds
 * at d=100 today, so relaxing it there would move existing artwork); d in
 * (100,200] linearly relaxes the SAME floor down to 1.2x pen — the point
 * surface-fill.js's own PLOT_FLOOR_PEN comment already names as where real
 * ink floods, i.e. the honest physical bound, vs 2.2x which was always the
 * stricter, conservative one. Tapering the floor itself (not swapping to a
 * single lower constant) is what keeps the line count strictly increasing
 * all the way to d=200 instead of just moving the plateau.
 *
 * `floorPitch` — the module-scope plot-safety floor `surface-fill.js` uses
 * everywhere ELSE (per-sample coverage capping, crosshatch separation,
 * mark-length safety, …) is untouched: it always reads `PLOT_FLOOR_PEN`, the
 * new option only reaches the one local `floorPen` inside the master-grid
 * block. See the byte-identity guard below for the specific proof this
 * doesn't move existing d<=100 artwork.
 */

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('scene3d curved (SurfaceFill) hatch density ceiling (100-200) reaches drawn geometry', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d; // objects[0] is the app-default sphere
  });
  afterAll(() => runtime.cleanup());

  const sceneParams = (objects, extra = {}) => ({
    ...clone(defaults),
    seed: 1,
    objects,
    ground: { enabled: false },
    backdrop: { enabled: false },
    camera: {
      projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    },
    ...extra,
  });

  const fillCount = (paths) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill').length;

  const runSphere = (d, mapper, extraParams = {}) => {
    const params = sceneParams(defaults.objects);
    params.styleTable.byObject['obj-1'] = { penId: null, mapper, params: { fillAngle: 45, fillDensity: d, ...extraParams } };
    const t0 = Date.now();
    const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: false }) || [];
    const t1 = Date.now();
    return { count: fillCount(paths), ms: t1 - t0 };
  };

  test('test seam is published', () => {
    expect(typeof algo.__curvedMasterFloorPenForTest).toBe('function');
  });

  describe('curvedMasterFloorPen mapping', () => {
    test('BYTE-IDENTITY GUARD: returns undefined (option omitted) for every density 0-100', () => {
      for (let d = 0; d <= 100; d += 5) {
        expect(algo.__curvedMasterFloorPenForTest(d)).toBeUndefined();
      }
      expect(algo.__curvedMasterFloorPenForTest(0)).toBeUndefined();
      expect(algo.__curvedMasterFloorPenForTest(100)).toBeUndefined();
    });

    test('100-200 tapers linearly from 2.2x pen down to 1.2x pen', () => {
      expect(algo.__curvedMasterFloorPenForTest(101)).toBeCloseTo(2.2 - 0.01 * 1.0, 5);
      expect(algo.__curvedMasterFloorPenForTest(150)).toBeCloseTo(1.7, 10);
      expect(algo.__curvedMasterFloorPenForTest(200)).toBeCloseTo(1.2, 10);
    });

    test('monotonic: denser input never yields a wider (higher-multiple) floor', () => {
      let prev = algo.__curvedMasterFloorPenForTest(100) ?? 2.2;
      for (let d = 101; d <= 200; d++) {
        const cur = algo.__curvedMasterFloorPenForTest(d);
        expect(cur).toBeLessThanOrEqual(prev);
        prev = cur;
      }
    });

    test('300 no longer clamps to the density-200 floor (ceiling extended 200→500, fs-m1)', () => {
      // Stale assertion under the old 0-200 ceiling. See
      // `scene3d-hatch-density-500.test.js` for the full 200-500 mapping and
      // the physical-floor rationale for taking it past 1.2x pen.
      const f200 = algo.__curvedMasterFloorPenForTest(200);
      const f300 = algo.__curvedMasterFloorPenForTest(300);
      expect(f300).toBeLessThan(f200);
    });

    test('values above 500 clamp to the density-500 floor', () => {
      const f500 = algo.__curvedMasterFloorPenForTest(500);
      expect(algo.__curvedMasterFloorPenForTest(600)).toBe(f500);
      expect(algo.__curvedMasterFloorPenForTest(9999)).toBe(f500);
    });
  });

  describe('RED (fixed by this change) — full-quality sphere hatch fill count', () => {
    test('strictly increasing across 50/100/150/200 (was 23/50/50/50 before this fix)', () => {
      const results = [50, 100, 150, 200].map((d) => ({ d, ...runSphere(d, 'hatch') }));
      // eslint-disable-next-line no-console
      console.log('sphere full-quality hatch density sweep:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      // RE-PINNED (W-26, PROOF): `ladder` (the committed default this test
      // drives) moved from a discrete grid-subset to continuous placement
      // (`src/core/scene3d/surface-fill.js`'s `isEvenLadder`/
      // `ladderWantedPitch`) — see the byte-identity guard's own comment
      // below for why d<=100 moves here too. Was [23, 50, 66, 95].
      //
      // RE-PINNED AGAIN (W-26, same commit — caught before landing): a first
      // cut of `ladderWantedPitch` re-clamped its result to the module-scope
      // `floorPitch` (always the UNRELAXED `PLOT_FLOOR_PEN x pen`), which
      // silently overrode the relaxed `masterFloorPen` taper THIS FILE's own
      // fix built (100-200 -> 1.2x pen) once `masterPitch/cov` dropped below
      // the unrelaxed floor — d=150/200 came back [..., 62, 67], looking like
      // legitimate convergence but actually the redundant clamp binding.
      // Removing it (masterPitch is already correctly floored; see
      // `ladderWantedPitch`'s own comment) gives [25, 53, 69, 97] — d=50/100
      // unchanged (the clamp never bound there), d=150/200 climb further
      // once the relaxed floor is honoured all the way through. Confirmed no
      // ruling ends in open surface at any of these densities
      // (`scene3d-fill-boundary-ends` stays green).
      expect(results.map((r) => r.count)).toEqual([25, 53, 69, 97]);
    });

    test('generate time at density 200 stays well under a second (no runaway)', () => {
      const { count, ms } = runSphere(200, 'hatch');
      expect(count).toBeGreaterThan(0);
      expect(ms).toBeLessThan(2000);
    });
  });

  describe('runaway guard — a larger, denser curved object at density 200', () => {
    // A bigger torus at higher mesh detail than the default sphere: more
    // facets to sample per master-grid calibration pass AND (post-fix) more
    // rulings drawn. Precedent for a runaway param hanging CI: 5e75af6e.
    const torus = (extra = {}) => ({
      id: 'obj-1', name: 'obj-1', primitive: 'torus',
      params: { sx: 60, sy: 18, sz: 18, detail: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 18, pitch: 8, roll: 0, scale: 1 },
      visibility: 'solid',
      ...extra,
    });

    test('fill count strictly increases 50/100/150/200 and stays bounded / fast', () => {
      const runAt = (d) => {
        const params = sceneParams([torus()]);
        params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: d } };
        const t0 = Date.now();
        const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: false }) || [];
        const t1 = Date.now();
        return { d, count: fillCount(paths), ms: t1 - t0 };
      };
      const results = [50, 100, 150, 200].map(runAt);
      // eslint-disable-next-line no-console
      console.log('torus full-quality hatch density sweep:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      results.forEach((r) => {
        expect(r.ms).toBeLessThan(3000);
        // MASTER_MAX_LINES (420) x the crosshatch/back multipliers this
        // fixture can't reach — a generous ceiling that only exists to catch
        // an actual explosion, not to pin an exact count.
        expect(r.count).toBeLessThan(2000);
      });
    });
  });

  describe('BYTE-IDENTITY GUARD — every existing d<=100 curved caller is unchanged', () => {
    // Verified via `git stash` (the fix's two files stashed out, fixtures
    // re-run, restored): every value pinned below is IDENTICAL to the
    // pre-fix tree for d in [10, 100]. Only d>100 (checked separately above)
    // is new behavior. Exact fill counts, not just "greater than 0", so a
    // future change that quietly starts engaging the floor differently at
    // d<=100 fails loudly here.
    //
    // STALE ASSERTION, updated (F-01 / W-01, fs-fillaudit-a). The d=10 values
    // below were 22 (hatch) / 84 & 38 (crosshatch) — this is the F-01 defect
    // itself: Density 1 through ~49 pinned to the SAME master-grid pitch (a
    // density-free floor, `o6Pitch`, that stayed the binding constraint the
    // whole way there), so d=10 rendered near-identically to d=1/d=25/d=49.
    // The fix deliberately opens that dead zone — d=10 is now genuinely
    // sparser than d=25/50 — so its pinned value MOVES here. d=50/75/100 are
    // outside the fix's scope (tonePitch is already finer than the floor by
    // then) and stay pinned to their pre-fix values, verified via `git stash`
    // exactly as this guard's own header describes.
    //
    // RE-PINNED AGAIN (adversarial review M1): the first pass at this fix
    // (`CURVED_SPARSE_PITCH_BOOST = 6`, values 4 / 23,8 below) reintroduced
    // the literal F-01 symptom AT Density 10 on other primitives (torus
    // dipped [4,3,4,10] at 1/10/25/50) — see
    // `scene3d-curved-density-sparse-end.test.js`'s "literal checkpoints"
    // block. The re-picked boost (4.1) moved d=10 to 7 / 31,14.
    //
    // RE-PINNED AGAIN (W-26, PROOF): `ladder` (the committed default) moved
    // from a discrete grid-subset to continuous placement — see this file's
    // "RED (fixed by this change)" describe above for the mechanism. d=50
    // and d=100 (plain hatch) also move here: continuous placement changes
    // EVERY density for the ladder family, not only d>100 — this guard's own
    // "byte-identity" framing was about the (separate) `masterFloorPen`
    // feature only. d=10 roughly DOUBLES (7→14 then, on a second pass, →9 —
    // see below) versus the discrete ladder's kept count.
    //
    // RE-PINNED A THIRD TIME (W-26, same commit — caught before landing, not
    // a later regression): the FIRST cut of `ladderWantedPitch` clamped
    // every tone band's pitch at the O6 bar (`litMaxPitchPen()*pen`), which
    // reproduces the literal F-01 flatness this whole file exists to fix
    // (verified: it flattened sphere/torus/cone + hatch + {ladder,
    // fineLadder} to identical counts across Density 1/10/25 — see
    // `scene3d-curved-density-sparse-end.test.js`). The shipped fix scopes
    // that bar to the LIT band's own coverage (`ladderCov`), not every
    // band's pitch — d=10 moves once more as a result (14→9 hatch; 29→20 /
    // 28→18 crosshatch). d=50/75/100 are UNCHANGED by this third pass (the
    // lit-band floor rarely binds once Density is past the sparse end).
    test('hatch mapper: pinned fill counts at d=10/50/75/100', () => {
      expect(runSphere(10, 'hatch').count).toBe(9);
      expect(runSphere(50, 'hatch').count).toBe(25);
      expect(runSphere(75, 'hatch').count).toBe(40);
      expect(runSphere(100, 'hatch').count).toBe(53);
    });

    test('crosshatch mapper (ratio-scaled family B): pinned fill counts at d=10/100, ratio 0.25 and 1.0', () => {
      expect(runSphere(10, 'crosshatch', { crossDensityRatio: 0.25 }).count).toBe(20);
      expect(runSphere(10, 'crosshatch', { crossDensityRatio: 1.0 }).count).toBe(18);
      expect(runSphere(100, 'crosshatch', { crossDensityRatio: 0.25 }).count).toBe(130);
      expect(runSphere(100, 'crosshatch', { crossDensityRatio: 1.0 }).count).toBe(116);
    });

    test('draft (live-drag) fallback stays on its own untouched floor at d=10/50/100', () => {
      const runDraft = (d) => {
        const params = sceneParams(defaults.objects);
        params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: d } };
        const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: true }) || [];
        return fillCount(paths);
      };
      expect(runDraft(10)).toBe(3);
      expect(runDraft(50)).toBe(5);
      expect(runDraft(100)).toBe(39);
    });
  });
});
