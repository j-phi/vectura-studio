/*
 * U2 kernel perf (fill-style review 2026-10-02, §2(d)) — ribbon erosion from
 * ONE oriented distance field.
 *
 * `ribbonizeCore` used to erode every clipped ribbon twice with
 * `GeometryUtils.insetMultiPolygon` (a polygon-clipping band union each; 42-66 %
 * of a wave/weave law's frame). It now calls `PenFill.erodeLevels`, which
 * rasterizes the clipped ribbon once in its principal-axis frame and contours
 * both depths (outline pen/2, fill region pen·(1 - overlap)) off that field;
 * PenFill then fills the frame-space region on an oriented grid.
 *
 * The output CHANGED on purpose (Jay accepted it 2026-10-02), so this file pins
 * INVARIANTS instead of bytes:
 *   1. no polygon erosion runs for a ribbon (the perf mechanism, deterministic);
 *   2. CONTAINMENT — every outline vertex lies inside the clipped ribbon and at
 *      least pen/2 from its boundary (exact segment distance), so the stroked
 *      outline never leaves the ribbon; every fill-pass vertex lies inside it
 *      too, at least pen/2 deep;
 *   3. COVERAGE — the ring-fill rate (independent T1 rasterizer) stays within
 *      0.002 of the polygon-erosion numbers measured on 383d7610.
 *
 * RED on 383d7610: `PenFill.erodeLevels` does not exist and
 * `insetMultiPolygon` runs 2 x per wide stretch.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { captureClipGroups, measureRingFillRate } = require('../helpers/scene3d-ring-coverage');

// Ring-fill rate of the polygon erosion, sphere / hatch / yaw 33, on 383d7610.
const OLD_RATE = {
  weaveDepth: 0.99807,
  trochoidLoop: 0.99590,
  nibAngle: 0.99974,
};
const LAWS = Object.keys(OLD_RATE);

const pointInRings = (x, y, rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[j]; const b = ring[i];
      if ((a.y > y) !== (b.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        if (x < a.x + t * (b.x - a.x)) inside = !inside;
      }
    }
  }
  return inside;
};
const distToRings = (x, y, rings) => {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[j]; const b = ring[i];
      const vx = b.x - a.x; const vy = b.y - a.y;
      const vv = vx * vx + vy * vy;
      let t = vv > 0 ? ((x - a.x) * vx + (y - a.y) * vy) / vv : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const d = Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
      if (d < best) best = d;
    }
  }
  return best;
};
const asXY = (q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : { x: q.x, y: q.y });

describe('SurfaceFill ribbons — one oriented distance field for both erosions', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
    const GU = V.GeometryUtils;
    const PF = V.PenFill;

    LAWS.forEach((law) => {
      const engine = new V.VectorEngine();
      const gid = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === gid);
      const child = engine.getLayerDescendants(gid).filter((l) => l && l.type === 'object3d')[0];
      child.params.primitive = 'sphere';
      child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: law } };
      child.params.transform.yaw = 33;

      const r = {
        insetCalls: 0, erodeCalls: 0, outlineVerts: 0, outlineOut: 0, outlineShallow: 0,
        fillVerts: 0, fillOut: 0, fillShallow: 0, worstOutline: 0, worstFill: 0,
      };
      const origInset = GU.insetMultiPolygon;
      GU.insetMultiPolygon = function spy(...a) { r.insetCalls += 1; return origInset.apply(this, a); };
      const origErode = PF.erodeLevels;
      const origFill = PF.fillRegion;
      let pending = null;   // the ribbon (in its own frame) the next fillRegion belongs to
      if (typeof origErode === 'function') {
        PF.erodeLevels = function spyErode(region, depths, opts) {
          const res = origErode.call(this, region, depths, opts);
          r.erodeCalls += 1;
          const rings = region.map((ring) => ring.map(asXY));
          const half = depths[0];
          if (res) {
            res.levels[0].forEach((loop) => loop.forEach((q) => {
              const p = res.frame.toWorld(q);
              r.outlineVerts += 1;
              if (!pointInRings(p.x, p.y, rings)) { r.outlineOut += 1; return; }
              const short = half - distToRings(p.x, p.y, rings);
              if (short > 1e-6) r.outlineShallow += 1;
              if (short > r.worstOutline) r.worstOutline = short;
            }));
            pending = { rings: rings.map((ring) => ring.map(res.frame.toFrame)), half };
          }
          return res;
        };
        PF.fillRegion = function spyFill(...a) {
          const res = origFill.apply(this, a);
          if (pending && res && Array.isArray(res.paths)) {
            const { rings, half } = pending;
            res.paths.forEach((p) => p.forEach((q) => {
              r.fillVerts += 1;
              if (!pointInRings(q.x, q.y, rings)) { r.fillOut += 1; return; }
              const sh = half - distToRings(q.x, q.y, rings);
              if (sh > 1e-6) r.fillShallow += 1;
              if (sh > r.worstFill) r.worstFill = sh;
            }));
          }
          pending = null;
          return res;
        };
      }
      const cap = captureClipGroups(V);
      try {
        engine.computeAllDisplayGeometry();
      } finally {
        cap.restore();
        GU.insetMultiPolygon = origInset;
        PF.erodeLevels = origErode;
        PF.fillRegion = origFill;
      }
      const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      r.coverage = measureRingFillRate(cap.groups, ink, stats.penWidth || 0.3);
      r.stats = stats;
      results[law] = r;
    });
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — the fixture reaches the wide-ribbon class', (law) => {
    expect(results[law].stats.wide).toBeGreaterThan(0);
    expect(results[law].stats.outlines).toBeGreaterThan(0);
    expect(results[law].stats.fills).toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — both erosions come off one field: no polygon erosion runs', (law) => {
    expect(results[law].erodeCalls).toBeGreaterThan(0);
    expect(results[law].insetCalls).toBe(0);
  });

  test.each(LAWS)('%s — containment: every outline vertex inside the ribbon and >= pen/2 deep', (law) => {
    const r = results[law];
    expect(r.outlineVerts).toBeGreaterThan(100);
    expect(r.outlineOut).toBe(0);
    expect(r.outlineShallow).toBe(0);
  });

  test.each(LAWS)('%s — containment: every fill-pass vertex inside the ribbon and >= pen/2 deep', (law) => {
    const r = results[law];
    expect(r.fillVerts).toBeGreaterThan(100);
    expect(r.fillOut).toBe(0);
    expect(r.fillShallow).toBe(0);
  });

  test.each(LAWS)('%s — coverage within 0.002 of the polygon erosion', (law) => {
    const rate = results[law].coverage.ringFillRate;
    expect(rate).not.toBeNull();
    expect(rate).toBeGreaterThanOrEqual(OLD_RATE[law] - 0.002);
  });
});
