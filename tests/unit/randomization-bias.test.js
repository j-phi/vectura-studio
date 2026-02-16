const { applyAlgorithmBias } = require('../../src/ui/randomization-utils.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeRandom = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const average = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);

describe('Randomization bias profiles', () => {
  test('Shape Pack bias favors denser scenes', () => {
    const rng = makeRandom(101);
    const counts = [];
    const minRs = [];
    const attempts = [];

    for (let i = 0; i < 300; i++) {
      const layer = {
        type: 'shapePack',
        params: clone({
          shape: 'circle',
          count: 500,
          minR: 2,
          maxR: 20,
          padding: 1,
          attempts: 200,
          segments: 32,
        }),
      };
      applyAlgorithmBias(layer, rng);
      counts.push(layer.params.count);
      minRs.push(layer.params.minR);
      attempts.push(layer.params.attempts);
    }

    expect(average(counts)).toBeGreaterThan(430);
    expect(average(minRs)).toBeLessThan(4.5);
    expect(average(attempts)).toBeGreaterThan(2500);
  });

  test('Petalis Designer bias caps complexity to avoid runaway line counts', () => {
    const rng = makeRandom(202);
    const counts = [];
    const centerDensity = [];

    for (let i = 0; i < 300; i++) {
      const layer = {
        type: 'petalisDesigner',
        params: {
          count: 260,
          ringMode: 'single',
          innerCount: 120,
          outerCount: 180,
          centerDensity: 20,
          centerRingDensity: 16,
          connectorCount: 60,
          shadings: [],
        },
      };
      applyAlgorithmBias(layer, rng);
      counts.push(layer.params.count);
      centerDensity.push(layer.params.centerDensity);
    }

    const maxCount = Math.max(...counts);
    expect(maxCount).toBeLessThanOrEqual(430);
    expect(Math.max(...centerDensity)).toBeLessThanOrEqual(40);
  });

  test('Rainfall bias trends less screen-filling', () => {
    const rng = makeRandom(303);
    const counts = [];
    let noneShapeCount = 0;

    for (let i = 0; i < 300; i++) {
      const layer = {
        type: 'rainfall',
        params: {
          count: 210,
          traceLength: 120,
          traceStep: 3,
          dropShape: 'none',
          dropFill: 'none',
          widthMultiplier: 1,
          turbulence: 0.25,
          windStrength: 0,
          gustStrength: 0,
        },
      };
      applyAlgorithmBias(layer, rng);
      counts.push(layer.params.count);
      if (layer.params.dropShape === 'none') noneShapeCount += 1;
    }

    expect(average(counts)).toBeLessThan(360);
    expect(noneShapeCount / 300).toBeGreaterThan(0.5);
  });

  test('Lissajous bias favors richer structure', () => {
    const rng = makeRandom(404);
    const resolutions = [];
    let distinctFreqPairs = 0;

    for (let i = 0; i < 300; i++) {
      const layer = {
        type: 'lissajous',
        params: {
          freqX: 3,
          freqY: 2,
          damping: 0.001,
          phase: 1.5,
          resolution: 200,
          scale: 0.8,
          closeLines: true,
        },
      };
      applyAlgorithmBias(layer, rng);
      resolutions.push(layer.params.resolution);
      if (Math.abs(layer.params.freqX - layer.params.freqY) >= 0.8) distinctFreqPairs += 1;
    }

    expect(average(resolutions)).toBeGreaterThan(420);
    expect(distinctFreqPairs / 300).toBeGreaterThan(0.95);
  });
});
