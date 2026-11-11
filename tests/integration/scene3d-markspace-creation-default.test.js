const fs = require('fs');
const path = require('path');
const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature } = require('../helpers/surface-lock-scene');

/*
 * W3-E — the Scene3D creation default (docs/surface-lock-contract.md §12 "Creation default").
 * A NEW scene's leaves are born markSpace 'surface'; every saved file, preset and Start Page plate keeps
 * 'pose'. Driven through engine.addLayer / importState (not generate(params)), because ALGO_DEFAULTS, the
 * factory preset and the seeds are invisible to a direct generate() call (CLAUDE.md "Where a default comes from").
 */
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Scene3D creation default: markSpace surface', () => {
  let rt; let V;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; });
  afterAll(() => rt && rt.cleanup());

  const mark = (leaf) => leaf.params.style && leaf.params.style.params && leaf.params.style.params.markSpace;

  it('addLayer(scene3d): the default leaf is surface and the scene renders through the lock', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    expect(mark(s.objectsOf()[0])).toBe('surface');
    const SL = V.Scene3D.SurfaceLock;
    const frames0 = SL.stats.sceneFrames;
    s.composeFull();
    expect(s.group._sceneLevelS).toBe(true);
    expect(SL.stats.sceneFrames).toBeGreaterThan(frames0);
  });

  it('addObjectToScene: every shelf shape is born surface and the scene stays Level S', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const id = s.eng.addObjectToScene(s.gid, 'box');
    expect(mark(s.eng.getLayerById(id))).toBe('surface');
    s.composeFull();
    expect(s.group._sceneLevelS).toBe(true);
  });

  it('setObjectPrimitive keeps the key', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const leaf = s.objectsOf()[0];
    s.eng.setObjectPrimitive(leaf.id, 'torus');
    expect(mark(s.eng.getLayerById(leaf.id))).toBe('surface');
  });

  it('exportState -> importState keeps surface and the render is byte-identical', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const before = signature(s.composeFull());
    const state = clone(s.eng.exportState());
    s.eng.importState(state);
    expect(mark(s.eng.getLayerDescendants(s.gid).find((l) => l.type === 'object3d'))).toBe('surface');
    s.eng.invalidateSceneCompose(s.eng.getLayerById(s.gid));
    s.eng.computeAllDisplayGeometry();
    expect(signature(s.eng.getLayerById(s.gid).scenePaths || [])).toBe(before);
  });

  it('a saved v5 leaf (pose, or no key) stays pose after import', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere' });
    const state = clone(s.eng.exportState());
    state.layers.forEach((l) => {
      if (l.params) l.params.sceneVersion = 5;
      if (l.type === 'object3d') delete l.params.style.params.markSpace;
    });
    s.eng.importState(state);
    const leaf = s.eng.getLayerDescendants(s.gid).find((l) => l.type === 'object3d');
    expect(mark(leaf)).toBe('pose');
  });

  it('every user-presets/scene3d preset resolves pose, never surface', () => {
    const dir = path.join(__dirname, '..', '..', 'user-presets', 'scene3d');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.vectura'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    files.forEach((f) => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere' });
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const layers = (doc.layers || []).filter((l) => l && l.params);
      s.eng.importState(doc.formatVersion ? doc : { ...doc, layers });
      const marks = s.eng.layers.filter((l) => l.type === 'object3d').map(mark)
        .concat(s.eng.layers.filter((l) => l.type === 'scene3d').flatMap((l) => {
          const t = l.params && l.params.styleTable;
          return t ? [t.scene && t.scene.params && t.scene.params.markSpace, ...Object.values(t.byObject || {}).map((x) => x.params && x.params.markSpace)] : [];
        }));
      expect(marks.filter((m) => m === 'surface'), f).toEqual([]);
    });
  });
});
