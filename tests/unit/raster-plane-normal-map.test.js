/*
 * Raster-Plane — Map Type 'Normal': real height reconstruction RGR coverage.
 *
 * A tangent-space normal map encodes per-texel surface orientation, not height.
 * mapType:'normal' must recover the relief by integrating the slope field the
 * map encodes (decode RGB → normal, slopes sx = nx/nz and sy = ±ny/nz, scanline
 * integration, normalize to [0,1]) — not by differencing the map's luminance
 * against the procedural builtin (the old placeholder).
 *
 * Conventions pinned here:
 *  - a positive red component tilts the surface uphill along +x (+u);
 *  - `normalFlipY` is SOLELY the green-channel sign flip in normal mode;
 *  - in height mode `normalFlipY` keeps its legacy meaning: a v-axis flip.
 *
 * Heights are recovered from the emitted paths by inverting the (linear,
 * orthographic) projection: point(h) = p0 + h * (p1 - p0), so
 * h = dot(point - p0, p1 - p0) / |p1 - p0|².
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — normal-map height reconstruction', () => {
  let runtime;
  let V;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 800, height: 600 };
  const baseParams = {
    mode: 'lines', rows: 3, sampleDetail: 60, amplitude: 20, artworkSize: 150,
    rotate: -45, tilt: 60, smoothing: 0, seeThrough: true, mapType: 'normal',
  };
  const gen = (extra) =>
    V.AlgorithmRegistry.rasterPlane.generate({ ...baseParams, ...extra }, null, new V.SimpleNoise(7), bounds);

  const encByte = (n) => Math.round(((n + 1) / 2) * 255);
  const makeNormalMap = (w, h, texel) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [nx, ny, nz] = texel(x, y);
        const i = (y * w + x) * 4;
        data[i] = encByte(nx);
        data[i + 1] = encByte(ny);
        data[i + 2] = encByte(nz);
        data[i + 3] = 255;
      }
    }
    return { width: w, height: h, data };
  };

  // Recover per-sample surface heights along one emitted row (at model v) by
  // inverting the orthographic projection.
  const rowHeights = (path, v) => {
    const size = baseParams.artworkSize;
    const amp = baseParams.amplitude;
    const rect = { left: -size / 2, top: -size / 2, width: size, height: size };
    const proj = (x, y, h) => {
      const centered = { x, y: (h - 0.5) * amp, z: y };
      const rotated = G3.rotatePoint(centered, { yaw: baseParams.rotate, pitch: baseParams.tilt, roll: 0 });
      return G3.projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1 });
    };
    const cols = path.length - 1;
    const heights = [];
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const px = rect.left + u * rect.width;
      const py = rect.top + v * rect.height;
      const a = proj(px, py, 0);
      const b = proj(px, py, 1);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      heights.push(L2 ? ((path[i].x - a.x) * dx + (path[i].y - a.y) * dy) / L2 : 0);
    }
    return heights;
  };

  test('A: constant-slope map (nx=0.6, nz=0.8) reconstructs a monotone x-ramp', () => {
    const map = makeNormalMap(64, 64, () => [0.6, 0, 0.8]);
    const paths = gen({ imageData: map });
    expect(paths.length).toBe(3);
    const heights = rowHeights(paths[1], 0.5);
    let inc = 0;
    for (let i = 1; i < heights.length; i++) if (heights[i] >= heights[i - 1] - 1e-3) inc++;
    // Placeholder behavior scores ~0.52 here (it wiggles with the builtin relief).
    expect(inc / (heights.length - 1)).toBeGreaterThanOrEqual(0.95);
    // The ramp should sweep most of the normalized [0,1] height span.
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.5);
    // Reconstruction is deterministic (and the per-raster cache is transparent).
    expect(JSON.stringify(gen({ imageData: map }))).toBe(JSON.stringify(paths));
  });

  test('B: normalFlipY flips the green channel — v-gradient reverses sign', () => {
    const map = makeNormalMap(64, 64, () => [0, 0.5, 0.8]);
    const vGrad = (flip) => {
      const paths = gen({ imageData: map, normalFlipY: flip });
      const first = rowHeights(paths[0], 0);
      const last = rowHeights(paths[paths.length - 1], 1);
      let sum = 0;
      for (let i = 0; i < first.length; i++) sum += last[i] - first[i];
      return sum / first.length;
    };
    const grad = vGrad(false);
    const gradFlipped = vGrad(true);
    expect(Math.abs(grad)).toBeGreaterThan(0.1);
    expect(Math.abs(gradFlipped)).toBeGreaterThan(0.1);
    expect(Math.sign(gradFlipped)).toBe(-Math.sign(grad));
    expect(JSON.stringify(gen({ imageData: map, normalFlipY: true })))
      .not.toBe(JSON.stringify(gen({ imageData: map, normalFlipY: false })));
  });

  test('C: height mode keeps normalFlipY as a v-axis flip (legacy pin)', () => {
    // 65×65 so the 3 sampled rows (v = 0, .5, 1) land on integer texel rows and
    // the flip equality is exact under nearest sampling.
    const w = 65;
    const h = 65;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const g = Math.round((255 * y) / (h - 1));
        data[i] = data[i + 1] = data[i + 2] = g;
        data[i + 3] = 255;
      }
    }
    const flippedData = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) flippedData.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    const plain = { width: w, height: h, data };
    const flipped = { width: w, height: h, data: flippedData };
    // flipY over the plain map ≡ no flip over the row-reversed map, byte-identical.
    const a = gen({ mapType: 'height', imageData: plain, normalFlipY: true });
    const b = gen({ mapType: 'height', imageData: flipped, normalFlipY: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // …and the flip genuinely does something on an asymmetric map.
    const c = gen({ mapType: 'height', imageData: plain, normalFlipY: false });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  test('D: flat mid-gray map (128,128,255) reconstructs near-flat', () => {
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    const paths = gen({ imageData: { width: w, height: h, data } });
    const heights = rowHeights(paths[1], 0.5);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.05);
  });
});
