/**
 * ctxbar scene-object writers on a REAL SCENE TREE.
 *
 * Defect 1 — `renderer.setSceneObjectStyle` wrote the scene GROUP's
 *   `params.styleTable.byObject[id]`. On a tree the compositor's collect step
 *   (Scene3D.Params.collectSceneParams) does `byObject[item.id] = n.style`
 *   UNCONDITIONALLY from the child object3d layer, so anything the ctxbar wrote
 *   into the group table was discarded before the scene ever rendered. The
 *   object panel's Style tab (which writes `child.params.style`) worked; the
 *   ctxbar Style flyout was dead. Fix: route the write to the CHILD LAYER for a
 *   tree child, mirroring `_sceneObjectById` / `_allSceneObjectRecords`.
 *
 * Defect 2 — `renderer.setSceneObjectPrimitive` replaced the param bag from the
 *   DESERIALIZATION table (PRIMITIVE_PARAM_DEFAULTS), destroying an imported
 *   mesh payload and disagreeing with the panel's swap. Fix: delegate to
 *   `engine.setObjectPrimitive` (creation defaults + size-preserving rescale +
 *   importedMesh carry-over) for a tree child, and use the same
 *   `buildPrimitiveParams` contract for a legacy inline object.
 *
 * Defect 3 — the swap emitted no event, so the docked panel kept showing the
 *   OLD geometry's controls. Fix: dispatch `vectura:scene-object-primitive`.
 *
 * MEASUREMENT NOTE: a per-layer `engine.generate()` on an `object3d` renders it
 * STANDALONE off ALGO_DEFAULTS and bypasses `_sceneConsumed`. The composed ink
 * lives on `group.scenePaths` and NOWHERE else, so every assertion below drives
 * `engine.computeAllDisplayGeometry()` and reads `group.scenePaths`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

// Coordinate-only signature of a composed scene. `meta` is a non-index property
// on the path array, so JSON.stringify captures exactly the drawn geometry —
// which is what "did the hatch actually rotate?" means.
const inkHash = (paths) => JSON.stringify(paths || []);

describe('ctxbar scene-object writers on a scene TREE (Defects 1–3)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const sceneEnvelope = () => {
    const d = clone(V.ALGO_DEFAULTS.scene3d);
    return {
      sceneVersion: d.sceneVersion, seed: 7,
      lights: d.lights, tone: d.tone, shadow: d.shadow,
      ground: { enabled: false }, backdrop: { enabled: false }, camera: d.camera,
      assets: {},
    };
  };

  const hatchObject = () => ({
    primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 20, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    style: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 55 } },
    faceStyles: {},
  });

  const mkRenderer = (engine) => {
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { history: ['initial'], pushHistory() { this.history.push('snap'); }, render() {} };
    return renderer;
  };

  // A REAL scene tree — the shape a canvas pick / layer-row click produces:
  // a scene GROUP (isGroup + containerRole 'scene') whose object lives on a
  // CHILD object3d layer, with the CHILD selected.
  const buildTree = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const grp = new V.Layer('scene-grp', 'scene3d', 'Scene');
    grp.isGroup = true;
    grp.containerRole = 'scene';
    grp.params = {
      ...sceneEnvelope(), objects: [], groups: [],
      styleTable: { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} },
    };
    engine.layers.push(grp);

    const child = new V.Layer('obj-child', 'object3d', 'A');
    Object.assign(child.params, hatchObject());
    child.parentId = grp.id;
    engine.layers.push(child);

    const renderer = mkRenderer(engine);
    renderer.setSceneSelection({
      layerId: grp.id, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [],
    });
    return { engine, renderer, grp, child };
  };

  // The legacy MONOLITH — an inline scene3d LEAF. This is the path that already
  // works and is therefore the regression pin.
  const buildMonolith = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const o = hatchObject();
    const leaf = new V.Layer('scene-leaf', 'scene3d', 'Scene');
    leaf.params = {
      ...sceneEnvelope(),
      objects: [{
        id: 'obj-1', name: 'A', primitive: o.primitive, role: o.role,
        params: o.params, transform: o.transform, visibility: o.visibility,
      }],
      groups: [],
      styleTable: {
        scene: { penId: null, mapper: 'wireframe', params: {} },
        byObject: { 'obj-1': clone(o.style) }, byFace: {},
      },
    };
    engine.layers.push(leaf);
    const renderer = mkRenderer(engine);
    renderer.setSceneSelection({
      layerId: leaf.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [],
    });
    return { engine, renderer, leaf };
  };

  // Drive the composite and return the group/leaf's composed ink signature.
  const composedHash = (engine, sceneLayer) => {
    engine.computeAllDisplayGeometry();
    const paths = sceneLayer.scenePaths || engine.getRenderablePaths(sceneLayer);
    return inkHash(paths);
  };

  // Exactly what the ctxbar Style flyout's Angle dial does: read the resolved
  // style, then write the WHOLE style back with one param replaced.
  const writeAngleViaCtxbar = (renderer, layerId, objectId, angle) => {
    const cur = renderer.getSceneObjectResolvedStyle(layerId, objectId);
    return renderer.setSceneObjectStyle(layerId, [objectId], {
      mapper: 'hatch',
      params: { ...(cur && cur.params ? cur.params : {}), fillAngle: angle },
    });
  };

  const sweepAngles = (engine, renderer, sceneLayer, objectId) => {
    const hashes = [];
    [0, 45, 90].forEach((a) => {
      writeAngleViaCtxbar(renderer, sceneLayer.id, objectId, a);
      hashes.push(composedHash(engine, sceneLayer));
    });
    return hashes;
  };

  // ——— Defect 1 — the decisive A/B ————————————————————————————————————
  test('D1: a ctxbar Style write on a TREE CHILD changes the composed ink (0/45/90 ⇒ 3 hashes)', () => {
    const { engine, renderer, grp, child } = buildTree();
    // Baseline compose so the group's collected style table is populated.
    composedHash(engine, grp);
    const hashes = sweepAngles(engine, renderer, grp, child.id);
    expect(hashes[0].length).toBeGreaterThan(2);
    expect(new Set(hashes).size).toBe(3);
  });

  test('D1: the ctxbar write lands on the CHILD LAYER (the compositor\'s source of truth)', () => {
    const { engine, renderer, grp, child } = buildTree();
    composedHash(engine, grp);
    writeAngleViaCtxbar(renderer, grp.id, child.id, 62);
    expect(child.params.style.mapper).toBe('hatch');
    expect(child.params.style.params.fillAngle).toBe(62);
    // …and it survives the next compose (the collect step re-derives byObject
    // from the child, so a group-table-only write would be discarded here).
    engine.computeAllDisplayGeometry();
    expect(grp.params.styleTable.byObject[child.id].params.fillAngle).toBe(62);
  });

  test('D1: MONOLITH regression pin — the inline path still writes byObject and still rotates', () => {
    const { engine, renderer, leaf } = buildMonolith();
    composedHash(engine, leaf);
    const hashes = sweepAngles(engine, renderer, leaf, 'obj-1');
    expect(new Set(hashes).size).toBe(3);
    // Inline objects have no child layer — the group style table stays the
    // authority, byte-for-byte as before.
    expect(leaf.params.styleTable.byObject['obj-1'].params.fillAngle).toBe(90);
  });

  test('D1: opts.clear on a tree child resets the override (composed ink returns to the scene style)', () => {
    const { engine, renderer, grp, child } = buildTree();
    composedHash(engine, grp);
    writeAngleViaCtxbar(renderer, grp.id, child.id, 90);
    const rotated = composedHash(engine, grp);
    renderer.setSceneObjectStyle(grp.id, [child.id], null, { clear: true });
    const cleared = composedHash(engine, grp);
    expect(cleared).not.toBe(rotated);
    // The scene-scope style is 'wireframe' — the reset must land there, not on
    // a leftover hatch bag.
    expect(child.params.style.mapper).toBe('wireframe');
  });

  // ——— Defect 2 — primitive swap must not destroy an imported mesh ————————
  const MESH = {
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
    faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
  };

  test('D2: a ctxbar swap off an imported mesh is REVERSIBLE (the payload survives)', () => {
    const { renderer, grp, child } = buildTree();
    child.params.primitive = 'solid';
    child.params.params = { solidType: 'importedMesh', radius: 40, importedMesh: clone(MESH) };

    expect(renderer.setSceneObjectPrimitive(grp.id, [child.id], 'box')).toBe(true);
    expect(child.params.primitive).toBe('box');
    expect(child.params.params.importedMesh).toEqual(MESH);

    expect(renderer.setSceneObjectPrimitive(grp.id, [child.id], 'solid')).toBe(true);
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('importedMesh');
    expect(child.params.params.importedMesh).toEqual(MESH);
  });

  test('D2: a ctxbar swap produces the SAME bag as the panel swap (engine.setObjectPrimitive)', () => {
    const P = V.Scene3D.Params;
    const { renderer, grp, child } = buildTree();
    const before = clone(child.params.params);
    expect(renderer.setSceneObjectPrimitive(grp.id, [child.id], 'torus')).toBe(true);
    expect(child.params.params).toEqual(P.buildPrimitiveParams('torus', 'box', before));
  });

  test('D2: a same-primitive swap is a no-op (no history, no mutation)', () => {
    const { renderer, grp, child } = buildTree();
    const before = renderer.app.history.length;
    expect(renderer.setSceneObjectPrimitive(grp.id, [child.id], 'box')).toBe(false);
    expect(renderer.app.history.length).toBe(before);
  });

  test('D2: MONOLITH regression pin — an inline swap still resets the bag + keeps a mesh', () => {
    const { renderer, leaf } = buildMonolith();
    const obj = leaf.params.objects[0];
    obj.primitive = 'solid';
    obj.params = { solidType: 'importedMesh', radius: 40, importedMesh: clone(MESH) };
    expect(renderer.setSceneObjectPrimitive(leaf.id, ['obj-1'], 'sphere')).toBe(true);
    expect(obj.primitive).toBe('sphere');
    expect(obj.params.radius).toBeDefined();
    expect(obj.params.sx).toBeUndefined();
    expect(obj.params.importedMesh).toEqual(MESH);
  });

  // ——— Defect 3 — the swap must announce itself ——————————————————————————
  test('D3: a ctxbar swap dispatches vectura:scene-object-primitive', () => {
    const { renderer, grp, child } = buildTree();
    const seen = [];
    const onEvt = (e) => seen.push(e.detail);
    runtime.window.addEventListener('vectura:scene-object-primitive', onEvt);
    try {
      renderer.setSceneObjectPrimitive(grp.id, [child.id], 'cone');
    } finally {
      runtime.window.removeEventListener('vectura:scene-object-primitive', onEvt);
    }
    expect(seen.length).toBe(1);
    expect(seen[0].layerId).toBe(grp.id);
    expect(seen[0].primitive).toBe('cone');
    expect(seen[0].objectIds).toEqual([child.id]);
  });

  test('D3: a rejected swap dispatches nothing', () => {
    const { renderer, grp, child } = buildTree();
    const seen = [];
    const onEvt = () => seen.push(1);
    runtime.window.addEventListener('vectura:scene-object-primitive', onEvt);
    try {
      renderer.setSceneObjectPrimitive(grp.id, [child.id], 'notashape');
      renderer.setSceneObjectPrimitive(grp.id, [child.id], 'box'); // no-op
    } finally {
      runtime.window.removeEventListener('vectura:scene-object-primitive', onEvt);
    }
    expect(seen.length).toBe(0);
  });
});
