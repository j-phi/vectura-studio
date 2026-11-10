const crypto = require('crypto');
const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

// SCENE3D_SURFACE_LOCK is the single table for the surface-lock bakers' tuning constants (contract: no module
// carries its own literal). Part 1 pins every baker's output to a fingerprint captured BEFORE the constants moved
// (the consolidation is behaviour-neutral). Part 2 is the witness that the bakers really read the table: a changed
// key changes the bake, which a module-local literal would ignore.

const SLOW = 120000;
const FINGERPRINTS = {
  // Ladder prints re-pinned after FX-L (shared level-change vertex, true bounds radius) and O3 (sepBarFrac, no minSepFrac).
  ladderHatch: 'c8e1e4bbdea84ff41344c4c51454142925c47f47',
  ladderStipple: '575f5b4b3315e4818f78478dba5f00510d5572de',
  ladderContour: '9b11ca1c20822af6865da8937e76d77b433bb60f',
  mezzo: '9cc03d444e397175bf2d785d4a51802901445e03',
  shadow: '3081b0a9de7f76b704f45c53efca6260579a79aa',
  visibility: 'ef33ad42952a971e66bf301834cf228875c5bcd6',
};

const canon = (v) => {
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}:${Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex')}`;
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { if (typeof v[k] !== 'function' && k !== 'msBake') o[k] = canon(v[k]); }); return o; }
  return v;
};
const fp = (v) => crypto.createHash('sha1').update(JSON.stringify(canon(v))).digest('hex');

const specOf = (o = {}) => ({
  objectId: 'o1', primitive: FIX.BALL.primitive, mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: undefined,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: FIX.BOUNDS.penWidth, scaleRef: 1,
  seed: { salt: 1, phase: 0, off: 0 }, ...o,
});
const SHADOW = { shadowAngle: 45, shadowDensity: 50, shadowToneDepth: 0.75, shadowFalloff: 0.5, shadowLayers: false, shadowToneLaw: 'ladder' };
const GROUND = { enabled: true, scaleX: 1, scaleZ: 1, width: 320, height: 220 };
const { BOUNDS, CAMERA, SUN } = FIX;
const T0 = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };

describe('SCENE3D_SURFACE_LOCK consolidation', () => {
  let rt; let V; let base;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; base = V.SCENE3D_SURFACE_LOCK; }, SLOW);
  afterAll(() => { if (V) V.SCENE3D_SURFACE_LOCK = base; if (rt) rt.cleanup(); });
  afterEach(() => { V.SCENE3D_SURFACE_LOCK = base; });

  const override = (patch) => {
    const next = { ...base };
    Object.keys(patch).forEach((k) => { next[k] = (patch[k] && typeof patch[k] === 'object') ? { ...(base[k] || {}), ...patch[k] } : patch[k]; });
    V.SCENE3D_SURFACE_LOCK = Object.freeze(next);
  };

  const bakers = {
    ladderHatch: () => V.Scene3D.SurfaceLockLadder.bake(specOf()),
    ladderStipple: () => V.Scene3D.SurfaceLockLadder.bake(specOf({ mapper: 'stipple' })),
    ladderContour: () => V.Scene3D.SurfaceLockLadder.bake(specOf({ mapper: 'contour' })),
    mezzo: () => V.Scene3D.SurfaceLockMezzo.bake(specOf({ toneLaw: 'mezzoRegion' })),
    shadow: () => { V.Scene3D.SurfaceLockShadow.clearCache(); return V.Scene3D.SurfaceLockShadow.bakeGround(GROUND, SHADOW, 0.3, 1); },
    visibility: () => {
      const Vis = V.Scene3D.SurfaceLockVisibility; const Scene = V.Scene3D.Scene; const Params = V.Scene3D.Params;
      const obj = { ...JSON.parse(JSON.stringify(FIX.BALL)), id: 'a', name: 'a', params: { ...FIX.BALL.params, radius: 20, detail: 26 }, transform: { ...T0 }, visibility: 'solid' };
      const raw = FIX.scene({ objects: [obj], camera: { ...CAMERA }, ground: { enabled: false }, lights: [SUN] })(V);
      const np = Params.normalizeParams(raw);
      const po = Scene.buildProjOpts(np.camera, BOUNDS);
      const pose = { cam: { yaw: np.camera.yaw, pitch: np.camera.pitch, roll: np.camera.roll, scale: po.scale, cx: po.centerX, cy: po.centerY, persp: Number.isFinite(po.focal), focal: po.focal || 0, dist: po.cameraDist || 0 }, obj: { ...T0 } };
      const bake = Vis.meshBake(np.objects[0]);
      const occ = Vis.occluder([bake], [pose]);
      return { bake, outline: Vis.outline(bake, pose, occ) };
    },
  };

  it.each(Object.keys(bakers))('%s output is byte-identical to the pre-consolidation fingerprint', (name) => {
    const got = fp(bakers[name]());
    expect(got).toBe(FINGERPRINTS[name]);
  }, SLOW);

  it.each([
    ['ladderHatch', { LADDER: { STEP_MM: 1.5 } }],
    ['ladderHatch', { ZOOM_HEADROOM: 3 }],
    ['ladderStipple', { LADDER: { DOT_COL_FILL: 0.5, DOT_SEGS: 3 } }],
    ['mezzo', { MEZZO: { STEP_SCREEN: 0.9 } }],
    ['mezzo', { PLOT_FLOOR_SLACK: 0.3, ZOOM_HEADROOM: 4 }],
    ['shadow', { SHADOW: { MAX_LINES: 7 } }],
    ['visibility', { VISIBILITY: { LIMB_MIN_POINTS: 20, LIMB_MAX_POINTS: 20 } }],
  ])('%s bake follows a changed config key %j', (name, patch) => {
    const before = fp(bakers[name]());
    override(patch);
    expect(fp(bakers[name]())).not.toBe(before);
  }, SLOW);
});
