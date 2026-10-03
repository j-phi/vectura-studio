/**
 * TUX-022 D6: pointer-type parity for the paint bucket.
 * Mouse stays byte-identical (pour on down, Shift+drag multi-pour, CMD adopt, wheel scope).
 * Touch and pen preview on down and pour once on up. Drives renderer.down/move/up/wheel.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-022 paint bucket pointer parity', () => {
  let runtime;
  let win;
  let renderer;
  let engine;
  let app;

  const rect = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]];
  const fills = () => engine.layers.reduce((n, l) => n + ((l.fills && l.fills.length) || 0), 0);
  let t = 0;
  const ev = (type, x, y, o = {}) => ({
    type, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, cancelable: true, timeStamp: (t += 16), preventDefault() {}, ...o,
  });

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    win = runtime.window;
    win.PointerEvent = class extends win.MouseEvent {
      constructor(tp, o = {}) { super(tp, o); this.pointerId = o.pointerId ?? 1; this.pointerType = o.pointerType ?? 'mouse'; }
    };
    const { VectorEngine, Renderer, Layer, SETTINGS } = win.Vectura;
    SETTINGS.snapGuides = false;
    SETTINGS.showGuides = false;
    engine = new VectorEngine();
    engine.layers = [];
    [['a', rect(20, 20, 180, 180)], ['b', rect(50, 50, 150, 150)], ['c', rect(80, 80, 120, 120)]].forEach(([id, src]) => {
      const l = new Layer(`pb-${id}`, 'shape', id);
      l.sourcePaths = src;
      engine.layers.push(l);
      engine.generate(l.id);
    });
    const canvas = win.document.getElementById('main-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 });
    renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    app = { history: [], redoStack: [], pushHistory() { this.history.push(1); } };
    renderer.app = app;
    renderer.setTool('fill');
    engine.computeAllDisplayGeometry?.();
  });

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('mouse: pours on down, before up', () => {
    renderer.down(ev('pointerdown', 100, 100));
    expect(fills()).toBe(1);
    renderer.up(ev('pointerup', 100, 100));
    expect(fills()).toBe(1);
    expect(renderer.paintBucketScopeOffset).toBe(0);
    expect(renderer._fillPendingPour).toBe(null);
  });

  test('mouse: Shift+drag across three regions pours three fills', () => {
    renderer.down(ev('pointerdown', 100, 100, { shiftKey: true }));
    renderer.move(ev('pointermove', 65, 100, { shiftKey: true }));
    renderer.move(ev('pointermove', 35, 100, { shiftKey: true }));
    expect(fills()).toBe(3);
    renderer.up(ev('pointerup', 35, 100));
  });

  test('mouse: wheel cycles the scope index', () => {
    renderer.move(ev('pointermove', 100, 100, { buttons: 0 }));
    expect(renderer.paintBucketScopeIndex).toBe(0);
    expect(renderer.paintBucketStack.length).toBeGreaterThan(1);
    renderer.wheel({ deltaY: -1, deltaX: 0, preventDefault() {} });
    expect(renderer.paintBucketScopeIndex).toBe(1);
    expect(renderer.paintBucketScopeOffset).toBe(0);
  });

  test('mouse: a meta down adopts the fill and does not pour', () => {
    renderer.down(ev('pointerdown', 100, 100));
    renderer.up(ev('pointerup', 100, 100));
    expect(fills()).toBe(1);
    renderer.down(ev('pointerdown', 100, 100, { metaKey: true }));
    expect(fills()).toBe(1);
    expect(renderer.lastPaintedFillRefs.length).toBe(1);
    renderer.up(ev('pointerup', 100, 100));
  });

  test.each(['touch', 'pen'])('%s: previews on down, pours once on up into the last previewed region', (pointerType) => {
    renderer.down(ev('pointerdown', 100, 100, { pointerType }));
    expect(fills()).toBe(0);
    expect(renderer.patternFillPreviewPolygon).toBeTruthy();
    expect(renderer._fillPendingPour).toBeTruthy();
    const first = renderer.paintBucketStack[0].loopId;
    renderer.move(ev('pointermove', 65, 100, { pointerType }));
    expect(renderer.paintBucketStack[0].loopId).not.toBe(first);
    const last = renderer.paintBucketStack[0].loopId;
    renderer.up(ev('pointerup', 65, 100, { pointerType }));
    expect(fills()).toBe(1);
    const rec = engine.layers.flatMap((l) => l.fills || [])[0];
    expect(rec.loopId).toBe(last);
    expect(renderer.paintBucketStack).toBe(null);
    expect(renderer.patternFillPreviewPolygon).toBe(null);
    expect(renderer._fillPendingPour).toBe(null);
  });

  test('touch: a move off the paper drops the pending pour', () => {
    renderer.down(ev('pointerdown', 100, 100, { pointerType: 'touch' }));
    renderer.move(ev('pointermove', 390, 390, { pointerType: 'touch' }));
    expect(renderer._fillPendingPour).toBe(null);
    renderer.up(ev('pointerup', 390, 390, { pointerType: 'touch' }));
    expect(fills()).toBe(0);
  });

  test('scope offset: stepPaintBucketScope is sticky and clamps at 0', () => {
    renderer.stepPaintBucketScope(-1);
    expect(renderer.paintBucketScopeOffset).toBe(0);
    renderer.stepPaintBucketScope(1);
    expect(renderer.paintBucketScopeOffset).toBe(1);
    renderer.down(ev('pointerdown', 100, 100, { pointerType: 'touch' }));
    expect(renderer.paintBucketScopeIndex).toBe(1);
    renderer.up(ev('pointerup', 100, 100, { pointerType: 'touch' }));
    renderer.setTool('select');
    expect(renderer.paintBucketScopeOffset).toBe(0);
  });
});
