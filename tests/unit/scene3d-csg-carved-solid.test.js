/**
 * E2 — a curved CSG carve (box minus sphere dimple / cylinder hole) must read like a carved SOLID: a crack-free mesh,
 * a drawn rim where the cut meets a face, and no pocket on a face the cutter never reaches.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('curved CSG carve reads as a carved solid (E2)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
  const CASES = {
    dimple: { cutter: 'sphere', pos: [0, 0, 25], params: { radius: 20, detail: 28 } },
    hole: { cutter: 'cylinder', pos: [0, 0, 0], rot: [90, 0], params: { sx: 12, sy: 45, sz: 12, detail: 28 } },
  };
  const build = (name, mapper = 'wireframe', yaw = 0, pitch = 0) => {
    const c = CASES[name];
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    a.params.transform = { ...a.params.transform, yaw, pitch, roll: 0 };
    const bId = engine.addObjectToScene(gid, c.cutter);
    const b = engine.getLayerById(bId);
    b.params.transform = { ...b.params.transform, x: c.pos[0], y: a.params.transform.y + c.pos[1], z: c.pos[2], ...(c.rot ? { pitch: c.rot[0], yaw: c.rot[1] } : {}) };
    b.params.params = c.params;
    [a, b].forEach((l) => { l.params.style = { penId: null, mapper, params: { markSpace: 'pose' } }; });
    engine.createBooleanGroupFromSelection([a.id, bId]);
    const g = engine.getLayerById(gid);
    engine.generate(gid);
    return g;
  };
  const record = (g) => {
    const params = V.Scene3D.Params.normalizeParams(g._sceneAssembled);
    params.ground = { ...(params.ground || {}), enabled: false };
    const scene = V.Scene3D.Scene.assembleScene(params, BOUNDS);
    return scene.objects.find((o) => o.primitive === 'csg');
  };

  Object.keys(CASES).forEach((name) => {
    test(`${name}: the carved mesh is crack-free (no count-1 edges)`, () => {
      const rec = record(build(name));
      expect(rec).toBeTruthy();
      const bad = rec.edges.filter((e) => e.faces.length === 1);
      expect(bad.length).toBe(0);
      expect(rec.edges.filter((e) => e.faces.length > 2).length).toBeLessThanOrEqual(2); // a lone 0.08 mm weld pinch at most
    });

    test(`${name}: the rim loop classifies as crease (box plane vs cut surface)`, () => {
      const rec = record(build(name));
      const cls = V.Scene3D.Edges.classifyEdges(rec, {});
      // A rim edge sits between a box-plane face (normal axis-aligned) and a cut-surface face (normal is not).
      const axisAligned = (n) => Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > 0.9999;
      const rim = cls.filter((e) => {
        if (e.faceIndices.length !== 2) return false;
        const [f0, f1] = e.faceIndices.map((i) => rec.faces[i]);
        return axisAligned(f0.normalWorld) !== axisAligned(f1.normalWorld);
      });
      expect(rim.length).toBeGreaterThan(8);
      // every rim edge is a drawn structural edge (crease, or silhouette where it is the visible contour) - never interior
      expect(rim.filter((e) => e.cls === 'crease' || e.cls === 'silhouette').length).toBe(rim.length);
      expect(rim.filter((e) => e.cls === 'crease').length).toBeGreaterThan(rim.length * 0.4);
      expect(cls.filter((e) => e.cls === 'boundary').length).toBe(0);
    });

    test(`${name}: wireframe draws a closed rim loop around the cut`, () => {
      const g = build(name);
      const edges = (g.scenePaths || []).filter((p) => (p.meta || {}).kind === 'sceneEdge' && p.meta.sceneTarget && p.meta.sceneTarget.objectId !== 'ground');
      const key = (q) => `${Math.round(q.x * 20)},${Math.round(q.y * 20)}`;
      const adj = new Map();
      const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
      edges.forEach((p) => { for (let i = 0; i + 1 < p.length; i += 1) { const a = key(p[i]); const b = key(p[i + 1]); if (a !== b) { link(a, b); link(b, a); } } });
      // a closed loop of >= 16 nodes in which every node has exactly two neighbours (the box outline is only 6)
      const seen = new Set(); let loops = 0;
      adj.forEach((_, start) => {
        if (seen.has(start)) return;
        const comp = []; const stack = [start]; seen.add(start);
        while (stack.length) { const n = stack.pop(); comp.push(n); adj.get(n).forEach((m) => { if (!seen.has(m)) { seen.add(m); stack.push(m); } }); }
        if (comp.length >= 16 && comp.every((n) => adj.get(n).size === 2)) loops += 1;
      });
      expect(loops).toBeGreaterThanOrEqual(1);
    });
  });

  test('dimple: no pocket on a face the cutter does not reach', () => {
    const rec = record(build('dimple'));
    const w = rec.world;
    // The sphere (r20) sits at z=25 on a 50-box: it can only reach vertices with z > 5.
    // Faces whose every vertex has z < 4.5 and that are not planar box faces would be a phantom pocket.
    const bad = rec.faces.filter((f, i) => {
      const idx = rec.faceIndexArrays[i];
      const zs = idx.map((k) => w[k].z);
      const n = f.normalWorld;
      const axis = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > 0.9999;
      return !axis && Math.max(...zs) < 4.5;
    });
    expect(bad.length).toBe(0);
  });
});
