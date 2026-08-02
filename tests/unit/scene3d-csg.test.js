/**
 * Scene3D.CSG — BSP mesh-boolean invariants (box−box subtract, Increment 1).
 *
 * The BSP is adapted to the repo's INDEX mesh shape and welded via
 * Scene3D.Mesh.weldMesh. Its correctness is pinned by three exact facts that
 * survive the T-junctions any BSP boolean introduces on the cut seam:
 *
 *   1. CLOSED + CORRECTLY WOUND — the signed divergence-theorem volume is
 *      EXACTLY vol(A) − vol(A∩B). A gap would leak volume; an orientFace'd
 *      (concavity-flipped) winding would sum to the wrong value. This is the
 *      real "watertight" guarantee — stronger than edge-counting.
 *   2. NO NON-MANIFOLD EDGES — every undirected edge is shared by ≤ 2 faces
 *      (histogram keys ⊆ {1, 2}); the faces.length==1 entries are the benign
 *      cut-rim T-junctions the silhouette/crease passes skip, not open holes.
 *   3. WINDING PIN — a bore-wall normal points INTO the bore (toward the hole
 *      axis), i.e. INWARD relative to the object centroid. orientFace would
 *      flip it outward and empty/invert the hole; CSG output must NOT be
 *      orientFace'd. Guarded directly here.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D.CSG box−box subtract', () => {
  let runtime;
  let V;
  let CSG;
  let G3;
  let Mesh;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    CSG = V.Scene3D.CSG;
    G3 = V.Geometry3D;
    Mesh = V.Scene3D.Mesh;
  });

  afterAll(() => runtime.cleanup());

  // An axis-aligned 8-vertex / 6-quad box (outward-wound), optionally offset.
  const box = (sx, sy, sz, cx = 0, cy = 0, cz = 0) => {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const vertices = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map(([x, y, z]) => ({ x: x + cx, y: y + cy, z: z + cz }));
    const faces = [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3],
    ];
    return { vertices, faces };
  };

  const edgeHistogram = (mesh) => {
    const h = {};
    G3.collectEdges(mesh.faces).forEach((e) => { h[e.faces.length] = (h[e.faces.length] || 0) + 1; });
    return h;
  };

  it('carves a through hole: correct closed volume + no non-manifold edges', () => {
    const A = box(40, 40, 40);
    const B = box(20, 20, 60); // spans z past both faces → through hole
    const r = CSG.subtract(A, B);
    expect(r).toBeTruthy();
    expect(r.faces.length).toBeGreaterThan(0);
    // CLOSED + CORRECTLY WOUND: exact volume = box − prism through it.
    expect(CSG.meshVolume(r)).toBeCloseTo(40 * 40 * 40 - 20 * 20 * 40, 5);
    // NO NON-MANIFOLD EDGES (T-junctions on the rim are allowed = key '1').
    const h = edgeHistogram(r);
    expect(Object.keys(h).every((k) => k === '1' || k === '2')).toBe(true);
  });

  it('carves a blind pocket: exact volume (floor kept)', () => {
    const A = box(40, 40, 40);
    const B = box(20, 20, 30, 0, 0, 15); // opens on +Z, floor at z=0
    const r = CSG.subtract(A, B);
    expect(r).toBeTruthy();
    // Removes the 20×20×20 slab z∈[0,20]; the pocket floor + walls remain.
    expect(CSG.meshVolume(r)).toBeCloseTo(40 * 40 * 40 - 20 * 20 * 20, 5);
    const h = edgeHistogram(r);
    expect(Object.keys(h).every((k) => k === '1' || k === '2')).toBe(true);
  });

  it('WINDING PIN: a bore-wall normal points inward (NOT orientFace-outward)', () => {
    const A = box(40, 40, 40);
    const B = box(20, 20, 60);
    const r = CSG.subtract(A, B);
    // Faces lying entirely on the x = +10 bore wall.
    const wall = r.faces
      .map((f) => f.map((i) => r.vertices[i]))
      .filter((pts) => pts.every((p) => Math.abs(p.x - 10) < 1e-4));
    expect(wall.length).toBeGreaterThan(0);
    wall.forEach((pts) => {
      const n = G3.faceNormal(pts);
      // BSP winding: normal points toward −x (into the bore / hole axis).
      expect(n.x).toBeLessThan(-0.5);
      // orientFace would force normal·centroid > 0 → normal.x > 0 (outward). The
      // CSG output is the OPPOSITE, proving orientFace was not applied.
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      expect(n.x * cx).toBeLessThan(0); // inward: normal opposes centroid offset
      // Sanity: Mesh.orientFace really would flip this wall the wrong way.
      const oriented = Mesh.orientFace([0, 1, 2], pts);
      const flipped = G3.faceNormal(oriented.map((i) => pts[i]));
      expect(flipped.x).toBeGreaterThan(0.5);
    });
  });

  it('is deterministic: two runs are byte-identical', () => {
    const A = box(40, 40, 40);
    const B = box(20, 20, 60);
    const a = CSG.subtract(A, B);
    const b = CSG.subtract(A, B);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('non-overlapping subtract preserves the original solid (volume + bbox)', () => {
    const A = box(40, 40, 40);
    const B = box(10, 10, 10, 200, 0, 0); // fully disjoint
    const r = CSG.subtract(A, B);
    expect(r).toBeTruthy();
    expect(CSG.meshVolume(r)).toBeCloseTo(40 * 40 * 40, 5);
    const bbox = (m) => {
      const xs = m.vertices.map((p) => p.x);
      const ys = m.vertices.map((p) => p.y);
      const zs = m.vertices.map((p) => p.z);
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    };
    expect(bbox(r)).toEqual([-20, 20, -20, 20, -20, 20]);
  });

  it('empty / degenerate results return null (graceful fallback)', () => {
    const A = box(20, 20, 20);
    const B = box(60, 60, 60); // engulfs A → A − B is empty
    expect(CSG.subtract(A, B)).toBeNull();
    // Garbage / too-small inputs never throw.
    expect(CSG.subtract({ vertices: [], faces: [] }, box(10, 10, 10))).toBeNull();
    expect(CSG.subtract(null, box(10, 10, 10))).toBeNull();
  });

  it('welds coincident vertices + drops repeated-index degenerates', () => {
    const A = box(40, 40, 40);
    const B = box(20, 20, 60);
    const r = CSG.subtract(A, B);
    // No face keeps a repeated index (weld de-fan invariant).
    r.faces.forEach((f) => { expect(new Set(f).size).toBe(f.length); });
    // Every face index is in range.
    r.faces.forEach((f) => f.forEach((i) => expect(r.vertices[i]).toBeTruthy()));
  });
});
