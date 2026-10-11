/**
 * RGR — U1 B3: after a scene gizmo drag (whose frames are draft tiers) the
 * release's full-quality render is the gesture's only settle. It must run
 * AFTER the release (deferred, not inside the pointerup handler), and a new
 * drag on the same scene must cancel a still-pending settle.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

describe('scene gizmo release — deferred, cancellable settle render (B3)', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const generate = vi.fn();
    engine.generate = generate;
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params,
      sceneVersion: 1,
      seed: 0,
      objects: [{ id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
      lights: [],
      ground: { enabled: false },
      camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
    };
    scene.paths = [P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
      kind: 'sceneFace', closed: true,
      sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
    })];
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([scene.id], scene.id);
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
    renderer.app = { pushHistory: vi.fn(), history: [{}, {}] };
    return { renderer, scene, generate };
  }

  const rotateDrag = (renderer, scene) => {
    const giz = renderer.getSceneObjectGizmo(scene);
    const c = giz.center;
    const p = giz.axes.find((a) => a.key === 'y').ring[5];
    const hit = renderer.hitSceneObjectGizmo(p.x, p.y, scene);
    renderer.beginSceneObjectGizmoDrag(hit, { clientX: p.x, clientY: p.y });
    const a0 = Math.atan2(p.y - c.y, p.x - c.x);
    const r = Math.hypot(p.x - c.x, p.y - c.y);
    renderer._applySceneObjectGizmoDrag({
      clientX: c.x + Math.cos(a0 + 0.6) * r, clientY: c.y + Math.sin(a0 + 0.6) * r,
    });
  };

  test('release does not render synchronously; the deferred settle renders once, full quality', async () => {
    const { renderer, scene, generate } = await setup();
    rotateDrag(renderer, scene);
    generate.mockClear();
    renderer._endSceneObjectGizmoDrag();
    expect(generate).not.toHaveBeenCalled();
    expect(renderer._sceneSettle && renderer._sceneSettle.layerId).toBe(scene.id);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toBe(scene.id);
    expect(generate.mock.calls[0][1]).toBeUndefined(); // full quality, not a preview
    expect(renderer._sceneSettle).toBeNull();
  });

  test('a new drag on the same scene cancels a pending settle', async () => {
    const { renderer, scene, generate } = await setup();
    rotateDrag(renderer, scene);
    renderer._endSceneObjectGizmoDrag();
    expect(renderer._sceneSettle).toBeTruthy();
    rotateDrag(renderer, scene); // next gesture's first move
    expect(renderer._sceneSettle).toBeNull();
    generate.mockClear();
    renderer._endSceneObjectGizmoDrag();
    expect(renderer.flushSceneSettleRegen()).toBe(true);
    expect(generate.mock.calls.filter((c) => c[1] === undefined)).toHaveLength(1);
  });
});
