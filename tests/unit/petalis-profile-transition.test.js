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
const petalOrderValue = (group = '') => {
  const match = `${group}`.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};
const outlineMapByGroup = (outlines) => {
  const map = new Map();
  (outlines || []).forEach((outline, index) => {
    const group = outline?.meta?.group || `petal-${index + 1}`;
    map.set(group, pathSignature([outline]));
  });
  return map;
};
const classifyDesignerAssignments = ({ mixedOutlines, innerOnlyOutlines, outerOnlyOutlines }) => {
  const mixed = outlineMapByGroup(mixedOutlines);
  const inner = outlineMapByGroup(innerOnlyOutlines);
  const outer = outlineMapByGroup(outerOnlyOutlines);
  const orderedGroups = Array.from(mixed.keys()).sort((a, b) => petalOrderValue(a) - petalOrderValue(b));
  return orderedGroups.map((group) => {
    const sig = mixed.get(group);
    if (sig === inner.get(group)) return 'inner';
    if (sig === outer.get(group)) return 'outer';
    return 'blend';
  });
};

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

  test('petalis designer dual-ring boundary is unchanged by radialGrowth', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const base = {
      ...clone(ALGO_DEFAULTS.petalisDesigner || ALGO_DEFAULTS.petalis || {}),
      ringMode: 'dual',
      innerCount: 10,
      outerCount: 14,
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
      profileTransitionFeather: 0,
      designerInner: clone(INNER_PROFILE),
      designerOuter: clone(OUTER_PROFILE),
    };
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const render = (params, seed = 9942) =>
      Algorithms.petalis.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const classify = (params) => {
      const mixedOutlines = extractOutlines(render(clone(params)));
      const innerOnlyOutlines = extractOutlines(
        render({
          ...clone(params),
          profileTransitionFeather: 0,
          designerOuter: clone(INNER_PROFILE),
        })
      );
      const outerOnlyOutlines = extractOutlines(
        render({
          ...clone(params),
          profileTransitionFeather: 0,
          designerInner: clone(OUTER_PROFILE),
        })
      );
      return classifyDesignerAssignments({ mixedOutlines, innerOnlyOutlines, outerOnlyOutlines });
    };

    const lowGrowthAssignments = classify({ ...clone(base), radialGrowth: 0.05 });
    const highGrowthAssignments = classify({ ...clone(base), radialGrowth: 2.2 });

    expect(highGrowthAssignments).toEqual(lowGrowthAssignments);
    expect(lowGrowthAssignments.filter((entry) => entry === 'inner')).toHaveLength(base.innerCount);
    expect(lowGrowthAssignments.filter((entry) => entry === 'outer')).toHaveLength(base.outerCount);
  });

  test('petalis designer ignores ringSplit for dual-ring transitions', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const base = {
      ...clone(ALGO_DEFAULTS.petalisDesigner || ALGO_DEFAULTS.petalis || {}),
      ringMode: 'dual',
      innerCount: 12,
      outerCount: 16,
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
      profileTransitionFeather: 0,
      radialGrowth: 0.2,
      designerInner: clone(INNER_PROFILE),
      designerOuter: clone(OUTER_PROFILE),
    };
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const render = (params, seed = 7771) =>
      Algorithms.petalis.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const lowSplit = render({ ...clone(base), ringSplit: 0.2 });
    const highSplit = render({ ...clone(base), ringSplit: 0.8 });

    expect(pathSignature(lowSplit)).toBe(pathSignature(highSplit));
  });
});
