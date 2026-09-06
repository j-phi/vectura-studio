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

  test('4. byte-identity sweep: all 48 laws render identically through the raw id and through resolveToneLaw', () => {
    const offenders = [];
    roster().IDS.forEach((law) => {
      const rawOut = SF.buildObject({ ...hatchOpts, toneLaw: law });
      const resolved = Params.resolveToneLaw({ toneLaw: law });
      const resolvedOut = SF.buildObject({ ...hatchOpts, toneLaw: resolved });
      if (JSON.stringify(resolvedOut) !== JSON.stringify(rawOut)) offenders.push(law);
    });
    expect(offenders, `these laws diverged through resolveToneLaw: ${offenders.join(', ')}`).toEqual([]);
  }, SLOW);

  test('5. mutation-proof: forcing resolveToneLaw to always return "ladder" breaks all 48 laws', () => {
    const orig = Params.resolveToneLaw;
    let offenders = [];
    Params.resolveToneLaw = () => 'ladder';
    try {
      roster().IDS.forEach((law) => {
        const rawOut = SF.buildObject({ ...hatchOpts, toneLaw: law });
        const forcedOut = SF.buildObject({ ...hatchOpts, toneLaw: Params.resolveToneLaw({ toneLaw: law }) });
        if (JSON.stringify(forcedOut) !== JSON.stringify(rawOut)) offenders.push(law);
      });
    } finally {
      Params.resolveToneLaw = orig;
    }
    // 48, not 47: the shipped default 'ladder' is deliberately NOT one of the
    // roster's 48 ids (FILL_STYLE_DEFAULT_ENTRY's own comment, context-bar.js
    // — it is the value every id in this roster was measured AGAINST), so
    // there is no id in this loop whose own law IS 'ladder' for the mutation
    // to leave alone. Every one of the 48 differs from a forced-'ladder'
    // build (the same property scene3d-tone-law-dispatch.test.js's "every
    // law differs from ladder" guard already establishes for its own list).
    expect(offenders.length).toBe(48);
  }, SLOW);

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

  test('7. clampStyleParam belt-and-brace: the single-key shadowToneLaw path maps an alias to its survivor without warning', () => {
    const R = roster();
    const savedAliases = R.ALIASES;
    R.ALIASES = { syntheticFolded: { into: 'ladder', params: { rungMode: 'fine' } } };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const shadow = Params.normalizeShadow({ shadowToneLaw: 'syntheticFolded' });
      expect(shadow.shadowToneLaw).toBe('ladder');
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

  test('clampStyleParam belt-and-brace: shadowToneLaw carrying a folded id maps to the survivor, never warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      FOLDED.forEach(({ id }) => {
        const shadow = Params.normalizeShadow({ shadowToneLaw: id });
        expect(shadow.shadowToneLaw).toBe('ladder');
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
function describeSingleParamCluster(label, { survivor, key, pickerIdsLength, folded }) {
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

    test('clampStyleParam belt-and-brace: shadowToneLaw carrying a folded id maps to the survivor, never warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        folded.forEach(({ id }) => {
          const shadow = Params.normalizeShadow({ shadowToneLaw: id });
          expect(shadow.shadowToneLaw).toBe(survivor);
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
