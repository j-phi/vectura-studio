/*
 * Raster-Plane — Map Blur reaches every mode (sampler-level blur) RGR coverage.
 *
 * mapBlur used to blur the height field only inside buildField, which only
 * topography calls — lines/mesh/bars sampled the raw raster nearest-neighbour,
 * so a hard luminance step (checkerboard) produced jagged square-wave profiles
 * no matter the Map Blur setting. The blur now lives in createSampler, wrapping
 * the raw base-value lookup BEFORE the tone pipeline, so every mode smooths.
 *
 * Fixture: 16×16 alternating 0/1 checkerboard — the worst case for an
 * unsmoothed nearest-neighbour sample.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Map Blur applies in every mode', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 800, height: 600 };
  const checker = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => ((x + y) % 2 ? 1 : 0)));
  const base = {
    mode: 'lines', rows: 30, sampleDetail: 120, amplitude: 20, artworkSize: 150,
    smoothing: 0, rotate: -45, tilt: 60, seeThrough: true, fixtureGrid: checker,
  };
  const gen = (extra) =>
    V.AlgorithmRegistry.rasterPlane.generate({ ...base, ...extra }, null, new V.SimpleNoise(7), bounds);

  // Mean second difference of screen y across each path's interior points:
  // a square-wave profile scores high, a smoothed profile low.
  const jaggedness = (paths) => {
    let sum = 0;
    let n = 0;
    paths.forEach((p) => {
      if (!Array.isArray(p) || p.length < 3) return;
      for (let i = 1; i < p.length - 1; i++) {
        sum += Math.abs(p[i + 1].y - 2 * p[i].y + p[i - 1].y);
        n++;
      }
    });
    return n ? sum / n : 0;
  };

  test('A: lines mode — mapBlur 60 changes the output', () => {
    const sharp = gen({ mapBlur: 0 });
    const blurred = gen({ mapBlur: 60 });
    expect(blurred.length).toBeGreaterThan(0);
    expect(JSON.stringify(blurred)).not.toBe(JSON.stringify(sharp));
  });

  test('B: lines mode — mapBlur 60 cuts second-difference jaggedness below 60%', () => {
    const jag0 = jaggedness(gen({ mapBlur: 0 }));
    const jag60 = jaggedness(gen({ mapBlur: 60 }));
    expect(jag0).toBeGreaterThan(0);
    expect(jag60).toBeLessThan(jag0 * 0.6);
  });

  test('C: identity guard — mapBlur 0 is byte-identical to mapBlur undefined', () => {
    const explicit = gen({ mapBlur: 0 });
    const implicit = gen({});
    expect(explicit.length).toBeGreaterThan(0);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
  });

  test('D: mesh mode — mapBlur 60 changes the output', () => {
    const sharp = gen({ mode: 'mesh', mapBlur: 0 });
    const blurred = gen({ mode: 'mesh', mapBlur: 60 });
    expect(blurred.length).toBeGreaterThan(0);
    expect(JSON.stringify(blurred)).not.toBe(JSON.stringify(sharp));
  });
});
