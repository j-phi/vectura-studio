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
 *      geometric decay from 6x `hatchSpacing(50)` at Density 1 down to 1x at
 *      Density 50, converging there exactly) so the master grid actually
 *      opens up several rulings at a time between the audit's own checkpoint
 *      set, not one.
 *
 * WHY 1/25/50(/100), NOT EVERY INTEGER DENSITY. The ladder-banding rounding
 * above means the raw drawn path count is NOT perfectly monotone at every
 * single Density value even after this fix (e.g. Density 8 draws one fewer
 * path than Density 1-7 on the default sphere, purely from a per-band
 * rounding boundary) — the master grid's ruling count `N` IS monotone
 * throughout (asserted directly below via the `lastMasterGridStats` test
 * seam this fix adds), and the DRAWN count is monotone at the checkpoints
 * findings.json's F-01 names as the acceptance bar: 1 / 25 / 50 / 100.
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
    test('sphere + hatch + ladder', () => {
      const counts = [1, 25, 50, 100].map((d) => runCount(d, 'hatch', 'ladder', defaults.objects[0]));
      expect(counts).toEqual([5, 9, 23, 50]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('torus + contour + ladder', () => {
      const counts = [1, 25, 50, 100].map((d) => runCount(d, 'contour', 'ladder', torusObj));
      expect(counts).toEqual([12, 31, 64, 146]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('cone + spiral + ladder (strictly increasing across the fix\'s own scope, 1/25/50)', () => {
      const counts = [1, 25, 50].map((d) => runCount(d, 'spiral', 'ladder', coneObj));
      expect(counts).toEqual([12, 29, 62]);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    });

    test('ribbon-ish ladder laws also open up: sphere/hatch/taperedEnds and torus/hatch/bundleCount', () => {
      const tapered = [1, 25, 50].map((d) => runCount(d, 'hatch', 'taperedEnds', defaults.objects[0]));
      expect(tapered).toEqual([20, 40, 80]);
      for (let i = 1; i < tapered.length; i++) expect(tapered[i]).toBeGreaterThan(tapered[i - 1]);

      const bundle = [1, 25, 50].map((d) => runCount(d, 'hatch', 'bundleCount', torusObj));
      expect(bundle).toEqual([39, 70, 84]);
      for (let i = 1; i < bundle.length; i++) expect(bundle[i]).toBeGreaterThan(bundle[i - 1]);
    });
  });

  describe('BYTE-IDENTITY GUARD — Density >= 50 (the "med" audit tier) is untouched', () => {
    // Pinned md5 of the full drawn sceneFill path set (not just a count), so
    // a future change that moves geometry while keeping the SAME count fails
    // loudly here. Verified via `git stash` (this fix's two files stashed
    // out, fixtures re-run, restored) to match the pre-fix tree exactly.
    test('sphere + hatch + ladder at d=50 and d=220', () => {
      expect(runMd5(50, 'hatch', 'ladder', defaults.objects[0])).toBe('e5bae292e9657e61651e474c7f987169');
      expect(runMd5(220, 'hatch', 'ladder', defaults.objects[0])).toBe('d98091f28d0c73afe1cca9cbf785f992');
    });

    test('sphere + hatch + taperedEnds at d=50', () => {
      expect(runMd5(50, 'hatch', 'taperedEnds', defaults.objects[0])).toBe('28dacc0dbf75cf4324d8ec93a56e0138');
    });

    test('torus + hatch + bundleCount at d=50', () => {
      expect(runMd5(50, 'hatch', 'bundleCount', torusObj)).toBe('dabbb9ea359870db78300f31ae930040');
    });

    test('torus + contour + ladder at d=50', () => {
      expect(runMd5(50, 'contour', 'ladder', torusObj)).toBe('8ea7fd337d21fcf9f2ef2c54a97e2283');
    });

    test('cone + spiral + ladder at d=50', () => {
      expect(runMd5(50, 'spiral', 'ladder', coneObj)).toBe('a43797e79c3d4f7e69e0b08b61cac298');
    });
  });
});
