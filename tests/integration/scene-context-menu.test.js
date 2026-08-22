/**
 * 3D Scene Studio — Phase 1C: target-aware scene right-click menu.
 *
 *  - Right-click over a fixture face yields object verbs (Duplicate / Delete /
 *    Drop to Ground / Solid|X-ray toggle); with the direct tool it adds the
 *    face verbs (Select All Faces of Object / Clear Face Style stub-disabled
 *    without the 1B StyleCascade module).
 *  - Right-click on empty canvas while a scene layer is active yields the
 *    canvas verbs Add Box / Add Sphere / Add Cylinder.
 *  - Add Box appends a CONTRACT A object with ONE history entry + regen.
 *  - Drop to Ground zeroes transform.y.
 *  - Regression: non-scene documents keep the existing 2D verb set.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

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
  P([[10, 10], [50, 10]],
    { kind: 'sceneEdge', sceneTarget: target({ edgeClass: 'silhouette' }) }),
];

const makeSceneParams = () => ({
  sceneVersion: 1,
  seed: 0,
  objects: [
    { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 7, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
  ],
  lights: [],
  ground: { enabled: true },
  backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: 0, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [],
  assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('3D Scene Studio 1C — scene context menu', () => {
  let runtime, window, document, app, CM;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    ({ window, document } = runtime);
    window.Vectura.Algorithms = window.Vectura.Algorithms || {};
    window.Vectura.Algorithms.scene3d = { generate: () => [] };
    window.app = new window.Vectura.App();
    app = window.app;
    CM = window.Vectura.UI.CanvasContextMenu;
    CM.mount(app);
    await new Promise((r) => setTimeout(r, 80));
  });

  afterAll(() => {
    try { CM?.destroy?.(); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  afterEach(() => {
    try { CM.close(); } catch (_) { /* noop */ }
    // Remove fixture scene layers between tests.
    app.renderer.setSceneSelection?.(null, { silent: true });
    app.renderer.setSelection([], null);
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    app.engine.activeLayerId = null;
    app.renderer.setTool('select');
  });

  const addScene = () => {
    const scene = new window.Vectura.Layer(`scene-cm-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...makeSceneParams() };
    scene.paths = makeScenePaths();
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    return scene;
  };

  const idsOf = (items) => items.filter((it) => !it.separator).map((it) => it.id);
  const item = (items, id) => items.find((it) => it && !it.separator && it.id === id);
  const rightClick = (x, y) => {
    const canvas = document.getElementById('main-canvas');
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    canvas.dispatchEvent(ev);
  };

  test('right-click over a scene face (V tool) opens the OBJECT verb menu', () => {
    addScene();
    rightClick(30, 30);
    const menu = CM.getElement();
    expect(menu).toBeTruthy();
    const ids = Array.from(menu.querySelectorAll('.canvas-ctx-item')).map((b) => b.dataset.ctxId);
    expect(ids).toEqual([
      'sceneDuplicateObject', 'sceneDeleteObject',
      'sceneDropToGround', 'sceneToggleVisibility',
      'undo', 'redo',
    ]);
    const toggle = Array.from(menu.querySelectorAll('.canvas-ctx-item'))
      .find((b) => b.dataset.ctxId === 'sceneToggleVisibility');
    expect(toggle.textContent).toBe('Show X-ray');
  });

  test('right-click over a face with the DIRECT tool adds face verbs; Clear Face Style is stub-disabled without StyleCascade', () => {
    const scene = addScene();
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setTool('direct');
    // Deterministic in both the stream tree and the integrated tree: remove a
    // real StyleCascade (if present) to exercise the stub-disabled path.
    const ns = window.Vectura.Scene3D;
    const savedCascade = ns && ns.StyleCascade;
    if (savedCascade) delete ns.StyleCascade;
    try {
      rightClick(30, 30);
      const menu = CM.getElement();
      const nodes = Array.from(menu.querySelectorAll('.canvas-ctx-item'));
      const ids = nodes.map((b) => b.dataset.ctxId);
      expect(ids).toEqual([
        'sceneSelectAllFaces', 'sceneClearFaceStyle',
        'sceneDuplicateObject', 'sceneDeleteObject',
        'sceneDropToGround', 'sceneToggleVisibility',
        'undo', 'redo',
      ]);
      const clear = nodes.find((b) => b.dataset.ctxId === 'sceneClearFaceStyle');
      expect(clear.disabled).toBe(true); // no Vectura.Scene3D.StyleCascade available

      // Select All Faces of Object routes into the scene selection.
      nodes.find((b) => b.dataset.ctxId === 'sceneSelectAllFaces').click();
      const sel = app.renderer.getSceneSelection();
      expect(sel.mode).toBe('face');
      expect(sel.faceKeys).toEqual(['obj-1/face:+Z']);
    } finally {
      if (savedCascade) ns.StyleCascade = savedCascade;
    }
  });

  test('Clear Face Style enables when Vectura.Scene3D.StyleCascade is present and clears through it', () => {
    const scene = addScene();
    app.renderer.setTool('direct');
    scene.params.styleTable.byFace['obj-1/face:+Z'] = { penId: 'pen-2', mapper: 'hatch', params: {} };
    const calls = [];
    // Preserve any real Scene3D namespace (integrated tree) — never delete it.
    const prevNs = window.Vectura.Scene3D;
    window.Vectura.Scene3D = Object.assign({}, prevNs, {
      StyleCascade: {
        clearStyle: (table, scope, key) => { calls.push([scope, key]); delete table.byFace[key]; },
      },
    });
    try {
      rightClick(30, 30);
      const menu = CM.getElement();
      const clear = Array.from(menu.querySelectorAll('.canvas-ctx-item'))
        .find((b) => b.dataset.ctxId === 'sceneClearFaceStyle');
      expect(clear.disabled).toBe(false);
      clear.click();
      expect(calls).toEqual([['face', 'obj-1/face:+Z']]);
      expect(scene.params.styleTable.byFace['obj-1/face:+Z']).toBeUndefined();
    } finally {
      if (prevNs === undefined) delete window.Vectura.Scene3D;
      else window.Vectura.Scene3D = prevNs;
    }
  });

  test('right-click on empty canvas with a scene layer active yields Add Box / Add Sphere / Add Cylinder', () => {
    addScene();
    rightClick(300, 300);
    const menu = CM.getElement();
    const ids = Array.from(menu.querySelectorAll('.canvas-ctx-item')).map((b) => b.dataset.ctxId);
    expect(ids).toEqual(['sceneAddBox', 'sceneAddSphere', 'sceneAddCylinder', 'undo', 'redo']);
  });

  test('Add Box appends a CONTRACT A object with ONE history entry and selects it', () => {
    const scene = addScene();
    const historyBefore = app.history.length;
    rightClick(300, 300);
    const menu = CM.getElement();
    Array.from(menu.querySelectorAll('.canvas-ctx-item'))
      .find((b) => b.dataset.ctxId === 'sceneAddBox').click();
    expect(scene.params.objects.length).toBe(2);
    const added = scene.params.objects[1];
    expect(added).toEqual({
      id: 'obj-2',
      name: 'Box 2',
      primitive: 'box',
      params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    });
    expect(app.history.length).toBe(historyBefore + 1);
    expect(app.renderer.getSceneSelection().objectIds).toEqual(['obj-2']);
  });

  // fs-u1 — drop-to-ground v2 rests the box's TRUE bottom on the ground
  // (y = half-height = 20 for this 40mm box on ground y = 0), not
  // transform.y = 0 (which would sink half the box below the ground).
  test('Drop to Ground rests transform.y at the true contact height through the menu', () => {
    const scene = addScene();
    expect(scene.params.objects[0].transform.y).toBe(7);
    rightClick(30, 30);
    const menu = CM.getElement();
    Array.from(menu.querySelectorAll('.canvas-ctx-item'))
      .find((b) => b.dataset.ctxId === 'sceneDropToGround').click();
    expect(scene.params.objects[0].transform.y).toBe(20);
  });

  test('regression: without a scene layer the menu keeps the existing 2D verb set', () => {
    const id = app.engine.addLayer('wavetable');
    app.engine.generate(id);
    app.renderer.setSelection([id], id);
    const items = CM.buildItems();
    expect(idsOf(items)).toEqual([
      'duplicate', 'delete', 'undo', 'redo', 'group', 'ungroup', 'isolate',
      'simplify', 'smooth', 'flip-h', 'flip-v', 'transform',
    ]);
    // Cleanup.
    app.renderer.setSelection([], null);
    app.engine.removeLayer(id);
  });
});
