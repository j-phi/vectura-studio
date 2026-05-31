const fs = require('fs');
const path = require('path');
const vm = require('vm');

const loadMod = () => {
  const file = path.resolve(__dirname, '../../src/core/algorithms/harmonograph-modulation.js');
  const code = fs.readFileSync(file, 'utf8');
  const window = {};
  const context = { window };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file });
  return window.Vectura.HarmonographModulation;
};

describe('HarmonographModulation.evaluateSource', () => {
  let mod;
  beforeAll(() => { mod = loadMod(); });

  test('a synced sine returns to its starting value after one loop', () => {
    const src = { id: 'a', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi' };
    const at0 = mod.evaluateSource(src, 0, 30);
    const atLoop = mod.evaluateSource(src, 30, 30);
    expect(atLoop).toBeCloseTo(at0, 6); // exact repeat = shareable loop
    // quarter loop of a sine (phase 0.25) peaks near +1
    expect(mod.evaluateSource(src, 7.5, 30)).toBeCloseTo(1, 6);
  });

  test('depth scales the output; bipolar stays in [-depth, depth]', () => {
    const src = { id: 'a', shape: 'sine', syncMode: 'sync', rate: 1, depth: 0.5, polarity: 'bi' };
    let max = -Infinity;
    let min = Infinity;
    for (let t = 0; t <= 30; t += 0.1) {
      const v = mod.evaluateSource(src, t, 30);
      max = Math.max(max, v); min = Math.min(min, v);
    }
    expect(max).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(min).toBeGreaterThanOrEqual(-0.5 - 1e-9);
  });

  test('unipolar polarity keeps the output in [0, depth]', () => {
    const src = { id: 'a', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, polarity: 'uni' };
    for (let t = 0; t <= 30; t += 0.25) {
      const v = mod.evaluateSource(src, t, 30);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('square shape is bistable', () => {
    const src = { id: 'a', shape: 'square', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' };
    expect(mod.evaluateSource(src, 1, 30)).toBe(1);   // first half
    expect(mod.evaluateSource(src, 20, 30)).toBe(-1); // second half
  });

  test('sample-hold is deterministic (same loop every time)', () => {
    const src = { id: 'sh', shape: 'sample-hold', syncMode: 'sync', rate: 4, depth: 1, polarity: 'bi' };
    const first = mod.evaluateSource(src, 3, 30);
    const second = mod.evaluateSource(src, 33, 30); // one loop later, same cycle index
    expect(second).toBeCloseTo(first, 6);
  });

  test('a disabled source contributes nothing', () => {
    expect(mod.evaluateSource({ id: 'a', enabled: false, shape: 'sine', rate: 1 }, 5, 30)).toBe(0);
  });
});

describe('HarmonographModulation.applyModulation', () => {
  let mod;
  beforeAll(() => { mod = loadMod(); });

  const baseParams = () => ({
    duration: 30,
    loopDrift: 0,
    scale: 0.5,
    pendulums: [
      { id: 'p1', enabled: true, ampX: 100, ampY: 100, freq: 2, phaseX: 90, phaseY: 0, damp: 0.001 },
      { id: 'p2', enabled: true, ampX: 60, ampY: 60, freq: 3, phaseX: 0, phaseY: 90, damp: 0.001 },
    ],
  });

  test('does not mutate the base params (transient overlay)', () => {
    const base = baseParams();
    const motion = {
      sources: [{ id: 's1', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' }],
      edges: [{ id: 'e1', sourceId: 's1', targetParamPath: 'loopDrift', amount: 0.05 }],
    };
    mod.applyModulation(base, motion, 7.5, 30);
    expect(base.loopDrift).toBe(0); // original untouched
  });

  test('applies an edge to a top-level param', () => {
    const motion = {
      sources: [{ id: 's1', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' }],
      edges: [{ id: 'e1', sourceId: 's1', targetParamPath: 'loopDrift', amount: 0.05 }],
    };
    const live = mod.applyModulation(baseParams(), motion, 7.5, 30); // sine peak ~+1
    expect(live.loopDrift).toBeCloseTo(0.05, 4);
  });

  test('applies an edge to a nested pendulum param path', () => {
    const motion = {
      sources: [{ id: 's1', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' }],
      edges: [{ id: 'e1', sourceId: 's1', targetParamPath: 'pendulums.1.freq', amount: 0.5 }],
    };
    const live = mod.applyModulation(baseParams(), motion, 7.5, 30);
    expect(live.pendulums[1].freq).toBeCloseTo(3.5, 4); // 3 + 0.5*~1
    expect(live.pendulums[0].freq).toBe(2);             // untouched
  });

  test('sums multiple edges onto the same target', () => {
    const motion = {
      sources: [
        { id: 's1', shape: 'square', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' }, // +1 in first half
        { id: 's2', shape: 'square', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi' },
      ],
      edges: [
        { id: 'e1', sourceId: 's1', targetParamPath: 'scale', amount: 0.1 },
        { id: 'e2', sourceId: 's2', targetParamPath: 'scale', amount: 0.2 },
      ],
    };
    const live = mod.applyModulation(baseParams(), motion, 1, 30); // both squares = +1
    expect(live.scale).toBeCloseTo(0.5 + 0.1 + 0.2, 6);
  });

  test('hasActiveEdges reflects whether modulation will do anything', () => {
    expect(mod.hasActiveEdges(null)).toBe(false);
    expect(mod.hasActiveEdges({ sources: [], edges: [] })).toBe(false);
    expect(mod.hasActiveEdges({
      sources: [{ id: 's1', enabled: true }],
      edges: [{ sourceId: 's1', targetParamPath: 'scale', amount: 0.1 }],
    })).toBe(true);
    expect(mod.hasActiveEdges({
      sources: [{ id: 's1', enabled: false }],
      edges: [{ sourceId: 's1', targetParamPath: 'scale', amount: 0.1 }],
    })).toBe(false);
  });
});
