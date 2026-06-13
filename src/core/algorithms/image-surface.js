/**
 * imageSurface algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const {
    clamp,
    finite,
    rotatePoint,
    projectPoint,
    circlePath,
    rotate2,
    marchingSquares,
    cleanPaths,
  } = G3;

  const sampleBuiltIn = (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const hill = Math.exp(-(dx * dx + dy * dy) * 10);
    const ridge = 0.5 + 0.5 * Math.sin((u * 4.2 + Math.sin(v * 5)) * Math.PI);
    const ring = 0.5 + 0.5 * Math.cos(Math.hypot(dx, dy) * 42);
    return clamp(hill * 0.62 + ridge * 0.25 + ring * 0.13, 0, 1);
  };

  const imageDataSample = (image, u, v) => {
    if (!image || !image.data || !Number.isFinite(image.width) || !Number.isFinite(image.height)) return null;
    const x = Math.max(0, Math.min(image.width - 1, Math.round(u * (image.width - 1))));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(v * (image.height - 1))));
    const i = (y * image.width + x) * 4;
    const data = image.data;
    if (i < 0 || i + 2 >= data.length) return null;
    return (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
  };

  const fixtureSample = (fixture, u, v) => {
    if (!Array.isArray(fixture) || !fixture.length || !Array.isArray(fixture[0])) return null;
    const rows = fixture.length;
    const cols = fixture[0].length;
    const x = Math.max(0, Math.min(cols - 1, Math.round(u * (cols - 1))));
    const y = Math.max(0, Math.min(rows - 1, Math.round(v * (rows - 1))));
    const value = Number(fixture[y]?.[x]);
    return Number.isFinite(value) ? clamp(value, 0, 1) : null;
  };

  const createSampler = (p) => {
    const direct = p.imageData || p.fixtureImageData || null;
    const fixture = p.fixtureGrid || p.sampleGrid || null;
    const noiseImage = p.imageId && Vectura.NOISE_IMAGES ? Vectura.NOISE_IMAGES[p.imageId] : null;
    return (u, v) => {
      const uu = clamp(u, 0, 1);
      const vv = p.normalFlipY ? 1 - clamp(v, 0, 1) : clamp(v, 0, 1);
      let value = fixtureSample(fixture, uu, vv);
      if (value === null) value = imageDataSample(direct, uu, vv);
      // NOISE_IMAGES entries are flat `{ width, height, data }` rasters; pass
      // the object itself (not its `.data` array) so imageDataSample can read
      // the dimensions. `.imageData` unwraps any future nested wrapper shape.
      if (value === null) value = imageDataSample(noiseImage?.imageData || noiseImage, uu, vv);
      if (value === null) value = sampleBuiltIn(uu, vv);
      if (p.mapType === 'normal') value = clamp(0.5 + (value - sampleBuiltIn(uu, 1 - vv)) * 1.4, 0, 1);
      if (p.invert) value = 1 - value;
      const gamma = Math.max(0.1, finite(p.gamma, 1));
      value = Math.pow(clamp(value, 0, 1), gamma);
      const contrast = finite(p.contrast, 0);
      value = clamp((value - 0.5) * (1 + contrast / 50) + 0.5, 0, 1);
      return value;
    };
  };

  const surfacePoint = (x, y, h, p, bounds) => {
    const amp = finite(p.amplitude, 10);
    const centered = { x, y: (h - 0.5) * amp, z: y };
    const rotated = rotatePoint(centered, { yaw: finite(p.rotate, -45), pitch: finite(p.tilt, 60) });
    return projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
  };

  const artworkRect = (p) => {
    const size = Math.max(4, finite(p.artworkSize, 150));
    return { left: -size / 2, top: -size / 2, width: size, height: size };
  };

  const buildField = (p, rows, cols, sampler) => {
    const field = [];
    for (let y = 0; y <= rows; y++) {
      const row = [];
      for (let x = 0; x <= cols; x++) row.push(sampler(x / cols, y / rows));
      field.push(row);
    }
    if (finite(p.smoothing, 0) <= 0) return field;
    const passes = Math.max(1, Math.round(clamp(finite(p.smoothing, 0) / 25, 0, 4)));
    let current = field;
    for (let pass = 0; pass < passes; pass++) {
      current = current.map((row, y) => row.map((value, x) => {
        let sum = 0;
        let count = 0;
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            const next = current[y + yy]?.[x + xx];
            if (Number.isFinite(next)) {
              sum += next;
              count++;
            }
          }
        }
        return count ? sum / count : value;
      }));
    }
    return current;
  };

  const pathFromSurfaceSamples = (samples, meta = {}) => {
    const path = samples.map((pt) => ({ x: pt.x, y: pt.y }));
    path.meta = { algorithm: 'imageSurface', straight: true, ...meta };
    return path;
  };

  const buildLines = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const rows = Math.max(2, Math.round(clamp(finite(p.rows, 42), 2, 160)));
    const cols = Math.max(4, Math.round(clamp(finite(p.sampleDetail, 84), 8, 240)));
    const paths = [];
    const angle = finite(p.horizontalLineAngle, 0);
    for (let y = 0; y < rows; y++) {
      const v = rows === 1 ? 0.5 : y / (rows - 1);
      const samples = [];
      for (let x = 0; x <= cols; x++) {
        const u = x / cols;
        const h = sampler(u, v);
        if (p.clipBlackAreas && h < 0.04) {
          if (samples.length >= 2) paths.push(pathFromSurfaceSamples(samples, { mode: 'lines' }));
          samples.length = 0;
          continue;
        }
        let px = rect.left + u * rect.width;
        let py = rect.top + v * rect.height;
        if (p.horizontalLinesAsPlanes) py += (h - 0.5) * finite(p.amplitude, 10) * 0.35;
        if (angle) {
          const r = rotate2({ x: px, y: py }, angle);
          px = r.x;
          py = r.y;
        }
        samples.push(surfacePoint(px, py, h, p, bounds));
      }
      if (samples.length >= 2) paths.push(pathFromSurfaceSamples(samples, { mode: 'lines' }));
    }
    return paths;
  };

  const buildMesh = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const rows = Math.max(2, Math.round(clamp(finite(p.rows, 28), 2, 120)));
    const cols = Math.max(2, Math.round(clamp(finite(p.columns, 28), 2, 120)));
    const points = [];
    for (let y = 0; y <= rows; y++) {
      const row = [];
      for (let x = 0; x <= cols; x++) {
        const u = x / cols;
        const v = y / rows;
        row.push(surfacePoint(rect.left + u * rect.width, rect.top + v * rect.height, sampler(u, v), p, bounds));
      }
      points.push(row);
    }
    const paths = [];
    for (let y = 0; y <= rows; y++) paths.push(pathFromSurfaceSamples(points[y], { mode: 'mesh', axis: 'row' }));
    if (p.seeThrough !== false) {
      for (let x = 0; x <= cols; x++) paths.push(pathFromSurfaceSamples(points.map((row) => row[x]), { mode: 'mesh', axis: 'column' }));
    }
    return paths;
  };

  const buildTopography = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const detail = Math.max(12, Math.round(clamp(finite(p.sampleDetail, 84), 12, 160)));
    const field = buildField(p, detail, detail, sampler);
    const levels = Math.max(3, Math.round(clamp(finite(p.columns, 28), 3, 80)));
    const thresholds = Array.from({ length: levels }, (_, i) => (i + 1) / (levels + 1));
    const contours = marchingSquares(field, rect.width, rect.height, thresholds, { left: rect.left, top: rect.top });
    const angle = finite(p.topographyAngle, 0);
    return contours.map((path) => {
      const pts = path.map((pt) => {
        const r = angle ? rotate2(pt, angle) : pt;
        return surfacePoint(r.x, r.y, sampler((pt.x - rect.left) / rect.width, (pt.y - rect.top) / rect.height), p, bounds);
      });
      return G3.smoothToBezier(pathFromSurfaceSamples(pts, { mode: 'topography' }), finite(p.contourSmoothing, 0));
    });
  };

  const buildBars = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const rows = Math.max(1, Math.round(clamp(finite(p.barRows, 14), 1, 80)));
    const cols = Math.max(1, Math.round(clamp(finite(p.barColumns, 14), 1, 80)));
    const gap = clamp(finite(p.barGap, 0), 0, 0.8);
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const paths = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const u = (x + 0.5) / cols;
        const v = (y + 0.5) / rows;
        const h = sampler(u, v);
        if (p.clipBlackAreas && h < 0.04) continue;
        const insetX = (cellW * gap) / 2;
        const insetY = (cellH * gap) / 2;
        const x0 = rect.left + x * cellW + insetX;
        const x1 = rect.left + (x + 1) * cellW - insetX;
        const y0 = rect.top + y * cellH + insetY;
        const y1 = rect.top + (y + 1) * cellH - insetY;
        const top = [
          surfacePoint(x0, y0, h, p, bounds),
          surfacePoint(x1, y0, h, p, bounds),
          surfacePoint(x1, y1, h, p, bounds),
          surfacePoint(x0, y1, h, p, bounds),
          surfacePoint(x0, y0, h, p, bounds),
        ];
        paths.push(pathFromSurfaceSamples(top, { mode: 'bars', closed: true }));
        const base = surfacePoint((x0 + x1) / 2, (y0 + y1) / 2, 0, p, bounds);
        const peak = surfacePoint((x0 + x1) / 2, (y0 + y1) / 2, h, p, bounds);
        if (p.seeThrough !== false) paths.push(pathFromSurfaceSamples([base, peak], { mode: 'bars', vertical: true }));
      }
    }
    return paths;
  };

  // ---------------------------------------------------------------------------
  // Source resolution.
  //
  // The surface samples (in priority order) an explicit imageData, a fixture
  // grid, a NOISE_IMAGES[imageId] raster, or the built-in procedural relief.
  // `ImageSurfaceSource` keeps that raster populated for the three persistent
  // source kinds the UI can author:
  //   - 'noise'    → re-rendered deterministically (sync) from `imageNoiseDef`
  //   - 'imported' / 'painted' → restored (async) by decoding the `imageSrc`
  //                  data URL that was embedded in the saved project
  //   - 'builtin'  → no raster; the algorithm's procedural relief is used
  // ---------------------------------------------------------------------------

  const SOURCE_RES = 384;

  const hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  };

  const noiseStore = () => (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});

  const renderBuiltinImageData = (res = SOURCE_RES) => {
    const w = Math.max(1, Math.round(res));
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const g = Math.round(clamp(sampleBuiltIn(x / (w - 1 || 1), y / (w - 1 || 1)), 0, 1) * 255);
        const o = (y * w + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    }
    return { width: w, height: w, data };
  };

  // Ensure a NOISE_IMAGES raster exists for `p`. Returns true when the source is
  // ready synchronously (noise / already-populated), false when an async
  // rehydrate is still required (imported / painted after a fresh reload).
  // Mutates only `p.imageId` (a runtime cache key); the persistent descriptor
  // fields are left untouched.
  const ensureSource = (p) => {
    if (!p) return false;
    const store = noiseStore();
    if (p.imageId && store[p.imageId]) return true;
    if (p.imageNoiseDef && Vectura.NoiseImageRender) {
      const seed = finite(p.imageSeed, 1);
      const key = 'imgsrc-noise-' + hashStr(JSON.stringify(p.imageNoiseDef) + ':' + seed);
      if (!store[key]) {
        const res = Math.max(16, finite(p.imageSourceResolution, SOURCE_RES));
        store[key] = Vectura.NoiseImageRender.renderImageData(p.imageNoiseDef, res, res, seed);
      }
      p.imageId = key;
      return true;
    }
    return false;
  };

  // Decode a data URL into a NOISE_IMAGES raster and invoke `done`. UI/runtime
  // only (needs a real canvas); a no-op in headless contexts.
  const decodeToStore = (dataUrl, done) => {
    if (!dataUrl || typeof document === 'undefined') {
      if (done) done(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof ctx.getImageData !== 'function') {
        if (done) done(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const store = noiseStore();
      const id = 'imgsrc-load-' + hashStr(dataUrl).slice(0, 8) + '-' + (dataUrl.length % 99999).toString(36);
      store[id] = { width: data.width, height: data.height, data: data.data };
      if (done) done(id);
    };
    img.onerror = () => { if (done) done(null); };
    img.src = dataUrl;
  };

  // Restore every imageSurface layer's source after a project import. Noise
  // sources resolve synchronously; data-URL sources decode asynchronously and
  // invoke `onEach(layer)` so the caller can re-generate just that layer.
  const rehydrateAll = (engine, onEach) => {
    if (!engine || !Array.isArray(engine.layers)) return;
    const store = noiseStore();
    engine.layers.forEach((layer) => {
      if (!layer || layer.type !== 'imageSurface') return;
      const p = layer.params || {};
      if (p.imageId && store[p.imageId]) return;
      if (p.imageNoiseDef) {
        ensureSource(p);
        return;
      }
      if (p.imageSrc) {
        decodeToStore(p.imageSrc, (id) => {
          if (id) {
            p.imageId = id;
            if (onEach) onEach(layer);
          }
        });
      }
    });
  };

  window.Vectura.ImageSurfaceSource = {
    ensure: ensureSource,
    rehydrateAll,
    decodeToStore,
    renderBuiltinImageData,
    SOURCE_RES,
  };

  window.Vectura.AlgorithmRegistry.imageSurface = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = { ...(params || {}) };
      ensureSource(p);
      if (p.fastPreview || bounds.fastPreview) {
        p.rows = Math.min(finite(p.rows, 42), G3.previewCap(bounds, 60));
        p.columns = Math.min(finite(p.columns, 28), G3.previewCap(bounds, 60));
        p.sampleDetail = Math.min(finite(p.sampleDetail, 84), G3.previewCap(bounds, 90));
        p.barRows = Math.min(finite(p.barRows, 14), G3.previewCap(bounds, 26));
        p.barColumns = Math.min(finite(p.barColumns, 14), G3.previewCap(bounds, 26));
      }
      const sampler = createSampler(p);
      const mode = p.mode || 'lines';
      let paths;
      if (mode === 'mesh') paths = buildMesh(p, bounds, sampler);
      else if (mode === 'topography') paths = buildTopography(p, bounds, sampler);
      else if (mode === 'bars') paths = buildBars(p, bounds, sampler);
      else paths = buildLines(p, bounds, sampler);
      return cleanPaths(paths);
    },
    formula: () => 'Sampled image relief projected as lines, mesh, contours, or bars.',
  };
})();
