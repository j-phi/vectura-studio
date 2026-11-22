const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Pose (Lock marks to surface OFF) twin of scene3d-v2-plane-lit-fill: a plane tilted toward the sun was lit evenly, the v2 mono
 * law tone map rolled it to paper and the face silently fell back to the plain hatch (11 paths). A lone face (loneFace) is
 * capped under the paper band and takes no glint keep, so the law draws its own marks. Boxes and pitch 0/90 are unchanged.
 */
describe('Scene3D v2 pose — a lit lone plane keeps its mono-law marks', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const count = (primitive, law, pitch) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const pid = engine.addObjectToScene(gid, primitive);
    const o = engine.getLayerById(pid);
    Object.assign(o.params.transform, { x: 70, y: 30, pitch });
    o.params.style = { penId: null, mapper: 'hatch', params: Object.assign({}, o.params.style && o.params.style.params, { markSpace: 'pose', toneLaw: law }) };
    engine.computeAllDisplayGeometry();
    return (engine.getLayerById(gid).scenePaths || [])
      .filter((p) => { const t = p.meta && p.meta.sceneTarget; return t && t.objectId === pid && p.meta.kind === 'sceneFill'; }).length;
  };
  const PLAIN_HATCH = 11;

  it.each(['dutyConst', 'etfKang'])('plane with %s draws law marks at pitch 30 and 60', (law) => {
    expect(count('plane', law, 30)).toBeGreaterThan(PLAIN_HATCH);
    expect(count('plane', law, 60)).toBeGreaterThan(PLAIN_HATCH);
  });
  it('plane pitch 0 and 90 are unchanged', () => {
    expect(count('plane', 'dutyConst', 0)).toBe(830);
    expect(count('plane', 'dutyConst', 90)).toBe(1903);
    expect(count('plane', 'etfKang', 0)).toBe(26);
    expect(count('plane', 'etfKang', 90)).toBe(59);
  });
  it('a box is unchanged', () => {
    expect(count('box', 'dutyConst', 30)).toBe(595);
    expect(count('box', 'dutyConst', 60)).toBe(312);
  });
});
