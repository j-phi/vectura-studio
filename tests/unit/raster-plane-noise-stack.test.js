/*
 * Raster-Plane — noise rack stack (RGR coverage).
 *
 * Red-green proof for the redesigned surface-noise model. The global Noise Mode
 * + Noise Amount were removed; each noise layer's own Blend Mode and Field
 * Weight (amplitude) now fully drive how it embosses the height field:
 *   - With no enabled noise layers the geometry is byte-for-byte identical to the
 *     plain source — the feature is opt-in and inert by default.
 *   - A layer at Field Weight 0 contributes nothing.
 *   - Field Weight scales the displacement magnitude (the slider used to be dead
 *     because the field was normalized by the summed amplitude).
 *   - Per-layer Blend Mode changes how stacked layers combine.
 *   - Noise Offset X is intuitive: dragging it right slides the pattern right.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — noise rack stack', () => {
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
  const layer = (extra = {}) => ({
    enabled: true,
    type: 'simplex',
    blend: 'add',
    amplitude: 1,
    zoom: 0.02,
    octaves: 3,
    lacunarity: 2,
    gain: 0.5,
    ...extra,
  });
  const gen = (extra, seed = 7) =>
    V.AlgorithmRegistry.rasterPlane.generate({ ...base, ...extra }, null, new V.SimpleNoise(seed), bounds);

  // A flat mid-gray base source, so the noise stack is the ONLY thing shaping the
  // height raster (isolates noise behavior from the procedural built-in relief).
  const flatGray = () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 128; data[i + 3] = 255; }
    return { width: 4, height: 4, data };
  };

  test('an empty / disabled stack leaves the surface unchanged', () => {
    const plain = gen({});
    const emptyStack = gen({ noises: [] });
    const disabled = gen({ noises: [layer({ enabled: false })] });
    expect(JSON.stringify(emptyStack)).toBe(JSON.stringify(plain));
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(plain));
  });

  test('a layer at Field Weight 0 is inert', () => {
    const plain = gen({});
    const zeroWeight = gen({ noises: [layer({ amplitude: 0 })] });
    expect(JSON.stringify(zeroWeight)).toBe(JSON.stringify(plain));
  });

  test('an enabled layer with Field Weight > 0 displaces the surface', () => {
    const plain = gen({});
    const noisy = gen({ noises: [layer({ amplitude: 1 })] });
    expect(noisy.length).toBeGreaterThan(0);
    expect(JSON.stringify(noisy)).not.toBe(JSON.stringify(plain));
  });

  test('Field Weight drives displacement magnitude (was a dead slider)', () => {
    // The raster height range must grow with Field Weight. Before the fix the
    // field was divided by the summed amplitude, so a single layer's absolute
    // weight cancelled out and the slider did nothing visible.
    const range = (amp) => {
      const r = V.RasterPlaneSource.renderPreviewRaster(
        { seed: 9, imageData: flatGray(), noises: [layer({ amplitude: amp, zoom: 0.01 })] }, 40, 40);
      const vals = Array.from(r.data).filter((_, i) => i % 4 === 0);
      return Math.max(...vals) - Math.min(...vals);
    };
    const low = range(0.4);
    const high = range(1.6);
    expect(high).toBeGreaterThan(low + 5);
  });

  test('per-layer Blend Mode changes how stacked layers combine', () => {
    const a = layer({ amplitude: 1, zoom: 0.02 });
    const b = layer({ amplitude: 1, zoom: 0.05, blend: 'add' });
    const bSub = layer({ amplitude: 1, zoom: 0.05, blend: 'subtract' });
    const added = gen({ noises: [a, b] });
    const subtracted = gen({ noises: [a, bSub] });
    expect(JSON.stringify(added)).not.toBe(JSON.stringify(subtracted));
  });

  test('is deterministic for a fixed seed', () => {
    const x = gen({ noises: [layer()] }, 11);
    const y = gen({ noises: [layer()] }, 11);
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
  });

  test('Noise Offset X slides the pattern to the right (drag right → noise right)', () => {
    // Flat base + one low-freq simplex layer; render a wide strip and reduce to a
    // 1-D column profile. Find the integer pixel shift k that best aligns the
    // offset render to the zero-offset render (offset[x] ≈ base[x - k]). A
    // positive k means the feature moved RIGHT — the intuitive direction.
    const W = 64;
    const H = 8;
    const profile = (shiftX) => {
      const r = V.RasterPlaneSource.renderPreviewRaster(
        { seed: 3, imageData: flatGray(), noises: [layer({ amplitude: 1, zoom: 0.01, octaves: 1, shiftX })] }, W, H);
      const col = [];
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = 0; y < H; y++) s += r.data[(y * W + x) * 4];
        col.push(s / H);
      }
      return col;
    };
    const a = profile(0);
    const b = profile(3); // +Offset X
    let bestK = 0;
    let bestErr = Infinity;
    for (let k = -30; k <= 30; k++) {
      let err = 0;
      let n = 0;
      for (let x = 0; x < W; x++) {
        const xs = x - k;
        if (xs < 0 || xs >= W) continue;
        err += Math.abs(b[x] - a[xs]);
        n++;
      }
      err /= n || 1;
      if (err < bestErr) { bestErr = err; bestK = k; }
    }
    expect(bestK).toBeGreaterThan(0);
  });

  test('renderPreviewRaster reflects the noise stack (preview tracks the model)', () => {
    const src = V.RasterPlaneSource;
    expect(typeof src.renderPreviewRaster).toBe('function');
    const plain = src.renderPreviewRaster({ seed: 5 }, 24, 24);
    const noisy = src.renderPreviewRaster({ seed: 5, noises: [layer({ amplitude: 1.5 })] }, 24, 24);
    expect(plain.width).toBe(24);
    expect(plain.data.length).toBe(24 * 24 * 4);
    expect(Array.from(noisy.data)).not.toEqual(Array.from(plain.data));
    const again = src.renderPreviewRaster({ seed: 5, noises: [layer({ amplitude: 1.5 })] }, 24, 24);
    expect(Array.from(again.data)).toEqual(Array.from(noisy.data));
  });

  test('a high Field Weight layer produces real vertical variation', () => {
    const relief = gen({});
    const terrain = gen({ noises: [layer({ amplitude: 1.5 })] });
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
    const off = gen({ noises: [poly('off')] });
    const tiled = gen({ noises: [poly('grid')] });
    expect(JSON.stringify(tiled)).not.toBe(JSON.stringify(off));
    const tiled2 = gen({ noises: [poly('grid')] });
    expect(JSON.stringify(tiled2)).toBe(JSON.stringify(tiled));
  });

  test('an image-type noise layer maps the raster across the whole surface', () => {
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
      amplitude: 1.5,
      zoom: 0.02,
      freq: 1,
      octaves: 3,
      tileMode: 'off',
      imageId: 'split',
      noiseStyle: 'linear',
      imageAlgo: 'luma',
      imageEffects: [{ id: 'e', enabled: true, mode: 'luma' }],
    });

    const src = V.RasterPlaneSource;
    const W = 32;
    const raster = src.renderPreviewRaster({ seed: 5, imageData: flatGray(), noises: [imageLayer()] }, W, W);
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
    expect(rightAvg - leftAvg).toBeGreaterThan(20);
  });

  test('a polygon shape ignores FBM octaves (no concentric ghost polygons)', () => {
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
    const one = gen({ noises: [poly(1)] });
    const four = gen({ noises: [poly(4)] });
    expect(JSON.stringify(four)).toBe(JSON.stringify(one));
  });
});
