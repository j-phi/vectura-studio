const {
  loadScene3dAuditRuntime, clone, freezeDeep, cloneFixture, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW, describeSingleParamCluster, describeComboCluster,
  recordedShadowResolvesToSurvivor,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part B: U0-U6 single-param / combo clusters (see tests/audit/scene3d-tone-law-collapse-*.test.js siblings).

/*
 * FILL-ROSTER COLLAPSE — U0 (foundation unit).
 * docs/3d-audit/lane-reports/W-22-24-W-18-plan.md is the governing plan;
 * this file is its U0 RGR proof.
 *
 * U0 ships the resolver (`Vectura.Scene3D.Params.resolveToneLaw`), the
 * migration shim (`normalizeStyle`'s alias rewrite + `clampStyleParam`'s
 * belt-and-brace single-key mapping), the picker plumbing
 * (`SCENE_FILL_STYLES.groups`/`resolve`/`styleParams`), and the generic
 * data-driven sub-control the docked panel + ctxbar flyout both render off
 * `Vectura.SCENE3D_TONE_LAWS.STYLE_PARAMS` — with an EMPTY `COLLAPSE` table
 * in `scripts/build-tone-laws.js`. That emptiness is the point: every
 * assertion below proves the new machinery is a byte-identical no-op when
 * nothing has been folded yet. U1-U8 each add one `COLLAPSE` row (their own
 * audit cluster) and their own cases to this file.
 *
 * RED proof (pre-U0 tree, pasted into the U0 impl report, not re-asserted
 * here as an inverted expectation — the committed file always reflects the
 * GREEN state): `Vectura.SCENE3D_TONE_LAWS.ALIASES` / `PICKER_IDS` /
 * `STYLE_PARAMS` are `undefined`, and `Vectura.Scene3D.Params.resolveToneLaw`
 * is not a function — verified by stashing this unit's implementation files
 * (build script + generated config + params.js + scene3d.js + context-bar.js
 * + the two UI panel files) and running this suite against the bare test
 * file; every test below fails (most immediately, on
 * `expect(typeof Params.resolveToneLaw).toBe('function')` or on reading
 * `undefined.length`).
 */



describe('Scene3D tone-law collapse — U0 foundation', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params; let hatchOpts;

  // Same captured-opts harness `scene3d-tone-law-dispatch.test.js` uses: a
  // REAL `opts` bag `scene3d.js` builds for a chart-wrapped primitive,
  // captured by wrapping `buildObject` during one real `algo.generate` pass —
  // no hand-rolled projection/transform stand-in.
  const captureOpts = (mapper) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];

    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      const result = orig.call(this, opts);
      calls.push({ opts, result });
      return result;
    };
    try {
      algo.generate(p, null, null, BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    let best = calls[0];
    for (const c of calls) {
      if ((c.result || []).length > (best.result || []).length) best = c;
    }
    return best.opts;
  };

  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    hatchOpts = captureOpts('hatch');
  }, SLOW);
  afterAll(() => runtime.cleanup());

  const roster = () => runtime.window.Vectura.SCENE3D_TONE_LAWS;

  test('1. the engine vocabulary (IDS) is unchanged at 48 — the collapse never removes an id', () => {
    expect(roster().IDS.length).toBe(48);
  });

  // STALE ASSERTION UPDATE (U1): this test originally pinned the U0 EMPTY
  // table's literal state (PICKER_IDS === IDS, ALIASES === {}) as the no-op
  // proof. From U1 on the table is no longer empty by design — the
  // invariant that must hold FOREVER (empty or not) is
  // "PICKER_IDS ⊎ keys(ALIASES) === IDS", the same one the build script's
  // own throw enforces at generation time. Each unit's own describe block
  // (below) pins its own exact PICKER_IDS/ALIASES count.
  test('2. PICKER_IDS ∪ keys(ALIASES) === IDS exactly, disjoint — holds at every stage of the collapse, empty or not', () => {
    const R = roster();
    expect(Array.isArray(R.PICKER_IDS)).toBe(true);
    const aliasIds = Object.keys(R.ALIASES);
    // Disjoint.
    aliasIds.forEach((id) => expect(R.PICKER_IDS.indexOf(id)).toBe(-1));
    // U5 (M9a): an id that MOVED to a Type setting (originSpiral -> Spiral Centre: Glint)
    // is neither offered nor an alias; the three sets still tile the 48 ids.
    const union = new Set(R.PICKER_IDS.concat(aliasIds, Object.keys(R.MOVED || {})));
    expect(union.size).toBe(R.IDS.length);
    R.IDS.forEach((id) => expect(union.has(id)).toBe(true));
    // STYLE_PARAMS is the COLLAPSE table verbatim, keyed by survivor — every
    // survivor named by an alias's `into` must have a non-empty descriptor
    // list (§2.1's own throw enforces this at build time; re-verified live).
    aliasIds.forEach((id) => {
      const into = R.ALIASES[id].into;
      expect(Array.isArray(R.STYLE_PARAMS[into])).toBe(true);
      expect(R.STYLE_PARAMS[into].length).toBeGreaterThan(0);
    });
  });

  test('3. Params.resolveToneLaw is a function and is the identity for every id + every edge case', () => {
    expect(typeof Params.resolveToneLaw).toBe('function');
    const cases = [...roster().IDS, 'ladder', '', 'totallyBogusLawId'];
    cases.forEach((c) => {
      expect(Params.resolveToneLaw({ toneLaw: c })).toBe(c);
    });
    expect(Params.resolveToneLaw({ toneLaw: undefined })).toBeUndefined();
    expect(Params.resolveToneLaw(null)).toBeUndefined();
    expect(Params.resolveToneLaw({})).toBeUndefined();
  });

  // Every raw id is checked against the resolver above. Rendering that same
  // id on both sides adds no alias or migration evidence; forced-ladder
  // dispatch is covered by scene3d-tone-law-dispatch.test.js.

  // The real COLLAPSE table is empty in U0, so the shim/resolver mechanism
  // can only be proven with a SYNTHETIC alias — monkey-patching
  // ALIASES/STYLE_PARAMS for the duration of one test, restored in `finally`.
  test('6. migration shim (normalizeStyle): a synthetic alias resolves to survivor + param, never clobbering an explicit sibling', () => {
    const R = roster();
    const savedAliases = R.ALIASES;
    const savedStyleParams = R.STYLE_PARAMS;
    const savedEntries = R.ENTRIES;
    R.ALIASES = { syntheticFolded: { into: 'ladder', params: { rungMode: 'fine' } } };
    // U5: the resolver reads the survivor's ENTRIES (pattern -> law) from the live roster.
    R.ENTRIES = { ladder: [{ when: {}, law: 'ladder' }, { when: { rungMode: 'fine' }, law: 'syntheticFolded' }] };
    R.STYLE_PARAMS = {
      ladder: [{
        key: 'rungMode', label: 'Rung detail', default: 'coarse',
        options: [
          { value: 'coarse', label: 'Coarse', law: 'ladder' },
          { value: 'fine', label: 'Fine', law: 'syntheticFolded' },
        ],
      }],
    };
    try {
      const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'syntheticFolded' } });
      expect(out.params.toneLaw).toBe('ladder');
      expect(out.params.rungMode).toBe('fine');

      // Explicit sibling wins — the shim never overwrites a value the bag
      // already carries.
      const out2 = Params.normalizeStyle({
        mapper: 'hatch', params: { toneLaw: 'syntheticFolded', rungMode: 'coarse' },
      });
      expect(out2.params.toneLaw).toBe('ladder');
      expect(out2.params.rungMode).toBe('coarse');

      // resolveToneLaw: survivor+param -> the alias's internal id; the raw
      // alias id straight through (rule 2); the survivor alone (no active
      // sub-control, or an unrecognized value) -> the survivor's bare id.
      expect(Params.resolveToneLaw({ toneLaw: 'ladder', rungMode: 'fine' })).toBe('syntheticFolded');
      expect(Params.resolveToneLaw({ toneLaw: 'syntheticFolded' })).toBe('syntheticFolded');
      expect(Params.resolveToneLaw({ toneLaw: 'ladder' })).toBe('ladder');
      expect(Params.resolveToneLaw({ toneLaw: 'ladder', rungMode: 'bogus' })).toBe('ladder');
    } finally {
      R.ALIASES = savedAliases;
      R.STYLE_PARAMS = savedStyleParams;
      R.ENTRIES = savedEntries;
    }
  });

  // STALE ASSERTION UPDATE (U9, resolve half — docs/3d-audit/lane-reports/
  // W-22-24-W-18-plan.md §U9): this test originally pinned "the shadow bag
  // collapses a folded id to its survivor, same as style.params.toneLaw" as
  // the belt-and-brace behaviour. That was the U9 bug, not a feature: the
  // shadow bag has no sibling sub-control field to carry the collapsed
  // param (unlike `style.params`, which gets one from `normalizeStyle`'s
  // migration shim), so collapsing here silently loses which
  // `shadows.js` HATCH_LAW_RECIPES entry to draw — every scene saved with a
  // pre-collapse `shadowToneLaw` would render the wrong shadow texture. U9
  // fixed `normalizeShadow` to pass a folded id straight through instead
  // (still never warning — it is a KNOWN, valid id, not an unrecognized
  // one) — updated here with the same test number/scope rather than deleted.
  test('7. clampStyleParam belt-and-brace: the single-key shadowToneLaw path passes a folded id through UNCHANGED, without warning (U9)', () => {
    const R = roster();
    const savedAliases = R.ALIASES;
    R.ALIASES = { syntheticFolded: { into: 'ladder', params: { rungMode: 'fine' } } };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const shadow = Params.normalizeShadow({ shadowToneLaw: 'syntheticFolded' });
      expect(shadow.shadowToneLaw).toBe('syntheticFolded');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      R.ALIASES = savedAliases;
      warnSpy.mockRestore();
    }
  });

  // STALE ASSERTION UPDATE (U1): this test originally pinned the U0 EMPTY-
  // table state ("fineLadder resolves to itself, ladder has no sub-control")
  // as proof the mechanism was inert. U1 populates COLLAPSE.ladder, so both
  // of those are now real, intended behaviour changes, not regressions —
  // updated here with the same test number/scope rather than deleted.
  test('8. SCENE_FILL_STYLES.groups()/resolve()/styleParams() track the CURRENT collapse table (updated by every unit, U0 through U8)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const R = roster();
    const groups = FS.groups(null, null, null);
    const total = groups.reduce((acc, g) => acc + g.options.length, 0);
    // Picker-tier count: PICKER_IDS + the shipped default. PICKER_IDS ===
    // IDS until U1 folds its first 3 ids; from here it is the number that
    // actually moves.
    expect(total).toBe(R.PICKER_IDS.length + 1);
    // U1 (C-01) — fineLadder is now an alias into its survivor ladder.
    expect(FS.resolve('fineLadder')).toBe('ladder');
    expect(FS.styleParams('ladder').length).toBeGreaterThan(0);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U1 — C-01 · survivor `ladder` · param `rungMode`
 * docs/3d-audit/lane-reports/W-22-24-W-18-plan.md §1 "C-01 → U1" / §4
 * "U1-U8 — one cluster each (data-only)".
 *
 * Folded: fineLadder (rungMode:'fine'), phaseFineLadder ('finePhase'),
 * perceptualRamp ('perceptual'). Survivor's own bare option: coarse->ladder.
 *
 * RED (pre-U1 tree, `COLLAPSE = {}`): resolveToneLaw({toneLaw:'ladder',
 * rungMode:'fine'}) returned 'ladder' unchanged (STYLE_PARAMS.ladder was
 * absent) — rendering that bag through SurfaceFill.buildObject produced
 * ladder's OWN picture, not fineLadder's (705.1 vs 775.0 mm ink on
 * torus+hatch+med per the plan's own measurement) — a real, non-vacuous
 * divergence, not a typo. GREEN below (COLLAPSE.ladder now populated)
 * closes that gap by construction: both paths run SurfaceFill.buildObject
 * with the SAME resolved `toneLaw`, so equality is guaranteed, not merely
 * observed.
 *
 * Monotonicity — NOT asserted. The plan's own measurement is non-monotone:
 * ladder 705.1 -> fineLadder 775.0 -> phaseFineLadder 713.1 -> perceptualRamp
 * 687.8 mm ink on torus+hatch+med. `rungMode` ships as a labelled ENUM for
 * exactly this reason (Phase 2 / U10 is where a genuinely continuous
 * `rungFineness` replaces it, blocked on W-26).
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('Scene3D tone-law collapse — U1 (C-01, ladder/rungMode)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params; let hatchOpts;
  const FOLDED = [
    { id: 'fineLadder', rungMode: 'fine' },
    { id: 'phaseFineLadder', rungMode: 'finePhase' },
    { id: 'perceptualRamp', rungMode: 'perceptual' },
  ];

  const captureOpts = (mapper) => {
    const p = clone(runtime.window.Vectura.ALGO_DEFAULTS.scene3d);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      const result = orig.call(this, opts);
      calls.push({ opts, result });
      return result;
    };
    try {
      algo.generate(p, null, null, BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    let best = calls[0];
    for (const c of calls) {
      if ((c.result || []).length > (best.result || []).length) best = c;
    }
    return best.opts;
  };

  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    hatchOpts = captureOpts('hatch');
  }, SLOW);
  afterAll(() => runtime.cleanup());

  const roster = () => runtime.window.Vectura.SCENE3D_TONE_LAWS;

  // STALE ASSERTION UPDATE (U2): PICKER_IDS.length is one global counter,
  // not a per-cluster delta — hardcoding the CUMULATIVE total (45) here
  // stopped being true the moment U2 folded 2 more ids (-> 43). The single
  // authoritative "bump this number every unit" total now lives ONLY in
  // tests/unit/scene3d-tone-laws-config.test.js's cumulative test (per the
  // plan's own §5 instruction); this test keeps its RELATIVE claim — these
  // 3 specific ids left PICKER_IDS and IDS is unaffected — which stays true
  // forever regardless of how many OTHER clusters later units fold.
  test('the 3 folded ids leave PICKER_IDS but stay in IDS (48, unaffected forever)', () => {
    const R = roster();
    expect(R.IDS.length).toBe(48);
    FOLDED.forEach(({ id }) => {
      expect(R.IDS.indexOf(id)).not.toBe(-1);
      expect(R.PICKER_IDS.indexOf(id)).toBe(-1);
    });
  });

  test('ALIASES: every folded id maps into survivor "ladder" with the exact rungMode patch', () => {
    const R = roster();
    FOLDED.forEach(({ id, rungMode }) => {
      expect(R.ALIASES[id]).toEqual({ into: 'ladder', params: { rungMode } });
    });
  });

  test('byte-identity: survivor+rungMode renders identically to the legacy folded id, for all 3', () => {
    FOLDED.forEach(({ id, rungMode }) => {
      const resolved = Params.resolveToneLaw({ toneLaw: 'ladder', rungMode });
      expect(resolved).toBe(id); // the resolver reaches the exact legacy internal id
      const viaSurvivor = SF.buildObject({ ...hatchOpts, toneLaw: resolved });
      const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
      expect(JSON.stringify(viaSurvivor)).toBe(JSON.stringify(viaLegacy));
    });
    // The bare survivor (coarse, the default) is untouched and still IS
    // ladder's own law, not an alias.
    expect(Params.resolveToneLaw({ toneLaw: 'ladder', rungMode: 'coarse' })).toBe('ladder');
    expect(Params.resolveToneLaw({ toneLaw: 'ladder' })).toBe('ladder');
  });

  test('mark class and Stroke Fill eligibility are constant across the cluster (§2.4 invariant)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const SFS = runtime.window.Vectura.STROKE_FILL_STYLES;
    FOLDED.forEach(({ id }) => {
      expect(FS.markClass(id)).toBe(FS.markClass('ladder'));
      expect(SFS.RIBBON_LAWS.indexOf(id) !== -1).toBe(SFS.RIBBON_LAWS.indexOf('ladder') !== -1);
      expect(SFS.PEN_LAWS.indexOf(id) !== -1).toBe(SFS.PEN_LAWS.indexOf('ladder') !== -1);
    });
  });

  test('migration: a style bag naming the folded id normalizes to survivor + param, byte-identical, never clobbering an explicit sibling', () => {
    FOLDED.forEach(({ id, rungMode }) => {
      const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } });
      expect(out.params.toneLaw).toBe('ladder');
      expect(out.params.rungMode).toBe(rungMode);
      const viaMigrated = SF.buildObject({ ...hatchOpts, toneLaw: Params.resolveToneLaw({ toneLaw: out.params.toneLaw, rungMode: out.params.rungMode }) });
      const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
      expect(JSON.stringify(viaMigrated)).toBe(JSON.stringify(viaLegacy));

      // An explicit sibling already in the bag is never overwritten.
      const out2 = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id, rungMode: 'coarse' } });
      expect(out2.params.toneLaw).toBe('ladder');
      expect(out2.params.rungMode).toBe('coarse');
    });
  });

  // STALE ASSERTION UPDATE (U9, resolve half) — see the U0 test 7 comment
  // above for the full reasoning: the shadow bag has no sibling sub-control
  // field, so collapsing a folded `shadowToneLaw` to its survivor silently
  // loses which shadows.js HATCH_LAW_RECIPES entry to draw. U9 fixed
  // `normalizeShadow` to pass a folded id through unchanged instead.
  test('clampStyleParam belt-and-brace: shadowToneLaw carrying a folded id passes through UNCHANGED, never warns (U9)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      FOLDED.forEach(({ id }) => {
        const shadow = Params.normalizeShadow({ shadowToneLaw: id });
        expect(shadow.shadowToneLaw).toBe(id);
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('picker round-trip: resolve()/entry() still answer for a folded id', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    FOLDED.forEach(({ id }) => {
      expect(FS.resolve(id)).toBe('ladder');
      expect(FS.entry(id)).toBeTruthy(); // BY_ID still carries the folded id forever
    });
  });

  test('a saved .vectura naming a folded toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect', () => {
    const sanitized = Params.sanitizeSceneParams({
      objects: [{ id: 'obj-1', primitive: 'sphere', params: { radius: 30 } }],
      styleTable: {
        scene: { mapper: 'hatch', params: {} },
        byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: 'fineLadder' } } },
        byFace: {},
      },
    });
    expect(sanitized.sceneVersion).toBe(5); // no SCENE_VERSION bump — see plan §2.3
    const migrated = sanitized.styleTable.byObject['obj-1'].params;
    expect(migrated.toneLaw).toBe('ladder');
    expect(migrated.rungMode).toBe('fine');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U2 — C-02 · survivor `taperedEnds` · param `bandProfile`
 * Folded: whiteBand ('hard'), nibAngle ('nib'). Bare option: taper->taperedEnds.
 * RED (pre-U2): resolveToneLaw({toneLaw:'taperedEnds', bandProfile:'hard'})
 * returned 'taperedEnds' unchanged (no STYLE_PARAMS.taperedEnds descriptor)
 * — rendering diverged from whiteBand's own picture (2862.5 vs 2919.7 mm ink
 * on torus+hatch+med). GREEN below closes it by construction.
 * `isophoteWidth` (2320.0 mm) is a genuinely different picture and is NOT
 * folded — the plan says so explicitly; not touched by this unit.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeComboCluster('Scene3D tone-law collapse — U2 + M3 (taperedEnds: Width from x Ends)', {
  survivor: 'taperedEnds',
  folded: [
    { id: 'whiteBand', params: { bandEnds: 'hard' } },
    { id: 'nibAngle', params: { widthFrom: 'nibAngle', bandEnds: 'hard' } },
    { id: 'isophoteWidth', params: { widthFrom: 'isophote', bandEnds: 'hard' } },
  ],
  legacyBags: [
    { bag: { toneLaw: 'taperedEnds', bandProfile: 'taper' }, id: 'taperedEnds' },
    { bag: { toneLaw: 'taperedEnds', bandProfile: 'hard' }, id: 'whiteBand' },
    { bag: { toneLaw: 'taperedEnds', bandProfile: 'nib' }, id: 'nibAngle' },
  ],
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U3 — C-03 · survivor `weightModulated` · param `weightEase`
 * Folded: weightSmoothstep ('smooth'). Bare option: step->weightModulated.
 * Not named by W-22/W-23/W-24 — filed as W-22b per the plan (§4 U1-U8
 * table). Only ONE folded id — exercises the shared template's single-
 * option path.
 * RED (pre-U3): resolveToneLaw({toneLaw:'weightModulated',
 * weightEase:'smooth'}) returned 'weightModulated' unchanged — rendering
 * diverged from weightSmoothstep's own picture (992.0 vs 995.8 mm ink,
 * 810 vs 540 points, on torus+hatch+med). GREEN below closes it.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeSingleParamCluster('Scene3D tone-law collapse — U3 (C-03/W-22b, weightModulated/weightEase)', {
  survivor: 'weightModulated',
  key: 'weightEase',
  pickerIdsLength: 42,
  folded: [
    { id: 'weightSmoothstep', value: 'smooth' },
  ],
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U4 — C-04 · survivor `bundleCount` · param `bundleMode`
 * Folded: bundleEased ('eased'), bundleDither ('dither'), bundleHandoff
 * ('handoff'). Bare option: count->bundleCount.
 * RED (pre-U4): resolveToneLaw({toneLaw:'bundleCount', bundleMode:'dither'})
 * returned 'bundleCount' unchanged — rendering diverged from bundleDither's
 * own picture (2461.4 vs 2468.3 mm ink on torus+hatch+med). GREEN below.
 * `bundleLozenge` (2193.3, lens bundles) and `bundleSubNib` (4030.9, solid
 * band) are distinct and NOT folded — per the plan, not touched here.
 *
 * TRAP (plan §2.4 / U0-review follow-up): `bundleDither` is one of the 11
 * LIBRARY-tier laws AND carries a real measured caveat ("waving the
 * pass-count boundary made long-wave moire worse... 3.43 vs 2.90 RMS").
 * `SCENE_FILL_STYLES.entry()`/`note()` read `R.BY_ID[id]` directly (NOT
 * resolved through an alias), so calling them with the raw id
 * 'bundleDither' still returns its own caveat correctly forever — verified
 * below, not assumed. What is genuinely lost: `fillStyleControls`
 * (scene3d-panel.js) computes its popover/caveat from the RESOLVED
 * SURVIVOR id ('bundleCount', which has no caveat of its own), not from
 * the specific internal law the bundleMode sub-control currently selects
 * — so a user who picks "Dithered" no longer sees bundleDither's caveat
 * warning in the UI. Fixing that needs a UI-file change (scene3d-panel.js
 * /context-bar.js), out of scope for this data-only unit per the plan's own
 * stop condition ("touch a UI file -> stop and report"); flagged as a
 * named follow-up in this unit's report rather than worked around here.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeSingleParamCluster('Scene3D tone-law collapse — U4 (C-04, bundleCount/bundleMode)', {
  survivor: 'bundleCount',
  key: 'bundleMode',
  pickerIdsLength: 39,
  folded: [
    { id: 'bundleEased', value: 'eased' },
    { id: 'bundleDither', value: 'dither' },
    { id: 'bundleHandoff', value: 'handoff' },
  ],
});


/*
 * ═══════════════════════════════════════════════════════════════════════
 * U5 — C-05 · survivor `contFieldSigmoid` · params `fieldMetric` + `fieldFloor`
 * (the ONE two-descriptor survivor — plan §1 C-05 / §2.2 rule 4.)
 *
 * Folded: contFieldFore (fieldMetric:'foreshortened'), contFieldSurface
 * ('surface'), contFieldQuant ('quantised') — all with fieldFloor at its
 * own default ('plot'); contFieldTouch (fieldFloor:'touch', fieldMetric at
 * its own default 'screen'). Bare option: fieldMetric:'screen' AND
 * fieldFloor:'plot' -> contFieldSigmoid.
 *
 * HONESTY CORRECTION (mandatory per this unit's brief): the audit's own
 * "byte-identical density-inert rows; Fore/Surface/Quant/Sigmoid visually
 * identical" wording (findings.json C-05) is FALSE at the render level.
 * *Density*-inert is correct (low=med=max reads the same at every density);
 * *law*-identical is NOT — measured ink on torus+hatch+med runs 1459.0 mm
 * (contFieldSigmoid) to 2202.0 mm (contFieldSurface), a 51% spread on the
 * SAME cell. The dHash-based audit tooling agrees they READ ALIKE at plot
 * scale (a picker-level near-duplicate, which is what justifies the
 * collapse), but "byte-identical" specifically overstates that as pixel/
 * path identity, which this unit's own byte-identity test below disproves
 * for the RAW ids (SF.buildObject('contFieldSigmoid') !== SF.buildObject
 * ('contFieldSurface')) even while proving the COLLAPSE mechanism itself is
 * lossless (survivor+params reaches the exact same output AS THE FOLDED ID
 * ALWAYS PRODUCED, ink and all — the collapse does not average or
 * normalize the four pictures, it just changes how a user reaches each
 * one). worklist.json/findings.json's wording fix is owned by U8 per the
 * plan's docs contract (§6); flagged here, not fixed in this file.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeComboCluster('Scene3D tone-law collapse — U5 + M5 (Ladder: Spacing continuous field x metric x closest approach)', {
  survivor: 'ladder',
  folded: [
    { id: 'contFieldSigmoid', params: { spacing: 'field' } },
    { id: 'contFieldFore', params: { spacing: 'field', fieldMetric: 'foreshortened' } },
    { id: 'contFieldSurface', params: { spacing: 'field', fieldMetric: 'surface' } },
    { id: 'contFieldQuant', params: { spacing: 'field', fieldMetric: 'quantised' } },
    { id: 'contFieldTouch', params: { spacing: 'field', closestApproach: 'touch' } },
  ],
  legacyBags: [
    { bag: { toneLaw: 'contFieldSigmoid' }, id: 'contFieldSigmoid' },
    { bag: { toneLaw: 'contFieldSigmoid', fieldMetric: 'surface' }, id: 'contFieldSurface' },
    { bag: { toneLaw: 'contFieldSigmoid', fieldFloor: 'touch' }, id: 'contFieldTouch' },
    { bag: { toneLaw: 'contFieldSigmoid', fieldMetric: 'surface', fieldFloor: 'touch' }, id: 'contFieldSigmoid' },
  ],
});

describe('Scene3D tone-law collapse — U5 honesty + unrepresentable combinations', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params; let hatchOpts;
  const FIVE = ['contFieldSigmoid', 'contFieldFore', 'contFieldSurface', 'contFieldQuant', 'contFieldTouch'];
  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    const p = clone(defaults);
    p.objects = [{ id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 }, transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(opts) { const result = orig.call(this, opts); calls.push({ opts, result }); return result; };
    try { algo.generate(p, null, null, BOUNDS); } finally { SF.buildObject = orig; }
    let best = calls[0];
    for (const c of calls) if ((c.result || []).length > (best.result || []).length) best = c;
    hatchOpts = best.opts;
  }, SLOW);
  afterAll(() => runtime.cleanup());

  // The audit called these "byte-identical": FALSE at the render level (the five continuous-field
  // laws are five different pictures; ink 1459 -> 2202 mm). The collapse is lossless, it does not
  // average them.
  test('HONESTY CHECK: the five continuous-field laws genuinely differ from each other at the render level', () => {
    const outs = FIVE.map((id) => JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: id })));
    expect(new Set(outs).size).toBe(outs.length);
  });

  test('an UNREPRESENTABLE combination (two non-default field sub-controls at once) is reported not-ok and falls back deterministically, never a throw', () => {
    const R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
    const bag = { spacing: 'field', fieldMetric: 'foreshortened', closestApproach: 'touch' };
    expect(R.analyse('ladder', bag).ok).toBe(false);
    expect(() => Params.resolveToneLaw({ toneLaw: 'ladder', ...bag })).not.toThrow();
    expect(Params.resolveToneLaw({ toneLaw: 'ladder', ...bag })).toBe('ladder');
    // ...and picking the option snaps the other sub-control to a real combination.
    expect(R.pickPatch('ladder', { spacing: 'field', fieldMetric: 'foreshortened' }, 'closestApproach', 'touch'))
      .toEqual({ closestApproach: 'touch', fieldMetric: 'screen' });
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U6 — C-06 / W-18a · survivor `penInterleave` · param `penMode`
 * Folded: penPitchMatch ('pitchMatch'), penFacing ('facing'), penStipple
 * ('stipple'). Bare option: interleave->penInterleave (default).
 * W-22-24-W-18-plan.md §1 "C-06 -> U6", ink on torus+hatch+med:
 *   interleave  (default) -> penInterleave: 118 paths / 868.1 mm
 *   pitchMatch             -> penPitchMatch: 121 paths / 922.0 mm
 *   facing                 -> penFacing:     154 paths / 867.7 mm
 *   stipple                -> penStipple:    119 paths / 910.6 mm
 * "By eye the four are the same capsule-stepped rulings on torus
 * hatch/contour and sphere hatch; byte-identical trio on spiral/stipple."
 * `penCross` (856.2, crossed) and `penReserve` (1166.7, transverse reserves)
 * are genuinely different pictures and are NOT folded — the plan says so
 * explicitly; not touched by this unit.
 *
 * RED (pre-U6, verified via a scratch `git stash` of
 * scripts/build-tone-laws.js + src/config/scene3d-tone-laws.js): before this
 * unit's COLLAPSE row existed, resolveToneLaw({toneLaw:'penInterleave',
 * penMode:'stipple'}) returned 'penInterleave' unchanged (no
 * STYLE_PARAMS.penInterleave descriptor) — rendering diverged from
 * penStipple's own picture (868.1 vs 910.6 mm ink on torus+hatch+med).
 * GREEN below closes it by construction, same mechanism U1-U5/U7/U8 ran.
 *
 * THIS UNIT WAS FROZEN-ON-JAY (LEDGER.md row 11, §4 decision 2) because,
 * unlike every other C-0x cluster, folding `penStipple` requires a VISIBLE
 * product decision on top of the ordinary data-only fold: `penStipple`'s
 * `FILL_STYLE_MARK_OF` entry was 'dot' (src/config/context-bar.js), while
 * its three siblings (`penInterleave`/`penPitchMatch`/`penFacing`) are all
 * already 'hatch' — folding it in place would have broken the §2.4
 * invariant ("mark class is constant within every cluster") unless the
 * mark class itself moved too. Jay's decision (2026-09-10, option A): move
 * `penStipple` from the 'dot' mark class ("Dots & stipple") to 'hatch'
 * ("Parallel hatching") — its own measured mechanism ("Broad ruled darks,
 * medium hatch through the mids, and the fine nib stippling the highlight
 * fade by shortening its marks") is a hatch, not the drawn dots the old
 * grouping implied; `docs/tone-laws/laws.json`'s `penStipple.caveat` was
 * rewritten (U5b-2 plain-language precedent) to say so.
 *
 * THE SHADOW PATH ALSO MOVES, NOT JUST THE PICKER (verified, not assumed):
 * `src/core/scene3d/shadows.js`'s `shadowMarkLines` branches on markClass
 * to pick a recipe table — `DOT_LAW_RECIPES.penStipple` (a real, designed
 * "shorten the marks" flick recipe) versus `HATCH_LAW_RECIPES` (which had
 * NO `penStipple` entry, because it was never reachable there before this
 * unit). Left alone, moving the mark class would have silently dropped
 * `penStipple`'s shadow onto the generic `hatchRingsEvenOdd` fallback
 * instead of a deliberate recipe — so this unit ALSO adds
 * `HATCH_LAW_RECIPES.penStipple`, translating the same "shorten the marks"
 * mechanism into hatch terms (`hatchEndTrim`), so the shadow keeps a
 * purpose-built recipe rather than degrading to the undifferentiated
 * default. See tests/unit/scene3d-shadow-tone-law.test.js's own "HEADLINE
 * (U6)" test (the shadow-path harness for this file already lives there,
 * next to U9's identical fineLadder precedent — not duplicated here).
 *
 * CAVEAT CONDITION (per U7/U8's own finding, carried forward and widened):
 * ALL FOUR members of this cluster carry their own real, non-empty measured
 * caveats (docs/tone-laws/laws.json) — unlike U7/U8's two-caveat pair, this
 * is a FOUR-caveat cluster. They are NOT all pairwise distinct, though:
 * penPitchMatch and penFacing carry the exact same "three pens are
 * simulated" sentence (measured, not assumed — see the U6 caveat describe
 * block). `effectiveLaw`/`resolveToneLaw` must surface the SPECIFIC
 * member's own caveat at every one of the four `penMode` states.
 * See the "U6 caveat" describe block below, and the shared cross-check
 * tests/unit/scene3d-fill-style-effective-law.test.js.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeSingleParamCluster('Scene3D tone-law collapse — U6 (C-06, penInterleave/penMode)', {
  survivor: 'penInterleave',
  key: 'penMode',
  pickerIdsLength: 30,
  folded: [
    { id: 'penPitchMatch', value: 'pitchMatch' },
    { id: 'penFacing', value: 'facing' },
    { id: 'penStipple', value: 'stipple' },
  ],
});

describe('Scene3D tone-law collapse — U6 mark-class move: penStipple leaves "dot" for "hatch" (§2.4 invariant, the reason this unit was FROZEN-ON-JAY)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
  afterAll(() => runtime.cleanup());

  test('penStipple now reports "hatch", not "dot" — matching all three of its cluster siblings', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.markClass('penStipple')).toBe('hatch');
    expect(FS.markClass('penStipple')).not.toBe('dot');
    ['penInterleave', 'penPitchMatch', 'penFacing'].forEach((id) => {
      expect(FS.markClass(id)).toBe('hatch');
    });
  });

  test('"Dots & stipple" no longer lists penStipple; "Parallel hatching" does', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
    const dotMembers = R.IDS.filter((id) => FS.markClass(id) === 'dot');
    const hatchMembers = R.IDS.filter((id) => FS.markClass(id) === 'hatch');
    expect(dotMembers.indexOf('penStipple')).toBe(-1);
    expect(hatchMembers.indexOf('penStipple')).not.toBe(-1);
    // mkDotScreen/lozengeStipple are the two remaining dot-class laws;
    // penStipple's departure is the ONLY membership change this unit makes.
    expect(dotMembers.sort()).toEqual(['lozengeStipple', 'mkDotScreen']);
  });
});
