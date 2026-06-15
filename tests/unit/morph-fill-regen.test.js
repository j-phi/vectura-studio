const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Coverage for the fill-aware Morph modifier: outline/fill split in the morph
// pipeline, parametric per-ring fill regeneration (lerpFillRecord +
// regenerateRingFill), pen threshold, and the fillMode:'off' regression lock.
describe('morph modifier — fill morphing', () => {
  let runtime;
  let M;
  let win;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    win = runtime.window;
    if (!win.Vectura.Modifiers.regenerateRingFill) {
      const code = fs.readFileSync(
        path.resolve(__dirname, '../../src/core/morph-modifier.js'),
        'utf8'
      );
      const sandbox = { window: win, document: win.document };
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;
      vm.runInContext(code, vm.createContext(sandbox), { filename: 'morph-modifier.js' });
    }
    M = win.Vectura.Modifiers;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const circlePts = (n, r = 50, cx = 100, cy = 100) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return out;
  };

  const hatchRec = (over = {}) => ({
    id: 'fa', fillType: 'hatch', density: 1, angle: 0, lineCount: 1,
    spiralDirection: 'cw', truchetSeed: 1, penId: null, region: [], innerRegion: null,
    loopId: 'l1', isDocBounds: false, createdAt: 0, ...over,
  });

  // ---- Stub the fill generator so regen is deterministic & captures input ----
  let captured;
  let restorePB;
  const installStub = () => {
    captured = [];
    const prev = win.Vectura.PaintBucketOps;
    win.Vectura.PaintBucketOps = {
      generatePathsForFillRecord: (rec) => {
        captured.push(JSON.parse(JSON.stringify({ fillType: rec.fillType, density: rec.density, regionLen: (rec.region || []).length })));
        // Return one trivial fill polyline.
        return [[{ x: 0, y: 0 }, { x: 1, y: 1 }]];
      },
    };
    restorePB = () => { win.Vectura.PaintBucketOps = prev; };
  };
  afterEach(() => { if (restorePB) { restorePB(); restorePB = null; } });

  // ===========================================================================
  // lerpFillRecord
  // ===========================================================================
  test('F-01: same-type numeric params lerp at t=0.5', () => {
    const out = M.lerpFillRecord(hatchRec({ density: 1, angle: 0 }), hatchRec({ density: 3, angle: 90 }), 0.5);
    expect(out.density).toBeCloseTo(2, 6);
    expect(out.angle).toBeCloseTo(45, 6);
    expect(out.fillType).toBe('hatch');
  });

  test('F-02: enum + seed fields threshold-switch at t=0.5 (not lerped)', () => {
    const a = hatchRec({ spiralDirection: 'cw', truchetSeed: 1 });
    const b = hatchRec({ spiralDirection: 'ccw', truchetSeed: 5 });
    const lo = M.lerpFillRecord(a, b, 0.4);
    const hi = M.lerpFillRecord(a, b, 0.6);
    expect(lo.spiralDirection).toBe('cw');
    expect(lo.truchetSeed).toBe(1);
    expect(hi.spiralDirection).toBe('ccw');
    expect(hi.truchetSeed).toBe(5);
  });

  test('F-03: integer fields stay integers after interpolation', () => {
    const out = M.lerpFillRecord(hatchRec({ lineCount: 1 }), hatchRec({ lineCount: 3 }), 0.5);
    expect(Number.isInteger(out.lineCount)).toBe(true);
    expect(out.lineCount).toBe(2);
  });

  test('F-04: skip keys (id/region/innerRegion/createdAt) are not copied', () => {
    const out = M.lerpFillRecord(hatchRec(), hatchRec(), 0.5);
    expect(out.id).toBeUndefined();
    expect(out.region).toBeUndefined();
    expect(out.createdAt).toBeUndefined();
  });

  // ===========================================================================
  // regenerateRingFill
  // ===========================================================================
  test('F-05: same-type → generates fill with region=ring, stamps penId + morphFill, drops paintBucketFillId', () => {
    installStub();
    const ring = circlePts(16);
    const out = M.regenerateRingFill(ring, [hatchRec({ density: 1 })], [hatchRec({ density: 3 })], 0.5, 'pen-X');
    expect(out.length).toBe(1);
    expect(out[0].meta.penId).toBe('pen-X');
    expect(out[0].meta.morphFill).toBe(true);
    expect(out[0].meta.paintBucketFillId).toBeUndefined();
    expect(captured[0].regionLen).toBe(16);
    expect(captured[0].density).toBeCloseTo(2, 6); // lerped
  });

  test('F-06: mismatched fillType threshold-switches the whole record at midpoint', () => {
    installStub();
    const ring = circlePts(12);
    const a = hatchRec({ fillType: 'hatch' });
    const b = hatchRec({ fillType: 'dots' });
    M.regenerateRingFill(ring, [a], [b], 0.4, null);
    M.regenerateRingFill(ring, [a], [b], 0.6, null);
    expect(captured[0].fillType).toBe('hatch');
    expect(captured[1].fillType).toBe('dots');
  });

  test('F-07: no fills, or degenerate ring → empty', () => {
    installStub();
    expect(M.regenerateRingFill(circlePts(10), [], [], 0.5, null)).toEqual([]);
    expect(M.regenerateRingFill([{ x: 0, y: 0 }, { x: 1, y: 1 }], [hatchRec()], [hatchRec()], 0.5, null)).toEqual([]);
    expect(captured.length).toBe(0);
  });

  test('F-08: single-sided fill (A only) fades out past the midpoint', () => {
    installStub();
    const ring = circlePts(12);
    const before = M.regenerateRingFill(ring, [hatchRec()], [], 0.4, null);
    const after = M.regenerateRingFill(ring, [hatchRec()], [], 0.6, null);
    expect(before.length).toBe(1);
    expect(after.length).toBe(0);
  });

  // ===========================================================================
  // Pipeline: payload split, pen threshold, fillMode off
  // ===========================================================================
  const payload = (outline, fills, penId) => ({ outline, fillPaths: [], fills, penId });

  test('F-09: skeleton ignores fillPaths — output ring count matches outline-only morph', () => {
    installStub();
    const childA = { outline: [circlePts(24, 40)], fillPaths: [[{ x: 0, y: 0 }, { x: 80, y: 80 }]], fills: [], penId: 'a' };
    const childB = { outline: [circlePts(24, 60)], fillPaths: [[{ x: 0, y: 0 }, { x: 80, y: 80 }]], fills: [], penId: 'b' };
    const mod = { type: 'morph', enabled: true, steps: 3, emitSources: false, closureMode: 'force-closed', fillMode: 'off' };
    const out = M.applyMorphModifierToPaths([childA, childB], mod, null);
    // No fills, fillMode off → only the 3 outline rings, none polluted by the
    // diagonal fillPath (which would have stretched bbox far past r=60).
    expect(out.length).toBe(3);
    out.forEach((ring) => {
      ring.forEach((p) => {
        expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThan(65);
      });
    });
  });

  test('F-10: pen threshold — rings switch pen at the visual midpoint', () => {
    const childA = payload([circlePts(24, 40)], [], 'penA');
    const childB = payload([circlePts(24, 60)], [], 'penB');
    const mod = { type: 'morph', enabled: true, steps: 3, easing: 'linear', emitSources: false, closureMode: 'force-closed', fillMode: 'off' };
    const out = M.applyMorphModifierToPaths([childA, childB], mod, null);
    // steps=3 → t = .25,.5,.75 → penA, penB, penB
    expect(out[0].meta.penId).toBe('penA');
    expect(out[1].meta.penId).toBe('penB');
    expect(out[2].meta.penId).toBe('penB');
  });

  test('F-11: fillMode morph emits interpolated fill rings; off emits none', () => {
    installStub();
    const childA = payload([circlePts(24, 40)], [hatchRec({ density: 1 })], 'penA');
    const childB = payload([circlePts(24, 60)], [hatchRec({ density: 3 })], 'penB');
    const base = { type: 'morph', enabled: true, steps: 2, emitSources: false, closureMode: 'force-closed' };

    const off = M.applyMorphModifierToPaths([childA, childB], { ...base, fillMode: 'off' }, null);
    expect(off.some((p) => p.meta && p.meta.morphFill)).toBe(false);

    const on = M.applyMorphModifierToPaths([payload([circlePts(24, 40)], [hatchRec({ density: 1 })], 'penA'),
      payload([circlePts(24, 60)], [hatchRec({ density: 3 })], 'penB')], { ...base, fillMode: 'morph' }, null);
    expect(on.some((p) => p.meta && p.meta.morphFill)).toBe(true);
  });

  test('F-12: back-compat — plain path[][] input still produces outline rings', () => {
    const out = M.applyMorphModifierToPaths(
      [[circlePts(24, 40)], [circlePts(24, 60)]],
      { type: 'morph', enabled: true, steps: 3, emitSources: false, closureMode: 'force-closed', fillMode: 'off' },
      null
    );
    expect(out.length).toBe(3);
  });
});
