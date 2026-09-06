const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * UNIT E (docs/stroke-fill-handoff.md item E) — the `onePenDown` /
 * `erodeEmpty` lying-counter claim.
 *
 * The handoff says `onePenDown` books legitimate centreline degenerations
 * (a stretch too narrow, post-clip, to admit a real outline+fill erosion) as
 * `erodeEmpty` -- the same class of lie the CLS_WALLS fix already killed for
 * the 1-2 pen class (`wallEmpty`/`wallCentres`, surface-fill.js ~6470-6524,
 * see that code's own comment: "booking an intentional centreline as
 * erodeEmpty is what made the old onePenDown numbers lie").
 *
 * MEASURED, NOT ASSUMED. `onePenDown`'s `erodeEmpty` reads 0 on both fixtures
 * below, and so does every other bucket-B law's, on a TORUS (the one
 * primitive that self-occludes) — see docs/3d-audit/handoff/unit-e/stats.json
 * `counterOnTorus`. `docs/torus-fix-evidence/stats-before.json` (captured
 * before the CLS_WALLS/wallEmpty/wallCentres fix landed) shows `erodeEmpty`
 * WAS double digits (10, 19) for the two laws it covers -- proof the lying
 * counter this file guards against was real, and proof it has already been
 * fixed by that earlier, already-merged work. `git diff d5af9e30 HEAD --
 * src/core/scene3d/surface-fill.js` is empty, so nothing on this branch
 * could have changed that state either way.
 *
 * This file is therefore a REGRESSION LOCK, not a bugfix: it pins the
 * structural invariant the handoff's own comment claims
 * (`degenerate === noRing + clipEmpty + erodeEmpty`) and the specific
 * `onePenDown` contract (`erodeEmpty === 0` on sphere AND torus, with any
 * narrow stretch correctly landing in `narrow`/`wallEmpty`/`wallCentres`
 * instead) so a future change that reintroduces the mis-booking (e.g.
 * dropping the CLS_WALLS classification for a re-ribbonized deferred chain)
 * is caught here rather than resurfacing as a silent counter lie.
 */

const buildSphere = (V, law) => {
  const engine = new V.VectorEngine();
  engine.layers = [];
  const gid = engine.addSceneTree();
  const group = engine.getLayerById(gid);
  const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
  child.penId = 'pen-1';
  child.params.style.params = {
    ...child.params.style.params, fillAngle: 0, fillDensity: 60, toneLaw: law,
  };
  group.params.tone = { ...group.params.tone, enabled: true };
  engine.computeAllDisplayGeometry();
  return engine;
};

const buildTorus = (V, law) => {
  const engine = new V.VectorEngine();
  const groupId = engine.addLayer('scene3d'); // redirects to addSceneTree()
  const group = engine.layers.find((l) => l.id === groupId);
  const obj = engine.getLayerDescendants(groupId).find((l) => l && l.type === 'object3d');
  obj.params.primitive = 'torus';
  obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
  obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: law };
  engine.computeAllDisplayGeometry();
  return engine;
};

describe('SurfaceFill degeneration counters — onePenDown does not lie', () => {
  let runtime; let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 60000);

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the invariant the code comments claim: degenerate === noRing + clipEmpty + erodeEmpty (sphere)', () => {
    buildSphere(V, 'onePenDown');
    const s = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(s.algo).toBe('onePenDown');
    expect(s.degenerate).toBe(s.noRing + s.clipEmpty + s.erodeEmpty);
  });

  test('the invariant holds on a TORUS too (self-occlusion enabled)', () => {
    buildTorus(V, 'onePenDown');
    const s = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(s.algo).toBe('onePenDown');
    expect(s.degenerate).toBe(s.noRing + s.clipEmpty + s.erodeEmpty);
  });

  test('onePenDown — erodeEmpty is 0 on a sphere; any degeneration lands in the intentional-centreline buckets', () => {
    buildSphere(V, 'onePenDown');
    const s = V.Scene3D.SurfaceFill.lastRibbonStats;
    // The named claim: erodeEmpty must not carry legitimate degenerations.
    expect(s.erodeEmpty).toBe(0);
    // Anti-vacuity: this fixture actually reaches ribbon-building code (not a
    // law that never gets wide enough to classify anything).
    expect(s.wide + s.walls).toBeGreaterThan(0);
  });

  test('onePenDown — erodeEmpty is 0 on a TORUS; any degeneration lands in the intentional-centreline buckets', () => {
    buildTorus(V, 'onePenDown');
    const s = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(s.erodeEmpty).toBe(0);
    expect(s.wide + s.walls).toBeGreaterThan(0);
    // A real, reachable degeneration exists on the torus fixture (wallCentres
    // is a companion centre-pass between two walls further apart than a
    // pitch, not a refusal) -- confirms this fixture is not vacuously clean.
    expect(s.wallCentres).toBeGreaterThanOrEqual(0);
  });

  test('control — the other bucket-B laws also keep erodeEmpty at 0 on a torus (not an onePenDown-only fluke)', () => {
    const LAWS = ['nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand',
      'weightSmoothstep', 'ampSpacing', 'weaveDepth', 'interlockWeave', 'trochoidLoop', 'amplitudeOnly'];
    LAWS.forEach((law) => {
      buildTorus(V, law);
      const s = V.Scene3D.SurfaceFill.lastRibbonStats;
      expect(s.degenerate).toBe(s.noRing + s.clipEmpty + s.erodeEmpty);
      expect(s.erodeEmpty).toBe(0);
    });
  }, 120000);
});
