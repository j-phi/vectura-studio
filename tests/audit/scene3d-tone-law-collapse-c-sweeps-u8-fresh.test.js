const {
  loadScene3dAuditRuntime, clone, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW,
} = require('../helpers/scene3d-tone-law-collapse-shared');


// Split part C (U8, fresh-run determinism): the cached-capture tests live in
// scene3d-tone-law-collapse-c-sweeps-u8.test.js. This test uses uncached
// (fresh) captures only, so splitting it duplicates no render work.

describe('Scene3D tone-law collapse — U8 multi-primitive x multi-density: interlockWeave resolution and draws', () => {
  // Same shape as U7's own multi-primitive x multi-density sweep (both
  // clusters are wave-family, both unreachable on box per
  // manifest.B.unreachable.jsonl). TIER_B_PRIMITIVES minus `box`.
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };
  const capturedOptions = createCapturedOptionsCache();

  const captureOpts = (primitive, densityValue, fresh = false) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive, params: { ...(PPD[primitive] || {}) },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: densityValue } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    const capture = () => {
      const calls = [];
      const orig = SF.buildObject;
      SF.buildObject = function wrapped(opts) {
        const result = orig.call(this, opts);
        calls.push({ opts, result });
        return result;
      };
      try {
        algo.generate(p, null, null, BOUNDS);
      } finally {
        SF.buildObject = orig;
      }
      let best = calls[0];
      for (const c of calls) {
        if ((c.result || []).length > (best.result || []).length) best = c;
      }
      return best.opts;
    };
    return fresh ? capture() : capturedOptions(algo.generate, SF.buildObject, p, BOUNDS, capture);
  };

  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('fresh production runs are deterministic for folded and bare wave laws at the geometry and density boundaries', () => {
    const cases = [
      { primitive: 'sphere', density: DENSITY_VALUES.low },
      { primitive: 'torus', density: DENSITY_VALUES.med },
      { primitive: 'cone', density: DENSITY_VALUES.max },
    ];
    cases.forEach(({ primitive, density }) => {
      const firstOpts = captureOpts(primitive, density, true);
      const secondOpts = captureOpts(primitive, density, true);
      const compareFreshRuns = (law) => {
        const first = SF.buildObject({ ...firstOpts, toneLaw: law });
        const second = SF.buildObject({ ...secondOpts, toneLaw: law });
        expect(first.length).toBeGreaterThan(0);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      };
      expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', penDown: 'continuous' })).toBe('onePenDown');
      compareFreshRuns('onePenDown');
      expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe('interlockWeave');
      compareFreshRuns('interlockWeave');
    });
  }, SLOW);
});
