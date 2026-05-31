const { applyAlgorithmBias } = require('../../src/ui/randomization-utils.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeRandom = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

// The tasteful frequency set the bias is allowed to produce.
const TASTEFUL_FREQS = new Set([1, 2, 3, 4, 5, 6, 1.5, 2.5]);

const makePendulum = (id, overrides = {}) => ({
  id,
  enabled: true,
  ampX: 100,
  ampY: 100,
  phaseX: 0,
  phaseY: 0,
  freq: 1,
  micro: 0,
  damp: 0.001,
  ...overrides,
});

const makeLayer = (extraParams = {}, pendulums = null) => ({
  type: 'pendula',
  params: clone({
    scale: 1,
    duration: 40,
    loopDrift: 0,
    paperRotation: 0,
    pendulums: pendulums || [
      makePendulum('p1', { freq: 7, damp: 0.02, micro: 0.5 }),
      makePendulum('p2', { freq: 11, damp: 0.05, micro: -0.4 }),
      makePendulum('p3', { freq: 9, damp: 0.03, micro: 0.3 }),
    ],
    ...extraParams,
  }),
});

describe('Pendula / Harmonograph dice (randomize) bias', () => {
  test('every enabled pendulum freq lands in the tasteful set and damp in low band', () => {
    const rng = makeRandom(7);

    for (let i = 0; i < 400; i++) {
      const layer = makeLayer();
      applyAlgorithmBias(layer, rng);

      layer.params.pendulums.forEach((p) => {
        expect(TASTEFUL_FREQS.has(p.freq)).toBe(true);
        expect(p.damp).toBeGreaterThanOrEqual(0.0005);
        expect(p.damp).toBeLessThanOrEqual(0.004);
        expect(p.micro).toBeGreaterThanOrEqual(-0.02);
        expect(p.micro).toBeLessThanOrEqual(0.02);
        // Phases snap to 15-degree increments within 0..360.
        expect(p.phaseX % 15).toBe(0);
        expect(p.phaseY % 15).toBe(0);
        expect(p.phaseX).toBeGreaterThanOrEqual(0);
        expect(p.phaseX).toBeLessThanOrEqual(360);
        // Amplitudes stay balanced / non-degenerate.
        expect(p.ampX).toBeGreaterThanOrEqual(40);
        expect(p.ampX).toBeLessThanOrEqual(120);
        expect(p.ampY).toBeGreaterThanOrEqual(40);
        expect(p.ampY).toBeLessThanOrEqual(120);
      });
    }
  });

  test('pintograph machine forces damp to exactly 0', () => {
    const rng = makeRandom(42);

    for (let i = 0; i < 200; i++) {
      const layer = makeLayer({ machineType: 'pintograph' });
      applyAlgorithmBias(layer, rng);

      layer.params.pendulums.forEach((p) => {
        expect(p.damp).toBe(0);
        expect(TASTEFUL_FREQS.has(p.freq)).toBe(true);
      });
    }
  });

  test('lateral machine keeps damp in the low non-zero band', () => {
    const rng = makeRandom(99);
    const layer = makeLayer({ machineType: 'lateral' });
    applyAlgorithmBias(layer, rng);

    layer.params.pendulums.forEach((p) => {
      expect(p.damp).toBeGreaterThanOrEqual(0.0005);
      expect(p.damp).toBeLessThanOrEqual(0.004);
    });
  });

  test('disabled pendulums are left untouched', () => {
    const rng = makeRandom(5);
    const layer = makeLayer({}, [
      makePendulum('on', { freq: 1 }),
      makePendulum('off', { enabled: false, freq: 13, damp: 0.09, micro: 0.7 }),
    ]);
    applyAlgorithmBias(layer, rng);

    const off = layer.params.pendulums.find((p) => p.id === 'off');
    expect(off.freq).toBe(13);
    expect(off.damp).toBe(0.09);
    expect(off.micro).toBe(0.7);

    const on = layer.params.pendulums.find((p) => p.id === 'on');
    expect(TASTEFUL_FREQS.has(on.freq)).toBe(true);
    expect(on.damp).toBeGreaterThanOrEqual(0.0005);
    expect(on.damp).toBeLessThanOrEqual(0.004);
  });

  test('harmonograph layer type uses the same bias', () => {
    const rng = makeRandom(11);
    const layer = { ...makeLayer(), type: 'harmonograph' };
    applyAlgorithmBias(layer, rng);

    layer.params.pendulums.forEach((p) => {
      expect(TASTEFUL_FREQS.has(p.freq)).toBe(true);
      expect(p.damp).toBeGreaterThanOrEqual(0.0005);
      expect(p.damp).toBeLessThanOrEqual(0.004);
    });
  });
});
