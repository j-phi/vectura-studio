const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };

describe('t1b perf', () => {
  let runtime, V, algo, defaults, Params;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    Params = V.Scene3D.Params;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const buildSceneParams = (toneLaw, mapper, fillDensity, primitive) => {
    const p = clone(defaults);
    p.objects = [{ id: 'obj', name: 'Obj', primitive, params: clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = clone(Params.DEFAULT_CAMERA);
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw } }, byObject: {}, byFace: {} };
    return p;
  };

  test('perf', () => {
    ['mkTick', 'mkDashRamp'].forEach((law) => {
      const t0 = Date.now();
      const paths = algo.generate(buildSceneParams(law, 'hatch', 220, 'torus'), null, null, BOUNDS);
      const ms = Date.now() - t0;
      console.log(`${law} torus d=220: ${ms}ms, ${paths.length} paths`);
      expect(ms).toBeLessThan(2500);
    });
    expect(true).toBe(true);
  });
});
