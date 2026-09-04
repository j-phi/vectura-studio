/**
 * Scene3D Style > Border — CONTIGUITY and FIDELITY-INVARIANCE.
 *
 * THE DEFECT
 * ----------
 * "Increasing fidelity is causing breaks in Style > Border and it must not. A
 * border should be a contiguous single outline of the silhouette of a 3d object
 * from the current viewing angle." — and, with Curves on and Smoothing at 1.00,
 * "I'm still seeing a lumpy border."
 *
 * MEASURED ROOT CAUSE (capsule sx18 sy84, Fidelity 22, ortho)
 * -----------------------------------------------------------
 * `sceneEdge` paths are emitted ONE PROJECTED MESH EDGE PER PATH. The border
 * emphasis then offset EACH 2-point stick along ITS OWN screen normal before
 * emitting it, so the mesh vertex two adjacent sticks share landed at two
 * DIFFERENT screen points — a physical gap of 2·d·tan(theta/2) at every vertex.
 * That is the dashed outline. It also made the display-stage chain
 * (`_applySceneCurveFinish`, exact-endpoint by design) fail: 104 of 112 border
 * paths stayed 2-point `meta.straight` sticks even with Curves on + Smoothing
 * 1.00, and a 2-point path IS a straight line, so no fitter could smooth it.
 * That is the lumpy crown. Endpoint-degree histograms on the emitted border ink
 * measured 96 / 224 / 176 DANGLING endpoints at Fidelity 12 / 22 / 40.
 *
 * THE CONTRACT PINNED HERE
 * ------------------------
 * The border is chained TOPOLOGICALLY, on integer mesh vertex indices, before
 * anything touches screen coordinates — so contiguity cannot depend on float
 * equality and loop count cannot depend on tessellation. Each emitted border
 * path is one unbroken run; a lone object's fully visible silhouette is a CLOSED
 * loop. "Contiguous" means each loop unbroken, NOT that there is exactly one
 * path: a torus seen face-on legitimately has two silhouette loops.
 *
 * MEASUREMENT PATH
 * ----------------
 * Composed scene ink lives on `group.scenePaths`, NEVER `layer.paths` — a
 * per-layer `engine.generate()` bypasses `_sceneConsumed` and renders an
 * object3d STANDALONE off ALGO_DEFAULTS. Everything below drives a real engine
 * scene group through `computeAllDisplayGeometry()`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BORDER_PEN = 'pen-border';

describe('scene3d Style > Border contiguity', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // One object on an empty stage (no ground, no backdrop) so the silhouette is
  // wholly unoccluded and every break in the border ink is an artifact.
  const compose = (primitive, objParams, opts = {}) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    // `addLayer('scene3d')` builds a scene TREE seeded with one default object3d
    // child. Drop it, or the object under test shares the stage with a second
    // solid that occludes it — and a genuinely occluded silhouette is NOT the
    // artifact this suite is about.
    engine.layers = engine.layers.filter((l) => l.parentId !== groupId);
    const group = engine.layers.find((l) => l.id === groupId);
    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = 0;
    group.params.objects = [];
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
      yaw: opts.yaw !== undefined ? opts.yaw : -30,
      pitch: opts.pitch !== undefined ? opts.pitch : 25,
    };
    group.params.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
      intensity: 1, castShadows: false,
    }];

    const childId = engine.addLayer('object3d');
    const child = engine.layers.find((l) => l.id === childId);
    child.parentId = groupId;
    child.params.seed = 0;
    child.params.primitive = primitive;
    child.params.params = { ...objParams };
    child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    child.params.visibility = 'solid';
    child.params.style = { penId: null, mapper: 'none', params: {} };
    if (opts.border !== undefined) child.params.border = opts.border;
    if (opts.curves) Object.assign(child.params, opts.curves);

    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return live.scenePaths || [];
  };

  // Jay's repro: Capsule, Radius 18, Length 84, Curves on, Smoothing 1.00,
  // Simplify 0.00, Border on.
  const CAPSULE = (detail) => ({ sx: 18, sy: 84, sz: 18, detail });
  const CURVES_ON = { curves: true, smoothing: 1, simplify: 0 };
  const BORDER_ON = { enabled: true, strength: 1, penId: BORDER_PEN };

  const borderInk = (paths) => paths.filter((p) => p && p.meta && p.meta.penId === BORDER_PEN);

  const EPS = 1e-6;
  const same = (a, b) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
  const isLoop = (p) => p.length > 2 && same(p[0], p[p.length - 1]);

  // A break in the outline shows up as an endpoint that no other border path
  // shares. On a wholly visible silhouette there must be none.
  const danglingEndpoints = (paths) => {
    const buckets = new Map();
    paths.forEach((p) => {
      if (isLoop(p)) return; // a closed loop has no endpoints at all
      [p[0], p[p.length - 1]].forEach((pt) => {
        const k = `${Math.round(pt.x / EPS)},${Math.round(pt.y / EPS)}`;
        buckets.set(k, (buckets.get(k) || 0) + 1);
      });
    });
    let n = 0;
    buckets.forEach((count) => { if (count < 2) n += 1; });
    return n;
  };

  const hasCurveHandles = (p) => Array.isArray(p.meta && p.meta.anchors)
    && p.meta.anchors.some((a) => a && (a.in || a.out));

  // ── 1. Contiguity at Jay's exact setting ───────────────────────────────────

  test("a capsule's border is closed loops with no gaps (Fidelity 22, Curves on)", () => {
    const ink = borderInk(compose('capsule', CAPSULE(22), { border: BORDER_ON, curves: CURVES_ON }));
    expect(ink.length).toBeGreaterThan(0);
    expect(danglingEndpoints(ink)).toBe(0);
    expect(ink.every(isLoop)).toBe(true);
  });

  test('border ink is never a 2-point stick', () => {
    const ink = borderInk(compose('capsule', CAPSULE(22), { border: BORDER_ON, curves: CURVES_ON }));
    expect(ink.every((p) => p.length > 2)).toBe(true);
  });

  // ── 2. Fidelity-invariance — Jay's actual complaint ────────────────────────

  test('loop count and continuity are invariant as Fidelity rises', () => {
    const counts = [12, 22, 40].map((detail) => {
      const ink = borderInk(compose('capsule', CAPSULE(detail), { border: BORDER_ON, curves: CURVES_ON }));
      expect(ink.length).toBeGreaterThan(0);
      expect(danglingEndpoints(ink)).toBe(0);
      expect(ink.every(isLoop)).toBe(true);
      return ink.length;
    });
    expect(counts[1]).toBe(counts[0]);
    expect(counts[2]).toBe(counts[0]);
  });

  test('Curves OFF: the border is still contiguous at every Fidelity', () => {
    [12, 22, 40].forEach((detail) => {
      const ink = borderInk(compose('capsule', CAPSULE(detail), { border: BORDER_ON }));
      expect(danglingEndpoints(ink)).toBe(0);
      expect(ink.every(isLoop)).toBe(true);
    });
  });

  // ── 3. Smoothness — the lumpy crown ────────────────────────────────────────

  test('with Curves on the border carries curve commands, not a chord chain', () => {
    const ink = borderInk(compose('capsule', CAPSULE(22), { border: BORDER_ON, curves: CURVES_ON }));
    expect(ink.every((p) => p.meta.straight !== true)).toBe(true);
    expect(ink.every(hasCurveHandles)).toBe(true);
  });

  // ── 4. Multi-loop silhouettes are legitimate ───────────────────────────────

  test('a torus seen face-on keeps BOTH silhouette loops, each unbroken', () => {
    const ink = borderInk(compose(
      'torus',
      { sx: 90, sy: 26, sz: 26, detail: 24 },
      { border: BORDER_ON, curves: CURVES_ON, yaw: 0, pitch: 89 },
    ));
    expect(ink.every(isLoop)).toBe(true);
    expect(danglingEndpoints(ink)).toBe(0);
    // Outer rim + inner hole = two loops per emphasis pass.
    const passes = 2; // strength 1 => Math.round(1 * 2)
    expect(ink.length).toBe(2 * passes);
  });

  // ── 5. The default stays inert ─────────────────────────────────────────────

  test('REGRESSION: border off emits no border ink and is byte-identical to no block', () => {
    const noBlock = compose('capsule', CAPSULE(22), { curves: CURVES_ON });
    const off = compose('capsule', CAPSULE(22), { border: { enabled: false }, curves: CURVES_ON });
    expect(borderInk(off).length).toBe(0);
    expect(JSON.stringify(off)).toBe(JSON.stringify(noBlock));
  });
});
