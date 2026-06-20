/*
 * Regression guards for the Petalis visual-QA fix sweep. Each test asserts a
 * behaviour that was broken before the fix and would fail on the pre-fix code:
 *
 *  - petalAsymmetry produced a sub-perceptual (~0.2mm) tip nudge instead of a
 *    real bilateral lean; now it bows the petal centreline measurably.
 *  - center modifiers (ripple/twist/radialNoise/circularOffset) silently did
 *    nothing on circle elements (disk/dome/dot) because the displaced points
 *    were discarded in favour of the preserved `kind:'circle'` meta.
 *  - circularOffset never received a noise sampler and gated its whole effect on
 *    `randomness`, so it was dead — especially at randomness 0.
 *  - centerType 'dome' drew perfectly concentric rings (a flat bullseye).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');
const clone = (v) => JSON.parse(JSON.stringify(v));

const PROFILE = {
  profile: 'spatulate',
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.22, w: 0 } },
    { t: 0.62, w: 1.08, in: { t: 0.46, w: 1.08 }, out: { t: 0.76, w: 1.08 } },
    { t: 1, w: 0, in: { t: 0.86, w: 0 }, out: null },
  ],
};

const flatPoints = (paths) => {
  const pts = [];
  for (const path of paths) {
    if (!Array.isArray(path)) continue;
    for (const p of path) if (p && typeof p.x === 'number') pts.push(p);
  }
  return pts;
};

// Max per-point displacement between two renders that share point structure.
const maxDeviation = (a, b) => {
  const pa = flatPoints(a);
  const pb = flatPoints(b);
  const n = Math.min(pa.length, pb.length);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pa[i].x - pb[i].x, pa[i].y - pb[i].y);
    if (d > max) max = d;
  }
  return max;
};

describe('Petalis QA fixes', () => {
  let runtime;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });
  afterAll(() => runtime.cleanup());

  const makeRender = (overrides = {}) => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };
    const base = {
      ...clone(ALGO_DEFAULTS.petalisDesigner || {}),
      layoutMode: 'whorl',
      ringMode: 'dual',
      innerCount: 0,
      outerCount: 6,
      countJitter: 0,
      sizeJitter: 0,
      rotationJitter: 0,
      layering: false,
      shadings: [],
      petalModifiers: [],
      centerModifiers: [],
      centerRing: false,
      centerConnectors: false,
      centerRadius: 0,
      centerDensity: 1,
      anchorToCenter: 'off',
      profileTransitionFeather: 0,
      designerInner: clone(PROFILE),
      designerOuter: clone(PROFILE),
      ...overrides,
    };
    const render = (params) =>
      Algorithms.petalisDesigner.generate(params, new SeededRNG(7), new SimpleNoise(7), bounds) || [];
    return { base, render };
  };

  test('petalAsymmetry bows the petal measurably (not a sub-mm tip nudge)', () => {
    const { base, render } = makeRender();
    const flat = render({ ...clone(base), outerRingParams: { petalAsymmetry: 0 } });
    const leaned = render({ ...clone(base), outerRingParams: { petalAsymmetry: 80 } });
    // Pre-fix this was ~0.2mm (invisible). The dedicated lean must move points
    // by a clearly visible amount on a ~30mm petal.
    expect(maxDeviation(flat, leaned)).toBeGreaterThan(2);
  });

  test('petalAsymmetry is byte-identical at its neutral default (0)', () => {
    const { base, render } = makeRender();
    const a = pathSignature(render({ ...clone(base), outerRingParams: { petalAsymmetry: 0 } }));
    const b = pathSignature(render({ ...clone(base), outerRingParams: {} }));
    expect(a).toBe(b);
  });

  const dotBase = (over) => ({
    centerRadius: 10,
    centerDensity: 40,
    centerType: 'dot',
    ...over,
  });

  const circleCount = (paths) => paths.filter((p) => p && p.meta && p.meta.kind === 'circle').length;

  test('center radialNoise modifier actually renders a displaced dot field (circle meta dropped)', () => {
    // RGR: pre-fix, a displaced circle KEPT its kind:circle meta, so the renderer
    // redrew a clean circle from cx/cy/r and discarded the displacement — the
    // circle-meta count stayed the same. Post-fix the deformed circles drop the
    // marker and render as polygons, so the count falls.
    const { base, render } = makeRender(dotBase());
    const plainCircles = circleCount(render({ ...clone(base), centerModifiers: [] }));
    const noisedCircles = circleCount(
      render({
        ...clone(base),
        centerModifiers: [{ id: 'c1', type: 'radialNoise', enabled: true, amount: 6, scale: 0.2, noises: [], seed: 1 }],
      })
    );
    expect(plainCircles).toBeGreaterThan(0);
    expect(noisedCircles).toBeLessThan(plainCircles);
  });

  test('center circularOffset displaces even at randomness 0 (amount drives it, not randomness)', () => {
    // RGR: pre-fix the whole displacement was multiplied by `randomness`, so at
    // randomness 0 amount had no effect (identical to amount 0). The intensity
    // floor makes amount drive a real offset regardless of randomness.
    const { base, render } = makeRender(dotBase());
    const mk = (amount) => ({
      ...clone(base),
      centerModifiers: [
        { id: 'c1', type: 'circularOffset', enabled: true, amount, scale: 0.2, noises: [], seed: 1, randomness: 0, direction: 0 },
      ],
    });
    const moved = pathSignature(render(mk(6)));
    const still = pathSignature(render(mk(0)));
    expect(moved).not.toBe(still);
    // circularOffset and radialNoise are distinct displacers, not aliases.
    const radial = pathSignature(
      render({
        ...clone(base),
        centerModifiers: [{ id: 'c1', type: 'radialNoise', enabled: true, amount: 6, scale: 0.2, noises: [], seed: 1 }],
      })
    );
    expect(moved).not.toBe(radial);
  });

  test('centerType dome draws eccentric (non-concentric) rings', () => {
    const { base, render } = makeRender({ centerRadius: 10, centerDensity: 24, centerType: 'dome' });
    const paths = render({ ...clone(base), centerModifiers: [] });
    const ringCenters = paths
      .filter((p) => p && p.meta && p.meta.kind === 'circle' && /Ring/.test(p.meta.label || ''))
      .map((p) => ({ x: p.meta.cx, y: p.meta.cy }));
    expect(ringCenters.length).toBeGreaterThan(2);
    const xs = new Set(ringCenters.map((c) => c.x.toFixed(3)));
    const ys = new Set(ringCenters.map((c) => c.y.toFixed(3)));
    // A flat bullseye has every ring sharing one center; a dome spreads them.
    expect(xs.size + ys.size).toBeGreaterThan(2);
  });
});
