const LR = require('../helpers/light-realism');

// A23 — the scene's Shading slider (p.tone.darkness, 0..100, default 50; tone model v2 only). It moves how DARK the v2 shading gets
// (the dark end and the mid-tones), not how many rulings Density draws. One shared remap (Regions.darknessK / darknessRel) feeds every
// v2 tone LUT. Contract:
//  1. the default (50, or the key absent) is byte-identical to the A22 output;
//  2. coverage at EVERY tone never decreases as the slider rises (ladder, crosshatch, Duty Cycle, End Shorten, mezzo, mark laws);
//  3. paper stays paper and the lightest tones barely move;
//  4. 0 is near the pre-A22 light look (drawn dark end ~0.35-0.43), 100 is darker than the default and never overlaps lines;
//  5. the slider is part of the bake key off the default (re-bake), and absent from a default key.
describe('Scene3D Shading slider (A23)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; }, 120000);
  afterAll(() => rt && rt.cleanup());
  const PEN = 0.3;
  const SLIDER = [0, 10, 25, 40, 50, 60, 75, 90, 100];
  const specOf = (o = {}) => ({
    objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
    scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'ladder',
    style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
    seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', ...o,
  });
  const TONE = { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } };
  const FAMILIES = {
    'ladder hatch': (s) => V.Scene3D.SurfaceLockLadder.toneLUT(s, TONE).lut,
    'ladder crosshatch': (s) => V.Scene3D.SurfaceLockLadder.toneLUT({ ...s, mapper: 'crosshatch' }, TONE).lut,
    'ladder stipple': (s) => V.Scene3D.SurfaceLockLadder.toneLUT({ ...s, mapper: 'stipple' }, TONE).lut,
    dutyConst: (s) => V.Scene3D.SurfaceLockLaws.toneLUT({ ...s, toneLaw: 'dutyConst' }, TONE).lut,
    endShorten: (s) => V.Scene3D.SurfaceLockLaws.toneLUT({ ...s, toneLaw: 'endShorten' }, TONE).lut,
    mkTick: (s) => V.Scene3D.SurfaceLockLaws.toneLUT({ ...s, toneLaw: 'mkTick' }, TONE).lut,
    mezzoRegion: (s) => V.Scene3D.SurfaceLockMezzo.toneLUT({ ...s, toneLaw: 'mezzoRegion' }, TONE).lut,
  };
  const lutAt = (fam, dk) => FAMILIES[fam](specOf(dk === undefined ? {} : { toneDarkness: dk }));

  describe('tone LUTs', () => {
    Object.keys(FAMILIES).forEach((fam) => {
      it(`${fam}: the default (absent or 50) is byte-identical`, () => {
        const a = Array.from(lutAt(fam));
        expect(Array.from(lutAt(fam, 50))).toEqual(a);
      });
      it(`${fam}: coverage at every tone never decreases as the slider rises; paper stays paper`, () => {
        const luts = SLIDER.map((dk) => lutAt(fam, dk));
        const n = luts[0].length;
        for (let j = 1; j < luts.length; j++) {
          for (let k = 0; k < n; k++) expect(luts[j][k], `${fam} slider ${SLIDER[j]} I=${k / (n - 1)}`).toBeGreaterThanOrEqual(luts[j - 1][k] * (1 - 1e-6));
        }
        const def = luts[SLIDER.indexOf(50)];
        luts.forEach((l, j) => { for (let k = 0; k < n; k++) if (def[k] === 0) expect(l[k], `paper at slider ${SLIDER[j]}`).toBe(0); });
      });
      it(`${fam}: the dark end rises below the default; the lightest inked tones move <= 10 %`, () => {
        const lo = lutAt(fam, 0); const def = lutAt(fam, 50); const n = def.length;
        // coverage: lines ~ 1 / pitch (the LUT), dots ~ area ~ LUT^2
        const cov = (v) => (fam === 'ladder stipple' ? v * v : v);
        expect(cov(lo[0])).toBeLessThan(cov(def[0]) * 0.7);
        // the lightest inked 8 % of the tone range (just past the paper band): the slider barely touches them
        let last = n - 1; while (last > 0 && def[last] === 0) last--;
        const from = Math.max(0, last - Math.round(0.08 * n));
        const hi = lutAt(fam, 100);
        for (let k = from; k <= last; k++) {
          expect(Math.abs(lo[k] - def[k]) / def[k], `${fam} I=${k / (n - 1)} at 0`).toBeLessThanOrEqual(0.1);
          expect(Math.abs(hi[k] - def[k]) / def[k], `${fam} I=${k / (n - 1)} at 100`).toBeLessThanOrEqual(0.1);
        }
      });
    });
    it('100 raises the nominal dark end where the geometry allows (ladder, crosshatch union), within the no-overlap limit', () => {
      const cov = (l) => l[0] * PEN;
      expect(cov(lutAt('ladder hatch', 100))).toBeGreaterThan(cov(lutAt('ladder hatch', 50)) + 0.03);
      // ladder: at most one ruling per guard pitch (1.3 pens -> 0.77)
      expect(cov(lutAt('ladder hatch', 100))).toBeLessThanOrEqual(1 / 1.3 + 1e-6);
      const two = cov(lutAt('ladder crosshatch', 100)); const one = cov(lutAt('ladder hatch', 100));
      expect(1 - (1 - two) * (1 - two)).toBeCloseTo(one, 2);
    });
    it('fixed-pitch laws (Duty Cycle, End Shorten), mezzo and the mark laws: past the default the dark end stays (the baked pitch is at the crowd guard / stop distance) and the mid-tones darken', () => {
      ['dutyConst', 'endShorten', 'mezzoRegion', 'mkTick'].forEach((fam) => {
        const def = lutAt(fam, 50); const hi = lutAt(fam, 100); const n = def.length; const mid = Math.round(0.5 * (n - 1));
        expect(hi[0], fam).toBeCloseTo(def[0], 6);
        expect(hi[mid], fam).toBeGreaterThan(def[mid] * 1.03);
      });
      // and the Duty Cycle ruling pitch does not change (no re-pitch under the 1.05-pen crowd guard)
      const Z = V.Scene3D.SurfaceLockLaws;
      const bakeOf = (dk) => Z.bake(specOf({ toneLaw: 'dutyConst', ...(dk === undefined ? {} : { toneDarkness: dk }) }));
      expect(bakeOf(100).meta.p0).toBe(bakeOf().meta.p0);
    });
    it('legacy specs ignore the slider (byte-identical LUT)', () => {
      const L = V.Scene3D.SurfaceLockLaws;
      const a = Array.from(L.toneLUT(specOf({ toneLaw: 'dutyConst', toneModel: undefined }), TONE).lut);
      const b = Array.from(L.toneLUT(specOf({ toneLaw: 'dutyConst', toneModel: undefined, toneDarkness: 100 }), TONE).lut);
      expect(b).toEqual(a);
    });
  });

  describe('bake', () => {
    it('the darkest baked ladder pitch shrinks past the default and stays at the default below it', () => {
      const L = V.Scene3D.SurfaceLockLadder;
      const pd = (dk) => L.v2.darkPitch(specOf(dk === undefined ? {} : { toneDarkness: dk }));
      expect(pd(0)).toBe(pd());
      expect(pd(100)).toBeLessThan(pd() * 0.9);
      expect(pd(100)).toBeGreaterThanOrEqual(1.3 * PEN - 1e-9);
    });
    it('the slider is in the bake key off the default and absent at the default', () => {
      const SL = V.Scene3D.SurfaceLock;
      const k0 = SL.bakeKey(specOf());
      expect(k0).not.toContain('dk');
      expect(SL.bakeKey(specOf({ toneDarkness: 80 }))).not.toBe(k0);
      expect(SL.toneDarknessOf({ tone: { model: 'v2' } })).toBeUndefined();
      expect(SL.toneDarknessOf({ tone: { model: 'v2', darkness: 50 } })).toBeUndefined();
      expect(SL.toneDarknessOf({ tone: { model: 'v2', darkness: 80 } })).toBe(80);
      expect(SL.toneDarknessOf({ tone: { model: 'legacy', darkness: 80 } })).toBeUndefined();
    });
  });

  describe('drawn in the shadow of the owner sphere (surface, back light)', () => {
    const darkEnd = (c, dk) => {
      const s = LR.buildCase(V, { ...c, markSpace: 'surface', density: 50, angle: 45, tone: dk === undefined ? {} : { darkness: dk } });
      LR.setLightCam(s, LR.LIGHTS.back);
      const prof = LR.measure(s, { model: 'v2' });
      return LR.covAt(prof, 'L', 0, 0.2, (i) => prof.cells.rad[i] < 0.5);
    };
    [['ladder', { law: 'ladder', mapper: 'hatch' }, 0.02], ['dutyConst', { law: 'dutyConst', mapper: 'hatch' }, -0.02]].forEach(([name, c, rise]) => {
      it(`${name}: slider 0 < default <= 100; 0 reads near the old light look`, () => {
        const lo = darkEnd(c, 0); const def = darkEnd(c); const hi = darkEnd(c, 100);
        expect(lo, `${name} @0`).toBeGreaterThanOrEqual(0.3);
        expect(lo, `${name} @0`).toBeLessThanOrEqual(0.45);
        expect(def, `${name} default`).toBeGreaterThan(lo + 0.15);
        // ladder: the dark end rises past the default; Duty Cycle keeps it (capped at the crowd guard), within measuring noise
        expect(hi, `${name} @100`).toBeGreaterThan(def + rise);
      }, 180000);
    });
  });

  describe('no overlapping lines at slider 100', () => {
    it('the closest pair of kept hatch pieces is at least one pen apart (ladder, Density 50 and 200)', () => {
      const SL = V.Scene3D.SurfaceLock; const L = V.Scene3D.SurfaceLockLadder;
      const BOUNDS = { width: 320, height: 220, penWidth: 0 };
      const pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
      [50, 200].forEach((den) => {
        const spec = specOf({ scaleRef: pose.cam.scale, toneDarkness: 100, style: { fillAngle: 45, fillDensity: den, densityScale: 1 } });
        const ms = L.bake(spec); const tone = L.toneLUT(spec, TONE);
        const lines = SL.frame([ms], pose, { toneFn: () => 0, tone, penWidth: PEN, objectId: 'o1', toneModel: 'v2' });
        let worst = Infinity; const segs = [];
        lines.forEach((ln, li) => { for (let i = 1; i < ln.length; i += 2) segs.push([ln[i].x, ln[i].y, li]); });
        const R = 14 * pose.cam.scale;
        const near = segs.filter((q) => Math.hypot(q[0] - pose.cam.cx, q[1] - pose.cam.cy) < 0.5 * R);
        near.forEach((a) => {
          let best = Infinity;
          lines.forEach((ln, li) => {
            if (li === a[2]) return;
            for (let i = 1; i < ln.length; i++) {
              const ax = ln[i - 1].x; const ay = ln[i - 1].y; const dx = ln[i].x - ax; const dy = ln[i].y - ay; const l2 = dx * dx + dy * dy;
              const t = l2 > 0 ? Math.max(0, Math.min(1, ((a[0] - ax) * dx + (a[1] - ay) * dy) / l2)) : 0;
              const d = Math.hypot(a[0] - ax - t * dx, a[1] - ay - t * dy); if (d < best) best = d;
            }
          });
          if (best < worst) worst = best;
        });
        expect(near.length, `Density ${den}`).toBeGreaterThan(20);
        expect(worst, `Density ${den}`).toBeGreaterThanOrEqual(1.0 * PEN);
      });
    }, 120000);
  });
});
