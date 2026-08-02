/**
 * 3D Scene Studio — I5 (none vs wireframe must differ) + I11 (default = wireframe).
 *
 * I5 taxonomy contract:
 *   none      = the object OUTLINE only  → silhouette + boundary edges.
 *               A cube's outer hexagon; NO interior crease edges (the near-corner
 *               Y), NO interior edges. A sphere's circular silhouette; NO lat/long.
 *   wireframe = ALL structural edges     → silhouette + boundary + crease (+ interior).
 *               A cube's hexagon PLUS the internal Y; a sphere's full lat/long mesh.
 *
 * RGR: on the pre-fix branch a 'none' cube drew its creases (per-face outlines +
 * the structural edge pass), so none and wireframe were byte-identical — the
 * crease-count and edge-count assertions below FAIL before the fix, pass after.
 *
 * I11: a brand-new scene3d layer, born through the real engine add path
 * (engine.addLayer -> new Layer -> factoryParams -> ALGO_DEFAULTS), resolves to
 * the wireframe mapper. Pre-fix the default was 'none' → the assertion FAILS.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

describe('3D Scene Studio — none vs wireframe (I5) + default mapper (I11)', () => {
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
    realCascade = V.Scene3D.StyleCascade;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const box = (id, extra = {}) => ({
    id, name: id, primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 24, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const sphere = (id, extra = {}) => ({
    id, name: id, primitive: 'sphere', params: { radius: 22, detail: 18 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const sceneParams = (mapper, objects, params = {}) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...params } }, byObject: {}, byFace: {} };
    return p;
  };
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };
  const gen = (mapper, objects) => algo.generate(sceneParams(mapper, objects), null, null, BOUNDS) || [];
  const edges = (paths) => paths.filter((p) => p.meta.kind === 'sceneEdge');
  const clsCount = (es, cls) => es.filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.edgeClass === cls).length;

  describe('I5 — none = outline only, wireframe = all structural edges', () => {
    test('cube: wireframe emits the interior crease edges; none does not', () => {
      installStub();
      const noneEdges = edges(gen('none', [box('obj-1')]));
      const wireEdges = edges(gen('wireframe', [box('obj-1')]));

      // Both must show the object outline.
      expect(clsCount(noneEdges, 'silhouette')).toBeGreaterThan(0);
      expect(clsCount(wireEdges, 'silhouette')).toBeGreaterThan(0);

      // The near-corner Y (creases) belongs to wireframe ONLY.
      expect(clsCount(wireEdges, 'crease')).toBeGreaterThan(0);
      expect(clsCount(noneEdges, 'crease')).toBe(0);

      // The headline contract: a wireframe cube draws strictly MORE edges.
      expect(wireEdges.length).toBeGreaterThan(noneEdges.length);
    });

    test('cube: none draws no interior (crease/interior) edges at all', () => {
      installStub();
      const noneEdges = edges(gen('none', [box('obj-1')]));
      expect(clsCount(noneEdges, 'crease')).toBe(0);
      expect(clsCount(noneEdges, 'interior')).toBe(0);
    });

    test('sphere: wireframe shows lat/long creases, none shows only the silhouette', () => {
      installStub();
      const noneEdges = edges(gen('none', [sphere('obj-1')]));
      const wireEdges = edges(gen('wireframe', [sphere('obj-1')]));
      const noneInterior = clsCount(noneEdges, 'crease') + clsCount(noneEdges, 'interior');
      const wireInterior = clsCount(wireEdges, 'crease') + clsCount(wireEdges, 'interior');
      expect(clsCount(noneEdges, 'silhouette')).toBeGreaterThan(0);
      expect(noneInterior).toBe(0);
      expect(wireInterior).toBeGreaterThan(0);
      expect(wireEdges.length).toBeGreaterThan(noneEdges.length);
    });
  });

  describe('I11 — a freshly added scene3d object defaults to wireframe', () => {
    test('engine.addLayer(scene3d) resolves the scene mapper to wireframe (real add path)', () => {
      const engine = new V.VectorEngine();
      const id = engine.addLayer('scene3d');
      const layer = engine.getLayerById(id);
      expect(layer).toBeTruthy();
      expect(layer.type).toBe('scene3d');
      expect(layer.params.styleTable.scene.mapper).toBe('wireframe');
    });

    test('the default scene renders as wireframe (interior edges present, no sceneFace)', () => {
      const engine = new V.VectorEngine();
      const id = engine.addLayer('scene3d');
      engine.generate(id);
      const layer = engine.getLayerById(id);
      const es = edges(layer.paths);
      expect(clsCount(es, 'crease') + clsCount(es, 'interior')).toBeGreaterThan(0);
      // wireframe faces emit edges only — no per-face outline fills.
      expect(layer.paths.some((p) => p.meta && p.meta.kind === 'sceneFace')).toBe(false);
    });
  });
});
