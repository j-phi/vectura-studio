/**
 * A freshly INSERTED 3D scene must arrive with real ink on the object itself.
 *
 * WHY THIS TEST DRIVES THE INSERT PATH AND NOT `generate()`
 * --------------------------------------------------------
 * A scene default has four possible origins (CLAUDE.md § "Where a default
 * actually comes from"): the algorithm's own `finite(p.x, <literal>)` fallback,
 * `ALGO_DEFAULTS`, the factory preset, and any UI cascade. A unit test that
 * calls `Algorithms.scene3d.generate(params)` SUPPLIES the very value under
 * test, so it can only ever see one of those four. Everything here therefore
 * runs through `engine.addSceneTree()` — the exact entry `addLayer('scene3d')`
 * (Add Layer → 3D Scene, and the canvas algo-draw drop) routes to — and reads
 * the composed ink off `group.scenePaths`. A scene GROUP keeps `layer.paths`
 * empty on purpose; its one composed pass lives on `scenePaths`, so asserting
 * on `layer.paths` would assert nothing.
 *
 * THE BUG THIS PINS
 * -----------------
 * The seed object used to be a BOX under the `wireframe` mapper. `wireframe`
 * (like `contourSlice`) returns false from `Scene3D.SurfaceFill` and takes the
 * flat/edge path in `algorithms/scene3d.js` instead — it never reaches the
 * surface-fill emitter, so a wireframe object contributes ONLY structural
 * edges. On a box that is nine straight lines and ZERO surface fill: measured
 * on the pre-fix tree, a dropped scene composed 113 paths of which 0 belonged
 * to the object's surface (100 were the ground's cast-shadow hatch, 4 the
 * ground quad, 9 the box's edges). The object read as a bare cube outline with
 * no ink — which is exactly how it was reported.
 *
 * The assertion below is deliberately about the OBJECT's own surface fill, not
 * about the scene being non-empty: the scene was never literally empty, and a
 * `scenePaths.length > 0` check would have passed before the fix too.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('a freshly inserted 3D scene carries surface ink', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // The real insert entry: `engine.addLayer('scene3d')` delegates straight to
  // addSceneTree, so this IS the Add Layer / drop path, not a shortcut past it.
  const insertScene = () => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    engine.computeAllDisplayGeometry();
    return { engine, group: engine.getLayerById(groupId) };
  };

  const target = (path) => (path && path.meta && path.meta.sceneTarget) || {};

  // Surface ink belonging to the OBJECT: a fill whose target is neither the
  // ground fixture nor a cast-shadow region dropped onto it.
  const objectSurfaceFills = (group) => (group.scenePaths || []).filter((p) => {
    if (!p || !p.meta || p.meta.kind !== 'sceneFill') return false;
    const t = target(p);
    return t.objectId !== 'ground' && t.regionClass !== 'castShadow';
  });

  test('addLayer("scene3d") composes its ink onto group.scenePaths', () => {
    const { group } = insertScene();
    expect(group.type).toBe('scene3d');
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    // The group's own `paths` stay empty — scenePaths is where the ink lives.
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── The regression itself ────────────────────────────────────────────────
  test('the seeded object contributes SURFACE fill, not just edges', () => {
    const { group } = insertScene();
    const fills = objectSurfaceFills(group);
    expect(fills.length).toBeGreaterThan(0);
  });

  test('the seeded object is a sphere under the hatch mapper', () => {
    const { engine, group } = insertScene();
    const kids = engine.layers.filter((l) => l.parentId === group.id);
    const object = kids.find((l) => l.type === 'object3d');
    expect(object).toBeTruthy();
    expect(object.params.primitive).toBe('sphere');
    expect(object.params.style.mapper).toBe('hatch');
  });

  test('the seeded sphere rests ON the ground (centre at y = radius)', () => {
    const { engine, group } = insertScene();
    const object = engine.layers.find((l) => l.parentId === group.id && l.type === 'object3d');
    const radius = Number(object.params.params.radius);
    expect(radius).toBeGreaterThan(0);
    expect(object.params.transform.y).toBeCloseTo(radius, 6);
  });

  // ── The escape hatches must survive ──────────────────────────────────────
  test('a box is still addable and still emits its structural edges', () => {
    const { engine, group } = insertScene();
    const boxId = engine.addObjectToScene(group.id, 'box');
    engine.computeAllDisplayGeometry();
    const box = engine.getLayerById(boxId);
    expect(box.params.primitive).toBe('box');
    const edges = (group.scenePaths || []).filter(
      (p) => p.meta && p.meta.kind === 'sceneEdge' && target(p).objectId === boxId
    );
    expect(edges.length).toBeGreaterThan(0);
  });

  test('wireframe is still selectable and still suppresses surface fill', () => {
    const { engine, group } = insertScene();
    const object = engine.layers.find((l) => l.parentId === group.id && l.type === 'object3d');
    object.params.style = { penId: null, mapper: 'wireframe', params: {} };
    engine.computeAllDisplayGeometry();
    expect(objectSurfaceFills(group).length).toBe(0);
    const edges = (group.scenePaths || []).filter(
      (p) => p.meta && p.meta.kind === 'sceneEdge' && target(p).objectId === object.id
    );
    expect(edges.length).toBeGreaterThan(0);
  });
});
