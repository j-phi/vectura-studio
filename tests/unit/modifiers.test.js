const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror modifier helpers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('mirror axis keeps source side and reflects it onto the replaced side', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = {
      enabled: true,
      angle: 90,
      xShift: 0,
      yShift: 0,
      replacedSide: 'positive',
    };
    const input = [[
      { x: 70, y: 20 },
      { x: 80, y: 20 },
    ]];

    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });

    expect(out).toHaveLength(2);
    expect(out[0][0].x).toBeCloseTo(70, 3);
    expect(out[1][0].x).toBeCloseTo(30, 3);
    expect(out[1][1].x).toBeCloseTo(20, 3);
  });

  test('sequential crossing mirrors compound in stack order', () => {
    const { Modifiers } = runtime.window.Vectura;
    const modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [
        { enabled: true, angle: 90, xShift: 0, yShift: 0, replacedSide: 'positive' },
        { enabled: true, angle: 0, xShift: 0, yShift: 0, replacedSide: 'positive' },
      ],
    };
    const input = [[
      { x: 70, y: 30 },
      { x: 80, y: 30 },
    ]];

    const out = Modifiers.applyModifierToPaths(input, modifier, { width: 100, height: 100 });
    const firstPoints = out.map((path) => `${Math.round(path[0].x)}:${Math.round(path[0].y)}`).sort();

    expect(firstPoints).toEqual(['30:30', '30:70', '70:30', '70:70']);
  });
});
