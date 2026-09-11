const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

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

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const SLOW = 600000;

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
    runtime = await loadVecturaRuntime();
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
    const union = new Set(R.PICKER_IDS.concat(aliasIds));
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

  // Split into quarters of the 48-id roster (not one 96-buildObject sweep):
  // each `test()` carries its own SLOW budget, but CI's slower/shared
  // runner can still blow a single test's wall-clock even inside 600000ms
  // — chunking keeps every individual test call well under that ceiling
  // without changing what is asserted (RGR-safe: same laws, same checks).
  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  chunk([...Array(48).keys()], 12).forEach((indexes, i) => {
    test(`4.${i + 1}. byte-identity sweep: laws ${indexes[0]}-${indexes[indexes.length - 1]} render identically through the raw id and through resolveToneLaw`, () => {
      const offenders = [];
      const ids = roster().IDS;
      indexes.forEach((idx) => {
        const law = ids[idx];
        const rawOut = SF.buildObject({ ...hatchOpts, toneLaw: law });
        const resolved = Params.resolveToneLaw({ toneLaw: law });
        const resolvedOut = SF.buildObject({ ...hatchOpts, toneLaw: resolved });
        if (JSON.stringify(resolvedOut) !== JSON.stringify(rawOut)) offenders.push(law);
      });
      expect(offenders, `these laws diverged through resolveToneLaw: ${offenders.join(', ')}`).toEqual([]);
    }, SLOW);
  });

  // 48, not 47: the shipped default 'ladder' is deliberately NOT one of the
  // roster's 48 ids (FILL_STYLE_DEFAULT_ENTRY's own comment, context-bar.js
  // — it is the value every id in this roster was measured AGAINST), so
  // there is no id in this loop whose own law IS 'ladder' for the mutation
  // to leave alone. Every one of the 48 differs from a forced-'ladder'
  // build (the same property scene3d-tone-law-dispatch.test.js's "every
  // law differs from ladder" guard already establishes for its own list).
  chunk([...Array(48).keys()], 12).forEach((indexes, i) => {
    test(`5.${i + 1}. mutation-proof: forcing resolveToneLaw to always return "ladder" breaks laws ${indexes[0]}-${indexes[indexes.length - 1]}`, () => {
      const orig = Params.resolveToneLaw;
      const offenders = [];
      Params.resolveToneLaw = () => 'ladder';
      try {
        const ids = roster().IDS;
        indexes.forEach((idx) => {
          const law = ids[idx];
          const rawOut = SF.buildObject({ ...hatchOpts, toneLaw: law });
          const forcedOut = SF.buildObject({ ...hatchOpts, toneLaw: Params.resolveToneLaw({ toneLaw: law }) });
          if (JSON.stringify(forcedOut) !== JSON.stringify(rawOut)) offenders.push(law);
        });
      } finally {
        Params.resolveToneLaw = orig;
      }
      expect(offenders.length).toBe(indexes.length);
    }, SLOW);
  });

  // The real COLLAPSE table is empty in U0, so the shim/resolver mechanism
  // can only be proven with a SYNTHETIC alias — monkey-patching
  // ALIASES/STYLE_PARAMS for the duration of one test, restored in `finally`.
  test('6. migration shim (normalizeStyle): a synthetic alias resolves to survivor + param, never clobbering an explicit sibling', () => {
    const R = roster();
    const savedAliases = R.ALIASES;
    const savedStyleParams = R.STYLE_PARAMS;
    R.ALIASES = { syntheticFolded: { into: 'ladder', params: { rungMode: 'fine' } } };
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
    runtime = await loadVecturaRuntime();
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
    expect(sanitized.sceneVersion).toBe(4); // no SCENE_VERSION bump — see plan §2.3
    const migrated = sanitized.styleTable.byObject['obj-1'].params;
    expect(migrated.toneLaw).toBe('ladder');
    expect(migrated.rungMode).toBe('fine');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * Shared RGR template — U2/U3/U4 (ORDINARY single-descriptor clusters: the
 * survivor IS a roster id, exactly one collapse param, no LIBRARY-tier or
 * caveat-bearing member). Factored out because U1 (survivor is the shipped
 * default, not a roster id — see its own block above) and U5 (two
 * descriptors — contFieldSigmoid) each break one of those assumptions and
 * are written out by hand below instead of forced through this template.
 * Runs the exact same assertion set U1 hand-wrote: PICKER_IDS count,
 * ALIASES shape, byte-identity via resolveToneLaw, mark-class/ribbon/pen
 * invariants, normalizeStyle migration (incl. explicit-sibling-preserved),
 * clampStyleParam/normalizeShadow belt-and-brace, resolve()/entry()
 * round-trip, and a real sanitizeSceneParams end-to-end pass.
 * ═══════════════════════════════════════════════════════════════════════
 */
function describeSingleParamCluster(label, {
  survivor, key, pickerIdsLength, folded, shadowResolvesToSurvivor,
}) {
  describe(label, () => {
    let runtime; let V; let algo; let defaults; let SF; let Params; let hatchOpts;

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
      runtime = await loadVecturaRuntime();
      V = runtime.window.Vectura;
      algo = V.AlgorithmRegistry.scene3d;
      defaults = V.ALGO_DEFAULTS.scene3d;
      SF = V.Scene3D.SurfaceFill;
      Params = V.Scene3D.Params;
      hatchOpts = captureOpts('hatch');
    }, SLOW);
    afterAll(() => runtime.cleanup());

    const roster = () => runtime.window.Vectura.SCENE3D_TONE_LAWS;

    // RELATIVE claims only — PICKER_IDS.length is one global counter shared
    // across every cluster, not a per-unit delta; the single authoritative
    // "bump this number every unit" cumulative total lives in
    // tests/unit/scene3d-tone-laws-config.test.js (per the plan's own §5
    // instruction), not repeated per cluster here where it would go stale
    // the moment a LATER unit folds more ids (as U1's own hand-written
    // version of this test did at U2 — see that test's own stale-update
    // comment). `pickerIdsLength` is accepted for documentation/commit-body
    // purposes only and is not itself asserted.
    test(`every folded id leaves PICKER_IDS but stays in IDS (48, unaffected forever) — survivor "${survivor}" stays offered`, () => {
      const R = roster();
      expect(R.IDS.length).toBe(48);
      folded.forEach(({ id }) => {
        expect(R.IDS.indexOf(id)).not.toBe(-1);
        expect(R.PICKER_IDS.indexOf(id)).toBe(-1);
      });
      // The survivor itself is never its own alias, and stays offered.
      expect(R.ALIASES[survivor]).toBeUndefined();
      expect(R.PICKER_IDS.indexOf(survivor)).not.toBe(-1);
    });

    test(`ALIASES: every folded id maps into survivor "${survivor}" with the exact ${key} patch`, () => {
      const R = roster();
      folded.forEach(({ id, value }) => {
        expect(R.ALIASES[id]).toEqual({ into: survivor, params: { [key]: value } });
      });
    });

    test('byte-identity: survivor+param renders identically to the legacy folded id, for every option', () => {
      folded.forEach(({ id, value }) => {
        const resolved = Params.resolveToneLaw({ toneLaw: survivor, [key]: value });
        expect(resolved).toBe(id);
        const viaSurvivor = SF.buildObject({ ...hatchOpts, toneLaw: resolved });
        const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
        expect(JSON.stringify(viaSurvivor)).toBe(JSON.stringify(viaLegacy));
      });
      // The survivor's own bare (default) option is untouched — never an alias.
      expect(Params.resolveToneLaw({ toneLaw: survivor })).toBe(survivor);
    });

    test('mark class and Stroke Fill eligibility are constant across the cluster (§2.4 invariant)', () => {
      const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
      const SFS = runtime.window.Vectura.STROKE_FILL_STYLES;
      folded.forEach(({ id }) => {
        expect(FS.markClass(id)).toBe(FS.markClass(survivor));
        expect(SFS.RIBBON_LAWS.indexOf(id) !== -1).toBe(SFS.RIBBON_LAWS.indexOf(survivor) !== -1);
        expect(SFS.PEN_LAWS.indexOf(id) !== -1).toBe(SFS.PEN_LAWS.indexOf(survivor) !== -1);
      });
    });

    test('migration: a style bag naming the folded id normalizes to survivor + param, byte-identical, never clobbering an explicit sibling', () => {
      folded.forEach(({ id, value }) => {
        const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } });
        expect(out.params.toneLaw).toBe(survivor);
        expect(out.params[key]).toBe(value);
        const viaMigrated = SF.buildObject({
          ...hatchOpts,
          toneLaw: Params.resolveToneLaw({ toneLaw: out.params.toneLaw, [key]: out.params[key] }),
        });
        const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
        expect(JSON.stringify(viaMigrated)).toBe(JSON.stringify(viaLegacy));
      });
      // An explicit sibling already in the bag is never overwritten. Uses the
      // SURVIVOR's own default value as the "explicit" stand-in — guaranteed
      // to differ from whatever the shim would auto-fill for ANY folded id
      // (the default option is, by construction, never one of the folded
      // ones), so this is a real test regardless of how many options a
      // cluster has (works even for a single-folded-id cluster like U3).
      const R = roster();
      const defaultValue = R.STYLE_PARAMS[survivor][0].default;
      const out2 = Params.normalizeStyle({
        mapper: 'hatch', params: { toneLaw: folded[0].id, [key]: defaultValue },
      });
      expect(out2.params.toneLaw).toBe(survivor);
      expect(out2.params[key]).toBe(defaultValue);
    });

    // STALE ASSERTION UPDATE (U9, resolve half) — see the U0 test 7 comment
    // for the full reasoning: the shadow bag has no sibling sub-control
    // field, so collapsing a folded `shadowToneLaw` to its survivor silently
    // loses which shadows.js HATCH_LAW_RECIPES entry to draw. U9 fixed
    // `normalizeShadow` to pass a folded id through unchanged instead.
    //
    // STALE ASSERTION UPDATE (U9b) — ONE exception to that pass-through:
    // `shadowResolvesToSurvivor` (opt-in, empty for every cluster except
    // U8's) names folded ids shadows.js itself judges NOT DISTINGUISHABLE
    // from their survivor there (`Shadows.toneLawApplies` false — no recipe
    // of its own in any `*_LAW_RECIPES` table). For those, U9b's
    // `clampShadowToneLaw` resolves FORWARD to the survivor instead of
    // passing the raw id through, so it draws the survivor's own real
    // recipe rather than silently degrading to the undifferentiated plain-
    // hatch fallback (byte-identical to 'ladder') — the same failure mode
    // U9's fix retired for every OTHER folded id, from a different cause.
    // See params.js `clampShadowToneLaw` and
    // tests/unit/scene3d-shadow-tone-law-uniqueness.test.js's own
    // "onePenDown (U9b)" test for the render-level proof.
    test('clampStyleParam belt-and-brace: shadowToneLaw carrying a folded id passes through UNCHANGED, UNLESS shadows.js judges it not distinguishable from its survivor there (U9b) — never warns either way', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        folded.forEach(({ id }) => {
          const shadow = Params.normalizeShadow({ shadowToneLaw: id });
          const expected = (shadowResolvesToSurvivor || []).includes(id) ? survivor : id;
          expect(shadow.shadowToneLaw).toBe(expected);
        });
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    test('picker round-trip: resolve()/entry() still answer for a folded id', () => {
      const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
      folded.forEach(({ id }) => {
        expect(FS.resolve(id)).toBe(survivor);
        expect(FS.entry(id)).toBeTruthy();
      });
    });

    test('a saved .vectura naming a folded toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect', () => {
      const first = folded[0];
      const sanitized = Params.sanitizeSceneParams({
        objects: [{ id: 'obj-1', primitive: 'sphere', params: { radius: 30 } }],
        styleTable: {
          scene: { mapper: 'hatch', params: {} },
          byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: first.id } } },
          byFace: {},
        },
      });
      expect(sanitized.sceneVersion).toBe(4);
      const migrated = sanitized.styleTable.byObject['obj-1'].params;
      expect(migrated.toneLaw).toBe(survivor);
      expect(migrated[key]).toBe(first.value);
    });
  });
}

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
describeSingleParamCluster('Scene3D tone-law collapse — U2 (C-02, taperedEnds/bandProfile)', {
  survivor: 'taperedEnds',
  key: 'bandProfile',
  pickerIdsLength: 43,
  folded: [
    { id: 'whiteBand', value: 'hard' },
    { id: 'nibAngle', value: 'nib' },
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

describe('Scene3D tone-law collapse — U4 caveat-visibility gap (bundleDither, LIBRARY-tier, has a real caveat)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct lookups (entry/note by raw id) still show the caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const note = FS.note('bundleDither');
    expect(note.caveat.length).toBeGreaterThan(0);
    expect(note.caveat).toMatch(/moire/);
  });

  test('KNOWN GAP: the resolved-survivor id (what the UI popover actually reads) has no caveat of its own', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.resolve('bundleDither')).toBe('bundleCount');
    const survivorNote = FS.note('bundleCount');
    expect(survivorNote.caveat).toBe(''); // bundleCount's OWN caveat is null/empty
  });

  // U5b (BLOCKING BEFORE MERGE, ruled 2026-09-06) — the fix. Folding a law
  // must NOT hide its measured caveat: `SCENE_FILL_STYLES.effectiveLaw`
  // resolves (survivor id, current collapse sub-control values) back to the
  // SPECIFIC internal id those values select — mirroring
  // `Scene3D.Params.resolveToneLaw`'s own survivor+params rule (rules 3/4)
  // without this config file depending on the core engine module. The two
  // UI surfaces (scene3d-panel.js, context-bar.js) read the CAVEAT off this
  // effective id while still reading the (i) popover's blurb off the plain
  // survivor `entry`/`note` — the two are deliberately NOT the same lookup.
  test('U5b FIX: effectiveLaw resolves the "Dithered" sub-control choice back to bundleDither, surfacing its own caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(typeof FS.effectiveLaw).toBe('function');
    expect(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).toBe('bundleDither');
    const caveat = FS.note(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).caveat;
    expect(caveat.length).toBeGreaterThan(0);
    expect(caveat).toMatch(/moire/);
    // The bare survivor (sub-control at its own default, or the bag empty)
    // still shows no caveat — this must not manufacture one out of nothing.
    expect(FS.effectiveLaw('bundleCount', { bundleMode: 'count' })).toBe('bundleCount');
    expect(FS.note(FS.effectiveLaw('bundleCount', {})).caveat).toBe('');
    // A survivor with no collapse descriptors at all (no STYLE_PARAMS entry)
    // passes through unchanged, regardless of the bag it is handed.
    expect(FS.effectiveLaw('etfKang', { bundleMode: 'dither' })).toBe('etfKang');
  });
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
describe('Scene3D tone-law collapse — U5 (C-05, contFieldSigmoid/fieldMetric+fieldFloor)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params; let hatchOpts;
  const SURVIVOR = 'contFieldSigmoid';
  // { id, params } — the exact bag that reaches each folded id.
  const FOLDED = [
    { id: 'contFieldFore', params: { fieldMetric: 'foreshortened' } },
    { id: 'contFieldSurface', params: { fieldMetric: 'surface' } },
    { id: 'contFieldQuant', params: { fieldMetric: 'quantised' } },
    { id: 'contFieldTouch', params: { fieldFloor: 'touch' } },
  ];

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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    hatchOpts = captureOpts('hatch');
  }, SLOW);
  afterAll(() => runtime.cleanup());

  const roster = () => runtime.window.Vectura.SCENE3D_TONE_LAWS;

  test('the 4 folded ids leave PICKER_IDS but stay in IDS; the survivor stays offered', () => {
    const R = roster();
    expect(R.IDS.length).toBe(48);
    FOLDED.forEach(({ id }) => {
      expect(R.IDS.indexOf(id)).not.toBe(-1);
      expect(R.PICKER_IDS.indexOf(id)).toBe(-1);
    });
    expect(R.ALIASES[SURVIVOR]).toBeUndefined();
    expect(R.PICKER_IDS.indexOf(SURVIVOR)).not.toBe(-1);
  });

  test('ALIASES: every folded id maps into the survivor with EXACTLY the one param that differs from default', () => {
    const R = roster();
    FOLDED.forEach(({ id, params }) => {
      expect(R.ALIASES[id]).toEqual({ into: SURVIVOR, params });
    });
    // Exactly 2 descriptors, as the plan specifies (fieldMetric, fieldFloor).
    expect(R.STYLE_PARAMS[SURVIVOR].length).toBe(2);
  });

  test('byte-identity: survivor+params renders identically to the legacy folded id, for all 4', () => {
    FOLDED.forEach(({ id, params }) => {
      const resolved = Params.resolveToneLaw({ toneLaw: SURVIVOR, ...params });
      expect(resolved).toBe(id);
      const viaSurvivor = SF.buildObject({ ...hatchOpts, toneLaw: resolved });
      const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
      expect(JSON.stringify(viaSurvivor)).toBe(JSON.stringify(viaLegacy));
    });
    // The bare survivor (both descriptors at default) is untouched.
    expect(Params.resolveToneLaw({ toneLaw: SURVIVOR })).toBe(SURVIVOR);
    expect(Params.resolveToneLaw({ toneLaw: SURVIVOR, fieldMetric: 'screen', fieldFloor: 'plot' })).toBe(SURVIVOR);
  });

  test('HONESTY CHECK: the 4 folded ids genuinely differ from the survivor and from each other at the render level (not byte-identical, despite reading alike)', () => {
    const outs = [SURVIVOR, ...FOLDED.map((f) => f.id)].map(
      (id) => JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: id })),
    );
    const unique = new Set(outs);
    expect(unique.size).toBe(outs.length); // all 5 are distinct renders
  });

  test('rule 4 — an UNREPRESENTABLE combination (both descriptors non-default at once) deterministically falls back to the bare survivor, never a throw, and is genuinely a THIRD picture (not silently equal to either single-param alias)', () => {
    const resolved = Params.resolveToneLaw({ toneLaw: SURVIVOR, fieldMetric: 'foreshortened', fieldFloor: 'touch' });
    expect(resolved).toBe(SURVIVOR); // falls back to the survivor's own bare id
    const fallbackOut = JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: resolved }));
    const bareOut = JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: SURVIVOR }));
    expect(fallbackOut).toBe(bareOut); // identical to the bare survivor, exactly as rule 4 specifies
    // Also try the general case: 3+ arbitrary non-default pairs, never throws.
    expect(() => Params.resolveToneLaw({ toneLaw: SURVIVOR, fieldMetric: 'surface', fieldFloor: 'touch' })).not.toThrow();
    expect(Params.resolveToneLaw({ toneLaw: SURVIVOR, fieldMetric: 'surface', fieldFloor: 'touch' })).toBe(SURVIVOR);
  });

  test('mark class and Stroke Fill eligibility are constant across the cluster (§2.4 invariant)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const SFS = runtime.window.Vectura.STROKE_FILL_STYLES;
    FOLDED.forEach(({ id }) => {
      expect(FS.markClass(id)).toBe(FS.markClass(SURVIVOR));
      expect(SFS.RIBBON_LAWS.indexOf(id) !== -1).toBe(SFS.RIBBON_LAWS.indexOf(SURVIVOR) !== -1);
      expect(SFS.PEN_LAWS.indexOf(id) !== -1).toBe(SFS.PEN_LAWS.indexOf(SURVIVOR) !== -1);
    });
  });

  test('migration: a style bag naming a folded id normalizes to survivor + the ONE right param, byte-identical, never clobbering an explicit sibling', () => {
    FOLDED.forEach(({ id, params }) => {
      const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } });
      expect(out.params.toneLaw).toBe(SURVIVOR);
      Object.keys(params).forEach((k) => expect(out.params[k]).toBe(params[k]));
      const viaMigrated = SF.buildObject({
        ...hatchOpts,
        toneLaw: Params.resolveToneLaw({ toneLaw: out.params.toneLaw, fieldMetric: out.params.fieldMetric, fieldFloor: out.params.fieldFloor }),
      });
      const viaLegacy = SF.buildObject({ ...hatchOpts, toneLaw: id });
      expect(JSON.stringify(viaMigrated)).toBe(JSON.stringify(viaLegacy));
    });
    // An explicit sibling is never overwritten — pick contFieldFore's own
    // migration but assert an explicitly-set fieldMetric:'screen' survives.
    const out2 = Params.normalizeStyle({
      mapper: 'hatch', params: { toneLaw: 'contFieldFore', fieldMetric: 'screen' },
    });
    expect(out2.params.toneLaw).toBe(SURVIVOR);
    expect(out2.params.fieldMetric).toBe('screen');
  });

  // STALE ASSERTION UPDATE (U9, resolve half) — see the U0 test 7 comment
  // for the full reasoning: the shadow bag has no sibling sub-control field,
  // so collapsing a folded `shadowToneLaw` to its survivor silently loses
  // which shadows.js HATCH_LAW_RECIPES entry to draw. U9 fixed
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
      expect(FS.resolve(id)).toBe(SURVIVOR);
      expect(FS.entry(id)).toBeTruthy();
    });
  });

  test('a saved .vectura naming a folded toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect', () => {
    const sanitized = Params.sanitizeSceneParams({
      objects: [{ id: 'obj-1', primitive: 'sphere', params: { radius: 30 } }],
      styleTable: {
        scene: { mapper: 'hatch', params: {} },
        byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: 'contFieldTouch' } } },
        byFace: {},
      },
    });
    expect(sanitized.sceneVersion).toBe(4);
    const migrated = sanitized.styleTable.byObject['obj-1'].params;
    expect(migrated.toneLaw).toBe(SURVIVOR);
    expect(migrated.fieldFloor).toBe('touch');
  });
});

describe('Scene3D tone-law collapse — U5 caveat-visibility gap (contFieldTouch, LIBRARY-tier, has a real caveat)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct lookups still show the caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const note = FS.note('contFieldTouch');
    expect(note.caveat.length).toBeGreaterThan(0);
    expect(note.caveat).toMatch(/floods/);
  });

  test('KNOWN GAP: the resolved-survivor id has no caveat of its own — same shape of gap as U4/bundleDither', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.resolve('contFieldTouch')).toBe('contFieldSigmoid');
    const survivorNote = FS.note('contFieldSigmoid');
    expect(survivorNote.caveat).toBe('');
  });

  // U5b FIX — the two-descriptor survivor (contFieldSigmoid has BOTH
  // fieldMetric and fieldFloor), exercising resolveToneLaw's rule 4 case
  // (exactly one descriptor active -> that descriptor's law; more than one
  // active at once -> deterministic fallback to the bare survivor, never a
  // throw) through effectiveLaw as well.
  test('U5b FIX: effectiveLaw resolves the "Ink-width floor" sub-control choice back to contFieldTouch, surfacing its own caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('contFieldSigmoid', { fieldFloor: 'touch' })).toBe('contFieldTouch');
    const caveat = FS.note(FS.effectiveLaw('contFieldSigmoid', { fieldFloor: 'touch' })).caveat;
    expect(caveat.length).toBeGreaterThan(0);
    expect(caveat).toMatch(/floods/);
    // Both descriptors at default -> the bare survivor, no caveat.
    expect(FS.effectiveLaw('contFieldSigmoid', {})).toBe('contFieldSigmoid');
    expect(FS.note(FS.effectiveLaw('contFieldSigmoid', {})).caveat).toBe('');
    // Unrepresentable combination (both non-default at once) falls back to
    // the bare survivor deterministically, matching resolveToneLaw rule 4.
    expect(FS.effectiveLaw('contFieldSigmoid', { fieldMetric: 'surface', fieldFloor: 'touch' })).toBe('contFieldSigmoid');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U5b-2 — plain-language rewrite of the caveat copy for end users.
 * U5b's review (docs/3d-audit/lane-reports/U5b-review.md, flag 4) accepted
 * that the two caveats are now VISIBLE (U5b's whole job), but flagged their
 * WORDING as raw audit prose ("RMS", "R2", "L* span", "sphere·hatch" as a
 * bare cell-name token, "negative result") — a plotter-art user has no
 * reason to know any of that vocabulary. `docs/tone-laws/laws.json` is the
 * SOURCE of `BY_ID[id].caveat` (regenerated into
 * src/config/scene3d-tone-laws.js by `node scripts/build-tone-laws.js` —
 * see that script's own header comment); the measured numbers themselves
 * stay recorded in `docs/tone-laws/README.md` (`### 15 · bundleDither` /
 * `### 19 · contFieldTouch`) and LEDGER.md's line 610-612 ruling, exactly
 * where the review says they "already live" — this unit does not touch
 * either of those record files, only the picker-facing copy.
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('Scene3D tone-law collapse — U5b-2 (plain-language caveat copy)', () => {
  let runtime; let FS;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
  });
  afterAll(() => runtime.cleanup());

  // RGR proof: this assertion is RED against the pre-U5b-2 tree (the
  // committed-at-49475ccd wording contains "RMS", "R2", "sphere·hatch" as a
  // bare token, and "negative result" for bundleDither); GREEN once
  // laws.json's caveat fields are rewritten and scene3d-tone-laws.js is
  // regenerated.
  test('neither caveat carries raw audit statistics or internal jargon', () => {
    const jargon = /\bRMS\b|\bR2\b|\bR²\b|L\*|sphere·hatch|sphere·crosshatch|cylinder·hatch|negative result|off-the-line/i;
    ['bundleDither', 'contFieldTouch'].forEach((id) => {
      const caveat = FS.note(id).caveat;
      expect(caveat.length).toBeGreaterThan(0);
      expect(caveat).not.toMatch(jargon);
    });
  });

  // The rewrite must not silently drop the caveat, and must still be
  // reachable through the same effectiveLaw path U5b wired — a wording-only
  // change must not regress U5b's own fix.
  test('the plain-language caveats are still exactly two sentences and still surface through effectiveLaw', () => {
    const sentenceCount = (s) => (s.match(/[.!?](?:\s|$)/g) || []).length;
    ['bundleDither', 'contFieldTouch'].forEach((id) => {
      const caveat = FS.note(id).caveat;
      expect(sentenceCount(caveat)).toBeLessThanOrEqual(2);
    });
    expect(FS.note(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).caveat)
      .toBe(FS.note('bundleDither').caveat);
    expect(FS.note(FS.effectiveLaw('contFieldSigmoid', { fieldFloor: 'touch' })).caveat)
      .toBe(FS.note('contFieldTouch').caveat);
  });

  // Still names the exact UI control values a user just picked — plain
  // language should point back at what they can DO about the warning, not
  // just restate that something is wrong.
  test('each caveat references the option that reaches it or its sibling, in the UI\'s own wording', () => {
    expect(FS.note('bundleDither').caveat).toMatch(/Dithered|Count mode|Integer pass count/);
    expect(FS.note('contFieldTouch').caveat).toMatch(/Field floor/);
  });
});

// U5b-3 (generative cross-check: effectiveLaw ≡ resolveToneLaw) lives in its
// own file, tests/unit/scene3d-fill-style-effective-law.test.js — split out
// so it can be lifted cleanly at rebase against main's chunked U0 rewrite of
// this file and U9's in-flight edits to it on handoff-c2 (orchestrator
// direction, U5b-2/3 checkpoint follow-up).

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U7 — C-07 · survivor `ampSpacing` · param `nesting`
 * Folded: weaveDepth ('nested'). Bare option: single->ampSpacing.
 * RED (pre-U7, verified via a scratch `git stash` of the two implementation
 * files, not asserted here): resolveToneLaw({toneLaw:'ampSpacing',
 * nesting:'nested'}) returned 'ampSpacing' unchanged (no STYLE_PARAMS entry)
 * — rendering diverged from weaveDepth's own picture (3925.9 vs 3917.8 mm
 * ink on torus+hatch+med, within 0.2% — a genuinely tight pair per the
 * plan's own §1 C-07 note). GREEN below closes it by construction, same
 * mechanism U1-U5 ran five times (see docs/3d-audit/lane-reports/U1-U5-impl.md).
 *
 * TWO CONDITIONS THIS UNIT ADDS ON TOP OF THE STANDARD TEMPLATE (secretary
 * flags on U7's brief, docs/3d-audit/STILL-OPEN.md):
 *
 * (a) The standing caveat ruling ("folding a law must NOT hide its measured
 * caveat", U5b) binds U7 too — but U7 is the FIRST cluster in this chain
 * where BOTH the survivor (`ampSpacing`) AND the folded id (`weaveDepth`)
 * carry their own real, DIFFERENT measured caveats (every earlier cluster's
 * survivor had none). `effectiveLaw`/`resolveToneLaw` must therefore surface
 * `ampSpacing`'s own caveat at the descriptor default (`nesting:'single'`)
 * — not silently show nothing, as U4/U5's survivors correctly did — and
 * swap to `weaveDepth`'s distinct caveat once `nesting:'nested'` is picked.
 * See the "U7 caveat" describe block below, and
 * tests/unit/scene3d-fill-style-effective-law.test.js (the shared U5b-3
 * cross-check, extended here rather than duplicated in a private test).
 *
 * (b) `ampSpacing` is the survivor, and F1-placement's ruled condition 4
 * (docs/3d-audit/STILL-OPEN.md, fill-audit-a2 lane) requires `ampSpacing`
 * and the rest of the WV6 family to render BYTE-IDENTICAL — a live ruling
 * on another lane depends on that exact law being unaffected by this fold.
 * U1-U5's aggregate 48-law sweep (test 4, U0 block) only ever proved this on
 * ONE cell (torus+hatch+med default density, sphere-only geometry via
 * captureOpts). The "U7 multi-primitive x multi-density" describe block
 * below extends that proof across every primitive the audit's own capture
 * script (scripts/audit/scene3d-capture.js: TIER_B_PRIMITIVES minus `box`,
 * which is unreachable for ampSpacing/weaveDepth per
 * docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl) x every density it
 * sweeps (DENSITY_VALUES low/med/max) can reach — sphere/torus/cone x
 * low/med/max, 9 combinations, not just 1.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeSingleParamCluster('Scene3D tone-law collapse — U7 (C-07, ampSpacing/nesting)', {
  survivor: 'ampSpacing',
  key: 'nesting',
  pickerIdsLength: 34,
  folded: [
    { id: 'weaveDepth', value: 'nested' },
  ],
});

describe('Scene3D tone-law collapse — U7 caveat: BOTH the survivor (ampSpacing) AND the folded law (weaveDepth) carry real, DIFFERENT measured caveats', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct: ampSpacing and weaveDepth each carry their own non-empty, DISTINCT caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const survivorCaveat = FS.note('ampSpacing').caveat;
    const foldedCaveat = FS.note('weaveDepth').caveat;
    expect(survivorCaveat.length).toBeGreaterThan(0);
    expect(foldedCaveat.length).toBeGreaterThan(0);
    // Distinct — this is the first cluster in the chain where the survivor's
    // OWN default state also carries a real caveat, so a naive "resolve to
    // the survivor and stop" would show the WRONG one of the two, not none.
    expect(survivorCaveat).not.toBe(foldedCaveat);
    // U7-2 copy re-pin: the caveats no longer carry the internal term
    // "single-weight" (plain-language pass) — both now say, in user words,
    // that the line's weight is not constant along its length.
    expect(survivorCaveat).toMatch(/weight.*(?:isn't constant|varies)/);
    expect(foldedCaveat).toMatch(/weight (?:varies|isn't constant)/);
  });

  test('effectiveLaw: nesting default (single) shows ampSpacing\'s OWN caveat (unlike U4/U5, this is NOT empty)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('ampSpacing', { nesting: 'single' })).toBe('ampSpacing');
    expect(FS.effectiveLaw('ampSpacing', {})).toBe('ampSpacing');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', {})).caveat;
    expect(caveat).toBe(FS.note('ampSpacing').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('effectiveLaw: nesting=nested resolves to weaveDepth, surfacing ITS distinct caveat, not ampSpacing\'s', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('ampSpacing', { nesting: 'nested' })).toBe('weaveDepth');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', { nesting: 'nested' })).caveat;
    expect(caveat).toBe(FS.note('weaveDepth').caveat);
    expect(caveat).not.toBe(FS.note('ampSpacing').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('resolveToneLaw (engine) agrees with effectiveLaw (config) on both states — the U5b-3 cross-check\'s own generic sweep already covers this by construction; re-asserted directly here for the two states this unit\'s caveat depends on', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const Params = runtime.window.Vectura.Scene3D.Params;
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe(FS.effectiveLaw('ampSpacing', {}));
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', nesting: 'nested' })).toBe(FS.effectiveLaw('ampSpacing', { nesting: 'nested' }));
  });
});

describe('Scene3D tone-law collapse — U7 multi-primitive x multi-density: ampSpacing byte-identity (F1-placement ruled condition 4)', () => {
  // NOT the single-cell captureOpts every earlier unit in this file uses —
  // parametrized on BOTH primitive and fillDensity so the sweep below can
  // cover every (primitive, density) pair the audit's own gallery capture
  // script reaches for ampSpacing/weaveDepth (scripts/audit/scene3d-capture.js
  // TIER_B_PRIMITIVES minus `box`, DENSITY_VALUES). `box`/`plane`/`solid` are
  // excluded: ampSpacing/weaveDepth are wave-family laws dispatched off
  // SurfaceFill's parametric chart, which box/plane/solid do not have
  // (confirmed unreachable in docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl
  // — "primitive":"box","mapper":"hatch","style":"ampSpacing","status":"unreachable",
  // same for weaveDepth).
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };

  const captureOpts = (primitive, densityValue) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive, params: { ...(PPD[primitive] || {}) },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: densityValue } }, byObject: {}, byFace: {} };
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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  // Condition (b): the FOLD is correct (ampSpacing+nesting:'nested' renders
  // byte-identically to the legacy weaveDepth id) across all 9
  // (primitive, density) pairs — not just the single torus+hatch+med cell
  // the plan's own §1 table cites. This is IN-TREE evidence (both paths run
  // in the same process, same tree); the cross-tree "did adding the
  // COLLAPSE row perturb ampSpacing's OWN bare rendering at all" proof
  // (git HEAD blob vs working tree, 9/9 identical) is evidence-only —
  // reported in docs/3d-audit/fill-audit/after/U7/report.json, not
  // repeated here as a permanent test, because within one process
  // `SF.buildObject({toneLaw:'ampSpacing'})` never even reads
  // STYLE_PARAMS/ALIASES (only `resolveToneLaw` does, and this test calls
  // that explicitly) — there is no in-tree way to "un-fold" ampSpacing's
  // own dispatch to compare against, only a cross-tree one.
  test('the fold (ampSpacing+nesting:nested === legacy weaveDepth) is byte-identical across every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        const resolved = Params.resolveToneLaw({ toneLaw: 'ampSpacing', nesting: 'nested' });
        if (resolved !== 'weaveDepth') { offenders.push(`${primitive}__${densityKey}: resolved to "${resolved}", not weaveDepth`); return; }
        const viaSurvivor = JSON.stringify(SF.buildObject({ ...opts, toneLaw: resolved }));
        const viaLegacy = JSON.stringify(SF.buildObject({ ...opts, toneLaw: 'weaveDepth' }));
        if (viaSurvivor !== viaLegacy) offenders.push(`${primitive}__${densityKey}: fold diverged from legacy weaveDepth`);
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  // The bare survivor (nesting at its own default, or the key entirely
  // absent) is untouched across every combination too — the same invariant
  // describeSingleParamCluster's own "byte-identity" test asserts on one
  // cell, extended here to all 9.
  test('the bare survivor (nesting:single, or omitted) resolves to itself, unaffected by geometry or density', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe('ampSpacing');
        expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', nesting: 'single' })).toBe('ampSpacing');
        const direct = JSON.stringify(SF.buildObject({ ...opts, toneLaw: 'ampSpacing' }));
        const resolved = JSON.stringify(SF.buildObject({ ...opts, toneLaw: Params.resolveToneLaw({ toneLaw: 'ampSpacing' }) }));
        expect(resolved).toBe(direct);
      });
    });
  }, SLOW);
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U8 — C-08 · survivor `interlockWeave` · param `penDown`
 * Folded: onePenDown ('continuous'). Bare option: perRuling->interlockWeave
 * (default). W-22-24-W-18-plan.md §1 "C-08 -> U8":
 *   perRuling (default) -> interlockWeave: 198 paths / 3956.2 mm ink
 *   continuous           -> onePenDown:    106 paths / 4136.2 mm ink
 * "interlockWeave and onePenDown are indistinguishable ragged spike fills
 * ... at every density"; onePenDown's stated purpose is 9 pen-downs vs 36,
 * invisible on paper — paths 198 -> 106 confirms the pen-down saving is
 * real and the picture is not. RED (pre-U8): resolveToneLaw({toneLaw:
 * 'interlockWeave', penDown:'continuous'}) returns 'interlockWeave'
 * unchanged (no STYLE_PARAMS.interlockWeave descriptor) -- rendering
 * diverges from onePenDown's own picture. GREEN below closes it.
 * `trochoidLoop` is NOT folded (333 paths / 4422.7 mm, 12% more ink,
 * "polygon shards") -- the plan says resolve after handoff item A lands;
 * left as its own row, not touched by this unit.
 *
 * (a) Per LEDGER.md row 12b ("carry U7's finding forward"): BOTH
 * `interlockWeave` (survivor) AND `onePenDown` (folded) carry their own
 * real, DIFFERENT measured caveats (docs/tone-laws/laws.json) -- the same
 * situation U7 hit first (unlike U1-U5, where only the folded id had a
 * caveat). `effectiveLaw`/`resolveToneLaw` must surface `interlockWeave`'s
 * own caveat at the descriptor default (`penDown:'perRuling'`), and swap to
 * `onePenDown`'s distinct caveat once `penDown:'continuous'` is picked --
 * verified in the "U8 caveat" describe block below, and cross-checked
 * against the shared U5b-3/U7 file
 * (tests/unit/scene3d-fill-style-effective-law.test.js).
 *
 * (b) Both `interlockWeave` and `onePenDown` are wave-family laws
 * (docs/tone-laws/laws.json "family":"wave") and are BOTH unreachable on a
 * box, per docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl (every
 * mapper, both ids) -- the same TIER_B_PRIMITIVES-minus-`box` shape U7's
 * multi-primitive x multi-density sweep used, extended here.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeSingleParamCluster('Scene3D tone-law collapse — U8 (C-08, interlockWeave/penDown)', {
  survivor: 'interlockWeave',
  key: 'penDown',
  pickerIdsLength: 33,
  folded: [
    { id: 'onePenDown', value: 'continuous' },
  ],
  // U9b — `onePenDown` has no shadows.js recipe of its own (it is also a
  // member of shadows.js's own `TONE_LAW_NOT_DISTINGUISHABLE` set, for an
  // independent reason unrelated to this fold — see params.js's
  // `clampShadowToneLaw` comment); the shadow bag resolves it FORWARD to
  // `interlockWeave` instead of the general raw pass-through every other
  // folded id in this file keeps.
  shadowResolvesToSurvivor: ['onePenDown'],
});

describe('Scene3D tone-law collapse — U8 caveat: BOTH the survivor (interlockWeave) AND the folded law (onePenDown) carry real, DIFFERENT measured caveats', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct: interlockWeave and onePenDown each carry their own non-empty, DISTINCT caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const survivorCaveat = FS.note('interlockWeave').caveat;
    const foldedCaveat = FS.note('onePenDown').caveat;
    expect(survivorCaveat.length).toBeGreaterThan(0);
    expect(foldedCaveat.length).toBeGreaterThan(0);
    // Distinct — like U7, this is a cluster where the survivor's OWN
    // default state also carries a real caveat, so a naive "resolve to the
    // survivor and stop" would show the WRONG one of the two, not none.
    expect(survivorCaveat).not.toBe(foldedCaveat);
    // U7-2 copy re-pin: the caveats no longer carry the internal term
    // "single-weight" — both now say, in user words, that the line's weight
    // varies rather than staying constant.
    expect(survivorCaveat).toMatch(/weight.*varies/);
    expect(foldedCaveat).toMatch(/weight varies/);
  });

  test('effectiveLaw: penDown default (perRuling) shows interlockWeave\'s OWN caveat (not empty)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('interlockWeave', { penDown: 'perRuling' })).toBe('interlockWeave');
    expect(FS.effectiveLaw('interlockWeave', {})).toBe('interlockWeave');
    const caveat = FS.note(FS.effectiveLaw('interlockWeave', {})).caveat;
    expect(caveat).toBe(FS.note('interlockWeave').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('effectiveLaw: penDown=continuous resolves to onePenDown, surfacing ITS distinct caveat, not interlockWeave\'s', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('interlockWeave', { penDown: 'continuous' })).toBe('onePenDown');
    const caveat = FS.note(FS.effectiveLaw('interlockWeave', { penDown: 'continuous' })).caveat;
    expect(caveat).toBe(FS.note('onePenDown').caveat);
    expect(caveat).not.toBe(FS.note('interlockWeave').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('resolveToneLaw (engine) agrees with effectiveLaw (config) on both states', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const Params = runtime.window.Vectura.Scene3D.Params;
    expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe(FS.effectiveLaw('interlockWeave', {}));
    expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave', penDown: 'continuous' })).toBe(FS.effectiveLaw('interlockWeave', { penDown: 'continuous' }));
  });
});

describe('Scene3D tone-law collapse — U8 multi-primitive x multi-density: interlockWeave byte-identity', () => {
  // Same shape as U7's own multi-primitive x multi-density sweep (both
  // clusters are wave-family, both unreachable on box per
  // manifest.B.unreachable.jsonl). TIER_B_PRIMITIVES minus `box`.
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };

  const captureOpts = (primitive, densityValue) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive, params: { ...(PPD[primitive] || {}) },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: densityValue } }, byObject: {}, byFace: {} };
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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('the fold (interlockWeave+penDown:continuous === legacy onePenDown) is byte-identical across every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        const resolved = Params.resolveToneLaw({ toneLaw: 'interlockWeave', penDown: 'continuous' });
        if (resolved !== 'onePenDown') { offenders.push(`${primitive}__${densityKey}: resolved to "${resolved}", not onePenDown`); return; }
        const viaSurvivor = JSON.stringify(SF.buildObject({ ...opts, toneLaw: resolved }));
        const viaLegacy = JSON.stringify(SF.buildObject({ ...opts, toneLaw: 'onePenDown' }));
        if (viaSurvivor !== viaLegacy) offenders.push(`${primitive}__${densityKey}: fold diverged from legacy onePenDown`);
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  test('the bare survivor (penDown:perRuling, or omitted) resolves to itself, unaffected by geometry or density', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe('interlockWeave');
        expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave', penDown: 'perRuling' })).toBe('interlockWeave');
        const direct = JSON.stringify(SF.buildObject({ ...opts, toneLaw: 'interlockWeave' }));
        const resolved = JSON.stringify(SF.buildObject({ ...opts, toneLaw: Params.resolveToneLaw({ toneLaw: 'interlockWeave' }) }));
        expect(resolved).toBe(direct);
      });
    });
  }, SLOW);
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
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
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

describe('Scene3D tone-law collapse — U6 caveat: all FOUR members (penInterleave, penPitchMatch, penFacing, penStipple) carry real, non-empty measured caveats', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct: all four ids carry their own non-empty caveat; penStipple\'s and penInterleave\'s are each distinct from every sibling', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const ids = ['penInterleave', 'penPitchMatch', 'penFacing', 'penStipple'];
    const caveats = ids.map((id) => FS.note(id).caveat);
    caveats.forEach((c, i) => expect(c.length, `caveat for ${ids[i]}`).toBeGreaterThan(0));
    // NOT all four are pairwise distinct — measured, not assumed:
    // penPitchMatch and penFacing carry the EXACT SAME "three pens are
    // simulated" sentence (both true, both correctly stating the same real
    // fact) — a genuine duplicate, unlike U7/U8's pairs. penInterleave's own
    // (longer wording) and penStipple's own (the mark-class-move
    // explanation) are each distinct from every other member.
    expect(FS.note('penPitchMatch').caveat).toBe(FS.note('penFacing').caveat);
    [['penInterleave', 'penPitchMatch'], ['penInterleave', 'penFacing'], ['penInterleave', 'penStipple'],
      ['penPitchMatch', 'penStipple'], ['penFacing', 'penStipple']].forEach(([a, b]) => {
      expect(FS.note(a).caveat, `${a} vs ${b}`).not.toBe(FS.note(b).caveat);
    });
    // penStipple's caveat is the mark-class-move explanation, not the bare
    // three-pens-simulated restatement its siblings carry.
    expect(FS.note('penStipple').caveat).toMatch(/Parallel hatching/);
    expect(FS.note('penStipple').caveat).toMatch(/dot/i);
  });

  test('effectiveLaw: penMode default (interleave, or omitted) shows penInterleave\'s OWN caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('penInterleave', {})).toBe('penInterleave');
    expect(FS.effectiveLaw('penInterleave', { penMode: 'interleave' })).toBe('penInterleave');
    const caveat = FS.note(FS.effectiveLaw('penInterleave', {})).caveat;
    expect(caveat).toBe(FS.note('penInterleave').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('effectiveLaw: each of the three non-default penMode values resolves to its OWN law, surfacing its OWN distinct caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const CASES = [
      { penMode: 'pitchMatch', law: 'penPitchMatch' },
      { penMode: 'facing', law: 'penFacing' },
      { penMode: 'stipple', law: 'penStipple' },
    ];
    CASES.forEach(({ penMode, law }) => {
      expect(FS.effectiveLaw('penInterleave', { penMode })).toBe(law);
      const caveat = FS.note(FS.effectiveLaw('penInterleave', { penMode })).caveat;
      expect(caveat).toBe(FS.note(law).caveat);
      expect(caveat).not.toBe(FS.note('penInterleave').caveat);
      expect(caveat.length).toBeGreaterThan(0);
    });
  });

  test('resolveToneLaw (engine) agrees with effectiveLaw (config) on all four states', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const Params = runtime.window.Vectura.Scene3D.Params;
    expect(Params.resolveToneLaw({ toneLaw: 'penInterleave' })).toBe(FS.effectiveLaw('penInterleave', {}));
    ['pitchMatch', 'facing', 'stipple'].forEach((penMode) => {
      expect(Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode }))
        .toBe(FS.effectiveLaw('penInterleave', { penMode }));
    });
  });
});

describe('Scene3D tone-law collapse — U6 multi-primitive x multi-density: penInterleave/penPitchMatch/penFacing/penStipple byte-identity', () => {
  // Same shape as U7's/U8's own multi-primitive x multi-density sweep.
  // Unlike U7/U8 (wave-family, unreachable on box for every mapper), this
  // cluster's threePen family is unreachable on box even at the 'hatch'
  // mapper (docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl) — same
  // TIER_B_PRIMITIVES-minus-box exclusion, confirmed against the manifest,
  // not assumed.
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };
  const FOLDED = [
    { id: 'penPitchMatch', penMode: 'pitchMatch' },
    { id: 'penFacing', penMode: 'facing' },
    { id: 'penStipple', penMode: 'stipple' },
  ];

  const captureOpts = (primitive, densityValue) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive, params: { ...(PPD[primitive] || {}) },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: densityValue } }, byObject: {}, byFace: {} };
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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('every fold (survivor+penMode === legacy folded id) is byte-identical across every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        FOLDED.forEach(({ id, penMode }) => {
          const resolved = Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode });
          if (resolved !== id) { offenders.push(`${primitive}__${densityKey}__${penMode}: resolved to "${resolved}", not ${id}`); return; }
          const viaSurvivor = JSON.stringify(SF.buildObject({ ...opts, toneLaw: resolved }));
          const viaLegacy = JSON.stringify(SF.buildObject({ ...opts, toneLaw: id }));
          if (viaSurvivor !== viaLegacy) offenders.push(`${primitive}__${densityKey}: fold diverged from legacy ${id}`);
        });
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  test('the bare survivor (penMode:interleave, or omitted) resolves to itself, unaffected by geometry or density', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'penInterleave' })).toBe('penInterleave');
        expect(Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode: 'interleave' })).toBe('penInterleave');
        const direct = JSON.stringify(SF.buildObject({ ...opts, toneLaw: 'penInterleave' }));
        const resolved = JSON.stringify(SF.buildObject({ ...opts, toneLaw: Params.resolveToneLaw({ toneLaw: 'penInterleave' }) }));
        expect(resolved).toBe(direct);
      });
    });
  }, SLOW);
});

/*
 * MERGE CHECKLIST item 8 (integration r2, 2026-09-10) — re-run U1..U5's
 * survivor/folded pairs through U7's multi-primitive x multi-density harness.
 *
 * WHY THIS EXISTS. U1-U5 each proved their byte-identity claim on ONE cell:
 * a sphere, at a single unparametrized `fillDensity` (60 for U1/U5, the
 * describeSingleParamCluster default for U2/U3/U4). U7 was the first fold in
 * the chain to DIMENSION that claim (sphere/torus/cone x low/med/max), and it
 * only did so because F1-placement's ruled condition 4 depends on `ampSpacing`
 * specifically. U8 then copied U7's shape. That left five clusters proven to a
 * strictly weaker bar than the sixth and seventh. This block closes the
 * asymmetry using the SAME harness shape, the same three primitives and the
 * same three densities.
 *
 * HONEST SCOPE, so nobody over-reads it. In-process, `resolveToneLaw(survivor
 * + folded params)` returns the folded id itself, so the fold leg's two
 * `SF.buildObject` calls receive an identical argument — that leg proves the
 * RESOLUTION is correct at every (primitive, density) pair and that the render
 * is deterministic, exactly as U7's and U8's own fold legs do. The leg that
 * carries real geometric weight is the BARE-SURVIVOR one: the survivor with
 * its sub-control at the default (and with the key absent entirely) must
 * render byte-identically to the pre-collapse survivor across all nine pairs.
 * `box`/`plane`/`solid` are excluded for the same reason U7 excludes them
 * (no parametric chart; see U7's block).
 */
describe('Scene3D tone-law collapse — U1..U5 multi-primitive x multi-density (MERGE CHECKLIST item 8)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD; let R;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };
  const SURVIVORS = ['ladder', 'taperedEnds', 'weightModulated', 'bundleCount', 'contFieldSigmoid'];
  const optsCache = new Map();

  const captureOpts = (primitive, densityValue) => {
    const ck = `${primitive}__${densityValue}`;
    if (optsCache.has(ck)) return optsCache.get(ck);
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive, params: { ...(PPD[primitive] || {}) },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: densityValue } }, byObject: {}, byFace: {} };
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
    optsCache.set(ck, best.opts);
    return best.opts;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
    R = V.SCENE3D_TONE_LAWS;
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('every U1..U5 fold resolves to its own legacy id, and renders identically to it, at every reachable primitive x density pair', () => {
    const offenders = [];
    const folds = Object.keys(R.ALIASES)
      .map((id) => ({ id, into: R.ALIASES[id].into, params: R.ALIASES[id].params }))
      .filter((f) => SURVIVORS.indexOf(f.into) !== -1);
    // 13 folds across the five clusters: ladder 3, taperedEnds 2,
    // weightModulated 1, bundleCount 3, contFieldSigmoid 4.
    expect(folds.length).toBe(13);
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        folds.forEach((f) => {
          const resolved = Params.resolveToneLaw({ toneLaw: f.into, ...f.params });
          if (resolved !== f.id) {
            offenders.push(`${primitive}__${densityKey}__${f.into}+${JSON.stringify(f.params)}: resolved to "${resolved}", not ${f.id}`);
            return;
          }
          const viaSurvivor = JSON.stringify(SF.buildObject({ ...opts, toneLaw: resolved }));
          const viaLegacy = JSON.stringify(SF.buildObject({ ...opts, toneLaw: f.id }));
          if (viaSurvivor !== viaLegacy) offenders.push(`${primitive}__${densityKey}: fold diverged from legacy ${f.id}`);
        });
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  test('every U1..U5 bare survivor (sub-control at its default, or omitted) resolves to itself and renders identically, unaffected by geometry or density', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        SURVIVORS.forEach((survivor) => {
          const descriptors = R.STYLE_PARAMS[survivor] || [];
          expect(descriptors.length).toBeGreaterThan(0);
          const defaultsBag = {};
          descriptors.forEach((d) => { defaultsBag[d.key] = d.default; });
          if (Params.resolveToneLaw({ toneLaw: survivor }) !== survivor) offenders.push(`${primitive}__${densityKey}__${survivor}: bare id did not resolve to itself`);
          if (Params.resolveToneLaw({ toneLaw: survivor, ...defaultsBag }) !== survivor) offenders.push(`${primitive}__${densityKey}__${survivor}: explicit defaults did not resolve to itself`);
          const direct = JSON.stringify(SF.buildObject({ ...opts, toneLaw: survivor }));
          const viaResolve = JSON.stringify(SF.buildObject({ ...opts, toneLaw: Params.resolveToneLaw({ toneLaw: survivor, ...defaultsBag }) }));
          if (direct !== viaResolve) offenders.push(`${primitive}__${densityKey}__${survivor}: bare survivor render moved`);
        });
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);
});

/*
 * U7-2 — plain-language pass over EVERY remaining folded fill-law caveat
 * (and the two jargon-free-on-inspection ones this pass left untouched:
 * `none`/"NO TONE" got a light polish too, of the 20 laws.json entries that
 * ever had a caveat, 3 were already rewritten to plain language before this
 * unit — bundleDither/contFieldTouch by U5b-2, penStipple by U6 — this unit
 * rewrote the remaining 17: deepFillTSP, bundleSubNib, penInterleave,
 * penReserve, penCross, penPitchMatch, penFacing, ampSpacing, weaveDepth,
 * interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, mezzoRegion,
 * dutyConst, endShorten, and "none" (NO TONE). See
 * docs/3d-audit/lane-reports/U7-2-impl.md for the full old -> new table.
 *
 * `docs/tone-laws/laws.json` is the SOURCE of `BY_ID[id].caveat`
 * (regenerated into src/config/scene3d-tone-laws.js by
 * `node scripts/build-tone-laws.js`). Each rewritten entry also gained a
 * NEW `measured` field on the laws.json source object, holding the original
 * audit-prose caveat verbatim so the measured evidence is not lost — that
 * field is deliberately NOT picked up by build-tone-laws.js's `BY_ID[id] = {...}`
 * literal (see that file's own comment beside the `caveat:` line), so it
 * never reaches src/config/scene3d-tone-laws.js and therefore cannot render
 * anywhere a UI surface reads from `SCENE_FILL_STYLES.note()`/`entry()`.
 */
describe('Scene3D tone-law collapse — U7-2 (plain-language pass over every remaining caveat)', () => {
  let runtime; let FS; let R;
  const REWRITTEN_IDS = [
    'none', 'deepFillTSP', 'bundleSubNib', 'penInterleave', 'penReserve', 'penCross',
    'penPitchMatch', 'penFacing', 'ampSpacing', 'weaveDepth', 'interlockWeave',
    'trochoidLoop', 'amplitudeOnly', 'onePenDown', 'mezzoRegion', 'dutyConst', 'endShorten',
  ];
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  // RGR proof: RED against the pre-U7-2 tree (every id below carried at
  // least one of these tokens — R2/L*/RMS/percentages/mm measurements/
  // function names/file names/"CONTROL/REFUTATION"/bare cell-name tokens
  // like "sphere·hatch"); GREEN once laws.json's caveat fields are
  // rewritten and scene3d-tone-laws.js is regenerated.
  test('none of the 17 rewritten caveats carry raw audit statistics, internal jargon, or bare cell-name tokens', () => {
    const jargon = /\bRMS\b|\bR2\b|\bR²\b|L\*|·hatch|·crosshatch|·contour|CONTROL\/REFUTATION|WEIGHT_LAWS|isWaveLaw|splitsAlongLine|\bpenId\b|scene3d\.js|surface-fill\.js|single-weight|\bmm\b|\d+(?:\.\d+)?%|\bgated samples\b|\bStage 0\b/i;
    REWRITTEN_IDS.forEach((id) => {
      const caveat = FS.note(id).caveat;
      expect(caveat.length, `caveat for ${id}`).toBeGreaterThan(0);
      expect(caveat, `caveat for ${id}`).not.toMatch(jargon);
    });
  });

  // Style match: U5b-2's own precedent aimed for <=2 sentences. A few of
  // these 17 carried two genuinely distinct measured warnings that do not
  // compress losslessly into one — allow up to 3, but never more.
  test('every rewritten caveat is at most 3 sentences', () => {
    const sentenceCount = (s) => (s.match(/[.!?](?:\s|$)/g) || []).length;
    REWRITTEN_IDS.forEach((id) => {
      const caveat = FS.note(id).caveat;
      expect(sentenceCount(caveat), `${id}: "${caveat}"`).toBeLessThanOrEqual(3);
    });
  });

  // Every rewritten law kept a `measured` field on its laws.json source
  // entry (the original audit-prose caveat, verbatim) — proving the
  // evidence was archived, not deleted — and that field is provably absent
  // from the generated, UI-facing roster.
  test('a `measured` field archives the original audit caveat for every rewritten id, and never reaches the generated roster', () => {
    const fs = require('fs');
    const path = require('path');
    const lawsJsonPath = path.join(__dirname, '../../docs/tone-laws/laws.json');
    const doc = JSON.parse(fs.readFileSync(lawsJsonPath, 'utf8'));
    const mapId = (id) => (id === 'NO TONE' ? 'none' : id);
    const byId = {};
    doc.laws.forEach((law) => { byId[mapId(law.id)] = law; });
    REWRITTEN_IDS.forEach((id) => {
      const law = byId[id];
      expect(law, id).toBeTruthy();
      expect(typeof law.measured, `${id}.measured`).toBe('string');
      expect(law.measured.length, `${id}.measured`).toBeGreaterThan(0);
      // The archived text is NOT the live caveat (it is the ORIGINAL,
      // jargon-heavy one this unit replaced).
      expect(law.measured).not.toBe(law.caveat);
    });
    // Never rendered: the generated file has no `measured` key at all.
    const generatedPath = path.join(__dirname, '../../src/config/scene3d-tone-laws.js');
    const generatedSrc = fs.readFileSync(generatedPath, 'utf8');
    expect(generatedSrc).not.toMatch(/"measured"/);
  });

  // Distinctness the fold clusters depend on (U7/U8/U6's own rulings)
  // survives the rewrite: ampSpacing vs weaveDepth, interlockWeave vs
  // onePenDown, and the deliberate penPitchMatch === penFacing duplicate.
  test('cross-cluster distinctness survives the rewrite', () => {
    expect(FS.note('ampSpacing').caveat).not.toBe(FS.note('weaveDepth').caveat);
    expect(FS.note('interlockWeave').caveat).not.toBe(FS.note('onePenDown').caveat);
    expect(FS.note('penPitchMatch').caveat).toBe(FS.note('penFacing').caveat);
    expect(FS.note('penInterleave').caveat).not.toBe(FS.note('penPitchMatch').caveat);
  });

  // Each caveat still references the option the user can actually act on,
  // in the picker's own wording — matching U5b-2's "point back at what they
  // can DO about the warning" precedent.
  test('sub-control-facing caveats name the actual UI option values', () => {
    expect(FS.note('bundleSubNib').caveat).toMatch(/Bundle · Count/);
    expect(FS.note('weaveDepth').caveat).toMatch(/Single wave row|Nested rows/);
    expect(FS.note('onePenDown').caveat).toMatch(/One stroke per ruling/);
  });

  // BY_ID-direct (not just FS.note()) still carries the rewritten text —
  // the roster corpus itself changed, not just a display-layer filter.
  // FS.note() prepends SIMULATED_NOTE for the six threePen-family ids, so
  // compare with that prefix stripped for those, verbatim for the rest.
  test('BY_ID-direct lookups reflect the rewrite (the roster corpus itself changed)', () => {
    REWRITTEN_IDS.forEach((id) => {
      const direct = R.BY_ID[id].caveat;
      expect(direct.length, id).toBeGreaterThan(0);
      const viaNote = FS.note(id).caveat;
      const expected = FS.entry(id).simulated ? `${FS.SIMULATED_NOTE} ${direct}` : direct;
      expect(viaNote, id).toBe(expected);
    });
  });
});
