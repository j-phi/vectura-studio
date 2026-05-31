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

describe('HarmonographCore.evaluatePath — per-sample motion (LFO baked into geometry)', () => {
  let core, mod;
  beforeAll(() => {
    // load both core (with window stub shared) and the modulation engine
    const fs = require('fs'); const path = require('path'); const vm = require('vm');
    const window = {};
    const ctx = { window }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/core/algorithms/harmonograph-modulation.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../src/core/algorithms/harmonograph-core.js'), 'utf8'), ctx);
    // core references window.Vectura.HarmonographModulation at call time
    global.window = window; // so core's window lookup resolves in-process
    core = window.Vectura.HarmonographCore;
    mod = window.Vectura.HarmonographModulation;
  });
  afterAll(() => { delete global.window; });

  const params = (motion) => ({
    samples: 1500, duration: 24, scale: 1,
    pendulums: [
      { ampX: 100, ampY: 0, phaseX: 90, phaseY: 0, freq: 3, micro: 0, damp: 0.001, enabled: true },
      { ampX: 0, ampY: 100, phaseX: 0, phaseY: 0, freq: 2, micro: 0, damp: 0.001, enabled: true },
    ],
    motion,
  });
  const sineOn = (target, amount) => ({
    sources: [{ id: 'l', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi', enabled: true }],
    edges: [{ id: 'e', sourceId: 'l', targetParamPath: target, amount }],
  });

  test('a motion figure is deterministic + static (two evals identical, same length)', () => {
    const a = core.evaluatePath(params(sineOn('pendulums.1.freq', 0.5)));
    const b = core.evaluatePath(params(sineOn('pendulums.1.freq', 0.5)));
    expect(b.path).toEqual(a.path);
    expect(a.path.length).toBe(b.path.length);
  });

  test('motion changes the geometry vs no motion (LFO is baked in)', () => {
    const withM = core.evaluatePath(params(sineOn('pendulums.1.freq', 0.6))).path;
    const without = core.evaluatePath(params({ sources: [], edges: [] })).path;
    let maxD = 0;
    for (let i = 0; i < withM.length; i += 1) maxD = Math.max(maxD, Math.hypot(withM[i].x - without[i].x, withM[i].y - without[i].y));
    expect(maxD).toBeGreaterThan(1);
  });

  test('no-motion path is byte-identical to passing an empty motion', () => {
    const empty = core.evaluatePath(params({ sources: [], edges: [] })).path;
    const noneAtAll = core.evaluatePath(params(undefined)).path;
    expect(noneAtAll).toEqual(empty);
  });

  test('fast path equals an applyModulation-per-sample reference (unit conversions + no-clone correctness)', () => {
    // reference: build the path by cloning params per sample via applyModulation at the sample t
    const base = params(sineOn('pendulums.0.phaseX', 30)); // phase edge exercises DEG2RAD
    const fast = core.evaluatePath(base).path;
    const dur = 24; const count = 1500; const dt = dur / count;
    // reference uses applyModulation (which clones) per sample, then a single-sample eval with sampleCap forcing that exact t
    let maxD = 0;
    for (let i = 0; i <= count; i += 50) {
      const t = i * dt;
      const live = mod.applyModulation(base, base.motion, t, dur);
      // evaluate ONE point at t by reusing the evaluator on a 1-sample grid won't hit exact t; instead recompute inline
      const pend = live.pendulums.map((pp) => ({
        ax: pp.ampX, ay: pp.ampY, phaseX: (pp.phaseX) * Math.PI / 180, phaseY: (pp.phaseY) * Math.PI / 180,
        freq: pp.freq, micro: pp.micro, damp: Math.max(0, pp.damp),
      }));
      let x = 0, y = 0;
      pend.forEach((pp) => {
        const f = (pp.freq + pp.micro + (live.loopDrift || 0) * t) * Math.PI * 2;
        const decay = Math.exp(-pp.damp * t);
        x += pp.ax * Math.sin(f * t + pp.phaseX) * decay;
        y += pp.ay * Math.sin(f * t + pp.phaseY) * decay;
      });
      x *= (live.scale ?? 1); y *= (live.scale ?? 1);
      maxD = Math.max(maxD, Math.hypot(fast[i].x - x, fast[i].y - y));
    }
    expect(maxD).toBeLessThan(1e-9);
  });

  test('a bipolar damp LFO stays bounded (per-sample clamp, no exp blow-up)', () => {
    const { path: pts } = core.evaluatePath(params(sineOn('pendulums.0.damp', 0.01)));
    expect(pts.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y) && Math.abs(pt.x) < 1e6)).toBe(true);
  });
});

describe('HarmonographCore.evaluatePath — machine types (Pintograph)', () => {
  let core;
  beforeAll(() => { core = loadCore(); });

  // Envelope = max |point - center| over a sample window (robust to superposition).
  const envelope = (pts, lo, hi) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    let m = 0;
    const a = Math.floor(pts.length * lo), b = Math.floor(pts.length * hi);
    for (let i = a; i < b; i += 1) m = Math.max(m, Math.hypot(pts[i].x - cx, pts[i].y - cy));
    return m;
  };
  const params = (machineType) => ({
    samples: 4000, duration: 60, scale: 1, machineType,
    pendulums: [
      { ampX: 100, ampY: 0, phaseX: 90, phaseY: 0, freq: 3, micro: 0, damp: 0.01, enabled: true },
      { ampX: 0, ampY: 100, phaseX: 0, phaseY: 0, freq: 2, micro: 0, damp: 0.01, enabled: true },
    ],
  });

  test('lateral (damped) decays — trailing envelope is much smaller than leading', () => {
    const pts = core.evaluatePath(params('lateral')).path;
    expect(envelope(pts, 0.85, 1.0)).toBeLessThan(envelope(pts, 0.0, 0.15) * 0.85);
  });

  test('pintograph forces damp=0 — trailing envelope ~= leading (perpetual, non-decaying)', () => {
    const pts = core.evaluatePath(params('pintograph')).path;
    const lead = envelope(pts, 0.0, 0.15);
    const trail = envelope(pts, 0.85, 1.0);
    expect(trail).toBeGreaterThan(lead * 0.95);
    expect(trail).toBeLessThan(lead * 1.05);
  });
});
