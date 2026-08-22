/**
 * Regression: getSceneObjectResolvedStyle / getSceneFaceResolvedStyle must be
 * CHILD-AWARE on a scene tree, mirroring _sceneStyleOwnerLayer (the write-side
 * fix already documented at renderer.js). Without this, both resolvers read
 * ONLY the group's `params.styleTable`, which the compositor's collect step
 * (Scene3D.Params.collectSceneParams) republishes from the child LAYER on
 * every compose but never writes BACK to `group.params.styleTable`. So a
 * child styled purely via the docked panel (which writes `child.params.style`
 * directly, never the group table) resolved as the group's SCENE default —
 * and `setSceneObjectStyle`'s own "current style" read used that same wrong
 * resolve as the base for a single-field patch, silently discarding every
 * other field. Fix: `_sceneStyleResolveTable` patches the resolve table with
 * the owner child's LIVE style/faceStyles before resolving, and every write
 * path (`setSceneObjectStyle`, `setSceneFaceStyle`) reads through it too.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('scene3d style resolve/write — child-aware (data-loss fix)', () => {
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

  const hatchObject = (overrides) => ({
    primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 20, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    style: {
      penId: 'pen-a', mapper: 'hatch',
      params: { fillAngle: 0, fillDensity: 55, toneLaw: 'ladder' },
    },
    faceStyles: {},
    ...overrides,
  });

  const mkRenderer = (engine) => {
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { history: ['initial'], pushHistory() { this.history.push('snap'); }, render() {} };
    return renderer;
  };

  // A scene TREE — group with an EMPTY styleTable (as a brand-new scene has),
  // whose object lives entirely on a child object3d layer's `params.style` —
  // exactly the state the docked panel's Style tab produces, and exactly the
  // shape a diagnostic agent found reproduces the panel/flyout disagreement.
  const buildTree = (objOverrides) => {
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
    Object.assign(child.params, hatchObject(objOverrides));
    child.parentId = grp.id;
    engine.layers.push(child);

    const renderer = mkRenderer(engine);
    renderer.setSceneSelection({
      layerId: grp.id, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [],
    });
    return { engine, renderer, grp, child };
  };

  // Legacy INLINE monolith — the negative/regression guard. No owner child
  // layer exists, so the group table stays the sole source of truth exactly
  // as before this fix.
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

  // ——— THE data-loss regression (RGR) —————————————————————————————————
  test('DATA-LOSS: a Pen-only ctxbar write must not revert a panel-set Type/mapper', () => {
    const { renderer, grp, child } = buildTree();
    expect(child.params.style.mapper).toBe('hatch'); // set via the "panel", never touched the group table

    // Exactly what the ctxbar Pen picker does: write penId alone.
    renderer.setSceneObjectStyle(grp.id, [child.id], { penId: 'pen-b' });

    expect(child.params.style.penId).toBe('pen-b');
    // This is the whole point: before the fix, setSceneObjectStyle's "current
    // style" read resolved the (empty) group table ⇒ scene default
    // ('wireframe'), so the whole-style write silently reverted mapper.
    expect(child.params.style.mapper).toBe('hatch');
    expect(child.params.style.params.fillDensity).toBe(55);
    expect(child.params.style.params.fillAngle).toBe(0);
  });

  // ——— getSceneObjectResolvedStyle is child-aware ——————————————————————
  test('getSceneObjectResolvedStyle returns the CHILD live style, not an empty scene resolve', () => {
    const { renderer, grp, child } = buildTree();
    const rs = renderer.getSceneObjectResolvedStyle(grp.id, child.id);
    expect(rs.mapper).toBe('hatch');
    expect(rs.penId).toBe('pen-a');
    expect(rs.params.fillDensity).toBe(55);
  });

  // ——— getSceneFaceResolvedStyle is child-aware ————————————————————————
  test('getSceneFaceResolvedStyle falls through to the CHILD object style (no byFace override)', () => {
    const { renderer, grp, child } = buildTree();
    const rs = renderer.getSceneFaceResolvedStyle(grp.id, `${child.id}/top`);
    expect(rs.mapper).toBe('hatch');
    expect(rs.penId).toBe('pen-a');
  });

  test('getSceneFaceResolvedStyle prefers the CHILD live faceStyles override over the object style', () => {
    const { renderer, grp, child } = buildTree();
    child.params.faceStyles = {
      top: { penId: 'pen-face', mapper: 'contourSlice', params: { fillDensity: 20 } },
    };
    const rs = renderer.getSceneFaceResolvedStyle(grp.id, `${child.id}/top`);
    expect(rs.mapper).toBe('contourSlice');
    expect(rs.penId).toBe('pen-face');
    // A different face on the same object still falls through to the object style.
    const other = renderer.getSceneFaceResolvedStyle(grp.id, `${child.id}/bottom`);
    expect(other.mapper).toBe('hatch');
  });

  // ——— each affected field round-trips a single-field ctxbar write ————————
  test.each([
    ['mapper', 'wireframe', (s) => s.mapper],
    ['penId', 'pen-c', (s) => s.penId],
  ])('whole-style field %s round-trips without clobbering the others', (key, value, pick) => {
    const { renderer, grp, child } = buildTree();
    renderer.setSceneObjectStyle(grp.id, [child.id], { [key]: value });
    expect(pick(child.params.style)).toBe(value);
    if (key !== 'mapper') expect(child.params.style.mapper).toBe('hatch');
    if (key !== 'penId') expect(child.params.style.penId).toBe('pen-a');
  });

  test.each([
    ['toneLaw', 'stripe'],
    ['fillDensity', 80],
    ['fillAngle', 45],
  ])('style.params field %s round-trips without clobbering sibling params', (key, value) => {
    const { renderer, grp, child } = buildTree();
    const cur = renderer.getSceneObjectResolvedStyle(grp.id, child.id);
    renderer.setSceneObjectStyle(grp.id, [child.id], { params: { ...cur.params, [key]: value } });
    expect(child.params.style.params[key]).toBe(value);
    expect(child.params.style.mapper).toBe('hatch');
    // The other two params.* fields from the original style must survive.
    Object.keys(cur.params).forEach((k) => {
      if (k === key) return;
      expect(child.params.style.params[k]).toBe(cur.params[k]);
    });
  });

  // ——— NEGATIVE / regression guard: legacy inline monolith is untouched ————
  test('MONOLITH regression guard: resolve/write still use the group table exactly as before', () => {
    const { renderer, leaf } = buildMonolith();
    const rs = renderer.getSceneObjectResolvedStyle(leaf.id, 'obj-1');
    expect(rs.mapper).toBe('hatch');
    expect(rs.params.fillDensity).toBe(55);

    renderer.setSceneObjectStyle(leaf.id, ['obj-1'], { penId: 'pen-z' });
    const table = leaf.params.styleTable;
    expect(table.byObject['obj-1'].penId).toBe('pen-z');
    // Not reverted — the monolith path never had the read-side bug because it
    // never had an owner child layer to disagree with the group table.
    expect(table.byObject['obj-1'].mapper).toBe('hatch');
    expect(table.byObject['obj-1'].params.fillDensity).toBe(55);
  });
});
