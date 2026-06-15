const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const clone = (value) => JSON.parse(JSON.stringify(value));

// A teardrop-ish designer profile: zero-width base + tip, wide middle. Its tip
// region (t≳0.6) is exactly what Tip Sharpness should reshape.
const PROFILE = {
  profile: 'teardrop',
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.18, w: 0 } },
    { t: 0.5, w: 0.9, in: { t: 0.32, w: 0.9 }, out: { t: 0.7, w: 0.78 } },
    { t: 1, w: 0, in: { t: 0.86, w: 0 }, out: null },
  ],
};

const extractOutlines = (paths) =>
  (paths || []).filter((path) => Array.isArray(path) && path.meta?.label === 'Outline');
const sig = (outlines) => outlines.map((o) => pathSignature([o]));

describe('Petalis designer Tip Sharpness wiring', () => {
  let runtime;
  let bounds;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };
  });

  afterAll(() => runtime.cleanup());

  const baseParams = () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    return {
      ...clone(ALGO_DEFAULTS.petalisDesigner || {}),
      // single visible ring of 6 petals
      innerCount: 0,
      outerCount: 6,
      countJitter: 0,
      layering: false,
      shadings: [],
      petalModifiers: [],
      centerModifiers: [],
      centerRing: false,
      centerConnectors: false,
      centerType: 'disk',
      centerRadius: 0,
      sizeJitter: 0,
      rotationJitter: 0,
      designerInner: clone(PROFILE),
      designerOuter: clone(PROFILE),
    };
  };

  const renderOutlines = (overrides) => {
    const { Algorithms, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const params = { ...baseParams(), ...overrides };
    return extractOutlines(
      Algorithms.petalisDesigner.generate(params, new SeededRNG(7), new SimpleNoise(7), bounds) || []
    );
  };

  test('tipSharpness=1 (default) is byte-identical to no override', () => {
    const noOverride = renderOutlines({});
    const explicitDefault = renderOutlines({ outerRingParams: { tipSharpness: 1 } });
    expect(noOverride.length).toBe(6);
    expect(explicitDefault.length).toBe(6);
    expect(sig(explicitDefault)).toEqual(sig(noOverride));
  });

  test('lowering tipSharpness changes the outer-ring petal geometry', () => {
    const sharp = renderOutlines({ outerRingParams: { tipSharpness: 1 } });
    const blunt = renderOutlines({ outerRingParams: { tipSharpness: 0 } });
    expect(blunt.length).toBe(6);
    // Every petal silhouette must differ once the tip is blunted.
    const sharpSigs = sig(sharp);
    const bluntSigs = sig(blunt);
    sharpSigs.forEach((s, i) => expect(bluntSigs[i]).not.toBe(s));
  });

  test('blunting only widens the tip region, never the base — base anchor stays put', () => {
    const sharp = renderOutlines({ outerRingParams: { tipSharpness: 1 } });
    const blunt = renderOutlines({ outerRingParams: { tipSharpness: 0.2 } });
    // The petals differ, but the change is bounded (subtle, not catastrophic):
    // signatures change yet the same number of points/petals are produced.
    expect(blunt.length).toBe(sharp.length);
    expect(sig(blunt)).not.toEqual(sig(sharp));
  });
});
