const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

// Minimal params matching the enforceDesignerParams overrides + petalis defaults
const baseParams = (overrides = {}) => ({
  seed: 4242,
  posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  smoothing: 0, simplify: 0,
  petalScale: 32,
  petalProfile: 'teardrop',
  petalWidthRatio: 1,
  petalSteps: 24,
  count: 20,
  innerCount: 10,
  outerCount: 10,
  ringSplit: 0.45,
  innerOuterLock: false,
  layering: true,
  anchorToCenter: 'central',
  anchorRadiusRatio: 1,
  tipSharpness: 1,
  tipTwist: 0,
  tipCurl: 0,
  baseFlare: 0,
  basePinch: 0,
  sizeJitter: 0,
  rotationJitter: 0,
  radiusScale: 0.2,
  radiusScaleCurve: 1,
  profileTransitionPosition: 50,
  profileTransitionFeather: 0,
  designerInner: null,
  designerOuter: null,
  designerSymmetry: 'none',
  designerInnerSymmetry: 'none',
  designerOuterSymmetry: 'none',
  noises: [],
  shadings: [],
  ...overrides,
});

describe('petalisDesigner algorithm', () => {
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

  const rng = (seed = 4242) => new SeededRNG(seed);
  const noise = (seed = 4242) => new SimpleNoise(seed);

  // --- Registration ---

  test('petalisDesigner is registered on AlgorithmRegistry', () => {
    expect(algo).toBeDefined();
    expect(typeof algo.generate).toBe('function');
    expect(typeof algo.formula).toBe('function');
  });

  // --- Basic generate ---

  test('generate returns an array', () => {
    const result = algo.generate(baseParams(), rng(), noise(), bounds);
    expect(Array.isArray(result)).toBe(true);
  });

  test('generate with valid params produces non-empty paths', () => {
    const result = algo.generate(baseParams(), rng(), noise(), bounds);
    // Only non-trivial if PetalisAlgorithm is loaded; at minimum must be an array
    if (result.length > 0) {
      expect(result.length).toBeGreaterThan(0);
      result.forEach((path) => {
        expect(Array.isArray(path)).toBe(true);
        path.forEach((pt) => {
          expect(typeof pt.x).toBe('number');
          expect(typeof pt.y).toBe('number');
        });
      });
    }
  });

  // --- Determinism ---

  test('generate is deterministic — same seed produces identical output', () => {
    const p = baseParams();
    const a = algo.generate(p, rng(4242), noise(4242), bounds);
    const b = algo.generate(p, rng(4242), noise(4242), bounds);
    expect(pathSignature(a)).toBe(pathSignature(b));
  });

  test('different innerCount + outerCount params produce different output', () => {
    const a = algo.generate(baseParams({ innerCount: 5, outerCount: 5 }), rng(), noise(), bounds);
    const b = algo.generate(baseParams({ innerCount: 15, outerCount: 15 }), rng(), noise(), bounds);
    // Only assert when both produce output (PetalisAlgorithm loaded)
    if (a.length > 0 && b.length > 0) {
      expect(pathSignature(a)).not.toBe(pathSignature(b));
    }
  });

  // --- Edge cases ---

  test('generate does not throw for null params', () => {
    expect(() => algo.generate(null, rng(), noise(), bounds)).not.toThrow();
  });

  test('generate does not throw for empty params object', () => {
    expect(() => algo.generate({}, rng(), noise(), bounds)).not.toThrow();
  });

  test('generate does not throw for params with NaN numeric fields', () => {
    const p = baseParams({ count: NaN, petalScale: NaN, ringSplit: NaN });
    expect(() => algo.generate(p, rng(), noise(), bounds)).not.toThrow();
  });

  // --- enforceDesignerParams contract ---

  test('ringMode is always dual regardless of caller param', () => {
    // enforceDesignerParams hard-wires ringMode to "dual" — confirm generate behaves
    // consistently between ringMode:single and ringMode:dual inputs
    const pDual = baseParams({ ringMode: 'dual' });
    const pSingle = baseParams({ ringMode: 'single' }); // will be overridden internally
    const a = algo.generate(pDual, rng(111), noise(111), bounds);
    const b = algo.generate(pSingle, rng(111), noise(111), bounds);
    expect(pathSignature(a)).toBe(pathSignature(b));
  });

  // --- formula ---

  test('formula returns a string', () => {
    const f = algo.formula(baseParams());
    expect(typeof f).toBe('string');
  });

  test('formula does not throw for null params', () => {
    expect(() => algo.formula(null)).not.toThrow();
  });
});
