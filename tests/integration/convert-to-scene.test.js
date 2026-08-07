const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Convert-to-Scene — Increment I1 (universal bake convert + affordance + block).
 *
 * engine.convertAlgoToScene(layerId) turns a STANDALONE polyhedron/topoform
 * layer into a scene TREE: a scene group + ONE object3d child carrying the
 * FULLY-BUILT (deformed) index mesh on the solid/importedMesh path, seeded with
 * a light + ground so the shared compositor lights/occludes/shadows it. The
 * topoform `contours` render mode is BLOCKED (no scene analog yet) — no bake,
 * no scene group, a user-facing message instead.
 *
 * RGR — convertAlgoToScene + the algorithm bakers + the scene.js importedMesh
 * passthrough do not exist before I1, so this file fails on the base branch.
 */

describe('Convert-to-Scene I1 — bake a standalone 3D layer into a scene tree', () => {
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

  const sceneGroups = (engine) =>
    engine.layers.filter((l) => l && l.type === 'scene3d' && l.isGroup);

  // ── (a) polyhedron → scene group with one solid/importedMesh child that
  //        carries the polyhedron's built mesh, and it renders. ──────────────
  test('(a) polyhedron converts to a scene group whose child holds the built mesh and renders', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.params.solidType = 'buckyball';

    const baked = V.Algorithms.polyhedron.bakeMesh(src.params);
    expect(baked.vertices.length).toBeGreaterThan(0);
    expect(baked.faces.length).toBeGreaterThan(0);

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);

    // The standalone layer is gone; exactly one scene group replaces it.
    expect(engine.getLayerById(id)).toBeFalsy();
    const groups = sceneGroups(engine);
    expect(groups.length).toBe(1);
    const group = groups[0];
    expect(group.id).toBe(result.groupId);

    // Exactly one object3d child, a solid/importedMesh leaf.
    const kids = engine.getLayerDescendants(group.id);
    const objects = kids.filter((l) => l.type === 'object3d');
    expect(objects.length).toBe(1);
    const child = objects[0];
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('importedMesh');

    // The child mesh == the polyhedron's built mesh (unit verts * radius).
    const im = child.params.params.importedMesh;
    const radius = child.params.params.radius;
    expect(im.faces).toEqual(baked.faces);
    expect(im.vertices.length).toBe(baked.vertices.length);
    im.vertices.forEach((vt, i) => {
      expect(vt.x * radius).toBeCloseTo(baked.vertices[i].x, 4);
      expect(vt.y * radius).toBeCloseTo(baked.vertices[i].y, 4);
      expect(vt.z * radius).toBeCloseTo(baked.vertices[i].z, 4);
    });

    // A light + ground child were seeded.
    expect(kids.some((l) => l.type === 'sceneLight3d')).toBe(true);
    expect(kids.some((l) => l.type === 'sceneGround3d')).toBe(true);

    // It renders through the compositor (non-empty composed paths).
    engine.computeAllDisplayGeometry();
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── (b) a DEFORMED polyhedron bakes the deformed mesh, not the base. ───────
  test('(b) polyhedron deformers (twist/explode) bake into the mesh', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.params.solidType = 'cube';

    const base = V.Algorithms.polyhedron.bakeMesh({ ...src.params, twist: 0, explode: 0, shard: 0 });

    // Vertex-level deformer (twist) moves shared vertices.
    const twisted = V.Algorithms.polyhedron.bakeMesh({ ...src.params, twist: 60 });
    expect(twisted.vertices.length).toBe(base.vertices.length);
    const twistMoved = twisted.vertices.some((vt, i) =>
      Math.abs(vt.x - base.vertices[i].x) > 1e-6 || Math.abs(vt.y - base.vertices[i].y) > 1e-6);
    expect(twistMoved).toBe(true);

    // Per-face deformer (explode) shatters into per-face polygons — more verts.
    const exploded = V.Algorithms.polyhedron.bakeMesh({ ...src.params, explode: 40 });
    expect(exploded.vertices.length).toBeGreaterThan(base.vertices.length);

    // And the converted child carries the deformed (not base) mesh.
    src.params.explode = 40;
    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = engine.getLayerDescendants(result.groupId).find((l) => l.type === 'object3d');
    expect(child.params.params.importedMesh.vertices.length).toBe(exploded.vertices.length);
  });

  // ── (c) topoform wireframe / triangle convert renders. ─────────────────────
  ['wireframe', 'triangleMesh'].forEach((renderMode) => {
    test(`(c) topoform ${renderMode} converts to a rendering scene object`, () => {
      const engine = freshEngine();
      const id = engine.addLayer('topoform');
      const src = engine.getLayerById(id);
      src.params.renderMode = renderMode;
      src.params.sourceMode = 'sphere';

      const result = engine.convertAlgoToScene(id);
      expect(result.ok).toBe(true);
      const group = engine.getLayerById(result.groupId);
      expect(group.type).toBe('scene3d');
      const child = engine.getLayerDescendants(group.id).find((l) => l.type === 'object3d');
      expect(child.params.params.solidType).toBe('importedMesh');
      expect(child.params.params.importedMesh.vertices.length).toBeGreaterThan(0);

      engine.computeAllDisplayGeometry();
      expect(group.scenePaths.length).toBeGreaterThan(0);
    });
  });

  // ── (d) topoform contours is BLOCKED — no bake, no scene group, a message. ─
  test('(d) topoform contours mode is blocked (no scene group created)', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'contours';

    const before = engine.layers.length;
    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contours');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);

    // The source layer survives; no scene group was created.
    expect(engine.getLayerById(id)).toBeTruthy();
    expect(sceneGroups(engine).length).toBe(0);
    expect(engine.layers.length).toBe(before);
  });

  // The default (unset renderMode) is contours too — also blocked.
  test('(d2) topoform with an unset renderMode blocks (defaults to contours)', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    delete src.params.renderMode;

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('contours');
    expect(sceneGroups(engine).length).toBe(0);
  });

  // ── (e) the source pen/style is carried onto the child. ────────────────────
  test('(e) the source layer pen/style migrates onto the child object', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.penId = 'pen-3';
    src.color = '#abcdef';
    src.strokeWidth = 0.7;

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = engine.getLayerDescendants(result.groupId).find((l) => l.type === 'object3d');
    expect(child.params.style.penId).toBe('pen-3');
    expect(child.penId).toBe('pen-3');
    expect(child.color).toBe('#abcdef');
    expect(child.strokeWidth).toBeCloseTo(0.7, 6);
  });

  // ── (f) non-convertible layer types are rejected. ──────────────────────────
  test('(f) a non-polyhedron/topoform layer is rejected as unsupported', () => {
    const engine = freshEngine();
    const id = engine.addLayer('flowfield');
    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(sceneGroups(engine).length).toBe(0);
  });
});
