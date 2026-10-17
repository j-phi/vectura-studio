/**
 * TUX-020: pinch, wheel and the HUD buttons share one view-scale clamp (Vectura.VIEW).
 * Behavioral test against a real Renderer instance with a stubbed engine and draw().
 * RED on the previous base: pinch clamped at 20, wheel at 1000 (two literals), no zoomBy.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('View zoom limits (TUX-020)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); });
  afterAll(() => runtime.cleanup());

  const make = () => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 240, height: 180 },
      getBounds() { return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true }; },
    };
    const r = new Renderer('main-canvas', engine);
    r.ready = true;
    r.offsetX = 0;
    r.offsetY = 0;
    r.scale = 1;
    r.draw = () => {};
    const rect = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 };
    r.canvas.getBoundingClientRect = () => rect;
    return r;
  };
  const view = () => runtime.window.Vectura.VIEW;
  const touch = (id, x, y, t = 0) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: t });

  const pinchTo = (r, endDist) => {
    r.touchArbiter.down(touch(1, 300, 300, 0));
    r.touchArbiter.down(touch(2, 380, 300, 40));
    r.startTouchGesture();
    r.touchArbiter.update(touch(2, 300 + endDist, 300, 60));
    r.updateTouchGesture();
  };

  test('config exposes a zoom step above 1', () => {
    expect(view().zoomStep).toBeGreaterThan(1);
  });

  test('pinch out with an extreme span stops exactly at VIEW.maxScale', () => {
    const r = make();
    pinchTo(r, 1e7);
    expect(r.scale).toBe(view().maxScale);
  });

  test('pinch in with an extreme span stops exactly at VIEW.minScale', () => {
    const r = make();
    pinchTo(r, 8);
    expect(r.scale).toBeGreaterThanOrEqual(view().minScale);
    r.scale = 1;
    r.touchArbiter.abort();
    r.touchGesture = null;
    r.touchArbiter.down(touch(1, 300, 300, 0));
    r.touchArbiter.down(touch(2, 1300, 300, 40));
    r.startTouchGesture();
    r.touchArbiter.update(touch(2, 300 + 8, 300, 60));
    r.updateTouchGesture();
    expect(r.scale).toBe(view().minScale);
  });

  test('wheel zoom clamps to the same pair', () => {
    const r = make();
    const ev = (deltaY) => ({ preventDefault() {}, deltaX: 0, deltaY, clientX: 400, clientY: 300, shiftKey: false, metaKey: false, ctrlKey: false });
    for (let i = 0; i < 400; i += 1) r.wheel(ev(-100));
    expect(r.scale).toBe(view().maxScale);
    for (let i = 0; i < 400; i += 1) r.wheel(ev(100));
    expect(r.scale).toBe(view().minScale);
  });

  test('zoomBy clamps to the same pair and marks the view as user-set', () => {
    const r = make();
    expect(typeof r.zoomBy).toBe('function');
    r.userHasManipulated = false;
    r.zoomBy(1e9);
    expect(r.scale).toBe(view().maxScale);
    expect(r.userHasManipulated).toBe(true);
    r.zoomBy(1e-9);
    expect(r.scale).toBe(view().minScale);
  });

  test('zoomBy keeps the anchor world point fixed (default anchor = canvas centre)', () => {
    const r = make();
    r.scale = 2; r.offsetX = 30; r.offsetY = 10;
    const wx = (400 - r.offsetX) / r.scale;
    const wy = (300 - r.offsetY) / r.scale;
    r.zoomBy(view().zoomStep);
    expect(r.scale).toBeCloseTo(2 * view().zoomStep, 9);
    expect(r.offsetX + wx * r.scale).toBeCloseTo(400, 6);
    expect(r.offsetY + wy * r.scale).toBeCloseTo(300, 6);
  });

  test('fitToView leaves the view in the auto state', () => {
    const r = make();
    expect(typeof r.fitToView).toBe('function');
    r.zoomBy(3);
    expect(r.userHasManipulated).toBe(true);
    r.fitToView();
    expect(r.userHasManipulated).toBe(false);
    expect(r.scale).toBeGreaterThan(0);
  });

  test('layer-transform clamps are untouched (out of scope)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/render/renderer.js'), 'utf8');
    expect(src.split('Math.max(0.05, Math.min(Math.abs(scaleX), 20))').length - 1).toBe(1);
    expect(src.split('Math.max(0.05, Math.min(Math.abs(scaleY), 20))').length - 1).toBe(1);
    expect(src.split('Math.max(0.05, Math.min(Math.abs(s), 20))').length - 1).toBe(1);
  });
});
