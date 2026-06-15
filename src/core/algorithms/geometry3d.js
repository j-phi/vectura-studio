/**
 * Shared geometry helpers for 3D-ish procedural algorithms.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const TAU = Math.PI * 2;
  const EPS = 1e-6;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const degToRad = (deg) => (finite(deg) * Math.PI) / 180;
  const lerp = (a, b, t) => a + (b - a) * t;

  const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => v(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => v(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
  const length = (a) => Math.hypot(a.x, a.y, a.z);
  const normalize = (a) => {
    const len = length(a) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  };

  const rotatePoint = (point, angles = {}) => {
    let { x, y, z } = point;
    const yaw = degToRad(angles.yaw ?? angles.rotate ?? 0);
    const pitch = degToRad(angles.pitch ?? angles.tilt ?? 0);
    const roll = degToRad(angles.roll ?? 0);

    let c = Math.cos(yaw);
    let s = Math.sin(yaw);
    [x, z] = [x * c + z * s, -x * s + z * c];

    c = Math.cos(pitch);
    s = Math.sin(pitch);
    [y, z] = [y * c - z * s, y * s + z * c];

    c = Math.cos(roll);
    s = Math.sin(roll);
    [x, y] = [x * c - y * s, x * s + y * c];
    return v(x, y, z);
  };

  // Orthographic by default. When options.focal is a positive number the point
  // is projected through a one-point pinhole: nearer geometry (higher z, toward
  // the viewer) is magnified, farther geometry shrinks toward a vanishing point.
  // z is carried through unchanged so downstream back-face / depth tests are
  // unaffected. The near plane is clamped so points at/behind the camera produce
  // a large-but-finite scale instead of an infinity blow-up.
  const projectPoint = (point, options = {}) => {
    const scale = options.scale ?? 1;
    const focal = options.focal;
    if (Number.isFinite(focal) && focal > 0) {
      const near = focal * 0.05;
      const denom = focal + (options.cameraDist ?? 0) - point.z;
      if (denom <= near) {
        // At/behind the near plane. Collapse to the vanishing point instead of
        // magnifying the vertex off-screen (these algorithms test only back-face
        // visibility, not camera depth, so a behind-camera point would otherwise
        // shoot a spurious long line at extreme camera-distance/depth settings).
        return { x: options.centerX ?? 0, y: options.centerY ?? 0, z: point.z, behind: true };
      }
      const s = (focal / denom) * scale;
      return {
        x: (options.centerX ?? 0) + point.x * s,
        y: (options.centerY ?? 0) - point.y * s,
        z: point.z,
      };
    }
    return {
      x: (options.centerX ?? 0) + point.x * scale,
      y: (options.centerY ?? 0) - point.y * scale,
      z: point.z,
    };
  };

  // Reads the shared projection params off a layer's params object and returns
  // the projectPoint options for them — {} (orthographic, the exact legacy
  // arithmetic) unless `projection === 'perspective'`. Algorithms spread this
  // into every projectPoint options object so one toggle drives all of them.
  const resolveProjection = (p) => {
    if (!p || (p.projection || 'orthographic') !== 'perspective') return {};
    return {
      // Floor at 1 (not 50) so a very short "Perspective Strength" produces an
      // extreme wide-angle look; the projectPoint near-plane clamp keeps points
      // at/behind the camera finite, so small values are safe.
      focal: Math.max(1, finite(p.focalLength, 520)),
      cameraDist: Math.max(0, finite(p.cameraDistance, 620)),
    };
  };

  const pathWithMeta = (points, meta = null) => {
    const path = (points || [])
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .map((pt) => ({ x: pt.x, y: pt.y }));
    if (meta) path.meta = JSON.parse(JSON.stringify(meta));
    return path;
  };

  const pointEquals2 = (a, b, eps = EPS) =>
    !!a && !!b && Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) <= eps;

  const cleanPath = (path, options = {}) => {
    if (!Array.isArray(path)) return path;
    const out = [];
    path.forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      if (out.length && pointEquals2(out[out.length - 1], pt, options.epsilon ?? EPS)) return;
      out.push({ x: pt.x, y: pt.y });
    });
    if (options.closed && out.length >= 2 && !pointEquals2(out[0], out[out.length - 1])) {
      out.push({ x: out[0].x, y: out[0].y });
    }
    if (path.meta) out.meta = JSON.parse(JSON.stringify(path.meta));
    return out;
  };

  const cleanPaths = (paths) =>
    (paths || [])
      .map((path) => cleanPath(path))
      .filter((path) => Array.isArray(path) && path.length >= 2);

  const closePath = (path) => {
    const out = cleanPath(path);
    if (out.length >= 2 && !pointEquals2(out[0], out[out.length - 1])) out.push({ ...out[0] });
    if (path?.meta) out.meta = JSON.parse(JSON.stringify(path.meta));
    return out;
  };

  const markHidden = (path, extra = {}) => {
    if (!Array.isArray(path)) return path;
    path.meta = {
      ...(path.meta || {}),
      hiddenLine: true,
      strokeDash: extra.strokeDash || path.meta?.strokeDash || [3, 2],
      ...extra,
    };
    return path;
  };

  const getPathStrokeDash = (path) => {
    const meta = path?.meta || {};
    if (Array.isArray(meta.strokeDash) && meta.strokeDash.length) {
      const dash = meta.strokeDash.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
      if (dash.length) return dash;
    }
    if (meta.hiddenLine) return [3, 2];
    return null;
  };

  const circlePath = (cx, cy, r, segments = 48, meta = null) => {
    const pts = [];
    const count = Math.max(8, Math.round(segments));
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * TAU;
      pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
    return pathWithMeta(pts, { closed: true, ...(meta || {}) });
  };

  // A closed circle built from FOUR cubic-bezier anchors (the canonical
  // kappa = 0.5522847498 construction) instead of an N-gon polyline. Stamps
  // meta.anchors + forceCurves + closed so both the canvas renderer (tracePath)
  // and the SVG exporter (pathToSvg) draw it as native cubics — a truly round
  // dot rather than a faceted polygon — even when the owning layer's `curves`
  // toggle is off. The path array itself carries the 4 cardinal points as a
  // finite-polyline fallback for hit-testing / optimization passes.
  const KAPPA = 0.5522847498307936;
  const bezierCircle = (cx, cy, r, meta = null) => {
    const k = r * KAPPA;
    const path = pathWithMeta(
      [
        { x: cx + r, y: cy },
        { x: cx, y: cy + r },
        { x: cx - r, y: cy },
        { x: cx, y: cy - r },
        { x: cx + r, y: cy }, // closing vertex → geometrically closed fallback polyline
      ],
      { closed: true, forceCurves: true, ...(meta || {}) }
    );
    path.meta.anchors = [
      { x: cx + r, y: cy, in: { x: cx + r, y: cy - k }, out: { x: cx + r, y: cy + k } },
      { x: cx, y: cy + r, in: { x: cx + k, y: cy + r }, out: { x: cx - k, y: cy + r } },
      { x: cx - r, y: cy, in: { x: cx - r, y: cy + k }, out: { x: cx - r, y: cy - k } },
      { x: cx, y: cy - r, in: { x: cx - k, y: cy - r }, out: { x: cx + k, y: cy - r } },
    ];
    delete path.meta.straight;
    return path;
  };

  const faceNormal = (vertices) => {
    if (!Array.isArray(vertices) || vertices.length < 3) return v(0, 0, 1);
    return normalize(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])));
  };

  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  const collectEdges = (faces = []) => {
    const edges = new Map();
    faces.forEach((face, faceIndex) => {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const key = edgeKey(a, b);
        if (!edges.has(key)) edges.set(key, { a, b, faces: [] });
        edges.get(key).faces.push(faceIndex);
      }
    });
    return Array.from(edges.values());
  };

  const splitPathByVisibility = (samples, options = {}) => {
    const keepHidden = options.keepHidden === true;
    const visibleOnly = options.visibleOnly !== false;
    const paths = [];
    let current = null;
    let currentVisible = null;
    const flush = () => {
      if (!current || current.length < 2) {
        current = null;
        return;
      }
      const path = pathWithMeta(current, currentVisible ? null : { hiddenLine: true, strokeDash: [3, 2] });
      if (currentVisible || keepHidden) paths.push(path);
      current = null;
    };
    (samples || []).forEach((sample) => {
      if (!sample?.point) return;
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
      current.push(sample.point);
    });
    flush();
    return paths;
  };

  const rotate2 = (pt, angleDeg, origin = { x: 0, y: 0 }) => {
    const a = degToRad(angleDeg);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = pt.x - origin.x;
    const y = pt.y - origin.y;
    return { x: origin.x + x * c - y * s, y: origin.y + x * s + y * c };
  };

  const pointKey = (pt, precision = 3) => `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)}`;

  const linkSegments = (segments, options = {}) => {
    const precision = Number.isFinite(options.precision) ? options.precision : 3;
    const map = new Map();
    const used = new Set();
    const key = (pt) => pointKey(pt, precision);
    segments.forEach((seg, idx) => {
      if (!Array.isArray(seg) || seg.length < 2) return;
      const a = key(seg[0]);
      const b = key(seg[1]);
      if (!map.has(a)) map.set(a, []);
      if (!map.has(b)) map.set(b, []);
      map.get(a).push({ idx, end: 0 });
      map.get(b).push({ idx, end: 1 });
    });

    const paths = [];
    segments.forEach((seg, idx) => {
      if (!Array.isArray(seg) || seg.length < 2 || used.has(idx)) return;
      used.add(idx);
      const path = [{ ...seg[0] }, { ...seg[1] }];
      let changed = true;
      while (changed) {
        changed = false;
        const tailMatches = map.get(key(path[path.length - 1])) || [];
        const tail = tailMatches.find((entry) => !used.has(entry.idx));
        if (tail) {
          used.add(tail.idx);
          const next = segments[tail.idx];
          path.push({ ...(tail.end === 0 ? next[1] : next[0]) });
          changed = true;
        }
        const headMatches = map.get(key(path[0])) || [];
        const head = headMatches.find((entry) => !used.has(entry.idx));
        if (head) {
          used.add(head.idx);
          const next = segments[head.idx];
          path.unshift({ ...(head.end === 0 ? next[1] : next[0]) });
          changed = true;
        }
      }
      paths.push(path);
    });
    return paths;
  };

  const marchingSquares = (field, width, height, levels, options = {}) => {
    const rows = field.length - 1;
    const cols = rows >= 0 ? field[0].length - 1 : 0;
    if (rows <= 0 || cols <= 0) return [];
    const left = options.left ?? 0;
    const top = options.top ?? 0;
    const cellW = width / cols;
    const cellH = height / rows;
    const interp = (p0, p1, v0, v1, t) => {
      const ratio = Math.abs(v1 - v0) < EPS ? 0.5 : (t - v0) / (v1 - v0);
      return { x: lerp(p0.x, p1.x, ratio), y: lerp(p0.y, p1.y, ratio) };
    };
    const cases = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
      5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
      9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[1, 3]],
      13: [[0, 1]], 14: [[3, 0]],
    };
    const out = [];
    (levels || []).forEach((threshold) => {
      const segments = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v0 = field[y][x];
          const v1 = field[y][x + 1];
          const v2 = field[y + 1][x + 1];
          const v3 = field[y + 1][x];
          const idx =
            (v0 >= threshold ? 1 : 0) |
            (v1 >= threshold ? 2 : 0) |
            (v2 >= threshold ? 4 : 0) |
            (v3 >= threshold ? 8 : 0);
          const config = cases[idx];
          if (!config) continue;
          const p0 = { x: left + x * cellW, y: top + y * cellH };
          const p1 = { x: left + (x + 1) * cellW, y: top + y * cellH };
          const p2 = { x: left + (x + 1) * cellW, y: top + (y + 1) * cellH };
          const p3 = { x: left + x * cellW, y: top + (y + 1) * cellH };
          const edgePoint = [
            interp(p0, p1, v0, v1, threshold),
            interp(p1, p2, v1, v2, threshold),
            interp(p2, p3, v2, v3, threshold),
            interp(p3, p0, v3, v0, threshold),
          ];
          config.forEach(([a, b]) => segments.push([edgePoint[a], edgePoint[b]]));
        }
      }
      linkSegments(segments).forEach((path) => out.push(path));
    });
    return out;
  };

  // Convert a sampled polyline into a true smooth bezier path by attaching
  // Catmull-Rom-derived cubic handles (tension/6, matching GeometryUtils
  // .rebuildShapeAnchors) to every point. The returned path drops `meta.straight`
  // and stamps `meta.forceCurves = true` + `meta.anchors`, so both the canvas
  // renderer (tracePath) and the SVG exporter (pathToSvg) draw it as native
  // cubics EVEN when the owning layer has its `curves` toggle off — i.e. raising
  // a *Smoothing slider is what curves the line, independent of the layer flag.
  // amount is 0..100; amount <= 0 is a no-op that preserves the exact polyline
  // (and its `straight` flag), so smoothing-off output stays byte-identical.
  // options.simplifyTolerance (px, default 0): when > 0 the densely-sampled input
  // polyline is Visvalingam-simplified BEFORE handles are fit, so the emitted
  // bezier is defined by a sparse set of shape-anchors instead of one cubic per
  // ~2px sample. This is what makes a sliced contour both visibly smooth AND
  // "optimized / elegant when deconstructed" in SVG export — fitting handles to
  // an oversampled polyline yields sub-pixel handles whose curve is visually
  // identical to the chords (i.e. smoothing with no perceptible effect).
  const smoothToBezier = (path, amount, options = {}) => {
    const tension = clamp(finite(amount) / 100, 0, 1);
    if (!Array.isArray(path) || tension <= EPS) return path;
    // Drop non-finite points up front (matching pathWithMeta/cleanPath) so a NaN
    // coordinate can't produce NaN bezier handles that survive into 'C NaN …'.
    let clean = path.filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
    if (clean.length < 3) return path;
    const tol = finite(options.simplifyTolerance, 0);
    if (tol > EPS) {
      const GU = (typeof window !== 'undefined') && window.Vectura && window.Vectura.GeometryUtils;
      const reduced = GU && GU.simplifyPathVisvalingam ? GU.simplifyPathVisvalingam(clean, tol) : clean;
      if (Array.isArray(reduced) && reduced.length >= 3) clean = reduced;
    }
    const closed = options.closed != null
      ? options.closed
      : pointEquals2(clean[0], clean[clean.length - 1]);
    const pts = closed ? clean.slice(0, -1) : clean;
    const n = pts.length;
    if (n < 3) return path;
    const anchors = pts.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));
    for (let i = 0; i < n; i++) {
      const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
      const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
      const dx = ((next.x - prev.x) * tension) / 6;
      const dy = ((next.y - prev.y) * tension) / 6;
      anchors[i].out = { x: anchors[i].x + dx, y: anchors[i].y + dy };
      anchors[i].in = { x: anchors[i].x - dx, y: anchors[i].y - dy };
    }
    const out = pts.map((pt) => ({ x: pt.x, y: pt.y }));
    if (closed) out.push({ x: pts[0].x, y: pts[0].y });
    out.meta = { ...(path.meta || {}), anchors, forceCurves: true, closed };
    delete out.meta.straight;
    return out;
  };

  // Live-drag preview fidelity for the 3D algorithms. The document-setup
  // "3D Preview Quality" control writes SETTINGS.preview3dQuality, which the
  // engine forwards as bounds.preview3dQuality. Returns a 0..1 detail multiplier
  // applied ONLY during a fast preview; returns 1 (full fidelity) otherwise, so
  // final renders are never down-rated. Higher than the legacy hardcoded factors
  // by default so dragging a 3D shape already looks closer to the final.
  const PREVIEW_QUALITY_SCALE = { draft: 0.4, balanced: 0.65, high: 1 };
  const previewDetailScale = (bounds) => {
    if (!bounds || !bounds.fastPreview) return 1;
    const scale = PREVIEW_QUALITY_SCALE[bounds.preview3dQuality];
    return Number.isFinite(scale) ? scale : PREVIEW_QUALITY_SCALE.balanced;
  };
  // Scale a full-detail ceiling down to the active preview quality (rounded,
  // never below 4). Used by algorithms whose preview path caps a count/detail.
  const previewCap = (bounds, fullCap) => Math.max(4, Math.round(finite(fullCap) * previewDetailScale(bounds)));

  // ── Shared 3D enhancement helpers (depth cue / silhouette / hidden-line / hatch) ──
  // All of these are pure given their inputs and OFF unless an algorithm opts in.

  // Resolve a unit light direction from azimuth (deg around the screen, 0 = +x,
  // CCW) + elevation (deg above the screen plane toward the viewer, +z). Pure.
  const resolveLight = (p) => {
    const az = degToRad(finite(p && p.lightAzimuth, 135));
    const el = degToRad(finite(p && p.lightElevation, 45));
    const cosEl = Math.cos(el);
    return normalize(v(Math.cos(az) * cosEl, Math.sin(az) * cosEl, Math.sin(el)));
  };

  // Enhancement #2 — depth cueing via dash density. Reads each path's
  // `meta.depth` (a representative camera-space z the algorithm stamps; larger =
  // nearer). Paths without a finite depth are skipped; paths flagged
  // `meta.hiddenLine` are left untouched (their hidden dashes win). Near paths get
  // a tight/solid dash, far paths an open/sparse dash, blended by strength
  // (0–100). Mutates and returns the same array. Deterministic.
  const applyDepthCue = (paths, p) => {
    if (!Array.isArray(paths) || !paths.length) return paths;
    if (((p && p.depthCue) || 'off') === 'off') return paths;
    let min = Infinity;
    let max = -Infinity;
    paths.forEach((path) => {
      const depth = path && path.meta ? Number(path.meta.depth) : NaN;
      if (!Number.isFinite(depth)) return;
      if (depth < min) min = depth;
      if (depth > max) max = depth;
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return paths;
    const range = max - min;
    const strength = clamp(finite(p && p.depthCueStrength, 60), 0, 100) / 100;
    paths.forEach((path) => {
      if (!path || !path.meta) return;
      if (path.meta.hiddenLine) return; // hidden-line dashes win
      const depth = Number(path.meta.depth);
      if (!Number.isFinite(depth)) return;
      // 0 (far) .. 1 (near)
      const near = range > EPS ? (depth - min) / range : 1;
      const far = 1 - near;
      // far → larger dash + larger gap (sparser); near → tight dash.
      const dashLen = lerp(6, 2, near);
      const gap = lerp(0.5, 5, far) * strength;
      // strength 0 collapses the gap to ~0 (effectively solid); strength up opens it.
      path.meta.strokeDash = [Math.max(1, dashLen), Math.max(0.1, gap)];
    });
    return paths;
  };

  // Enhancement #3 — silhouette (outline) extraction. Returns polyline paths for
  // each edge shared by exactly one front + one back face. `faces` = vertex-index
  // arrays; `projected` = screen {x,y} per vertex; `faceFront` = boolean per face.
  // options.weightScale (default 2) is stamped on every emitted path's meta.
  const extractSilhouette = (faces, projected, faceFront, options = {}) => {
    if (!Array.isArray(faces) || !Array.isArray(projected) || !Array.isArray(faceFront)) return [];
    const weightScale = finite(options.weightScale, 2);
    const edges = collectEdges(faces);
    const out = [];
    edges.forEach((edge) => {
      if (edge.faces.length !== 2) return;
      const f0 = !!faceFront[edge.faces[0]];
      const f1 = !!faceFront[edge.faces[1]];
      if (f0 === f1) return; // need one front + one back
      const a = projected[edge.a];
      const b = projected[edge.b];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
      out.push(pathWithMeta([a, b], { outline: true, weightScale, straight: true }));
    });
    return out;
  };

  // Enhancement #3 — crease (feature-edge) extraction. `edges` from collectEdges,
  // `faceNormals` an array of 3D normals per face. Emits the screen edge when its
  // two adjacent faces' normals differ by more than `angleDeg`. `projected` maps
  // vertex index → screen point. options.weightScale default 2.
  const extractCreases = (edges, faceNormals, angleDeg, projected, options = {}) => {
    if (!Array.isArray(edges) || !Array.isArray(faceNormals) || !Array.isArray(projected)) return [];
    const weightScale = finite(options.weightScale, 2);
    const cosThreshold = Math.cos(degToRad(clamp(angleDeg, 0, 180)));
    const out = [];
    edges.forEach((edge) => {
      if (edge.faces.length !== 2) return;
      const n0 = faceNormals[edge.faces[0]];
      const n1 = faceNormals[edge.faces[1]];
      if (!n0 || !n1) return;
      const d = clamp(dot(normalize(n0), normalize(n1)), -1, 1);
      if (d >= cosThreshold) return; // angle <= threshold → not a crease
      const a = projected[edge.a];
      const b = projected[edge.b];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
      out.push(pathWithMeta([a, b], { crease: true, weightScale, straight: true }));
    });
    return out;
  };

  const polygonBounds = (polygon) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const pt = polygon[i];
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { minX, minY, maxX, maxY };
  };

  const pointInPolygon = (pt, polygon) => {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (!a || !b) continue;
      const intersect =
        ((a.y > pt.y) !== (b.y > pt.y)) &&
        (pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || EPS) + a.x);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Enhancement #4 — screen-space painter occlusion. `segments` =
  // [{a:{x,y,z}, b:{x,y,z}, meta}] (z = camera depth, larger = nearer).
  // `occluders` = [{polygon:[{x,y}], depth}] front-facing screen polygons. Each
  // segment is sampled along its length; a sample is hidden when it falls inside a
  // NEARER occluder (occluder.depth > sample.z + depthBias). mode 'remove' drops
  // hidden runs; mode 'dash' routes them through markHidden. Per-segment AABB
  // rejection against occluder bounding boxes keeps the cost bounded. Deterministic.
  // Optional: tag segments and occluders with a matching `owner` to exclude
  // self-occlusion (an occluder never hides a segment sharing its owner).
  const occludeSegments = (segments, occluders, opts = {}) => {
    if (!Array.isArray(segments)) return [];
    const mode = opts.mode === 'dash' ? 'dash' : 'remove';
    const depthBias = finite(opts.depthBias, 0.5);
    if (!Array.isArray(occluders) || !occluders.length) {
      // Nothing occludes — return every segment as a visible path.
      return segments
        .filter((seg) => seg && seg.a && seg.b)
        .map((seg) => pathWithMeta([seg.a, seg.b], seg.meta ? { ...seg.meta } : null));
    }
    const occ = occluders
      .filter((o) => o && Array.isArray(o.polygon) && o.polygon.length >= 3)
      .map((o) => ({ polygon: o.polygon, depth: finite(o.depth, 0), bbox: polygonBounds(o.polygon), owner: o.owner }));
    const samplesFor = (seg) => {
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
      // ~one sample per 3px, clamped 8..120 for bounded cost.
      return clamp(Math.round(len / 3) + 2, 8, 120);
    };
    const out = [];
    segments.forEach((seg) => {
      if (!seg || !seg.a || !seg.b) return;
      const za = finite(seg.a.z, 0);
      const zb = finite(seg.b.z, 0);
      const segMinX = Math.min(seg.a.x, seg.b.x);
      const segMaxX = Math.max(seg.a.x, seg.b.x);
      const segMinY = Math.min(seg.a.y, seg.b.y);
      const segMaxY = Math.max(seg.a.y, seg.b.y);
      // AABB-reject occluders that cannot overlap this segment. When a segment
      // carries an `owner` (e.g. a bar id), occluders from the SAME owner are
      // skipped so a convex prism's large faces never self-occlude their own
      // silhouette edges — depthBias alone can't separate a big face's near and
      // far edges the way it can for small mesh triangles.
      const segOwner = seg.owner;
      const relevant = occ.filter((o) =>
        (o.owner == null || o.owner !== segOwner) &&
        o.bbox.maxX >= segMinX && o.bbox.minX <= segMaxX &&
        o.bbox.maxY >= segMinY && o.bbox.minY <= segMaxY);
      const steps = samplesFor(seg);
      const runs = [];
      let current = null;
      let currentVisible = null;
      const flush = () => {
        if (current && current.length >= 2) runs.push({ visible: currentVisible, pts: current });
        current = null;
      };
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(seg.a.x, seg.b.x, t);
        const y = lerp(seg.a.y, seg.b.y, t);
        const z = lerp(za, zb, t);
        let hidden = false;
        for (let k = 0; k < relevant.length; k++) {
          const o = relevant[k];
          if (o.depth <= z + depthBias) continue; // not nearer than the sample
          if (x < o.bbox.minX || x > o.bbox.maxX || y < o.bbox.minY || y > o.bbox.maxY) continue;
          if (pointInPolygon({ x, y }, o.polygon)) { hidden = true; break; }
        }
        const visible = !hidden;
        if (current && currentVisible !== visible) flush();
        if (!current) { current = []; currentVisible = visible; }
        current.push({ x, y });
      }
      flush();
      runs.forEach((run) => {
        if (run.visible) {
          out.push(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null));
        } else if (mode === 'dash') {
          const path = pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null);
          out.push(markHidden(path));
        }
        // mode 'remove' drops hidden runs entirely.
      });
    });
    return out;
  };

  // Enhancement #4b — depth-buffer painter occlusion. For a DENSE occluder set (a
  // surface meshed into thousands of triangles, e.g. a heightfield sheet) the
  // per-segment polygon test in occludeSegments is O(segments × occluders) and
  // dominates cost. Here we rasterize all occluder triangles into a screen-space
  // depth buffer once (O(occluder area)), then each segment sample is an O(1)
  // buffer lookup. Occlusion accuracy is bounded by the buffer cell size, not the
  // triangle count, so this is both faster AND finer than the polygon path for
  // dense meshes. `tris` = [[{x,y,d},{x,y,d},{x,y,d}], …] with d = camera depth
  // (larger = nearer). A sample is hidden when buffer depth > sample.z + depthBias.
  // mode/meta handling matches occludeSegments. Deterministic.
  const occludeSegmentsDepthBuffer = (segments, tris, opts = {}) => {
    if (!Array.isArray(segments)) return [];
    const mode = opts.mode === 'dash' ? 'dash' : 'remove';
    const depthBias = finite(opts.depthBias, 0.5);
    // Slope-scaled depth bias (a.k.a. polygon offset). When the line being tested
    // lies ON the occluder surface (e.g. a terrain scanline against its own
    // heightfield), a steep front face packs a large depth range into a single
    // buffer cell, so the cell's stored near-depth overshoots the line's
    // interpolated z and the line is falsely self-occluded ("depth acne" → dotted
    // lines). Adding bias proportional to the LOCAL depth gradient absorbs that
    // per-cell thickness on steep faces while leaving flat regions tight, so
    // genuine occlusion (an occluder ahead by more than one surface-thickness) is
    // preserved. 0 = off (back-compatible for callers that don't pass it).
    const slopeScale = Math.max(0, finite(opts.slopeScale, 0));
    const triList = Array.isArray(tris)
      ? tris.filter((t) => Array.isArray(t) && t.length >= 3 && t[0] && t[1] && t[2])
      : [];
    const passthrough = () => segments
      .filter((seg) => seg && seg.a && seg.b)
      .map((seg) => pathWithMeta([seg.a, seg.b], seg.meta ? { ...seg.meta } : null));
    if (!triList.length) return passthrough();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < triList.length; i++) {
      const t = triList[i];
      for (let k = 0; k < 3; k++) {
        const p = t[k];
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
    }
    if (!(maxX > minX) || !(maxY > minY)) return passthrough();
    const maxDim = Math.max(64, finite(opts.maxDim, 1500));
    const span = Math.max(maxX - minX, maxY - minY);
    const cell = Math.max(finite(opts.cellSize, 1.5), span / maxDim);
    const cols = Math.max(1, Math.min(maxDim, Math.ceil((maxX - minX) / cell) + 1));
    const rows = Math.max(1, Math.min(maxDim, Math.ceil((maxY - minY) / cell) + 1));
    const buf = new Float32Array(cols * rows).fill(-Infinity);
    const px = (x) => (x - minX) / cell;
    const py = (y) => (y - minY) / cell;
    // Rasterize each triangle, writing the nearer (larger) interpolated depth.
    for (let i = 0; i < triList.length; i++) {
      const t = triList[i];
      const ax = px(t[0].x), ay = py(t[0].y);
      const bx = px(t[1].x), by = py(t[1].y);
      const ccx = px(t[2].x), ccy = py(t[2].y);
      const den = (by - ccy) * (ax - ccx) + (ccx - bx) * (ay - ccy);
      if (Math.abs(den) < 1e-9) continue;
      const inv = 1 / den;
      const da = finite(t[0].d, 0), db = finite(t[1].d, 0), dc = finite(t[2].d, 0);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, ccx)));
      const x1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx, ccx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, ccy)));
      const y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by, ccy)));
      for (let y = y0; y <= y1; y++) {
        const fy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const fx = x + 0.5;
          const w0 = ((by - ccy) * (fx - ccx) + (ccx - bx) * (fy - ccy)) * inv;
          const w1 = ((ccy - ay) * (fx - ccx) + (ax - ccx) * (fy - ccy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
          const d = w0 * da + w1 * db + w2 * dc;
          const k = y * cols + x;
          if (d > buf[k]) buf[k] = d;
        }
      }
    }
    const depthAt = (x, y) => {
      const gx = Math.round(px(x)), gy = Math.round(py(y));
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return -Infinity;
      return buf[gy * cols + gx];
    };
    // Largest absolute depth difference to a 4-neighbour cell — the surface's
    // local per-pixel thickness used to scale the self-occlusion bias. Empty
    // (-Infinity) neighbours are skipped so silhouette edges don't inflate it.
    const slopeAt = (x, y) => {
      if (slopeScale <= 0) return 0;
      const gx = Math.round(px(x)), gy = Math.round(py(y));
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return 0;
      const here = buf[gy * cols + gx];
      if (!Number.isFinite(here)) return 0;
      let maxGrad = 0;
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let n = 0; n < nbs.length; n++) {
        const nx = gx + nbs[n][0], ny = gy + nbs[n][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nb = buf[ny * cols + nx];
        if (!Number.isFinite(nb)) continue;
        const g = Math.abs(nb - here);
        if (g > maxGrad) maxGrad = g;
      }
      return maxGrad;
    };
    const out = [];
    segments.forEach((seg) => {
      if (!seg || !seg.a || !seg.b) return;
      const za = finite(seg.a.z, 0);
      const zb = finite(seg.b.z, 0);
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
      const steps = clamp(Math.round(len / cell) + 2, 8, 600);
      const runs = [];
      let current = null;
      let currentVisible = null;
      const flush = () => {
        if (current && current.length >= 2) runs.push({ visible: currentVisible, pts: current });
        current = null;
      };
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(seg.a.x, seg.b.x, t);
        const y = lerp(seg.a.y, seg.b.y, t);
        const z = lerp(za, zb, t);
        const visible = !(depthAt(x, y) > z + depthBias + slopeScale * slopeAt(x, y));
        if (current && currentVisible !== visible) flush();
        if (!current) { current = []; currentVisible = visible; }
        current.push({ x, y });
      }
      flush();
      runs.forEach((run) => {
        if (run.visible) {
          out.push(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null));
        } else if (mode === 'dash') {
          out.push(markHidden(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null)));
        }
      });
    });
    return out;
  };

  // Floating-horizon hidden-line removal for stacked profile curves — the classic
  // heightfield-scanline algorithm (think "Unknown Pleasures" ridgelines). Rows are
  // processed strictly near→far; a sample is VISIBLE iff it falls outside the
  // screen-Y band already covered by nearer rows at its column (above the running
  // upper horizon, or below the running lower horizon). Because a row is only ever
  // tested against NEARER rows — never the surface it sits on — there is no
  // self-occlusion "acne", no depth-buffer quantisation gaps, and no back-slope
  // leaks; visible spans emerge as long continuous runs (plotter-friendly).
  //
  // `rows` = [{ pts:[{x,y}], depth, occludes, meta }] in raw projected screen space
  // (depth = camera z, larger = nearer). occludes:false rows (rivers, coastline)
  // are tested against the horizon but don't extend it. opts.angle (radians) is the
  // image-plane roll: points are de-rolled so the silhouette band is measured along
  // true screen-up, then rolled back on output. opts.eps is the screen-space
  // tolerance (px) that keeps silhouette-grazing lines whole and prevents
  // adjacent-row z-fighting. mode 'dash' keeps hidden runs via markHidden; 'remove'
  // drops them. Deterministic.
  const occludeRowsFloatingHorizon = (rows, opts = {}) => {
    const mode = opts.mode === 'dash' ? 'dash' : 'remove';
    const eps = Math.max(0, finite(opts.eps, 0.75));
    // Roll is the final 2D image-plane rotation (projectPoint flips world-Y to
    // screen-Y, so the net screen rotation is by +roll). De-roll by -roll so the
    // horizon band is taken along screen-up, then roll each emitted point back.
    const ang = finite(opts.angle, 0);
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const deRoll = (p) => ({ x: p.x * cs + p.y * sn, y: -p.x * sn + p.y * cs });
    const reRoll = (p) => ({ x: p.x * cs - p.y * sn, y: p.x * sn + p.y * cs });
    const valid = (Array.isArray(rows) ? rows : [])
      .map((r) => (r && Array.isArray(r.pts))
        ? { meta: r.meta, depth: finite(r.depth, 0), occludes: r.occludes !== false,
            pts: r.pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(deRoll) }
        : null)
      .filter((r) => r && r.pts.length >= 2);
    if (!valid.length) return [];
    let minX = Infinity, maxX = -Infinity;
    valid.forEach((r) => r.pts.forEach((p) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }));
    if (!(maxX > minX)) {
      return valid.map((r) => pathWithMeta(r.pts.map(reRoll), r.meta ? { ...r.meta } : null));
    }
    const res = Math.max(finite(opts.resolution, 1), (maxX - minX) / 4000);
    const cols = Math.max(1, Math.min(4001, Math.floor((maxX - minX) / res) + 1));
    const colOf = (x) => clamp(Math.round((x - minX) / res), 0, cols - 1);
    const upper = new Float32Array(cols).fill(Infinity);   // topmost (min screen-y) covered
    const lower = new Float32Array(cols).fill(-Infinity);  // bottommost (max screen-y) covered
    // Read the horizon by linear interpolation between bracketing columns (matching
    // the column-centre convention of the extend pass), so a CONTINUOUS sample-y is
    // tested against a CONTINUOUS horizon instead of a per-column step function. This
    // is what kills the stipple at high Depth Slices + X Resolution: with the stepped
    // horizon, dense samples sweeping across column boundaries saw the horizon jump
    // discretely and flipped visible/hidden sample-to-sample; interpolating removes
    // those jumps so a row stays a clean run.
    const horizonAt = (arr, x, fill) => {
      const cf = clamp((x - minX) / res, 0, cols - 1);
      const c0 = Math.floor(cf);
      const c1 = Math.min(c0 + 1, cols - 1);
      const a = arr[c0], b = arr[c1];
      const aF = Number.isFinite(a), bF = Number.isFinite(b);
      if (aF && bF) return a + (b - a) * (cf - c0);
      // At a silhouette edge (one neighbour uncovered) the band is genuinely
      // discontinuous — snap to the nearest column instead of holding the finite
      // value across the whole gap, so the opaque band stops at the true edge
      // (±½ column) rather than spilling a full column into open sky.
      if (aF) return (cf - c0) <= 0.5 ? a : fill;
      if (bF) return (cf - c0) >= 0.5 ? b : fill;
      return fill;
    };
    // Stable near→far order (largest depth first); ties keep input order.
    const order = valid.map((r, i) => i).sort((a, b) => {
      const d = valid[b].depth - valid[a].depth;
      return d !== 0 ? d : a - b;
    });
    const out = [];
    for (let oi = 0; oi < order.length; oi++) {
      const r = valid[order[oi]];
      // 1) Split the row into visible / hidden runs against the current horizon.
      let current = null, curVis = null;
      const flush = () => {
        if (current && current.length >= 2) {
          const pts = current.map(reRoll);
          if (curVis) out.push(pathWithMeta(pts, r.meta ? { ...r.meta } : null));
          else if (mode === 'dash') out.push(markHidden(pathWithMeta(pts, r.meta ? { ...r.meta } : null)));
        }
        current = null;
      };
      const test = (x, y) => {
        const up = horizonAt(upper, x, Infinity);
        const lo = horizonAt(lower, x, -Infinity);
        // Hidden only when strictly inside the opaque band by the eps margin.
        const visible = !(y > up + eps && y < lo - eps);
        if (current && curVis !== visible) flush();
        if (!current) { current = []; curVis = visible; }
        current.push({ x, y });
      };
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = clamp(Math.round(len / res) + 1, 1, 4000);
        for (let k = (s === 0 ? 0 : 1); k <= steps; k++) {
          const t = k / steps;
          test(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
        }
      }
      flush();
      // 2) Extend the horizon with this opaque row so farther rows see its
      //    silhouette. Rasterise every column the row spans (fills near-vertical
      //    segments) and accumulate the per-column top/bottom extent.
      if (r.occludes) {
        for (let s = 0; s < r.pts.length - 1; s++) {
          const a = r.pts[s], b = r.pts[s + 1];
          let c0 = colOf(a.x), c1 = colOf(b.x);
          if (c0 > c1) { const tmp = c0; c0 = c1; c1 = tmp; }
          const dx = b.x - a.x;
          for (let c = c0; c <= c1; c++) {
            const xc = minX + c * res;
            const t = Math.abs(dx) < 1e-9 ? 0 : clamp((xc - a.x) / dx, 0, 1);
            const y = lerp(a.y, b.y, t);
            if (y < upper[c]) upper[c] = y;
            if (y > lower[c]) lower[c] = y;
          }
        }
      }
    }
    return out;
  };

  // Enhancement #5 primitive — clip parallel scan lines to a closed screen
  // polygon. Lines run at opts.angleDeg, spaced opts.spacing (hard floor 1). Each
  // returned path is a 2-point segment with meta {hatch:true, straight:true}.
  const hatchPolygon = (polygon, opts = {}) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return [];
    const spacing = Math.max(1, finite(opts.spacing, 6));
    const angle = degToRad(finite(opts.angleDeg, 45));
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    // Perpendicular axis we step along between scan lines.
    const perpX = -dirY;
    const perpY = dirX;
    // Project all vertices onto the perpendicular axis to find scan-line extent.
    let pMin = Infinity;
    let pMax = -Infinity;
    polygon.forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const proj = pt.x * perpX + pt.y * perpY;
      if (proj < pMin) pMin = proj;
      if (proj > pMax) pMax = proj;
    });
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) return [];
    const out = [];
    const maxLines = 2000; // bounded cost
    const count = Math.min(maxLines, Math.floor((pMax - pMin) / spacing));
    const n = polygon.length;
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * spacing;
      // Intersect the infinite line {p · perp = offset} with each polygon edge.
      const hits = [];
      for (let e = 0, f = n - 1; e < n; f = e++) {
        const a = polygon[f];
        const b = polygon[e];
        if (!a || !b) continue;
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) continue; // edge doesn't cross
        const t = (offset - pa) / ((pb - pa) || EPS);
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t);
        // Position along the scan-line direction (sort key).
        hits.push({ s: x * dirX + y * dirY, x, y });
      }
      if (hits.length < 2) continue;
      hits.sort((p, q) => p.s - q.s);
      // Pair consecutive crossings into interior spans (even-odd fill rule).
      for (let h = 0; h + 1 < hits.length; h += 2) {
        const p0 = hits[h];
        const p1 = hits[h + 1];
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < EPS) continue;
        out.push(pathWithMeta([{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }], { hatch: true, straight: true }));
      }
    }
    return out;
  };

  // Enhancement #5 — Lambert-shaded hatching of one front face. shade =
  // max(0, dot(normalize(normal), lightVec)); darker (lower shade) → denser
  // hatch. Emits one pass; when opts.crossHatch is on AND the face is dark enough
  // (shade below crossThreshold) a second perpendicular pass is added.
  const lambertHatch = (normal3d, lightVec, polygon, opts = {}) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return [];
    const shade = Math.max(0, dot(normalize(normal3d || v(0, 0, 1)), normalize(lightVec || v(0, 0, 1))));
    const baseSpacing = Math.max(1, finite(opts.baseSpacing, finite(opts.spacing, 6)));
    const angleDeg = finite(opts.angleDeg, 45);
    // Darker faces get tighter spacing; lit faces space out.
    // shade 1 (fully lit) → 2.5× spacing; shade 0 (dark) → 1× spacing.
    const spacing = Math.max(1, baseSpacing * (1 + shade * 1.5));
    const out = hatchPolygon(polygon, { angleDeg, spacing });
    const crossThreshold = clamp(finite(opts.crossThreshold, 0.45), 0, 1);
    if (opts.crossHatch && shade < crossThreshold) {
      hatchPolygon(polygon, { angleDeg: angleDeg + 90, spacing }).forEach((seg) => out.push(seg));
    }
    return out;
  };

  const api = {
    TAU,
    EPS,
    clamp,
    finite,
    degToRad,
    lerp,
    smoothToBezier,
    resolveProjection,
    resolveLight,
    applyDepthCue,
    extractSilhouette,
    extractCreases,
    occludeSegments,
    occludeSegmentsDepthBuffer,
    occludeRowsFloatingHorizon,
    hatchPolygon,
    lambertHatch,
    previewDetailScale,
    previewCap,
    v,
    add,
    sub,
    mul,
    dot,
    cross,
    length,
    normalize,
    rotatePoint,
    projectPoint,
    pathWithMeta,
    cleanPath,
    cleanPaths,
    closePath,
    markHidden,
    getPathStrokeDash,
    circlePath,
    bezierCircle,
    faceNormal,
    edgeKey,
    collectEdges,
    splitPathByVisibility,
    rotate2,
    linkSegments,
    marchingSquares,
  };

  Vectura.Geometry3D = {
    ...(Vectura.Geometry3D || {}),
    ...api,
  };
})();
