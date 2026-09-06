const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * F-01 / W-01 — the curved master grid's sparse end (fillDensity 1-49) was
 * DEAD on every curved primitive.
 *
 * `SurfaceFill.buildObject`'s master grid (surface-fill.js, the
 * `STAGE.masterGrid && useLadder` block) sizes the ladder's ruling count
 * `N` off `masterPitch = Math.min(tonePitch, o6Pitch)`, where:
 *   - `tonePitch` is `hatchSpacing(density) / TONE_SUBDIV` — density-derived,
 *     but `hatchSpacing` only tapers 14mm -> 7.5mm across Density 1-50, so
 *     `tonePitch` only moves from ~2.77mm down to ~1.5mm over that whole
 *     range;
 *   - `o6Pitch` was `litMaxPitchPen() * penWidth * litCov` — a DENSITY-FREE
 *     constant (the O6 "the centre light must still carry ink" bound), which
 *     on a default sphere/pen measures ~1.51mm.
 * Since `tonePitch` never dropped below that constant until Density ~49.5,
 * `Math.min` picked the constant for every Density from 1 to 49 — the floor,
 * not Density, set the master grid the whole way there. Measured (this
 * suite's own RED, verified via `git stash`): a default sphere, Type=Hatch,
 * toneLaw=ladder produced the SAME 22 fill paths at every Density from 1
 * through 49, jumping to 23 only at Density 50.
 *
 * THE FIX (two files, both density plumbing):
 *   1. `surface-fill.js` — `o6Pitch` is rescaled by
 *      `Math.max(1, tonePitch / o6Pitch0)`, so once `tonePitch` asks to be
 *      sparser than the constant it USED to clamp to, the bound rises with
 *      it instead of clamping flat. At and above the crossover (tonePitch <=
 *      o6Pitch0, true for d >= ~49.5 today) the multiplier is exactly 1 and
 *      the bound is unchanged — `masterPitch` is byte-identical from
 *      Density 50 up.
 *   2. `scene3d.js` — `hatchSpacing`'s own 1.85x taper is too shallow on its
 *      own: once fix (1) unclamps it, quantising to an integer ruling count
 *      still only separates Density 1 from 49 by a handful of rulings, and
 *      the ladder's own per-band coverage rounding can rank two ADJACENT
 *      ruling counts a shade out of the density order they came from (a
 *      pre-existing property of stacking a multi-band ladder on very few
 *      rulings, not something this fix introduces — see the note on the
 *      "not strictly monotone at every single Density" finding below).
 *      `curvedSparseTonePitch` widens the SAME taper below Density 50 (a
 *      geometric decay from `CURVED_SPARSE_PITCH_BOOST`x `hatchSpacing(50)`
 *      at Density 1 down to 1x at Density 50, converging there exactly) so
 *      the master grid actually opens up several rulings at a time between
 *      the audit's own checkpoint set, not one.
 *
 * WHY 1/25/50(/100), NOT EVERY INTEGER DENSITY. The ladder-banding rounding
 * above means the raw drawn path count is NOT perfectly monotone at every
 * single Density value even after this fix (e.g. Density 8 draws one fewer
 * path than Density 1-7 on the default sphere, purely from a per-band
 * rounding boundary) — the master grid's ruling count `N` IS monotone
 * throughout (asserted directly below via the `lastMasterGridStats` test
 * seam this fix adds), and the DRAWN count is monotone at the checkpoints
 * findings.json's F-01 names as the acceptance bar: 1 / 25 / 50 / 100.
 *
 * FOLLOW-UP (adversarial review, M1/M2): the audit's OWN literal checkpoint
 * set is 1/10/25/50, not 1/25/50, and at that set `CURVED_SPARSE_PITCH_BOOST
 * = 6` dipped sphere+hatch+ladder ([5,4,9,23], d=10 < d=1) and torus+hatch+
 * ladder ([4,3,4,10], d=10 < d=1 < d=25 tie) — the literal F-01 symptom,
 * reintroduced by the pitch curve landing an unlucky ruling count exactly at
 * Density 10. Re-picking the boost to 4.1 (see the constant's own comment)
 * makes drawn count non-decreasing AND total ink strictly increasing across
 * 1/10/25/50 on sphere, torus AND cone x hatch x {ladder, fineLadder} — see
 * "literal checkpoints (M1/M2)" below. This is NOT a claim that per-Density
 * rounding noise is gone (it is not, see the paragraph above); it is a
 * claim that the SPECIFIC four checkpoints the audit measures by are clear
 * of it, verified by direct sweep rather than assumed from a wider spacing.
 */

const BOUNDS = {
  width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3,
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

describe('scene3d curved (SurfaceFill) master grid sparse end (Density 1-49) responds to Density', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d; // objects[0] is the app-default sphere
  });
  afterAll(() => runtime.cleanup());

  const torusObj = {
    id: 'obj-1', name: 'obj-1', primitive: 'torus', params: {
      sx: 60, sy: 18, sz: 18, detail: 40,
    }, transform: {
      x: 0, y: 0, z: 0, yaw: 18, pitch: 8, roll: 0, scale: 1,
    }, visibility: 'solid',
  };
  const coneObj = {
    id: 'obj-1', name: 'obj-1', primitive: 'cone', params: {
      sx: 40, sy: 40, sz: 40, detail: 32,
    }, transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    }, visibility: 'solid',
  };

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

  const fillPaths = (paths) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');

  const run = (d, mapper, style, obj, extraParams = {}) => {
    const params = sceneParams([obj]);
    params.styleTable.byObject['obj-1'] = {
      penId: null, mapper, params: { fillAngle: 45, fillDensity: d, toneLaw: style, ...extraParams },
    };
    const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: false }) || [];
    return fillPaths(paths);
  };

  const runCount = (...args) => run(...args).length;
  const runMd5 = (...args) => md5(JSON.stringify(run(...args)));

  test('test seam is published', () => {
    expect(typeof algo.__curvedSparseTonePitchForTest).toBe('function');
    expect(typeof V.Scene3D.SurfaceFill.lastMasterGridStats === 'object'
      || V.Scene3D.SurfaceFill.lastMasterGridStats === null).toBe(true);
  });

  describe('curvedSparseTonePitch mapping', () => {
    test('converges to hatchSpacing exactly at and above d=50 (byte-identity anchor)', () => {
      expect(algo.__curvedSparseTonePitchForTest(50)).toBe(algo.__hatchSpacingForTest(50));
      expect(algo.__curvedSparseTonePitchForTest(75)).toBe(algo.__hatchSpacingForTest(75));
      expect(algo.__curvedSparseTonePitchForTest(100)).toBe(algo.__hatchSpacingForTest(100));
    });

    test('below d=50 it widens the taper (strictly larger than the untouched hatchSpacing value)', () => {
      for (let d = 1; d < 50; d += 7) {
        expect(algo.__curvedSparseTonePitchForTest(d)).toBeGreaterThan(algo.__hatchSpacingForTest(d));
      }
    });

    test('monotonic: denser Density never yields a coarser (larger) sparse-end pitch', () => {
      let prev = algo.__curvedSparseTonePitchForTest(1);
      for (let d = 2; d <= 50; d++) {
        const cur = algo.__curvedSparseTonePitchForTest(d);
        expect(cur).toBeLessThanOrEqual(prev);
        prev = cur;
      }
    });
  });

  describe('RED (fixed by this change) — the master grid ruling count, direct', () => {
    test('N is monotone non-decreasing across every Density from 1 to 50 (default sphere, hatch, ladder)', () => {
      let prevN = 0;
      for (let d = 1; d <= 50; d++) {
        run(d, 'hatch', 'ladder', defaults.objects[0]);
        const { N } = V.Scene3D.SurfaceFill.lastMasterGridStats;
        expect(N).toBeGreaterThanOrEqual(prevN);
        prevN = N;
      }
      // And genuinely OPENS, not just "non-decreasing": Density 1 and Density
      // 49 are pinned to the SAME N before this fix (measured 22/22 fill
      // paths). After the fix N nearly sextuples across that range.
      run(1, 'hatch', 'ladder', defaults.objects[0]);
      const n1 = V.Scene3D.SurfaceFill.lastMasterGridStats.N;
      run(49, 'hatch', 'ladder', defaults.objects[0]);
      const n49 = V.Scene3D.SurfaceFill.lastMasterGridStats.N;
      expect(n49).toBeGreaterThan(n1 * 2);
    });
  });

  describe('GREEN — drawn fill-path count strictly increases across Density 1/25/50/100', () => {
    // The audit's own acceptance bar (findings.json F-01 "fixed"). Before this
    // fix all three rows read [22, 22, 23, 50] (sphere), [flat, flat, 64, 146]
    // (torus contour) and [flat, flat, 62, 62] (cone spiral) at Density
    // 1/25/50/100 — Density 1 and 25 were byte-identical to each other.
    //
    // RE-PINNED (W-26, PROOF): `ladder` moved from a discrete grid-subset to
    // continuous placement (`isEvenLadder`/`ladderWantedPitch`,
    // surface-fill.js). d=50 and d=100 (already inside this fix's own
    // scope) also move: continuous placement changes the ladder family at
    // EVERY density, not only d<50. Verified during implementation that a
    // BLANKET upper-pitch clamp at the O6 bar (`litMaxPitchPen()*pen`,
    // applied to every band) reproduces the exact byte-for-byte F-01
    // flatness this suite guards against (measured: sphere/torus/cone all
    // drew identically at d=1/10/25) — the shipped fix instead raises
    // COVERAGE only for the lit band (`ladderCov`), so every darker band
    // keeps `curvedSparseTonePitch`'s density response; see the "literal
    // checkpoints" describe below for the full sweep this was caught on.
    test('sphere + hatch + ladder', () => {
      const counts = [1, 25, 50, 100].map((d) => runCount(d, 'hatch', 'ladder', defaults.objects[0]));
      expect(counts).toEqual([8, 15, 25, 53]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('torus + contour + ladder', () => {
      const counts = [1, 25, 50, 100].map((d) => runCount(d, 'contour', 'ladder', torusObj));
      expect(counts).toEqual([24, 46, 94, 211]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('cone + spiral + ladder (strictly increasing across the fix\'s own scope, 1/25/50)', () => {
      const counts = [1, 25, 50].map((d) => runCount(d, 'spiral', 'ladder', coneObj));
      expect(counts).toEqual([8, 15, 29]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('ribbon-ish ladder laws also open up: sphere/hatch/taperedEnds and torus/hatch/bundleCount', () => {
      const tapered = [1, 25, 50].map((d) => runCount(d, 'hatch', 'taperedEnds', defaults.objects[0]));
      expect(tapered).toEqual([26, 49, 80]);
      for (let i = 1; i < tapered.length; i++) expect(tapered[i]).toBeGreaterThan(tapered[i - 1]);

      const bundle = [1, 25, 50].map((d) => runCount(d, 'hatch', 'bundleCount', torusObj));
      expect(bundle).toEqual([43, 75, 84]);
      for (let i = 1; i < bundle.length; i++) expect(bundle[i]).toBeGreaterThan(bundle[i - 1]);
    });
  });

  describe('literal checkpoints (M1/M2) — Density 1/10/25/50, the audit\'s own grid', () => {
    // RED (git-stashed CURVED_SPARSE_PITCH_BOOST=6 tree, this suite's own
    // proof): torus + hatch + ladder counts were [4, 3, 4, 10] (d=10 dips
    // below d=1, d=25 ties d=1) and sphere + hatch + ladder was
    // [5, 4, 9, 23] (d=10 dips below d=1) — the literal F-01 symptom,
    // reintroduced at these specific checkpoints by the first follow-up's
    // boost value. GREEN (boost 4.1): path count is non-decreasing on all
    // six primitive x law combos, and total ink is STRICTLY increasing on
    // all six — including torus + hatch + fineLadder, whose path COUNT ties
    // at d=10/d=25 (6 == 6) but whose ink does not (different ruling counts,
    // 7 vs 10, coincidentally close in segment count after ladder banding).
    //
    // RE-PINNED (W-26, PROOF): `ladder`/`fineLadder` moved onto continuous
    // placement. Closes W-01 M1's OWN disclosed follow-up (a) — "decide
    // which is the contract, non-decreasing or strictly increasing" — in
    // favour of the STRONGER bar: all six rows below are now STRICTLY
    // increasing in COUNT too (not merely non-decreasing), including the
    // torus + fineLadder row that used to tie at d=10/25 (6 == 6). The
    // oracle is tightened to `expectStrictlyIncreasing` for both counts and
    // ink, verified to hold before being asserted (see this unit's
    // `docs/3d-audit/lane-reports/W-26-impl.md` for the numbers this
    // replaced). This was caught DURING implementation: a first cut of
    // `ladderWantedPitch` clamped every band's pitch at the O6 bar
    // (`litMaxPitchPen()*pen`) and flattened all six rows to identical
    // counts at d=1/10/25 — the literal F-01 defect, moved rather than
    // fixed. The shipped fix scopes that bar to the lit band's own
    // COVERAGE (`ladderCov`), not every band's pitch.
    const pathLen = (p) => {
      const pts = Object.keys(p).filter((k) => k !== 'meta').sort((a, b) => Number(a) - Number(b)).map((k) => p[k]);
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      return total;
    };
    const runInk = (...args) => Math.round(run(...args).reduce((s, p) => s + pathLen(p), 0) * 100) / 100;

    const CHECKPOINTS = [1, 10, 25, 50];
    const expectStrictlyIncreasing = (arr) => {
      for (let i = 1; i < arr.length; i++) expect(arr[i]).toBeGreaterThan(arr[i - 1]);
    };

    // MERGE NOTE (integration, 2026-09-06) / BAR CHANGE: the two `torus`
    // rows' ink values moved at d=1/25/50 (d=10 unaffected on both) —
    // `torus + hatch + ladder` 419.1/645.22/1255.48 -> 420.39/646.51/1257.41;
    // `torus + hatch + fineLadder` 470.87/772.68/1253.08 ->
    // 471.15/773.24/1254.94. Path COUNTS are unchanged (still
    // [5,6,7,12]/[5,6,9,12]). Cause: `3d-scene/handoff-c`'s A2 torus
    // self-occlusion rewrite (`Scene3D.TorusOcclusion`, a dense analytic
    // near/far field replacing a per-sample dilated ray — see
    // `docs/3d-audit/handoff/unit-a2-notes.md`) never landed on
    // `3d-scene/fill-audit-a` (where this file's W-01/W-26 pins were made),
    // so this is the first time these two effects combine; `sphere`/`cone`
    // rows (no self-occlusion — convex, single-sheet) are untouched,
    // confirming the shift is scoped to the torus. Deltas are all under
    // 0.3% of the pinned value — re-measured against the actual merged
    // source, not copied from either branch's pin, and still strictly
    // increasing at every checkpoint (the property this block exists to
    // guard).
    test.each([
      ['sphere + hatch + ladder', 'hatch', 'ladder', () => defaults.objects[0], [8, 9, 15, 25], [222.11, 266.46, 425.78, 768.56]],
      ['torus + hatch + ladder', 'hatch', 'ladder', () => torusObj, [5, 6, 7, 12], [420.39, 474.98, 646.51, 1257.41]],
      ['cone + hatch + ladder', 'hatch', 'ladder', () => coneObj, [11, 15, 22, 42], [544.27, 703.38, 1099.1, 2338.95]],
      ['sphere + hatch + fineLadder', 'hatch', 'fineLadder', () => defaults.objects[0], [8, 10, 14, 25], [222.11, 309.04, 426.96, 769.44]],
      ['torus + hatch + fineLadder', 'hatch', 'fineLadder', () => torusObj, [5, 6, 9, 12], [471.15, 547.36, 773.24, 1254.94]],
      ['cone + hatch + fineLadder', 'hatch', 'fineLadder', () => coneObj, [13, 16, 23, 42], [621.49, 777.78, 1263.12, 2311.12]],
    ])('%s: count strictly increasing, ink strictly increasing', (label, mapper, style, obj, expectCounts, expectInk) => {
      const counts = CHECKPOINTS.map((d) => runCount(d, mapper, style, obj()));
      const ink = CHECKPOINTS.map((d) => runInk(d, mapper, style, obj()));
      expect(counts).toEqual(expectCounts);
      expect(ink).toEqual(expectInk);
      expectStrictlyIncreasing(counts);
      expectStrictlyIncreasing(ink);
    });
  });

  describe('BYTE-IDENTITY GUARD — Density >= 50 (the "med" audit tier)', () => {
    // Pinned md5 of the full drawn sceneFill path set (not just a count), so
    // a future change that moves geometry while keeping the SAME count fails
    // loudly here. Verified via `git stash` (this fix's two files stashed
    // out, fixtures re-run, restored) to match the pre-fix tree exactly.
    //
    // RE-PINNED (W-26, PROOF): the three `ladder` rows below are NO LONGER
    // untouched at d>=50 — continuous placement changes the ladder family at
    // every density, per this file's other re-pins above. The non-ladder
    // rows (`taperedEnds`, `bundleCount`) ARE still byte-identical — W-26 is
    // scoped to `ladder`/`fineLadder`/`phaseFineLadder` only, confirmed by
    // these two rows staying green with no edit.
    test('sphere + hatch + ladder at d=50 and d=220', () => {
      expect(runMd5(50, 'hatch', 'ladder', defaults.objects[0])).toBe('0bc7a99f7c82fc74f5613a705af2315f');
      // RE-PINNED AGAIN (W-26, same commit): d=220 sits past 200, inside
      // fs-m1's relaxed `masterFloorPen` taper — the redundant `floorPitch`
      // re-clamp `ladderWantedPitch` briefly carried (see
      // `scene3d-curved-density-floor.test.js`'s matching re-pin) bound
      // there too; removing it moves this hash. d=50 (well under the
      // taper's own range) is unaffected, confirmed unchanged above.
      expect(runMd5(220, 'hatch', 'ladder', defaults.objects[0])).toBe('088525db6b00c9d7234549cee42fc9a3');
    });

    test('sphere + hatch + taperedEnds at d=50', () => {
      expect(runMd5(50, 'hatch', 'taperedEnds', defaults.objects[0])).toBe('28dacc0dbf75cf4324d8ec93a56e0138');
    });

    // MERGE NOTE (integration, 2026-09-06) / BAR CHANGE: both hashes below
    // moved. Cause is the same A2 torus self-occlusion rewrite disclosed on
    // the "literal checkpoints" block above — `bundleCount` and `contour`
    // are non-ladder families, so W-26 (scoped to ladder/fineLadder/
    // phaseFineLadder) does not touch them; A2 does, because it changes
    // same-object occlusion on every torus render regardless of mapper/law.
    // Neither branch alone produced these two hashes; re-measured against
    // the actual merged source via this file's own `runMd5` helper.
    test('torus + hatch + bundleCount at d=50', () => {
      expect(runMd5(50, 'hatch', 'bundleCount', torusObj)).toBe('d0a5adb813252ff51639f5b1d593a50d');
    });

    test('torus + contour + ladder at d=50', () => {
      expect(runMd5(50, 'contour', 'ladder', torusObj)).toBe('c4af8b99aee05127ac916103b1281ed5');
    });

    test('cone + spiral + ladder at d=50', () => {
      expect(runMd5(50, 'spiral', 'ladder', coneObj)).toBe('707cd281e20019df95abe61b09b38055');
    });
  });
});
