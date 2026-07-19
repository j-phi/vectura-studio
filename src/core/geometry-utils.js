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

  // Min-heap of [area, index] entries, ordered by area then index (both
  // ascending) — the index tiebreak matches the linear-scan reference's
  // leftmost-wins behavior on equal areas.
  const heapLess = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);
  const heapPush = (heap, entry) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!heapLess(heap[i], heap[parent])) break;
      const tmp = heap[i]; heap[i] = heap[parent]; heap[parent] = tmp;
      i = parent;
    }
  };
  const heapPop = (heap) => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      const len = heap.length;
      for (;;) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < len && heapLess(heap[l], heap[smallest])) smallest = l;
        if (r < len && heapLess(heap[r], heap[smallest])) smallest = r;
        if (smallest === i) break;
        const tmp = heap[i]; heap[i] = heap[smallest]; heap[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  };

  // Visvalingam-Whyatt point removal, driven by a linked list (O(1) neighbor
  // lookup after a removal) + a min-heap of candidate areas (O(log n) to find
  // and re-heapify the next minimum), instead of the textbook-naive full
  // array rescan per removal. Removal order — and therefore output — is kept
  // identical to that O(n^2) reference: the heap comparator ties on index
  // ascending, matching the reference's leftmost-wins scan.
  const simplifyPathVisvalingam = (path, tolerance) => {
    if (!tolerance || tolerance <= 0 || path.length < 3) return path;
    const areaThreshold = tolerance * tolerance;
    const pts = path.map((pt) => ({ x: pt.x, y: pt.y }));
    const n = pts.length;
    const keep = new Array(n).fill(true);
    const area = new Array(n).fill(Infinity);
    const prevIdx = new Array(n);
    const nextIdx = new Array(n);
    for (let i = 0; i < n; i++) { prevIdx[i] = i - 1; nextIdx[i] = i + 1; }
    const triArea = (a, b, c) => Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);

    const heap = [];
    for (let i = 1; i < n - 1; i++) {
      const a = triArea(pts[i - 1], pts[i], pts[i + 1]);
      area[i] = a;
      heapPush(heap, [a, i]);
    }

    while (heap.length) {
      const [topArea, idx] = heapPop(heap);
      if (!keep[idx] || topArea !== area[idx]) continue; // stale entry
      if (topArea >= areaThreshold) break;

      keep[idx] = false;
      const prev = prevIdx[idx];
      const next = nextIdx[idx];
      nextIdx[prev] = next;
      prevIdx[next] = prev;

      if (prev > 0) {
        const a = triArea(pts[prevIdx[prev]], pts[prev], pts[next]);
        area[prev] = a;
        heapPush(heap, [a, prev]);
      }
      if (next < n - 1) {
        const a = triArea(pts[prev], pts[next], pts[nextIdx[next]]);
        area[next] = a;
        heapPush(heap, [a, next]);
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
    (anchors || []).map((a) => {
      const c = {
        x: a.x,
        y: a.y,
        in: a.in ? { x: a.in.x, y: a.in.y } : null,
        out: a.out ? { x: a.out.x, y: a.out.y } : null,
      };
      if (a.corner === true) c.corner = true; // preserve the minimal-trace corner flag
      return c;
    });

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
   * Rebuild anchors of a freeform shape path.
   *
   * With Curves ON this delegates to `toCurveAnchors` — the same least-squares fit
   * the engine runs on generative layers. That matters because a shape layer is
   * usually not hand-drawn: it is what Expand produces from every generative layer,
   * so "Simplify" here has to mean what it meant on the layer it was exploded out
   * of. It used to mean something else entirely — RDP decimation, then bezier
   * handles ONLY when smoothing > 0. Expand resets smoothing to 0, so an exploded
   * spiral line simplified into handle-less chords and the renderer faked a curve
   * through their midpoints: fewer points, and a visibly different shape.
   *
   * With Curves OFF it keeps the original RDP + Catmull-Rom. That branch is
   * load-bearing, in two ways a curve fit would quietly break:
   *   - `toCurveAnchors` is a deliberate no-op when curves are off and smoothing is
   *     0, so delegating unconditionally would make Simplify a DEAD control for
   *     every pen-drawn polygon.
   *   - Catmull-Rom rounds a corner unconditionally; the fit PRESERVES corners
   *     below its angle threshold. Smoothing a hand-drawn square is a request to
   *     round it, not to have it faithfully reconstructed as a square.
   *
   * Pure — no DOM, no engine access.
   *
   * opts:
   *   curves     bool — fit real cubics (Curves toggle) rather than decimate
   *   simplify   0..1 — fit tolerance when curving; RDP tolerance when not
   *   smoothing  0..1 — how much the curve rounds through bends
   *   closed     bool
   *   bounds     { dW, dH } — for RDP tolerance scaling (the fit self-scales)
   */
  // Simplify's travel when re-fitting a shape's curve, as a fraction of the
  // PATH's own bbox diagonal (not the document's), so a small shape and a big one
  // simplify by the same visual amount. At 0 the fit is near-lossless; at 1 it is
  // loose enough to collapse a spiral arm to a couple of anchors — which is what
  // the toolbar's ladder reaches, and what users expect from "Simplify".
  // Simplify's travel, as a fraction of the PATH's own bbox diagonal (not the
  // document's), so a small shape and a big one simplify by the same visual amount.
  //
  // Geometric, not linear: fit tolerance is perceptually logarithmic, and a linear
  // ramp spends most of its travel in a range where nothing more comes off.
  //
  // The ceiling is deliberately well below the toolbar ladder's (0.25 of the
  // diagonal). The toolbar is a destructive, undoable scrub with a live preview —
  // you can see it deform the shape and back off. This is a live whole-layer
  // slider on artwork you are not watching anchor-by-anchor, so it guarantees the
  // shape is PRESERVED: at maximum, the simplified curve still traces the original
  // within ~2% of the diagonal. Raising it past that starts visibly reshaping the
  // artwork, which is not what "Simplify" should be able to do behind your back.
  const SHAPE_FIT_TOL_MIN_FRAC = 0.0005;
  const SHAPE_FIT_TOL_MAX_FRAC = 0.015;

  const rebuildShapeAnchors = (anchors, opts = {}) => {
    const simplify = clamp01(opts.simplify ?? 0);
    const smoothing = clamp01(opts.smoothing ?? 0);
    const curves = opts.curves === true;
    const closed = Boolean(opts.closed);
    const dW = opts.bounds?.dW ?? 100;
    const dH = opts.bounds?.dH ?? 100;

    if (!Array.isArray(anchors) || anchors.length === 0) {
      return { anchors: [], changed: false };
    }

    // Fit whenever the layer asked for curves, OR the geometry already IS one.
    //
    // A path whose anchors carry handles has already answered the question the
    // Curves toggle asks. Simplifying it with the toggle off used to fall through
    // to the decimate-and-null-handles branch below, which does not simplify the
    // curve — it DELETES it: on a shape with sharp corners and one curved notch,
    // the drawn outline landed 18% of its own diagonal from where it started, the
    // notch snapped into a hard V, and with Curves back on the handle-less result
    // fell into the draw-time midpoint-quadratic, which rounded every corner it
    // had just squared off. Simplify may reduce the anchors describing a curve.
    // It may never destroy the curve they describe.
    const alreadyCurved = anchors.some((a) => a && (a.in || a.out));

    if (curves || alreadyCurved) {
      // Fit with the TOOLBAR's fitter, not the engine's.
      //
      // A shape layer's source path is a DENSE FLATTENED OUTLINE — Expand hands
      // over the drawn curve of a generative layer, an SVG import hands over its
      // polyline. That is exactly the regime where `fitBezierAnchors` (Schneider
      // least-squares, immediate-neighbour corner detection) is exact, and where
      // the engine's `toCurveAnchors` is wrong: `reduceAnchors`' WINDOWED corner
      // detection smears a real corner into a band on dense input and over-fires
      // on sampling noise, so its quality gate DECLINES the path outright — on a
      // real expanded spiral, at every Simplify setting — and Simplify then fell
      // straight through to the chord branch below. That was the bug: an expanded
      // spiral simplified into a handful of visibly wrong straight chords, while
      // the toolbar's Simplify traced the same curve in two anchors.
      //
      // The two fitters share the Schneider core and differ only in corner policy.
      // Coarse, noisy algorithm output wants the windowed one; dense, already-drawn
      // outlines want this one. Choosing per regime is the design, not an accident
      // — see plans.md, "The three Simplifies".

      // Never re-author anchors the user placed by hand. If the path is ALREADY a
      // curve and nothing asked for it to be thinned, leave it exactly as it is —
      // re-fitting it would silently replace a hand-edited 3-anchor path with an
      // 8-anchor approximation of itself, which is what direct-selection editing
      // does after every drag. A re-fit is only ever a response to Simplify;
      // Smoothing on an already-curved path fillets its sharp anchors IN PLACE
      // (the anchor-preserving branch below) rather than re-fitting.
      const refitting = simplify > 0 || !alreadyCurved;

      const points = alreadyCurved
        ? buildPolylineFromAnchors(anchors, closed) // fit the curve as DRAWN
        : anchors.map((a) => ({ x: a.x, y: a.y }));

      if (refitting && points.length >= 4) {
        const diag = bboxDiagonal(points) || 1;
        const tol = SHAPE_FIT_TOL_MIN_FRAC
          * Math.pow(SHAPE_FIT_TOL_MAX_FRAC / SHAPE_FIT_TOL_MIN_FRAC, simplify)
          * diag;
        // `smoothing` rounds the corners the fit preserved — the same verb the
        // toolbar's Smooth slider drives. Catmull-Rom tension has no meaning once
        // the curve is a real least-squares fit.
        const fitted = fitBezierAnchors(points, closed, tol, undefined, smoothing);
        if (Array.isArray(fitted) && fitted.length >= 2) {
          return { anchors: fitted, changed: true };
        }
      }
      // A genuinely straight run has nothing to fit; fall through and decimate it.
    }

    // 1. Decimate (positions only)
    let kept = anchors;
    if (simplify > 0 && anchors.length >= 3) {
      const tol = simplify * Math.max(dW, dH) * 0.01;
      const keepMask = rdpAnchorKeepIndices(anchors, tol);
      const filtered = anchors.filter((_, i) => keepMask[i]);
      if (filtered.length >= 2) kept = filtered;
    }

    // 2. Round corners — the SAME fillet mechanism as the toolbar's Smooth
    // slider and the engine's Smoothing pass, in its anchor-preserving form
    // (filletSharpAnchors): sharp anchors split into fillet-arc pairs, every
    // other anchor and every existing handle stays exactly where the user put
    // it. The old Catmull-Rom tension pass bulged the drawn curve THROUGH
    // every vertex — pushing geometry outside the shape, never holding a
    // straight edge straight, and (on an already-curved path) replacing the
    // user's real handles with tension handles.
    const n = kept.length;
    let out = kept.map((a) => ({
      x: a.x,
      y: a.y,
      in: a.in ? { x: a.in.x, y: a.in.y } : null,
      out: a.out ? { x: a.out.x, y: a.out.y } : null,
    }));
    if (smoothing > 0 && n >= 3) {
      out = filletSharpAnchors(out, closed, clamp01(smoothing));
    }

    const changed = out.length !== anchors.length || smoothing > 0;
    return { anchors: out, changed };
  };

  // Catmull-Rom-to-bezier handle synthesis through EVERY point (tension 0..1):
  // writes tangent handles, never moves or removes a point. This is the
  // bezierizer for DESIGNED dense curves (the text algorithm's stroke-font
  // bowls and arcs) — a curve-through-points pass, deliberately distinct from
  // smoothing/corner rounding: a sampled ellipse has no corners to round, it
  // needs handles through its samples. Extracted verbatim from the old
  // rebuildShapeAnchors tail when that tail became corner rounding.
  const catmullRomAnchors = (pts, closed, tension) => {
    const t = clamp01(tension ?? 0);
    const n = Array.isArray(pts) ? pts.length : 0;
    const out = (pts || []).map((a) => ({ x: a.x, y: a.y, in: null, out: null }));
    if (!(t > 0) || n < 2) return out;
    for (let i = 0; i < n; i++) {
      let prev;
      let next;
      if (closed) {
        prev = pts[(i - 1 + n) % n];
        next = pts[(i + 1) % n];
      } else {
        prev = i === 0 ? pts[i] : pts[i - 1];
        next = i === n - 1 ? pts[i] : pts[i + 1];
      }
      const dx = ((next.x - prev.x) * t) / 6;
      const dy = ((next.y - prev.y) * t) / 6;
      out[i].out = { x: out[i].x + dx, y: out[i].y + dy };
      out[i].in = { x: out[i].x - dx, y: out[i].y - dy };
    }
    if (!closed) {
      // Endpoints get one-sided derivative — null the outward-pointing handle.
      out[0].in = null;
      out[n - 1].out = null;
    }
    return out;
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
  // (anchors/shape) is stale and it must render verbatim.
  //
  // Tagged `baked`: these points trace a CURVE, they are not line segments.
  // `straight` is stamped alongside it because the flag means two different
  // things to two audiences — "genuinely straight" and "render verbatim" — and
  // conflating them is how "this algorithm doesn't do curves" crept in as a
  // third meaning and turned the Curves toggle into a dead switch. Consumers
  // that ask `PathDraw.isVerbatim(path)` see either flag; the direct
  // `meta.straight` readers still in the tree only see the old one, so both are
  // set until every consumer routes through PathDraw.
  const finalizeFlattened = (points, path, closed) => {
    const meta = path.meta ? { ...path.meta } : {};
    delete meta.anchors;
    delete meta.shape;
    if (meta.kind === 'shape' || meta.kind === 'circle') delete meta.kind;
    meta.baked = true;
    meta.straight = true;
    if (closed) meta.closed = true;
    points.meta = meta;
    return points;
  };

  // PathDraw owns the "which curve branch does this path take?" decision for the
  // whole app. Resolved lazily — in the browser it loads after this file, and
  // under Node the two modules are a require cycle that only settles once both
  // have evaluated. Never called at load time, so both resolve fine.
  const getPathDraw = () => {
    if (typeof window !== 'undefined' && window.Vectura && window.Vectura.PathDraw) {
      return window.Vectura.PathDraw;
    }
    if (typeof require === 'function') {
      try {
        return require('./path-draw.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  };

  // Flatten the *displayed* curve into a dense polyline that traces exactly what
  // the canvas and the SVG exporter draw. The masking pipeline clips THIS, not
  // the raw sparse polyline: algorithm output (lissajous, spiral, …) is a coarse
  // sample whose on-screen smoothness comes entirely from the branch PathDraw
  // picks. Clipping the raw polyline would cut along its chords and discard that
  // interpolation, collapsing curves into straight lines at the mask boundary.
  // Flattening first means a masked curve keeps the shape it has unmasked.
  //
  // The branch logic used to be re-implemented here, hand-synced with
  // renderer.tracePath ("mirrors tracePath's three branches exactly", said the
  // comment — a standing invitation to drift). It now delegates, so there is
  // exactly one definition of what a path draws as.
  const flattenSmoothedPath = (path, tolerance = 0.1) => {
    if (!Array.isArray(path) || path.length < 2) return path;
    const PD = getPathDraw();
    if (!PD) return path;
    if (PD.isVerbatim(path)) return path;

    const decision = PD.classify(path, { useCurves: true });
    if (decision.mode !== 'cubic' && decision.mode !== 'quadratic') return path;

    const points = PD.toPolyline(path, { useCurves: true }, tolerance);
    if (!Array.isArray(points) || points.length < 2) return path;
    return finalizeFlattened(points, path, decision.closed === true);
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
    // When joins are being skipped, each quad is extended LONGITUDINALLY by a
    // whisker so it covers the corner wedge the missing disk would have swept.
    // Without this, a skipped vertex whose corner bends toward the region
    // leaves an un-swept needle (width ≈ halfW·θ) reaching the source ring —
    // in the erosion use that needle survives as an un-eroded spike touching
    // the band boundary, and a round-capped pen renders it as a bump on the
    // letterform silhouette. Over-extension on the far side of a corner only
    // sweeps area the disk would have swept anyway.
    const quadExt = skipJoinCos <= 1 ? halfW * Math.sin(Math.max(0, opts.joinSkipAngle)) : 0;
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
        const ux = (dx / mag) * quadExt;
        const uy = (dy / mag) * quadExt;
        const nx = (-dy / mag) * halfW;
        const ny = (dx / mag) * halfW;
        geoms.push([[[
          [a.x + nx - ux, a.y + ny - uy],
          [b.x + nx + ux, b.y + ny + uy],
          [b.x - nx + ux, b.y - ny + uy],
          [a.x - nx - ux, a.y - ny - uy],
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
    // polygon-clipping can still crash on unlucky sweep-line configurations —
    // exactly-coincident events, or simply a dense curvy boundary (every arc a
    // fan of near-parallel chords). Escalating retries before declaring the
    // region gone: first sub-percent inset nudges (shift every event off the
    // degeneracy), then RDP-simplified boundary rings (the cut only needs the
    // boundary to within a few % of the inset — coarsening it shifts the eroded
    // edge by that tolerance, far below a pen width, while removing exactly the
    // near-parallel chords that thrash the sweep). A GENUINELY empty erosion
    // (region thinner than 2·inset) returns [] from the first successful
    // attempt and is never retried.
    const attempts = [
      [inset, 0.5, 0],
      [inset * 1.0037, 0.29, 0],
      [inset * 0.9961, 0.71, 0],
      [inset, 0.13, inset * 0.03],
      [inset * 1.0053, 0.87, inset * 0.08],
    ];
    const joinSkipAngle = Number.isFinite(opts.joinSkipAngle) ? opts.joinSkipAngle : 0.35;
    let region = null;
    for (const [ins, phase, tol] of attempts) {
      try {
        const rings = tol > 0
          ? boundaryRings.map((r) => { const s = simplifyPath(r, tol); return (s && s.length >= 4) ? s : r; })
          : boundaryRings;
        const cut = strokeRingsToBand(rings, ins * 2, { boolean: FB, joinSides, diskPhase: phase, joinSkipAngle });
        region = (cut && cut.length) ? (FB.difference(snappedMp, cut) || []) : [];
        break;
      } catch (_) { region = null; }
    }
    if (!region || !region.length) return [];
    const minArea = Number.isFinite(opts.minArea) && opts.minArea > 0 ? opts.minArea : 0;
    if (!minArea) return region;
    // Shape-aware sliver filter. A flat area floor throws out exactly the
    // rings that matter most: the deep ring of a needle-acute junction pocket
    // is a small ROUNDISH blob (its ink is real coverage — dropping it left
    // pockets ~0.4mm from any pen ink), while true boolean crumbs are HAIR
    // slivers. Roundness 4πA/P² separates them (disk = 1, hair → 0): small
    // rings survive down to minArea/16 when they are compact.
    const kept = region.filter((polygon) => {
      const shell = polygon && polygon[0];
      if (!Array.isArray(shell) || shell.length < 4) return false;
      let s = 0;
      let per = 0;
      for (let i = 0, n = shell.length; i < n; i += 1) {
        const a = shell[i];
        const b = shell[(i + 1) % n];
        s += a[0] * b[1] - b[0] * a[1];
        per += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      const area = Math.abs(s * 0.5);
      if (area >= minArea) return true;
      if (area < minArea / 16 || per <= 0) return false;
      return (4 * Math.PI * area) / (per * per) >= 0.3;
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

  // ── Schneider cubic-bezier curve fitting (Graphics Gems) ────────────────────
  // Fit the FEWEST cubic bezier segments to a point list within `errorTol`, then
  // express them as editable anchors { x, y, in, out } (in/out are ABSOLUTE
  // handle control points). Used by the interactive Smooth to add the minimal
  // bezier anchors that approximate the curve — not one anchor per input point.
  const _vSub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const _vAdd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const _vScale = (a, s) => ({ x: a.x * s, y: a.y * s });
  const _vDot = (a, b) => a.x * b.x + a.y * b.y;
  const _vLen = (a) => Math.hypot(a.x, a.y);
  const _vNorm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };

  // de Casteljau evaluation of a bezier (any degree) at t.
  const _bezEval = (ctrl, t) => {
    const p = ctrl.map((c) => ({ x: c.x, y: c.y }));
    for (let k = 1; k < ctrl.length; k++) {
      for (let i = 0; i < ctrl.length - k; i++) {
        p[i] = { x: p[i].x * (1 - t) + p[i + 1].x * t, y: p[i].y * (1 - t) + p[i + 1].y * t };
      }
    }
    return p[0];
  };
  const _B0 = (u) => { const t = 1 - u; return t * t * t; };
  const _B1 = (u) => { const t = 1 - u; return 3 * u * t * t; };
  const _B2 = (u) => { const t = 1 - u; return 3 * u * u * t; };
  const _B3 = (u) => u * u * u;

  const _chordParams = (pts, first, last) => {
    const u = [0];
    for (let i = first + 1; i <= last; i++) u[i - first] = u[i - first - 1] + _vLen(_vSub(pts[i], pts[i - 1]));
    const total = u[last - first] || 1;
    for (let i = 1; i < u.length; i++) u[i] /= total;
    return u;
  };

  const _generateBezier = (pts, first, last, u, tHat1, tHat2) => {
    const n = last - first + 1;
    const A = [];
    for (let i = 0; i < n; i++) A.push([_vScale(tHat1, _B1(u[i])), _vScale(tHat2, _B2(u[i]))]);
    let c00 = 0; let c01 = 0; let c11 = 0; let x0 = 0; let x1 = 0;
    const P0 = pts[first]; const P3 = pts[last];
    for (let i = 0; i < n; i++) {
      c00 += _vDot(A[i][0], A[i][0]);
      c01 += _vDot(A[i][0], A[i][1]);
      c11 += _vDot(A[i][1], A[i][1]);
      const b0 = _B0(u[i]); const b1 = _B1(u[i]); const b2 = _B2(u[i]); const b3 = _B3(u[i]);
      const tmp = {
        x: pts[first + i].x - (P0.x * b0 + P0.x * b1 + P3.x * b2 + P3.x * b3),
        y: pts[first + i].y - (P0.y * b0 + P0.y * b1 + P3.y * b2 + P3.y * b3),
      };
      x0 += _vDot(A[i][0], tmp);
      x1 += _vDot(A[i][1], tmp);
    }
    const detC = c00 * c11 - c01 * c01;
    let alphaL = detC === 0 ? 0 : (x0 * c11 - c01 * x1) / detC;
    let alphaR = detC === 0 ? 0 : (c00 * x1 - c01 * x0) / detC;
    const segLen = _vLen(_vSub(P3, P0));
    const eps = 1e-6 * segLen;
    if (alphaL < eps || alphaR < eps) {
      const d = segLen / 3; alphaL = d; alphaR = d;
    } else {
      // Clamp handle length to the chord so an ill-conditioned least-squares fit
      // (sparse points around a bend) can't blow the handles out into a balloon.
      alphaL = Math.min(alphaL, segLen);
      alphaR = Math.min(alphaR, segLen);
    }
    return [P0, _vAdd(P0, _vScale(tHat1, alphaL)), _vAdd(P3, _vScale(tHat2, alphaR)), P3];
  };

  const _computeMaxError = (pts, first, last, bez, u) => {
    let maxDist = 0; let split = Math.floor((last - first + 1) / 2) + first;
    for (let i = first + 1; i < last; i++) {
      const p = _bezEval(bez, u[i - first]);
      const d = _vSub(p, pts[i]);
      const dist = d.x * d.x + d.y * d.y;
      if (dist >= maxDist) { maxDist = dist; split = i; }
    }
    return { maxError: maxDist, split }; // squared
  };

  const _newtonReparam = (pts, first, last, u, bez) => {
    const uPrime = u.slice();
    const Q1 = [_vScale(_vSub(bez[1], bez[0]), 3), _vScale(_vSub(bez[2], bez[1]), 3), _vScale(_vSub(bez[3], bez[2]), 3)];
    const Q2 = [_vScale(_vSub(Q1[1], Q1[0]), 2), _vScale(_vSub(Q1[2], Q1[1]), 2)];
    for (let i = first; i <= last; i++) {
      const t = u[i - first];
      const Qt = _bezEval(bez, t);
      const Q1t = _bezEval(Q1, t);
      const Q2t = _bezEval(Q2, t);
      const diff = _vSub(Qt, pts[i]);
      const num = _vDot(diff, Q1t);
      const den = _vDot(Q1t, Q1t) + _vDot(diff, Q2t);
      uPrime[i - first] = den === 0 ? t : t - num / den;
    }
    return uPrime;
  };

  const _fitCubic = (pts, first, last, tHat1, tHat2, errorTol, out, depth) => {
    if (last - first === 1) {
      const dist = _vLen(_vSub(pts[last], pts[first])) / 3;
      out.push([pts[first], _vAdd(pts[first], _vScale(tHat1, dist)), _vAdd(pts[last], _vScale(tHat2, dist)), pts[last]]);
      return;
    }
    let u = _chordParams(pts, first, last);
    let bez = _generateBezier(pts, first, last, u, tHat1, tHat2);
    let res = _computeMaxError(pts, first, last, bez, u);
    const tolSq = errorTol * errorTol;
    if (res.maxError < tolSq) { out.push(bez); return; }
    if (res.maxError < tolSq * 16 && depth < 10) {
      for (let iter = 0; iter < 4; iter++) {
        const uPrime = _newtonReparam(pts, first, last, u, bez);
        bez = _generateBezier(pts, first, last, uPrime, tHat1, tHat2);
        res = _computeMaxError(pts, first, last, bez, uPrime);
        u = uPrime;
        if (res.maxError < tolSq) { out.push(bez); return; }
      }
    }
    if (depth > 48) { out.push(bez); return; } // recursion backstop
    const split = res.split;
    const centerTangent = _vNorm({
      x: (pts[split - 1].x - pts[split + 1].x) / 2,
      y: (pts[split - 1].y - pts[split + 1].y) / 2,
    });
    _fitCubic(pts, first, split, tHat1, centerTangent, errorTol, out, depth + 1);
    _fitCubic(pts, split, last, _vScale(centerTangent, -1), tHat2, errorTol, out, depth + 1);
  };

  // Round each detected corner into a fillet arc (Illustrator "Smooth" on a
  // polygon). Each corner C is replaced by two setback anchors P1 (on the
  // incoming edge) and P2 (on the outgoing edge) joined by a cubic that
  // approximates a circular arc; the edges between fillets stay straight. The
  // setback grows with `radiusFrac` (0 = untouched corner, 1 = fillets meet at
  // edge midpoints → the polygon rounds into a circle). `cornerPos` is the set
  // of original corner positions to match against the fitted anchors.
  const _FILLET_K = 0.5523; // cubic handle factor for a ~circular quarter arc
  const _applyFillets = (anchors, closedRing, cornerPos, radiusFrac) => {
    if (!(radiusFrac > 0) || !Array.isArray(anchors) || anchors.length < 3) return anchors;
    const m = anchors.length;
    const isCorner = anchors.map((a) => cornerPos.some((c) => Math.hypot(c.x - a.x, c.y - a.y) < 1e-6));
    const out = [];
    for (let i = 0; i < m; i++) {
      const a = anchors[i];
      const endpoint = !closedRing && (i === 0 || i === m - 1);
      if (!isCorner[i] || endpoint) { out.push(a); continue; }
      const prev = anchors[(i - 1 + m) % m];
      const next = anchors[(i + 1) % m];
      const C = { x: a.x, y: a.y };
      const inDir = _vNorm(_vSub(C, prev));   // prev → C
      const outDir = _vNorm(_vSub(next, C));  // C → next
      const d = radiusFrac * 0.5 * Math.min(_vLen(_vSub(C, prev)), _vLen(_vSub(next, C)));
      if (!(d > 0)) { out.push(a); continue; }
      const P1 = _vSub(C, _vScale(inDir, d));
      const P2 = _vAdd(C, _vScale(outDir, d));
      // P1: straight edge in, arc out (toward C). P2: arc in (from C), straight out.
      out.push({ x: P1.x, y: P1.y, in: null, out: _vAdd(P1, _vScale(inDir, _FILLET_K * d)) });
      out.push({ x: P2.x, y: P2.y, in: _vSub(P2, _vScale(outDir, _FILLET_K * d)), out: null });
    }
    return out;
  };

  // Anchor-preserving corner rounding for shape layers: fillet the SHARP
  // anchors of an existing anchor run in place. A sharp anchor — handle-less on
  // both sides, with a turn angle past the threshold — splits into a fillet-arc
  // pair; every other anchor, and every handle the user placed, stays exactly
  // where it was. This is the shape-layer face of the ONE Smooth mechanism:
  // rounding may ADD the fillet anchors it needs, but it never re-authors,
  // moves, or thins the user's anchors (that is Simplify's verb).
  const filletSharpAnchors = (anchors, closed, radiusFrac, cornerAngleDeg) => {
    if (!(radiusFrac > 0) || !Array.isArray(anchors) || anchors.length < 3) return anchors;
    const n = anchors.length;
    const cornerCos = Math.cos(
      (Number.isFinite(cornerAngleDeg) ? cornerAngleDeg : SMOOTH_CORNER_ANGLE_DEG) * Math.PI / 180,
    );
    const cornerPos = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue; // endpoints stay put
      const a = anchors[i];
      if (a.in || a.out) continue; // a handle-carrying anchor is already smooth
      const prev = anchors[(i - 1 + n) % n];
      const next = anchors[(i + 1) % n];
      const d1 = _vNorm(_vSub(a, prev));
      const d2 = _vNorm(_vSub(next, a));
      if (_vDot(d1, d2) < cornerCos) cornerPos.push({ x: a.x, y: a.y });
    }
    if (!cornerPos.length) return anchors;
    return _applyFillets(anchors, closed, cornerPos, clamp01(radiusFrac));
  };

  // Concatenated bezier segments (each sharing endpoints) → editable anchors.
  const _segsToAnchors = (segs, closedRing) => {
    if (!segs.length) return [];
    const anchors = [{ x: segs[0][0].x, y: segs[0][0].y, in: null, out: { x: segs[0][1].x, y: segs[0][1].y } }];
    for (let k = 1; k < segs.length; k++) {
      anchors.push({
        x: segs[k][0].x, y: segs[k][0].y,
        in: { x: segs[k - 1][2].x, y: segs[k - 1][2].y },
        out: { x: segs[k][1].x, y: segs[k][1].y },
      });
    }
    const lastSeg = segs[segs.length - 1];
    if (closedRing) {
      anchors[0].in = { x: lastSeg[2].x, y: lastSeg[2].y }; // last segment ends at the first anchor
    } else {
      anchors.push({ x: lastSeg[3].x, y: lastSeg[3].y, in: { x: lastSeg[2].x, y: lastSeg[2].y }, out: null });
    }
    return anchors;
  };

  // A "corner" is a vertex whose turn angle exceeds the threshold. Smoothing
  // must NOT fit a single curve across corners (that rounds them into balloons)
  // — it fits each corner-to-corner run independently, so sharp corners survive
  // (their in/out handles come from two different runs and point different ways)
  // while gentle runs round into curves. Default threshold keeps ~≥35° bends.
  const SMOOTH_CORNER_ANGLE_DEG = 35;

  const fitBezierAnchors = (rawPoints, closed, errorTol, cornerAngleDeg, cornerRadiusFrac) => {
    const src = [];
    (rawPoints || []).forEach((p) => {
      const last = src[src.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) src.push({ x: p.x, y: p.y });
    });
    let pts = src;
    const isClosed = !!closed;
    if (isClosed && pts.length > 2
        && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) {
      pts = pts.slice(0, -1);
    }
    const n = pts.length;
    if (n < 3) return pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null }));

    // Detect corners by turn angle.
    const cornerCos = Math.cos((Number.isFinite(cornerAngleDeg) ? cornerAngleDeg : SMOOTH_CORNER_ANGLE_DEG) * Math.PI / 180);
    const sharp = (prev, cur, next) => {
      const a = _vNorm(_vSub(cur, prev));
      const b = _vNorm(_vSub(next, cur));
      return _vDot(a, b) < cornerCos; // angle between edges exceeds the threshold
    };
    const cornerIdx = [];
    if (isClosed) {
      for (let i = 0; i < n; i++) {
        if (sharp(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n])) cornerIdx.push(i);
      }
    } else {
      cornerIdx.push(0);
      for (let i = 1; i < n - 1; i++) if (sharp(pts[i - 1], pts[i], pts[i + 1])) cornerIdx.push(i);
      cornerIdx.push(n - 1);
    }

    const segs = [];
    const fitRun = (run) => {
      const m = run.length;
      if (m < 2) return;
      _fitCubic(run, 0, m - 1, _vNorm(_vSub(run[1], run[0])), _vNorm(_vSub(run[m - 2], run[m - 1])), errorTol, segs, 0);
    };

    // No corners → one smooth curve (closed ring or open path).
    const cornerCount = isClosed ? cornerIdx.length : cornerIdx.length - 2;
    if (cornerCount <= 0) {
      if (isClosed) {
        const ring = [...pts, { x: pts[0].x, y: pts[0].y }];
        const r = ring.length;
        const seam = _vNorm({ x: (ring[r - 2].x - ring[1].x) / 2, y: (ring[r - 2].y - ring[1].y) / 2 });
        _fitCubic(ring, 0, r - 1, _vScale(seam, -1), seam, errorTol, segs, 0);
      } else {
        fitRun(pts);
      }
    } else if (isClosed) {
      // Fit each corner→next-corner run independently (wrapping the ring).
      for (let k = 0; k < cornerIdx.length; k++) {
        const start = cornerIdx[k];
        const end = cornerIdx[(k + 1) % cornerIdx.length];
        const run = [pts[start]];
        let i = start;
        do { i = (i + 1) % n; run.push(pts[i]); } while (i !== end);
        fitRun(run);
      }
    } else {
      for (let k = 0; k < cornerIdx.length - 1; k++) {
        const run = pts.slice(cornerIdx[k], cornerIdx[k + 1] + 1);
        fitRun(run);
      }
    }
    if (!segs.length) return pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null }));
    const anchors = _segsToAnchors(segs, isClosed);
    // Round the sharp corners into fillet arcs (Illustrator "Smooth" on a
    // polygon). Interior corners only for open paths (endpoints stay put).
    if (cornerRadiusFrac > 0 && cornerCount > 0) {
      const cornerPos = cornerIdx
        .filter((i) => isClosed || (i !== 0 && i !== n - 1))
        .map((i) => ({ x: pts[i].x, y: pts[i].y }));
      return _applyFillets(anchors, isClosed, cornerPos, cornerRadiusFrac);
    }
    return anchors;
  };

  // ── Illustrator-parity progressive corner rounding (the ONE Smooth verb) ────
  //
  // Every Smooth surface — the Post-Processing Lab's Smoothing slider, the
  // contextual toolbar's progressive Smooth slider, and the one-shot
  // Object ▸ Smooth… / context-menu verb — converges HERE. Smoothing is corner
  // ROUNDING: re-trace the drawn polyline faithfully (tight tolerance —
  // smoothing must never reshape, thin, or shrivel the path; reduction is
  // Simplify's verb, not this one), then round every detected corner into a
  // fillet arc whose setback grows with t. Straight runs stay straight, open
  // endpoints stay put, and a gentle curve with no corners is simply re-traced.
  //
  //   t 0..1   0 = untouched; 1 = fillets meet at edge midpoints (a polygon
  //            rounds into its inscribed round form). Linear, full travel — no
  //            saturation, so every slider position changes the result.
  //
  // opts:
  //   toleranceFrac   fit tolerance as a fraction of the bbox diagonal
  //                   (default ROUND_FIT_TOL_FRAC; Simplify may widen it)
  //   tolerance       absolute override (skips the diagonal scaling)
  //   cornerAngleDeg  corner-detection threshold (default fitBezierAnchors' 35°)
  //   fastPreview     drag preview: fit 3× looser — never tighter than the
  //                   committed fit it previews
  //
  // Returns fillet/bezier anchors, or null when there is nothing to round
  // (t=0, under 3 points, or a fit that produced no handles at all).
  const ROUND_FIT_TOL_FRAC = 0.002; // tight — the re-trace stays sub-percent faithful
  const roundCornerAnchors = (points, closed, t, opts = {}) => {
    const tc = clamp01(Number(t) || 0);
    if (!Array.isArray(points) || points.length < 3 || tc <= 0) return null;
    const diag = bboxDiagonal(points) || 1;
    let tol = Number.isFinite(opts.tolerance)
      ? opts.tolerance
      : (Number.isFinite(opts.toleranceFrac) ? opts.toleranceFrac : ROUND_FIT_TOL_FRAC) * diag;
    if (opts.fastPreview) tol *= 3;
    const anchors = fitBezierAnchors(
      points.map((p) => ({ x: p.x, y: p.y })),
      Boolean(closed),
      Math.max(tol, 1e-6),
      opts.cornerAngleDeg,
      tc,
    );
    if (!Array.isArray(anchors) || anchors.length < 2) return null;
    return anchors.some((a) => a && (a.in || a.out)) ? anchors : null;
  };

  // Engine-side companion (mirrors applyCurveFit): round a display path's
  // corners and stamp the anchors onto meta so the canvas, the SVG exporter,
  // masking, and the edit verbs all draw the SAME native cubics. Same refusals
  // as applyCurveFit: declared-final point arrays, parametric circles, and
  // paths already carrying a fitted curve (the 3D algorithms bezierize their
  // own wires — re-fitting them would discard what they knew).
  //
  // opts: { t, simplify, fastPreview, closed, toleranceFrac, cornerAngleDeg }.
  // Simplify widens the fit tolerance (fewer anchors) — it never drives the
  // rounding itself; the two verbs stay orthogonal.
  const applyCornerRounding = (path, opts = {}) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const meta = path.meta || {};
    if (meta.kind === 'circle') return path;
    if (meta.straight === true || meta.baked === true) return path;
    if (Array.isArray(meta.anchors) && meta.anchors.some((a) => a && (a.in || a.out))) return path;

    const closed = opts.closed !== undefined ? Boolean(opts.closed) : isClosedLoopPath(path);
    const simplify = clamp01(opts.simplify ?? 0);
    const toleranceFrac = Number.isFinite(opts.toleranceFrac)
      ? opts.toleranceFrac
      : ROUND_FIT_TOL_FRAC + simplify * SIMPLIFY_TOL_MAX_FRAC;
    const anchors = roundCornerAnchors(path, closed, opts.t, {
      toleranceFrac,
      cornerAngleDeg: opts.cornerAngleDeg,
      fastPreview: opts.fastPreview === true,
    });
    if (!anchors) return path;

    const out = path.map((pt) => ({ ...pt }));
    out.meta = { ...meta, anchors, closed, forceCurves: true };
    delete out.meta.straight;
    return out;
  };

  // ── Minimal-anchor re-trace (Illustrator "Create Outlines" parity) ──────────
  //
  // Native font outlines — especially TrueType/quadratic faces — carry FAR more
  // on-curve points than the shape needs: every quadratic is its own segment, a
  // smooth join is often split across a zero-length seam into a coincident anchor
  // PAIR, and a straight edge is broken into a collinear run. reduceAnchors
  // re-traces a bezier-anchor contour into the MINIMAL set of editable anchors
  // that reproduces it within a sub-pixel tolerance:
  //   1. merge coincident seams (fuse the arriving `in` with the departing `out`),
  //   2. detect corners from the ANCHOR HANDLES (tangent discontinuity) over a
  //      WINDOWED span (_windowedTangent), not just the immediate neighbor — a
  //      real sharp corner is often drawn as a tiny tangent-continuous "fillet"
  //      (a hinting/optical-correction artifact: a few units of curve standing in
  //      for a true point), which reads as perfectly smooth one hop out but is
  //      revealed once the window walks past it onto the real edges either side.
  //      A genuine smooth curve (a letter's bowl) or an already-long segment hits
  //      the window in one hop, so its classification is unchanged: a smooth
  //      quad-chain reads as ONE run, a flat-terminal cut reads as two corners,
  //   3. Schneider-fit each corner→corner run to the tolerance (straight runs stay
  //      as a single handle-less line so flat terminals render crisp).
  // Every returned anchor carries a `corner` flag (true at tangent breaks / open
  // endpoints, false on smooth runs) for the editor's corner affordance. Anchor
  // shape in and out: { x, y, in, out[, corner] } with absolute handle coords or null.
  //
  // opts (lengths default to FRACTIONS of the contour bbox diagonal, so the result
  // is resolution-independent; absolute overrides skip the diagonal scaling):
  //   toleranceFrac / tolerance   max fit deviation      (default 0.002·diag)
  //   cornerAngleDeg              tangent-break threshold (default 30°)
  //   mergeFrac / mergeEps        coincident-seam epsilon (default 0.0008·diag)
  //   flattenTol                  run-flatten chord tol   (default tol·0.25)
  //   windowDistFrac / windowDist corner-detection lookahead (default 0.035·diag)
  // Tangent at anchor i, looked ahead/behind until `windowDist` of arc length has
  // been covered. A single hop (the anchor's own handle, or the chord to its
  // immediate neighbor) is used as-is when it already reaches windowDist — this
  // is the ONLY behavior real corners and well-sampled smooth curves ever hit, so
  // their classification is unchanged. Short hops (font-hinting "corner fillets":
  // a tiny, tangent-continuous curve a TrueType outline substitutes for a true
  // sharp corner) get walked past, onto the following anchor-to-anchor chord —
  // interpolated to the exact windowDist point so an uneven next segment can't
  // overshoot the window — so the comparison sees the real edge direction on
  // either side of the fillet instead of the fillet's own local (near-)continuity.
  const _windowedTangent = (anchors, i, forward, windowDist, closed) => {
    const n = anchors.length;
    const a = anchors[i];
    const step = (idx) => {
      if (forward) return closed ? (idx + 1) % n : (idx + 1 < n ? idx + 1 : -1);
      return closed ? (idx - 1 + n) % n : (idx - 1 >= 0 ? idx - 1 : -1);
    };
    const first = step(i);
    if (first === -1) return _vNorm({ x: 1, y: 0 });
    const neighbor = anchors[first];
    const handleRaw = forward
      ? (a.out && _vLen(_vSub(a.out, a)) > 1e-9 ? _vSub(a.out, a) : _vSub(neighbor, a))
      : (a.in && _vLen(_vSub(a, a.in)) > 1e-9 ? _vSub(a, a.in) : _vSub(a, neighbor));
    const firstLen = _vLen(handleRaw);
    if (firstLen >= windowDist) return _vNorm(handleRaw);

    let acc = firstLen;
    let j = first;
    let far = neighbor;
    let guard = 0;
    while (acc < windowDist && guard < n) {
      const k = step(j);
      if (k === -1 || k === i) break;
      const segLen = _vLen(_vSub(anchors[k], anchors[j]));
      if (segLen < 1e-9) { j = k; guard += 1; continue; }
      if (acc + segLen >= windowDist) {
        const t = (windowDist - acc) / segLen;
        far = { x: anchors[j].x + (anchors[k].x - anchors[j].x) * t, y: anchors[j].y + (anchors[k].y - anchors[j].y) * t };
        break;
      }
      acc += segLen;
      j = k;
      far = anchors[j];
      guard += 1;
    }
    return _vNorm(forward ? _vSub(far, a) : _vSub(a, far));
  };

  const _reduceTangents = (anchors, closed, windowDist) => anchors.map((_, i) => ({
    inT: _windowedTangent(anchors, i, false, windowDist, closed),
    outT: _windowedTangent(anchors, i, true, windowDist, closed),
  }));

  const _mergeCoincidentAnchors = (anchors, closed, eps) => {
    const out = [];
    anchors.forEach((a) => {
      if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      const na = {
        x: a.x, y: a.y,
        in: a.in ? { x: a.in.x, y: a.in.y } : null,
        out: a.out ? { x: a.out.x, y: a.out.y } : null,
        forceCorner: a.forceCorner === true,
      };
      const last = out[out.length - 1];
      if (last && _vLen(_vSub(last, na)) <= eps) {
        // Fuse the seam: keep the arriving `in`, adopt the departing `out`.
        if (na.out) last.out = na.out;
        if (!last.in && na.in) last.in = na.in;
        if (na.forceCorner) last.forceCorner = true;
      } else {
        out.push(na);
      }
    });
    if (closed && out.length > 2 && _vLen(_vSub(out[0], out[out.length - 1])) <= eps) {
      const last = out.pop();
      if (last.in) out[0].in = last.in;
      if (last.forceCorner) out[0].forceCorner = true;
    }
    return out;
  };

  // Flatten an OPEN run of anchors (segments 0..len-2, no wrap) into a polyline.
  // UNIFORM sampling at the fit scale (`step`) — NOT adaptive: a least-squares fit
  // only "sees" deviation at the sample points, so a gentle curve sampled sparsely
  // (as adaptive flattening would) lets _fitCubic under-subdivide and drift. Even
  // density at the fit tolerance keeps every feature resolved for the error check.
  const _flattenAnchorRun = (run, step) => {
    const s = Math.max(step, 1e-4);
    const pts = [{ x: run[0].x, y: run[0].y }];
    for (let i = 0; i < run.length - 1; i += 1) {
      const A = run[i];
      const B = run[i + 1];
      if (A.out || B.in) {
        const c1 = A.out || A;
        const c2 = B.in || B;
        // Upper-bound the arc length by the control polygon to pick a sample count.
        const approx = _vLen(_vSub(c1, A)) + _vLen(_vSub(c2, c1)) + _vLen(_vSub(B, c2));
        const steps = Math.max(8, Math.min(400, Math.ceil(approx / s)));
        for (let k = 1; k <= steps; k += 1) {
          const t = k / steps;
          pts.push(cubicAtT(A, c1, c2, B, t));
        }
      } else {
        pts.push({ x: B.x, y: B.y });
      }
    }
    return pts;
  };

  // Max perpendicular deviation of a polyline from its endpoint chord ≤ tol.
  const _runIsStraight = (pts, tol) => {
    if (pts.length <= 2) return true;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const ab = _vSub(b, a);
    const L = _vLen(ab);
    if (L < 1e-9) return false;
    const nx = -ab.y / L;
    const ny = ab.x / L;
    for (let i = 1; i < pts.length - 1; i += 1) {
      if (Math.abs((pts[i].x - a.x) * nx + (pts[i].y - a.y) * ny) > tol) return false;
    }
    return true;
  };

  const reduceAnchors = (rawAnchors, closed = false, opts = {}) => {
    const tagAll = (list) => (list || []).map((a) => ({
      x: a.x, y: a.y,
      in: a.in ? { x: a.in.x, y: a.in.y } : null,
      out: a.out ? { x: a.out.x, y: a.out.y } : null,
      corner: true,
    }));
    if (!Array.isArray(rawAnchors) || rawAnchors.length < 2) return tagAll(rawAnchors);

    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    rawAnchors.forEach((a) => {
      if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      if (a.x < minX) minX = a.x;
      if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.y > maxY) maxY = a.y;
    });
    if (!Number.isFinite(minX)) return tagAll(rawAnchors);
    const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
    const tol = Number.isFinite(opts.tolerance) ? opts.tolerance
      : (Number.isFinite(opts.toleranceFrac) ? opts.toleranceFrac : 0.002) * diag;
    const eps = Number.isFinite(opts.mergeEps) ? opts.mergeEps
      : (Number.isFinite(opts.mergeFrac) ? opts.mergeFrac : 0.0008) * diag;
    const flTol = Number.isFinite(opts.flattenTol) ? opts.flattenTol : Math.max(tol * 0.25, 1e-4);
    const cornerCos = Math.cos((Number.isFinite(opts.cornerAngleDeg) ? opts.cornerAngleDeg : 30) * Math.PI / 180);
    const windowDist = Number.isFinite(opts.windowDist) ? opts.windowDist
      : (Number.isFinite(opts.windowDistFrac) ? opts.windowDistFrac : 0.035) * diag;

    const merged = _mergeCoincidentAnchors(rawAnchors, closed, eps);
    const n = merged.length;
    if (n < 3) return tagAll(merged);

    const tans = _reduceTangents(merged, closed, windowDist);
    // An input anchor may carry `forceCorner: true` (e.g. a boolean-union
    // intersection vertex — a true tangent discontinuity regardless of the
    // local chord angle); it splits the fit there unconditionally.
    const isCorner = merged.map((a, i) => a.forceCorner === true || _vDot(tans[i].inT, tans[i].outT) < cornerCos);
    if (!closed) { isCorner[0] = true; isCorner[n - 1] = true; }
    const cornerIdx = [];
    for (let i = 0; i < n; i += 1) if (isCorner[i]) cornerIdx.push(i);
    const cornerPos = cornerIdx.map((i) => ({ x: merged[i].x, y: merged[i].y }));

    const outA = [];
    const pushAnchor = (a, forceCorner) => {
      const last = outA[outA.length - 1];
      if (last && _vLen(_vSub(last, a)) <= 1e-6) { // shared run-boundary anchor
        if (a.out) last.out = a.out;
        if (forceCorner) last.corner = true;
        return;
      }
      const isC = forceCorner || cornerPos.some((c) => _vLen(_vSub(c, a)) <= Math.max(eps, tol));
      outA.push({ x: a.x, y: a.y, in: a.in || null, out: a.out || null, corner: isC });
    };

    // Endpoint tangent for a fit run. At a FORCED corner (a boolean-union
    // intersection vertex) the boundary arrives via a tiny clipper noise
    // chord whose direction is arbitrary — the single adjacent chord is
    // unusable, and a mis-aimed end tangent makes the fitted cubic hook off
    // the boundary between the sparse error samples (visible loops/teeth at
    // connected-script letter joins). Use a windowed chord over the run
    // itself instead, clamped to half the run's arc length so short junction
    // wedge runs get a chord-scale window.
    const runEndTangent = (poly, atStart, endAnchor) => {
      const mN = poly.length;
      const chordT = atStart ? _vNorm(_vSub(poly[1], poly[0])) : _vNorm(_vSub(poly[mN - 2], poly[mN - 1]));
      if (!endAnchor || endAnchor.forceCorner !== true) return chordT;
      let arc = 0;
      for (let i = 0; i < mN - 1; i += 1) arc += _vLen(_vSub(poly[i + 1], poly[i]));
      const w = Math.min(windowDist, arc / 2);
      const t = _windowedTangent(poly, atStart ? 0 : mN - 1, atStart, w, false);
      // _windowedTangent gives the direction of travel; _fitCubic's end
      // tangent points back INTO the run.
      return atStart ? t : _vScale(t, -1);
    };

    const emitRun = (run) => {
      const poly = _flattenAnchorRun(run, flTol);
      const startIsC = cornerPos.some((c) => _vLen(_vSub(c, run[0])) <= Math.max(eps, tol));
      const endIsC = cornerPos.some((c) => _vLen(_vSub(c, run[run.length - 1])) <= Math.max(eps, tol));
      if (_runIsStraight(poly, tol)) {
        pushAnchor({ x: run[0].x, y: run[0].y, in: null, out: null }, startIsC);
        pushAnchor({ x: run[run.length - 1].x, y: run[run.length - 1].y, in: null, out: null }, endIsC);
        return;
      }
      const segs = [];
      const m = poly.length;
      _fitCubic(poly, 0, m - 1,
        runEndTangent(poly, true, run[0]), runEndTangent(poly, false, run[run.length - 1]), tol, segs, 0);
      if (!segs.length) {
        pushAnchor({ x: run[0].x, y: run[0].y, in: null, out: null }, startIsC);
        pushAnchor({ x: run[run.length - 1].x, y: run[run.length - 1].y, in: null, out: null }, endIsC);
        return;
      }
      pushAnchor({ x: segs[0][0].x, y: segs[0][0].y, in: null, out: { x: segs[0][1].x, y: segs[0][1].y } }, startIsC);
      for (let k = 1; k < segs.length; k += 1) {
        pushAnchor({
          x: segs[k][0].x, y: segs[k][0].y,
          in: { x: segs[k - 1][2].x, y: segs[k - 1][2].y },
          out: { x: segs[k][1].x, y: segs[k][1].y },
        }, false);
      }
      const ls = segs[segs.length - 1];
      pushAnchor({ x: ls[3].x, y: ls[3].y, in: { x: ls[2].x, y: ls[2].y }, out: null }, endIsC);
    };

    if (cornerIdx.length === 0) {
      // No corners: fit the whole closed ring (or the open span) as one smooth run.
      if (closed) {
        emitRun([...merged, { x: merged[0].x, y: merged[0].y, in: merged[0].in, out: null }]);
      } else {
        emitRun(merged);
      }
    } else if (closed) {
      for (let k = 0; k < cornerIdx.length; k += 1) {
        const start = cornerIdx[k];
        const end = cornerIdx[(k + 1) % cornerIdx.length];
        const run = [merged[start]];
        let i = start;
        do { i = (i + 1) % n; run.push(merged[i]); } while (i !== end);
        emitRun(run);
      }
    } else {
      // Open path: runs between consecutive corners (endpoints are corners).
      for (let k = 0; k < cornerIdx.length - 1; k += 1) {
        emitRun(merged.slice(cornerIdx[k], cornerIdx[k + 1] + 1));
      }
    }

    // Closed contours: the first anchor (start of run 0) and the final emitted
    // anchor coincide — fuse the seam so the ring has no duplicate.
    if (closed && outA.length > 2 && _vLen(_vSub(outA[0], outA[outA.length - 1])) <= 1e-6) {
      const last = outA.pop();
      if (last.in) outA[0].in = last.in;
      if (last.corner) outA[0].corner = true;
    }
    return outA.length >= 2 ? outA : tagAll(merged);
  };

  // ── The curve fit for ALGORITHM OUTPUT ──────────────────────────────────────
  //
  // The entry point for turning a generative layer's sampled geometry into cubic
  // anchors, replacing Catmull-Rom on a 0..1 scale (rebuildShapeAnchors),
  // Catmull-Rom on a 0..100 scale (Geometry3D.smoothToBezier), and the renderer's
  // draw-time midpoint-quadratic, which was not a fit at all.
  //
  // NOT the entry point for everything. It shares the Schneider core with
  // `fitBezierAnchors` and differs only in CORNER POLICY, and the two policies
  // suit opposite regimes:
  //
  //   this one (reduceAnchors, WINDOWED tangents) — right for COARSE, NOISY
  //     algorithm output. An immediate-neighbour turn test over-fires there:
  //     every sample of a coarse spiral looks like a bend, and 192 of the stock
  //     Lissajous's 200 samples read as corners. The windowed tangent looks
  //     ahead/behind by a fixed arc length, so it sees the shape, not the noise.
  //
  //   fitBezierAnchors (NAIVE turn angle) — right for DENSE, ALREADY-DRAWN
  //     outlines: the toolbar's flattened selection, a shape layer's source path,
  //     an SVG import. There, windowing is actively wrong — it smears a real
  //     corner into a BAND of pseudo-corners (a dense hexagon fits to 6 anchors
  //     naively and 140 windowed), and it is the resolution-dependent one of the
  //     pair, not the resolution-independent one.
  //
  // An earlier version of this comment claimed windowing meant "a square reads as
  // four corners at any resolution". That is false, and measurably backwards. See
  // plans.md, "The three Simplifies".
  //
  // Every tolerance is a FRACTION of the contour's bounding-box diagonal, so one
  // option set serves a 5 mm glyph and a 400 mm spiral identically.
  //
  // It also needs no handle-length clamp. pattern.js carries the repo's only
  // clamp because Catmull-Rom sizes a handle from the (next-prev) chord and
  // never consults the curve it is approximating, so lopsided neighbour spacing
  // balloons it into a self-intersecting loop. A least-squares fit solves for
  // handles against the actual points, and _generateBezier already clamps them
  // to the chord. See tests/unit/curve-fit-loops.test.js.

  // Smoothing 0 must still be a real curve, not a polyline: `curves: true` means
  // "draw this as a curve", and a toggle that does nothing at some slider
  // position is precisely the bug this work exists to kill. At smoothing 0 the
  // fit is TIGHT (it hugs the samples, preserving genuine corners); smoothing
  // opens the corner threshold and loosens the tolerance so the curve rounds
  // through bends instead of tracking them.
  // The corner threshold: the angle between a vertex's incoming and outgoing
  // tangents above which it is treated as a CORNER (kept sharp, handles broken)
  // rather than a point on a smooth curve.
  //
  // reduceAnchors defaults to 30 degrees, which is right for FONT outlines —
  // densely sampled, so its windowed tangent spans many points and reads the
  // true shape. Algorithm output is the opposite: a coarse spiral's samples are
  // far wider than the tangent window, so the window degenerates to the
  // immediate chord and every ~36-degree bend trips a 30-degree threshold. Every
  // vertex becomes a corner and nothing curves at all.
  //
  // 50 degrees is the floor that separates the two real cases: a spiral's bend
  // (~36 deg) smooths, a square's corner (90 deg) survives. Smoothing opens it
  // up to 95, where even a right angle rounds.
  const CURVE_CORNER_MIN_DEG = 50; // smoothing 0 — smooth bends, keep true corners
  const CURVE_CORNER_MAX_DEG = 95; // smoothing 1 — round through everything
  const CURVE_TOL_MIN_FRAC = 0.002; // reduceAnchors' default: a tight fit
  const CURVE_TOL_MAX_FRAC = 0.012;
  const SIMPLIFY_TOL_MAX_FRAC = 0.012; // bounded: past ~3% of the diagonal the fit returns nothing

  // Decimation BEFORE the fit — the step reduceAnchors does not have, and needs.
  //
  // reduceAnchors was built for FONT outlines: already-clean anchor contours,
  // where every vertex is meaningful. Algorithm output is raw sampled geometry
  // and is frequently NOISY — the stock `spiral` ships with a turbulence noise
  // enabled, giving a median turn angle of 42 degrees and a p90 of 140. Run
  // corner detection on that directly and ~2700 of its 4000 vertices read as
  // corners. Corners are hard SPLIT points, so no fit tolerance can merge them:
  // the result is a polyline with thousands of anchors and zero handles — a
  // curve toggle that produces no curve.
  //
  // Every other implementation in this repo got this right and decimated first
  // (rebuildShapeAnchors runs RDP; Geometry3D.smoothToBezier takes a
  // simplifyTolerance; raster-plane and topoform both pass one). So: decimate,
  // THEN detect corners, THEN fit. Corner detection then sees the SHAPE instead
  // of the sampling noise.
  //
  // At smoothing 0 + simplify 0 the tolerance is zero and nothing is decimated —
  // the fit stays faithful, and a genuinely jagged path stays jagged. Smoothing
  // is what decides how much detail to dissolve before fitting.
  const SMOOTH_DECIMATE_MAX_FRAC = 0.020;
  const SIMPLIFY_DECIMATE_MAX_FRAC = 0.035;

  const bboxDiagonal = (pts) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) return 0;
    return Math.hypot(maxX - minX, maxY - minY);
  };

  const hasAnchorShape = (list) =>
    Array.isArray(list) && list.some((a) => a && (('in' in a) || ('out' in a)));

  /**
   * points-or-anchors -> { anchors, closed, straight }
   *
   *   smoothing 0..1  how much the curve rounds THROUGH bends rather than
   *                   tracking them. Moves handles, never sample points.
   *   curves    bool  master enable. False + smoothing 0 => straight passthrough.
   *   simplify  0..1  additive anchor reduction (widens the fit tolerance).
   *   cornerRadius 0..1  optional fillet pass ("Round Corners"), applied after
   *                   the fit — a distinct verb from curve fitting.
   *
   * `straight: true` means nothing was fitted and the caller should leave the
   * point array alone — a byte-identical no-op, not an empty result.
   */
  const toCurveAnchors = (input, opts = {}) => {
    const closed = Boolean(opts.closed);
    if (!Array.isArray(input) || input.length < 2) {
      return { anchors: null, closed, straight: true };
    }

    const smoothing = clamp01(opts.smoothing ?? 0);
    const simplify = clamp01(opts.simplify ?? 0);
    const curves = opts.curves === true;

    // Nothing asked for a curve.
    if (!curves && smoothing <= 0) return { anchors: null, closed, straight: true };
    if (input.length < 3) return { anchors: null, closed, straight: true };

    // Anchors in (a font contour) are already clean — never decimate those, the
    // handles ARE the geometry. Only raw sampled point arrays get decimated.
    const isAnchorInput = hasAnchorShape(input);

    const decimate = (frac) => {
      if (isAnchorInput || !(frac > 0)) return input;
      const tol = frac * (bboxDiagonal(input) || 1);
      // Bare points, so RDP cannot strip curve metadata here. Keep at least a
      // triangle: an over-aggressive tolerance must not dissolve the path.
      const reduced = simplifyPath(input.map((p) => ({ x: p.x, y: p.y })), tol);
      return (Array.isArray(reduced) && reduced.length >= 3) ? reduced : input;
    };

    const liftAnchors = (source) => (isAnchorInput
      ? source
      : source.map((p) => ({
        x: p.x,
        y: p.y,
        in: null,
        out: null,
        forceCorner: p.forceCorner === true || p._tileEdge === true,
      })));

    const cornerAngleDeg = Number.isFinite(opts.cornerAngleDeg)
      ? opts.cornerAngleDeg
      : CURVE_CORNER_MIN_DEG + smoothing * (CURVE_CORNER_MAX_DEG - CURVE_CORNER_MIN_DEG);

    // The fit tolerance governs how tightly the cubics track the (already
    // decimated) points. Simplify contributes here too — decimation alone cannot
    // thin a CLEAN curve, where every sample is significant to RDP and nothing
    // gets dropped; letting the fit run looser is what merges those samples into
    // fewer, longer cubics. The contribution is bounded (and decimation carries
    // most of Simplify's weight) because past roughly 3% of the diagonal the fit
    // degenerates and returns no anchors at all.
    // Simplify's effect is scaled by `s` so the retry below can back it off. A
    // drag preview fits LOOSER than the committed geometry — never tighter, or the
    // preview costs more than the thing it is previewing.
    const tolFracAt = (s) => {
      if (Number.isFinite(opts.toleranceFrac)) {
        return opts.fastPreview ? opts.toleranceFrac * 3 : opts.toleranceFrac;
      }
      const base = CURVE_TOL_MIN_FRAC
        + smoothing * (CURVE_TOL_MAX_FRAC - CURVE_TOL_MIN_FRAC)
        + simplify * s * SIMPLIFY_TOL_MAX_FRAC;
      return opts.fastPreview ? base * 3 : base;
    };

    const fitOptsAt = (s) => {
      const out = { cornerAngleDeg, toleranceFrac: tolFracAt(s) };
      ['tolerance', 'mergeEps', 'mergeFrac', 'flattenTol', 'windowDist', 'windowDistFrac'].forEach((k) => {
        if (opts[k] !== undefined) out[k] = opts[k];
      });
      return out;
    };

    // Quality gate: only claim a curve if the fit actually found one.
    //
    // reduceAnchors splits at every corner and emits HANDLE-LESS anchors for the
    // runs between them — correct for genuinely straight runs. But a handle-less
    // pair renders as `C a a b b`, a degenerate cubic that draws as a straight
    // chord; and the renderer enters cubic mode as soon as ANY anchor carries a
    // handle. So on coarse or noisy geometry, where corner detection fires almost
    // everywhere, a couple of genuinely-smooth spans were enough to flip the whole
    // path into cubic mode and draw everything else as chords. The stock Lissajous
    // showed it plainly: Curves ON at Smoothing 0 drew 88 smooth quadratics, and
    // the SAME layer at Smoothing 0.6 drew 84 straight chords and 2 curves.
    const acceptable = (list) => {
      if (!Array.isArray(list) || list.length < 2) return false;
      const spans = closed ? list.length : list.length - 1;
      if (spans <= 0) return false;
      let curved = 0;
      for (let i = 0; i < spans; i++) {
        const a = list[i];
        const b = list[(i + 1) % list.length];
        if ((a && a.out) || (b && b.in)) curved += 1;
      }
      return curved * 2 > spans;
    };

    // Decimating BEFORE the fit is what lets Simplify thin a curve — but it is
    // also what breaks it. A coarser path trips corner detection harder, so past
    // some decimation the gate starts declining, and the path used to fall all the
    // way back to the raw (already decimated) polyline. That inverted the control:
    // dragging Simplify UP produced MORE points than the fitted curve it replaced,
    // and silently turned the curves off — measured on a stock flowfield, 8,899
    // points at Simplify 0.75 and 10,224 at 1.0.
    //
    // So back OFF the decimation and re-fit, rather than surrendering. Only
    // geometry that still cannot be fitted with no decimation at all is genuinely
    // angular, and only then do we honestly decline.
    // Back off Simplify's whole contribution together — it drives decimation AND
    // the fit tolerance, and either can tip the gate. At s = 0 this is exactly the
    // fit you would have got at Simplify 0, which is the strongest fit available,
    // so the sweep is monotone by construction: a higher Simplify can never end up
    // with fewer curves than a lower one.
    const decimateAt = (s) => (smoothing * SMOOTH_DECIMATE_MAX_FRAC)
      + (simplify * s * SIMPLIFY_DECIMATE_MAX_FRAC);

    let anchors = null;
    const scales = simplify > 0 ? [1, 0.5, 0.25, 0] : [1];
    for (let i = 0; i < scales.length; i++) {
      const s = scales[i];
      const candidate = reduceAnchors(liftAnchors(decimate(decimateAt(s))), closed, fitOptsAt(s));
      if (acceptable(candidate)) {
        anchors = candidate;
        break;
      }
    }

    // Genuinely angular: there is no curve here to find. Decline, and let the path
    // keep the rendering it would otherwise have had — claiming a curve and then
    // drawing chords is strictly worse than not claiming one.
    if (!anchors) {
      return { anchors: null, closed, straight: true };
    }

    const cornerRadius = clamp01(opts.cornerRadius ?? 0);
    if (cornerRadius > 0 && typeof _applyFillets === 'function') {
      // reduceAnchors already marks tangent breaks with `corner: true`; feed the
      // fillet pass those rather than re-deriving them by float-comparing
      // positions (which is what fitBezierAnchors did, fragilely).
      const cornerPos = anchors.filter((a) => a && a.corner).map((a) => ({ x: a.x, y: a.y }));
      if (cornerPos.length) anchors = _applyFillets(anchors, closed, cornerPos, cornerRadius);
    }

    return { anchors, closed, straight: false };
  };

  /**
   * The engine-side companion: fit a path in place and stamp the result onto its
   * meta so the renderer and the exporter both draw native cubics from it.
   *
   * Refuses any path that has declared its point array final (`meta.straight` /
   * `meta.baked`) or that is a parametric circle. Returns the input untouched
   * when nothing was fitted, so `smoothing 0, curves off` is free.
   */
  const applyCurveFit = (path, opts = {}) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const meta = path.meta || {};
    if (meta.kind === 'circle') return path;
    if (meta.straight === true || meta.baked === true) return path;
    // Already a fitted curve. The 3D algorithms (raster-plane, topoform,
    // spiralizer) bezierize their own sampled wires at generate time, where they
    // know which geometry is curvable and which is a hatch or an edge. Re-fitting
    // their anchors here would fit a curve to a curve and throw away what they
    // knew.
    if (Array.isArray(meta.anchors) && meta.anchors.some((a) => a && (a.in || a.out))) return path;

    const closed = opts.closed !== undefined ? Boolean(opts.closed) : isClosedLoopPath(path);
    const { anchors, straight } = toCurveAnchors(path, { ...opts, closed });
    if (straight || !anchors) return path;

    const out = path.map((pt) => ({ ...pt }));
    out.meta = { ...meta, anchors, closed, forceCurves: true };
    delete out.meta.straight;
    return out;
  };

  // `straight` (true line segments) or `baked` (already the exact display
  // curve) — either way the point array is final and must not be re-curved.
  const isVerbatimPath = (path) => {
    const meta = path && path.meta;
    return Boolean(meta && (meta.straight === true || meta.baked === true));
  };

  const api = {
    stripCurveMeta,
    smoothPath,
    simplifyPath,
    simplifyPathVisvalingam,
    fitBezierAnchors,
    reduceAnchors,
    roundCornerAnchors,
    applyCornerRounding,
    filletSharpAnchors,
    catmullRomAnchors,
    toCurveAnchors,
    applyCurveFit,
    isVerbatimPath,
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
