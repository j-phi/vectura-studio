/**
 * 3D Scene Studio — Phase 3 surface-fill mappers (crosshatch / contour / spiral
 * / stipple). Covers the pure Scene3D.Mappers region-fill module, the algorithm
 * dispatch (each mapper emits sceneFill and suppresses the face outline + creases
 * like hatch does), and the params whitelist that keeps the new mapper names.
 *
 * RGR: on the Phase-2 branch the mappers are absent — normalizeParams resets the
 * names to 'none' (0 fills) and Scene3D.Mappers is undefined — so this fails
 * before Phase 3 and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

const box = (id, extra = {}) => ({
  id,
  name: id,
  primitive: 'box',
  params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
  ...extra,
});

describe('3D Scene Studio Phase 3 — surface-fill mappers', () => {
  let runtime;
  let V;
  let algo;
  let defaults;
  let realCascade;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
    realCascade = V.Scene3D.StyleCascade; // the genuine module (a stub replaces it per-test)
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sceneParams = (mapper, objects) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50 } }, byObject: {}, byFace: {} };
    return p;
  };

  // Stub cascade (mirrors scene3d-generate) so the dispatch is tested without the
  // params whitelist in the way.
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };
  const fills = (paths) => paths.filter((p) => p.meta.kind === 'sceneFill');
  const kind = (paths, k) => paths.filter((p) => p.meta.kind === k);

  // ── Pure module ────────────────────────────────────────────────────────────
  describe('Scene3D.Mappers.regionFill (pure)', () => {
    const SQ = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];

    test('the module is registered', () => {
      expect(V.Scene3D && V.Scene3D.Mappers && typeof V.Scene3D.Mappers.regionFill).toBe('function');
    });

    test('contour emits concentric CLOSED rings, denser as spacing shrinks', () => {
      const M = V.Scene3D.Mappers;
      const coarse = M.regionFill('contour', [SQ], { spacing: 10 });
      const fine = M.regionFill('contour', [SQ], { spacing: 4 });
      expect(coarse.length).toBeGreaterThanOrEqual(1);
      expect(fine.length).toBeGreaterThan(coarse.length);
      // Each ring is a closed polyline (first ≈ last).
      coarse.forEach((r) => {
        expect(r.length).toBeGreaterThanOrEqual(4);
        expect(Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y)).toBeLessThan(1e-6);
      });
    });

    test('spiral emits ONE continuous polyline per loop (fewer, longer paths than contour)', () => {
      const M = V.Scene3D.Mappers;
      const spiral = M.regionFill('spiral', [SQ], { spacing: 5 });
      const contour = M.regionFill('contour', [SQ], { spacing: 5 });
      expect(spiral.length).toBe(1);
      expect(spiral[0].length).toBeGreaterThan(contour[0].length); // the whole nest, stitched
    });

    test('stipple emits small closed dots, more of them as spacing shrinks', () => {
      const M = V.Scene3D.Mappers;
      const coarse = M.regionFill('stipple', [SQ], { spacing: 8 });
      const fine = M.regionFill('stipple', [SQ], { spacing: 4 });
      expect(coarse.length).toBeGreaterThan(0);
      expect(fine.length).toBeGreaterThan(coarse.length);
      // A dot is a small closed ring well inside the 40×40 region.
      const d = coarse[0];
      expect(d.length).toBeGreaterThanOrEqual(6);
      d.forEach((pt) => { expect(pt.x).toBeGreaterThan(-1); expect(pt.x).toBeLessThan(41); });
    });

    test('stipple is deterministic (same dots across calls)', () => {
      const M = V.Scene3D.Mappers;
      const a = M.regionFill('stipple', [SQ], { spacing: 6 });
      const b = M.regionFill('stipple', [SQ], { spacing: 6 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    test('stipple fills a TRIANGULAR region (pointInPolygon needs the closed ring)', () => {
      // Regression: a 3-vertex face used to emit zero dots (pip rejects <4 pts).
      const TRI = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 40 }];
      expect(V.Scene3D.Mappers.regionFill('stipple', [TRI], { spacing: 6 }).length).toBeGreaterThan(3);
    });

    test('stipple thins UNIFORMLY (no blank band) and stays bounded on a huge dense region', () => {
      const BIG = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }];
      const dots = V.Scene3D.Mappers.regionFill('stipple', [BIG], { spacing: 1 });
      expect(dots.length).toBeGreaterThan(1000);
      expect(dots.length).toBeLessThan(15000); // bounded, not a bbox/step runaway
      // Dots reach the BOTTOM of the region (not truncated to a top strip).
      const maxY = Math.max(...dots.map((d) => Math.max(...d.map((p) => p.y))));
      expect(maxY).toBeGreaterThan(300);
    });

    test('contour CARVES a hole — rings do not fill an interior hole loop', () => {
      const outer = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
      // A hole loop (wound opposite) in the centre.
      const hole = [{ x: 14, y: 26 }, { x: 26, y: 26 }, { x: 26, y: 14 }, { x: 14, y: 14 }];
      const rings = V.Scene3D.Mappers.regionFill('contour', [outer, hole], { spacing: 4 });
      expect(rings.length).toBeGreaterThan(0);
      const pip = V.PathBoolean.pointInPolygon;
      const holeClosed = hole.concat([hole[0]]);
      let inHole = 0; let total = 0;
      rings.forEach((r) => r.forEach((p) => { total += 1; if (pip({ x: p.x, y: p.y }, holeClosed)) inHole += 1; }));
      // Essentially no contour geometry lands inside the empty hole.
      expect(inHole / total).toBeLessThan(0.1);
    });
  });

  // ── Algorithm dispatch (stubbed cascade) ────────────────────────────────────
  describe('algorithm dispatch', () => {
    ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
      test(`${mapper} emits sceneFill and suppresses the face outline + creases`, () => {
        installStub();
        const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, BOUNDS) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
        // Surface fills replace the per-face outline (no sceneFace) and interior
        // creases (a box has 0 crease edges left under the fill; only silhouette/
        // boundary sceneEdges remain).
        expect(kind(paths, 'sceneFace').length).toBe(0);
        const creases = kind(paths, 'sceneEdge').filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.faceId == null);
        expect(creases.length).toBe(0);
      });
    });

    test('crosshatch draws MORE fill lines than hatch (the perpendicular pass)', () => {
      installStub();
      const hatch = fills(algo.generate(sceneParams('hatch', [box('obj-1')]), null, null, BOUNDS) || []).length;
      const cross = fills(algo.generate(sceneParams('crosshatch', [box('obj-1')]), null, null, BOUNDS) || []).length;
      expect(cross).toBeGreaterThan(hatch);
    });

    test('a draft (fastPreview) frame still emits fills for every mapper without hanging', () => {
      installStub();
      ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
        const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, { ...BOUNDS, fastPreview: true }) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
      });
    });

    test('a curved primitive (sphere) fills as one region for every mapper', () => {
      installStub();
      const sphere = { id: 'obj-1', name: 's', primitive: 'sphere', params: { radius: 22, detail: 18 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
        const paths = algo.generate(sceneParams(mapper, [sphere]), null, null, BOUNDS) || [];
        expect(fills(paths).length).toBeGreaterThan(0);
      });
    });
  });

  // ── Params whitelist (real path, no stub) ───────────────────────────────────
  test('normalizeParams keeps the new mapper names (real StyleCascade path emits fills)', () => {
    // No stub: the real StyleCascade + params.normalizeParams run. If the mapper
    // were not whitelisted it would reset to 'none' and emit 0 fills.
    ['crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
      const paths = algo.generate(sceneParams(mapper, [box('obj-1')]), null, null, BOUNDS) || [];
      expect(fills(paths).length).toBeGreaterThan(0);
    });
  });
});
