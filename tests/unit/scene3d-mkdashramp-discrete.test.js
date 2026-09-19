/**
 * T3c (round 4, lane fill-audit-a4) — mkDashRamp: bound dash LENGTH at low
 * density so dashes read as discrete marks riding the rulings, not broken
 * rulings (`T3b-review.md` condition 3, `STILL-OPEN.md` W-06b row:
 * "discrete dashes riding rulings at every density, never row-wide tiles").
 *
 * BACKGROUND. T3b (`e60d102e`) made `mkDashRamp` draw a SINGLE pass below
 * `MK_BAND_ONSET_D=35` (Jay decision 12=B) — `pens/marks` dropped from 3.93
 * to 1.00 at d=1, killing the multi-line "tile" bundle. T3b's own reviewer
 * (`T3b-review.md` condition 3) found, and independently quantified, a
 * SECOND, T4-inherited defect that survives: a single PASS can still occupy
 * its own entire PERIOD (`each === sv.P`, "L=P is an unbroken ruling" per
 * `layMark`'s own dissolution-ramp comment), so consecutive dashes ABUT with
 * NO gap and the row reads as a broken/continuous ruling, not a sparse
 * texture of discrete marks — the reviewer's own duty-cycle proxy measured
 * ~94-96% fill of each dash's own "room" at d=1/5/10, "unchanged pre/post
 * T3b" (governed entirely by T4's own `mkAsk`/period mechanism, which T3b
 * never touched). Which half of Jay's phrase this unit gates: "riding
 * rulings" (dashes must sit ON a ruling, unbroken by this unit) is T3/T3b's
 * territory and is NOT re-derived here; "discrete" (a dash must be visually
 * separated from its neighbour by a real gap) is what this unit adds.
 *
 * WHY NOT SCALE `L`/`capOf` UPSTREAM (in `solveAt`) — the first design tried
 * and REJECTED, kept here as the record (`T3c-impl.md` §RED for the full
 * numbers): scaling the BAND cap (`capOf(per) = bandN*per*X`) shrinks `L`,
 * which shrinks `nn` (`Math.ceil(sv.L/sv.P)`) — but `nn` (the number of
 * STACKED parallel passes) is the ONLY thing keeping `tot` (the SUM of ink
 * across all `nn` passes, `place()`'s own `MIN_MARK_MM` survival gate) above
 * the floor at this fixture's many foreshortened, small-local-`P` samples.
 * Scaling the cap by 0.5 dropped sphere/hatch/addLayer d=1 from the pinned
 * 46 marks (`scene3d-mkdashramp-single-pass.test.js` O11) to 34 — a bar
 * change to a file this unit is FORBIDDEN to edit. Capping `each` (the
 * per-pass along-row LENGTH) at `layMark`, strictly AFTER `nn` is already
 * fixed from the untouched `sv.L`, leaves `nn` — and therefore every
 * sample's own survival margin — byte-identical to T3b. Re-derived below:
 * O11's exact `[46,46,62,63,73]` array survives this unit UNCHANGED.
 *
 * THE FIX (`surface-fill.js`, `layMark`'s `law.shape === 'morph'` branch —
 * unique to `mkDashRamp`, see `isWalkedShape`). `MK_DASH_LEN_FRAC = 0.5`
 * bounds a drawn pass to at most half its own period `sv.P` (the classic
 * 50% dash/gap duty convention — the largest fraction that still guarantees
 * a real gap while leaving maximum headroom above `MIN_MARK_MM`), gated to
 * `bandOnsetCap(density) < MK_BAND_MAX_PASSES` — the SAME onset ramp T3b's
 * own gate already uses, NOT the packing-limited `bandN` (which also falls
 * below `MK_BAND_MAX_PASSES` at HIGH density, ~d>=50, for an unrelated
 * reason — `0.90*bandPitch/w`'s own packing floor; gating on `bandN` itself
 * was tried first and leaked the cap into that untouchable territory,
 * corrupting md5 byte-identity at d=50/d=220). A FLOOR
 * (`MIN_MARK_MM * 1.05`) protects any mark that would only clear
 * `MIN_MARK_MM` via a LONGER pass — such a mark is left at its own original
 * (uncut) length rather than pushed under the floor, which is what makes
 * `place()`'s accept/reject outcome provably unchanged from T3b's tree for
 * EVERY sample (not just the pinned fixture — re-derived below on torus and
 * the create rig too, neither of which any existing test pins exactly).
 *
 * MEASURED, sphere/hatch/mkDashRamp, addLayer rig (`T3c-impl.md` full
 * table): average DRAWN LENGTH of dark-third marks (`lastMarkStats.lenByThird[2]
 * / cntByThird[2]`, the only PUBLIC per-mark-length signal `lastMarkStats`
 * exposes for a non-tick law) drops by 37-46% at every density inside the
 * onset ramp, and by EXACTLY 0% (md5-identical geometry) at and above
 * `MK_BAND_ONSET_D`:
 *
 *   d       1      5      10     25     35       50
 *   before  3.329  6.085  5.834  9.585  11.446   8.305
 *   after   1.947  3.706  3.372  5.199  11.446   8.305
 *   ratio   0.585  0.609  0.578  0.542  1.000    1.000
 *
 * Reproduced independently on torus/addLayer (0.529-0.634 inside the ramp,
 * 1.000 at d=35/50) and sphere/create (0.556-0.649 inside the ramp, 1.000 at
 * d=35/50) — not just the one pinned fixture.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// This unit's own base sha — the tree immediately BEFORE T3c's fix landed
// (T2-5, `75777240`, the fill-audit-a4 worktree's own HEAD before this
// unit's edit). An EXPLICIT pin, never `HEAD`.
const T3C_BASE_SHA = '75777240';
const SF_REL_PATH = 'src/core/scene3d/surface-fill.js';

const getPreT3cSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    cached = execFileSync('git', ['show', `${T3C_BASE_SHA}:${SF_REL_PATH}`], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 64,
    }).toString('utf8');
    return cached;
  };
})();

// R4-fix (round-4 merge, 2026-09-19): a SECOND mutant, built from the
// CURRENT disk source (not a stale sha), for the ONE roster entry
// (`mkTick`) that legitimately moved for a reason that has nothing to do
// with T3c — T2-6 (a later, unrelated unit on this SAME lane) added a
// graded-comb mechanism to `mkTick` after `T3C_BASE_SHA` (`75777240`) was
// cut, so comparing CURRENT (T2-6 present) against `getPreT3cSource()` (T2-6
// absent) necessarily disagrees for mkTick regardless of T3c's own health —
// see the byte-identity sweep comment below and `R4-fix-impl.md`. This
// mutant reverts ONLY T3c's own contribution (the `dashOnset`/
// `dashLenFloor`/`dashLenTarget`/`eachDrawn` gate inside `layMark`'s
// `law.shape === 'morph'` branch, immediately after `nn` is fixed) —
// T3b's own onset ramp and T2-6's mkTick comb are both left intact, so this
// reproduces "the merged tree with only T3c's own code reverted," not a
// stale multi-unit snapshot.
const getT3cNeutralizedSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    const src = fs.readFileSync(path.join(rootDir, SF_REL_PATH), 'utf8');
    const needle = '          const dashOnset = bandOnsetCap(opts.fillDensity);\n'
      + '          const dashLenFloor = MIN_MARK_MM * 1.05;\n'
      + '          const dashLenTarget = MK_DASH_LEN_FRAC * sv.P;\n'
      + '          const eachDrawn = (dashOnset < MK_BAND_MAX_PASSES && each > dashLenFloor && each > dashLenTarget)\n'
      + '            ? Math.min(each, Math.max(dashLenFloor, dashLenTarget))\n'
      + '            : each;';
    if (src.indexOf(needle) < 0) {
      throw new Error('getT3cNeutralizedSource: T3c\'s eachDrawn block not found verbatim — '
        + 'source drifted, re-derive this helper against the current tree');
    }
    cached = src.replace(needle, '          const eachDrawn = each;');
    return cached;
  };
})();

const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));

const OTHER_MARK_LAWS = ['mkDotScreen', 'mkTick', 'mkScribble'];
const LADDER_FAMILY = ['ladder'];
const BYTE_IDENTITY_ROSTER = [...OTHER_MARK_LAWS, ...LADDER_FAMILY];

describe('Scene3D.SurfaceFill — mkDashRamp DISCRETE dash length below the onset threshold (T3c)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params;
  let mutantRuntime; let mutantV; let mutantAlgo; let mutantSF;
  let neutralRuntime; let neutralAlgo;

  const buildSceneParams = (toneLaw, mapper, fillDensity, primitive, paramSet) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj', name: 'Obj', primitive, params: clone(paramSet[primitive] || {}),
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = clone(Params.DEFAULT_CAMERA);
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw } }, byObject: {},
    };
    return p;
  };
  const buildAddLayer = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_PARAM_DEFAULTS);
  const buildCreate = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_CREATE_DEFAULTS);

  const avgDarkLen = (stat) => (stat.cntByThird[2] > 0 ? stat.lenByThird[2] / stat.cntByThird[2] : NaN);
  const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;

    mutantRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: getPreT3cSource() },
    });
    mutantV = mutantRuntime.window.Vectura;
    mutantAlgo = mutantV.AlgorithmRegistry.scene3d;
    mutantSF = mutantV.Scene3D.SurfaceFill;

    neutralRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: getT3cNeutralizedSource() },
    });
    neutralAlgo = neutralRuntime.window.Vectura.AlgorithmRegistry.scene3d;
  }, 120000);
  afterAll(() => {
    runtime.cleanup();
    mutantRuntime.cleanup();
    neutralRuntime.cleanup();
  });

  describe('O14 — dash LENGTH bounded inside the onset ramp (sphere/hatch, addLayer rig) — BLOCKING mutation proof', () => {
    test('RED at T3c base sha 75777240: pre-fix average dark-third mark length at d=1 is 3.329mm (unbounded, abutting)', () => {
      const src = getPreT3cSource();
      expect(src.includes('MK_DASH_LEN_FRAC')).toBe(false);
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const avg = avgDarkLen(mutantSF.lastMarkStats);
      expect(avg).toBeCloseTo(3.329, 2);
    });

    test.each([1, 5, 10, 25])('GREEN: d=%i average dark-third mark length drops to <= 70%% of the pre-fix value', (d) => {
      algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
      const after = avgDarkLen(SF.lastMarkStats);
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
      const before = avgDarkLen(mutantSF.lastMarkStats);
      expect(after).toBeLessThanOrEqual(before * 0.70);
      // Non-vacuous: a genuine, measured reduction, not a near-zero drop.
      expect(after).toBeLessThan(before * 0.65);
    });

    test('MUTATION-KILL (blocking): reverting to the pre-T3c mechanism reproduces the unbounded 3.329mm at d=1', () => {
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(avgDarkLen(mutantSF.lastMarkStats)).toBeCloseTo(3.329, 2);
    });

    test('reproduced independently on torus/addLayer (not the pinned fixture)', () => {
      [1, 5, 10, 25].forEach((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        const after = avgDarkLen(SF.lastMarkStats);
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        const before = avgDarkLen(mutantSF.lastMarkStats);
        expect(after).toBeLessThanOrEqual(before * 0.70);
      });
    });

    test('reproduced independently on sphere/create (not the pinned fixture)', () => {
      [1, 5, 10, 25].forEach((d) => {
        algo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const after = avgDarkLen(SF.lastMarkStats);
        mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const before = avgDarkLen(mutantSF.lastMarkStats);
        expect(after).toBeLessThanOrEqual(before * 0.70);
      });
    });
  });

  describe('O15 — non-regression: T3/T3b bars (mark COUNT/O10/O11) survive this unit UNCHANGED', () => {
    // T3b's own O11 (`scene3d-mkdashramp-single-pass.test.js`, NOT edited by
    // this unit) already pins the sphere array exactly; re-derived here
    // too, plus torus and the create rig, which no existing test pins.
    test('sphere/addLayer mark counts at d=1,5,10,25,50 are BYTE-IDENTICAL to the pre-T3c tree', () => {
      const counts = [1, 5, 10, 25, 50].map((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      expect(counts).toEqual([46, 46, 62, 63, 73]);
      const mutCounts = [1, 5, 10, 25, 50].map((d) => {
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return mutantSF.lastMarkStats.marks;
      });
      expect(counts).toEqual(mutCounts);
    });

    test('torus/addLayer mark counts at d=1,5,10,25,50 are BYTE-IDENTICAL to the pre-T3c tree', () => {
      const counts = [1, 5, 10, 25, 50].map((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      const mutCounts = [1, 5, 10, 25, 50].map((d) => {
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        return mutantSF.lastMarkStats.marks;
      });
      expect(counts).toEqual(mutCounts);
    });

    test('sphere/create mark counts at d=1,5,10,25,50 are BYTE-IDENTICAL to the pre-T3c tree', () => {
      const counts = [1, 5, 10, 25, 50].map((d) => {
        algo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      const mutCounts = [1, 5, 10, 25, 50].map((d) => {
        mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return mutantSF.lastMarkStats.marks;
      });
      expect(counts).toEqual(mutCounts);
    });

    test('O10 (T3b): single pass at d=1..4, sphere/hatch, addLayer rig — untouched', () => {
      [1, 2, 3, 4].forEach((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const stat = SF.lastMarkStats;
        expect(stat.bandMax).toBe(1);
        expect(stat.pens).toBe(stat.marks);
      });
    });

    test('T3\'s own bars: >= 40 marks at d=1, and non-decreasing d=1->5->10->25->50 (sphere/torus, addLayer)', () => {
      algo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(SF.lastMarkStats.marks).toBeGreaterThanOrEqual(40);
      ['sphere', 'torus'].forEach((prim) => {
        const counts = [1, 5, 10, 25, 50].map((d) => {
          algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, prim), null, null, BOUNDS);
          return SF.lastMarkStats.marks;
        });
        for (let i = 1; i < counts.length; i += 1) {
          expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        }
      });
    });
  });

  describe('O16 — continuity/non-regression at and above MK_BAND_ONSET_D (d=35, d=50, d=220), both rigs', () => {
    test('sphere/hatch/addLayer: d=35, d=50, d=220 are md5 byte-identical to the pre-T3c tree', () => {
      [35, 50, 220].forEach((d) => {
        const cur = algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const mut = mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        expect(md5(cur)).toBe(md5(mut));
      });
    });

    test('torus/hatch/addLayer: d=35, d=50, d=220 are md5 byte-identical to the pre-T3c tree', () => {
      [35, 50, 220].forEach((d) => {
        const cur = algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        const mut = mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'torus'), null, null, BOUNDS);
        expect(md5(cur)).toBe(md5(mut));
      });
    });

    test('sphere/hatch/create: d=35, d=50, d=220 are md5 byte-identical to the pre-T3c tree', () => {
      [35, 50, 220].forEach((d) => {
        const cur = algo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const mut = mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        expect(md5(cur)).toBe(md5(mut));
      });
    });

    test('average dark-third mark length ratio is EXACTLY 1.0 (not merely close) at d=35 and d=50', () => {
      [35, 50].forEach((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const after = avgDarkLen(SF.lastMarkStats);
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const before = avgDarkLen(mutantSF.lastMarkStats);
        expect(after).toBe(before);
      });
    });

    // T4b/G4's own territory (d=220 ink floor, slab metric) — re-derived
    // independently here, not just by re-running those files unmodified.
    test('T4b\'s own fixture (engine.addLayer insert pipeline, d=220) is unaffected', () => {
      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.getLayerById(groupId);
      engine.getLayerDescendants(groupId)
        .filter((l) => l && l.type === 'sceneGround3d')
        .forEach((l) => engine.removeLayer(l.id));
      group.params.backdrop = { enabled: false };
      const light = engine.layers.find((l) => l.parentId === groupId && l.type === 'sceneLight3d');
      light.params.castShadows = false;
      const object = engine.layers.find((l) => l.parentId === groupId && l.type === 'object3d');
      object.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 220, toneLaw: 'mkDashRamp' } };
      engine.computeAllDisplayGeometry();
      let ink = 0;
      (group.scenePaths || []).forEach((p) => {
        if (!Array.isArray(p)) return;
        for (let i = 1; i < p.length; i += 1) ink += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      });
      // R4-fix (round-4 merge, 2026-09-19): see the identical comment in
      // `scene3d-mkdashramp-single-pass.test.js`'s own "T4b's own fixture"
      // test for the full derivation. Summary: W-32 Rank 4 (`3d-scene/
      // border-4`) refined `scene3d.js`'s silhouette/boundary edge pass
      // AFTER T4b's baseline (1501.0636578167772mm) was measured;
      // `group.scenePaths` sums fill+edge ink together, so the refined
      // silhouette legitimately adds ~0.2035mm here. Re-measured directly on
      // THIS fixture: shipped (refinement live) 1501.2671242469714mm;
      // `window.__SIL_PROTO_OFF` (the refinement's own test-only kill flag)
      // reproduces the OLD 1501.063657816772mm exactly. T3c contributes NONE
      // of this shift — re-confirmed below via `neutralAlgo` (T3c's own
      // dash-length gate reverted, T3b's onset ramp and T2-6's unrelated
      // mkTick comb both left intact): the ink does not move.
      expect(ink).toBeGreaterThan(1400);
      expect(ink).toBeCloseTo(1501.2671242469714, 3);

      const neutralEngine = new neutralRuntime.window.Vectura.VectorEngine();
      const neutralGroupId = neutralEngine.addLayer('scene3d');
      const neutralGroup = neutralEngine.getLayerById(neutralGroupId);
      neutralEngine.getLayerDescendants(neutralGroupId)
        .filter((l) => l && l.type === 'sceneGround3d')
        .forEach((l) => neutralEngine.removeLayer(l.id));
      neutralGroup.params.backdrop = { enabled: false };
      const neutralLight = neutralEngine.layers.find((l) => l.parentId === neutralGroupId && l.type === 'sceneLight3d');
      neutralLight.params.castShadows = false;
      const neutralObject = neutralEngine.layers.find((l) => l.parentId === neutralGroupId && l.type === 'object3d');
      neutralObject.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 220, toneLaw: 'mkDashRamp' } };
      neutralEngine.computeAllDisplayGeometry();
      let neutralInk = 0;
      (neutralGroup.scenePaths || []).forEach((p) => {
        if (!Array.isArray(p)) return;
        for (let i = 1; i < p.length; i += 1) neutralInk += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      });
      expect(neutralInk).toBeCloseTo(ink, 6);
    });
  });

  describe('byte-identity sweep — coverage stated as a fraction (per AGENT-PROTOCOL §0 rule 2)', () => {
    // Reachable roster (100% of it, same convention as T3/T3b's own sweeps):
    // mkDotScreen, mkTick, mkScribble, ladder. The new `dashOnset`/
    // `MK_DASH_LEN_FRAC` logic is only ever read inside `layMark`'s
    // `law.shape === 'morph'` branch, unique to `mkDashRamp` — every other
    // law (including the other mark laws above) never reaches that code
    // path.
    //
    // R4-fix (round-4 merge, 2026-09-19): `mkTick` is compared against
    // `neutralAlgo` (this tree with ONLY T3c's own `eachDrawn` gate
    // reverted; T3b's onset ramp and T2-6's own mkTick comb both intact),
    // NOT `mutantAlgo` (`T3C_BASE_SHA` = `75777240`, which predates T2-6).
    // T2-6, a later, unrelated unit on this SAME lane, added a graded-comb
    // mechanism to `mkTick` after `75777240` was cut; comparing CURRENT
    // (T2-6 present) against `75777240` (T2-6 absent) would fail for mkTick
    // no matter how healthy T3c is — exactly what happened on the round-4
    // merged tree (see `R4-fix-impl.md`). `neutralAlgo` isolates the
    // question this test actually asks — "does T3c's own code leak into
    // mkTick" — independent of T2-6's legitimate, disclosed change; the
    // other three roster members are untouched by T2-6 too, so `mutantAlgo`
    // remains the right comparison for them.
    test.each([...BYTE_IDENTITY_ROSTER])('%s is unaffected at d=1/50/220, sphere/hatch, addLayer rig', (law) => {
      const baseline = law === 'mkTick' ? neutralAlgo : mutantAlgo;
      [1, 50, 220].forEach((d) => {
        const cur = algo.generate(buildAddLayer(law, 'hatch', d, 'sphere'), null, null, BOUNDS);
        const mut = baseline.generate(buildAddLayer(law, 'hatch', d, 'sphere'), null, null, BOUNDS);
        expect(md5(cur)).toBe(md5(mut));
      });
    });
  });
});
