/**
 * Polygon boolean helpers for fill-built SVG import.
 */
(() => {
  const polygonClipping =
    window.polygonClipping
    || window.PolygonClipping
    || window.polygonClipping?.default
    || null;
  const EPS = 1e-6;

  const closeRing = (ring = []) => {
    if (!Array.isArray(ring) || ring.length < 3) return [];
    const next = ring.map((pt) => [Number(pt.x), Number(pt.y)]);
    const first = next[0];
    const last = next[next.length - 1];
    if (!first || !last) return [];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) > EPS) next.push([...first]);
    return next;
  };

  const ringArea = (ring = []) => {
    let area = 0;
    for (let i = 0; i + 1 < ring.length; i += 1) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return area / 2;
  };

  const pointInRing = (point, ring = []) => {
    if (!point || !Array.isArray(ring) || ring.length < 4) return false;
    let inside = false;
    const [px, py] = point;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects =
        (yi > py) !== (yj > py)
        && px < ((xj - xi) * (py - yi)) / ((yj - yi) || EPS) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const normalizeRing = (ring = []) => {
    const closed = closeRing(ring);
    if (closed.length < 4) return [];
    const deduped = closed.filter((pt, index, arr) =>
      index === 0 || Math.hypot(pt[0] - arr[index - 1][0], pt[1] - arr[index - 1][1]) > EPS
    );
    if (deduped.length < 4) return [];
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) > EPS) deduped.push([...first]);
    return deduped;
  };

  const normalizeMultiPolygon = (multiPolygon = []) =>
    (multiPolygon || [])
      .map((polygon) =>
        (polygon || [])
          .map((ring) => normalizeRing((ring || []).map((pt) => ({ x: pt[0], y: pt[1] }))))
          .filter((ring) => ring.length >= 4)
      )
      .filter((polygon) => polygon.length);

  const union = (...geoms) => {
    if (!polygonClipping?.union) return [];
    const filtered = geoms.filter((geom) => Array.isArray(geom) && geom.length);
    if (!filtered.length) return [];
    return normalizeMultiPolygon(polygonClipping.union(...filtered));
  };

  const xor = (...geoms) => {
    if (!polygonClipping?.xor) return [];
    const filtered = geoms.filter((geom) => Array.isArray(geom) && geom.length);
    if (!filtered.length) return [];
    return normalizeMultiPolygon(polygonClipping.xor(...filtered));
  };

  const difference = (subject, ...clips) => {
    if (!polygonClipping?.difference) return [];
    const filteredClips = clips.filter((geom) => Array.isArray(geom) && geom.length);
    if (!Array.isArray(subject) || !subject.length) return [];
    if (!filteredClips.length) return normalizeMultiPolygon(subject);
    return normalizeMultiPolygon(polygonClipping.difference(subject, ...filteredClips));
  };

  const intersection = (...geoms) => {
    if (!polygonClipping?.intersection) return [];
    const filtered = geoms.filter((geom) => Array.isArray(geom) && geom.length);
    if (!filtered.length) return [];
    return normalizeMultiPolygon(polygonClipping.intersection(...filtered));
  };

  const ringToMultiPolygon = (ring = []) => {
    const normalized = normalizeRing(ring);
    return normalized.length >= 4 ? [[[...normalized]]] : [];
  };

  const ringsToEvenOddMultiPolygon = (rings = []) => {
    const geoms = (rings || []).map((ring) => ringToMultiPolygon(ring)).filter((geom) => geom.length);
    if (!geoms.length) return [];
    return xor(...geoms);
  };

  const ringsToNonZeroMultiPolygon = (rings = []) => {
    const normalized = (rings || []).map((ring) => normalizeRing(ring)).filter((ring) => ring.length >= 4);
    if (!normalized.length) return [];
    const positive = [];
    const negative = [];
    normalized.forEach((ring) => {
      const geom = [[[...ring]]];
      if (ringArea(ring) >= 0) positive.push(geom);
      else negative.push(geom);
    });
    const subject = positive.length ? union(...positive) : union(...normalized.map((ring) => [[[...ring]]]));
    const clips = negative.length ? union(...negative) : [];
    return clips.length ? difference(subject, clips) : subject;
  };

  const offsetMultiPolygon = (multiPolygon = [], dx = 0, dy = 0) =>
    (multiPolygon || []).map((polygon) =>
      (polygon || []).map((ring) =>
        (ring || []).map((pt) => [pt[0] + dx, pt[1] + dy])
      )
    );

  const rectToMultiPolygon = (minX, minY, maxX, maxY) => [[[
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ]]];

  const multiPolygonToPaths = (multiPolygon = [], options = {}) => {
    const minX = Number(options.minX);
    const minY = Number(options.minY);
    const maxX = Number(options.maxX);
    const maxY = Number(options.maxY);
    const snapTol = Number(options.snapTol) || 1e-4;
    const snap = (value, low, high) => {
      if (Number.isFinite(low) && Math.abs(value - low) <= snapTol) return low;
      if (Number.isFinite(high) && Math.abs(value - high) <= snapTol) return high;
      return value;
    };
    return (multiPolygon || []).flatMap((polygon) =>
      (polygon || []).map((ring) =>
        ring.map((pt) => ({
          x: snap(pt[0], minX, maxX),
          y: snap(pt[1], minY, maxY),
        }))
      )
    );
  };

  const api = {
    closeRing,
    pointInRing,
    ringArea,
    union,
    xor,
    difference,
    intersection,
    ringToMultiPolygon,
    ringsToEvenOddMultiPolygon,
    ringsToNonZeroMultiPolygon,
    offsetMultiPolygon,
    rectToMultiPolygon,
    multiPolygonToPaths,
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.FillBoolean = {
    ...(window.Vectura.FillBoolean || {}),
    ...api,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
