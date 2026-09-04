/**
 * 3D Scene Studio — I5 (none vs wireframe must differ) + the fresh-insert default.
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
 * Fresh-insert default: a brand-new scene3d layer, born through the real engine
 * add path (engine.addLayer -> addSceneTree -> new Layer -> factoryParams ->
 * ALGO_DEFAULTS), resolves to the HATCH mapper on a SPHERE. This supersedes I11
 * (which seeded wireframe): wireframe returns false from Scene3D.SurfaceFill and
 * takes the flat/edge path instead, so a wireframe object emits structural edges
 * and ZERO surface ink — on the old default box that was nine straight lines, and
 * a freshly dropped scene read as an empty cube outline. Wireframe itself is not
 * broken and is still asserted below (I5, and the explicit-pick case).
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

  describe('a freshly added scene tree defaults to a hatched sphere', () => {
    // Scene-tree Increment D — Add Layer now builds a scene GROUP + one default
    // object3d child; the group's scene-scope mapper resolves to hatch.
    test('engine.addLayer(scene3d) seeds a hatched sphere child under a wireframe scene scope', () => {
      const engine = new V.VectorEngine();
      const id = engine.addLayer('scene3d');
      const group = engine.getLayerById(id);
      expect(group).toBeTruthy();
      expect(group.type).toBe('scene3d');
      expect(group.isGroup).toBe(true);
      // The SCENE scope stays wireframe (it is what the ground resolves to).
      expect(group.params.styleTable.scene.mapper).toBe('wireframe');
      // The default object child carries its OWN hatch style, and that is what
      // wins — the cascade is whole-style-wins, object scope over scene scope.
      const child = engine.getLayerChildren(id).find((l) => l.type === 'object3d');
      expect(child).toBeTruthy();
      expect(child.params.style.mapper).toBe('hatch');
      expect(child.params.primitive).toBe('sphere');
    });

    test('the default scene tree puts real SURFACE ink on the object, not just edges', () => {
      const engine = new V.VectorEngine();
      const id = engine.addLayer('scene3d');
      engine.computeAllDisplayGeometry();
      const group = engine.getLayerById(id);
      const paths = engine.getRenderablePaths(group);
      const child = engine.getLayerChildren(id).find((l) => l.type === 'object3d');
      // Fill that belongs to the OBJECT — not the ground quad, not the cast
      // shadow dropped onto it. Under the old wireframe seed this was zero.
      const surface = paths.filter((p) => {
        if (!p.meta || p.meta.kind !== 'sceneFill') return false;
        const t = p.meta.sceneTarget || {};
        return t.objectId === child.id && t.regionClass !== 'castShadow';
      });
      expect(surface.length).toBeGreaterThan(0);
    });

    test('switching that scene tree back to wireframe still emits structural edges', () => {
      const engine = new V.VectorEngine();
      const id = engine.addLayer('scene3d');
      const child = engine.getLayerChildren(id).find((l) => l.type === 'object3d');
      child.params.style = { penId: null, mapper: 'wireframe', params: {} };
      engine.computeAllDisplayGeometry();
      const paths = engine.getRenderablePaths(engine.getLayerById(id));
      const es = edges(paths);
      expect(clsCount(es, 'crease') + clsCount(es, 'interior')).toBeGreaterThan(0);
      // wireframe faces emit edges only — no per-face outline fills.
      expect(paths.some((p) => p.meta && p.meta.kind === 'sceneFace')).toBe(false);
    });
  });
});
