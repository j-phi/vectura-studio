const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression (v1.1.91): the `smoothing` slider must MEASURABLY de-lump the
 * in-between rings of a circle → sharp-hexagon morph — the exact repro the user
 * hit ("lumpy/over-segmented rings, no slider does anything").
 *
 * Root cause it locks down:
 *  - Sparse (Corner Match ON) path: smoothRing could only midpoint-nudge the
 *    existing ~12-25 flattened vertices; it NEVER added points, so the round
 *    arcs of a near-circle ring stayed faceted no matter the slider. The fix
 *    lets smoothing densify the smooth (bezier) arcs of the flattened ring
 *    (lower flatten tolerance) while leaving sharp corners as 2-point joints.
 *  - Dense (Corner Match OFF) path: the selective midpoint nudge was weak and
 *    non-monotonic. The fix makes smoothing actually lower the 6-lobe ripple.
 *
 * Contract:
 *  - smoothing=0 must be byte-identical to before (guards EFF-02/03 efficiency
 *    + existing baselines): sparse rings stay sparse (< 40 pts), anchor count
 *    6..8, no densification.
 *  - smoothing=1 must reduce the max per-vertex turn of the flattened ring AND
 *    add points along the smooth arcs of the sparse ring.
 */
describe('morph modifier — smoothing slider de-lumps in-between rings', () => {
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
  const open = (ring) => {
    if (ring.length > 1) {
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) return ring.slice(0, -1);
    }
    return ring;
  };
  const maxTurn = (full) => {
    const ring = open(full);
    let m = 0;
    const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = ring[(i - 1 + n) % n];
      const p1 = ring[i];
      const p2 = ring[(i + 1) % n];
      const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const b = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      m = Math.max(m, Math.abs(d));
    }
    return m * 180 / Math.PI;
  };
  // Mean radius fraction floor — a clean convex ring keeps min/mean high.
  const minRadiusFrac = (full) => {
    const r = open(full);
    let cx = 0; let cy = 0;
    r.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= r.length; cy /= r.length;
    const rs = r.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    return Math.min(...rs) / mean;
  };

  const run = (smoothing, cornerMatch = true) => {
    const mod = {
      type: 'morph', enabled: true, steps: 6, easing: 'linear', emitSources: false,
      closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid',
      correspondenceMode: 'nearest', resampleCount: 512, cornerMatch, cornerMatchMax: 256,
      smoothing,
    };
    return M.applyMorphModifierToPaths(
      [child(polyPath(700, 300, 80, 6, 0)), child(circlePath(250, 200, 70))],
      mod,
      null
    ).filter((p) => !(p.meta && p.meta.morphFill));
  };

  // The LATER rings are near-circles — those are the ones that look lumpy and
  // that smoothing should de-facet. Use the second-to-last ring as the probe.
  const probeIdx = (rings) => Math.max(0, rings.length - 2);

  test('SM-01: sparse (Corner Match ON) — smoothing=1 lowers max per-vertex turn vs smoothing=0', () => {
    const r0 = run(0, true);
    const r1 = run(1, true);
    const i = probeIdx(r0);
    const t0 = maxTurn(r0[i]);
    const t1 = maxTurn(r1[i]);
    // A real, visible margin — not a rounding wobble.
    expect(t1).toBeLessThan(t0 - 5);
  });

  test('SM-02: sparse — smoothing=1 DENSIFIES the smooth arcs (substantially more flattened points)', () => {
    const r0 = run(0, true);
    const r1 = run(1, true);
    const i = probeIdx(r0);
    // Real densification, not a +1 rounding wobble: the near-circle ring should
    // gain well over half again as many points along its smooth arcs.
    expect(open(r1[i]).length).toBeGreaterThan(open(r0[i]).length * 1.5);
  });

  test('SM-03: sparse — smoothing=1 keeps every ring convex (no twist / collapse)', () => {
    run(1, true).forEach((ring) => {
      expect(minRadiusFrac(ring)).toBeGreaterThan(0.5);
    });
  });

  test('SM-04: GUARD — smoothing=0 stays sparse + plotter-efficient (EFF contract holds)', () => {
    const sparse = run(0, true);
    const maxLen = Math.max(...sparse.map((r) => r.length));
    expect(maxLen).toBeLessThan(40);
    sparse.forEach((ring) => {
      expect(Array.isArray(ring.meta && ring.meta.anchors)).toBe(true);
      expect(ring.meta.anchors.length).toBeGreaterThanOrEqual(6);
      expect(ring.meta.anchors.length).toBeLessThanOrEqual(8);
    });
  });

  test('SM-05: dense (Corner Match OFF) — smoothing=1 lowers the ripple vs smoothing=0', () => {
    const r0 = run(0, false);
    const r1 = run(1, false);
    const i = probeIdx(r0);
    expect(maxTurn(r1[i])).toBeLessThan(maxTurn(r0[i]) - 2);
  });
});
