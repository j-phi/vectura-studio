const fs = require('fs');
const path = require('path');
const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

/*
 * Light realism U2 — p.tone.model ('legacy' | 'v2'), p.tone.ambient, p.tone.bounce, SCENE_VERSION 7.
 * New scenes are born 'v2'; every document / preset saved at sceneVersion <= 6 is stamped 'legacy'.
 * Driven through engine.addLayer + importState (CLAUDE.md "Where a default actually comes from").
 */
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Scene3D tone.model migration (SCENE_VERSION 7)', () => {
  let rt; let V; let P;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; P = V.Scene3D.Params; });
  afterAll(() => rt && rt.cleanup());

  it('SCENE_VERSION is 7 and both factory defaults are born at it', () => {
    expect(P.SCENE_VERSION).toBe(7);
    expect(V.ALGO_DEFAULTS.scene3d.sceneVersion).toBe(7);
    expect(V.ALGO_DEFAULTS.object3d.sceneVersion).toBe(7);
  });

  it('new addLayer(scene3d) is v2 with ambient/bounce defaults, and survives normalize', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const tone = s.group.params.tone;
    expect(tone.model).toBe('v2');
    expect(tone.ambient).toBeCloseTo(0.08, 6);
    expect(tone.bounce).toBeCloseTo(0.12, 6);
    expect(P.sanitizeSceneParams(clone(s.group.params)).tone.model).toBe('v2');
  });

  it('a v6 scene (tone without model) migrates to legacy', () => {
    const out = P.sanitizeSceneParams({ sceneVersion: 6, objects: [], tone: { enabled: true, bands: 3 } });
    expect(out.sceneVersion).toBe(7);
    expect(out.tone.model).toBe('legacy');
  });

  it('a v6 scene with no tone block, and a v1 scene, migrate to legacy', () => {
    expect(P.sanitizeSceneParams({ sceneVersion: 6, objects: [] }).tone.model).toBe('legacy');
    expect(P.sanitizeSceneParams({ objects: [] }).tone.model).toBe('legacy');
  });

  it('a tone that already names a model is respected; migration is idempotent', () => {
    const v2 = P.sanitizeSceneParams({ sceneVersion: 6, objects: [], tone: { model: 'v2' } });
    expect(v2.tone.model).toBe('v2');
    const again = P.sanitizeSceneParams(clone(P.sanitizeSceneParams({ sceneVersion: 5, objects: [] })));
    expect(again.tone.model).toBe('legacy');
  });

  it('ambient/bounce are clamped, an unknown model falls back to legacy', () => {
    const out = P.sanitizeSceneParams({ sceneVersion: 7, objects: [], tone: { model: 'nope', ambient: 9, bounce: -2 } });
    expect(out.tone.model).toBe('legacy');
    expect(out.tone.ambient).toBe(1);
    expect(out.tone.bounce).toBe(0);
  });

  it('object3d / booleanGroup3d leaves (no tone) are not given one', () => {
    const leaf = P.migrateScene({ sceneVersion: 6, primitive: 'sphere' });
    expect(leaf.tone).toBeUndefined();
    expect(leaf.sceneVersion).toBe(7);
  });

  it('exportState -> importState keeps v2; a saved v6 document imports as legacy', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const state = clone(s.eng.exportState());
    s.eng.importState(clone(state));
    expect(s.eng.getLayerById(s.gid).params.tone.model).toBe('v2');
    state.layers.forEach((l) => {
      if (l.type === 'scene3d' && l.params) { l.params.sceneVersion = 6; delete l.params.tone.model; }
    });
    s.eng.importState(state);
    const g = s.eng.layers.find((l) => l.type === 'scene3d');
    expect(g.params.tone.model).toBe('legacy');
  });

  it('every user-presets/scene3d preset resolves legacy', () => {
    const dir = path.join(__dirname, '..', '..', 'user-presets', 'scene3d');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.vectura'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    files.forEach((f) => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere' });
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      s.eng.importState(doc.formatVersion ? doc : { ...doc, layers: (doc.layers || []).filter((l) => l && l.params) });
      const scenes = s.eng.layers.filter((l) => l.type === 'scene3d');
      expect(scenes.length, f).toBeGreaterThan(0);
      scenes.forEach((l) => expect(l.params.tone.model, f).toBe('legacy'));
    });
  });

  it('applying a preset through the panel path (Params.migrateScene) lands legacy', () => {
    const lib = (V.PRESETS || []).filter((p) => p && (p.preset_system === 'scene3d' || p.system === 'scene3d'));
    lib.forEach((p) => {
      const merged = P.migrateScene({ ...clone(V.ALGO_DEFAULTS.scene3d), ...clone(p.params || {}) });
      if (p.params && p.params.sceneVersion !== undefined && p.params.sceneVersion >= 7) return;
      expect(merged.tone.model, p.id).toBe('legacy');
    });
  });
});
