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

  test('2. PICKER_IDS === IDS and ALIASES/STYLE_PARAMS === {} — the no-op proof (COLLAPSE is empty in U0)', () => {
    const R = roster();
    expect(Array.isArray(R.PICKER_IDS)).toBe(true);
    expect(R.PICKER_IDS.length).toBe(48);
    expect(R.PICKER_IDS.slice().sort()).toEqual(R.IDS.slice().sort());
    expect(R.ALIASES).toEqual({});
    expect(R.STYLE_PARAMS).toEqual({});
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

  test('8. SCENE_FILL_STYLES.groups()/resolve() are unaffected by an (empty) PICKER_IDS/ALIASES table — 49 options (48 + shipped default)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const groups = FS.groups(null, null, null);
    const total = groups.reduce((acc, g) => acc + g.options.length, 0);
    expect(total).toBe(roster().IDS.length + 1);
    expect(FS.resolve('fineLadder')).toBe('fineLadder'); // no alias exists yet
    expect(FS.styleParams('ladder')).toEqual([]); // no collapse for it yet
  });
});
