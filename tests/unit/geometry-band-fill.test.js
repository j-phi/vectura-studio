/*
 * Banded-bold geometry helpers (v1.2.27) — insetMultiPolygon + stitchConcentricRings.
 *
 * insetMultiPolygon is TRUE morphological erosion (subtract a Minkowski band swept
 * along the boundary), not an inward miter offset — offsets self-cross wildly near
 * collapse and fabricate phantom lobes (observed: rings surviving at 2× the real
 * collapse depth). These tests pin the erosion's exactness on a known shape, its
 * collapse depth, hole handling, and the sliver filter; and the stitcher's
 * segment-projection grafting (vertex-only matching missed grafts on faceted
 * rings, leaving dozens of unstitched loops).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('GeometryUtils.insetMultiPolygon / stitchConcentricRings', () => {
  let runtime;
  let GU;
  let FB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    GU = runtime.window.Vectura.GeometryUtils;
    FB = runtime.window.Vectura.FillBoolean;
  });

  afterAll(() => runtime.cleanup());

  const square = (x0, y0, w) => [[[[x0, y0], [x0 + w, y0], [x0 + w, y0 + w], [x0, y0 + w], [x0, y0]]]];

  const bbox = (mp) => {
    let mnx = Infinity; let mny = Infinity; let mxx = -Infinity; let mxy = -Infinity;
    mp.forEach((poly) => poly.forEach((ring) => ring.forEach(([x, y]) => {
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    })));
    return { mnx, mny, mxx, mxy };
  };

  test('erodes a square exactly (edges land at the inset distance)', () => {
    const mp = GU.insetMultiPolygon(square(0, 0, 10), 2, { boolean: FB });
    expect(mp.length).toBe(1);
    const b = bbox(mp);
    expect(b.mnx).toBeCloseTo(2, 5);
    expect(b.mny).toBeCloseTo(2, 5);
    expect(b.mxx).toBeCloseTo(8, 5);
    expect(b.mxy).toBeCloseTo(8, 5);
  });

  test('erosion collapses past the half-width, never inverts', () => {
    expect(GU.insetMultiPolygon(square(0, 0, 10), 4.9, { boolean: FB }).length).toBe(1);
    expect(GU.insetMultiPolygon(square(0, 0, 10), 5.1, { boolean: FB })).toEqual([]);
  });

  test('holes grow while the shell shrinks (annulus thins from both sides)', () => {
    // 20-square with a 4-square hole in the middle (hole wound opposite).
    const annulus = [[
      [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
      [[8, 8], [8, 12], [12, 12], [12, 8], [8, 8]],
    ]];
    const mp = GU.insetMultiPolygon(annulus, 1, { boolean: FB });
    expect(mp.length).toBe(1);
    expect(mp[0].length).toBe(2); // still shell + hole
    const shell = bbox([[mp[0][0]]]);
    const hole = bbox([[mp[0][1]]]);
    expect(shell.mnx).toBeCloseTo(1, 5);
    expect(shell.mxx).toBeCloseTo(19, 5);
    expect(hole.mnx).toBeCloseTo(7, 5);
    expect(hole.mxx).toBeCloseTo(13, 5);
  });

  test('minArea drops near-collapse crumbs', () => {
    // 10×3 bar: at inset 1.4 a 7.2×0.2 sliver (area 1.44) survives; a minArea
    // above that must clear it.
    const bar = [[[[0, 0], [10, 0], [10, 3], [0, 3], [0, 0]]]];
    expect(GU.insetMultiPolygon(bar, 1.4, { boolean: FB }).length).toBe(1);
    expect(GU.insetMultiPolygon(bar, 1.4, { boolean: FB, minArea: 2 })).toEqual([]);
  });

  test('stitchConcentricRings grafts nested rings into one continuous snake', () => {
    // Three concentric square rings, 1 apart; joinTol 2 must chain all three.
    const ring = (o, w) => {
      const pts = [{ x: o, y: o }, { x: o + w, y: o }, { x: o + w, y: o + w }, { x: o, y: o + w }];
      pts.push({ ...pts[0] });
      return pts;
    };
    const passes = [[ring(0, 12)], [ring(1, 10)], [ring(2, 8)]];
    const chains = GU.stitchConcentricRings(passes, 2);
    expect(chains.length).toBe(1);
    // Every ring's full loop is drawn: 3 loops × (4 corners + close) plus grafts.
    expect(chains[0].length).toBeGreaterThanOrEqual(15);
  });

  test('stitch grafts onto ring EDGES, not only vertices (faceted rings)', () => {
    // The outer chain ends mid-edge at (5,0). The inner ring's nearest VERTEX
    // is 3.16 away (beyond tol) but its bottom EDGE passes at distance 1 —
    // segment projection must graft it (vertex-only matching left it separate).
    const outer = [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 0 }];
    const inner = [{ x: 2, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 9 }, { x: 2, y: 9 }, { x: 2, y: 1 }];
    const chains = GU.stitchConcentricRings([[outer], [inner]], 1.5);
    expect(chains.length).toBe(1);
  });

  test('a ring beyond joinTol starts its own chain (split regions stay separate)', () => {
    const a = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }];
    const b = [{ x: 100, y: 100 }, { x: 104, y: 100 }, { x: 104, y: 104 }, { x: 100, y: 104 }, { x: 100, y: 100 }];
    const chains = GU.stitchConcentricRings([[a], [b]], 2);
    expect(chains.length).toBe(2);
  });
});
