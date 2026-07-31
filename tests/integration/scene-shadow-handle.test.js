/**
 * 3D Scene Studio — Phase 2 stream 2B: shadow-as-handle (CONTRACT L2).
 *
 * Fixture-driven: a scene3d layer with a hand-authored cast-shadow sceneFill
 * (meta.kind='sceneFill', sceneTarget.regionClass='castShadow', pickPolygon,
 * casterId). _hitSceneShadow keys on that meta; dragging the shadow re-aims the
 * same sun (params.lights[0]) with one gesture history entry and a draft regen.
 *
 * RGR: _hitSceneShadow / beginSceneShadowDrag do not exist on the base branch.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

// A caster box (obj-1, bbox center (30,30)) + its ground cast-shadow fill
// (square (60,60)-(120,120)) + a plain tone-band face fill (no regionClass).
const makeScenePaths = () => {
  const shadowPoly = [{ x: 60, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 120 }, { x: 60, y: 120 }];
  return [
    P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
      kind: 'sceneFace', closed: true,
      sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
    }),
    P([[62, 90], [118, 90]], {
      kind: 'sceneFill',
      sceneTarget: {
        objectId: 'ground', faceId: 'face:ground', regionClass: 'castShadow',
        casterId: 'obj-1', pickPolygon: shadowPoly, depth: 0, facingUp: true, occluded: false,
      },
    }),
    // A tone-band face fill in the SAME region but WITHOUT regionClass — must be
    // ignored by the shadow hit-test.
    P([[62, 70], [118, 70]], {
      kind: 'sceneFill',
      sceneTarget: {
        objectId: 'obj-2', faceId: 'face:+Z',
        pickPolygon: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }, { x: 200, y: 260 }],
        depth: 5, occluded: false,
      },
    }),
  ];
};

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

describe('3D Scene Studio 2B — shadow-as-handle (CONTRACT L2)', () => {
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
    engine.generate = () => {};
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
    return { renderer, scene };
  }

  test('_hitSceneShadow returns the castShadow fill; a plain fill is ignored', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer._hitSceneShadow({ x: 90, y: 90 }, scene);
    expect(hit).toBeTruthy();
    expect(hit.casterId).toBe('obj-1');
    expect(Array.isArray(hit.pickPolygon)).toBe(true);
    // A point outside every cast-shadow polygon → no hit (the tone-band fill at
    // (200..260) is never a shadow candidate).
    expect(renderer._hitSceneShadow({ x: 230, y: 230 }, scene)).toBeNull();
    expect(renderer._hitSceneShadow({ x: 5, y: 5 }, scene)).toBeNull();
  });

  test('dragging the shadow re-aims the sun with ONE history entry and a draft regen', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer._hitSceneShadow({ x: 90, y: 90 }, scene);
    expect(renderer.beginSceneShadowDrag(hit, { clientX: 90, clientY: 90 })).toBe(true);
    expect(renderer._sceneLightDrag.mode).toBe('shadow');

    const before = { ...scene.params.lights[0] };
    // Drag the shadow tip out to (150, 30) — a long shadow → low sun.
    renderer._applySceneLightDrag({ clientX: 150, clientY: 30 });
    const light = scene.params.lights[0];
    expect(Number.isFinite(light.azimuth)).toBe(true);
    expect(light.azimuth).toBeGreaterThanOrEqual(0);
    expect(light.azimuth).toBeLessThan(360);
    expect(light.elevation).toBeGreaterThanOrEqual(2);
    expect(light.elevation).toBeLessThanOrEqual(88);
    // Something actually changed.
    expect(light.azimuth !== before.azimuth || light.elevation !== before.elevation).toBe(true);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);

    // A longer shadow lowers the sun further than a short one.
    renderer._applySceneLightDrag({ clientX: 40, clientY: 30 }); // short offset from origin (30,30)
    const shortEl = scene.params.lights[0].elevation;
    renderer._applySceneLightDrag({ clientX: 300, clientY: 30 }); // long offset
    const longEl = scene.params.lights[0].elevation;
    expect(longEl).toBeLessThan(shortEl);
    // Still one gesture-scoped history entry across all moves.
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);

    // Release cancels the coalesced draft-regen rAF (test hygiene).
    renderer.endSceneLightDrag();
  });

  test('shadow-drag aims the sun OPPOSITE the shadow direction (pins the azimuth sign)', async () => {
    const { renderer, scene } = await setup();
    // Caster origin is obj-1's path bbox center (30,30); camera yaw 0.
    const hit = renderer._hitSceneShadow({ x: 90, y: 90 }, scene);
    renderer.beginSceneShadowDrag(hit, { clientX: 30, clientY: 30 });
    // Drag the shadow toward +X (screen-right). The sun must sit OPPOSITE the
    // shadow → world −X → azimuth 270°. A flipped atan2 sign would give 90°.
    renderer._applySceneLightDrag({ clientX: 130, clientY: 30 });
    expect(scene.params.lights[0].azimuth).toBeCloseTo(270, 0);
    renderer.endSceneLightDrag();

    // Drag the shadow toward −X (screen-left) → sun at world +X → azimuth 90°.
    renderer.beginSceneShadowDrag(hit, { clientX: 30, clientY: 30 });
    renderer._applySceneLightDrag({ clientX: -70, clientY: 30 });
    expect(scene.params.lights[0].azimuth).toBeCloseTo(90, 0);
    renderer.endSceneLightDrag();
  });

  test('Escape mid shadow-drag restores the pre-drag sun', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer._hitSceneShadow({ x: 90, y: 90 }, scene);
    renderer.beginSceneShadowDrag(hit, { clientX: 90, clientY: 90 });
    renderer._applySceneLightDrag({ clientX: 150, clientY: 30 });
    expect(renderer._cancelSceneLightDrag()).toBe(true);
    expect(scene.params.lights[0].azimuth).toBe(135);
    expect(scene.params.lights[0].elevation).toBe(45);
  });
});
