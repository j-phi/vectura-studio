const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U4b — engine defects.
 *
 * One block per item. Every default is pinned to the output of the tree this
 * unit started from (commit 3afe6079, sphere r40 detail 20, orthographic,
 * Density 50) so a "defaults reproduce today" claim is a fact, not a hope.
 * Items 1, 3 (gate), 4 and 5 change output on purpose; their tests state the
 * before/after.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const inkOf = (paths) => {
  let s = 0;
  paths.forEach((p) => { for (let i = 1; i < p.length; i += 1) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); });
  return Math.round(s);
};
const dupCount = (paths) => {
  const seen = new Map();
  paths.forEach((p) => { const k = JSON.stringify(p); seen.set(k, (seen.get(k) || 0) + 1); });
  let d = 0;
  seen.forEach((n) => { if (n > 1) d += n - 1; });
  return d;
};

describe('Fill-style review U4b — engine defects', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 120000);
  afterAll(() => runtime.cleanup());

  const gen = (mapper, params, opt = {}) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 50, ...params } }, byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ ...SUN }];
    if (opt.mut) opt.mut(p);
    const out = algo.generate(p, null, null, BOUNDS) || [];
    const paths = out.map((pth) => (pth.points || pth).map((q) => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000]));
    return { paths, hash: md5(paths), n: paths.length, ink: inkOf(paths), dup: dupCount(paths) };
  };

  // ── 1. mono crosshatch: no duplicate second pass ─────────────────────────
  describe('item 1 — mono crosshatch redraws identical lines', () => {
    it('a direction-free law (etfKang) draws Crosshatch as Hatch, with no duplicate path', () => {
      const h = gen('hatch', { toneLaw: 'etfKang' });
      const x = gen('crosshatch', { toneLaw: 'etfKang' });
      expect(x.dup).toBe(0);
      expect(x.hash).toBe(h.hash);
      // Pinned: Hatch is unchanged. Before U4b crosshatch drew 2x the ink.
      expect([h.hash, h.n]).toEqual(['5e8d6e573f', 469]);
    });

    it('originSpiral (its own retrace passes are by design, so no dup check) matches its Hatch output', () => {
      const x = gen('crosshatch', { toneLaw: 'originSpiral' });
      expect(x.hash).toBe(gen('hatch', { toneLaw: 'originSpiral' }).hash);
      expect(x.hash).toBe('f626515e7c');
    });

    it('a directional law (mezzoRegion) keeps its real crossing pass: byte-identical to before', () => {
      const x = gen('crosshatch', { toneLaw: 'mezzoRegion' });
      expect(x.dup).toBe(0);
      expect([x.hash, x.n, x.ink]).toEqual(['0fa30f8ffa', 1668, 27567]);
    });

    it('the Cross angle slider moves the crossing pass of a directional law', () => {
      const a = gen('crosshatch', { toneLaw: 'dutyConst' });
      const b = gen('crosshatch', { toneLaw: 'dutyConst', crossAngleDelta: 60 });
      expect(b.hash).not.toBe(a.hash);
      expect(b.dup).toBe(0);
    });
  });

  // ── 2. mono Density and Angle ────────────────────────────────────────────
  describe('item 2 — mono Density and Angle', () => {
    it('Density is live on a mono law, and the default (50) is byte-identical to before', () => {
      const lo = gen('hatch', { toneLaw: 'dutyConst', fillDensity: 20 });
      const mid = gen('hatch', { toneLaw: 'dutyConst', fillDensity: 50 });
      const lo2 = gen('hatch', { toneLaw: 'etfKang', fillDensity: 20 });
      const mid2 = gen('hatch', { toneLaw: 'etfKang', fillDensity: 50 });
      expect(mid.hash).toBe('0fa154d77c');
      expect(mid2.hash).toBe('5e8d6e573f');
      expect(lo.hash).not.toBe(mid.hash);
      expect(lo2.hash).not.toBe(mid2.hash);
      expect(lo.ink).toBeLessThan(mid.ink);
      expect(lo2.ink).toBeLessThan(mid2.ink);
    });

    it('Angle turns a law that has a direction, and the law list matches the engine', () => {
      const a = gen('hatch', { toneLaw: 'dutyConst', fillAngle: 45 });
      const b = gen('hatch', { toneLaw: 'dutyConst', fillAngle: 100 });
      expect(b.hash).not.toBe(a.hash);
      const M = V.Scene3D.SurfaceFillMono;
      expect(M.readsAngle('dutyConst')).toBe(true);
      expect(M.readsAngle('mezzoRegion')).toBe(true);
      expect(M.readsAngle('endShorten')).toBe(true);
      ['etfKang', 'defectSplit', 'originSpiral', 'turingStripe', 'voronoiWeb', 'mazeFill'].forEach((id) => {
        expect(M.readsAngle(id)).toBe(false);
      });
      // ...and a direction-free law really ignores it.
      const e1 = gen('hatch', { toneLaw: 'etfKang', fillAngle: 45 });
      const e2 = gen('hatch', { toneLaw: 'etfKang', fillAngle: 100 });
      expect(e2.hash).toBe(e1.hash);
    });
  });

  // ── 3. Contour on mono laws ──────────────────────────────────────────────
  describe('item 3 — Contour on a mono law', () => {
    it('draws exactly what Hatch draws (the evidence for the Type gate)', () => {
      const h = gen('hatch', { toneLaw: 'dutyConst' });
      const c = gen('contour', { toneLaw: 'dutyConst' });
      expect(c.hash).toBe(h.hash);
    });

    it('the Type list greys Contour under a mono law and nowhere else', () => {
      const FS = V.SCENE_FILL_STYLES;
      const opts = [{ value: 'hatch', label: 'Hatch' }, { value: 'contour', label: 'Contour' }];
      const mono = FS.typeOptions(opts, 'voronoiWeb');
      expect(mono.find((o) => o.value === 'contour').disabled).toBe(true);
      expect(mono.find((o) => o.value === 'contour').label).toBe('Contour — same as Hatch');
      expect(mono.find((o) => o.value === 'hatch').disabled).toBeUndefined();
      expect(FS.typeOptions(opts, 'ladder')).toBe(opts);
      expect(FS.monoGate('etfKang')).toEqual({ mono: true, contourDead: true, angleDead: true });
      expect(FS.monoGate('dutyConst')).toEqual({ mono: true, contourDead: true, angleDead: false });
      expect(FS.monoGate('ladder')).toEqual({ mono: false, contourDead: false, angleDead: false });
    });
  });

  // ── 4. fieldMetric keeps the sigmoid ─────────────────────────────────────
  describe('item 4 — Field metric no longer drops the sigmoid curve', () => {
    it('a retired contFieldFore document keeps its original L*-linear output', () => {
      const legacy = gen('hatch', { toneLaw: 'contFieldFore' });
      expect(legacy.hash).toBe('509824d25d');
    });

    it('survivor + Field metric now rides the sigmoid, so it differs from the legacy id', () => {
      const legacy = gen('hatch', { toneLaw: 'contFieldFore' });
      const survivor = gen('hatch', { toneLaw: 'contFieldSigmoid', fieldMetric: 'foreshortened' });
      const pinned = gen('hatch', { toneLaw: 'contFieldSigmoid', fieldMetric: 'foreshortened', fieldCurve: 'lstar' });
      expect(survivor.hash).not.toBe(legacy.hash);
      expect(pinned.hash).toBe(legacy.hash);
    });

    it('the plain survivor is untouched', () => {
      expect(gen('hatch', { toneLaw: 'contFieldSigmoid' }).hash).toBe('5b6d47e04c');
    });

    it('the alias shim pins the legacy ids to L*-linear, and only those', () => {
      const P = V.Scene3D.Params;
      ['contFieldFore', 'contFieldSurface', 'contFieldQuant', 'contFieldTouch'].forEach((id) => {
        expect(P.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } }).params.fieldCurve).toBe('lstar');
      });
      expect(P.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'contFieldSigmoid' } }).params.fieldCurve).toBeUndefined();
    });
  });

  // ── 5. perceptual rung mode on the W-26 engine ───────────────────────────
  describe('item 5 — Perceptual ramp respects W-26 placement', () => {
    it('Perceptual ramp is placed continuously: same path count as Ladder, not the old discrete count', () => {
      const r = gen('hatch', { toneLaw: 'perceptualRamp' });
      const l = gen('hatch', { toneLaw: 'ladder' });
      expect(l.hash).toBe('522848d59b');
      // Before U4b: 128 paths / 2481 mm (discrete rung verdict, irregular gaps).
      expect(r.n).toBe(144);
      expect(r.hash).not.toBe('1d5dac3cab');
      expect(r.hash).toBe('c924f1223f');
    });
  });

  // ── 6. turingStripe alignment ────────────────────────────────────────────
  describe('item 6 — turingStripe stripe alignment', () => {
    it('default 0 is today\'s output; a value aligns; the cap holds', () => {
      const d = gen('hatch', { toneLaw: 'turingStripe' });
      expect(d.hash).toBe('b805ab7a9e');
      expect(gen('hatch', { toneLaw: 'turingStripe', stripeAlign: 0 }).hash).toBe(d.hash);
      const a = gen('hatch', { toneLaw: 'turingStripe', stripeAlign: 0.9 });
      expect(a.hash).not.toBe(d.hash);
      // 3.0 broke the pattern into noise (r2); the param clamps at 1.2.
      const hi = gen('hatch', { toneLaw: 'turingStripe', stripeAlign: 3 });
      const cap = gen('hatch', { toneLaw: 'turingStripe', stripeAlign: 1.2 });
      expect(hi.hash).toBe(cap.hash);
      expect(V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: { stripeAlign: 9 } }).params.stripeAlign).toBe(1.2);
    });
  });

  // ── 7. curved stipple Jitter ─────────────────────────────────────────────
  describe('item 7 — curved stipple honours Jitter', () => {
    it('absent / 0 keeps the exact lattice; 40 and 100 scatter it', () => {
      const none = gen('stipple', { toneLaw: 'ladder' });
      expect(none.hash).toBe('4c1eff931e');
      expect(gen('stipple', { toneLaw: 'ladder', stippleJitter: 0 }).hash).toBe(none.hash);
      const j40 = gen('stipple', { toneLaw: 'ladder', stippleJitter: 40 });
      const j100 = gen('stipple', { toneLaw: 'ladder', stippleJitter: 100 });
      expect(j40.hash).not.toBe(none.hash);
      expect(j100.hash).not.toBe(j40.hash);
    });
  });

  // ── 8. penCross and mkDotScreen keys ─────────────────────────────────────
  describe('item 8 — penCross and mkDotScreen read their keys', () => {
    it('penCross follows Cross angle and Cross density on Crosshatch; the default is unchanged', () => {
      const d = gen('crosshatch', { toneLaw: 'penCross' });
      expect(d.hash).toBe('06d6a4409b');
      const a = gen('crosshatch', { toneLaw: 'penCross', crossAngleDelta: 60 });
      const r = gen('crosshatch', { toneLaw: 'penCross', crossDensityRatio: 2 });
      // Before U4b only the mapper's own family B moved; the law's crossing family stayed.
      expect(a.hash).not.toBe('e44475c64b');
      expect(r.hash).not.toBe('2fc116d503');
      expect(a.hash).not.toBe(d.hash);
    });

    it('mkDotScreen follows Dot size and Dot angle; the default is unchanged', () => {
      const d = gen('hatch', { toneLaw: 'mkDotScreen' });
      expect(d.hash).toBe('44e6f3e517');
      expect(gen('hatch', { toneLaw: 'mkDotScreen', dotSize: 0.4 }).hash).not.toBe(d.hash);
      expect(gen('hatch', { toneLaw: 'mkDotScreen', dotAngle: 45 }).hash).not.toBe(d.hash);
      expect(gen('hatch', { toneLaw: 'mkDotScreen', dotAngle: 0 }).hash).toBe(d.hash);
    });
  });
});
