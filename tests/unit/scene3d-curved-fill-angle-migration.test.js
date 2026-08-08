const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const xrayGolden = require('../fixtures/xray-fold-golden.json');

/*
 * CURVED FILL ANGLE — SCENE_VERSION 2 → 3 migration.
 *
 * Scene3D.SurfaceFill listed `fillAngle` in its opts contract but never READ it:
 * every chart-wrapped primitive was hard-wired to the meridian family, so the
 * Style > Hatch > Angle dial did nothing on a sphere / cylinder / cone / torus /
 * capsule / superellipsoid / torusKnot / pyramid / ellipsoid. The panel seeds a
 * fresh hatch at 45, so effectively every saved scene STORES 45 while RENDERING
 * meridians. Now that the angle is live those documents would open as a helical
 * wrap — a silent, visible change to existing artwork.
 *
 * SCENE_MIGRATIONS[2] pins fillAngle = 0 (the meridian family) on the CURVED
 * objects of a pre-v3 payload, so it renders byte-identically, while anything
 * born at v3 keeps the 45 the panel seeds.
 *
 * The migration must be surgical: box / plane / solid (polyhedra AND imported
 * meshes) never reach SurfaceFill and always honoured the angle, so pinning
 * them would corrupt a document that was already correct.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
// scene3d paths are Arrays with a `.meta` property JSON.stringify drops.
const ser = (paths) => (paths || []).map((pp) => ({ pts: Array.from(pp), meta: pp.meta || null }));

// Every primitive scene3d.js charts through SurfaceFill (TOPOFORM_MODES).
const CURVED = {
  sphere: { radius: 40, detail: 20 },
  ellipsoid: { sx: 30, sy: 20, sz: 22, detail: 20 },
  cylinder: { sx: 25, sy: 40, sz: 25, detail: 20 },
  cone: { sx: 25, sy: 40, sz: 25, detail: 20 },
  torus: { sx: 30, sy: 12, sz: 30, detail: 20 },
  capsule: { sx: 20, sy: 40, sz: 20, detail: 20 },
  superellipsoid: { sx: 30, sy: 30, sz: 30, detail: 20 },
  torusKnot: { sx: 28, sy: 10, sz: 28, detail: 20 },
  pyramid: { sx: 30, sy: 35, sz: 30, detail: 12 },
};
const FACETED = {
  box: { sx: 40, sy: 40, sz: 40 },
  plane: { sx: 120, sz: 120 },
  solid: { solidType: 'buckyball', radius: 30 },
};

describe('Scene3D — curved fill-angle migration (SCENE_VERSION 2 → 3)', () => {
  let runtime; let V; let algo; let Params; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D.Params;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // A monolith scene: one object, one scene-wide style, at an explicit version.
  const scene = (primitive, params, styleParams, sceneVersion, mapper) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive, params: clone(params),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: mapper || 'hatch', params: { fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = sceneVersion;
    return p;
  };
  const render = (p) => ser(algo.generate(p, null, null, BOUNDS));
  const fills = (p) => (algo.generate(p, null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const geomKey = (paths) => paths
    .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';')).join('|');
  const effAngle = (p, id) => {
    const t = p.styleTable || {};
    const s = (t.byObject && t.byObject[id]) || t.scene || {};
    return (s.params || {}).fillAngle;
  };

  // ── The version itself. ────────────────────────────────────────────────────
  test('SCENE_VERSION is 3 and the chain reaches it', () => {
    expect(Params.SCENE_VERSION).toBe(3);
    expect(Params.sanitizeSceneParams(scene('sphere', CURVED.sphere, { fillAngle: 45 }, 1)).sceneVersion).toBe(3);
    expect(Params.sanitizeSceneParams(scene('sphere', CURVED.sphere, { fillAngle: 45 }, 2)).sceneVersion).toBe(3);
  });

  test('a fresh scene is born at SCENE_VERSION, so it is never migrated', () => {
    expect(defaults.sceneVersion).toBe(Params.SCENE_VERSION);
  });

  // ── THE POINT: a pre-v3 document keeps today's look. ───────────────────────
  describe.each(Object.keys(CURVED))('%s', (primitive) => {
    const params = CURVED[primitive];

    test.each(['hatch', 'crosshatch'])('a v2 %s at 45 renders as the meridian family after migration', (mapper) => {
      const migrated = Params.sanitizeSceneParams(scene(primitive, params, { fillAngle: 45 }, 2, mapper));
      const meridians = scene(primitive, params, { fillAngle: 0 }, Params.SCENE_VERSION, mapper);
      expect(effAngle(migrated, 'o1')).toBe(0);
      expect(render(migrated)).toEqual(render(meridians));
      // …and that is genuinely NOT what an unmigrated 45 now draws.
      const unmigrated = scene(primitive, params, { fillAngle: 45 }, Params.SCENE_VERSION, mapper);
      expect(geomKey(fills(unmigrated))).not.toBe(geomKey(fills(meridians)));
    });
  });

  // The strongest pin available: an UNTOUCHED pre-existing fixture. The x-ray
  // fold golden was captured on a v1 sphere whose style says 45 — back when 45
  // was ignored, so the fixture holds meridian art. Feed that exact document
  // through the migration chain and it must still reproduce byte-for-byte.
  test('the v1 x-ray SPHERE golden (captured at 45) still reproduces byte-for-byte', () => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'x', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'xray',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = 1;
    expect(render(Params.sanitizeSceneParams(p))).toEqual(xrayGolden.xraySphere);
  });

  // ── An ABSENT fillAngle is 45, not 0 (scene3d.js reads finite(sp.fillAngle, 45)).
  // This is the shipped `scene3d-studio-shadows` preset's exact shape.
  test('a curved hatch with NO fillAngle key is pinned too (absent means 45)', () => {
    const src = scene('sphere', CURVED.sphere, {}, 1);
    expect(src.styleTable.scene.params.fillAngle).toBeUndefined();
    const migrated = Params.sanitizeSceneParams(src);
    expect(effAngle(migrated, 'o1')).toBe(0);
    expect(render(migrated)).toEqual(render(scene('sphere', CURVED.sphere, { fillAngle: 0 }, Params.SCENE_VERSION)));
  });

  // ── Idempotency. ───────────────────────────────────────────────────────────
  test('running the migration twice equals running it once', () => {
    const once = Params.sanitizeSceneParams(scene('sphere', CURVED.sphere, { fillAngle: 45 }, 2));
    const twice = Params.sanitizeSceneParams(once);
    expect(twice.styleTable).toEqual(once.styleTable);
    expect(render(twice)).toEqual(render(once));
  });

  test('an object already on the meridian axis is left completely alone', () => {
    // 0 and 180 both take the legacy axis emitters, so neither needs a rewrite —
    // and no byObject override is materialized for them.
    [0, 180].forEach((angle) => {
      const migrated = Params.sanitizeSceneParams(scene('sphere', CURVED.sphere, { fillAngle: angle }, 2));
      expect(migrated.styleTable.byObject.o1).toBeUndefined();
      expect(effAngle(migrated, 'o1')).toBe(angle);
    });
  });

  // ── Surgical: everything that already honoured the angle is untouched. ─────
  test.each(Object.keys(FACETED))('a faceted %s at 45 is NOT migrated', (primitive) => {
    const src = scene(primitive, FACETED[primitive], { fillAngle: 45 }, 2);
    const migrated = Params.sanitizeSceneParams(src);
    expect(migrated.styleTable.byObject.o1).toBeUndefined();
    expect(effAngle(migrated, 'o1')).toBe(45);
    expect(render(migrated)).toEqual(render(scene(primitive, FACETED[primitive], { fillAngle: 45 }, Params.SCENE_VERSION)));
  });

  test('a faceted CSG group (box − box) at 45 is NOT migrated', () => {
    const p = clone(defaults);
    p.objects = [
      { id: 'o1', name: 'a', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'o2', name: 'b', primitive: 'box', params: { sx: 24, sy: 60, sz: 24 }, role: 'hole',
        transform: { x: 10, y: 50, z: 10, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    p.groups = [{ id: 'grp-1', name: 'g', op: 'subtract', children: ['o1', 'o2'] }];
    p.ground = { enabled: false };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = 2;
    const migrated = Params.sanitizeSceneParams(p);
    expect(migrated.styleTable.byObject).toEqual({});
    const untouched = clone(p); untouched.sceneVersion = Params.SCENE_VERSION;
    expect(render(migrated)).toEqual(render(Params.sanitizeSceneParams(untouched)));
  });

  test.each(['contour', 'spiral', 'stipple', 'wireframe', 'none'])(
    'a curved object mapped to %s is NOT migrated (no Angle control on those)', (mapper) => {
      const migrated = Params.sanitizeSceneParams(scene('sphere', CURVED.sphere, { fillAngle: 45 }, 2, mapper));
      expect(migrated.styleTable.byObject.o1).toBeUndefined();
      expect(effAngle(migrated, 'o1')).toBe(45);
    },
  );

  // ── A mixed scene: the pin must not leak through the shared scene style. ───
  test('pinning a sphere leaves a box sharing the same SCENE style at 45', () => {
    const p = clone(defaults);
    p.objects = [
      { id: 'sp', name: 'sphere', primitive: 'sphere', params: CURVED.sphere,
        transform: { x: -45, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'bx', name: 'box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 55, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = 2;
    const migrated = Params.sanitizeSceneParams(p);
    // The sphere gets a materialized whole-style override at 0; the scene style
    // (which the box still resolves through) keeps its 45.
    expect(migrated.styleTable.byObject.sp.params.fillAngle).toBe(0);
    expect(migrated.styleTable.byObject.sp.mapper).toBe('hatch');
    expect(migrated.styleTable.byObject.bx).toBeUndefined();
    expect(migrated.styleTable.scene.params.fillAngle).toBe(45);
    // …and the box's own line art is unchanged by the migration.
    const objOf = (paths, id) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill'
      && pp.meta.sceneTarget && pp.meta.sceneTarget.objectId === id);
    const before = clone(p); before.sceneVersion = Params.SCENE_VERSION;
    const boxBefore = objOf(algo.generate(before, null, null, BOUNDS) || [], 'bx');
    const boxAfter = objOf(algo.generate(migrated, null, null, BOUNDS) || [], 'bx');
    expect(boxAfter.length).toBeGreaterThan(0);
    expect(geomKey(boxAfter)).toBe(geomKey(boxBefore));
  });

  test('an existing per-object override is pinned in place, not replaced', () => {
    const p = scene('sphere', CURVED.sphere, { fillAngle: 10 }, 2);
    p.styleTable.byObject.o1 = { penId: 'pen-2', mapper: 'crosshatch', params: { fillAngle: 45, fillDensity: 22 } };
    const migrated = Params.sanitizeSceneParams(p);
    expect(migrated.styleTable.byObject.o1.penId).toBe('pen-2');
    expect(migrated.styleTable.byObject.o1.mapper).toBe('crosshatch');
    expect(migrated.styleTable.byObject.o1.params.fillDensity).toBe(22);
    expect(migrated.styleTable.byObject.o1.params.fillAngle).toBe(0);
  });

  test('a per-FACE override on a curved object is pinned (byFace wins over byObject)', () => {
    const p = scene('sphere', CURVED.sphere, { fillAngle: 0 }, 2);
    p.styleTable.byFace['o1/face:3'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } };
    p.styleTable.byFace['other/face:3'] = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } };
    const migrated = Params.sanitizeSceneParams(p);
    expect(migrated.styleTable.byFace['o1/face:3'].params.fillAngle).toBe(0);
    // A face key belonging to some other (non-curved / unknown) object is left alone.
    expect(migrated.styleTable.byFace['other/face:3'].params.fillAngle).toBe(45);
  });

  // ── The scene-TREE shape: an object3d LEAF layer carries its own style. ────
  test('an object3d leaf layer (curved) is pinned; a faceted leaf is not', () => {
    const leaf = (primitive) => ({
      sceneVersion: 2, primitive, params: clone(CURVED.sphere),
      style: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } },
    });
    const curvedLeaf = Params.migrateScene(leaf('sphere'));
    expect(curvedLeaf.style.params.fillAngle).toBe(0);
    expect(curvedLeaf.sceneVersion).toBe(3);
    const facetedLeaf = Params.migrateScene(leaf('box'));
    expect(facetedLeaf.style.params.fillAngle).toBe(45);
  });

  test('an object3d leaf faceStyles bag is pinned too', () => {
    const migrated = Params.migrateScene({
      sceneVersion: 2, primitive: 'torus', params: clone(CURVED.torus),
      style: { penId: null, mapper: 'contour', params: { fillAngle: 45 } },
      faceStyles: { 'face:1': { penId: null, mapper: 'crosshatch', params: { fillAngle: 45 } } },
    });
    expect(migrated.style.params.fillAngle).toBe(45);          // contour has no Angle control
    expect(migrated.faceStyles['face:1'].params.fillAngle).toBe(0);
  });

  // ── Forward: a v3 document keeps the angle the user set. ───────────────────
  test('a v3 curved hatch at 45 is NOT migrated and really does wrap helically', () => {
    const p = scene('sphere', CURVED.sphere, { fillAngle: 45 }, Params.SCENE_VERSION);
    const migrated = Params.sanitizeSceneParams(p);
    expect(effAngle(migrated, 'o1')).toBe(45);
    expect(geomKey(fills(migrated)))
      .not.toBe(geomKey(fills(scene('sphere', CURVED.sphere, { fillAngle: 0 }, Params.SCENE_VERSION))));
  });
});
