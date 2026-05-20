/**
 * C7 — Contour expanded params tests.
 *   - contourDirection: 'inset' (default, original behavior) vs 'outset'
 *   - contourStepVariance (0..1): jitters per-ring spacing
 *   - contourSimplify (0..0.5): Douglas-Peucker tolerance on each ring
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Contour fill (C7 expanded params)', () => {
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
    fillType: 'contour',
    ...overrides,
  });

  test('renders contour fill with defaults (inset)', () => {
    const paths = gen(base());
    expect(paths.length).toBeGreaterThan(0);
  });

  test('contourDirection=outset produces a different result than inset', () => {
    const inset = gen(base({ contourDirection: 'inset' }));
    const outset = gen(base({ contourDirection: 'outset' }));
    expect(inset.length).toBeGreaterThan(0);
    expect(outset.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
    expect(sig(inset)).not.toBe(sig(outset));
  });

  test('contourStepVariance>0 changes ring spacing', () => {
    const a = gen(base({ contourStepVariance: 0 }));
    const b = gen(base({ contourStepVariance: 0.6 }));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const sig = (paths) => paths.flat().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
    expect(sig(a)).not.toBe(sig(b));
  });

  test('contourSimplify>0 reduces total vertex count', () => {
    // Use a many-vertex polygon (circle) so simplify has something to chew on.
    const circle = (() => {
      const pts = [];
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * Math.PI * 2;
        pts.push({ x: 50 + 40 * Math.cos(t), y: 50 + 40 * Math.sin(t) });
      }
      return pts;
    })();
    const vertCount = (paths) => paths.reduce((acc, p) => acc + p.length, 0);
    const noSimp = vertCount(gen({ ...base(), region: circle, regions: [circle], contourSimplify: 0 }));
    const simp = vertCount(gen({ ...base(), region: circle, regions: [circle], contourSimplify: 0.3 }));
    expect(noSimp).toBeGreaterThan(0);
    expect(simp).toBeGreaterThan(0);
    expect(simp).toBeLessThan(noSimp);
  });
});
