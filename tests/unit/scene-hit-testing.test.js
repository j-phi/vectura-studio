/**
 * 3D Scene Studio — Phase 1C: scene hit testing over CONTRACT B path meta.
 *
 * Fixture-driven: a fake scene3d layer whose paths carry hand-authored
 * CONTRACT B meta (closed square face polygons at known coords, edge
 * polylines, fill hatch lines, depth values). No scene3d engine exists in
 * this stream — everything keys off layer.type === 'scene3d' and
 * path.meta.sceneTarget, which is exactly what these tests exercise through
 * the real renderer.
 *
 * RGR: renderer._sceneHitAtPoint / _sceneCandidatesAtPoint /
 * _sceneFacesInRect / _sceneObjectsInRect do not exist on the base branch, so
 * this whole file fails before Phase 1C and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// ── fixture ────────────────────────────────────────────────────────────────
// obj-1 "Box 1": front face square (10,10)-(50,50) at depth 10, an occluded
//   back face with the same footprint at depth 40, a silhouette edge along
//   its top, and a sceneFill hatch line inside the face.
// obj-2 "Box 2": front face square (30,30)-(70,70) at depth 5 (nearer) and a
//   silhouette edge along its top (y = 30).
const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

const target = (over = {}) => ({
  objectId: 'obj-1',
  faceId: 'face:+Z',
  edgeClass: null,
  depth: 10,
  normal: { x: 0, y: 0, z: 1 },
  facingUp: false,
  occluded: false,
  ...over,
});

const makeScenePaths = () => [
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]],
    { kind: 'sceneFace', closed: true, sceneTarget: target() }),
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]],
    { kind: 'sceneFace', closed: true, sceneTarget: target({ faceId: 'face:-Z', depth: 40, occluded: true }) }),
  P([[10, 10], [50, 10]],
    { kind: 'sceneEdge', sceneTarget: target({ edgeClass: 'silhouette' }) }),
  P([[15, 20], [45, 20]],
    { kind: 'sceneFill', sceneTarget: target() }),
  P([[30, 30], [70, 30], [70, 70], [30, 70], [30, 30]],
    { kind: 'sceneFace', closed: true, sceneTarget: target({ objectId: 'obj-2', depth: 5 }) }),
  P([[30, 30], [70, 30]],
    { kind: 'sceneEdge', sceneTarget: target({ objectId: 'obj-2', depth: 5, edgeClass: 'silhouette' }) }),
];

const makeSceneParams = () => ({
  sceneVersion: 1,
  seed: 0,
  objects: [
    { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
    { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 30, y: 5, z: 30, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
  ],
  lights: [],
  ground: { enabled: true },
  backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [],
  assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('3D Scene Studio 1C — scene hit testing (CONTRACT B meta)', () => {
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
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...makeSceneParams() };
    scene.paths = makeScenePaths();
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return { renderer, engine, scene, Layer };
  }

  test('object pick: nearest-depth object wins where two faces overlap', async () => {
    const { renderer } = await setup();
    // (40,40) is inside both squares; obj-2 (depth 5) is nearer than obj-1 (10).
    const hit = renderer._sceneHitAtPoint({ x: 40, y: 40 }, { mode: 'object' });
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('object');
    expect(hit.objectId).toBe('obj-2');
    // (20,20) only sits inside obj-1.
    const solo = renderer._sceneHitAtPoint({ x: 20, y: 20 }, { mode: 'object' });
    expect(solo.objectId).toBe('obj-1');
    // Empty canvas → null.
    expect(renderer._sceneHitAtPoint({ x: 200, y: 200 }, { mode: 'object' })).toBeNull();
  });

  test('face pick: nearest depth wins; sceneFill lines never become face candidates', async () => {
    const { renderer } = await setup();
    const hit = renderer._sceneHitAtPoint({ x: 40, y: 40 }, { mode: 'face' });
    expect(hit.kind).toBe('face');
    expect(hit.key).toBe('obj-2/face:+Z');
    // A point ON the fill hatch line (inside obj-1's face): face candidates
    // are faces only — the fill path is ignored for face pick.
    const stack = renderer._sceneCandidatesAtPoint({ x: 20, y: 20 }, 'face');
    expect(stack.length).toBeGreaterThan(0);
    stack.forEach((c) => expect(c.kind).toBe('face'));
  });

  test('partially-occluded face: pick uses meta.pickPolygon over open visible runs', async () => {
    const { renderer, scene } = await setup();
    // Simulate 1A's partial-occlusion emit: the visible outline is split into
    // two OPEN runs (top edge and bottom edge only), but meta carries the full
    // closed face outline as pickPolygon. A click in the face interior — which
    // is inside NEITHER open run's implicit closure sliver — must still resolve.
    const full = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }];
    const topRun = P([[10, 10], [50, 10]],
      { kind: 'sceneFace', sceneTarget: target({ objectId: 'obj-9', faceId: 'face:+Z', depth: 8, pickPolygon: full }) });
    const botRun = P([[10, 50], [50, 50]],
      { kind: 'sceneFace', sceneTarget: target({ objectId: 'obj-9', faceId: 'face:+Z', depth: 8, pickPolygon: full }) });
    scene.paths = [topRun, botRun];
    const hit = renderer._sceneHitAtPoint({ x: 30, y: 30 }, { mode: 'face' });
    expect(hit).toBeTruthy();
    expect(hit.kind).toBe('face');
    expect(hit.key).toBe('obj-9/face:+Z');
  });

  test('locked or hidden scene layer is not selectable via V or A', async () => {
    const { renderer, scene } = await setup();
    renderer.setSelection([scene.id], scene.id);
    renderer.isLayerLocked = (id) => id === scene.id;
    expect(renderer._sceneDownSelect({ x: 40, y: 40 }, {}, {})).toBe(false);
    renderer.setTool('direct');
    expect(renderer._sceneDownDirect({ x: 40, y: 40 }, {}, {})).toBe(false);
    expect(renderer.getSceneSelection()).toBeNull();

    // Hidden layer is likewise inert.
    renderer.isLayerLocked = null;
    scene.visible = false;
    renderer.setTool('select');
    expect(renderer._sceneDownSelect({ x: 40, y: 40 }, {}, {})).toBe(false);
  });

  test('getSceneSelection self-heals when the selected layer disappears', async () => {
    const { renderer, engine, scene } = await setup();
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    expect(renderer.getSceneSelection()).toBeTruthy();
    // Simulate an undo that removed the scene layer.
    engine.layers = engine.layers.filter((l) => l.id !== scene.id);
    expect(renderer.getSceneSelection()).toBeNull();
    expect(renderer.sceneSelection).toBeNull();
  });

  test('alt-cycle stack order: near -> far, occluded targets last', async () => {
    const { renderer } = await setup();
    const stack = renderer._sceneCandidatesAtPoint({ x: 40, y: 40 }, 'face');
    expect(stack.map((c) => c.key)).toEqual([
      'obj-2/face:+Z',   // depth 5, front
      'obj-1/face:+Z',   // depth 10, front
      'obj-1/face:-Z',   // depth 40, occluded — always last
    ]);
    // _scenePickCandidate: plain pick takes index 0; repeated Alt-clicks on
    // the same point advance through the stack; the readout is 1-based.
    const world = { x: 40, y: 40 };
    const first = renderer._scenePickCandidate(stack, world, 'face', false);
    expect(first.key).toBe('obj-2/face:+Z');
    expect(renderer.getSceneCandidateReadout()).toEqual({ index: 1, total: 3 });
    const second = renderer._scenePickCandidate(stack, world, 'face', true);
    expect(second.key).toBe('obj-1/face:+Z');
    expect(renderer.getSceneCandidateReadout()).toEqual({ index: 2, total: 3 });
    const third = renderer._scenePickCandidate(stack, world, 'face', true);
    expect(third.key).toBe('obj-1/face:-Z');
    // Wraps back to the top.
    const fourth = renderer._scenePickCandidate(stack, world, 'face', true);
    expect(fourth.key).toBe('obj-2/face:+Z');
  });

  test('edge submode: edges within tolerance WIN over faces; face submode ignores edges', async () => {
    const { renderer } = await setup();
    // (32,31) is within 5-unit tolerance of obj-2's top edge (y=30) AND inside
    // both face polygons.
    const edgeHit = renderer._sceneHitAtPoint({ x: 32, y: 31 }, { mode: 'edge' });
    expect(edgeHit.kind).toBe('edge');
    expect(edgeHit.objectId).toBe('obj-2');
    expect(edgeHit.key).toBe('obj-2/face:+Z:silhouette:0');
    // Same point in face submode: the edge is ignored, nearest face wins.
    const faceHit = renderer._sceneHitAtPoint({ x: 32, y: 31 }, { mode: 'face' });
    expect(faceHit.kind).toBe('face');
    expect(faceHit.key).toBe('obj-2/face:+Z');
    // Edge submode with no edge in tolerance falls back to the face pick.
    const fallback = renderer._sceneHitAtPoint({ x: 40, y: 45 }, { mode: 'edge' });
    expect(fallback.kind).toBe('face');
  });

  test('marquee collection: _sceneFacesInRect front faces only, Alt includes occluded; _sceneObjectsInRect collects objects', async () => {
    const { renderer, scene } = await setup();
    const rect = { x: 5, y: 5, w: 70, h: 70 };
    const front = renderer._sceneFacesInRect(scene, rect, { includeOccluded: false });
    expect(front.sort()).toEqual(['obj-1/face:+Z', 'obj-2/face:+Z']);
    const all = renderer._sceneFacesInRect(scene, rect, { includeOccluded: true });
    expect(all.sort()).toEqual(['obj-1/face:+Z', 'obj-1/face:-Z', 'obj-2/face:+Z'].sort());
    // A rect touching only obj-2's area.
    const east = renderer._sceneObjectsInRect(scene, { x: 55, y: 55, w: 10, h: 10 }, {});
    expect(east).toEqual(['obj-2']);
    const both = renderer._sceneObjectsInRect(scene, rect, {});
    expect(both.sort()).toEqual(['obj-1', 'obj-2']);
  });

  test('regression: findLayerAtPoint on a normal 2D layer is unchanged with a scene layer present', async () => {
    const { renderer, engine, Layer } = await setup();
    const shape = new Layer('flat-1', 'shape', 'Flat');
    shape.sourcePaths = [[
      { x: 100, y: 100 }, { x: 140, y: 100 }, { x: 140, y: 140 }, { x: 100, y: 140 }, { x: 100, y: 100 },
    ]];
    engine.layers.push(shape);
    engine.generate(shape.id);
    // Click on the 2D stroke → the shape layer, exactly as before.
    expect(renderer.findLayerAtPoint({ x: 120, y: 100 })).toBe(shape);
    // Click on the shape INTERIOR (off-stroke) → still null (2D layers are
    // stroke-hit only; scene face interiors never leak into findLayerAtPoint).
    expect(renderer.findLayerAtPoint({ x: 120, y: 120 })).toBeNull();
  });
});
