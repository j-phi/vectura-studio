/**
 * NoiseImageRender — render a Noise Rack `noiseDef` to a grayscale raster.
 *
 * This reuses the EXACT noise pipeline the algorithms use
 * (`NoiseRack.createEvaluator` + `sampleScalar`, driven by a `SimpleNoise`
 * instance) so a preview image produced here matches the noise an algorithm
 * would sample for the same params. The rasterPlane algorithm consumes the
 * result as a height field.
 *
 * `renderImageData` is PURE — it returns an ImageData-shaped object
 * `{ width, height, data: Uint8ClampedArray }` with NO canvas dependency, so it
 * runs in headless/JSDOM test runtimes where `<canvas>` is a no-op. The canvas
 * helpers (`drawToCanvas`, `toDataURL`) are thin wrappers used only by the UI.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /**
   * Render `noiseDef` to a grayscale ImageData-shaped object.
   * @param {object} noiseDef - Noise Rack descriptor ({ type, zoom, octaves, ... }).
   * @param {number} width
   * @param {number} height
   * @param {number} seed
   * @returns {{ width:number, height:number, data:Uint8ClampedArray }}
   */
  const renderImageData = (noiseDef, width = 256, height = 256, seed = 0) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const data = new Uint8ClampedArray(w * h * 4);
    const NoiseRack = Vectura.NoiseRack;
    const SimpleNoise = Vectura.SimpleNoise;

    if (!NoiseRack || typeof NoiseRack.createEvaluator !== 'function' || !SimpleNoise || !noiseDef) {
      // Degrade to a flat mid-grey field rather than throwing — keeps the
      // surface usable even if the noise modules failed to load.
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        data[o] = data[o + 1] = data[o + 2] = 128;
        data[o + 3] = 255;
      }
      return { width: w, height: h, data };
    }

    const noise = new SimpleNoise(seed);
    const rack = NoiseRack.createEvaluator({ noise, seed });
    // Sample across a canonical world span so `zoom` behaves the same way it
    // does inside the algorithms (which feed world/pixel coordinates).
    const span = Number.isFinite(noiseDef.renderSpan) ? noiseDef.renderSpan : 512;
    const denomX = w > 1 ? w - 1 : 1;
    const denomY = h > 1 ? h - 1 : 1;

    for (let y = 0; y < h; y++) {
      const wy = (y / denomY) * span;
      for (let x = 0; x < w; x++) {
        const wx = (x / denomX) * span;
        const s = rack.sampleScalar(wx, wy, noiseDef); // [-1, 1]
        const g = Math.round(clamp01(s * 0.5 + 0.5) * 255);
        const o = (y * w + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    }
    return { width: w, height: h, data };
  };

  /** Paint an ImageData-shaped object onto a canvas (UI only). */
  const drawToCanvas = (canvas, img, opts = {}) => {
    if (!canvas || !img) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function') return;
    const target = document.createElement('canvas');
    target.width = img.width;
    target.height = img.height;
    const tctx = target.getContext('2d');
    if (!tctx || typeof tctx.createImageData !== 'function') return;
    const id = tctx.createImageData(img.width, img.height);
    id.data.set(img.data);
    tctx.putImageData(id, 0, 0);
    if (opts.fit) {
      ctx.imageSmoothingEnabled = opts.smooth !== false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(target, 0, 0, canvas.width, canvas.height);
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').putImageData(id, 0, 0);
    }
  };

  /** Encode an ImageData-shaped object as a PNG data URL (UI only). */
  const toDataURL = (img) => {
    if (typeof document === 'undefined' || !img) return '';
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function') return '';
    const id = ctx.createImageData(img.width, img.height);
    id.data.set(img.data);
    ctx.putImageData(id, 0, 0);
    return typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/png') : '';
  };

  Vectura.NoiseImageRender = { renderImageData, drawToCanvas, toDataURL };
})();
