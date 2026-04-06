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
    const docBounds = { width: 200, height: 100 };
    const inset = { x: 20, y: 10, width: 160, height: 80 };
    const axis = Modifiers.getMirrorAxis({ angle: 90, xShift: 0, yShift: 0 }, docBounds);
    const segment = Modifiers.clipInfiniteAxisToBounds(axis, inset);

    expect(segment).not.toBeNull();
    expect(segment[0].x).toBeCloseTo(docBounds.width / 2, 5);
    expect(segment[1].x).toBeCloseTo(docBounds.width / 2, 5);
    expect(Math.min(segment[0].y, segment[1].y)).toBeCloseTo(inset.y, 5);
    expect(Math.max(segment[0].y, segment[1].y)).toBeCloseTo(inset.y + inset.height, 5);
  });
});
