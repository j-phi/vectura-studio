const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Convert-to-Scene — Increment I2 (live solid).
 *
 * A parametric (non-STL) polyhedron converts to a LIVE `solid` object3d carrying
 * its solidType + deformer params, so the shared compositor re-evaluates the
 * deformers (Scene3D.Mesh.createSolidMesh + applyPolyhedronDeformers) instead of
 * freezing them into an importedMesh. A polyhedron whose source is already an
 * STL/importedMesh keeps the I1 importedMesh bake. (A parametric topoform got its
 * own live chart path in I4 — see convert-to-scene-live-topoform.test.js.)
 *
 * RGR — before I2 convertAlgoToScene ALWAYS emitted solidType:'importedMesh' for
 * a polyhedron, so proofs (a)/(b) below fail on the base branch (the child was a
 * frozen bake, not a live parametric solid).
 */

describe('Convert-to-Scene I2 — parametric polyhedron converts to a LIVE solid', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const freshEngine = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    return engine;
  };

  const childOf = (engine, groupId) =>
    engine.getLayerDescendants(groupId).find((l) => l.type === 'object3d');

  const buildMesh = (params) =>
    V.Scene3D.Scene.buildPrimitiveMesh({ primitive: 'solid', params });

  // ── (a) an undeformed converted polyhedron produces a live solid whose
  //        rendered mesh equals the pre-I2 importedMesh bake (geometry parity).
  test('(a) live solid geometry == the frozen importedMesh bake it replaces', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.params.solidType = 'icosahedron';

    // Reproduce the I1 frozen bake object: unit-normalize the baked mesh, radius
    // carries the size — exactly what convertAlgoToScene did before I2.
    const baked = V.Algorithms.polyhedron.bakeMesh(src.params);
    let maxExtent = 0;
    baked.vertices.forEach((vt) => {
      const d = Math.hypot(vt.x, vt.y, vt.z);
      if (d > maxExtent) maxExtent = d;
    });
    const radius = maxExtent > 1e-6 ? maxExtent : 1;
    const frozenMesh = buildMesh({
      solidType: 'importedMesh',
      radius,
      importedMesh: {
        vertices: baked.vertices.map((vt) => ({ x: vt.x / radius, y: vt.y / radius, z: vt.z / radius })),
        faces: baked.faces.map((f) => f.slice()),
      },
    });

    // Now convert for real — the child is a live parametric solid.
    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);
    expect(child.params.params.solidType).toBe('icosahedron');
    expect(child.params.params.importedMesh).toBeUndefined();

    const liveMesh = buildMesh(child.params.params);
    expect(liveMesh.faces).toEqual(frozenMesh.faces);
    expect(liveMesh.vertices.length).toBe(frozenMesh.vertices.length);
    liveMesh.vertices.forEach((vt, i) => {
      expect(vt.x).toBeCloseTo(frozenMesh.vertices[i].x, 6);
      expect(vt.y).toBeCloseTo(frozenMesh.vertices[i].y, 6);
      expect(vt.z).toBeCloseTo(frozenMesh.vertices[i].z, 6);
    });
  });

  // ── (b) editing a deformer param on the converted object changes the
  //        geometry (LIVE, not frozen). ─────────────────────────────────────
  test('(b) editing a deformer param on the converted solid re-evaluates the mesh', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.params.solidType = 'cube';

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);

    // Undeformed baseline mesh.
    const before = buildMesh(child.params.params);

    // Vertex-level deformer (twist) — moves shared vertices, same count.
    child.params.params.twist = 55;
    const twisted = buildMesh(child.params.params);
    expect(twisted.vertices.length).toBe(before.vertices.length);
    const twistMoved = twisted.vertices.some((vt, i) =>
      Math.abs(vt.x - before.vertices[i].x) > 1e-6 || Math.abs(vt.y - before.vertices[i].y) > 1e-6);
    expect(twistMoved).toBe(true);

    // Per-face deformer (explode) — shatters into per-face polygons, more verts.
    child.params.params.twist = 0;
    child.params.params.explode = 30;
    const exploded = buildMesh(child.params.params);
    expect(exploded.vertices.length).toBeGreaterThan(before.vertices.length);

    // And it still composes to non-empty paths through the engine.
    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(result.groupId);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── (c) STL/importedMesh-sourced polyhedra keep the bake. (A parametric
  //        topoform now rides its OWN live chart path — I4; see
  //        convert-to-scene-live-topoform.test.js.) ─────────────────────────
  test('(c1) a parametric topoform convert now rides the LIVE chart path (I4)', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'wireframe';
    src.params.sourceMode = 'sphere';

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);
    expect(child.params.primitive).toBe('ellipsoid');
    expect(child.params.params.solidType).toBeUndefined();
    expect(child.params.params.importedMesh).toBeUndefined();
  });

  test('(c2) an STL/importedMesh-sourced polyhedron still uses the importedMesh bake', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    // Emulate an imported/STL solid: a unit tetrahedron carried on the layer.
    src.params.solidType = 'importedMesh';
    src.params.radius = 40;
    src.params.importedMesh = {
      vertices: [
        { x: 1, y: 1, z: 1 }, { x: -1, y: -1, z: 1 },
        { x: -1, y: 1, z: -1 }, { x: 1, y: -1, z: -1 },
      ],
      faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    };

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);
    expect(child.params.params.solidType).toBe('importedMesh');
    expect(child.params.params.importedMesh).toBeDefined();
    expect(child.params.params.importedMesh.vertices.length).toBeGreaterThan(0);
  });
});
