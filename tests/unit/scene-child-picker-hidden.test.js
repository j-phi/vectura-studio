const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Primary-picker suppression for 3D-scene CHILD leaf kinds.
 *
 * `object3d`, `sceneLight3d`, `sceneGround3d`, and `booleanGroup3d` are scene
 * children — meaningful only nested under a 3D Scene group — not standalone
 * top-level artwork. Picking `sceneLight3d`/`sceneGround3d`/`booleanGroup3d`
 * from the primary algorithm picker creates a layer whose generate() always
 * returns [] (nothing to draw); `object3d` alone happens to delegate to the
 * scene3d pipeline and DOES render something, but the product decision groups
 * it with the other three as UI-noise that belongs on the 3D Scene group's own
 * "Add shape"/"Add light"/"Add ground" affordances instead.
 *
 * `hidden: true` on the ALGO_DEFAULTS entry is the EXISTING suppression
 * mechanism (already used for `text` / `shape` / `group`) — every picker
 * surface (src/ui/utils.js getDrawableAlgorithmOptions, src/ui/shell/header.js
 * initModuleDropdown, and the shortcuts.js/toolbar.js local fallbacks) filters
 * on it. This is a UI-VISIBILITY-ONLY change: engine.addLayer() and the
 * scene-group construction helpers never consult `hidden` (they gate on
 * ALGO_DEFAULTS/Algorithms presence only — see isValidDrawableLayerType in
 * src/core/engine.js), so a document holding one of these layers must keep
 * loading and rendering, and the engine constructors used by the scene-group
 * "Add" buttons (and ~6 existing tests) must keep working.
 *
 * RGR: every test in the two `hidden` describe blocks below fails on the base
 * branch (no `hidden` marker existed for these four kinds) and passes after.
 */

const SCENE_CHILD_KINDS = ['object3d', 'sceneLight3d', 'sceneGround3d', 'booleanGroup3d'];

describe('primary picker suppresses 3D-scene child leaf kinds', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test.each(SCENE_CHILD_KINDS)('ALGO_DEFAULTS.%s carries hidden:true', (type) => {
    expect(V.ALGO_DEFAULTS[type]).toBeTruthy();
    expect(V.ALGO_DEFAULTS[type].hidden).toBe(true);
  });

  test('getDrawableAlgorithmOptions() excludes all four scene-child kinds', () => {
    const options = V.UI.utils.getDrawableAlgorithmOptions();
    const types = options.map((o) => o.type);
    SCENE_CHILD_KINDS.forEach((type) => expect(types).not.toContain(type));
  });

  test('getDrawableAlgorithmOptions() still includes the 3D Scene entry and ordinary algorithms', () => {
    const types = V.UI.utils.getDrawableAlgorithmOptions().map((o) => o.type);
    expect(types).toContain('scene3d');
    expect(types).toContain('wavetable');
    expect(types).toContain('flowfield');
  });

  test('text/shape/group stay hidden too (precedent for the mechanism)', () => {
    expect(V.ALGO_DEFAULTS.text.hidden).toBe(true);
    expect(V.ALGO_DEFAULTS.shape.hidden).toBe(true);
    expect(V.ALGO_DEFAULTS.group.hidden).toBe(true);
  });
});

describe('anti-breakage guard — hidden does not break engine construction', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test.each(SCENE_CHILD_KINDS)('engine.addLayer(%s) still constructs a layer of that type', (type) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const id = engine.addLayer(type);
    expect(id).toBeTruthy();
    const layer = engine.getLayerById(id);
    expect(layer).toBeTruthy();
    expect(layer.type).toBe(type);
    // generate() must not throw even though light/ground/boolean legitimately
    // emit no ink standalone.
    expect(() => engine.generate(id)).not.toThrow();
  });

  test('the scene group "Add" buttons still add each hidden child kind (addObjectToScene / addLightToScene / addGroundToScene)', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree(); // seeds a sun light + ground already
    const group = engine.getLayerById(gid);
    expect(group.isGroup).toBe(true);

    const oid = engine.addObjectToScene(gid, 'sphere');
    expect(engine.getLayerById(oid).type).toBe('object3d');

    const lid = engine.addLightToScene(gid, 'point');
    expect(engine.getLayerById(lid).type).toBe('sceneLight3d');

    // addSceneTree already seeded a ground child — addGroundToScene is a
    // documented no-op on a second call (only one ground allowed).
    expect(engine.addGroundToScene(gid)).toBeNull();
  });

  test('createBooleanGroupFromSelection is still a working in-scene route to booleanGroup3d (not orphaned by hiding it from the picker)', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const o1 = engine.addObjectToScene(gid, 'box');
    const o2 = engine.addObjectToScene(gid, 'sphere');
    const boolId = engine.createBooleanGroupFromSelection([o1, o2]);
    expect(boolId).toBeTruthy();
    const boolLayer = engine.getLayerById(boolId);
    expect(boolLayer.type).toBe('booleanGroup3d');
    expect(boolLayer.isGroup).toBe(true);
    // Both operands reparented under the new boolean group.
    expect(engine.getLayerById(o1).parentId).toBe(boolId);
    expect(engine.getLayerById(o2).parentId).toBe(boolId);
  });

  test('a saved document containing all four hidden child kinds still loads (importState) and renders', () => {
    // Build a real scene tree with an object, a boolean group (two operands),
    // a light, and a ground, export it, then re-import into a fresh engine —
    // exactly the "open .vectura" path.
    const src = new V.VectorEngine();
    src.layers = [];
    const gid = src.addSceneTree();
    const o1 = src.addObjectToScene(gid, 'box');
    const o2 = src.addObjectToScene(gid, 'sphere');
    src.createBooleanGroupFromSelection([o1, o2]);
    src.addLightToScene(gid, 'point');
    src.computeAllDisplayGeometry();
    const state = src.exportState();

    const kinds = state.layers.map((l) => l.type);
    SCENE_CHILD_KINDS.forEach((type) => expect(kinds).toContain(type));

    const dst = new V.VectorEngine();
    dst.importState(state);
    const group = dst.getLayerById(gid);
    expect(group).toBeTruthy();
    dst.computeAllDisplayGeometry();
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });
});
