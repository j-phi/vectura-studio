const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * TONE LAW PLUMBING — style.params.toneLaw/toneQuantLevels/toneFlowMode must
 * reach SurfaceFill.buildObject on the SurfaceFill.buildObject({ … }) call at
 * scene3d.js's curved-chart path (Unit 4 of the tone-law integration plan).
 *
 * Wave 1 (already landed) gave buildObject a per-call TONE_ALGO shadow keyed
 * off `opts.toneLaw`, and params.js a whitelist for the three keys. Nothing
 * before this unit actually READ `sp.toneLaw` inside scene3d.js and handed it
 * to buildObject — the wire itself was missing. This test pins that wire:
 *
 *   1. scene3d.js forwards toneLaw / toneQuantLevels / toneFlowMode verbatim
 *      (no scene3d-side clamping — buildObject owns validation).
 *   2. An absent sp.toneLaw leaves buildObject on its own committed default
 *      (byte-identical output to explicitly asking for 'ladder').
 *   3. A non-default, non-'none' law actually changes the composed ink
 *      (`meta.kind === 'sceneFill'` paths) versus the default law, end to end
 *      through algo.generate — not just the options bag.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SPHERE = { radius: 40, detail: 20 };

describe('Scene3D — toneLaw plumbed from style to SurfaceFill.buildObject', () => {
  let runtime; let V; let algo; let defaults; let SurfaceFill;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SurfaceFill = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  const scene = (styleParams, opts) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'sphere', params: clone(SPHERE),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: Boolean(opts && opts.toneOn) };
    if (opts && opts.toneOn) {
      p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
    }
    return p;
  };
  const fills = (p) => (algo.generate(p, null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const geomKey = (paths) => paths
    .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';')).join('|');

  test('scene3d.js threads toneLaw / toneQuantLevels / toneFlowMode into buildObject verbatim', () => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => { seen.push(o); return real(o); };
    try {
      const p = scene({ toneLaw: 'nibAngle', toneQuantLevels: 200, toneFlowMode: 'grad' });
      algo.generate(p, null, null, BOUNDS);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[0].toneLaw).toBe('nibAngle');
      expect(seen[0].toneQuantLevels).toBe(200);
      expect(seen[0].toneFlowMode).toBe('grad');
    } finally {
      SurfaceFill.buildObject = real;
    }
  });

  test('an absent toneLaw hands buildObject undefined (no scene3d-side clamping/default)', () => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => { seen.push(o); return real(o); };
    try {
      algo.generate(scene({}), null, null, BOUNDS);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[0].toneLaw).toBeUndefined();
      expect(seen[0].toneQuantLevels).toBeUndefined();
      expect(seen[0].toneFlowMode).toBeUndefined();
    } finally {
      SurfaceFill.buildObject = real;
    }
  });

  test('an absent toneLaw resolves inside buildObject to the SAME output as an explicit "ladder"', () => {
    const bare = fills(scene({}, { toneOn: true }));
    const explicit = fills(scene({ toneLaw: 'ladder' }, { toneOn: true }));
    expect(bare.length).toBeGreaterThan(0);
    expect(geomKey(explicit)).toBe(geomKey(bare));
  });

  test('a non-default toneLaw changes the composed scene ink (end to end through algo.generate)', () => {
    const ladder = fills(scene({ toneLaw: 'ladder' }, { toneOn: true }));
    const nibAngle = fills(scene({ toneLaw: 'nibAngle' }, { toneOn: true }));
    expect(ladder.length).toBeGreaterThan(0);
    expect(nibAngle.length).toBeGreaterThan(0);
    expect(geomKey(nibAngle)).not.toBe(geomKey(ladder));
  });

  test('an unknown toneLaw degrades to the default rather than throwing or drawing nothing', () => {
    const ladder = fills(scene({ toneLaw: 'ladder' }, { toneOn: true }));
    const bogus = fills(scene({ toneLaw: 'totallyBogusLawName' }, { toneOn: true }));
    expect(bogus.length).toBeGreaterThan(0);
    expect(geomKey(bogus)).toBe(geomKey(ladder));
  });
});
