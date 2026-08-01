/**
 * 3D Scene Studio — Phase 2 stream 2B: the sun widget (CONTRACT L1).
 *
 * Fixture-driven over the REAL renderer: a scene3d layer with hand-authored
 * CONTRACT B paths (a bbox to anchor the widget) and a CONTRACT L1
 * params.lights[0]. Stream 2A (Scene3D.Lighting) is absent in this tree, so
 * the local lightWorldDir fallback is exercised — the overlay still draws and
 * the drag round-trips.
 *
 * RGR: hitSceneLight / beginSceneLightDrag / _applySceneLightDrag /
 * getSceneLightControl / _cancelSceneLightDrag do not exist on the base branch,
 * so this file fails before 2B and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

const makeScenePaths = () => [
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
    kind: 'sceneFace',
    closed: true,
    sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
  }),
];

const makeSceneParams = () => ({
  sceneVersion: 1,
  seed: 0,
  objects: [
    { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
  ],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: true },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('3D Scene Studio 2B — sun widget (CONTRACT L1)', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    engine.generate = () => {}; // isolate from the absent scene3d algorithm
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...makeSceneParams() };
    scene.paths = makeScenePaths();
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([scene.id], scene.id);
    renderer.app = { pushHistory: vi.fn(), history: [{}, {}] };
    return { renderer, engine, scene };
  }

  test('the local lightWorldDir fallback (2A absent) matches L1', async () => {
    const { renderer } = await setup();
    // Force the absent-2A branch even in the integrated tree: stash
    // Scene3D.Lighting so _lightWorldDir must use its local fallback.
    const Scene3D = runtime.window.Vectura.Scene3D;
    const savedLighting = Scene3D && Scene3D.Lighting;
    if (Scene3D) delete Scene3D.Lighting;
    try {
      // az=0, el=90 → straight down (travel dir d.y < 0).
      const d = renderer._lightWorldDir({ azimuth: 0, elevation: 90 });
      expect(d.x).toBeCloseTo(0, 5);
      expect(d.y).toBeCloseTo(-1, 5);
      expect(d.z).toBeCloseTo(0, 5);
      // The widget still has a drawable control despite 2A being absent.
      const control = renderer.getSceneLightControl(renderer.engine.layers[0]);
      expect(control).toBeTruthy();
      expect(Number.isFinite(control.pos.x)).toBe(true);
      // Cross-stream contract: the fallback must agree with 2A's helper for a
      // non-trivial angle, so swapping 2A in/out never shifts the sun.
      if (savedLighting) {
        const fallbackDir = renderer._lightWorldDir({ azimuth: 135, elevation: 45 });
        const helperDir = savedLighting.lightWorldDir({ azimuth: 135, elevation: 45 });
        expect(fallbackDir.x).toBeCloseTo(helperDir.x, 6);
        expect(fallbackDir.y).toBeCloseTo(helperDir.y, 6);
        expect(fallbackDir.z).toBeCloseTo(helperDir.z, 6);
      }
    } finally {
      if (Scene3D && savedLighting) Scene3D.Lighting = savedLighting;
    }
  });

  test('with 2A present, _lightWorldDir delegates to Scene3D.Lighting.lightWorldDir', async () => {
    const { renderer } = await setup();
    const Lighting = runtime.window.Vectura.Scene3D
      && runtime.window.Vectura.Scene3D.Lighting;
    expect(Lighting && typeof Lighting.lightWorldDir).toBe('function');
    const light = { azimuth: 135, elevation: 45 };
    const viaRenderer = renderer._lightWorldDir(light);
    const viaHelper = Lighting.lightWorldDir(light);
    expect(viaRenderer.x).toBeCloseTo(viaHelper.x, 6);
    expect(viaRenderer.y).toBeCloseTo(viaHelper.y, 6);
    expect(viaRenderer.z).toBeCloseTo(viaHelper.z, 6);
  });

  test('hitSceneLight lands on the handle; dragging writes azimuth/elevation with ONE history entry', async () => {
    const { renderer, scene } = await setup();
    const control = renderer.getSceneLightControl(scene);
    expect(control).toBeTruthy();

    const hit = renderer.hitSceneLight(control.pos.x, control.pos.y, scene);
    expect(hit).toBeTruthy();
    expect(hit.type).toBe('widget');
    // A point far from the handle misses.
    expect(renderer.hitSceneLight(control.pos.x + 500, control.pos.y, scene)).toBeNull();

    expect(renderer.beginSceneLightDrag(hit, { clientX: control.pos.x, clientY: control.pos.y })).toBe(true);
    expect(renderer._sceneLightDrag).toBeTruthy();
    expect(renderer._sceneLightDrag.mode).toBe('widget');

    const cx = control.center.x;
    const cy = control.center.y;
    const R = control.baseR;
    // The handle sits where the sun IS in the view (its toward-sun direction is
    // projected through the same camera). "Dragging" it back to its own screen
    // position must round-trip the light essentially unchanged.
    renderer._applySceneLightDrag({ clientX: control.pos.x, clientY: control.pos.y });
    expect(scene.params.lights[0].azimuth).toBeCloseTo(135, 0);
    expect(scene.params.lights[0].elevation).toBeCloseTo(45, 0);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    // Draft regen coalesced onto the shared rAF scheduler.
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);

    // Elevation reads as ON-SCREEN HEIGHT (Jay's contract: a smaller elevation
    // number sits lower). Dragging the handle HIGHER (smaller canvas Y) raises
    // the sun above where dragging it LOWER puts it — one continuous gesture.
    renderer._applySceneLightDrag({ clientX: cx, clientY: cy - R * 0.9 });
    const highEl = scene.params.lights[0].elevation;
    renderer._applySceneLightDrag({ clientX: cx, clientY: cy - R * 0.15 });
    const lowEl = scene.params.lights[0].elevation;
    expect(highEl).toBeGreaterThan(lowEl);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);

    // Release cancels the coalesced draft-regen rAF (test hygiene).
    renderer.endSceneLightDrag();
  });

  test('Escape mid-drag restores the pre-drag azimuth/elevation', async () => {
    const { renderer, scene } = await setup();
    const control = renderer.getSceneLightControl(scene);
    const hit = renderer.hitSceneLight(control.pos.x, control.pos.y, scene);
    renderer.beginSceneLightDrag(hit, { clientX: control.pos.x, clientY: control.pos.y });
    renderer._applySceneLightDrag({ clientX: control.center.x + control.baseR * 0.65, clientY: control.center.y });
    expect(scene.params.lights[0].azimuth).not.toBe(135);

    expect(renderer._cancelSceneLightDrag()).toBe(true);
    expect(renderer._sceneLightDrag).toBeNull();
    expect(scene.params.lights[0].azimuth).toBe(135);
    expect(scene.params.lights[0].elevation).toBe(45);
  });

  test('regression: the widget only arms for a selected scene3d layer', async () => {
    const { renderer, scene } = await setup();
    // No scene layer selected → no light layer, no control.
    renderer.setSelection([], null);
    expect(renderer._sceneLightLayer()).toBeNull();
    expect(renderer.getSceneLightControl()).toBeNull();
    // Re-selecting restores it.
    renderer.setSelection([scene.id], scene.id);
    expect(renderer._sceneLightLayer()).toBe(scene);
  });
});
