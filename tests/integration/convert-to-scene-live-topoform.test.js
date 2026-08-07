const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Convert-to-Scene — Increment I4 (live topoform).
 *
 * A parametric topoform (renderMode wireframe / triangleMesh) converts to a LIVE
 * object3d of the matching chart primitive, so the shared compositor re-evaluates
 * Scene3D.Mesh.createTopoformMesh from its sizes/detail instead of freezing an
 * importedMesh bake. Each topoform sourceMode maps to the object3d primitive whose
 * chart mode matches AND whose sizes read sx/sy/sz independently:
 *   sphere / ellipsoid → `ellipsoid` (chart 'sphere' with true semi-axes),
 *   cylinder/cone/torus/torusKnot/capsule/superellipsoid/pyramid → name-for-name.
 * `cube` (no chart analog — object3d `box` is an 8-vert box) and `stlMesh`
 * (imported) keep the I1 importedMesh bake. `contours` still BLOCKS (I5).
 *
 * RGR — before I4 convertAlgoToScene ALWAYS emitted solidType:'importedMesh' for a
 * topoform, so proofs (a)/(b)/(e) fail on the base branch (the child was a frozen
 * bake, not a live parametric chart object).
 */

describe('Convert-to-Scene I4 — parametric topoform converts to a LIVE chart object', () => {
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

  const buildMesh = (obj) => V.Scene3D.Scene.buildPrimitiveMesh(obj);

  // ── (a) a wireframe topoform converts to a LIVE `ellipsoid` chart object whose
  //        rendered mesh equals the pre-I4 bakeMesh (geometry parity). ──────────
  test('(a) live topoform geometry == the frozen importedMesh bake it replaces', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'wireframe';
    src.params.sourceMode = 'sphere';

    // Pre-I4 reference — the fully-built index mesh the bake path froze.
    const baked = V.Algorithms.topoform.bakeMesh(src.params);
    expect(baked.vertices.length).toBeGreaterThan(0);

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);

    const child = childOf(engine, result.groupId);
    // A LIVE parametric chart object — NOT a frozen importedMesh bake.
    expect(child.params.primitive).toBe('ellipsoid');
    expect(child.params.params.solidType).toBeUndefined();
    expect(child.params.params.importedMesh).toBeUndefined();
    // 'hatch' mapper — the pre-I4 (I1) bake's own mapper; the scene 'wireframe'
    // mapper is intractable at the topoform's native density (see engine.js).
    expect(child.params.style.mapper).toBe('hatch');

    // Geometry parity — building the scene chart mesh from the live params
    // reproduces bakeMesh exactly (same createTopoformMesh(mode, sizes, detail)).
    const live = buildMesh({ primitive: child.params.primitive, params: child.params.params });
    expect(live.faces).toEqual(baked.faces);
    expect(live.vertices.length).toBe(baked.vertices.length);
    live.vertices.forEach((vt, i) => {
      expect(vt.x).toBeCloseTo(baked.vertices[i].x, 6);
      expect(vt.y).toBeCloseTo(baked.vertices[i].y, 6);
      expect(vt.z).toBeCloseTo(baked.vertices[i].z, 6);
    });

    // It renders through the compositor, lit by the seeded light on the ground.
    const kids = engine.getLayerDescendants(result.groupId);
    expect(kids.some((l) => l.type === 'sceneLight3d')).toBe(true);
    expect(kids.some((l) => l.type === 'sceneGround3d')).toBe(true);
    engine.computeAllDisplayGeometry();
    expect(engine.getLayerById(result.groupId).scenePaths.length).toBeGreaterThan(0);
  });

  // ── (b) editing a topoform param on the converted object changes geometry. ───
  test('(b) editing size / detail on the converted object re-evaluates the mesh', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'wireframe';
    src.params.sourceMode = 'ellipsoid';
    src.params.primitiveDetail = 24; // keep the internal compose light

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);

    const before = buildMesh({ primitive: child.params.primitive, params: child.params.params });

    // Non-uniform stretch — same vert count, verts move (independent sx axis).
    child.params.params.sx *= 1.6;
    const stretched = buildMesh({ primitive: child.params.primitive, params: child.params.params });
    expect(stretched.vertices.length).toBe(before.vertices.length);
    const moved = stretched.vertices.some((vt, i) => Math.abs(vt.x - before.vertices[i].x) > 1e-6);
    expect(moved).toBe(true);

    // Higher fidelity — more rows ⇒ more vertices (a fresh chart tessellation).
    child.params.params.sx = before.vertices.length; // reset stretch is irrelevant to count
    child.params.params.detail = (child.params.params.detail || 16) + 10;
    const finer = buildMesh({ primitive: child.params.primitive, params: child.params.params });
    expect(finer.vertices.length).toBeGreaterThan(before.vertices.length);

    // Still composes to non-empty paths through the engine.
    engine.computeAllDisplayGeometry();
    expect(engine.getLayerById(result.groupId).scenePaths.length).toBeGreaterThan(0);
  });

  // ── (c) a stlMesh / imported topoform still uses the importedMesh bake. ───────
  test('(c) an STL/imported topoform still uses the importedMesh bake', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'wireframe';
    src.params.sourceMode = 'stlMesh';
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
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('importedMesh');
    expect(child.params.params.importedMesh.vertices.length).toBeGreaterThan(0);
  });

  // ── (c2) a `cube` topoform has no chart analog — also the importedMesh bake. ──
  test('(c2) a cube topoform (no chart analog) uses the importedMesh bake', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'triangleMesh';
    src.params.sourceMode = 'cube';

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('importedMesh');
  });

  // ── (d) contours converts to a live contourSlice object (CtS I5). ────────────
  // The block was removed in I5: the surface mesh bakes as a live chart just like
  // wireframe/triangleMesh, but the child is styled with the depth-slice mapper
  // so the compositor renders it as cross-sections.
  test('(d) topoform contours converts to a live contourSlice object', () => {
    const engine = freshEngine();
    const id = engine.addLayer('topoform');
    const src = engine.getLayerById(id);
    src.params.renderMode = 'contours';
    src.params.sourceMode = 'sphere';

    const result = engine.convertAlgoToScene(id);
    expect(result.ok).toBe(true);
    const child = childOf(engine, result.groupId);
    // Same live-chart surface mesh every other mode bakes …
    expect(child.params.primitive).toBe('ellipsoid');
    expect(child.params.params.importedMesh).toBeUndefined();
    // … styled as depth slices.
    expect(child.params.style.mapper).toBe('contourSlice');
  });

  // ── (e) every mappable sourceMode → its chart primitive, byte-identical mesh. ─
  const CASES = [
    ['sphere', 'ellipsoid'],
    ['ellipsoid', 'ellipsoid'],
    ['cylinder', 'cylinder'],
    ['cone', 'cone'],
    ['torus', 'torus'],
    ['torusKnot', 'torusKnot'],
    ['capsule', 'capsule'],
    ['superellipsoid', 'superellipsoid'],
    ['pyramid', 'pyramid'],
  ];
  CASES.forEach(([sourceMode, primitive]) => {
    test(`(e) ${sourceMode} → live ${primitive}, mesh == bake`, () => {
      const engine = freshEngine();
      const id = engine.addLayer('topoform');
      const src = engine.getLayerById(id);
      src.params.renderMode = 'wireframe';
      src.params.sourceMode = sourceMode;
      src.params.primitiveDetail = 20; // keep the convert's internal compose light

      const baked = V.Algorithms.topoform.bakeMesh(src.params);
      const result = engine.convertAlgoToScene(id);
      expect(result.ok).toBe(true);
      const child = childOf(engine, result.groupId);
      expect(child.params.primitive).toBe(primitive);
      expect(child.params.params.importedMesh).toBeUndefined();

      const live = buildMesh({ primitive: child.params.primitive, params: child.params.params });
      expect(live.vertices.length).toBe(baked.vertices.length);
      expect(live.faces).toEqual(baked.faces);
      live.vertices.forEach((vt, i) => {
        expect(vt.x).toBeCloseTo(baked.vertices[i].x, 6);
        expect(vt.y).toBeCloseTo(baked.vertices[i].y, 6);
        expect(vt.z).toBeCloseTo(baked.vertices[i].z, 6);
      });
    });
  });
});
