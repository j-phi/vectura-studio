const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * U5 item 0 — U4b made Density live on the monoline laws. A document saved
 * before that (no seedMode => legacy) was drawn with Density inert (= 50), so
 * the load migration pins those style bags and the document keeps its look. A
 * NEW layer, and a legacy bag whose Density the user then edits, use Density.
 */
const hashPaths = (paths) => {
  let h = 2166136261 >>> 0;
  const mix = (n) => { h ^= n; h = Math.imul(h, 16777619) >>> 0; };
  (paths || []).forEach((p) => {
    mix(p.length);
    p.forEach((pt) => { mix(Math.round(pt.x * 1000) | 0); mix(Math.round(pt.y * 1000) | 0); });
  });
  return `${(paths || []).length}:${h.toString(16)}`;
};

describe('legacy documents keep their look under a monoline law (Density pin)', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ sceneSeedMode: 'seeded' }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const build = (prim, toneLaw, density) => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    const oid = engine.addObjectToScene(gid, prim);
    const child = engine.getLayerById(oid);
    child.params.style = { penId: null, mapper: 'hatch', params: { toneLaw, fillDensity: density } };
    return { engine, gid, oid };
  };
  const reload = (s, { legacy }) => {
    const state = s.engine.exportState();
    if (legacy) state.layers.forEach((l) => { if (l.params) delete l.params.seedMode; });
    const e2 = new V.VectorEngine();
    e2.importState(state);
    const g2 = e2.getLayerById(s.gid);
    e2.invalidateSceneCompose();
    e2.computeAllDisplayGeometry();
    return { e2, g2, hash: hashPaths(e2.getRenderablePaths(g2)) };
  };

  const CASES = [['sphere', 'etfKang'], ['sphere', 'mazeFill'], ['box', 'turingStripe'], ['sphere', 'dutyConst']];

  test.each(CASES)('%s + %s: a legacy doc at Density 85 renders as Density 50', (prim, law) => {
    const at85 = reload(build(prim, law, 85), { legacy: true });
    const at50 = reload(build(prim, law, 50), { legacy: true });
    expect(at85.hash).toBe(at50.hash);
  }, 120000);

  test.each(CASES)('%s + %s: a NEW (seeded) doc at Density 85 still uses Density', (prim, law) => {
    const at85 = reload(build(prim, law, 85), { legacy: false });
    const at50 = reload(build(prim, law, 50), { legacy: false });
    expect(at85.hash).not.toBe(at50.hash);
  }, 120000);

  test('editing Density on a migrated legacy bag releases the pin', () => {
    const s = build('sphere', 'etfKang', 85);
    const a = reload(s, { legacy: true });
    const child = a.e2.getLayerById(s.oid);
    expect(child.params.style.params.monoDensityLegacyAt).toBe(85);
    child.params.style.params.fillDensity = 70;
    a.e2.invalidateSceneCompose();
    a.e2.computeAllDisplayGeometry();
    const edited = hashPaths(a.e2.getRenderablePaths(a.g2));
    const ref = reload(build('sphere', 'etfKang', 70), { legacy: false });
    expect(edited).toBe(ref.hash);
  }, 120000);

  test('the pin fires on the FIRST legacy load only: save/reopen and undo/redo (layers already marked legacy) never re-pin', () => {
    // A legacy document on Ladder at Density 70 (nothing to pin), loaded once.
    const s = build('sphere', 'ladder', 70);
    const first = reload(s, { legacy: true });
    const child = first.e2.getLayerById(s.oid);
    expect(child.params.seedMode).toBe('legacy');
    // The user switches it to a monoline law: Density 70 is live for it now.
    child.params.style.params.toneLaw = 'etfKang';
    first.e2.invalidateSceneCompose();
    first.e2.computeAllDisplayGeometry();
    const live = hashPaths(first.e2.getRenderablePaths(first.g2));
    // Save and reopen (the same import path undo/redo uses): layers now carry seedMode:'legacy'.
    const e3 = new V.VectorEngine();
    e3.importState(JSON.parse(JSON.stringify(first.e2.exportState())));
    const again = e3.getLayerById(s.oid);
    expect(again.params.style.params.monoDensityLegacyAt).toBeUndefined();
    e3.invalidateSceneCompose();
    e3.computeAllDisplayGeometry();
    expect(hashPaths(e3.getRenderablePaths(e3.getLayerById(s.gid)))).toBe(live);
  }, 240000);

  test('a non-mono law is never pinned', () => {
    const s = build('sphere', 'ladder', 85);
    const a = reload(s, { legacy: true });
    const child = a.e2.getLayerById(s.oid);
    expect(child.params.style.params.monoDensityLegacyAt).toBeUndefined();
  });
});
