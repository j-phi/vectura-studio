const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * T2-2 (W-05b/W-06b plan U2, iteration 2) — mkTick variable-length ticks
 * (R1: "ticks must have VARIABLE LENGTH, tick length carries tone",
 * `docs/3d-audit/fill-audit/user-reports/8.png`).
 *
 * T2's FIRST attempt (a different lane, `dbad2d88`, REJECTED — see
 * `docs/3d-audit/lane-reports/T2-review.md`) eased mkTick's length response
 * with a bare cubic smoothstep on radiance. That curve has zero derivative
 * at BOTH ends, which produced hard-edged, flat-topped ink PLATEAUS with
 * enlarged bare wedges — legible on the picture and measurable as a coverage
 * collapse at d=220 the original unit never tested (0.925-0.999 -> 0.670-
 * 0.814 on all six primitive x mapper cells). This unit ships a DIFFERENT
 * length-response curve (see `surface-fill.js`'s `MK_TICK_EASE_BLEND`
 * comment) and gates ALL SIX primitive x mapper combinations, not just the
 * two the rejected unit asserted.
 *
 * Same real param defaults as `scene3d-mark-laws-draw.test.js` (the audit's
 * own capture-script defaults), so results are directly comparable to that
 * file's own O1-O4 oracles and to T2-review.md's own numbers.
 */

describe('Scene3D.SurfaceFill — T2-2: mkTick variable-length ticks, six-cell acceptance table', () => {
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

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
  }, 60000);
  afterAll(() => runtime.cleanup());

  // O5 — mean drawn tick length, dark third / light third, all six
  // primitive x mapper combinations at d=50 (the plan's own scope; T2's
  // rejected unit asserted only two of these six).
  describe.each([
    ['sphere', 'hatch'],
    ['sphere', 'contour'],
    ['torus', 'hatch'],
    ['torus', 'contour'],
    ['cone', 'hatch'],
    ['cone', 'contour'],
  ])('%s/%s d=50', (primitive, mapper) => {
    let stat;
    beforeAll(() => {
      algo.generate(buildSceneParams('mkTick', mapper, 50, primitive), null, null, BOUNDS);
      stat = SF.lastMarkStats;
    });

    test('O5 — mean drawn tick length is monotone dark >= mid >= light, and dark/light >= 3.0x', () => {
      expect(stat).toBeTruthy();
      const [darkCnt, midCnt, lightCnt] = stat.cntByThird;
      const [darkLen, midLen, lightLen] = stat.lenByThird;
      expect(darkCnt).toBeGreaterThan(5);
      expect(lightCnt).toBeGreaterThan(5);
      const meanDark = darkLen / darkCnt;
      const meanMid = midLen / Math.max(1, midCnt);
      const meanLight = lightLen / lightCnt;
      expect(meanDark).toBeGreaterThanOrEqual(meanMid);
      expect(meanMid).toBeGreaterThanOrEqual(meanLight);
      expect(meanDark / meanLight).toBeGreaterThanOrEqual(3.0);
    });

    test('the field stays complete: wholesale refusal stays low (R2, re-checking O3 is not reopened)', () => {
      expect(stat).toBeTruthy();
      const refuseFrac = stat.offSurface / Math.max(1, stat.offSurface + stat.marks);
      expect(refuseFrac).toBeLessThanOrEqual(0.05);
    });
  });

});
