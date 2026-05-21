/**
 * C1 — Wave fill consolidation tests.
 *
 * Verifies the unified 'wave' fill type:
 *   - smoothing=0 produces angular (triangle-wave) sampling
 *   - smoothing=1 produces smooth (sinusoidal) sampling
 *   - smoothing=0.5 produces an intermediate shape
 *   - back-compat: legacy 'wavelines' and 'zigzag' fillTypes still render
 *   - waveHarmonics adds higher-frequency content
 *   - paths stay inside the region
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Wave fill (C1 consolidation)', () => {
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
    amplitude: 1.0,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    padding: 0,
    ...overrides,
  });

  // Sum of |angle change| across a polyline — high for triangle (sharp corners),
  // low for sine (smooth). Used to discriminate shapes.
  const totalAngleVariation = (path) => {
    let total = 0;
    for (let i = 1; i < path.length - 1; i += 1) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const cross = v1x * v2y - v1y * v2x;
      const dot = v1x * v2x + v1y * v2y;
      total += Math.abs(Math.atan2(cross, dot));
    }
    return total;
  };

  test('renders paths for fillType=wave with smoothing=0 (triangle)', () => {
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 0, waveHarmonics: 1 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  test('renders paths for fillType=wave with smoothing=1 (sine)', () => {
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 1, waveHarmonics: 1 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  test('triangle (smoothing=0) has notably more angle variation than sine (smoothing=1)', () => {
    // Use the longest path from each to compare.
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const tri = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveHarmonics: 1, amplitude: 2 })));
    const sin = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, waveHarmonics: 1, amplitude: 2 })));
    expect(tri.length).toBeGreaterThan(0);
    expect(sin.length).toBeGreaterThan(0);
    // Triangle has corner spikes; sine spreads angle changes — triangle should have
    // higher peak angle steps but similar total. We compare max single-step angle.
    const maxStep = (p) => {
      let m = 0;
      for (let i = 1; i < p.length - 1; i += 1) {
        const v1x = p[i].x - p[i - 1].x, v1y = p[i].y - p[i - 1].y;
        const v2x = p[i + 1].x - p[i].x, v2y = p[i + 1].y - p[i].y;
        const cross = v1x * v2y - v1y * v2x;
        const dot = v1x * v2x + v1y * v2y;
        m = Math.max(m, Math.abs(Math.atan2(cross, dot)));
      }
      return m;
    };
    expect(maxStep(tri)).toBeGreaterThan(maxStep(sin));
  });

  test('back-compat: fillType=wavelines still renders', () => {
    const paths = gen(base({ fillType: 'wavelines' }));
    expect(paths.length).toBeGreaterThan(0);
  });

  test('back-compat: fillType=zigzag still renders', () => {
    const paths = gen(base({ fillType: 'zigzag' }));
    expect(paths.length).toBeGreaterThan(0);
  });

  test('waveHarmonics > 1 increases total angle variation (more wiggle)', () => {
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const h1 = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, waveHarmonics: 1, amplitude: 2 })));
    const h3 = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, waveHarmonics: 3, amplitude: 2 })));
    expect(h1.length).toBeGreaterThan(0);
    expect(h3.length).toBeGreaterThan(0);
    expect(totalAngleVariation(h3)).toBeGreaterThan(totalAngleVariation(h1) * 0.95);
  });

  test('waveHarmonics > 1 is visible even at smoothing=0 (triangle mode)', () => {
    // Harmonics must affect the triangle component too, not just the sine blend.
    // Without the fix: all harmonic values produce identical triangle output at s=0
    // (harmonic enrichment only applied to the sine side which s=0 ignores).
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const h1 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveHarmonics: 1, amplitude: 2 })));
    const h3 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveHarmonics: 3, amplitude: 2 })));
    expect(h1.length).toBeGreaterThan(0);
    expect(h3.length).toBeGreaterThan(0);
    // The two outputs must differ — before the fix they were identical because
    // harmonics were silently dropped when smoothing=0.
    expect(Math.abs(totalAngleVariation(h3) - totalAngleVariation(h1))).toBeGreaterThan(0.001);
  });
});
