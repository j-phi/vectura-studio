/**
 * C5 — Spiral expanded params tests.
 *
 *   - spiralTurns (1..40) controls overall winding count
 *   - spiralTightness (0..1) interpolates Archimedean→log
 *   - spiralDirection cw/ccw flips angle progression
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Spiral fill (C5 expanded params)', () => {
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
    density: 5,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    padding: 0,
    fillType: 'spiral',
    ...overrides,
  });

  const pathLength = (paths) => paths.reduce(
    (acc, p) => acc + p.reduce(
      (a, pt, i) => (i === 0 ? a : a + Math.hypot(pt.x - p[i - 1].x, pt.y - p[i - 1].y)),
      0,
    ),
    0,
  );

  test('renders spiral fill with defaults', () => {
    const paths = gen(base());
    expect(paths.length).toBeGreaterThan(0);
  });

  test('higher spiralTurns increases total path length', () => {
    const lenA = pathLength(gen(base({ spiralTurns: 4 })));
    const lenB = pathLength(gen(base({ spiralTurns: 20 })));
    expect(lenA).toBeGreaterThan(0);
    expect(lenB).toBeGreaterThan(0);
    expect(lenB).toBeGreaterThan(lenA);
  });

  test('spiralTightness changes geometry (log-spiral curve differs from Archimedean)', () => {
    const a = gen(base({ spiralTightness: 0 }));
    const b = gen(base({ spiralTightness: 1 }));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
    expect(sig(a)).not.toBe(sig(b));
  });

  test('spiralDirection ccw differs from cw', () => {
    const cw = gen(base({ spiralDirection: 'cw' }));
    const ccw = gen(base({ spiralDirection: 'ccw' }));
    expect(cw.length).toBeGreaterThan(0);
    expect(ccw.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
    expect(sig(cw)).not.toBe(sig(ccw));
  });
});
