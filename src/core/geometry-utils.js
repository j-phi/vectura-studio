/**
 * Shared geometry helpers for path smoothing/simplification and cloning.
 */
(() => {
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
    if (path.meta) simplified.meta = path.meta;
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
    if (path.meta) simplified.meta = path.meta;
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

  const sampleCubicBezier = (p0, c1, c2, p1) => {
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const handles =
      Math.hypot(c1.x - p0.x, c1.y - p0.y) +
      Math.hypot(c2.x - p1.x, c2.y - p1.y);
    const rough = Math.max(dist, handles);
    const steps = Math.min(120, Math.max(8, Math.round(rough / 4)));
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(cubicAtT(p0, c1, c2, p1, i / steps));
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
    const output = [];
    let current = [path[0]];
    let hit = false;
    const addSegment = () => {
      if (current.length > 1) output.push(current);
      current = [];
    };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
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
      ts = ts.filter((t) => t > 1e-4 && t < 1 - 1e-4).sort((a, b) => a - b);
      if (!ts.length) {
        if (!current.length) current.push(a);
        current.push(b);
        continue;
      }
      hit = true;
      if (!current.length) current.push(a);
      ts.forEach((t) => {
        const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        current.push(pt);
        addSegment();
        current.push(pt);
      });
      current.push(b);
    }
    if (current.length > 1) output.push(current);
    if (!hit) return null;
    // For closed polylines (first point == last point), the segment that started
    // at path[0] and the final trailing segment that ends at path[0] are the
    // same contiguous region of the closed loop. Merge them into one piece so
    // the scissor does not emit a spurious extra segment near the start anchor.
    const fp = path[0];
    const lp = path[path.length - 1];
    const isClosed = path.length > 2 &&
      Math.abs(fp.x - lp.x) < 1e-4 && Math.abs(fp.y - lp.y) < 1e-4;
    if (isClosed && output.length >= 2) {
      const tail = output.pop();
      const head = output.shift();
      output.unshift([...tail, ...head.slice(1)]);
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
    if (closed && count > 2) emit(anchors[count - 1], anchors[0]);
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

  const clampRange = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
  const TINY_HANDLE_LEN = 0.0001;

  /**
   * Rebuild anchors of a freeform shape path: decimate via RDP scaled by `simplify`,
   * then auto-generate cubic bezier .in/.out handles via Catmull-Rom-to-Bezier scaled
   * by `smoothing`. Pure — no DOM, no engine access.
   *
   * opts:
   *   simplify   0..1 — RDP tolerance scale (tol = simplify * max(dW,dH) * 0.01)
   *   smoothing  0..2 — Catmull-Rom tension; 0 alone keeps straight (null handles)
   *   curves     bool — convert corner anchors to bezier representation. At
   *                     smoothing=0 the handles are 0.0001 in the tangent direction,
   *                     so the shape renders identically to the polyline but is now
   *                     structurally bezier (ready for smoothing > 0 to widen).
   *   closed     bool
   *   bounds     { dW, dH } — for tolerance scaling
   */
  const rebuildShapeAnchors = (anchors, opts = {}) => {
    const simplify = clamp01(opts.simplify ?? 0);
    const smoothing = clampRange(opts.smoothing ?? 0, 0, 2);
    const curves = Boolean(opts.curves);
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

    // 2. Bezierize via Catmull-Rom-to-Bezier, respecting existing bezier handles
    const n = kept.length;
    const out = kept.map((a) => ({
      x: a.x,
      y: a.y,
      in: a.in ? { x: a.in.x, y: a.in.y } : null,
      out: a.out ? { x: a.out.x, y: a.out.y } : null,
    }));
    const bezierize = smoothing > 0 || curves;
    if (bezierize && n >= 2) {
      const tension = smoothing;
      const vLen = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
      const vNorm = (v) => { const l = vLen(v) || 1e-9; return { x: v.x / l, y: v.y / l }; };
      const vDot = (a, b) => a.x * b.x + a.y * b.y;
      const vScale = (v, s) => ({ x: v.x * s, y: v.y * s });
      const vLerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      // Grow handle offset to at least targetLen while preserving direction.
      const floorOffset = (off, targetLen) => {
        const l = vLen(off);
        return l >= targetLen ? off : vScale(vNorm(off), targetLen);
      };

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
        const tangentX = next.x - prev.x;
        const tangentY = next.y - prev.y;
        const tangentDir = vNorm({ x: tangentX, y: tangentY });
        const crRawLen = (vLen({ x: tangentX, y: tangentY }) * tension) / 6;
        const cornerLen = curves ? Math.max(crRawLen, TINY_HANDLE_LEN) : crRawLen;
        const crDx = tangentDir.x * cornerLen;
        const crDy = tangentDir.y * cornerLen;
        const crVec = { x: crDx, y: crDy };   // offset in "out" direction
        const crLen = cornerLen;
        const crDir = tangentDir;              // unit tangent pointing "out"

        const ax = kept[i].x;
        const ay = kept[i].y;
        const srcOut = kept[i].out;
        const srcIn  = kept[i].in;
        // Handle offsets relative to anchor (handles are stored as absolute positions).
        const outOff = srcOut ? { x: srcOut.x - ax, y: srcOut.y - ay } : null;
        const inOff  = srcIn  ? { x: srcIn.x  - ax, y: srcIn.y  - ay } : null;

        if (!outOff && !inOff) {
          // Corner node: apply CR handles (tiny when smoothing=0, CR-scaled otherwise).
          out[i].out = { x: ax + crDx, y: ay + crDy };
          out[i].in  = { x: ax - crDx, y: ay - crDy };
        } else if (smoothing === 0) {
          // curves=ON with no smoothing: leave existing bezier handles completely alone.
          // They were already copied in the out.map() above.
        } else {
          // Bezier node with smoothing > 0: check each handle independently for hooks.
          const outChord = { x: next.x - ax, y: next.y - ay };
          const inChord  = { x: prev.x - ax, y: prev.y - ay };
          // Handles are aligned when in/out offsets are ≈ antiparallel (within ~20°).
          const aligned = outOff && inOff && vDot(vNorm(outOff), vNorm(inOff)) < -0.94;
          // Lerp factor clamped to [0,1]: smoothing can be 0..2 but a factor > 1 overshoots.
          const blendFactor = Math.min(smoothing, 1);

          // out handle
          if (outOff) {
            const isHook = vDot(vNorm(outOff), vNorm(outChord)) < 0;
            if (isHook) {
              out[i].out = { x: ax + crDx, y: ay + crDy };
            } else if (aligned) {
              const newOff = floorOffset(outOff, crLen);
              out[i].out = { x: ax + newOff.x, y: ay + newOff.y };
            } else {
              // Broken: lerp direction toward CR tangent, enforce min length.
              const blendedDir = vNorm(vLerp(vNorm(outOff), crDir, blendFactor));
              const blendedLen = Math.max(vLen(outOff), crLen);
              out[i].out = { x: ax + blendedDir.x * blendedLen, y: ay + blendedDir.y * blendedLen };
            }
          } else {
            out[i].out = { x: ax + crDx, y: ay + crDy };
          }

          // in handle (CR direction is reversed)
          if (inOff) {
            const isHook = vDot(vNorm(inOff), vNorm(inChord)) < 0;
            if (isHook) {
              out[i].in = { x: ax - crDx, y: ay - crDy };
            } else if (aligned) {
              const newOff = floorOffset(inOff, crLen);
              out[i].in = { x: ax + newOff.x, y: ay + newOff.y };
            } else {
              const negCrDir = { x: -crDir.x, y: -crDir.y };
              const blendedDir = vNorm(vLerp(vNorm(inOff), negCrDir, blendFactor));
              const blendedLen = Math.max(vLen(inOff), crLen);
              out[i].in = { x: ax + blendedDir.x * blendedLen, y: ay + blendedDir.y * blendedLen };
            }
          } else {
            out[i].in = { x: ax - crDx, y: ay - crDy };
          }
        }
      }
      if (!closed) {
        // Endpoints get one-sided derivative — null the outward-pointing handle
        out[0].in = null;
        out[n - 1].out = null;
      }
    }

    const changed = out.length !== anchors.length || bezierize;
    return { anchors: out, changed };
  };

  // True when at least one anchor has a handle long enough to bend the
  // resampled polyline. TINY_HANDLE_LEN (0.0001) handles produced by
  // curves=ON+smoothing=0 stay below the threshold and read as "not baked",
  // so quadratic smoothing can still apply downstream.
  const BAKED_HANDLE_MIN_SQ = 0.25;
  const hasBakedBezierCurvature = (anchors) => {
    if (!Array.isArray(anchors)) return false;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      if (!a) continue;
      if (a.out) {
        const dx = a.out.x - a.x;
        const dy = a.out.y - a.y;
        if (dx * dx + dy * dy > BAKED_HANDLE_MIN_SQ) return true;
      }
      if (a.in) {
        const dx = a.in.x - a.x;
        const dy = a.in.y - a.y;
        if (dx * dx + dy * dy > BAKED_HANDLE_MIN_SQ) return true;
      }
    }
    return false;
  };

  const api = {
    smoothPath,
    simplifyPath,
    simplifyPathVisvalingam,
    countPathPoints,
    clonePaths,
    cloneAnchors,
    pointsToAnchors,
    buildPolylineFromAnchors,
    rebuildShapeAnchors,
    hasBakedBezierCurvature,
    cubicAtT,
    sampleCubicBezier,
    lerp,
    segmentIntersection,
    segmentCircleIntersections,
    splitPathByShape,
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
