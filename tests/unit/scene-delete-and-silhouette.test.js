/**
 * 3D Scene Studio — I10 (Delete scoped to scene object/face, not the layer) and
 * I12 (sphere-style objects selectable anywhere in their projected silhouette).
 *
 * Fixture-driven, mirroring tests/unit/scene-hit-testing.test.js: hand-authored
 * CONTRACT B path meta drives the real renderer. No dependency on the scene3d
 * engine emitting geometry.
 *
 * RGR: renderer.deleteSceneSelection and the object-mode silhouette fallback in
 * _sceneCandidatesAtPoint do not exist before this change, so these fail red.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

const target = (over = {}) => ({
  objectId: 'obj-1', faceId: 'face:+Z', edgeClass: null, depth: 10,
  normal: { x: 0, y: 0, z: 1 }, facingUp: false, occluded: false, ...over,
});

const makeSceneParams = (objects) => ({
  sceneVersion: 1, seed: 0,
  objects, lights: [], ground: { enabled: true }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

async function setup(runtimeRef, { paths, objects }) {
  const runtime = await loadVecturaRuntime({ includeRenderer: true });
  runtimeRef.current = runtime;
  const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
  const engine = new VectorEngine();
  engine.layers = [];
  const scene = new Layer('scene-1', 'scene3d', 'Scene');
  scene.params = { ...scene.params, ...makeSceneParams(objects) };
  scene.paths = paths;
  engine.layers.push(scene);
  const renderer = new Renderer('main-canvas', engine);
  renderer.setTool('select');
  renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
  return { runtime, engine, scene, renderer };
}

// ── I10 fixtures: two simple boxes with pickable faces. ─────────────────────
const twoBoxObjects = () => ([
  { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
  { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 30, y: 5, z: 30, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
]);
const twoBoxPaths = () => ([
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], { kind: 'sceneFace', closed: true, sceneTarget: target() }),
  P([[30, 30], [70, 30], [70, 70], [30, 70], [30, 30]], { kind: 'sceneFace', closed: true, sceneTarget: target({ objectId: 'obj-2', depth: 5 }) }),
]);

describe('I10 — Delete removes the selected scene object/face, not the layer', () => {
  const runtimeRef = { current: null };
  afterEach(() => { runtimeRef.current?.cleanup?.(); runtimeRef.current = null; });

  test('deleteSceneSelection: object mode removes the object; layer survives', async () => {
    const { renderer, engine, scene } = await setup(runtimeRef, { paths: twoBoxPaths(), objects: twoBoxObjects() });
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-2'], faceKeys: [], edgeKeys: [] });
    const handled = renderer.deleteSceneSelection();
    expect(handled).toBe(true);
    // layer still present, obj-2 gone, obj-1 remains.
    expect(engine.layers.find((l) => l.id === scene.id)).toBeTruthy();
    const ids = scene.params.objects.map((o) => o.id);
    expect(ids).toEqual(['obj-1']);
  });

  test('deleteSceneSelection: face mode clears just the face; object + layer survive', async () => {
    const { renderer, engine, scene } = await setup(runtimeRef, { paths: twoBoxPaths(), objects: twoBoxObjects() });
    renderer.setSceneSelection({ layerId: scene.id, mode: 'face', objectIds: [], faceKeys: ['obj-1/face:+Z'], edgeKeys: [] });
    const handled = renderer.deleteSceneSelection();
    expect(handled).toBe(true);
    expect(renderer.getSceneSelection()).toBeNull();       // face no longer selected
    expect(scene.params.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2']); // nothing deleted
    expect(engine.layers.find((l) => l.id === scene.id)).toBeTruthy();
  });

  test('deleteSceneSelection: no scene selection returns false (layer delete falls through)', async () => {
    const { renderer } = await setup(runtimeRef, { paths: twoBoxPaths(), objects: twoBoxObjects() });
    renderer.setSceneSelection(null);
    expect(renderer.deleteSceneSelection()).toBe(false);
  });

  test('Delete keydown (capture) consumes the event and deletes only the object when a scene object is selected', async () => {
    const { renderer, engine, scene, runtime } = await setup(runtimeRef, { paths: twoBoxPaths(), objects: twoBoxObjects() });
    renderer.setSelection([scene.id], scene.id);
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-2'], faceKeys: [], edgeKeys: [] });
    const evt = new runtime.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    runtime.document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);               // consumed → shortcuts layer-delete won't run
    expect(scene.params.objects.map((o) => o.id)).toEqual(['obj-1']);
    expect(engine.layers.find((l) => l.id === scene.id)).toBeTruthy();
  });

  test('Delete keydown (capture) does NOT consume when no scene-internal selection (layer delete proceeds)', async () => {
    const { renderer, runtime, scene } = await setup(runtimeRef, { paths: twoBoxPaths(), objects: twoBoxObjects() });
    renderer.setSelection([scene.id], scene.id);
    renderer.setSceneSelection(null);
    const evt = new runtime.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    runtime.document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);               // falls through to the normal layer delete
  });
});

// ── I12 fixtures: a "ball" that emits ONLY edges + a hatch fill (no covering
// face), over a large far ground face — the real sphere shape. ──────────────
const ballObjects = () => ([
  { id: 'ball', name: 'Sphere', primitive: 'sphere', params: { radius: 40, detail: 16 },
    transform: { x: 0, y: 40, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
]);
const ballPaths = () => ([
  // ground: a big face covering the whole area, far away.
  P([[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]],
    { kind: 'sceneFace', closed: true, sceneTarget: target({ objectId: 'ground', faceId: 'ground', depth: 200 }) }),
  // ball silhouette as four edge segments (a square 100..180) — NO covering face.
  P([[100, 100], [180, 100]], { kind: 'sceneEdge', sceneTarget: target({ objectId: 'ball', depth: 10, edgeClass: 'silhouette' }) }),
  P([[180, 100], [180, 180]], { kind: 'sceneEdge', sceneTarget: target({ objectId: 'ball', depth: 10, edgeClass: 'silhouette' }) }),
  P([[180, 180], [100, 180]], { kind: 'sceneEdge', sceneTarget: target({ objectId: 'ball', depth: 10, edgeClass: 'silhouette' }) }),
  P([[100, 180], [100, 100]], { kind: 'sceneEdge', sceneTarget: target({ objectId: 'ball', depth: 10, edgeClass: 'silhouette' }) }),
  // a single hatch line near the top (leaves the interior below it empty).
  P([[110, 120], [170, 120]], { kind: 'sceneFill', sceneTarget: target({ objectId: 'ball', depth: 10 }) }),
]);

describe('I12 — a sphere is selectable anywhere inside its projected silhouette', () => {
  const runtimeRef = { current: null };
  afterEach(() => { runtimeRef.current?.cleanup?.(); runtimeRef.current = null; });

  test('interior gap click selects the ball via silhouette, not the ground behind it', async () => {
    const { renderer } = await setup(runtimeRef, { paths: ballPaths(), objects: ballObjects() });
    // (140,150): >9px from every ball edge/fill, so proximity alone misses; it
    // lies inside the ball silhouette but the ground face also covers it.
    const hit = renderer._sceneHitAtPoint({ x: 140, y: 150 }, { mode: 'object' });
    expect(hit).toBeTruthy();
    expect(hit.objectId).toBe('ball');
  });

  test('center click selects the ball', async () => {
    const { renderer } = await setup(runtimeRef, { paths: ballPaths(), objects: ballObjects() });
    const hit = renderer._sceneHitAtPoint({ x: 140, y: 140 }, { mode: 'object' });
    expect(hit && hit.objectId).toBe('ball');
  });

  test('a click outside the ball silhouette does NOT select the ball', async () => {
    const { renderer } = await setup(runtimeRef, { paths: ballPaths(), objects: ballObjects() });
    const hit = renderer._sceneHitAtPoint({ x: 250, y: 250 }, { mode: 'object' });
    // Outside the ball hull — resolves to the ground (or null), never the ball.
    expect(hit ? hit.objectId : null).not.toBe('ball');
  });
});
