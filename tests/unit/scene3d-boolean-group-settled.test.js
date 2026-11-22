/**
 * B4b — the settled (non-draft) ink of a rotated combined shape must keep its fill, and agree with the selection outline /
 * with carving the pre-transformed operands.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('boolean group settled ink after a group transform (B4b)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const build = (gt) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    const bId = engine.addObjectToScene(gid, 'sphere');
    const b = engine.getLayerById(bId);
    b.params.transform = { ...b.params.transform, x: 12, y: a.params.transform.y, z: 0 };
    b.params.params = { radius: 22, detail: 28 };
    const bg = engine.createBooleanGroupFromSelection([a.id, bId]);
    if (gt) engine.getLayerById(bg).params.transform = gt;
    engine.generate(gid);
    return { engine, gid, bg, g: engine.getLayerById(gid) };
  };
  const summarize = (g) => {
    const by = {};
    (g.scenePaths || []).forEach((p) => {
      const m = p.meta || {}; const t = m.sceneTarget;
      if (t && t.objectId === 'ground') return;
      if (m.kind === 'sceneEdge' || !t) return;
      const o = by[m.kind] || (by[m.kind] = { n: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
      o.n += 1; p.forEach((q) => { o.x0 = Math.min(o.x0, q.x); o.x1 = Math.max(o.x1, q.x); o.y0 = Math.min(o.y0, q.y); o.y1 = Math.max(o.y1, q.y); });
    });
    return by;
  };
  const edgeBox = (g) => {
    const o = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    (g.scenePaths || []).forEach((p) => {
      const m = p.meta || {}; const t = m.sceneTarget;
      if (!t || t.objectId === 'ground' || m.kind !== 'sceneEdge') return;
      p.forEach((q) => { o.x0 = Math.min(o.x0, q.x); o.x1 = Math.max(o.x1, q.x); o.y0 = Math.min(o.y0, q.y); o.y1 = Math.max(o.y1, q.y); });
    });
    return o;
  };

  test('settled rotated group: fill ink stays inside the edge outline bounds', () => {
    const { g } = build({ x: 0, y: 0, z: 0, yaw: 0, pitch: 15, roll: 0, scale: 1 });
    const fill = summarize(g); const edge = edgeBox(g);
    const kinds = Object.keys(fill);
    expect(kinds.length).toBeGreaterThan(0);
    kinds.forEach((k) => {
      expect(fill[k].x0).toBeGreaterThanOrEqual(edge.x0 - 1);
      expect(fill[k].x1).toBeLessThanOrEqual(edge.x1 + 1);
      expect(fill[k].y0).toBeGreaterThanOrEqual(edge.y0 - 1);
      expect(fill[k].y1).toBeLessThanOrEqual(edge.y1 + 1);
    });
  });

  test('settled move: ink translates exactly with the group transform', () => {
    const base = build(null); const moved = build({ x: 30, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
    const a = summarize(base.g); const b = summarize(moved.g);
    expect(Object.keys(b)).toEqual(Object.keys(a));
    Object.keys(a).forEach((k) => {
      expect(b[k].n).toBe(a[k].n);
      expect(b[k].x1 - b[k].x0).toBeCloseTo(a[k].x1 - a[k].x0, 3);
    });
  });
});

describe('boolean group draft frame: surface-locked marks follow the group transform (B4b)', () => {
  let runtime; let V; let algo;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura; algo = V.AlgorithmRegistry.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3, fastPreview: true };
  // The app's own scene (default styles, surface-locked marks), operands moved by `shift` (or the group by it).
  const drafted = (viaGroup, shift) => {
    const engine = new V.VectorEngine(); engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    a.params.primitive = 'box'; a.params.params = { sx: 50, sy: 50, sz: 50 };
    const bId = engine.addObjectToScene(gid, 'sphere');
    const b = engine.getLayerById(bId);
    b.params.params = { radius: 22, detail: 28 };
    b.params.transform = { ...b.params.transform, x: 12, y: a.params.transform.y, z: 0 };
    const bg = engine.createBooleanGroupFromSelection([a.id, bId]);
    if (viaGroup) engine.getLayerById(bg).params.transform = { x: shift, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    else [a, b].forEach((l) => { l.params.transform = { ...l.params.transform, x: (l.params.transform.x || 0) + shift }; });
    engine.generate(gid);
    const params = V.Scene3D.Params.normalizeParams(engine.getLayerById(gid)._sceneAssembled);
    params.ground = { ...(params.ground || {}), enabled: false };
    const paths = algo.generate(params, null, null, BOUNDS) || [];
    const o = { x0: Infinity, x1: -Infinity, n: 0 };
    paths.forEach((p) => { if (p.meta && p.meta.kind === 'sceneFill' && !(p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground')) { o.n += 1; p.forEach((q) => { o.x0 = Math.min(o.x0, q.x); o.x1 = Math.max(o.x1, q.x); }); } });
    return o;
  };

  test('draft: group move shifts the hatch marks exactly like moving the operands', () => {
    const viaOperands = drafted(false, 30);
    const viaGroup = drafted(true, 30);
    expect(viaOperands.n).toBeGreaterThan(0);
    expect(viaGroup.n).toBe(viaOperands.n);
    expect(viaGroup.x0).toBeCloseTo(viaOperands.x0, 3);
    expect(viaGroup.x1).toBeCloseTo(viaOperands.x1, 3);
  });
});
