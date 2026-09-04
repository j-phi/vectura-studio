/**
 * Rounded-contour line-finish DEFAULTS — a fresh sphere/capsule/torus is born
 * with Border Curves AND Fill Curves on; a cube is not.
 *
 * WHAT "DEFAULT" MEANS HERE, AND WHY IT IS A CREATION-TIME SEED
 * ------------------------------------------------------------
 * Scene line output is split by role (v1.3.83):
 *   Object tab ▸ "Border lines"  `params.curves` on the object3d LEAF bag —
 *                                the silhouette, creases and face outlines.
 *   Style  tab ▸ "Fill lines"    `style.params.fillCurves` — the internal fill.
 * Both resolve through fallbacks that treat an ABSENT key as off
 * (`Engine._applySceneCurveFinish`: `pick('curves', false)` and
 * `sp.fillCurves === true`). Those fallbacks are DELIBERATELY untouched: they
 * are what every already-saved `.vectura` is read through, so moving them would
 * re-render documents that never opted in. Instead the default is MATERIALIZED
 * at creation: `engine.addObjectToScene` (and the Geometry swap,
 * `engine.setObjectPrimitive`) writes the keys explicitly on the new object.
 * "Only newly created objects are affected" is therefore true by construction —
 * no sceneVersion migration is needed because nothing about how stored state is
 * INTERPRETED changed.
 *
 * THE SET — rounded contour, not merely chart-wrapped
 * --------------------------------------------------
 * Read LIVE off `Scene3D.Params.CURVED_FILL_PRIMITIVES` (the chart-wrapped set
 * that gates the Curves rows and the engine's curve finish) MINUS `pyramid`:
 * a pyramid is chart-wrapped but its faces are flat and its base is a polygon,
 * so it has no rounded contour and fitting its perimeter would round real
 * corners. `Scene3D.Params.hasRoundedContour` is that one answer, shared by the
 * engine so a second list can never drift.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('rounded-contour line-finish defaults', () => {
  let runtime;
  let Vectura;
  let P;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
    P = Vectura.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  const ROUNDED = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'torus', 'torusKnot', 'capsule', 'superellipsoid'];
  const FLAT = ['box', 'plane', 'solid', 'pyramid'];

  const freshScene = () => {
    const engine = new Vectura.VectorEngine();
    return { engine, groupId: engine.addSceneTree() };
  };

  const styleParams = (layer) => ((layer.params.style || {}).params) || {};

  // ── The set itself ────────────────────────────────────────────────────────

  test('hasRoundedContour is CURVED_FILL_PRIMITIVES minus pyramid, read live', () => {
    expect(typeof P.hasRoundedContour).toBe('function');
    const curved = [...P.CURVED_FILL_PRIMITIVES];
    const rounded = curved.filter((k) => P.hasRoundedContour(k)).sort();
    expect(rounded).toEqual(ROUNDED.slice().sort());
    // Chart-wrapped but flat-faced: in the curve GATE, out of the default.
    expect(P.CURVED_FILL_PRIMITIVES.has('pyramid')).toBe(true);
    expect(P.hasRoundedContour('pyramid')).toBe(false);
    // Never faceted geometry, and never a bogus name.
    ['box', 'plane', 'solid', 'nope', undefined, null].forEach((k) => {
      expect(P.hasRoundedContour(k)).toBe(false);
    });
  });

  // ── Creation ──────────────────────────────────────────────────────────────

  test.each(ROUNDED)('a fresh %s is born with Border Curves and Fill Curves on', (prim) => {
    const { engine, groupId } = freshScene();
    const layer = engine.getLayerById(engine.addObjectToScene(groupId, prim));
    expect(layer.params.curves).toBe(true);
    expect(styleParams(layer).fillCurves).toBe(true);
  });

  test.each(FLAT)('a fresh %s carries NEITHER key (flat contours stay exact)', (prim) => {
    const { engine, groupId } = freshScene();
    const layer = engine.getLayerById(engine.addObjectToScene(groupId, prim));
    expect(layer.params.curves).toBeUndefined();
    expect(styleParams(layer).fillCurves).toBeUndefined();
  });

  test('only the two line-finish keys are seeded — the smoothing/simplify sliders stay unset', () => {
    const { engine, groupId } = freshScene();
    const layer = engine.getLayerById(engine.addObjectToScene(groupId, 'capsule'));
    expect(layer.params.smoothing).toBeUndefined();
    expect(layer.params.simplify).toBeUndefined();
    expect(styleParams(layer).fillSmoothing).toBeUndefined();
    expect(styleParams(layer).fillSimplify).toBeUndefined();
    expect(styleParams(layer).fillFidelity).toBeUndefined();
  });

  // ── The Geometry swap — how a user actually changes shape ──────────────────

  test('swapping a cube to a capsule seeds both keys', () => {
    const { engine, groupId } = freshScene();
    const id = engine.addObjectToScene(groupId, 'box');
    const layer = engine.getLayerById(id);
    expect(layer.params.curves).toBeUndefined();
    expect(engine.setObjectPrimitive(id, 'capsule', { recompute: false })).toBe(true);
    expect(layer.params.curves).toBe(true);
    expect(styleParams(layer).fillCurves).toBe(true);
  });

  test('swapping a capsule to a cube REMOVES both keys (a cube must never be fitted)', () => {
    const { engine, groupId } = freshScene();
    const id = engine.addObjectToScene(groupId, 'capsule');
    const layer = engine.getLayerById(id);
    expect(engine.setObjectPrimitive(id, 'box', { recompute: false })).toBe(true);
    expect(layer.params.curves).toBeUndefined();
    expect(styleParams(layer).fillCurves).toBeUndefined();
  });

  test('a rounded → rounded swap keeps an explicit user OFF (the seed is not a re-imposition)', () => {
    const { engine, groupId } = freshScene();
    const id = engine.addObjectToScene(groupId, 'torus');
    const layer = engine.getLayerById(id);
    layer.params.curves = false;
    layer.params.style.params.fillCurves = false;
    expect(engine.setObjectPrimitive(id, 'sphere', { recompute: false })).toBe(true);
    expect(layer.params.curves).toBe(false);
    expect(styleParams(layer).fillCurves).toBe(false);
  });

  test('pyramid is treated as flat on both the add and the swap', () => {
    const { engine, groupId } = freshScene();
    const id = engine.addObjectToScene(groupId, 'pyramid');
    const layer = engine.getLayerById(id);
    expect(layer.params.curves).toBeUndefined();
    expect(engine.setObjectPrimitive(id, 'sphere', { recompute: false })).toBe(true);
    expect(layer.params.curves).toBe(true);
    expect(engine.setObjectPrimitive(id, 'pyramid', { recompute: false })).toBe(true);
    expect(layer.params.curves).toBeUndefined();
  });

  // ── The drawn result, through the REAL compose ─────────────────────────────
  //
  // A seeded key is worth nothing if the composed ink is still polygonal, and a
  // unit test that hands `generate()` its own params cannot see a default at
  // all. These drive engine.addObjectToScene + computeAllDisplayGeometry and
  // read group.scenePaths — the same path the app draws.

  const composeAdded = (primitive, mapper) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addSceneTree();
    const group = engine.getLayerById(groupId);
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    // addSceneTree seeds a default box child; drop it so only our object emits.
    engine.layers
      .filter((l) => l.parentId === groupId && l.type === 'object3d')
      .forEach((l) => engine.removeLayer(l.id));
    const id = engine.addObjectToScene(groupId, primitive);
    const layer = engine.getLayerById(id);
    layer.params.style.mapper = mapper; // keep style.params (and its seed) intact
    engine.computeAllDisplayGeometry();
    const live = engine.getLayerById(groupId);
    return live.scenePaths || [];
  };

  const kind = (paths, k) => paths.filter((p) => p && p.meta && p.meta.kind === k);
  const curved = (paths) => paths.filter((p) => {
    const a = p && p.meta && p.meta.anchors;
    return Array.isArray(a) && a.some((k) => k && (k.in || k.out));
  });

  test('a freshly added capsule DRAWS curved border lines', () => {
    const edges = kind(composeAdded('capsule', 'hatch'), 'sceneEdge');
    expect(edges.length).toBeGreaterThan(0);
    expect(curved(edges).length).toBeGreaterThan(0);
  });

  test('a freshly added capsule DRAWS curved fill lines', () => {
    const fills = kind(composeAdded('capsule', 'hatch'), 'sceneFill');
    expect(fills.length).toBeGreaterThan(0);
    expect(curved(fills).length).toBeGreaterThan(0);
  });

  test('a freshly added cube draws NO curves at all', () => {
    const paths = composeAdded('box', 'hatch');
    expect(paths.length).toBeGreaterThan(0);
    expect(curved(paths).length).toBe(0);
  });

  // ── Existing documents are untouched ──────────────────────────────────────

  test('a saved capsule that never set the keys still loads unset and draws straight', () => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addSceneTree();
    const group = engine.getLayerById(groupId);
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    engine.layers
      .filter((l) => l.parentId === groupId && l.type === 'object3d')
      .forEach((l) => engine.removeLayer(l.id));
    const id = engine.addObjectToScene(groupId, 'capsule');
    const layer = engine.getLayerById(id);
    layer.params.style.mapper = 'hatch';
    // Simulate the on-disk shape of a pre-change document: the keys were never
    // written, so they are simply absent.
    delete layer.params.curves;
    delete layer.params.style.params.fillCurves;

    const saved = JSON.parse(JSON.stringify(engine.exportState()));
    const reopened = new Vectura.VectorEngine();
    reopened.importState(saved);
    reopened.computeAllDisplayGeometry();

    const leaf = reopened.layers.find((l) => l.type === 'object3d');
    expect(leaf.params.curves).toBeUndefined();
    expect(((leaf.params.style || {}).params || {}).fillCurves).toBeUndefined();

    const live = reopened.layers.find((l) => l.id === groupId) || reopened.layers.find((l) => l.isGroup);
    expect((live.scenePaths || []).length).toBeGreaterThan(0);
    expect(curved(live.scenePaths).length).toBe(0);
  });

  test('the SCENE version chain is untouched — this default needed no migration', () => {
    expect(P.SCENE_VERSION).toBe(4);
    expect(Vectura.ALGO_DEFAULTS.object3d.sceneVersion).toBe(P.SCENE_VERSION);
    // And no line-finish key leaked into the factory bag (which a saved layer
    // would then inherit on load).
    expect(Vectura.ALGO_DEFAULTS.object3d.curves).toBeUndefined();
    expect(Vectura.ALGO_DEFAULTS.object3d.style.params.fillCurves).toBeUndefined();
  });
});
