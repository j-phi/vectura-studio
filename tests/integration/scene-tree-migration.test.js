const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene-tree Increment F — LOAD-TIME MIGRATION (saved monolith .vectura → tree).
 *
 * A saved single-layer (monolith) scene3d document — inline params.objects[] /
 * groups[] / lights[] / ground — must, on import, EAGERLY expand into the
 * canonical scene TREE (a scene group + object3d / booleanGroup3d / sceneLight3d
 * / sceneGround3d children), id-preserving, WITHOUT changing the emitted
 * geometry. The engine format version bumps 1 -> 2; the expansion is the v1->v2
 * step and is gated on the SOURCE version (< 2), so a document already at v2
 * (canonical) is left alone. Increment B's inline-union compositor is the
 * permanent safety net: any un-expanded monolith still renders byte-identically.
 *
 * RGR — the auto-expand-on-import wiring does not exist before F, so cases (a)
 * and (d) fail on the base branch and pass after.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

// A rich MONOLITH scene: a standalone box, a subtract boolean (box − sphere),
// two lights, an enabled ground, and per-object + per-face styles.
const monoParams = (V) => ({
  ...clone(V.ALGO_DEFAULTS.scene3d),
  seed: 7,
  objects: [
    {
      id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: -60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', role: 'solid',
    },
    {
      id: 'cut-base', name: 'Cut Base', primitive: 'box', params: { sx: 44, sy: 44, sz: 44 },
      transform: { x: 60, y: 22, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', role: 'solid',
    },
    {
      id: 'cut-tool', name: 'Cut Tool', primitive: 'sphere', params: { radius: 18, detail: 12 },
      transform: { x: 74, y: 30, z: 8, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', role: 'hole',
    },
  ],
  groups: [
    { id: 'bg-1', name: 'Cutout', op: 'subtract', children: ['cut-base', 'cut-tool'] },
  ],
  lights: [
    { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true },
    { id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 0.8, castShadows: true },
  ],
  ground: { enabled: true },
  styleTable: {
    scene: { penId: null, mapper: 'wireframe', params: {} },
    byObject: { 'obj-1': { penId: 'pen-3', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 60 } } },
    byFace: { 'obj-1/top': { penId: 'pen-2', mapper: 'wireframe', params: {} } },
  },
});

// Reduce a renderable path list to a stable, comparable projection: point
// coordinates + the sceneTarget objectId + the edge kind. Sorted so ordering
// differences between two equivalent renders do not fail the comparison.
const projectPaths = (paths) =>
  (paths || [])
    .map((p) => ({
      kind: p.meta && p.meta.kind,
      objectId: p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId,
      pts: (Array.isArray(p) ? p : []).map((pt) => [Math.round(pt.x * 1e6) / 1e6, Math.round(pt.y * 1e6) / 1e6]),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

// A saved-doc state built by exporting a live monolith engine, then stamped
// with the given format version (legacy files predate the field / are v1).
const savedMonolithState = (V, formatVersion) => {
  const engine = new V.VectorEngine();
  const mono = new V.Layer('scene-mono', 'scene3d', 'Saved Scene');
  mono.params = monoParams(V);
  engine.layers = [mono];
  engine.activeLayerId = mono.id;
  engine.generate(mono.id);
  engine.computeAllDisplayGeometry();
  const state = engine.exportState();
  if (formatVersion === undefined) delete state.formatVersion; // truly pre-1.3.x (v0)
  else state.formatVersion = formatVersion;
  return state;
};

describe('Scene-tree Increment F — load-time monolith → tree migration', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // ── (format) the engine format version is 2 ────────────────────────────────
  test('VECTURA_FORMAT_VERSION is bumped to 2 and exportState stamps it', () => {
    expect(V.VECTURA_FORMAT_VERSION).toBe(2);
    const engine = new V.VectorEngine();
    expect(engine.exportState().formatVersion).toBe(2);
  });

  // ── (a) a LEGACY v1 monolith expands to a tree on import, ids preserved, and
  //        renders IDENTICALLY to the un-migrated monolith. ────────────────────
  test('legacy v1 monolith imports as a scene TREE, ids preserved, render unchanged', () => {
    // Baseline: import the SAME payload stamped v2 → left as a monolith
    // (inline-union render). This is what the file looked like before F.
    const baseEngine = new V.VectorEngine();
    baseEngine.importState(savedMonolithState(V, 2));
    const baseLayer = baseEngine.getLayerById('scene-mono');
    expect(baseLayer.type).toBe('scene3d');
    expect(baseLayer.isGroup).toBeFalsy();
    const baselinePaths = projectPaths(baseEngine.getRenderablePaths(baseLayer));
    expect(baselinePaths.length).toBeGreaterThan(0);

    // Migrated: the legacy v1 payload auto-expands into the canonical tree.
    const engine = new V.VectorEngine();
    engine.importState(savedMonolithState(V, 1));
    const group = engine.getLayerById('scene-mono');
    expect(group.type).toBe('scene3d');
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    // Inline arrays cleared — children are the single source of truth.
    expect(group.params.objects).toEqual([]);
    expect(group.params.groups).toEqual([]);
    expect(Array.isArray(group.params.lights) ? group.params.lights.length : 0).toBe(0);
    expect(group.params.ground.enabled).toBe(false);

    const kids = engine.getLayerDescendants('scene-mono');
    const objKids = kids.filter((l) => l.type === 'object3d');
    const boolKids = kids.filter((l) => l.type === 'booleanGroup3d');
    const lightKids = kids.filter((l) => l.type === 'sceneLight3d');
    const groundKids = kids.filter((l) => l.type === 'sceneGround3d');

    // IDENTITY CONTRACT — every inline id survives as a child LAYER id.
    expect(objKids.map((l) => l.id).sort()).toEqual(['cut-base', 'cut-tool', 'obj-1']);
    expect(boolKids.map((l) => l.id)).toEqual(['bg-1']);
    expect(lightKids.map((l) => l.id).sort()).toEqual(['p1', 'sun']);
    expect(groundKids.length).toBe(1);

    // The boolean operands are reparented under bg-1 with solid/hole roles.
    const cutBase = engine.getLayerById('cut-base');
    const cutTool = engine.getLayerById('cut-tool');
    expect(cutBase.parentId).toBe('bg-1');
    expect(cutTool.parentId).toBe('bg-1');
    expect(cutBase.params.role).toBe('solid');
    expect(cutTool.params.role).toBe('hole');
    // obj-1 stays a direct scene-group child.
    expect(engine.getLayerById('obj-1').parentId).toBe('scene-mono');

    // Per-object + per-face styles moved onto the object child.
    expect(engine.getLayerById('obj-1').params.style)
      .toEqual({ penId: 'pen-3', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 60 } });
    expect(engine.getLayerById('obj-1').params.faceStyles)
      .toEqual({ top: { penId: 'pen-2', mapper: 'wireframe', params: {} } });

    // THE GATE — the composed tree render equals the monolith render.
    const migratedPaths = projectPaths(engine.getRenderablePaths(group));
    expect(migratedPaths).toEqual(baselinePaths);
  });

  // ── (b) a saved TREE round-trips stably (no dupes, ids preserved, same
  //        render); re-importing at v1 does NOT double-expand it. ──────────────
  test('a tree scene round-trips stably and is never double-expanded', () => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    engine.addObjectToScene(gid, 'sphere');
    engine.computeAllDisplayGeometry();
    const beforeIds = engine.layers.map((l) => l.id).sort();
    const beforePaths = projectPaths(engine.getRenderablePaths(engine.getLayerById(gid)));

    const state = engine.exportState();
    expect(state.formatVersion).toBe(2);

    const engine2 = new V.VectorEngine();
    engine2.importState(state);
    // No duplicate layers, same ids.
    expect(engine2.layers.map((l) => l.id).sort()).toEqual(beforeIds);
    const grp2 = engine2.getLayerById(gid);
    expect(grp2.isGroup).toBe(true);
    expect(projectPaths(engine2.getRenderablePaths(grp2))).toEqual(beforePaths);

    // A tree stamped as a legacy v1 doc must NOT double-expand: the scene group
    // is already isGroup so the migration skips it; children are untouched.
    const engine3 = new V.VectorEngine();
    engine3.importState({ ...clone(state), formatVersion: 1 });
    expect(engine3.layers.map((l) => l.id).sort()).toEqual(beforeIds);
    expect(projectPaths(engine3.getRenderablePaths(engine3.getLayerById(gid)))).toEqual(beforePaths);
  });

  // ── (c) a bundled scene3d PRESET (monolith-shaped) loads + renders via the
  //        permanent inline-union path. ───────────────────────────────────────
  test('a scene3d preset loads as a monolith and renders (inline-union safety net)', () => {
    const preset = (V.PRESETS || []).find((p) => p.id === 'scene3d-studio-shadows');
    expect(preset).toBeTruthy();
    const engine = new V.VectorEngine();
    const layer = new V.Layer('preset-scene', 'scene3d', 'Preset Scene');
    layer.params = { ...layer.params, ...clone(preset.params) };
    engine.layers = [layer];
    engine.activeLayerId = layer.id;
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();
    // Renders (monolith, not a group — presets ride the inline-union path).
    expect(layer.isGroup).toBeFalsy();
    const paths = engine.getRenderablePaths(layer);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.meta && p.meta.kind === 'sceneEdge')).toBe(true);
  });

  // ── (d) the migration is idempotent (twice == once). ───────────────────────
  test('migration is idempotent — a second pass changes nothing', () => {
    const engine = new V.VectorEngine();
    engine.importState(savedMonolithState(V, 1));
    const afterFirst = engine.layers.map((l) => l.id).sort();
    const firstPaths = projectPaths(engine.getRenderablePaths(engine.getLayerById('scene-mono')));

    // Re-running the migration step is a no-op (scene group already isGroup).
    engine._migrateMonolithScenesToTree();
    engine.computeAllDisplayGeometry();
    expect(engine.layers.map((l) => l.id).sort()).toEqual(afterFirst);
    expect(engine.expandMonolithToTree('scene-mono')).toBeNull();
    expect(projectPaths(engine.getRenderablePaths(engine.getLayerById('scene-mono')))).toEqual(firstPaths);
  });

  // ── (e) a v0 (no formatVersion field) monolith also migrates. ──────────────
  test('a pre-1.3.x monolith with no formatVersion field also expands', () => {
    const engine = new V.VectorEngine();
    engine.importState(savedMonolithState(V, undefined));
    const group = engine.getLayerById('scene-mono');
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    expect(engine.getLayerDescendants('scene-mono').some((l) => l.type === 'object3d')).toBe(true);
  });
});
