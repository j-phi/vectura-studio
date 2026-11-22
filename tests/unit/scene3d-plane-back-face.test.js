const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pinLegacySun } = require('../helpers/legacy-sun');

/**
 * A plane is one quad; seen from below its only face was back-facing and drew
 * no fill. buildPlaneMesh now carries a second, reversed-winding face
 * ('face:-Y') so the underside shades. The outline must not be inked twice.
 */
describe('Scene3D — plane underside', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const planeScene = (pitch) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    pinLegacySun(engine, gid);
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    obj.params.style.params = { ...(obj.params.style.params || {}), markSpace: 'pose' };
    const P = V.Scene3D.Params;
    const prev = obj.params.primitive;
    obj.params.primitive = 'plane';
    obj.params.params = P.buildPrimitiveParams('plane', prev, null) || {};
    group.params.camera.pitch = pitch;
    engine.computeAllDisplayGeometry();
    return { obj, paths: group.scenePaths || [] };
  };
  const fillLen = (paths, id) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget && p.meta.sceneTarget.objectId === id && !p.meta.sceneTarget.occluded)
    .reduce((s, p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s + L; }, 0);

  test('mesh has a back face with reversed winding', () => {
    const m = V.Scene3D.Scene.buildPlaneMesh({});
    expect(m.faces.length).toBe(2);
    expect(m.faceIds).toEqual(['face:+Y', 'face:-Y']);
    expect(m.faces[1]).toEqual([3, 2, 1, 0]);
  });

  test('camera below (pitch -15) draws fill', () => {
    const { obj, paths } = planeScene(-15);
    expect(fillLen(paths, obj.id)).toBeGreaterThan(0);
  });

  test('no duplicated segments in the plane output (either side)', () => {
    [-15, 20].forEach((pitch) => {
      const { obj, paths } = planeScene(pitch);
      const seen = new Map(); let dup = 0;
      const key = (a, b) => { const f = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`; const x = f(a); const y = f(b); return x < y ? `${x}|${y}` : `${y}|${x}`; };
      paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id && p.meta.kind !== 'sceneFill').forEach((p) => {
        for (let i = 1; i < p.length; i++) { const k = key(p[i - 1], p[i]); if (seen.has(k)) dup++; seen.set(k, 1); }
      });
      expect(dup).toBe(0);
    });
  });
});
