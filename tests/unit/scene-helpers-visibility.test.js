/**
 * SETTINGS.sceneHelpersVisible — the master switch for every non-print
 * 3D-scene helper overlay (transform gizmos, the red scene selection
 * outline, resize/face-pull handles, light gizmos/widgets, the hover hint,
 * and the scene3d orbit/rotation pad).
 *
 * Default true (visible). Every helper's draw fn AND its matching hit-test
 * (and drag-begin, where one exists) route through one of a handful of
 * shared geometry accessors — _sceneResizeBBox, _sceneFacePull,
 * getSceneObjectGizmo, getSceneLightGizmo, getSceneLightControl, and (scene-
 * scoped only) get3DRotationControl — plus two standalone draws
 * (drawSceneSelectionOverlay, drawSceneHoverHint) that have no hit-test of
 * their own. Gating each accessor once (rather than each draw/hit pair
 * separately) makes it structurally impossible for a hidden helper to stay
 * hit-testable.
 *
 * The general 3D-rotation gizmo (spiralizer/topoform/terrain/polyhedron/
 * raster-plane's own pseudo-3D "orbit pad") is explicitly NOT a 3D-scene
 * helper and must stay visible regardless of this flag — only the scene3d
 * orbit pad (and its object3d/booleanGroup3d scene-tree children) is gated.
 *
 * RGR: this file fails on the base branch (SETTINGS.sceneHelpersVisible and
 * Renderer#_sceneHelpersVisible do not exist yet) and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

// obj-1 is a box with TWO faces so its overall bbox center differs from any
// single face's centroid (face-pull's "outward" projection needs >=10px of
// separation between the object center and the pulled face's centroid).
const makeScenePaths = () => [
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]], {
    kind: 'sceneFace', closed: true,
    sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
  }),
  P([[50, 10], [90, 10], [90, 50], [50, 50], [50, 10]], {
    kind: 'sceneFace', closed: true,
    sceneTarget: { objectId: 'obj-1', faceId: 'face:+X', depth: 5, occluded: false },
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
  ],
  ground: { enabled: true },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

// Minimal ctx that no-ops every canvas 2D method but counts stroke()/fill()
// calls, so "did this helper paint anything" is a single number.
const makeRecordingCtx = () => {
  let ops = 0;
  const ctx = {
    lineWidth: 1, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineCap: 'butt', lineJoin: 'miter',
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, resetTransform() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, arc() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, setLineDash() {}, getLineDash() { return []; },
    strokeRect() { ops += 1; }, fillRect() { ops += 1; },
    stroke() { ops += 1; }, fill() { ops += 1; },
  };
  return { ctx, opsRef: () => ops };
};

describe('SETTINGS.sceneHelpersVisible — master switch for 3D-scene helper overlays', () => {
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
    renderer.app = { pushHistory: () => {}, history: [{}, {}], ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {};
    renderer.updateCursor = () => {};
    renderer.showDragTooltip = () => {};
    renderer.hideDragTooltip = () => {};
    return { renderer, scene, engine, SETTINGS: runtime.window.Vectura.SETTINGS };
  }

  test('defaults to visible (true) so every helper stays on until explicitly hidden', async () => {
    const { SETTINGS } = await setup();
    expect(SETTINGS.sceneHelpersVisible).toBe(true);
  });

  test('unified per-object transform gizmo: geometry, hit-test, and draw are all gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });

    const giz = renderer.getSceneObjectGizmo(scene);
    expect(giz).toBeTruthy();
    const tip = giz.axes.find((a) => a.key === 'x').tip;
    expect(renderer.hitSceneObjectGizmo(tip.x, tip.y, scene)).toMatchObject({ type: 'move', axis: 'x' });
    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneObjectGizmo();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(renderer.getSceneObjectGizmo(scene)).toBeNull();
    expect(renderer.hitSceneObjectGizmo(tip.x, tip.y, scene)).toBeNull();
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneObjectGizmo();
    expect(rec2.opsRef()).toBe(0);
  });

  test('legacy corner-scale resize handles: geometry, hit-test, and draw are all gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
    // Strip the "superseded by the unified gizmo" confound so this exercises
    // ONLY the sceneHelpersVisible gate on the legacy resize control.
    renderer.getSceneObjectGizmo = () => null;

    const bbox = renderer._sceneResizeBBox(scene);
    expect(bbox).toBeTruthy();
    const corner = bbox.corners.nw;
    expect(renderer.hitSceneResize(corner.x, corner.y, scene)).toMatchObject({ handle: 'nw' });
    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneResizeControl();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(renderer._sceneResizeBBox(scene)).toBeNull();
    expect(renderer.hitSceneResize(corner.x, corner.y, scene)).toBeNull();
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneResizeControl();
    expect(rec2.opsRef()).toBe(0);
  });

  test('box face-pull handle: geometry, hit-test, and draw are all gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.setSceneSelection({ layerId: scene.id, mode: 'face', faceKeys: ['obj-1/face:+Z'] });

    const fp = renderer._sceneFacePull(scene);
    expect(fp).toBeTruthy();
    expect(renderer.hitSceneFacePull(fp.centroid.x, fp.centroid.y, scene)).toBeTruthy();
    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneFacePullHandle();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(renderer._sceneFacePull(scene)).toBeNull();
    expect(renderer.hitSceneFacePull(fp.centroid.x, fp.centroid.y, scene)).toBeNull();
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneFacePullHandle();
    expect(rec2.opsRef()).toBe(0);
  });

  test('selected-light 3-axis translate gizmo: geometry, hit-test, and draw are all gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.setSelectedSceneLight(scene.id, 'p1');

    const giz = renderer.getSceneLightGizmo(scene);
    expect(giz).toBeTruthy();
    const tip = giz.axes.find((a) => a.key === 'x').tip;
    expect(renderer.hitSceneLightGizmo(tip.x, tip.y, scene)).toMatchObject({ type: 'move', axis: 'x' });
    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneLightGizmo();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(renderer.getSceneLightGizmo(scene)).toBeNull();
    expect(renderer.hitSceneLightGizmo(tip.x, tip.y, scene)).toBeNull();
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneLightGizmo();
    expect(rec2.opsRef()).toBe(0);
  });

  test('legacy sun-disc widget (no light explicitly selected): geometry, hit-test, and draw are all gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    // No setSelectedSceneLight call: the 3-axis gizmo stays unarmed, so the
    // legacy 2D sun disc is the active control.
    const control = renderer.getSceneLightControl(scene);
    expect(control).toBeTruthy();
    expect(renderer.hitSceneLight(control.pos.x, control.pos.y, scene)).toBeTruthy();
    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneLightOverlay();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(renderer.getSceneLightControl(scene)).toBeNull();
    expect(renderer.hitSceneLight(control.pos.x, control.pos.y, scene)).toBeNull();
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneLightOverlay();
    expect(rec2.opsRef()).toBe(0);
  });

  test('red scene selection outline is gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });

    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneSelectionOverlay();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneSelectionOverlay();
    expect(rec2.opsRef()).toBe(0);
  });

  test('hover hint is gated', async () => {
    const { renderer, scene, SETTINGS } = await setup();
    renderer.sceneHoverPick = { layerId: scene.id, mode: 'object', objectId: 'obj-1', faceId: null, key: 'obj-1' };

    const rec = makeRecordingCtx();
    renderer.ctx = rec.ctx;
    renderer.drawSceneHoverHint();
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    const rec2 = makeRecordingCtx();
    renderer.ctx = rec2.ctx;
    renderer.drawSceneHoverHint();
    expect(rec2.opsRef()).toBe(0);
  });

  test('scene3d orbit/rotation pad is gated, but a NON-scene 3D-rotation gizmo (polyhedron) is not', async () => {
    const { renderer: sceneRenderer, scene, SETTINGS } = await setup();
    // Whole-scene camera orbit: no object selection needed.
    const orbit = sceneRenderer.get3DRotationControl(scene, null);
    expect(orbit).toBeTruthy();
    expect(sceneRenderer.hit3DRotationControl(orbit.center.x, orbit.center.y, scene, null)).toMatchObject({ type: 'orbit' });
    const rec = makeRecordingCtx();
    sceneRenderer.ctx = rec.ctx;
    sceneRenderer.draw3DRotationControl(scene, null);
    expect(rec.opsRef()).toBeGreaterThan(0);

    SETTINGS.sceneHelpersVisible = false;
    expect(sceneRenderer.get3DRotationControl(scene, null)).toBeNull();
    expect(sceneRenderer.hit3DRotationControl(orbit.center.x, orbit.center.y, scene, null)).toBeNull();
    const rec2 = makeRecordingCtx();
    sceneRenderer.ctx = rec2.ctx;
    sceneRenderer.draw3DRotationControl(scene, null);
    expect(rec2.opsRef()).toBe(0);

    // A non-scene algorithm's own pseudo-3D rotation gizmo is NOT a "3D-scene
    // helper" and must keep working while sceneHelpersVisible is false.
    const { Renderer, VectorEngine } = runtime.window.Vectura;
    const engine2 = new VectorEngine();
    const polyLayer = {
      id: 'poly-1', type: 'polyhedron', visible: true, isGroup: false,
      origin: { x: 100, y: 100 },
      params: { rotate: 0, tilt: 30, roll: 0 },
      paths: [[{ x: 60, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 140 }, { x: 60, y: 140 }]],
      strokeWidth: 0.5,
    };
    engine2.layers = [polyLayer];
    engine2.currentProfile = { width: 300, height: 300 };
    engine2.getBounds = () => ({ width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false });
    engine2.generate = () => {};
    const polyRenderer = new Renderer('main-canvas', engine2);
    polyRenderer.scale = 1;
    polyRenderer.offsetX = 0;
    polyRenderer.offsetY = 0;
    const bounds = polyRenderer.getSelectionBounds([polyLayer]);
    expect(polyRenderer.get3DRotationControl(polyLayer, bounds)).toBeTruthy();
    const rec3 = makeRecordingCtx();
    polyRenderer.ctx = rec3.ctx;
    polyRenderer.draw3DRotationControl(polyLayer, bounds);
    expect(rec3.opsRef()).toBeGreaterThan(0);
  });
});
