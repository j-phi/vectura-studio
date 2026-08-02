const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * I4 — remove ground & sun.
 *
 * A scene must be able to have ground OFF and ZERO lights:
 *   - normalizeParams keeps an EXPLICIT empty lights array empty (deleting the
 *     last light must not resurrect the sun), while an ABSENT key still seeds a
 *     default directional sun (new-layer contract).
 *   - assembleScene emits NO ground record when params.ground.enabled === false.
 *   - generate() on a lightless scene never throws, shades flat, and casts NO
 *     shadow fills (regionClass 'castShadow'); a sun+ground scene still casts.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

describe('scene3d — remove ground & sun (I4)', () => {
  let runtime;
  let V;
  let Params;
  let Scene;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params;
    Scene = V.Scene3D.Scene;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  test('normalizeParams: an EXPLICIT empty lights array stays empty (no resurrected sun)', () => {
    const p = Params.normalizeParams({ lights: [] });
    expect(Array.isArray(p.lights)).toBe(true);
    expect(p.lights.length).toBe(0);
  });

  test('normalizeParams: an ABSENT lights key still seeds a default directional sun', () => {
    const p = Params.normalizeParams({});
    expect(p.lights.length).toBe(1);
    expect(p.lights[0].type).toBe('directional');
  });

  test('sanitizeSceneParams: import branch also preserves a lightless scene', () => {
    const p = Params.sanitizeSceneParams({ sceneVersion: 1, lights: [] });
    expect(p.lights.length).toBe(0);
  });

  test('assembleScene: ground.enabled === false emits NO ground record', () => {
    const on = Scene.assembleScene(Params.normalizeParams({ ground: { enabled: true } }), BOUNDS);
    const off = Scene.assembleScene(Params.normalizeParams({ ground: { enabled: false } }), BOUNDS);
    expect(on.ground).toBeTruthy();
    expect(off.ground).toBeNull();
  });

  test('generate: a lightless, groundless scene does not throw and casts no shadows', () => {
    const params = {
      ...clone(defaults),
      lights: [],
      ground: { enabled: false },
    };
    let paths;
    expect(() => { paths = algo.generate(params, null, null, BOUNDS) || []; }).not.toThrow();
    expect(Array.isArray(paths)).toBe(true);
    const shadows = paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
    expect(shadows.length).toBe(0);
  });

  test('generate: a sun + ground scene DOES cast shadow fills (contrast pin)', () => {
    const params = {
      ...clone(defaults),
      lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
      ground: { enabled: true },
    };
    const paths = algo.generate(params, null, null, BOUNDS) || [];
    const shadows = paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
    expect(shadows.length).toBeGreaterThan(0);
  });

  test('generate: ground OFF emits no ground-target paths', () => {
    const params = { ...clone(defaults), ground: { enabled: false } };
    const paths = algo.generate(params, null, null, BOUNDS) || [];
    const groundPaths = paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground');
    expect(groundPaths.length).toBe(0);
  });
});
