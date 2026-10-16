const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U6 — artistic controls.
 *
 * Every default is pinned to the output of the tree this unit started from
 * (3d-scene/fr-u5, 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 * "Defaults reproduce today" is a fact: each pinned hash was measured on that
 * tree before the control existed. Each control then gets a test that fails
 * without it and passes with it.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const freezeDeep = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => freezeDeep(child, seen));
  return Object.freeze(value);
};
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const sha256 = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const lenOf = (p) => {
  let s = 0;
  for (let i = 1; i < p.length; i += 1) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
};
const inkOf = (paths) => Math.round(paths.reduce((a, p) => a + lenOf(p), 0));

// Measured on 3d-scene/fr-u5 with the harness below (sphere / box, hatch).
const BASE = {
  'box/contour/ladder': '2c2e00953e',
  'box/spiral/ladder': '00ddbff7ce',
  'sphere/hatch/ladder': '522848d59b',
  'sphere/crosshatch/ladder': '39470366af',
  'sphere/contour/ladder': '2df69d6183',
  'sphere/spiral/ladder': '3ca6bbfe09',
  'sphere/stipple/ladder': '4c1eff931e',
  'sphere/hatch/taperedEnds': '18936da1cc',
  'sphere/hatch/nibAngle': '6f943b3d78',
  'sphere/hatch/ampSpacing': '321a388eee',
  'sphere/hatch/turingStripe': 'b805ab7a9e',
  'sphere/hatch/mazeFill': '3196519b04',
  'sphere/hatch/voronoiWeb': 'a78080ed7a',
  'sphere/hatch/penInterleave': '778d2eef89',
  'sphere/hatch/trochoidLoop': 'e9ba907e91',
  'sphere/hatch/interlockWeave': '67225d66af',
  'box/hatch/ladder': '28c2e95acf',
  'box/crosshatch/ladder': '170ebe1a1a',
  'box/stipple/ladder': 'a3b46f9d51',
  'box/hatch/turingStripe': 'beb2caec95',
  'box/hatch/mazeFill': '172be58078',
};

describe('Fill-style review U6 — artistic controls', () => {
  // Each fill is a full scene build; a loaded machine needs more than the 180 s default.
  vi.setConfig({ testTimeout: 1800000 });
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 120000);
  afterAll(() => runtime.cleanup());

  const LAW_PARAMS = {
    nibAngle: { toneLaw: 'taperedEnds', widthFrom: 'nibAngle', bandEnds: 'hard' },
    trochoidLoop: { toneLaw: 'ampSpacing', waveForm: 'loop' },
    interlockWeave: { toneLaw: 'ampSpacing', wavePhase: 'anti' },
  };
  // Default fixtures recur across controls. Keep only the most recent
  // immutable summary; nondefault renders invalidate it. Full-output SHA-256
  // digests retain compact parity witnesses for each exact default scene.
  const defaultSceneCache = new Map();
  const defaultSceneSnapshots = new Map();
  const gen = (prim, mapper, law, extra = {}, opt = {}) => {
    const isDefaultScene = Object.keys(extra).length === 0 && Object.keys(opt).length === 0;
    const cacheKey = JSON.stringify([prim, mapper, law]);
    if (isDefaultScene && defaultSceneCache.has(cacheKey)) return defaultSceneCache.get(cacheKey);
    if (!isDefaultScene) defaultSceneCache.clear();
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: prim,
      params: prim === 'box' ? { width: 60, height: 60, depth: 60 } : { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    if (opt.second) {
      p.objects.push({
        id: 'o2', name: 's2', primitive: 'sphere', params: { radius: 40, detail: 20 },
        transform: { x: 0, y: 50, z: -140, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      });
    }
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: {
        penId: null, mapper,
        params: { fillAngle: 45, fillDensity: 50, ...(LAW_PARAMS[law] || { toneLaw: law }), ...extra },
      },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ ...SUN, ...(opt.light || {}) }];
    if (opt.mut) opt.mut(p);
    const out = algo.generate(p, null, null, BOUNDS) || [];
    const paths = out.map((pth) => (pth.points || pth).map((q) => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000]));
    const result = {
      paths, hash: md5(paths), n: paths.length, ink: inkOf(paths), out,
      pens: Array.from(new Set(out.map((pth) => (pth.meta && pth.meta.penId) || ''))).sort(),
    };
    if (isDefaultScene) {
      const outputDigest = sha256({ paths, out });
      if (defaultSceneSnapshots.has(cacheKey)) {
        expect(outputDigest).toBe(defaultSceneSnapshots.get(cacheKey));
      } else {
        defaultSceneSnapshots.set(cacheKey, outputDigest);
      }
      const cachedResult = freezeDeep({ ...result, out: clone(out) });
      defaultSceneCache.clear();
      defaultSceneCache.set(cacheKey, cachedResult);
    }
    return result;
  };

  describe('defaults reproduce the output of the tree this unit started from', () => {
    Object.keys(BASE).forEach((key) => {
      const [prim, mapper, law] = key.split('/');
      it(key, () => {
        expect(gen(prim, mapper, law).hash).toBe(BASE[key]);
      });
    });

    it('every default value written explicitly is the same drawing', () => {
      const CT = V.SCENE_FILL_CONTROLS.CONTROLS;
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
      const FC = V.SCENE_FILL_CONTROLS;
      expect(FC.CONTROLS.toneGamma).toMatchObject({ min: 0.4, max: 2.5, default: 1 });
      expect(FC.CONTROLS.waveLength).toMatchObject({ min: 4, max: 20, default: 7.3 });
      expect(FC.CONTROLS.nibContrast).toMatchObject({ min: 0, max: 0.9, default: 0.65 });
      expect(FC.CONTROLS.taperLength).toMatchObject({ min: 0, max: 15, default: 3.5 });
      expect(FC.CONTROLS.patternMaturity).toMatchObject({ min: 40, max: 400, default: 170 });
    });

    it('normalizeStyle clamps every numeric control into its range', () => {
      const FC = V.SCENE_FILL_CONTROLS;
      const bag = {};
      FC.NUMERIC_KEYS.forEach((k) => { bag[k] = 1e6; });
      const hi = V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: bag }).params;
      FC.NUMERIC_KEYS.forEach((k) => { expect(hi[k]).toBe(FC.CONTROLS[k].max); });
      FC.NUMERIC_KEYS.forEach((k) => { bag[k] = -1e6; });
      const lo = V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: bag }).params;
      FC.NUMERIC_KEYS.forEach((k) => { expect(lo[k]).toBe(FC.CONTROLS[k].min); });
      expect(V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: { waveCrest: 'bogus' } }).params.waveCrest).toBe('auto');
      expect(V.Scene3D.Params.normalizeStyle({ mapper: 'hatch', params: { angleRef: 'light' } }).params.angleRef).toBe('light');
    });
  });

  // ── 1. tone gamma + contrast ────────────────────────────────────────────────
  describe('item 1 — tone gamma and contrast, one point for every Fill Style', () => {
    it('the curve keeps both ends fixed and is monotone', () => {
      const R = V.Scene3D.Regions;
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

    it('reaches every kind of fill, except a faceted Ladder (it grades each face by rank)', () => {
      const unchanged = [];
      [
        ['sphere', 'hatch', 'ladder'], ['sphere', 'contour', 'ladder'], ['sphere', 'spiral', 'ladder'],
        ['sphere', 'stipple', 'ladder'], ['box', 'hatch', 'ladder'], ['box', 'stipple', 'ladder'], ['box', 'contour', 'ladder'], ['box', 'spiral', 'ladder'],
        ['sphere', 'hatch', 'taperedEnds'], ['sphere', 'hatch', 'ampSpacing'], ['sphere', 'hatch', 'voronoiWeb'],
        ['sphere', 'hatch', 'turingStripe'], ['box', 'hatch', 'mazeFill'],
      ].forEach(([prim, mapper, law]) => {
        const key = `${prim}/${mapper}/${law}`;
        if (gen(prim, mapper, law, { toneGamma: 2.2, toneContrast: 0.8 }).hash === BASE[key]) unchanged.push(key);
      });
      expect(unchanged).toEqual(['box/hatch/ladder', 'box/stipple/ladder', 'box/contour/ladder', 'box/spiral/ladder']);
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

  it('a fresh default scene stays byte-identical after gamma and wave controls render', () => {
    const before = gen('sphere', 'hatch', 'ampSpacing');
    gen('sphere', 'hatch', 'ampSpacing', { toneGamma: 1.8 });
    const afterGamma = gen('sphere', 'hatch', 'ampSpacing');
    expect(JSON.stringify(afterGamma.out)).toBe(JSON.stringify(before.out));
    gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4, waveCrest: 'walk' });
    const afterWave = gen('sphere', 'hatch', 'ampSpacing');
    expect(JSON.stringify(afterWave.out)).toBe(JSON.stringify(before.out));
  });

  // ── 7. depth fade ───────────────────────────────────────────────────────────
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

  // ── 2. wave ─────────────────────────────────────────────────────────────────
  describe('item 2 — wave wavelength and crest phase', () => {
    it('wavelength changes the wave and a shorter one adds samples', () => {
      const d = gen('sphere', 'hatch', 'ampSpacing');
      const short = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 4 });
      const long = gen('sphere', 'hatch', 'ampSpacing', { waveLength: 14 });
      expect(short.hash).not.toBe(d.hash);
      expect(long.hash).not.toBe(d.hash);
      const pts = (r) => r.paths.reduce((a, p) => a + p.length, 0);
      expect(pts(short)).toBeGreaterThan(pts(d));
      expect(gen('sphere', 'hatch', 'trochoidLoop', { waveLength: 12 }).hash).not.toBe(BASE['sphere/hatch/trochoidLoop']);
    });

    it('each crest phase draws something different from the others', () => {
      const hashes = ['auto', 'in', 'anti', 'jit', 'walk'].map((c) => gen('sphere', 'hatch', 'ampSpacing', { waveCrest: c }).hash);
      expect(hashes[0]).toBe(BASE['sphere/hatch/ampSpacing']);
      expect(hashes[1]).toBe(hashes[0]); // ampSpacing is already aligned
      expect(new Set([hashes[0], hashes[2], hashes[3], hashes[4]]).size).toBe(4);
    });

    it('crest phase overrides the Phase sub-control on an interlocked wave', () => {
      const anti = gen('sphere', 'hatch', 'interlockWeave');
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'walk' }).hash).not.toBe(anti.hash);
      expect(gen('sphere', 'hatch', 'interlockWeave', { waveCrest: 'anti' }).hash).toBe(anti.hash);
    });

    it('a wave on a box is the plain ladder, so the controls are greyed there', () => {
      expect(gen('box', 'hatch', 'ampSpacing', { waveLength: 4 }).hash).toBe(BASE['box/hatch/ladder']);
    });
  });

  // ── 3 + 4. nib and taper ────────────────────────────────────────────────────
  describe('item 3 — nib angle and contrast', () => {
    it('both change the nib width law; the width-only law keeps the same centrelines', () => {
      const d = gen('sphere', 'hatch', 'nibAngle');
      const a = gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 120 });
      const c = gen('sphere', 'hatch', 'nibAngle', { nibContrast: 0.2 });
      expect(a.hash).not.toBe(d.hash);
      expect(c.hash).not.toBe(d.hash);
      expect(a.hash).not.toBe(c.hash);
      // 45 / 0.65 written out is the default.
      expect(gen('sphere', 'hatch', 'nibAngle', { nibAngleDeg: 45, nibContrast: 0.65 }).hash).toBe(d.hash);
    });

    it('the nib keys do nothing to tapered ends (the controls are greyed there)', () => {
      expect(gen('sphere', 'hatch', 'taperedEnds', { nibAngleDeg: 120, nibContrast: 0.2 }).hash).toBe(BASE['sphere/hatch/taperedEnds']);
    });
  });

  describe('item 4 — taper length, tip width, highlight softness', () => {
    it('each changes tapered ends', () => {
      const d = gen('sphere', 'hatch', 'taperedEnds');
      ['taperLength', 'taperTipWidth', 'taperSoftness'].forEach((k) => {
        const v = { taperLength: 9, taperTipWidth: 0.05, taperSoftness: 0.22 }[k];
        expect(gen('sphere', 'hatch', 'taperedEnds', { [k]: v }).hash, k).not.toBe(d.hash);
      });
    });

    it('taper length 0 removes the end taper', () => {
      const none = gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0 });
      const d = gen('sphere', 'hatch', 'taperedEnds');
      expect(none.hash).not.toBe(d.hash);
      // Tip width then has no effect.
      expect(gen('sphere', 'hatch', 'taperedEnds', { taperLength: 0, taperTipWidth: 0.1 }).hash).toBe(none.hash);
    });

    it('the taper keys do nothing to the nib law', () => {
      expect(gen('sphere', 'hatch', 'nibAngle', { taperLength: 9 }).hash).toBe(BASE['sphere/hatch/nibAngle']);
    });
  });

  // ── 5. turing ───────────────────────────────────────────────────────────────
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

  // ── 6. light-relative hatch ─────────────────────────────────────────────────
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

  // ── 8. tier pens ────────────────────────────────────────────────────────────
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

  // ── 9. maze chaining ────────────────────────────────────────────────────────
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
