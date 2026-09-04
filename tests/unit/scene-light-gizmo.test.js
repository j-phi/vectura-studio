/**
 * 3D Scene Studio — Unit 1b: the selected-light 3-axis TRANSLATE gizmo.
 *
 * Fixture-driven over the REAL renderer. A scene3d layer carries positional
 * (point/spot) + directional lights; the panel mirrors a selection here via
 * setSelectedSceneLight → layer._selectedLightId, which arms the gizmo.
 *
 * RGR: getSceneLightGizmo / hitSceneLightGizmo / beginSceneLightGizmoDrag /
 * _applySceneLightGizmoDrag / restoreSceneLight / setSelectedSceneLight do not
 * exist before Unit 1b, so this file fails on the base branch and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

// A drawn box gives the scene an anchor (bbox) the directional gizmo needs.
const makeScenePaths = () => [
  P([[80, 80], [160, 80], [160, 160], [80, 160], [80, 80]], {
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
  lights: [
    { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true },
    { id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 1, castShadows: true },
    { id: 's1', type: 'spot', position: { x: 100, y: 150, z: 100 }, target: { x: 0, y: 0, z: 0 },
      range: 400, coneAngle: 30, penumbra: 8, intensity: 1, castShadows: true },
  ],
  ground: { enabled: true },
  camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('3D Scene Studio 1b — selected-light 3-axis translate gizmo', () => {
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
    engine.generate = () => {}; // isolate from the scene3d algorithm
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

  test('no gizmo until a light is explicitly selected', async () => {
    const { renderer, scene } = await setup();
    expect(renderer.getSceneLightGizmo(scene)).toBeNull();
    renderer.setSelectedSceneLight(scene.id, 'p1');
    expect(renderer.getSceneLightGizmo(scene)).toBeTruthy();
  });

  test('point-light gizmo sits at the projected world position', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelectedSceneLight(scene.id, 'p1');
    const giz = renderer.getSceneLightGizmo(scene);
    expect(giz).toBeTruthy();
    expect(giz.lightType).toBe('point');
    const proj = renderer._sceneProjectWorld(scene, scene.params.lights[1].position);
    expect(proj).toBeTruthy();
    expect(giz.center.x).toBeCloseTo(proj.x, 5);
    expect(giz.center.y).toBeCloseTo(proj.y, 5);
    // Three world axes, each with a distinct tip.
    expect(giz.axes.map((a) => a.key).sort()).toEqual(['x', 'y', 'z']);
  });

  test('dragging the X handle increases the point light position.x, one history push', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelectedSceneLight(scene.id, 'p1');
    const giz = renderer.getSceneLightGizmo(scene);
    const xAxis = giz.axes.find((a) => a.key === 'x');

    const hit = renderer.hitSceneLightGizmo(xAxis.tip.x, xAxis.tip.y, scene);
    expect(hit).toEqual({ type: 'move', axis: 'x' });

    const before = scene.params.lights[1].position.x;
    expect(renderer.beginSceneLightGizmoDrag(hit, { clientX: xAxis.tip.x, clientY: xAxis.tip.y })).toBe(true);
    expect(renderer._sceneLightGizmoDrag).toBeTruthy();
    // Drag 40 doc-units to the right (camYaw 0 → world +x).
    renderer._applySceneLightGizmoDrag({ clientX: xAxis.tip.x + 40, clientY: xAxis.tip.y });
    expect(scene.params.lights[1].position.x).toBeCloseTo(before + 40, 3);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);

    renderer._endSceneLightGizmoDrag();
    expect(renderer._sceneLightGizmoDrag).toBeNull();
    expect(renderer._sceneDragRegenRaf).toBeNull();
  });

  test('Escape mid point-drag restores the pre-drag position and pops history', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelectedSceneLight(scene.id, 'p1');
    const giz = renderer.getSceneLightGizmo(scene);
    const xAxis = giz.axes.find((a) => a.key === 'x');
    const hit = renderer.hitSceneLightGizmo(xAxis.tip.x, xAxis.tip.y, scene);
    renderer.beginSceneLightGizmoDrag(hit, { clientX: xAxis.tip.x, clientY: xAxis.tip.y });
    renderer._applySceneLightGizmoDrag({ clientX: xAxis.tip.x + 60, clientY: xAxis.tip.y });
    expect(scene.params.lights[1].position.x).not.toBe(120);
    expect(renderer._cancelSceneLightGizmoDrag()).toBe(true);
    expect(renderer._sceneLightGizmoDrag).toBeNull();
    expect(scene.params.lights[1].position.x).toBe(120);
  });

  test('spot gizmo exposes a cone-axis tip toward the target', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelectedSceneLight(scene.id, 's1');
    const giz = renderer.getSceneLightGizmo(scene);
    expect(giz.lightType).toBe('spot');
    expect(giz.coneTip).toBeTruthy();
    const projTarget = renderer._sceneProjectWorld(scene, scene.params.lights[2].target);
    expect(giz.coneTip.x).toBeCloseTo(projTarget.x, 5);
  });

  test('directional gizmo re-derives azimuth/elevation from a handle drag', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelectedSceneLight(scene.id, 'sun');
    const giz = renderer.getSceneLightGizmo(scene);
    expect(giz.lightType).toBe('directional');
    const xAxis = giz.axes.find((a) => a.key === 'x');
    const hit = renderer.hitSceneLightGizmo(xAxis.tip.x, xAxis.tip.y, scene);
    expect(hit).toEqual({ type: 'move', axis: 'x' });
    renderer.beginSceneLightGizmoDrag(hit, { clientX: xAxis.tip.x, clientY: xAxis.tip.y });
    renderer._applySceneLightGizmoDrag({ clientX: xAxis.tip.x + 30, clientY: xAxis.tip.y });
    // az/el stay finite + in-range (the sun re-aims; it never stores a position).
    const l = scene.params.lights[0];
    expect(Number.isFinite(l.azimuth)).toBe(true);
    expect(l.elevation).toBeGreaterThanOrEqual(0);
    expect(l.elevation).toBeLessThanOrEqual(90);
    expect(l.position).toBeUndefined();
    renderer._endSceneLightGizmoDrag();
  });

  test('restore handle + restoreSceneLight reset a moved point light to default', async () => {
    const { renderer, scene } = await setup();
    scene.params.lights[1].position = { x: -300, y: 50, z: 400 };
    scene.params.lights[1].range = 900;
    renderer.setSelectedSceneLight(scene.id, 'p1');
    const giz = renderer.getSceneLightGizmo(scene);
    // The restore handle is hittable and performs the reset on pointer-down.
    const rhit = renderer.hitSceneLightGizmo(giz.restore.x, giz.restore.y, scene);
    expect(rhit).toEqual({ type: 'restore' });
    expect(renderer.beginSceneLightGizmoDrag(rhit, { clientX: giz.restore.x, clientY: giz.restore.y })).toBe(true);
    expect(scene.params.lights[1].position).toEqual({ x: 120, y: 200, z: 120 });
    expect(scene.params.lights[1].range).toBe(400);
    expect(renderer._sceneLightGizmoDrag).toBeNull(); // restore does NOT start a drag
  });

  test('projection consolidation: Scene.projectWorldPoint == assembleScene.projectWorld (drift pin)', async () => {
    // The renderer gizmo's _sceneProjectWorld now delegates to the SAME shared
    // Scene.projectWorldPoint the mesh assembly uses (buildProjOpts). Pin that
    // the shared helper reproduces assembleScene's own projectWorld exactly, so
    // the two projections can never silently drift apart again.
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const V = runtime.window.Vectura;
    const worlds = [
      { x: 120, y: 200, z: 120 }, { x: 0, y: 0, z: 0 },
      { x: -88, y: 33, z: 210 }, { x: 300, y: -40, z: -150 },
    ];
    ['orthographic', 'perspective'].forEach((projection) => {
      const raw = makeSceneParams();
      raw.camera = { ...raw.camera, projection, yaw: 22, pitch: -18, roll: 7, zoom: 1.4 };
      const p = V.Scene3D.Params.normalizeParams(raw);
      const bounds = { width: 320, height: 240, penWidth: 0.3 };
      const scene = V.Scene3D.Scene.assembleScene(p, bounds);
      worlds.forEach((w) => {
        const a = scene.projectWorld(w);
        const b = V.Scene3D.Scene.projectWorldPoint(w, p.camera, bounds);
        expect(b).toBeTruthy();
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
        expect(b.z).toBeCloseTo(a.z, 9);
      });
    });
  });

  test('restoreSceneLight resets a directional sun to az135/el45', async () => {
    const { renderer, scene } = await setup();
    scene.params.lights[0].azimuth = 12;
    scene.params.lights[0].elevation = 80;
    expect(renderer.restoreSceneLight(scene, 'sun')).toBe(true);
    expect(scene.params.lights[0].azimuth).toBe(135);
    expect(scene.params.lights[0].elevation).toBe(45);
  });
});
