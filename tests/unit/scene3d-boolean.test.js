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

  // ── Increment 3 — union / intersect / nesting. ───────────────────────────────
  const CSG = () => V.Scene3D.CSG;

  it('union group collapses to ONE combined unit whose volume is the union', () => {
    const p = scene(
      [box('a', 40, {}), box('b', 40, { x: 20 })], // overlap 20·40·40 = 32000
      [{ id: 'grp-1', op: 'union', children: ['a', 'b'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(1);
    const u = units[0];
    expect(u.obj.primitive).toBe('csg');
    expect(u.obj.id).toBe('a');              // primary solid (first child)
    expect(u.meshData.csgFaceted).toBe(true); // both boxes faceted
    expect(CSG().meshVolume(u.meshData)).toBeCloseTo(64000 + 64000 - 32000, 3);
  });

  it('intersect group yields only the overlap volume', () => {
    const p = scene(
      [box('a', 40, {}), box('b', 40, { x: 20 })],
      [{ id: 'grp-1', op: 'intersect', children: ['a', 'b'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(1);
    expect(CSG().meshVolume(units[0].meshData)).toBeCloseTo(20 * 40 * 40, 3);
  });

  it('changing op subtract→intersect changes the resolved volume', () => {
    const objs = () => [box('a', 40, {}), box('b', 40, { x: 20 })];
    const sub = Boolean3D.resolveAssembly(
      scene(objs(), [{ id: 'g', op: 'subtract', children: ['a', 'b'] }]), 1, {});
    const inter = Boolean3D.resolveAssembly(
      scene(objs(), [{ id: 'g', op: 'intersect', children: ['a', 'b'] }]), 1, {});
    // subtract a−b = 64000 − 32000 = 32000 as well, so compare bboxes not volume.
    const bx = (u) => Math.min(...u.meshData.vertices.map((q) => q.x));
    expect(bx(sub[0])).toBeCloseTo(-20, 3);   // keeps a's far −x wall
    expect(bx(inter[0])).toBeCloseTo(0, 3);    // overlap starts at x=0
  });

  it('NESTED group resolves depth-first: (a ∪ b) − hole', () => {
    // Inner union of two overlapping boxes; outer subtract carves a hole out of it.
    const p = scene(
      [box('a', 40, {}), box('b', 40, { x: 20 }), box('h', 10, { x: 10 }, { role: 'hole', params: { sx: 10, sy: 10, sz: 80 } })],
      [
        { id: 'inner', op: 'union', children: ['a', 'b'] },
        { id: 'outer', op: 'subtract', children: ['inner', 'h'] },
      ],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(1);
    const u = units[0];
    expect(u.obj.primitive).toBe('csg');
    // union volume minus a 10×10×40 through-bore = (96000) − 4000.
    expect(CSG().meshVolume(u.meshData)).toBeCloseTo(96000 - 10 * 10 * 40, 2);
  });

  it('curved subtract (box − cylinder) is csgFaceted:false and closed-by-volume', () => {
    const cyl = {
      id: 'bore', name: 'bore', primitive: 'cylinder',
      params: { sx: 12, sy: 60, sz: 12, detail: 48 }, // tall, over-detailed → capped to 16
      transform: { x: 0, y: 0, z: 0, yaw: 90, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', role: 'hole',
    };
    const p = scene(
      [box('slab', 40, {}), cyl],
      [{ id: 'g', op: 'subtract', children: ['slab', 'bore'] }],
    );
    const units = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(units.length).toBe(1);
    const u = units[0];
    expect(u.obj.primitive).toBe('csg');
    expect(u.meshData.csgFaceted).toBe(false); // a curved child → continuous path
    // Closed by volume within a tessellation tolerance: box (64000) minus a
    // 16-gon bore of the tall cylinder. The signed divergence-theorem volume of
    // an OPEN or mis-wound mesh would diverge far past tolerance.
    const vol = CSG().meshVolume(u.meshData);
    expect(vol).toBeGreaterThan(64000 * 0.7);
    expect(vol).toBeLessThan(64000);
    // Deterministic.
    const again = Boolean3D.resolveAssembly(p, 1, { draft: false })[0];
    expect(JSON.stringify(again.meshData)).toBe(JSON.stringify(u.meshData));
  });

  it('triangle-budget overrun falls back to uncarved children (no throw)', () => {
    const cyl = (id, extra) => ({
      id, name: id, primitive: 'cylinder',
      params: { sx: 20, sy: 40, sz: 20, detail: 16 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', ...extra,
    });
    const p = scene(
      [cyl('slab'), cyl('bore', { role: 'hole', params: { sx: 10, sy: 60, sz: 10, detail: 16 } })],
      [{ id: 'g', op: 'subtract', children: ['slab', 'bore'] }],
    );
    // Under the real budget the curved pair carves fine (a csg unit).
    const carved = Boolean3D.resolveAssembly(p, 1, { draft: false });
    expect(carved.length).toBe(1);
    expect(carved[0].obj.primitive).toBe('csg');

    // Pin the budget to 1 triangle: the FIRST child already overruns → the whole
    // group falls back to uncarved children, no throw.
    const orig = Boolean3D.CONFIG.maxTriangles;
    Boolean3D.CONFIG.maxTriangles = 1;
    try {
      const fallback = Boolean3D.resolveAssembly(p, 1, { draft: false });
      expect(fallback.length).toBe(2);
      fallback.forEach((u) => expect(u.obj.primitive).toBe('cylinder'));
    } finally {
      Boolean3D.CONFIG.maxTriangles = orig;
    }
  });

  // ── Per-fragment by-face styling (faceStyleOverrides). ───────────────────────
  // A carved CSG unit borrows the PRIMARY solid's identity, so every fragment
  // resolves against the primary by default. `faceStyleOverrides` re-attributes
  // each output fragment to its ORIGINATING object + face where that differs
  // from the primary baseline — a solid's surviving per-face style survives the
  // carve, a hole's cut walls read as the solid's interior, and a unioned
  // sibling keeps its own per-object style. Gated: identical-to-baseline
  // fragments emit NO override, so a uniform-style unit is byte-identical.
  const styleA = { penId: 'pen-A', mapper: 'none', params: {} };
  const styleB = { penId: 'pen-B', mapper: 'none', params: {} };
  const styledScene = (objects, groups, styleTable) => Params.normalizeParams({
    sceneVersion: 1, objects, groups, lights: [], camera: {}, styleTable,
  });
  // A blind pocket: a 20×20 square bored into the +Z face to depth 15 — the +Z
  // face survives as a rim (a set of fragments), the pocket floor + walls are
  // new cut walls.
  const pocketHole = {
    id: 'hole-1', name: 'hole-1', primitive: 'box',
    params: { sx: 20, sy: 20, sz: 30 },
    transform: { x: 0, y: 0, z: 20, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'hole',
  };

  it('carved solid keeps its per-face style B; cut walls read as the solid (style A)', () => {
    const p = styledScene(
      [box('solid-1', 40, {}), pocketHole],
      [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'] }],
      { byObject: { 'solid-1': styleA }, byFace: { 'solid-1/face:+Z': styleB } },
    );
    const u = Boolean3D.resolveAssembly(p, 1, { draft: false })[0];
    const ov = u.meshData.faceStyleOverrides;
    expect(ov).toBeTruthy();
    const pens = Object.values(ov).map((s) => s.penId);
    // The surviving +Z rim carries style B.
    expect(pens).toContain('pen-B');
    // Style A == baseline (primary byObject) == cut-wall attribution, so it is
    // NEVER emitted as an override — it is the un-overridden default.
    expect(pens).not.toContain('pen-A');
    Object.keys(ov).forEach((k) => expect(k).toMatch(/^face:csg:\d+$/));
  });

  it('UNION of two solids with different per-object styles keeps each source style', () => {
    const p = styledScene(
      [box('a', 40, {}), box('b', 40, { x: 20 })],
      [{ id: 'g', op: 'union', children: ['a', 'b'] }],
      { byObject: { a: styleA, b: styleB } },
    );
    const ov = Boolean3D.resolveAssembly(p, 1, { draft: false })[0].meshData.faceStyleOverrides;
    expect(ov).toBeTruthy();
    const pens = new Set(Object.values(ov).map((s) => s.penId));
    expect(pens.has('pen-B')).toBe(true);  // b ≠ baseline(a) → overridden to B
    expect(pens.has('pen-A')).toBe(false); // a == baseline → left un-overridden
  });

  it('REGRESSION: a uniform-style carve emits NO overrides + byte-identical geometry', () => {
    const objs = () => [box('solid-1', 40, {}), pocketHole];
    const grps = () => [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'] }];
    const styled = Boolean3D.resolveAssembly(
      styledScene(objs(), grps(), { byObject: { 'solid-1': styleA } }), 1, {})[0];
    const bare = Boolean3D.resolveAssembly(
      Params.normalizeParams({ sceneVersion: 1, objects: objs(), groups: grps(), lights: [], camera: {} }), 1, {})[0];
    expect(styled.meshData.faceStyleOverrides).toBeUndefined();
    // Geometry + faceIds identical to the un-styled carve (no new keys, no drift).
    expect(JSON.stringify(styled.meshData)).toBe(JSON.stringify(bare.meshData));
  });

  it('faceStyleOverrides are deterministic', () => {
    const mk = () => styledScene(
      [box('solid-1', 40, {}), pocketHole],
      [{ id: 'grp-1', op: 'subtract', children: ['solid-1', 'hole-1'] }],
      { byObject: { 'solid-1': styleA }, byFace: { 'solid-1/face:+Z': styleB } });
    const a = Boolean3D.resolveAssembly(mk(), 1, {})[0].meshData;
    const b = Boolean3D.resolveAssembly(mk(), 1, {})[0].meshData;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
