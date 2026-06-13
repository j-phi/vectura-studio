/*
 * Image Surface — noise rack stack (RGR coverage).
 *
 * Red-green proof for folding the universal Noise Rack stack into the
 * imageSurface height field:
 *   - With no enabled noise layers (or noiseAmount 0) the geometry is byte-for-
 *     byte identical to the plain source — the feature is opt-in and inert by
 *     default (guards the existing presets/baselines).
 *   - An enabled stack with noiseAmount > 0 displaces the surface, so the
 *     geometry diverges from the no-noise output — the visible 3D noise.
 *   - Output is deterministic for a fixed seed and the three combine modes
 *     (add / multiply / replace) each produce distinct geometry.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Image Surface — noise rack stack', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  beforeEach(() => {
    V.NOISE_IMAGES = {};
  });

  const bounds = { width: 400, height: 400 };
  const base = { mode: 'lines', rows: 12, sampleDetail: 28, smoothing: 0 };
  const layer = () => ({
    enabled: true,
    type: 'simplex',
    blend: 'add',
    amplitude: 1,
    zoom: 0.02,
    octaves: 3,
    lacunarity: 2,
    gain: 0.5,
  });
  const gen = (extra, seed = 7) =>
    V.AlgorithmRegistry.imageSurface.generate({ ...base, ...extra }, null, new V.SimpleNoise(seed), bounds);

  test('an empty / disabled stack leaves the surface unchanged', () => {
    const plain = gen({});
    const emptyStack = gen({ noises: [], noiseAmount: 1, noiseMode: 'add' });
    const disabled = gen({ noises: [{ ...layer(), enabled: false }], noiseAmount: 1, noiseMode: 'add' });
    expect(JSON.stringify(emptyStack)).toBe(JSON.stringify(plain));
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(plain));
  });

  test('noiseAmount 0 is inert even with an enabled stack', () => {
    const plain = gen({});
    const zeroAmount = gen({ noises: [layer()], noiseAmount: 0, noiseMode: 'add' });
    expect(JSON.stringify(zeroAmount)).toBe(JSON.stringify(plain));
  });

  test('an enabled stack with amount > 0 displaces the surface', () => {
    const plain = gen({});
    const noisy = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'add' });
    expect(noisy.length).toBeGreaterThan(0);
    expect(JSON.stringify(noisy)).not.toBe(JSON.stringify(plain));
  });

  test('is deterministic for a fixed seed', () => {
    const a = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'replace' }, 11);
    const b = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'replace' }, 11);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('the three combine modes each produce distinct geometry', () => {
    const add = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'add' });
    const multiply = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'multiply' });
    const replace = gen({ noises: [layer()], noiseAmount: 0.8, noiseMode: 'replace' });
    expect(JSON.stringify(add)).not.toBe(JSON.stringify(multiply));
    expect(JSON.stringify(add)).not.toBe(JSON.stringify(replace));
    expect(JSON.stringify(multiply)).not.toBe(JSON.stringify(replace));
  });

  test('renderPreviewRaster reflects the noise stack (preview tracks the model)', () => {
    const src = V.ImageSurfaceSource;
    expect(typeof src.renderPreviewRaster).toBe('function');
    const plain = src.renderPreviewRaster({ seed: 5 }, 24, 24);
    const noisy = src.renderPreviewRaster(
      { seed: 5, noises: [layer()], noiseAmount: 0.9, noiseMode: 'replace' },
      24,
      24,
    );
    expect(plain.width).toBe(24);
    expect(plain.data.length).toBe(24 * 24 * 4);
    // Same base source, but the noise stack changes the rendered height raster.
    expect(Array.from(noisy.data)).not.toEqual(Array.from(plain.data));
    // Deterministic for identical params.
    const again = src.renderPreviewRaster(
      { seed: 5, noises: [layer()], noiseAmount: 0.9, noiseMode: 'replace' },
      24,
      24,
    );
    expect(Array.from(again.data)).toEqual(Array.from(noisy.data));
  });

  test('replace mode renders pure noise terrain even with no image source', () => {
    // No imageNoiseDef / imageSrc: base resolves to the built-in relief, but at
    // amount 1 the noise fully takes over, so the result must differ from the
    // relief-only surface and carry real vertical variation.
    const relief = gen({});
    const terrain = gen({ noises: [layer()], noiseAmount: 1, noiseMode: 'replace' });
    expect(JSON.stringify(terrain)).not.toBe(JSON.stringify(relief));
    const ys = terrain.flatMap((path) => path.map((pt) => pt.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
  });

  test('a polygon layer Tile Mode tiles the surface (was ignored before)', () => {
    const poly = (tileMode) => ({
      enabled: true,
      type: 'polygon',
      blend: 'add',
      amplitude: 1,
      zoom: 0.02,
      freq: 1,
      polygonSides: 6,
      polygonRadius: 2,
      polygonZoomReference: 0.02,
      tileMode,
    });
    const off = gen({ noises: [poly('off')], noiseAmount: 1, noiseMode: 'replace' });
    const tiled = gen({ noises: [poly('grid')], noiseAmount: 1, noiseMode: 'replace' });
    // Before the fix, tileMode was dropped on the floor, so 'off' and 'grid'
    // produced identical geometry. They must now differ.
    expect(JSON.stringify(tiled)).not.toBe(JSON.stringify(off));
    // And tiling stays deterministic.
    const tiled2 = gen({ noises: [poly('grid')], noiseAmount: 1, noiseMode: 'replace' });
    expect(JSON.stringify(tiled2)).toBe(JSON.stringify(tiled));
  });

  test('an image-type noise layer maps the raster across the whole surface', () => {
    // Regression: a left-black / right-white split image used as an image-noise
    // layer (default tileMode 'off') must displace the LEFT half of the surface
    // differently from the RIGHT half. Before the fix, the image was sampled in
    // world*zoom space and clamped into a single corner pixel, so the entire
    // surface read one constant value — the image noise did nothing visible.
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = x < w / 2 ? 0 : 255; // left half black, right half white
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    V.NOISE_IMAGES = { split: { width: w, height: h, data } };

    const imageLayer = () => ({
      enabled: true,
      type: 'image',
      blend: 'add',
      amplitude: 1,
      zoom: 0.02,
      freq: 1,
      octaves: 3,
      tileMode: 'off',
      imageId: 'split',
      noiseStyle: 'linear',
      imageAlgo: 'luma',
      imageEffects: [{ id: 'e', enabled: true, mode: 'luma' }],
    });

    const src = V.ImageSurfaceSource;
    const W = 32;
    const raster = src.renderPreviewRaster(
      { seed: 5, noises: [imageLayer()], noiseAmount: 1, noiseMode: 'replace' },
      W,
      W,
    );
    const colAvg = (xStart, xEnd) => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < W; y++) {
        for (let x = xStart; x < xEnd; x++) {
          sum += raster.data[(y * W + x) * 4];
          count += 1;
        }
      }
      return sum / count;
    };
    const leftAvg = colAvg(0, Math.floor(W / 4));
    const rightAvg = colAvg(Math.floor((3 * W) / 4), W);
    // The black left half must read meaningfully darker than the white right
    // half — proof the image spans the surface instead of collapsing to a pixel.
    expect(rightAvg - leftAvg).toBeGreaterThan(40);
  });

  test('a polygon shape ignores FBM octaves (no concentric ghost polygons)', () => {
    // A polygon is a geometric SDF, not fractal noise — octaves must not stack
    // scaled copies of it. Before the fix, sampleScalar FBM summed the hexagon
    // at 1x/2x/4x frequency, producing concentric ghost polygons; now polygon
    // takes a single-octave evaluate, so octave count can't change the shape.
    const poly = (octaves) => ({
      enabled: true,
      type: 'polygon',
      blend: 'add',
      amplitude: 1,
      zoom: 0.02,
      freq: 1,
      octaves,
      polygonSides: 6,
      polygonRadius: 3,
      polygonZoomReference: 0.02,
      tileMode: 'off',
    });
    const one = gen({ noises: [poly(1)], noiseAmount: 1, noiseMode: 'replace' });
    const four = gen({ noises: [poly(4)], noiseAmount: 1, noiseMode: 'replace' });
    expect(JSON.stringify(four)).toBe(JSON.stringify(one));
  });
});
