const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression: BEVELED / ROUNDED polygons collapsed the morph to triangles.
 *
 * The corner-matched morph picks an anchor count K ≈ the busier source's
 * structural corner count. `cornerCountOf` returned the count of SHARP anchors
 * for a handle-less polygon, but FELL THROUGH to geometric turn-counting once a
 * corner gained bezier handles (a bevel/round). Geometric counting spreads each
 * rounded corner over many sub-threshold vertices and finds ~0 corners, so a
 * rounded hexagon → 0, K floored to 3, and every in-between ring became a
 * TRIANGLE regardless of the real shape. A rounded hexagon has the same six
 * structural corners as a sharp one — the bevel only softens them.
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

  test('rounded hexagon → circle does NOT collapse to triangles', () => {
    const rings = morph(roundedHex(700, 300, 80, 6, 0));
    expect(rings.length).toBe(5);
    rings.forEach((ring) => {
      // A triangle ring carries 3 anchors; a hexagon-faithful ring keeps ~6.
      expect(anchorCount(ring)).toBeGreaterThanOrEqual(5);
    });
  });

  test('rounded and sharp hexagons morph to the same anchor count (bevel only softens corners)', () => {
    const sharpRings = morph(sharpHex(700, 300, 80, 6, 0));
    const roundRings = morph(roundedHex(700, 300, 80, 6, 0));
    expect(anchorCount(roundRings[0])).toBe(anchorCount(sharpRings[0]));
  });
});
