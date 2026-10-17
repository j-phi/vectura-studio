const crypto = require('crypto');
const { loadVecturaRuntime } = require('./load-vectura-runtime');

/*
 * Shared fixture for the Scene3D fill-control behavior suites
 * (scene3d-fill-tone-controls, scene3d-fill-mark-controls, scene3d-fill-mono-laws).
 *
 * One runtime load per file. The default object is a SMALL sphere (r22, detail 12)
 * or a 40 mm box, orthographic, Density 50, one sun. That is the smallest fixture
 * on which every control in these suites still moves the drawing; each suite was
 * mutation-checked on it (the proofs are in the commit that introduced it).
 *
 * gen(prim, mapper, law, extra, opt) -> { paths, hash, n, ink, dup, out, pens }
 *   prim   'sphere' | 'box'
 *   law    a survivor tone-law id, or one of LAW_PARAMS (a survivor + sub-controls)
 *   extra  style params on top of the law
 *   opt    { second: true }  a second sphere 140 mm behind the first
 *          { light: {...} }  overrides on the sun
 *          { mut: (p) => }   last-word edit of the scene params
 *
 * Default scenes (no extra, no opt) are cached. Only the most recent one is kept;
 * any other render clears it, so the next default call renders again and its
 * full-output SHA-256 must equal the first render of that scene. That makes every
 * repeated default render a state-leak check (a render must not change the next one).
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
const SPHERE = { radius: 22, detail: 12 };
const BOX = { sx: 40, sy: 40, sz: 40 };
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const sha256 = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const lenOf = (p) => {
  let s = 0;
  for (let i = 1; i < p.length; i += 1) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
};
const inkOf = (paths) => Math.round(paths.reduce((a, p) => a + lenOf(p), 0));
const dupCount = (paths) => {
  const seen = new Map();
  paths.forEach((p) => { const k = JSON.stringify(p); seen.set(k, (seen.get(k) || 0) + 1); });
  let d = 0;
  seen.forEach((n) => { if (n > 1) d += n - 1; });
  return d;
};

// Laws that are a survivor plus sub-controls in the picker.
const LAW_PARAMS = {
  nibAngle: { toneLaw: 'taperedEnds', widthFrom: 'nibAngle', bandEnds: 'hard' },
  trochoidLoop: { toneLaw: 'ampSpacing', waveForm: 'loop' },
  interlockWeave: { toneLaw: 'ampSpacing', wavePhase: 'anti' },
};

const useFillFixture = () => {
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

  const defaultSceneCache = new Map();
  const defaultSceneSnapshots = new Map();
  h.gen = (prim, mapper, law, extra = {}, opt = {}) => {
    const isDefaultScene = Object.keys(extra).length === 0 && Object.keys(opt).length === 0;
    const cacheKey = JSON.stringify([prim, mapper, law]);
    if (isDefaultScene && defaultSceneCache.has(cacheKey)) return defaultSceneCache.get(cacheKey);
    if (!isDefaultScene) defaultSceneCache.clear();
    const p = clone(h.defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: prim, params: clone(prim === 'box' ? BOX : SPHERE),
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    if (opt.second) {
      p.objects.push({
        id: 'o2', name: 's2', primitive: 'sphere', params: clone(SPHERE),
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
      paths, hash: md5(paths), n: paths.length, ink: inkOf(paths), dup: dupCount(paths), out,
      pens: Array.from(new Set(out.map((pth) => (pth.meta && pth.meta.penId) || ''))).sort(),
    };
    if (isDefaultScene) {
      const outputDigest = sha256({ paths, out });
      if (defaultSceneSnapshots.has(cacheKey)) {
        expect(outputDigest, `${cacheKey}: a default scene drew differently after other renders`).toBe(defaultSceneSnapshots.get(cacheKey));
      } else {
        defaultSceneSnapshots.set(cacheKey, outputDigest);
      }
      const cachedResult = freezeDeep({ ...result, out: clone(out) });
      defaultSceneCache.clear();
      defaultSceneCache.set(cacheKey, cachedResult);
    }
    return result;
  };
  return h;
};

module.exports = { BOUNDS, SUN, lenOf, useFillFixture };
