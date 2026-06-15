/**
 * rasterPlane algorithm definition.
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
    normalize,
    faceNormal,
    splitPathByVisibility,
    markHidden,
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

  const AU = window.Vectura.AlgorithmUtils || {};
  const frac = AU.frac || ((v) => v - Math.floor(v));
  const applyPad = AU.applyPad || ((t) => t);

  // Wrap a sample coordinate into a repeating tile cell. Byte-for-byte the same
  // tiling topo applies, so a noise layer's Tile Mode behaves identically on the
  // Raster-Plane (the rack itself is tiling-agnostic — the caller must wrap).
  const applyTile = (nx, ny, mode, padding = 0) => {
    const pad = Math.max(0, Math.min(0.45, padding));
    switch (mode) {
      case 'brick': { const row = Math.floor(ny); return { x: applyPad(frac(nx + (row % 2) * 0.5), pad), y: applyPad(frac(ny), pad) }; }
      case 'hex': { const hy = ny / 0.866; const row = Math.floor(hy); return { x: applyPad(frac(nx + (row % 2) * 0.5), pad), y: applyPad(frac(hy), pad) }; }
      case 'diamond': { const ax = nx + ny; const ay = -nx + ny; return { x: applyPad(frac(ax), pad), y: applyPad(frac(ay), pad) }; }
      case 'triangle': { let fx = frac(nx); let fy = frac(ny); if (fx + fy > 1) { fx = 1 - fx; fy = 1 - fy; } return { x: applyPad(fx, pad), y: applyPad(fy, pad) }; }
      case 'offset': { const col = Math.floor(nx); return { x: applyPad(frac(nx), pad), y: applyPad(frac(ny + (col % 2) * 0.5), pad) }; }
      case 'radial': { const r = Math.hypot(nx, ny); const a = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5; return { x: applyPad(frac(r), pad) * Math.cos(applyPad(frac(a), pad) * Math.PI * 2), y: applyPad(frac(r), pad) * Math.sin(applyPad(frac(a), pad) * Math.PI * 2) }; }
      case 'checker': { const cx = Math.floor(nx); const cy = Math.floor(ny); let fx = frac(nx); if ((cx + cy) % 2 !== 0) fx = 1 - fx; return { x: applyPad(fx, pad), y: applyPad(frac(ny), pad) }; }
      case 'wave': { return { x: applyPad(frac(nx + Math.sin(ny * Math.PI * 2) * 0.1), pad), y: applyPad(frac(ny + Math.sin(nx * Math.PI * 2) * 0.1), pad) }; }
      case 'grid':
      default: return { x: applyPad(frac(nx), pad), y: applyPad(frac(ny), pad) };
    }
  };

  // Canonical world span the noise rack samples across. (u,v) in [0,1] map to
  // [0, NOISE_SPAN], so a layer's `zoom` behaves the same way it does for the
  // noise-image presets (which also normalize to a fixed span) — independent of
  // the artwork's physical mm size.
  const NOISE_SPAN = 1024;

  // Build a (u,v) → [-1, 1] evaluator over the universal noise rack stack
  // (`p.noises`), or return null when no enabled layers exist. Mirrors how
  // topo/flowfield consume the rack so behavior stays consistent app-wide.
  const createNoiseField = (p, noise) => {
    const NoiseRack = Vectura.NoiseRack;
    if (!NoiseRack || !noise || typeof noise.noise2D !== 'function') return null;
    const layers = (Array.isArray(p.noises) ? p.noises : []).filter((n) => n && n.enabled !== false && n.type !== 'imageSource');
    if (!layers.length) return null;
    const rack = NoiseRack.createEvaluator({ noise, seed: finite(p.imageSeed, 1) });
    // maxAmp is the tone reference for the hatch-dark / hatch-light blends only;
    // it NO LONGER normalizes the final field — see the additive fold below.
    const maxAmp = layers.reduce((sum, n) => sum + Math.abs(n.amplitude ?? 0), 0) || 1;
    return (u, v) => {
      let combined;
      layers.forEach((layer) => {
        const wx = u * NOISE_SPAN;
        const wy = v * NOISE_SPAN;
        const isPoly = layer.type === 'polygon';
        const isImage = layer.type === 'image';
        const tileMode = layer.tileMode || 'off';
        // Noise Offset X/Y are intuitive screen offsets: dragging the slider
        // right should slide the noise pattern right. The sampler reads
        // noise(coord + shift), which moves features the OPPOSITE way, so we
        // negate here. (Offset Y keeps the sampler's native sign.)
        const sgnShiftX = -(layer.shiftX ?? 0);
        let value;
        // Single-octave `evaluate` path for: (a) tiled layers — the sample
        // coordinate is wrapped into a repeating cell, and FBM can't span tile
        // seams cleanly; (b) polygon — a geometric SDF shape that must NOT be
        // FBM-summed, since octaves would stack scaled copies into concentric
        // "ghost" polygons. Everything else keeps the multi-octave sampleScalar.
        if (tileMode !== 'off' || isPoly) {
          const zoom = NoiseRack.resolveEffectiveZoom(layer, 0.02);
          const freq = Math.max(0.05, layer.freq ?? 1);
          const angle = ((layer.angle ?? 0) * Math.PI) / 180;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const shiftX = sgnShiftX;
          const shiftY = layer.shiftY ?? 0;
          const cx = isPoly ? wx - NOISE_SPAN / 2 : wx;
          const cy = isPoly ? wy - NOISE_SPAN / 2 : wy;
          const dx = cx * cosA - cy * sinA + shiftX;
          const dy = cx * sinA + cy * cosA + shiftY;
          let sx = dx * zoom * freq;
          let sy = dy * zoom;
          if (tileMode !== 'off') {
            const tiled = applyTile(sx, sy, tileMode, layer.tilePadding ?? 0);
            sx = isPoly ? (tiled.x - 0.5) * 2 : tiled.x;
            sy = isPoly ? (tiled.y - 0.5) * 2 : tiled.y;
          }
          value = rack.evaluate(sx, sy, layer, { worldX: wx, worldY: wy }) * (layer.amplitude ?? 1);
        } else if (isImage) {
          // Image noise maps the source raster across the WHOLE surface in
          // normalized [0,1] space. The generic world*zoom FBM path (below)
          // multiplies the [0,1024] world coordinate by the tiny base zoom and
          // then clamps inside evaluate()'s image branch, squashing the raster
          // into a single corner pixel — so the effect rendered as a flat
          // constant ("not working at all"). Sample 1:1, single-octave (an
          // image is not fractal noise), honoring angle/shift for positioning.
          // evaluate()'s non-wrapped image branch re-centers coords by +0.5, so
          // feed it (uv - 0.5) to land the sample exactly on the surface uv.
          const angle = ((layer.angle ?? 0) * Math.PI) / 180;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const cu = u - 0.5;
          const cv = v - 0.5;
          const sx = cu * cosA - cv * sinA + sgnShiftX;
          const sy = cu * sinA + cv * cosA + (layer.shiftY ?? 0);
          value = rack.evaluate(sx, sy, layer, { worldX: wx, worldY: wy }) * (layer.amplitude ?? 1);
        } else {
          // sampleScalar reads layer.shiftX internally; hand it the negated
          // offset so the generic FBM path slides with the same sign as above.
          value = rack.sampleScalar(wx, wy, { ...layer, shiftX: sgnShiftX }, { worldX: wx, worldY: wy }) * (layer.amplitude ?? 1);
        }
        combined = NoiseRack.combineBlend({ combined, value, blend: layer.blend || 'add', maxAmplitude: maxAmp });
      });
      // Return the RAW blended sum (each layer already scaled by its own Field
      // Weight / amplitude). The previous `/maxAmp` normalization cancelled out
      // the absolute Field Weight — every layer's weight only mattered relative
      // to its peers — so the slider appeared dead. The additive fold in
      // createSampler scales this for display.
      return combined ?? 0;
    };
  };

  // Scale factor folding the raw noise field (each layer pre-scaled by its Field
  // Weight) onto the base height ∈ [0, 1]. A single layer at Field Weight 1 swings
  // a simplex sample ∈ [-1, 1] by ±0.5 — i.e. it can emboss the surface across
  // half its full height — matching the maximum emboss strength of the old
  // global Noise Amount. Field Weight 2 reaches a full ±1.0 swing.
  const NOISE_FOLD = 0.5;

  // The raster-plane "Image" base layer is a `type:'imageSource'` rack entry. By
  // default it samples the raw raster (imageDataSample) — see createSampler. When
  // ANY of its Image controls are non-default we instead resolve the base height
  // through the shared NoiseRack image pipeline so the full control set actually
  // shapes the surface: Field Weight, Noise Scale, Frequency, Noise Angle, Offset
  // X/Y, Noise Width/Height, Noise Style, Invert Color/Opacity, Micro Frequency,
  // Noise Threshold, and the Image Effects chain.
  const imageSourceCustomControls = (layer) =>
    !!layer && (
      (Array.isArray(layer.imageEffects) && layer.imageEffects.length > 0) ||
      !!layer.imageInvertColor ||
      !!layer.imageInvertOpacity ||
      (layer.noiseThreshold ?? 0) > 0 ||
      (layer.noiseStyle && layer.noiseStyle !== 'linear') ||
      (layer.microFreq ?? 0) > 0 ||
      (layer.imageWidth ?? 1) !== 1 ||
      (layer.imageHeight ?? 1) !== 1 ||
      (layer.amplitude ?? 1) !== 1 ||
      (layer.zoom ?? 1) !== 1 ||
      (layer.freq ?? 1) !== 1 ||
      (layer.angle ?? 0) !== 0 ||
      (layer.shiftX ?? 0) !== 0 ||
      (layer.shiftY ?? 0) !== 0
    );

  // Returns a `(u,v) => [0,1]` base-height sampler, or null to keep the raw path
  // (zero behavior change): no imageSource layer, or every Image control default.
  const createBaseImageLuma = (p) => {
    const layers = Array.isArray(p.noises) ? p.noises : [];
    const layer = layers.find((n) => n && n.enabled !== false && n.type === 'imageSource');
    if (!imageSourceCustomControls(layer)) return null;
    const NoiseRack = Vectura.NoiseRack;
    if (!NoiseRack || typeof NoiseRack.createImageLumaSampler !== 'function') return null;
    // Materialize the active base source as a raster so the image pipeline always
    // has pixels — the built-in procedural relief (the default source, with no
    // `imageId`) is rendered to a grid via renderBuiltinImageData; every other
    // source (black/white/preset/imported/painted) already lives in NOISE_IMAGES
    // keyed by `p.imageId`. Resolved once per sampler build, not per sample.
    const store = noiseStore();
    const baseImg = p.imageId && store[p.imageId] ? store[p.imageId] : renderBuiltinImageData(SOURCE_RES);
    // wrap (tileMode != 'off') so Noise Scale / Frequency repeats tile cleanly
    // beyond [0,1] instead of clamping the edge pixels.
    const sampler = NoiseRack.createImageLumaSampler({ ...layer, tileMode: 'grid' }, baseImg);
    if (!sampler) return null;
    const fieldWeight = layer.amplitude ?? 1;
    const noiseStyle = layer.noiseStyle || 'linear';
    const noiseThreshold = clamp(layer.noiseThreshold ?? 0, 0, 1);
    const microFreq = Math.max(0, layer.microFreq ?? 0);
    // Noise Scale (zoom): >1 magnifies (image larger). Frequency: tiling repeats.
    // Noise Width/Height: per-axis aspect. All fold into one coordinate scale.
    const invZoom = 1 / Math.max(0.05, layer.zoom ?? 1);
    const repeat = Math.max(0.05, layer.freq ?? 1);
    const sxScale = (invZoom * repeat) / Math.max(0.05, layer.imageWidth ?? 1);
    const syScale = (invZoom * repeat) / Math.max(0.05, layer.imageHeight ?? 1);
    const angle = ((layer.angle ?? 0) * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const shiftX = layer.shiftX ?? 0;
    const shiftY = layer.shiftY ?? 0;
    return (u, v) => {
      // Position the raster across the surface: scale around centre by Noise
      // Scale × Frequency × Width/Height, rotate by Noise Angle, slide by Offset,
      // then re-land in [0,1].
      const cu = (u - 0.5) * sxScale;
      const cv = (v - 0.5) * syScale;
      const su = cu * cosA - cv * sinA + shiftX + 0.5;
      const sv = cu * sinA + cv * cosA + shiftY + 0.5;
      let h = sampler(su, sv); // post-effects [0,1] luminance = base height
      // Height-domain reshapers mirroring the Image displacement controls.
      if (noiseStyle === 'curve') h = h * h;
      else if (noiseStyle === 'angled') h = clamp((h - 0.5) * 2, 0, 1);
      else if (noiseStyle === 'noisy') h = clamp(h + (sampleBuiltIn(su, sv) - 0.5) * 0.25, 0, 1);
      if (noiseThreshold > 0) h = h >= noiseThreshold ? 1 : h / noiseThreshold;
      if (microFreq > 0) {
        const wave = Math.sin((u + v) * (microFreq / 2) * Math.PI * 2);
        h = clamp(h + wave * 0.25, 0, 1);
      }
      // Field Weight scales relief intensity around mid-height: 1 = as-sampled,
      // 0 = flat, >1 exaggerates, <0 inverts the relief.
      h = 0.5 + (h - 0.5) * fieldWeight;
      return clamp(h, 0, 1);
    };
  };

  const createSampler = (p, noise) => {
    const direct = p.imageData || p.fixtureImageData || null;
    const fixture = p.fixtureGrid || p.sampleGrid || null;
    const noiseImage = p.imageId && Vectura.NOISE_IMAGES ? Vectura.NOISE_IMAGES[p.imageId] : null;
    const baseImageLuma = createBaseImageLuma(p);
    const noiseField = createNoiseField(p, noise);
    return (u, v) => {
      const uu = clamp(u, 0, 1);
      const vv = p.normalFlipY ? 1 - clamp(v, 0, 1) : clamp(v, 0, 1);
      let value = fixtureSample(fixture, uu, vv);
      if (value === null) value = imageDataSample(direct, uu, vv);
      // When the Image base layer has custom controls, its NoiseRack-resolved
      // height supersedes the raw raster sample (but still yields to explicit
      // fixture/imageData sources, which this use case never sets).
      if (value === null && baseImageLuma) value = baseImageLuma(uu, vv);
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
      // The noise rack stack rides on top of the resolved image height so it
      // displaces the surface regardless of which base source is active. Each
      // layer's Field Weight + Blend Mode are baked into the field; we fold it
      // in additively (emboss) — there is no longer a global Noise Mode/Amount.
      if (noiseField) value = clamp(value + noiseField(uu, vv) * NOISE_FOLD, 0, 1);
      return value;
    };
  };

  const viewAngles = (p) => ({ yaw: finite(p.rotate, -45), pitch: finite(p.tilt, 60), roll: 0 });

  const surfaceSample = (x, y, h, p, bounds) => {
    const amp = finite(p.amplitude, 10);
    const centered = { x, y: (h - 0.5) * amp, z: y };
    const rotated = rotatePoint(centered, viewAngles(p));
    return {
      object: centered,
      rotated,
      point: projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }),
    };
  };

  const surfacePoint = (x, y, h, p, bounds) => surfaceSample(x, y, h, p, bounds).point;

  const surfaceNormal = (u, v, rect, p, sampler) => {
    const d = 1 / Math.max(24, finite(p.sampleDetail, 84));
    const hL = sampler(u - d, v);
    const hR = sampler(u + d, v);
    const hT = sampler(u, v - d);
    const hB = sampler(u, v + d);
    const amp = finite(p.amplitude, 10);
    const dx = ((hR - hL) * amp) / Math.max(1e-6, rect.width * d * 2);
    const dz = ((hB - hT) * amp) / Math.max(1e-6, rect.height * d * 2);
    return normalize({ x: -dx, y: 1, z: -dz });
  };

  const surfaceVisible = (u, v, rect, p, sampler) => {
    const normal = rotatePoint(surfaceNormal(u, v, rect, p, sampler), viewAngles(p));
    return normal.z >= -0.001;
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
    // Map Blur (p.mapBlur) blurs the sampled height field BEFORE projection — a
    // distinct operation from the universal output-line Smoothing (p.smoothing),
    // which the engine now applies post-projection. Renamed off `smoothing` so
    // the two no longer collide on one param id.
    if (finite(p.mapBlur, 0) <= 0) return field;
    const passes = Math.max(1, Math.round(clamp(finite(p.mapBlur, 0) / 25, 0, 4)));
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

  // Mean camera-space z over a set of surface samples (or raw projected points),
  // LARGER = NEARER — feeds G3.applyDepthCue (#2). Prefers the rotated camera z
  // (matches the bars depth sort); falls back to the projected point's carried z.
  // Returns null when no sample exposes a finite z, so callers can skip stamping.
  const meanDepth = (samples) => {
    let sum = 0;
    let count = 0;
    (samples || []).forEach((s) => {
      const z = s && (s.rotated ? s.rotated.z : (s.point ? s.point.z : s.z));
      if (Number.isFinite(z)) {
        sum += z;
        count++;
      }
    });
    return count ? sum / count : null;
  };

  const pathFromSurfaceSamples = (samples, meta = {}) => {
    const path = samples.map((pt) => {
      const projected = pt?.point || pt;
      return { x: projected.x, y: projected.y };
    });
    path.meta = { algorithm: 'rasterPlane', straight: true, ...meta };
    if (path.meta.depth == null) {
      const depth = meanDepth(samples);
      if (depth != null) path.meta.depth = depth;
    }
    return path;
  };

  // Wire modes whose multi-point output respects the layer Curves toggle. Bars
  // (2-point segments) and relief plane edges can't curve and are excluded.
  const SURFACE_CURVE_MODES = new Set(['lines', 'mesh', 'topography']);

  // Curve conversion shared by the wire modes, mirroring topoform's
  // contract: the layer Curves toggle is the master enable, and the Curve
  // Smoothing slider (contourSmoothing) drives bezier tension + a simplify
  // tolerance so the result is smooth AND lean. A 2-point / sub-3-point path
  // can't curve, so it passes through unchanged (meta.straight intact).
  const curveSurfacePath = (path, p) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const mode = p.mode || 'lines';
    if (!SURFACE_CURVE_MODES.has(mode)) return path;
    const smoothAmt = clamp(finite(p.contourSmoothing, 0), 0, 100);
    if (p.curves === true) {
      // Curves ON — every point becomes a bezier. Tolerance scales with each
      // path's own bounding-box diagonal so it adapts to artwork size: Curves-on
      // alone trims the densest oversampling (~0.4% of the diagonal); the slider
      // drives it up to ~2.4%. The tension floor keeps Curves-on smooth even at
      // smoothing 0 (else the simplified anchors join as flat, faceted chords).
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
      const tol = Math.max(diag * 0.004, (smoothAmt / 100) * diag * 0.024);
      const tension = Math.min(100, 55 + smoothAmt * 0.45);
      return G3.smoothToBezier(path, tension, { simplifyTolerance: tol });
    }
    // Curves OFF: topography keeps its legacy contour smoothing — its contours
    // have always smoothed via the slider alone, independent of the toggle, so
    // existing files/baselines render byte-identical. Lines / mesh stay straight.
    if (mode === 'topography' && smoothAmt > 0) return G3.smoothToBezier(path, smoothAmt);
    return path;
  };

  const pushVisibilityPaths = (paths, samples, p, meta = {}) => {
    if (!Array.isArray(samples) || samples.length < 2) return;
    const keepHidden = p.seeThrough !== false;
    const depth = meta.depth == null ? meanDepth(samples) : null;
    splitPathByVisibility(samples, { keepHidden, visibleOnly: !keepHidden }).forEach((path) => {
      path.meta = { ...(path.meta || {}), algorithm: 'rasterPlane', straight: true, ...meta };
      if (path.meta.depth == null && depth != null) path.meta.depth = depth;
      paths.push(curveSurfacePath(path, p));
    });
  };

  const faceVisible = (samples) => faceNormal(samples.map((sample) => sample.rotated || sample.object || sample)).z >= -0.001;

  // Enhancement #5 — Lambert hatch one front face. `faceSamples` are surfaceSample
  // results (carry .rotated for the normal + depth, .point for the screen polygon).
  // Pushes lit-density scan lines into `paths`, tagged so they ride the same
  // hidden-line/depth pipeline. No-op unless p.hatchEnable. Additive: never touches
  // the wire output, so hatchEnable off leaves geometry byte-identical.
  const pushFaceHatch = (paths, faceSamples, p, light, meta = {}) => {
    if (!p.hatchEnable) return;
    const polygon = faceSamples.map((s) => (s.point || s));
    if (polygon.length < 3) return;
    const normal = faceNormal(faceSamples.map((s) => s.rotated || s.object || s));
    const depth = meanDepth(faceSamples);
    const spacing = Math.max(1, finite(p.hatchSpacing, 6)) * (p.fastPreview ? 2 : 1);
    G3.lambertHatch(normal, light, polygon, {
      baseSpacing: spacing,
      angleDeg: finite(p.hatchAngle, 45),
      crossHatch: !!p.crossHatch,
    }).forEach((seg) => {
      seg.meta = { algorithm: 'rasterPlane', straight: true, hatch: true, ...meta };
      if (depth != null) seg.meta.depth = depth;
      paths.push(seg);
    });
  };


  const buildLines = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const nRows = Math.max(2, Math.round(clamp(finite(p.rows, 42), 2, 160)));
    const cols = Math.max(4, Math.round(clamp(finite(p.sampleDetail, 84), 8, 240)));
    const angle = finite(p.horizontalLineAngle, 0);
    const planes = !!p.horizontalLinesAsPlanes;
    // Base Height (planes only): a constant lift added to every slice's top so
    // even flat (h≈0) regions extrude a minimum-height curtain. The baseline
    // stays on the floor (h=0); only the top profile rises by baseHeight.
    const baseHeight = planes ? Math.max(0, finite(p.baseHeight, 0)) : 0;
    const keepHidden = p.seeThrough !== false;
    // The floor profile (h=0) is only needed to fill the solid occlusion band:
    // planes mode with See-Through OFF. Skip it otherwise.
    const needBase = planes && !keepHidden;

    // Sample every model row into screen-space surface samples (carry .rotated for
    // depth + .point for screen XY). A clipBlackAreas split can break one model row
    // into several disjoint segments.
    const segments = []; // { top: surfaceSample[], base: surfaceSample[]|null, row }
    const pushSeg = (top, base, row) => { if (top.length >= 2) segments.push({ top, base, row }); };
    for (let y = 0; y < nRows; y++) {
      const v = nRows === 1 ? 0.5 : y / (nRows - 1);
      let top = [];
      let base = [];
      for (let x = 0; x <= cols; x++) {
        const u = x / cols;
        const h = sampler(u, v);
        if (p.clipBlackAreas && h < 0.04) {
          pushSeg(top, needBase ? base : null, y);
          top = [];
          base = [];
          continue;
        }
        let px = rect.left + u * rect.width;
        let py = rect.top + v * rect.height;
        if (angle) {
          const r = rotate2({ x: px, y: py }, angle);
          px = r.x;
          py = r.y;
        }
        top.push(surfaceSample(px, py, h + baseHeight, p, bounds));
        if (needBase) base.push(surfaceSample(px, py, 0, p, bounds));
      }
      pushSeg(top, needBase ? base : null, y);
    }

    if (keepHidden) {
      // See-Through ON: stacked top-surface wires, no occlusion. Both plain lines
      // and planes draw ONLY the surface profile (planes lifted by baseHeight). The
      // floor lattice / curtain walls are never drawn — in a see-through wireframe
      // they read as disconnected clutter; the extruded-solid look comes from the
      // hidden-line removal when See-Through is OFF.
      const paths = [];
      segments.forEach((s) => paths.push(curveSurfacePath(pathFromSurfaceSamples(s.top, { mode: 'lines' }), p)));
      return paths;
    }

    // See-Through OFF: floating-horizon hidden-line removal — the classic stacked-
    // profile scanline algorithm (think "Unknown Pleasures" ridgelines). Rows are
    // processed near→far; samples inside the screen-Y band already covered by nearer
    // rows are dropped, so visible spans emerge as long continuous runs — no painter
    // shatter, no back rows leaking through.
    //
    // Plain lines: the top profile is BOTH the drawn line and its own occluder (a
    // ridgeline plot). Planes: the row is the CLOSED curtain outline (top profile +
    // floor profile) — drawn AND used as the occlusion band, so the extrusion reads
    // as a solid front face with the back rows hidden behind it.
    const rows = segments.map((s) => {
      let pts;
      if (planes && s.base && s.base.length === s.top.length) {
        pts = s.top.map((t) => ({ x: t.point.x, y: t.point.y }));
        for (let i = s.base.length - 1; i >= 0; i--) pts.push({ x: s.base[i].point.x, y: s.base[i].point.y });
        pts.push({ x: s.top[0].point.x, y: s.top[0].point.y }); // close the curtain (left drop)
      } else {
        pts = s.top.map((t) => ({ x: t.point.x, y: t.point.y }));
      }
      return {
        pts,
        depth: finite(meanDepth(s.top), 0),
        occludes: true,
        meta: { algorithm: 'rasterPlane', straight: true, mode: 'lines', reliefPlane: planes, row: s.row },
      };
    });
    // Roll: align the rows to screen-X so the horizon band is measured along the
    // near→far stacking axis. The projection's rotate + tilt + Line Angle all fold
    // into the on-screen slant of a row, so derive it from a representative row's
    // projected direction rather than any single param.
    let roll = 0;
    const mid = segments[Math.floor(segments.length / 2)] || segments[0];
    if (mid && mid.top.length >= 2) {
      const a = mid.top[0].point;
      const b = mid.top[mid.top.length - 1].point;
      if (Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)) {
        roll = Math.atan2(b.y - a.y, b.x - a.x);
      }
    }
    // Occlusion Bias (p.depthBias) is the screen-space tolerance (px) that keeps
    // silhouette-grazing lines whole and stops adjacent rows from z-fighting.
    return G3.occludeRowsFloatingHorizon(rows, {
      mode: 'remove',
      eps: Math.max(0, finite(p.depthBias, 0.5)),
      angle: roll,
    });
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
        row.push({
          point: surfacePoint(rect.left + u * rect.width, rect.top + v * rect.height, sampler(u, v), p, bounds),
          visible: surfaceVisible(u, v, rect, p, sampler),
        });
      }
      points.push(row);
    }
    const paths = [];
    for (let y = 0; y <= rows; y++) pushVisibilityPaths(paths, points[y], p, { mode: 'mesh', axis: 'row' });
    for (let x = 0; x <= cols; x++) {
      pushVisibilityPaths(paths, points.map((row) => row[x]), p, { mode: 'mesh', axis: 'column' });
    }
    // Enhancement #5 — Lambert hatch front mesh cells (additive, off by default).
    if (p.hatchEnable) {
      const light = G3.resolveLight(p);
      // Cap hatched cells under fast preview to keep density bounded.
      const cap = (p.fastPreview || bounds.fastPreview) ? G3.previewCap(bounds, rows * cols) : rows * cols;
      let hatched = 0;
      for (let y = 0; y < rows && hatched < cap; y++) {
        for (let x = 0; x < cols && hatched < cap; x++) {
          const u0 = x / cols;
          const v0 = y / rows;
          const u1 = (x + 1) / cols;
          const v1 = (y + 1) / rows;
          const uc = (u0 + u1) / 2;
          const vc = (v0 + v1) / 2;
          if (!surfaceVisible(uc, vc, rect, p, sampler)) continue;
          const cell = [
            surfaceSample(rect.left + u0 * rect.width, rect.top + v0 * rect.height, sampler(u0, v0), p, bounds),
            surfaceSample(rect.left + u1 * rect.width, rect.top + v0 * rect.height, sampler(u1, v0), p, bounds),
            surfaceSample(rect.left + u1 * rect.width, rect.top + v1 * rect.height, sampler(u1, v1), p, bounds),
            surfaceSample(rect.left + u0 * rect.width, rect.top + v1 * rect.height, sampler(u0, v1), p, bounds),
          ];
          pushFaceHatch(paths, cell, p, light, { mode: 'mesh', hatchCell: true });
          hatched++;
        }
      }
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
    return contours.flatMap((path) => {
      const samples = path.map((pt) => {
        const r = angle ? rotate2(pt, angle) : pt;
        const u = (pt.x - rect.left) / rect.width;
        const v = (pt.y - rect.top) / rect.height;
        return {
          point: surfacePoint(r.x, r.y, sampler(u, v), p, bounds),
          visible: surfaceVisible(u, v, rect, p, sampler),
        };
      });
      const split = [];
      // pushVisibilityPaths applies curveSurfacePath, so the contour is already
      // smoothed (toggle-on, or legacy slider-only back-compat) here.
      pushVisibilityPaths(split, samples, p, { mode: 'topography' });
      return split;
    });
  };

  const sampleBarFootprint = (sampler, u0, v0, u1, v1, p) => {
    const detail = Math.max(1, Math.round(clamp(finite(p.sampleDetail, 84) / 42, 1, 5)));
    let sum = 0;
    let black = 0;
    let count = 0;
    for (let yy = 0; yy < detail; yy++) {
      const v = v0 + ((yy + 0.5) / detail) * (v1 - v0);
      for (let xx = 0; xx < detail; xx++) {
        const u = u0 + ((xx + 0.5) / detail) * (u1 - u0);
        const h = sampler(u, v);
        sum += h;
        if (h < 0.04) black++;
        count++;
      }
    }
    return {
      value: count ? sum / count : sampler((u0 + u1) * 0.5, (v0 + v1) * 0.5),
      blackRatio: count ? black / count : 0,
    };
  };

  const quantizeBarHeight = (h, p) => {
    const steps = Math.round(clamp(finite(p.barHeightSteps, 6), 0, 48));
    return steps >= 2 ? Math.round(h * steps) / steps : h;
  };

  const segmentKey = (a, b) => {
    const pa = `${a.x.toFixed(3)},${a.y.toFixed(3)}`;
    const pb = `${b.x.toFixed(3)},${b.y.toFixed(3)}`;
    return pa < pb ? `${pa}:${pb}` : `${pb}:${pa}`;
  };

  const addMappedSegment = (edgeMap, a, b, hidden, meta = {}) => {
    const path = pathFromSurfaceSamples([a, b], meta);
    // Carry per-endpoint camera depth so screen-space painter occlusion (#4) can
    // clip these edges against nearer bars when see-through is off. `owner` lets
    // occludeSegments skip a bar's own faces (no self-occlusion of its silhouette).
    path.meta.depthA = a.rotated ? a.rotated.z : finite(a.z, 0);
    path.meta.depthB = b.rotated ? b.rotated.z : finite(b.z, 0);
    if (hidden) markHidden(path, { strokeDash: [3.2, 2.2] });
    const key = segmentKey(path[0], path[1]);
    const previous = edgeMap.get(key);
    if (!previous || (previous.meta?.hiddenLine && !path.meta?.hiddenLine)) edgeMap.set(key, path);
  };

  const addMappedLoop = (edgeMap, samples, hidden, meta = {}) => {
    for (let i = 0; i < samples.length; i++) addMappedSegment(edgeMap, samples[i], samples[(i + 1) % samples.length], hidden, meta);
  };

  // Screen-space painter occlusion over the deduped bar edges (2-point, straight,
  // meta.depthA/depthB + meta.cubeId). `occluders` are front-facing bar faces with
  // a per-face painter depth and matching cubeId. Runs as a single batched call so
  // the occluder bboxes are built once. Non-segment paths pass through untouched.
  // Sub-span gap below which two collinear visible runs of the SAME edge are
  // treated as a single line (the split was screen-space sampling jitter where a
  // long edge grazes the silhouettes of many co-depth neighbor bars), and the
  // minimum length a standalone exposed sliver must reach to survive. Without the
  // merge, see-through-OFF bars shatter into hundreds of 1–4px ticks.
  const BAR_RUN_MERGE_GAP = 5.0;
  const BAR_RUN_MIN_LEN = 1.0;
  // A PARTIALLY-occluded edge shorter than this is occlusion noise (a sub-pixel
  // sliver peeking past a nearer bar) and is dropped; a COMPLETE edge (one that
  // spans essentially its whole length) is always kept, however short, so genuine
  // small far-bar edges survive.
  const BAR_SLIVER_MIN = 2.5;

  const occludeBarEdges = (edgePaths, occluders, depthBias) => {
    const segments = [];
    const segEnds = [];
    const passthrough = [];
    edgePaths.forEach((path) => {
      if (!path || !path.meta || path.length !== 2 ||
          !Number.isFinite(path.meta.depthA) || !Number.isFinite(path.meta.depthB)) {
        passthrough.push(path);
        return;
      }
      const meta = { ...path.meta };
      delete meta.depthA;
      delete meta.depthB;
      // __segId lets us regroup the (possibly many) visible runs occludeSegments
      // emits for this one straight edge so we can merge them back together.
      meta.__segId = segments.length;
      segEnds.push({ ax: path[0].x, ay: path[0].y, bx: path[1].x, by: path[1].y });
      segments.push({
        a: { x: path[0].x, y: path[0].y, z: path.meta.depthA },
        b: { x: path[1].x, y: path[1].y, z: path.meta.depthB },
        owner: path.meta.cubeId,
        meta,
      });
    });
    const runs = G3.occludeSegments(segments, occluders, { mode: 'remove', depthBias });
    // Bucket every visible run by its source edge.
    const byEdge = new Map();
    runs.forEach((run) => {
      if (!run || run.length < 2) return;
      const id = run.meta ? run.meta.__segId : null;
      if (id == null) { passthrough.push(run); return; }
      if (!byEdge.has(id)) byEdge.set(id, []);
      byEdge.get(id).push(run);
    });
    const merged = [];
    byEdge.forEach((edgeRuns, id) => {
      const ends = segEnds[id];
      const dx = ends.bx - ends.ax;
      const dy = ends.by - ends.ay;
      const lenSq = dx * dx + dy * dy;
      const len = Math.sqrt(lenSq) || 1;
      const meta = { ...(edgeRuns[0].meta || {}) };
      delete meta.__segId;
      // Project each run onto the edge as a [t0,t1] parametric interval (all runs
      // are collinear sub-spans of the straight edge), then merge intervals whose
      // gap is jitter-sized and drop the leftover stubs.
      const proj = (pt) => (lenSq ? ((pt.x - ends.ax) * dx + (pt.y - ends.ay) * dy) / lenSq : 0);
      const intervals = edgeRuns.map((run) => {
        const ts = run.map(proj);
        return [Math.min(...ts), Math.max(...ts)];
      }).sort((p, q) => p[0] - q[0]);
      const gapT = BAR_RUN_MERGE_GAP / len;
      let cur = intervals[0].slice();
      const flush = () => {
        const lenPx = (cur[1] - cur[0]) * len;
        if (lenPx < BAR_RUN_MIN_LEN) return;
        // Keep complete edges at any length; drop short partial occlusion slivers.
        const complete = cur[0] <= 0.02 && cur[1] >= 0.98;
        if (!complete && lenPx < BAR_SLIVER_MIN) return;
        const seg = [
          { x: ends.ax + cur[0] * dx, y: ends.ay + cur[0] * dy },
          { x: ends.ax + cur[1] * dx, y: ends.ay + cur[1] * dy },
        ];
        seg.meta = { ...meta };
        merged.push(seg);
      };
      for (let i = 1; i < intervals.length; i++) {
        if (intervals[i][0] - cur[1] <= gapT) {
          cur[1] = Math.max(cur[1], intervals[i][1]);
        } else {
          flush();
          cur = intervals[i].slice();
        }
      }
      flush();
    });
    return passthrough.concat(merged);
  };

  const buildBars = (p, bounds, sampler) => {
    const rect = artworkRect(p);
    const rows = Math.max(2, Math.round(clamp(finite(p.barRows, 14), 2, 160)));
    const cols = Math.max(2, Math.round(clamp(finite(p.barColumns, 14), 2, 160)));
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const gap = clamp(finite(p.barGap, 0), 0, Math.max(0, Math.min(cellW, cellH) - 0.2));
    const insetX = gap / 2;
    const insetY = gap / 2;
    const keepHidden = p.seeThrough !== false;
    const edgeMap = new Map();
    const sideDefinitions = [[0, 3], [3, 2], [2, 1], [1, 0]];
    // When see-through is off we run true inter-bar hidden-line removal: every
    // front-facing bar face becomes a painter occluder (screen polygon + mean
    // camera depth + its bar id), and the deduped edges are clipped where a
    // NEARER bar covers them. Without this, far/short bars' tops and faces bleed
    // through the gaps between near bars (the "bizarre gaps").
    const occluders = keepHidden ? null : [];
    const faceOccluder = (face, cubeId) => {
      const polygon = face.map((s) => ({ x: s.point.x, y: s.point.y }));
      if (polygon.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) return;
      const fdepth = face.reduce((sum, s) => sum + s.rotated.z, 0) / face.length;
      occluders.push({ polygon, depth: fdepth, owner: cubeId });
    };
    // Enhancement #5 — Lambert hatch the lit top faces (additive, off by default).
    const barHatch = [];
    const hatchLight = p.hatchEnable ? G3.resolveLight(p) : null;
    const hatchCap = p.hatchEnable
      ? ((p.fastPreview || bounds.fastPreview) ? G3.previewCap(bounds, rows * cols) : rows * cols)
      : 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cubeId = y * cols + x;
        const u0 = x / cols;
        const v0 = y / rows;
        const u1 = (x + 1) / cols;
        const v1 = (y + 1) / rows;
        const sample = sampleBarFootprint(sampler, u0, v0, u1, v1, p);
        if (p.clipBlackAreas && sample.blackRatio >= 0.98) continue;
        const h = quantizeBarHeight(sample.value, p);
        if (h <= 0.01) continue;
        const x0 = rect.left + x * cellW + insetX;
        const x1 = rect.left + (x + 1) * cellW - insetX;
        const y0 = rect.top + y * cellH + insetY;
        const y1 = rect.top + (y + 1) * cellH - insetY;
        if (x1 - x0 < 0.2 || y1 - y0 < 0.2) continue;
        const top = [
          surfaceSample(x0, y0, h, p, bounds),
          surfaceSample(x0, y1, h, p, bounds),
          surfaceSample(x1, y1, h, p, bounds),
          surfaceSample(x1, y0, h, p, bounds),
        ];
        const bottom = [
          surfaceSample(x0, y0, 0, p, bounds),
          surfaceSample(x0, y1, 0, p, bounds),
          surfaceSample(x1, y1, 0, p, bounds),
          surfaceSample(x1, y0, 0, p, bounds),
        ];
        const depth = top.reduce((sum, samplePt) => sum + samplePt.rotated.z, 0) / top.length;
        const topVisible = faceVisible(top);
        if (topVisible || keepHidden) addMappedLoop(edgeMap, top, !topVisible, { mode: 'bars', barTop: true, depth, cubeId, closed: true });
        if (topVisible && occluders) faceOccluder(top, cubeId);
        if (hatchLight && topVisible && barHatch.length < hatchCap * 8) {
          pushFaceHatch(barHatch, top, p, hatchLight, { mode: 'bars', barTop: true, depth });
        }
        sideDefinitions.forEach(([a, b]) => {
          const face = [bottom[a], bottom[b], top[b], top[a]];
          const visible = faceVisible(face);
          if (!visible && !keepHidden) return;
          addMappedLoop(edgeMap, face, !visible, { mode: 'bars', barSide: true, depth, cubeId });
          if (visible && occluders) faceOccluder(face, cubeId);
        });
      }
    }
    const paths = [];
    if (p.showBarBase !== false) {
      const floor = [
        surfacePoint(rect.left, rect.top, 0, p, bounds),
        surfacePoint(rect.left + rect.width, rect.top, 0, p, bounds),
        surfacePoint(rect.left + rect.width, rect.top + rect.height, 0, p, bounds),
        surfacePoint(rect.left, rect.top + rect.height, 0, p, bounds),
        surfacePoint(rect.left, rect.top, 0, p, bounds),
      ];
      paths.push(pathFromSurfaceSamples(floor, { mode: 'bars', barFloor: true, closed: true }));
    }
    let edges = Array.from(edgeMap.values());
    if (occluders && occluders.length) {
      // Co-planar / same-depth neighbor bars must NOT occlude an edge — otherwise
      // a face whose mean depth wobbles just past the tiny default bias clips the
      // edge in and out as it grazes neighbor after neighbor, shattering it. Floor
      // the bias at a fraction of the occluder depth spread so only genuinely
      // NEARER bars (a row/column closer to the camera) clip; grazing neighbors
      // fall under the bias and are ignored.
      let zmin = Infinity;
      let zmax = -Infinity;
      occluders.forEach((o) => { if (o.depth < zmin) zmin = o.depth; if (o.depth > zmax) zmax = o.depth; });
      const bias = Math.max(finite(p.depthBias, 0.5), (zmax - zmin) * 0.03);
      edges = occludeBarEdges(edges, occluders, bias);
    }
    paths.push(...edges.sort((a, b) => finite(a.meta?.depth, 0) - finite(b.meta?.depth, 0)));
    if (barHatch.length) paths.push(...barHatch);
    return paths;
  };

  // ---------------------------------------------------------------------------
  // Source resolution.
  //
  // The surface samples (in priority order) an explicit imageData, a fixture
  // grid, a NOISE_IMAGES[imageId] raster, or the built-in procedural relief.
  // `RasterPlaneSource` keeps that raster populated for the three persistent
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
    // Solid-color presets: recreate the raster on demand (no imageSrc needed).
    if (p.imageSourceKind === 'black' || p.imageSourceKind === 'white') {
      const id = p.imageSourceKind === 'black' ? 'imgsrc-solid-black' : 'imgsrc-solid-white';
      if (!store[id]) {
        const size = 4;
        const data = new Uint8ClampedArray(size * size * 4);
        if (p.imageSourceKind === 'white') data.fill(255);
        else for (let i = 3; i < data.length; i += 4) data[i] = 255;
        store[id] = { width: size, height: size, data };
      }
      p.imageId = id;
      return true;
    }
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

  // Restore every rasterPlane layer's source after a project import. Noise
  // sources resolve synchronously; data-URL sources decode asynchronously and
  // invoke `onEach(layer)` so the caller can re-generate just that layer.
  const rehydrateAll = (engine, onEach) => {
    if (!engine || !Array.isArray(engine.layers)) return;
    const store = noiseStore();
    engine.layers.forEach((layer) => {
      if (!layer || layer.type !== 'rasterPlane') return;
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

  // Render the resolved height field — base source + tone (gamma/contrast/
  // invert) + the live noise rack stack — to a grayscale raster. The source
  // preview draws this so the panel thumbnail shows exactly what the 3D model
  // samples (including the noise displacement). Reuses the engine's own
  // `createSampler`, so preview and model can never drift. UI/runtime only.
  const renderPreviewRaster = (p, w = 132, h = 132) => {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    ensureSource(p);
    // Match the engine: it builds `new SimpleNoise(layer.params.seed)` and seeds
    // the rack with `imageSeed` internally (see createNoiseField).
    const noise = Vectura.SimpleNoise ? new Vectura.SimpleNoise(p.seed) : null;
    const sampler = createSampler(p, noise);
    const data = new Uint8ClampedArray(W * H * 4);
    const dx = W > 1 ? W - 1 : 1;
    const dy = H > 1 ? H - 1 : 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const g = Math.round(clamp(sampler(x / dx, y / dy), 0, 1) * 255);
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    }
    return { width: W, height: H, data };
  };

  window.Vectura.RasterPlaneSource = {
    ensure: ensureSource,
    rehydrateAll,
    decodeToStore,
    renderBuiltinImageData,
    renderPreviewRaster,
    SOURCE_RES,
  };

  window.Vectura.AlgorithmRegistry.rasterPlane = {
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
      const sampler = createSampler(p, noise);
      const mode = p.mode || 'lines';
      let paths;
      if (mode === 'mesh') paths = buildMesh(p, bounds, sampler);
      else if (mode === 'topography') paths = buildTopography(p, bounds, sampler);
      else if (mode === 'bars') paths = buildBars(p, bounds, sampler);
      else paths = buildLines(p, bounds, sampler);
      // Enhancement #2 — depth cue via dash density (no-op when p.depthCue==='off').
      // Each path was stamped meta.depth (mean camera z) at build time; this reads
      // those stamps once across the whole frame, before cleanPaths.
      G3.applyDepthCue(paths, p);
      return cleanPaths(paths);
    },
    formula: () => 'Sampled image relief projected as lines, mesh, contours, or bars.',
  };
})();
