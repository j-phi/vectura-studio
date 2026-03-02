/**
 * Lightweight polygon + polyline masking helpers.
 */
(() => {
  const EPS = 1e-6;

  const clonePath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
    return next;
  };

  const closePolygonIfNeeded = (polygon = []) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return [];
    const next = polygon.map((pt) => ({ x: pt.x, y: pt.y }));
    const first = next[0];
    const last = next[next.length - 1];
    if (!first || !last) return [];
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    if (dx * dx + dy * dy > EPS) next.push({ x: first.x, y: first.y });
    return next;
  };

  const normalizePolygons = (polygons = []) =>
    (polygons || [])
      .map((polygon) => closePolygonIfNeeded(polygon))
      .filter((polygon) => polygon.length >= 4);

  const pointInPolygon = (point, polygon = []) => {
    if (!point || !Array.isArray(polygon) || polygon.length < 4) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (!a || !b) continue;
      const intersects =
        (a.y > point.y) !== (b.y > point.y)
        && point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(EPS, b.y - a.y) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const segmentIntersectSegment = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < EPS) return null;
    const qp = { x: c.x - a.x, y: c.y - a.y };
    const t = (qp.x * s.y - qp.y * s.x) / denom;
    const u = (qp.x * r.y - qp.y * r.x) / denom;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return {
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u)),
      x: a.x + r.x * t,
      y: a.y + r.y * t,
    };
  };

  const segmentPathByPolygons = (path, polygons = [], options = {}) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const closed = Boolean(options.closed);
    let segments = [clonePath(path)];
    const keepInside = Boolean(options.invert);

    normalizePolygons(polygons).forEach((polygon) => {
      const nextSegments = [];
      segments.forEach((segment) => {
        if (!Array.isArray(segment) || segment.length < 2) return;
        let current = [];
        for (let i = 1; i < segment.length; i++) {
          const start = segment[i - 1];
          const end = segment[i];
          if (!start || !end) continue;
          const intersections = [{ t: 0, x: start.x, y: start.y }, { t: 1, x: end.x, y: end.y }];
          for (let j = 1; j < polygon.length; j++) {
            const hit = segmentIntersectSegment(start, end, polygon[j - 1], polygon[j]);
            if (hit) intersections.push(hit);
          }
          intersections.sort((left, right) => left.t - right.t);
          const deduped = [];
          intersections.forEach((entry) => {
            const prev = deduped[deduped.length - 1];
            if (!prev || Math.abs(prev.t - entry.t) > 1e-5) deduped.push(entry);
          });
          for (let j = 1; j < deduped.length; j++) {
            const a = deduped[j - 1];
            const b = deduped[j];
            const mid = {
              x: (a.x + b.x) * 0.5,
              y: (a.y + b.y) * 0.5,
            };
            const inside = pointInPolygon(mid, polygon);
            const keep = keepInside ? inside : !inside;
            if (!keep) {
              if (current.length > 1) nextSegments.push(current);
              current = [];
              continue;
            }
            const head = { x: a.x, y: a.y };
            const tail = { x: b.x, y: b.y };
            if (!current.length) current.push(head);
            else {
              const last = current[current.length - 1];
              const dx = last.x - head.x;
              const dy = last.y - head.y;
              if (dx * dx + dy * dy > EPS) current.push(head);
            }
            current.push(tail);
          }
        }
        if (current.length > 1) nextSegments.push(current);
      });
      segments = nextSegments;
    });

    return segments
      .map((segment) => {
        const next = clonePath(segment);
        if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
        return next;
      })
      .filter((segment) => segment.length >= (closed ? 3 : 2));
  };

  const unionPolygons = (polygons = []) => normalizePolygons(polygons);

  const api = {
    closePolygonIfNeeded,
    normalizePolygons,
    pointInPolygon,
    segmentIntersectSegment,
    segmentPathByPolygons,
    unionPolygons,
  };

  if (typeof window !== 'undefined') {
    window.Vectura = window.Vectura || {};
    window.Vectura.PathBoolean = {
      ...(window.Vectura.PathBoolean || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
