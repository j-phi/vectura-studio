/**
 * Drop-to-ground v2 (fs-u1) — the naive v1 implementation set transform.y = 0
 * directly, ignoring rotation, per-axis scale, and the object's own size, so
 * any non-trivial object either floated above or sank into the ground plane.
 * v2 computes the object's TRUE transformed lowest world-space point (mesh
 * vertices through the object's full transform: scale -> yaw/pitch/roll ->
 * translate) and snaps that point to the ground height.
 *
 * The decisive regression is the ROTATED-object case: an unrotated box's
 * lowest point is trivially `transform.y - halfHeight`, so a test using only
 * an axis-aligned box would still pass under the old origin-based
 * implementation. A rotated box's lowest point is a CORNER, not the base —
 * only a real transformed-vertex computation gets that right.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('drop-to-ground v2 — true transformed lowest point', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const Scene = () => V.Scene3D.Scene;

  // Independent ground-truth: re-derive an object's true world min-Y from its
  // own mesh + transform, the SAME primitives dropSceneObjectsToGround uses
  // internally, so this checks the RESULT property ("the object's true lowest
  // point sits at ground height") rather than re-deriving the renderer's own
  // arithmetic by hand.
  const worldMinY = (obj) => {
    const mesh = Scene().buildPrimitiveMesh(obj, 1);
    let minY = Infinity;
    mesh.vertices.forEach((pt) => {
      const w = Scene().applyObjectTransform(pt, obj.transform || {});
      if (w.y < minY) minY = w.y;
    });
    return minY;
  };

  // ── engine/renderer fixtures ──────────────────────────────────────────
  const buildMonolith = (objects, groundEnabled = true) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('scene-mono', 'scene3d', 'Scene');
    layer.isGroup = false;
    layer.params = layer.params || {};
    layer.params.objects = objects;
    layer.params.ground = { enabled: groundEnabled };
    engine.layers.push(layer);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}] };
    engine.generate = () => {}; // isolate from the scene3d algorithm
    return { engine, renderer, layer };
  };

  const buildTree = (count = 1) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    const childIds = [];
    for (let i = 0; i < count; i++) childIds.push(engine.addObjectToScene(gid, 'box'));
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}] };
    engine.generate = () => {};
    return { engine, renderer, gid, childIds };
  };

  const box = (id, transform, sz = { sx: 40, sy: 40, sz: 40 }) => ({
    id, name: id, primitive: 'box', params: sz, transform, visibility: 'solid',
  });

  // ── sceneHasGround predicate ────────────────────────────────────────────
  test('sceneHasGround: true for an enabled monolith ground, false when disabled', () => {
    const { renderer, layer } = buildMonolith([box('obj-1', { x: 0, y: 20, z: 0 })], true);
    expect(renderer.sceneHasGround(layer.id)).toBe(true);
    layer.params.ground.enabled = false;
    expect(renderer.sceneHasGround(layer.id)).toBe(false);
  });

  test('sceneHasGround: true on a tree once a ground child is added, false without one', () => {
    const { engine, renderer, gid } = buildTree(1);
    // addSceneGroup leaves the inline ground at the scene3d factory default
    // (enabled); force it off first so this genuinely starts groundless.
    engine.getLayerById(gid).params.ground = { enabled: false };
    engine.computeAllDisplayGeometry();
    expect(renderer.sceneHasGround(gid)).toBe(false);
    engine.addGroundToScene(gid);
    expect(renderer.sceneHasGround(gid)).toBe(true);
    const groundChild = engine.getLayerChildren(gid).find((l) => l.type === 'sceneGround3d');
    engine.removeLayer(groundChild.id);
    engine.computeAllDisplayGeometry();
    expect(renderer.sceneHasGround(gid)).toBe(false);
  });

  // ── no ground: safe no-op ───────────────────────────────────────────────
  test('no ground: dropSceneObjectsToGround returns false and writes nothing', () => {
    const { renderer, layer } = buildMonolith([box('obj-1', { x: 0, y: 999, z: 0 })], false);
    const before = JSON.stringify(layer.params.objects[0].transform);
    const ok = renderer.dropSceneObjectsToGround(layer.id, ['obj-1']);
    expect(ok).toBe(false);
    expect(JSON.stringify(layer.params.objects[0].transform)).toBe(before);
  });

  // ── unrotated sanity (naive-implementation-passable, kept as a baseline) ─
  test('unrotated box rests its base on the ground (y = half-height)', () => {
    const { renderer, layer } = buildMonolith([box('obj-1', { x: 0, y: 999, z: 0 })]);
    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1'])).toBe(true);
    const obj = layer.params.objects[0];
    expect(obj.transform.y).toBe(20);
    expect(worldMinY(obj)).toBeCloseTo(0, 6);
  });

  // ── THE DECISIVE TEST — a rotated object's lowest point is a CORNER ─────
  test('ROTATED box: the true transformed lowest CORNER rests on the ground, not the untransformed base', () => {
    const { renderer, layer } = buildMonolith([
      box('obj-1', { x: 0, y: 300, z: 0, yaw: 30, pitch: 20, roll: 15, scale: 1 }),
    ]);
    const obj = layer.params.objects[0];
    // Sanity: this rotation genuinely moves the lowest point off the naive
    // "y - halfHeight" prediction a non-rotated formula would use.
    const naivePrediction = obj.transform.y - 20;
    expect(worldMinY(obj)).not.toBeCloseTo(naivePrediction, 3);

    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1'])).toBe(true);
    // The object's ACTUAL transformed minimum Y (rotation + translate) must
    // land exactly on the ground height (0), within float tolerance. A test
    // that merely checked transform.y against a fixed constant would not
    // catch a naive origin-based "drop" — this checks the real geometry.
    expect(worldMinY(obj)).toBeCloseTo(0, 6);
  });

  test('ROTATED + non-uniform per-axis scale: still rests exactly on the ground', () => {
    const { renderer, layer } = buildMonolith([
      box('obj-1', {
        x: 5, y: -80, z: -5, yaw: 55, pitch: -35, roll: 10, scale: 1, sx: 1.6, sy: 0.7, sz: 2.1,
      }),
    ]);
    const obj = layer.params.objects[0];
    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1'])).toBe(true);
    expect(worldMinY(obj)).toBeCloseTo(0, 6);
  });

  // ── objects already below ground: Drop raises them too ─────────────────
  test('an object embedded below the ground is RAISED to contact, not left alone', () => {
    const { renderer, layer } = buildMonolith([box('obj-1', { x: 0, y: -500, z: 0 })]);
    const obj = layer.params.objects[0];
    expect(worldMinY(obj)).toBeLessThan(0);
    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1'])).toBe(true);
    expect(worldMinY(obj)).toBeCloseTo(0, 6);
    expect(obj.transform.y).toBe(20);
  });

  // ── multi-select: each object drops INDEPENDENTLY to its own contact ───
  test('multi-select: two objects at different heights each reach their own contact (not a rigid group)', () => {
    const { renderer, layer } = buildMonolith([
      box('obj-1', { x: 0, y: 500, z: 0 }),
      box('obj-2', { x: 40, y: 5, z: 0 }, { sx: 40, sy: 80, sz: 40 }), // half-height 40
    ]);
    const [o1, o2] = layer.params.objects;
    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1', 'obj-2'])).toBe(true);
    expect(worldMinY(o1)).toBeCloseTo(0, 6);
    expect(worldMinY(o2)).toBeCloseTo(0, 6);
    // Each landed at ITS OWN half-height, not a shared group offset — proves
    // independence (a rigid-group drop would only zero the LOWER of the two
    // and leave the other one still floating/embedded by the pre-existing gap).
    expect(o1.transform.y).toBe(20);
    expect(o2.transform.y).toBe(40);
  });

  // ── boolean group: operands with no transform of their own, dropped RIGIDLY
  test('booleanGroup3d id: operand children drop RIGIDLY as one union, preserving the carve', () => {
    const { engine, renderer, gid } = buildTree(0);
    const bgLayer = new V.Layer('bool-1', 'booleanGroup3d', 'Boolean');
    bgLayer.isGroup = true;
    bgLayer.parentId = gid;
    engine.layers.push(bgLayer);
    const opA = new V.Layer('op-a', 'object3d', 'A');
    opA.parentId = bgLayer.id;
    opA.params.primitive = 'box';
    opA.params.params = { sx: 40, sy: 40, sz: 40 };
    opA.params.transform = { x: 0, y: 1000, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const opB = new V.Layer('op-b', 'object3d', 'B');
    opB.parentId = bgLayer.id;
    opB.params.primitive = 'box';
    opB.params.params = { sx: 20, sy: 20, sz: 20 };
    // opB sits 30 ABOVE opA's center — this offset must be PRESERVED by the drop.
    opB.params.transform = { x: 0, y: 1030, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    engine.layers.push(opA, opB);
    engine.computeAllDisplayGeometry();

    const preOffset = opB.params.transform.y - opA.params.transform.y;
    const ok = renderer.dropSceneObjectsToGround(gid, [bgLayer.id]);
    expect(ok).toBe(true);
    // The relative offset between operands is untouched (rigid group, not
    // independent drops that would collapse the carved relationship).
    expect(opB.params.transform.y - opA.params.transform.y).toBeCloseTo(preOffset, 6);
    // The UNION's lowest point (opA, the taller/lower operand) touches ground.
    expect(worldMinY(opA.params)).toBeCloseTo(0, 6);
  });

  test('unresolvable ids (e.g. the ground sentinel) leave dropSceneObjectsToGround a safe no-op', () => {
    const { renderer, layer } = buildMonolith([box('obj-1', { x: 0, y: 999, z: 0 })]);
    const before = JSON.stringify(layer.params.objects[0].transform);
    expect(renderer.dropSceneObjectsToGround(layer.id, ['ground'])).toBe(false);
    expect(JSON.stringify(layer.params.objects[0].transform)).toBe(before);
  });
});
