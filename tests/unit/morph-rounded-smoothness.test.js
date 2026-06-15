const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression: morphing an ALREADY-SMOOTH shape (rounded-corner polygon) into a
 * circle must keep every in-between ring smooth. Both endpoints are smooth, so
 * no intermediate may introduce a hard angle.
 *
 * The bug: buildCornerSamples derived per-anchor "roundness" from the turn angle
 * of the COARSE K-resampled polygon, which mis-reads an already-rounded corner
 * as partly sharp (turn ≈ corner angle / few samples). That scaled the bezier
 * handles down → the in-between rings showed hard polygonal angles even though
 * both sources were smooth. Roundness must instead come from the source's actual
 * anchor handles: a rounded corner carries bezier handles → fully round; only a
 * genuinely sharp anchor (both handles null) pins round 0.
 */
describe('morph modifier — rounded polygon → circle stays smooth', () => {
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

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const norm = (p) => { const l = Math.hypot(p.x, p.y) || 1; return { x: p.x / l, y: p.y / l }; };
  const dot = (a, b) => a.x * b.x + a.y * b.y;

  // Rounded-corner polygon as an anchored 'shape' path — two anchors per corner,
  // each carrying ONE bezier handle (mirrors renderer.buildRoundedPolygonAnchors).
  const roundedPolyPath = (cx, cy, R, sides, radius, rot = 0) => {
    const verts = [];
    for (let k = 0; k < sides; k += 1) {
      const a = rot + (k / sides) * Math.PI * 2;
      verts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    const anchors = [];
    for (let i = 0; i < sides; i += 1) {
      const vertex = verts[i];
      const prev = verts[(i - 1 + sides) % sides];
      const next = verts[(i + 1) % sides];
      const prevDir = norm({ x: prev.x - vertex.x, y: prev.y - vertex.y });
      const nextDir = norm({ x: next.x - vertex.x, y: next.y - vertex.y });
      const prevLen = Math.hypot(prev.x - vertex.x, prev.y - vertex.y);
      const nextLen = Math.hypot(next.x - vertex.x, next.y - vertex.y);
      const edgeAngle = Math.acos(clamp(dot(prevDir, nextDir), -1, 1));
      const tanHalf = Math.tan(Math.max(1e-4, edgeAngle * 0.5));
      const tangentDistance = Math.min(prevLen * 0.5, nextLen * 0.5, radius / tanHalf);
      const start = { x: vertex.x + prevDir.x * tangentDistance, y: vertex.y + prevDir.y * tangentDistance };
      const end = { x: vertex.x + nextDir.x * tangentDistance, y: vertex.y + nextDir.y * tangentDistance };
      const arcAngle = Math.PI - Math.max(1e-4, edgeAngle);
      const handleLength = (4 / 3) * Math.tan(arcAngle / 4) * radius;
      anchors.push({ x: start.x, y: start.y, in: null, out: { x: start.x - prevDir.x * handleLength, y: start.y - prevDir.y * handleLength } });
      anchors.push({ x: end.x, y: end.y, in: { x: end.x - nextDir.x * handleLength, y: end.y - nextDir.y * handleLength }, out: null });
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
  const open = (ring) => {
    if (ring.length > 1) {
      const f = ring[0]; const l = ring[ring.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) return ring.slice(0, -1);
    }
    return ring;
  };
  const maxTurn = (full) => {
    const ring = open(full);
    let m = 0; const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
      const a = Math.atan2(p1.y - p0.y, p1.x - p0.x), b = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      m = Math.max(m, Math.abs(d));
    }
    return m * 180 / Math.PI;
  };

  const morph = (sides, radius) => {
    const mod = { type: 'morph', enabled: true, steps: 6, easing: 'linear', emitSources: false, closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid', correspondenceMode: 'centroid-angle', resampleCount: 128 };
    const a = roundedPolyPath(700, 300, 90, sides, radius, 0);
    const b = circlePath(250, 300, 80);
    const out = M.applyMorphModifierToPaths([child(a), child(b)], mod, null);
    return out.filter((p) => !(p.meta && (p.meta.morphFill || p.meta.paintBucketFillId)));
  };

  test('RND-01: rounded hexagon → circle — no hard angles in any in-between ring', () => {
    const rings = morph(6, 45);
    expect(rings.length).toBe(6);
    rings.forEach((ring) => {
      // A smooth ring's per-vertex turn stays small. The old turn-from-coarse-
      // K-gon roundness produced ~40°+ joints at the corners; a true smooth
      // blend stays well under 25°.
      expect(maxTurn(ring)).toBeLessThan(25);
    });
  });

  test('RND-02: rounded square → circle — no hard angles in any in-between ring', () => {
    const rings = morph(4, 50);
    rings.forEach((ring) => expect(maxTurn(ring)).toBeLessThan(25));
  });

  // Sample the ring's ACTUAL rendered bezier (from meta.anchors — what the canvas
  // draws) so we measure the real curve, not the sparse stored polyline.
  const sampleRingBezier = (ring) => {
    const an = ring.meta && ring.meta.anchors;
    if (!an || !an.some((a) => a.in || a.out)) return open(ring);
    const pts = [];
    const seg = (p0, c1, c2, p1) => {
      for (let t = 0; t < 1; t += 0.04) {
        const u = 1 - t;
        pts.push({
          x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
          y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
        });
      }
    };
    for (let i = 0; i < an.length; i += 1) {
      const a = an[i];
      const b = an[(i + 1) % an.length];
      seg(a, a.out || a, b.in || b, b);
    }
    return pts;
  };
  void sampleRingBezier; // (kept for ad-hoc bezier inspection; unused by asserts)
  // Min radius from the centroid as a fraction of the mean. A clean convex blend
  // ring stays well above ~0.5; a TWISTED / self-crossing ring (the corner-match
  // failure where a curvature-sampled rounded polygon got index-corresponded
  // against an evenly-sampled circle) pinches vertices toward the centre and this
  // collapses. The robust "did it twist" guard.
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
  const hasAnchors = (ring) => !!(ring.meta && Array.isArray(ring.meta.anchors) && ring.meta.anchors.length);

  test('RND-03: rounded square → circle — smooth, untwisted, routed through the dense path', () => {
    // Two smooth closed shapes (rounded polygon + circle) must blend via the dense
    // path. The sparse corner-matched path over-rounds them AND — because the two
    // anchor rings sample differently — TWISTS the in-between rings (Corner Match
    // looked worse than off). Dense rings carry no bezier anchors, stay smooth, and
    // never pinch toward the centroid.
    const rings = morph(4, 45);
    rings.forEach((ring) => {
      expect(hasAnchors(ring)).toBe(false);              // dense path engaged
      expect(maxTurn(ring)).toBeLessThan(25);            // smooth, no notch/kink
      expect(minRadiusFrac(ring)).toBeGreaterThan(0.55); // convex, no twist
    });
  });

  test('RND-04: rounded triangle / pentagon / hexagon → circle stay smooth & untwisted', () => {
    [[3, 30], [5, 35], [6, 40]].forEach(([sides, radius]) => {
      morph(sides, radius).forEach((ring) => {
        expect(hasAnchors(ring)).toBe(false);
        expect(maxTurn(ring)).toBeLessThan(25);
        expect(minRadiusFrac(ring)).toBeGreaterThan(0.5);
      });
    });
  });
});
