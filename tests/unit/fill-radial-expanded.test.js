/**
 * C6 — Radial expanded params tests.
 *   - radialSpokes (4..360) caps the spoke count
 *   - radialSkip (0..5) drops every Nth spoke
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Radial fill (C6 expanded params)', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => runtime.cleanup());

  const rect = (x, y, w, h) => ([
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y },
  ]);

  const base = (overrides = {}) => ({
    region: rect(0, 0, 100, 100),
    regions: [rect(0, 0, 100, 100)],
    density: 5,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    padding: 0,
    fillType: 'radial',
    ...overrides,
  });

  test('renders radial fill with defaults', () => {
    expect(gen(base()).length).toBeGreaterThan(0);
  });

  test('radialSpokes increases the path count when raised', () => {
    const few = gen(base({ radialSpokes: 12 })).length;
    const many = gen(base({ radialSpokes: 80 })).length;
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });

  test('radialSkip>0 reduces the path count', () => {
    const full = gen(base({ radialSpokes: 60, radialSkip: 0 })).length;
    const skipped = gen(base({ radialSpokes: 60, radialSkip: 2 })).length;
    expect(full).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);
    expect(skipped).toBeLessThan(full);
  });
});
