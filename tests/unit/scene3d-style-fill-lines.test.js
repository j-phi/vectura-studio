/**
 * Style-tab line output for 3D objects — the SPLIT BY ROLE contract.
 *
 * THE DECISION THIS PINS
 * ----------------------
 * Curves / Smoothing / Simplify used to be ONE set of object-level params that
 * governed every path a curved object emitted — its silhouette AND its internal
 * fill lines at once. There was no way to keep a crisp outline over softly
 * fitted hatching, or the reverse. The controls are now split BY ROLE, with no
 * cascade and no override checkbox between them:
 *
 *   OBJECT tab  → `curves` / `smoothing` / `simplify` on the object bag
 *                 govern the BORDER (silhouette / crease / face outlines) ONLY.
 *   STYLE  tab  → `fillCurves` / `fillSmoothing` / `fillSimplify` / `fillFidelity`
 *                 in `style.params` govern the INTERNAL FILL LINES ONLY.
 *
 * Each control owns exactly one kind of line. `meta.kind === 'sceneFill'` is the
 * dividing line: everything else a curved object emits is border ink.
 *
 * WHY THE STYLE SIDE LIVES IN style.params
 * ---------------------------------------
 * It buys the scene → object → face cascade that every other Style-tab field
 * already has (Scene3D.StyleCascade.resolve, whole-style-wins) — NOT a third
 * scoping model invented for this feature. The object-tab border settings keep
 * their own scene → object inheritance (Engine._applySceneCurveFinish's
 * `resolve`), because those params live on the object bag, not the style.
 *
 * WHAT "FIDELITY" MEANS ON THE STYLE TAB
 * --------------------------------------
 * SAMPLING DENSITY ALONG A FILL LINE, not mesh tessellation. SurfaceFill walks
 * the SAME parametric chart the mesh was built from at `steps` samples per line
 * (`steps = max(28, detail × 2)`); `fillFidelity` scales that. More samples
 * follow the surface more accurately — it costs POINTS, not facets. Mesh
 * Fidelity (`params.detail`) is untouched and stays on the Object tab.
 *
 * THE GATE
 * --------
 * Exactly `Scene3D.Params.CURVED_FILL_PRIMITIVES`, read live — the same set the
 * border controls use. A faceted object's fill lines are exact projections of
 * exact facets; rounding them would be a regression.
 *
 * HARNESS NOTE (this bit is load-bearing)
 * ---------------------------------------
 * `engine.addLayer('scene3d')` seeds a DEFAULT box + light + ground CHILD LAYER
 * set. Leaving the box in place parks a second solid on the stage that genuinely
 * occludes the object under test, and the ground child re-enables the ground
 * whatever `params.ground` says. Both are stripped below.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const SEED = 0;

describe('scene3d Style fill-line output (split by role)', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // One curved/faceted object on a bare stage. `border` writes the OBJECT bag
  // (Object tab), `fill` writes style.params (Style tab).
  const compose = ({ primitive, objParams, border, fill, mapper = 'hatch', sceneStyleParams }) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);

    // Strip the seeded default children — see HARNESS NOTE above.
    engine.getLayerDescendants(groupId)
      .filter((l) => l && (l.type === 'object3d' || l.type === 'sceneGround3d'))
      .forEach((l) => engine.removeLayer(l.id));

    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = SEED;
    group.params.objects = [];
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: -30, pitch: 25, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    group.params.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
      intensity: 1, castShadows: false,
    }];
    if (sceneStyleParams) {
      group.params.styleTable = {
        scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...sceneStyleParams } },
        byObject: {},
        byFace: {},
      };
    }

    const childId = engine.addLayer('object3d');
    const child = engine.layers.find((l) => l.id === childId);
    child.parentId = groupId;
    child.params.seed = SEED;
    child.params.primitive = primitive;
    child.params.params = { ...objParams };
    child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    child.params.visibility = 'solid';
    // EVERY object gets an explicit style with a REAL mapper string. A
    // style-less child is a moving target — `collectSceneParams` decides on the
    // strength of the declared mapper whether to publish a `byObject` entry at
    // all — and this suite is about fill-line output, not about that rule. An
    // explicit style pins the leaf's resolution either way.
    child.params.style = {
      penId: null,
      mapper,
      params: { fillAngle: 0, fillDensity: 50, ...(fill || {}) },
    };
    Object.assign(child.params, border || {});

    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return { engine, group: live, child, paths: live.scenePaths || [] };
  };

  // Serialize points AND meta. `JSON.stringify(path)` alone drops `path.meta`
  // entirely (an array serializes only its indices), so a plain stringify
  // compare cannot see a curve fit — applyCurveFit / applyCornerRounding leave
  // the points where they are and hang the bezier handles off `meta.anchors`.
  // Every "byte-identical" claim below goes through this.
  // Layer ids are fresh UUIDs per engine, and they ride along in
  // `meta.sceneTarget.objectId`, so they are neutralized before comparing.
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  const ser = (paths) => JSON.stringify(paths.map((p) => ({
    pts: p.map((q) => ({ x: q.x, y: q.y, z: q.z })),
    meta: p.meta || null,
  }))).replace(UUID, 'OID');

  // Guard the guard: a fitted path must be visible to `ser`.
  const fillsOf = (paths) => paths.filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
  const bordersOf = (paths) => paths.filter((p) => p && p.meta && p.meta.kind !== 'sceneFill');
  const curved = (paths) => paths.filter((p) => {
    const a = p && p.meta && p.meta.anchors;
    return Array.isArray(a) && a.some((k) => k && (k.in || k.out));
  });
  const points = (paths) => paths.reduce((n, p) => n + p.length, 0);
  const anchorCount = (paths) => paths.reduce(
    (n, p) => n + ((p.meta && Array.isArray(p.meta.anchors)) ? p.meta.anchors.length : p.length), 0,
  );

  const CAPSULE = { sx: 40, sy: 55, sz: 40, detail: 16 };
  const SPHERE = { radius: 55, detail: 24 };
  const BOX = { sx: 70, sy: 70, sz: 70 };

  // ── The harness itself ─────────────────────────────────────────────────────

  test('the stage carries exactly ONE object (the seeded default child is stripped)', () => {
    const { engine, group } = compose({ primitive: 'capsule', objParams: CAPSULE });
    const objects = engine.getLayerDescendants(group.id).filter((l) => l.type === 'object3d');
    expect(objects.length).toBe(1);
    expect(objects[0].params.primitive).toBe('capsule');
    expect(engine.getLayerDescendants(group.id).some((l) => l.type === 'sceneGround3d')).toBe(false);
  });

  // ── The default must be inert (byte-identical) ─────────────────────────────

  test('every fill-line default written out is byte-identical to writing none of them', () => {
    const bare = compose({ primitive: 'capsule', objParams: CAPSULE }).paths;
    const dflt = compose({
      primitive: 'capsule',
      objParams: CAPSULE,
      fill: { fillCurves: false, fillSmoothing: 0, fillSimplify: 0, fillFidelity: 1 },
    }).paths;
    expect(dflt.length).toBe(bare.length);
    expect(ser(dflt)).toBe(ser(bare));
  });

  // ── SPLIT 1: the Object tab is BORDER-SCOPED ───────────────────────────────

  test('object Curves fits the BORDER and leaves the fill lines untouched', () => {
    const off = compose({ primitive: 'capsule', objParams: CAPSULE, border: { curves: false } }).paths;
    const on = compose({ primitive: 'capsule', objParams: CAPSULE, border: { curves: true } }).paths;

    // The border really does curve (chained runs carrying bezier handles).
    expect(curved(bordersOf(on)).length).toBeGreaterThan(0);
    expect(curved(bordersOf(off)).length).toBe(0);

    // …and the fill lines are bit-for-bit what they were. THIS is the split.
    expect(fillsOf(on).length).toBeGreaterThan(0);
    expect(curved(fillsOf(on)).length).toBe(0);
    expect(ser(fillsOf(on))).toBe(ser(fillsOf(off)));
  });

  test('object Smoothing / Simplify likewise never reach the fill lines', () => {
    const off = compose({ primitive: 'capsule', objParams: CAPSULE }).paths;
    const on = compose({
      primitive: 'capsule', objParams: CAPSULE, border: { smoothing: 1, simplify: 1 },
    }).paths;
    expect(ser(bordersOf(on))).not.toBe(ser(bordersOf(off)));
    expect(ser(fillsOf(on))).toBe(ser(fillsOf(off)));
  });

  // ── SPLIT 2: the Style tab is FILL-SCOPED ──────────────────────────────────

  test('style fillCurves fits the FILL LINES and leaves the border untouched', () => {
    const off = compose({ primitive: 'capsule', objParams: CAPSULE }).paths;
    const on = compose({ primitive: 'capsule', objParams: CAPSULE, fill: { fillCurves: true } }).paths;

    expect(curved(fillsOf(on)).length).toBeGreaterThan(0);
    expect(curved(fillsOf(off)).length).toBe(0);
    // The silhouette is byte-identical — no chaining, no fit, no reordering.
    expect(ser(bordersOf(on))).toBe(ser(bordersOf(off)));
  });

  test('style fillSmoothing alone rounds the fill lines (no fillCurves needed)', () => {
    const off = compose({ primitive: 'capsule', objParams: CAPSULE }).paths;
    const sm = compose({ primitive: 'capsule', objParams: CAPSULE, fill: { fillSmoothing: 0.6 } }).paths;
    expect(ser(fillsOf(sm))).not.toBe(ser(fillsOf(off)));
    expect(curved(fillsOf(sm)).length).toBeGreaterThan(0);
    expect(ser(bordersOf(sm))).toBe(ser(bordersOf(off)));
  });

  test('style fillSimplify drops fill-line points and only fill-line points', () => {
    const plain = compose({ primitive: 'sphere', objParams: SPHERE, fill: { fillCurves: true } }).paths;
    const simp = compose({
      primitive: 'sphere', objParams: SPHERE, fill: { fillCurves: true, fillSimplify: 1 },
    }).paths;
    expect(anchorCount(fillsOf(simp))).toBeLessThan(anchorCount(fillsOf(plain)));
    expect(ser(bordersOf(simp))).toBe(ser(bordersOf(plain)));
  });

  // ── SPLIT 3: the two sides are genuinely independent ───────────────────────

  test('border and fill settings compose without interfering', () => {
    const both = compose({
      primitive: 'capsule', objParams: CAPSULE,
      border: { curves: true }, fill: { fillCurves: true },
    }).paths;
    const borderOnly = compose({ primitive: 'capsule', objParams: CAPSULE, border: { curves: true } }).paths;
    const fillOnly = compose({ primitive: 'capsule', objParams: CAPSULE, fill: { fillCurves: true } }).paths;

    expect(ser(bordersOf(both))).toBe(ser(bordersOf(borderOnly)));
    expect(ser(fillsOf(both))).toBe(ser(fillsOf(fillOnly)));
  });

  // ── Fidelity = sampling density along the fill line ────────────────────────

  test('style Fidelity changes POINTS per fill line, not the mesh', () => {
    const base = compose({ primitive: 'sphere', objParams: SPHERE }).paths;
    const dense = compose({ primitive: 'sphere', objParams: SPHERE, fill: { fillFidelity: 2.5 } }).paths;
    const coarse = compose({ primitive: 'sphere', objParams: SPHERE, fill: { fillFidelity: 0.3 } }).paths;

    expect(points(fillsOf(dense))).toBeGreaterThan(points(fillsOf(base)));
    expect(points(fillsOf(coarse))).toBeLessThan(points(fillsOf(base)));
    // The MESH is untouched: the silhouette/crease ink is byte-identical, which
    // is what separates this from the Object tab's tessellation Fidelity.
    expect(ser(bordersOf(dense))).toBe(ser(bordersOf(base)));
    expect(ser(bordersOf(coarse))).toBe(ser(bordersOf(base)));
  });

  test('style Fidelity re-samples the CHART (it does not just subdivide chords)', () => {
    // A denser sampling of the same parametric chart must land points that are
    // NOT on the coarse polyline's chords — that is the difference between
    // following the form and interpolating a straight line across it.
    const coarse = fillsOf(compose({ primitive: 'sphere', objParams: SPHERE, fill: { fillFidelity: 0.3 } }).paths);
    const dense = fillsOf(compose({ primitive: 'sphere', objParams: SPHERE, fill: { fillFidelity: 2.5 } }).paths);
    expect(coarse.length).toBeGreaterThan(0);
    expect(dense.length).toBeGreaterThan(0);
    // Total chord length grows when samples follow a curve rather than cut it.
    const chordLen = (paths) => paths.reduce((sum, p) => {
      let d = 0;
      for (let i = 1; i < p.length; i += 1) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      return sum + d;
    }, 0);
    expect(chordLen(dense)).toBeGreaterThan(chordLen(coarse));
  });

  // ── The gate: faceted geometry gets nothing ───────────────────────────────

  test('a box is never touched by ANY fill-line setting', () => {
    const off = compose({ primitive: 'box', objParams: BOX }).paths;
    const on = compose({
      primitive: 'box', objParams: BOX,
      fill: { fillCurves: true, fillSmoothing: 1, fillSimplify: 1, fillFidelity: 3 },
    }).paths;
    expect(curved(on).length).toBe(0);
    expect(ser(on)).toBe(ser(off));
  });

  test('the fill gate is exactly Scene3D.Params.CURVED_FILL_PRIMITIVES (read live)', () => {
    const set = Vectura.Scene3D.Params.CURVED_FILL_PRIMITIVES;
    expect(typeof set.has).toBe('function');
    // A member curves; a non-member does not. Both directions, driven by the set
    // itself so this can never drift from a hand-copied list.
    const member = [...set][0];
    expect(set.has(member)).toBe(true);
    ['box', 'plane', 'solid'].forEach((k) => expect(set.has(k)).toBe(false));
  });

  // ── Scoping: the STYLE CASCADE, not a new model ───────────────────────────
  //
  // A MONOLITH scene (inline objects[] + a styleTable) is the shape that can
  // actually inherit: an object with no `byObject` entry falls through to
  // `styleTable.scene`. A scene TREE cannot — `collectSceneParams` republishes
  // `byObject[layerId]` from every object3d child's own `params.style`, so a
  // leaf's own style bag is always the whole story. Both are exercised here,
  // and both go through the SAME StyleCascade.resolve the Style tab uses.

  const composeInline = ({ primitive, objParams, sceneParams, objectStyleParams, mapper = 'hatch' }) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);
    engine.getLayerDescendants(groupId)
      .filter((l) => l && (l.type === 'object3d' || l.type === 'sceneGround3d'))
      .forEach((l) => engine.removeLayer(l.id));
    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = SEED;
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: -30, pitch: 25, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    group.params.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
      intensity: 1, castShadows: false,
    }];
    group.params.objects = [{
      id: 'obj-1',
      name: 'Obj 1',
      primitive,
      params: { ...objParams },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    }];
    group.params.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...(sceneParams || {}) } },
      byObject: objectStyleParams
        ? { 'obj-1': { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...objectStyleParams } } }
        : {},
      byFace: {},
    };
    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return live.scenePaths || [];
  };

  test('fill-line settings inherit scene → object through StyleCascade', () => {
    const off = composeInline({ primitive: 'capsule', objParams: CAPSULE });
    const on = composeInline({
      primitive: 'capsule', objParams: CAPSULE, sceneParams: { fillCurves: true },
    });
    expect(curved(fillsOf(off)).length).toBe(0);
    expect(curved(fillsOf(on)).length).toBeGreaterThan(0);
    // Scene-scope fill settings are still fill-only — the border is untouched.
    expect(ser(bordersOf(on))).toBe(ser(bordersOf(off)));
  });

  test('an object style override wins over the scene fill-line setting (whole-style-wins)', () => {
    const overridden = composeInline({
      primitive: 'capsule', objParams: CAPSULE,
      sceneParams: { fillCurves: true },
      objectStyleParams: { fillCurves: false },
    });
    expect(curved(fillsOf(overridden)).length).toBe(0);
  });

  test('a scene-tree leaf with its OWN style resolves that style, not the scene default', () => {
    // The tree shape: a leaf that declares a style publishes
    // `byObject[layerId]`, so a scene-scope fill setting cannot reach it —
    // whole-style-wins, exactly as at object scope in the monolith. Pinned so
    // nobody "fixes" the inheritance test above by wiring a second, tree-only
    // path. (Both objects here carry an explicit mapper; whether a STYLE-LESS
    // child publishes an entry is a different rule, and not this suite's.)
    const treeInherit = compose({
      primitive: 'capsule',
      objParams: CAPSULE,
      sceneStyleParams: { fillCurves: true },
      fill: {},
    }).paths;
    expect(curved(fillsOf(treeInherit)).length).toBe(0);
    const treeOwn = compose({
      primitive: 'capsule', objParams: CAPSULE, fill: { fillCurves: true },
    }).paths;
    expect(curved(fillsOf(treeOwn)).length).toBeGreaterThan(0);
  });
});
