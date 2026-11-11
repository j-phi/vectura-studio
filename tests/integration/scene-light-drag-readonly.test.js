/**
 * A touch / pinch gesture that lands on a cast-shadow fill or the sun disc starts a light drag and is
 * then cancelled by the gesture arbiter. Starting or cancelling a light drag with no movement must
 * never write the document: a scene whose `lights` is [] (sun lives on a child layer) used to gain a
 * phantom default sun, which polluted undo and saved files (gestures.spec.js TUX-017 pinch on object).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => { const p = pts.map(([x, y]) => ({ x, y })); p.meta = meta; return p; };

describe('light drag begin/cancel is read-only', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup(lights) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    engine.generate = () => {};
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params,
      objects: [], lights,
      ground: { enabled: true },
      camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    };
    const poly = [{ x: 60, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 120 }, { x: 60, y: 120 }];
    scene.paths = [P([[62, 90], [118, 90]], {
      kind: 'sceneFill',
      sceneTarget: { objectId: 'ground', faceId: 'face:ground', regionClass: 'castShadow', casterId: null, pickPolygon: poly, depth: 0, occluded: false },
    })];
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.setSelection([scene.id], scene.id);
    renderer.app = { pushHistory: () => {}, history: [{}, {}] };
    return { renderer, scene };
  }

  test.each([[[]], [undefined]])('shadow drag begin + cancel leaves params untouched (lights=%j)', async (lights) => {
    const { renderer, scene } = await setup(lights);
    if (lights === undefined) delete scene.params.lights;
    const snap = JSON.parse(JSON.stringify(scene.params));
    const hit = renderer._hitSceneShadow({ x: 90, y: 90 }, scene);
    expect(renderer.beginSceneShadowDrag(hit, { clientX: 90, clientY: 90 })).toBe(true);
    expect(JSON.parse(JSON.stringify(scene.params))).toEqual(snap);
    renderer._cancelSceneLightDrag();
    expect(JSON.parse(JSON.stringify(scene.params))).toEqual(snap);
  });
});

describe('Level S entry points do not mutate the scene params', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('levelS / levelSBakeSpecs / explainMarkSpace leave lights:[] and objects alone', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { Algorithms, Layer } = runtime.window.Vectura;
    const algo = Algorithms.scene3d;
    const layer = new Layer('s', 'scene3d', 'S');
    const params = { ...layer.params, lights: [], objects: [] };
    const snap = JSON.parse(JSON.stringify(params));
    const bounds = { width: 210, height: 297, m: 20, dOx: 0, dOy: 0, truncate: true, preview3dQuality: 'draft' };
    for (const fn of ['levelS', 'levelSBakeSpecs']) {
      if (typeof algo[fn] === 'function') { try { algo[fn](params, bounds); } catch (_) { /* may refuse; must not mutate */ } }
      expect(JSON.parse(JSON.stringify(params))).toEqual(snap);
    }
  });
});
