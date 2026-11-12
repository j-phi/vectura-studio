const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

/*
 * Light realism U2b — a STANDALONE object3d leaf takes its tone/lights from object3d.js
 * sceneDefaults() (ALGO_DEFAULTS.scene3d). A new leaf (born at sceneVersion 7) must resolve the
 * realistic model + front key; a saved leaf (pre-v7, or already stamped by the v6->v7 migration)
 * must keep tone.model 'legacy' and the az-135 sun so it renders byte-identically.
 */
describe('standalone object3d tone model gate', () => {
  let rt; let V; let P;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; P = V.Scene3D.Params; });
  afterAll(() => rt && rt.cleanup());

  // Run object3d.generate with the scene3d delegate captured, returning the one-object scene it builds.
  const sceneFor = (params) => {
    const reg = V.AlgorithmRegistry;
    const real = reg.scene3d.generate;
    let captured = null;
    reg.scene3d.generate = (sp) => { captured = sp; return []; };
    try { reg.object3d.generate(params, null, null, {}); } finally { reg.scene3d.generate = real; }
    return captured;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));

  it('a NEW object3d layer resolves v2 + the front key light', () => {
    const eng = new V.VectorEngine();
    eng.currentProfile = { width: 320, height: 220, name: 'o3d' };
    const id = eng.addLayer('object3d');
    const sp = sceneFor(clone(eng.getLayerById(id).params));
    expect(sp.tone.model).toBe('v2');
    expect(sp.lights[0].azimuth).toBe(330);
  });

  it('a SAVED object3d layer (no sceneVersion, migrated on load) resolves legacy + az 135', () => {
    const migrated = P.writeBackObjectLayerStyle(P.migrateScene({ primitive: 'sphere' }));
    expect(migrated.sceneVersion).toBe(7); // migrateScene stamps the version, so the gate cannot rely on it alone
    const sp = sceneFor(clone(migrated));
    expect(sp.tone.model).toBe('legacy');
    expect(sp.lights[0].azimuth).toBe(135);
    expect(sp.lights[0].elevation).toBe(45);
  });

  it('a re-saved migrated leaf stays legacy on the next load', () => {
    const once = P.writeBackObjectLayerStyle(P.migrateScene({ primitive: 'box' }));
    const twice = P.writeBackObjectLayerStyle(P.migrateScene(clone(once)));
    expect(sceneFor(clone(twice)).tone.model).toBe('legacy');
  });

  it('a raw leaf with an explicit pre-v7 sceneVersion is legacy', () => {
    expect(sceneFor({ primitive: 'sphere', sceneVersion: 5 }).tone.model).toBe('legacy');
  });
});
