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

  // U9 (resolve half, docs/3d-audit/lane-reports/W-22-24-W-18-plan.md §U9).
  // `fineLadder` is a FOLDED id (src/config/scene3d-tone-laws.js ALIASES ->
  // survivor 'ladder'), but it is still a full member of the 48-id engine
  // vocabulary (IDS) and `HATCH_LAW_RECIPES.fineLadder` (shadows.js) has its
  // OWN recipe (spacing x0.97) distinct from the plain 'ladder' fallback
  // (hatchRingsEvenOdd, no recipe). A saved scene that still carries the raw
  // pre-collapse value 'fineLadder' in `shadow.shadowToneLaw` must keep
  // rendering fineLadder's own recipe — not fall through to plain hatch just
  // because the picker-tier collapse folded it under 'ladder' for the UI.
  // RED at 8610fd66+ (post-U1): the ALIASES shim rewrites 'fineLadder' to
  // 'ladder' before shadows.js ever sees it, so this collapses to the plain
  // fallback and the two signatures are IDENTICAL.
  test('HEADLINE (U9) — shadowToneLaw:"fineLadder" (a folded id) still renders its OWN recipe, not the plain-hatch fallback', () => {
    const plainLadder = buildShadows({ shadowToneLaw: 'ladder' });
    const fineLadder = buildShadows({ shadowToneLaw: 'fineLadder' });
    expect(sPaths(fineLadder).length).toBeGreaterThan(0);
    expect(geomSignature(fineLadder)).not.toBe(geomSignature(plainLadder));
  });

  // U9-2 (docs/3d-audit/lane-reports/U9-review.md, follow-up 2; bar shape
  // precedent: W-26b-3/C3, LEDGER.md 0930cb2d "floor+band shape adopted as
  // prescribed"). The HEADLINE test above proves fineLadder's geomSignature
  // DIFFERS from plain ladder's — an exact-coordinate inequality — but that
  // check cannot fail "a little"; a future regression that quietly re-routes
  // 'fineLadder' back through the plain hatch fallback while ALSO nudging one
  // coordinate a hair (so the strings still differ) would slip past it. This
  // guard pins the actual MAGNITUDE of the effect on shadowPathCount, so a
  // silent re-collapse toward the plain fallback (which would shrink the
  // delta toward 0) fails a committed bar, not just a hand-run script (the
  // U9 review's own numeric delta — u9-shadow-resolve-evidence.js's 147->151,
  // +2.72% — had no bar of its own; this closes that gap).
  //
  // FLOOR: an 11-point drift sweep around this exact fixture (box size +-2,
  // sun azimuth/elevation +-2 deg, camera pitch +-2 deg — all unrelated to
  // the fill recipe) measured 2026-09-08 gave shadowPathCount deltas of
  // 2-4 paths (2.52%-3.64%) purely from those perturbations. The floor sits
  // BELOW that whole envelope (at 1) so ordinary drift/noise never trips it,
  // while a genuine re-collapse to the plain fallback (deltaAbs === 0, the
  // mutation proven below) fails it every time.
  //
  // BAND: this fixture is deterministic (see the "determinism" test above),
  // so the exact counts are pinned directly, and the delta is additionally
  // checked against a +-10% fingerprint band around the measured baseline
  // (4 paths) — a tighter, second independent check on the same quantity.
  test('U9-2 — folded-id shadow recipe delta on shadowPathCount has a floor + fingerprint band (guards against silent re-collapse to the plain fallback)', () => {
    const ladderCount = sPaths(buildShadows({ shadowToneLaw: 'ladder' })).length;
    const fineCount = sPaths(buildShadows({ shadowToneLaw: 'fineLadder' })).length;
    const deltaAbs = fineCount - ladderCount;

    // Baseline pin — deterministic on this fixed fixture.
    expect(ladderCount).toBe(116);
    expect(fineCount).toBe(120);

    // FLOOR — below the measured 2-4 drift envelope, above the mutation's 0.
    expect(deltaAbs).toBeGreaterThan(1);

    // BAND — +-10% around the measured baseline delta of 4 paths.
    expect(deltaAbs).toBeGreaterThanOrEqual(4 * 0.9);
    expect(deltaAbs).toBeLessThanOrEqual(4 * 1.1);
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

  // U9 (resolve half) — a FOLDED id (a key of ALIASES) is already the correct
  // INTERNAL id for the shadow recipe dispatch (shadows.js HATCH_LAW_RECIPES
  // is keyed by it directly); the shadow bag has no sibling sub-control field
  // to carry the collapse param separately (unlike style.params, which gets
  // one from normalizeStyle's migration shim), so collapsing it to the
  // survivor here — as the shared clampStyleParam('toneLaw') ALIASES branch
  // used to for every caller — silently loses which recipe to draw. Must
  // survive normalization unchanged, exactly like any other real roster id.
  // Needs the roster loaded WITH `ALIASES` (unlike the plain-id test above,
  // which is roster-agnostic) — a bare `IDS`-only roster (as the sibling
  // "roster IS loaded" test below uses) can't reproduce this: the collapse
  // only fires when `ALIASES[value]` resolves.
  test('U9 — a FOLDED id (e.g. "fineLadder") survives normalization unchanged, not collapsed to its survivor', () => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const prior = globalScope.Vectura.SCENE3D_TONE_LAWS;
    globalScope.Vectura.SCENE3D_TONE_LAWS = {
      IDS: ['ladder', 'fineLadder', 'phaseFineLadder', 'bundleCount', 'bundleDither', 'penCross', 'none'],
      DEFAULT: 'ladder',
      ALIASES: {
        fineLadder: { into: 'ladder', params: { rungMode: 'fine' } },
        phaseFineLadder: { into: 'ladder', params: { rungMode: 'finePhase' } },
        bundleDither: { into: 'bundleCount', params: { bundleMode: 'dither' } },
      },
    };
    try {
      expect(shadowOf({ shadowToneLaw: 'fineLadder' }).shadowToneLaw).toBe('fineLadder');
      expect(shadowOf({ shadowToneLaw: 'phaseFineLadder' }).shadowToneLaw).toBe('phaseFineLadder');
      expect(shadowOf({ shadowToneLaw: 'bundleDither' }).shadowToneLaw).toBe('bundleDither');
    } finally {
      globalScope.Vectura.SCENE3D_TONE_LAWS = prior;
    }
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
