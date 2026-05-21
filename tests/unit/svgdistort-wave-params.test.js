/**
 * Regression test: fillWaveSmoothing / fillWaveFrequency must be forwarded
 * from SVG Distort layer params into generatePatternFillPaths.
 *
 * Bug: svgdistort.js built the fill-args object without waveSmoothing /
 * waveFrequency, so changing those sliders had no effect — the wave
 * generator always received its defaults (smoothing=1.0, frequency=1.0).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG Distort — wave fill param forwarding', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.svgDistort.generate(
      {
        importedGroups: [{ paths: [rect(0, 0, 80, 80)], isClosed: true }],
        fillMode: 'wave',
        fillDensity: 10,
        fillAngle: 0,
        fillAmplitude: 2.0,
        showOutlines: false,
        autoFit: false,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        noises: [],
        seed: 0,
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      { m: 0, dW: 200, dH: 200 },
    );
  };

  // Curvature proxy: total absolute angle change along the longest path.
  const totalAngleVariation = (paths) => {
    if (!paths.length) return 0;
    const longest = paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    let total = 0;
    for (let i = 1; i < longest.length - 1; i++) {
      const a = longest[i - 1], b = longest[i], c = longest[i + 1];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const cross = v1x * v2y - v1y * v2x;
      const dot = v1x * v2x + v1y * v2y;
      total += Math.abs(Math.atan2(cross, dot));
    }
    return total;
  };

  const maxAngleStep = (paths) => {
    if (!paths.length) return 0;
    const longest = paths.reduce((acc, p) => (p.length > acc.length ? p : acc), []);
    let m = 0;
    for (let i = 1; i < longest.length - 1; i++) {
      const a = longest[i - 1], b = longest[i], c = longest[i + 1];
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = c.x - b.x, v2y = c.y - b.y;
      const cross = v1x * v2y - v1y * v2x;
      const dot = v1x * v2x + v1y * v2y;
      m = Math.max(m, Math.abs(Math.atan2(cross, dot)));
    }
    return m;
  };

  test('wave fill renders paths', () => {
    const paths = generate({ fillWaveSmoothing: 1.0, fillWaveFrequency: 1.0 });
    expect(paths.length).toBeGreaterThan(0);
  });

  test('fillWaveSmoothing=0 (zigzag) produces sharper corners than smoothing=1 (sine)', () => {
    const zigzag = generate({ fillWaveSmoothing: 0.0, fillWaveFrequency: 1.0 });
    const sine   = generate({ fillWaveSmoothing: 1.0, fillWaveFrequency: 1.0 });
    expect(zigzag.length).toBeGreaterThan(0);
    expect(sine.length).toBeGreaterThan(0);
    expect(maxAngleStep(zigzag)).toBeGreaterThan(maxAngleStep(sine));
  });

  test('fillWaveFrequency=2 produces more total angle variation than frequency=1', () => {
    // Higher frequency = more wave cycles per row = more direction changes.
    const f1 = generate({ fillWaveSmoothing: 1.0, fillWaveFrequency: 1.0 });
    const f2 = generate({ fillWaveSmoothing: 1.0, fillWaveFrequency: 2.0 });
    expect(f1.length).toBeGreaterThan(0);
    expect(f2.length).toBeGreaterThan(0);
    expect(totalAngleVariation(f2)).toBeGreaterThan(totalAngleVariation(f1));
  });
});
