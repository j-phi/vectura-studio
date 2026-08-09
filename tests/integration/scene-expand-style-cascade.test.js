const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * expandMonolithToTree — SCENE-SCOPE STYLE PRESERVATION.
 *
 * DEFECT (RGR red): expansion copied a leaf's style only when
 * `styleTable.byObject[obj.id]` existed. But `collectSceneParams` ALWAYS writes
 * `byObject[layerId] = <child's own style>` for every object3d child, so a
 * monolith styled ONLY at scene scope (byObject empty) expanded into a tree
 * whose children carry the default style ({penId:null, mapper:'none'}) — and
 * that empty byObject entry then WINS over the group's scene style in the
 * byFace > byObject > scene cascade (whole-style-wins, no per-field merge).
 * Result: the hatch fill vanished (sceneEdge paths present, sceneFill = 0).
 *
 * FIX: resolve the EFFECTIVE style at expansion time and materialize a WHOLE
 * clone of it on the child (never a partial/per-field copy — the cascade has no
 * merge semantics, so a partial copy would drop penId / mapper / params).
 *
 * Expansion is supposed to be behaviour-preserving, so the real contract asserted
 * here is COMPOSED-OUTPUT EQUIVALENCE: tree paths === monolith paths.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

const countKind = (paths, kind) =>
  (Array.isArray(paths) ? paths : []).filter((p) => p && p.meta && p.meta.kind === kind).length;

describe('expandMonolithToTree — scene-scope style survives expansion', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // A monolith with TWO objects and a scene-scope HATCH style. byObject is
  // EMPTY — every object renders through the scene scope.
  const sceneScopedMonolith = () => ({
    ...clone(V.ALGO_DEFAULTS.scene3d),
    seed: 7,
    objects: [
      {
        id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 60, sy: 60, sz: 60 },
        transform: { x: -30, y: 30, z: 0, yaw: 20, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid', role: 'solid',
      },
      {
        id: 'obj-2', name: 'Sphere 1', primitive: 'sphere', params: { radius: 34 },
        transform: { x: 50, y: 34, z: 10, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid', role: 'solid',
      },
    ],
    groups: [],
    lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }],
    ground: { enabled: false },
    styleTable: {
      scene: { penId: null, mapper: 'hatch', params: { hatchSpacing: 2.2, hatchAngle: 35 } },
      byObject: {},
      byFace: {},
    },
  });

  // Build a live engine holding ONE monolith, generated + composed.
  const monolithEngine = (params, id = 'mono-1') => {
    const engine = new V.VectorEngine();
    const mono = new V.Layer(id, 'scene3d', 'Scene');
    mono.params = params;
    engine.layers = [mono];
    engine.generate(mono.id);
    engine.computeAllDisplayGeometry();
    return { engine, mono };
  };

  // ── (1) THE DEFECT — scene-scope-only monolith keeps its fill after expansion ──
  test('a monolith styled ONLY at scene scope still emits sceneFill after expansion', () => {
    const base = monolithEngine(sceneScopedMonolith());
    const monoPaths = base.mono.paths || [];
    // Sanity: the monolith itself has both edges and fill.
    expect(countKind(monoPaths, 'sceneEdge')).toBeGreaterThan(0);
    expect(countKind(monoPaths, 'sceneFill')).toBeGreaterThan(0);

    const { engine, mono } = monolithEngine(sceneScopedMonolith());
    const gid = engine.expandMonolithToTree(mono.id);
    expect(gid).toBe(mono.id);
    const grp = engine.getLayerById(gid);

    // Every object3d child must carry the RESOLVED scene style as a whole clone.
    const kids = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d');
    expect(kids.length).toBe(2);
    kids.forEach((k) => {
      expect(k.params.style).toBeTruthy();
      expect(k.params.style.mapper).toBe('hatch');
      expect(k.params.style.params.hatchSpacing).toBe(2.2);
      expect(k.params.style.params.hatchAngle).toBe(35);
    });

    engine.computeAllDisplayGeometry();
    const treePaths = grp.scenePaths || [];
    expect(countKind(treePaths, 'sceneFill')).toBeGreaterThan(0);

    // THE REAL CONTRACT — expansion is behaviour-preserving.
    expect(treePaths.length).toBe(monoPaths.length);
    expect(treePaths).toEqual(monoPaths);
  });

  // ── (2) REGRESSION PIN — object-scope styles still work ───────────────────
  test('a monolith styled at OBJECT scope expands with per-object styles intact', () => {
    const params = () => {
      const p = sceneScopedMonolith();
      p.styleTable.byObject = {
        'obj-1': { penId: null, mapper: 'crosshatch', params: { hatchSpacing: 1.4, hatchAngle: 10 } },
        // obj-2 deliberately absent ⇒ inherits the scene hatch.
      };
      return p;
    };
    const base = monolithEngine(params());
    const monoPaths = base.mono.paths || [];

    const { engine, mono } = monolithEngine(params());
    const gid = engine.expandMonolithToTree(mono.id);
    const grp = engine.getLayerById(gid);
    const kids = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d');
    const byId = new Map(kids.map((k) => [k.id, k]));
    expect(byId.get('obj-1').params.style.mapper).toBe('crosshatch');
    expect(byId.get('obj-1').params.style.params.hatchSpacing).toBe(1.4);
    // The inheriting object materializes the SCENE style, whole.
    expect(byId.get('obj-2').params.style.mapper).toBe('hatch');
    expect(byId.get('obj-2').params.style.params.hatchAngle).toBe(35);

    engine.computeAllDisplayGeometry();
    expect(grp.scenePaths).toEqual(monoPaths);
  });

  // ── (3) byFace styles survive (face scope outranks the materialized object) ─
  test('byFace styles survive expansion and still outrank the object scope', () => {
    const params = () => {
      const p = sceneScopedMonolith();
      p.styleTable.byFace = {
        'obj-1/f0': { penId: null, mapper: 'stipple', params: { stippleDensity: 40 } },
      };
      return p;
    };
    const base = monolithEngine(params());
    const monoPaths = base.mono.paths || [];

    const { engine, mono } = monolithEngine(params());
    const gid = engine.expandMonolithToTree(mono.id);
    const grp = engine.getLayerById(gid);
    const kid = engine.getLayerDescendants(gid).find((l) => l.id === 'obj-1');
    expect(kid.params.faceStyles).toBeTruthy();
    expect(kid.params.faceStyles.f0.mapper).toBe('stipple');
    // …and the object scope is the materialized scene style, not the face one.
    expect(kid.params.style.mapper).toBe('hatch');

    engine.computeAllDisplayGeometry();
    expect(grp.scenePaths).toEqual(monoPaths);
  });

  // ── (4) whole-style-wins — a scene style with a penId is cloned WHOLE ──────
  test('the materialized style is a whole clone (penId + mapper + params), not a partial merge', () => {
    const p = sceneScopedMonolith();
    p.styleTable.scene = { penId: 'pen-2', mapper: 'contour', params: { contourSpacing: 3.1 } };
    const { engine, mono } = monolithEngine(p);
    const gid = engine.expandMonolithToTree(mono.id);
    const kid = engine.getLayerDescendants(gid).find((l) => l.id === 'obj-1');
    expect(kid.params.style.penId).toBe('pen-2');
    expect(kid.params.style.mapper).toBe('contour');
    expect(kid.params.style.params.contourSpacing).toBe(3.1);
    // Deep clone — mutating the child must not corrupt the group's scene style.
    kid.params.style.params.contourSpacing = 99;
    expect(engine.getLayerById(gid).params.styleTable.scene.params.contourSpacing).toBe(3.1);
  });

  // ── (5) booleanGroup3d children get the resolved style too ────────────────
  test('a boolean group child materializes the resolved scene style as well', () => {
    const p = sceneScopedMonolith();
    p.groups = [{ id: 'grp-1', name: 'Bool', op: 'subtract', children: ['obj-1', 'obj-2'] }];
    const { engine, mono } = monolithEngine(p);
    const gid = engine.expandMonolithToTree(mono.id);
    const bl = engine.getLayerDescendants(gid).find((l) => l.type === 'booleanGroup3d');
    expect(bl).toBeTruthy();
    expect(bl.params.style.mapper).toBe('hatch');
    expect(bl.params.style.params.hatchSpacing).toBe(2.2);
  });

  // ── (6) an ALREADY-EXPANDED tree is untouched ─────────────────────────────
  test('an already-expanded scene tree is left alone (idempotent)', () => {
    const { engine, mono } = monolithEngine(sceneScopedMonolith());
    const gid = engine.expandMonolithToTree(mono.id);
    engine.computeAllDisplayGeometry();
    const before = clone(engine.getLayerDescendants(gid).map((l) => ({ id: l.id, style: l.params.style })));
    expect(engine.expandMonolithToTree(gid)).toBeNull();
    const after = clone(engine.getLayerDescendants(gid).map((l) => ({ id: l.id, style: l.params.style })));
    expect(after).toEqual(before);
  });
});
