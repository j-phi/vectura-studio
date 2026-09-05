const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-AUDIT P1 MARK-LAW DEFECTS (W-05 / W-06 / W-07).
 *
 * Shared harness for three unrelated mark-law fixes on `src/core/scene3d/
 * surface-fill.js`. Each drives `Vectura.AlgorithmRegistry.scene3d.generate`
 * directly with the SAME real param defaults the audit's own capture script
 * (`scripts/audit/scene3d-capture.js`) uses — `Scene3D.Params.
 * PRIMITIVE_PARAM_DEFAULTS`/`DEFAULT_CAMERA`, a 135°/45° sun, sphere,
 * hatch, fillDensity 50 (density "med" — see `DENSITY_VALUES` in the
 * capture script). This is deliberately NOT the `scene3d-tone-law-dispatch`
 * test's hand-rolled opts bag: those defaults reproduce a materially
 * different geometry (measured: ~2500 mkTick marks / no row starvation),
 * while the params below reproduce the audit's own numbers exactly
 * (mkTick: 666 paths, 3131.3 mm ink, 8 surviving rows — verified against
 * `docs/3d-audit/fill-audit/shots/B/sphere__hatch__mkTick__med__a.webp`).
 */

describe('Scene3D.SurfaceFill — mark-law draw defects (fill-audit W-05/06/07)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params;

  const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
  const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const buildSceneParams = (toneLaw, mapper = 'hatch', fillDensity = 50, primitive = 'sphere') => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj', name: 'Obj', primitive, params: clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}),
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = clone(Params.DEFAULT_CAMERA);
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw } }, byObject: {}, byFace: {},
    };
    return p;
  };

  const totalInk = (paths) => (paths || []).reduce((acc, pp) => {
    if (!pp) return acc;
    let len = 0;
    for (let i = 1; i < pp.length; i += 1) len += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    return acc + len;
  }, 0);

  // Nearest master-ruling tangent to a point, read off a `toneLaw:'ladder'`
  // render at the same density — the ground truth for "which way does the
  // ruling actually run here" without threading any internal state out of
  // `buildObject`. Returns null if nothing is within `maxDist` (a mark far
  // from any surviving ladder ruling has no ground truth to check against).
  const nearestRulingTangent = (ladderPaths, pt, maxDist) => {
    let best = null; let bestDist = maxDist;
    (ladderPaths || []).forEach((pp) => {
      if (!Array.isArray(pp)) return;
      for (let i = 1; i < pp.length; i += 1) {
        const a = pp[i - 1]; const b = pp[i];
        const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
        const d = Math.hypot(mx - pt.x, my - pt.y);
        if (d < bestDist) {
          const dx = b.x - a.x; const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          bestDist = d;
          best = { x: dx / len, y: dy / len };
        }
      }
    });
    return best;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
  }, 60000);
  afterAll(() => runtime.cleanup());

  describe('W-05 — mkTick draws its ticks, across the ruling, scaled by darkness (F-05)', () => {
    let ladderPaths; let tickPaths; let stat;

    beforeAll(() => {
      ladderPaths = algo.generate(buildSceneParams('ladder'), null, null, BOUNDS);
      tickPaths = algo.generate(buildSceneParams('mkTick'), null, null, BOUNDS);
      stat = SF.lastMarkStats;
    });

    test('reads as a tick texture: hundreds of short, discrete marks, not a bare ruling skeleton', () => {
      expect(tickPaths.length).toBeGreaterThanOrEqual(200);
      // Every tick is a plain 2-point dash — never a multi-point ruling
      // fragment (the "carrier ruling" the finding describes).
      tickPaths.forEach((pp) => expect(pp.length).toBe(2));
    });

    test('count scales with darkness: the shadow third places at least 2x the highlight third', () => {
      expect(stat).toBeTruthy();
      expect(stat.rows).toBeGreaterThan(0);
      const [dark, , light] = stat.byThird;
      expect(dark).toBeGreaterThanOrEqual(light * 2);
    });

    // THE RED PROOF (surface-fill.js:2423 `mkTick: {..., or:'across', ...}`
    // pre-fix). `thetaAt` already rotates a 'tick' shape's own raw points
    // (naturally built ACROSS the ruling — a segment at fixed local-u,
    // spanning local-v) by ANOTHER 90 degrees for `or:'across'`, landing the
    // drawn segment ALONG the ruling instead. Densely spaced along-oriented
    // ticks chain into what reads as the sphere's own carrier rulings —
    // exactly the "5-6 long rulings" the finding describes. Measured
    // pre-fix: median |cos(angle to nearest ruling tangent)| ~0.9 (near
    // parallel); post-fix ~0.02 (near perpendicular).
    test('every tick runs ACROSS its ruling, not along it', () => {
      const cosines = [];
      for (let i = 0; i < tickPaths.length; i += 1) {
        const pp = tickPaths[i];
        const a = pp[0]; const b = pp[1];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (!(len > 1e-6)) continue;
        const dir = { x: dx / len, y: dy / len };
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const tangent = nearestRulingTangent(ladderPaths, mid, 3);
        if (!tangent) continue;
        cosines.push(Math.abs(dir.x * tangent.x + dir.y * tangent.y));
      }
      expect(cosines.length).toBeGreaterThan(20);
      cosines.sort((x, y) => x - y);
      const median = cosines[Math.floor(cosines.length / 2)];
      expect(median).toBeLessThan(0.5);
    });

    test('ink stays in the same order of magnitude as the ladder scaffold it replaces', () => {
      const ladderInk = totalInk(ladderPaths);
      const tickInk = totalInk(tickPaths);
      expect(tickInk).toBeGreaterThan(ladderInk * 0.5);
      expect(tickInk).toBeLessThan(ladderInk * 10);
    });
  });
});
