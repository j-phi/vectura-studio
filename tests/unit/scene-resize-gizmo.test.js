/**
 * 3D Scene Studio — on-canvas uniform-scale resize gizmo.
 *
 * Fixture-driven over the REAL renderer: a scene3d layer whose selected object
 * has hand-authored projected paths (a bbox to anchor the corner handles).
 * hitSceneResize / beginSceneResizeDrag / _applySceneResizeDrag /
 * _cancelSceneResizeDrag do not exist on the base branch, so this file fails
 * before the gizmo and passes after (RGR).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

// A box (obj-1) whose projected silhouette is the square (10,10)-(50,50):
// bbox center (30,30), corners at the four extremes.
const makeScenePaths = () => [
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
    kind: 'sceneFace', closed: true,
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

describe('3D Scene Studio — uniform-scale resize gizmo', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup(sel = { mode: 'object', objectIds: ['obj-1'] }) {
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
    if (sel) renderer.setSceneSelection({ layerId: scene.id, ...sel });
    renderer.app = { pushHistory: vi.fn(), history: [{}, {}] };
    return { renderer, scene, engine };
  }

  test('hitSceneResize lands on a corner handle; a far point misses', async () => {
    const { renderer, scene } = await setup();
    // se corner is at (50,50). scale=1/offset=0 → world === screen.
    const hit = renderer.hitSceneResize(50, 50, scene);
    expect(hit).toBeTruthy();
    expect(hit.handle).toBe('se');
    expect(renderer.hitSceneResize(30, 30, scene)).toBeNull(); // centre, not a handle
    expect(renderer.hitSceneResize(500, 500, scene)).toBeNull();
  });

  test('dragging a corner OUT grows uniform scale with ONE history entry + a draft regen', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer.hitSceneResize(50, 50, scene);
    expect(renderer.beginSceneResizeDrag(hit, { clientX: 50, clientY: 50 })).toBe(true);

    // Centre (30,30); grabbed corner at dist √800≈28.28. Drag to (70,70):
    // dist √3200≈56.57 → ratio 2 → scale 1 → 2.
    renderer._applySceneResizeDrag({ clientX: 70, clientY: 70 });
    expect(scene.params.objects[0].transform.scale).toBeCloseTo(2, 1);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);

    // A second move keeps the single gesture history entry.
    renderer._applySceneResizeDrag({ clientX: 45, clientY: 45 });
    // dist √450≈21.2 → ratio 0.75 → scale 0.75.
    expect(scene.params.objects[0].transform.scale).toBeCloseTo(0.75, 1);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);

    renderer._endSceneResizeDrag();
    expect(renderer._sceneResizeDrag).toBeNull();
  });

  test('scale is clamped to the inspector slider range [0.1, 5]', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer.hitSceneResize(50, 50, scene);
    renderer.beginSceneResizeDrag(hit, { clientX: 50, clientY: 50 });
    // Drag the corner right onto the centre → ratio ~0 → clamp to 0.1.
    renderer._applySceneResizeDrag({ clientX: 30, clientY: 30 });
    expect(scene.params.objects[0].transform.scale).toBe(0.1);
    // Drag far out → clamp to 5 (not 20, so the value round-trips to the slider).
    renderer._applySceneResizeDrag({ clientX: 900, clientY: 900 });
    expect(scene.params.objects[0].transform.scale).toBe(5);
    renderer._endSceneResizeDrag();
  });

  test('grabbing OFF the exact corner (within the hit radius) does not snap the scale', async () => {
    const { renderer, scene } = await setup();
    // se corner is (50,50); grab at (57,57) — ~9.9px out, still inside R=10.
    const hit = renderer.hitSceneResize(57, 57, scene);
    expect(hit && hit.handle).toBe('se');
    renderer.beginSceneResizeDrag(hit, { clientX: 57, clientY: 57 });
    // A small 2px outward nudge should grow the scale only slightly — NOT jump to
    // the ~1.35 the old corner-anchored ratio produced at the grab point.
    renderer._applySceneResizeDrag({ clientX: 59, clientY: 59 });
    const s = scene.params.objects[0].transform.scale;
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThan(1.15);
    renderer._endSceneResizeDrag();
  });

  test('Escape mid-drag restores the pre-drag scale and pops the history entry', async () => {
    const { renderer, scene } = await setup();
    const hit = renderer.hitSceneResize(50, 50, scene);
    renderer.beginSceneResizeDrag(hit, { clientX: 50, clientY: 50 });
    renderer._applySceneResizeDrag({ clientX: 70, clientY: 70 });
    expect(scene.params.objects[0].transform.scale).not.toBe(1);

    expect(renderer._cancelSceneResizeDrag()).toBe(true);
    expect(renderer._sceneResizeDrag).toBeNull();
    expect(scene.params.objects[0].transform.scale).toBe(1);
  });

  // ── Box face-pull ─────────────────────────────────────────────────────────
  // obj-1 gets a front face (+Z) and a right side face (+X). Object bbox center
  // is (40,30); the +X face centroid is (60,30), 20 to its right.
  const facePaths = () => [
    P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
      kind: 'sceneFace', closed: true,
      sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
    }),
    P([[50, 20], [70, 20], [70, 40], [50, 40], [50, 20]], {
      kind: 'sceneFace', closed: true,
      sceneTarget: { objectId: 'obj-1', faceId: 'face:+X', depth: 8, occluded: false },
    }),
  ];

  test('face-pull knob hit-tests; dragging a box face OUT grows that axis (sx) with one undo', async () => {
    const { renderer, scene } = await setup({ mode: 'face', faceKeys: ['obj-1/face:+X'] });
    scene.paths = facePaths();

    const fp = renderer._sceneFacePull(scene);
    expect(fp).toBeTruthy();
    expect(fp.axisKey).toBe('sx');
    // +X centroid (60,30); a far point misses.
    const hit = renderer.hitSceneFacePull(60, 30, scene);
    expect(hit).toBeTruthy();
    expect(renderer.hitSceneFacePull(200, 200, scene)).toBeNull();

    expect(renderer.beginSceneFacePullDrag(hit, { clientX: 60, clientY: 30 })).toBe(true);
    // Object centre (40,30); knob dist 20. Drag to (80,30): dist 40 → ratio 2 →
    // sx 40 → 80.
    renderer._applySceneFacePullDrag({ clientX: 80, clientY: 30 });
    expect(scene.params.objects[0].params.sx).toBeCloseTo(80, 0);
    // The linked/other axes are untouched (box faces are independent).
    expect(scene.params.objects[0].params.sy).toBe(40);
    expect(scene.params.objects[0].params.sz).toBe(40);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);

    renderer._endSceneFacePullDrag();
    expect(renderer._sceneFacePullDrag).toBeNull();
  });

  test('face-pull Escape restores the pre-drag dimension and pops history', async () => {
    const { renderer, scene } = await setup({ mode: 'face', faceKeys: ['obj-1/face:+X'] });
    scene.paths = facePaths();
    const hit = renderer.hitSceneFacePull(60, 30, scene);
    renderer.beginSceneFacePullDrag(hit, { clientX: 60, clientY: 30 });
    renderer._applySceneFacePullDrag({ clientX: 80, clientY: 30 });
    expect(scene.params.objects[0].params.sx).not.toBe(40);
    expect(renderer._cancelSceneFacePullDrag()).toBe(true);
    expect(scene.params.objects[0].params.sx).toBe(40);
  });

  test('face-pull knob is suppressed for a face that projects face-on (no pull direction)', async () => {
    const { renderer, scene } = await setup({ mode: 'face', faceKeys: ['obj-1/face:+Z'] });
    // The +Z face fills the whole silhouette → its bbox centre equals the object
    // centre, so there is no outward screen direction to pull along.
    scene.paths = [
      P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
        kind: 'sceneFace', closed: true,
        sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
      }),
    ];
    expect(renderer._sceneFacePull(scene)).toBeNull();
    expect(renderer.hitSceneFacePull(30, 30, scene)).toBeNull();
  });

  test('face-pull knob appears for a surface-FILLED face (sceneFill, no sceneFace outline)', async () => {
    const { renderer, scene } = await setup({ mode: 'face', faceKeys: ['obj-1/face:+X'] });
    // A hatched face emits only sceneFill paths — the knob must still find it.
    scene.paths = [
      P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
        kind: 'sceneFace', sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10 },
      }),
      P([[50, 20], [70, 20]], {
        kind: 'sceneFill',
        sceneTarget: { objectId: 'obj-1', faceId: 'face:+X', depth: 8, pickPolygon: [{ x: 50, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 40 }, { x: 50, y: 40 }] },
      }),
      P([[50, 40], [70, 40]], {
        kind: 'sceneFill',
        sceneTarget: { objectId: 'obj-1', faceId: 'face:+X', depth: 8 },
      }),
    ];
    const fp = renderer._sceneFacePull(scene);
    expect(fp).toBeTruthy();
    expect(fp.axisKey).toBe('sx');
  });

  test('face-pull arms only for a single BOX face (not a curved primitive)', async () => {
    const { renderer, scene } = await setup({ mode: 'face', faceKeys: ['obj-1/face:0'] });
    scene.params.objects[0].primitive = 'sphere';
    scene.paths = [P([[10, 10], [50, 50]], {
      kind: 'sceneFace', sceneTarget: { objectId: 'obj-1', faceId: 'face:0', depth: 5 },
    })];
    expect(renderer._sceneFacePull(scene)).toBeNull();
  });

  test('the gizmo arms ONLY for a single object selection (not ground / face / none)', async () => {
    const { renderer, scene } = await setup({ mode: 'object', objectIds: ['ground'] });
    expect(renderer._sceneResizeBBox(scene)).toBeNull();

    renderer.setSceneSelection({ layerId: scene.id, mode: 'face', faceKeys: ['obj-1/face:+Z'] });
    expect(renderer._sceneResizeBBox(scene)).toBeNull();

    renderer.setSceneSelection(null);
    expect(renderer._sceneResizeBBox(scene)).toBeNull();

    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
    expect(renderer._sceneResizeBBox(scene)).toBeTruthy();
  });
});
