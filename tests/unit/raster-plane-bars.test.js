/*
 * Raster-Plane — Bars See-Through OFF solid heightmap (RGR coverage).
 *
 * Bars mode with See-Through OFF renders a clean isometric solid relief: every cell
 * draws its full top quad outline (so every tile reads as its own block — a watertight
 * gridded quilt), plus a camera-facing exposed riser at each height step. Every edge is
 * then clipped against the front walls of the bars in front of it (analytic hidden-line
 * removal). The wireframe failure modes are gone — no see-through, no fills.
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

  test('See-Through OFF: pure stroked edges, no fills, no dashed hidden lines', () => {
    const off = gen({ seeThrough: false });
    expect(off.length).toBeGreaterThan(0);
    expect(off.some((p) => p.meta && p.meta.occludeFill)).toBe(false);
    expect(off.some((p) => p.meta && p.meta.hiddenLine === true)).toBe(false);
  });

  test('See-Through OFF: all geometry is finite', () => {
    const off = gen({ seeThrough: false });
    for (const p of off) for (const pt of p) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  test('See-Through ON: keeps the full back lattice (more edges, has hidden dashes)', () => {
    const on = gen({ seeThrough: true });
    const off = gen({ seeThrough: false });
    expect(on.length).toBeGreaterThan(off.length);
    expect(on.some((p) => p.meta && p.meta.hiddenLine)).toBe(true);
  });

  test('is deterministic for a fixed seed (See-Through OFF)', () => {
    const a = gen({ seeThrough: false }, 17);
    const b = gen({ seeThrough: false }, 17);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('See-Through OFF: taller bars produce longer step risers', () => {
    // Risers run from a neighbour's height up to the cell top; raising the amplitude
    // lifts every step, so the total side-edge length grows with extrusion.
    const sideLen = (paths) => paths
      .filter((p) => p.meta && p.meta.barSide && p.length === 2)
      .reduce((sum, p) => sum + Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), 0);
    const low = sideLen(gen({ seeThrough: false, amplitude: 5 }));
    const tall = sideLen(gen({ seeThrough: false, amplitude: 80 }));
    expect(low).toBeGreaterThan(0);
    expect(tall).toBeGreaterThan(low * 1.3);
  });

  test('See-Through OFF: every tile is outlined (watertight quilt); steps add risers', () => {
    // A uniform plateau draws a full O(N^2) interior grid (every tile outlined, no
    // merge); a varied field adds exposed step risers on top of that grid, so it
    // emits even more edges.
    const N = 10;
    const run = (grid) => V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'bars', seeThrough: false, fixtureGrid: grid, barRows: N, barColumns: N, barGap: 0, amplitude: 40, barHeightSteps: 8 },
      null, null, bounds,
    );
    const flat = Array.from({ length: N }, () => new Array(N).fill(0.6));
    let s = 1; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const noisy = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd()));
    expect(run(flat).length).toBeGreaterThan(N * N); // full interior grid, not merged
    expect(run(noisy).length).toBeGreaterThan(run(flat).length);
  });

  test('Corner Radius rounds bar footprints into many-edge outlines; radius 0 is identity', () => {
    const N = 6;
    const grid = Array.from({ length: N }, () => new Array(N).fill(0.7));
    const run = (extra) => V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'bars', fixtureGrid: grid, barRows: N, barColumns: N, barGap: 0.5, amplitude: 40, barHeightSteps: 4, ...extra },
      null, null, bounds,
    );
    const topEdges = (ps) => ps.filter((p) => p.meta && p.meta.barTop).length;
    const sharp = run({ seeThrough: true, barCornerRadius: 0 });
    const rounded = run({ seeThrough: true, barCornerRadius: 70 });
    // Fillet arcs replace each sharp corner with several short edges.
    expect(topEdges(rounded)).toBeGreaterThan(topEdges(sharp) * 2);
    // Radius 0 is byte-identical to omitting the control (legacy fast-path untouched).
    expect(JSON.stringify(run({ seeThrough: true })))
      .toBe(JSON.stringify(run({ seeThrough: true, barCornerRadius: 0 })));
    // Rounded geometry stays finite through the See-Through OFF hidden-line path too.
    const off = run({ seeThrough: false, barCornerRadius: 70 });
    for (const p of off) for (const pt of p) expect(Number.isFinite(pt.x) && Number.isFinite(pt.y)).toBe(true);
  });

  test('See-Through OFF: a raised block draws its riser at the camera-near (front) corner', () => {
    // Regression — the wall faceVisible winding once produced an inward normal, so it
    // selected the hidden BACK walls: risers landed on far corners (and occluders were
    // built from walls that occlude nothing → see-through). A single raised cube must
    // show a vertical riser meeting its NEAREST (max screen-y) top corner.
    const N = 5;
    const grid = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => ((x === 2 && y === 2) ? 1 : 0)));
    const out = gen({ seeThrough: false, fixtureGrid: grid, barRows: N, barColumns: N, amplitude: 50, showBarBase: false, barHeightSteps: 0 });
    const sides = out.filter((p) => p.meta && p.meta.barSide && p.length === 2);
    const topPts = out.filter((p) => p.meta && p.meta.barTop && p.length === 2).flatMap((p) => [p[0], p[1]]);
    expect(sides.length).toBeGreaterThan(0);
    expect(topPts.length).toBeGreaterThan(0);
    const nearestY = Math.max(...topPts.map((q) => q.y));
    const nearest = topPts.find((q) => q.y === nearestY);
    const touchesFront = sides.some((p) => [p[0], p[1]].some((q) => Math.hypot(q.x - nearest.x, q.y - nearest.y) < 1e-6));
    expect(touchesFront).toBe(true);
  });
});
