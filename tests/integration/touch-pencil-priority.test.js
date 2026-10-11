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

describe('TUX-021: Apple Pencil pointer takes priority over a resting palm', () => {
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
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5, ...o,
  });
  const down = (x, y, o = {}) => canvas.dispatchEvent(pe('pointerdown', x, y, o));
  const move = (x, y, o = {}) => win.dispatchEvent(pe('pointermove', x, y, o));
  const up = (x, y, o = {}) => win.dispatchEvent(pe('pointerup', x, y, o));
  const cancel = (x, y, o = {}) => win.dispatchEvent(pe('pointercancel', x, y, o));
  const PALM = { pointerType: 'touch', pointerId: 11 };
  const PALM2 = { pointerType: 'touch', pointerId: 12 };
  const PEN = { pointerType: 'pen', pointerId: 201 };
  const ids = () => [...renderer.selectedLayerIds].sort();
  const view = () => ({ s: renderer.scale, x: renderer.offsetX, y: renderer.offsetY });

  test('select tool: palm marquee in flight, pen down takes over and rolls the palm back', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const n = app.history.length;
    down(300, 200, PALM);
    move(330, 230, PALM);
    expect(renderer.activePointerId).toBe(11);
    expect(renderer.selectionStart).toBeTruthy();
    down(220, 120, PEN);
    expect(renderer.activePointerId).toBe(201);
    expect(renderer.selectionStart.x).toBeCloseTo(220, 3);
    expect(renderer.selectionStart.y).toBeCloseTo(120, 3);
    move(260, 150, PEN);
    const r = renderer.selectionRect;
    expect(r).toBeTruthy();
    expect(Math.min(r.x1 ?? r.x, r.x2 ?? r.x + r.w)).toBeGreaterThan(200);
    up(260, 150, PEN);
    expect(app.history.length).toBe(n);
  });

  test('pen tool: a resting palm anchor is rolled back; the pen anchor is the only one', async () => {
    await setup();
    renderer.setTool('pen');
    const n = app.history.length;
    down(100, 150, PALM);
    down(220, 140, PEN);
    expect(renderer.penDraft.anchors.length).toBe(1);
    expect(renderer.penDraft.anchors[0].x).toBeCloseTo(220, 0);
    expect(renderer.penDraft.anchors[0].y).toBeCloseTo(140, 0);
    expect(app.history.length).toBe(n);
    up(220, 140, PEN);
    up(100, 150, PALM);
    expect(renderer.penDraft.anchors.length).toBe(1);
  });

  test('select tool: palm selecting B is rolled back to the pre-palm selection', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    const tA = JSON.stringify(A.params); const tB = JSON.stringify(B.params);
    down(160, 60, PALM);
    down(60, 60, PEN);
    expect(ids()).toEqual([A.id]);
    up(60, 60, PEN);
    expect(JSON.stringify(A.params)).toBe(tA);
    expect(JSON.stringify(B.params)).toBe(tB);
  });

  test('two palm contacts pinch, then the pen: gesture stops, view restored, pen starts', async () => {
    await setup();
    renderer.setTool('pen');
    const v0 = view();
    down(300, 200, PALM);
    down(340, 200, PALM2);
    expect(renderer.touchGesture).toBeTruthy();
    move(280, 200, PALM);
    move(400, 200, PALM2);
    expect(renderer.scale).not.toBeCloseTo(v0.s, 3);
    down(120, 120, PEN);
    expect(renderer.touchGesture).toBeNull();
    expect(renderer.activePointerId).toBe(201);
    expect(Math.abs(renderer.scale - v0.s)).toBeLessThan(1e-6);
    expect(Math.abs(renderer.offsetX - v0.x)).toBeLessThan(1e-6);
    expect(Math.abs(renderer.offsetY - v0.y)).toBeLessThan(1e-6);
    expect(renderer.penDraft.anchors.length).toBe(1);
    up(120, 120, PEN);
    move(300, 300, PALM);
    up(300, 300, PALM);
    up(300, 300, PALM2);
  });

  test('palm lands mid-stroke: the pen stroke is intact and no pinch starts', async () => {
    await setup();
    renderer.setTool('pen');
    const v0 = view();
    down(100, 100, PEN);
    move(110, 105, PEN);
    down(300, 200, PALM);
    down(340, 200, PALM2);
    move(260, 200, PALM);
    move(420, 200, PALM2);
    expect(renderer.touchGesture).toBeNull();
    expect(renderer.activePointerId).toBe(201);
    move(130, 110, PEN);
    up(130, 110, PEN);
    expect(renderer.penDraft.anchors.length).toBe(1);
    expect(view()).toEqual(v0);
    up(260, 200, PALM);
    up(420, 200, PALM2);
    expect(renderer.penDraft.anchors.length).toBe(1);
  });

  test('late palm pointercancel does not abort the pen stroke', async () => {
    await setup();
    renderer.setTool('pen');
    const n = app.history.length;
    down(100, 150, PALM);
    down(220, 140, PEN);
    cancel(100, 150, PALM);
    move(222, 142, PEN);
    expect(renderer.activePointerId).toBe(201);
    up(222, 142, PEN);
    expect(renderer.penDraft.anchors.length).toBe(1);
    expect(renderer.penDraft.anchors[0].x).toBeCloseTo(220, 0);
    expect(app.history.length).toBe(n);
  });

  test('pen hover (buttons 0) never preempts a palm', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    down(300, 200, PALM);
    move(330, 230, PALM);
    down(220, 120, { ...PEN, buttons: 0, pressure: 0 });
    expect(renderer.activePointerId).toBe(11);
    move(230, 130, { ...PEN, buttons: 0 });
    expect(renderer.activePointerId).toBe(11);
  });

  test('desktop parity: mouse down during a touch marquee behaves as before', async () => {
    await setup();
    renderer.setSelection([A.id], A.id);
    down(300, 200, PALM);
    move(330, 230, PALM);
    const before = { id: renderer.activePointerId, ss: JSON.stringify(renderer.selectionStart) };
    down(220, 120, { pointerType: 'mouse', pointerId: 1 });
    // Base behavior (recorded on the unmodified renderer): the mouse exemption lets a mouse
    // pointerdown take over the canvas. TUX-021 must not change that.
    expect(before.id).toBe(11);
    expect(renderer.activePointerId).toBe(1);
    expect(renderer.selectionStart.x).toBeCloseTo(220, 3);
  });
});
