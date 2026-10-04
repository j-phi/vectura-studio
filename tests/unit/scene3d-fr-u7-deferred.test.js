const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U7 — deferred items (tone bands, chaining, hatch angle, hidden settings).
 *
 * Every default is pinned to the output of the tree this unit started from
 * (3d-scene/fr-u5, 7d20989b; sphere r40 detail 20, orthographic, Density 50).
 * "Defaults reproduce today" is a fact: each pinned hash was measured on that
 * tree before the control existed. Each control then gets a test that fails
 * without it and passes with it.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);
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

describe('Fill-style review U7 — deferred items', () => {
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
  const gen = (prim, mapper, law, extra = {}, opt = {}) => {
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
    return {
      paths, hash: md5(paths), n: paths.length, ink: inkOf(paths), out,
      pens: Array.from(new Set(out.map((pth) => (pth.meta && pth.meta.penId) || ''))).sort(),
    };
  };


  describe('defaults reproduce today', () => {
    Object.keys(BASE).forEach((key) => {
      const [prim, mapper, law] = key.split('/');
      it(`${key} with every U7 default written out`, () => {
        expect(gen(prim, mapper, law, { toneBands: 0 }).hash).toBe(BASE[key]);
        expect(gen(prim, mapper, law).hash).toBe(BASE[key]);
      });
    });
  });

  describe('item 1 — tone bands to pens, every Fill Style', () => {
    const PENS = ['pen-a', 'pen-b', 'pen-c', 'pen-d'];
    const cases = [
      ['sphere', 'hatch', 'ladder'], ['sphere', 'stipple', 'ladder'], ['sphere', 'hatch', 'mazeFill'],
      ['sphere', 'hatch', 'taperedEnds'], ['box', 'hatch', 'ladder'], ['box', 'crosshatch', 'ladder'],
    ];
    cases.forEach(([prim, mapper, law]) => {
      [2, 3, 4].forEach((n) => {
        it(`${prim}/${mapper}/${law} splits into ${n} bands, band k on pen k`, () => {
          const off = gen(prim, mapper, law);
          const on = gen(prim, mapper, law, { toneBands: n, tierPens: PENS.slice(0, n) });
          const used = on.pens.filter(Boolean);
          expect(used.length).toBeGreaterThanOrEqual(2);
          used.forEach((id) => expect(PENS.slice(0, n)).toContain(id));
          on.out.forEach((pth) => {
            const m = pth.meta || {};
            if (Number.isInteger(m.toneBand)) expect(m.penId).toBe(PENS[m.toneBand]);
          });
          // Same ink, the pen only changes (a split adds no length; a join point may repeat).
          expect(Math.abs(on.ink - off.ink)).toBeLessThanOrEqual(Math.max(3, off.ink * 0.01));
        });
      });
    });
    it('a band with no pen keeps the object pen; band 0 is the lightest tone', () => {
      const on = gen('sphere', 'hatch', 'ladder', { toneBands: 3, tierPens: [null, 'pen-b', 'pen-c'] });
      expect(on.pens).toContain('');
      expect(on.pens).toContain('pen-b');
    });
    it('toneBands 1 is off', () => {
      expect(gen('sphere', 'hatch', 'ladder', { toneBands: 1, tierPens: PENS }).hash).toBe(BASE['sphere/hatch/ladder']);
    });
    it('a three-pen law keeps its own tiers when bands are also on', () => {
      const a = gen('sphere', 'hatch', 'penInterleave', { tierPens: PENS.slice(0, 3) });
      const b = gen('sphere', 'hatch', 'penInterleave', { tierPens: PENS.slice(0, 3), toneBands: 3 });
      expect(b.hash).toBe(a.hash);
    });
  });
});
