const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const EPSILON = 1e-6;
const INTERSECTION_EPSILON = 1e-4;
const ENVELOPE_BINS = 144;

const pointEquals = (a, b, epsilon = EPSILON) =>
  !!a
  && !!b
  && Math.abs(a.x - b.x) <= epsilon
  && Math.abs(a.y - b.y) <= epsilon;

const pathLength = (path = []) => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
};

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

const classifyEndpoint = (path, bounds, endpointIndex) => {
  const center = { x: bounds.width / 2, y: bounds.height / 2 };
  const envelope = buildEnvelope(path, center);
  const endpoint = path[endpointIndex];
  const neighbor = path[endpointIndex === 0 ? 1 : endpointIndex - 1];
  const probe = {
    x: endpoint.x + (neighbor.x - endpoint.x) * 0.15,
    y: endpoint.y + (neighbor.y - endpoint.y) * 0.15,
  };
  return pointInPolygon(probe, envelope);
};

const firstStartSegmentHits = (path) => {
  const segmentCount = path.length - 1;
  for (let segIndex = 0; segIndex < segmentCount; segIndex++) {
    const hits = [];
    for (let bodySegIndex = segIndex + 2; bodySegIndex < segmentCount; bodySegIndex++) {
      const hit = segmentIntersection(path[segIndex], path[segIndex + 1], path[bodySegIndex], path[bodySegIndex + 1]);
      if (!hit) continue;
      hits.push({ ...hit, segIndex, bodySegIndex });
    }
    hits.sort((a, b) => a.t - b.t);
    if (hits.length) return hits;
  }
  return [];
};

const firstEndSegmentHits = (path) => {
  const segmentCount = path.length - 1;
  for (let segIndex = segmentCount - 1; segIndex >= 0; segIndex--) {
    const hits = [];
    for (let bodySegIndex = 0; bodySegIndex <= segIndex - 2; bodySegIndex++) {
      const hit = segmentIntersection(path[segIndex], path[segIndex + 1], path[bodySegIndex], path[bodySegIndex + 1]);
      if (!hit) continue;
      hits.push({ ...hit, segIndex, bodySegIndex });
    }
    hits.sort((a, b) => b.t - a.t);
    if (hits.length) return hits;
  }
  return [];
};

describe('Lissajous closeLines trimming', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('closeLines trims the screenshot-like loose tails at the chosen terminal cutpoints', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.lissajous),
      seed: 4242,
      freqX: 3,
      freqY: 2,
      damping: 0.001,
      phase: 1.5,
      resolution: 200,
      scale: 0.8,
    };

    const openPath = Algorithms.lissajous.generate(
      { ...params, closeLines: false },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const trimmedPath = Algorithms.lissajous.generate(
      { ...params, closeLines: true },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];

    const startHits = firstStartSegmentHits(openPath);
    const endHits = firstEndSegmentHits(openPath);
    const startInside = classifyEndpoint(openPath, bounds, 0);
    const endInside = classifyEndpoint(openPath, bounds, openPath.length - 1);
    const expectedStart = startInside ? startHits[startHits.length - 1] : startHits[0];
    const expectedEnd = endInside ? endHits[endHits.length - 1] : endHits[0];

    expect(startHits.length).toBeGreaterThan(0);
    expect(endHits.length).toBeGreaterThan(0);
    expect(pointEquals(trimmedPath[0], openPath[0])).toBe(false);
    expect(pointEquals(trimmedPath[trimmedPath.length - 1], openPath[openPath.length - 1])).toBe(false);
    expect(pointEquals(trimmedPath[0], expectedStart, 1e-5)).toBe(true);
    expect(pointEquals(trimmedPath[trimmedPath.length - 1], expectedEnd, 1e-5)).toBe(true);
    expect(pointEquals(trimmedPath[1], openPath[expectedStart.segIndex + 1])).toBe(true);
    expect(pointEquals(trimmedPath[trimmedPath.length - 2], openPath[expectedEnd.segIndex])).toBe(true);
  });

  test('truncate start and end remove arc length from each endpoint before close-line trimming', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.lissajous),
      seed: 4242,
      freqX: 3,
      freqY: 2,
      damping: 0.001,
      phase: 1.5,
      resolution: 200,
      scale: 0.8,
      closeLines: false,
      truncateStart: 0,
      truncateEnd: 0,
    };

    const openPath = Algorithms.lissajous.generate(
      params,
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const halfStartPath = Algorithms.lissajous.generate(
      { ...params, truncateStart: 50 },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const halfEndPath = Algorithms.lissajous.generate(
      { ...params, truncateEnd: 50 },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const fullyGonePath = Algorithms.lissajous.generate(
      { ...params, truncateStart: 100 },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];

    expect(ALGO_DEFAULTS.lissajous.closeLines).toBe(false);
    expect(ALGO_DEFAULTS.lissajous.truncateStart).toBe(0);
    expect(ALGO_DEFAULTS.lissajous.truncateEnd).toBe(0);
    expect(pathLength(halfStartPath)).toBeLessThan(pathLength(openPath) * 0.52);
    expect(pathLength(halfStartPath)).toBeGreaterThan(pathLength(openPath) * 0.48);
    expect(pathLength(halfEndPath)).toBeLessThan(pathLength(openPath) * 0.52);
    expect(pathLength(halfEndPath)).toBeGreaterThan(pathLength(openPath) * 0.48);
    expect(pointEquals(halfStartPath[halfStartPath.length - 1], openPath[openPath.length - 1], 1e-5)).toBe(true);
    expect(pointEquals(halfEndPath[0], openPath[0], 1e-5)).toBe(true);
    expect(fullyGonePath).toEqual([]);
  });

  test('inside tails use the last valid self-intersection on the first intersecting terminal segment', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.lissajous),
      seed: 4242,
      freqX: 1,
      freqY: 1,
      damping: 0.0004,
      phase: 0.4,
      resolution: 120,
      scale: 0.5,
    };

    const openPath = Algorithms.lissajous.generate(
      { ...params, closeLines: false },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const trimmedPath = Algorithms.lissajous.generate(
      { ...params, closeLines: true },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];

    const startHits = firstStartSegmentHits(openPath);
    const endHits = firstEndSegmentHits(openPath);

    expect(classifyEndpoint(openPath, bounds, 0)).toBe(true);
    expect(classifyEndpoint(openPath, bounds, openPath.length - 1)).toBe(true);
    expect(startHits.length).toBeGreaterThan(1);
    expect(endHits.length).toBeGreaterThan(1);
    expect(pointEquals(trimmedPath[0], startHits[startHits.length - 1], 1e-5)).toBe(true);
    expect(pointEquals(trimmedPath[trimmedPath.length - 1], endHits[endHits.length - 1], 1e-5)).toBe(true);
  });

  test('closeLines leaves paths unchanged when no valid tail crossing exists', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.lissajous),
      seed: 4242,
      freqX: 1,
      freqY: 1,
      damping: 0.02,
      phase: 0,
      resolution: 80,
      scale: 0.35,
    };

    const openPath = Algorithms.lissajous.generate(
      { ...params, closeLines: false },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];
    const trimmedPath = Algorithms.lissajous.generate(
      { ...params, closeLines: true },
      new SeededRNG(params.seed),
      new SimpleNoise(params.seed),
      bounds
    )[0];

    expect(trimmedPath).toEqual(openPath);
  });
});
