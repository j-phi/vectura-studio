const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('Rings noise modes', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('concentric mode stays closed and produces path-space variation', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.rings),
      seed: 4242,
      rings: 6,
      gap: 1,
      offsetX: 0,
      offsetY: 0,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 12,
          zoom: 0.02,
          freq: 1.5,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          applyMode: 'concentric',
          ringDrift: 0.65,
          ringRadius: 100,
          tileMode: 'off',
          noiseStyle: 'linear',
          imageWidth: 1,
          imageHeight: 1,
        },
      ],
    };

    const seed = params.seed;
    const paths = Algorithms.rings.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds);
    expect(paths.length).toBe(params.rings);

    paths.forEach((path) => {
      expect(path.length).toBeGreaterThan(10);
      expect(path[path.length - 1]).toEqual(path[0]);
    });

    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    const radii = paths[0].slice(0, -1).map((point) => distance(point, center));
    const minRadius = Math.min(...radii);
    const maxRadius = Math.max(...radii);
    expect(maxRadius - minRadius).toBeGreaterThan(2);
  });

  test('center diameter widens the innermost ring', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const baseParams = {
      ...clone(ALGO_DEFAULTS.rings),
      seed: 4242,
      rings: 8,
      gap: 1,
      offsetX: 0,
      offsetY: 0,
      noises: [
        {
          ...clone(ALGO_DEFAULTS.rings.noises[0]),
          amplitude: 0,
        },
      ],
    };

    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    const seed = baseParams.seed;
    const withoutBoost = Algorithms.rings.generate(
      { ...baseParams, centerDiameter: 0 },
      new SeededRNG(seed),
      new SimpleNoise(seed),
      bounds
    );
    const withBoost = Algorithms.rings.generate(
      { ...baseParams, centerDiameter: 40 },
      new SeededRNG(seed),
      new SimpleNoise(seed),
      bounds
    );

    const innerWithout = distance(withoutBoost[0][0], center);
    const innerWith = distance(withBoost[0][0], center);
    expect(innerWith - innerWithout).toBeGreaterThan(19.5);
    expect(innerWith - innerWithout).toBeLessThan(20.5);
  });
});
