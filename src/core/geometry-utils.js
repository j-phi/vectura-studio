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
      if (dx === 0 && dy === 0) return sq(p.x - a.x) + sq(p.y - a.y);
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
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

  const api = {
    smoothPath,
    simplifyPath,
    simplifyPathVisvalingam,
    countPathPoints,
    clonePaths,
  };

  if (typeof window !== 'undefined') {
    window.Vectura = window.Vectura || {};
    window.Vectura.GeometryUtils = {
      ...(window.Vectura.GeometryUtils || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
