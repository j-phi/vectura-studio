/**
 * U2 kernel perf (fill-style review 2026-10-02) — speed-up guards.
 *
 * Absolute milliseconds are NOT asserted (this machine runs at load averages
 * of 10-100 under parallel agents). Each check times the NEW kernel against
 * the OLD one inside one process, interleaved, best of N, and asserts a
 * conservative ratio well under the one measured:
 *   - ribbon erosion: PenFill.erodeLevels (one oriented SDF, both depths) vs
 *     the chained GeometryUtils.insetMultiPolygon pair it replaced;
 *   - ground-shadow fields: the segment-grid build vs the brute-force
 *     O(cells x segments) distance it replaced;
 *   - Geometry3D.rotatePoint (memoised trig) vs the verbatim legacy rotator.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const bestOf = (n, fnA, fnB) => {
  let a = Infinity; let b = Infinity;
  for (let i = 0; i < n; i++) {
    let t0 = performance.now(); fnA(); a = Math.min(a, performance.now() - t0);
    t0 = performance.now(); fnB(); b = Math.min(b, performance.now() - t0);
  }
  return { a, b };
};

describe('U2 kernel perf — new kernels beat the ones they replaced', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => runtime && runtime.cleanup());

  test('ribbon erosion: one oriented distance field is >= 2x faster than two polygon insets', () => {
    const RG = V.RibbonGeometry;
    const GU = V.GeometryUtils;
    const PF = V.PenFill;
    // A diagonal looping (trochoid) centreline: the worst case for both the
    // band union (self-crossings) and an axis-aligned raster (diagonal).
    const centre = []; const hw = [];
    for (let i = 0; i <= 260; i++) {
      const t = i / 260 * Math.PI * 9;
      const x = 10 + t * 3.2 + 2.2 * Math.sin(t * 2.1);
      const y = 10 + t * 2.6 + 2.2 * Math.cos(t * 2.1);
      centre.push({ x, y }); hw.push(0.55 + 0.25 * Math.sin(t * 0.7));
    }
    const mp = RG.buildRibbonMultiPolygon(centre, hw, { cap: 'butt', joinLimit: 4, minHalfWidth: 0.2 });
    expect(Array.isArray(mp) && mp.length).toBeTruthy();
    const ringsMP = mp.map((poly) => poly.map((r) => r.map((q) => (Array.isArray(q) ? q : [q.x, q.y]))));
    const flat = []; ringsMP.forEach((poly) => poly.forEach((r) => flat.push(r)));
    const pen = 0.3;
    let rasterOut = null;
    const { a: raster, b: poly } = bestOf(3,
      () => { rasterOut = PF.erodeLevels(flat, [pen / 2, pen * 0.85], { guard: [true, false] }); },
      () => {
        const o = GU.insetMultiPolygon(ringsMP, pen / 2, { minArea: 0 });
        if (o && o.length) GU.insetMultiPolygon(o, pen * 0.35, { minArea: 0 });
      });
    expect(rasterOut && rasterOut.levels[0].length).toBeGreaterThan(0);
    expect(poly / raster).toBeGreaterThan(2);
  }, 120000);

  test('ground-shadow fields: segment grid is >= 3x faster than the brute force', () => {
    const Shadows = V.Scene3D.Shadows;
    // Fixture AND reference are built inside the runtime's own realm: objects
    // made in the test realm are slow to read from the runtime's (a cross-realm
    // penalty that would flatter the new kernel).
    const fx = runtime.window.eval(`(() => {
      const ring = [];
      for (let i = 0; i < 600; i++) {
        const t = (i / 600) * Math.PI * 2;
        const r = 40 + 6 * Math.sin(t * 7);
        ring.push({ x: 60 + Math.cos(t) * r * 1.6, y: 50 + Math.sin(t) * r });
      }
      const edge = ring.map((p, i) => [ring[(i + ring.length - 1) % ring.length], p]);
      const contact = edge.slice(0, 120);
      const d = (px, py, segs) => {
        let best = Infinity;
        for (let i = 0; i < segs.length; i++) {
          const a = segs[i][0]; const b = segs[i][1];
          const vx = b.x - a.x; const vy = b.y - a.y;
          const wx = px - a.x; const wy = py - a.y;
          const vv = vx * vx + vy * vy;
          let s = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
          if (s < 0) s = 0; else if (s > 1) s = 1;
          const dx = wx - vx * s; const dy = wy - vy * s;
          const q = dx * dx + dy * dy;
          if (q < best) best = q;
        }
        return Math.sqrt(best);
      };
      const isFinitePt = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y);
      const pointInRings = (px, py, rings) => {
        let inside = false;
        for (let r = 0; r < rings.length; r++) {
          const ring = rings[r];
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[j]; const b = ring[i];
            if (!isFinitePt(a) || !isFinitePt(b)) continue;
            if ((a.y > py) !== (b.y > py)) {
              const x = a.x + ((py - a.y) / ((b.y - a.y) || 1e-12)) * (b.x - a.x);
              if (px < x) inside = !inside;
            }
          }
        }
        return inside;
      };
      // The legacy build: both distance fields per cell, then a per-cell
      // point-in-polygon pass for the inradius.
      const brute = (g) => {
        const dE = new Float32Array(g.nx * g.ny);
        let acc = 0;
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
          const x = g.minX + i * g.cell; const y = g.minY + j * g.cell;
          acc += d(x, y, contact);
          dE[j * g.nx + i] = d(x, y, edge);
        }
        let Rin = 0;
        for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
          const x = g.minX + i * g.cell; const y = g.minY + j * g.cell;
          if (!pointInRings(x, y, [ring])) continue;
          if (dE[j * g.nx + i] > Rin) Rin = dE[j * g.nx + i];
        }
        return acc + Rin;
      };
      return { rings: [ring], edge, contact, brute };
    })()`);
    const g = Shadows.__shadowFieldsForTest(fx.rings, fx.contact, fx.edge).grid;
    expect(g.nx * g.ny).toBeGreaterThan(10000);
    const { a: grid, b: old } = bestOf(3,
      () => Shadows.__shadowFieldsForTest(fx.rings, fx.contact, fx.edge),
      () => fx.brute(g));
    expect(old / grid).toBeGreaterThan(3);
  }, 120000);

  test('rotatePoint with memoised trig is >= 2x faster than the legacy rotator', () => {
    const G3 = V.Geometry3D;
    const pts = [];
    for (let i = 0; i < 200000; i++) pts.push({ x: Math.sin(i), y: Math.cos(i * 1.3), z: Math.sin(i * 0.7) });
    const obj = { yaw: 33, pitch: -12, roll: 5 };
    const cam = { yaw: -20, pitch: 30 };
    let s = 0;
    const { a: fast, b: slow } = bestOf(3,
      () => { for (const p of pts) { s += G3.rotatePoint(G3.rotatePoint(p, obj), cam).x; } },
      () => { for (const p of pts) { s += G3.rotatePointReference(G3.rotatePointReference(p, obj), cam).x; } });
    expect(Number.isFinite(s)).toBe(true);
    expect(slow / fast).toBeGreaterThan(2);
  }, 120000);
});
