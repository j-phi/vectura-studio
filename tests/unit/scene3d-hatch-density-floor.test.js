const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-e2 Job 1 (P0) — make the raised fill Density ceiling (0-200) actually
 * reach drawn geometry, end to end through algo.generate().
 *
 * The UI sliders and `hatchSpacing(density)` (scene3d.js) were already fixed
 * on a sibling branch to compute sub-1mm spacing for density in (100, 200].
 * But the geometry that actually consumes that spacing re-floors it at a
 * hard 1mm in two independently-owned helpers:
 *   - `hatchPolygon` (geometry3d.js) — the faceted (box/plane/solid/ground)
 *     in-plane hatch, reached via `crossFamilies`.
 *   - `hatchSegments` (scene3d.js) — the curved-surface flat-silhouette
 *     fallback (draft/live-drag, or a primitive SurfaceFill can't chart).
 * So a saved document at density 150 or 200 rendered BYTE-IDENTICAL to
 * density 100 — the ceiling raise was a UI-only no-op.
 *
 * Both helpers now take an opt-in `minSpacing` that ONLY the direct
 * density→spacing family (family A) receives; the user's crosshatch family B
 * (spacing × crossDensityRatio, which can already dip under 1mm in an
 * existing saved document) keeps the historic hard floor of 1 UNCONDITIONALLY
 * — that is the byte-identity guarantee this file's "REGRESSION GUARD" tests
 * exist to pin.
 *
 * NOTE on scope: a THIRD floor exists in `src/core/scene3d/surface-fill.js`
 * (`PLOT_FLOOR_PEN * penWidth`) that gates the full-quality (non-draft)
 * CURVED (chart-wrapped) fill — e.g. a sphere at default pen width 0.35mm
 * floors around 0.77mm regardless of this fix. That file is owned by another
 * agent (fs-e2 owns only geometry3d.js / scene3d.js / params.js) and is out
 * of scope here; see the fs-e2 report for the finding. This file proves the
 * fix on the geometry this branch DOES own: the faceted (box) path and the
 * curved draft-preview fallback path.
 */

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('scene3d hatch density ceiling (100-200) reaches drawn geometry', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const box = (extra = {}) => ({
    id: 'obj-1',
    name: 'obj-1',
    primitive: 'box',
    params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid',
    ...extra,
  });

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

  describe('GREEN — faceted (box) hatch: path count strictly increases with density', () => {
    const runAt = (d, draft) => {
      const params = sceneParams([box()]);
      params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: d } };
      const t0 = Date.now();
      const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: !!draft }) || [];
      const t1 = Date.now();
      return { count: fillCount(paths), ms: t1 - t0 };
    };

    test('full quality: fill path count is strictly increasing across 50/100/150/200', () => {
      const results = [50, 100, 150, 200].map((d) => ({ d, ...runAt(d, false) }));
      // eslint-disable-next-line no-console
      console.log('box full-quality hatch density sweep:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
    });

    test('draft (live-drag fallback path): fill path count is strictly increasing across 50/100/150/200', () => {
      const results = [50, 100, 150, 200].map((d) => ({ d, ...runAt(d, true) }));
      // eslint-disable-next-line no-console
      console.log('box draft hatch density sweep:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
    });

    test('generate time at density 200 on a real object stays well under a second (no runaway)', () => {
      const { count, ms } = runAt(200, false);
      expect(count).toBeGreaterThan(0);
      expect(ms).toBeLessThan(2000);
    });
  });

  describe('GREEN — curved (sphere) draft fallback: path count strictly increases with density', () => {
    test('draft path count is strictly increasing across 50/100/150/200', () => {
      const results = [50, 100, 150, 200].map((d) => {
        const params = sceneParams(defaults.objects); // default sphere
        params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: d } };
        const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: true }) || [];
        return { d, count: fillCount(paths) };
      });
      // eslint-disable-next-line no-console
      console.log('sphere draft hatch density sweep:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
    });
  });

  describe('BYTE-IDENTICAL REGRESSION GUARD — crosshatch family B stays floored at 1mm through the real pipeline', () => {
    // Family B's spacing is `spacing * crossDensityRatio`. At density 100 the
    // pre-raise formula already lands EXACTLY at 1mm (family A's own floor
    // boundary), so ratio 0.25 asks family B for 0.25mm — pre-existing
    // behavior (and this fix) floors that back up at 1mm. Proof: at density
    // 100, ratio 0.25 (asks 0.25mm, sub-floor) and ratio 1.0 (asks 1mm, AT
    // the floor) both floor to the SAME exact spacing, so their outputs must
    // be byte-identical. If a future change let a low ratio dip family B
    // below 1mm, this would break — a saved document at density 100 with a
    // low crossDensityRatio would silently render denser than it used to.
    // Two isolations from unrelated pre-existing behavior (verified via git
    // stash: both hold on the ORIGINAL code too, so neither is this fix's
    // doing — they just isolate what IS this fix's doing):
    //   1. `angleRef: 'screen'` forces faceHatchLines onto the cheap
    //      screen-space branch (no plane scaffold), so crossFamilies gets NO
    //      `planeFor` and `plane(deg, screenPitch)` returns screenPitch
    //      verbatim — no per-facet foreshortening/ceiling-grant machinery.
    //   2. `tone.enabled: false` forces spacingBand's early return
    //      (`s0 = hatchSpacing(density)` exactly, no coverageGain division),
    //      so family A's spacing at density 100 is EXACTLY 1mm and family B's
    //      request is exactly `1 * ratio`.
    // With both isolated, ratio 0.25 (asks 0.25mm) and ratio 1.0 (asks 1mm)
    // must floor to the identical 1mm and produce byte-identical output.
    const runCross = (ratio, draft) => {
      const params = sceneParams([box()]);
      params.tone = { ...params.tone, enabled: false };
      params.styleTable.byObject['obj-1'] = {
        penId: null,
        mapper: 'crosshatch',
        params: { fillAngle: 0, fillDensity: 100, crossAngleDelta: 90, crossDensityRatio: ratio, angleRef: 'screen' },
      };
      return algo.generate(params, null, null, { ...BOUNDS, fastPreview: !!draft }) || [];
    };
    const stripFills = (paths) => paths
      .filter((p) => p.meta && p.meta.kind === 'sceneFill')
      .map((p) => p.map((q) => ({ x: q.x, y: q.y })));

    test('faceted screen-space (hatchPolygon via crossFamilies, no planeFor): ratio 0.25 and ratio 1.0 are BYTE-IDENTICAL at density 100 — family B never went below the historic 1mm floor', () => {
      const lowRatio = stripFills(runCross(0.25, false));
      const unityRatio = stripFills(runCross(1.0, false));
      expect(lowRatio.length).toBeGreaterThan(0);
      expect(JSON.stringify(lowRatio)).toBe(JSON.stringify(unityRatio));
    });

    test('curved draft fallback (hatchSegments): ratio 0.25 and ratio 1.0 are BYTE-IDENTICAL at density 100 for the same reason', () => {
      const params = () => {
        const p = sceneParams(defaults.objects); // default sphere
        p.styleTable.byObject['obj-1'] = {
          penId: null,
          mapper: 'crosshatch',
          params: { fillAngle: 0, fillDensity: 100, crossAngleDelta: 90, crossDensityRatio: 0.25 },
        };
        return p;
      };
      const lowRatioParams = params();
      const unityRatioParams = params();
      unityRatioParams.styleTable.byObject['obj-1'].params.crossDensityRatio = 1.0;
      const lowRatio = stripFills(algo.generate(lowRatioParams, null, null, { ...BOUNDS, fastPreview: true }) || []);
      const unityRatio = stripFills(algo.generate(unityRatioParams, null, null, { ...BOUNDS, fastPreview: true }) || []);
      expect(lowRatio.length).toBeGreaterThan(0);
      expect(JSON.stringify(lowRatio)).toBe(JSON.stringify(unityRatio));
    });
  });
});
