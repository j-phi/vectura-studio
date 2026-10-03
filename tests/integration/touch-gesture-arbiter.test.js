/**
 * TUX-017 — a second touch always starts a pinch/pan (renderer + arbiter).
 *
 * Drives the REAL renderer inside the full app with synthetic touch pointer
 * events that carry explicit timeStamps. Table-driven: for each tool/state the
 * first finger starts that tool's action, a small move arms/mutates it, and a
 * second finger lands 60 ms after the first (inside the arbitration window).
 * Roll-back must leave EVERYTHING as it was: document state (captureState JSON),
 * history length, selection, active layer, scene selection, pen draft, and every
 * interaction flag. Commit row: a deliberate drag (400 ms hold, 40 px) followed
 * by a late second finger commits exactly one undo step and starts the pinch.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};
const makeScenePaths = () => [
  P([[80, 80], [160, 80], [160, 160], [80, 160], [80, 80]], {
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
  lights: [
    { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true },
    { id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 1, castShadows: true },
  ],
  ground: { enabled: true },
  camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

const rect = (x0, y0, x1, y1) => [[
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
]];

describe('TUX-017 gesture arbiter (renderer)', () => {
  let runtime;
  let window;
  let app;
  let renderer;
  let engine;
  let A;
  let ids;
  let scenePathsFactory = makeScenePaths;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    window.Vectura.Algorithms = window.Vectura.Algorithms || {};
    window.Vectura.Algorithms.scene3d = { generate: () => scenePathsFactory() };
    window.app = new window.Vectura.App();
    app = window.app;
    await new Promise((r) => setTimeout(r, 80));
    renderer = app.renderer;
    engine = app.engine;
    A = window.Vectura.TouchGestureArbiter;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // ── fixtures ────────────────────────────────────────────────────────────
  const reset = () => {
    // Hard-clear any state a previous (possibly failed) row left behind.
    renderer.clearTouchHold?.();
    A.INTERACTION_FLAGS.forEach((f) => { renderer[f] = f.startsWith('is') ? false : null; });
    renderer.tempTransform = null;
    renderer.dragMode = null;
    renderer.cancelPenPath?.();
    renderer.setSceneSelection(null, { silent: true });
    renderer.setSelection([], null);
    engine.layers = [];
    engine.activeLayerId = null;
    app.history = [];
    app.redoStack = [];
    app.ui.setActiveTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.touchArbiter?.abort?.();
    renderer.touchPointers?.clear?.();
    renderer.touchGesture = null;
    renderer.activePointerId = null;
    renderer.onScissor = null;
    window.Vectura.SETTINGS.snapGuides = false;
    window.Vectura.SETTINGS.showGuides = false;
  };

  const add2d = () => {
    reset();
    const a = engine.addShapeLayer('A', rect(40, 40, 80, 80));
    const b = engine.addShapeLayer('B', rect(140, 40, 180, 80));
    ids = { a, b };
    renderer.setSelection([a], a);
    app.history = [];
    app.pushHistory();
    return ids;
  };

  const addScene = () => {
    reset();
    scenePathsFactory = makeScenePaths;
    const scene = new window.Vectura.Layer('scene-1', 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...makeSceneParams() };
    scene.paths = makeScenePaths();
    engine.layers.push(scene);
    engine.activeLayerId = scene.id;
    // One regen normalizes the hand-authored params, so a rollback regen cannot differ from
    // the "before" state only by default fields.
    engine.generate(scene.id);
    // Selecting an object lets the scene UI normalize the object records once (adds default
    // fields); do it before the "before" snapshot so a rollback cannot differ by defaults only.
    renderer.setSelection([scene.id], scene.id);
    renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] });
    renderer.setSceneSelection(null);
    app.history = [];
    app.pushHistory();
    return scene;
  };

  // ── synthetic touch events ──────────────────────────────────────────────
  const ev = (id, t, x, y, extra = {}) => ({
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, timeStamp: t, clientX: x, clientY: y,
    button: 0, buttons: 1, cancelable: true, preventDefault() {}, stopPropagation() {}, ...extra,
  });

  const observe = () => ({
    state: JSON.stringify(app.captureState()),
    hist: app.history.length,
    sel: [...renderer.selectedLayerIds].sort(),
    primary: renderer.selectedLayerId,
    active: engine.activeLayerId,
    scene: JSON.stringify(renderer.getSceneSelection()),
    penDraft: JSON.stringify(renderer.penDraft),
  });

  // First difference between two JSON strings, with context (readable failure message).
  const firstDiff = (a, b) => {
    if (a === b) return 'identical';
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    return `differs at ${i}: before=...${a.slice(Math.max(0, i - 60), i + 80)} | after=...${b.slice(Math.max(0, i - 60), i + 80)}`;
  };

  const stuckFlags = () => A.INTERACTION_FLAGS.filter((f) => renderer[f]);

  // first finger down (+ optional arm + small move), second finger 60 ms later.
  const runWindowRow = ({ p1, arm, move = { dx: 3, dy: 2 }, dtMs = 60 }) => {
    const before = observe();
    renderer.down(ev(1, 1000, p1.x, p1.y));
    if (arm) arm();
    if (move) renderer.move(ev(1, 1030, p1.x + move.dx, p1.y + move.dy));
    renderer.down(ev(2, 1000 + dtMs, p1.x + 90, p1.y + 40));
    return before;
  };

  const expectRolledBack = (before) => {
    expect(renderer.touchGesture).toBeTruthy();
    expect(stuckFlags()).toEqual([]);
    const after = observe();
    expect(after.hist).toBe(before.hist);
    expect(after.sel).toEqual(before.sel);
    expect(after.primary).toBe(before.primary);
    expect(after.active).toBe(before.active);
    expect(after.scene).toBe(before.scene);
    expect(after.penDraft).toBe(before.penDraft);
    expect(firstDiff(before.state, after.state)).toBe('identical');
  };

  const liftAll = () => {
    renderer.up(ev(1, 2000, 0, 0, { buttons: 0 }));
    renderer.up(ev(2, 2010, 0, 0, { buttons: 0 }));
  };

  // ── 2D rows ─────────────────────────────────────────────────────────────
  const rows2d = [
    ['Select: empty canvas, layer pre-selected', () => { add2d(); return { p1: { x: 110, y: 150 } }; }],
    ['Select: on the selected object', () => { add2d(); return { p1: { x: 60, y: 60 } }; }],
    ['Select: on an unselected object (selects at down)', () => { add2d(); return { p1: { x: 160, y: 60 } }; }],
    ['Direct: empty canvas', () => { add2d(); app.ui.setActiveTool('direct'); return { p1: { x: 110, y: 150 } }; }],
    ['Direct: on an anchor', () => {
      const { a } = add2d();
      app.ui.setActiveTool('direct');
      renderer.setDirectSelection(engine.layers.find((l) => l.id === a), 0);
      return { p1: { x: 40, y: 40 } };
    }],
    ['Pen: empty canvas', () => { add2d(); app.ui.setActiveTool('pen'); return { p1: { x: 110, y: 150 } }; }],
    ['Pen: continuing an existing draft', () => {
      add2d();
      app.ui.setActiveTool('pen');
      renderer.penDraft = { anchors: [renderer.createAnchor({ x: 100, y: 120 }), renderer.createAnchor({ x: 130, y: 120 })], closed: false };
      return { p1: { x: 110, y: 150 } };
    }],
    ['Lasso', () => { add2d(); app.ui.setActiveTool('lasso'); return { p1: { x: 110, y: 150 } }; }],
    ['Scissor', () => {
      add2d();
      app.ui.setActiveTool('scissor');
      renderer.onScissor = vi.fn();
      return { p1: { x: 30, y: 60 } };
    }],
    ['Shape draft', () => { add2d(); app.ui.setActiveTool('shape-rect'); return { p1: { x: 110, y: 150 } }; }],
    ['Algo draft', () => { add2d(); app.ui.setActiveTool('algo-draw'); return { p1: { x: 110, y: 150 } }; }],
    ['Fill (no pour, no history)', () => { add2d(); app.ui.setActiveTool('fill'); return { p1: { x: 60, y: 60 } }; }],
    ['Fill pattern (no pour, no history)', () => { add2d(); app.ui.setActiveTool('fill-pattern'); return { p1: { x: 60, y: 60 } }; }],
    ['Type: empty canvas (_areaCreate cleared, no layer)', () => { add2d(); app.ui.setActiveTool('type'); return { p1: { x: 110, y: 150 } }; }],
    ['Hand', () => { add2d(); app.ui.setActiveTool('hand'); return { p1: { x: 110, y: 150 } }; }],
    ['Resize handle', () => {
      const { a } = add2d();
      const layer = engine.layers.find((l) => l.id === a);
      const b = renderer.getSelectionBounds([layer]);
      const pt = renderer.getHandlePoint('se', b);
      return { p1: { x: pt.x, y: pt.y } };
    }],
    ['Rotate handle', () => {
      const { a } = add2d();
      const layer = engine.layers.find((l) => l.id === a);
      const b = renderer.getSelectionBounds([layer]);
      const handle = ['rotate-se', 'rotate-ne', 'rotate-sw', 'rotate-nw', 'rotate']
        .find((h) => { try { return !!renderer.getHandlePoint(h, b); } catch (_e) { return false; } });
      const pt = renderer.getHandlePoint(handle, b);
      return { p1: { x: pt.x, y: pt.y } };
    }],
  ];

  rows2d.forEach(([name, setup]) => {
    test(`rollback: ${name}`, () => {
      const fx = setup();
      const before = runWindowRow(fx);
      expectRolledBack(before);
      if (name.startsWith('Scissor')) expect(renderer.onScissor).not.toHaveBeenCalled();
      if (name.startsWith('Shape draft') || name.startsWith('Algo draft') || name.startsWith('Type')) {
        expect(engine.layers.length).toBe(2);
      }
      liftAll();
      expect(renderer.touchArbiter.pointers.size).toBe(0);
      expect(renderer.touchArbiter.gestureActive).toBe(false);
    });
  });

  // ── 3D rows ─────────────────────────────────────────────────────────────
  const rows3d = [
    ['scene object gizmo', (scene) => {
      renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'] }, { silent: true });
      const giz = renderer.getSceneObjectGizmo(scene);
      const tip = giz.axes.find((a) => a.key === 'x').tip;
      return { p1: { x: tip.x, y: tip.y } };
    }],
    ['scene ground drag', () => ({ p1: { x: 120, y: 120 } })],
    ['light drag (sun widget)', (scene) => {
      const ctl = renderer.getSceneLightControl(scene);
      return { p1: { x: ctl.pos.x, y: ctl.pos.y } };
    }],
    ['light gizmo', (scene) => {
      renderer.setSelectedSceneLight(scene.id, 'p1');
      const giz = renderer.getSceneLightGizmo(scene);
      const tip = giz.axes.find((a) => a.key === 'x').tip;
      return { p1: { x: tip.x, y: tip.y } };
    }],
    // The legacy corner-resize handle is superseded by the unified gizmo and is not reachable
    // through down() for a single object, so the drag is armed right after a real touch down.
    ['scene resize (armed after touch down)', (scene) => {
      const sel = { layerId: scene.id, mode: 'object', objectIds: ['obj-1'] };
      renderer.setSceneSelection(sel, { silent: true });
      const bbox = renderer._sceneResizeBBox(scene);
      const c = bbox.corners.se;
      return {
        p1: { x: 300, y: 300 },
        arm: () => {
          renderer.setSceneSelection(sel, { silent: true });
          renderer.beginSceneResizeDrag({ layer: scene, handle: 'se', bbox }, { clientX: c.x, clientY: c.y });
        },
      };
    }],
    ['scene face-pull', (scene) => {
      scenePathsFactory = () => [...makeScenePaths(), P([[160, 90], [185, 90], [185, 150], [160, 150], [160, 90]], {
        kind: 'sceneFace', closed: true,
        sceneTarget: { objectId: 'obj-1', faceId: 'face:+X', depth: 8, occluded: false },
      })];
      engine.generate(scene.id);
      renderer.setSceneSelection({ layerId: scene.id, mode: 'face', faceKeys: ['obj-1/face:+X'] }, { silent: true });
      const fp = renderer._sceneFacePull(scene);
      return { p1: { x: fp.centroid.x, y: fp.centroid.y } };
    }],
  ];

  rows3d.forEach(([name, setup]) => {
    test(`rollback: ${name}`, () => {
      const scene = addScene();
      const fx = setup(scene);
      const before = runWindowRow({ ...fx, move: { dx: 6, dy: 4 } });
      expectRolledBack(before);
      liftAll();
      expect(renderer.touchArbiter.gestureActive).toBe(false);
    });
  });

  test('rollback: rotation3DDrag (orbit gizmo on a polyhedron)', () => {
    reset();
    const id = engine.addLayer('polyhedron');
    const layer = engine.layers.find((l) => l.id === id);
    renderer.setSelection([id], id);
    app.ui.setActiveTool('select');
    app.history = [];
    app.pushHistory();
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    const start = renderer.worldToScreen(control.center.x, control.center.y);
    const before = runWindowRow({ p1: { x: start.x, y: start.y }, move: { dx: 6, dy: 4 } });
    expect(renderer.touchGesture).toBeTruthy();
    expect(stuckFlags()).toEqual([]);
    const after = observe();
    expect(after.hist).toBe(before.hist);
    expect(firstDiff(before.state, after.state)).toBe('identical');
    liftAll();
  });

  // ── commit row ──────────────────────────────────────────────────────────
  test('commit: 400 ms hold on the selected object, 40 px move, then a late second finger', async () => {
    const { a } = add2d();
    const layer = engine.layers.find((l) => l.id === a);
    const hist0 = app.history.length;
    const c0 = renderer.getSelectionBounds([layer]).center;
    renderer.down(ev(1, 1000, 60, 60));
    await new Promise((r) => setTimeout(r, 420)); // touch-hold timer arms the drag
    expect(renderer.isLayerDrag).toBe(true);
    for (let i = 1; i <= 8; i += 1) renderer.move(ev(1, 1400 + i * 25, 60 + 5 * i, 60));
    renderer.down(ev(2, 1700, 160, 100));
    expect(renderer.touchGesture).toBeTruthy();
    expect(app.history.length).toBe(hist0 + 1);
    const c1 = renderer.getSelectionBounds([layer]).center;
    const tol = 2 / renderer.scale;
    expect(Math.abs(c1.x - c0.x - 40 / renderer.scale)).toBeLessThanOrEqual(tol);
    expect(Math.abs(c1.y - c0.y)).toBeLessThanOrEqual(tol);
    expect(stuckFlags()).toEqual([]);
    liftAll();
    expect(app.history.length).toBe(hist0 + 1);
  });

  // ── latch ───────────────────────────────────────────────────────────────
  test('latch: after the pinch, one remaining finger starts nothing until all lift', () => {
    add2d();
    renderer.setTool('select');
    renderer.down(ev(1, 1000, 110, 150));
    renderer.down(ev(2, 1060, 200, 190));
    expect(renderer.touchGesture).toBeTruthy();
    const view = [renderer.scale, renderer.offsetX, renderer.offsetY];
    const before = observe();
    renderer.up(ev(2, 1500, 200, 190, { buttons: 0 }));
    for (let i = 1; i <= 5; i += 1) renderer.move(ev(1, 1500 + i * 10, 110 + 12 * i, 150));
    expect(renderer.isSelecting).toBeFalsy();
    expect(renderer.isPan).toBeFalsy();
    expect([renderer.scale, renderer.offsetX, renderer.offsetY]).toEqual(view);
    // A new finger while one is still down is ignored (no restarted pinch).
    renderer.down(ev(3, 1600, 30, 30));
    expect(renderer.touchGesture).toBeFalsy();
    renderer.up(ev(3, 1650, 30, 30, { buttons: 0 }));
    renderer.up(ev(1, 1700, 170, 150, { buttons: 0 }));
    expect(renderer.isSelecting).toBeFalsy();
    expect(observe().state).toBe(before.state);
    expect(observe().hist).toBe(before.hist);
    expect(renderer.touchArbiter.gestureActive).toBe(false);
    // The next gesture works again.
    renderer.down(ev(1, 3000, 110, 150));
    expect(renderer.isSelecting).toBe(true);
    renderer.up(ev(1, 3100, 110, 150, { buttons: 0 }));
  });

  // ── single-finger touch behavior is unchanged (deferred one-shots still run) ─────────
  test('one finger: a tap on empty canvas still deselects (deferred clear runs at pointerup)', () => {
    add2d();
    renderer.down(ev(1, 1000, 110, 150));
    expect([...renderer.selectedLayerIds]).toEqual([ids.a]); // deferred: not cleared at down
    renderer.up(ev(1, 1080, 110, 150, { buttons: 0 }));
    expect(renderer.selectedLayerIds.size).toBe(0);
    expect(renderer.touchPointers.size).toBe(0);
  });

  test('one finger: a marquee drag past the slop clears, then selects the layer it covers', () => {
    const { b } = add2d();
    renderer.down(ev(1, 1000, 120, 20));
    renderer.move(ev(1, 1050, 140, 30));
    expect(renderer.selectedLayerIds.size).toBe(0); // cleared once the finger moved past the slop
    renderer.move(ev(1, 1100, 200, 100));
    renderer.up(ev(1, 1150, 200, 100, { buttons: 0 }));
    expect([...renderer.selectedLayerIds]).toEqual([b]);
  });

  test('one finger: a fill tap pours at pointerup, not at pointerdown', () => {
    const { a } = add2d();
    app.ui.setActiveTool('fill');
    const layer = engine.layers.find((l) => l.id === a);
    const fillsBefore = (layer.fills || []).length;
    const histBefore = app.history.length;
    renderer.down(ev(1, 1000, 60, 60));
    expect((layer.fills || []).length).toBe(fillsBefore);
    expect(app.history.length).toBe(histBefore);
    renderer.up(ev(1, 1090, 60, 60, { buttons: 0 }));
    expect((layer.fills || []).length + (app.history.length - histBefore)).toBeGreaterThan(0);
  });

  // ── pointer-type scope + mouse parity (D6) ─────────────────────────────
  const mouseEv = (x, y, extra = {}) => ({
    pointerId: 1, pointerType: 'mouse', timeStamp: 1, clientX: x, clientY: y, button: 0, buttons: 1,
    cancelable: true, preventDefault() {}, ...extra,
  });

  test('mouse parity: marquee selects the intersected layer, the arbiter map stays empty', () => {
    const { b } = add2d();
    renderer.down(mouseEv(120, 20));
    expect(renderer.isSelecting).toBe(true);
    expect(renderer.selectedLayerIds.size).toBe(0); // plain marquee clears at down (mouse path unchanged)
    renderer.move(mouseEv(200, 100));
    renderer.up(mouseEv(200, 100, { buttons: 0 }));
    expect([...renderer.selectedLayerIds]).toEqual([b]);
    expect(renderer.touchPointers.size).toBe(0);
    expect(app.history.length).toBe(1);
  });

  test('mouse parity: layer drag moves the layer and adds one history entry', () => {
    const { a } = add2d();
    const layer = engine.layers.find((l) => l.id === a);
    const c0 = renderer.getSelectionBounds([layer]).center;
    renderer.down(mouseEv(60, 60));
    expect(renderer.isLayerDrag).toBe(true);
    renderer.move(mouseEv(90, 60));
    renderer.up(mouseEv(90, 60, { buttons: 0 }));
    const c1 = renderer.getSelectionBounds([layer]).center;
    expect(c1.x - c0.x).toBeCloseTo(30, 3);
    expect(app.history.length).toBe(2);
    expect(renderer.touchPointers.size).toBe(0);
  });

  test('pen pointer: a pen stroke in flight is not rolled back by two touches', () => {
    const { a } = add2d();
    const layer = engine.layers.find((l) => l.id === a);
    const c0 = renderer.getSelectionBounds([layer]).center;
    const pen = (x, y, extra = {}) => ({
      pointerId: 9, pointerType: 'pen', timeStamp: 1, clientX: x, clientY: y, button: 0, buttons: 1,
      cancelable: true, preventDefault() {}, ...extra,
    });
    renderer.down(pen(60, 60));
    expect(renderer.isLayerDrag).toBe(true);
    renderer.move(pen(80, 60));
    renderer.down(ev(1, 1000, 200, 200));
    renderer.down(ev(2, 1060, 260, 200));
    expect(renderer.isLayerDrag).toBe(true);
    expect(renderer.touchGesture).toBeFalsy();
    renderer.move(pen(100, 60));
    renderer.up(pen(100, 60, { buttons: 0 }));
    const c1 = renderer.getSelectionBounds([layer]).center;
    expect(c1.x - c0.x).toBeCloseTo(40, 3);
    expect(app.history.length).toBe(2);
    renderer.up(ev(1, 2000, 200, 200, { buttons: 0 }));
    renderer.up(ev(2, 2010, 260, 200, { buttons: 0 }));
    expect(renderer.touchPointers.size).toBe(0);
  });

  // ── guard: a new drag type cannot be missed ────────────────────────────
  test('guard: every interaction-looking constructor property is in INTERACTION_FLAGS or exempt', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/render/renderer.js'), 'utf8');
    const start = src.indexOf('constructor(id, engine) {');
    const end = src.indexOf('this.ready = Boolean(this.canvas && this.ctx);', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    const names = new Set();
    const re = /^\s*this\.([_A-Za-z0-9]+)\s*=/gm;
    let m;
    while ((m = re.exec(body))) names.add(m[1]);
    const MATCH = /^_?(is[A-Z]\w*|\w*Drag|\w*Draft|_areaCreate|_typeDrag|touchHoldPending|lightSourcePlacement)$/;
    const EXEMPT = {
      penDraft: 'pen draft is restored from the first-down snapshot, not cleared',
      isLayerLocked: 'callback, not interaction state',
      lightSourcePlacement: 'mode armed from the UI; touch placement is deferred to pointerup',
    };
    const found = [...names].filter((n) => MATCH.test(n));
    expect(found.length).toBeGreaterThan(20);
    const missing = found.filter((n) => !A.INTERACTION_FLAGS.includes(n) && !EXEMPT[n]);
    expect(missing).toEqual([]);
    // Every listed flag must exist on the renderer and every exempt entry must match something real.
    A.INTERACTION_FLAGS.forEach((f) => expect(names.has(f)).toBe(true));
    Object.keys(EXEMPT).forEach((n) => expect(names.has(n)).toBe(true));
  });
});
