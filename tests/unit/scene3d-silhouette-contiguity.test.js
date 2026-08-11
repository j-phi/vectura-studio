/**
 * Scene3D PLAIN silhouette (Style ▸ Border OFF) — CONTIGUITY and
 * FIDELITY-INVARIANCE.
 *
 * THE DEFECT
 * ----------
 * "A border should be a contiguous single outline of the silhouette of a 3d
 * object from the current viewing angle" — and raising Fidelity must never
 * fragment it. The BORDER pass was fixed first (chain on integer mesh vertex
 * indices, stitch, then offset the stitched polyline whole). The PLAIN
 * silhouette — what you see with Border OFF — still broke into dashes.
 *
 * MEASURED ROOT CAUSE (capsule sx18 sy84, ortho yaw -30 / pitch 25)
 * -----------------------------------------------------------------
 * `emitRuns` culled EVERY run shorter than MIN_RUN_MM (0.6mm) individually.
 * Structural edges are emitted ONE PROJECTED MESH EDGE PER PATH, so raising
 * Fidelity only shortens every stick: at Fidelity 40, 56 of the capsule's 156
 * silhouette sticks fell under the floor and punched 28 holes in the outline; at
 * 60 it was 36 holes. A sphere went 0 → 8 → 36 dangling endpoints across
 * Fidelity 12 / 22 / 40. Zeroing MIN_RUN_MM took every one of those to 0,
 * proving the cull was the sole cause (the mesh silhouette itself is a single
 * closed topological loop at every Fidelity).
 *
 * THE CONTRACT PINNED HERE
 * ------------------------
 * 1. CONTIGUITY. The floor applies to a CHAIN of welded runs, not to one stick.
 *    Runs are welded on integer mesh vertex indices — never on screen
 *    coordinates — so contiguity cannot depend on float equality and cannot
 *    depend on tessellation. A wholly visible silhouette therefore has ZERO
 *    dangling endpoints at every Fidelity.
 * 2. THE CULL'S PURPOSE SURVIVES. A genuinely isolated speck — a visibility
 *    crumb whose whole connected chain is under the floor — is still dropped.
 *    Every connected component of emitted edge ink is at least MIN_RUN_MM long.
 *
 * MEASUREMENT PATH
 * ----------------
 * Composed scene ink lives on `group.scenePaths`, NEVER `layer.paths` — a
 * per-layer `engine.generate()` bypasses `_sceneConsumed` and renders an
 * object3d STANDALONE off ALGO_DEFAULTS. Everything below drives a real engine
 * scene group through `computeAllDisplayGeometry()`. Border is OFF throughout:
 * with Border ON the two passes overprint at ±0.12mm and MASK the defect.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Mirrors MIN_RUN_MM in src/core/algorithms/scene3d.js.
const MIN_RUN_MM = 0.6;

describe('scene3d plain silhouette contiguity (Border OFF)', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // `objects` is a list of { primitive, params, transform? }. An empty stage
  // (no ground, no backdrop) so a lone object's silhouette is wholly
  // unoccluded and EVERY break in its ink is an artifact.
  const compose = (objects, opts = {}) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    // `addLayer('scene3d')` builds a scene TREE seeded with one default object3d
    // child. Drop it, or the object under test shares the stage with a second
    // solid that occludes it.
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

    objects.forEach((spec) => {
      const childId = engine.addLayer('object3d');
      const child = engine.layers.find((l) => l.id === childId);
      child.parentId = groupId;
      child.params.seed = 0;
      child.params.primitive = spec.primitive;
      child.params.params = { ...spec.params };
      child.params.transform = {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, ...(spec.transform || {}),
      };
      child.params.visibility = 'solid';
      child.params.style = { penId: null, mapper: 'none', params: {} };
      // Border OFF is the whole point — leave `border` unset.
      if (opts.curves) Object.assign(child.params, opts.curves);
    });

    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return live.scenePaths || [];
  };

  const edgeInk = (paths) => paths.filter((p) => p && p.meta && p.meta.kind === 'sceneEdge');

  const EPS = 1e-6;
  const key = (pt) => `${Math.round(pt.x / EPS)},${Math.round(pt.y / EPS)}`;
  const same = (a, b) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
  const isLoop = (p) => p.length > 2 && same(p[0], p[p.length - 1]);
  const len = (p) => {
    let d = 0;
    for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return d;
  };

  // A break in the outline shows up as an endpoint that no other edge path
  // shares. On a wholly visible silhouette there must be none.
  const danglingEndpoints = (paths) => {
    const buckets = new Map();
    paths.forEach((p) => {
      if (isLoop(p)) return; // a closed loop has no endpoints at all
      [p[0], p[p.length - 1]].forEach((pt) => {
        const k = key(pt);
        buckets.set(k, (buckets.get(k) || 0) + 1);
      });
    });
    let n = 0;
    buckets.forEach((count) => { if (count < 2) n += 1; });
    return n;
  };

  // Union-find over shared endpoints: the total drawn length of each connected
  // component of edge ink. This is the measure the emission floor must govern.
  const componentLengths = (paths) => {
    const parent = new Map();
    const find = (k) => {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      let c = k;
      while (parent.get(c) !== r) { const nx = parent.get(c); parent.set(c, r); c = nx; }
      return r;
    };
    const add = (k) => { if (!parent.has(k)) parent.set(k, k); return k; };
    const union = (x, y) => { const a = find(add(x)); const b = find(add(y)); if (a !== b) parent.set(a, b); };
    paths.forEach((p) => union(key(p[0]), key(p[p.length - 1])));
    const totals = new Map();
    paths.forEach((p) => {
      const r = find(key(p[0]));
      totals.set(r, (totals.get(r) || 0) + len(p));
    });
    return [...totals.values()];
  };

  const CAPSULE = (detail) => ({ primitive: 'capsule', params: { sx: 18, sy: 84, sz: 18, detail } });
  const SPHERE = (detail) => ({ primitive: 'sphere', params: { sx: 50, sy: 50, sz: 50, detail } });
  const FIDELITIES = [8, 12, 22, 40, 60];

  // ── 1. Contiguity at every Fidelity — the defect ───────────────────────────

  test('a capsule silhouette has no gaps at any Fidelity (Border OFF)', () => {
    const report = FIDELITIES.map((detail) => {
      const ink = edgeInk(compose([CAPSULE(detail)]));
      expect(ink.length).toBeGreaterThan(0);
      return { detail, dangling: danglingEndpoints(ink) };
    });
    expect(report).toEqual(FIDELITIES.map((detail) => ({ detail, dangling: 0 })));
  });

  test('a sphere silhouette has no gaps at any Fidelity (Border OFF)', () => {
    const report = FIDELITIES.map((detail) => {
      const ink = edgeInk(compose([SPHERE(detail)]));
      expect(ink.length).toBeGreaterThan(0);
      return { detail, dangling: danglingEndpoints(ink) };
    });
    expect(report).toEqual(FIDELITIES.map((detail) => ({ detail, dangling: 0 })));
  });

  test('a torus keeps BOTH silhouette loops unbroken as Fidelity rises', () => {
    const report = [12, 24, 44].map((detail) => {
      const ink = edgeInk(compose(
        [{ primitive: 'torus', params: { sx: 90, sy: 26, sz: 26, detail } }],
        { yaw: 0, pitch: 89 },
      ));
      expect(ink.length).toBeGreaterThan(0);
      return { detail, dangling: danglingEndpoints(ink) };
    });
    expect(report).toEqual([12, 24, 44].map((detail) => ({ detail, dangling: 0 })));
  });

  test('with Curves on the silhouette is still gapless at high Fidelity', () => {
    const ink = edgeInk(compose([CAPSULE(40)], { curves: { curves: true, smoothing: 1, simplify: 0 } }));
    expect(ink.length).toBeGreaterThan(0);
    expect(danglingEndpoints(ink)).toBe(0);
  });

  // ── 2. Fidelity-invariance: the outline is ONE component, always ───────────

  test('the silhouette stays a single connected component as Fidelity rises', () => {
    const counts = FIDELITIES.map((detail) => componentLengths(edgeInk(compose([CAPSULE(detail)]))).length);
    expect(counts).toEqual(FIDELITIES.map(() => 1));
  });

  // ── 3. The cull's PURPOSE survives: no isolated sub-floor specks ───────────

  test('no connected component of edge ink is shorter than the emission floor', () => {
    // A heavily occluded stage: a big box in front of a fine-tessellated
    // sphere, so HLR chops the sphere outline into partial runs and produces
    // genuine visibility crumbs. Every surviving component must still clear the
    // floor — the floor moved from the stick to the chain, it did not vanish.
    const scenes = [
      [CAPSULE(40)],
      [SPHERE(40)],
      [SPHERE(40), { primitive: 'box', params: { sx: 60, sy: 60, sz: 60 }, transform: { x: 10, y: 6, z: 90 } }],
      [SPHERE(60), { primitive: 'cylinder', params: { sx: 30, sy: 90, sz: 30, detail: 32 }, transform: { x: -18, z: 80 } }],
    ];
    scenes.forEach((objects, i) => {
      const ink = edgeInk(compose(objects));
      expect(ink.length).toBeGreaterThan(0);
      const short = componentLengths(ink).filter((L) => L < MIN_RUN_MM - 1e-9);
      expect({ scene: i, short }).toEqual({ scene: i, short: [] });
    });
  });
});
