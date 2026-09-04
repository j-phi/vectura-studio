/**
 * 3D Scene Studio — renderer bridges for the ctxbar scene fixes.
 *
 *  - I20: setSceneFaceStyle writes styleTable.byFace at FACE scope only (the
 *    layer pen and other objects are never touched), and getSceneFaceResolvedStyle
 *    resolves byFace > byObject > scene.
 *  - I22: setSceneObjectPrimitive mutates obj.primitive + resets the params bag
 *    to the new primitive's defaults, with ONE history entry, and rejects an
 *    unknown primitive name.
 *
 * Uses the bare engine + renderer (real StyleCascade / Params modules load from
 * index.html); the 1A scene3d algorithm is stubbed so regen never overwrites the
 * fixture object records.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const makeSceneParams = () => ({
  sceneVersion: 1, seed: 0,
  objects: [
    { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
    { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 30, y: 0, z: 30, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
  ],
  lights: [], ground: { enabled: true }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('Scene ctxbar renderer bridges (I20 face-style scope, I22 primitive swap)', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const V = runtime.window.Vectura;
    V.Algorithms = V.Algorithms || {};
    V.Algorithms.scene3d = { generate: () => [] };
    const engine = new V.VectorEngine();
    engine.layers = [];
    const scene = new V.Layer('scene-1', 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...makeSceneParams() };
    engine.layers.push(scene);
    engine.activeLayerId = scene.id;
    const renderer = new V.Renderer('main-canvas', engine);
    const app = { history: ['initial'], pushHistory() { this.history.push('snap'); } };
    renderer.app = app;
    return { renderer, engine, scene, app, V };
  }

  test('I20: setSceneFaceStyle writes byFace only — layer pen + other object untouched', async () => {
    const { renderer, scene, app } = await setup();
    const penBefore = scene.penId; // fresh layer carries a default pen
    const before = app.history.length;
    const ok = renderer.setSceneFaceStyle(scene.id, ['obj-1/2'], { penId: 'pen-a' });
    expect(ok).toBe(true);
    expect(scene.params.styleTable.byFace['obj-1/2'].penId).toBe('pen-a');
    // No object-scope or scene-scope leakage; the layer pen is never touched.
    expect(scene.params.styleTable.byObject['obj-1']).toBeUndefined();
    expect(scene.params.styleTable.scene.penId).toBeNull();
    expect(scene.penId).toBe(penBefore);
    expect(renderer.getSceneObjectResolvedStyle(scene.id, 'obj-2').penId).toBeFalsy();
    expect(app.history.length).toBe(before + 1); // one undo
  });

  test('I20: getSceneFaceResolvedStyle resolves byFace over byObject over scene', async () => {
    const { renderer, scene } = await setup();
    renderer.setSceneObjectStyle(scene.id, ['obj-1'], { penId: 'pen-obj' });
    // With only a byObject override, the face inherits it.
    expect(renderer.getSceneFaceResolvedStyle(scene.id, 'obj-1/2').penId).toBe('pen-obj');
    // A byFace override wins for that face; siblings still see the object pen.
    renderer.setSceneFaceStyle(scene.id, ['obj-1/2'], { penId: 'pen-face' });
    expect(renderer.getSceneFaceResolvedStyle(scene.id, 'obj-1/2').penId).toBe('pen-face');
    expect(renderer.getSceneFaceResolvedStyle(scene.id, 'obj-1/5').penId).toBe('pen-obj');
  });

  test('I22: setSceneObjectPrimitive swaps primitive + resets params, one undo', async () => {
    const { renderer, scene, app } = await setup();
    const before = app.history.length;
    const ok = renderer.setSceneObjectPrimitive(scene.id, ['obj-1'], 'sphere');
    expect(ok).toBe(true);
    const obj = scene.params.objects.find((o) => o.id === 'obj-1');
    expect(obj.primitive).toBe('sphere');
    // Params reset to the sphere defaults (box sx/sy/sz gone).
    expect(obj.params.radius).toBeDefined();
    expect(obj.params.sx).toBeUndefined();
    expect(scene.params.objects.find((o) => o.id === 'obj-2').primitive).toBe('box');
    expect(app.history.length).toBe(before + 1);
  });

  test('I22: an unknown primitive name is rejected (no mutation, no history)', async () => {
    const { renderer, scene, app } = await setup();
    const before = app.history.length;
    expect(renderer.setSceneObjectPrimitive(scene.id, ['obj-1'], 'notashape')).toBe(false);
    expect(scene.params.objects[0].primitive).toBe('box');
    expect(app.history.length).toBe(before);
  });
});
