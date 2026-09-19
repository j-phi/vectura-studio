/**
 * T3b (round 4, lane fill-audit-a4, Jay decision 12=B — `SESSION-SUMMARY.md`
 * §4 item 12, verbatim: "T3b, a new unit — draw single-pass dashes below
 * some density threshold, keeping the band mechanism where it earns its
 * keep. The cost is a new threshold to justify and another mode boundary in
 * a file that already has several.").
 *
 * BACKGROUND. T4 restored `mkDashRamp`'s dark-end ink by capping its
 * dissolution-ramp band at a WIDTH (`MK_BAND_MAX_PASSES = 6` parallel
 * passes), not a length — this is what let d=220 reach Jay's >=1500mm bar
 * (`T4-impl.md`). T3 then floored the SPARSE end's row coverage so d=1 draws
 * >=40 dashes instead of 7 (`T3-impl.md`, O6/O7). T3's own reviewer found
 * (`T3-review.md` condition 2, quantified): at d=1, sphere/hatch, pens per
 * mark is 3.93 (was 5.71 pre-T3, i.e. T3 already REDUCED the bundling on the
 * way past) — but every "dash" at that density is still a bundle of several
 * simultaneous parallel passes, which is what reads as a thick tile rather
 * than a single-stroke dash. This is T4's OWN band-pass mechanism (Jay's own
 * decision 1=B), not anything T3 introduced or worsened — `SESSION-SUMMARY.md`
 * §4 item 12 says so explicitly, and offers exactly this unit as option (B).
 *
 * MEASURED FIRST (see `T3b-impl.md` for the full sweep). Passes per mark
 * (sphere/hatch/mkDashRamp, addLayer rig): d=1 3.93, d=5 3.93, d=10 3.58,
 * d=25 3.37, d=50 2.12, d=100 1.00, d=220 1.00 — bandMax stays pinned to the
 * hard MK_BAND_MAX_PASSES=6 ceiling for EVERY density from 1 through 35 (on
 * all four of {sphere,torus} x {addLayer,create}), only starting to decline
 * on its own past that point, and does not reach 1 (single pass) naturally
 * until d~=80-90. A hypothetical single-pass-only render (forcing
 * MK_BAND_MAX_PASSES=1 globally) loses 34-76% of the object's own total ink
 * relative to the band-enabled render at every density from 1 through ~70 —
 * the band is genuinely load-bearing there, not decorative; it stops
 * mattering (0% ink delta) only once density reaches ~80, where `bandPitch`
 * itself becomes too fine for a 2nd parallel pass to fit at all (a PACKING
 * limit, not a tone one).
 *
 * T4's own O8 guard (`scene3d-mark-laws-draw.test.js`, unmodified by this
 * unit) already pins `bandMax >= 2` AT d=50, sphere/hatch — accepted,
 * unmodified evidence that a multi-pass bundle at d=50 ("med") is NOT the
 * "tile" Jay flagged; the complaint (`after/T3/`, decision 12's own text) is
 * about d=1 specifically. This means ANY density threshold this unit picks
 * MUST sit strictly below 50 (O8 is out of this unit's ALLOWED file scope —
 * it is not touched), and given the 34-76% figure above, forcing a single
 * hard on/off switch anywhere below 50 costs a real, measured step in ink
 * far larger than ordinary density-to-density drift (which this fixture's
 * own UNMODIFIED baseline shows is a few percent between adjacent integers).
 *
 * THE FIX (`surface-fill.js`, gated to `law.shape === 'morph'`, i.e. ONLY
 * `mkDashRamp` — see `bandOnsetCap` there for the full derivation comment):
 * a RAMP, not a single cliff. `bandOnsetCap(density)` is `1` at d=1 and
 * increases by exactly one integer pass at a time up to the full
 * `MK_BAND_MAX_PASSES` (6) by `MK_BAND_ONSET_D = 35` — MEASURED, not a round
 * number picked for its own sake: 35 is the LAST integer density at which
 * the UNGATED mechanism already sat at its hard 6-pass ceiling on every one
 * of {sphere, torus} x {addLayer, create} (three of the four combinations
 * had already dropped to 5 by d=36). At and above `MK_BAND_ONSET_D` this
 * gate is a byte-identical no-op (`bandOnsetCap(d) === MK_BAND_MAX_PASSES`),
 * which is what keeps O8 (d=50) and T4b/G4's d=220 floor untouched without
 * editing either of those files — confirmed below both by direct
 * reproduction of this fixture and by running those files unmodified.
 *
 * WHICH HALF OF JAY'S RULE EACH BAR GATES (per AGENT-PROTOCOL §0 rule 1,
 * blocking, mutation-proved below):
 *   - O10 ("single-pass at the sparse end") gates ONLY the "draw single-pass
 *     dashes below some density threshold" half. It says nothing about dash
 *     count or monotonicity.
 *   - O11 ("count/monotonicity preserved") gates ONLY the "T3's own bars
 *     still hold" half (mark PLACEMENT COUNT is architecturally independent
 *     of `bandN` — see the comment on O11 below for why). It says nothing
 *     about how many passes a placed mark draws.
 *   - O12 ("continuity at the threshold") gates the "keeping the band
 *     mechanism where it earns its keep" half, at the ONE density
 *     (`MK_BAND_ONSET_D`) where the gate itself starts/stops applying.
 *   - O13 ("d=220 / d=50 untouched") gates "no regression on T4/T4b/O8's own
 *     territory" — a non-regression check, not a new half of Jay's rule.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// This unit's own base sha — the tree immediately BEFORE T3b's fix landed
// (round 3 CLOSED, merged, gallery rebuilt; the fill-audit-a4 worktree's own
// HEAD before any T3b edit). An EXPLICIT pin, never `HEAD` (T2-3's own
// `git show HEAD:` self-test went silently RED once `HEAD` moved past its
// own fix — `T2-3-review.md`).
const T3B_BASE_SHA = 'b43fa4e3';
const SF_REL_PATH = 'src/core/scene3d/surface-fill.js';

const getPreT3bSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    cached = execFileSync('git', ['show', `${T3B_BASE_SHA}:${SF_REL_PATH}`], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 64,
    }).toString('utf8');
    return cached;
  };
})();

// R4-fix (round-4 merge, 2026-09-19): a SECOND mutant, built from the
// CURRENT disk source (not a stale sha), for the ONE roster entry
// (`mkTick`) that legitimately moved for a reason that has nothing to do
// with T3b — T2-6 (a later, unrelated unit on this SAME lane) added a
// graded-comb mechanism to `mkTick` after `T3B_BASE_SHA` was cut, so
// comparing CURRENT (T2-6 present) against `getPreT3bSource()` (T2-6 absent)
// necessarily disagrees for mkTick regardless of T3b's own health — see the
// file's own byte-identity sweep comment and `R4-fix-impl.md`. `bandOnsetCap`
// is read at exactly THREE call sites, all inside `law.shape === 'morph'`
// branches (`solveAt`'s and `layMark`'s `bandN`, `layMark`'s `dashOnset`) —
// unique to `mkDashRamp`, confirmed by grep — so redirecting all three calls
// to the constant `MK_BAND_MAX_PASSES` neutralizes T3b's onset ramp AND
// T3c's dash-length gate (`dashOnset < MK_BAND_MAX_PASSES` becomes always
// false) while leaving every OTHER law's code, including T2-6's mkTick
// comb, byte-for-byte untouched. This reproduces "the merged tree's own
// pre-T3b/pre-T3c state" without a stale git ref.
const getT3bT3cNeutralizedSource = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    const src = fs.readFileSync(path.join(rootDir, SF_REL_PATH), 'utf8');
    const needle = 'bandOnsetCap(opts.fillDensity)';
    const count = src.split(needle).length - 1;
    if (count !== 3) {
      throw new Error(`getT3bT3cNeutralizedSource: expected exactly 3 call sites of "${needle}", `
        + `found ${count} — source drifted, re-derive this helper against the current tree`);
    }
    cached = src.split(needle).join('MK_BAND_MAX_PASSES');
    return cached;
  };
})();

const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));

// Reachable roster (same convention as T3's own sweep, `scene3d-mkdashramp-low-end.test.js`):
// only 4 of the 12 raw `MARK_LAWS` internal shapes are members of the current
// `Vectura.SCENE3D_TONE_LAWS` roster — the other 8 fall back to `ladder` and
// would silently re-test it under a false label if included.
const OTHER_MARK_LAWS = ['mkDotScreen', 'mkTick', 'mkScribble'];
const LADDER_FAMILY = ['ladder'];
const BYTE_IDENTITY_ROSTER = [...OTHER_MARK_LAWS, ...LADDER_FAMILY];

describe('Scene3D.SurfaceFill — mkDashRamp SINGLE-PASS below a density threshold (T3b, Jay decision 12=B)', () => {
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

  const totalInk = (paths) => {
    let ink = 0;
    paths.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) ink += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    });
    return ink;
  };
  const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;

    mutantRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: getPreT3bSource() },
    });
    mutantV = mutantRuntime.window.Vectura;
    mutantAlgo = mutantV.AlgorithmRegistry.scene3d;
    mutantSF = mutantV.Scene3D.SurfaceFill;

    neutralRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: getT3bT3cNeutralizedSource() },
    });
    neutralAlgo = neutralRuntime.window.Vectura.AlgorithmRegistry.scene3d;
  }, 120000);
  afterAll(() => {
    runtime.cleanup();
    mutantRuntime.cleanup();
    neutralRuntime.cleanup();
  });

  describe('O10 — single pass at the sparse end (sphere/hatch, addLayer rig)', () => {
    test('RED at T3b base sha: pre-fix pens-per-mark at d=1 is 3.93 (multi-pass bundle), not 1', () => {
      const src = getPreT3bSource();
      expect(src.includes('bandOnsetCap')).toBe(false);
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const stat = mutantSF.lastMarkStats;
      const pensPerMark = stat.pens / stat.marks;
      expect(pensPerMark).toBeCloseTo(3.9347826086956523, 6);
      expect(pensPerMark).toBeGreaterThan(1);
    });

    test('GREEN: current tree draws exactly 1 pass per mark for d=1..4, sphere/hatch, addLayer rig', () => {
      [1, 2, 3, 4].forEach((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        const stat = SF.lastMarkStats;
        expect(stat.bandMax).toBe(1);
        expect(stat.pens).toBe(stat.marks);
      });
    });

    test('GREEN: same holds on torus and on the create rig at d=1', () => {
      algo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'torus'), null, null, BOUNDS);
      expect(SF.lastMarkStats.bandMax).toBe(1);
      algo.generate(buildCreate('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(SF.lastMarkStats.bandMax).toBe(1);
      algo.generate(buildCreate('mkDashRamp', 'hatch', 1, 'torus'), null, null, BOUNDS);
      expect(SF.lastMarkStats.bandMax).toBe(1);
    });

    test('MUTATION-KILL (blocking): reverting to the pre-T3b mechanism reproduces bandMax=6 / pens-per-mark=3.93 at d=1', () => {
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const stat = mutantSF.lastMarkStats;
      expect(stat.bandMax).toBe(6);
      expect(stat.pens / stat.marks).toBeCloseTo(3.9347826086956523, 6);
    });
  });

  describe('O11 — T3\'s own bars (dash COUNT and monotonicity) still hold (sphere/torus/hatch, addLayer rig)', () => {
    // Mark PLACEMENT (the `marks` counter) is architecturally independent of
    // `bandN`: `layMark` is invoked once per surviving row/site regardless
    // of how many parallel passes it draws (`solveAt`/`layMark`'s `bandN`
    // only changes `capOf`'s cap on `L`, i.e. how much ink ONE placed mark
    // carries, never whether a mark is placed). This is why O10 and O11 are
    // independent halves per AGENT-PROTOCOL §0 rule 1: gating passes cannot,
    // by construction, un-gate T3's count bar.
    test('sphere: >= 40 marks at d=1 (T3\'s O6 bar), unaffected', () => {
      algo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(SF.lastMarkStats.marks).toBeGreaterThanOrEqual(40);
    });

    test.each(['sphere', 'torus'])('%s: mark count is non-decreasing d=1->5->10->25->50 (T3\'s O7 bar), unaffected', (prim) => {
      const counts = [1, 5, 10, 25, 50].map((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, prim), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      for (let i = 1; i < counts.length; i += 1) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
      }
    });

    // Disclosed (not hidden — `## Bars changed` in T3b-impl.md): mark COUNT
    // can shift by a small amount even though `marks` doesn't depend on
    // `bandN` directly, because a shorter capped `L` changes the walked
    // mark's own footprint, which can change whether a LATER candidate site
    // reads as "too close" to an earlier one (`blocked()`'s exclusion disc).
    // Measured: torus/addLayer/d=1 goes 37 -> 38 (a gain, not a loss) —
    // still monotone, does not touch T3's own bar (which never pinned an
    // exact torus count; T3-impl.md itself calls torus "a secondary check,
    // not gated to 40").
    test('sphere mark counts at d=1..50 are byte-identical to T3\'s own tree (bandN never gates placement)', () => {
      const counts = [1, 5, 10, 25, 50].map((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      expect(counts).toEqual([46, 46, 62, 63, 73]);
    });
  });

  describe('O12 — continuity at the threshold (MK_BAND_ONSET_D), both rigs, sphere/hatch', () => {
    // "Continuous in ink" is evaluated AT the one density where the gate
    // itself starts/stops applying (35) — the ONLY place a discontinuity
    // attributable to THIS unit's own mechanism could appear. On either
    // side of it `bandOnsetCap` returns the SAME value (6, unrestricted),
    // so any residual delta is ordinary per-density noise already present
    // in the unmodified baseline (confirmed by the mutant-tree comparison).
    test('addLayer rig: ink at d=34 and d=35 differs only by ordinary per-density noise (<2%), and matches the pre-T3b tree', () => {
      const at34 = totalInk(algo.generate(buildAddLayer('mkDashRamp', 'hatch', 34, 'sphere'), null, null, BOUNDS));
      const at35 = totalInk(algo.generate(buildAddLayer('mkDashRamp', 'hatch', 35, 'sphere'), null, null, BOUNDS));
      const stepPct = Math.abs(at35 - at34) / at34 * 100;
      expect(stepPct).toBeLessThan(2);

      const mutantAt34 = totalInk(mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 34, 'sphere'), null, null, BOUNDS));
      const mutantAt35 = totalInk(mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 35, 'sphere'), null, null, BOUNDS));
      expect(at34).toBeCloseTo(mutantAt34, 1);
      expect(at35).toBeCloseTo(mutantAt35, 1);
    });

    test('create rig: same', () => {
      const at34 = totalInk(algo.generate(buildCreate('mkDashRamp', 'hatch', 34, 'sphere'), null, null, BOUNDS));
      const at35 = totalInk(algo.generate(buildCreate('mkDashRamp', 'hatch', 35, 'sphere'), null, null, BOUNDS));
      const stepPct = Math.abs(at35 - at34) / at34 * 100;
      expect(stepPct).toBeLessThan(2);
    });

    // Disclosed honestly (AGENT-PROTOCOL "stop-and-report beats a fudge"),
    // not hidden: WITHIN the gated zone (d<35) the ramp's own individual
    // integer-pass steps are NOT all sub-drift-envelope — the largest single
    // step (addLayer & create rigs, sphere, d=4->5, the 1-pass->2-pass
    // transition) measures 59-76%, because `capOf`'s cap scales linearly
    // with pass count (`bandN*P`) and the tone solve is capacity-starved at
    // every density this fixture reaches below ~70 (see the header comment).
    // This is inherent to ANY discrete integer-pass mechanism gated below
    // 50 (O8's own pinned checkpoint) — a hard on/off switch would cost the
    // SAME ~34-76% in one single cliff instead of several smaller steps.
    // Recorded here as a fingerprint so a future change that makes this
    // WORSE (a bigger single-step spike) is caught, not to claim the step is
    // small.
    test('the largest single ramp step (addLayer rig, sphere, d=4->5) is <= 80% — a fingerprint, not a smallness claim', () => {
      const at4 = totalInk(algo.generate(buildAddLayer('mkDashRamp', 'hatch', 4, 'sphere'), null, null, BOUNDS));
      const at5 = totalInk(algo.generate(buildAddLayer('mkDashRamp', 'hatch', 5, 'sphere'), null, null, BOUNDS));
      const stepPct = (at5 - at4) / at4 * 100;
      expect(stepPct).toBeGreaterThan(40); // it IS a real step — not vacuously near-zero
      expect(stepPct).toBeLessThanOrEqual(80);
    });
  });

  describe('O13 — non-regression: O8 (d=50) and T4b/G4 (d=220) territory untouched', () => {
    test('sphere/hatch/mkDashRamp at d=50 (O8\'s own checkpoint) is byte-identical to the pre-T3b tree, addLayer rig', () => {
      const cur = algo.generate(buildAddLayer('mkDashRamp', 'hatch', 50, 'sphere'), null, null, BOUNDS);
      const curStat = SF.lastMarkStats;
      const mut = mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 50, 'sphere'), null, null, BOUNDS);
      const mutStat = mutantSF.lastMarkStats;
      expect(md5(cur)).toBe(md5(mut));
      expect(curStat.bandMax).toBe(mutStat.bandMax);
      expect(curStat.bandMax).toBeGreaterThanOrEqual(2); // O8's own bar, re-derived here
    });

    test('sphere/hatch/mkDashRamp at d=50, create rig — byte-identical to the pre-T3b tree', () => {
      const cur = algo.generate(buildCreate('mkDashRamp', 'hatch', 50, 'sphere'), null, null, BOUNDS);
      const mut = mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', 50, 'sphere'), null, null, BOUNDS);
      expect(md5(cur)).toBe(md5(mut));
    });

    test.each(['sphere', 'torus'])('%s/hatch/mkDashRamp at d=220 — byte-identical to the pre-T3b tree, BOTH rigs', (prim) => {
      const curA = algo.generate(buildAddLayer('mkDashRamp', 'hatch', 220, prim), null, null, BOUNDS);
      const mutA = mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 220, prim), null, null, BOUNDS);
      expect(md5(curA)).toBe(md5(mutA));
      const curC = algo.generate(buildCreate('mkDashRamp', 'hatch', 220, prim), null, null, BOUNDS);
      const mutC = mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', 220, prim), null, null, BOUNDS);
      expect(md5(curC)).toBe(md5(mutC));
    });

    // The literal cell T4b's own CI guard measures (engine.addLayer('scene3d')
    // insert pipeline, create-defaults sphere, d=220) is untouched — verified
    // independently here (not just by re-running that file's own test).
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
      // R4-fix (round-4 merge, 2026-09-19): T4b-impl.md's own baseline
      // (1501.0636578167772mm) was measured pre-merge, before W-32 Rank 4
      // (`3d-scene/border-4`) landed a silhouette/boundary edge refinement in
      // `scene3d.js`. `group.scenePaths` sums fill AND edge ink together
      // (same convention T4b's own fixture always used), so the refined
      // silhouette legitimately adds ink here. Measured directly on THIS
      // fixture (not just cited from another unit's report): with the
      // refinement live (shipped) the ink is 1501.2671242469714mm; toggling
      // the test-only `window.__SIL_PROTO_OFF` flag (`scene3d.js`'s own
      // `SIL_PROTO_ON()` gate) OFF reproduces the OLD 1501.063657816772mm
      // exactly — a delta of 0.2034664301943394mm, matching
      // `MERGE-review-r4.md`'s independently-bisected number to 13
      // significant digits. T3b/T3c contribute NONE of this: `bandOnsetCap`
      // is a no-op at d=220 by construction (`bandOnsetCap(220) ===
      // MK_BAND_MAX_PASSES`), confirmed below by re-measuring this exact
      // fixture through `neutralAlgo` (T3b/T3c's own onset-ramp/dash-length
      // code reverted, T2-6's unrelated mkTick comb and W-32r4's edge
      // refinement both left intact) — the ink does not move.
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
      // T3b/T3c reverted (onset ramp + dash-length gate neutralized): ink is
      // UNCHANGED from the shipped tree — the shift above is entirely W-32r4's.
      expect(neutralInk).toBeCloseTo(ink, 6);
    });
  });

  describe('byte-identity sweep — coverage stated as a fraction (per AGENT-PROTOCOL §0 rule 2)', () => {
    // Reachable roster (100% of it, same convention as T3's own sweep):
    // mkDotScreen, mkTick, mkScribble, ladder. `bandN`/`bandOnsetCap` are
    // only ever READ inside the `law.shape === 'morph'` branches of
    // `solveAt`/`layMark`, which is unique to `mkDashRamp` — every other law
    // (including the other mark laws above) never reaches that code path.
    //
    // R4-fix (round-4 merge, 2026-09-19): `mkTick` is compared against
    // `neutralAlgo` (this tree with T3b/T3c's onset-ramp/dash-length code
    // reverted, everything else — including T2-6's own mkTick comb —
    // intact), NOT `mutantAlgo` (`T3B_BASE_SHA` = `b43fa4e3`). T2-6, a
    // later, unrelated unit on this SAME lane, added a graded-comb mechanism
    // to `mkTick` after `b43fa4e3` was cut; comparing CURRENT (T2-6 present)
    // against `b43fa4e3` (T2-6 absent) would fail for mkTick no matter how
    // healthy T3b/T3c are, which is exactly what happened on the round-4
    // merged tree (see `R4-fix-impl.md`). `neutralAlgo` isolates the
    // question this test actually asks — "does T3b/T3c's own code leak into
    // mkTick" — independent of T2-6's legitimate, disclosed change; the
    // other three roster members are untouched by T2-6 too, so `mutantAlgo`
    // remains the right comparison for them (unaffected by this switch).
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
