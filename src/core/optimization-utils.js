/**
 * Shared optimization helpers for path operations.
 */
(() => {
  const pathLength = (path) => {
    if (path && path.meta && path.meta.kind === 'circle') {
      const r = path.meta.r ?? path.meta.rx ?? 0;
      return Math.max(0, 2 * Math.PI * r);
    }
    if (!Array.isArray(path)) return 0;
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  };

  const pathEndpoints = (path) => {
    if (path && path.meta && path.meta.kind === 'circle') {
      const cx = path.meta.cx ?? path.meta.x ?? 0;
      const cy = path.meta.cy ?? path.meta.y ?? 0;
      return { start: { x: cx, y: cy }, end: { x: cx, y: cy } };
    }
    if (!Array.isArray(path) || !path.length) return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
    return { start: path[0], end: path[path.length - 1] };
  };

  const pathCentroid = (path) => {
    if (path && path.meta && path.meta.kind === 'circle') {
      const cx = path.meta.cx ?? path.meta.x ?? 0;
      const cy = path.meta.cy ?? path.meta.y ?? 0;
      return { x: cx, y: cy };
    }
    if (!Array.isArray(path) || !path.length) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    path.forEach((pt) => {
      sx += pt.x;
      sy += pt.y;
    });
    const denom = path.length || 1;
    return { x: sx / denom, y: sy / denom };
  };

  const isClosedPath = (path) => {
    if (!Array.isArray(path) || path.length < 3) return false;
    const start = path[0];
    const end = path[path.length - 1];
    const dx = start.x - end.x;
    const dy = start.y - end.y;
    return dx * dx + dy * dy < 1e-6;
  };

  const closePathIfNeeded = (path, closed) => {
    if (!closed || !Array.isArray(path) || path.length < 2) return path;
    const start = path[0];
    const end = path[path.length - 1];
    const dx = start.x - end.x;
    const dy = start.y - end.y;
    if (dx * dx + dy * dy > 1e-6) {
      const next = path.slice();
      next.push({ x: start.x, y: start.y });
      if (path.meta) next.meta = path.meta;
      return next;
    }
    return path;
  };

  // Reversing a native-cubic outline (text glyph, morph ring) must reverse its
  // anchor list AND swap each anchor's in/out handles — the incoming handle of a
  // reversed vertex is the old outgoing handle. Without this, tracePath would
  // redraw the OLD curve from stale handles at the new vertex order (drawing a
  // different, un-reversed contour). Plain polylines (no anchors) just reverse
  // the point array. The source path is never mutated.
  const reversePath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.slice().reverse();
    if (path.meta) {
      const meta = { ...path.meta };
      if (Array.isArray(path.meta.anchors)) {
        meta.anchors = path.meta.anchors.slice().reverse().map((a) => (
          a ? {
            ...a,
            in: a.out ? { x: a.out.x, y: a.out.y } : null,
            out: a.in ? { x: a.in.x, y: a.in.y } : null,
          } : a
        ));
      }
      next.meta = meta;
    }
    return next;
  };

  const offsetPath = (path, dx, dy) => {
    if (path && path.meta && path.meta.kind === 'circle') {
      const meta = { ...path.meta };
      const cx = meta.cx ?? meta.x ?? 0;
      const cy = meta.cy ?? meta.y ?? 0;
      meta.cx = cx + dx;
      meta.cy = cy + dy;
      const next = [];
      next.meta = meta;
      return next;
    }
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    if (path.meta) {
      // Multipass offset copies are INDEPENDENT physical passes. Native-cubic
      // outlines (text glyphs, morph rings) draw from meta.anchors, so the handles
      // must be translated alongside the point array — otherwise the offset copy
      // renders its smooth outline back at the UN-offset base position (collapsing
      // onto pass 1 in the draw-order overlay, the base reveal during a scrub, and
      // SVG export). Also gives each pass its own meta object rather than sharing
      // the base pass's by reference.
      const meta = { ...path.meta };
      if (Array.isArray(path.meta.anchors)) {
        meta.anchors = path.meta.anchors.map((a) => (
          a ? {
            ...a,
            x: a.x + dx,
            y: a.y + dy,
            in: a.in ? { x: a.in.x + dx, y: a.in.y + dy } : a.in,
            out: a.out ? { x: a.out.x + dx, y: a.out.y + dy } : a.out,
          } : a
        ));
      }
      next.meta = meta;
    }
    return next;
  };

  const joinNearbyPaths = (paths, options = {}) => {
    const gapTolerance = Number.isFinite(options.gapTolerance) ? options.gapTolerance : 1;
    const angleTolerance = Number.isFinite(options.angleTolerance) ? options.angleTolerance : Math.PI / 12;
    const collinearBias = Number.isFinite(options.collinearBias) ? options.collinearBias : 0.85;
    const source = (paths || [])
      .filter((path) => Array.isArray(path) && path.length >= 2 && !isClosedPath(path))
      .map((path) => {
        const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
        if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
        return next;
      });

    const normalizedDirection = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };
    const dot = (a, b) => a.x * b.x + a.y * b.y;

    // Adversarial inputs (long chains of pairwise-mergeable paths in pathological
    // ordering) can degrade quadratically. Cap iterations defensively. Bugs-11.
    const maxIter = source.length * 4;
    let iter = 0;
    let changed = true;
    while (changed) {
      if (++iter > maxIter) {
        console.warn(`[Optimization] joinNearbyPaths iteration cap hit (paths=${source.length}, iter=${iter}); aborting further merges`);
        break;
      }
      changed = false;
      outer: for (let i = 0; i < source.length; i += 1) {
        const a = source[i];
        if (!a || a.length < 2) continue;
        const aEnd = a[a.length - 1];
        const aDir = normalizedDirection(a[a.length - 2], aEnd);
        for (let j = i + 1; j < source.length; j += 1) {
          const b = source[j];
          if (!b || b.length < 2) continue;
          const bStart = b[0];
          const gap = Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y);
          if (gap > gapTolerance) continue;
          const bDir = normalizedDirection(bStart, b[1]);
          const alignment = dot(aDir, bDir);
          const angle = Math.acos(Math.max(-1, Math.min(1, alignment)));
          if (angle > angleTolerance && alignment < collinearBias) continue;
          const merged = a.concat(b.slice(1));
          if (a.meta) merged.meta = a.meta;
          source.splice(j, 1);
          source.splice(i, 1, merged);
          changed = true;
          break outer;
        }
      }
    }

    return source;
  };

  /**
   * Chain segments that share an EXACT endpoint back into continuous runs.
   *
   * Distinct from `joinNearbyPaths`, which is a plotter optimization: that one
   * welds across a GAP (default 1 mm) and only when the two runs are roughly
   * collinear, and it happily merges paths from different pens. This is the
   * opposite contract — a lossless RE-ASSEMBLY of geometry that was emitted in
   * pieces:
   *
   *   • exact-match only (tolerance defaults to 1e-6 world units), so it can
   *     never invent ink across a real gap;
   *   • grouped by a caller-supplied signature (`keyOf`), so runs only chain
   *     with runs that share a pen / class / owner;
   *   • no angle test — a chain follows the geometry through corners, because
   *     the corner is real and the consumer (a curve fitter) is the thing that
   *     decides whether to round it.
   *
   * WHY EXACT MATCH IS THE HIDDEN-LINE SAFETY PROPERTY. 3D scene edges are
   * emitted one projected mesh edge per path, AFTER hidden-line clipping. Two
   * adjacent VISIBLE edges share a mesh vertex, so their projected endpoints are
   * bit-identical and chain. When the clipper truncates an edge, the surviving
   * run starts at an interpolated interior point that coincides with nothing —
   * so an occluded stretch can never be bridged. Loosening this to a tolerant
   * match would silently paint over hidden geometry.
   *
   * Deterministic: paths are consumed in input order and, where several
   * candidates meet at a vertex, the lowest input index wins.
   *
   * Returns new arrays; `meta` is carried from each chain's FIRST segment, with
   * `meta.closed` set when the run comes back to its own start.
   */
  const chainSegmentsByEndpoint = (paths, options = {}) => {
    const list = Array.isArray(paths) ? paths : [];
    if (list.length < 2) return list.slice();
    const tol = Number.isFinite(options.tolerance) ? Math.max(options.tolerance, 0) : 1e-6;
    const keyOf = typeof options.keyOf === 'function' ? options.keyOf : () => '';
    // Quantize on a grid at least as coarse as the tolerance, then probe the 3x3
    // neighbourhood so a pair straddling a cell boundary still meets.
    const q = Math.max(tol, 1e-9);
    const cell = (v) => Math.round(v / q);
    const near = (a, b) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

    const usable = (p) => Array.isArray(p) && p.length >= 2 && !isClosedPath(p);
    const out = new Array(list.length).fill(null);
    const groups = new Map();
    list.forEach((p, i) => {
      if (!usable(p)) return;
      const k = String(keyOf(p, i));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });

    // Slot bookkeeping: a chain is emitted at the position of its FIRST segment,
    // so painter's order (which opaque scene fills depend on) is preserved.
    const consumed = new Set();

    groups.forEach((idxs) => {
      if (idxs.length < 2) return;
      // endpoint bucket -> [{ i, end }] where end 0 = head, 1 = tail
      const buckets = new Map();
      const push = (pt, i, end) => {
        const k = `${cell(pt.x)},${cell(pt.y)}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push({ i, end });
      };
      idxs.forEach((i) => {
        const p = list[i];
        push(p[0], i, 0);
        push(p[p.length - 1], i, 1);
      });
      const candidates = (pt) => {
        const cx = cell(pt.x);
        const cy = cell(pt.y);
        const hits = [];
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const b = buckets.get(`${cx + dx},${cy + dy}`);
            if (b) hits.push(...b);
          }
        }
        return hits.sort((a, b) => (a.i - b.i) || (a.end - b.end));
      };
      // One partner at a vertex: an endpoint shared by 3+ runs is a junction,
      // and picking a branch there would be arbitrary. Leave junctions alone.
      const pick = (pt, selfIdx) => {
        const hits = candidates(pt).filter((h) => h.i !== selfIdx && !consumed.has(h.i)
          && near(h.end === 0 ? list[h.i][0] : list[h.i][list[h.i].length - 1], pt));
        return hits.length === 1 ? hits[0] : null;
      };

      idxs.forEach((seed) => {
        if (consumed.has(seed)) return;
        consumed.add(seed);
        const pts = list[seed].map((pt) => ({ ...pt }));
        let grew = false;

        // Extend forward off the tail.
        for (;;) {
          const tail = pts[pts.length - 1];
          if (near(tail, pts[0]) && pts.length > 2) break; // closed
          const hit = pick(tail, -1);
          if (!hit) break;
          const seg = list[hit.i];
          const ordered = hit.end === 0 ? seg : seg.slice().reverse();
          consumed.add(hit.i);
          for (let k = 1; k < ordered.length; k += 1) pts.push({ ...ordered[k] });
          grew = true;
        }
        // Extend backward off the head.
        for (;;) {
          const head = pts[0];
          if (near(head, pts[pts.length - 1]) && pts.length > 2) break; // closed
          const hit = pick(head, -1);
          if (!hit) break;
          const seg = list[hit.i];
          // Append so the segment's far end becomes the new head.
          const ordered = hit.end === 1 ? seg : seg.slice().reverse();
          consumed.add(hit.i);
          for (let k = ordered.length - 2; k >= 0; k -= 1) pts.unshift({ ...ordered[k] });
          grew = true;
        }

        if (!grew) { out[seed] = list[seed]; return; }
        const src = list[seed];
        const meta = src.meta ? { ...src.meta } : {};
        if (pts.length > 2 && near(pts[0], pts[pts.length - 1])) meta.closed = true;
        pts.meta = meta;
        out[seed] = pts;
      });
    });

    const result = [];
    list.forEach((p, i) => {
      if (out[i]) { result.push(out[i]); return; }
      if (!usable(p)) { result.push(p); return; }
      if (!consumed.has(i)) result.push(p); // untouched (single-item group)
    });
    return result;
  };

  const api = {
    pathLength,
    pathEndpoints,
    pathCentroid,
    isClosedPath,
    closePathIfNeeded,
    reversePath,
    offsetPath,
    joinNearbyPaths,
    chainSegmentsByEndpoint,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    window.Vectura.OptimizationUtils = {
      ...(window.Vectura.OptimizationUtils || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
