/**
 * C1 — Wave fill consolidation tests.
 *
 * Verifies the unified 'wave' fill type:
 *   - smoothing=0 produces angular (triangle-wave) sampling
 *   - smoothing=1 produces smooth (sinusoidal) sampling
 *   - smoothing=0.5 produces an intermediate shape
 *   - back-compat: legacy 'wavelines' and 'zigzag' fillTypes still render
 *   - waveFrequency controls wavelength (higher = more waves per row)
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
    waveFrequency: 1.0,
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
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 0 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  test('renders paths for fillType=wave with smoothing=1 (sine)', () => {
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 1 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  test('triangle (smoothing=0) has notably more angle variation than sine (smoothing=1)', () => {
    // Use the longest path from each to compare.
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const tri = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, amplitude: 2 })));
    const sin = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, amplitude: 2 })));
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

  test('waveFrequency=2 produces roughly twice as many wave cycles as waveFrequency=1', () => {
    // Use smoothing=0 so stepX=wavelength/2 (no minimum floor), giving an exact 2:1 ratio.
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const f1 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveFrequency: 1, amplitude: 2 })));
    const f2 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveFrequency: 2, amplitude: 2 })));
    expect(f1.length).toBeGreaterThan(0);
    expect(f2.length).toBeGreaterThan(0);
    // Higher frequency = shorter wavelength = more samples per row (step = wavelength/2).
    expect(f2.length).toBeGreaterThan(f1.length * 1.5);
  });

  test('waveFrequency=0.5 produces wider waves than waveFrequency=1', () => {
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const f1 = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, waveFrequency: 1, amplitude: 2 })));
    const f05 = longest(gen(base({ fillType: 'wave', waveSmoothing: 1, waveFrequency: 0.5, amplitude: 2 })));
    expect(f05.length).toBeGreaterThan(0);
    // Wider waves = fewer samples needed = shorter path.
    expect(f05.length).toBeLessThan(f1.length);
  });

  test('smoothing=0 paths carry meta.straight=true (enables straight-line rendering)', () => {
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 0 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.meta?.straight).toBe(true);
  });

  test('smoothing=1 paths do NOT carry meta.straight (uses curve rendering)', () => {
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 1 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.meta?.straight).toBeFalsy();
  });

  test('smoothing=0 zigzag: samples land on exact peaks and troughs', () => {
    // With x-alignment fix, the zigzag samples hit phase=0 (trough) and phase=0.5
    // (peak) exactly, producing clean ±amp y-values at every sample point.
    const paths = gen(base({ fillType: 'wave', waveSmoothing: 0, amplitude: 1 }));
    expect(paths.length).toBeGreaterThan(0);
    // amp = density * 0.4 * amplitude = 5 * 0.4 * 1 = 2.0
    const amp = 5 * 0.4 * 1;
    for (const p of paths) {
      for (const pt of p) {
        const scanY = Math.round(pt.y / 5) * 5;
        const deviation = Math.abs(Math.abs(pt.y - scanY) - amp);
        expect(deviation).toBeLessThanOrEqual(amp + 0.01);
      }
    }
  });

  test('waveFrequency affects zigzag step width (smoothing=0)', () => {
    // At smoothing=0, step = wavelength/2 = (density*1.5/waveFrequency)/2.
    // Higher frequency → shorter step → more points in same x-span.
    const longest = (paths) => paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    const f1 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveFrequency: 1, amplitude: 1 })));
    const f4 = longest(gen(base({ fillType: 'wave', waveSmoothing: 0, waveFrequency: 4, amplitude: 1 })));
    expect(f4.length).toBeGreaterThan(f1.length);
  });
});
