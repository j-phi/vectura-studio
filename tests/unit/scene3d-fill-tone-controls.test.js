const { lenOf, useFillFixture } = require('../helpers/scene3d-fill-fixture');

/*
 * Scene3D fill — tone-shaping controls: tone gamma / contrast, depth fade,
 * tone tiers and tone bands to real pens, and that the control defaults are the
 * engine's own fallbacks. Each test states a behavior a user sees; none pins a
 * historical hash (output drift is guarded by scene3d-fill-style-drift).
 */

describe('Scene3D fill — tone-shaping controls', () => {
  const h = useFillFixture();
  const gen = (...a) => h.gen(...a);

  it('every control default written explicitly draws the same as the key left out', () => {
    const CT = h.V.SCENE_FILL_CONTROLS.CONTROLS;
    const explicit = {
      toneGamma: CT.toneGamma.default, toneContrast: CT.toneContrast.default,
      depthFade: false, waveLength: CT.waveLength.default, waveCrest: 'auto',
      nibAngleDeg: CT.nibAngleDeg.default, nibContrast: CT.nibContrast.default,
      taperLength: CT.taperLength.default, taperTipWidth: CT.taperTipWidth.default,
      taperSoftness: CT.taperSoftness.default, patternMaturity: CT.patternMaturity.default,
      stripeScale: CT.stripeScale.default, chainMarks: false, tierPens: null, toneBands: 0,
    };
    [
      ['sphere', 'hatch', 'ladder'], ['sphere', 'hatch', 'taperedEnds'], ['sphere', 'hatch', 'nibAngle'],
      ['sphere', 'hatch', 'ampSpacing'], ['sphere', 'hatch', 'trochoidLoop'], ['sphere', 'hatch', 'turingStripe'],
      ['box', 'hatch', 'ladder'], ['box', 'crosshatch', 'ladder'],
    ].forEach(([prim, mapper, law]) => {
      expect(gen(prim, mapper, law, explicit).hash, `${prim}/${mapper}/${law}`).toBe(gen(prim, mapper, law).hash);
    });
  });

  it('a default drawing is unchanged after gamma, wave and tone-band renders (no state leak)', () => {
    const before = gen('sphere', 'hatch', 'ampSpacing');
    gen('sphere', 'hatch', 'ampSpacing', { toneGamma: 1.8 });
    expect(JSON.stringify(gen('sphere', 'hatch', 'ampSpacing').out)).toBe(JSON.stringify(before.out));
    gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4, waveCrest: 'walk' });
    expect(JSON.stringify(gen('sphere', 'hatch', 'ampSpacing').out)).toBe(JSON.stringify(before.out));
    const ladder = gen('sphere', 'hatch', 'ladder');
    gen('sphere', 'hatch', 'ladder', { toneBands: 3, tierPens: ['pen-a', 'pen-b', 'pen-c'] });
    expect(JSON.stringify(gen('sphere', 'hatch', 'ladder').out)).toBe(JSON.stringify(ladder.out));
  });

  describe('tone gamma and contrast', () => {
    it('the curve keeps both ends fixed and is monotone; the identity shape is no shape', () => {
      const R = h.V.Scene3D.Regions;
      [[2, 0], [0.5, 0], [1, 0.8], [1, -0.8], [1.6, 0.5]].forEach(([g, c]) => {
        expect(R.toneCurve(0, g, c)).toBeCloseTo(0, 9);
        expect(R.toneCurve(1, g, c)).toBeCloseTo(1, 9);
        let prev = -1;
        for (let i = 0; i <= 20; i += 1) {
          const y = R.toneCurve(i / 20, g, c);
          expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
          prev = y;
        }
      });
      expect(R.toneCurve(0.5, 2, 0)).toBeCloseTo(0.25, 9);
      expect(R.toneShapeOf({}, null)).toBeNull();
      expect(R.toneShapeOf({ toneGamma: 1, toneContrast: 0, depthFade: false }, null)).toBeNull();
    });

    it('gamma > 1 lays more ink, gamma < 1 less, on a hatch', () => {
      const d = gen('sphere', 'hatch', 'ladder');
      const dark = gen('sphere', 'hatch', 'ladder', { toneGamma: 1.8 });
      const light = gen('sphere', 'hatch', 'ladder', { toneGamma: 0.55 });
      expect(dark.ink).toBeGreaterThan(d.ink);
      expect(light.ink).toBeLessThan(d.ink);
    });

    it('contrast changes the drawing both ways', () => {
      const d = gen('sphere', 'hatch', 'fineLadder');
      expect(gen('sphere', 'hatch', 'fineLadder', { toneContrast: 1 }).hash).not.toBe(d.hash);
      expect(gen('sphere', 'hatch', 'fineLadder', { toneContrast: -1 }).hash).not.toBe(d.hash);
    });

    it('reaches curved and faceted fills; a faceted Ladder (no tone ramp) is the one no-op route', () => {
      const unchanged = [];
      [['sphere', 'hatch', 'ladder'], ['box', 'hatch', 'turingStripe'], ['box', 'hatch', 'ladder']].forEach(([prim, mapper, law]) => {
        const base = gen(prim, mapper, law).hash;
        if (gen(prim, mapper, law, { toneGamma: 2.2, toneContrast: 0.8 }).hash === base) unchanged.push(`${prim}/${mapper}/${law}`);
      });
      expect(unchanged).toEqual(['box/hatch/ladder']);
    });

    it('is per object: an object style with its own gamma changes only that object', () => {
      const p = (extra) => gen('sphere', 'hatch', 'ladder', {}, {
        second: true,
        mut: (pp) => { pp.styleTable.byObject.o1 = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50, toneLaw: 'ladder', ...extra } }; },
      });
      const inkBy = (r) => {
        const t = { o1: 0, o2: 0 };
        r.out.forEach((pth, i) => {
          const id = pth.meta && pth.meta.sceneTarget && pth.meta.sceneTarget.objectId;
          if (id in t) t[id] += lenOf(r.paths[i]);
        });
        return t;
      };
      const a = inkBy(p({}));
      const b = inkBy(p({ toneGamma: 1.8 }));
      expect(b.o1).toBeGreaterThan(a.o1);
      expect(b.o2).toBeCloseTo(a.o2, 6);
    });
  });

  describe('depth fade', () => {
    const byObj = (r) => {
      const t = { o1: 0, o2: 0 };
      r.out.forEach((pth, i) => {
        const id = pth.meta && pth.meta.sceneTarget && pth.meta.sceneTarget.objectId;
        if (id in t) t[id] += lenOf(r.paths[i]);
      });
      return t;
    };

    it('on lightens the far object more than the near one; strength 0 is the identity', () => {
      const off = gen('sphere', 'hatch', 'ladder', {}, { second: true });
      const on = gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 0.9 }, { second: true });
      expect(on.ink).toBeLessThan(off.ink);
      // o2 sits 140 mm behind o1.
      const a = byObj(off); const b = byObj(on);
      expect(a.o1).toBeGreaterThan(0);
      expect(a.o2).toBeGreaterThan(0);
      expect(b.o2 / a.o2).toBeLessThan(b.o1 / a.o1);
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 0 }, { second: true }).hash).toBe(off.hash);
    });

    it('strength, start and full-fade distance each change the drawing', () => {
      const base = gen('sphere', 'hatch', 'ladder', { depthFade: true }, { second: true });
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 1 }, { second: true }).hash).not.toBe(base.hash);
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeNear: 0.5 }, { second: true }).hash).not.toBe(base.hash);
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeFar: 0.5 }, { second: true }).hash).not.toBe(base.hash);
    });

    it('still reaches a faceted Ladder', () => {
      const off = gen('box', 'hatch', 'ladder', {}, { second: true });
      const on = gen('box', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 1 }, { second: true });
      expect(on.hash).not.toBe(off.hash);
    });
  });

  describe('tone tiers to real pens (three-pen laws)', () => {
    it('off: no path names a pen. On: tier k draws with pen k, same geometry', () => {
      const d = gen('sphere', 'hatch', 'penInterleave');
      expect(d.pens).toEqual(['']);
      const on = gen('sphere', 'hatch', 'penInterleave', { tierPens: ['pen-a', 'pen-b', 'pen-c'] });
      expect(on.pens.filter(Boolean)).toEqual(['pen-a', 'pen-b', 'pen-c']);
      on.out.forEach((pth) => {
        expect(pth.meta.penId).toBe(['pen-a', 'pen-b', 'pen-c'][pth.meta.penTier]);
        expect(pth.meta.weightScale === undefined || pth.meta.weightScale === 1).toBe(true);
      });
      expect(on.paths).toEqual(d.paths);
    });

    it('a tier with no pen keeps the object pen', () => {
      const on = gen('sphere', 'hatch', 'penInterleave', { tierPens: [null, 'pen-b', null] });
      expect(on.pens).toContain('pen-b');
      expect(on.pens).toContain('');
    });

    it('a three-pen law keeps its own tiers when tone bands are also on', () => {
      const PENS = ['pen-a', 'pen-b', 'pen-c'];
      const a = gen('sphere', 'hatch', 'penInterleave', { tierPens: PENS });
      const b = gen('sphere', 'hatch', 'penInterleave', { tierPens: PENS, toneBands: 3 });
      expect(b.hash).toBe(a.hash);
      expect(b.pens).toEqual(a.pens);
    });
  });

  describe('tone bands to pens', () => {
    const PENS = ['pen-a', 'pen-b', 'pen-c', 'pen-d'];
    const expectBanded = (off, on, n) => {
      const used = on.pens.filter(Boolean);
      expect(used.length).toBeGreaterThanOrEqual(2);
      used.forEach((id) => expect(PENS.slice(0, n)).toContain(id));
      on.out.forEach((pth) => {
        const m = pth.meta || {};
        if (Number.isInteger(m.toneBand)) expect(m.penId).toBe(PENS[m.toneBand]);
      });
      // A split adds no length (a join point may repeat): only the pen changes.
      expect(Math.abs(on.ink - off.ink)).toBeLessThanOrEqual(Math.max(3, off.ink * 0.01));
    };

    [
      ['sphere', 'hatch', 'ladder'], ['sphere', 'stipple', 'ladder'], ['sphere', 'hatch', 'mazeFill'],
      ['sphere', 'hatch', 'taperedEnds'], ['box', 'hatch', 'ladder'], ['box', 'crosshatch', 'ladder'],
    ].forEach(([prim, mapper, law]) => {
      it(`${prim}/${mapper}/${law} splits into 3 bands, band k on pen k, same ink`, () => {
        expectBanded(gen(prim, mapper, law), gen(prim, mapper, law, { toneBands: 3, tierPens: PENS.slice(0, 3) }), 3);
      });
    });

    [2, 4].forEach((n) => {
      it(`sphere/hatch/ladder splits at the ${n}-band boundary`, () => {
        expectBanded(gen('sphere', 'hatch', 'ladder'), gen('sphere', 'hatch', 'ladder', { toneBands: n, tierPens: PENS.slice(0, n) }), n);
      });
    });

    it('a band with no pen keeps the object pen', () => {
      const on = gen('sphere', 'hatch', 'ladder', { toneBands: 3, tierPens: [null, 'pen-b', 'pen-c'] });
      expect(on.pens).toContain('');
      expect(on.pens).toContain('pen-b');
    });

    it('toneBands 1 is off', () => {
      expect(gen('sphere', 'hatch', 'ladder', { toneBands: 1, tierPens: PENS }).hash).toBe(gen('sphere', 'hatch', 'ladder').hash);
    });
  });
});
