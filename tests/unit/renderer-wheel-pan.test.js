const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.wheel modifier-key pan', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const createRenderer = () => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 240, height: 180 },
      getBounds() {
        return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.ready = true;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.scale = 1;
    renderer.draw = () => {};
    return renderer;
  };

  const fakeWheel = (overrides) => ({
    preventDefault: () => {},
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    deltaX: 0,
    deltaY: 0,
    clientX: 100,
    clientY: 100,
    ...overrides,
  });

  // macOS converts Shift+wheel into a horizontal scroll: deltaX carries the value, deltaY is 0
  test('Shift + scroll up: browser sets deltaX < 0, deltaY = 0 → view pans right', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ shiftKey: true, deltaX: -100, deltaY: 0 }));
    expect(r.offsetX).toBe(-100);
    expect(r.offsetY).toBe(0);
    expect(r.scale).toBe(1);
  });

  test('Shift + scroll down: browser sets deltaX > 0, deltaY = 0 → view pans left', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ shiftKey: true, deltaX: 100, deltaY: 0 }));
    expect(r.offsetX).toBe(100);
    expect(r.offsetY).toBe(0);
    expect(r.scale).toBe(1);
  });

  // Fallback: non-Mac or no browser conversion — deltaY carries the value, deltaX = 0
  test('Shift + scroll: when only deltaY is set (no browser conversion), still pans', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ shiftKey: true, deltaX: 0, deltaY: -100 }));
    expect(r.offsetX).toBe(-100);
    expect(r.offsetY).toBe(0);
    expect(r.scale).toBe(1);
  });

  test('Meta + scroll down (deltaY > 0) increases offsetY — view pans up', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ metaKey: true, deltaY: 100 }));
    expect(r.offsetY).toBe(100);
    expect(r.offsetX).toBe(0);
    expect(r.scale).toBe(1);
  });

  test('Meta + scroll up (deltaY < 0) decreases offsetY — view pans down', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ metaKey: true, deltaY: -100 }));
    expect(r.offsetY).toBe(-100);
    expect(r.offsetX).toBe(0);
    expect(r.scale).toBe(1);
  });

  test('no modifier zooms and does not alter scale/offset without deltaY direction change', () => {
    const r = createRenderer();
    r.wheel(fakeWheel({ deltaY: 100 }));
    expect(r.scale).toBeCloseTo(0.9, 5);
    r.wheel(fakeWheel({ deltaY: -100 }));
    expect(r.scale).toBeCloseTo(0.99, 2);
  });

  test('Shift pan does not change scale', () => {
    const r = createRenderer();
    r.scale = 2;
    r.wheel(fakeWheel({ shiftKey: true, deltaY: 50 }));
    expect(r.scale).toBe(2);
  });

  test('Meta pan does not change scale', () => {
    const r = createRenderer();
    r.scale = 3;
    r.wheel(fakeWheel({ metaKey: true, deltaY: -50 }));
    expect(r.scale).toBe(3);
  });
});
