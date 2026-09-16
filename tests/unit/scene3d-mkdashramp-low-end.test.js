/**
 * W-06b (T3, `W-05b-W-06b-plan.md` §3.3, LEDGER row 6) — mkDashRamp LOW
 * density (user-reports/10.png: "the W-06 after draws ONE dash on the whole
 * sphere at d=1 — from a design perspective not helpful").
 *
 * Jay's bar has TWO independent halves, gated separately below:
 *   (a) SPARSE-BUT-COMPLETE — >= ~40 dashes on the 40mm sphere at d=1, never
 *       a single stroke ("O6").
 *   (b) MONOTONE — dash count is non-decreasing as density rises from d=1 to
 *       med ("O7").
 *
 * Mechanism (surface-fill.js): the mark-law row scaffold's coverage was a
 * hardcoded constant `MK_ROW_COV = 1/3` (`algoCoverage`'s `isMarkLaw()`
 * branch), so at the sparse end (masterPitch 5.8mm on a 40mm sphere at d=1)
 * only 3 of the master grid's rulings survive as mark-law rows — too few for
 * any mark language to carry a "sparse but complete" texture. `markRowCoverage()`
 * (new, gated by `MK[TONE_ALGO].rowFloor`, set ONLY on `mkDashRamp`) turns
 * the constant into a FLOOR: keep every third master ruling while that stays
 * finer than a row-pitch CEILING (`MK_ROW_TARGET_PEN * penWidth` = 4.8mm at a
 * 0.3mm pen), and keep MORE — up to every ruling — once the master pitch
 * alone is already coarser than the ceiling. `solveAt`'s row-pitch divisor
 * (`R`) and the diagnostic `rowPitch` publish both call the SAME
 * `markRowCoverage()` so the scaffold and the tone solve never disagree.
 *
 * FIXTURE (stated per AGENT-PROTOCOL / ROUND3-RESUME-BRIEFS §0 item 3):
 * `Vectura.AlgorithmRegistry.scene3d.generate` driven directly (NOT through
 * `engine.addLayer`), with `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS` +
 * `DEFAULT_CAMERA`, sun az135/el45, `BOUNDS {1200x1000, m 20, penWidth 0.3}`,
 * mapper 'hatch', fillAngle 45. This is the SAME "addLayer rig" convention
 * (`PRIMITIVE_PARAM_DEFAULTS` = what `engine.addLayer('scene3d')`
 * deserialization defaults to) every RGR test in this lane's own sibling
 * oracle (`scene3d-mark-laws-draw.test.js`, T1/T1b/T2/T2-2/T2-3/T4/T4b) uses
 * — NOT the denser `PRIMITIVE_CREATE_DEFAULTS` ("create") rig the gallery
 * capture script and T4b's own file use. A separate "create"-rig spot check
 * runs in its own describe block below. Ground plane is disabled
 * (`p.ground = { enabled: false }`) throughout, so no ink total here includes
 * ground ink.
 */
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// This unit's own base sha (the tree immediately BEFORE T3's fix landed) —
// an EXPLICIT pin, never `HEAD`. T2-3's own self-test used `git show HEAD:`
// and went silently RED at its own landing commit once `HEAD` moved past the
// fix (T2-3-review.md, "the W-38 vacuous-leg class for the THIRD time in
// this audit") — pinning a literal sha here is what avoids repeating that.
const T3_BASE_SHA = '8780e97c';
const SF_REL_PATH = 'src/core/scene3d/surface-fill.js';

const getPreT3Source = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const rootDir = path.resolve(__dirname, '../..');
    cached = execFileSync('git', ['show', `${T3_BASE_SHA}:${SF_REL_PATH}`], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024 * 64,
    }).toString('utf8');
    return cached;
  };
})();

const BOUNDS = { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
const clone = (v) => JSON.parse(JSON.stringify(v));

// COVERAGE, STATED AS A FRACTION (verified live, not assumed): `MARK_LAWS`
// (surface-fill.js:1228) lists 12 raw internal shapes, but only FOUR are
// members of the CURRENT `Vectura.SCENE3D_TONE_LAWS.IDS` roster (queried
// directly against this tree) — `mkDotScreen`, `mkTick`, `mkDashRamp` (this
// unit's own law) and `mkScribble`. The other eight (`mkLozenge`,
// `mkChevron`, `mkComma`, `mkSFlick`, `mkCrossPlus`, `mkTriangle`,
// `mkDotLozenge`, `mkRadialFlick`) are absent from BOTH `IDS` and
// `ALIASES` — no styleTable can address them; `clampStyleParam`'s 'toneLaw'
// case (`params.js:734`) silently rewrites any of those eight strings to
// 'ladder' before `surface-fill.js` ever sees `TONE_ALGO` (confirmed live:
// each fires "unknown toneLaw ... falling back to ladder" and both pre- and
// post-fix trees resolve identically to plain `ladder`, which is EXCLUDED
// from this sweep for exactly that reason — comparing them would silently
// re-test `ladder` eight redundant times under a false 14-law label, the
// same shape of vacuous-breadth defect this audit has flagged before).
// `fineLadder`/`phaseFineLadder` ARE valid `ALIASES` entries (`into:
// 'ladder'`), but that resolution is undocumented-partial at the single-key
// `clampStyleParam` call site used here (it cannot see the sibling
// `rungMode` sub-param a full `normalizeParams` pass would also set) — so
// driving them through this file's own styleTable-object convention risks
// silently re-testing bare `ladder` under the alias's name rather than its
// own `rungMode` code path. Excluded for the same disclosed reason; bare
// `ladder` already covers the shared downstream code both alias into.
// Reachable, unambiguous roster to sweep: mkDotScreen, mkTick, mkScribble
// (3 of 3 other DIRECTLY-addressable mark laws — 100% of the reachable
// subset) + `ladder` itself (the roster DEFAULT, resolved before the IDS
// membership check, so always live) = 4.
const OTHER_MARK_LAWS = ['mkDotScreen', 'mkTick', 'mkScribble'];
const LADDER_FAMILY = ['ladder'];
const BYTE_IDENTITY_ROSTER = [...OTHER_MARK_LAWS, ...LADDER_FAMILY];
const UNREACHABLE_MARK_LAWS = [
  'mkLozenge', 'mkChevron', 'mkComma', 'mkSFlick', 'mkCrossPlus', 'mkTriangle',
  'mkDotLozenge', 'mkRadialFlick',
];
const PRIMITIVES = ['sphere', 'torus', 'cone'];
const DENSITIES = [1, 50, 220];

describe('Scene3D.SurfaceFill — mkDashRamp LOW-DENSITY row-coverage floor (W-06b, T3)', () => {
  let runtime; let V; let algo; let defaults; let SF; let Params;
  let mutantRuntime; let mutantV; let mutantAlgo; let mutantSF;

  const buildSceneParams = (toneLaw, mapper, fillDensity, primitive, paramSet) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj', name: 'Obj', primitive, params: clone(paramSet[primitive] || {}),
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = clone(Params.DEFAULT_CAMERA);
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    p.styleTable = {
      scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw } }, byObject: {}, byFace: {},
    };
    return p;
  };
  // The "addLayer" rig (PRIMITIVE_PARAM_DEFAULTS — see file header).
  const buildAddLayer = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_PARAM_DEFAULTS);
  // The "create" rig (PRIMITIVE_CREATE_DEFAULTS — the gallery/T4b's own rig).
  const buildCreate = (toneLaw, mapper, fillDensity, primitive) =>
    buildSceneParams(toneLaw, mapper, fillDensity, primitive, Params.PRIMITIVE_CREATE_DEFAULTS);

  const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Params = V.Scene3D.Params;

    // The mutation-kill runtime: the EXACT current tree, except `rowFloor:
    // true` stripped from `mkDashRamp`'s own MK entry — i.e. T3's mechanism
    // disabled, everything else (including any later unit that may have
    // landed on top) left alone. If this string replace does not match,
    // the mutant is silently identical to the real tree and every
    // mutation-kill assertion below would be vacuous, so it is asserted.
    const liveSrc = require('fs').readFileSync(
      path.join(path.resolve(__dirname, '../..'), SF_REL_PATH), 'utf8',
    );
    const NEEDLE = "mkDashRamp:    { shape: 'morph',    chan: 'elong', lat: 'row',     or: 'along',  P0: 1.25, rowFloor: true },";
    const REPLACEMENT = "mkDashRamp:    { shape: 'morph',    chan: 'elong', lat: 'row',     or: 'along',  P0: 1.25 },";
    expect(liveSrc.includes(NEEDLE)).toBe(true);
    const mutatedSrc = liveSrc.replace(NEEDLE, REPLACEMENT);
    expect(mutatedSrc).not.toBe(liveSrc);

    mutantRuntime = await loadVecturaRuntime({
      scriptOverrides: { [SF_REL_PATH]: mutatedSrc },
    });
    mutantV = mutantRuntime.window.Vectura;
    mutantAlgo = mutantV.AlgorithmRegistry.scene3d;
    mutantSF = mutantV.Scene3D.SurfaceFill;
  }, 120000);
  afterAll(() => {
    runtime.cleanup();
    mutantRuntime.cleanup();
  });

  describe('O6 — sparse-but-complete: >= ~40 dashes on the 40mm sphere at d=1 (sphere/hatch, addLayer rig)', () => {
    test('RED at T3 base sha 8780e97c: pre-fix draws far fewer than 40 (measured 7)', () => {
      const src = getPreT3Source();
      expect(src.includes('rowFloor')).toBe(false);
    });

    test('GREEN: current tree draws >= 40 marks at d=1', () => {
      algo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const stat = SF.lastMarkStats;
      expect(stat).toBeTruthy();
      // Measured on this tree: 46 (was 7 pre-fix). Never a single stroke.
      expect(stat.marks).toBeGreaterThanOrEqual(40);
      expect(stat.marks).toBeGreaterThan(1);
    });

    test('MUTATION-KILL (blocking): disabling rowFloor alone reproduces the pre-fix collapse (< 40, in fact the exact old 7)', () => {
      mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const stat = mutantSF.lastMarkStats;
      expect(stat).toBeTruthy();
      expect(stat.marks).toBeLessThan(40);
      // Exact reproduction of the plan's own measured pre-fix number
      // (W-05b-W-06b-plan.md §2 D5, re-derived on this tree in T3-impl.md).
      expect(stat.marks).toBe(7);
      expect(stat.rows).toBe(3);
    });
  });

  describe('O7 — monotone: dash count is non-decreasing d=1 -> 5 -> 10 -> 25 -> 50 (both primitives, addLayer rig)', () => {
    const DENSITY_SWEEP = [1, 5, 10, 25, 50];

    test.each(['sphere', 'torus'])('%s/hatch: mark count is non-decreasing across the sweep', (prim) => {
      const counts = DENSITY_SWEEP.map((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, prim), null, null, BOUNDS);
        return SF.lastMarkStats.marks;
      });
      for (let i = 1; i < counts.length; i += 1) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
      }
    });

    test('MUTATION-KILL (blocking): disabling rowFloor reproduces the sphere non-monotone dip (d=5 -> d=10 drops)', () => {
      const counts = DENSITY_SWEEP.map((d) => {
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, 'sphere'), null, null, BOUNDS);
        return mutantSF.lastMarkStats.marks;
      });
      // Exact reproduction of the plan's own re-derived pre-fix numbers
      // (T3-impl.md RED table): 7, 7, 6, 12, 73 — the sparse-end dip this
      // unit's fix removes.
      expect(counts).toEqual([7, 7, 6, 12, 73]);
      let sawDrop = false;
      for (let i = 1; i < counts.length; i += 1) {
        if (counts[i] < counts[i - 1]) sawDrop = true;
      }
      expect(sawDrop).toBe(true);
    });
  });

  describe('Non-regression — the fix is byte-identical at d=50/d=220 (masterPitch already finer than the row-pitch ceiling)', () => {
    test.each(['sphere', 'torus', 'cone'])('%s/hatch/mkDashRamp: d=50 and d=220 marks are UNCHANGED from the pre-fix count', (prim) => {
      [50, 220].forEach((d) => {
        algo.generate(buildAddLayer('mkDashRamp', 'hatch', d, prim), null, null, BOUNDS);
        const postMarks = SF.lastMarkStats.marks;
        mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', d, prim), null, null, BOUNDS);
        const preMarks = mutantSF.lastMarkStats.marks;
        expect(postMarks).toBe(preMarks);
      });
    });
  });

  describe('Byte-identity sweep — the reachable roster `rowFloor` could have leaked into', () => {
    // Verifies the reachability claim live rather than trusting the comment
    // above: if a future unit adds one of the eight orphaned mark laws (or
    // mkDashRamp itself) to the roster, or removes one of the four currently
    // reachable ones, this trips — so the sweep below cannot go stale silently.
    test('roster reachability, verified live against Vectura.SCENE3D_TONE_LAWS', () => {
      const roster = V.SCENE3D_TONE_LAWS;
      expect(roster.DEFAULT).toBe('ladder');
      ['mkDotScreen', 'mkTick', 'mkScribble', 'mkDashRamp'].forEach((id) => {
        expect(roster.IDS.indexOf(id)).toBeGreaterThanOrEqual(0);
      });
      UNREACHABLE_MARK_LAWS.forEach((id) => {
        expect(roster.IDS.indexOf(id)).toBe(-1);
        expect(roster.ALIASES && roster.ALIASES[id]).toBeFalsy();
      });
    });

    test('addLayer rig: sphere|torus|cone x hatch x d={1,50,220}, all 4 reachable laws md5-identical pre/post', () => {
      let compared = 0;
      let mismatches = [];
      BYTE_IDENTITY_ROSTER.forEach((law) => {
        PRIMITIVES.forEach((prim) => {
          DENSITIES.forEach((d) => {
            const post = algo.generate(buildAddLayer(law, 'hatch', d, prim), null, null, BOUNDS);
            const pre = mutantAlgo.generate(buildAddLayer(law, 'hatch', d, prim), null, null, BOUNDS);
            compared += 1;
            if (md5(post) !== md5(pre)) mismatches.push(`${law}/${prim}/d=${d}`);
          });
        });
      });
      // mkDotScreen, mkTick, mkScribble + ladder = 4 x 3 primitives x 3 densities = 36.
      expect(compared).toBe(36);
      expect(mismatches).toEqual([]);
    });

    // Spot check on the "create" rig (PRIMITIVE_CREATE_DEFAULTS) — the SAME
    // 4-law reachable roster, sphere only, disclosed as a narrower slice than
    // the full addLayer-rig sweep above (not a claim of full coverage on
    // this rig).
    test('create rig spot check: sphere/hatch, all 4 reachable laws x d={1,50,220}, md5-identical pre/post', () => {
      let mismatches = [];
      BYTE_IDENTITY_ROSTER.forEach((law) => {
        DENSITIES.forEach((d) => {
          const post = algo.generate(buildCreate(law, 'hatch', d, 'sphere'), null, null, BOUNDS);
          const pre = mutantAlgo.generate(buildCreate(law, 'hatch', d, 'sphere'), null, null, BOUNDS);
          if (md5(post) !== md5(pre)) mismatches.push(`${law}/sphere/d=${d}`);
        });
      });
      expect(mismatches).toEqual([]);
    });

    test('mkDashRamp itself is NOT byte-identical at d=1 on either rig (the fix must be reachable)', () => {
      const postAdd = algo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const preAdd = mutantAlgo.generate(buildAddLayer('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(md5(postAdd)).not.toBe(md5(preAdd));

      const postCreate = algo.generate(buildCreate('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      const preCreate = mutantAlgo.generate(buildCreate('mkDashRamp', 'hatch', 1, 'sphere'), null, null, BOUNDS);
      expect(md5(postCreate)).not.toBe(md5(preCreate));
    });
  });
});
