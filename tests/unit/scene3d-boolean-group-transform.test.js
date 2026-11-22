/**
 * B4 — a boolean group (combined shape) carries an optional group transform
 * ({x,y,z,yaw,pitch,roll,scale,sx,sy,sz}) applied to every operand AFTER the operand's own
 * transform, about the group pivot (mean of the operands' own positions). Absent = identity,
 * written only when non-identity, so every existing scene is byte-identical.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('boolean group transform (B4)', () => {
  let runtime;
  let V;
  let Boolean3D;
  let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Boolean3D = V.Scene3D.Boolean;
    Params = V.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  const box = (id, size, at, extra = {}) => ({
    id,
    name: id,
    primitive: 'box',
    params: { sx: size, sy: size, sz: size },
    transform: { x: at.x || 0, y: at.y || 0, z: at.z || 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid',
    ...extra,
  });

  const scene = (groupExtra = {}) => Params.normalizeParams({
    sceneVersion: 1,
    objects: [box('solid-1', 40, { x: 10 }), box('hole-1', 20, { x: 10, z: 0 }, { role: 'hole' })],
    groups: [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'], ...groupExtra }],
    lights: [],
    camera: {},
  });

  const bbox = (verts) => {
    const b = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
    verts.forEach((p) => ['x', 'y', 'z'].forEach((k) => { b.min[k] = Math.min(b.min[k], p[k]); b.max[k] = Math.max(b.max[k], p[k]); }));
    return b;
  };
  const carved = (p, draft = false) => Boolean3D.resolveAssembly(p, 1, { draft });

  it('identity / absent transform is byte-identical and never written', () => {
    const none = scene();
    const ident = scene({ transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } });
    expect(none.groups[0].transform).toBeUndefined();
    expect(ident.groups[0].transform).toBeUndefined();
    expect(JSON.stringify(ident.groups)).toBe(JSON.stringify(none.groups));
    expect(JSON.stringify(carved(ident)[0].meshData)).toBe(JSON.stringify(carved(none)[0].meshData));
  });

  it('a non-identity transform survives normalizeParams and keeps only real keys', () => {
    const p = scene({ transform: { x: 12, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } });
    expect(p.groups[0].transform).toMatchObject({ x: 12, y: 0, z: 0, scale: 1 });
    expect(p.groups[0].transform.sx).toBeUndefined();
    const q = scene({ transform: { sx: 2, sy: 1, sz: 1 } });
    expect(q.groups[0].transform).toMatchObject({ sx: 2, sy: 1, sz: 1 });
  });

  it('collectSceneParams carries the boolean layer transform onto the group entry, only when non-identity', () => {
    const op = (id, role, x) => ({ kind: 'object', id, params: { primitive: 'box', params: { sx: 20, sy: 20, sz: 20 }, role, transform: { x, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } } });
    const mk = (transform) => Params.collectSceneParams({}, [
      { kind: 'boolean', id: 'bg', params: { op: 'subtract', ...(transform ? { transform } : {}) }, children: ['a', 'b'] },
      op('a', 'solid', 0), op('b', 'hole', 0),
    ]);
    expect(mk(null).groups[0].transform).toBeUndefined();
    expect(mk({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }).groups[0].transform).toBeUndefined();
    expect(mk({ x: 5, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }).groups[0].transform.x).toBe(5);
  });

  it('move: every carved vertex shifts by exactly the group translation', () => {
    const base = bbox(carved(scene())[0].meshData.vertices);
    const moved = bbox(carved(scene({ transform: { x: 30, y: -5, z: 7 } }))[0].meshData.vertices);
    ['x', 'y', 'z'].forEach((k, i) => {
      const d = [30, -5, 7][i];
      expect(moved.min[k] - base.min[k]).toBeCloseTo(d, 6);
      expect(moved.max[k] - base.max[k]).toBeCloseTo(d, 6);
    });
  });

  it('scale: stretches the carved mesh about the group pivot (operand centroid)', () => {
    const base = bbox(carved(scene())[0].meshData.vertices);
    const scaled = bbox(carved(scene({ transform: { sx: 2, sy: 1, sz: 1, scale: 1 } }))[0].meshData.vertices);
    // pivot x = 10 (both operands sit at x = 10): extent doubles about it, y/z untouched
    expect(scaled.min.x).toBeCloseTo(10 + (base.min.x - 10) * 2, 6);
    expect(scaled.max.x).toBeCloseTo(10 + (base.max.x - 10) * 2, 6);
    expect(scaled.min.y).toBeCloseTo(base.min.y, 6);
    expect(scaled.max.z).toBeCloseTo(base.max.z, 6);
  });

  it('rotate: yaw 90 about the pivot swaps the x and z extents around it', () => {
    const base = bbox(carved(scene())[0].meshData.vertices);
    const rot = bbox(carved(scene({ transform: { yaw: 90 } }))[0].meshData.vertices);
    const w = base.max.x - base.min.x; const d = base.max.z - base.min.z;
    expect(rot.max.x - rot.min.x).toBeCloseTo(d, 5);
    expect(rot.max.z - rot.min.z).toBeCloseTo(w, 5);
    expect((rot.max.x + rot.min.x) / 2).toBeCloseTo(10, 5);
  });

  it('draft / uncarved fallback moves every operand by the group translation', () => {
    const base = carved(scene(), true);
    const moved = carved(scene({ transform: { x: 30 } }), true);
    expect(moved.length).toBe(base.length);
    expect(moved.length).toBe(2);
    moved.forEach((u, i) => expect(u.obj.transform.x - base[i].obj.transform.x).toBeCloseTo(30, 6));
  });

  it('draft fallback composes a rotation about the pivot (operand positions orbit the pivot)', () => {
    const p = Params.normalizeParams({
      sceneVersion: 1,
      objects: [box('solid-1', 40, { x: 0 }), box('hole-1', 20, { x: 20 }, { role: 'hole' })],
      groups: [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'], transform: { yaw: 90 } }],
      lights: [], camera: {},
    });
    const units = carved(p, true);
    // pivot x = 10; hole at +10 from the pivot swings to +/-10 along z
    const hole = units.find((u) => u.obj.id === 'hole-1');
    expect(Math.abs(hole.obj.transform.z)).toBeCloseTo(10, 5);
    expect(hole.obj.transform.x).toBeCloseTo(10, 5);
    expect(Math.abs(hole.obj.transform.yaw)).toBeCloseTo(90, 4);
  });

  it('expandMonolithToTree copies the inline group transform onto the boolean child layer', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('mono', 'scene3d', 'Scene');
    layer.params.objects = [box('o1', 40, {}), box('o2', 20, {}, { role: 'hole' })];
    layer.params.groups = [{ id: 'g1', op: 'subtract', children: ['o1', 'o2'], transform: { x: 14, yaw: 30 } }];
    engine.layers.push(layer);
    const gid = engine.expandMonolithToTree('mono');
    expect(gid).toBe('mono');
    const bl = engine.getLayerDescendants(gid).find((l) => l.type === 'booleanGroup3d');
    expect(bl.params.transform).toMatchObject({ x: 14, yaw: 30 });
  });
});
