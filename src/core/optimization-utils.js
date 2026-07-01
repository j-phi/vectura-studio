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

  const api = {
    pathLength,
    pathEndpoints,
    pathCentroid,
    isClosedPath,
    closePathIfNeeded,
    reversePath,
    offsetPath,
    joinNearbyPaths,
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
