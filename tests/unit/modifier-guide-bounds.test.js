const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror guide bounds helpers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('clipInfiniteAxisToBounds supports inset rectangles', () => {
    const { Modifiers } = runtime.window.Vectura;
    const axis = Modifiers.getMirrorAxis({ angle: 90, xShift: 0, yShift: 0 }, { width: 200, height: 100 });
    const segment = Modifiers.clipInfiniteAxisToBounds(axis, { x: 20, y: 10, width: 160, height: 80 });

    expect(segment).not.toBeNull();
    expect(segment[0].x).toBeCloseTo(100, 5);
    expect(segment[1].x).toBeCloseTo(100, 5);
    expect(Math.min(segment[0].y, segment[1].y)).toBeCloseTo(10, 5);
    expect(Math.max(segment[0].y, segment[1].y)).toBeCloseTo(90, 5);
  });
});
