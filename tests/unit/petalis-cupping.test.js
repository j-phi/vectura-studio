/*
 * RGR: Petalis true pseudo-3D per-petal cupping (`petalCupping`, 0..100).
 *
 * Bloom already curls petal TIPS lengthwise (tipCurl); cupping folds the
 * petal about its LONG axis in petal-local space — a cylindrical projection
 * where the edges foreshorten more than the midline (y' = R·sin(y/R)) plus a
 * slight perspective pull of the tip — for a volumetric, incurved read.
 * The fold is tied to ring position: inner whorls cup hardest (young petals
 * incurve), outer whorls open flat, matching a real corolla.
 *
 * Neutral at 0 (the default) so every existing preset and baseline is
 * byte-identical.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };
const CENTER = { x: bounds.width / 2, y: bounds.height / 2 };
const TAU = Math.PI * 2;

// Deterministic whorl base params: no jitter, fallback (non-designer) profile,
// tipCurl 0 so flat/cupped outlines stay index-aligned (no rounded-tip arc).
const whorl = (overrides = {}) => ({
  seed: 4242, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
  layoutMode: 'whorl',
  petalScale: 32, petalProfile: 'teardrop', petalWidthRatio: 1, petalSteps: 24,
  ringMode: 'dual', innerCount: 0, outerCount: 1, ringSplit: 0.5, ringOffset: 0,
  radialGrowth: 1,
  countJitter: 0, sizeJitter: 0, rotationJitter: 0, angularDrift: 0, driftStrength: 0,
  anchorToCenter: 'central', anchorRadiusRatio: 1, tipSharpness: 1, tipTwist: 0, tipCurl: 0,
  baseFlare: 0, basePinch: 0, radiusScale: 0,
  profileTransitionPosition: 50, profileTransitionFeather: 0,
  designerInner: null, designerOuter: null,
  designerSymmetry: 'none', designerInnerSymmetry: 'none', designerOuterSymmetry: 'none',
  noises: [], shadings: [], petalModifiers: [], layering: false,
  centerType: 'disk', centerRadius: 0, centerDensity: 1,
  ...overrides,
});

const outlines = (paths) =>
  paths.filter((p) => Array.isArray(p) && p.meta && p.meta.label === 'Outline');

const centroid = (path) => {
  let sx = 0, sy = 0;
  for (const pt of path) { sx += pt.x; sy += pt.y; }
  return { x: sx / path.length, y: sy / path.length };
};

// Petal-local lateral width: project outline points onto the perpendicular of
// the petal's radial axis (derived from its centroid angle — lateral spread is
// symmetric about the axis so the centroid sits on it).
const lateralWidth = (outline) => {
  const c = centroid(outline);
  const a = Math.atan2(c.y - CENTER.y, c.x - CENTER.x);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  let min = Infinity, max = -Infinity;
  for (const pt of outline) {
    const d = (pt.x - CENTER.x) * nx + (pt.y - CENTER.y) * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return max - min;
};

// Petal-local length: max extent along the radial axis from the centre.
const radialLength = (outline) => {
  const c = centroid(outline);
  const a = Math.atan2(c.y - CENTER.y, c.x - CENTER.x);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  let min = Infinity, max = -Infinity;
  for (const pt of outline) {
    const d = (pt.x - CENTER.x) * ux + (pt.y - CENTER.y) * uy;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return max - min;
};

describe('Petalis pseudo-3D petal cupping', () => {
  let runtime, algo, SeededRNG, SimpleNoise;
  const rng = (s = 4242) => new SeededRNG(s);
  const noise = (s = 4242) => new SimpleNoise(s);

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    algo = runtime.window.Vectura.AlgorithmRegistry.petalisDesigner;
    SeededRNG = runtime.window.Vectura.SeededRNG;
    SimpleNoise = runtime.window.Vectura.SimpleNoise;
  });
  afterAll(() => runtime?.cleanup?.());

  test('1 — petalCupping 0 (and absent) is byte-neutral', () => {
    const base = algo.generate(whorl({ outerCount: 6 }), rng(), noise(), bounds);
    const zero = algo.generate(whorl({ outerCount: 6, petalCupping: 0 }), rng(), noise(), bounds);
    expect(pathSignature(zero)).toEqual(pathSignature(base));
  });

  test('2 — cupping narrows the petal laterally and foreshortens its length', () => {
    const flat = outlines(algo.generate(whorl(), rng(), noise(), bounds))[0];
    const cupped = outlines(algo.generate(whorl({ petalCupping: 80 }), rng(), noise(), bounds))[0];
    expect(lateralWidth(cupped)).toBeLessThan(lateralWidth(flat) * 0.92);
    expect(radialLength(cupped)).toBeLessThan(radialLength(flat) * 0.99);
  });

  test('3 — fold is cylindrical, not a uniform Y-scale: edges compress more than near-midline', () => {
    // Single petal at angle 0 → petal-local y is just (worldY - centerY) and
    // flat/cupped outlines are index-aligned (same construction, tipCurl 0).
    const flat = outlines(algo.generate(whorl(), rng(), noise(), bounds))[0];
    const cupped = outlines(algo.generate(whorl({ petalCupping: 80 }), rng(), noise(), bounds))[0];
    expect(cupped.length).toBe(flat.length);
    const flatYs = flat.map((pt) => pt.y - CENTER.y);
    const maxY = Math.max(...flatYs.map(Math.abs));
    const ratios = (lo, hi) => {
      const rs = [];
      for (let i = 0; i < flat.length; i++) {
        const fy = Math.abs(flatYs[i]);
        if (fy >= lo * maxY && fy <= hi * maxY) {
          rs.push(Math.abs(cupped[i].y - CENTER.y) / fy);
        }
      }
      return rs;
    };
    const inner = ratios(0.1, 0.35);
    const edge = ratios(0.85, 1);
    expect(inner.length).toBeGreaterThan(0);
    expect(edge.length).toBeGreaterThan(0);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Near-midline points barely move; edge points fold in measurably more.
    expect(mean(edge)).toBeLessThan(mean(inner) - 0.05);
    expect(mean(inner)).toBeGreaterThan(0.9);
  });

  test('4 — cupping is tied to ring position: inner whorl cups harder than outer', () => {
    const params = { innerCount: 5, outerCount: 5, ringSplit: 0.5, ringOffset: 36 };
    const byRing = (paths) => {
      const sorted = outlines(paths)
        .map((o) => ({ o, r: Math.hypot(centroid(o).x - CENTER.x, centroid(o).y - CENTER.y) }))
        .sort((a, b) => a.r - b.r);
      return { inner: sorted[0].o, outer: sorted[sorted.length - 1].o };
    };
    const flat = byRing(algo.generate(whorl(params), rng(), noise(), bounds));
    const cup = byRing(algo.generate(whorl({ ...params, petalCupping: 70 }), rng(), noise(), bounds));
    const innerRatio = lateralWidth(cup.inner) / lateralWidth(flat.inner);
    const outerRatio = lateralWidth(cup.outer) / lateralWidth(flat.outer);
    expect(innerRatio).toBeLessThan(outerRatio - 0.02);
    expect(outerRatio).toBeLessThan(1);
  });

  test('5 — cupping is monotonic in the slider', () => {
    const width = (cupping) =>
      lateralWidth(outlines(algo.generate(whorl({ petalCupping: cupping }), rng(), noise(), bounds))[0]);
    const w0 = width(0);
    const w40 = width(40);
    const w80 = width(80);
    expect(w40).toBeLessThan(w0);
    expect(w80).toBeLessThan(w40);
  });

  test('6 — cupping never disturbs the layout: petal angles and bases are unchanged', () => {
    const angles = (paths) =>
      outlines(paths)
        .map((o) => {
          const c = centroid(o);
          let a = Math.atan2(c.y - CENTER.y, c.x - CENTER.x);
          if (a < 0) a += TAU;
          // Snap a petal at angle ~0 that floating-point wrapped to ~TAU back
          // to ~0 so the sorted comparison stays index-aligned.
          if (a >= TAU - 1e-3) a -= TAU;
          return a;
        })
        .sort((a, b) => a - b);
    const flat = algo.generate(whorl({ outerCount: 7 }), rng(), noise(), bounds);
    const cupped = algo.generate(whorl({ outerCount: 7, petalCupping: 65 }), rng(), noise(), bounds);
    const fa = angles(flat);
    const ca = angles(cupped);
    expect(ca.length).toBe(fa.length);
    ca.forEach((a, i) => expect(a).toBeCloseTo(fa[i], 6));
    // The receptacle attachment point (petal-local origin) is a fixed point of
    // the fold — each outline's first point must be identical.
    outlines(flat).forEach((o, i) => {
      const co = outlines(cupped)[i];
      expect(co[0].x).toBeCloseTo(o[0].x, 9);
      expect(co[0].y).toBeCloseTo(o[0].y, 9);
    });
  });

  test('7 — shading lines stay inside the cupped silhouette', () => {
    const params = whorl({
      petalCupping: 75,
      shadings: [{
        id: 's1', enabled: true, type: 'parallel', target: 'both',
        density: 1.5, lineSpacing: 1, widthX: 100, widthY: 100,
        posX: 50, posY: 50, gapX: 0, gapY: 0, gapPosX: 50, gapPosY: 50,
      }],
    });
    const paths = algo.generate(params, rng(), noise(), bounds);
    const outline = outlines(paths)[0];
    expect(outline).toBeTruthy();
    const xs = outline.map((pt) => pt.x);
    const ys = outline.map((pt) => pt.y);
    const bbox = {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    };
    const shades = paths.filter((p) => Array.isArray(p) && p.meta && /^Shade/.test(p.meta.label || ''));
    expect(shades.length).toBeGreaterThan(0);
    const pad = 0.5;
    shades.forEach((line) => {
      line.forEach((pt) => {
        expect(pt.x).toBeGreaterThanOrEqual(bbox.minX - pad);
        expect(pt.x).toBeLessThanOrEqual(bbox.maxX + pad);
        expect(pt.y).toBeGreaterThanOrEqual(bbox.minY - pad);
        expect(pt.y).toBeLessThanOrEqual(bbox.maxY + pad);
      });
    });
  });
});
