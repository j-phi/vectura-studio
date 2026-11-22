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

  // The back face shares the rim with the front face, but the rim is still the
  // sheet's open BOUNDARY (as it was for the one-face plane), never a silhouette:
  // the edge class rides on the path meta and drives the edge-class filters.
  test('the rim of the two-sided plane stays a boundary edge (either side)', () => {
    const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
    const base = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.scene3d));
    [-15, 20].forEach((pitch) => {
      const p = JSON.parse(JSON.stringify(base));
      p.objects = [{ id: 'o1', name: 'o1', primitive: 'plane', params: { sx: 60, sz: 60 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
      p.groups = []; p.ground = { enabled: false }; p.backdrop = { enabled: false };
      p.camera = { projection: 'orthographic', yaw: -25, pitch, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      p.styleTable = { scene: base.styleTable.scene, byObject: { o1: { penId: null, mapper: 'wireframe', params: {} } }, byFace: {} };
      const edges = (V.AlgorithmRegistry.scene3d.generate(p, null, null, BOUNDS) || [])
        .filter((q) => q.meta && q.meta.kind === 'sceneEdge');
      expect(edges.length, `pitch ${pitch}`).toBeGreaterThan(0);
      expect([...new Set(edges.map((q) => q.meta.sceneTarget.edgeClass))], `pitch ${pitch}`).toEqual(['boundary']);
    });
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
