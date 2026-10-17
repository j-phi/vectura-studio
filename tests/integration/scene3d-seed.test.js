const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { goldenValues } = require('../helpers/golden-values');

/*
 * U4a item 2 — the Seed field drives every hash / dither site in scene3d fills.
 * (a) a legacy document (no seedMode) loads byte-identical to the pre-seed render
 * (b) a NEW layer: changing the seed changes the output
 * (c) the same seed reproduces
 * (d) RANDOMIZE / a Seed edit on a legacy layer switches it to seeded
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

describe('scene3d Seed', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ sceneSeedMode: 'seeded' }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const scene = (prim, mapper, params = {}) => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    const oid = engine.addObjectToScene(gid, prim);
    const child = engine.getLayerById(oid);
    child.params.style = { penId: null, mapper, params };
    return { engine, gid, oid, child, group: engine.getLayerById(gid) };
  };
  const render = (s) => {
    s.engine.invalidateSceneCompose();
    s.engine.computeAllDisplayGeometry();
    return hashPaths(s.engine.getRenderablePaths(s.group));
  };
  const setSeeds = (s, seed) => { s.group.params.seed = seed; s.child.params.seed = seed + 1; };

  // A box stipple (mappers.js hash2) + a sphere stipple (ladder phase) + a mono law.
  const CASES = [
    ['box', 'stipple', {}],
    ['sphere', 'stipple', {}],
    ['sphere', 'hatch', { toneLaw: 'mazeFill' }],
    ['sphere', 'hatch', { toneLaw: 'turingStripe' }],
  ];

  test('new layers are seeded; a different seed changes the output; the same seed reproduces', () => {
    CASES.forEach(([prim, mapper, params]) => {
      const s = scene(prim, mapper, params);
      expect(s.group.params.seedMode).toBe('seeded');
      expect(s.child.params.seedMode).toBe('seeded');
      setSeeds(s, 100);
      const a = render(s);
      expect(render(s)).toBe(a);              // (c) same seed reproduces
      setSeeds(s, 5000);
      expect(render(s)).not.toBe(a);          // (b) seed changes output
      setSeeds(s, 100);
      expect(render(s)).toBe(a);
    });
  });

  test('a legacy layer ignores Seed and renders as before the Seed field was wired', () => {
    const s = scene('box', 'stipple');
    s.group.params.seedMode = 'legacy';
    s.child.params.seedMode = 'legacy';
    setSeeds(s, 100);
    const a = render(s);
    setSeeds(s, 5000);
    expect(render(s)).toBe(a);               // (a) seed is inert in legacy mode
    // ...and equals the pre-seed constants: state all-zero is the identity.
    const G3 = V.Geometry3D;
    expect(G3.SEED.salt).toBe(0);
    expect(G3.SEED.phase).toBe(0);
  });

  test('a saved document without seedMode loads as legacy and keeps its look', () => {
    const s = scene('sphere', 'stipple');
    setSeeds(s, 321);
    const state = s.engine.exportState();
    // Strip the flag exactly as a pre-seed .vectura would lack it.
    state.layers.forEach((l) => { if (l.params) delete l.params.seedMode; });
    const e2 = new V.VectorEngine();
    e2.importState(state);
    e2.layers.filter((l) => ['scene3d', 'object3d'].includes(l.type))
      .forEach((l) => expect(l.params.seedMode).toBe('legacy'));
    const g2 = e2.getLayerById(s.gid);
    const legacyA = hashPaths(e2.getRenderablePaths(g2));
    g2.params.seed = 99999;
    e2.layers.filter((l) => l.type === 'object3d').forEach((l) => { l.params.seed = 12345; });
    e2.invalidateSceneCompose();
    e2.computeAllDisplayGeometry();
    expect(hashPaths(e2.getRenderablePaths(g2))).toBe(legacyA);
    // The seed state never leaks out of a compose.
    expect(V.Geometry3D.SEED.salt).toBe(0);
  });

  test('(d) RANDOMIZE / a Seed edit switches a legacy layer to seeded', () => {
    // The panel handlers set seedMode alongside the seed; assert the wiring text
    // and the engine behaviour that follows from it.
    const fs = require('fs');
    const src = fs.readFileSync(require('path').resolve(__dirname, '../../src/ui/panels/algo-config-panel.js'), 'utf8');
    expect(src).toMatch(/l\.params\.seed = Math\.floor\(Math\.random\(\) \* 99999\);\s*\n\s*if \(SEED_MODE_TYPES\.has\(l\.type\)\) l\.params\.seedMode = 'seeded'/);
    expect(src).toMatch(/key === 'seed' && SEED_MODE_TYPES\.has\(layer\.type\)\) layer\.params\.seedMode = 'seeded'/);
    const s = scene('box', 'stipple');
    s.group.params.seedMode = 'legacy';
    s.child.params.seedMode = 'legacy';
    const legacy = render(s);
    s.group.params.seed = 777; s.group.params.seedMode = 'seeded';
    expect(render(s)).not.toBe(legacy);
  });

  // (a) GOLDEN: hashes captured on the pre-seed base (3d-scene/fill-review
  // d66ece3f) for legacy layers with seeds 42/43. They must never move.
  // Stored in tests/baselines/golden-values/scene3d-seed.json.
  //
  // Per-architecture sections: V8's Math.sin/cos/exp/atan2/... (C++ fdlibm)
  // round the last ULP differently on arm64 and x86_64. The etfKang scene
  // amplifies that drift to ~1e-5 over its streamline passes, so the 1e-3
  // rounding below still flips a few coordinates and the hash differs by
  // arch. Both values were regenerated on d66ece3f itself (arm64 node and
  // x64 node 20.20.2 under Rosetta; x64 matches GitHub CI exactly), so each
  // one is the true pre-seed identity on its own arch. Every other scene has
  // the same value in both sections.
  test('(a) legacy layers render byte-identical to the pre-seed base', () => {
    const golden = goldenValues('scene3d-seed');
    const GOLD = [
      ['box', 'stipple', {}],
      ['sphere', 'stipple', {}],
      ['sphere', 'hatch', { toneLaw: 'etfKang' }],
      ['sphere', 'hatch', { toneLaw: 'taperedEnds' }],
      ['cylinder', 'crosshatch', {}],
      ['torus', 'hatch', { toneLaw: 'ladder' }],
      ['sphere', 'hatch', { toneLaw: 'mazeFill' }],
      ['box', 'hatch', { toneLaw: 'turingStripe' }],
      ['sphere', 'hatch', { toneLaw: 'penStipple' }],
    ];
    GOLD.forEach(([prim, mapper, params]) => {
      const s = scene(prim, mapper, params);
      s.group.params.seedMode = 'legacy'; s.child.params.seedMode = 'legacy';
      s.group.params.seed = 42; s.child.params.seed = 43;
      golden.expect([prim, mapper, params.toneLaw].filter(Boolean).join('/'), render(s));
    });
  }, 300000);
});
