const { useFillFixture } = require('../helpers/scene3d-fill-fixture');

/*
 * Scene3D fill — monoline laws (one mark field per object, no hatch direction of
 * their own unless they read the Angle). Guards the defect classes found in the
 * fill-style review: Crosshatch redrawing identical lines (2x ink), Density and
 * Angle dead on a mono law, Contour silently drawing Hatch, the Field metric
 * dropping its sigmoid curve, and the Perceptual ramp placing rungs discretely
 * (irregular gaps). Output drift is guarded by scene3d-fill-style-drift.
 */

describe('Scene3D fill — monoline laws', () => {
  const h = useFillFixture();
  const gen = (mapper, law, extra = {}) => h.gen('sphere', mapper, law, extra);

  describe('Crosshatch never redraws identical lines', () => {
    it('a direction-free law (etfKang) draws Crosshatch as Hatch, with no duplicate path', () => {
      const x = gen('crosshatch', 'etfKang');
      expect(x.dup).toBe(0);
      expect(x.hash).toBe(gen('hatch', 'etfKang').hash);
    });

    it('originSpiral (its retrace passes are by design) matches its Hatch output', () => {
      expect(gen('crosshatch', 'originSpiral').hash).toBe(gen('hatch', 'originSpiral').hash);
    });

    it('a directional law (mezzoRegion) keeps a real crossing pass, without duplicates', () => {
      const x = gen('crosshatch', 'mezzoRegion');
      const hatch = gen('hatch', 'mezzoRegion');
      expect(x.dup).toBe(0);
      expect(x.n).toBeGreaterThan(hatch.n);
      expect(x.ink).toBeGreaterThan(hatch.ink);
    });

    it('the Cross angle slider moves the crossing pass of a directional law', () => {
      const a = gen('crosshatch', 'dutyConst');
      const b = gen('crosshatch', 'dutyConst', { crossAngleDelta: 60 });
      expect(b.hash).not.toBe(a.hash);
      expect(b.dup).toBe(0);
    });
  });

  describe('Density and Angle on a mono law', () => {
    it('Density is live: a lower Density lays less ink', () => {
      ['dutyConst', 'etfKang'].forEach((law) => {
        const lo = gen('hatch', law, { fillDensity: 20 });
        const mid = gen('hatch', law, { fillDensity: 50 });
        expect(lo.hash, law).not.toBe(mid.hash);
        expect(lo.ink, law).toBeLessThan(mid.ink);
      });
    });

    it('Angle turns a law that has a direction, and a direction-free law really ignores it', () => {
      expect(gen('hatch', 'dutyConst', { fillAngle: 100 }).hash).not.toBe(gen('hatch', 'dutyConst', { fillAngle: 45 }).hash);
      expect(gen('hatch', 'etfKang', { fillAngle: 100 }).hash).toBe(gen('hatch', 'etfKang', { fillAngle: 45 }).hash);
    });
  });

  it('Contour on a mono law draws exactly what Hatch draws (the evidence for the Type gate)', () => {
    expect(gen('contour', 'dutyConst').hash).toBe(gen('hatch', 'dutyConst').hash);
  });

  describe('Field metric keeps the sigmoid curve', () => {
    it('survivor + Field metric rides the sigmoid; pinned to L*-linear it is the legacy id', () => {
      const legacy = gen('hatch', 'contFieldFore');
      const survivor = gen('hatch', 'contFieldSigmoid', { fieldMetric: 'foreshortened' });
      const pinned = gen('hatch', 'contFieldSigmoid', { fieldMetric: 'foreshortened', fieldCurve: 'lstar' });
      expect(survivor.hash).not.toBe(legacy.hash);
      expect(pinned.hash).toBe(legacy.hash);
    });
  });

  it('Perceptual ramp is placed continuously: the same path count as Ladder', () => {
    expect(gen('hatch', 'perceptualRamp').n).toBe(gen('hatch', 'ladder').n);
  });
});
