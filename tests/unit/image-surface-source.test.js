/*
 * Image Surface source pipeline — RGR coverage (v1.1.97).
 *
 * These assertions are the red-green proof for the new height-source layer:
 *   - NoiseImageRender renders a Noise Rack descriptor to a deterministic
 *     grayscale raster (pure; no canvas).
 *   - ImageSurfaceSource.ensure populates NOISE_IMAGES from a noise descriptor
 *     and is cached/idempotent.
 *   - imageSurface.generate samples that source — a noise source yields
 *     different geometry than the built-in relief (without the ensure wiring,
 *     `imageNoiseDef` was ignored and the two outputs were identical).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Image Surface — source pipeline', () => {
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

  describe('NoiseImageRender.renderImageData', () => {
    test('exposes the render API', () => {
      expect(V.NoiseImageRender).toBeTruthy();
      expect(typeof V.NoiseImageRender.renderImageData).toBe('function');
    });

    test('produces an RGBA raster of the requested size with opaque alpha', () => {
      const img = V.NoiseImageRender.renderImageData({ type: 'simplex', zoom: 0.05 }, 16, 16, 1);
      expect(img.width).toBe(16);
      expect(img.height).toBe(16);
      expect(img.data.length).toBe(16 * 16 * 4);
      for (let i = 0; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(img.data[i + 1]); // grayscale
        expect(img.data[i + 1]).toBe(img.data[i + 2]);
        expect(img.data[i + 3]).toBe(255); // opaque
      }
    });

    test('is deterministic for identical params and varies by noise type', () => {
      const a = V.NoiseImageRender.renderImageData({ type: 'simplex', zoom: 0.05 }, 12, 12, 3);
      const b = V.NoiseImageRender.renderImageData({ type: 'simplex', zoom: 0.05 }, 12, 12, 3);
      expect(Array.from(a.data)).toEqual(Array.from(b.data));

      const c = V.NoiseImageRender.renderImageData({ type: 'ridged', zoom: 0.05 }, 12, 12, 3);
      expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    });

    test('ships a non-empty preloaded noise preset library', () => {
      expect(Array.isArray(V.NOISE_IMAGE_PRESETS)).toBe(true);
      expect(V.NOISE_IMAGE_PRESETS.length).toBeGreaterThan(4);
      V.NOISE_IMAGE_PRESETS.forEach((p) => {
        expect(typeof p.id).toBe('string');
        expect(typeof p.label).toBe('string');
        expect(p.noise && typeof p.noise.type).toBe('string');
      });
    });
  });

  describe('ImageSurfaceSource.ensure', () => {
    test('renders a noise descriptor into NOISE_IMAGES and caches it', () => {
      const p = { imageNoiseDef: { type: 'simplex', zoom: 0.05 }, imageSeed: 1 };
      const ready = V.ImageSurfaceSource.ensure(p);
      expect(ready).toBe(true);
      expect(p.imageId).toBeTruthy();
      expect(V.NOISE_IMAGES[p.imageId]).toBeTruthy();

      // A second params object with the same descriptor resolves to the same
      // cache key without re-allocating a new raster.
      const before = V.NOISE_IMAGES[p.imageId];
      const p2 = { imageNoiseDef: { type: 'simplex', zoom: 0.05 }, imageSeed: 1 };
      V.ImageSurfaceSource.ensure(p2);
      expect(p2.imageId).toBe(p.imageId);
      expect(V.NOISE_IMAGES[p2.imageId]).toBe(before);
    });

    test('returns false for a built-in source (no raster needed)', () => {
      const p = { imageSourceKind: 'builtin' };
      expect(V.ImageSurfaceSource.ensure(p)).toBe(false);
      expect(p.imageId).toBeFalsy();
    });
  });

  describe('imageSurface.generate samples the source', () => {
    test('a noise source yields different geometry than the built-in relief', () => {
      const algo = V.AlgorithmRegistry.imageSurface;
      const bounds = { width: 400, height: 400 };
      const base = { mode: 'lines', rows: 10, sampleDetail: 24, smoothing: 0 };

      const builtin = algo.generate({ ...base }, null, null, bounds);
      const noise = algo.generate(
        { ...base, imageNoiseDef: { type: 'ridged', zoom: 0.06 }, imageSeed: 2 },
        null,
        null,
        bounds,
      );

      expect(builtin.length).toBeGreaterThan(0);
      expect(noise.length).toBeGreaterThan(0);
      expect(JSON.stringify(builtin)).not.toBe(JSON.stringify(noise));
    });
  });
});
