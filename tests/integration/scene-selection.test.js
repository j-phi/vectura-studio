/**
 * 3D Scene Studio — Phase 1C: scene selection (CONTRACT D) + canvas
 * interactions through the real renderer.
 *
 *  - CONTRACT D API: set/get, normalization, 'vectura:scene-selection'
 *    CustomEvent (silent opt suppresses it).
 *  - V tool: click picks the nearest-depth object; shift-click toggles;
 *    empty click clears; V marquee collects objects; ground-drag moves the
 *    selected object in the ground plane (Shift lifts) with ONE history entry
 *    per gesture.
 *  - A tool: face pick; 'a'-again cycles face<->edge submode; edge pick;
 *    A marquee collects front faces (Alt includes occluded); shift additive.
 *  - Scene-scoped keys (full app): Tab toggles V<->A, D drops to ground.
 *  - Context bar: getContext() reports scene-object / scene-face kinds.
 *  - Regression: 2D click + marquee selection unchanged.
 *
 * Fixture layers carry hand-authored CONTRACT B meta — no scene3d engine
 * exists in this stream.
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
  P([[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]],
    { kind: 'sceneFace', closed: true, sceneTarget: target({ faceId: 'face:-Z', depth: 40, occluded: true }) }),
  P([[10, 10], [50, 10]],
    { kind: 'sceneEdge', sceneTarget: target({ edgeClass: 'silhouette' }) }),
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

describe('3D Scene Studio 1C — scene selection + canvas interactions', () => {
  describe('renderer-level (bare engine + renderer)', () => {
    let runtime;

    afterEach(() => {
      runtime?.cleanup?.();
      runtime = null;
    });

    async function setup() {
      runtime = await loadVecturaRuntime({ includeRenderer: true });
      const V = runtime.window.Vectura;
      // Stub the (1A-owned) scene3d algorithm so regen calls do not fall back
      // to flowfield and overwrite the fixture paths mid-test.
      V.Algorithms = V.Algorithms || {};
      V.Algorithms.scene3d = { generate: () => [] };
      const engine = new V.VectorEngine();
      engine.layers = [];
      const scene = new V.Layer('scene-1', 'scene3d', 'Scene');
      scene.params = { ...scene.params, ...makeSceneParams() };
      scene.paths = makeScenePaths();
      engine.layers.push(scene);
      engine.activeLayerId = scene.id;
      const renderer = new V.Renderer('main-canvas', engine);
      renderer.setTool('select');
      renderer.scale = 1;
      renderer.offsetX = 0;
      renderer.offsetY = 0;
      const app = { history: ['initial'], pushHistory() { this.history.push('snap'); } };
      renderer.app = app;
      return { renderer, engine, scene, app, V, window: runtime.window };
    }

    const restorePaths = (scene) => { scene.paths = makeScenePaths(); };

    test('CONTRACT D: setSceneSelection normalizes, redraws, and dispatches the CustomEvent; silent suppresses', async () => {
      const { renderer, window } = await setup();
      const events = [];
      window.addEventListener('vectura:scene-selection', (e) => events.push(e.detail));

      const out = renderer.setSceneSelection({
        layerId: 'scene-1', mode: 'object',
        objectIds: ['obj-1', 'obj-1', null, 'obj-2'], faceKeys: undefined, edgeKeys: [],
      });
      expect(out).toEqual({
        layerId: 'scene-1', mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [],
      });
      expect(renderer.getSceneSelection()).toEqual(out);
      expect(events.length).toBe(1);
      expect(events[0]).toEqual(out);

      // Silent write updates state without an event.
      renderer.setSceneSelection({ layerId: 'scene-1', mode: 'face', faceKeys: ['obj-1/face:+Z'] }, { silent: true });
      expect(events.length).toBe(1);
      expect(renderer.getSceneSelection().mode).toBe('face');

      // Empty selections normalize to null (and clear notifies).
      renderer.setSceneSelection({ layerId: 'scene-1', mode: 'object', objectIds: [] });
      expect(renderer.getSceneSelection()).toBeNull();
      expect(events[events.length - 1]).toBeNull();
    });

    test('V-click selects the nearest object, selects the layer, and shift-click toggles membership', async () => {
      const { renderer, scene } = await setup();
      renderer.down({ clientX: 40, clientY: 40, preventDefault() {}, cancelable: true });
      renderer.up({});
      let sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('object');
      expect(sel.objectIds).toEqual(['obj-2']);
      expect(renderer.selectedLayerIds.has(scene.id)).toBe(true);

      // Shift-click on obj-1 adds it; shift-click again removes it.
      renderer.down({ clientX: 20, clientY: 20, shiftKey: true, preventDefault() {}, cancelable: true });
      renderer.up({});
      sel = renderer.getSceneSelection();
      expect(sel.objectIds.sort()).toEqual(['obj-1', 'obj-2']);
      renderer.down({ clientX: 20, clientY: 20, shiftKey: true, preventDefault() {}, cancelable: true });
      renderer.up({});
      sel = renderer.getSceneSelection();
      expect(sel.objectIds).toEqual(['obj-2']);

      // Plain click on empty scene space clears the scene selection.
      renderer.down({ clientX: 200, clientY: 200, preventDefault() {}, cancelable: true });
      renderer.up({});
      expect(renderer.getSceneSelection()).toBeNull();
    });

    test('Alt-click cycles depth candidates and exposes the {index,total} readout', async () => {
      const { renderer } = await setup();
      renderer.down({ clientX: 40, clientY: 40, preventDefault() {}, cancelable: true });
      renderer.up({});
      expect(renderer.getSceneSelection().objectIds).toEqual(['obj-2']);
      renderer.down({ clientX: 40, clientY: 40, altKey: true, preventDefault() {}, cancelable: true });
      renderer.up({});
      expect(renderer.getSceneSelection().objectIds).toEqual(['obj-1']);
      expect(renderer.getSceneCandidateReadout()).toEqual({ index: 2, total: 2 });
    });

    test('I20b: double-click on the V tool DRILLS object → face (selection is face-level, tool flips to A)', async () => {
      const { renderer } = await setup();
      // First click selects the object; a fast second click at (nearly) the
      // same point drills into face mode on that object.
      renderer.down({ clientX: 20, clientY: 20, preventDefault() {}, cancelable: true });
      renderer.up({});
      expect(renderer.getSceneSelection().mode).toBe('object');
      renderer.down({ clientX: 20, clientY: 20, preventDefault() {}, cancelable: true });
      renderer.up({});
      const sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('face');
      expect(sel.faceKeys.length).toBe(1);
      expect(sel.faceKeys[0].startsWith('obj-1/')).toBe(true);
      // The bar's context reads the drilled face level, and the tool flipped to A.
      expect(renderer.activeTool).toBe('direct');
    });

    test('V ground-drag moves the object in the ground plane; Shift lifts; ONE history entry per gesture', async () => {
      const { renderer, scene, app } = await setup();
      const obj1 = scene.params.objects[0];
      renderer.down({ clientX: 20, clientY: 20, preventDefault() {}, cancelable: true });
      expect(renderer._sceneDrag).toBeTruthy();
      renderer.move({ clientX: 30, clientY: 20, buttons: 1 });
      renderer.move({ clientX: 34, clientY: 20, buttons: 1 });
      renderer.up({});
      // Camera yaw 0 → screen dx maps 1:1 onto ground x; z unchanged.
      expect(obj1.transform.x).toBeCloseTo(14, 3);
      expect(obj1.transform.z).toBeCloseTo(0, 3);
      expect(app.history.length).toBe(2); // one push for the whole gesture

      // Shift-drag lifts: screen up (negative dy) increases transform.y.
      // (Press >8px away from the first click so it never reads as a
      // double-click, which would enter face mode instead of dragging.)
      restorePaths(scene);
      renderer.down({ clientX: 15, clientY: 35, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 15, clientY: 23, buttons: 1, shiftKey: true });
      renderer.up({});
      expect(obj1.transform.y).toBeCloseTo(12, 3);
      expect(app.history.length).toBe(3);
    });

    test('Escape mid ground-drag restores the pre-drag transform and pops the gesture snapshot', async () => {
      const { renderer, scene, app } = await setup();
      const obj1 = scene.params.objects[0];
      const startX = obj1.transform.x;
      renderer.down({ clientX: 20, clientY: 20, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 40, clientY: 20, buttons: 1 });
      expect(obj1.transform.x).not.toBeCloseTo(startX, 3); // moved
      expect(app.history.length).toBe(2); // one snapshot pushed

      const cancelled = renderer._cancelSceneGroundDrag();
      expect(cancelled).toBe(true);
      expect(obj1.transform.x).toBeCloseTo(startX, 3); // restored
      expect(app.history.length).toBe(1); // snapshot popped
      expect(renderer._sceneDrag).toBeNull();
    });

    test('ground-drag coalesces regens: per-move generate is deferred, release does the full regen', async () => {
      const { renderer, scene, engine } = await setup();
      let genCalls = 0;
      const realGen = engine.generate.bind(engine);
      engine.generate = (id, opts) => { genCalls += 1; return realGen(id, opts); };

      renderer.down({ clientX: 20, clientY: 20, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 26, clientY: 20, buttons: 1 });
      renderer.move({ clientX: 32, clientY: 20, buttons: 1 });
      renderer.move({ clientX: 38, clientY: 20, buttons: 1 });
      // Transform mutations are synchronous — only the regen/draw is deferred to
      // an animation frame, so per-move synchronous generate calls stay coalesced
      // (a jsdom test never flushes rAF mid-gesture).
      expect(scene.params.objects[0].transform.x).toBeCloseTo(18, 3);
      const midGesture = genCalls;
      expect(midGesture).toBeLessThan(3); // NOT one full regen per move

      renderer.up({});
      // Release runs exactly one full-quality regen.
      expect(genCalls).toBe(midGesture + 1);
      engine.generate = realGen;
    });

    test('V marquee collects scene objects (additive with shift)', async () => {
      const { renderer } = await setup();
      renderer.down({ clientX: 90, clientY: 90, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 25, clientY: 25, buttons: 1 });
      renderer.up({});
      const sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('object');
      expect(sel.objectIds.sort()).toEqual(['obj-1', 'obj-2']);

      // Plain small marquee off in the corner replaces (clears via empty).
      renderer.down({ clientX: 200, clientY: 200, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 210, clientY: 210, buttons: 1 });
      renderer.up({});
      expect(renderer.getSceneSelection()).toBeNull();
    });

    test('A tool: face pick, submode cycle via setTool("direct") again, edge pick, shift additive', async () => {
      const { renderer, scene } = await setup();
      renderer.setSelection([scene.id], scene.id);
      renderer.setTool('direct');
      expect(renderer.sceneComponentMode).toBe('face');
      renderer.down({ clientX: 40, clientY: 40, preventDefault() {}, cancelable: true });
      renderer.up({});
      let sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('face');
      expect(sel.faceKeys).toEqual(['obj-2/face:+Z']);

      // Shift-click adds obj-1's face.
      renderer.down({ clientX: 20, clientY: 20, shiftKey: true, preventDefault() {}, cancelable: true });
      renderer.up({});
      sel = renderer.getSceneSelection();
      expect(sel.faceKeys.sort()).toEqual(['obj-1/face:+Z', 'obj-2/face:+Z']);

      // 'A again' → setTool('direct') while already direct cycles to edge.
      renderer.setTool('direct');
      expect(renderer.sceneComponentMode).toBe('edge');
      renderer.down({ clientX: 32, clientY: 31, preventDefault() {}, cancelable: true });
      renderer.up({});
      sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('edge');
      expect(sel.edgeKeys).toEqual(['obj-2/face:+Z:silhouette:0']);

      // Cycle back to face.
      renderer.setTool('direct');
      expect(renderer.sceneComponentMode).toBe('face');
    });

    test('A marquee collects front faces; Alt-marquee includes occluded', async () => {
      const { renderer, scene } = await setup();
      renderer.setSelection([scene.id], scene.id);
      renderer.setTool('direct');
      renderer.down({ clientX: 2, clientY: 2, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 75, clientY: 75, buttons: 1 });
      renderer.up({});
      let sel = renderer.getSceneSelection();
      expect(sel.mode).toBe('face');
      expect(sel.faceKeys.sort()).toEqual(['obj-1/face:+Z', 'obj-2/face:+Z']);

      // Alt-marquee includes the occluded back face ("all six sides").
      renderer.down({ clientX: 2, clientY: 2, altKey: true, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 75, clientY: 75, buttons: 1, altKey: true });
      renderer.up({ altKey: true });
      sel = renderer.getSceneSelection();
      expect(sel.faceKeys.sort()).toEqual(['obj-1/face:+Z', 'obj-1/face:-Z', 'obj-2/face:+Z'].sort());
    });

    test('scene verbs: drop-to-ground zeroes transform.y; duplicate/delete/visibility maintain objects + history', async () => {
      const { renderer, scene, app } = await setup();
      const obj2 = scene.params.objects[1];
      expect(obj2.transform.y).toBe(5);
      renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-2'] });
      expect(renderer.dropSceneSelectionToGround()).toBe(true);
      expect(obj2.transform.y).toBe(0);
      expect(app.history.length).toBe(2);

      restorePaths(scene);
      const newIds = renderer.duplicateSceneObjects(scene.id, ['obj-2']);
      expect(newIds).toEqual(['obj-3']);
      expect(scene.params.objects.length).toBe(3);
      expect(renderer.getSceneSelection().objectIds).toEqual(['obj-3']);
      expect(app.history.length).toBe(3);

      restorePaths(scene);
      renderer.setSceneObjectVisibility(scene.id, ['obj-3']);
      expect(scene.params.objects[2].visibility).toBe('xray');

      restorePaths(scene);
      scene.params.styleTable.byObject['obj-3'] = { penId: 'pen-2', mapper: 'none', params: {} };
      scene.params.styleTable.byFace['obj-3/face:+Z'] = { penId: 'pen-3', mapper: 'none', params: {} };
      renderer.deleteSceneObjects(scene.id, ['obj-3']);
      expect(scene.params.objects.length).toBe(2);
      expect(scene.params.styleTable.byObject['obj-3']).toBeUndefined();
      expect(scene.params.styleTable.byFace['obj-3/face:+Z']).toBeUndefined();
      expect(renderer.getSceneSelection()).toBeNull();
    });

    test('gizmo nested spec: orbit drag writes params.camera; with one object selected it writes that transform', async () => {
      const { renderer, scene } = await setup();
      const spec = renderer.get3DRotationSpec(scene);
      expect(spec).toBeTruthy();
      expect(spec.nested).toBe(true);
      // Camera route (no scene selection).
      renderer.setSceneSelection(null);
      let rot = renderer._read3DRotation(scene, spec);
      expect(rot.yaw).toBe(0);
      expect(rot.pitch).toBe(-20);
      renderer._write3DRotation(scene, spec, { yaw: 45, pitch: -10 });
      expect(scene.params.camera.yaw).toBe(45);
      expect(scene.params.camera.pitch).toBe(-10);
      // Object route (single object selected).
      renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
      renderer._write3DRotation(scene, spec, { yaw: 30, roll: 5 });
      expect(scene.params.objects[0].transform.yaw).toBe(30);
      expect(scene.params.objects[0].transform.roll).toBe(5);
      expect(scene.params.camera.yaw).toBe(45); // camera untouched
      // Flat specs are untouched by the helpers (regression).
      const { Layer } = runtime.window.Vectura;
      const topo = new Layer('topo-1', 'topoform', 'Topo');
      const flatSpec = renderer.get3DRotationSpec(topo);
      renderer._write3DRotation(topo, flatSpec, { yaw: 12, pitch: 34 });
      expect(topo.params.yaw).toBe(12);
      expect(topo.params.pitch).toBe(34);
    });

    test('regression: 2D layer click + marquee selection stay byte-identical with a scene layer in the document', async () => {
      const { renderer, engine } = await setup();
      const { Layer } = runtime.window.Vectura;
      const flat = new Layer('flat-1', 'shape', 'Flat');
      flat.sourcePaths = [[
        { x: 120, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 160 }, { x: 120, y: 160 }, { x: 120, y: 120 },
      ]];
      engine.layers.push(flat);
      engine.generate(flat.id);
      // Click the 2D stroke selects the 2D layer (no scene interference).
      renderer.down({ clientX: 140, clientY: 120, preventDefault() {}, cancelable: true });
      renderer.up({});
      expect(renderer.selectedLayerIds.has('flat-1')).toBe(true);
      expect(renderer.getSceneSelection()).toBeNull();
      // Marquee over the 2D layer only selects it via layerIntersectsRect.
      renderer.setSelection([], null);
      renderer.down({ clientX: 110, clientY: 110, preventDefault() {}, cancelable: true });
      renderer.move({ clientX: 170, clientY: 170, buttons: 1 });
      renderer.up({});
      expect(renderer.selectedLayerIds.has('flat-1')).toBe(true);
    });
  });

  describe('full app (shortcuts + context bar)', () => {
    let runtime, window, document, app;

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({
        includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
      });
      ({ window, document } = runtime);
      window.Vectura.Algorithms = window.Vectura.Algorithms || {};
      window.Vectura.Algorithms.scene3d = { generate: () => [] };
      window.app = new window.Vectura.App();
      app = window.app;
      await new Promise((r) => setTimeout(r, 80));
    });

    afterAll(() => {
      runtime?.cleanup?.();
      runtime = null;
    });

    const addScene = () => {
      const scene = new window.Vectura.Layer(`scene-${Date.now()}`, 'scene3d', 'Scene');
      scene.params = { ...scene.params, ...makeSceneParams() };
      scene.paths = makeScenePaths();
      app.engine.layers.push(scene);
      app.engine.activeLayerId = scene.id;
      return scene;
    };

    const key = (init) => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    };

    test('Tab toggles V<->A only while a scene layer is active; D drops the selection to ground', () => {
      const scene = addScene();
      app.renderer.setSelection([scene.id], scene.id);
      app.ui.setActiveTool('select');
      key({ key: 'Tab' });
      expect(app.renderer.activeTool).toBe('direct');
      key({ key: 'Tab' });
      expect(app.renderer.activeTool).toBe('select');

      // D = drop-to-ground on the scene selection.
      const obj2 = scene.params.objects[1];
      expect(obj2.transform.y).toBe(5);
      app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-2'] });
      key({ key: 'd' });
      expect(obj2.transform.y).toBe(0);

      // Without a scene layer active, Tab does NOT switch tools (no new
      // global bindings).
      app.renderer.setSceneSelection(null);
      app.renderer.setSelection([], null);
      app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
      app.engine.activeLayerId = null;
      app.ui.setActiveTool('select');
      key({ key: 'Tab' });
      expect(app.renderer.activeTool).toBe('select');
    });

    test('context bar reports scene-object / scene-face kinds with the selection summary', async () => {
      const scene = addScene();
      app.renderer.setSelection([scene.id], scene.id);
      app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
      const CB = window.Vectura.UI.ContextBar;
      let ctx = CB.getContext();
      expect(ctx.kind).toBe('scene-object');
      expect(ctx.primaryLayer.id).toBe(scene.id);

      app.renderer.setSceneSelection({
        layerId: scene.id, mode: 'face',
        faceKeys: ['obj-1/face:+Z', 'obj-1/face:-Z', 'obj-2/face:+Z'],
      });
      ctx = CB.getContext();
      expect(ctx.kind).toBe('scene-face');

      // Rendered content carries the '3 faces · 2 objects' summary.
      window.Vectura.SETTINGS.contextBarEnabled = true;
      CB.restoreState();
      const host = CB.getContentHost();
      const summary = host && host.querySelector('.ctxbar-scene-summary');
      expect(summary).toBeTruthy();
      expect(summary.textContent).toBe('3 faces · 2 objects');

      // Cleanup for other tests.
      app.renderer.setSceneSelection(null);
      app.renderer.setSelection([], null);
      app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    });
  });
});
