const {
  loadScene3dAuditRuntime, clone, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part C (U6): see scene3d-tone-law-collapse-c-sweeps.test.js for U7.

describe('Scene3D tone-law collapse — U6 caveat: all FOUR members (penInterleave, penPitchMatch, penFacing, penStipple) carry real, non-empty measured caveats', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
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
    runtime = await loadScene3dAuditRuntime();
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
