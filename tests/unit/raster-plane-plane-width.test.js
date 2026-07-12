/*
 * Raster-Plane — Plane Width (Lines as Planes) RGR coverage.
 *
 * planeWidth (1–100%, planes + See-Through OFF only) sets each slice's
 * thickness as a % of the row pitch:
 *   100  → the solid-slab renderer (slices share faces; smooth ruled surface
 *          between rows; corner risers culled by side-face facing).
 *   <100 → free-standing "cardboard" slices: the row profile extruded ±half
 *          the thickness along the stacking axis, real gaps between rows,
 *          classic per-slab edge culling + floating-horizon HLR.
 *   ~1   → projected thickness collapses below a pixel → each slice draws as
 *          a single flat closed curtain (no double-struck near-coincident
 *          face pairs, which would double-ink on a plotter).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Plane Width (Lines as Planes)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 800, height: 600 };
  const gen = (extra) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      {
        mode: 'lines', rows: 24, sampleDetail: 48, amplitude: 20, artworkSize: 150,
        smoothing: 0, rotate: -45, tilt: 60, horizontalLinesAsPlanes: true,
        baseHeight: 1, seeThrough: false, depthBias: 0.5, ...extra,
      },
      null,
      new V.SimpleNoise(7),
      bounds,
    );

  const totalLen = (paths) => paths.reduce((sum, p) => {
    if (!Array.isArray(p)) return sum;
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return sum + len;
  }, 0);

  test('default (100%) is byte-identical to the solid-slab renderer (back-compat)', () => {
    const implicit = gen({});
    const explicit = gen({ planeWidth: 100 });
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
    expect(implicit.length).toBeGreaterThan(0);
  });

  test('width < 100 changes the geometry (slices detach)', () => {
    const solid = gen({ planeWidth: 100 });
    const sliced = gen({ planeWidth: 40 });
    expect(sliced.length).toBeGreaterThan(0);
    expect(JSON.stringify(sliced)).not.toBe(JSON.stringify(solid));
    // Solid-only artifacts disappear: inter-row bridge edges only exist at 100%.
    expect(solid.some((p) => p.meta && p.meta.planeEdge)).toBe(true);
  });

  test('cardboard slices carry thickness: near+far tops and thickness facets', () => {
    const sliced = gen({ planeWidth: 60 });
    // Each slice draws a closed near-face outline (first == last point)…
    const closed = sliced.filter((p) => Array.isArray(p) && p.length >= 4
      && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6);
    expect(closed.length).toBeGreaterThan(0);
    // …and thickness facet edges (planeEdge bridges across the slab).
    expect(sliced.some((p) => p.meta && p.meta.planeEdge)).toBe(true);
    // The nearest slice is still tagged as the front wall.
    expect(sliced.some((p) => p.meta && p.meta.frontWall)).toBe(true);
  });

  test('narrower slices expose more of the planes behind (visible length grows)', () => {
    // Gaps reveal farther planes' faces that a solid slab hides, so the total
    // drawn length at a narrow width exceeds the solid's.
    const solid = totalLen(gen({ planeWidth: 100 }));
    const narrow = totalLen(gen({ planeWidth: 10 }));
    expect(narrow).toBeGreaterThan(solid);
  });

  test('1% collapses to single flat curtains — no near-coincident double lines', () => {
    const flat = gen({ planeWidth: 1 });
    expect(flat.length).toBeGreaterThan(0);
    // Flat mode: no thickness facets (planeEdge) — each slice is one curtain.
    expect(flat.every((p) => !(p.meta && p.meta.planeEdge))).toBe(true);
    // Closed curtain outlines exist (a plane keeps its side + bottom edges).
    const closed = flat.filter((p) => Array.isArray(p) && p.length >= 4
      && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6);
    expect(closed.length).toBeGreaterThan(0);
  });

  test('See-Through ON ignores planeWidth (wires-only path unchanged)', () => {
    const a = gen({ seeThrough: true });
    const b = gen({ seeThrough: true, planeWidth: 20 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
