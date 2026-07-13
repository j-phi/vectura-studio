/**
 * spiralizer algorithm definition (formerly "Helix" / "3D Spiral").
 *
 * Coils a continuous line or a sequence of marker glyphs around a parametric
 * surface (sphere / cone / cylinder / ellipsoid / torus / capsule) or around a
 * dedicated multi-strand helix shape, projected to 2D with front/back-face
 * culling and a full-shape silhouette outline.
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
    bezierCircle,
    marchingSquares,
  } = G3;

  // All render styles that emit a glyph per sample (everything except 'line').
  //  - dots      → hollow bezier-circle (fillable)
  //  - points    → solid filled disc
  //  - plusses   → '+' (two axis strokes; formerly the 'points' glyph)
  //  - crosses   → '×'
  //  - squares   → hollow square (fillable)
  //  - triangles → hollow triangle (fillable)
  //  - dashes    → tangent-aligned dash
  const MARKER_STYLES = ['dots', 'points', 'plusses', 'crosses', 'squares', 'triangles', 'dashes'];
  const isMarkerStyle = (style) => MARKER_STYLES.indexOf(style) !== -1;
  // Hollow closed glyphs whose interior the universal fill dropdown can pattern.
  const FILLABLE_STYLES = ['dots', 'squares', 'triangles'];
  const isFillableStyle = (style) => FILLABLE_STYLES.indexOf(style) !== -1;

  const shapePoint = (p, u, longitude) => {
    const shape = p.shape || 'ellipsoid';
    if (shape === 'helix') {
      // A coiled strand: u climbs the central axis (height), longitude winds the
      // strand around it. Because the spiral wrap couples u and longitude, this
      // traces a true 3D helix; helixCount offsets several strands in phase to
      // make a double / triple / n-helix.
      const R = Math.max(1, finite(p.helixRadius, 48));
      const h = Math.max(1, finite(p.helixHeight, 168));
      return {
        point: { x: Math.cos(longitude) * R, y: (u - 0.5) * h, z: Math.sin(longitude) * R },
        normal: { x: Math.cos(longitude), y: 0, z: Math.sin(longitude) },
      };
    }
    if (shape === 'cone') {
      const hh = Math.max(1, finite(p.coneHeight, 136));
      const r0 = Math.max(1, finite(p.baseRadius, 68));
      const y = (u - 0.5) * hh;
      const r = r0 * (1 - u);
      const point = { x: Math.cos(longitude) * r, y, z: Math.sin(longitude) * r };
      const normal = normalize({ x: Math.cos(longitude) * hh, y: r0, z: Math.sin(longitude) * hh });
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
    if (shape === 'torus') {
      // u sweeps the major (toroidal) ring once; longitude winds the minor
      // (poloidal) tube `turns` times, so a spiral wrap coils around the donut.
      const R = Math.max(1, finite(p.torusRingRadius, 64));
      const tube = Math.max(0.5, finite(p.torusTubeRadius, 26));
      const phi = u * TAU;
      const ct = Math.cos(longitude);
      const ringR = R + tube * ct;
      return {
        point: { x: Math.cos(phi) * ringR, y: tube * Math.sin(longitude), z: Math.sin(phi) * ringR },
        normal: { x: Math.cos(phi) * ct, y: Math.sin(longitude), z: Math.sin(phi) * ct },
      };
    }
    if (shape === 'capsule') {
      // Cylinder of height H radius r, capped by two hemispheres. u is allocated
      // along the meridian arc length (cap, barrel, cap) so the wrap pitch stays
      // even across the seams.
      const r = Math.max(1, finite(p.capsuleRadius, 46));
      const h = Math.max(0, finite(p.capsuleHeight, 120));
      const capArc = (r * Math.PI) / 2;
      const total = h + 2 * capArc;
      const fCap = capArc / total;
      const fCyl = h / total;
      const cl = Math.cos(longitude);
      const sl = Math.sin(longitude);
      if (u < fCap) {
        const lat = (u / fCap - 1) * (Math.PI / 2); // -PI/2 (south pole) .. 0
        const cr = Math.cos(lat);
        return {
          point: { x: cl * cr * r, y: -h / 2 + r * Math.sin(lat), z: sl * cr * r },
          normal: { x: cl * cr, y: Math.sin(lat), z: sl * cr },
        };
      }
      if (u <= fCap + fCyl) {
        const b = fCyl > 0 ? (u - fCap) / fCyl : 0;
        return {
          point: { x: cl * r, y: -h / 2 + b * h, z: sl * r },
          normal: { x: cl, y: 0, z: sl },
        };
      }
      const lat = ((u - fCap - fCyl) / fCap) * (Math.PI / 2); // 0 .. PI/2 (north pole)
      const cr = Math.cos(lat);
      return {
        point: { x: cl * cr * r, y: h / 2 + r * Math.sin(lat), z: sl * cr * r },
        normal: { x: cl * cr, y: Math.sin(lat), z: sl * cr },
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

  const viewOf = (p) => ({
    yaw: finite(p.yaw, 0),
    pitch: finite(p.pitch, 30),
    roll: finite(p.roll, 0),
  });

  const projectSample = (p, bounds, u, longitude) => {
    const sample = shapePoint(p, u, longitude);
    const view = viewOf(p);
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
  // line it up positionally with the emitted paths (1:1, same order).
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

  // ── Marker glyphs ────────────────────────────────────────────────────────
  // Every non-line render style emits one of these per sampled point (and along
  // the outline). Straight glyphs carry meta.straight so they stay crisp; the
  // dot glyph is a true 4-anchor bezier circle so it renders perfectly round.

  const markerMeta = (extra) => ({ algorithm: 'spiralizer', marker: true, ...extra });

  const makeSeg = (x1, y1, x2, y2) => {
    const path = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    path.meta = markerMeta({ straight: true });
    return path;
  };

  const makeClosed = (pts) => {
    const path = pts.map((pt) => ({ x: pt.x, y: pt.y }));
    path.push({ x: pts[0].x, y: pts[0].y });
    path.meta = markerMeta({ straight: true, closed: true });
    return path;
  };

  // Returns an ARRAY of paths — '+'/'×' glyphs are two disjoint strokes. `angle`
  // (radians) orients the dash glyph along the local tangent.
  const emitMarker = (style, cx, cy, size, angle) => {
    const r = Math.max(0.2, size * 0.5);
    if (style === 'dots') {
      return [bezierCircle(cx, cy, r, markerMeta({ dot: true }))];
    }
    if (style === 'points') {
      // Solid filled disc — a true 4-anchor bezier circle flagged for fill so the
      // renderer/exporter paint its interior (the filled counterpart of 'dots').
      return [bezierCircle(cx, cy, r, markerMeta({ dot: true, fill: true }))];
    }
    if (style === 'plusses') {
      return [makeSeg(cx - r, cy, cx + r, cy), makeSeg(cx, cy - r, cx, cy + r)];
    }
    if (style === 'crosses') {
      const d = r * 0.70710678;
      return [makeSeg(cx - d, cy - d, cx + d, cy + d), makeSeg(cx - d, cy + d, cx + d, cy - d)];
    }
    if (style === 'squares') {
      return [makeClosed([
        { x: cx - r, y: cy - r }, { x: cx + r, y: cy - r },
        { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r },
      ])];
    }
    if (style === 'triangles') {
      const w = r * 0.866;
      return [makeClosed([
        { x: cx, y: cy - r }, { x: cx + w, y: cy + r * 0.5 }, { x: cx - w, y: cy + r * 0.5 },
      ])];
    }
    if (style === 'dashes') {
      const ca = Math.cos(angle || 0);
      const sa = Math.sin(angle || 0);
      return [makeSeg(cx - ca * r, cy - sa * r, cx + ca * r, cy + sa * r)];
    }
    return [];
  };

  const markerSize = (p, t) => (t < 0.5
    ? finite(p.dotSizeStart, 4) + (finite(p.dotSizeMiddle, 4) - finite(p.dotSizeStart, 4)) * (t * 2)
    : finite(p.dotSizeMiddle, 4) + (finite(p.dotSizeEnd, 4) - finite(p.dotSizeMiddle, 4)) * ((t - 0.5) * 2));

  // ── Universal fill for hollow markers ──────────────────────────────────────
  // The standard Fill dropdown (spiral / hatch / dots / …) patterns the interior
  // of any closed hollow glyph. Each glyph's polygon is handed to the shared
  // pattern-fill generator as a one-off fill region. buildMarkerFillArg maps the
  // panel's `fill<Prop>` params onto the generator's bare `<prop>` keys (e.g.
  // fillDensity → density, fillSpiralTightness → spiralTightness).
  const buildMarkerFillArg = (p, region) => {
    const arg = { region, fillType: p.markerFill };
    Object.keys(p).forEach((k) => {
      if (k.length > 4 && k.slice(0, 4) === 'fill') {
        arg[k.charAt(4).toLowerCase() + k.slice(5)] = p[k];
      }
    });
    return arg;
  };

  const markerFillPaths = (p, region) => {
    if (!region || (p.markerFill || 'none') === 'none') return [];
    const reg = window.Vectura.AlgorithmRegistry;
    const gen = reg && reg._generatePatternFillPaths;
    if (typeof gen !== 'function') return [];
    let out;
    try {
      out = gen(buildMarkerFillArg(p, region)) || [];
    } catch (err) {
      out = [];
    }
    return (out || []).filter((pp) => Array.isArray(pp) && pp.length >= 2);
  };

  // Scatter marker glyphs along a strand at a true arc-length cadence (so the
  // spacing knob reads in surface mm, not in raw sample steps). Visibility, size
  // ramp, local tangent and per-glyph fill are all carried through.
  const emitWrapMarkers = (p, samples, ctx) => {
    const { renderStyle, keepHidden, depthCueOn, fillable, paths } = ctx;
    const spacing = Math.max(0.1, finite(p.dotSpacing, 14));
    const n = samples.length;
    let acc = 0;
    let next = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const pa = a && a.point;
      const pb = b && b.point;
      if (!pa || !pb || !Number.isFinite(pa.x) || !Number.isFinite(pb.x)) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-9) continue;
      const ang = Math.atan2(dy, dx);
      while (next <= acc + segLen) {
        const tt = (next - acc) / segLen;
        next += spacing;
        const near = tt < 0.5 ? a : b;
        if (!(near.visible || keepHidden)) continue;
        const gx = pa.x + dx * tt;
        const gy = pa.y + dy * tt;
        const size = markerSize(p, (i + tt) / Math.max(1, n - 1));
        const glyphs = emitMarker(renderStyle, gx, gy, size, ang);
        glyphs.forEach((mk) => {
          if (!near.visible) G3.markHidden(mk);
          if (depthCueOn && Number.isFinite(near.depth)) mk.meta.depth = near.depth;
          paths.push(mk);
        });
        if (fillable && glyphs.length) {
          markerFillPaths(p, glyphs[0]).forEach((fp) => {
            fp.meta = { algorithm: 'spiralizer', marker: true, markerFill: true };
            if (!near.visible) G3.markHidden(fp);
            if (depthCueOn && Number.isFinite(near.depth)) fp.meta.depth = near.depth;
            paths.push(fp);
          });
        }
      }
      acc += segLen;
    }
  };

  const buildWrapSamples = (p, bounds, lineIndex = 0, lineCount = 1) => {
    const preview = Boolean(p.fastPreview || bounds.fastPreview);
    const resolution = clamp(finite(p.curveResolution, 900), 90, 4000);
    const steps = Math.max(36, Math.round(resolution * (preview ? G3.previewDetailScale(bounds) : 1)));
    const start = (finite(p.startLongitude, 0) * Math.PI) / 180;
    const isHelix = (p.shape || 'ellipsoid') === 'helix';
    // Strand phase offset. For a 2-strand helix (DNA), the backbones are NOT
    // diametrically opposite (180°): a smaller offset (~160°) reproduces the
    // unequal major/minor grooves that read unmistakably as a double helix.
    // 3+ strands and every non-helix shape keep the even 1/n split.
    let phase;
    if (isHelix && lineCount === 2) {
      phase = lineIndex * (finite(p.helixGrooveOffset, 160) * Math.PI) / 180;
    } else {
      phase = (lineIndex / Math.max(1, lineCount)) * TAU;
    }
    const samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let longitude;
      if (isHelix) {
        longitude = start + phase + TAU * finite(p.turns, 18) * t;
      } else if ((p.wrapType || 'spiral') === 'twistedLines') {
        longitude = start + phase + TAU * finite(p.twistTurns, 6) * (t - 0.5);
      } else {
        longitude = start + TAU * finite(p.turns, 18) * t;
      }
      samples.push(projectSample(p, bounds, t, longitude));
    }
    return samples;
  };

  // 2D convex hull (Andrew's monotone chain). For every convex primitive
  // (sphere / ellipsoid / capsule / cylinder / cone / helix envelope) the hull
  // of the projected surface points IS the exact full silhouette — apex, cap
  // rims and barrel sides all included — so "Show outline" outlines the WHOLE
  // shape rather than a pair of latitude bands. Carries each point's depth.
  const convexHull = (input) => {
    const pts = (input || [])
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .map((pt) => ({ x: pt.x, y: pt.y, depth: pt.depth }));
    if (pts.length < 3) return pts;
    pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  // A loop sampled along the toroidal sweep at a fixed poloidal longitude — the
  // torus' inner-hole silhouette, which the outer convex hull can't represent.
  const torusRingAt = (p, bounds, longitude) => {
    const samples = [];
    const steps = 128;
    let depthSum = 0;
    let depthCount = 0;
    for (let i = 0; i <= steps; i++) {
      const s = projectSample(p, bounds, i / steps, longitude);
      samples.push(s.point);
      if (Number.isFinite(s.depth)) { depthSum += s.depth; depthCount += 1; }
    }
    return { points: samples, depth: depthCount ? depthSum / depthCount : null };
  };

  // The helix is a 1D coil, NOT a solid surface — so its "silhouette" must not be
  // the convex hull of the swept cylinder (that draws a barrel around the coil,
  // which is exactly why it read as a cylinder). When the outline is enabled we
  // emit only a single OPEN vertical axis line; the coil strands themselves are
  // the real silhouette. Returns the same { points, depth, open } loop shape.
  const buildHelixOutline = (p, bounds) => {
    const bot = projectSample(p, bounds, 0, 0);
    const top = projectSample(p, bounds, 1, 0);
    if (!bot.point || !top.point || !Number.isFinite(bot.point.x) || !Number.isFinite(top.point.x)) return [];
    const depths = [bot.depth, top.depth].filter((d) => Number.isFinite(d));
    return [{
      points: [{ x: bot.point.x, y: bot.point.y }, { x: top.point.x, y: top.point.y }],
      depth: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null,
      open: true,
    }];
  };

  // Closed silhouette loops for the whole shape (screen space). Returns
  // [{ points:[{x,y}], depth }]. Convex hull for the convex primitives; the
  // torus additionally keeps its inner ring; the helix returns its axis line.
  const buildSilhouette = (p, bounds) => {
    const shape = p.shape || 'ellipsoid';
    if (shape === 'helix') return buildHelixOutline(p, bounds);
    const preview = Boolean(p.fastPreview || bounds.fastPreview);
    const detail = preview ? G3.previewDetailScale(bounds) : 1;
    const uSteps = Math.max(12, Math.round(36 * detail));
    const lSteps = Math.max(24, Math.round(96 * detail));
    const pts = [];
    for (let iu = 0; iu <= uSteps; iu++) {
      const u = iu / uSteps;
      for (let il = 0; il < lSteps; il++) {
        const s = projectSample(p, bounds, u, (il / lSteps) * TAU);
        if (s.point && Number.isFinite(s.point.x)) pts.push({ x: s.point.x, y: s.point.y, depth: s.depth });
      }
    }
    const hull = convexHull(pts);
    if (hull.length < 3) return [];
    const finiteDepths = hull.map((pt) => pt.depth).filter((d) => Number.isFinite(d));
    const depth = finiteDepths.length ? finiteDepths.reduce((a, b) => a + b, 0) / finiteDepths.length : null;
    const loops = [{ points: hull.map((pt) => ({ x: pt.x, y: pt.y })), depth }];
    if (shape === 'torus') loops.push(torusRingAt(p, bounds, Math.PI)); // inner hole rim
    return loops;
  };

  // Walk a polyline at fixed arc-length `step`, invoking cb(x, y, tangent) at each
  // stop. Used to scatter outline markers evenly along the silhouette. Closed by
  // default (wraps last→first); pass open=true for an open path (e.g. the helix
  // axis line) so markers are not back-traced along a phantom closing segment.
  const walkPolyline = (pts, step, cb, open = false) => {
    if (!Array.isArray(pts) || pts.length < 2) return;
    const loop = open ? pts.slice() : pts.concat([pts[0]]);
    let acc = 0;
    let next = 0;
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i];
      const b = loop[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-6) continue;
      const ang = Math.atan2(dy, dx);
      while (next <= acc + segLen) {
        const tt = (next - acc) / segLen;
        cb(a.x + dx * tt, a.y + dy * tt, ang);
        next += step;
      }
      acc += segLen;
    }
  };

  // ── DNA base pairs ─────────────────────────────────────────────────────────
  // When the helix carries two or more twisted strands, optional "rungs" bridge
  // neighbouring strands at evenly-spaced heights — the base-pair ladder that
  // makes a double helix read as DNA. Two strands → a single rung per stop; three
  // or more → a closed ring of rungs (a twisted prism cross-section). Rung
  // spacing is measured in surface units along the strand height; a rung shows
  // whenever either of its endpoints is front-facing (or always, see-through).
  const buildRungs = (p, strandSamples, opts) => {
    if (p.helixRungs === false) return [];
    const strands = strandSamples.length;
    if (strands < 2) return [];
    const steps = (strandSamples[0] || []).length - 1;
    if (steps < 1) return [];
    const keepHidden = !!(opts && opts.keepHidden);
    const depthCueOn = !!(opts && opts.depthCueOn);
    const h = Math.max(1, finite(p.helixHeight, 168));
    const spacing = Math.max(2, finite(p.helixRungSpacing, 16));
    const rungCount = Math.max(1, Math.round(h / spacing));
    const pairs = strands === 2 ? 1 : strands; // close the ring only for 3+ strands
    const out = [];
    for (let r = 0; r <= rungCount; r++) {
      const i = Math.round((r / rungCount) * steps);
      for (let s = 0; s < pairs; s++) {
        const a = strandSamples[s][i];
        const b = strandSamples[(s + 1) % strands][i];
        if (!a || !b || !a.point || !b.point) continue;
        const visible = a.visible || b.visible;
        if (!visible && !keepHidden) continue;
        const path = [{ x: a.point.x, y: a.point.y }, { x: b.point.x, y: b.point.y }];
        path.meta = { algorithm: 'spiralizer', straight: true, rung: true };
        if (!visible) G3.markHidden(path);
        if (depthCueOn) {
          const depths = [Number(a.depth), Number(b.depth)].filter((d) => Number.isFinite(d));
          if (depths.length) path.meta.depth = depths.reduce((x, y) => x + y, 0) / depths.length;
        }
        out.push(path);
      }
    }
    return out;
  };

  // Curve conversion for the SAMPLED geometry — the wrap strands and the
  // silhouette. Mirrors raster-plane's curveSurfacePath contract: the layer's
  // Curves toggle is the master enable, and Smoothing tunes the bezier tension
  // on top of it.
  //
  // The strands and the silhouette are point-samples of a smooth curve, so they
  // must NOT carry meta.straight when curves are wanted — that flag is a hard
  // veto on curve rendering in both the renderer and the SVG exporter, and
  // stamping it unconditionally is what made the Curves toggle a dead switch
  // here. (smoothToBezier clears the flag itself once the tension is non-zero.)
  // Genuinely-straight geometry — the DNA rungs, the marker glyphs — keeps it.
  //
  // `smoothing` is the universal Post-Processing Lab slider (0..1); smoothToBezier's
  // `amount` is 0..100. The tension floor keeps Curves-ON visibly curved at
  // Smoothing 0, so the toggle is never a no-op; the slider then drives it to
  // full tension.
  const curveSampledPath = (path, p) => {
    if (!Array.isArray(path) || path.length < 3) return path; // a 2-point path can't curve
    const smoothAmt = clamp(finite(p.smoothing, 0), 0, 1) * 100;
    if (p.curves === true) return G3.smoothToBezier(path, Math.min(100, 55 + smoothAmt * 0.45));
    return G3.smoothToBezier(path, smoothAmt);
  };

  const buildOutline = (p, bounds) => {
    if ((p.outlineMode || 'outline') === 'none') return [];
    const loops = buildSilhouette(p, bounds);
    if (!loops.length) return [];
    const emphasize = p.emphasizeOutline === true;
    const weightScale = finite(p.outlineWeight, 2);
    const depthCueOn = ((p.depthCue || 'off') !== 'off');
    const renderStyle = p.renderStyle || 'line';
    const out = [];

    if (!isMarkerStyle(renderStyle)) {
      // Line render: the silhouette IS the outline. emphasizeOutline stamps a
      // heavier stroke weight via meta.weightScale.
      loops.forEach((loop) => {
        const path = loop.points.map((pt) => ({ x: pt.x, y: pt.y }));
        // Close the ring so the silhouette renders as a continuous loop (the
        // convex hull is returned open; torus rings already wrap). An OPEN loop
        // (the helix axis line) is left open — never force-closed into a barrel.
        const first = path[0];
        const last = path[path.length - 1];
        if (!loop.open && first && last && Math.hypot(first.x - last.x, first.y - last.y) > 1e-6) {
          path.push({ x: first.x, y: first.y });
        }
        path.meta = { algorithm: 'spiralizer', outline: true, closed: !loop.open, straight: true };
        if (emphasize) path.meta.weightScale = weightScale;
        if (depthCueOn && loop.depth != null) path.meta.depth = loop.depth;
        // The silhouette is a sampled curve too (a hull / torus ring), so it
        // curves with the toggle like the strands do.
        out.push(curveSampledPath(path, p));
      });
      return out;
    }

    // Marker render: trace the silhouette with the same glyph. emphasizeOutline
    // increases the marker frequency along the outline (tighter spacing) so the
    // edge reads clearly even in a stippled style.
    const baseSpacing = Math.max(2, finite(p.dotSpacing, 14));
    const step = emphasize ? Math.max(1.5, baseSpacing * 0.45) : baseSpacing;
    const size = finite(p.dotSizeMiddle, 4);
    loops.forEach((loop) => {
      walkPolyline(loop.points, step, (x, y, ang) => {
        emitMarker(renderStyle, x, y, size, ang).forEach((mk) => {
          mk.meta.outline = true;
          if (depthCueOn && loop.depth != null) mk.meta.depth = loop.depth;
          out.push(mk);
        });
      }, loop.open === true);
    });
    return out;
  };

  window.Vectura.AlgorithmRegistry.spiralizer = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const paths = [];
      const hiddenLineMode = p.hiddenLineMode || 'backface';
      const keepHidden = (p.surfaceMode || 'front') === 'seeThrough' || hiddenLineMode === 'dash';
      const depthCueOn = ((p.depthCue || 'off') !== 'off');
      const renderStyle = p.renderStyle || 'line';
      const marker = isMarkerStyle(renderStyle);
      const isHelix = (p.shape || 'ellipsoid') === 'helix';
      const wrapType = p.wrapType || 'spiral';
      // The helix shape spawns `helixCount` phase-offset strands (double / triple
      // helix); twistedLines spawns `lineCount`; everything else is a single coil.
      let lineCount = 1;
      if (isHelix) lineCount = Math.max(1, Math.round(clamp(finite(p.helixCount, 1), 1, 8)));
      else if (wrapType === 'twistedLines') lineCount = Math.max(1, Math.round(clamp(finite(p.lineCount, 16), 1, 160)));

      const fillable = marker && isFillableStyle(renderStyle);
      const strandSamples = [];
      for (let line = 0; line < lineCount; line++) {
        const samples = buildWrapSamples(p, bounds, line, lineCount);
        strandSamples.push(samples);
        if (marker) {
          emitWrapMarkers(p, samples, { renderStyle, keepHidden, depthCueOn, fillable, paths });
        } else {
          const split = splitPathByVisibility(samples, { keepHidden, visibleOnly: !keepHidden });
          const runDepths = depthCueOn ? depthRuns(samples, keepHidden, !keepHidden) : null;
          split.forEach((path, idx) => {
            path.meta = { ...(path.meta || {}), algorithm: 'spiralizer', straight: true };
            if (runDepths && idx < runDepths.length && runDepths[idx] != null) {
              path.meta.depth = runDepths[idx];
            }
            paths.push(curveSampledPath(path, p));
          });
        }
      }
      // DNA base-pair rungs bridge the twisted strands (only meaningful for the
      // helix shape with two or more twists).
      if (isHelix) paths.push(...buildRungs(p, strandSamples, { keepHidden, depthCueOn }));
      paths.push(...buildOutline(p, bounds));
      // Enhancement #2 — depth cue. No-op when depthCue is 'off'; skips
      // hidden-line paths so their dashes win.
      G3.applyDepthCue(paths, p);
      // Line-weight selector — multiply every path's effective stroke weight so a
      // single "Thickness" choice thickens the whole drawing (composing with any
      // depth-cue / outline weightScale already stamped above).
      const thicknessScale = clamp(finite(parseFloat(p.thickness), 1), 0.1, 6);
      if (thicknessScale !== 1) {
        paths.forEach((path) => {
          if (!path) return;
          path.meta = path.meta || {};
          const existing = Number(path.meta.weightScale);
          path.meta.weightScale = (Number.isFinite(existing) ? existing : 1) * thicknessScale;
        });
      }
      return G3.cleanPaths(paths);
    },
    formula: () => 'Parametric surface / helix wrap projected with front/back normal tests.',
  };
})();
