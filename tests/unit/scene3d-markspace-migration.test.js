const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

/*
 * markSpace — SCENE_VERSION 5 -> 6 (docs/surface-lock-contract.md §12).
 * SCENE_MIGRATIONS[5] stamps markSpace:'pose' on every EXISTING style object;
 * normalisation never injects the key; 'surface' survives; renders are unchanged
 * (generate reads an absent key as pose).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const style = (extra) => ({ mapper: 'hatch', params: { density: 3, ...(extra || {}) } });
const obj = (id, primitive) => ({
  id, name: id, primitive, params: {}, visibility: 'solid',
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
});

describe('Scene3D markSpace param + SCENE_VERSION 6', () => {
  let runtime; let Params; let algo; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params;
    algo = V.AlgorithmRegistry.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const monolith = (version, table) => ({
    sceneVersion: version,
    objects: [obj('a', 'sphere'), obj('b', 'box')],
    styleTable: table,
  });
  const sane = (p) => Params.sanitizeSceneParams(p);

  test('SCENE_VERSION is 6 and both defaults are born at 6', () => {
    expect(Params.SCENE_VERSION).toBe(6);
    expect(V.ALGO_DEFAULTS.scene3d.sceneVersion).toBe(6);
    expect(V.ALGO_DEFAULTS.object3d.sceneVersion).toBe(6);
  });

  test('clampStyleParam: only the literal surface survives', () => {
    expect(Params.normalizeStyle({ params: { markSpace: 'surface' } }).params.markSpace).toBe('surface');
    ['pose', 'flat', 7, null, true, 'SURFACE'].forEach((x) => {
      expect(Params.normalizeStyle({ params: { markSpace: x } }).params.markSpace).toBe('pose');
    });
  });

  test('normalizeStyle without the key keeps it absent', () => {
    expect('markSpace' in Params.normalizeStyle(style()).params).toBe(false);
    expect('markSpace' in Params.normalizeStyle({}).params).toBe(false);
  });

  test('v5 monolith: scene, byObject and byFace styles are stamped; absent entries stay absent', () => {
    const out = sane(monolith(5, {
      scene: style(), byObject: { a: style() }, byFace: { 'b/f1': style() },
    }));
    expect(out.sceneVersion).toBe(6);
    expect(out.styleTable.scene.params.markSpace).toBe('pose');
    expect(out.styleTable.byObject.a.params.markSpace).toBe('pose');
    expect(out.styleTable.byFace['b/f1'].params.markSpace).toBe('pose');
    expect(out.styleTable.byObject.b).toBeUndefined();
  });

  test('sceneVersion-1 payload goes through the whole chain and is stamped', () => {
    const out = sane(monolith(1, { scene: style(), byObject: { a: style() } }));
    expect(out.sceneVersion).toBe(6);
    expect(out.styleTable.scene.params.markSpace).toBe('pose');
    expect(out.styleTable.byObject.a.params.markSpace).toBe('pose');
  });

  test('v5 object3d leaf: style and faceStyles are stamped', () => {
    const out = sane({
      sceneVersion: 5, primitive: 'sphere', style: style(), faceStyles: { f1: style(), f2: style() },
    });
    expect(out.sceneVersion).toBe(6);
    expect(out.style.params.markSpace).toBe('pose');
    expect(out.faceStyles.f1.params.markSpace).toBe('pose');
    expect(out.faceStyles.f2.params.markSpace).toBe('pose');
  });

  test('booleanGroup3d style is stamped (raw migration step)', () => {
    const step = Params.SCENE_MIGRATIONS ? Params.SCENE_MIGRATIONS[5] : null;
    const raw = { sceneVersion: 5, style: style(), operation: 'union' };
    const out = step ? step(raw) : Params.migrateScene(raw);
    expect(out.style.params.markSpace).toBe('pose');
  });

  test('a v6 document with surface is untouched; a v6 doc without the key stays absent', () => {
    const doc = monolith(6, { scene: style({ markSpace: 'surface' }), byObject: { a: style() } });
    const out = sane(doc);
    expect(out.sceneVersion).toBe(6);
    expect(out.styleTable.scene.params.markSpace).toBe('surface');
    expect('markSpace' in out.styleTable.byObject.a.params).toBe(false);
  });

  test('a v5 style that already says surface keeps it', () => {
    const out = sane(monolith(5, { scene: style({ markSpace: 'surface' }) }));
    expect(out.styleTable.scene.params.markSpace).toBe('surface');
  });

  test('migration is idempotent (a v6 payload re-migrates to itself)', () => {
    const once = Params.migrateScene(monolith(5, { scene: style(), byObject: { a: style() } }));
    expect(Params.migrateScene(clone(once))).toEqual(once);
  });

  describe('renders are unchanged by the stamp', () => {
    const sig = (p) => pathSignature(algo.generate(p, null, null, BOUNDS));
    const presetsDir = path.join(__dirname, '..', '..', 'user-presets', 'scene3d');
    const stripPose = (o) => {
      if (Array.isArray(o)) o.forEach(stripPose);
      else if (o && typeof o === 'object') {
        if (o.markSpace === 'pose') delete o.markSpace;
        Object.values(o).forEach(stripPose);
      }
      return o;
    };
    const OLDER_STEPS_MOVE_RENDER = new Set(['studio-shadows.vectura']);
    const files = fs.readdirSync(presetsDir).filter((f) => f.endsWith('.vectura'));

    test('there are scene3d presets to check', () => { expect(files.length).toBeGreaterThanOrEqual(3); });

    test.each(files)('preset %s renders identically before and after migration', (file) => {
      const doc = JSON.parse(fs.readFileSync(path.join(presetsDir, file), 'utf8'));
      doc.layers.filter((l) => l.type === 'scene3d').forEach((layer) => {
        const raw = clone(layer.params);
        const migrated = Params.migrateScene(clone(raw));
        expect(migrated.sceneVersion).toBe(6);
        // The stamp itself changes nothing: the same chain output with every
        // stamped 'pose' removed (= the v5 state) renders identically.
        expect(sig(migrated)).toBe(sig(stripPose(clone(migrated))));
        // v1 presets whose OLDER migrations (v1-v4) are render-neutral also match
        // the unmigrated file byte for byte (studio-shadows is not one of them:
        // an older step moves it, independent of markSpace).
        if (!OLDER_STEPS_MOVE_RENDER.has(file)) expect(sig(migrated)).toBe(sig(raw));
      });
    });

    test('a saved v5 fixture (hatch sphere + box with faceStyles) renders the same', () => {
      const raw = monolith(5, {
        scene: style(), byObject: { a: style({ density: 4 }) }, byFace: { 'b/f1': style() },
      });
      expect(sig(Params.migrateScene(clone(raw)))).toBe(sig(raw));
      expect(sig(sane(clone(raw)))).toBe(sig(raw));
    });
  });
});
