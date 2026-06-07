const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('morph modifier — core math', () => {
  let runtime;
  let M;
  const bounds = { x: 0, y: 0, width: 200, height: 200 };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    if (!runtime.window.Vectura.Modifiers.applyMorphModifierToPaths) {
      const code = fs.readFileSync(
        path.resolve(__dirname, '../../src/core/morph-modifier.js'),
        'utf8'
      );
      // morph-modifier.js isn't in index.html yet (M5 adds the tag). Eval it
      // into a vm context that exposes the shared jsdom window as `window`, so
      // it appends to the existing window.Vectura.Modifiers in place.
      const sandbox = { window: runtime.window, document: runtime.window.document };
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;
      vm.runInContext(code, vm.createContext(sandbox), { filename: 'morph-modifier.js' });
    }
    M = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const centroid = (pts) => {
    let x = 0;
    let y = 0;
    pts.forEach((p) => {
      x += p.x;
      y += p.y;
    });
    return { x: x / pts.length, y: y / pts.length };
  };

  const circlePts = (n, r = 50, cx = 100, cy = 100) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return out;
  };

  const bbox = (pts) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  };

  // ===========================================================================
  // Group A — resamplePath / correspondenceAlign / blendPaths
  // ===========================================================================
  test('A-01: 3-point input, N=3 → 3 points', () => {
    const out = M.resamplePath([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 3, false);
    expect(out.length).toBe(3);
  });

  test('A-02: square resampled to 100 → max gap ≈ perimeter/100 ±2%', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const out = M.resamplePath(square, 100, true);
    expect(out.length).toBe(100);
    const perimeter = 40;
    const expectedGap = perimeter / 100;
    let maxGap = 0;
    for (let i = 0; i < out.length; i += 1) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      maxGap = Math.max(maxGap, Math.hypot(b.x - a.x, b.y - a.y));
    }
    expect(Math.abs(maxGap - expectedGap)).toBeLessThan(expectedGap * 0.02);
  });

  test('A-03: single-point input, N=k → k copies', () => {
    const out = M.resamplePath([{ x: 3, y: 7 }], 5, false);
    expect(out.length).toBe(5);
    out.forEach((p) => {
      expect(p.x).toBeCloseTo(3);
      expect(p.y).toBeCloseTo(7);
    });
  });

  test('A-04: empty input → empty output', () => {
    const out = M.resamplePath([], 10, false);
    expect(out.length).toBe(0);
  });

  test('A-05: .meta preserved on output', () => {
    const input = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    input.meta = { penId: 'pen-1', closed: false };
    const out = M.resamplePath(input, 4, false);
    expect(out.meta).toEqual({ penId: 'pen-1', closed: false });
    expect(out.meta).not.toBe(input.meta);
  });

  test('A-06: identical paths → offset 0', () => {
    const a = circlePts(12);
    const b = circlePts(12);
    expect(M.correspondenceAlign(a, b, 'nearest')).toBe(0);
  });

  test('A-07: rotated copy → offset 4 (nearest)', () => {
    const a = circlePts(8);
    const b = a.slice(4).concat(a.slice(0, 4));
    expect(M.correspondenceAlign(a, b, 'nearest')).toBe(4);
  });

  test('A-08: mismatched lengths throws', () => {
    expect(() => M.correspondenceAlign(circlePts(4), circlePts(5), 'nearest')).toThrow(
      /equal length/
    );
  });

  test('A-09: blendPaths(A,B,0) ≈ A', () => {
    const a = circlePts(6);
    const b = circlePts(6, 80);
    const out = M.blendPaths(a, b, 0);
    out.forEach((p, i) => {
      expect(p.x).toBeCloseTo(a[i].x, 9);
      expect(p.y).toBeCloseTo(a[i].y, 9);
    });
  });

  test('A-10: blendPaths(A,B,1) ≈ B', () => {
    const a = circlePts(6);
    const b = circlePts(6, 80);
    const out = M.blendPaths(a, b, 1);
    out.forEach((p, i) => {
      expect(p.x).toBeCloseTo(b[i].x, 9);
      expect(p.y).toBeCloseTo(b[i].y, 9);
    });
  });

  test('A-11: midpoint blend', () => {
    const out = M.blendPaths([{ x: 0, y: 0 }], [{ x: 10, y: 10 }], 0.5);
    expect(out[0].x).toBeCloseTo(5);
    expect(out[0].y).toBeCloseTo(5);
  });

  test('A-12: ease-in at t=0.5 → 25%', () => {
    const out = M.blendPaths([{ x: 0, y: 0 }], [{ x: 100, y: 100 }], 0.5, 'ease-in');
    expect(out[0].x).toBeCloseTo(25);
    expect(out[0].y).toBeCloseTo(25);
  });

  // ===========================================================================
  // Group B — applyMorphModifierToPaths
  // ===========================================================================
  const morph = (overrides) => ({ type: 'morph', enabled: true, ...overrides });

  test('B-01: 0 children → []', () => {
    expect(M.applyMorphModifierToPaths([], morph(), bounds)).toEqual([]);
  });

  test('B-02: 1 child (1 path) → that source', () => {
    const p = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    const out = M.applyMorphModifierToPaths([[p]], morph(), bounds);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(p);
  });

  test('B-03: 2 children, steps=0, emitSources → length 2', () => {
    const a = [{ x: 0, y: 0 }];
    const b = [{ x: 10, y: 10 }];
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ steps: 0 }), bounds);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual(a);
    expect(out[1]).toEqual(b);
  });

  test('B-04: 2 children, steps=5 → length 7', () => {
    const a = [{ x: 0, y: 0 }];
    const b = [{ x: 10, y: 10 }];
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ steps: 5 }), bounds);
    expect(out.length).toBe(7);
  });

  test('B-05: intermediate ring centroids monotone between source & target', () => {
    const a = circlePts(32, 30, 50, 50);
    const b = circlePts(32, 30, 150, 50);
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ steps: 5 }), bounds);
    // sources at [0] and [6]; blends at 1..5.
    const cx = out.slice(1, 6).map((r) => centroid(r).x);
    for (let i = 1; i < cx.length; i += 1) {
      expect(cx[i]).toBeGreaterThan(cx[i - 1]);
    }
    expect(cx[0]).toBeGreaterThan(50);
    expect(cx[cx.length - 1]).toBeLessThan(150);
  });

  test('B-06: linear easing → ~constant centroid gaps', () => {
    const a = circlePts(32, 30, 50, 50);
    const b = circlePts(32, 30, 150, 50);
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ steps: 8, easing: 'linear' }), bounds);
    const cx = out.slice(1, 9).map((r) => centroid(r).x);
    const gaps = [];
    for (let i = 1; i < cx.length; i += 1) gaps.push(cx[i] - cx[i - 1]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    gaps.forEach((g) => {
      expect(Math.abs(g - mean) / mean).toBeLessThan(0.02);
    });
  });

  test('B-07: ease-in → first intermediate closer to source, non-uniform', () => {
    const a = circlePts(32, 30, 50, 50);
    const b = circlePts(32, 30, 150, 50);
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ steps: 8, easing: 'ease-in' }), bounds);
    const cx = out.slice(1, 9).map((r) => centroid(r).x);
    const firstGap = cx[0] - 50;
    const lastGap = 150 - cx[cx.length - 1];
    // ease-in: slow start → first intermediate is nearer the source.
    expect(firstGap).toBeLessThan(lastGap);
    // non-uniform spacing
    const gaps = [];
    for (let i = 1; i < cx.length; i += 1) gaps.push(cx[i] - cx[i - 1]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.some((g) => Math.abs(g - mean) / mean > 0.05);
    expect(variance).toBe(true);
  });

  test('B-08: 2 children, 3 paths each, index-match, steps=4 → 18', () => {
    const child = (off) => [
      circlePts(16, 20, 30 + off, 30),
      circlePts(16, 20, 30 + off, 60),
      circlePts(16, 20, 30 + off, 90),
    ];
    const out = M.applyMorphModifierToPaths(
      [child(0), child(80)],
      morph({ steps: 4, multiPathStrategy: 'index-match' }),
      bounds
    );
    expect(out.length).toBe(18);
  });

  test('B-09: mismatched counts (2 vs 4) → no crash, deterministic length', () => {
    const a = [circlePts(12, 20, 30, 30), circlePts(12, 20, 30, 70)];
    const b = [
      circlePts(12, 20, 120, 30),
      circlePts(12, 20, 120, 70),
      circlePts(12, 20, 120, 110),
      circlePts(12, 20, 120, 150),
    ];
    const run = () =>
      M.applyMorphModifierToPaths([a, b], morph({ steps: 3, multiPathStrategy: 'index-match' }), bounds);
    const out1 = run();
    const out2 = run();
    expect(out1.length).toBe(out2.length);
    expect(out1.length).toBeGreaterThan(0);
  });

  test('B-10: enabled=false → children concatenated, no blends', () => {
    const a = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const b = [{ x: 5, y: 5 }, { x: 6, y: 6 }];
    const out = M.applyMorphModifierToPaths([[a], [b]], morph({ enabled: false, steps: 5 }), bounds);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual(a);
    expect(out[1]).toEqual(b);
  });

  test('B-11: smoothing=0 vs smoothing=1 → different blend ring bbox', () => {
    const jagged = [];
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 === 0 ? 50 : 20;
      jagged.push({ x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r });
    }
    const target = circlePts(24, 35, 100, 100);
    const noSmooth = M.applyMorphModifierToPaths(
      [[jagged], [target]],
      morph({ steps: 1, smoothing: 0, closureMode: 'force-closed' }),
      bounds
    );
    const smooth = M.applyMorphModifierToPaths(
      [[jagged], [target]],
      morph({ steps: 1, smoothing: 1, closureMode: 'force-closed' }),
      bounds
    );
    const ringA = noSmooth[1];
    const ringB = smooth[1];
    const ba = bbox(ringA);
    const bb = bbox(ringB);
    const diff = Math.abs(ba.w - bb.w) + Math.abs(ba.h - bb.h);
    expect(diff).toBeGreaterThan(1e-6);
  });

  test('B-12: 3 children sequential, steps=2 → B source appears once', () => {
    const a = [{ x: 0, y: 0 }, { x: 0, y: 10 }];
    const b = [{ x: 50, y: 0 }, { x: 50, y: 10 }];
    const c = [{ x: 100, y: 0 }, { x: 100, y: 10 }];
    const out = M.applyMorphModifierToPaths([[a], [b], [c]], morph({ steps: 2 }), bounds);
    // 3 sources + 2 pairs * 2 blends = 7
    expect(out.length).toBe(7);
    // Count how many output paths exactly equal B's source.
    const equalsB = out.filter(
      (p) =>
        p.length === b.length &&
        p.every((pt, i) => pt.x === b[i].x && pt.y === b[i].y)
    );
    expect(equalsB.length).toBe(1);
  });

  // ===========================================================================
  // Group C — createModifierState('morph') / isModifierLayer
  // ===========================================================================
  test('C-01: createModifierState(morph) defaults', () => {
    const s = M.createModifierState('morph');
    expect(s.type).toBe('morph');
    expect(s.enabled).toBe(true);
    expect(s.steps).toBe(6);
    expect(s.easing).toBe('linear');
    expect(s.resampleCount).toBe(128);
    expect(s.emitSources).toBe(true);
  });

  test('C-02: createModifierState(morph, {steps:10})', () => {
    const s = M.createModifierState('morph', { steps: 10 });
    expect(s.steps).toBe(10);
    expect(s.easing).toBe('linear');
  });

  test('C-04: morph state round-trips through JSON clone', () => {
    const s = M.createModifierState('morph');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  test('C-05: isModifierLayer detects morph container', () => {
    const layer = {
      isGroup: true,
      containerRole: 'modifier',
      modifier: { type: 'morph' },
    };
    expect(M.isModifierLayer(layer)).toBe(true);
  });

  // ===========================================================================
  // Group D — dispatch via applyModifierToPaths
  // ===========================================================================
  test('D-01: applyModifierToPaths([[A],[B]], morph) → length 7', () => {
    const out = M.applyModifierToPaths(
      [[{ x: 0, y: 0 }], [{ x: 10, y: 10 }]],
      { type: 'morph', steps: 5 },
      bounds
    );
    expect(out.length).toBe(7);
  });

  test('D-02: applyModifierToPaths unknown type → passthrough clone', () => {
    const input = [[{ x: 1, y: 1 }, { x: 2, y: 2 }]];
    const out = M.applyModifierToPaths(input, { type: 'unknown_future' }, bounds);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
  });
});
