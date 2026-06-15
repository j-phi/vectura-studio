/*
 * Every Advanced per-ring slider in the Petal Designer must actually affect the
 * generated geometry. In designer mode the silhouette is built from sampled anchor
 * points (profilePoints), which bypasses buildLeafProfile — so width-shaping params
 * (baseFlare/basePinch/edgeWave) were silently dead until applyDesignerProfileWidthMods
 * re-applied them to the sampled points. This sweep is the regression guard: it sets
 * each param one-at-a-time from a clean profile and asserts the outer-ring outlines
 * change. Params that are conditional by design (edgeWaveFreq needs amp>0;
 * centerCurlBoost needs tipTwist>0 + center proximity) are exercised under their
 * enabling condition.
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

// Each entry: a single-key outer-ring override that must change geometry, plus an
// optional `with` of sibling overrides that enable a by-design conditional param.
const SINGLE_KEY_LIVE = {
  petalScale: 60,
  bloom: 40,
  petalAsymmetry: 80,
  petalCupping: 80,
  petalWidthRatio: 1.4,
  tipSharpness: 0,
  tipTwist: 80,
  tipCurl: 0.8,
  baseFlare: 3,
  basePinch: 3,
  edgeWaveAmp: 0.4,
};

describe('Petal Designer advanced ring params are all live', () => {
  let runtime;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });
  afterAll(() => runtime.cleanup());

  const makeRender = () => {
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
    };
    const render = (params) =>
      Algorithms.petalisDesigner.generate(params, new SeededRNG(7), new SimpleNoise(7), bounds) || [];
    return { base, render };
  };

  test('each single-key outer-ring override changes the geometry', () => {
    const { base, render } = makeRender();
    const baseline = pathSignature(render({ ...clone(base), outerRingParams: {} }));
    const dead = [];
    Object.entries(SINGLE_KEY_LIVE).forEach(([key, value]) => {
      const sig = pathSignature(render({ ...clone(base), outerRingParams: { [key]: value } }));
      if (sig === baseline) dead.push(key);
    });
    expect(dead).toEqual([]);
  });

  test('edgeWaveFreq is live once edge wave is enabled', () => {
    const { base, render } = makeRender();
    const f2 = pathSignature(render({ ...clone(base), outerRingParams: { edgeWaveAmp: 0.4, edgeWaveFreq: 2 } }));
    const f8 = pathSignature(render({ ...clone(base), outerRingParams: { edgeWaveAmp: 0.4, edgeWaveFreq: 8 } }));
    expect(f8).not.toBe(f2);
  });

  test('centerCurlBoost is live once tip twist drives the center curl', () => {
    const { base, render } = makeRender();
    const innerBase = { ...clone(base), innerCount: 6, outerCount: 0 };
    const cc0 = pathSignature(render({ ...clone(innerBase), innerRingParams: { tipTwist: 60, centerCurlBoost: 0 } }));
    const cc80 = pathSignature(render({ ...clone(innerBase), innerRingParams: { tipTwist: 60, centerCurlBoost: 80 } }));
    expect(cc80).not.toBe(cc0);
  });

  test('width-mod params are byte-identical at their neutral defaults', () => {
    const { base, render } = makeRender();
    const baseline = pathSignature(render({ ...clone(base), outerRingParams: {} }));
    const neutral = pathSignature(
      render({ ...clone(base), outerRingParams: { baseFlare: 0, basePinch: 0, edgeWaveAmp: 0, edgeWaveFreq: 2 } })
    );
    expect(neutral).toBe(baseline);
  });
});
