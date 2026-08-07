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
 *
 * Increment I2 amended (a)/(b): a parametric polyhedron now converts to a LIVE
 * `solid` object (solidType + deformer params) instead of a frozen importedMesh
 * bake. Increment I4 amended (c): a parametric topoform (wireframe/triangleMesh)
 * now converts to a LIVE chart primitive — see convert-to-scene-live-topoform.js
 * for the full I4 contract. STL/importedMesh-sourced polyhedra + `cube`/`stlMesh`
 * topoforms keep the bake path; topoform `contours` still blocks (d).
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

  // ── (a) polyhedron → scene group with one LIVE `solid` child (I2) that
  //        re-evaluates its deformers, and it renders. ──────────────────────
  test('(a) polyhedron converts to a scene group whose child is a live solid and renders', () => {
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

    // Exactly one object3d child — a LIVE parametric solid (I2), NOT a frozen
    // importedMesh bake. It carries the polyhedron's solidType + deformer params.
    const kids = engine.getLayerDescendants(group.id);
    const objects = kids.filter((l) => l.type === 'object3d');
    expect(objects.length).toBe(1);
    const child = objects[0];
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('buckyball');
    expect(child.params.params.importedMesh).toBeUndefined();
    // Deformer params copied straight off the source layer.
    expect(child.params.params.expand).toBe(Number(src.params.expand));
    expect(child.params.params.twist).toBe(Number(src.params.twist || 0));
    expect(child.params.params.explode).toBe(Number(src.params.explode || 0));

    // Geometry parity — building the scene mesh from the live params reproduces
    // the I1 bake exactly (createSolidMesh + applyDeformers == bakeMesh).
    const live = V.Scene3D.Scene.buildPrimitiveMesh(
      { primitive: 'solid', params: child.params.params });
    expect(live.vertices.length).toBe(baked.vertices.length);
    live.vertices.forEach((vt, i) => {
      expect(vt.x).toBeCloseTo(baked.vertices[i].x, 6);
      expect(vt.y).toBeCloseTo(baked.vertices[i].y, 6);
      expect(vt.z).toBeCloseTo(baked.vertices[i].z, 6);
    });

    // A light + ground child were seeded.
    expect(kids.some((l) => l.type === 'sceneLight3d')).toBe(true);
    expect(kids.some((l) => l.type === 'sceneGround3d')).toBe(true);

    // It renders through the compositor (non-empty composed paths).
    engine.computeAllDisplayGeometry();
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── (b) a DEFORMED polyhedron converts to a live solid carrying the
  //        deformer params, and the scene mesh reflects the deformation. ─────
  test('(b) polyhedron deformers (twist/explode) ride the live solid params', () => {
    const engine = freshEngine();
    const id = engine.addLayer('polyhedron');
    const src = engine.getLayerById(id);
    src.params.solidType = 'cube';

    const base = V.Algorithms.polyhedron.bakeMesh({ ...src.params, twist: 0, explode: 0, shard: 0 });

    // Per-face deformer (explode) shatters into per-face polygons — more verts.
    const exploded = V.Algorithms.polyhedron.bakeMesh({ ...src.params, explode: 40 });
    expect(exploded.vertices.length).toBeGreaterThan(base.vertices.length);

    // The converted child carries the deformer param LIVE (not a baked mesh) …
    src.params.explode = 40;
    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = engine.getLayerDescendants(result.groupId).find((l) => l.type === 'object3d');
    expect(child.params.params.solidType).toBe('cube');
    expect(child.params.params.importedMesh).toBeUndefined();
    expect(child.params.params.explode).toBe(40);

    // … and building the scene mesh re-evaluates it (exploded vert count).
    const live = V.Scene3D.Scene.buildPrimitiveMesh(
      { primitive: 'solid', params: child.params.params });
    expect(live.vertices.length).toBe(exploded.vertices.length);
    expect(live.vertices.length).toBeGreaterThan(base.vertices.length);
  });

  // ── (c) topoform wireframe / triangle convert to a LIVE chart object (I4). ──
  ['wireframe', 'triangleMesh'].forEach((renderMode) => {
    test(`(c) topoform ${renderMode} converts to a live rendering scene object`, () => {
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
      // I4 — a parametric topoform is now a LIVE chart primitive, not a frozen bake.
      expect(child.params.primitive).toBe('ellipsoid');
      expect(child.params.params.solidType).toBeUndefined();
      expect(child.params.params.importedMesh).toBeUndefined();

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
