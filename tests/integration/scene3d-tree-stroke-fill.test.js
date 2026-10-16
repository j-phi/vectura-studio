const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * U4a item 1 — Stroke Fill on a scene-TREE object.
 *
 * The leaf panel and the context bar write `strokeFillStyle` on the object3d
 * CHILD layer. The compositor read it from the GROUP, so the choice did nothing.
 * RED before: spiral / concentric / serpentine / contourParallel all hashed
 * identically on a tree child.
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

describe('Stroke Fill on a tree object', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const sceneWith = (law) => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    const oid = engine.addObjectToScene(gid, 'sphere');
    const child = engine.getLayerById(oid);
    child.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: law } };
    return { engine, gid, oid, child };
  };
  const compose = (s) => {
    s.engine.invalidateSceneCompose();
    s.engine.computeAllDisplayGeometry();
    const paths = s.engine.getRenderablePaths(s.engine.getLayerById(s.gid))
      .filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === s.oid);
    return hashPaths(paths);
  };

  test('a ribbon law redraws when the CHILD Stroke Fill changes', () => {
    const s = sceneWith('taperedEnds');
    const seen = {};
    ['spiral', 'concentric', 'serpentine', 'contourParallel'].forEach((id) => {
      s.child.params.strokeFillStyle = id;
      seen[id] = compose(s);
    });
    expect(new Set(Object.values(seen)).size).toBeGreaterThanOrEqual(3);
    expect(seen.spiral).not.toBe(seen.concentric);
  });

  test('the child value matches the same value set on the group of a monolith-style read', () => {
    const a = sceneWith('taperedEnds');
    a.child.params.strokeFillStyle = 'concentric';
    const viaChild = compose(a);
    const b = sceneWith('taperedEnds');
    b.engine.getLayerById(b.gid).params.strokeFillStyle = 'concentric';
    expect(compose(b)).toBe(viaChild);
  });

  test('a default child does not shadow a Stroke Fill an older document set on the group', () => {
    const s = sceneWith('taperedEnds');
    s.engine.getLayerById(s.gid).params.strokeFillStyle = 'concentric';
    s.child.params.strokeFillStyle = 'spiral';
    const grouped = compose(s);
    const ref = sceneWith('taperedEnds');
    ref.child.params.strokeFillStyle = 'concentric';
    expect(grouped).toBe(compose(ref));
  });

  test('a mono law is untouched by Stroke Fill (no ribbon)', () => {
    const s = sceneWith('ladder');
    s.child.params.strokeFillStyle = 'spiral';
    const a = compose(s);
    s.child.params.strokeFillStyle = 'concentric';
    expect(compose(s)).toBe(a);
  });
});
