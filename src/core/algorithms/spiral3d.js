/**
 * spiral3d algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const {
    TAU,
    clamp,
    finite,
    rotatePoint,
    projectPoint,
    normalize,
    splitPathByVisibility,
    circlePath,
  } = G3;

  const shapePoint = (p, u, longitude) => {
    const shape = p.shape || 'ellipsoid';
    if (shape === 'cone') {
      const h = Math.max(1, finite(p.coneHeight, 136));
      const r0 = Math.max(1, finite(p.baseRadius, 68));
      const y = (u - 0.5) * h;
      const r = r0 * (1 - u);
      const point = { x: Math.cos(longitude) * r, y, z: Math.sin(longitude) * r };
      const normal = normalize({ x: Math.cos(longitude) * h, y: r0, z: Math.sin(longitude) * h });
      return { point, normal };
    }
    if (shape === 'cylinder') {
      const h = Math.max(1, finite(p.cylinderHeight, 156));
      const r = Math.max(1, finite(p.cylinderRadius, 58));
      return {
        point: { x: Math.cos(longitude) * r, y: (u - 0.5) * h, z: Math.sin(longitude) * r },
        normal: { x: Math.cos(longitude), y: 0, z: Math.sin(longitude) },
      };
    }
    const sphereRadius = Math.max(1, finite(p.sphereRadius, finite(p.ellipsoidEquatorRadius, 64)));
    const rx = shape === 'sphere' ? sphereRadius : Math.max(1, finite(p.ellipsoidEquatorRadius, 76));
    const rz = rx;
    const ry = shape === 'sphere' ? sphereRadius : Math.max(1, finite(p.ellipsoidPolarRadius, 52));
    const lat = (u - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    const point = {
      x: Math.cos(longitude) * cl * rx,
      y: Math.sin(lat) * ry,
      z: Math.sin(longitude) * cl * rz,
    };
    return {
      point,
      normal: normalize({ x: point.x / (rx * rx), y: point.y / (ry * ry), z: point.z / (rz * rz) }),
    };
  };

  const projectSample = (p, bounds, u, longitude) => {
    const view = {
      yaw: finite(p.yaw, 0),
      pitch: finite(p.pitch, 30),
      roll: finite(p.roll, 0),
    };
    const sample = shapePoint(p, u, longitude);
    const rotated = rotatePoint(sample.point, view);
    const normal = rotatePoint(sample.normal, view);
    return {
      point: projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }),
      // Camera-space depth (rotated z; LARGER = NEARER the viewer) for enhancement
      // #2 depth-cue. The projected point is flattened to {x,y} downstream, so we
      // surface the rotated z here for per-segment depth stamping.
      depth: rotated.z,
      visible: normal.z >= -0.001,
    };
  };

  // Mean camera-space depth of a contiguous run of samples, used to stamp
  // path.meta.depth for enhancement #2. Returns null when no finite z is present
  // so G3.applyDepthCue cleanly skips the path.
  const meanSampleDepth = (samples) => {
    let sum = 0;
    let count = 0;
    (samples || []).forEach((sample) => {
      const z = Number(sample && sample.depth);
      if (Number.isFinite(z)) {
        sum += z;
        count += 1;
      }
    });
    return count ? sum / count : null;
  };

  // Group samples into the same contiguous visible/hidden runs that
  // G3.splitPathByVisibility produces, so we can compute a per-run mean depth and
  // line it up positionally with the emitted paths (1:1, same order). Mirrors the
  // foundation's flush rules exactly: a run needs >= 2 points, hidden runs are
  // emitted only when keepHidden.
  const depthRuns = (samples, keepHidden, visibleOnly) => {
    const runs = [];
    let current = null;
    let currentVisible = null;
    const flush = () => {
      if (current && current.length >= 2 && (currentVisible || keepHidden)) {
        runs.push(meanSampleDepth(current));
      }
      current = null;
    };
    (samples || []).forEach((sample) => {
      if (!sample || !sample.point) return;
      const visible = sample.visible !== false;
      if (!visible && visibleOnly && !keepHidden) {
        flush();
        currentVisible = null;
        return;
      }
      if (current && currentVisible !== visible) flush();
      if (!current) {
        current = [];
        currentVisible = visible;
      }
      current.push(sample);
    });
    flush();
    return runs;
  };

  const dotLoop = (cx, cy, diameter, visible) => {
    const path = circlePath(cx, cy, Math.max(0.2, diameter * 0.5), 18, {
      algorithm: 'spiral3d',
      closed: true,
      straight: true,
      dot: true,
    });
    if (!visible) G3.markHidden(path);
    return path;
  };

  const buildWrapSamples = (p, bounds, lineIndex = 0, lineCount = 1) => {
    const preview = Boolean(p.fastPreview || bounds.fastPreview);
    const resolution = clamp(finite(p.curveResolution, 900), 90, 4000);
    const steps = Math.max(36, Math.round(resolution * (preview ? G3.previewDetailScale(bounds) : 1)));
    const start = (finite(p.startLongitude, 0) * Math.PI) / 180;
    const samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let longitude;
      if ((p.wrapType || 'spiral') === 'twistedLines') {
        longitude = start + (lineIndex / Math.max(1, lineCount)) * TAU + TAU * finite(p.twistTurns, 6) * (t - 0.5);
      } else {
        longitude = start + TAU * finite(p.turns, 18) * t;
      }
      samples.push(projectSample(p, bounds, t, longitude));
    }
    return samples;
  };

  const buildOutline = (p, bounds) => {
    if ((p.outlineMode || 'outline') === 'none') return [];
    // Enhancement #3 — silhouette emphasis. spiral3d has no facets, so the
    // shared face-based G3.extractSilhouette does not apply; the silhouette rings
    // built here ARE the outline. When emphasizeOutline is on, stamp the ring's
    // meta.weightScale so the renderer/exporter draws it heavier.
    const emphasize = p.emphasizeOutline === true;
    const weightScale = G3.finite(p.outlineWeight, 2);
    const depthCueOn = ((p.depthCue || 'off') !== 'off');
    const paths = [];
    const rings = (p.shape || 'ellipsoid') === 'cylinder' ? [0, 1] : [0.08, 0.92];
    rings.forEach((u) => {
      const samples = [];
      const steps = 128;
      for (let i = 0; i <= steps; i++) {
        const longitude = (i / steps) * TAU;
        samples.push(projectSample(p, bounds, u, longitude));
      }
      const loop = samples.map((sample) => sample.point);
      loop.meta = { algorithm: 'spiral3d', outline: true, closed: true, straight: true };
      if (emphasize) loop.meta.weightScale = weightScale;
      if (depthCueOn) {
        const depth = meanSampleDepth(samples);
        if (depth != null) loop.meta.depth = depth;
      }
      paths.push(loop);
    });
    return paths;
  };

  window.Vectura.AlgorithmRegistry.spiral3d = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const paths = [];
      // Enhancement #4 — hidden-line. spiral3d's back-face culling
      // (splitPathByVisibility on sample.visible) IS its hidden-line removal;
      // there are no solid occluder polygons, so the painter-style
      // G3.occludeSegments is not used here. Map p.hiddenLineMode onto the
      // existing keepHidden logic: 'backface'/'remove' keep the legacy front-only
      // behavior; 'dash' additionally keeps the back-facing runs and renders them
      // dashed (splitPathByVisibility already marks hidden runs hiddenLine +
      // strokeDash). surfaceMode:'seeThrough' still forces hidden runs visible.
      const hiddenLineMode = p.hiddenLineMode || 'backface';
      const keepHidden = (p.surfaceMode || 'front') === 'seeThrough' || hiddenLineMode === 'dash';
      const depthCueOn = ((p.depthCue || 'off') !== 'off');
      const renderStyle = p.renderStyle || 'line';
      const wrapType = p.wrapType || 'spiral';
      const lineCount = wrapType === 'twistedLines' ? Math.max(1, Math.round(clamp(finite(p.lineCount, 16), 1, 160))) : 1;

      for (let line = 0; line < lineCount; line++) {
        const samples = buildWrapSamples(p, bounds, line, lineCount);
        if (renderStyle === 'dots') {
          const spacing = Math.max(1, finite(p.dotSpacing, 14));
          const stride = Math.max(3, Math.round(spacing / 2));
          for (let i = 0; i < samples.length; i += stride) {
            const t = i / Math.max(1, samples.length - 1);
            const size = t < 0.5
              ? finite(p.dotSizeStart, 4) + (finite(p.dotSizeMiddle, 4) - finite(p.dotSizeStart, 4)) * (t * 2)
              : finite(p.dotSizeMiddle, 4) + (finite(p.dotSizeEnd, 4) - finite(p.dotSizeMiddle, 4)) * ((t - 0.5) * 2);
            if (samples[i].visible || keepHidden) {
              const dot = dotLoop(samples[i].point.x, samples[i].point.y, size, samples[i].visible);
              if (depthCueOn && Number.isFinite(samples[i].depth)) dot.meta.depth = samples[i].depth;
              paths.push(dot);
            }
          }
        } else {
          const split = splitPathByVisibility(samples, { keepHidden, visibleOnly: !keepHidden });
          // depthRuns mirrors splitPathByVisibility's run grouping 1:1 so we can
          // stamp each emitted path's representative depth (enhancement #2).
          const runDepths = depthCueOn ? depthRuns(samples, keepHidden, !keepHidden) : null;
          split.forEach((path, idx) => {
            path.meta = { ...(path.meta || {}), algorithm: 'spiral3d', straight: true };
            if (runDepths && idx < runDepths.length && runDepths[idx] != null) {
              path.meta.depth = runDepths[idx];
            }
            paths.push(G3.smoothToBezier(path, finite(p.smoothing, 0)));
          });
        }
      }
      paths.push(...buildOutline(p, bounds));
      // Enhancement #2 — depth cue. Stamped meta.depth (camera z) on each
      // wrap-segment, dot, and outline ring above; convert to a near/far dash
      // density now. No-op when depthCue is 'off', and skips hidden-line paths so
      // their dashes win. Enhancement #5 (hatching) is N/A: a wrap surface has no
      // polygon facets to clip a hatch grid against, so hatchEnable has no effect.
      G3.applyDepthCue(paths, p);
      return G3.cleanPaths(paths);
    },
    formula: () => 'Parametric surface wrap projected with front/back normal tests.',
  };
})();
