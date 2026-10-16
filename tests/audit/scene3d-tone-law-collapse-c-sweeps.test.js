const {
  loadVecturaRuntime, clone, freezeDeep, cloneFixture, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW, describeSingleParamCluster, describeComboCluster,
  recordedShadowResolvesToSurvivor,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part C: U6/U7/U8 caveats and multi-primitive sweeps.


// U7-2b: bounded proximity regex for the survivor-side caveat claim (the U7-2
// reviewer's non-blocking follow-up). The old `/weight.*(?:isn't constant|varies)/`
// let `.*` span the whole rest of the string, so it also matched unrelated
// prose that merely mentions "weight" and "varies"/"isn't constant" far apart
// (verified: a synthetic decoy sentence about pen weight and room humidity
// matched it). Real production text keeps the claim within one word of
// "weight" (0 words in ampSpacing's "weight isn't constant", 1 word — "also"
// — in interlockWeave's "weight also varies" below), so bound the gap instead
// of leaving it open-ended.
const SURVIVOR_WEIGHT_CLAIM_U7 = /\bweight\b(?:\s+\S+){0,1}\s+(?:isn't constant|varies)\b/;

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
    // U7-2b: bounded proximity match, see SURVIVOR_WEIGHT_CLAIM_U7 above.
    expect(survivorCaveat).toMatch(SURVIVOR_WEIGHT_CLAIM_U7);
    expect(foldedCaveat).toMatch(/weight (?:varies|isn't constant)/);
  });

  test('U7-2b: the tightened survivor regex does not match unrelated weight/varies prose (reviewer decoy)', () => {
    // Same shape of decoy the reviewer used to demonstrate the old `.*` was
    // too loose: "weight" and the claim term both appear, but several words
    // apart in an unrelated sentence. The old regex matched this; the
    // bounded regex above must not.
    const decoy = "The weight and overall balance isn't constant across models.";
    expect(decoy).not.toMatch(SURVIVOR_WEIGHT_CLAIM_U7);
  });

  test('effectiveLaw: nesting default (single) shows ampSpacing\'s OWN caveat (unlike U4/U5, this is NOT empty)', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(FS.effectiveLaw('ampSpacing', { wavePhase: 'in' })).toBe('ampSpacing');
    expect(FS.effectiveLaw('ampSpacing', {})).toBe('ampSpacing');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', {})).caveat;
    expect(caveat).toBe(FS.note('ampSpacing').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('effectiveLaw: nesting=nested resolves to weaveDepth, surfacing ITS distinct caveat, not ampSpacing\'s', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const nested = { wavePhase: 'anti', waveAmp: 'solve' };
    expect(FS.effectiveLaw('ampSpacing', nested)).toBe('weaveDepth');
    const caveat = FS.note(FS.effectiveLaw('ampSpacing', nested)).caveat;
    expect(caveat).toBe(FS.note('weaveDepth').caveat);
    expect(caveat).not.toBe(FS.note('ampSpacing').caveat);
    expect(caveat.length).toBeGreaterThan(0);
  });

  test('resolveToneLaw (engine) agrees with effectiveLaw (config) on both states — the U5b-3 cross-check\'s own generic sweep already covers this by construction; re-asserted directly here for the two states this unit\'s caveat depends on', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const Params = runtime.window.Vectura.Scene3D.Params;
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe(FS.effectiveLaw('ampSpacing', {}));
    const nested2 = { wavePhase: 'anti', waveAmp: 'solve' };
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', ...nested2 })).toBe(FS.effectiveLaw('ampSpacing', nested2));
  });
});

describe('Scene3D tone-law collapse — U7 multi-primitive x multi-density: ampSpacing resolution and draws (F1-placement ruled condition 4)', () => {
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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  // Condition (b): resolution reaches the exact legacy weaveDepth id across
  // all 9 (primitive, density) pairs — not just the single torus+hatch+med
  // cell the plan's own §1 table cites. Historical picture parity is covered
  // by the cross-tree audit report; the fresh-run test below checks
  // determinism across representative geometry and density boundaries. The
  // cross-tree "did adding the COLLAPSE row perturb ampSpacing's OWN bare rendering at all" proof
  // (git HEAD blob vs working tree, 9/9 identical) is evidence-only —
  // reported in docs/3d-audit/fill-audit/after/U7/report.json, not
  // repeated here as a permanent test, because within one process
  // `SF.buildObject({toneLaw:'ampSpacing'})` never even reads
  // STYLE_PARAMS/ALIASES (only `resolveToneLaw` does, and this test calls
  // that explicitly) — there is no in-tree way to "un-fold" ampSpacing's
  // own dispatch to compare against, only a cross-tree one.
  test('the fold resolves to legacy weaveDepth at every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        const resolved = Params.resolveToneLaw({ toneLaw: 'ampSpacing', wavePhase: 'anti', waveAmp: 'solve' });
        if (resolved !== 'weaveDepth') { offenders.push(`${primitive}__${densityKey}: resolved to "${resolved}", not weaveDepth`); return; }
        const canonicalDraw = SF.buildObject({ ...opts, toneLaw: resolved });
        if (canonicalDraw.length === 0) offenders.push(`${primitive}__${densityKey}: weaveDepth produced no paths`);
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  // The bare survivor is still resolved at every cell and drawn once. Its
  // render's fresh-run determinism is checked at the three representative
  // geometry/density boundaries below.
  test('the bare survivor resolves to itself at every primitive x density pair', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe('ampSpacing');
        expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', wavePhase: 'in' })).toBe('ampSpacing');
        const canonicalDraw = SF.buildObject({ ...opts, toneLaw: 'ampSpacing' });
        expect(canonicalDraw.length).toBeGreaterThan(0);
      });
    });
  }, SLOW);

  test('fresh production runs are deterministic for folded and bare wave laws at the geometry and density boundaries', () => {
    const cases = [
      { primitive: 'sphere', density: DENSITY_VALUES.low },
      { primitive: 'torus', density: DENSITY_VALUES.med },
      { primitive: 'cone', density: DENSITY_VALUES.max },
    ];
    cases.forEach(({ primitive, density }) => {
      const firstOpts = captureOpts(primitive, density, true);
      const secondOpts = captureOpts(primitive, density, true);
      const compareFreshRuns = (law) => {
        const first = SF.buildObject({ ...firstOpts, toneLaw: law });
        const second = SF.buildObject({ ...secondOpts, toneLaw: law });
        expect(first.length).toBeGreaterThan(0);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      };
      expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', wavePhase: 'anti', waveAmp: 'solve' })).toBe('weaveDepth');
      compareFreshRuns('weaveDepth');
      expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe('ampSpacing');
      compareFreshRuns('ampSpacing');
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
// U8 (interlockWeave / onePenDown) is part of the Wave cluster above (U5: M4).

// U7-2b: same bounded-proximity fix as SURVIVOR_WEIGHT_CLAIM_U7 above, for the
// U8 survivor (interlockWeave says "weight also varies" — 1 intervening word).
const SURVIVOR_WEIGHT_CLAIM_U8 = /\bweight\b(?:\s+\S+){0,1}\s+varies\b/;

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
    runtime = await loadVecturaRuntime();
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

  test('fresh production runs are deterministic for folded and bare wave laws at the geometry and density boundaries', () => {
    const cases = [
      { primitive: 'sphere', density: DENSITY_VALUES.low },
      { primitive: 'torus', density: DENSITY_VALUES.med },
      { primitive: 'cone', density: DENSITY_VALUES.max },
    ];
    cases.forEach(({ primitive, density }) => {
      const firstOpts = captureOpts(primitive, density, true);
      const secondOpts = captureOpts(primitive, density, true);
      const compareFreshRuns = (law) => {
        const first = SF.buildObject({ ...firstOpts, toneLaw: law });
        const second = SF.buildObject({ ...secondOpts, toneLaw: law });
        expect(first.length).toBeGreaterThan(0);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      };
      expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', penDown: 'continuous' })).toBe('onePenDown');
      compareFreshRuns('onePenDown');
      expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe('interlockWeave');
      compareFreshRuns('interlockWeave');
    });
  }, SLOW);
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

describe('Scene3D tone-law collapse — U6 multi-primitive x multi-density: pen-mode resolution and draws', () => {
  // Same shape as U7's/U8's own multi-primitive x multi-density sweep.
  // Unlike U7/U8 (wave-family, unreachable on box for every mapper), this
  // cluster's threePen family is unreachable on box even at the 'hatch'
  // mapper (docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl) — same
  // TIER_B_PRIMITIVES-minus-box exclusion, confirmed against the manifest,
  // not assumed.
  let runtime; let V; let algo; let defaults; let SF; let Params; let PPD;
  const PRIMITIVES = ['sphere', 'torus', 'cone'];
  const DENSITY_VALUES = { low: 1, med: 50, max: 220 };
  const capturedOptions = createCapturedOptionsCache();
  const FOLDED = [
    { id: 'penPitchMatch', penMode: 'pitchMatch' },
    { id: 'penFacing', penMode: 'facing' },
    { id: 'penStipple', penMode: 'stipple' },
  ];

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
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;
    PPD = Params.PRIMITIVE_PARAM_DEFAULTS || {};
  }, SLOW);
  afterAll(() => runtime.cleanup());

  test('every penMode resolves to its legacy id at every reachable primitive x density pair', () => {
    const offenders = [];
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        FOLDED.forEach(({ id, penMode }) => {
          const resolved = Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode });
          if (resolved !== id) { offenders.push(`${primitive}__${densityKey}__${penMode}: resolved to "${resolved}", not ${id}`); return; }
          const canonicalDraw = SF.buildObject({ ...opts, toneLaw: resolved });
          if (canonicalDraw.length === 0) offenders.push(`${primitive}__${densityKey}__${penMode}: ${id} produced no paths`);
        });
      });
    });
    expect(offenders, offenders.join('; ')).toEqual([]);
  }, SLOW);

  test('the bare survivor resolves to itself at every primitive x density pair', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(DENSITY_VALUES).forEach((densityKey) => {
        const opts = captureOpts(primitive, DENSITY_VALUES[densityKey]);
        expect(Params.resolveToneLaw({ toneLaw: 'penInterleave' })).toBe('penInterleave');
        expect(Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode: 'interleave' })).toBe('penInterleave');
        const canonicalDraw = SF.buildObject({ ...opts, toneLaw: 'penInterleave' });
        expect(canonicalDraw.length).toBeGreaterThan(0);
      });
    });
  }, SLOW);

  test('fresh production runs are deterministic for a folded and bare pen law at the geometry and density boundaries', () => {
    const cases = [
      { primitive: 'sphere', density: DENSITY_VALUES.low },
      { primitive: 'torus', density: DENSITY_VALUES.med },
      { primitive: 'cone', density: DENSITY_VALUES.max },
    ];
    cases.forEach(({ primitive, density }) => {
      const firstOpts = captureOpts(primitive, density, true);
      const secondOpts = captureOpts(primitive, density, true);
      const compareFreshRuns = (law) => {
        const first = SF.buildObject({ ...firstOpts, toneLaw: law });
        const second = SF.buildObject({ ...secondOpts, toneLaw: law });
        expect(first.length).toBeGreaterThan(0);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      };
      const folded = FOLDED.find((entry) => entry.id === 'penStipple');
      expect(Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode: folded.penMode })).toBe(folded.id);
      compareFreshRuns(folded.id);
      expect(Params.resolveToneLaw({ toneLaw: 'penInterleave' })).toBe('penInterleave');
      compareFreshRuns('penInterleave');
    });
  }, SLOW);
});
