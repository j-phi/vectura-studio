const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression: BEVELED / ROUNDED polygons must not collapse or twist in a morph.
 *
 * History: the corner-matched morph once floored a rounded hexagon to a 3-anchor
 * TRIANGLE (cornerCountOf undercounted handle-carrying corners — fixed v1.1.78).
 * Then the sparse corner-matched path itself proved harmful for fully-SMOOTH
 * shapes: it over-rounded them toward circles and, because a rounded polygon and
 * a circle sample to mismatched anchor rings, the in-between rings TWISTED
 * (v1.1.89 regression). The resolution: the sparse corner-matched path now runs
 * ONLY when the pair has a genuinely sharp corner to preserve; two smooth shapes
 * (rounded/beveled-with-curves polygon + circle) blend through the DENSE path —
 * smooth, faithful, no triangle collapse, no twist, no anchors.
 *
 * A real bevel (a straight chamfer) leaves SHARP anchors (null handles) at the
 * chamfer ends, so a beveled polygon still routes through the sparse path; only a
 * corner ROUND (tangential handles) is fully smooth and routes dense.
 */
describe('morph modifier — beveled/rounded polygon corner count', () => {
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

  // Sharp hexagon (handle-less anchors) — the control case that already worked.
  const sharpHex = (cx, cy, R, sides, rot) => {
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

  // Beveled/rounded hexagon — SAME six structural corners, but each anchor now
  // carries tangential bezier handles (what a bevel/corner-round produces).
  const roundedHex = (cx, cy, R, sides, rot, handleFrac = 0.22) => {
    const base = [];
    for (let k = 0; k < sides; k += 1) {
      const a = rot + (k / sides) * Math.PI * 2;
      base.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    const anchors = base.map((p, i) => {
      const prev = base[(i - 1 + sides) % sides];
      const next = base[(i + 1) % sides];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl;
      const uy = ty / tl;
      const h = R * handleFrac;
      return {
        x: p.x, y: p.y,
        in: { x: p.x - ux * h, y: p.y - uy * h },
        out: { x: p.x + ux * h, y: p.y + uy * h },
      };
    });
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
  const morph = (hexPath) => {
    const mod = {
      type: 'morph', enabled: true, steps: 5, easing: 'linear', emitSources: false,
      closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid',
      correspondenceMode: 'centroid-angle', resampleCount: 128,
    };
    return M.applyMorphModifierToPaths([child(hexPath), child(circlePath(250, 200, 70))], mod, null)
      .filter((p) => !(p.meta && (p.meta.morphFill || p.meta.paintBucketFillId)));
  };
  const anchorCount = (ring) => (ring.meta && Array.isArray(ring.meta.anchors) ? ring.meta.anchors.length : 0);
  const open = (ring) => {
    if (ring.length > 1) {
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) return ring.slice(0, -1);
    }
    return ring;
  };
  // Min radius / mean radius — collapses (triangle pinch) or twists drop this low.
  const minRadiusFrac = (ring) => {
    const r = open(ring);
    let cx = 0;
    let cy = 0;
    r.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= r.length;
    cy /= r.length;
    const rs = r.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    return Math.min(...rs) / mean;
  };

  test('rounded hexagon → circle does NOT collapse or twist (dense, smooth, faithful)', () => {
    const rings = morph(roundedHex(700, 300, 80, 6, 0));
    expect(rings.length).toBe(5);
    rings.forEach((ring) => {
      // Smooth shapes go through the DENSE path → no bezier anchors, no triangle.
      expect(anchorCount(ring)).toBe(0);
      // A 3-anchor triangle collapse (or a twist) pinches the radius; a faithful
      // hexagon blend stays plump.
      expect(open(ring).length).toBeGreaterThan(12);
      expect(minRadiusFrac(ring)).toBeGreaterThan(0.6);
    });
  });

  test('a SHARP hexagon still routes through the corner-matched path (keeps its corners)', () => {
    // The gate must not over-disable: a genuinely sharp polygon → circle keeps the
    // sparse, corner-preserving bezier path (anchored rings), unlike the smooth
    // rounded hexagon which goes dense.
    const sharpRings = morph(sharpHex(700, 300, 80, 6, 0));
    const roundRings = morph(roundedHex(700, 300, 80, 6, 0));
    expect(anchorCount(sharpRings[0])).toBeGreaterThanOrEqual(5);
    expect(anchorCount(roundRings[0])).toBe(0);
  });
});
