/*
 * Output-invariance lock for the petalis occluder-clipping optimization.
 *
 * Increasing petal count made generate() O(n^2): every petal's outline and
 * shading lines were clipped (clipPathOutside) against the FULL accumulated
 * occluder set, even occluders nowhere near the petal. The fix prunes the
 * occluder set to those whose bbox overlaps the petal before the geometric
 * clip — provably equivalent because a petal's outline + shading all lie
 * within petal.bbox, so a non-overlapping occluder cannot clip them.
 *
 * Shadow casting (splitPathByShadow) is NOT pruned: a distant petal can still
 * cast a shadow across this one, so the lit case keeps the full occluder set.
 *
 * These signatures pin the exact geometry BEFORE the optimization. They must
 * remain byte-identical after it — any drift means the prune changed visible
 * output (a real regression), not just performance.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const bounds = { width: 800, height: 800, m: 40, dW: 720, dH: 720, truncate: true };

const base = (o = {}) => ({
  seed: 4242, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
  petalProfile: 'teardrop', petalScale: 34, petalWidthRatio: 0.74, petalLengthRatio: 1,
  petalSizeRatio: 1, leafSidePos: 0.45, leafSideWidth: 1, leafBaseHandle: 0.35,
  leafSideHandle: 0.4, leafTipHandle: 0.35, designerOuter: null, designerInner: null,
  petalSteps: 32, layering: true, anchorToCenter: 'central', anchorRadiusRatio: 1,
  tipSharpness: 1, tipTwist: 0, tipCurl: 0, baseFlare: 0, basePinch: 0,
  edgeWaveAmp: 0, edgeWaveFreq: 3, radiusScale: 0.2, radiusScaleCurve: 1.2,
  sizeJitter: 0, rotationJitter: 0, count: 40, countJitter: 0, layoutMode: 'whorl',
  bloom: 100, petalAsymmetry: 0, ringMode: 'dual', innerCount: 6, outerCount: 12,
  ringSplit: 0.45, innerOuterLock: false, designerSymmetry: 'none',
  designerInnerSymmetry: 'none', designerOuterSymmetry: 'none',
  profileTransitionPosition: 50, profileTransitionFeather: 0, ringOffset: 12,
  spiralMode: 'golden', customAngle: 137.5, spiralTightness: 1.1, radialGrowth: 0.05,
  spiralStart: 0, spiralEnd: 1, angularDrift: 0, driftStrength: 0.1, driftNoise: 0.2,
  driftNoises: [], centerSizeMorph: 0, centerSizeCurve: 1.2, centerShapeMorph: 0.2,
  centerProfile: 'oval', centerCurlBoost: 0, centerWaveBoost: 0.2, budMode: false,
  budRadius: 0.15, budTightness: 0.5, centerType: 'disk', centerRadius: 8,
  centerDensity: 20, centerFalloff: 0.6, centerFilamentNoises: [], centerRing: false,
  centerRingRadius: 14, centerRingDensity: 16, centerConnectors: false, connectorCount: 60,
  connectorLength: 10, connectorJitter: 0.3, shadings: [], useDesignerShapeOnly: true,
  petalModifiers: [], centerModifiers: [], noises: [],
  ...o,
});

const SHADE = [{ type: 'radial', density: 1, enabled: true }];

const SIGNATURES = {
  layeredWhorl: 'd0ad3f905d1425c771e24e548830e0509c6795d8d6c7158b83bef43c2762dedf',
  layeredWhorlShaded: '092d82a6bc5a30102ba39586fa80659af85655d9042282c99b9bfd90ca709a09',
  layeredWhorlLit: '98dc86e54473e07c594abccaf05c4f956e4c188d45db76baabc3196197aae497',
  spiralLayered: 'f535b1b569ae65516cca4bf9c806a3ca77390413442cad0faea1c2927b270fbe',
};

describe('petalis occluder-prune output invariance', () => {
  let runtime;
  let algo;
  let SeededRNG;
  let SimpleNoise;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    algo = runtime.window.Vectura.AlgorithmRegistry.petalisDesigner;
    SeededRNG = runtime.window.Vectura.SeededRNG;
    SimpleNoise = runtime.window.Vectura.SimpleNoise;
  });

  afterAll(() => { runtime?.cleanup?.(); });

  const gen = (params) =>
    algo.generate(params, new SeededRNG(params.seed), new SimpleNoise(params.seed), bounds);

  test('layered whorl (no shading) geometry is unchanged', () => {
    expect(pathSignature(gen(base()))).toBe(SIGNATURES.layeredWhorl);
  });

  test('layered whorl with radial shading is unchanged', () => {
    expect(pathSignature(gen(base({ shadings: SHADE })))).toBe(SIGNATURES.layeredWhorlShaded);
  });

  test('layered whorl with light source (shadow split) is unchanged', () => {
    const params = base({ shadings: SHADE, lightSource: { x: 120, y: 120 } });
    expect(pathSignature(gen(params))).toBe(SIGNATURES.layeredWhorlLit);
  });

  test('spiral-mode layered geometry is unchanged', () => {
    const params = base({ layoutMode: 'spiral', outerCount: 18, innerCount: 0 });
    expect(pathSignature(gen(params))).toBe(SIGNATURES.spiralLayered);
  });
});
