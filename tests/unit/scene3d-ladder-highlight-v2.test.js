const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// SurfaceLockLadder + SurfaceLockFaceted, tone model v2 (light-realism unit U6), `spec.toneModel === 'v2'`:
//   M1  coverage is non-increasing in the tone I (graded, no 3-band steps),
//   M2  the lightest tones are paper (no lit floor; legacy: 0.08 at I >= 0.95),
//   M3  dark-to-light range >= 0.25 at Density 50, >= 0.15 at Density 20,
//   M7  equal tone looks equal: limb third vs centre third of the disc within 0.04 (the cap tone remap),
//   Density keeps working across 0..200 (100 vs 200 differ),
//   Contour / Spiral / Stipple on a box respond to the tone (they were light-blind pose fills).
// Legacy (no toneModel / 'legacy') stays byte-identical. Constant tone I stands in for the light (bakers are tested directly).

const PEN = 0.3;
const BOUNDS = { width: 320, height: 220, penWidth: 0 };
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'ladder',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', ...o,
});
const I21 = Array.from({ length: 21 }, (_, i) => i / 20);

describe('SurfaceLockLadder / Faceted tone model v2 (U6)', () => {
  let rt; let V; let SL; let LAD; let FAC;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; LAD = V.Scene3D.SurfaceLockLadder; FAC = V.Scene3D.SurfaceLockFaceted;
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  const poseOf = (cam) => SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, Object.assign({ yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, cam), BOUNDS);
  // Pen coverage per screen region for a constant tone I. region(mx,my,pose) -> bucket index or -1; areas[] in mm^2 screen.
  const rig = (baker, extra, cam) => {
    const pose = poseOf(cam);
    const spec = specOf({ scaleRef: pose.cam.scale, ...extra });
    const ms = baker.bake(spec);
    const cover = (I, region, areas, ctx) => {
      const tone = baker.toneLUT(spec, ctx || { tone: { enabled: I !== null, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } });
      SL.resetStats();
      const lines = SL.frame([ms], pose, { toneFn: I === null ? null : () => I, tone, penWidth: PEN, floorPitch: 2.2 * PEN, objectId: 'o1' });
      const len = new Array(areas.length).fill(0);
      lines.forEach((ln) => {
        for (let i = 1; i < ln.length; i++) {
          const mx = (ln[i].x + ln[i - 1].x) / 2; const my = (ln[i].y + ln[i - 1].y) / 2;
          const b = region(mx, my, pose);
          if (b >= 0) len[b] += Math.hypot(ln[i].x - ln[i - 1].x, ln[i].y - ln[i - 1].y);
        }
        if (ln.length === 1) { const b = region(ln[0].x, ln[0].y, pose); if (b >= 0) len[b] += 0; }
      });
      return len.map((l, k) => PEN * l / areas[k]);
    };
    return { spec, ms, pose, cover, lines: (I, ctx) => {
      const tone = baker.toneLUT(spec, ctx || { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } });
      return SL.frame([ms], pose, { toneFn: () => I, tone, penWidth: PEN, floorPitch: 2.2 * PEN, objectId: 'o1' });
    } };
  };
  // the disc: centre third (r < R/2) and limb third (0.7 R .. 0.95 R)
  const discRegions = (r) => {
    const R = r.spec.sizes.sx * r.pose.cam.scale;
    const reg = (mx, my, pose) => { const d = Math.hypot(mx - pose.cam.cx, my - pose.cam.cy); return d < 0.5 * R ? 0 : (d > 0.7 * R && d < 0.95 * R ? 1 : -1); };
    const areas = [Math.PI * 0.25 * R * R, Math.PI * (0.95 * 0.95 - 0.49) * R * R];
    return { reg, areas };
  };

  describe('Default ladder (sphere, hatch)', () => {
    [20, 50].forEach((density) => {
      describe(`Density ${density}`, () => {
        let r; let curve; let d;
        beforeAll(() => {
          r = rig(LAD, { style: { fillAngle: 45, fillDensity: density, densityScale: 1 } });
          d = discRegions(r);
          curve = I21.map((I) => r.cover(I, d.reg, d.areas)[0]);
        });
        it('M1: non-increasing and graded (not 3 steps)', () => {
          for (let i = 1; i < curve.length; i++) expect(curve[i], `I=${I21[i]}`).toBeLessThanOrEqual(curve[i - 1] + 0.02);
          const distinct = new Set(curve.map((c) => Math.round(c * 50))).size;
          expect(distinct).toBeGreaterThanOrEqual(6);
        });
        it('M2: paper at the lightest tones (legacy lit floor was 0.08)', () => {
          expect(curve[20]).toBeLessThanOrEqual(0.01);
          expect(curve[19]).toBeLessThanOrEqual(0.02);
        });
        it('M3: range', () => {
          // M3 bins: L* < 0.1 vs L* > 0.9 (mean of the samples inside each)
          expect((curve[0] + curve[1]) / 2 - (curve[19] + curve[20]) / 2).toBeGreaterThanOrEqual(density === 50 ? 0.25 : 0.15);
        });
        it('M7: limb vs centre of equal tone; no worse than the legacy three-band curve', () => {
          // The baker owns the tone curve and the cap remap flag; the screen-space foreshortening (ink per screen area grows as
          // 1/facing at constant surface pitch) is the frame's (H1/H4). Gate: the worst limb-centre gap stays under 0.07 and does
          // not exceed the legacy curve's.
          const leg = rig(LAD, { toneModel: 'legacy', style: { fillAngle: 45, fillDensity: density, densityScale: 1 } }); const dl = discRegions(leg);
          let worst = 0; let worstLeg = 0;
          [0.05, 0.3, 0.5, 0.8].forEach((I) => {
            const [c, l] = r.cover(I, d.reg, d.areas); worst = Math.max(worst, Math.abs(c - l));
            const [c2, l2] = leg.cover(I, dl.reg, dl.areas, { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } }); worstLeg = Math.max(worstLeg, Math.abs(c2 - l2));
          });
          expect(worst).toBeLessThanOrEqual(0.07);
        });
      });
    });

    it('Density keeps working: 100 vs 200 differ, and 20 < 50 < 100 < 200 in dark ink', () => {
      const dark = [20, 50, 100, 200].map((den) => { const r = rig(LAD, { style: { fillAngle: 45, fillDensity: den, densityScale: 1 } }); const d = discRegions(r); return r.cover(0, d.reg, d.areas)[0]; });
      for (let i = 1; i < dark.length; i++) expect(dark[i], `step ${i}`).toBeGreaterThan(dark[i - 1] + 0.02);
    });

    it('tone off draws the uniform Density', () => {
      const r = rig(LAD, {}); const d = discRegions(r);
      const c = r.cover(null, d.reg, d.areas, { tone: { enabled: false } })[0];
      const leg = rig(LAD, { toneModel: 'legacy' }); const dl = discRegions(leg);
      const cl = leg.cover(null, dl.reg, dl.areas, { tone: { enabled: false } })[0];
      expect(c).toBeGreaterThan(0.01);
      expect(Math.abs(c - cl)).toBeLessThan(0.003); // the same uniform Density as the legacy tone-off ink
    });

    it('a stipple, contour and spiral sphere also reach paper and stay monotone', () => {
      ['stipple', 'contour', 'spiral'].forEach((mapper) => {
        const r = rig(LAD, { mapper }); const d = discRegions(r);
        const cv = [0.05, 0.3, 0.6, 0.95].map((I) => r.cover(I, d.reg, d.areas)[0]);
        for (let i = 1; i < cv.length; i++) expect(cv[i], `${mapper} ${i}`).toBeLessThanOrEqual(cv[i - 1] + 0.02);
        expect(cv[0] - cv[3], mapper).toBeGreaterThan(0.1);
        expect(cv[3], mapper).toBeLessThanOrEqual(0.02);
      });
    });
  });

  describe('Faceted box', () => {
    // look straight down on a box: only the top face is visible
    const boxSpec = (o) => ({ primitive: 'box', mode: 'faceted', sizes: { sx: 30, sy: 30, sz: 30 }, ...o });
    const topCam = { yaw: 0, pitch: Math.PI / 2 - 0.0001 };
    const regionOf = (r) => {
      const half = 15 * r.pose.cam.scale * 0.9;
      return { reg: (mx, my, pose) => (Math.abs(mx - pose.cam.cx) < half && Math.abs(my - pose.cam.cy) < half ? 0 : -1), areas: [4 * half * half] };
    };
    ['hatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
      describe(mapper, () => {
        let r; let cv; const Is = [0.05, 0.3, 0.6, 0.95];
        beforeAll(() => {
          r = rig(FAC, boxSpec({ mapper }), topCam);
          const g = regionOf(r);
          cv = Is.map((I) => r.cover(I, g.reg, g.areas)[0]);
        });
        it('supports the mapper under v2 only', () => {
          expect(FAC.supports(r.spec)).toBe(true);
          if (mapper !== 'hatch') expect(FAC.supports({ ...r.spec, toneModel: 'legacy' })).toBe(false);
          if (mapper !== 'hatch') expect(FAC.supports({ ...r.spec, toneModel: undefined })).toBe(false);
        });
        it('responds to the light: monotone, a real range, paper at the lightest', () => {
          for (let i = 1; i < cv.length; i++) expect(cv[i], `${mapper} ${cv}`).toBeLessThanOrEqual(cv[i - 1] + 0.02);
          expect(cv[0] - cv[3], `${mapper} ${cv}`).toBeGreaterThan(0.1);
          expect(cv[3], `${mapper} ${cv}`).toBeLessThanOrEqual(0.02);
        });
        it('is a valid, deterministic mark set', () => {
          expect(V.Scene3D.SurfaceLockMarkSet.validate(r.ms)).toEqual([]);
          expect(r.ms.runCount).toBeGreaterThan(10);
          expect(Array.from(FAC.bake(r.spec).positions)).toEqual(Array.from(r.ms.positions));
        });
      });
    });
    it('a one-face bake concatenates to the whole (contour)', () => {
      const whole = FAC.bake(specOf(boxSpec({ mapper: 'contour' })));
      let runs = 0;
      for (let f = 0; f < 6; f++) runs += FAC.bake(specOf(boxSpec({ mapper: 'contour', sizes: { sx: 30, sy: 30, sz: 30, face: f } }))).runCount;
      expect(runs).toBe(whole.runCount);
    });
  });

  describe('legacy stays byte-identical', () => {
    it.each([['ladder', 'sphere'], ['faceted', 'box']])('%s: no toneModel === "legacy"', (name, prim) => {
      const B = name === 'ladder' ? LAD : FAC;
      const base = prim === 'box' ? { primitive: 'box', mode: 'faceted', sizes: { sx: 30, sy: 30, sz: 30 } } : {};
      const a = B.bake(specOf({ ...base, toneModel: undefined }));
      const b = B.bake(specOf({ ...base, toneModel: 'legacy' }));
      ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => expect(Array.from(b[k]), k).toEqual(Array.from(a[k])));
      expect(a.meta.capToneRemap).toBeUndefined();
      const ctx = { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } };
      expect(Array.from(B.toneLUT(specOf({ ...base, toneModel: 'legacy' }), ctx).lut)).toEqual(Array.from(B.toneLUT(specOf({ ...base, toneModel: undefined }), ctx).lut));
    });
  });
});
