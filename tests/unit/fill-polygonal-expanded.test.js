/**
 * C4 — Polygonal expanded params tests.
 *
 * Verifies new params:
 *   - polyPadding (0..5) insets each polygon tile
 *   - polyRotation (0..360) base rotates each tile
 *   - polyRotationStep (-45..45) adds rotation per ring index
 *   - polyScaleStep (-0.5..0.5) scales per ring
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Polygonal fill (C4 expanded params)', () => {
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
    fillType: 'polygonal',
    axes: 6,
    polyTile: 'hexagonal',
    ...overrides,
  });

  const pathLength = (paths) => paths.reduce(
    (acc, p) => acc + p.reduce(
      (a, pt, i) => (i === 0 ? a : a + Math.hypot(pt.x - p[i - 1].x, pt.y - p[i - 1].y)),
      0,
    ),
    0,
  );

  test('renders polygonal fill with default params', () => {
    const paths = gen(base());
    expect(paths.length).toBeGreaterThan(0);
  });

  test('polyPadding>0 shrinks each tile (total stroke length decreases)', () => {
    const noPad = pathLength(gen(base({ polyPadding: 0 })));
    const withPad = pathLength(gen(base({ polyPadding: 1.5 })));
    expect(noPad).toBeGreaterThan(0);
    expect(withPad).toBeGreaterThan(0);
    expect(withPad).toBeLessThan(noPad);
  });

  test('polyRotation changes geometry (different path coordinates)', () => {
    const r0 = gen(base({ polyRotation: 0 }));
    const r30 = gen(base({ polyRotation: 30 }));
    expect(r0.length).toBeGreaterThan(0);
    expect(r30.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => p.x.toFixed(2)).sort().join(',');
    expect(sig(r0)).not.toBe(sig(r30));
  });

  test('polyScaleStep<0 shrinks outer ring tiles relative to center (total length decreases)', () => {
    const baseLen = pathLength(gen(base({ polyScaleStep: 0 })));
    const shrunk = pathLength(gen(base({ polyScaleStep: -0.2 })));
    expect(baseLen).toBeGreaterThan(0);
    expect(shrunk).toBeGreaterThan(0);
    expect(shrunk).toBeLessThan(baseLen);
  });

  test('polyRotationStep changes geometry across rings', () => {
    const a = gen(base({ polyRotationStep: 0 }));
    const b = gen(base({ polyRotationStep: 15 }));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
    expect(sig(a)).not.toBe(sig(b));
  });
});
