/**
 * Shared scaffolding for the split tests/audit/scene3d-tone-law-collapse-*.test.js
 * files (formerly one 2130-line file). Holds the fixture helpers, constants and
 * the two RGR cluster templates. Each audit file loads its own runtime.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('./load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));
const freezeDeep = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => freezeDeep(child, seen));
  return Object.freeze(value);
};
const cloneFixture = (value) => {
  if (Array.isArray(value)) return value.map(cloneFixture);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneFixture(child)]));
};
const createCapturedOptionsCache = () => {
  // Reuse only an immutable captured-options fixture from the exact scene,
  // bounds, and generator implementation. Return a fresh copy so each test
  // retains its own options bag for mutation and render assertions.
  const byGenerator = new WeakMap();
  return (generate, buildObject, scene, bounds, capture) => {
    let byBuilder = byGenerator.get(generate);
    if (!byBuilder) {
      byBuilder = new WeakMap();
      byGenerator.set(generate, byBuilder);
    }
    let fixtures = byBuilder.get(buildObject);
    if (!fixtures) {
      fixtures = new Map();
      byBuilder.set(buildObject, fixtures);
    }
    const key = JSON.stringify({ scene, bounds });
    if (!fixtures.has(key)) fixtures.set(key, freezeDeep(cloneFixture(capture())));
    return cloneFixture(fixtures.get(key));
  };
};
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
const SLOW = 600000;


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
// U9b-2 — records every `shadowResolvesToSurvivor` array actually passed to
// this template across all 6 call sites (only U8's names anything today), so
// a tail test (see "U9b-2 — shadowResolvesToSurvivor coupling" below) can
// assert the DECLARED set matches what `Shadows.toneLawApplies` independently
// computes from the shipped roster, rather than trusting each call site by
// eye. The coupling between "add a folded id here" and "shadows.js actually
// judges it not-distinguishable" stays a MANUAL edit (no code derives one
// from the other) — this recorder only makes a forgotten/stale entry fail
// loudly instead of silently.
const RECORDED_SHADOW_RESOLVES_TO_SURVIVOR = [];

// The original single file saw every call site in one process. After the split each
// file records only its own calls, so the U9b-2 coupling test also scans the sibling
// audit sources for declared `shadowResolvesToSurvivor: [...]` literals.
function recordedShadowResolvesToSurvivor() {
  const dir = path.resolve(__dirname, '../audit');
  const declared = [];
  fs.readdirSync(dir).filter((f) => /^scene3d-tone-law-collapse.*\.test\.js$/.test(f)).forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /^\s*shadowResolvesToSurvivor:\s*\[([^\]]*)\]/gm;
    let m;
    while ((m = re.exec(src))) (m[1].match(/'([^']+)'/g) || []).forEach((q) => declared.push(q.slice(1, -1)));
  });
  return [...RECORDED_SHADOW_RESOLVES_TO_SURVIVOR, ...declared];
}

function describeSingleParamCluster(label, {
  survivor, key, pickerIdsLength, folded, shadowResolvesToSurvivor,
}) {
  RECORDED_SHADOW_RESOLVES_TO_SURVIVOR.push(...(shadowResolvesToSurvivor || []));
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
      expect(sanitized.sceneVersion).toBe(5);
      const migrated = sanitized.styleTable.byObject['obj-1'].params;
      expect(migrated.toneLaw).toBe(survivor);
      expect(migrated[key]).toBe(first.value);
    });
  });
}


/*
 * U5 (fill-style review) — shared template for the COMBINATION clusters: a survivor whose
 * sub-controls pick an engine law by a PATTERN of values (ENTRIES), not by one key. Same
 * assertion set as describeSingleParamCluster, plus the retired sub-control keys
 * (`legacyBags`: a pre-U5 saved style bag -> the id it drew).
 */
function describeComboCluster(label, {
  survivor, folded, legacyBags, markClassException, shadowForward,
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
      p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
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
      try { algo.generate(p, null, null, BOUNDS); } finally { SF.buildObject = orig; }
      let best = calls[0];
      for (const c of calls) if ((c.result || []).length > (best.result || []).length) best = c;
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

    test(`every folded id leaves PICKER_IDS but stays in IDS (48) — survivor "${survivor}" stays offered`, () => {
      const R = roster();
      expect(R.IDS.length).toBe(48);
      folded.forEach(({ id }) => {
        expect(R.IDS.indexOf(id)).not.toBe(-1);
        expect(R.PICKER_IDS.indexOf(id)).toBe(-1);
      });
      expect(R.ALIASES[survivor]).toBeUndefined();
      if (survivor !== 'ladder') expect(R.PICKER_IDS.indexOf(survivor)).not.toBe(-1);
    });

    test('ALIASES: every folded id maps into the survivor with exactly its combination of sub-control values', () => {
      folded.forEach(({ id, params }) => {
        expect(roster().ALIASES[id]).toEqual({ into: survivor, params });
      });
    });

    test('resolution: survivor + params draws the legacy id, byte-identical; the bare survivor is untouched', () => {
      folded.forEach(({ id, params }) => {
        const resolved = Params.resolveToneLaw({ toneLaw: survivor, ...params });
        expect(resolved).toBe(id);
        expect(roster().analyse(survivor, params).ok).toBe(true);
        expect(JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: resolved })))
          .toBe(JSON.stringify(SF.buildObject({ ...hatchOpts, toneLaw: id })));
      });
      expect(Params.resolveToneLaw({ toneLaw: survivor })).toBe(survivor);
    }, SLOW);

    test('mark class and Stroke Fill eligibility are constant across the cluster (§2.4 invariant), bar the declared exceptions', () => {
      const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
      const SFS = runtime.window.Vectura.STROKE_FILL_STYLES;
      folded.forEach(({ id }) => {
        if (!(markClassException || []).includes(id)) expect(FS.markClass(id), id).toBe(FS.markClass(survivor));
        expect(SFS.RIBBON_LAWS.indexOf(id) !== -1, id).toBe(SFS.RIBBON_LAWS.indexOf(survivor) !== -1);
        expect(SFS.PEN_LAWS.indexOf(id) !== -1, id).toBe(SFS.PEN_LAWS.indexOf(survivor) !== -1);
      });
    });

    test('migration: a style bag naming a folded id normalizes to survivor + params and draws the same law; an explicit sibling is never clobbered', () => {
      folded.forEach(({ id, params }) => {
        const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } });
        expect(out.params.toneLaw).toBe(survivor);
        Object.keys(params).forEach((k) => expect(out.params[k], `${id}.${k}`).toBe(params[k]));
        expect(Params.resolveToneLaw(out.params), id).toBe(id);
      });
      const first = folded.find((f) => Object.keys(f.params).length > 0);
      const key = Object.keys(first.params)[0];
      const dflt = roster().STYLE_PARAMS[survivor].find((d) => d.key === key).default;
      const out2 = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: first.id, [key]: dflt } });
      expect(out2.params.toneLaw).toBe(survivor);
      expect(out2.params[key]).toBe(dflt);
    });

    test('retired sub-control keys: a pre-U5 saved bag migrates to the id it drew, and the old keys are dropped', () => {
      (legacyBags || []).forEach(({ bag, id }) => {
        const out = Params.normalizeStyle({ mapper: 'hatch', params: { ...bag } });
        expect(Params.resolveToneLaw(out.params), JSON.stringify(bag)).toBe(id);
        ['bandProfile', 'nesting', 'fieldFloor'].forEach((k) => expect(out.params[k], k).toBeUndefined());
      });
    });

    test('shadowToneLaw carrying a folded id passes through unchanged (its own recipe), bar the roster\'s SHADOW_FORWARD ids; never warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        folded.forEach(({ id }) => {
          const Sh = runtime.window.Vectura.Scene3D.Shadows;
          const expected = (roster().SHADOW_FORWARD || {})[id] || id;
          expect(Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw, id).toBe(expected);
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
      folded.forEach(({ id, params }) => {
        const sanitized = Params.sanitizeSceneParams({
          objects: [{ id: 'obj-1', primitive: 'sphere', params: { radius: 30 } }],
          styleTable: { scene: { mapper: 'hatch', params: {} }, byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: id } } }, byFace: {} },
        });
        const migrated = sanitized.styleTable.byObject['obj-1'].params;
        expect(migrated.toneLaw).toBe(survivor);
        expect(Params.resolveToneLaw(migrated), id).toBe(id);
        Object.keys(params).forEach((k) => expect(migrated[k]).toBe(params[k]));
      });
    });
  });
}

module.exports = {
  loadVecturaRuntime, clone, freezeDeep, cloneFixture, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW, describeSingleParamCluster, describeComboCluster,
  recordedShadowResolvesToSurvivor,
};
