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

  const reversePath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.slice().reverse();
    if (path.meta) next.meta = path.meta;
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
    if (path.meta) next.meta = path.meta;
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

    let changed = true;
    while (changed) {
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
    window.Vectura = window.Vectura || {};
    window.Vectura.OptimizationUtils = {
      ...(window.Vectura.OptimizationUtils || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
