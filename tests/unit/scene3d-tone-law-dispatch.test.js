const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };

describe('Scene3D.SurfaceFill — tone-law dispatch canaries (routine lane)', () => {
  let runtime;
  let V;
  let SF;
  let opts;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    const defaults = V.ALGO_DEFAULTS.scene3d;
    const params = clone(defaults);
    params.objects = [{
      id: 'o1', name: 'sphere', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    params.ground = { enabled: false };
    params.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    params.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    params.tone = { ...clone(defaults).tone, enabled: true };
    params.lights = [SUN];
    SF = V.Scene3D.SurfaceFill;
    const calls = [];
    const original = SF.buildObject;
    SF.buildObject = function capture(callOpts) {
      const result = original.call(this, callOpts);
      calls.push({ opts: callOpts, count: result ? result.length : 0 });
      return result;
    };
    try { V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS); }
    finally { SF.buildObject = original; }
    calls.sort((a, b) => b.count - a.count);
    opts = calls[0].opts;
  });

  afterAll(async () => { if (runtime) await runtime.cleanup(); });

  test('unset, ladder, and unknown laws retain the committed baseline', () => {
    expect(SF.buildObject(opts)).toEqual(SF.buildObject({ ...opts, toneLaw: 'ladder' }));
    expect(SF.buildObject(opts)).toEqual(SF.buildObject({ ...opts, toneLaw: 'unknown-law' }));
  });

  test('the shipped mkTick law dispatches to distinct curved-surface output', () => {
    const baseline = SF.buildObject({ ...opts, toneLaw: 'ladder' });
    const mark = SF.buildObject({ ...opts, toneLaw: 'mkTick' });
    expect(mark).toBeTruthy();
    expect(mark.some((path) => path && path.length >= 2)).toBe(true);
    expect(mark).not.toEqual(baseline);
  });
});
