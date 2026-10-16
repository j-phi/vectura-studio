const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U4b item 9 — SEED HONESTY.
 *
 * The Seed field and RANDOMIZE sit on every 3D layer, but most fills have no
 * random site. `Params.styleUsesSeed` / `sceneUsesSeed` say which do, so the
 * panel can grey the field when nothing in the scene draws from it. The tables
 * behind them were MEASURED (seed 11 vs 7777 on a seeded layer, every roster id
 * x every Type x a sphere and a box). This test re-measures a representative
 * sample against the engine, and pins the predicate's fail-open behaviour.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const md5 = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 10);

describe('Fill-style review U4b — Seed reach', () => {
  let runtime; let V; let algo; let defaults; let P;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ sceneSeedMode: 'seeded' });
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    P = V.Scene3D.Params;
  }, 120000);
  afterAll(() => runtime.cleanup());

  const sceneFor = (prim, mapper, params, seed) => {
    const p = clone(defaults);
    const pp = prim === 'sphere' ? { radius: 40, detail: 14 } : { sx: 60, sy: 60, sz: 60 };
    p.objects = [{
      id: 'o1', name: 's', primitive: prim, params: pp,
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 30, ...params } }, byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ ...SUN }];
    p.seed = seed; p.seedMode = 'seeded';
    return p;
  };
  const hashOf = (p) => md5((algo.generate(p, null, null, BOUNDS) || []).map((q) => (q.points || q).map((z) => [Math.round(z.x * 1000), Math.round(z.y * 1000)])));
  const measuredLive = (prim, mapper, params) => hashOf(sceneFor(prim, mapper, params, 11)) !== hashOf(sceneFor(prim, mapper, params, 7777));

  const SAMPLE = [
    ['sphere', 'hatch', { toneLaw: 'ladder' }],
    ['sphere', 'hatch', { toneLaw: 'etfKang' }],
    ['sphere', 'crosshatch', { toneLaw: 'contFieldSigmoid' }],
    ['sphere', 'hatch', { toneLaw: 'voronoiWeb' }],
    ['sphere', 'stipple', { toneLaw: 'ladder' }],
    ['sphere', 'hatch', { toneLaw: 'ladder', wobble: 50 }],
    ['box', 'hatch', { toneLaw: 'ladder' }],
    ['box', 'hatch', { toneLaw: 'mezzoRegion' }],
    ['box', 'stipple', { toneLaw: 'ladder' }],
  ];

  it('the predicate agrees with the engine on a measured sample (both directions)', () => {
    const rows = SAMPLE.map(([prim, mapper, params]) => ({
      label: `${prim}/${mapper}/${params.toneLaw}${params.wobble ? '+wobble' : ''}`,
      predicted: P.styleUsesSeed(prim, { mapper, params }),
      measured: measuredLive(prim, mapper, params),
    }));
    expect(rows.filter((r) => r.predicted !== r.measured)).toEqual([]);
    // The sample covers both answers, so the check cannot pass vacuously.
    expect(rows.some((r) => r.measured)).toBe(true);
    expect(rows.some((r) => !r.measured)).toBe(true);
  });

  it('fails open: an unknown shape, Type or law counts as live', () => {
    expect(P.styleUsesSeed('solid', { mapper: 'hatch', params: { toneLaw: 'ladder' } })).toBe(true);
    expect(P.styleUsesSeed('pyramid', { mapper: 'hatch', params: { toneLaw: 'ladder' } })).toBe(true);
    // An unknown law id renders as Ladder (the engine's own fallback), so it is as dead as Ladder.
    expect(P.styleUsesSeed('sphere', { mapper: 'hatch', params: { toneLaw: 'noSuchLaw' } })).toBe(false);
    expect(P.styleUsesSeed('sphere', { mapper: 'stipple', params: { toneLaw: 'noSuchLaw' } })).toBe(true);
    expect(P.styleUsesSeed('sphere', { mapper: 'hatch', params: { toneLaw: 'ladder', highlightTreatment: 'sparse' } })).toBe(true);
    expect(P.styleUsesSeed('sphere', { mapper: 'wireframe', params: {} })).toBe(false);
    expect(P.styleUsesSeed('sphere', { mapper: 'wireframe', params: { overstroke: true } })).toBe(true);
  });

  it('a scene is dead only when EVERY object style is dead and shadows are plain', () => {
    const obj = (id, primitive) => ({ id, primitive });
    const table = (scene, byObject = {}, byFace = {}) => ({ scene, byObject, byFace });
    const ladder = { mapper: 'hatch', params: { toneLaw: 'ladder' } };
    const stipple = { mapper: 'stipple', params: { toneLaw: 'ladder' } };
    const base = { lights: [{ type: 'directional', castShadows: true }], ground: { enabled: true } };
    expect(P.sceneUsesSeed({ ...base, objects: [obj('a', 'sphere')], styleTable: table(ladder) })).toBe(false);
    // One live object style keeps the field live.
    expect(P.sceneUsesSeed({ ...base, objects: [obj('a', 'sphere'), obj('b', 'box')], styleTable: table(ladder, { b: stipple }) })).toBe(true);
    // A per-face override is read too.
    expect(P.sceneUsesSeed({ ...base, objects: [obj('a', 'box')], styleTable: table(ladder, {}, { 'a/f1': stipple }) })).toBe(true);
    // Shadow layers / a non-default shadow law are not measured, so they count as live.
    expect(P.sceneUsesSeed({ ...base, shadow: { shadowLayers: true }, objects: [obj('a', 'sphere')], styleTable: table(ladder) })).toBe(true);
    // No objects, or no cascade to read: live.
    expect(P.sceneUsesSeed({ ...base, objects: [], styleTable: table(ladder) })).toBe(true);
  });

  it('the shipped default scene (hatch sphere, ground, sun) is dead — the case the review found', () => {
    const p = clone(defaults);
    expect(P.sceneUsesSeed({
      objects: p.objects, styleTable: p.styleTable, lights: p.lights, ground: p.ground, shadow: p.shadow,
    })).toBe(false);
    p.seedMode = 'seeded';
    const a = clone(p); a.seed = 11;
    const b = clone(p); b.seed = 7777;
    expect(hashOf(a)).toBe(hashOf(b));
  });
});
