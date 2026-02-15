const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const clone = (value) => JSON.parse(JSON.stringify(value));

const INNER_PROFILE = {
  profile: 'teardrop',
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.18, w: 0 } },
    { t: 0.44, w: 0.72, in: { t: 0.3, w: 0.72 }, out: { t: 0.58, w: 0.72 } },
    { t: 1, w: 0, in: { t: 0.82, w: 0 }, out: null },
  ],
};

const OUTER_PROFILE = {
  profile: 'spatulate',
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.22, w: 0 } },
    { t: 0.62, w: 1.08, in: { t: 0.46, w: 1.08 }, out: { t: 0.76, w: 1.08 } },
    { t: 1, w: 0, in: { t: 0.86, w: 0 }, out: null },
  ],
};

const outlineSignature = (outlines, index) => pathSignature([outlines[index]]);
const extractOutlines = (paths) => (paths || []).filter((path) => Array.isArray(path) && path.meta?.label === 'Outline');

describe('Petalis profile transitions', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('feather=0 keeps a hard step while feather=100 blends most petals', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const base = {
      ...clone(ALGO_DEFAULTS.petalis || {}),
      ringMode: 'single',
      count: 20,
      countJitter: 0,
      layering: false,
      shadings: [],
      petalModifiers: [],
      centerModifiers: [],
      centerRing: false,
      centerConnectors: false,
      centerType: 'disk',
      centerRadius: 0,
      centerDensity: 1,
      anchorToCenter: 'off',
      sizeJitter: 0,
      rotationJitter: 0,
      tipTwist: 0,
      tipCurl: 0,
      centerCurlBoost: 0,
      centerWaveBoost: 0,
      edgeWaveAmp: 0,
      edgeWaveFreq: 1,
      designerInner: clone(INNER_PROFILE),
      designerOuter: clone(OUTER_PROFILE),
      profileTransitionPosition: 50,
    };
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const render = (params, seed = 7612) =>
      Algorithms.petalis.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const renderOutlines = (params) => extractOutlines(render(params));

    const outlinesStep = renderOutlines({
      ...clone(base),
      profileTransitionFeather: 0,
    });
    const outlinesWide = renderOutlines({
      ...clone(base),
      profileTransitionFeather: 100,
    });
    const outlinesInnerOnly = renderOutlines({
      ...clone(base),
      designerOuter: clone(INNER_PROFILE),
      profileTransitionFeather: 0,
    });
    const outlinesOuterOnly = renderOutlines({
      ...clone(base),
      designerInner: clone(OUTER_PROFILE),
      profileTransitionFeather: 0,
    });

    expect(outlinesStep.length).toBe(20);
    expect(outlinesWide.length).toBe(20);
    expect(outlinesInnerOnly.length).toBe(20);
    expect(outlinesOuterOnly.length).toBe(20);

    const first = 0;
    const middle = Math.floor(outlinesStep.length / 2);
    const last = outlinesStep.length - 1;

    expect(outlineSignature(outlinesStep, first)).toBe(outlineSignature(outlinesInnerOnly, first));
    expect(outlineSignature(outlinesStep, last)).toBe(outlineSignature(outlinesOuterOnly, last));

    const stepMid = outlineSignature(outlinesStep, middle);
    const innerMid = outlineSignature(outlinesInnerOnly, middle);
    const outerMid = outlineSignature(outlinesOuterOnly, middle);
    expect(stepMid === innerMid || stepMid === outerMid).toBe(true);

    expect(outlineSignature(outlinesWide, first)).toBe(outlineSignature(outlinesInnerOnly, first));
    expect(outlineSignature(outlinesWide, last)).toBe(outlineSignature(outlinesOuterOnly, last));
    expect(outlineSignature(outlinesWide, middle)).not.toBe(innerMid);
    expect(outlineSignature(outlinesWide, middle)).not.toBe(outerMid);
  });

  test('transition position remains active in dual-ring mode', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const base = {
      ...clone(ALGO_DEFAULTS.petalis || {}),
      ringMode: 'dual',
      innerCount: 16,
      outerCount: 20,
      ringSplit: 0.45,
      countJitter: 0,
      layering: false,
      shadings: [],
      petalModifiers: [],
      centerModifiers: [],
      centerRing: false,
      centerConnectors: false,
      centerType: 'disk',
      centerRadius: 0,
      centerDensity: 1,
      anchorToCenter: 'off',
      sizeJitter: 0,
      rotationJitter: 0,
      tipTwist: 0,
      tipCurl: 0,
      edgeWaveAmp: 0,
      edgeWaveFreq: 1,
      designerInner: clone(INNER_PROFILE),
      designerOuter: clone(OUTER_PROFILE),
      profileTransitionFeather: 40,
    };
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const render = (params, seed = 5521) =>
      Algorithms.petalis.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];

    const early = render({ ...clone(base), profileTransitionPosition: 25 });
    const late = render({ ...clone(base), profileTransitionPosition: 75 });
    expect(pathSignature(early)).not.toBe(pathSignature(late));
  });

  test('petalis designer ignores hidden legacy shape params', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const base = {
      ...clone(ALGO_DEFAULTS.petalisDesigner || ALGO_DEFAULTS.petalis || {}),
      ringMode: 'single',
      count: 24,
      countJitter: 0,
      layering: false,
      shadings: [],
      petalModifiers: [],
      centerModifiers: [],
      centerRing: false,
      centerConnectors: false,
      centerType: 'disk',
      centerRadius: 0,
      centerDensity: 1,
      anchorToCenter: 'off',
      sizeJitter: 0,
      rotationJitter: 0,
      edgeWaveAmp: 0,
      edgeWaveFreq: 1,
      designerInner: clone(INNER_PROFILE),
      designerOuter: clone(OUTER_PROFILE),
      profileTransitionPosition: 50,
      profileTransitionFeather: 55,
    };
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const render = (params, seed = 2209) =>
      Algorithms.petalis.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const baseline = pathSignature(render(clone(base)));

    const legacyOverride = clone(base);
    delete legacyOverride.useDesignerShapeOnly;
    const noisyLegacy = pathSignature(
      render({
        ...legacyOverride,
        tipSharpness: 0,
        tipTwist: 95,
        centerCurlBoost: 100,
        tipCurl: 1,
        baseFlare: 4.5,
        basePinch: 3.7,
        petalProfile: 'dagger',
      })
    );

    expect(noisyLegacy).toBe(baseline);
  });
});
