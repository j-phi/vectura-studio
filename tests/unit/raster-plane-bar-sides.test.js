/*
 * Raster-Plane — Bars polygonal footprints (`barSides`), per-cell rotation
 * (`barRotate`), and the See-Through OFF bottom-contact-line fix.
 *
 * RGR coverage for three features added to the bars algorithm:
 *   1. `barSides` (3–8) chooses the footprint polygon — triangles, the legacy
 *      square, pentagons, the pointy-top hex honeycomb, etc. sides=4 + barRotate=0
 *      keeps the byte-identical legacy fast-path; anything else routes through the
 *      new prism builder.
 *   2. `barRotate` (degrees) spins each footprint about its own centre.
 *   3. The exposed riser walls now emit a bottom edge tagged `meta.barContact`
 *      that joins the two riser bases, so walls no longer "vanish into" the
 *      surface (applies to both the legacy square path and the prism path).
 *
 * Each test is written so it would meaningfully fail if the feature regressed.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Bars polygonal footprints, rotation & contact line', () => {
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

  const allFinite = (paths) => paths.every((p) => p.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)));

  // Per cube, the count of distinct (rounded) endpoints touched by that cube's
  // VISIBLE 2-point `barTop` segments — i.e. the footprint polygon's vertex count.
  // We use See-Through ON (where top loops are split per-edge and tagged with
  // `cubeId` + `hiddenLine`) and a non-zero `barGap` so neighbouring footprints
  // never share/dedupe an edge into a single cube.
  const maxTopVertexCount = (paths) => {
    const byCube = new Map();
    for (const p of paths) {
      const m = p.meta;
      if (!m || !m.barTop || m.hiddenLine || p.length !== 2) continue;
      let set = byCube.get(m.cubeId);
      if (!set) byCube.set(m.cubeId, (set = new Set()));
      for (const pt of p) set.add(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
    }
    let max = 0;
    for (const set of byCube.values()) max = Math.max(max, set.size);
    return max;
  };

  test('default (barSides:4, barRotate:0) is byte-identical to omitting both — legacy fast-path preserved', () => {
    for (const st of [true, false]) {
      const base = JSON.stringify(gen({ seeThrough: st }));
      const explicit = JSON.stringify(gen({ seeThrough: st, barSides: 4, barRotate: 0 }));
      expect(explicit).toBe(base);
    }
  });

  test('barSides controls the top-polygon vertex count (4,6,3,5,8)', () => {
    const expected = { 4: 4, 6: 6, 3: 3, 5: 5, 8: 8 };
    for (const sides of Object.keys(expected).map(Number)) {
      const out = gen({ seeThrough: true, barSides: sides, barGap: 3, barRows: 8, barColumns: 8, amplitude: 40 });
      expect(maxTopVertexCount(out)).toBe(expected[sides]);
    }
  });

  test('See-Through OFF default 4-sided bars emit the bottom contact line (the wall-vanishing fix)', () => {
    const fixed = gen({ seeThrough: false, amplitude: 60, barHeightSteps: 3 });
    expect(fixed.some((p) => p.meta && p.meta.barContact)).toBe(true);
    // Non-regression: the plain legacy See-Through OFF render still draws risers.
    const legacy = gen({ seeThrough: false });
    expect(legacy.some((p) => p.meta && p.meta.barSide)).toBe(true);
  });

  test('See-Through OFF hexagons emit the bottom contact line and stay finite', () => {
    const out = gen({ seeThrough: false, barSides: 6, amplitude: 60 });
    expect(out.some((p) => p.meta && p.meta.barContact)).toBe(true);
    expect(allFinite(out)).toBe(true);
  });

  test('barRotate actually rotates the footprint, and barRotate:0 matches omitting it', () => {
    const unrotated = JSON.stringify(gen({ seeThrough: true, barSides: 6, barRotate: 0 }));
    const rotated = JSON.stringify(gen({ seeThrough: true, barSides: 6, barRotate: 30 }));
    const omitted = JSON.stringify(gen({ seeThrough: true, barSides: 6 }));
    expect(rotated).not.toBe(unrotated);
    expect(unrotated).toBe(omitted);
    expect(allFinite(gen({ seeThrough: true, barSides: 6, barRotate: 30 }))).toBe(true);
  });

  test('every side count 3..8 produces finite, non-empty geometry in both See-Through states', () => {
    for (let sides = 3; sides <= 8; sides++) {
      for (const st of [true, false]) {
        const out = gen({ seeThrough: st, barSides: sides, amplitude: 40 });
        expect(out.length).toBeGreaterThan(0);
        expect(allFinite(out)).toBe(true);
      }
    }
  });

  test('hexagons See-Through OFF render deterministically for a fixed seed', () => {
    const a = gen({ seeThrough: false, barSides: 6, amplitude: 50 }, 23);
    const b = gen({ seeThrough: false, barSides: 6, amplitude: 50 }, 23);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('a large barGap separates the tiling hexagons (changes geometry, stays finite)', () => {
    const tight = gen({ seeThrough: false, barSides: 6, barGap: 0 });
    const gapped = gen({ seeThrough: false, barSides: 6, barGap: 8 });
    expect(tight.length).toBeGreaterThan(0);
    expect(gapped.length).toBeGreaterThan(0);
    expect(allFinite(tight)).toBe(true);
    expect(allFinite(gapped)).toBe(true);
    // Gapped footprints shrink apart so the rendered geometry must differ.
    expect(JSON.stringify(gapped)).not.toBe(JSON.stringify(tight));
  });

  // Regression: the prism See-Through OFF walls must be wound so the CAMERA-FACING
  // (front) walls are the ones drawn. A reversed winding inverted the face normal, so
  // the back walls were drawn AND used as occluders — the front faces vanished and the
  // relief became see-through (not watertight). Discriminator: a riser attaches to a top
  // vertex; under positive tilt the camera-near vertices project LOWER (larger screen y)
  // than the top-face centroid. With correct winding the drawn risers attach to those
  // NEAR vertices, so their top endpoints average BELOW the top-face centroid; the
  // inverted winding attaches them to the far vertices (above the centroid). Asserted on
  // the inscribed-polygon counts (5, 6), which share the exact prism wall-winding code.
  test('See-Through OFF draws the front (camera-facing) walls of a column, not the back', () => {
    // Single raised column on an otherwise-flat grid; a gap makes every wall independent
    // so none are suppressed as shared — exactly the case where the inversion was visible.
    const grid = Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => (x === 3 && y === 3 ? 1 : 0)));
    const genCol = (sides) => V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'bars', barRows: 7, barColumns: 7, amplitude: 60, artworkSize: 150, smoothing: 0,
        rotate: -30, tilt: 55, barHeightSteps: 0, barGap: 4, seeThrough: false, barSides: sides, fixtureGrid: grid },
      null, new V.SimpleNoise(1), bounds);
    for (const sides of [5, 6]) {
      const out = genCol(sides);
      const topPts = out.filter((p) => p.meta && p.meta.barTop).flat();
      const risers = out.filter((p) => p.meta && p.meta.barSide && !p.meta.barContact);
      expect(topPts.length).toBeGreaterThan(0);
      expect(risers.length).toBeGreaterThan(0);
      const topFaceCy = topPts.reduce((s, q) => s + q.y, 0) / topPts.length;
      // Each riser's top endpoint is its higher (smaller-y) point.
      const riserTops = risers.map((p) => (p[0].y < p[1].y ? p[0] : p[1]));
      const riserTopCy = riserTops.reduce((s, q) => s + q.y, 0) / riserTops.length;
      expect(riserTopCy).toBeGreaterThan(topFaceCy); // near (front) vertices, not far (back)
    }
  });

  // The base rim must FRAME the art for non-square shapes: polygonal lattices over/under-
  // hang the artwork rect, so the floor rectangle is grown to the footprint bounding box
  // and the outermost sides/corners touch it on all four sides. Viewed near top-down with
  // a near-flat relief, every bar vertex must therefore lie within the floor-rim box.
  test('floor rim frames every footprint for non-square shapes (base grown to bbox)', () => {
    const bbox = (pts) => pts.reduce(
      (a, q) => ({ mnx: Math.min(a.mnx, q.x), mny: Math.min(a.mny, q.y), mxx: Math.max(a.mxx, q.x), mxy: Math.max(a.mxy, q.y) }),
      { mnx: Infinity, mny: Infinity, mxx: -Infinity, mxy: -Infinity });
    for (const sides of [6, 5, 3, 8]) {
      // Near top-down (high tilt) + near-flat relief so screen position ≈ footprint.
      const out = gen({ seeThrough: true, barSides: sides, amplitude: 2, tilt: 89, rotate: 0, showBarBase: true });
      const floor = out.filter((p) => p.meta && p.meta.barFloor).flat();
      const bars = out.filter((p) => !(p.meta && p.meta.barFloor)).flat();
      expect(floor.length).toBeGreaterThan(0);
      expect(bars.length).toBeGreaterThan(0);
      const f = bbox(floor);
      const b = bbox(bars);
      const eps = 1.0;
      expect(b.mnx).toBeGreaterThanOrEqual(f.mnx - eps);
      expect(b.mny).toBeGreaterThanOrEqual(f.mny - eps);
      expect(b.mxx).toBeLessThanOrEqual(f.mxx + eps);
      expect(b.mxy).toBeLessThanOrEqual(f.mxy + eps);
    }
  });
});
