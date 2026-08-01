/**
 * 3D Scene Studio — on-canvas per-object transform gizmo (move · rotate · scale)
 * and box face-pull.
 *
 * Fixture-driven over the REAL renderer: a scene3d layer whose selected object
 * has hand-authored projected paths (a bbox to anchor the gizmo). The unified
 * gizmo (hitSceneObjectGizmo / beginSceneObjectGizmoDrag / _applySceneObjectGizmoDrag
 * / _cancelSceneObjectGizmoDrag) supersedes the legacy corner-scale handle for a
 * single selected object; face-pull still owns per-dimension box-face resizing.
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

describe('3D Scene Studio — per-object transform gizmo + face-pull', () => {
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

  // scale=1, offset=0 → world === screen, so gizmo doc coords are click coords.
  const gizmoOf = (renderer, scene) => renderer.getSceneObjectGizmo(scene);
  const axisOf = (giz, key) => giz.axes.find((a) => a.key === key);

  test('the gizmo hit-tests scale boxes, move arrows and rotate rings; centre & far miss', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    expect(giz && giz.objId).toBe('obj-1');
    const xBox = axisOf(giz, 'x').scaleBox;
    const xTip = axisOf(giz, 'x').tip;
    const yRing = axisOf(giz, 'y').ring[5];
    expect(renderer.hitSceneObjectGizmo(xBox.x, xBox.y, scene)).toMatchObject({ type: 'scale', axis: 'x' });
    expect(renderer.hitSceneObjectGizmo(xTip.x, xTip.y, scene)).toMatchObject({ type: 'move', axis: 'x' });
    expect(renderer.hitSceneObjectGizmo(yRing.x, yRing.y, scene)).toMatchObject({ type: 'rotate' });
    // A point far outside every handle misses.
    expect(renderer.hitSceneObjectGizmo(900, 900, scene)).toBeNull();
  });

  test('dragging a SCALE box OUT grows uniform scale with ONE history entry + a draft regen', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    const c = giz.center;
    const box = axisOf(giz, 'x').scaleBox;
    const hit = renderer.hitSceneObjectGizmo(box.x, box.y, scene);
    expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: box.x, clientY: box.y })).toBe(true);
    // Drag to DOUBLE the distance from centre → ratio 2 → scale 1 → 2.
    const out = { x: c.x + (box.x - c.x) * 2, y: c.y + (box.y - c.y) * 2 };
    renderer._applySceneObjectGizmoDrag({ clientX: out.x, clientY: out.y });
    expect(scene.params.objects[0].transform.scale).toBeCloseTo(2, 1);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(scene.id);
    // A second move keeps the single gesture history entry.
    const half = { x: c.x + (box.x - c.x) * 0.75, y: c.y + (box.y - c.y) * 0.75 };
    renderer._applySceneObjectGizmoDrag({ clientX: half.x, clientY: half.y });
    expect(scene.params.objects[0].transform.scale).toBeCloseTo(0.75, 1);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    renderer._endSceneObjectGizmoDrag();
    expect(renderer._sceneObjectGizmoDrag).toBeNull();
  });

  test('scale is clamped to the inspector slider range [0.1, 5]', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    const c = giz.center;
    const box = axisOf(giz, 'x').scaleBox;
    const hit = renderer.hitSceneObjectGizmo(box.x, box.y, scene);
    renderer.beginSceneObjectGizmoDrag(hit, { clientX: box.x, clientY: box.y });
    // Drag onto the centre → ratio ~0 → clamp to 0.1.
    renderer._applySceneObjectGizmoDrag({ clientX: c.x, clientY: c.y });
    expect(scene.params.objects[0].transform.scale).toBe(0.1);
    // Drag far out → clamp to 5 (round-trips to the slider, not 20).
    renderer._applySceneObjectGizmoDrag({ clientX: c.x + (box.x - c.x) * 40, clientY: c.y + (box.y - c.y) * 40 });
    expect(scene.params.objects[0].transform.scale).toBe(5);
    renderer._endSceneObjectGizmoDrag();
  });

  test('dragging a MOVE arrow translates along its axis (one history entry)', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    const tip = axisOf(giz, 'x').tip; // camera yaw 0 → X arrow points +screenX
    const hit = renderer.hitSceneObjectGizmo(tip.x, tip.y, scene);
    expect(hit).toMatchObject({ type: 'move', axis: 'x' });
    renderer.beginSceneObjectGizmoDrag(hit, { clientX: tip.x, clientY: tip.y });
    // +12 screen-x at yaw 0 → transform.x += 12 (ground-drag mapping).
    renderer._applySceneObjectGizmoDrag({ clientX: tip.x + 12, clientY: tip.y });
    expect(scene.params.objects[0].transform.x).toBeCloseTo(12, 0);
    expect(scene.params.objects[0].transform.z).toBe(0);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    renderer._endSceneObjectGizmoDrag();
  });

  test('dragging a ROTATE ring changes the matching euler angle', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    const c = giz.center;
    const p = axisOf(giz, 'y').ring[5];
    const hit = renderer.hitSceneObjectGizmo(p.x, p.y, scene);
    expect(hit.type).toBe('rotate');
    renderer.beginSceneObjectGizmoDrag(hit, { clientX: p.x, clientY: p.y });
    // Move to a point rotated ~90° around the centre → yaw changes by ~±90.
    const a0 = Math.atan2(p.y - c.y, p.x - c.x);
    const r = Math.hypot(p.x - c.x, p.y - c.y);
    const p2 = { x: c.x + Math.cos(a0 + Math.PI / 2) * r, y: c.y + Math.sin(a0 + Math.PI / 2) * r };
    renderer._applySceneObjectGizmoDrag({ clientX: p2.x, clientY: p2.y });
    expect(Math.abs(scene.params.objects[0].transform.yaw)).toBeGreaterThan(60);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    renderer._endSceneObjectGizmoDrag();
  });

  test('Escape mid-drag restores the pre-drag transform and pops the history entry', async () => {
    const { renderer, scene } = await setup();
    const giz = gizmoOf(renderer, scene);
    const box = axisOf(giz, 'x').scaleBox;
    const hit = renderer.hitSceneObjectGizmo(box.x, box.y, scene);
    renderer.beginSceneObjectGizmoDrag(hit, { clientX: box.x, clientY: box.y });
    renderer._applySceneObjectGizmoDrag({ clientX: giz.center.x + (box.x - giz.center.x) * 2, clientY: giz.center.y + (box.y - giz.center.y) * 2 });
    expect(scene.params.objects[0].transform.scale).not.toBe(1);
    expect(renderer._cancelSceneObjectGizmoDrag()).toBe(true);
    expect(renderer._sceneObjectGizmoDrag).toBeNull();
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
