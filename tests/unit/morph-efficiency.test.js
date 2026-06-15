const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Efficiency regression (v1.1.74): a hexagon → circle morph must produce
 * intermediate rings with a SMALL anchor / endpoint count matched to the
 * structural complexity of the sources — NOT a fixed ~128-point polyline.
 *
 * Before: every in-between ring was arc-length resampled to resampleCount
 * (default 128), so a 6-corner hexagon and a circle both became 128-point
 * polylines and every blend ring had 128 straight segments.
 *
 * After (default, cornerMatch): closed pairs are represented with K ≈ the
 * busier source's corner count (6 for a hexagon, 0 for a circle → K=6), and
 * each ring is an anchored bezier whose flattened polyline is a handful of
 * smoothly-curved points. Corners stay sharp early and round into the circle.
 *
 * Backward compat: setting cornerMatch:false (or relying on it never triggering
 * for open paths) restores the dense arc-length behavior.
 */
describe('morph modifier — corner-matched efficiency (hexagon → circle)', () => {
  let runtime;
  let M;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    if (!runtime.window.Vectura.Modifiers.applyMorphModifierToPaths) {
      const code = fs.readFileSync(path.resolve(__dirname, '../../src/core/morph-modifier.js'), 'utf8');
      const sandbox = { window: runtime.window, document: runtime.window.document };
      sandbox.global = sandbox; sandbox.globalThis = sandbox;
      vm.runInContext(code, vm.createContext(sandbox), { filename: 'morph-modifier.js' });
    }
    M = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => runtime.cleanup());

  // Sharp hexagon as an anchored 'shape' path (in/out null = sharp corners),
  // matching the shape tool's output.
  const polyPath = (cx, cy, R, sides, rot = 0) => {
    const anchors = [];
    for (let k = 0; k < sides; k += 1) {
      const a = rot + (k / sides) * Math.PI * 2;
      anchors.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), in: null, out: null });
    }
    const pts = anchors.map((a) => ({ x: a.x, y: a.y }));
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'shape', closed: true, anchors };
    return pts;
  };
  const circlePath = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'circle', cx, cy, r, closed: true };
    return pts;
  };
  const child = (p) => ({ outline: [p], fillPaths: [], fills: [], penId: null });
  const centroid = (r) => { let x = 0, y = 0; r.forEach((p) => { x += p.x; y += p.y; }); return { x: x / r.length, y: y / r.length }; };
  const radii = (r) => { const c = centroid(r); const rs = r.map((p) => Math.hypot(p.x - c.x, p.y - c.y)); return { min: Math.min(...rs), mean: rs.reduce((a, b) => a + b, 0) / rs.length }; };

  const run = (overrides) => {
    const mod = {
      type: 'morph', enabled: true, steps: 5, easing: 'linear', emitSources: false,
      closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid',
      correspondenceMode: 'centroid-angle', resampleCount: 128, ...overrides,
    };
    const out = M.applyMorphModifierToPaths(
      [child(polyPath(700, 300, 80, 6, 0)), child(circlePath(250, 200, 70))],
      mod,
      null
    );
    return out.filter((p) => !(p.meta && (p.meta.morphFill || p.meta.paintBucketFillId)));
  };

  test('EFF-01: default rings carry FEW anchors (≈ hexagon corner count, not 128)', () => {
    const rings = run({});
    expect(rings.length).toBe(5);
    rings.forEach((ring) => {
      // Anchored bezier ring with a small structural anchor count.
      expect(Array.isArray(ring.meta && ring.meta.anchors)).toBe(true);
      expect(ring.meta.anchors.length).toBeLessThanOrEqual(8);
      expect(ring.meta.anchors.length).toBeGreaterThanOrEqual(6);
    });
  });

  test('EFF-02: default ring endpoint count is FAR below the dense 128-point path', () => {
    const sparse = run({});
    const dense = run({ cornerMatch: false });
    const maxSparse = Math.max(...sparse.map((r) => r.length));
    const minDense = Math.min(...dense.map((r) => r.length));
    // Dense path still produces ~128 (resampleCount) point rings.
    expect(minDense).toBeGreaterThanOrEqual(100);
    // Sparse corner-matched rings are a fraction of that.
    expect(maxSparse).toBeLessThan(40);
    expect(maxSparse).toBeLessThan(minDense / 3);
  });

  test('EFF-03: corner-match is the DEFAULT (no cornerMatch flag set → sparse)', () => {
    const rings = run({}); // no cornerMatch key at all
    expect(Math.max(...rings.map((r) => r.length))).toBeLessThan(40);
  });

  test('EFF-04: cornerMatch:false restores the dense backward-compatible path', () => {
    const dense = run({ cornerMatch: false });
    dense.forEach((ring) => {
      expect(ring.meta && ring.meta.anchors).toBeFalsy();
      expect(ring.length).toBeGreaterThanOrEqual(100);
    });
  });

  test('EFF-05: corners preserved — early ring sharp, late ring rounded (no collapse)', () => {
    const rings = run({});
    const maxTurn = (full) => {
      const ring = (() => {
        if (full.length > 1) {
          const f = full[0]; const l = full[full.length - 1];
          if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) return full.slice(0, -1);
        }
        return full;
      })();
      let m = 0; const n = ring.length;
      for (let i = 0; i < n; i += 1) {
        const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
        let a = Math.atan2(p1.y - p0.y, p1.x - p0.x), b = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        m = Math.max(m, Math.abs(d));
      }
      return m * 180 / Math.PI;
    };
    const turns = rings.map(maxTurn);
    // Early ring keeps a sharp hexagon corner; late ring is much rounder.
    expect(turns[0]).toBeGreaterThan(25);
    expect(turns[turns.length - 1]).toBeLessThan(turns[0] - 10);
    // No centroid collapse on any ring.
    rings.forEach((ring) => {
      const r = radii(ring);
      expect(r.min).toBeGreaterThan(0.4 * r.mean);
    });
  });

  test('EFF-06: anchor count tracks source complexity — octagon → circle keeps ~8', () => {
    const mod = {
      type: 'morph', enabled: true, steps: 3, emitSources: false, closureMode: 'auto',
      fillMode: 'off', multiPathStrategy: 'merge-centroid', resampleCount: 128,
    };
    const out = M.applyMorphModifierToPaths(
      [child(polyPath(700, 300, 80, 8, 0)), child(circlePath(250, 200, 70))],
      mod,
      null
    ).filter((p) => !(p.meta && p.meta.morphFill));
    out.forEach((ring) => {
      expect(ring.meta.anchors.length).toBe(8);
    });
  });
});
