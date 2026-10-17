/**
 * TUX-007: the fit path (ResizeObserver -> resize() -> center()) must keep scale > 0 for every
 * container size, including 0. A non-positive scale made the selection/handle draw code ask for
 * a negative arc radius (k / scale), which a real canvas rejects with IndexSizeError.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer fit clamp (TUX-007)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });
  afterAll(() => runtime.cleanup());

  // A ctx that behaves like a real canvas for arc(): a negative radius throws IndexSizeError.
  const makeStrictCtx = () => new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'arc') {
        return (x, y, r) => {
          if (r < 0) throw new Error(`IndexSizeError: The radius provided (${r}) is negative.`);
        };
      }
      if (prop === 'getLineDash') return () => [];
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });

  const setup = () => {
    const { Renderer, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const layerId = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === layerId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.ctx = makeStrictCtx();
    renderer.activeTool = 'select';
    layer.paths = [[{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 60 }, { x: 20, y: 60 }]];
    renderer.setSelection([layer.id], layer.id);
    const box = { w: 874, h: 402 };
    const rect = () => ({ left: 0, top: 0, width: box.w, height: box.h, right: box.w, bottom: box.h, x: 0, y: 0 });
    renderer.canvas.parentElement.getBoundingClientRect = rect;
    renderer.canvas.getBoundingClientRect = rect;
    return { renderer, engine, box };
  };

  const minScale = () => {
    const cfg = runtime.window.Vectura.VIEW || {};
    return cfg.minScale;
  };

  test('config exposes a positive minimum scale', () => {
    expect(minScale()).toBeGreaterThan(0);
    expect(runtime.window.Vectura.VIEW.maxScale).toBeGreaterThan(minScale());
  });

  const heights = [];
  for (let h = 0; h <= 120; h += 4) heights.push(h);
  const widths = [0, 50, 874];

  test.each(widths)('resize() sweep at width %i keeps scale positive, finite and clamped', (w) => {
    const { renderer, box } = setup();
    heights.forEach((h) => {
      box.w = w;
      box.h = h;
      renderer.userHasManipulated = false;
      renderer.resize();
      expect(Number.isFinite(renderer.scale), `scale finite at ${w}x${h}`).toBe(true);
      expect(renderer.scale, `scale > 0 at ${w}x${h}`).toBeGreaterThan(0);
      expect(renderer.scale, `scale >= min at ${w}x${h}`).toBeGreaterThanOrEqual(minScale());
      expect(Number.isFinite(renderer.offsetX)).toBe(true);
      expect(Number.isFinite(renderer.offsetY)).toBe(true);
      expect(() => renderer.draw(), `draw with a selected layer at ${w}x${h}`).not.toThrow();
    });
  });

  test('arc guard: a non-positive scale still draws the selection without a negative radius', () => {
    const { renderer } = setup();
    renderer.scale = 1;
    expect(renderer._textModeWidgetInfo(), 'fixture must reach the text widget').toBeTruthy();
    renderer.scale = -0.074;
    expect(() => renderer.draw()).not.toThrow();
    renderer.scale = 0;
    expect(() => renderer.draw()).not.toThrow();
  });

  test('desktop fit parity: a 1600x1000 container fits exactly as before the clamp', () => {
    const { renderer, engine, box } = setup();
    box.w = 1600;
    box.h = 1000;
    renderer.userHasManipulated = false;
    renderer.resize();
    const p = engine.currentProfile;
    const expected = Math.min((1600 - 60) / p.width, (1000 - 60) / p.height);
    expect(renderer.scale).toBe(expected);
    expect(renderer.offsetX).toBe((1600 - p.width * expected) / 2);
    expect(renderer.offsetY).toBe((1000 - p.height * expected) / 2);
  });
});
