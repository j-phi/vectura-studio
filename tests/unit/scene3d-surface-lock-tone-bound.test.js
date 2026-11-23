const crypto = require('crypto');
const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// U1d: static tone bound. A vertex's tone demand te is (p0 * sv * lut(I))^q times factors that can only lower it, so a run whose bound
// never beats its key can never draw. The prepass skips such a run and frameSet counts its vertices from the facing cosine alone.
// Everything observable must be unchanged: the output hash and every identity counter (the counters of the frame-identity witness
// except glintFast, which counts specular evaluations: skipping provably dead vertices skips those calls by design).
const IDENTITY = ['sceneFrames', 'frames', 'sceneFallbacks', 'toneEvals', 'verticesIn', 'verticesOut', 'runsIn', 'runsOut',
  'culledFacing', 'culledGrazing', 'culledTone', 'culledOccluded', 'toneRemapPow'];
const POSES = 30;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

describe('SurfaceLock static tone bound (U1d)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; }, 120000);
  afterAll(() => rt && rt.cleanup());

  // mid(i, s): optional change applied before pose i (zoom, object yaw)
  const run = (opts, { receive = false, mid = null } = {}) => {
    const s = buildSurfaceLockScene(V, { ...opts, markSpace: 'surface', mapper: 'hatch' });
    if (receive) s.group.params.shadow = Object.assign({}, s.group.params.shadow, { shadowReceiveOnObjects: true });
    s.composeFull();
    const h = crypto.createHash('sha256'); const ids = new Map();
    SL.resetStats();
    for (let i = 0; i < POSES; i++) {
      if (mid) mid(i, s);
      s.setPose({ camYaw: -30 + i * 5, camPitch: 20 });
      const paths = s.composePreview();
      h.update(JSON.stringify((paths || []).map((p) => ({ p: Array.isArray(p) ? p.map((pt) => [pt.x, pt.y]) : null, m: p && p.meta ? p.meta : null })))
        .replace(UUID, (u) => { if (!ids.has(u)) ids.set(u, `id${ids.size}`); return ids.get(u); }));
    }
    const counters = {}; IDENTITY.forEach((k) => { counters[k] = SL.stats[k]; });
    return { sha: h.digest('hex'), counters, projected: SL.stats.prepassProjected };
  };
  const withBound = (on, fn) => { const was = { ...SL.toneBound }; SL.toneBound.enabled = on; try { return fn(); } finally { Object.assign(SL.toneBound, was); } };
  const both = (opts, extra) => ({ off: withBound(false, () => run(opts, extra)), on: withBound(true, () => run(opts, extra)) });

  const DUTY = { kind: 'sphere', style: { toneLaw: 'dutyConst' } };

  it('Duty Cycle sphere: the output hash and every identity counter equal the path without the bound', () => {
    const { off, on } = both(DUTY);
    expect(on.sha).toBe(off.sha);
    expect(on.counters).toEqual(off.counters);
  }, 120000);

  it('default sphere and two objects: unchanged output and counters', () => {
    [[{ kind: 'sphere' }, {}], [{ kind: 'two' }, { receive: true }]].forEach(([opts, extra]) => {
      const { off, on } = both(opts, extra);
      expect(on.sha).toBe(off.sha);
      expect(on.counters).toEqual(off.counters);
    });
  }, 120000);

  it('a zoom change and an object turn between frames rebuild the bound: still identical', () => {
    const zoom = (i, s) => { if (i === 10) s.group.params.camera = { ...s.group.params.camera, zoom: 1.7 }; if (i === 20) s.group.params.camera = { ...s.group.params.camera, zoom: 0.8 }; };
    const turn = (i, s) => { if (i === 12) s.setPose({ objYaw: 70 }); };
    [zoom, turn].forEach((mid) => {
      const { off, on } = both(DUTY, { mid });
      expect(on.sha).toBe(off.sha);
      expect(on.counters).toEqual(off.counters);
    });
  }, 120000);

  // Counter-based RED: before U1d the prepass projected every vertex of a front-facing block (about 57 % of the vertices the frame
  // visits on this sphere); with the bound it projects the live runs only.
  it('Duty Cycle sphere: the prepass projects at most 42% of the vertices the frame visits', () => {
    const { off, on } = both(DUTY);
    expect(on.projected).toBeGreaterThan(0);
    expect(on.projected).toBeLessThanOrEqual(0.42 * on.counters.verticesIn);
    expect(on.projected).toBeLessThan(0.8 * off.projected);
  }, 120000);

  // Mutation proof: a bound that is too tight (slack < 1 declares runs dead that still draw) changes the output.
  it('an over-tight bound changes the output hash (mutation proof); the exact slack reproduces the no-bound output', () => {
    const was = { ...SL.toneBound };
    try {
      const ref = withBound(false, () => run(DUTY));
      SL.toneBound.slack = 0.45;
      const bad = run(DUTY);
      expect(bad.sha).not.toBe(ref.sha);
      SL.toneBound.slack = was.slack;
      const ok = run(DUTY);
      expect(ok.sha).toBe(ref.sha);
      expect(ok.counters).toEqual(ref.counters);
    } finally { Object.assign(SL.toneBound, was); }
  }, 120000);
});
