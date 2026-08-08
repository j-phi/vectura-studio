const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const golden = require('../fixtures/xray-fold-golden.json');
const overlayGolden = require('../fixtures/xray-fold-overlay-golden.json');

/*
 * X-RAY FOLD (Option A, PURE) — x-ray owns only see-through back-face FILLS;
 * hidden-EDGE dashing is owned entirely by edgeStyles.hidden. A SCENE_VERSION
 * 1→2 migration seeds edgeStyles.hidden = dash on every x-ray object so an
 * existing saved scene renders BYTE-IDENTICALLY. This test proves:
 *   (a) migration byte-identity vs the pre-fold golden (box + sphere + mixed),
 *   (b) x-ray back-face fills unchanged,
 *   (c) NEW: an x-ray object whose edgeStyles.hidden is 'drop' drops hidden edges,
 *   (d) non-x-ray unaffected.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
// scene3d paths are Arrays with a `.meta` property JSON.stringify drops — the
// golden was captured with THIS serializer, so compare through it.
const ser = (paths) => (paths || []).map((pp) => ({ pts: Array.from(pp), meta: pp.meta || null }));

describe('Scene3D x-ray fold — migration + emit', () => {
  let runtime; let V; let algo; let Params; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D.Params;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (primitive, visibility, styleParams) => {
    const p = clone(defaults);
    const params = primitive === 'sphere' ? { radius: 40, detail: 20 } : { sx: 40, sy: 40, sz: 40 };
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility,
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = 1;
    return p;
  };

  const mixedScene = () => {
    const p = clone(defaults);
    p.objects = [
      { id: 'xb', name: 'xbox', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: -10, y: 50, z: 30, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'xray' },
      { id: 'sb', name: 'sbox', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 40, y: 50, z: -20, yaw: 10, pitch: 5, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = 1;
    return p;
  };

  const hiddenEdges = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge'
    && pp.meta.hiddenLine === true);
  const backFills = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneFill'
    && pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true);

  // ── SCENE_VERSION bumped so the chain actually runs. ───────────────────────
  test('SCENE_VERSION is 2 and SCENE_MIGRATIONS[1] exists', () => {
    expect(Params.SCENE_VERSION).toBe(2);
    // Migration reachable through the public sanitize path.
    const migrated = Params.sanitizeSceneParams(scene('box', 'xray'));
    expect(migrated.sceneVersion).toBe(2);
  });

  // ── Migration seed: an x-ray object gets a NO-OP-meta hidden=dash override. ──
  test('migration seeds edgeStyles.hidden = {dash, null, null, null} per x-ray object', () => {
    const migrated = Params.sanitizeSceneParams(scene('box', 'xray'));
    const ov = migrated.edgeStylesByObject && migrated.edgeStylesByObject.o1;
    expect(ov && ov.hidden).toBeTruthy();
    expect(ov.hidden.hiddenTreatment).toBe('dash');
    expect(ov.hidden.pen).toBe(null);
    expect(ov.hidden.weightMm).toBe(null);
    expect(ov.hidden.dash).toBe(null);
  });

  test('migration does NOT touch a SOLID object', () => {
    const migrated = Params.sanitizeSceneParams(scene('box', 'solid'));
    const byObj = migrated.edgeStylesByObject || {};
    expect(byObj.o1 && byObj.o1.hidden).toBeFalsy();
  });

  test('migration leaves xrayHiddenEdges:false objects to inherit (no seed)', () => {
    const migrated = Params.sanitizeSceneParams(scene('box', 'xray', { xrayHiddenEdges: false }));
    const byObj = migrated.edgeStylesByObject || {};
    expect(byObj.o1 && byObj.o1.hidden).toBeFalsy();
  });

  test('migration is idempotent (re-running a v2 scene is a no-op)', () => {
    const once = Params.sanitizeSceneParams(scene('box', 'xray'));
    const twice = Params.sanitizeSceneParams(once);
    expect(ser(algo.generate(twice, null, null, BOUNDS)))
      .toEqual(ser(algo.generate(once, null, null, BOUNDS)));
  });

  // ── (a) BYTE-IDENTITY vs the pre-fold golden. ──────────────────────────────
  test('migrated x-ray BOX renders byte-identically to the pre-fold golden', () => {
    const migrated = Params.sanitizeSceneParams(scene('box', 'xray'));
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(hiddenEdges(paths).length).toBeGreaterThan(0); // dashed hidden edges survive
    expect(ser(paths)).toEqual(golden.xrayBox);
  });

  // fillAngle is pinned to 0 here — NOT a relaxation. The curved SurfaceFill
  // path used to IGNORE the hatch angle entirely (it was hard-wired to the
  // meridian family), so this golden was captured at the helper's 45 but is in
  // fact the angle-0 meridian output. Now that the angle is live on curved
  // primitives, 45 means 45; asking for 0 asks for the same meridian family the
  // golden holds, and it still matches BYTE-FOR-BYTE (fixture untouched).
  test('migrated x-ray SPHERE (curved back fills) renders byte-identically', () => {
    const migrated = Params.sanitizeSceneParams(scene('sphere', 'xray', { fillAngle: 0 }));
    expect(ser(algo.generate(migrated, null, null, BOUNDS))).toEqual(golden.xraySphere);
  });

  test('migrated MIXED scene (x-ray box + solid box) renders byte-identically', () => {
    const migrated = Params.sanitizeSceneParams(mixedScene());
    expect(ser(algo.generate(migrated, null, null, BOUNDS))).toEqual(golden.mixed);
  });

  test('migrated x-ray box with xrayHiddenEdges:false renders byte-identically', () => {
    const migrated = Params.sanitizeSceneParams(scene('box', 'xray', { xrayHiddenEdges: false }));
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(hiddenEdges(paths).length).toBe(0);
    expect(ser(paths)).toEqual(golden.xrayBoxHiddenOff);
  });

  // ── (b) x-ray back-face FILLS unchanged. ───────────────────────────────────
  test('x-ray back-face fills still emit (faceted + curved) after the fold', () => {
    expect(backFills(algo.generate(Params.sanitizeSceneParams(scene('box', 'xray')), null, null, BOUNDS)).length)
      .toBeGreaterThan(0);
    expect(backFills(algo.generate(Params.sanitizeSceneParams(scene('sphere', 'xray')), null, null, BOUNDS)).length)
      .toBeGreaterThan(0);
  });

  // ── (c) NEW capability: an x-ray object with hidden='drop' drops hidden edges
  // while its see-through back fills stay. This was IMPOSSIBLE pre-fold. ───────
  test('x-ray object with edgeStyles.hidden=drop drops hidden edges, keeps back fills', () => {
    const p = scene('box', 'xray');
    p.edgeStylesByObject = { o1: { hidden: { hiddenTreatment: 'drop', pen: null, weightMm: null, dash: null } } };
    p.sceneVersion = 2; // already-authored override; migration must not re-seed dash over it
    const migrated = Params.sanitizeSceneParams(p);
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(hiddenEdges(paths).length).toBe(0);          // NEW: genuinely dropped
    expect(backFills(paths).length).toBeGreaterThan(0);  // fills stay see-through
  });

  // ── Scene-tree object3d LEAF layer migration (top-level visibility/style). ──
  test('migrateScene seeds edgeStyles.hidden on a v1 x-ray object3d leaf layer', () => {
    const layer = {
      sceneVersion: 1, primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'xray',
      style: { penId: null, mapper: 'hatch', params: { fillDensity: 60 } },
    };
    const migrated = Params.migrateScene(layer);
    expect(migrated.sceneVersion).toBe(2);
    expect(migrated.edgeStyles && migrated.edgeStyles.hidden).toBeTruthy();
    expect(migrated.edgeStyles.hidden.hiddenTreatment).toBe('dash');
    expect(migrated.edgeStyles.hidden.pen).toBe(null);
  });

  test('migrateScene leaves a v1 x-ray object3d leaf with xrayHiddenEdges:false to inherit', () => {
    const layer = {
      sceneVersion: 1, primitive: 'box', visibility: 'xray',
      style: { penId: null, mapper: 'hatch', params: { xrayHiddenEdges: false } },
    };
    const migrated = Params.migrateScene(layer);
    expect(migrated.edgeStyles && migrated.edgeStyles.hidden).toBeFalsy();
  });

  test('migrateScene does not overwrite an object3d leaf that already set hidden', () => {
    const layer = {
      sceneVersion: 1, primitive: 'box', visibility: 'xray',
      style: { penId: null, mapper: 'hatch', params: {} },
      edgeStyles: { hidden: { hiddenTreatment: 'drop', pen: null, weightMm: null, dash: null } },
    };
    const migrated = Params.migrateScene(layer);
    expect(migrated.edgeStyles.hidden.hiddenTreatment).toBe('drop');
  });

  // ── (d) non-x-ray scene: unaffected by the fold. ───────────────────────────
  test('non-x-ray solid scene has no hidden edges and no back fills', () => {
    const paths = algo.generate(Params.sanitizeSceneParams(scene('box', 'solid')), null, null, BOUNDS);
    expect(hiddenEdges(paths).length).toBe(0);
    expect(backFills(paths).length).toBe(0);
  });

  // ── Scene-wide edgeStyles.hidden OVERLAY byte-identity (adversarial review). ──
  // The earlier goldens covered ONLY scenes with NO scene-wide hidden overlay —
  // exactly the subset the no-op seed never disturbed. These three pin the cases
  // that DID regress: an x-ray object must inherit the scene hidden class's
  // pen/weight/dash overlay through the per-object seed (per-field merge), and a
  // non-x-ray surface-fill box must NOT gain hidden-only creases.
  const OVERLAY = { pen: 'penB', weightMm: 0.6, dash: [2, 2] };
  const overlayScene = (visibility, hidden) => {
    const p = scene('box', visibility);
    p.edgeStyles = {
      silhouette: { pen: null, weightMm: null, dash: null },
      crease: { pen: null, weightMm: null, dash: null },
      boundary: { pen: null, weightMm: null, dash: null },
      interior: { pen: null, weightMm: null, dash: null },
      hidden,
    };
    return p;
  };
  const overlaidHidden = (paths) => hiddenEdges(paths).filter((pp) => pp.meta.penId === 'penB'
    && pp.meta.weightScale === 2 && Array.isArray(pp.meta.strokeDash) && pp.meta.strokeDash[0] === 2);

  // Defect 1 — x-ray + scene hidden dash + overlay → migrated render carries the
  // full overlay (penId/weightScale/strokeDash) on every occluded edge.
  test('x-ray object inherits the scene hidden OVERLAY (dash) after migration — byte-identical', () => {
    const migrated = Params.sanitizeSceneParams(overlayScene('xray', { hiddenTreatment: 'dash', ...OVERLAY }));
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(overlaidHidden(paths).length).toBe(3);
    expect(ser(paths)).toEqual(overlayGolden.xrayOverlayDash);
  });

  // Defect 2 — x-ray + scene hidden REMOVE + overlay → pre-fold x-ray forced dash
  // WHILE carrying the overlay; migration reproduces that byte-for-byte.
  test('x-ray object with scene hidden=remove+overlay still dashes with overlay — byte-identical', () => {
    const migrated = Params.sanitizeSceneParams(overlayScene('xray', { hiddenTreatment: 'remove', ...OVERLAY }));
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(overlaidHidden(paths).length).toBe(3);
    expect(ser(paths)).toEqual(overlayGolden.xrayOverlayRemove);
  });

  // Defect 3 — NON-x-ray surface-fill box + scene hidden dash → NO extra
  // hidden-only creases (the see-through crease is a FILLS concern, x-ray only).
  test('non-x-ray surface-fill box + scene hidden=dash gains no extra creases — byte-identical', () => {
    const migrated = Params.sanitizeSceneParams(overlayScene('solid', { hiddenTreatment: 'dash', ...OVERLAY }));
    const paths = algo.generate(migrated, null, null, BOUNDS);
    expect(ser(paths)).toEqual(overlayGolden.solidOverlayDash);
  });
});
