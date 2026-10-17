const {
  loadScene3dAuditRuntime, clone, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part C (U8): see scene3d-tone-law-collapse-c-sweeps.test.js for U7.

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
// U8 (interlockWeave / onePenDown) is part of the Wave cluster above (U5: M4).

// U7-2b: same bounded-proximity fix as SURVIVOR_WEIGHT_CLAIM_U7 above, for the
// U8 survivor (interlockWeave says "weight also varies" — 1 intervening word).
const SURVIVOR_WEIGHT_CLAIM_U8 = /\bweight\b(?:\s+\S+){0,1}\s+varies\b/;

describe('Scene3D tone-law collapse — U8 caveat: BOTH the survivor (interlockWeave) AND the folded law (onePenDown) carry real, DIFFERENT measured caveats', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
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
    // U7-2b: bounded proximity match, see SURVIVOR_WEIGHT_CLAIM_U8 above.
    expect(survivorCaveat).toMatch(SURVIVOR_WEIGHT_CLAIM_U8);
    expect(foldedCaveat).toMatch(/weight varies/);
  });

  test('U7-2b: the tightened survivor regex does not match unrelated weight/varies prose (reviewer decoy)', () => {
    const decoy = 'The weight and shipping cost varies by region.';
    expect(decoy).not.toMatch(SURVIVOR_WEIGHT_CLAIM_U8);
  });

  test('effectiveLaw: penDown default (perRuling) shows interlockWeave\'s OWN caveat (not empty)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('ampSpacing', { wavePhase: 'anti', penDown: 'perRuling' })).toBe('interlockWeave');
    expect(FS.effectiveLaw('ampSpacing', { wavePhase: 'anti' })).toBe('interlockWeave');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', { wavePhase: 'anti' })).caveat;
    expect(caveat).toBe(FS.note('interlockWeave').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('effectiveLaw: penDown=continuous resolves to onePenDown, surfacing ITS distinct caveat, not interlockWeave\'s', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('ampSpacing', { penDown: 'continuous' })).toBe('onePenDown');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', { penDown: 'continuous' })).caveat;
    expect(caveat).toBe(FS.note('onePenDown').caveat);
    expect(caveat).not.toBe(FS.note('interlockWeave').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('resolveToneLaw (engine) agrees with effectiveLaw (config) on both states', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const Params = runtime.window.Vectura.Scene3D.Params;
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', wavePhase: 'anti' })).toBe(FS.effectiveLaw('ampSpacing', { wavePhase: 'anti' }));
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', penDown: 'continuous' })).toBe(FS.effectiveLaw('ampSpacing', { penDown: 'continuous' }));
  });
});

describe('Scene3D tone-law collapse — U8 multi-primitive x multi-density: interlockWeave resolution and draws', () => {
  // Same shape as U7's own multi-primitive x multi-density sweep (both
  // clusters are wave-family, both unreachable on box per
  // manifest.B.unreachable.jsonl). TIER_B_PRIMITIVES minus `box`.
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };
  const capturedOptions = createCapturedOptionsCache();

  const captureOpts = (primitive, densityValue, fresh = false) => {
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
    const capture = () => {
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
    return fresh ? capture() : capturedOptions(algo.generate, SF.buildObject, p, BOUNDS, capture);
  };

  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('the fold resolves to legacy onePenDown at every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        const resolved = Params.resolveToneLaw({ toneLaw: 'ampSpacing', penDown: 'continuous' });
        if (resolved !== 'onePenDown') { offenders.push(`${primitive}__${densityKey}: resolved to "${resolved}", not onePenDown`); return; }
        const canonicalDraw = SF.buildObject({ ...opts, toneLaw: resolved });
        if (canonicalDraw.length === 0) offenders.push(`${primitive}__${densityKey}: onePenDown produced no paths`);
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  test('the bare survivor resolves to itself at every primitive x density pair', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe('interlockWeave');
        expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave', penDown: 'perRuling' })).toBe('interlockWeave');
        const canonicalDraw = SF.buildObject({ ...opts, toneLaw: 'interlockWeave' });
        expect(canonicalDraw.length).toBeGreaterThan(0);
      });
    });
  }, SLOW);
});
