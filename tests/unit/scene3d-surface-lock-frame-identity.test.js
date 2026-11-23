const crypto = require('crypto');
const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// Byte-identity witness for the Level S per-pose frame (U1). The sha256 of the FULL-PRECISION output (points and meta, no
// rounding) of 30 rotation poses plus every deterministic SL.stats counter are pinned from the tree before the speed-ups
// (back-face block skip, typed-array crowd guard). Any speed-up of sceneFrame must leave them unchanged. Timing counters
// (ms*) and cache-size counters are excluded; counters added by later work (prepassProjected) are not part of the pin.
const COUNTERS = ['sceneFrames', 'frames', 'sceneFallbacks', 'bakeMisses', 'toneEvals', 'verticesIn', 'verticesOut', 'runsIn', 'runsOut',
  'culledFacing', 'culledGrazing', 'culledTone', 'culledOccluded', 'toneRemapPow'];
// glintFast (the count of specular-keep calls that returned early) is a WORK counter, not an identity one: U1d skips the specular call for
// vertices of statically tone-dead runs, so it drops by design (Duty Cycle sphere 504962 -> 324452) while the hash and all counters above
// stay equal. It is therefore no longer pinned; scene3d-surface-lock-tone-bound.test.js proves the skip cannot change the output.
const POSES = 30;

// Object ids are random uuids per scene build: they are replaced by their order of first appearance so the hash is stable.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const hashPaths = (h, paths, ids) => {
  const json = JSON.stringify((paths || []).map((p) => ({ p: Array.isArray(p) ? p.map((pt) => [pt.x, pt.y]) : null, m: p && p.meta ? p.meta : null })));
  h.update(json.replace(UUID, (u) => { if (!ids.has(u)) ids.set(u, `id${ids.size}`); return ids.get(u); }));
};

const PINS = {
  // Re-pinned after U5 (V2_DUTY_SEP 1.0, V2_SCRIB_KEY 0.92 -- an intended Duty Cycle v2 look change; bake v6). Evidence: with the two
  // constants set back to 1.08 / 1.0 the previous pin (sha 39735090...) reproduced exactly, so U5 is the only cause of the change.
  dutyCycleSphere: {"sha":"2e7f5e70a59540091e6a5c79ce99cf4dcbc6b4b294627f467f17084a3db4addd","counters":{"sceneFrames":29,"frames":29,"sceneFallbacks":0,"bakeMisses":0,"toneEvals":14458,"verticesIn":1114528,"verticesOut":100418,"runsIn":557264,"runsOut":15852,"culledFacing":552076,"culledGrazing":43313,"culledTone":318510,"culledOccluded":62,"toneRemapPow":0}},
  defaultSphere: {"sha":"e2eadcb05c81ae93720d2b681707c881da6be824a4017a8e53fbcf0afaded82b","counters":{"sceneFrames":29,"frames":29,"sceneFallbacks":0,"bakeMisses":0,"toneEvals":21639,"verticesIn":1698936,"verticesOut":124066,"runsIn":27028,"runsOut":2879,"culledFacing":845741,"culledGrazing":65732,"culledTone":666545,"culledOccluded":62,"toneRemapPow":0}},
  twoObjects: {"sha":"967294a47b8fde0911f6665be61acab8c080a55ccb75e2e346393077af0cb457","counters":{"sceneFrames":29,"frames":58,"sceneFallbacks":0,"bakeMisses":0,"toneEvals":36023,"verticesIn":2950344,"verticesOut":227869,"runsIn":68962,"runsOut":6372,"culledFacing":1478637,"culledGrazing":72924,"culledTone":1174363,"culledOccluded":47112,"toneRemapPow":0}},
};

describe('SurfaceLock sceneFrame byte-identity witness (U1)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; }, 120000);
  afterAll(() => rt && rt.cleanup());

  const run = (opts, receive, setup) => {
    const s = buildSurfaceLockScene(V, { ...opts, markSpace: 'surface', mapper: 'hatch' });
    if (receive) s.group.params.shadow = Object.assign({}, s.group.params.shadow, { shadowReceiveOnObjects: true });
    s.composeFull();
    if (setup) setup();
    const h = crypto.createHash('sha256'); const ids = new Map();
    SL.resetStats();
    for (let i = 0; i < POSES; i++) { s.setPose({ camYaw: -30 + i * 5, camPitch: 20 }); hashPaths(h, s.composePreview(), ids); }
    const counters = {}; COUNTERS.forEach((k) => { counters[k] = SL.stats[k]; });
    return { sha: h.digest('hex'), counters, projected: SL.stats.prepassProjected };
  };

  const CASES = {
    dutyCycleSphere: () => run({ kind: 'sphere', style: { toneLaw: 'dutyConst' } }),
    defaultSphere: () => run({ kind: 'sphere' }),
    twoObjects: () => run({ kind: 'two' }, true),
  };

  Object.keys(CASES).forEach((name) => {
    it(`${name}: 30-pose output hash and stats counters are pinned`, () => {
      const got = CASES[name]();
      if (process.env.PIN_PRINT) console.log(`PIN ${name} ${JSON.stringify(got)}`); // eslint-disable-line no-console
      expect(PINS[name]).toBeTruthy();
      expect({ sha: got.sha, counters: got.counters }).toEqual(PINS[name]);
    }, 120000);
  });

  // U1a: the prepass projects only the blocks that can face the camera. Orthographic Duty Cycle sphere: about half the surface is
  // back-facing, so at most 60 % of the vertices the frame visits are projected (without the skip it is every one: 1.0).
  it('Duty Cycle sphere (orthographic): the prepass projects at most 60% of the vertices the frame visits', () => {
    const got = CASES.dutyCycleSphere();
    expect(got.counters.verticesIn).toBeGreaterThan(0);
    expect(got.projected).toBeGreaterThan(0);
    expect(got.projected).toBeLessThanOrEqual(0.6 * got.counters.verticesIn);
  }, 120000);

  // Mutation proof: a skip that is over-eager (a margin that also skips blocks that still face the camera) changes the witness hash,
  // and the exact margin does not. Guards the "exact, never approximate" claim of the block skip.
  it('an over-eager block skip changes the output hash (mutation proof); disabling it reproduces the pin', () => {
    const was = { ...SL.blockSkip };
    try {
      SL.blockSkip.marginRad = -0.6; // skips blocks whose normals still turn up to 0.6 rad toward the camera
      const bad = run({ kind: 'sphere', style: { toneLaw: 'dutyConst' } });
      expect(bad.sha).not.toBe(PINS.dutyCycleSphere.sha);
      SL.blockSkip.marginRad = was.marginRad; SL.blockSkip.enabled = false;
      const off = run({ kind: 'sphere', style: { toneLaw: 'dutyConst' } });
      expect(off.sha).toBe(PINS.dutyCycleSphere.sha);
      expect(off.projected).toBe(off.counters.verticesIn);
    } finally { Object.assign(SL.blockSkip, was); }
  }, 120000);
});
