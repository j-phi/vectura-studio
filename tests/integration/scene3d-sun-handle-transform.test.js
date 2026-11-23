/**
 * The on-canvas sun handle must follow the Scene group's Transform (Rotation / Scale / Pos), both where it is
 * drawn and when it is dragged. Identity transform is unchanged.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => { const p = pts.map(([x, y]) => ({ x, y })); p.meta = meta; return p; };

describe('sun handle under the Scene Transform', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup(xf = {}, light = { azimuth: 40, elevation: 35 }, camera = {}) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    engine.generate = () => {};
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params, objects: [], ...xf,
      lights: [{ id: 'sun', type: 'directional', castShadows: true, ...light }],
      ground: { enabled: true },
      camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...camera },
    };
    scene.paths = [P([[10, 10], [110, 10], [110, 110], [10, 110], [10, 10]], {
      kind: 'sceneFace', closed: true, sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
    })];
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.setSelection([scene.id], scene.id);
    renderer.app = { pushHistory: () => {}, history: [{}, {}] };
    return { renderer, scene, engine };
  }

  const rot = (v, deg, s = 1) => {
    const a = deg * Math.PI / 180;
    return { x: s * (v.x * Math.cos(a) - v.y * Math.sin(a)), y: s * (v.x * Math.sin(a) + v.y * Math.cos(a)) };
  };

  test('rotation 90 turns the handle offset; identity is unchanged', async () => {
    const id = await setup();
    const c0 = id.renderer.getSceneLightControl(id.scene);
    const off0 = { x: c0.pos.x - c0.center.x, y: c0.pos.y - c0.center.y };
    runtime.cleanup(); runtime = null;
    const r = await setup({ rotation: 90 });
    const c1 = r.renderer.getSceneLightControl(r.scene);
    const off1 = { x: c1.pos.x - c1.center.x, y: c1.pos.y - c1.center.y };
    const want = rot(off0, 90);
    expect(off1.x).toBeCloseTo(want.x, 4);
    expect(off1.y).toBeCloseTo(want.y, 4);
    expect(c1.z).toBeCloseTo(c0.z, 6);
  });

  test.each([
    ['rotation', { rotation: 90 }],
    ['rotation+pos+scale', { rotation: 35, posX: 20, posY: -15, scaleX: 1.5, scaleY: 1.5 }],
  ])('a drag to the transformed handle position round-trips az/el (%s)', async (_n, xf) => {
    const { renderer, scene } = await setup(xf);
    const c = renderer.getSceneLightControl(scene);
    const hit = renderer.hitSceneLight(c.pos.x, c.pos.y, scene);
    expect(hit).toBeTruthy();
    expect(renderer.beginSceneLightDrag(hit, { clientX: c.pos.x, clientY: c.pos.y })).toBe(true);
    renderer._applySceneLightDrag({ clientX: c.pos.x + 0.01, clientY: c.pos.y });
    const l = scene.params.lights[0];
    expect(l.azimuth).toBeCloseTo(40, 0);
    expect(l.elevation).toBeCloseTo(35, 0);
    // drag to where a different light (az 70, el 50) would sit
    const ref = await (async () => { const o = await setup(xf, { azimuth: 70, elevation: 50 }); return o.renderer.getSceneLightControl(o.scene); })();
    const tgt = ref.pos;
    renderer._applySceneLightDrag({ clientX: tgt.x, clientY: tgt.y });
    expect(scene.params.lights[0].azimuth).toBeCloseTo(70, 0);
    expect(scene.params.lights[0].elevation).toBeCloseTo(50, 0);
    renderer.endSceneLightDrag();
  });

  test('a child-light layer gizmo (directional) follows the Scene rotation', async () => {
    const make = async (rotation) => {
      runtime = await loadVecturaRuntime({ includeRenderer: true });
      const { VectorEngine, Renderer } = runtime.window.Vectura;
      const engine = new VectorEngine();
      engine.layers = [];
      const gid = engine.addLayer('scene3d');
      engine.generate(gid);
      const group = engine.getLayerById(gid);
      const lightChild = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneLight3d');
      Object.assign(lightChild.params, { azimuth: 40, elevation: 35 });
      group.params.camera = { ...group.params.camera, yaw: 0, pitch: -20, roll: 0 };
      group.params.rotation = rotation;
      engine.generate(gid);
      const renderer = new Renderer('main-canvas', engine);
      renderer.setTool('select');
      renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
      renderer.setSelection([lightChild.id], lightChild.id);
      const g = renderer.getSceneLightGizmo();
      return g;
    };
    const g0 = await make(0);
    expect(g0 && g0.center).toBeTruthy();
    const off0 = { x: g0.center.x - g0.anchorCenter.x, y: g0.center.y - g0.anchorCenter.y };
    runtime.cleanup(); runtime = null;
    const g1 = await make(90);
    const off1 = { x: g1.center.x - g1.anchorCenter.x, y: g1.center.y - g1.anchorCenter.y };
    const want = rot(off0, 90);
    expect(off1.x).toBeCloseTo(want.x, 3);
    expect(off1.y).toBeCloseTo(want.y, 3);
  });
});
