const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression: a sharp-cornered polygon morphing to a circle must round its
 * corners GRADUALLY and CONTINUOUSLY — not collapse to a circle on step 1, and
 * not pinch through its own centroid when the polygon's start vertex is rotated
 * relative to the circle's.
 *
 * Two bugs this locks down:
 *  1. flattenForMorph used flattenSmoothedPath, which midpoint-smooths a
 *     handle-less polygon into a circle → every in-between ring was a circle.
 *  2. 'auto' closure blended closed shapes as OPEN (index correspondence, no
 *     rotation), so a flat-top hexagon vs a top-started circle misaligned and
 *     the rings collapsed (min radius → 0).
 */
describe('morph modifier — corner fidelity (polygon → circle)', () => {
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

  // Sharp polygon as an anchored 'shape' path (in/out null = no bezier handles),
  // matching what the shape tool produces (renderer.buildShapePath).
  const polyPath = (cx, cy, R, sides, rot) => {
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
  // Circle as a meta.kind:'circle' path.
  const circlePath = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'circle', cx, cy, r, closed: true };
    return pts;
  };

  const child = (p) => ({ outline: [p], fillPaths: [], fills: [], penId: null });
  const centroid = (r) => { let x = 0, y = 0; r.forEach((p) => { x += p.x; y += p.y; }); return { x: x / r.length, y: y / r.length }; };
  const radii = (r) => { const c = centroid(r); const rs = r.map((p) => Math.hypot(p.x - c.x, p.y - c.y)); return { min: Math.min(...rs), max: Math.max(...rs), mean: rs.reduce((a, b) => a + b, 0) / rs.length }; };
  // Drop a trailing closing vertex (first===last) before metrics that assume
  // unique points.
  const open = (ring) => {
    if (ring.length > 1) {
      const f = ring[0]; const l = ring[ring.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) return ring.slice(0, -1);
    }
    return ring;
  };
  const isClosedRing = (ring) => {
    if (ring.length < 2) return false;
    const f = ring[0]; const l = ring[ring.length - 1];
    return Math.hypot(f.x - l.x, f.y - l.y) < 1e-9;
  };
  const maxTurn = (full) => {
    const ring = open(full);
    let m = 0; const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
      let a = Math.atan2(p1.y - p0.y, p1.x - p0.x), b = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      m = Math.max(m, Math.abs(d));
    }
    return m * 180 / Math.PI;
  };

  const morph = (hexRot) => {
    const mod = { type: 'morph', enabled: true, steps: 5, easing: 'linear', emitSources: false, closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid', correspondenceMode: 'centroid-angle', resampleCount: 128 };
    const out = M.applyMorphModifierToPaths([child(polyPath(700, 300, 80, 6, hexRot)), child(circlePath(250, 200, 70))], mod, null);
    return out.filter((p) => !(p.meta && (p.meta.morphFill || p.meta.paintBucketFillId)));
  };

  test('FID-01: intermediate rings keep corners (not instant circle)', () => {
    const rings = morph(0);
    expect(rings.length).toBe(5);
    // First ring is mostly hexagon → a real corner remains, well above a circle's
    // per-vertex turn (~360/128 ≈ 3°).
    expect(maxTurn(rings[0])).toBeGreaterThan(25);
    // Last blend ring (t=5/6, emitSources off) is nearly the circle — corners
    // largely gone, and much rounder than the first ring.
    expect(maxTurn(rings[rings.length - 1])).toBeLessThan(18);
    expect(maxTurn(rings[rings.length - 1])).toBeLessThan(maxTurn(rings[0]) - 10);
  });

  test('FID-02: corner sharpness decreases monotonically (continuous rounding)', () => {
    const turns = morph(0).map(maxTurn);
    for (let i = 1; i < turns.length; i += 1) {
      expect(turns[i]).toBeLessThanOrEqual(turns[i - 1] + 1e-6);
    }
  });

  test('FID-03: no centroid collapse for any start-vertex orientation', () => {
    // Flat-top (rot 0) was the broken case — rings pinched to min radius ≈ 0.
    [0, Math.PI / 6, Math.PI / 3, 0.37].forEach((rot) => {
      morph(rot).forEach((ring) => {
        const r = radii(ring);
        expect(r.min).toBeGreaterThan(0.4 * r.mean);
      });
    });
  });

  test('FID-04: orientation-independent — flat-top and pointy-top match', () => {
    const a = morph(0).map((r) => +radii(r).max.toFixed(1));
    const b = morph(-Math.PI / 2).map((r) => +radii(r).max.toFixed(1));
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(2));
  });

  test('FID-05: both sources closed ⇒ every intermediate ring is closed', () => {
    morph(0).forEach((ring) => expect(isClosedRing(ring)).toBe(true));
  });
});
