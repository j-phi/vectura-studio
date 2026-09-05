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

  describe('W-06 — mkDashRamp dashes lie on the rulings at low/med (F-06)', () => {
    // THE RED PROOF (surface-fill.js `solveAt`, pre-fix). The 'morph' shape's
    // band capacity was `floor(1.12*R/w) * P` where `R` is the ROW pitch
    // (master pitch inflated 1/MK_ROW_COV = 3x, so a mark law's row has room
    // to carry a mark) — so a full-black dash could dissolve into a band up
    // to ~3.4 master-pitches wide, floating over several neighbouring
    // rulings at once ("a tile several rulings wide", the finding's words).
    // Fixed: capped at 2x the TRUE (uninflated) master pitch. Measured
    // pre-fix on this fixture: sphere/hatch/mkDashRamp low and med both
    // rendered the SAME 498 paths / 2699.9 mm ink — density had no effect at
    // all, the other half of this defect.
    test.each(['low', 'med'])('density=%s: every dash sits on a master ruling, none over 2x master pitch', (density) => {
      const fillDensity = density === 'low' ? 1 : 50;
      const ladderPaths = algo.generate(buildSceneParams('ladder', 'hatch', fillDensity), null, null, BOUNDS);
      const dashPaths = algo.generate(buildSceneParams('mkDashRamp', 'hatch', fillDensity), null, null, BOUNDS);
      const stat = SF.lastMarkStats;

      expect(dashPaths.length).toBeGreaterThan(20);
      expect(stat).toBeTruthy();

      let checked = 0;
      let maxLen = 0;
      dashPaths.forEach((pp) => {
        for (let i = 1; i < pp.length; i += 1) {
          const a = pp[i - 1]; const b = pp[i];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          maxLen = Math.max(maxLen, len);
        }
        const mid = { x: (pp[0].x + pp[pp.length - 1].x) / 2, y: (pp[0].y + pp[pp.length - 1].y) / 2 };
        const tangent = nearestRulingTangent(ladderPaths, mid, 2.5);
        if (tangent) checked += 1;
      });
      // A dash whose midpoint has no master ruling within 2.5 mm is a dash
      // floating disconnected from the ruling family — the F-06 picture.
      expect(checked / dashPaths.length).toBeGreaterThan(0.85);
      // stat.rows / master pitch aren't exposed per-path, so the ceiling is
      // stated per density rather than as one constant: at fillDensity 1 the
      // master pitch itself is wide (few rulings on the whole sphere), so
      // 2x it is legitimately bigger than at 50 (measured 20.1 mm / 5.5 mm
      // post-fix). Both stay far under the 26 mm `MK_PMAX` hard ceiling the
      // old ROW-pitch-based (3x true pitch) formula could reach unbounded.
      expect(maxLen).toBeLessThan(density === 'low' ? 25 : 15);
    });

    test('density carries tone: low and med no longer render byte-identically', () => {
      const low = algo.generate(buildSceneParams('mkDashRamp', 'hatch', 1), null, null, BOUNDS);
      const med = algo.generate(buildSceneParams('mkDashRamp', 'hatch', 50), null, null, BOUNDS);
      expect(low.length).not.toBe(med.length);
      expect(totalInk(low)).not.toBeCloseTo(totalInk(med), 1);
    });
  });

  describe('W-07 — deepFillTSP fills the darks with a real traverse (F-07)', () => {
    // THE RED PROOF (surface-fill.js `algoCoverage`'s deepFillTSP branch and
    // `tspAt`, pre-fix). The halving `base / (1 + tspRamp(I))` fired
    // unconditionally, and `tspAt` measured its excursion against the
    // GLOBAL `floorPitch` — but at the pitch this bug fires at, the drawn
    // pitch and `floorPitch` were already the same number (see the comment
    // at `algoCoverage`'s deepFillTSP branch), so `amp` came out ~0 on
    // every sample: the darks got a thinner ruling AND no traverse to fill
    // the gap it opened. Measured pre-fix on this fixture: sphere/hatch/
    // deepFillTSP low and med both rendered the SAME 79 paths / 493.8 mm
    // ink (density had no effect), and the darkest region read as a bare
    // thinned ruling, not a zig-zag.
    test('low and med no longer render byte-identically (the coverage gate was inert)', () => {
      const low = algo.generate(buildSceneParams('deepFillTSP', 'hatch', 1), null, null, BOUNDS);
      const med = algo.generate(buildSceneParams('deepFillTSP', 'hatch', 50), null, null, BOUNDS);
      expect(totalInk(low)).not.toBeCloseTo(totalInk(med), 1);
    });

    test('the traverse displaces points off the ruling once it engages, and stays a single continuous path per ruling', () => {
      const paths = algo.generate(buildSceneParams('deepFillTSP', 'hatch', 50), null, null, BOUNDS);
      // A real zig-zag reads as LATERAL deviation from the straight chord
      // between a path's own two ends — a bare (unfixed) ruling is straight
      // enough that this deviation is negligible everywhere.
      let sawRealDeviation = false;
      paths.forEach((pp) => {
        if (!Array.isArray(pp) || pp.length < 4) return;
        const a = pp[0]; const b = pp[pp.length - 1];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const chordLen = Math.hypot(dx, dy);
        if (!(chordLen > 1e-6)) return;
        const ux = dx / chordLen; const uy = dy / chordLen;
        let maxDev = 0;
        pp.forEach((pt) => {
          const px = pt.x - a.x; const py = pt.y - a.y;
          maxDev = Math.max(maxDev, Math.abs(px * uy - py * ux));
        });
        if (maxDev > 0.15) sawRealDeviation = true; // > ~half a pen, off the chord
      });
      expect(sawRealDeviation).toBe(true);
    });

    test('generation stays fast on a torus at d=220 (perf ceiling, ~2s)', () => {
      const p = buildSceneParams('deepFillTSP', 'hatch', 220, 'torus');
      const t0 = Date.now();
      const paths = algo.generate(p, null, null, BOUNDS);
      const ms = Date.now() - t0;
      expect(paths.length).toBeGreaterThan(0);
      expect(ms).toBeLessThan(2000);
    });
  });
});
