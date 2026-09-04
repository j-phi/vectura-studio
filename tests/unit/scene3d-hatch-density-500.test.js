const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-m1 — fillDensity ceiling raised 200 → 500 (engine half; UI slider `max`
 * values are a sibling agent's file set).
 *
 * Density was already raised 100 → 200 on prior branches, which required
 * fixing three independent floors, each hidden behind the one above it:
 *   1. `hatchSpacing(d)` (scene3d.js) — d<=100 byte-identical to the
 *      original `max(1, 14 - 0.13d)`; d in (100,200] descends 1mm → 0.3mm.
 *   2. `hatchPolygon` (geometry3d.js) — opt-in `opts.minSpacing` (default 1,
 *      byte-identical for every existing caller), threaded from scene3d.js
 *      only into family A (the direct density→spacing hatch), never into
 *      the ratio-scaled crosshatch family B.
 *   3. `SurfaceFill`'s `STAGE.masterGrid` floor (surface-fill.js) — opt-in
 *      `opts.masterFloorPen`; `curvedMasterFloorPen(density)` (scene3d.js)
 *      is `undefined` for d<=100, tapers 2.2x pen → 1.2x pen across
 *      (100,200].
 *
 * Both floors already reach their HONEST physical bound by d=200:
 *   - `hatchSpacing` reaches 0.3mm, below a typical plotter nib/fineliner
 *     width (≈0.3-0.5mm) — the module's own comment names this.
 *   - `curvedMasterFloorPen` reaches 1.2x pen, the exact bound
 *     `surface-fill.js`'s own PLOT_FLOOR_PEN comment names as where "real
 *     ink floods and the plot comes off the bed wet".
 *
 * So extending the ceiling to 500 is NOT "change 200 to 500" — every mm
 * past d≈200-220 is already sub-nib / at-the-flood-point. This file pins
 * the THIRD arm each ramp gained: it continues the SAME taper shape one
 * notch further (0.3→0.18mm; 1.2x→0.7x pen) so path count keeps climbing
 * — the requirement, not a nicety, because a flat plateau past the raised
 * UI ceiling is the exact defect the first two rounds fixed — while being
 * honest that this is a path-count/plot-time knob past ~d=220, not a
 * visible-tone knob. See the shipping report for the recommended UI cap.
 */

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('scene3d fillDensity ceiling 200→500 (fs-m1)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
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

  const box = () => ({
    id: 'obj-1', name: 'obj-1', primitive: 'box',
    params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid',
  });
  const torus = () => ({
    id: 'obj-1', name: 'obj-1', primitive: 'torus',
    params: { sx: 60, sy: 18, sz: 18, detail: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 18, pitch: 8, roll: 0, scale: 1 },
    visibility: 'solid',
  });
  const bigSphere = () => ({
    id: 'obj-1', name: 'obj-1', primitive: 'sphere',
    params: { sx: 140, sy: 140, sz: 140, detail: 48 },
    transform: { x: 0, y: 0, z: 0, yaw: 18, pitch: 8, roll: 0, scale: 1 },
    visibility: 'solid',
  });

  const runOn = (objFactory, d, extra = {}) => {
    const params = sceneParams([objFactory()]);
    params.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: d, ...extra } };
    const t0 = Date.now();
    const paths = algo.generate(params, null, null, { ...BOUNDS, fastPreview: false }) || [];
    const t1 = Date.now();
    return { d, count: fillCount(paths), ms: t1 - t0 };
  };

  describe('test seams', () => {
    test('published', () => {
      expect(typeof algo.__hatchSpacingForTest).toBe('function');
      expect(typeof algo.__curvedMasterFloorPenForTest).toBe('function');
    });
  });

  describe('hatchSpacing 200-500 mapping', () => {
    test('BYTE-IDENTITY GUARD: 0-200 unchanged by this branch', () => {
      const OLD_0_100 = (d) => Math.max(1, 14 - 0.13 * Math.min(100, Math.max(0, d)));
      for (let d = 0; d <= 100; d += 10) {
        expect(algo.__hatchSpacingForTest(d)).toBe(OLD_0_100(d));
      }
      // 100-200 pinned exact values (unchanged from the fs-d1 round).
      expect(algo.__hatchSpacingForTest(100)).toBe(1);
      expect(algo.__hatchSpacingForTest(150)).toBeCloseTo(0.65, 10);
      expect(algo.__hatchSpacingForTest(200)).toBeCloseTo(0.3, 10);
    });

    test('200-500 tapers linearly from 0.3mm to 0.18mm', () => {
      expect(algo.__hatchSpacingForTest(200)).toBeCloseTo(0.3, 5);
      expect(algo.__hatchSpacingForTest(350)).toBeCloseTo(0.24, 5);
      expect(algo.__hatchSpacingForTest(500)).toBeCloseTo(0.18, 5);
    });

    test('monotonic across 200-500 (denser input never yields wider spacing)', () => {
      let prev = algo.__hatchSpacingForTest(200);
      for (let d = 201; d <= 500; d++) {
        const cur = algo.__hatchSpacingForTest(d);
        expect(cur).toBeLessThanOrEqual(prev);
        prev = cur;
      }
    });

    test('clamps flat past 500', () => {
      const s500 = algo.__hatchSpacingForTest(500);
      expect(algo.__hatchSpacingForTest(750)).toBe(s500);
      expect(algo.__hatchSpacingForTest(1e6)).toBe(s500);
    });
  });

  describe('curvedMasterFloorPen 200-500 mapping', () => {
    test('BYTE-IDENTITY GUARD: 0-200 unchanged by this branch', () => {
      for (let d = 0; d <= 100; d += 10) {
        expect(algo.__curvedMasterFloorPenForTest(d)).toBeUndefined();
      }
      expect(algo.__curvedMasterFloorPenForTest(150)).toBeCloseTo(1.7, 10);
      expect(algo.__curvedMasterFloorPenForTest(200)).toBeCloseTo(1.2, 10);
    });

    test('200-500 tapers linearly from 1.2x pen to 0.7x pen', () => {
      expect(algo.__curvedMasterFloorPenForTest(200)).toBeCloseTo(1.2, 5);
      expect(algo.__curvedMasterFloorPenForTest(350)).toBeCloseTo(0.95, 5);
      expect(algo.__curvedMasterFloorPenForTest(500)).toBeCloseTo(0.7, 5);
    });

    test('monotonic across 200-500', () => {
      let prev = algo.__curvedMasterFloorPenForTest(200);
      for (let d = 201; d <= 500; d++) {
        const cur = algo.__curvedMasterFloorPenForTest(d);
        expect(cur).toBeLessThanOrEqual(prev);
        prev = cur;
      }
    });

    test('clamps flat past 500', () => {
      const f500 = algo.__curvedMasterFloorPenForTest(500);
      expect(algo.__curvedMasterFloorPenForTest(750)).toBe(f500);
      expect(algo.__curvedMasterFloorPenForTest(1e6)).toBe(f500);
    });
  });

  describe('RED (fixed by this change) — path count strictly increases 200/300/400/500', () => {
    test('faceted box (geometry3d.js hatchPolygon path)', () => {
      const results = [200, 300, 400, 500].map((d) => runOn(box, d));
      // eslint-disable-next-line no-console
      console.log('box density sweep 200-500:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      expect(results.map((r) => r.count)).toEqual([178, 181, 185, 190]);
    });

    test('curved sphere (SurfaceFill masterGrid path)', () => {
      const results = [200, 300, 400, 500].map((d) => runOn(() => defaults.objects[0], d));
      // eslint-disable-next-line no-console
      console.log('sphere density sweep 200-500:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      expect(results.map((r) => r.count)).toEqual([95, 109, 129, 161]);
    });

    test('curved torus (SurfaceFill masterGrid path, different mesh)', () => {
      const results = [200, 300, 400, 500].map((d) => runOn(torus, d));
      // eslint-disable-next-line no-console
      console.log('torus density sweep 200-500:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      // [63, 74, 90, 110] until F2 (2026-08-29). `SurfaceFill.sampleAt` used to
      // orient every normal on its own with `dot(n, p0) < 0`, which is a
      // star-shapedness test rather than a handedness one, and a torus is the
      // first chart here that is not star-shaped: `dot(n, p) = major·cos(2πv) +
      // minor` goes negative across the inner third of the tube, so the torus
      // was ruled on the sheet FACING AWAY from the camera and the rulings that
      // resulted were then chopped up by hidden-line removal. The orientation is
      // now decided once per chart from the sign of ∮ p·n dA, the torus draws
      // the sheet the camera can see, and the same number of rulings survives as
      // fewer, longer, unbroken paths. The PROPERTY under test — density buys
      // strictly more paths — is asserted above and is unchanged; these absolute
      // counts are the fixture's fingerprint, not its contract.
      expect(results.map((r) => r.count)).toEqual([41, 48, 55, 70]);
    });
  });

  describe('runaway-cost guard (5e75af6e precedent — a pathological combo must not hang CI)', () => {
    test('generate time at density 500 stays well under a second, all three primitives', () => {
      [box, torus, () => defaults.objects[0]].forEach((factory) => {
        const { count, ms } = runOn(factory, 500);
        expect(count).toBeGreaterThan(0);
        expect(ms).toBeLessThan(2000);
      });
    });

    test('a larger, denser curved object (140mm sphere, mesh detail 48) at density 500 stays bounded and fast', () => {
      const results = [200, 300, 400, 500].map((d) => runOn(bigSphere, d));
      // eslint-disable-next-line no-console
      console.log('big/dense sphere density sweep 200-500:', results);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].count).toBeGreaterThan(results[i - 1].count);
      }
      results.forEach((r) => {
        expect(r.ms).toBeLessThan(3000);
        // MASTER_MAX_LINES (420, surface-fill.js) x family multipliers this
        // fixture can't reach — a generous ceiling that only exists to catch
        // an actual explosion, not to pin an exact count.
        expect(r.count).toBeLessThan(2000);
      });
    });
  });
});
