const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U7 — deferred items (tone bands, chaining, hatch angle, hidden settings).
 *
 * Three representative defaults retain curved and faceted output guards;
 * U6 owns the full historical BASE roster. Each control keeps a focused
 * behavior witness below.
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

// Representative outputs measured on 3d-scene/fr-u5 with the harness below.
const BASE = {
  'sphere/hatch/ladder': '522848d59b',
  'box/hatch/ladder': '28c2e95acf',
  'box/crosshatch/ladder': '170ebe1a1a',
};
// Retain the original default witness used by the independent chaining test.
const VORONOI_DEFAULT_HASH = 'a78080ed7a';

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
  // Keep only the most recent immutable default summary. A nondefault render
  // invalidates it; full-output SHA-256 digests retain compact parity
  // witnesses for each exact default scene.
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


  describe('curved and faceted defaults reproduce today', () => {
    Object.keys(BASE).forEach((key) => {
      const [prim, mapper, law] = key.split('/');
      it(`${key} with toneBands explicitly off matches its saved default`, () => {
        expect(gen(prim, mapper, law, { toneBands: 0 }).hash).toBe(BASE[key]);
        expect(gen(prim, mapper, law).hash).toBe(BASE[key]);
      });
    });
  });

  describe('item 1 — tone bands to pens across six representative styles', () => {
    const PENS = ['pen-a', 'pen-b', 'pen-c', 'pen-d'];
    const cases = [
      ['sphere', 'hatch', 'ladder'], ['sphere', 'stipple', 'ladder'], ['sphere', 'hatch', 'mazeFill'],
      ['sphere', 'hatch', 'taperedEnds'], ['box', 'hatch', 'ladder'], ['box', 'crosshatch', 'ladder'],
    ];
    cases.forEach(([prim, mapper, law]) => {
      [3].forEach((n) => {
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
    [2, 4].forEach((n) => {
      it(`sphere/hatch/ladder splits at the ${n}-band boundary`, () => {
        const off = gen('sphere', 'hatch', 'ladder');
        const on = gen('sphere', 'hatch', 'ladder', { toneBands: n, tierPens: PENS.slice(0, n) });
        expect(on.pens.filter(Boolean).length).toBeGreaterThanOrEqual(2);
        on.out.forEach((pth) => {
          const m = pth.meta || {};
          if (Number.isInteger(m.toneBand)) expect(m.penId).toBe(PENS[m.toneBand]);
        });
        expect(Math.abs(on.ink - off.ink)).toBeLessThanOrEqual(Math.max(3, off.ink * 0.01));
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

    it('a fresh default drawing survives a tone-band render without state leakage', () => {
      const before = gen('sphere', 'hatch', 'ladder');
      gen('sphere', 'hatch', 'ladder', { toneBands: 3, tierPens: PENS.slice(0, 3) });
      const after = gen('sphere', 'hatch', 'ladder');
      expect(JSON.stringify(after.out)).toBe(JSON.stringify(before.out));
    });
  });

  describe('item 3 — Voronoi chaining at emit', () => {
    const travelOf = (out) => {
      let t = 0; let prev = null;
      out.forEach((pth) => {
        const q = pth.points || pth;
        if (q.length < 2) return;
        if (prev) t += Math.hypot(q[0].x - prev.x, q[0].y - prev.y);
        prev = q[q.length - 1];
      });
      return t;
    };
    it('default off is today; on joins edges into fewer paths and cuts pen travel', () => {
      const off = gen('sphere', 'hatch', 'voronoiWeb');
      const on = gen('sphere', 'hatch', 'voronoiWeb', { chainMarks: true });
      expect(off.hash).toBe(VORONOI_DEFAULT_HASH);
      expect(on.n).toBeLessThan(off.n * 0.75);
      expect(travelOf(on.out)).toBeLessThan(travelOf(off.out) * 0.2);
      // A join adds a connector under one pen width, never a new mark.
      expect(on.ink).toBeLessThanOrEqual(off.ink * 1.04);
      expect(on.ink).toBeGreaterThanOrEqual(off.ink * 0.99);
      // eslint-disable-next-line no-console
      console.log('VORONOI paths', off.n, '->', on.n, 'travel', Math.round(travelOf(off.out)), '->', Math.round(travelOf(on.out)), 'ink', off.ink, '->', on.ink);
    });
  });

  // ── item 6 — folds and wires ───────────────────────────────────────────────
  describe('item 6a — wireframe Show hidden folds into Hidden edges: Dash', () => {
    const baseScene = (styleTable, extra = {}) => {
      const p = clone(defaults);
      p.objects = [
        { id: 'o1', name: 'b', primitive: 'box', params: { width: 60, height: 60, depth: 60 }, transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'solid' },
        { id: 'o2', name: 'c', primitive: 'box', params: { width: 40, height: 40, depth: 40 }, transform: { x: 10, y: 30, z: 60, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      ];
      p.ground = { enabled: true };
      p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      p.styleTable = styleTable;
      p.lights = [{ ...SUN }];
      Object.assign(p, extra);
      return p;
    };
    const run = (p, version) => {
      const q = clone(p); q.sceneVersion = version;
      const sane = V.Scene3D.Params.sanitizeSceneParams(q);
      const out = algo.generate(sane, null, null, BOUNDS) || [];
      const paths = out.map((pth) => (pth.points || pth).map((c) => [Math.round(c.x * 1000) / 1000, Math.round(c.y * 1000) / 1000]));
      const dashed = out.filter((pth) => pth.meta && pth.meta.sceneTarget && pth.meta.sceneTarget.occluded).length;
      return { sane, hash: md5(paths), n: paths.length, dashed };
    };
    const wf = (more = {}) => ({ penId: null, mapper: 'wireframe', params: { ...more } });

    it('scene style: the migrated document draws byte-identically, and the key is gone', () => {
      const legacy = baseScene({ scene: wf({ showHidden: true }), byObject: {}, byFace: {} });
      const before = run(legacy, 5); // engine still reads the key: today's output
      const after = run(legacy, 4); // migrated
      expect(before.dashed).toBeGreaterThan(0);
      expect(after.hash).toBe(before.hash);
      expect(after.n).toBe(before.n);
      expect(after.sane.styleTable.scene.params.showHidden).toBeUndefined();
      expect(after.sane.edgeStyles.hidden.hiddenTreatment).toBe('dash');
      // The same scene without the toggle has no dashed edges: the fold is not a no-op.
      expect(run(baseScene({ scene: wf(), byObject: {}, byFace: {} }), 4).dashed).toBe(0);
    });

    it('object style: only that object dashes', () => {
      const legacy = baseScene({ scene: wf(), byObject: { o1: wf({ showHidden: true }) }, byFace: {} });
      const before = run(legacy, 5);
      const after = run(legacy, 4);
      expect(before.dashed).toBeGreaterThan(0);
      expect(after.hash).toBe(before.hash);
      expect(after.sane.styleTable.byObject.o1.params.showHidden).toBeUndefined();
      expect(after.sane.edgeStylesByObject.o1.hidden.hiddenTreatment).toBe('dash');
      expect(after.sane.edgeStylesByObject.o2).toBeUndefined();
    });

    it('scene style with one object on its own style: the others keep their look', () => {
      const own = { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } };
      const legacy = baseScene({ scene: wf({ showHidden: true }), byObject: { o1: own }, byFace: {} });
      const before = run(legacy, 5);
      const after = run(legacy, 4);
      expect(after.hash).toBe(before.hash);
      expect(after.sane.edgeStyles && after.sane.edgeStyles.hidden && after.sane.edgeStyles.hidden.hiddenTreatment).not.toBe('dash');
      expect(after.sane.edgeStylesByObject.o2.hidden.hiddenTreatment).toBe('dash');
    });

    it('is idempotent and leaves a v5 document alone', () => {
      const legacy = baseScene({ scene: wf({ showHidden: true }), byObject: {}, byFace: {} });
      const once = run(legacy, 4).sane;
      const twice = V.Scene3D.Params.sanitizeSceneParams(clone(once));
      expect(JSON.stringify(twice.edgeStyles)).toBe(JSON.stringify(once.edgeStyles));
      expect(twice.sceneVersion).toBe(V.Scene3D.Params.SCENE_VERSION);
    });

    it('an object3d leaf folds into its own edge styles', () => {
      const leaf = { sceneVersion: 4, primitive: 'box', params: { width: 40, height: 40, depth: 40 }, style: { mapper: 'wireframe', penId: null, params: { showHidden: true } } };
      const m = V.Scene3D.Params.sanitizeSceneParams ? V.Scene3D.Params.migrateScene(leaf) : leaf;
      expect(m.style.params.showHidden).toBeUndefined();
      expect(m.edgeStyles.hidden.hiddenTreatment).toBe('dash');
    });
  });

  describe('item 6b — Alt fill angle from the shared cross-angle source', () => {
    const alt = (extra, layers) => gen('sphere', 'hatch', 'ladder', {
      highlightTreatment: 'altFill', altFillMapper: 'lines', altFillLayers: layers, ...extra,
    }, { light: { elevation: 70 } });
    it('absent key = the fixed 45 / 135 of today, written out the same', () => {
      [1, 2].forEach((layers) => {
        const base = alt({}, layers);
        expect(alt({ altFillAngle: 45, crossAngleDelta: 90 }, layers).hash).toBe(base.hash);
      });
    });
    it('Alt angle turns the lines; the second layer follows the Cross angle', () => {
      const base = alt({}, 2);
      const turned = alt({ altFillAngle: 20 }, 2);
      expect(turned.hash).not.toBe(base.hash);
      expect(alt({ altFillAngle: 45, crossAngleDelta: 60 }, 2).hash).not.toBe(base.hash);
      // One layer ignores the Cross angle.
      expect(alt({ altFillAngle: 45, crossAngleDelta: 60 }, 1).hash).toBe(alt({}, 1).hash);
    });
  });

  describe('item 6c — X-ray Front line does nothing on a faceted shape', () => {
    it('box: Front line dotted draws the same as solid', () => {
      const xr = (extra) => gen('box', 'hatch', 'ladder', { xrayFrontLineType: 'dotted', ...extra }, {
        mut: (p) => { p.objects[0].visibility = 'xray'; },
      });
      const a = xr({}); const b = xr({ xrayFrontLineType: 'solid' });
      expect(a.hash).toBe(b.hash);
    });
  });
});
