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
