const {
  loadScene3dAuditRuntime, clone, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW,
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
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
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
    runtime = await loadScene3dAuditRuntime();
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
