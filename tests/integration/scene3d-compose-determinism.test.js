const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * U4a item 4 — compose determinism.
 *
 * U1 saw two composes of byte-identical input return 259 then 343 paths on the
 * old base (ground fill doubled). The same scene composed N times with the
 * compose memo cleared before each pass must give the same paths every time:
 * ground + cast shadows + several fill styles + a scene tree.
 */
const hashPaths = (paths) => {
  let h = 2166136261 >>> 0;
  const mix = (n) => { h ^= n; h = Math.imul(h, 16777619) >>> 0; };
  (paths || []).forEach((p) => {
    mix(Array.isArray(p) ? p.length : 0);
    (Array.isArray(p) ? p : []).forEach((pt) => {
      mix(Math.round(pt.x * 1000) | 0);
      mix(Math.round(pt.y * 1000) | 0);
    });
  });
  return `${(paths || []).length}:${h.toString(16)}`;
};

describe('scene3d compose is deterministic', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const buildSphere = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    engine.addObjectToScene(gid, 'sphere');
    return { engine, gid };
  };

  const build = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    const ids = ['sphere', 'box', 'cylinder'].map((prim) => engine.addObjectToScene(gid, prim));
    const mappers = [
      { mapper: 'hatch', params: { toneLaw: 'ladder' } },
      { mapper: 'crosshatch', params: {} },
      { mapper: 'stipple', params: {} },
    ];
    ids.forEach((id, i) => {
      const child = engine.getLayerById(id);
      child.params.transform = { ...(child.params.transform || {}), x: (i - 1) * 60 };
      child.params.style = { penId: null, ...mappers[i] };
    });
    engine.addGroundToScene(gid);
    return { engine, gid };
  };

  test('N composes of the same scene (memo cleared) give identical paths', () => {
    const { engine, gid } = build();
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      engine.invalidateSceneCompose();
      engine.computeAllDisplayGeometry();
      seen.push(hashPaths(engine.getRenderablePaths(engine.getLayerById(gid))));
    }
    expect(new Set(seen).size).toBe(1);
    expect(parseInt(seen[0], 10)).toBeGreaterThan(50);
  });

  test('two fresh engines compose the same scene identically', () => {
    const a = build();
    const b = build();
    a.engine.invalidateSceneCompose(); a.engine.computeAllDisplayGeometry();
    b.engine.invalidateSceneCompose(); b.engine.computeAllDisplayGeometry();
    expect(hashPaths(a.engine.getRenderablePaths(a.engine.getLayerById(a.gid))))
      .toBe(hashPaths(b.engine.getRenderablePaths(b.engine.getLayerById(b.gid))));
  });

  // ROOT CAUSE (U4a): FillBoolean latches the last failed op in module state.
  // shadows.js's overlap lattice read that latch as its own failure, so a
  // failure left by ANY earlier compose changed the next scene's shadow once.
  test('a stale FillBoolean error from an earlier compose does not change the next compose', () => {
    const clean = buildSphere();
    const want = hashPaths(clean.engine.getRenderablePaths(clean.engine.getLayerById(clean.gid)));

    // Latch a failure exactly the way a degenerate earlier compose would.
    const pc = runtime.window.polygonClipping;
    const realUnion = pc.union;
    const warn = console.warn;
    console.warn = () => {};
    pc.union = () => { throw new Error('simulated degenerate union'); };
    try {
      V.FillBoolean.union([[[[0, 0], [1, 0], [1, 1], [0, 0]]]], [[[[2, 2], [3, 2], [3, 3], [2, 2]]]]);
    } finally { pc.union = realUnion; console.warn = warn; }

    // No invalidate: the FIRST compose of the new scene is the one that read
    // the stale latch.
    const next = buildSphere();
    expect(hashPaths(next.engine.getRenderablePaths(next.engine.getLayerById(next.gid)))).toBe(want);
  });
});
