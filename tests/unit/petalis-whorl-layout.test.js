/*
 * RGR: Petalis Whorl layout mode (fixes the "spiral instead of clean rings —
 * one petal juts out" asymmetry).
 *
 * Before the fix every petal sat at angle = goldenAngle * i on a monotonic
 * radius ramp (a Vogel spiral), so a ring never closed evenly and the
 * highest-index petal jutted out alone. Whorl mode places each band's petals
 * at even TAU/count spacing at a constant per-band radius. Spiral mode keeps
 * the verbatim golden-angle behavior for dense composites.
 *
 * generate() runs through the petalisDesigner wrapper (enforceDesignerParams),
 * which forces ringMode:'dual' + useDesignerShapeOnly:true.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };
const CENTER = { x: bounds.width / 2, y: bounds.height / 2 };
const TAU = Math.PI * 2;

// Whorl-mode base params: deterministic, no jitter, fallback (non-designer) profile.
const whorl = (overrides = {}) => ({
  seed: 4242, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
  layoutMode: 'whorl',
  petalScale: 32, petalProfile: 'teardrop', petalWidthRatio: 1, petalSteps: 24,
  ringMode: 'dual', innerCount: 0, outerCount: 8, ringSplit: 0.45, ringOffset: 0,
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

// Mean point of a path.
const centroid = (path) => {
  let sx = 0, sy = 0;
  for (const pt of path) { sx += pt.x; sy += pt.y; }
  return { x: sx / path.length, y: sy / path.length };
};
// Extract per-petal {angle in [0,TAU), radius} from outline paths.
const petalPolar = (paths) =>
  paths
    .filter((p) => Array.isArray(p) && p.meta && p.meta.label === 'Outline')
    .map((p) => {
      const c = centroid(p);
      let a = Math.atan2(c.y - CENTER.y, c.x - CENTER.x);
      if (a < 0) a += TAU;
      // Snap a petal sitting at angle ~0 that floating-point wrapped to ~TAU
      // back to ~0 so radius/angle sorting stays stable.
      if (a >= TAU - 1e-3) a -= TAU;
      return { angle: a, radius: Math.hypot(c.x - CENTER.x, c.y - CENTER.y) };
    });

// Sorted wrapping gaps between angles.
const wrappingGaps = (angles) => {
  const s = [...angles].sort((x, y) => x - y);
  const gaps = [];
  for (let i = 0; i < s.length; i++) {
    const next = i === s.length - 1 ? s[0] + TAU : s[i + 1];
    gaps.push(next - s[i]);
  }
  return gaps;
};

describe('Petalis Whorl layout mode', () => {
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

  test('1 — whorl spacing is exactly even (TAU/count)', () => {
    const out = algo.generate(whorl({ innerCount: 0, outerCount: 8 }), rng(), noise(), bounds);
    const polar = petalPolar(out);
    expect(polar.length).toBe(8);
    const angles = polar.map((p) => p.angle).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(TAU / 8, 5);
    }
  });

  test('2 — whorl petals share one constant radius', () => {
    const out = algo.generate(whorl({ innerCount: 0, outerCount: 8 }), rng(), noise(), bounds);
    const radii = petalPolar(out).map((p) => p.radius);
    expect(radii.length).toBe(8);
    const r0 = radii[0];
    radii.forEach((r) => expect(r).toBeCloseTo(r0, 5));
  });

  test('3 — no lone jutting petal: max gap === min gap', () => {
    const out = algo.generate(whorl({ innerCount: 0, outerCount: 12 }), rng(), noise(), bounds);
    const gaps = wrappingGaps(petalPolar(out).map((p) => p.angle));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-4);
  });

  test('4 — ringOffset phase-shifts the outer whorl (quincuncial interleave)', () => {
    const offsetDeg = 36;
    const out = algo.generate(
      whorl({ innerCount: 5, outerCount: 5, ringOffset: offsetDeg, ringSplit: 0.5 }),
      rng(), noise(), bounds
    );
    const polar = petalPolar(out);
    expect(polar.length).toBe(10);
    // Inner ring (smaller radius) vs outer ring (larger radius).
    const sortedR = [...polar].sort((a, b) => a.radius - b.radius);
    const inner = sortedR.slice(0, 5).map((p) => p.angle).sort((a, b) => a - b);
    const outer = sortedR.slice(5).map((p) => p.angle).sort((a, b) => a - b);
    const off = (offsetDeg * Math.PI) / 180;
    // Each outer petal is an inner petal + offset (mod TAU).
    outer.forEach((oa, i) => {
      const expected = (inner[i] + off) % TAU;
      const diff = Math.min(Math.abs(oa - expected), TAU - Math.abs(oa - expected));
      expect(diff).toBeLessThan(1e-4);
    });
  });

  test('5 — empty inner whorl yields exactly outerCount petals', () => {
    const out = algo.generate(whorl({ innerCount: 0, outerCount: 6 }), rng(), noise(), bounds);
    expect(petalPolar(out).length).toBe(6);
  });

  test('6 — whorl ring radius is decoupled from petal count', () => {
    const a = petalPolar(algo.generate(whorl({ innerCount: 0, outerCount: 6, ringSplit: 0.45 }), rng(), noise(), bounds));
    const b = petalPolar(algo.generate(whorl({ innerCount: 0, outerCount: 12, ringSplit: 0.45 }), rng(), noise(), bounds));
    expect(a[0].radius).toBeCloseTo(b[0].radius, 5);
  });

  test('7 — spiral mode output is stable (golden packing, not whorl)', () => {
    // Regression oracle for spiral-mode geometry. Originally proved the whorl
    // layout change left spiral byte-identical to main; re-captured at v1.1.82
    // when the petal-shape model was rewritten (which intentionally changes ALL
    // petal geometry, both modes). Guards spiral packing against future drift.
    const SPIRAL_ORACLE = '5e9b98dac90c8128fcef09837fb76718279779261a9d8df6277911bc73aa6ff9';
    const spiralParams = {
      seed: 4242, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
      layoutMode: 'spiral',
      petalScale: 32, petalProfile: 'teardrop', petalWidthRatio: 1, petalSteps: 24,
      ringMode: 'dual', innerCount: 20, outerCount: 20, ringSplit: 0.45, ringOffset: 12,
      spiralMode: 'golden', radialGrowth: 1, spiralTightness: 1, spiralStart: 0, spiralEnd: 1,
      countJitter: 0, sizeJitter: 0, rotationJitter: 0, angularDrift: 0, driftStrength: 0,
      anchorToCenter: 'central', anchorRadiusRatio: 1, tipSharpness: 1, tipTwist: 0, tipCurl: 0,
      baseFlare: 0, basePinch: 0, radiusScale: 0.2, radiusScaleCurve: 1,
      profileTransitionPosition: 50, profileTransitionFeather: 0,
      designerInner: null, designerOuter: null,
      designerSymmetry: 'none', designerInnerSymmetry: 'none', designerOuterSymmetry: 'none',
      noises: [], shadings: [], petalModifiers: [], layering: true,
      centerType: 'disk', centerRadius: 6, centerDensity: 12,
    };
    const out = algo.generate(spiralParams, rng(4242), noise(4242), bounds);
    expect(pathSignature(out)).toBe(SPIRAL_ORACLE);
  });

  test('8 — whorl mode is deterministic', () => {
    const p = whorl({ innerCount: 5, outerCount: 9 });
    const a = algo.generate(p, rng(7), noise(7), bounds);
    const b = algo.generate(p, rng(7), noise(7), bounds);
    expect(pathSignature(a)).toBe(pathSignature(b));
  });
});
