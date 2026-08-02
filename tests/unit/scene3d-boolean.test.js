/**
 * Scene3D.Boolean — group resolver / assembly planner (Increment 0 + 1).
 *
 * resolveAssembly turns a normalized scene into ordered { obj, meshData } units:
 * ungrouped objects stay 1:1 with buildPrimitiveMesh (the byte-identical legacy
 * path), a subtract group collapses to ONE combined csg unit, and every
 * degradation path (draft frame, CSG failure) falls back to uncarved children.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D.Boolean.resolveAssembly', () => {
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

  // Build a normalized scene from raw objects + groups.
  const scene = (objects, groups = []) => Params.normalizeParams({
    sceneVersion: 1, objects, groups, lights: [], camera: {},
  });

  it('Increment-0 pin: an ungrouped scene maps 1:1 through buildPrimitiveMesh', () => {
    const p = scene([box('obj-1', 40, {}), box('obj-2', 20, { x: 80 })]);
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(2);
    expect(units[0].obj).toBe(p.objects[0]);
    expect(units[1].obj).toBe(p.objects[1]);
    units.forEach((u) => {
      expect(u.meshData).toBeTruthy();
      expect(Array.isArray(u.meshData.faces)).toBe(true);
      expect(u.meshData.pretransformed).toBeFalsy(); // ordinary per-object mesh
    });
  });

  it('subtract group collapses to ONE combined csg unit that inherits the primary solid', () => {
    const p = scene(
      [box('solid-1', 40, {}, { visibility: 'xray' }), box('hole-1', 20, {}, { role: 'hole' })],
      [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(1);
    const u = units[0];
    expect(u.obj.primitive).toBe('csg');
    // Identity/visibility/border borrowed from the PRIMARY solid (style source).
    expect(u.obj.id).toBe('solid-1');
    expect(u.obj.visibility).toBe('xray');
    // World-space carved mesh, hatched per-face like a box.
    expect(u.meshData.pretransformed).toBe(true);
    expect(u.meshData.csgFaceted).toBe(true);
    expect(u.meshData.faces.length).toBeGreaterThan(0);
    expect(u.meshData.faceIds.length).toBe(u.meshData.faces.length);
    expect(u.meshData.faceIds[0]).toMatch(/^face:csg:/);
  });

  it('role + op parsing survives normalization (default solid / none)', () => {
    const p = scene(
      [box('a', 40, {}), box('b', 20, {}, { role: 'hole' })],
      [{ op: 'subtract', children: ['a', 'b', 'ghost'] }],
    );
    expect(p.objects[0].role).toBe('solid'); // absent → solid
    expect(p.objects[1].role).toBe('hole');
    expect(p.groups.length).toBe(1);
    expect(p.groups[0].id).toMatch(/^grp-/);   // synthesized unique id
    expect(p.groups[0].op).toBe('subtract');
    expect(p.groups[0].children).toEqual(['a', 'b']); // dangling 'ghost' dropped
  });

  it('an ungrouped hole is INERT — it renders as a solid (plain unit)', () => {
    const p = scene([box('solid-1', 40, {}), box('hole-1', 20, {}, { role: 'hole' })]);
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(2);
    units.forEach((u) => expect(u.obj.primitive).toBe('box'));
    const hole = units.find((u) => u.obj.id === 'hole-1');
    expect(hole.meshData.pretransformed).toBeFalsy(); // ordinary solid mesh
  });

  it('op:"none" group leaves children independent', () => {
    const p = scene(
      [box('a', 40, {}), box('b', 20, {}, { role: 'hole' })],
      [{ op: 'none', children: ['a', 'b'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(2);
    units.forEach((u) => expect(u.obj.primitive).toBe('box'));
  });

  it('draft frame → uncarved children (CONTRACT L4)', () => {
    const p = scene(
      [box('solid-1', 40, {}), box('hole-1', 20, {}, { role: 'hole' })],
      [{ op: 'subtract', children: ['solid-1', 'hole-1'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: true });
    expect(units.length).toBe(2);
    units.forEach((u) => expect(u.obj.primitive).toBe('box'));
  });

  it('CSG failure (hole engulfs the solid) → uncarved children, no throw', () => {
    const p = scene(
      [box('solid-1', 20, {}), box('hole-1', 80, {}, { role: 'hole' })],
      [{ op: 'subtract', children: ['solid-1', 'hole-1'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    // subtract of an engulfing hole is empty → CSG null → fallback to children.
    expect(units.length).toBe(2);
    units.forEach((u) => expect(u.obj.primitive).toBe('box'));
  });
});
