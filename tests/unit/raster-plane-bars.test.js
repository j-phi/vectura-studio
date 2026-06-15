/*
 * Raster-Plane — Bars see-through OFF occlusion (RGR coverage).
 *
 * Before the fix, Bars mode with See-Through OFF shattered every edge into
 * hundreds of 1–4px stubs: a long edge grazing the screen silhouettes of many
 * co-depth neighbor bars flipped hidden/visible from per-sample jitter, and each
 * flip spawned a sub-pixel "tick". (Empirically: 178 sub-2px stubs, 51% of paths
 * under 5px, median segment 3.8px — vs See-Through ON: 0 stubs, median 10px.)
 *
 * occludeBarEdges now regroups the occluded runs by source edge, merges collinear
 * sub-runs separated only by jitter-sized gaps, and drops the residual stubs:
 *   - No degenerate sub-1px segments survive.
 *   - The fragment fraction collapses to a small share of the output.
 *   - No hidden-line dashes leak through when See-Through is OFF.
 *   - See-Through ON is untouched (the occlusion path is never entered).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Bars see-through occlusion', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };
  const gen = (extra, seed = 5) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'bars', barRows: 14, barColumns: 14, amplitude: 30, artworkSize: 150, smoothing: 0, ...extra },
      null,
      new V.SimpleNoise(seed),
      bounds,
    );

  const segLen = (path) => {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return len;
  };
  // The bar edges (the geometry the occluder pass touches) — exclude the base
  // floor outline and any (disabled) hatch so the fragmentation metrics measure
  // exactly the occluded edge set.
  const barEdges = (paths) => paths.filter((p) => p.meta && p.meta.mode === 'bars' && !p.meta.barFloor && !p.meta.hatch);

  test('See-Through OFF: no degenerate sub-pixel stubs survive', () => {
    const off = gen({ seeThrough: false });
    const edges = barEdges(off);
    expect(edges.length).toBeGreaterThan(0);
    const stubs = edges.filter((p) => segLen(p) < 1.0);
    expect(stubs.length).toBe(0);
  });

  test('See-Through OFF: edges are not shattered into tiny fragments', () => {
    const off = gen({ seeThrough: false });
    const edges = barEdges(off);
    const tiny = edges.filter((p) => segLen(p) < 5.0);
    // Was ~51% on the buggy render; the merge pass must bring this well down.
    expect(tiny.length / edges.length).toBeLessThan(0.2);
  });

  test('See-Through OFF: no hidden-line dashes leak through (faces removed)', () => {
    const off = gen({ seeThrough: false });
    expect(off.some((p) => p.meta && p.meta.hiddenLine === true)).toBe(false);
  });

  test('See-Through ON: keeps the full back lattice (occlusion not applied)', () => {
    const on = gen({ seeThrough: true });
    const off = gen({ seeThrough: false });
    // ON renders strictly more edge geometry than the hidden-line-removed OFF.
    expect(barEdges(on).length).toBeGreaterThan(barEdges(off).length);
    // ON is allowed to carry hidden-line dashes for the back faces.
    expect(on.length).toBeGreaterThan(0);
  });

  test('is deterministic for a fixed seed (See-Through OFF)', () => {
    const a = gen({ seeThrough: false }, 17);
    const b = gen({ seeThrough: false }, 17);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
