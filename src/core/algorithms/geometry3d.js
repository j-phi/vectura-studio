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
      focal: Math.max(50, finite(p.focalLength, 520)),
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
  const smoothToBezier = (path, amount, options = {}) => {
    const tension = clamp(finite(amount) / 100, 0, 1);
    if (!Array.isArray(path) || tension <= EPS) return path;
    // Drop non-finite points up front (matching pathWithMeta/cleanPath) so a NaN
    // coordinate can't produce NaN bezier handles that survive into 'C NaN …'.
    const clean = path.filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
    if (clean.length < 3) return path;
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

  const api = {
    TAU,
    EPS,
    clamp,
    finite,
    degToRad,
    lerp,
    smoothToBezier,
    resolveProjection,
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
