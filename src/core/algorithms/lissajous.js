/**
 * lissajous algorithm definition.
 */
(() => {
  const EPSILON = 1e-6;
  const INTERSECTION_EPSILON = 1e-4;
  const ENVELOPE_BINS = 144;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const pointEquals = (a, b, epsilon = EPSILON) =>
    !!a
    && !!b
    && Math.abs(a.x - b.x) <= epsilon
    && Math.abs(a.y - b.y) <= epsilon;

  const segmentIntersection = (a, b, c, d) => {
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(den) < EPSILON) return null;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    if (
      t <= INTERSECTION_EPSILON
      || t >= 1 - INTERSECTION_EPSILON
      || u <= INTERSECTION_EPSILON
      || u >= 1 - INTERSECTION_EPSILON
    ) return null;
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      t,
      u,
    };
  };

  const pathLength = (path = []) => {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return total;
  };

  const interpolatePoint = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });

  const truncateFromStart = (path, percent = 0) => {
    if (!Array.isArray(path) || path.length < 2) return path;
    const amount = clamp(Number(percent) || 0, 0, 100) / 100;
    if (amount <= 0) return path;
    if (amount >= 1) return [];
    const target = pathLength(path) * amount;
    if (target <= EPSILON) return path;
    let remaining = target;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining >= segLen - EPSILON) {
        remaining -= segLen;
        continue;
      }
      const t = segLen <= EPSILON ? 0 : remaining / segLen;
      return [interpolatePoint(a, b, t), ...path.slice(i)];
    }
    return [];
  };

  const truncateFromEnd = (path, percent = 0) => {
    if (!Array.isArray(path) || path.length < 2) return path;
    const amount = clamp(Number(percent) || 0, 0, 100) / 100;
    if (amount <= 0) return path;
    if (amount >= 1) return [];
    const target = pathLength(path) * amount;
    if (target <= EPSILON) return path;
    let remaining = target;
    for (let i = path.length - 1; i > 0; i--) {
      const a = path[i - 1];
      const b = path[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining >= segLen - EPSILON) {
        remaining -= segLen;
        continue;
      }
      const t = segLen <= EPSILON ? 1 : 1 - remaining / segLen;
      return [...path.slice(0, i), interpolatePoint(a, b, t)];
    }
    return [];
  };

  const applyEndpointTruncation = (path, truncateStart = 0, truncateEnd = 0) => {
    let next = truncateFromStart(path, truncateStart);
    if (!next.length) return [];
    next = truncateFromEnd(next, truncateEnd);
    return next.length >= 2 ? next : next;
  };

  const pointInPolygon = (point, polygon = []) => {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (!a || !b) continue;
      const dy = b.y - a.y;
      const safeDy = Math.abs(dy) < EPSILON ? (dy < 0 ? -EPSILON : EPSILON) : dy;
      const intersects =
        (a.y > point.y) !== (b.y > point.y)
        && point.x < ((b.x - a.x) * (point.y - a.y)) / safeDy + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const buildEnvelope = (path, center) => {
    if (!Array.isArray(path) || path.length < 3) return [];
    const bins = Array.from({ length: ENVELOPE_BINS }, () => null);
    path.forEach((point) => {
      if (!point) return;
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const radius = Math.hypot(dx, dy);
      if (radius <= EPSILON) return;
      const angle = Math.atan2(dy, dx);
      const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
      const bin = Math.min(ENVELOPE_BINS - 1, Math.floor((normalized / (Math.PI * 2)) * ENVELOPE_BINS));
      const current = bins[bin];
      if (!current || radius > current.radius) {
        bins[bin] = {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
          radius,
        };
      }
    });
    let lastKnown = -1;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i]) lastKnown = i;
      else if (lastKnown >= 0) bins[i] = { ...bins[lastKnown] };
    }
    lastKnown = -1;
    for (let i = bins.length - 1; i >= 0; i--) {
      if (bins[i]) lastKnown = i;
      else if (lastKnown >= 0) bins[i] = { ...bins[lastKnown] };
    }
    const envelope = bins.filter(Boolean).map((entry) => ({ x: entry.x, y: entry.y }));
    if (envelope.length >= 3 && !pointEquals(envelope[0], envelope[envelope.length - 1])) {
      envelope.push({ ...envelope[0] });
    }
    return envelope;
  };

  const classifyEndpoint = (path, center, endpointIndex) => {
    const envelope = buildEnvelope(path, center);
    if (envelope.length < 4) return false;
    const endpoint = path[endpointIndex];
    const neighbor = path[endpointIndex === 0 ? 1 : endpointIndex - 1];
    if (!endpoint || !neighbor) return false;
    const probe = {
      x: endpoint.x + (neighbor.x - endpoint.x) * 0.15,
      y: endpoint.y + (neighbor.y - endpoint.y) * 0.15,
    };
    return pointInPolygon(probe, envelope);
  };

  const findStartTailCut = (path, inside) => {
    if (!Array.isArray(path) || path.length < 4) return null;
    const segmentCount = path.length - 1;
    for (let segIndex = 0; segIndex < segmentCount; segIndex++) {
      const segStart = path[segIndex];
      const segEnd = path[segIndex + 1];
      const segmentHits = [];
      for (let bodySegIndex = segIndex + 2; bodySegIndex < segmentCount; bodySegIndex++) {
        const hit = segmentIntersection(segStart, segEnd, path[bodySegIndex], path[bodySegIndex + 1]);
        if (!hit) continue;
        segmentHits.push({
          x: hit.x,
          y: hit.y,
          segIndex,
          bodySegIndex,
          t: hit.t,
        });
      }
      segmentHits.sort((a, b) => a.t - b.t);
      if (segmentHits.length) return inside ? segmentHits[segmentHits.length - 1] : segmentHits[0];
    }
    return null;
  };

  const findEndTailCut = (path, inside) => {
    if (!Array.isArray(path) || path.length < 4) return null;
    const segmentCount = path.length - 1;
    for (let segIndex = segmentCount - 1; segIndex >= 0; segIndex--) {
      const segStart = path[segIndex];
      const segEnd = path[segIndex + 1];
      const segmentHits = [];
      for (let bodySegIndex = 0; bodySegIndex <= segIndex - 2; bodySegIndex++) {
        const hit = segmentIntersection(segStart, segEnd, path[bodySegIndex], path[bodySegIndex + 1]);
        if (!hit) continue;
        segmentHits.push({
          x: hit.x,
          y: hit.y,
          segIndex,
          bodySegIndex,
          t: hit.t,
        });
      }
      segmentHits.sort((a, b) => b.t - a.t);
      if (segmentHits.length) return inside ? segmentHits[segmentHits.length - 1] : segmentHits[0];
    }
    return null;
  };

  const trimPathAtEndpoints = (path, center) => {
    if (!Array.isArray(path) || path.length < 4) return path;
    const startCut = findStartTailCut(path, classifyEndpoint(path, center, 0));
    const endCut = findEndTailCut(path, classifyEndpoint(path, center, path.length - 1));
    if (!startCut && !endCut) return path;

    const startIndex = startCut ? startCut.segIndex + 1 : 0;
    const endIndex = endCut ? endCut.segIndex : path.length - 1;
    if (startIndex > endIndex) return path;

    const trimmed = [];
    if (startCut) trimmed.push({ x: startCut.x, y: startCut.y });
    for (let i = startIndex; i <= endIndex; i++) trimmed.push({ ...path[i] });
    if (endCut) trimmed.push({ x: endCut.x, y: endCut.y });

    const deduped = trimmed.filter((point, index, list) => index === 0 || !pointEquals(point, list[index - 1]));
    return deduped.length >= 2 ? deduped : path;
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.lissajous = {
    generate: (p, rng, noise, bounds) => {
      const { width, height } = bounds;
      const lcx = width / 2;
      const lcy = height / 2;
      const baseScale = Math.min(width, height) * 0.4;
      const scale = baseScale * (p.scale ?? 1);
      const lPath = [];
      const tMax = 200;
      const steps = Math.max(10, Math.floor(p.resolution));
      const tStep = tMax / steps;
      for (let t = 0; t < tMax; t += tStep) {
        const amp = Math.exp(-p.damping * t);
        if (amp < 0.01) break;
        const lx = Math.sin(p.freqX * t + p.phase);
        const ly = Math.sin(p.freqY * t);
        lPath.push({ x: lcx + lx * scale * amp, y: lcy + ly * scale * amp });
      }
      const truncatedPath = applyEndpointTruncation(lPath, p.truncateStart, p.truncateEnd);
      if (p.closeLines && truncatedPath.length > 3) return [trimPathAtEndpoints(truncatedPath, { x: lcx, y: lcy })];
      return [truncatedPath];
    },
    formula: (p) =>
      `x = sin(${p.freqX}t + ${p.phase})\ny = sin(${p.freqY}t)\namp = e^(-${p.damping}t)`,
  };
})();
