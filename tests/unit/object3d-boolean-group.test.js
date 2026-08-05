const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene-tree Increment A — object3d + booleanGroup3d layer TYPES (data-only).
 *
 * (a) ALGO_DEFAULTS.object3d + booleanGroup3d exist with the documented factory
 *     shapes (mirror one scene3d object / the fused-result controls).
 * (b) A STANDALONE object3d.generate() equals the equivalent one-object
 *     scene3d.generate() — it must DELEGATE to the scene3d pipeline, not fork it.
 * (c) object3d.generate() returns [] when consumed by a scene group
 *     (_sceneConsumed on bounds OR params) — the group will emit its paths.
 * (d) booleanGroup3d.generate() returns [] (a container emits nothing itself).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

describe('Scene-tree Increment A — object3d + booleanGroup3d types', () => {
  let runtime;
  let V;
  let object3d;
  let booleanGroup3d;
  let scene3d;
  let Params;
  let ALGO;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    object3d = V.AlgorithmRegistry && V.AlgorithmRegistry.object3d;
    booleanGroup3d = V.AlgorithmRegistry && V.AlgorithmRegistry.booleanGroup3d;
    scene3d = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D && V.Scene3D.Params;
    ALGO = V.ALGO_DEFAULTS || {};
  });

  afterAll(() => runtime.cleanup());

  // (a) ── factory param shapes ────────────────────────────────────────────────
  describe('ALGO_DEFAULTS factory shapes', () => {
    test('object3d mirrors one scene3d object entry', () => {
      const d = ALGO.object3d;
      expect(d).toBeTruthy();
      expect(d.primitive).toBe('box');
      expect(d.params).toEqual({ sx: 40, sy: 40, sz: 40 });
      expect(d.transform).toMatchObject({ x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
      expect(d.visibility).toBe('solid');
      expect(d.role).toBe('solid');
      expect(d.shadow).toEqual({ enabled: null });
      expect(d.border).toMatchObject({ enabled: false });
      expect(d.emissive).toMatchObject({ enabled: false });
      expect(d.style).toEqual({ penId: null, mapper: 'wireframe', params: {} });
      expect(d.faceStyles).toEqual({});
    });

    test('booleanGroup3d carries the fused-result controls', () => {
      const d = ALGO.booleanGroup3d;
      expect(d).toBeTruthy();
      expect(d.op).toBe('subtract');
      expect(d.style).toMatchObject({ mapper: expect.any(String), params: {} });
      expect(d.tone).toBeTruthy();
      expect(d.tone.enabled).toBe(true);
      expect(d.border).toMatchObject({ enabled: false });
      expect(d.visibility).toBe('solid');
    });

    test('normalizeObjectLayerParams is exported and normalizes to one object + style', () => {
      expect(typeof Params.normalizeObjectLayerParams).toBe('function');
      const norm = Params.normalizeObjectLayerParams({ primitive: 'sphere', params: { radius: 12 } });
      expect(norm.primitive).toBe('sphere');
      expect(norm.params.radius).toBe(12);
      expect(norm.style).toEqual({ penId: null, mapper: 'none', params: {} });
      expect(norm.transform).toMatchObject({ scale: 1 });
      expect(norm.role).toBe('solid');
    });
  });

  // (b) ── standalone object3d ≡ one-object scene3d ────────────────────────────
  describe('standalone object3d delegates to the scene3d pipeline', () => {
    test('default object3d output equals the one-object scene3d default output', () => {
      const objOut = object3d.generate(clone(ALGO.object3d), null, null, clone(BOUNDS));
      const sceneOut = scene3d.generate(clone(ALGO.scene3d), null, null, clone(BOUNDS));
      expect(objOut.length).toBeGreaterThan(0);
      expect(objOut).toEqual(sceneOut);
    });

    test('a custom primitive matches the hand-built equivalent scene3d scene', () => {
      const objParams = {
        primitive: 'sphere',
        params: { radius: 22, detail: 16 },
        transform: { x: 4, y: 24, z: -3, yaw: 12, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
        role: 'solid',
        style: { penId: null, mapper: 'hatch', params: {} },
        faceStyles: {},
      };
      const objOut = object3d.generate(clone(objParams), null, null, clone(BOUNDS));

      const sceneDefault = clone(ALGO.scene3d);
      const norm = Params.normalizeObjectLayerParams(clone(objParams));
      const { style, faceStyles, ...object } = norm;
      const sceneParams = {
        ...sceneDefault,
        objects: [object],
        styleTable: { scene: style, byObject: {}, byFace: faceStyles },
      };
      const sceneOut = scene3d.generate(sceneParams, null, null, clone(BOUNDS));
      expect(objOut.length).toBeGreaterThan(0);
      expect(objOut).toEqual(sceneOut);
    });
  });

  // (c) ── consumed by a scene group → emit nothing ────────────────────────────
  describe('object3d yields to the scene group when consumed', () => {
    test('_sceneConsumed on bounds returns []', () => {
      const out = object3d.generate(clone(ALGO.object3d), null, null, { ...clone(BOUNDS), _sceneConsumed: true });
      expect(out).toEqual([]);
    });
    test('_sceneConsumed on params returns []', () => {
      const out = object3d.generate({ ...clone(ALGO.object3d), _sceneConsumed: true }, null, null, clone(BOUNDS));
      expect(out).toEqual([]);
    });
  });

  // (d) ── booleanGroup3d is a container stub ──────────────────────────────────
  describe('booleanGroup3d emits nothing itself', () => {
    test('generate returns []', () => {
      expect(booleanGroup3d.generate(clone(ALGO.booleanGroup3d), null, null, clone(BOUNDS))).toEqual([]);
    });
  });
});
