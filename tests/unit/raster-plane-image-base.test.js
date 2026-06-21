/*
 * Raster-Plane — "Image" base layer controls (RGR coverage).
 *
 * The raster-plane base heightfield is a `type:'imageSource'` rack entry. v1.1.139
 * gave that card the full Image control set (Noise Style, Invert Color/Opacity,
 * Noise Width/Height, Micro Freq, Noise Threshold, Image Effects) and wired them
 * to the base height via the shared NoiseRack image pipeline.
 *
 * Red-green proof:
 *   - With every Image control at its default the base is byte-for-byte the raw
 *     raster sample (the feature is opt-in / inert — gating preserves baselines).
 *   - Invert / Threshold / an Image Effect each change the resolved surface.
 * Plus a direct unit test of the extracted `NoiseRack.createImageLumaSampler`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Image base layer controls', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // 16×16 raster: left half black, right half white.
  const split = () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = x < w / 2 ? 0 : 255;
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data };
  };

  // 16×16 raster: smooth horizontal gradient (has mid-tones, so tone reshapers
  // like Noise Threshold have something to bite on).
  const gradient = () => {
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = Math.round((x / (w - 1)) * 255);
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data };
  };

  beforeEach(() => {
    V.NOISE_IMAGES = { pic: split(), grad: gradient() };
  });

  // ---- NoiseRack.createImageLumaSampler (the extracted pipeline) -------------

  test('createImageLumaSampler is exposed and reads the raster luminance', () => {
    expect(typeof V.NoiseRack.createImageLumaSampler).toBe('function');
    const lumAt = V.NoiseRack.createImageLumaSampler({ imageId: 'pic', tileMode: 'off' });
    expect(typeof lumAt).toBe('function');
    expect(lumAt(0.1, 0.5)).toBeCloseTo(0, 5); // left half → black
    expect(lumAt(0.9, 0.5)).toBeCloseTo(1, 5); // right half → white
  });

  test('createImageLumaSampler honors Invert Color and Image Effects', () => {
    const inverted = V.NoiseRack.createImageLumaSampler({ imageId: 'pic', tileMode: 'off', imageInvertColor: true });
    expect(inverted(0.1, 0.5)).toBeCloseTo(1, 5);
    expect(inverted(0.9, 0.5)).toBeCloseTo(0, 5);

    const withEffect = V.NoiseRack.createImageLumaSampler({
      imageId: 'pic', tileMode: 'off', imageEffects: [{ id: 'e', enabled: true, mode: 'invert' }],
    });
    expect(withEffect(0.1, 0.5)).toBeCloseTo(1, 5);
  });

  test('returns null when the raster is missing (caller keeps its fallback)', () => {
    expect(V.NoiseRack.createImageLumaSampler({ imageId: 'nope', tileMode: 'off' })).toBeNull();
    expect(V.NoiseRack.createImageLumaSampler({ tileMode: 'off' })).toBeNull();
  });

  // ---- Raster-plane base heightfield ----------------------------------------

  const imageSourceLayer = (extra = {}) => ({ enabled: true, type: 'imageSource', ...extra });
  const render = (noises) =>
    V.RasterPlaneSource.renderPreviewRaster({ seed: 5, imageId: 'pic', noises }, 24, 24);
  const rasterEq = (a, b) => JSON.stringify(Array.from(a.data)) === JSON.stringify(Array.from(b.data));
  const leftAvg = (r) => {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < Math.floor(r.width / 4); x++) {
        sum += r.data[(y * r.width + x) * 4];
        count += 1;
      }
    }
    return sum / count;
  };

  test('default Image controls leave the base identical to the raw raster (gating)', () => {
    const raw = render(undefined); // no imageSource entry → raw p.imageId path
    const defaults = render([imageSourceLayer()]); // entry present, every control default
    expect(rasterEq(raw, defaults)).toBe(true);
  });

  test('Invert Color flips the base surface (left black → white)', () => {
    const plain = render([imageSourceLayer()]);
    const inverted = render([imageSourceLayer({ imageInvertColor: true })]);
    expect(rasterEq(plain, inverted)).toBe(false);
    expect(leftAvg(inverted)).toBeGreaterThan(leftAvg(plain) + 50);
  });

  test('Noise Threshold reshapes the base surface', () => {
    // Use the gradient raster — threshold reshapes mid-tones, which a pure
    // black/white split has none of.
    const renderGrad = (noises) =>
      V.RasterPlaneSource.renderPreviewRaster({ seed: 5, imageId: 'grad', noises }, 24, 24);
    const plain = renderGrad([imageSourceLayer()]);
    const thresholded = renderGrad([imageSourceLayer({ noiseThreshold: 0.5 })]);
    expect(rasterEq(plain, thresholded)).toBe(false);
  });

  test('an Image Effect reshapes the base surface', () => {
    const plain = render([imageSourceLayer()]);
    const edged = render([imageSourceLayer({ imageEffects: [{ id: 'e', enabled: true, mode: 'edge' }] })]);
    expect(rasterEq(plain, edged)).toBe(false);
  });

  test('the Image base is deterministic for fixed inputs', () => {
    const a = render([imageSourceLayer({ imageInvertColor: true, noiseThreshold: 0.3 })]);
    const b = render([imageSourceLayer({ imageInvertColor: true, noiseThreshold: 0.3 })]);
    expect(rasterEq(a, b)).toBe(true);
  });

  // ---- Full control set, incl. the default built-in-relief source ------------
  // The default Raster-Plane source is the built-in procedural relief, which has
  // NO NOISE_IMAGES raster — the controls used to be silently inert there. These
  // pin that the materialized-relief path makes every control actually work.

  // Built-in relief base (no imageId), the real default a fresh layer uses.
  const renderRelief = (noises) =>
    V.RasterPlaneSource.renderPreviewRaster({ seed: 5, noises }, 28, 28);

  test('Field Weight does NOT reshape the [0,1] preview heightfield (it scales 3D relief)', () => {
    // Field Weight (the Image base layer amplitude) now scales the 3D relief
    // amplitude — exactly like the top-level Amplitude control — instead of
    // contrast-stretching the normalized heightfield (which saturated the surface
    // to a binary mask when dialed up). The preview mirrors the [0,1] heightfield
    // the sampler produces, so amplitude leaves it untouched. The dial-up relief
    // behavior is covered in raster-plane-surface.test.js.
    const plain = renderRelief([imageSourceLayer()]);
    const flat = renderRelief([imageSourceLayer({ amplitude: 0 })]);
    const loud = renderRelief([imageSourceLayer({ amplitude: 8 })]);
    expect(rasterEq(plain, flat)).toBe(true);
    expect(rasterEq(plain, loud)).toBe(true);
  });

  test('Noise Scale (zoom) reshapes the built-in relief base', () => {
    const plain = renderRelief([imageSourceLayer()]);
    const zoomed = renderRelief([imageSourceLayer({ zoom: 3 })]);
    expect(rasterEq(plain, zoomed)).toBe(false);
  });

  test('Frequency reshapes the built-in relief base', () => {
    const plain = renderRelief([imageSourceLayer()]);
    const freqd = renderRelief([imageSourceLayer({ freq: 3 })]);
    expect(rasterEq(plain, freqd)).toBe(false);
  });

  test('Noise Angle and Offset reposition the base (split raster, has orientation)', () => {
    // Compare two pipeline-active renders that differ ONLY in angle / offset, so
    // the difference isn't merely the raw-vs-pipeline path switch.
    const angleA = render([imageSourceLayer({ angle: 30 })]);
    const angleB = render([imageSourceLayer({ angle: 120 })]);
    expect(rasterEq(angleA, angleB)).toBe(false);
    const offA = render([imageSourceLayer({ shiftX: 0.1 })]);
    const offB = render([imageSourceLayer({ shiftX: 0.4 })]);
    expect(rasterEq(offA, offB)).toBe(false);
  });
});
