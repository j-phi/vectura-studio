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

  test('SeededRNG(0) is deterministic, not a Math.random fallback (AUD-03)', () => {
    // seed 0 is falsy in JS; a naive `seed ? seed : fallback` check treats it as
    // "no seed given" and silently reseeds from Math.random() every construction.
    // Saved layers with seed 0 (and every SVG-import layer, which hard-sets seed 0)
    // must render identically across reopens.
    const { SeededRNG } = runtime.window.Vectura;
    const a = new SeededRNG(0);
    const b = new SeededRNG(0);

    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());

    expect(seqA).toEqual(seqB);
    // Also confirm state 0 isn't a degenerate fixed point of the LCG.
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  test('SeededRNG LCG constants are pinned (changing a/c/m re-renders every saved seed)', () => {
    const { SeededRNG } = runtime.window.Vectura;
    const expected = {
      0: [0.000005748588594490936, 0.6551540487702722, 0.30481433882602227, 0.6324834826553629, 0.9958810810911847],
      1: [0.5138700783782965, 0.17574131496983642, 0.15525975830632252, 0.14626556641713975, 0.28471884144689835],
      42: [0.5823075899771916, 0.5198186638391664, 0.9149397615878563, 0.698715567914171, 0.7530812028576999],
    };

    for (const [seed, expectedSeq] of Object.entries(expected)) {
      const r = new SeededRNG(Number(seed));
      const seq = Array.from({ length: 5 }, () => r.nextFloat());
      expect(seq).toEqual(expectedSeq);
    }
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
