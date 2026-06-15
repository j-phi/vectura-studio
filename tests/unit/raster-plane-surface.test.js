/*
 * Raster-Plane — surface controls (RGR coverage).
 *
 * Covers three controls that were broken or ambiguous:
 *   - Base Height (Lines as Planes): a constant lift added to every slice, so
 *     even flat regions extrude a minimum-height curtain. Raising it must grow
 *     the ribbons' vertical extent.
 *   - Map Blur (p.mapBlur): blurs the sampled height field before projection
 *     (topography). Renamed off `smoothing` so it no longer collides with the
 *     universal output Smoothing.
 *   - Smoothing (p.smoothing): the universal post-projection line smoothing now
 *     applies to rasterPlane like every other algorithm (it used to be zeroed
 *     by an `algorithmOwnsSmoothing` override AND collided with Map Blur's id).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — surface controls', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };
  const gen = (extra, seed = 13) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'lines', rows: 14, sampleDetail: 30, amplitude: 24, artworkSize: 150, smoothing: 0, ...extra },
      null,
      new V.SimpleNoise(seed),
      bounds,
    );

  const yRange = (paths) => {
    const ys = paths.flatMap((p) => p.map((pt) => pt.y));
    return Math.max(...ys) - Math.min(...ys);
  };

  test('Base Height lifts the curtain (Lines as Planes, See-Through OFF): taller extrusion', () => {
    // With See-Through OFF the relief draws the extruded curtain (top profile down to
    // the floor). Base Height lifts every top profile while the baseline stays on the
    // floor, so the curtain — and the projected vertical extent — must grow.
    const flat = gen({ horizontalLinesAsPlanes: true, seeThrough: false, baseHeight: 0 });
    const lifted = gen({ horizontalLinesAsPlanes: true, seeThrough: false, baseHeight: 0.6 });
    expect(flat.length).toBeGreaterThan(0);
    expect(lifted.length).toBeGreaterThan(0);
    expect(yRange(lifted)).toBeGreaterThan(yRange(flat) + 1);
    expect(JSON.stringify(lifted)).not.toBe(JSON.stringify(flat));
  });

  test('Base Height does nothing without Lines as Planes', () => {
    const a = gen({ horizontalLinesAsPlanes: false, baseHeight: 0 });
    const b = gen({ horizontalLinesAsPlanes: false, baseHeight: 0.6 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('Map Blur smooths the topography height field', () => {
    const sharp = gen({ mode: 'topography', columns: 16, sampleDetail: 48, contourSmoothing: 0, mapBlur: 0 });
    const blurred = gen({ mode: 'topography', columns: 16, sampleDetail: 48, contourSmoothing: 0, mapBlur: 80 });
    expect(sharp.length).toBeGreaterThan(0);
    expect(JSON.stringify(blurred)).not.toBe(JSON.stringify(sharp));
  });

  test('Map Blur reads p.mapBlur, and generate() ignores the legacy p.smoothing', () => {
    // The height-field blur moved off the `smoothing` id onto `mapBlur`. generate()
    // no longer reads p.smoothing at all (universal smoothing is an engine-level
    // post-projection pass), so blur via mapBlur must differ from "blur" via the
    // old id (which now does nothing inside the algorithm).
    const viaMapBlur = gen({ mode: 'topography', columns: 16, sampleDetail: 48, contourSmoothing: 0, mapBlur: 80, smoothing: 0 });
    const viaOldId = gen({ mode: 'topography', columns: 16, sampleDetail: 48, contourSmoothing: 0, mapBlur: 0, smoothing: 1 });
    expect(JSON.stringify(viaMapBlur)).not.toBe(JSON.stringify(viaOldId));
  });
});
