/**
 * TUX-018a: a pointercancel (system gesture, palm, OS takeover) aborts the active canvas
 * interaction and restores the pre-gesture state. It never commits and never adds a
 * history entry.
 *
 * jsdom has no PointerEvent. The shim below is installed BEFORE `new Renderer(...)`, so the
 * renderer binds its real pointer listeners (pointerdown on the canvas; pointermove,
 * pointerup and pointercancel on window). Every case also asserts the interaction was really
 * in flight before the cancel, so no case can pass vacuously.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLAGS = [
  'isSelecting', 'isLassoSelecting', 'directDrag', 'penAnchorDrag', 'isPenDragging', 'isPenCloseDragging',
  'isPan', 'isScissor', 'isDirectMarquee', 'shapeCornerDrag', 'freeformCornerDrag', 'modifierDrag',
  '_sceneDrag', '_sceneObjectGizmoDrag', '_sceneLightGizmoDrag', '_sceneResizeDrag', '_sceneFacePullDrag', '_sceneLightDrag',
];

describe('TUX-018a: pointercancel aborts the active interaction', () => {
  let runtime;
  let win;
  let canvas;
  let renderer;
  let engine;
  let app;
  let A;
  let B;
  let cancelListenerSeen;

  const rect = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];

  const captureState = () => JSON.stringify(engine.layers.map((l) => ({
    id: l.id, paths: l.paths, sourcePaths: l.sourcePaths, params: l.params, transform: l.transform || null,
  })));

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    win = runtime.window;
    cancelListenerSeen = false;
    const origAdd = win.addEventListener.bind(win);
    win.addEventListener = (type, ...rest) => {
      if (type === 'pointercancel') cancelListenerSeen = true;
      return origAdd(type, ...rest);
    };
    win.PointerEvent = class extends win.MouseEvent {
      constructor(t, o = {}) {
        super(t, o);
        this.pointerId = o.pointerId ?? 1;
        this.pointerType = o.pointerType ?? 'mouse';
        this.isPrimary = o.isPrimary ?? true;
      }
    };
    const { VectorEngine, Renderer, Layer, SETTINGS } = win.Vectura;
    SETTINGS.snapGuides = false;
    SETTINGS.showGuides = false;
    engine = new VectorEngine();
    engine.layers = [];
    A = new Layer('tc-a', 'shape', 'A');
    A.sourcePaths = rect(40, 40, 80, 80);
    B = new Layer('tc-b', 'shape', 'B');
    B.sourcePaths = rect(140, 40, 180, 80);
    engine.layers.push(A, B);
    engine.generate(A.id);
    engine.generate(B.id);
    canvas = win.document.getElementById('main-canvas');
    renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;

    app = {
      history: [captureState()],
      redoStack: [],
      applyState(s) {
        const snap = JSON.parse(s);
        snap.forEach((st) => {
          const l = engine.layers.find((x) => x.id === st.id);
          if (!l) return;
          l.paths = st.paths;
          l.sourcePaths = st.sourcePaths;
          l.params = st.params;
        });
      },
    };
    renderer.app = app;
    const push = () => app.history.push(captureState());
    renderer.onCommitTransform = () => { if (!renderer._skipCommitHistory) push(); };
    renderer.onDuplicateLayer = push;
    renderer.onDirectEditStart = push;
  }

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const pe = (type, x, y, o = {}) => new win.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...o,
  });
  const down = (x, y, o = {}) => canvas.dispatchEvent(pe('pointerdown', x, y, o));
  const move = (x, y, o = {}) => win.dispatchEvent(pe('pointermove', x, y, o));
  const up = (x, y, o = {}) => win.dispatchEvent(pe('pointerup', x, y, o));
  const cancel = (o = {}) => win.dispatchEvent(pe('pointercancel', 0, 0, o));
  const T = { pointerType: 'touch', pointerId: 7 };

  const expectClean = (histBefore, histRefs) => {
    expect(app.history.length).toBe(histBefore);
    app.history.forEach((h, i) => expect(h).toBe(histRefs[i]));
    expect(renderer.isLayerDrag).toBe(false);
    expect(renderer.tempTransform).toBeNull();
    expect(renderer.activePointerId).toBeNull();
    FLAGS.forEach((f) => expect(Boolean(renderer[f])).toBe(false));
  };

  test('the shim makes the renderer bind real pointer listeners', async () => {
    await setup();
    expect(cancelListenerSeen).toBe(true);
  });

  test('(a) touch layer move: cancel restores the layer, adds no history', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const startState = captureState();
    const n = app.history.length;
    const refs = app.history.slice();
    down(60, 60, T);
    await sleep(400);
    for (let i = 1; i <= 10; i += 1) move(60 + i * 5, 60 + i * 5, T);
    expect(renderer.isLayerDrag).toBe(true);
    expect(renderer.tempTransform).toBeTruthy();
    expect(Math.abs(renderer.tempTransform.dx)).toBeGreaterThan(1);
    cancel(T);
    expectClean(n, refs);
    expect(captureState()).toBe(startState);
    expect(Math.abs(A.params.posX || 0)).toBeLessThan(1e-9);
    expect(Math.abs(A.params.posY || 0)).toBeLessThan(1e-9);
  });

  test('(b) alt-drag duplicate: cancel removes the copy and restores the selection', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const n = app.history.length;
    const refs = app.history.slice();
    down(60, 60, { altKey: true });
    expect(engine.layers.length).toBe(3);
    move(90, 60, { altKey: true });
    cancel();
    expect(engine.layers.length).toBe(2);
    expect([...renderer.selectedLayerIds]).toEqual([A.id]);
    expectClean(n, refs);
  });

  test('(c) marquee: cancel keeps the pre-selection exactly', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const n = app.history.length;
    const refs = app.history.slice();
    down(120, 20, T);
    move(200, 100, T);
    expect(renderer.isSelecting).toBe(true);
    cancel(T);
    expect([...renderer.selectedLayerIds]).toEqual([A.id]);
    expectClean(n, refs);
  });

  test('(d) pen: cancel during a handle drag keeps the 2-anchor open draft', async () => {
    await setup();
    renderer.setTool('pen');
    const mk = (x, y) => renderer.createAnchor({ x, y });
    renderer.penDraft = { anchors: [mk(100, 120), mk(130, 120)], closed: false };
    const before = JSON.stringify(renderer.penDraft);
    const n = app.history.length;
    const refs = app.history.slice();
    down(160, 140, T);
    move(185, 170, T);
    expect(renderer.penDraft.anchors.length).toBe(3);
    expect(renderer.isPenDragging).toBe(true);
    cancel(T);
    expect(JSON.stringify(renderer.penDraft)).toBe(before);
    expect(renderer.penDraft.closed).toBe(false);
    expectClean(n, refs);
  });

  test('(d2) pen: cancel during a close-drag on the first anchor stays open', async () => {
    await setup();
    renderer.setTool('pen');
    const mk = (x, y) => renderer.createAnchor({ x, y });
    renderer.penDraft = { anchors: [mk(100, 120), mk(130, 120)], closed: false };
    const before = JSON.stringify(renderer.penDraft);
    const n = app.history.length;
    const refs = app.history.slice();
    down(100, 120, T);
    move(110, 100, T);
    cancel(T);
    expect(renderer.penDraft.anchors.length).toBe(2);
    expect(renderer.penDraft.closed).toBe(false);
    expect(JSON.stringify(renderer.penDraft)).toBe(before);
    expectClean(n, refs);
  });

  test('(e) direct selection anchor drag: cancel restores the paths and history', async () => {
    await setup();
    const pts = [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }, { x: 200, y: 260 }];
    const path = pts.map((p) => ({ ...p }));
    path.meta = { kind: 'poly', closed: false, anchors: pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null })) };
    const L = new win.Vectura.Layer('tc-d', 'shape', 'D');
    L.sourcePaths = [path];
    L.params = { ...L.params, curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(L);
    engine.generate(L.id);
    renderer.setSelection([L.id], L.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(L, 0);
    const startState = captureState();
    const n = app.history.length;
    const refs = app.history.slice();
    down(200, 200, T);
    move(215, 215, T);
    move(235, 240, T);
    expect(renderer.directDrag).toBeTruthy();
    expect(app.history.length).toBe(n + 1);
    expect(captureState()).not.toBe(startState);
    cancel(T);
    expect(captureState()).toBe(startState);
    expectClean(n, refs);
  });

  test('(g) foreign pointer cancel is ignored; a real pointerup still commits', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const n = app.history.length;
    down(60, 60, T);
    await sleep(400);
    for (let i = 1; i <= 10; i += 1) move(60 + i * 5, 60, T);
    expect(renderer.isLayerDrag).toBe(true);
    cancel({ pointerType: 'touch', pointerId: 99 });
    expect(renderer.isLayerDrag).toBe(true);
    up(110, 60, T);
    expect(app.history.length).toBe(n + 1);
    expect(renderer.isLayerDrag).toBe(false);
    expect(Math.abs(A.params.posX || 0)).toBeGreaterThan(10);
  });

  test('(h) desktop parity: mouse drag commits, Escape reverts, mouse cancel aborts', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    let n = app.history.length;
    down(60, 60);
    move(100, 60);
    expect(renderer.isLayerDrag).toBe(true);
    up(100, 60);
    expect(app.history.length).toBe(n + 1);
    expect(Math.abs(A.params.posX || 0)).toBeGreaterThan(10);

    // Escape mid-drag reverts (unchanged behavior).
    const posAfter = A.params.posX;
    n = app.history.length;
    down(100, 60);
    move(140, 90);
    expect(renderer.isLayerDrag).toBe(true);
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(renderer.isLayerDrag).toBe(false);
    expect(app.history.length).toBe(n);
    expect(A.params.posX).toBe(posAfter);

    // A mouse pointercancel aborts as well (intended: same path as touch).
    down(100, 60);
    move(140, 90);
    expect(renderer.isLayerDrag).toBe(true);
    cancel();
    expect(renderer.isLayerDrag).toBe(false);
    expect(app.history.length).toBe(n);
    expect(A.params.posX).toBe(posAfter);
  });

  test('(i) pinch cancel: the view is kept, no history, pointer removed', async () => {
    await setup();
    const n = app.history.length;
    down(100, 100, { pointerType: 'touch', pointerId: 1, timeStamp: 1 });
    down(200, 100, { pointerType: 'touch', pointerId: 2, timeStamp: 2 });
    expect(renderer.touchGesture).toBeTruthy();
    move(100, 100, { pointerType: 'touch', pointerId: 1 });
    move(300, 100, { pointerType: 'touch', pointerId: 2 });
    const scale = renderer.scale;
    const ox = renderer.offsetX;
    const oy = renderer.offsetY;
    expect(scale).not.toBe(1);
    cancel({ pointerType: 'touch', pointerId: 2 });
    expect(renderer.scale).toBe(scale);
    expect(renderer.offsetX).toBe(ox);
    expect(renderer.offsetY).toBe(oy);
    expect(app.history.length).toBe(n);
    expect(renderer.touchPointers.has(2)).toBe(false);
  });

  test('guard: every top-level flag _finishPointerInteraction branches on is in INTERACTION_FLAGS', async () => {
    await setup();
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../src/render/renderer.js'), 'utf8');
    const start = src.indexOf('    _finishPointerInteraction(e = {}) {');
    const end = src.indexOf('// ——— SG-1/SG-4', start);
    const body = src.slice(start, end);
    const found = new Set();
    // Top-level (6-space indent) `if (this.flag)` branches of the finalize ladder.
    const re = /^ {6}if \(this\.(\w+)\) \{/gm;
    let m;
    while ((m = re.exec(body))) found.add(m[1]);
    const exempt = new Set(['touchGesture', 'activeTool', 'isLayerDrag']);
    const list = win.Vectura.TouchGestureArbiter.INTERACTION_FLAGS;
    const missing = [...found].filter((f) => !list.includes(f) && !exempt.has(f));
    expect(found.size).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});
