/*
 * Raster-Plane — See-Through with Lines as Planes (RGR coverage).
 *
 * See-Through ON used to DELETE the planes: it fell back to the plain stacked-
 * wire branch, so the extrusion's vertical slices vanished and only the top
 * profiles were drawn. See-Through is a *hidden-line style*, not a geometry
 * switch — the slices must still be built, with the spans that other slices
 * occlude drawn as dashed (hidden) lines instead of removed.
 *
 * Contract (planes + See-Through ON), for both slab (planeWidth 100) and
 * free-standing cardboard (planeWidth < 100) slices:
 *   - the slice geometry exists: vertical risers / plane edges, not tops alone
 *   - occluded spans are emitted with meta.hiddenLine + meta.strokeDash
 *   - See-Through OFF still REMOVES them (no hiddenLine paths at all)
 *   - nothing is deleted: total drawn length ON > total drawn length OFF
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — See-Through + Lines as Planes', () => {
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
        baseHeight: 1, depthBias: 0, ...extra,
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
  const hidden = (paths) => paths.filter((p) => p.meta && p.meta.hiddenLine === true);
  // A slice's riser is a pure object-height edge, and with roll 0 the projection
  // maps object height onto screen Y alone — so a riser is EXACTLY screen-vertical.
  // Counting them is the geometry-level test for "the vertical slices are drawn",
  // independent of how the builder happens to package them into paths (the flat
  // collapse folds them into a closed curtain loop rather than tagging them).
  const risers = (paths) => paths.filter((p) => {
    if (!Array.isArray(p)) return false;
    for (let i = 1; i < p.length; i++) {
      if (Math.abs(p[i].x - p[i - 1].x) < 1e-6 && Math.abs(p[i].y - p[i - 1].y) > 0.5) return true;
    }
    return false;
  });

  describe.each([
    ['solid slab', 100],
    ['cardboard slices', 40],
    ['thin slices (flat collapse)', 1],
  ])('%s (planeWidth %i)', (_label, planeWidth) => {
    test('See-Through ON keeps the slices and dashes what is occluded', () => {
      const on = gen({ seeThrough: true, planeWidth });
      expect(on.length).toBeGreaterThan(0);

      // The slices survive: See-Through no longer collapses planes to bare tops.
      // Every path used to be a top profile — now the extrusion's vertical
      // geometry is present too.
      expect(risers(on).length).toBeGreaterThan(0);

      // Occluded spans are dashed, not deleted.
      const dashed = hidden(on);
      expect(dashed.length).toBeGreaterThan(0);
      expect(dashed.every((p) => Array.isArray(p.meta.strokeDash) && p.meta.strokeDash.length === 2)).toBe(true);
    });

    test('See-Through OFF still removes the hidden spans', () => {
      const off = gen({ seeThrough: false, planeWidth });
      expect(off.length).toBeGreaterThan(0);
      expect(hidden(off).length).toBe(0);
    });

    test('See-Through ON draws strictly more line than OFF (dashed, not dropped)', () => {
      const on = gen({ seeThrough: true, planeWidth });
      const off = gen({ seeThrough: false, planeWidth });
      expect(totalLen(on)).toBeGreaterThan(totalLen(off));
      // The visible (solid) portion is the same picture the HLR render produces:
      // See-Through only ADDS the hidden runs back in.
      const visibleOn = totalLen(on.filter((p) => !(p.meta && p.meta.hiddenLine)));
      expect(visibleOn).toBeGreaterThan(totalLen(off) * 0.5);
    });
  });

  test('planes + See-Through ON is not the plain stacked-wire render', () => {
    const planes = gen({ seeThrough: true, planeWidth: 100 });
    const wires = gen({ seeThrough: true, horizontalLinesAsPlanes: false });
    expect(JSON.stringify(planes)).not.toBe(JSON.stringify(wires));
    // Plain wires (no planes) stay a pure stacked wireframe: no occlusion at all.
    expect(hidden(wires).length).toBe(0);
    expect(risers(wires).length).toBe(0);
  });
});
