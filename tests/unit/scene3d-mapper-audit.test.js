/**
 * 3D Scene Studio — mapper × primitive correctness audit (user-reported I13/I14/I21).
 *
 * I21  Every mapper must render as its NAME implies on EVERY primitive. The
 *      confirmed break: a Spiral on a superellipsoid rendered as near-vertical
 *      striping, NOT a spiral — because topoSuperellipsoid (and topoCylinder /
 *      topoCapsule / topoPyramid) sample (u,vv) with u=AROUND, vv=ALONG-axis,
 *      the OPPOSITE of the sphere/cone convention SurfaceFill's helix assumes
 *      (a=along-axis sweep, b=around wind). SurfaceFill.chartFor now normalizes
 *      the axis roles so the helix winds the around-coordinate on every prim.
 *
 * I14  Spiral Angle-offset / Eccentricity / Centre / Axis-snap were inert on
 *      curved primitives: the surfaceHelix path never received them. They are
 *      now wired into buildObject so each visibly changes the wrapped spiral.
 *
 * I13  At density 100 the spiral must reach full overlap (loops touch, no gaps).
 *      The density→pitch mapping now floors near the pen width instead of ~1mm.
 *
 * RGR: each behavioural assertion FAILS on the pre-fix branch (wrong chart
 * convention / inert curved-spiral controls / loose max-density pitch) and
 * passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

describe('3D Scene Studio — mapper × primitive audit (I13/I14/I21)', () => {
  let runtime; let V; let algo; let defaults; let realCascade;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
    realCascade = V.Scene3D.StyleCascade;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  // Stub cascade so style.params pass through verbatim (no whitelist in the way).
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };

  const primObject = (primitive, extra = {}) => {
    const base = primitive === 'sphere'
      ? { radius: 34, detail: 16 }
      : { sx: 34, sy: 34, sz: 34, detail: primitive === 'pyramid' ? 8 : (primitive === 'torusKnot' ? 20 : 16) };
    return {
      id: 'obj-1', name: primitive, primitive, params: { ...base, ...extra },
      transform: { x: 0, y: 0, z: 0, yaw: 18, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
  };
  const sceneParams = (mapper, objects, params = {}) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...params } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };
  const gen = (mapper, objects, params, bounds) => algo.generate(sceneParams(mapper, objects, params), null, null, bounds || BOUNDS) || [];
  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill' && pp.length >= 2);
  const edges = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge');

  // Cumulative signed winding of a polyline about (cx,cy).
  const winding = (run, cx, cy) => {
    let w = 0;
    for (let i = 1; i < run.length; i++) {
      const a0 = Math.atan2(run[i - 1].y - cy, run[i - 1].x - cx);
      const a1 = Math.atan2(run[i].y - cy, run[i].x - cx);
      let d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      w += d;
    }
    return w;
  };
  const centroidOf = (runs) => {
    let x = 0; let y = 0; let n = 0;
    runs.forEach((r) => r.forEach((p) => { x += p.x; y += p.y; n += 1; }));
    return { x: x / Math.max(1, n), y: y / Math.max(1, n), n };
  };
  const totalWinding = (runs) => {
    const c = centroidOf(runs);
    return runs.reduce((a, r) => a + Math.abs(winding(r, c.x, c.y)), 0);
  };

  const CURVED = ['sphere', 'torus', 'cone', 'cylinder', 'capsule', 'pyramid', 'superellipsoid', 'torusKnot'];
  const ALL_PRIMS = ['box', ...CURVED];
  const SURFACE_MAPPERS = ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'];
  // Prims whose "along axis" is the world-Y pole axis (a meridian sweep spans Y
  // pole-to-pole). Ring-like prims (torus, torusKnot) are excluded — their sweep
  // follows a ring, not a pole axis — but still get the smoke + spiral checks.
  // (ellipsoid dispatches through the 'sphere' chart via TOPOFORM_MODES, so it is
  // not itself a chartFor mode — excluded here, covered by the sphere case.)
  const POLE_AXIS = ['sphere', 'cone', 'cylinder', 'capsule', 'pyramid', 'superellipsoid'];

  // ── I21: chart convention (the root cause of the superellipsoid stripes) ─────
  describe('I21 — SurfaceFill.chartFor axis convention', () => {
    const SIZES = { sx: 40, sy: 40, sz: 40 };
    const SF = () => V.Scene3D.SurfaceFill;

    test('chartFor is exported and returns a sampler for every curved primitive', () => {
      CURVED.forEach((mode) => {
        expect(typeof SF().chartFor(mode, SIZES)).toBe('function');
      });
    });

    // The invariant that makes the wrapped spiral a real helix on EVERY pole-axis
    // primitive: sweeping the FIRST chart arg (fixed second) is a MERIDIAN that
    // spans the pole axis (Y ranges nearly the full height), while sweeping the
    // SECOND arg (fixed first, at the equator) is a PARALLEL that winds a full
    // turn around. On the pre-fix superellipsoid/cylinder/capsule/pyramid the
    // roles are swapped, so the first-arg sweep is a constant-Y ring (tiny Y
    // span) — this assertion FAILS there.
    POLE_AXIS.forEach((mode) => {
      test(`${mode}: sweeping arg-a is a pole-to-pole meridian; sweeping arg-b winds a full turn`, () => {
        const chart = SF().chartFor(mode, SIZES);
        // Meridian: fix b (a longitude), sweep a.
        const ys = [];
        for (let i = 0; i <= 20; i++) ys.push(chart(i / 20, 0.3).y);
        const ySpan = Math.max(...ys) - Math.min(...ys);
        expect(ySpan).toBeGreaterThan(SIZES.sy); // spans the axis (not a constant-Y ring)
        // Parallel: fix a at the equator, sweep b — winds ~2π about the Y axis.
        const ring = [];
        for (let i = 0; i <= 40; i++) { const p = chart(0.5, i / 40); ring.push({ x: p.x, y: p.z }); }
        expect(Math.abs(winding(ring, 0, 0))).toBeGreaterThan(2 * Math.PI * 0.8);
      });
    });
  });

  // ── I21: the superellipsoid spiral is a genuine spiral, not vertical stripes ─
  describe('I21 — superellipsoid Spiral emits a genuine helix', () => {
    test('the wrapped spiral winds many turns (not a near-vertical striped band)', () => {
      installStub();
      const seRuns = fills(gen('spiral', [primObject('superellipsoid')]));
      const spRuns = fills(gen('spiral', [primObject('sphere')]));
      expect(seRuns.length).toBeGreaterThan(0);
      const hOf = (runs) => { let sdx = 0; let sdy = 0; runs.forEach((r) => { for (let i = 1; i < r.length; i++) { sdx += Math.abs(r[i].x - r[i - 1].x); sdy += Math.abs(r[i].y - r[i - 1].y); } }); return sdx / Math.max(1e-6, sdy); };
      // A genuine helix wraps the AROUND-coordinate: the superellipsoid spiral's
      // horizontal character (meanDx/meanDy) must track the sphere's — both are
      // real helices. The pre-fix superellipsoid was a near-vertical striped band
      // (low H) wildly unlike the sphere, so this ratio was far below 1 → RED.
      expect(hOf(seRuns)).toBeGreaterThan(hOf(spRuns) * 0.65);
    });
  });

  // ── I21: every mapper renders non-empty on every primitive ───────────────────
  describe('I21 — per-primitive mapper smoke (each mapper renders on each shape)', () => {
    ALL_PRIMS.forEach((prim) => {
      SURFACE_MAPPERS.forEach((mapper) => {
        test(`${prim} × ${mapper} emits surface fills`, () => {
          installStub();
          expect(fills(gen(mapper, [primObject(prim)])).length).toBeGreaterThan(0);
        });
      });
      test(`${prim} × none / wireframe emit edges`, () => {
        installStub();
        expect(edges(gen('none', [primObject(prim)])).length).toBeGreaterThan(0);
        expect(edges(gen('wireframe', [primObject(prim)])).length).toBeGreaterThan(0);
      });
    });
  });

  // ── I14: curved-spiral controls each change the wrapped spiral ───────────────
  describe('I14 — spiral controls affect curved (surfaceHelix) primitives', () => {
    const spiralFills = (prim, params) => JSON.stringify(fills(gen('spiral', [primObject(prim)], params)));
    // sphere = a well-behaved curved surface for the surfaceHelix path.
    const BASE = { fillDensity: 60, spiralMode: 'surfaceHelix' };

    test('spiralAngleOffset changes the wrapped spiral', () => {
      installStub();
      const a = spiralFills('sphere', { ...BASE, spiralAngleOffset: 0 });
      const b = spiralFills('sphere', { ...BASE, spiralAngleOffset: 120 });
      expect(a).not.toBe(b);
    });
    test('spiralEccentricity changes the wrapped spiral', () => {
      installStub();
      const a = spiralFills('sphere', { ...BASE, spiralEccentricity: 1 });
      const b = spiralFills('sphere', { ...BASE, spiralEccentricity: 2.6 });
      expect(a).not.toBe(b);
    });
    test('spiralCenter changes the wrapped spiral', () => {
      installStub();
      const a = spiralFills('sphere', { ...BASE, spiralCenter: 'centroid' });
      const b = spiralFills('sphere', { ...BASE, spiralCenter: 'bboxCenter' });
      expect(a).not.toBe(b);
    });
    test('axisSnap changes the wrapped spiral', () => {
      installStub();
      const a = spiralFills('sphere', { ...BASE, axisSnap: false });
      const b = spiralFills('sphere', { ...BASE, axisSnap: true });
      expect(a).not.toBe(b);
    });
    test('all curved-spiral controls at their defaults are a no-op (byte-identical)', () => {
      installStub();
      const bare = spiralFills('sphere', { fillDensity: 60 });
      const explicit = spiralFills('sphere', {
        fillDensity: 60, spiralAngleOffset: 0, spiralEccentricity: 1, spiralCenter: 'centroid', axisSnap: false,
      });
      expect(explicit).toBe(bare);
    });
    test('the same controls still change a faceted (flatClip) box spiral (regression guard)', () => {
      installStub();
      const a = JSON.stringify(fills(gen('spiral', [primObject('box')], { fillDensity: 40, spiralAngleOffset: 0 })));
      const b = JSON.stringify(fills(gen('spiral', [primObject('box')], { fillDensity: 40, spiralAngleOffset: 130 })));
      expect(a).not.toBe(b);
    });
  });

  // ── I13: density 100 reaches full overlap; lower is looser ───────────────────
  describe('I13 — spiral density → pitch (100 = full overlap)', () => {
    const longest = (runs) => runs.slice().sort((a, b) => b.length - a.length)[0] || [];
    // Estimate the loop pitch (screen mm) of the central spiral run: rMax / turns.
    const loopPitch = (runs) => {
      const run = longest(runs);
      if (run.length < 3) return Infinity;
      let cx = 0; let cy = 0;
      run.forEach((p) => { cx += p.x; cy += p.y; });
      cx /= run.length; cy /= run.length;
      const rMax = run.reduce((m, p) => Math.max(m, Math.hypot(p.x - cx, p.y - cy)), 0);
      const turns = Math.abs(winding(run, cx, cy)) / (2 * Math.PI);
      return turns > 0.5 ? rMax / turns : Infinity;
    };

    test('faceted box: density 100 packs a much tighter pitch than density 50', () => {
      installStub();
      const p100 = loopPitch(fills(gen('spiral', [primObject('box')], { fillDensity: 100 })));
      const p50 = loopPitch(fills(gen('spiral', [primObject('box')], { fillDensity: 50 })));
      expect(p100).toBeLessThan(p50);
      // Full overlap: at max density the loop pitch collapses toward the pen
      // width. The pre-fix mapping floored at ~1mm (× the projection scale here
      // ≈ 0.9) → ~0.9mm, so a sub-0.6mm bar is RED before the density→pitch fix.
      expect(p100).toBeLessThan(0.6);
    });

    test('curved sphere: density 100 winds many more turns than density 50', () => {
      installStub();
      const t100 = totalWinding(fills(gen('spiral', [primObject('sphere')], { fillDensity: 100, spiralMode: 'surfaceHelix' })));
      const t50 = totalWinding(fills(gen('spiral', [primObject('sphere')], { fillDensity: 50, spiralMode: 'surfaceHelix' })));
      expect(t100).toBeGreaterThan(t50 * 1.4);
    });
  });
});
