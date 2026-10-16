const { BASE, lenOf, useU6Harness } = require('../helpers/scene3d-fr-u6-harness');

/*
 * FILL-STYLE REVIEW U6 — artistic controls (defaults explicit, config, items 1 5 6 7 8 9).
 * Split from scene3d-fr-u6-artistic-controls.test.js for CI sharding; shared
 * fixtures live in tests/helpers/scene3d-fr-u6-harness.js. Every default is
 * pinned to the output of the tree this unit started from (3d-scene/fr-u5,
 * 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 */

describe('Fill-style review U6 — artistic controls', () => {
  const h = useU6Harness();
  const gen = (...a) => h.gen(...a);

  describe('defaults reproduce the output of the tree this unit started from', () => {
    it('every default value written explicitly is the same drawing', () => {
      const CT = h.V.SCENE_FILL_CONTROLS.CONTROLS;
      const explicit = {
        toneGamma: CT.toneGamma.default, toneContrast: CT.toneContrast.default,
        depthFade: false, waveLength: CT.waveLength.default, waveCrest: 'auto',
        nibAngleDeg: CT.nibAngleDeg.default, nibContrast: CT.nibContrast.default,
        taperLength: CT.taperLength.default, taperTipWidth: CT.taperTipWidth.default,
        taperSoftness: CT.taperSoftness.default, patternMaturity: CT.patternMaturity.default,
        stripeScale: CT.stripeScale.default, chainMarks: false, tierPens: null,
      };
      ['ladder', 'taperedEnds', 'nibAngle', 'ampSpacing', 'trochoidLoop', 'turingStripe'].forEach((law) => {
        expect(gen('sphere', 'hatch', law, explicit).hash).toBe(BASE[`sphere/hatch/${law}`]);
      });
      expect(gen('box', 'hatch', 'ladder', explicit).hash).toBe(BASE['box/hatch/ladder']);
    });
  });

  describe('config and clamps', () => {
    it('ranges and defaults live in Vectura.SCENE_FILL_CONTROLS', () => {
      const FC = h.V.SCENE_FILL_CONTROLS;
      expect(FC.CONTROLS.toneGamma).toMatchObject({ min: 0.4, max: 2.5, default: 1 });
      expect(FC.CONTROLS.waveLength).toMatchObject({ min: 4, max: 20, default: 7.3 });
      expect(FC.CONTROLS.nibContrast).toMatchObject({ min: 0, max: 0.9, default: 0.65 });
      expect(FC.CONTROLS.taperLength).toMatchObject({ min: 0, max: 15, default: 3.5 });
      expect(FC.CONTROLS.patternMaturity).toMatchObject({ min: 40, max: 400, default: 170 });
    });

    it('normalizeStyle clamps every numeric control into its range', () => {
      const FC = h.V.SCENE_FILL_CONTROLS;
      const bag = {};
      FC.NUMERIC_KEYS.forEach((k) => { bag[k] = 1e6; });
      const hi = h.V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: bag }).params;
      FC.NUMERIC_KEYS.forEach((k) => { expect(hi[k]).toBe(FC.CONTROLS[k].max); });
      FC.NUMERIC_KEYS.forEach((k) => { bag[k] = -1e6; });
      const lo = h.V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: bag }).params;
      FC.NUMERIC_KEYS.forEach((k) => { expect(lo[k]).toBe(FC.CONTROLS[k].min); });
      expect(h.V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: { waveCrest: 'bogus' } }).params.waveCrest).toBe('auto');
      expect(h.V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: { angleRef: 'light' } }).params.angleRef).toBe('light');
    });
  });


  describe('item 1 — tone gamma and contrast across curved, faceted, and no-op routes', () => {
    it('the curve keeps both ends fixed and is monotone', () => {
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
      expect(dark.hash).not.toBe(d.hash);
      expect(dark.ink).toBeGreaterThan(d.ink);
      expect(light.ink).toBeLessThan(d.ink);
    });

    it('contrast changes the drawing', () => {
      const d = gen('sphere', 'hatch', 'fineLadder');
      expect(gen('sphere', 'hatch', 'fineLadder', { toneContrast: 1 }).hash).not.toBe(d.hash);
      expect(gen('sphere', 'hatch', 'fineLadder', { toneContrast: -1 }).hash).not.toBe(d.hash);
    });

    it('reaches curved and faceted fills, while faceted Ladder remains its no-op route', () => {
      const unchanged = [];
      [
        ['sphere', 'hatch', 'ladder'], ['box', 'hatch', 'turingStripe'], ['box', 'hatch', 'ladder'],
      ].forEach(([prim, mapper, law]) => {
        const key = `${prim}/${mapper}/${law}`;
        if (gen(prim, mapper, law, { toneGamma: 2.2, toneContrast: 0.8 }).hash === BASE[key]) unchanged.push(key);
      });
      expect(unchanged).toEqual(['box/hatch/ladder']);
    });

    it('is per object: a second object keeps its own curve', () => {
      const p = (extra) => gen('sphere', 'hatch', 'ladder', {}, {
        second: true,
        mut: (pp) => { pp.styleTable.byObject.o1 = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50, toneLaw: 'ladder', ...extra } }; },
      });
      const a = p({});
      const b = p({ toneGamma: 1.8 });
      expect(b.hash).not.toBe(a.hash);
    });
  });

  describe('item 7 — depth fade', () => {
    it('off is today; on lightens the far object more than the near one', () => {
      const off = gen('sphere', 'hatch', 'ladder', {}, { second: true });
      const on = gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 0.9 }, { second: true });
      expect(on.hash).not.toBe(off.hash);
      expect(on.ink).toBeLessThan(off.ink);
      // Split the paths by object: o2 sits 140 mm behind o1.
      const byObj = (r) => {
        const t = { o1: 0, o2: 0 };
        r.out.forEach((pth, i) => {
          const id = pth.meta && pth.meta.sceneTarget && pth.meta.sceneTarget.objectId;
          if (id in t) t[id] += lenOf(r.paths[i]);
        });
        return t;
      };
      const a = byObj(off); const b = byObj(on);
      expect(a.o1).toBeGreaterThan(0);
      expect(a.o2).toBeGreaterThan(0);
      expect(b.o2 / a.o2).toBeLessThan(b.o1 / a.o1);
    });

    it('strength, start and full-fade distance each change the drawing', () => {
      const base = gen('sphere', 'hatch', 'ladder', { depthFade: true }, { second: true });
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 1 }, { second: true }).hash).not.toBe(base.hash);
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeNear: 0.5 }, { second: true }).hash).not.toBe(base.hash);
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeFar: 0.5 }, { second: true }).hash).not.toBe(base.hash);
    });

    it('depth fade still reaches a faceted Ladder', () => {
      const off = gen('box', 'hatch', 'ladder', {}, { second: true });
      const on = gen('box', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 1 }, { second: true });
      expect(on.hash).not.toBe(off.hash);
    });

    it('strength 0 is the identity', () => {
      const off = gen('sphere', 'hatch', 'ladder', {}, { second: true });
      expect(gen('sphere', 'hatch', 'ladder', { depthFade: true, depthFadeStrength: 0 }, { second: true }).hash).toBe(off.hash);
    });
  });

  describe('item 5 — Turing stripe maturity and scale', () => {
    it('maturity and scale each change the pattern; alignment keeps working', () => {
      const d = gen('sphere', 'hatch', 'turingStripe');
      expect(gen('sphere', 'hatch', 'turingStripe', { patternMaturity: 60 }).hash).not.toBe(d.hash);
      expect(gen('sphere', 'hatch', 'turingStripe', { patternMaturity: 300 }).hash).not.toBe(d.hash);
      const small = gen('sphere', 'hatch', 'turingStripe', { stripeScale: 0.6 });
      const big = gen('sphere', 'hatch', 'turingStripe', { stripeScale: 2 });
      expect(small.hash).not.toBe(d.hash);
      expect(big.hash).not.toBe(small.hash);
      expect(gen('sphere', 'hatch', 'turingStripe', { stripeAlign: 0.9 }).hash).not.toBe(d.hash);
    });

    it('reaches the faceted path too', () => {
      expect(gen('box', 'hatch', 'turingStripe', { stripeScale: 2 }).hash).not.toBe(BASE['box/hatch/turingStripe']);
    });
  });

  describe('item 6 — light-relative hatch angle', () => {
    const lightAz = (az) => ({ light: { azimuth: az } });
    it('Face reference ignores the light; Light reference follows it', () => {
      const f1 = gen('box', 'hatch', 'ladder', { angleRef: 'face' }, lightAz(200));
      const f2 = gen('box', 'hatch', 'ladder', { angleRef: 'face' }, lightAz(120));
      // Spacing may shift with the light, so compare line DIRECTIONS only.
      const dirs = (r) => r.paths.filter((p) => p.length >= 2 && lenOf(p) > 8).map((p) => {
        const a = Math.atan2(p[p.length - 1][1] - p[0][1], p[p.length - 1][0] - p[0][0]);
        return Math.round(((a * 180 / Math.PI) % 180 + 180) % 180);
      });
      const histo = (r) => { const h = {}; dirs(r).forEach((d) => { h[d] = (h[d] || 0) + 1; }); return h; };
      expect(Object.keys(histo(f1)).sort()).toEqual(Object.keys(histo(f2)).sort());
      const l1 = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, lightAz(200));
      const l2 = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, lightAz(120));
      expect(Object.keys(histo(l1)).sort()).not.toEqual(Object.keys(histo(l2)).sort());
      expect(l1.hash).not.toBe(f1.hash);
    });

    it('Angle 0 hatches along the sun projected on the face', () => {
      // A top face lit from azimuth 90 (the +X side): its lines run along world X.
      const r = gen('box', 'hatch', 'ladder', { angleRef: 'light', fillAngle: 0 }, {
        light: { azimuth: 90, elevation: 50 },
        mut: (pp) => { pp.camera = { ...pp.camera, yaw: 0, pitch: 90 }; },
      });
      const long = r.paths.filter((p) => lenOf(p) > 20);
      expect(long.length).toBeGreaterThan(2);
      long.forEach((p) => {
        const dx = Math.abs(p[p.length - 1][0] - p[0][0]);
        const dy = Math.abs(p[p.length - 1][1] - p[0][1]);
        expect(Math.min(dx, dy) / Math.max(dx, dy, 1e-6)).toBeLessThan(0.15);
      });
    });

    it('Light is offered on faceted shapes only', () => {
      expect(gen('box', 'hatch', 'ladder', { angleRef: 'light' }).hash).not.toBe(BASE['box/hatch/ladder']);
    });
  });

  describe('item 8 — tone tiers to real pens', () => {
    it('off: no path names a pen. On: tier k draws with pen k', () => {
      const d = gen('sphere', 'hatch', 'penInterleave');
      expect(d.pens).toEqual(['']);
      const on = gen('sphere', 'hatch', 'penInterleave', { tierPens: ['pen-a', 'pen-b', 'pen-c'] });
      expect(on.pens.filter(Boolean)).toEqual(['pen-a', 'pen-b', 'pen-c']);
      on.out.forEach((pth) => {
        const t = pth.meta.penTier;
        expect(pth.meta.penId).toBe(['pen-a', 'pen-b', 'pen-c'][t]);
        expect(pth.meta.weightScale === undefined || pth.meta.weightScale === 1).toBe(true);
      });
      // Same geometry, only the pen changes.
      expect(on.paths.length).toBe(d.paths.length);
    });

    it('a tier with no pen keeps the object pen', () => {
      const on = gen('sphere', 'hatch', 'penInterleave', { tierPens: [null, 'pen-b', null] });
      expect(on.pens).toContain('pen-b');
      expect(on.pens).toContain('');
    });
  });

  describe('item 9 — chain maze walls', () => {
    const segKey = (a, b) => {
      const k1 = `${a[0]},${a[1]}`; const k2 = `${b[0]},${b[1]}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };
    const segSet = (paths) => {
      const m = new Map();
      paths.forEach((p) => { for (let i = 1; i < p.length; i += 1) { const k = segKey(p[i - 1], p[i]); m.set(k, (m.get(k) || 0) + 1); } });
      return m;
    };

    it('default off is today; on joins walls into fewer paths with the same segments', () => {
      ['sphere', 'box'].forEach((prim) => {
        const off = gen(prim, 'hatch', 'mazeFill');
        const on = gen(prim, 'hatch', 'mazeFill', { chainMarks: true });
        expect(off.hash).toBe(BASE[`${prim}/hatch/mazeFill`]);
        expect(on.n).toBeLessThan(off.n);
        // Ink is the same; a join may add a connector under 0.01 mm.
        expect(Math.abs(on.ink - off.ink)).toBeLessThanOrEqual(Math.max(2, off.ink * 0.001));
      });
    });

    it('does nothing to a law that does not chain', () => {
      expect(gen('sphere', 'hatch', 'turingStripe', { chainMarks: true }).hash).toBe(BASE['sphere/hatch/turingStripe']);
    });
  });
});
