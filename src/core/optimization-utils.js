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

  const api = {
    pathLength,
    pathEndpoints,
    pathCentroid,
    isClosedPath,
    closePathIfNeeded,
    reversePath,
    offsetPath,
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
