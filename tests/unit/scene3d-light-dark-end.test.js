const LR = require('../helpers/light-realism');

// Light realism "go darker" (owner decision): the v2 tone model's shared dark end (full-shadow coverage at Density 50) is about
// 0.65-0.70, no longer 0.43 (legacy ~0.8). Highlights stay paper and the gradation stays monotone.
//  1. The nominal dark end of every v2 tone LUT (what the family is ASKED to draw at I = 0, Density 50).
//  2. The coverage actually drawn in the shadow of the owner's sphere (back light: the whole disc is in shadow), measured from
//     screen position per family; the chart carries a few percent of unevenness, so the gate is a tolerance below the nominal.
//  3. The darker look never overlaps lines: the closest pair of kept fill pieces stays >= 1 pen apart (ink width).
describe('light realism dark end (v2)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; }, 120000);
  afterAll(() => rt && rt.cleanup());
  const PEN = 0.3;
  const specOf = (o = {}) => ({
    objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
    scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'ladder',
    style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
    seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', ...o,
  });
  const TONE = { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } };

  describe('nominal dark end of the v2 tone LUTs (Density 50)', () => {
    it('ladder hatch / contour / spiral: coverage pen / pitch at I = 0 is >= 0.65', () => {
      const L = V.Scene3D.SurfaceLockLadder;
      ['hatch', 'contour', 'spiral'].forEach((mapper) => {
        const lut = L.toneLUT(specOf({ mapper }), TONE).lut;
        const cov = lut[0] * PEN; // lines: coverage = pen x (rulings per mm)
        expect(cov, mapper).toBeGreaterThanOrEqual(0.65);
        expect(cov, mapper).toBeLessThanOrEqual(0.8);
      });
    });
    it('dutyConst / endShorten: coverage at I = 0 is >= 0.65 (legacy: 0.43)', () => {
      const Z = V.Scene3D.SurfaceLockLaws;
      ['dutyConst', 'endShorten'].forEach((law) => {
        const lut = Z.toneLUT(specOf({ toneLaw: law }), TONE).lut;
        // the law's LUT is a gate threshold per pitch: theta / pitch; theta(0) = 1 (full duty / no retraction)
        expect(lut[0] * PEN, law).toBeGreaterThanOrEqual(0.65);
      });
    });
    it('mezzo: coverage at I = 0 is >= 0.65', () => {
      const M = V.Scene3D.SurfaceLockMezzo;
      const lut = M.toneLUT(specOf({ toneLaw: 'mezzoRegion' }), TONE).lut;
      expect(lut[0] * PEN).toBeGreaterThanOrEqual(0.65);
    });
    it('legacy tone LUTs are unchanged (no toneModel): dutyConst 0.43, ladder 0.13 in this ctx', () => {
      const Z = V.Scene3D.SurfaceLockLaws;
      const lut = Z.toneLUT(specOf({ toneLaw: 'dutyConst', toneModel: undefined }), TONE).lut;
      expect(lut[0] * PEN).toBeGreaterThan(0.42);
      expect(lut[0] * PEN).toBeLessThan(0.44);
    });
  });

  describe('drawn in the shadow of the owner sphere (surface, back light)', () => {
    const FAM = [
      ['ladder hatch', { law: 'ladder', mapper: 'hatch' }],
      ['dutyConst', { law: 'dutyConst', mapper: 'hatch' }],
      ['mezzoRegion', { law: 'mezzoRegion', mapper: 'hatch' }],
      ['endShorten', { law: 'endShorten', mapper: 'hatch' }],
    ];
    const darkEnd = (c, markSpace) => {
      const s = LR.buildCase(V, { ...c, markSpace, density: 50, angle: 45 });
      LR.setLightCam(s, LR.LIGHTS.back);
      const prof = LR.measure(s, { model: 'v2' });
      return LR.covAt(prof, 'L', 0, 0.2, (i) => prof.cells.rad[i] < 0.5); // the shadowed centre of the disc
    };
    FAM.forEach(([name, c]) => {
      it(`${name}: shadow coverage >= 0.5 (legacy v2 drew 0.2-0.4)`, () => {
        expect(darkEnd(c, 'surface'), name).toBeGreaterThanOrEqual(0.5);
      }, 120000);
    });
    it('dutyConst (the owner config): shadow coverage reaches the shared 0.65 within tolerance (>= 0.58)', () => {
      expect(darkEnd({ law: 'dutyConst', mapper: 'hatch' }, 'surface')).toBeGreaterThanOrEqual(0.58);
    }, 120000);
    it('crosshatch: each family carries a share so the pair reaches the same dark end, not twice it', () => {
      const L = V.Scene3D.SurfaceLockLadder;
      const one = L.toneLUT(specOf({ mapper: 'hatch' }), TONE).lut[0] * PEN;
      const two = L.toneLUT(specOf({ mapper: 'crosshatch' }), TONE).lut[0] * PEN;
      expect(1 - (1 - two) * (1 - two)).toBeCloseTo(one, 2); // union of two families = one family's dark end
    });
  });

  describe('highlights stay paper and the gradation stays graded', () => {
    it('owner config: the glint is paper and M1 holds (side light)', () => {
      const s = LR.buildCase(V, { law: 'dutyConst', mapper: 'hatch', markSpace: 'surface', density: 50, angle: 45 });
      const prof = LR.measure(s, { model: 'v2' });
      expect(LR.topFractionCoverage(prof, 'S', 0.01)).toBeLessThanOrEqual(0.01);
      LR.setLightCam(s, LR.LIGHTS.side);
      const p2 = LR.measure(s, { model: 'v2' });
      expect(LR.m1Monotone(p2, {}).rho).toBeLessThanOrEqual(-0.85);
    }, 120000);
  });

  describe('no overlapping lines at the darker end', () => {
    it('the closest pair of kept hatch pieces is at least one pen apart (ladder, Density 50 and 200)', () => {
      const SL = V.Scene3D.SurfaceLock; const L = V.Scene3D.SurfaceLockLadder;
      const BOUNDS = { width: 320, height: 220, penWidth: 0 };
      const pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
      [50, 200].forEach((den) => {
        const spec = specOf({ scaleRef: pose.cam.scale, style: { fillAngle: 45, fillDensity: den, densityScale: 1 } });
        const ms = L.bake(spec); const tone = L.toneLUT(spec, TONE);
        const lines = SL.frame([ms], pose, { toneFn: () => 0, tone, penWidth: PEN, objectId: 'o1', toneModel: 'v2' });
        // nearest distance from each polyline's mid vertex to every OTHER polyline (brute force on a thinned sample)
        let worst = Infinity; const segs = [];
        lines.forEach((ln, li) => { for (let i = 1; i < ln.length; i += 2) segs.push([ln[i].x, ln[i].y, li]); });
        const R = 14 * pose.cam.scale;
        const near = segs.filter((q) => Math.hypot(q[0] - pose.cam.cx, q[1] - pose.cam.cy) < 0.5 * R);
        near.forEach((a) => {
          let best = Infinity;
          lines.forEach((ln, li) => {
            if (li === a[2]) return;
            for (let i = 1; i < ln.length; i++) {
              const ax = ln[i - 1].x; const ay = ln[i - 1].y; const bx = ln[i].x; const by = ln[i].y; const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
              const t = l2 > 0 ? Math.max(0, Math.min(1, ((a[0] - ax) * dx + (a[1] - ay) * dy) / l2)) : 0;
              const d = Math.hypot(a[0] - ax - t * dx, a[1] - ay - t * dy); if (d < best) best = d;
            }
          });
          if (best < worst) worst = best;
        });
        expect(worst, `Density ${den}`).toBeGreaterThanOrEqual(1.0 * PEN);
      });
    }, 120000);
  });
});
