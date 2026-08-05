/**
 * 3D Scene Studio — reliable frontmost object picking (per-pixel face depth).
 *
 * Regression for the "cubes are really tough to select" report: with the
 * ground plane enabled, the ground's single face-centroid depth was spuriously
 * "nearer" than a box resting on it, so a click on the box interior selected
 * the ground instead. The fix raycasts the cursor against real projected mesh
 * faces and compares per-pixel interpolated depth, so the frontmost SURFACE at
 * the cursor wins.
 *
 * These tests drive REAL generated scene geometry (engine.generate) through the
 * renderer pick, so all four default origins are exercised — not a hand-authored
 * fixture.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

// Screen-space bounding-box centre of an object's emitted (visible) geometry.
const objectScreenCenter = (paths, objectId) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  paths.forEach((p) => {
    const t = p && p.meta && p.meta.sceneTarget;
    if (!t || t.objectId !== objectId) return;
    p.forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x)) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
  });
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minX, minY, maxX, maxY };
};

describe('scene3d frontmost object picking (per-pixel face depth)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const buildScene = (objects, extra = {}) => {
    const { VectorEngine, Renderer, Layer } = V;
    const defaults = clone(V.ALGO_DEFAULTS.scene3d);
    const engine = new VectorEngine();
    engine.layers = [];
    const scene = new Layer('scene-pick', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params, ...defaults, seed: 1,
      objects,
      ground: { enabled: false },
      backdrop: { enabled: false },
      camera: { projection: 'orthographic', yaw: 25, pitch: 28, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      ...extra,
    };
    engine.layers.push(scene);
    engine.generate(scene.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    const paths = engine.getRenderablePaths(scene, { useOptimized: false });
    return { engine, renderer, scene, paths };
  };

  const box = (id, size, transform) => ({
    id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, ...transform },
    visibility: 'solid',
  });

  test('a box resting on the ground is selectable at its interior (ground never steals the click)', () => {
    // Cube centred at y=25 (base on the ground) under a standard down-looking
    // 3/4 view, ground enabled. The ground's centroid depth is spuriously near;
    // only a per-pixel surface test picks the cube.
    const { renderer, paths } = buildScene(
      [box('cube', 50, { x: 0, y: 25, z: 0, yaw: 20 })],
      { ground: { enabled: true } },
    );
    const { cx, cy } = objectScreenCenter(paths, 'cube');
    // The centre and a spread of interior points must all resolve to the cube.
    const probes = [
      { x: cx, y: cy },
      { x: cx - 8, y: cy - 6 },
      { x: cx + 8, y: cy + 6 },
      { x: cx - 6, y: cy + 8 },
    ];
    probes.forEach((p) => {
      const hit = renderer._sceneHitAtPoint(p, { mode: 'object' });
      expect(hit).toBeTruthy();
      expect(hit.objectId).toBe('cube');
    });
  });

  test('two overlapping boxes: the frontmost (nearest camera at the cursor) wins', () => {
    const { renderer, paths } = buildScene([
      box('back', 60, { x: -15, y: 0, z: -40 }),
      box('front', 60, { x: 15, y: 0, z: 40 }),
    ]);
    const backC = objectScreenCenter(paths, 'back');
    const frontC = objectScreenCenter(paths, 'front');
    // A screen column inside BOTH silhouettes (the overlap band).
    const overlapMinX = Math.max(backC.minX, frontC.minX);
    const overlapMaxX = Math.min(backC.maxX, frontC.maxX);
    expect(overlapMaxX).toBeGreaterThan(overlapMinX); // sanity: they do overlap
    const px = (overlapMinX + overlapMaxX) / 2;
    const py = (Math.max(backC.minY, frontC.minY) + Math.min(backC.maxY, frontC.maxY)) / 2;
    const hit = renderer._sceneHitAtPoint({ x: px, y: py }, { mode: 'object' });
    expect(hit).toBeTruthy();
    expect(hit.objectId).toBe('front');
  });

  test('face pick over a box on the ground resolves to a box face, not the ground', () => {
    const { renderer, paths } = buildScene(
      [box('cube', 50, { x: 0, y: 25, z: 0, yaw: 20 })],
      { ground: { enabled: true } },
    );
    const { cx, cy } = objectScreenCenter(paths, 'cube');
    const hit = renderer._sceneHitAtPoint({ x: cx, y: cy }, { mode: 'face' });
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('face');
    expect(hit.objectId).toBe('cube');
  });
});
