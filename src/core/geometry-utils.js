/**
 * Shared geometry helpers for path smoothing/simplification and cloning.
 */
(() => {
  // A path's meta can carry a parametric description of its outline — bezier
  // `anchors` and an embedded `shape` (oval/poly). Renderer.tracePath draws the
  // visible curve from those anchors. Any step that MUTATES the point array
  // (clip, reflect, simplify) invalidates that parametric outline: it still
  // describes the pre-mutation curve. Drop it so the renderer falls back to the
  // true polyline. `kind:'shape'` is demoted to polygon/polyline by closure of
  // the mutated points; `kind:'circle'` is left to its own (separate) handling.
  const stripCurveMeta = (meta, points) => {
    if (!meta || typeof meta !== 'object') return meta;
    if (!meta.anchors && !meta.shape && meta.kind !== 'shape') return meta;
    const next = { ...meta };
    delete next.anchors;
    delete next.shape;
    if (next.kind === 'shape') {
      const closed = Array.isArray(points) && points.length > 2
        ? Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 1e-6
        : meta.closed === true;
      next.kind = closed ? 'polygon' : 'polyline';
      next.closed = closed;
    }
    return next;
  };

  const smoothPath = (path, amount) => {
    if (!amount || amount <= 0 || path.length < 3) return path;
    const smoothed = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const avgX = (prev.x + next.x) / 2;
      const avgY = (prev.y + next.y) / 2;
      smoothed.push({
        x: curr.x * (1 - amount) + avgX * amount,
        y: curr.y * (1 - amount) + avgY * amount,
      });
    }
    smoothed.push(path[path.length - 1]);
    if (path.meta) smoothed.meta = path.meta;
    return smoothed;
  };

  const simplifyPath = (path, tolerance) => {
    if (!tolerance || tolerance <= 0 || path.length < 3) return path;
    const sq = (n) => n * n;
    const distToSegmentSq = (p, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const denom = dx * dx + dy * dy;
      if (denom < 1e-10) return sq(p.x - a.x) + sq(p.y - a.y);
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / denom;
      if (t <= 0) return sq(p.x - a.x) + sq(p.y - a.y);
      if (t >= 1) return sq(p.x - b.x) + sq(p.y - b.y);
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      return sq(p.x - projX) + sq(p.y - projY);
    };

    const keep = new Array(path.length).fill(false);
    keep[0] = true;
    keep[path.length - 1] = true;
    const stack = [[0, path.length - 1]];
    const tolSq = tolerance * tolerance;

    while (stack.length) {
      const [start, end] = stack.pop();
      let maxDist = 0;
      let index = -1;
      for (let i = start + 1; i < end; i++) {
        const dist = distToSegmentSq(path[i], path[start], path[end]);
        if (dist > maxDist) {
          maxDist = dist;
          index = i;
        }
      }
      if (maxDist > tolSq && index !== -1) {
        keep[index] = true;
        stack.push([start, index]);
        stack.push([index, end]);
      }
    }

    const simplified = path.filter((_, i) => keep[i]);
    if (path.meta) simplified.meta = stripCurveMeta(path.meta, simplified);
    return simplified.length >= 2 ? simplified : path;
  };

  const simplifyPathVisvalingam = (path, tolerance) => {
    if (!tolerance || tolerance <= 0 || path.length < 3) return path;
    const areaThreshold = tolerance * tolerance;
    const pts = path.map((pt) => ({ x: pt.x, y: pt.y }));
    const keep = new Array(pts.length).fill(true);
    const area = new Array(pts.length).fill(Infinity);
    const triArea = (a, b, c) => Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);

    for (let i = 1; i < pts.length - 1; i++) {
      area[i] = triArea(pts[i - 1], pts[i], pts[i + 1]);
    }

    const findNext = (idx, dir) => {
      let i = idx + dir;
      while (i > 0 && i < pts.length - 1 && !keep[i]) i += dir;
      return i;
    };

    while (true) {
      let minArea = Infinity;
      let minIndex = -1;
      for (let i = 1; i < pts.length - 1; i++) {
        if (!keep[i]) continue;
        if (area[i] < minArea) {
          minArea = area[i];
          minIndex = i;
        }
      }
      if (minIndex === -1 || minArea >= areaThreshold) break;
      keep[minIndex] = false;
      const prev = findNext(minIndex, -1);
      const next = findNext(minIndex, 1);
      if (prev > 0 && next < pts.length) {
        area[prev] = triArea(pts[findNext(prev, -1)], pts[prev], pts[next]);
      }
      if (next < pts.length - 1 && prev >= 0) {
        area[next] = triArea(pts[prev], pts[next], pts[findNext(next, 1)]);
      }
    }

    const simplified = pts.filter((_, i) => keep[i]);
    if (path.meta) simplified.meta = stripCurveMeta(path.meta, simplified);
    return simplified.length >= 2 ? simplified : path;
  };

  const countPathPoints = (paths) => {
    let lines = 0;
    let points = 0;
    (paths || []).forEach((path) => {
      if (!Array.isArray(path)) return;
      lines += 1;
      points += path.length;
    });
    return { lines, points };
  };

  const clonePaths = (paths) =>
    (paths || []).map((path) => {
      if (!Array.isArray(path)) return path;
      const next = path.map((pt) => ({ ...pt }));
      if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
      return next;
    });

  // --- Anchor helpers (shared with renderer for shape-layer simplify/smooth) ---

  const cloneAnchors = (anchors) =>
    (anchors || []).map((a) => ({
      x: a.x,
      y: a.y,
      in: a.in ? { x: a.in.x, y: a.in.y } : null,
      out: a.out ? { x: a.out.x, y: a.out.y } : null,
    }));

  const pointsToAnchors = (points) =>
    (points || []).map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));

  const cubicAtT = (p0, c1, c2, p1, t) => {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    const a = uu * u;
    const b = 3 * uu * t;
    const c = 3 * u * tt;
    const d = tt * t;
    return {
      x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    };
  };

  // Adaptive cubic-bezier sampler — recursive de Casteljau subdivision until
  // each emitted chord is within `tolerance` (world units, mm) of the true
  // curve. Replaces the prior `rough / 4` uniform-step heuristic, which
  // under-sampled segments with short chord + long handles and produced
  // visible facets at high screen zoom.
  //
  // Flatness metric: perpendicular distance from each control point to the
  // chord p0→p1. When both are below tolerance the curve segment is treated
  // as visually flat and emitted as a single line; otherwise it's split at
  // t=0.5 and the two halves are processed recursively. maxDepth bounds the
  // worst-case sample count at 2^maxDepth + 1 per input segment so
  // pathological inputs (huge handles, cusps) can't blow up render time.
  const sampleCubicBezier = (p0, c1, c2, p1, tolerance = 0.1, maxDepth = 12) => {
    const pts = [{ x: p0.x, y: p0.y }];
    const tolSq = tolerance * tolerance;
    const recurse = (a0, a1, a2, a3, depth) => {
      const dx = a3.x - a0.x;
      const dy = a3.y - a0.y;
      const chordLenSq = dx * dx + dy * dy;
      if (depth >= maxDepth || chordLenSq < tolSq) {
        pts.push({ x: a3.x, y: a3.y });
        return;
      }
      // Perpendicular distance² from each control point to the chord a0→a3.
      // Numerator |cross| ÷ |chord| → distance; squaring both sides keeps the
      // comparison sqrt-free: dist² ≤ tol²  ⇔  num² ≤ tol² · chord².
      const c1Cross = (a1.x - a0.x) * dy - (a1.y - a0.y) * dx;
      const c2Cross = (a2.x - a0.x) * dy - (a2.y - a0.y) * dx;
      const flatThreshSq = tolSq * chordLenSq;
      if (c1Cross * c1Cross <= flatThreshSq && c2Cross * c2Cross <= flatThreshSq) {
        pts.push({ x: a3.x, y: a3.y });
        return;
      }
      // de Casteljau split at t = 0.5.
      const m01x = (a0.x + a1.x) * 0.5, m01y = (a0.y + a1.y) * 0.5;
      const m12x = (a1.x + a2.x) * 0.5, m12y = (a1.y + a2.y) * 0.5;
      const m23x = (a2.x + a3.x) * 0.5, m23y = (a2.y + a3.y) * 0.5;
      const m012x = (m01x + m12x) * 0.5, m012y = (m01y + m12y) * 0.5;
      const m123x = (m12x + m23x) * 0.5, m123y = (m12y + m23y) * 0.5;
      const m0123x = (m012x + m123x) * 0.5, m0123y = (m012y + m123y) * 0.5;
      const mid = { x: m0123x, y: m0123y };
      recurse(a0, { x: m01x, y: m01y }, { x: m012x, y: m012y }, mid, depth + 1);
      recurse(mid, { x: m123x, y: m123y }, { x: m23x, y: m23y }, a3, depth + 1);
    };
    recurse(p0, c1, c2, p1, 0);
    return pts;
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  const segmentIntersection = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-9) return null;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  };

  const segmentCircleIntersections = (a, b, center, radius) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    const sqrt = Math.sqrt(disc);
    const t1 = (-B - sqrt) / (2 * A);
    const t2 = (-B + sqrt) / (2 * A);
    return [t1, t2].filter((t) => t >= 0 && t <= 1);
  };

  const splitPathByShape = (path, shape) => {
    if (!Array.isArray(path) || path.length < 2) return null;
    const EPS = 1e-6;

    // Side classification: +1 outside cut region, -1 inside, 0 on the cut shape.
    // For a line cut "outside" is the +halfplane; for circle/rect "outside" is
    // beyond the boundary. The sign convention doesn't matter — we only care
    // whether two points lie on opposite sides.
    const sideOf = (pt) => {
      if (shape.mode === 'line' && shape.line) {
        const { a, b } = shape.line;
        const v = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const sd = v / len;
        return sd > EPS ? 1 : sd < -EPS ? -1 : 0;
      }
      if (shape.mode === 'circle' && shape.circle) {
        const dx = pt.x - shape.circle.x;
        const dy = pt.y - shape.circle.y;
        const v = Math.hypot(dx, dy) - shape.circle.r;
        return v > EPS ? 1 : v < -EPS ? -1 : 0;
      }
      if (shape.mode === 'rect' && shape.rect) {
        const { x, y, w, h } = shape.rect;
        const dx = Math.max(x - pt.x, pt.x - (x + w));
        const dy = Math.max(y - pt.y, pt.y - (y + h));
        if (dx > EPS || dy > EPS) return 1;
        if (dx < -EPS && dy < -EPS) return -1;
        return 0;
      }
      return 0;
    };

    const sides = path.map(sideOf);

    const fp = path[0];
    const lp = path[path.length - 1];
    const isClosed = path.length > 2 &&
      Math.abs(fp.x - lp.x) < 1e-4 && Math.abs(fp.y - lp.y) < 1e-4;

    // Walk backward from index i to find the previous non-zero side. For closed
    // paths, wraps through the end. Used to test "transversal vs tangent" at a
    // vertex that sits exactly on the cut shape.
    const prevNonZeroSide = (i) => {
      for (let k = i - 1; k >= 0; k--) {
        if (sides[k] !== 0) return sides[k];
      }
      if (isClosed) {
        for (let k = path.length - 2; k > i; k--) {
          if (sides[k] !== 0) return sides[k];
        }
      }
      return 0;
    };

    const segmentTs = (a, b) => {
      let ts = [];
      if (shape.mode === 'line' && shape.line) {
        const t = segmentIntersection(a, b, shape.line.a, shape.line.b);
        if (t !== null) ts.push(t);
      } else if (shape.mode === 'rect' && shape.rect) {
        const { x, y, w, h } = shape.rect;
        const r1 = { x, y };
        const r2 = { x: x + w, y };
        const r3 = { x: x + w, y: y + h };
        const r4 = { x, y: y + h };
        [segmentIntersection(a, b, r1, r2),
          segmentIntersection(a, b, r2, r3),
          segmentIntersection(a, b, r3, r4),
          segmentIntersection(a, b, r4, r1),
        ].forEach((t) => { if (t !== null) ts.push(t); });
      } else if (shape.mode === 'circle' && shape.circle) {
        ts = segmentCircleIntersections(a, b, shape.circle, shape.circle.r);
      }
      return ts;
    };

    // Build a list of cuts in path order: { segIndex, t, point }. Each cut
    // belongs to segment [segIndex, segIndex+1] at parameter t in [0, 1).
    const cuts = [];
    let startVertexIsCut = false;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const sa = sides[i];
      const sb = sides[i + 1];

      if (sa !== 0 && sb !== 0) {
        if (sa !== sb) {
          // Interior crossing — use shape-specific intersection math.
          let ts = segmentTs(a, b).filter((t) => t > EPS && t < 1 - EPS).sort((p, q) => p - q);
          ts.forEach((t) => {
            cuts.push({ segIndex: i, t, point: { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) } });
          });
        }
      } else if (sa === 0 && sb !== 0) {
        // Vertex `a` lies on the cut shape. Treat it as a true crossing only
        // when the previous non-zero side is opposite to sb (transversal),
        // not when the polyline merely grazes the cut (tangent).
        const prev = prevNonZeroSide(i);
        if (prev !== 0 && prev !== sb) {
          cuts.push({ segIndex: i, t: 0, point: { x: a.x, y: a.y } });
          if (i === 0) startVertexIsCut = true;
        }
      }
      // (sa !== 0, sb === 0) and (sa === 0, sb === 0) are handled by the next
      // iteration where the zero vertex becomes `a`.
    }

    if (cuts.length === 0) return null;

    // Walk the path and split at each cut. A cut at t === 0 is at the start of
    // its segment; a cut at t > 0 is interior.
    const output = [];
    let current = [];
    let cutIdx = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (current.length === 0) current.push({ x: a.x, y: a.y });
      while (cutIdx < cuts.length && cuts[cutIdx].segIndex === i) {
        const cut = cuts[cutIdx];
        if (cut.t > EPS) current.push({ x: cut.point.x, y: cut.point.y });
        if (current.length > 1) output.push(current);
        current = [{ x: cut.point.x, y: cut.point.y }];
        cutIdx++;
      }
      current.push({ x: b.x, y: b.y });
    }
    if (current.length > 1) output.push(current);

    // For closed polylines (first point == last point), the head piece that
    // started at path[0] and the tail piece that ends at path[0] are the same
    // contiguous region of the loop separated only by the artificial loop seam
    // — merge them so the cut doesn't emit a spurious extra segment near the
    // start anchor. Skip this when path[0] is itself a real cut point, in
    // which case the head/tail seam coincides with the cut and must be kept.
    if (isClosed && output.length >= 2 && !startVertexIsCut) {
      const head = output[0];
      const tail = output[output.length - 1];
      const headStartsAtStart = Math.abs(head[0].x - fp.x) < 1e-4 && Math.abs(head[0].y - fp.y) < 1e-4;
      const tailEndsAtStart = Math.abs(tail[tail.length - 1].x - fp.x) < 1e-4 && Math.abs(tail[tail.length - 1].y - fp.y) < 1e-4;
      if (headStartsAtStart && tailEndsAtStart) {
        const merged = [...tail, ...head.slice(1)];
        output.pop();
        output[0] = merged;
      }
    }
    return output;
  };

  const buildPolylineFromAnchors = (anchors, closed = false) => {
    if (!Array.isArray(anchors) || anchors.length < 2) return [];
    const pts = [];
    const count = anchors.length;
    const emit = (a, b) => {
      let seg;
      if (!a.out && !b.in) seg = [a, b];
      else seg = sampleCubicBezier(a, a.out || a, b.in || b, b);
      if (pts.length) seg.shift();
      pts.push(...seg);
    };
    for (let i = 0; i < count - 1; i++) emit(anchors[i], anchors[i + 1]);
    if (closed && count >= 2) emit(anchors[count - 1], anchors[0]);
    return pts;
  };

  const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

  // RDP on a flat anchor list (positions only). Returns a list of indices to keep.
  // For closed paths, set keepLast=false (the caller wraps).
  const rdpAnchorKeepIndices = (anchors, tolerance) => {
    const n = anchors.length;
    const keep = new Array(n).fill(false);
    if (n === 0) return keep;
    keep[0] = true;
    keep[n - 1] = true;
    if (n < 3 || !tolerance || tolerance <= 0) {
      for (let i = 0; i < n; i++) keep[i] = true;
      return keep;
    }
    const tolSq = tolerance * tolerance;
    const sq = (v) => v * v;
    const distToSegmentSq = (p, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const denom = dx * dx + dy * dy;
      if (denom < 1e-10) return sq(p.x - a.x) + sq(p.y - a.y);
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / denom;
      if (t <= 0) return sq(p.x - a.x) + sq(p.y - a.y);
      if (t >= 1) return sq(p.x - b.x) + sq(p.y - b.y);
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      return sq(p.x - projX) + sq(p.y - projY);
    };
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [start, end] = stack.pop();
      let maxDist = 0;
      let index = -1;
      for (let i = start + 1; i < end; i++) {
        const d = distToSegmentSq(anchors[i], anchors[start], anchors[end]);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (maxDist > tolSq && index !== -1) {
        keep[index] = true;
        stack.push([start, index]);
        stack.push([index, end]);
      }
    }
    return keep;
  };

  /**
   * Rebuild anchors of a freeform shape path: decimate via RDP scaled by `simplify`,
   * then auto-generate cubic bezier .in/.out handles via Catmull-Rom-to-Bezier scaled
   * by `smoothing`. Pure — no DOM, no engine access.
   *
   * opts:
   *   simplify   0..1 — RDP tolerance scale (tol = simplify * max(dW,dH) * 0.01)
   *   smoothing  0..1 — Catmull-Rom tension; 0 keeps straight (null handles)
   *   closed     bool
   *   bounds     { dW, dH } — for tolerance scaling
   */
  const rebuildShapeAnchors = (anchors, opts = {}) => {
    const simplify = clamp01(opts.simplify ?? 0);
    const smoothing = clamp01(opts.smoothing ?? 0);
    const closed = Boolean(opts.closed);
    const dW = opts.bounds?.dW ?? 100;
    const dH = opts.bounds?.dH ?? 100;

    if (!Array.isArray(anchors) || anchors.length === 0) {
      return { anchors: [], changed: false };
    }

    // 1. Decimate (positions only)
    let kept = anchors;
    if (simplify > 0 && anchors.length >= 3) {
      const tol = simplify * Math.max(dW, dH) * 0.01;
      const keepMask = rdpAnchorKeepIndices(anchors, tol);
      const filtered = anchors.filter((_, i) => keepMask[i]);
      if (filtered.length >= 2) kept = filtered;
    }

    // 2. Bezierize via Catmull-Rom-to-Bezier
    const n = kept.length;
    const out = kept.map((a) => ({ x: a.x, y: a.y, in: null, out: null }));
    if (smoothing > 0 && n >= 2) {
      const tension = smoothing;
      for (let i = 0; i < n; i++) {
        let prev;
        let next;
        if (closed) {
          prev = kept[(i - 1 + n) % n];
          next = kept[(i + 1) % n];
        } else {
          prev = i === 0 ? kept[i] : kept[i - 1];
          next = i === n - 1 ? kept[i] : kept[i + 1];
        }
        const dx = ((next.x - prev.x) * tension) / 6;
        const dy = ((next.y - prev.y) * tension) / 6;
        out[i].out = { x: out[i].x + dx, y: out[i].y + dy };
        out[i].in = { x: out[i].x - dx, y: out[i].y - dy };
      }
      if (!closed) {
        // Endpoints get one-sided derivative — null the outward-pointing handle
        out[0].in = null;
        out[n - 1].out = null;
      }
    }

    const changed = out.length !== anchors.length || smoothing > 0;
    return { anchors: out, changed };
  };

  const isClosedLoopPath = (path) => {
    const fn = typeof window !== 'undefined' && window.Vectura?.OptimizationUtils?.isClosedPath;
    if (fn) return fn(path);
    if (!Array.isArray(path) || path.length < 3) return false;
    const dx = path[0].x - path[path.length - 1].x;
    const dy = path[0].y - path[path.length - 1].y;
    return dx * dx + dy * dy < 1e-6;
  };

  // The flattened polyline IS the display geometry now, so its parametric outline
  // (anchors/shape) is stale and it must render verbatim — tag it `straight`.
  const finalizeFlattened = (points, path, closed) => {
    const meta = path.meta ? { ...path.meta } : {};
    delete meta.anchors;
    delete meta.shape;
    if (meta.kind === 'shape' || meta.kind === 'circle') delete meta.kind;
    meta.straight = true;
    if (closed) meta.closed = true;
    points.meta = meta;
    return points;
  };

  // Flatten the *displayed* curve into a dense polyline that traces exactly what
  // Renderer.tracePath / UI.pathToSvg draw. The masking pipeline clips THIS, not
  // the raw sparse polyline: algorithm output (lissajous, spiral, …) is a coarse
  // polyline whose on-screen smoothness comes entirely from the renderer's
  // midpoint-quadratic interpolation. Clipping the raw polyline cuts along its
  // chords and discards that interpolation, collapsing curves into straight
  // lines at the mask boundary. Flattening first means a masked curve keeps the
  // same shape it has unmasked.
  //
  // Mirrors tracePath's three branches exactly: native cubic when anchors carry
  // bezier handles, straight passthrough (already flat), and midpoint-quadratic
  // for plain polylines. Both curve branches route through sampleCubicBezier
  // (adaptive, tolerance in world units, depth-bounded) by elevating each
  // quadratic span to its equivalent cubic — no density heuristic, zoom-stable.
  const flattenSmoothedPath = (path, tolerance = 0.1) => {
    if (!Array.isArray(path) || path.length < 2 || path.meta?.straight) return path;

    const out = [];
    const append = (samples) => {
      // samples[0] repeats the previous span's endpoint; skip it once chained.
      for (let k = out.length ? 1 : 0; k < samples.length; k++) {
        out.push({ x: samples[k].x, y: samples[k].y });
      }
    };

    const anchors = path.meta?.anchors;
    const hasHandles = Array.isArray(anchors) && anchors.length >= 2
      && anchors.some((a) => a && (a.in || a.out));
    if (hasHandles) {
      const closed = path.meta?.closed === true;
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        append(sampleCubicBezier(a, a.out || a, b.in || b, b, tolerance));
      }
      if (closed) {
        const a = anchors[anchors.length - 1];
        const b = anchors[0];
        append(sampleCubicBezier(a, a.out || a, b.in || b, b, tolerance));
      }
      return finalizeFlattened(out, path, closed);
    }

    if (path.length < 3) return path; // tracePath renders this straight

    // Quadratic span (start, control, end) → equivalent cubic control points.
    const sampleQuad = (s, c, e) => sampleCubicBezier(
      s,
      { x: s.x + (2 / 3) * (c.x - s.x), y: s.y + (2 / 3) * (c.y - s.y) },
      { x: e.x + (2 / 3) * (c.x - e.x), y: e.y + (2 / 3) * (c.y - e.y) },
      e,
      tolerance
    );

    const closed = isClosedLoopPath(path);
    if (closed) {
      const n = path.length - 1;
      const m0 = { x: (path[0].x + path[1].x) / 2, y: (path[0].y + path[1].y) / 2 };
      out.push({ x: m0.x, y: m0.y });
      let prev = m0;
      for (let i = 1; i < n; i++) {
        const mid = { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 };
        append(sampleQuad(prev, path[i], mid));
        prev = mid;
      }
      append(sampleQuad(prev, path[0], m0));
    } else {
      out.push({ x: path[0].x, y: path[0].y });
      let prev = path[0];
      for (let i = 1; i < path.length - 1; i++) {
        const mid = { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 };
        append(sampleQuad(prev, path[i], mid));
        prev = mid;
      }
      const last = path[path.length - 1];
      out.push({ x: last.x, y: last.y });
    }
    return finalizeFlattened(out, path, closed);
  };

  // ── Stroke thickening ───────────────────────────────────────────────────────
  // Thicken single-stroke paths by drawing `width` parallel passes offset along
  // each point's local normal. This is the shared engine behind the "Thickening
  // Mode" control (Parallel / Sinusoidal / Snake) used by multiple algorithms —
  // a pen-plotter way to fake a heavier stroke without true outline fills.
  //
  //   parallel    — N evenly spaced offset copies.
  //   sinusoidal  — each copy's offset is modulated by a sine wave along the path
  //                 so the bundle breathes in and out (looser, hand-drawn feel).
  //   snake       — the N copies are stitched end-to-end into one boustrophedon
  //                 polyline (every other pass reversed) so the pen never lifts.
  //
  // Per-point normals (not a single fixed perpendicular) keep curved strokes —
  // e.g. glyph outlines — thickening cleanly around bends. `width <= 1` is a
  // no-op that returns the input untouched. When `rng` is supplied, exactly one
  // value is consumed per processed path (matching the historical harmonograph
  // stream) so callers stay deterministic.
  const thickenPaths = (paths, opts = {}) => {
    const width = Math.max(1, Math.round(opts.width ?? opts.widthMultiplier ?? 1));
    if (width <= 1 || !Array.isArray(paths)) return paths;
    const spacing = Number.isFinite(opts.spacing) ? opts.spacing : 0.35;
    const mode = opts.mode === 'sinusoidal' || opts.mode === 'snake' ? opts.mode : 'parallel';
    const rng = opts.rng && typeof opts.rng.nextFloat === 'function' ? opts.rng : null;

    const half = (width - 1) / 2;
    const offsets = [];
    for (let i = 0; i < width; i++) offsets.push((i - half) * spacing);

    const thickened = [];
    paths.forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const normals = path.map((pt, i) => {
        const prev = path[i - 1] || pt;
        const next = path[i + 1] || pt;
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const mag = Math.hypot(dx, dy) || 1;
        return { x: -dy / mag, y: dx / mag };
      });
      const phase = rng ? rng.nextFloat() * Math.PI * 2 : 0;
      const waveFreq = 2 + width * 0.4;
      const waveAmp = spacing * 0.6;
      const offsetPaths = offsets.map((offset, idx) =>
        path.map((pt, i) => {
          let off = offset;
          if (mode === 'sinusoidal') {
            const t = path.length > 1 ? i / (path.length - 1) : 0;
            off += Math.sin(t * Math.PI * 2 * waveFreq + phase + idx) * waveAmp;
          }
          const n = normals[i] || { x: 0, y: 0 };
          const out = { x: pt.x + n.x * off, y: pt.y + n.y * off };
          if (pt.meta) out.meta = pt.meta;
          return out;
        })
      );
      if (mode === 'snake' && offsetPaths.length > 1) {
        const snake = [];
        offsetPaths.forEach((p, idx) => {
          if (idx % 2 === 0) snake.push(...p);
          else snake.push(...p.slice().reverse());
        });
        if (path.meta) snake.meta = path.meta;
        thickened.push(snake);
      } else {
        offsetPaths.forEach((p) => {
          if (path.meta) p.meta = path.meta;
          thickened.push(p);
        });
      }
    });
    return thickened.length ? thickened : paths;
  };

  // Thicken an OPEN single-stroke polyline into `width` UNIFORM-width parallel
  // passes. Unlike thickenPaths — which offsets every vertex along its averaged
  // tangent normal at magnitude 1 and therefore PINCHES at a sharp corner (a V
  // apex, an A, a W): there the bisector normal points down the miter but the
  // unit-length offset falls short, so the band's width perpendicular to each arm
  // collapses toward the vertex — this offsets each vertex along the true MITER
  // vector M = (n1 + n2) / (1 + n1·n2), whose length 1/cos(phi/2) exactly
  // compensates the corner so every pass stays at a constant perpendicular
  // distance from BOTH adjacent edges. The result is a bundle of distinct pen
  // strokes (single-stroke plotter DNA preserved — no fill) at uniform weight.
  // Past `miterLimit` the join CLAMPS its length so a needle-acute apex bevels
  // flat instead of spiking to infinity (real glyph apexes stay full-width; see
  // the limit note below). Endpoints use
  // the single adjacent edge normal (butt cap). `width <= 1` is a no-op. Point
  // count is identical across passes (every pass mirrors the skeleton's vertices),
  // and no rng is consumed — deterministic.
  const thickenPathsUniform = (paths, opts = {}) => {
    const width = Math.max(1, Math.round(opts.width ?? opts.widthMultiplier ?? 1));
    if (width <= 1 || !Array.isArray(paths)) return paths;
    const spacing = Number.isFinite(opts.spacing) ? opts.spacing : 0.35;
    // Generous miter limit: real glyph apexes (V, A, W, k, 4 — miter ratio ~4)
    // must keep full width to their sharp point, so we only clamp truly needle
    // spikes. A near-180° reversal is already caught by the `denom` guard below.
    const miterLimit = Number.isFinite(opts.miterLimit) && opts.miterLimit > 1 ? opts.miterLimit : 10;
    const half = (width - 1) / 2;
    const offsets = [];
    for (let i = 0; i < width; i++) offsets.push((i - half) * spacing);

    const out = [];
    paths.forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const n = path.length;
      // Unit normal of each segment i → i+1 (n-1 of them).
      const segN = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        const mag = Math.hypot(dx, dy) || 1;
        segN.push({ x: -dy / mag, y: dx / mag });
      }
      // Per-vertex offset vector `m` such that a point offset by o·m sits at
      // perpendicular distance o from the adjacent edge(s).
      const mv = path.map((pt, i) => {
        const a = segN[i - 1]; // incoming edge normal (undefined at the start)
        const b = segN[i];     // outgoing edge normal (undefined at the end)
        if (!a) return { x: b.x, y: b.y };
        if (!b) return { x: a.x, y: a.y };
        const dot = a.x * b.x + a.y * b.y; // cos(phi) between the edge normals
        const denom = 1 + dot;             // 2 cos²(phi/2) → 0 at a 180° reversal
        if (denom < 1e-6) return { x: a.x, y: a.y }; // near-reversal → butt, no spike
        let mx = (a.x + b.x) / denom;
        let my = (a.y + b.y) / denom;      // |m| = 1/cos(phi/2)
        const len = Math.hypot(mx, my);
        if (len > miterLimit) { mx = (mx / len) * miterLimit; my = (my / len) * miterLimit; }
        return { x: mx, y: my };
      });
      offsets.forEach((o) => {
        const copy = path.map((pt, i) => {
          const m = mv[i];
          const q = { x: pt.x + m.x * o, y: pt.y + m.y * o };
          if (pt.meta) q.meta = pt.meta;
          return q;
        });
        if (path.meta) copy.meta = path.meta;
        out.push(copy);
      });
    });
    return out.length ? out : paths;
  };

  // ── Stroke → clean filled band ───────────────────────────────────────────────
  // Stroke a set of contour polylines into ONE watertight filled band of total
  // pen width `width`, then dissolve every fold, self-overlap, and junction with a
  // boolean union. Method = Minkowski sum of each edge with a disk of radius
  // width/2: every segment becomes a width-wide quad and every vertex a small
  // round-join disk; the union of all of them is the swept area.
  //
  // This is the robust replacement for thickenPaths when the *outline itself*
  // must stay faithful. thickenPaths draws N independent parallel offset copies,
  // which (a) fold over themselves wherever the offset exceeds a curve's radius,
  // and (b) tear apart at junctions (a glyph's t-crossbar, a +) because each
  // contour is offset in isolation. The union here cannot fold (overlapping ink
  // merges) and cannot break (touching strokes weld into one boundary).
  //
  // Returns a FillBoolean multipolygon ([[ [ [x,y]… ]… ]… ]) — pass it through
  // FillBoolean.multiPolygonToPaths for closed boundary rings (e.g. the text
  // outline unions this with the glyph region to get each concentric widening
  // pass). Returns [] when polygon-clipping is unavailable (headless without the
  // vendor lib) or the input is degenerate, so callers can fall back to thickenPaths.
  const strokeRingsToBand = (rings, width, opts = {}) => {
    const FB = opts.boolean
      || (typeof window !== 'undefined' && window.Vectura && window.Vectura.FillBoolean)
      || null;
    if (!FB || typeof FB.union !== 'function' || !Array.isArray(rings)) return [];
    const halfW = Math.max(0, (Number(width) || 0) / 2);
    if (halfW <= 1e-6) return [];
    const joinSides = Math.max(4, Math.round(opts.joinSides || 8));
    const TAU = Math.PI * 2;
    // Pre-build the unit join disk; scale+translate per vertex. `diskPhase`
    // (fraction of one side, default 0 = historical output) rotates the disk
    // sampling so its vertices don't land EXACTLY on the edge quads' corners —
    // that coincidence is a degenerate input that can crash polygon-clipping's
    // sweep line (\"Unable to find segment in SweepLine tree\").
    const phase = Number.isFinite(opts.diskPhase) ? opts.diskPhase : 0;
    const disk = [];
    for (let k = 0; k < joinSides; k += 1) {
      const t = ((k + phase) / joinSides) * TAU;
      disk.push([Math.cos(t) * halfW, Math.sin(t) * halfW]);
    }
    // `joinSkipAngle` (radians, default 0 = historical: disk every vertex) skips
    // the join disk at NEAR-COLLINEAR interior vertices: the uncovered notch
    // between two adjacent quads is only halfW·(1−cos(θ/2)) deep — sub-micron for
    // a densely flattened curve — while each skipped disk removes a whole polygon
    // from the union sweep. This is what makes erosion of a curved band boundary
    // (hundreds of gentle vertices, a handful of real corners) affordable.
    const skipJoinCos = opts.joinSkipAngle > 0 ? Math.cos(opts.joinSkipAngle) : 2;
    // Union per contour first (small unions), then union the contour bands — keeps
    // each polygon-clipping pass bounded instead of one giant N-poly sweep.
    const bands = [];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      const geoms = [];
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i];
        const b = ring[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const mag = Math.hypot(dx, dy);
        if (mag < 1e-9) continue;
        const nx = (-dy / mag) * halfW;
        const ny = (dx / mag) * halfW;
        geoms.push([[[
          [a.x + nx, a.y + ny],
          [b.x + nx, b.y + ny],
          [b.x - nx, b.y - ny],
          [a.x - nx, a.y - ny],
        ]]]);
      }
      for (let i = 0; i < ring.length; i += 1) {
        const c = ring[i];
        if (skipJoinCos <= 1 && i > 0 && i < ring.length - 1) {
          const a = ring[i - 1];
          const b = ring[i + 1];
          const ux = c.x - a.x; const uy = c.y - a.y;
          const wx = b.x - c.x; const wy = b.y - c.y;
          const um = Math.hypot(ux, uy); const wm = Math.hypot(wx, wy);
          if (um > 1e-9 && wm > 1e-9
            && (ux * wx + uy * wy) / (um * wm) >= skipJoinCos) continue;
        }
        geoms.push([[disk.map(([dxp, dyp]) => [c.x + dxp, c.y + dyp])]]);
      }
      if (!geoms.length) continue;
      const band = FB.union(...geoms);
      if (band && band.length) bands.push(band);
    }
    if (!bands.length) return [];
    if (bands.length === 1) return bands[0];
    return FB.union(...bands);
  };

  // ── Faithful flatten of a closed cubic-anchor ring ────────────────────────────
  // Flatten a closed ring of DISPLAY-space anchors into a dense polyline that is
  // FAITHFUL to the letterform: a straight segment (both handles null) stays a
  // single line so its corner vertex is preserved EXACTLY (no midpoint-quadratic
  // rounding), and a curved segment is adaptively subdivided until each chord
  // deviates by less than `tol`. The vertex shared by two segments is always a real
  // point, so sharp corners (V apex, t crossbar, cut terminals, L/E/T/H stems) stay
  // razor-sharp while curves read smooth. This is the base the concentric outline
  // widening miter-offsets. `anchors` are {x,y,in:{x,y}|null,out:{x,y}|null};
  // returns {x,y}[] (closing point appended) or null on degenerate input.
  const flattenAnchorRing = (anchors, tol) => {
    if (!Array.isArray(anchors) || anchors.length < 2) return null;
    const tolAbs = Math.max(1e-4, Number(tol) || 0.08);
    const tolSq = tolAbs * tolAbs;
    const a0 = anchors[0];
    if (!a0 || !Number.isFinite(a0.x) || !Number.isFinite(a0.y)) return null;
    const pts = [{ x: a0.x, y: a0.y }];
    const cubic = (p0, c1, c2, p1, depth) => {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const chordSq = dx * dx + dy * dy;
      if (depth >= 18 || chordSq < tolSq) { pts.push({ x: p1.x, y: p1.y }); return; }
      const d1 = (c1.x - p0.x) * dy - (c1.y - p0.y) * dx;
      const d2 = (c2.x - p0.x) * dy - (c2.y - p0.y) * dx;
      if (d1 * d1 <= tolSq * chordSq && d2 * d2 <= tolSq * chordSq) { pts.push({ x: p1.x, y: p1.y }); return; }
      const m01x = (p0.x + c1.x) * 0.5, m01y = (p0.y + c1.y) * 0.5;
      const m12x = (c1.x + c2.x) * 0.5, m12y = (c1.y + c2.y) * 0.5;
      const m23x = (c2.x + p1.x) * 0.5, m23y = (c2.y + p1.y) * 0.5;
      const a012x = (m01x + m12x) * 0.5, a012y = (m01y + m12y) * 0.5;
      const a123x = (m12x + m23x) * 0.5, a123y = (m12y + m23y) * 0.5;
      const midx = (a012x + a123x) * 0.5, midy = (a012y + a123y) * 0.5;
      cubic(p0, { x: m01x, y: m01y }, { x: a012x, y: a012y }, { x: midx, y: midy }, depth + 1);
      cubic({ x: midx, y: midy }, { x: a123x, y: a123y }, { x: m23x, y: m23y }, p1, depth + 1);
    };
    const n = anchors.length;
    for (let i = 0; i < n; i += 1) {
      const A = anchors[i];
      const B = anchors[(i + 1) % n];
      if (!A || !B || !Number.isFinite(A.x) || !Number.isFinite(A.y) || !Number.isFinite(B.x) || !Number.isFinite(B.y)) return null;
      const hasO = A.out && Number.isFinite(A.out.x) && Number.isFinite(A.out.y);
      const hasI = B.in && Number.isFinite(B.in.x) && Number.isFinite(B.in.y);
      if (hasO || hasI) {
        cubic({ x: A.x, y: A.y }, hasO ? { x: A.out.x, y: A.out.y } : { x: A.x, y: A.y },
          hasI ? { x: B.in.x, y: B.in.y } : { x: B.x, y: B.y }, { x: B.x, y: B.y }, 0);
      } else {
        pts.push({ x: B.x, y: B.y }); // straight segment -> corner preserved exactly
      }
    }
    return pts.length >= 4 ? pts : null; // last == first (closing dup)
  };

  // ── True miter offset of a closed ring — with optional ROUND acute joins ──────
  // Offset a closed ring by a SIGNED distance along a real MITER join (the exact
  // intersection of the two adjacent offset edge-lines), so sharp corners stay sharp
  // (miter) and the offset keeps the source shape, just moved by |delta|. delta > 0
  // EXPANDS the ring's own enclosed interior; delta < 0 SHRINKS it, regardless of
  // source winding (the interior side is found numerically from the shoelace sign, so
  // CFF/CCW and TrueType/CW contours behave identically). The miter length ratio
  // 1/cos(phi/2) grows without bound as a corner nears a 180 deg reversal, so past
  // `miterLimit` the corner is resolved as:
  //   • opts.round !== true  → BEVEL (flat, two edge points). LEGACY behaviour,
  //     BYTE-IDENTICAL to before for every existing caller and unit test.
  //   • opts.round === true  → on the GAP side only (the convex-in-offset side, where
  //     the two offset edges diverge and leave a wedge) emit a ROUND arc of radius
  //     |delta| about the vertex, sampled to `arcTol`; on the OVERLAP (concave) side
  //     keep the bevel and let the caller's boolean union dissolve the crossing.
  // Because every concentric widening pass offsets the SAME base ring independently,
  // pass k's arc (radius k*penW) and pass k+1's arc (radius (k+1)*penW) are concentric
  // about the identical vertex → exactly penW apart radially → pen-width strokes abut
  // with no gap / stairstep / spike at a needle-acute feature (the 'u' spur), while
  // corners within the limit stay MITER-sharp and are never rounded. On a densely-
  // flattened curve the tiny near-collinear miters reconstruct a smooth offset.
  // `points` is {x,y}[] (closing dup tolerated); returns {x,y}[] (closing dup
  // appended) or null when degenerate. Deterministic; no globals, no Math.random.
  const miterOffsetClosedRing = (points, delta, opts = {}) => {
    if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(delta)) return null;
    const miterLimit = Number.isFinite(opts.miterLimit) && opts.miterLimit > 1 ? opts.miterLimit : 16;
    const round = opts.round === true;
    const arcTol = Number.isFinite(opts.arcTol) && opts.arcTol > 0 ? opts.arcTol : 0.08;
    // Dedupe consecutive coincident points and drop a closing duplicate.
    const v = [];
    for (const p of points) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const last = v[v.length - 1];
      if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
      v.push({ x: p.x, y: p.y });
    }
    if (v.length >= 2) {
      const f = v[0];
      const l = v[v.length - 1];
      if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) v.pop();
    }
    const n = v.length;
    if (n < 3) return null;
    // Shoelace sign orients the outward normal (dy,-dx) to always point AWAY from
    // the ring's own interior, so delta>0 grows that interior for any winding.
    let area2 = 0;
    for (let i = 0; i < n; i += 1) {
      const a = v[i];
      const b = v[(i + 1) % n];
      area2 += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(area2) < 1e-12) return null;
    const s = area2 > 0 ? 1 : -1;
    const en = new Array(n); // outward unit normal of edge i (v[i]->v[i+1])
    for (let i = 0; i < n; i += 1) {
      const a = v[i];
      const b = v[(i + 1) % n];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const mag = Math.hypot(dx, dy);
      if (mag < 1e-12) { en[i] = null; continue; }
      dx /= mag; dy /= mag;
      en[i] = { x: s * dy, y: -s * dx };
    }
    const outPts = [];
    // Sample the minor arc of the offset circle (radius |delta|, centre cx,cy) from
    // the offset direction nStart, sweeping the signed exterior angle extSigned. The
    // endpoints land EXACTLY on the two edge-offset points (v+nPrev*delta,
    // v+nCurr*delta), so the arc splices seamlessly into the flanking straight offset
    // edges — no gap. Sampled to arcTol so it never facets; capped for perf. Every
    // point sits at radius |delta| from the vertex → concentric across passes.
    const pushArc = (cx, cy, nStart, extSigned) => {
      const arcLen = Math.abs(extSigned) * Math.abs(delta);
      let steps = Math.ceil(arcLen / arcTol);
      if (!Number.isFinite(steps) || steps < 1) steps = 1;
      if (steps > 64) steps = 64;
      for (let j = 0; j <= steps; j += 1) {
        const th = extSigned * (j / steps);
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const dx = nStart.x * ct - nStart.y * st;
        const dy = nStart.x * st + nStart.y * ct;
        const px = cx + dx * delta;
        const py = cy + dy * delta;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        outPts.push({ x: px, y: py });
      }
    };
    for (let i = 0; i < n; i += 1) {
      let nPrev = en[(i - 1 + n) % n];
      let nCurr = en[i];
      if (!nPrev && !nCurr) continue;
      if (!nPrev) nPrev = nCurr;
      if (!nCurr) nCurr = nPrev;
      let bx = nPrev.x + nCurr.x;
      let by = nPrev.y + nCurr.y;
      const bmag = Math.hypot(bx, by);
      if (bmag < 1e-9) {
        // ~180 deg reversal (degenerate zero-width needle tip): no finite miter and
        // no well-defined sweep side — step straight out (bounded, never spikes). A
        // real (nonzero-width) needle has finite angle and takes the arc branch below.
        outPts.push({ x: v[i].x + nCurr.x * delta, y: v[i].y + nCurr.y * delta });
        continue;
      }
      bx /= bmag; by /= bmag;
      const cos = bx * nCurr.x + by * nCurr.y; // = cos(phi/2), in (0,1]
      const miterScale = 1 / Math.max(1e-6, cos); // exact offset length ratio
      if (miterScale <= miterLimit) {
        // Within limit → sharp miter. Real letter corners (stems, ~90 deg, a ~30 deg
        // V apex) land here and stay razor-sharp regardless of round mode.
        const px = v[i].x + bx * delta * miterScale;
        const py = v[i].y + by * delta * miterScale;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        outPts.push({ x: px, y: py });
      } else if (round) {
        // Genuinely needle-acute. Round ONLY on the gap (convex-in-offset) side so
        // consecutive passes are concentric arcs that abut; on the overlap (concave)
        // side keep the bevel — the caller's boolean union dissolves the crossing, so
        // nothing needles INTO the letter interior.
        const cross = nPrev.x * nCurr.y - nPrev.y * nCurr.x;
        const gapSide = (delta * s * cross) > 0;
        if (gapSide && Math.abs(cross) > 1e-9) {
          const dot = Math.max(-1, Math.min(1, nPrev.x * nCurr.x + nPrev.y * nCurr.y));
          const ext = Math.acos(dot);         // exterior angle in [0, PI]
          const signRot = cross > 0 ? 1 : -1;  // short-way rotation nPrev → nCurr
          pushArc(v[i].x, v[i].y, nPrev, signRot * ext);
        } else {
          outPts.push({ x: v[i].x + nPrev.x * delta, y: v[i].y + nPrev.y * delta });
          outPts.push({ x: v[i].x + nCurr.x * delta, y: v[i].y + nCurr.y * delta });
        }
      } else {
        // Legacy bevel (default when round is not requested) — byte-identical.
        outPts.push({ x: v[i].x + nPrev.x * delta, y: v[i].y + nPrev.y * delta });
        outPts.push({ x: v[i].x + nCurr.x * delta, y: v[i].y + nCurr.y * delta });
      }
    }
    if (outPts.length < 3) return null;
    outPts.push({ x: outPts[0].x, y: outPts[0].y }); // close the ring
    return outPts;
  };

  // ── Erode a filled region by a fixed inset ────────────────────────────────────
  // Shrink a FillBoolean multipolygon ([[ [ [x,y]… ]… ]… ]; ring 0 = shell, rest =
  // holes) inward by `inset` via TRUE morphological erosion: sweep a disk of
  // radius `inset` along every boundary ring (the same Minkowski quad+disk build
  // as strokeRingsToBand — always-valid boolean input) and subtract that swept
  // band from the region. Exactly the points at distance > inset from the
  // boundary survive. This is deliberately NOT an inward miter offset of each
  // ring: eroding a boolean-produced band boundary at offsets comparable to its
  // local feature size makes the offset curve self-cross wildly (swallowtails at
  // every near-collapse neck), and the nonzero resolution of that snarl fabricates
  // phantom lobes far past the true collapse depth. The subtraction is immune —
  // where the region is thinner than 2·inset the cut simply consumes it, and the
  // erosion naturally splits/vanishes at the right depth. Chaining IS sound here
  // (erode(R, a+b) === erode(erode(R, a), b) — subtraction of a valid thin band,
  // not the miter-dilation unions that crash polygon-clipping), and incremental
  // small steps are much cheaper than one deep cut. `opts.minArea` drops
  // micro-sliver polygons below that area (near-collapse boolean crumbs). Returns
  // a normalized multipolygon, or [] when empty / the boolean lib is unavailable.
  const insetMultiPolygon = (multiPolygon, inset, opts = {}) => {
    const FB = opts.boolean
      || (typeof window !== 'undefined' && window.Vectura && window.Vectura.FillBoolean)
      || null;
    if (!FB || typeof FB.union !== 'function' || typeof FB.difference !== 'function') return [];
    if (!Array.isArray(multiPolygon) || !Number.isFinite(inset) || inset <= 0) return [];
    // Snap to a 1e-6 grid: polygon-clipping's sweep line degrades from ms to
    // SECONDS on near-degenerate float configurations (nearly-coincident event
    // points); snapping input coordinates collapses those events. A micron at mm
    // scale is far below any pen. The snapped rings drive BOTH the cut build and
    // the subtraction subject, so subject and clip agree exactly.
    const snap = (v) => Math.round(v * 1e6) / 1e6;
    const snappedMp = [];
    const boundaryRings = [];
    for (const polygon of multiPolygon) {
      if (!Array.isArray(polygon)) continue;
      const outPoly = [];
      for (const ring of polygon) {
        const pts = [];
        for (const q of ring || []) {
          if (Array.isArray(q)) pts.push({ x: snap(q[0]), y: snap(q[1]) });
          else if (q && Number.isFinite(q.x)) pts.push({ x: snap(q.x), y: snap(q.y) });
        }
        if (pts.length < 3) continue;
        // Ensure the sweep closes the loop (strokeRingsToBand walks segments
        // i → i+1 only, so an un-duplicated closing edge would leave a gap).
        const f = pts[0];
        const l = pts[pts.length - 1];
        if (Math.abs(f.x - l.x) > 1e-9 || Math.abs(f.y - l.y) > 1e-9) pts.push({ x: f.x, y: f.y });
        boundaryRings.push(pts);
        outPoly.push(pts.map((q) => [q.x, q.y]));
      }
      if (outPoly.length) snappedMp.push(outPoly);
    }
    if (!boundaryRings.length) return [];
    const joinSides = Math.max(4, Math.round(opts.joinSides || 8));
    // polygon-clipping can still crash on unlucky exactly-coincident sweep
    // events; a sub-percent inset nudge (invisible at pen scale) shifts every
    // event off the degeneracy, so retry before declaring the region gone. A
    // GENUINELY empty erosion (region thinner than 2·inset) returns [] from the
    // first successful attempt and is never retried.
    const attempts = [[inset, 0.5], [inset * 1.0037, 0.29], [inset * 0.9961, 0.71]];
    const joinSkipAngle = Number.isFinite(opts.joinSkipAngle) ? opts.joinSkipAngle : 0.35;
    let region = null;
    for (const [ins, phase] of attempts) {
      try {
        const cut = strokeRingsToBand(boundaryRings, ins * 2, { boolean: FB, joinSides, diskPhase: phase, joinSkipAngle });
        region = (cut && cut.length) ? (FB.difference(snappedMp, cut) || []) : [];
        break;
      } catch (_) { region = null; }
    }
    if (!region || !region.length) return [];
    const minArea = Number.isFinite(opts.minArea) && opts.minArea > 0 ? opts.minArea : 0;
    if (!minArea) return region;
    const kept = region.filter((polygon) => {
      const shell = polygon && polygon[0];
      if (!Array.isArray(shell) || shell.length < 4) return false;
      let s = 0;
      for (let i = 0, n = shell.length; i < n; i += 1) {
        const a = shell[i];
        const b = shell[(i + 1) % n];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s * 0.5) >= minArea;
    });
    return kept;
  };

  // ── Stitch concentric pass rings into continuous snakes ──────────────────────
  // Turn per-pass ring sets (passes[k] = the closed {x,y}[] rings of concentric
  // pass k, outermost first) into a handful of CONTINUOUS polylines: each ring is
  // grafted onto the chain whose free end is nearest, rotated to start at its
  // closest vertex, so the pen spirals inward pass after pass instead of lifting
  // between passes. A ring farther than `joinTol` from every chain end (a region
  // that split during erosion, or the far side of an annulus) starts its own
  // chain. Connectors are at most joinTol long — chosen by callers to be about
  // one pass spacing, so the hop is always buried inside already-inked band and
  // never streaks across open counters. Returns the chains in outer→inner
  // drawing order (plotter-friendly). Deterministic, pure.
  const stitchConcentricRings = (passes, joinTol) => {
    const tol = Number.isFinite(joinTol) && joinTol > 0 ? joinTol : 1;
    const tolSq = tol * tol;
    const chains = [];
    const openRing = (ring) => {
      const pts = ring.slice();
      if (pts.length >= 2) {
        const f = pts[0];
        const l = pts[pts.length - 1];
        if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) pts.pop();
      }
      return pts;
    };
    for (const rings of passes || []) {
      for (const ring of rings || []) {
        if (!Array.isArray(ring) || ring.length < 3) continue;
        const pts = openRing(ring);
        if (pts.length < 3) continue;
        // Nearest chain end → nearest point ON the ring (segment projection, not
        // just vertices — a band ring's facets are far longer than one pass
        // spacing, so a vertex-only test would miss grafts that are geometrically
        // a hair apart).
        let best = null;
        for (const chain of chains) {
          const end = chain[chain.length - 1];
          for (let i = 0; i < pts.length; i += 1) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const l2 = dx * dx + dy * dy;
            let t = l2 > 0 ? ((end.x - a.x) * dx + (end.y - a.y) * dy) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            const ex = end.x - px;
            const ey = end.y - py;
            const d2 = ex * ex + ey * ey;
            if (d2 <= tolSq && (!best || d2 < best.d2)) best = { chain, i, t, x: px, y: py, d2 };
          }
        }
        // Traverse the full loop from the graft point and close it, so the ring
        // is drawn whole and the chain's free end sits ready for the next pass.
        const loop = [];
        const entry = best && best.t > 1e-9 && best.t < 1 - 1e-9 ? { x: best.x, y: best.y } : null;
        const startIdx = best ? (entry || best.t >= 0.5 ? best.i + 1 : best.i) : 0;
        if (entry) loop.push(entry);
        for (let k = 0; k < pts.length; k += 1) {
          const q = pts[((startIdx + k) % pts.length)];
          loop.push({ x: q.x, y: q.y });
        }
        loop.push({ x: loop[0].x, y: loop[0].y }); // close the ring
        if (best) best.chain.push(...loop);
        else chains.push(loop);
      }
    }
    return chains;
  };

  const api = {
    stripCurveMeta,
    smoothPath,
    simplifyPath,
    simplifyPathVisvalingam,
    countPathPoints,
    clonePaths,
    cloneAnchors,
    pointsToAnchors,
    buildPolylineFromAnchors,
    rebuildShapeAnchors,
    cubicAtT,
    sampleCubicBezier,
    lerp,
    segmentIntersection,
    segmentCircleIntersections,
    splitPathByShape,
    flattenSmoothedPath,
    thickenPaths,
    thickenPathsUniform,
    strokeRingsToBand,
    flattenAnchorRing,
    miterOffsetClosedRing,
    insetMultiPolygon,
    stitchConcentricRings,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    window.Vectura.GeometryUtils = {
      ...(window.Vectura.GeometryUtils || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
