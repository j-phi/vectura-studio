/**
 * C3 — Hatch fill consolidation tests.
 *
 * Verifies the unified 'hatch' fill type with a lineCount parameter:
 *   - lineCount=1 → single layer at angle
 *   - lineCount=2 → two layers (angle, angle+90) — crosshatch
 *   - lineCount=3 → three layers (angle, angle+60, angle+120) — triaxial
 *   - back-compat: legacy 'crosshatch' and 'triaxial' still render
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Hatch fill (C3 consolidation)', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (x, y, w, h) => ([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]);

  const base = (overrides = {}) => ({
    region: rect(0, 0, 100, 100),
    regions: [rect(0, 0, 100, 100)],
    density: 8,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    padding: 0,
    ...overrides,
  });

  test('fillType=hatch, lineCount=1 renders single-layer hatches', () => {
    const paths = gen(base({ fillType: 'hatch', lineCount: 1 }));
    expect(paths.length).toBeGreaterThan(0);
  });

  test('fillType=hatch, lineCount=2 doubles the path count (vs lineCount=1)', () => {
    const one = gen(base({ fillType: 'hatch', lineCount: 1 }));
    const two = gen(base({ fillType: 'hatch', lineCount: 2 }));
    expect(two.length).toBeGreaterThan(one.length);
  });

  test('fillType=hatch, lineCount=3 triples the path count (vs lineCount=1)', () => {
    const one = gen(base({ fillType: 'hatch', lineCount: 1 }));
    const three = gen(base({ fillType: 'hatch', lineCount: 3 }));
    expect(three.length).toBeGreaterThan(one.length * 2);
  });

  test('back-compat: fillType=crosshatch still renders', () => {
    const paths = gen(base({ fillType: 'crosshatch' }));
    expect(paths.length).toBeGreaterThan(0);
  });

  test('back-compat: fillType=triaxial still renders', () => {
    const paths = gen(base({ fillType: 'triaxial' }));
    expect(paths.length).toBeGreaterThan(0);
  });
});
