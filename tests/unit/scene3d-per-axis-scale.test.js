/**
 * I23 — Per-axis (non-uniform) object scale.
 *
 * The object transform gains optional per-axis `sx/sy/sz`. Back-compat is
 * absolute: an object carrying only the legacy uniform `scale` behaves exactly
 * as sx=sy=sz=scale, and normalizeParams emits NO per-axis keys for a uniform
 * object (byte-identical default shape). applyObjectTransform stretches each
 * local axis by its own factor.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D per-axis scale — params + transform', () => {
  let runtime;
  let Params;
  let Scene;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Params = runtime.window.Vectura.Scene3D.Params;
    Scene = runtime.window.Vectura.Scene3D.Scene;
  });

  afterAll(() => runtime.cleanup());

  const normObj = (transform) => {
    const p = Params.normalizeParams({
      sceneVersion: 1,
      objects: [{ id: 'o1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform }],
    });
    return p.objects[0].transform;
  };

  test('back-compat: a legacy scale-only transform normalizes with NO per-axis keys', () => {
    const t = normObj({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 2 });
    expect(t).toEqual({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 2 });
    expect('sx' in t).toBe(false);
    expect('sy' in t).toBe(false);
    expect('sz' in t).toBe(false);
  });

  test('an explicitly uniform sx=sy=sz collapses back to scale-only (byte-identical shape)', () => {
    const t = normObj({ scale: 1, sx: 1, sy: 1, sz: 1 });
    expect(t).toEqual({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
  });

  test('a genuinely non-uniform transform keeps all three per-axis keys', () => {
    const t = normObj({ scale: 1, sx: 2, sy: 1, sz: 0.5 });
    expect(t.sx).toBe(2);
    expect(t.sy).toBe(1);
    expect(t.sz).toBe(0.5);
  });

  test('applyObjectTransform: legacy scale scales all three axes equally', () => {
    const p = Scene.applyObjectTransform({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 2 });
    expect(p).toEqual({ x: 2, y: 4, z: 6 });
  });

  test('applyObjectTransform: per-axis sx/sy/sz stretch each local axis independently', () => {
    const p = Scene.applyObjectTransform(
      { x: 1, y: 1, z: 1 },
      { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, sx: 3, sy: 2, sz: 0.5 });
    expect(p.x).toBeCloseTo(3, 6);
    expect(p.y).toBeCloseTo(2, 6);
    expect(p.z).toBeCloseTo(0.5, 6);
  });

  test('applyObjectTransform: an absent per-axis key falls back to the uniform scale', () => {
    const p = Scene.applyObjectTransform(
      { x: 1, y: 1, z: 1 },
      { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 2, sx: 4 });
    expect(p.x).toBeCloseTo(4, 6); // sx wins on X
    expect(p.y).toBeCloseTo(2, 6); // sy absent → scale
    expect(p.z).toBeCloseTo(2, 6); // sz absent → scale
  });
});
