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

  // Per-petal max extent from the flower center (baseR + petal length), one
  // value per outline path. Equal tip radii within a ring ⟺ equal petal sizes.
  const petalTipRadii = (paths) =>
    paths
      .filter((p) => Array.isArray(p) && p.meta && p.meta.label === 'Outline')
      .map((path) => {
        let best = 0;
        for (const pt of path) {
          const d = Math.hypot(pt.x - CENTER.x, pt.y - CENTER.y);
          if (d > best) best = d;
        }
        return best;
      });

  test('9 — radiusScale does not ramp petal size around a single whorl (no seam)', () => {
    // Regression: radiusScale ramped petal length by index t=i/(count-1) even in
    // whorl mode, so the last petal rendered up to (1+radiusScale)× the first and
    // the discontinuity landed at the ring's wrap-around seam (gerbera preset,
    // radiusScale 0.2, 34 petals: one fat petal jutting out at 3 o'clock).
    const out = algo.generate(
      whorl({ innerCount: 0, outerCount: 34, radiusScale: 0.2, radiusScaleCurve: 1.2 }),
      rng(), noise(), bounds
    );
    const tips = petalTipRadii(out);
    expect(tips.length).toBe(34);
    const t0 = tips[0];
    tips.forEach((t) => expect(t).toBeCloseTo(t0, 5));
  });

  test('10 — whorl radiusScale grows petals by ring (inner unchanged, outer uniformly larger)', () => {
    const base = { innerCount: 5, outerCount: 7, ringSplit: 0.5 };
    const flat = algo.generate(whorl({ ...base, radiusScale: 0 }), rng(), noise(), bounds);
    const ramped = algo.generate(whorl({ ...base, radiusScale: 0.5 }), rng(), noise(), bounds);
    const ringSizes = (paths) => {
      const polar = petalPolar(paths);
      const tips = petalTipRadii(paths);
      // Split petals into rings by centroid radius (inner 5 vs outer 7).
      const tagged = polar.map((p, i) => ({ ...p, tip: tips[i] })).sort((a, b) => a.radius - b.radius);
      return { inner: tagged.slice(0, 5).map((p) => p.tip), outer: tagged.slice(5).map((p) => p.tip) };
    };
    const a = ringSizes(flat);
    const b = ringSizes(ramped);
    // Within each ring every petal stays uniform.
    b.inner.forEach((t) => expect(t).toBeCloseTo(b.inner[0], 5));
    b.outer.forEach((t) => expect(t).toBeCloseTo(b.outer[0], 5));
    // The innermost populated ring anchors the ramp (scale 1), the outer ring grows.
    expect(b.inner[0]).toBeCloseTo(a.inner[0], 5);
    expect(b.outer[0]).toBeGreaterThan(a.outer[0] + 1);
  });

  test('11 — layered whorl has no seam petal: occlusion is rotationally uniform', () => {
    // Regression: layering drew petals in a total order, so the first petal of
    // each whorl (always at angle 0 — 3 o'clock) was never clipped and "sat on
    // top" of the design, while the last petals lost their entire bases. The
    // ring's occlusion must close circularly: every petal tucks under its
    // forward neighbours, so each petal keeps the same visible outline length.
    const out = algo.generate(
      whorl({ innerCount: 0, outerCount: 12, layering: true, centerRadius: 8, centerDensity: 1 }),
      rng(), noise(), bounds
    );
    const lengthByGroup = new Map();
    out
      .filter((p) => Array.isArray(p) && p.meta && p.meta.label === 'Outline')
      .forEach((p) => {
        let len = 0;
        for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        const g = p.meta.group;
        lengthByGroup.set(g, (lengthByGroup.get(g) || 0) + len);
      });
    const lens = [...lengthByGroup.values()];
    expect(lens.length).toBe(12);
    const min = Math.min(...lens);
    const max = Math.max(...lens);
    // Identical petals, even spacing → every petal must be clipped identically.
    expect(max - min).toBeLessThan(max * 0.01);
    // And clipping must actually be happening (petals overlap → shorter than raw).
    const raw = algo.generate(
      whorl({ innerCount: 0, outerCount: 12, layering: false, centerRadius: 8, centerDensity: 1 }),
      rng(), noise(), bounds
    ).filter((p) => Array.isArray(p) && p.meta && p.meta.label === 'Outline');
    let rawLen = 0;
    raw.forEach((p) => { for (let i = 1; i < p.length; i++) rawLen += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); });
    const clippedTotal = lens.reduce((s, l) => s + l, 0);
    expect(clippedTotal).toBeLessThan(rawLen * 0.99);
  });
});
