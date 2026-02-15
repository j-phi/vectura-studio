const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Seeded RNG and Noise determinism', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('SeededRNG returns identical sequences for the same seed', () => {
    const { SeededRNG } = runtime.window.Vectura;
    const a = new SeededRNG(1337);
    const b = new SeededRNG(1337);

    const seqA = Array.from({ length: 25 }, () => a.nextFloat());
    const seqB = Array.from({ length: 25 }, () => b.nextFloat());

    expect(seqA).toEqual(seqB);
  });

  test('SeededRNG returns different sequences for different seeds', () => {
    const { SeededRNG } = runtime.window.Vectura;
    const a = new SeededRNG(111);
    const b = new SeededRNG(222);

    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());

    expect(seqA).not.toEqual(seqB);
  });

  test('SimpleNoise returns stable 2D samples with identical seeds', () => {
    const { SimpleNoise } = runtime.window.Vectura;
    const a = new SimpleNoise(42);
    const b = new SimpleNoise(42);

    const points = [
      [0.01, 0.03],
      [0.7, 1.3],
      [3.14, 2.72],
      [9.11, 1.01],
      [13.5, 7.7],
    ];

    const valuesA = points.map(([x, y]) => a.noise2D(x, y));
    const valuesB = points.map(([x, y]) => b.noise2D(x, y));

    expect(valuesA).toEqual(valuesB);
  });

  test('SimpleNoise reseed changes the sample field', () => {
    const { SimpleNoise } = runtime.window.Vectura;
    const noise = new SimpleNoise(12);
    const before = noise.noise2D(0.25, 0.5);

    noise.seed(99);
    const after = noise.noise2D(0.25, 0.5);

    expect(before).not.toBe(after);
  });
});
