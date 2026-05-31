const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The core is a pure IIFE that only touches `window`; load it standalone.
const loadCore = () => {
  const file = path.resolve(__dirname, '../../src/core/algorithms/harmonograph-core.js');
  const code = fs.readFileSync(file, 'utf8');
  const window = {};
  const context = { window };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file });
  return window.Vectura.HarmonographCore;
};

const baseParams = () => ({
  samples: 2000,
  duration: 20,
  scale: 1,
  pendulums: [
    { ampX: 100, ampY: 100, phaseX: 90, phaseY: 0, freq: 3, micro: 0.01, damp: 0.002, enabled: true },
    { ampX: 100, ampY: 100, phaseX: 0, phaseY: 90, freq: 2, micro: 0.02, damp: 0.002, enabled: true },
  ],
});

describe('HarmonographCore.evaluatePath', () => {
  let core;
  beforeAll(() => { core = loadCore(); });

  test('returns a time-parameterized path spanning [0, duration]', () => {
    const { path: pts, durationSec } = core.evaluatePath(baseParams());
    expect(pts.length).toBeGreaterThan(1);
    expect(pts[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number), t: 0 });
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    // last sample sits at the duration; durationSec mirrors it.
    expect(durationSec).toBeCloseTo(20, 6);
    expect(pts[pts.length - 1].t).toBeCloseTo(20, 6);
  });

  test('is deterministic — same params produce identical geometry', () => {
    const a = core.evaluatePath(baseParams());
    const b = core.evaluatePath(baseParams());
    expect(b.path).toEqual(a.path);
  });

  test('seeking to a fixed t is stable: point at index i equals an independent evaluation', () => {
    const full = core.evaluatePath(baseParams());
    const idx = 137;
    const again = core.evaluatePath(baseParams());
    expect(again.path[idx]).toEqual(full.path[idx]);
  });

  test('sampleCap reduces vertex count but preserves the curve span (coarser, not shorter)', () => {
    const full = core.evaluatePath(baseParams());
    const capped = core.evaluatePath(baseParams(), { sampleCap: 300 });
    expect(capped.path.length).toBeLessThan(full.path.length);
    expect(capped.path.length).toBe(301); // count = min(samples, cap); inclusive endpoint
    // Same total duration — the cap changes resolution, not the figure's extent.
    expect(capped.durationSec).toBeCloseTo(full.durationSec, 6);
  });

  test('cx/cy offset translates every point', () => {
    const centered = core.evaluatePath(baseParams(), { cx: 500, cy: 400 });
    const origin = core.evaluatePath(baseParams());
    expect(centered.path[10].x).toBeCloseTo(origin.path[10].x + 500, 6);
    expect(centered.path[10].y).toBeCloseTo(origin.path[10].y + 400, 6);
  });

  test('evolving loopDrift changes the figure (powers circle->snake)', () => {
    const still = core.evaluatePath({ ...baseParams(), loopDrift: 0 });
    const drifting = core.evaluatePath({ ...baseParams(), loopDrift: 0.05 });
    // The figure should diverge substantially as drift accumulates over t.
    // (The endpoint can coincidentally realign, so measure the whole curve.)
    let maxDelta = 0;
    for (let i = 0; i < still.path.length; i += 1) {
      maxDelta = Math.max(
        maxDelta,
        Math.hypot(drifting.path[i].x - still.path[i].x, drifting.path[i].y - still.path[i].y)
      );
    }
    expect(maxDelta).toBeGreaterThan(20);
  });

  test('disabled / empty pendulums yield an empty path', () => {
    expect(core.evaluatePath({ ...baseParams(), pendulums: [] }).path).toEqual([]);
    const allOff = baseParams();
    allOff.pendulums.forEach((p) => { p.enabled = false; });
    expect(core.evaluatePath(allOff).path).toEqual([]);
  });

  test('supports legacy freq1/freq2/freq3 params when no pendulums array is present', () => {
    const legacy = {
      samples: 800, duration: 10, scale: 1,
      ampX1: 80, ampY1: 80, freq1: 2, phaseX1: 90,
      ampX2: 60, ampY2: 60, freq2: 3,
    };
    const { path: pts } = core.evaluatePath(legacy);
    expect(pts.length).toBeGreaterThan(1);
    expect(pts.every((p) => Number.isFinite(p.x))).toBe(true);
  });
});
