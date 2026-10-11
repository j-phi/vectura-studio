/**
 * U2 kernel perf (fill-style review 2026-10-02) — speed-up guards.
 *
 * NO wall-clock ratios: this machine runs at load averages of 10-100 under
 * parallel agents, and a ratio of two timings flips under that load (the
 * erosion one measured 1.72 against a >2 bar and failed). Each guard instead
 * COUNTS the expensive primitive the old kernel leaned on, which is
 * independent of machine load (same pattern as occluder-scan-counter.js):
 *   - ribbon erosion: PenFill.erodeLevels (one oriented SDF) must make ZERO
 *     polygon-clipping boolean ops / GeometryUtils.insetMultiPolygon calls and
 *     stay under a fixed raster-cell ceiling; the chained inset pair it
 *     replaced is run as the measured baseline;
 *   - ground-shadow fields: the segment-grid build must evaluate far fewer
 *     point-segment distances than the brute-force O(cells x segments) one
 *     (counted by reads of each segment's endpoint slot);
 *   - Geometry3D.rotatePoint (memoised trig) must make ZERO Math.sin/cos calls
 *     in steady state; the legacy rotator pays 6 per call.
 * One generous absolute wall-clock smoke ceiling per test remains.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('U2 kernel perf — new kernels beat the ones they replaced', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => runtime && runtime.cleanup());

  test('ribbon erosion: one oriented distance field makes zero polygon boolean/inset calls', () => {
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
    const FB = V.FillBoolean;
    // Count every polygon-clipping boolean op and every inset call (the
    // expensive primitive of the old kernel).
    const counts = { bool: 0, inset: 0 };
    const restores = [];
    ['union', 'difference', 'xor', 'intersection'].forEach((name) => {
      const orig = FB[name];
      if (typeof orig !== 'function') return;
      FB[name] = (...args) => { counts.bool += 1; return orig.apply(FB, args); };
      restores.push(() => { FB[name] = orig; });
    });
    const origInset = GU.insetMultiPolygon;
    GU.insetMultiPolygon = (...args) => { counts.inset += 1; return origInset.apply(GU, args); };
    restores.push(() => { GU.insetMultiPolygon = origInset; });
    let rasterOut = null; let oldBool = 0; let oldInset = 0;
    const t0 = performance.now();
    try {
      rasterOut = PF.erodeLevels(flat, [pen / 2, pen * 0.85], { guard: [true, false] });
      const newBool = counts.bool; const newInset = counts.inset;
      // Baseline: the chained polygon-inset pair erodeLevels replaced.
      counts.bool = 0; counts.inset = 0;
      const o = GU.insetMultiPolygon(ringsMP, pen / 2, { minArea: 0 });
      if (o && o.length) GU.insetMultiPolygon(o, pen * 0.35, { minArea: 0 });
      oldBool = counts.bool; oldInset = counts.inset;
      // New path: no polygon booleans, no insets.
      expect(newBool).toBe(0);
      expect(newInset).toBe(0);
    } finally { restores.forEach((r) => r()); }
    const elapsed = performance.now() - t0;
    expect(rasterOut && rasterOut.levels[0].length).toBeGreaterThan(0);
    // The spies are live: the old path really does pay for booleans.
    expect(oldInset).toBe(2);
    expect(oldBool).toBeGreaterThanOrEqual(6);
    // Raster work ceiling: one oriented field of ~542k cells (measured), well
    // under the module's 1.4M cell cap; a finer grid would blow past it.
    const xs = []; const ys = [];
    flat.forEach((r) => r.forEach((q) => { const f = rasterOut.frame.toFrame({ x: q[0], y: q[1] }); xs.push(f.x); ys.push(f.y); }));
    const cells = ((Math.max(...xs) - Math.min(...xs)) / rasterOut.cs + 7)
      * ((Math.max(...ys) - Math.min(...ys)) / rasterOut.cs + 7);
    expect(cells).toBeLessThan(800000);
    // Generous absolute smoke ceiling only (not a ratio).
    expect(elapsed).toBeLessThan(30000);
  }, 120000);

  test('ground-shadow fields: segment grid evaluates >= 3x fewer point-segment distances than the brute force', () => {
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
      // Every distance evaluation reads a segment's slot 0 exactly once, in
      // both the grid build and the brute reference, so reads == evaluations.
      const ctr = { reads: 0 };
      const counted = (a, b) => {
        const seg = [a, b];
        Object.defineProperty(seg, 0, { get() { ctr.reads++; return a; } });
        return seg;
      };
      const edge = ring.map((p, i) => counted(ring[(i + ring.length - 1) % ring.length], p));
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
      return { rings: [ring], edge, contact, brute, ctr };
    })()`);
    const g = Shadows.__shadowFieldsForTest(fx.rings, fx.contact, fx.edge).grid;
    expect(g.nx * g.ny).toBeGreaterThan(10000);
    fx.ctr.reads = 0;
    const t0 = performance.now();
    Shadows.__shadowFieldsForTest(fx.rings, fx.contact, fx.edge);
    const elapsed = performance.now() - t0;
    const gridWork = fx.ctr.reads;
    fx.ctr.reads = 0;
    fx.brute(g);
    const bruteWork = fx.ctr.reads;
    // Brute force is cells x (contact + edge) evaluations; the spy must see it.
    expect(bruteWork).toBeGreaterThanOrEqual(g.nx * g.ny * (fx.contact.length + fx.edge.length));
    // The segment grid must stay >= 3x under that (measured far better).
    expect(gridWork * 3).toBeLessThan(bruteWork);
    // Generous absolute smoke ceiling only (not a ratio).
    expect(elapsed).toBeLessThan(30000);
  }, 120000);

  test('rotatePoint with memoised trig makes no trig calls in steady state', () => {
    const G3 = V.Geometry3D;
    const M = runtime.window.Math; // the runtime realm's own Math
    const pts = [];
    for (let i = 0; i < 2000; i++) pts.push({ x: Math.sin(i), y: Math.cos(i * 1.3), z: Math.sin(i * 0.7) });
    const obj = { yaw: 33, pitch: -12, roll: 5 };
    const cam = { yaw: -20, pitch: 30 };
    let trig = 0;
    const oSin = M.sin; const oCos = M.cos;
    M.sin = (x) => { trig += 1; return oSin(x); };
    M.cos = (x) => { trig += 1; return oCos(x); };
    let s = 0; let fast = 0; let slow = 0; let elapsed = 0;
    try {
      // Warm the memo (object + camera angle triples), then count.
      G3.rotatePoint(G3.rotatePoint(pts[0], obj), cam);
      trig = 0;
      const t0 = performance.now();
      for (const p of pts) { s += G3.rotatePoint(G3.rotatePoint(p, obj), cam).x; }
      elapsed = performance.now() - t0;
      fast = trig;
      trig = 0;
      for (const p of pts) { s += G3.rotatePointReference(G3.rotatePointReference(p, obj), cam).x; }
      slow = trig;
    } finally { M.sin = oSin; M.cos = oCos; }
    expect(Number.isFinite(s)).toBe(true);
    // Legacy rotator: 3 angles x (sin + cos) per call, two calls per point.
    expect(slow).toBeGreaterThanOrEqual(pts.length * 12);
    // Memoised: the 2 alternating angle triples stay cached -> zero trig.
    expect(fast).toBe(0);
    // Generous absolute smoke ceiling only (not a ratio).
    expect(elapsed).toBeLessThan(5000);
  }, 120000);
});
