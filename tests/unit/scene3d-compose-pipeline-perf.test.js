/*
 * RGR — U1 pipeline perf (docs/3d-audit/fill-style-review/r2-perf.md):
 *   B1   a scene GROUP preview reaches the compose as a draft tier
 *   F5   the law draft keeps the Fill Style (ribbon laws as weighted
 *        centrelines; mono laws at a coarser, pen-scaled lattice)
 *   B2   a consumed object3d child never runs its discarded standalone render;
 *        a child preview recomposes only its owning group
 *   NEW-3 identical full composes are memoized; any input change recomposes,
 *        and a draft frame is never served as the final ink
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('scene compose pipeline — draft tiers, consumed children, memo', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime?.cleanup?.());
  afterEach(() => {
    delete V.SETTINGS.sceneDraftTier;
  });

  const makeScene = (law, mapper = 'hatch') => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    const params = { fillCurves: true };
    if (law) params.toneLaw = law;
    child.params.style = { penId: null, mapper, params };
    engine.computeAllDisplayGeometry();
    return { engine, gid, group: engine.getLayerById(gid), child };
  };

  // Spy on the registry's scene3d.generate (the function both the engine's
  // group compose and object3d's standalone delegate call).
  const spyScene3d = () => {
    const reg = V.AlgorithmRegistry.scene3d;
    const orig = reg.generate;
    const calls = [];
    reg.generate = function spy(p, r, n, b) {
      calls.push({ params: p, bounds: { ...b } });
      return orig.call(this, p, r, n, b);
    };
    return { calls, restore: () => { reg.generate = orig; } };
  };

  const weightsOf = (paths) => new Set((paths || [])
    .map((p) => p && p.meta && p.meta.weightScale)
    .filter((w) => Number.isFinite(w))
    .map((w) => w.toFixed(3)));

  test('B1: a group preview reaches the compose as a draft (law tier by default for an unmeasured/slow scene)', () => {
    const { engine, gid, group } = makeScene('taperedEnds');
    group._sceneLastFullMs = 5000; // a slow settled compose
    const spy = spyScene3d();
    try {
      engine.generate(gid, { preview: true });
    } finally { spy.restore(); }
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0].bounds.lawDraft).toBe(true);
    expect(spy.calls[0].bounds.fastPreview).toBe(false);
    expect(group._pathsFromDraft).toBe(true);
  });

  test('B1: a cheap scene keeps full quality during a drag; a slow law draft falls back to flat', () => {
    const { engine, gid, group } = makeScene(null);
    group._sceneLastFullMs = 10;
    engine.generate(gid, { preview: true });
    expect(engine.sceneComposeStats.lastTier).toBe('full');
    expect(group._pathsFromDraft).toBe(false);
    group._sceneLastFullMs = 5000;
    group._sceneLastLawDraftMs = 900;
    const spy = spyScene3d();
    try {
      engine.generate(gid, { preview: true });
    } finally { spy.restore(); }
    expect(spy.calls[0].bounds.fastPreview).toBe(true);
    expect(engine.sceneComposeStats.lastTier).toBe('flat');
  });

  test('F5: the law draft of a ribbon law draws its weighted centrelines (the law stays visible)', () => {
    const { engine, gid, group, child } = makeScene('taperedEnds');
    const full = group.scenePaths;
    // The settled ribbon output is all single-pen strokes (weightScale 1).
    expect(weightsOf(full).size).toBe(0);
    V.SETTINGS.sceneDraftTier = 'law';
    child.params.transform.yaw = 15;
    engine.generate(gid, { preview: true });
    const law = group.scenePaths;
    // The law draft carries the law's width profile as real weights...
    expect(weightsOf(law).size).toBeGreaterThan(3);
    // ...while the flat draft is the law-blind silhouette hatch.
    V.SETTINGS.sceneDraftTier = 'flat';
    engine.generate(gid, { preview: true });
    expect(weightsOf(group.scenePaths).size).toBe(0);
  });

  test('F5: SurfaceFill gets ribbonDraft and a mono law gets a coarser (pen-scaled) lattice only in the law tier', () => {
    const { engine, gid, group, child } = makeScene('turingStripe');
    const SF = V.Scene3D.SurfaceFill;
    const orig = SF.buildObject;
    const seen = [];
    SF.buildObject = function spy(opts) { seen.push({ pen: opts.penWidth, draft: opts.ribbonDraft }); return orig.call(this, opts); };
    try {
      child.params.transform.yaw = 33;
      engine._composeSceneGroup(group); // full
      const fullPen = seen[seen.length - 1].pen;
      expect(seen[seen.length - 1].draft).toBe(false);
      V.SETTINGS.sceneDraftTier = 'law';
      child.params.transform.yaw = 34;
      engine.generate(gid, { preview: true });
      const last = seen[seen.length - 1];
      expect(last.draft).toBe(true);
      expect(last.pen).toBeGreaterThan(fullPen * 2);
    } finally { SF.buildObject = orig; }
    expect(group.scenePaths.length).toBeGreaterThan(10);
  });

  test('B2: committing an edit on a consumed object3d runs ONLY the group compose (no standalone render), same ink', () => {
    const { engine, group, child } = makeScene(null);
    child.params.transform.yaw = 21; // a real change ⇒ memo miss
    const spy = spyScene3d();
    try {
      engine.generate(child.id);
    } finally { spy.restore(); }
    expect(spy.calls.length).toBe(1);
    expect(Array.isArray(spy.calls[0].params.objects) ? spy.calls[0].params.objects.length : 1).toBeGreaterThan(0);
    expect(child.paths).toEqual([]);
    // Same ink as a fresh full recompose of the same scene.
    const ink = JSON.stringify(group.scenePaths);
    engine.invalidateSceneCompose();
    engine.computeAllDisplayGeometry();
    expect(JSON.stringify(group.scenePaths)).toBe(ink);
  });

  test('B2: a preview on a consumed child recomposes the owning group at its draft tier', () => {
    const { engine, group, child } = makeScene('taperedEnds');
    group._sceneLastFullMs = 5000;
    const spy = spyScene3d();
    try {
      child.params.transform.yaw = 40;
      engine.generate(child.id, { preview: true });
    } finally { spy.restore(); }
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0].bounds.lawDraft).toBe(true);
    expect(group._pathsFromDraft).toBe(true);
  });

  test('B2: a child that left its scene is not treated as consumed', () => {
    const { engine, child } = makeScene(null);
    child.parentId = null; // moved out; marker still set until the next pass
    expect(child._sceneConsumed).toBe(true);
    expect(engine._sceneOwnerGroup(child)).toBeNull();
  });

  test('NEW-3: an unchanged scene reuses the last full compose; every input change recomposes', () => {
    const { engine, group, child } = makeScene(null);
    const ink = JSON.stringify(group.scenePaths);
    const spy = spyScene3d();
    try {
      // A swapped-in generate function is itself a memo input: the first pass
      // after the spy is installed recomposes (and primes the memo).
      engine.computeAllDisplayGeometry();
      expect(spy.calls.length).toBe(1);
      spy.calls.length = 0;
      engine.computeAllDisplayGeometry();
      expect(spy.calls.length).toBe(0); // memo hit
      expect(JSON.stringify(group.scenePaths)).toBe(ink);
      // The served ink is a copy: mutating it cannot poison the memo.
      group.scenePaths[0][0].x = -999;
      engine.computeAllDisplayGeometry();
      expect(JSON.stringify(group.scenePaths)).toBe(ink);
      expect(spy.calls.length).toBe(0);
      // Object param, style, group seed, pen width: each one recomposes.
      child.params.transform.pitch = 12;
      engine.computeAllDisplayGeometry();
      expect(spy.calls.length).toBe(1);
      child.params.style.params.fillDensity = 70;
      engine.computeAllDisplayGeometry();
      expect(spy.calls.length).toBe(2);
      group.params.seed = 77;
      engine.computeAllDisplayGeometry();
      expect(spy.calls.length).toBe(3);
      const pen = V.SETTINGS.pens[0];
      const w = pen.width;
      pen.width = w + 0.1;
      try {
        engine.computeAllDisplayGeometry();
        expect(spy.calls.length).toBe(4);
      } finally { pen.width = w; }
    } finally { spy.restore(); }
  });

  test('NEW-3: a draft frame is never served as the settled ink', () => {
    const { engine, gid, group, child } = makeScene('taperedEnds');
    const full = JSON.stringify(group.scenePaths);
    V.SETTINGS.sceneDraftTier = 'law';
    engine.generate(gid, { preview: true });
    expect(JSON.stringify(group.scenePaths)).not.toBe(full);
    delete V.SETTINGS.sceneDraftTier;
    engine.computeAllDisplayGeometry(); // export / any recompose
    expect(group._pathsFromDraft).toBe(false);
    expect(JSON.stringify(group.scenePaths)).toBe(full);
    expect(child._sceneConsumed).toBe(true);
  });
});
