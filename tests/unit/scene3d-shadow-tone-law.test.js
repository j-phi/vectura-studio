const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — Fill Style (tone-law mark class) on cast-shadow hatch
 * (fs-c2-shadow Job 1).
 *
 * Face fills carry a Fill Style / tone-law picker (`style.params.toneLaw`,
 * 47 ids grouped into 8 perceptual mark classes — src/config/context-bar.js:
 * 94-141). Shadows had no such concept: `grep toneLaw|markClass shadows.js`
 * returned nothing, so a scene's shadow always drew one family of parallel
 * rulings no matter what toneLaw said elsewhere. `shadowToneLaw` (params.js
 * DEFAULT_SHADOW, default 'ladder') closes that gap.
 *
 * HEADLINE regression target: the emitted shadow paths must actually DIFFER
 * between two tone laws whose mark classes are judged applicable — identical
 * output would mean the param is accepted and silently ignored, which is the
 * exact bug class this batch exists to fix.
 *
 * These tests FAIL against the pre-change shadows.js (no `toneLaw` read
 * anywhere in the shadow bag, no `Shadows.toneLawApplies` export).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 40) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows — shadowToneLaw (Fill Style on shadow hatch)', () => {
  let runtime;
  let V;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const buildShadows = (shadowBag) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects: [boxObj('obj-1', 0, 20, 40)],
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: shadowBag,
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 }); // no HLR occlusion — isolate the mark generator
    const dir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow });
  };

  const sPaths = (paths) => paths.filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
  // A signature that is insensitive to array/object key ORDER but sensitive to
  // actual point geometry — two runs with the same law must be identical, and
  // two runs with different (applicable) laws must not collapse to this.
  const geomSignature = (paths) => JSON.stringify(sPaths(paths).map((pp) => pp.map((pt) => [
    Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
  ])));

  test('HEADLINE — shadowToneLaw:"penCross" (cross) emits different geometry than "ladder" (hatch)', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const cross = buildShadows({ shadowToneLaw: 'penCross' });
    expect(sPaths(hatch).length).toBeGreaterThan(0);
    expect(sPaths(cross).length).toBeGreaterThan(0);
    expect(geomSignature(cross)).not.toBe(geomSignature(hatch));
  });

  test('shadowToneLaw:"mkDotScreen" (dot) emits different geometry than the default', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const dot = buildShadows({ shadowToneLaw: 'mkDotScreen' });
    expect(sPaths(dot).length).toBeGreaterThan(0);
    expect(geomSignature(dot)).not.toBe(geomSignature(hatch));
  });

  test('shadowToneLaw:"mkTick" (dash) emits different geometry than the default', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const dash = buildShadows({ shadowToneLaw: 'mkTick' });
    expect(sPaths(dash).length).toBeGreaterThan(0);
    expect(geomSignature(dash)).not.toBe(geomSignature(hatch));
  });

  test('shadowToneLaw:"mkScribble" (wave) emits different geometry than the default', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const wave = buildShadows({ shadowToneLaw: 'mkScribble' });
    expect(sPaths(wave).length).toBeGreaterThan(0);
    expect(geomSignature(wave)).not.toBe(geomSignature(hatch));
  });

  test('an EXCLUDED mark class (flow: "etfKang") falls back to plain hatch geometry, not silence', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const flow = buildShadows({ shadowToneLaw: 'etfKang' });
    expect(sPaths(flow).length).toBeGreaterThan(0);
    // Documented degrade: an inapplicable law renders as 'hatch', so this is
    // EXPECTED to match — the predicate (tested below) is what tells the UI
    // not to offer this id, not a geometry difference.
    expect(geomSignature(flow)).toBe(geomSignature(hatch));
  });

  test('an unknown shadowToneLaw id falls back to the default (ladder) hatch geometry', () => {
    const hatch = buildShadows({ shadowToneLaw: 'ladder' });
    const junk = buildShadows({ shadowToneLaw: 'totally-not-a-law' });
    expect(geomSignature(junk)).toBe(geomSignature(hatch));
  });

  test('determinism — identical shadowToneLaw regenerates byte-identical output', () => {
    const a = buildShadows({ shadowToneLaw: 'penCross', shadowAngle: 30 });
    const b = buildShadows({ shadowToneLaw: 'penCross', shadowAngle: 30 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('REGRESSION — the default shadowToneLaw reproduces the pre-toneLaw shadow output byte-identical', () => {
    const withDefault = buildShadows({});
    const explicitLadder = buildShadows({ shadowToneLaw: 'ladder' });
    expect(JSON.stringify(sPaths(withDefault))).toBe(JSON.stringify(sPaths(explicitLadder)));
  });

  describe('Shadows.toneLawApplies — the exported UI-gating predicate', () => {
    test('applicable classes: ref, hatch, cross, wave, dash, dot', () => {
      expect(Shadows.toneLawApplies('none')).toBe(true);       // ref
      expect(Shadows.toneLawApplies('ladder')).toBe(true);     // hatch (default entry)
      expect(Shadows.toneLawApplies('nibAngle')).toBe(true);   // hatch
      expect(Shadows.toneLawApplies('penCross')).toBe(true);   // cross
      expect(Shadows.toneLawApplies('mkScribble')).toBe(true); // wave
      expect(Shadows.toneLawApplies('mkTick')).toBe(true);     // dash
      expect(Shadows.toneLawApplies('mkDotScreen')).toBe(true); // dot
    });

    test('excluded classes: flow, web', () => {
      expect(Shadows.toneLawApplies('etfKang')).toBe(false);   // flow
      expect(Shadows.toneLawApplies('defectSplit')).toBe(false); // flow
      expect(Shadows.toneLawApplies('mazeFill')).toBe(false);  // web
      expect(Shadows.toneLawApplies('voronoiWeb')).toBe(false); // web
      expect(Shadows.toneLawApplies('turingStripe')).toBe(false); // web
    });

    test('an unknown id resolves through the "hatch" fallback and is applicable', () => {
      expect(Shadows.toneLawApplies('not-a-real-law-id')).toBe(true);
    });
  });

  // fs-z2 Cycle 2 — Fill Style "No Tone" (roster id 'none', the Stage-0
  // reference law) must disable the shadow tone gradient, not just pick a
  // mark class. Before the fix, 'none' at the default shadowToneDepth (0.75)
  // still rendered the full graded gradient — the Fill Style and the tone
  // depth control silently contradicted each other.
  describe('Fill Style "No Tone" gates the shadow tone gradient (fs-z2 Cycle 2)', () => {
    const summarize = geomSignature;

    test('Fill Style "No Tone" switches the shadow tone gradient OFF', () => {
      expect(summarize(buildShadows({ shadowToneLaw: 'none' })))
        .toBe(summarize(buildShadows({ shadowToneLaw: 'none', shadowToneDepth: 0 })));
    });

    test('...and the gate is doing real work — "No Tone" differs from the default law at the default depth', () => {
      expect(summarize(buildShadows({ shadowToneLaw: 'none' })))
        .not.toBe(summarize(buildShadows({ shadowToneLaw: 'ladder' })));
    });

    test('the Stage-0 id the gate names is still the roster\'s only "ref" law', () => {
      const ref = V.SCENE3D_TONE_LAWS.FAMILIES.find((f) => f.id === 'ref');
      expect(ref.laws).toEqual(['none']); // pins NO_TONE_LAW_ID against roster drift
    });
  });
});

/*
 * Params-level contract: `shadowToneLaw` normalization (params.js
 * DEFAULT_SHADOW + normalizeShadow). Required directly (bare node, module.
 * exports guard) — no runtime loader needed, mirrors scene3d-tone-law-
 * params.test.js's pattern for the sibling `style.params.toneLaw`.
 */
const Params = require('../../src/core/scene3d/params.js');

describe('Scene3D.Params — shadowToneLaw whitelist', () => {
  const shadowOf = (raw) => Params.normalizeShadow(raw);

  test('defaults to "ladder" when the shadow block is absent entirely', () => {
    expect(Params.normalizeShadow(undefined).shadowToneLaw).toBe('ladder');
  });

  test('defaults to "ladder" when shadow is present but shadowToneLaw is not', () => {
    expect(shadowOf({ shadowDensity: 70 }).shadowToneLaw).toBe('ladder');
  });

  test('a plausible law id survives normalization unchanged', () => {
    expect(shadowOf({ shadowToneLaw: 'penCross' }).shadowToneLaw).toBe('penCross');
    expect(shadowOf({ shadowToneLaw: 'mkDotScreen' }).shadowToneLaw).toBe('mkDotScreen');
  });

  // Non-string junk fails the `typeof value === 'string'` check regardless of
  // whether the roster is loaded — unlike an unknown STRING id, which this bare
  // require process cannot validate (see the next test): `Vectura.SCENE3D_
  // TONE_LAWS` is undefined here, and `clampStyleParam`'s existing 'toneLaw'
  // case (params.js:668-671, shared by this new field) accepts any string when
  // the roster is absent — exactly the documented behaviour the sibling
  // scene3d-tone-law-params.test.js pins for `style.params.toneLaw`.
  test('non-string junk values fall back to "ladder"', () => {
    expect(shadowOf({ shadowToneLaw: 42 }).shadowToneLaw).toBe('ladder');
    expect(shadowOf({ shadowToneLaw: null }).shadowToneLaw).toBe('ladder');
    expect(shadowOf({ shadowToneLaw: {} }).shadowToneLaw).toBe('ladder');
  });

  test('when the roster IS loaded, an unknown STRING id also falls back to "ladder"', () => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const prior = globalScope.Vectura.SCENE3D_TONE_LAWS;
    globalScope.Vectura.SCENE3D_TONE_LAWS = { IDS: ['ladder', 'penCross', 'none'] };
    try {
      expect(shadowOf({ shadowToneLaw: 'penCross' }).shadowToneLaw).toBe('penCross');
      expect(shadowOf({ shadowToneLaw: 'not-a-real-law' }).shadowToneLaw).toBe('ladder');
    } finally {
      globalScope.Vectura.SCENE3D_TONE_LAWS = prior;
    }
  });

  test('round-trips through the full normalizeParams -> object.shadow chain', () => {
    const p = Params.normalizeParams({ objects: [{ primitive: 'box' }], shadow: { shadowToneLaw: 'mkTick' } });
    expect(p.shadow.shadowToneLaw).toBe('mkTick');
  });
});
