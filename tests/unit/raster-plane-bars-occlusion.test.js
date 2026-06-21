/*
 * Raster-Plane — solid bar heightmap (See-Through OFF) RGR coverage.
 *
 * With See-Through OFF the bars render as a clean isometric solid relief using
 * analytic hidden-line removal:
 *   - every cell draws its full top quad outline, so every tile reads as its own
 *     block — a watertight gridded quilt (NOT a merged plateau), plus an exposed
 *     riser at each camera-facing step where a neighbour is shorter,
 *   - the camera-facing (front) walls are the opaque occluders; every edge is clipped
 *     against the bars in front of it, so hidden segments are removed (no see-through),
 *   - the output is pure stroked vector segments — no fills, no dashed hidden lines,
 *   - See-Through ON stays the transparent wireframe,
 *   - generation is deterministic.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — solid bar heightmap', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };
  const base = { mode: 'bars', rotate: -30, tilt: 34, amplitude: 40, artworkSize: 150, barRows: 14, barColumns: 14, barHeightSteps: 6, barGap: 0, smoothing: 0 };
  const gen = (extra) => V.AlgorithmRegistry.rasterPlane.generate({ ...base, ...extra }, null, new V.SimpleNoise(9), bounds);

  test('See-Through OFF renders pure stroked edges — no fills, no dashed hidden lines', () => {
    const off = gen({ seeThrough: false });
    expect(off.length).toBeGreaterThan(0);
    expect(off.some((p) => p.meta && p.meta.occludeFill)).toBe(false);
    expect(off.some((p) => p.meta && p.meta.hiddenLine)).toBe(false);
    for (const p of off) for (const pt of p) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  test('Hidden-line removal: OFF draws strictly fewer edges than the wireframe', () => {
    const on = gen({ seeThrough: true });
    const off = gen({ seeThrough: false });
    expect(on.length).toBeGreaterThan(0);
    expect(off.length).toBeLessThan(on.length);
    expect(on.some((p) => p.meta && p.meta.hiddenLine)).toBe(true);
    expect(on.some((p) => p.meta && p.meta.occludeFill)).toBe(false);
  });

  test('A flat plateau still outlines every tile (watertight quilt, full interior grid)', () => {
    // Uniform field → one flat top, but every tile is outlined (no merge), so the
    // output is a full O(N^2) interior grid — not just the boundary cliff. (Equal-
    // height neighbours share the grid edge; it is de-duped so each line is drawn
    // once, and with no height steps there are no interior risers.)
    const N = 10;
    const flat = Array.from({ length: N }, () => new Array(N).fill(0.6));
    const out = gen({ seeThrough: false, fixtureGrid: flat, barRows: N, barColumns: N });
    // A drawn interior grid is O(N^2); a merged plateau would be only ~perimeter.
    expect(out.length).toBeGreaterThan(N * N);
    // Those are top-grid edges (every tile outlined); only the outer cliff adds risers.
    expect(out.filter((p) => p.meta && p.meta.barTop).length).toBeGreaterThan(N * N);
  });

  test('A smooth gradient yields a clean terraced relief', () => {
    const N = 16;
    const dome = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => {
      const dx = x / (N - 1) - 0.5, dy = y / (N - 1) - 0.5;
      return Math.max(0, 1 - Math.hypot(dx, dy) * 1.7);
    }));
    const out = gen({ seeThrough: false, fixtureGrid: dome, barRows: N, barColumns: N, amplitude: 45 });
    expect(out.length).toBeGreaterThan(40);
    expect(out.every((p) => p.length === 2 || p.meta?.hatch)).toBe(true);
  });

  test('Solid heightmap output is deterministic', () => {
    const a = gen({ seeThrough: false });
    const b = gen({ seeThrough: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
