const crypto = require('crypto');
const { loadVecturaRuntime } = require('./load-vectura-runtime');

/*
 * Shared harness for the split scene3d-fr-u6-artistic-controls-*.test.js files.
 * See the header of those files for what U6 pins. Each part file calls
 * useU6Harness() inside its top-level describe.
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

const useU6Harness = () => {
  // Each fill is a full scene build; a loaded machine needs more than the 180 s default.
  vi.setConfig({ testTimeout: 1800000 });
  const h = { runtime: null, V: null, algo: null, defaults: null };
  beforeAll(async () => {
    h.runtime = await loadVecturaRuntime();
    h.V = h.runtime.window.Vectura;
    h.algo = h.V.AlgorithmRegistry.scene3d;
    h.defaults = h.V.ALGO_DEFAULTS.scene3d;
  }, 120000);
  afterAll(() => h.runtime.cleanup());
  const LAW_PARAMS = {
    nibAngle: { toneLaw: 'taperedEnds', widthFrom: 'nibAngle', bandEnds: 'hard' },
    trochoidLoop: { toneLaw: 'ampSpacing', waveForm: 'loop' },
    interlockWeave: { toneLaw: 'ampSpacing', wavePhase: 'anti' },
  };
  // Default fixtures recur across controls. Cache one frozen summary per exact
  // default scene (keyed, never cleared by nondefault renders). Full-output
  // SHA-256 digests retain compact parity witnesses for each exact default scene.
  const defaultSceneCache = new Map();
  const defaultSceneSnapshots = new Map();
  const gen = (prim, mapper, law, extra = {}, opt = {}) => {
    const isDefaultScene = Object.keys(extra).length === 0 && Object.keys(opt).length === 0;
    const cacheKey = JSON.stringify([prim, mapper, law]);
    if (isDefaultScene && defaultSceneCache.has(cacheKey)) return defaultSceneCache.get(cacheKey);
    const p = clone(h.defaults);
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
    p.tone = { ...clone(h.defaults).tone, enabled: true };
    p.lights = [{ ...SUN, ...(opt.light || {}) }];
    if (opt.mut) opt.mut(p);
    const out = h.algo.generate(p, null, null, BOUNDS) || [];
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
      defaultSceneCache.set(cacheKey, cachedResult);
    }
    return result;
  };
  // Re-render an exact default scene from scratch (bypasses the cache; the
  // SHA-256 parity witness still applies).
  gen.fresh = (prim, mapper, law) => {
    defaultSceneCache.delete(JSON.stringify([prim, mapper, law]));
    return gen(prim, mapper, law);
  };
  h.gen = gen;
  return h;
};

module.exports = { BASE, BOUNDS, lenOf, useU6Harness };
