const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * A plane tilted toward the sun is lit ~0.89 EVENLY (one face, one intensity). The v2 tone curve rolls the lightest
 * V2_PAPER_BAND of the range to paper, so the whole plane fill vanished and only the 4-edge outline remained
 * ("Planes are not currently showing up"). A lone face (a plane) is capped just under the paper band so a lit plane
 * keeps at least the lightest hatch level. Boxes (multi-face) and the extreme pitches are unchanged.
 */
describe('Scene3D v2 — a lit lone plane keeps a fill', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const fillCount = (primitive, pitch) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d'); // default sun, no pinLegacySun
    const pid = engine.addObjectToScene(gid, primitive);
    Object.assign(engine.getLayerById(pid).params.transform, { x: 70, y: 30, pitch });
    engine.computeAllDisplayGeometry();
    const paths = engine.getLayerById(gid).scenePaths || [];
    return paths.filter((p) => { const t = p.meta && p.meta.sceneTarget; return t && t.objectId === pid && p.meta.kind === 'sceneFill'; }).length;
  };

  it('plane pitch 30 and 60 draw at least one fill path', () => {
    expect(fillCount('plane', 30)).toBeGreaterThanOrEqual(1);
    expect(fillCount('plane', 60)).toBeGreaterThanOrEqual(1);
  });
  it('plane pitch 0 and 90 are unchanged', () => {
    expect(fillCount('plane', 0)).toBe(BASE.p0);
    expect(fillCount('plane', 90)).toBe(BASE.p90);
  });
  it('a box is unchanged', () => {
    expect(fillCount('box', 30)).toBe(BASE.box30);
  });
});
const BASE = { p0: 29, p90: 46, box30: 146 };
