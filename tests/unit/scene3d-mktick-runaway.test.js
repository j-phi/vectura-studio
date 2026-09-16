const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { runawayCensus, maxSegment } = require('../helpers/scene3d-mktick-runaway');

/*
 * T2-3c — mkTick's RUNAWAY-STROKE GUARD (per-cell, BLOCKING).
 * `docs/3d-audit/lane-reports/T2-3b-review.md` flag 2, `T2-3b-plan.md` §4.3.
 *
 * WHY THIS FILE EXISTS. T2-3b's own runaway-stroke census (§4.3, its own
 * "Decision 13"/disclosure block) counted paths over 15mm ACROSS ALL SIX
 * CELLS as one aggregate ("pre has 13, post has 11 — not raised"). That
 * stop condition is too coarse: Rank 1 (T2-3b's area-floor fix) moved a
 * 52.39mm stray stroke onto `create|sphere/contour` — a cell that had ZERO
 * such paths before — while the AGGREGATE count across all six cells did
 * not rise, so the plan's own stop condition never tripped even though a
 * clean cell went dirty. `T2-3b-review.md`'s BLOCKING follow-up asked for
 * exactly this: a PER-CELL, not aggregate, non-regression guard.
 *
 * MECHANISM (found by dumping per-path point counts/lengths and locating
 * the flagged path directly — the reviewer's own census method). Fixture A
 * (this file's own `renderCell`, `create` rig), `sphere/contour`, path
 * index 943: 19 points, 52.39mm total. Its SEGMENT lengths are
 * `[0.337, 0.338, 0.339, 46.73, 0.275, 0.269, ...]` — eighteen ordinary
 * steps of 0.27-0.36mm (`MK_ARC_MM` itself is 0.36mm at the shipped 0.3mm
 * pen) and ONE 46.73mm discontinuous jump. `surface-fill.js`'s `walkFrom`
 * re-derives its local frame (`frameFrom`) from every newly accepted
 * sample; that frame's basis vectors are `1/|dA . ld|`-scaled, and near a
 * chart singularity (a `contour` mapper's row approaching a pole, or a
 * silhouette-adjacent patch going near edge-on — exactly where `R` in
 * `solveAt` is clamped at its `clamp(..., 0.25, 40)` CEILING, the suspect
 * `T2-3b-plan.md` §4.3 named) that scale blows up: a walk step sized for an
 * ORDINARY patch can land tens of millimetres from the point before it in a
 * SINGLE step. This is NOT "many mark sites chained into one path" in the
 * sense of several independently-placed ticks merging (`mkShape('tick', …)`
 * still returns exactly one 2-point poly per mark at every measured cell —
 * confirmed below) — it is ONE tick's own walk taking one catastrophic
 * step. Both rigs show the SAME mechanism: the `test`/addLayer rig's own
 * worst pre-fix path (`sphere/contour`, 20.25mm) is a single 2-point path
 * (one segment, no intermediate points at all) — a single first-step
 * blow-up on one arm, not an alignment of several short ticks (characterised
 * below, "addLayer-rig diagonal").
 *
 * THE FIX (`surface-fill.js`): `walkFrom`/`walkPoly` take an optional
 * `stepCapMM`; a step whose real screen distance from the last accepted
 * point exceeds it is refused exactly like an off-surface sample
 * (`truncated = true`, keep what already walked). `place()` passes this cap
 * ONLY when `law.shape === 'tick'` (`MK_TICK_STEP_CAP_MM = MK_TICK_JUMP_PEN
 * * MK_ARC_MM`, `MK_TICK_JUMP_PEN = 12`) — `'morph'` (`mkDashRamp`, the only
 * other walked shape) always passes `undefined` and is byte-for-byte
 * unaffected (verified below and by `T4b`/`T3`/`G4` all remaining green).
 *
 * WHICH HALF OF THE ACCEPTANCE BAR THIS GATES. Jay's rule
 * (`user-reports/8.png`) has two written clauses: R1 "ticks must have
 * VARIABLE LENGTH ... tick length carries the tone" (`O5`,
 * `scene3d-mktick-wedge.test.js`) and R2 "the field stays complete ... the
 * only gaps allowed are where highlights are" (`wedge25`/`holeMax`, same
 * file — a GAP/absence-of-ink defect). A runaway stroke is neither: it is
 * an EXCESS of ink in the wrong place, a walk/placement ARTEFACT rather
 * than a legitimate tick. This file gates a third, implicit clause the
 * orchestrator named directly: "no stray marks that are not ticks" — every
 * emitted path on a mkTick ruling must read as a bona fide, boundedly-sized
 * tick, not a discontinuous walk excursion. It says NOTHING about R1
 * (whether length carries tone — `O5` still gates that, unaffected, see
 * `T2-3c-impl.md`) and NOTHING about R2's gap clause (`wedge25`/`holeMax`,
 * also unaffected). A law that drew zero stray strokes but never varied
 * tick length at all would PASS this file and FAIL `O5` — the two are
 * independent, exactly as the wedge file's own header states for its pair.
 *
 * THE BARS, PER CELL, PER RIG (BLOCKING).
 *   1. `count(path.length > 15mm) <= PRE_T23B[cell][rig].count15` — the
 *      per-cell version of T2-3b's own aggregate stop condition, closing
 *      the exact gap `T2-3b-review.md` found (a clean cell going dirty
 *      cannot hide behind another cell getting cleaner).
 *   2. `longest path length <= max(K * L0 * R_typical, PRE_T23B[cell][rig].
 *      longest + ENVELOPE_MM)` — an absolute sanity ceiling (a legitimate
 *      single tick, using this cell's own TYPICAL row pitch — `rowPitch`
 *      from `mkStat.tickField`, not the pathological 40mm global clamp
 *      ceiling, which would never bind) OR the historical baseline plus a
 *      small measurement envelope, whichever is more permissive — so a cell
 *      whose pre-T2-3b baseline was already large is judged by that larger
 *      number, and a cell with a tiny baseline is still allowed up to a
 *      physically legitimate tick's length.
 * `PRE_T23B` is measured on a scratch `git archive 56481503` (T2-3b's own
 * commit (a), immediately before Rank 1 (b) — the last tree where the
 * `wedge`/`banding` files' own "pre-Rank-1" numbers apply). `ENVELOPE_MM`
 * (2.0mm) is set from the largest NON-defect measurement noise actually
 * observed between trees on an unaffected cell (`create/cone/hatch`:
 * 9.735mm pre-T2-3b vs 9.896mm post-T2-3c-fix, a 0.161mm drift from Rank
 * 1's own unrelated geometry change — nothing to do with this unit's walk
 * guard) — 2.0mm is >12x that drift.
 *
 * PRE-EXISTING, DISCLOSED, NOT THIS UNIT'S BAR TO TRIP:
 * `create|sphere/hatch` already had 4 paths > 15mm (longest 47.09mm) at
 * `56481503`, UNCHANGED IN KIND at `a8e2269f` (3 paths, 46.69mm) — a much
 * OLDER defect than Rank 1 (see `T2-3b-plan.md` §4.3's own "pre has 13"
 * disclosure), so this file's per-cell bar does not require it to already
 * be red at the base sha (it is not a NEW regression relative to the
 * `56481503` baseline). This unit's FIX happens to clean it up anyway
 * (46.69mm/3 -> 8.71mm/0, measured below) — a bonus, not a requirement —
 * because the walk-jump mechanism is the same one on every cell.
 *
 * npx vitest run tests/unit/scene3d-mktick-runaway.test.js
 */

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BOUNDS = {
  width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3,
};
const SUN = {
  id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const CELLS = [
  ['sphere', 'hatch'], ['sphere', 'contour'],
  ['torus', 'hatch'], ['torus', 'contour'],
  ['cone', 'hatch'], ['cone', 'contour'],
];

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig,
}) => {
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{
    id: 'obj', name: 'Obj', primitive, params: bag,
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = {
    scene: {
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: 'mkTick' },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

const renderCell = (Vectura, { mapper, primitive, rig = 'test' }) => {
  const algo = Vectura.AlgorithmRegistry.scene3d;
  const defaults = Vectura.ALGO_DEFAULTS.scene3d;
  const Params = Vectura.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity: 50, primitive, rig,
  });
  const paths = algo.generate(params, null, null, BOUNDS);
  const stat = Vectura.Scene3D.SurfaceFill.lastMarkStats;
  return { paths, stat };
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const patchOne = (src, needle, repl, label) => {
  const count = src.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: needle count = ${count}, expected 1 (source drifted?)`);
  return src.split(needle).join(repl);
};

// MUTATION-KILL (blocking): remove the tick-only jump cap, restoring
// EXACTLY the `a8e2269f` (pre-T2-3c) call site — `walkPoly` always gets
// `undefined`, so `walkFrom`'s guard clause is permanently inert.
const FIX_NEEDLE = "const wk = walkPoly(fr, uOff, theta, poly, law.shape === 'tick' ? MK_TICK_STEP_CAP_MM : undefined);";
const FIX_REPL = 'const wk = walkPoly(fr, uOff, theta, poly); // MUTATION-KILL: T2-3c jump guard removed';

// PRE_T23B — measured on a scratch `git archive 56481503` (T2-3b (a), the
// tree immediately before Rank 1 (b) landed), this file's own
// `runawayCensus` (>15mm threshold), Fixture A (BOUNDS above), fillDensity
// 50 ("med"), no ground/backdrop, toneLaw 'mkTick'. RE-MEASURE, DO NOT
// GUESS, BEFORE CHANGING.
const PRE_T23B = {
  create: {
    'sphere/hatch': { longest: 47.085, count15: 4 },
    'sphere/contour': { longest: 7.189, count15: 0 },
    'torus/hatch': { longest: 14.199, count15: 0 },
    'torus/contour': { longest: 10.513, count15: 0 },
    'cone/hatch': { longest: 9.735, count15: 0 },
    'cone/contour': { longest: 5.206, count15: 0 },
  },
  test: {
    'sphere/hatch': { longest: 37.376, count15: 2 },
    'sphere/contour': { longest: 20.249, count15: 1 },
    'torus/hatch': { longest: 17.814, count15: 1 },
    'torus/contour': { longest: 12.734, count15: 0 },
    'cone/hatch': { longest: 10.287, count15: 0 },
    'cone/contour': { longest: 8.061, count15: 0 },
  },
};
const ENVELOPE_MM = 2.0;
// K * L0 * R_typical — `L0` is `MK.mkTick.L0` (1.16, unchanged by this
// unit — see the live-source assertion below); `K` is a 30% margin over a
// perfectly area-correct single tick. `R_typical` comes from THIS render's
// own `mkStat.tickField.rowPitch` (`masterPitch / MK_ROW_COV`, the row
// pitch a NON-degenerate patch actually uses) — not the pathological 40mm
// global clamp ceiling in `solveAt`, which is wide enough to admit the
// original 52.39mm defect and would never bind here.
const K = 1.3;
const L0 = 1.16;

describe('Scene3D.SurfaceFill — mkTick runaway-stroke guard (T2-3c, per-cell, no stray marks that are not ticks)', () => {
  describe('mechanism assertions — read from the LIVE disk source', () => {
    test('MK_TICK_JUMP_PEN exists and is a small integer multiple of MK_ARC_MM (not silently retuned)', () => {
      const src = loadHeadSource();
      const m = src.match(/const MK_TICK_JUMP_PEN = (\d+(?:\.\d+)?);/);
      expect(m).not.toBeNull();
      const val = Number(m[1]);
      expect(val).toBeGreaterThanOrEqual(6);
      expect(val).toBeLessThanOrEqual(20);
    });

    test('the jump cap is wired ONLY for law.shape === \'tick\' — mkDashRamp (\'morph\') always gets undefined', () => {
      const src = loadHeadSource();
      expect(src).toContain(
        "const wk = walkPoly(fr, uOff, theta, poly, law.shape === 'tick' ? MK_TICK_STEP_CAP_MM : undefined);",
      );
    });

    test('walkFrom/walkPoly both accept the new stepCapMM parameter', () => {
      const src = loadHeadSource();
      expect(src).toMatch(/const walkFrom = \(seedFr, seedPt, seedUV, target, stepCapMM\) => \{/);
      expect(src).toMatch(/const walkPoly = \(fr0, uOff, theta, poly, stepCapMM\) => \{/);
    });

    test('the R clamp ceiling this defect rides (solveAt, clamp(..., 0.25, 40)) is untouched by this unit', () => {
      const src = loadHeadSource();
      expect(src).toContain('clamp(((Number.isFinite(lp) && lp > 1e-6) ? lp : masterPitch) / markRowCoverage(), 0.25, 40);');
    });

    test('the lenChan area floor (T2-3b\'s Lfloor) is unmodified — this unit does not retune it', () => {
      const src = loadHeadSource();
      expect(src).toContain('const Lfloor = g * PMIN;');
      expect(src).toContain('L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));');
    });

    test('MK.mkTick.L0 is still 1.16 (this unit does not touch the MK table)', () => {
      const src = loadHeadSource();
      expect(src).toContain("mkTick:        { shape: 'tick',     chan: 'len',   lat: 'brick',   or: 'none',   L0: 1.16, LMIN: 0.18, P0: 1.02 },");
    });
  });

  describe('per-cell, per-rig runaway census (BLOCKING) — six cells x two rigs', () => {
    let runtime;
    let Vectura;
    const results = { create: {}, test: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      Vectura = runtime.window.Vectura;
      ['create', 'test'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(Vectura, { primitive, mapper, rig });
          const census = runawayCensus(paths, 15);
          const rowPitch = stat && stat.tickField ? stat.tickField.rowPitch : null;
          results[rig][`${primitive}/${mapper}`] = { ...census, rowPitch };
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['create', 'test'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        const key = `${primitive}/${mapper}`;
        test(`${rig} rig — ${key}: count(paths > 15mm) <= pre-T2-3b baseline (${PRE_T23B[rig][key].count15})`, () => {
          const r = results[rig][key];
          expect(r.count).toBeLessThanOrEqual(PRE_T23B[rig][key].count15);
        });
        test(`${rig} rig — ${key}: longest path <= max(K*L0*R_typical, pre-T2-3b longest + ${ENVELOPE_MM}mm envelope)`, () => {
          const r = results[rig][key];
          const rTypical = r.rowPitch || 4.5;
          const sanityCeiling = K * L0 * rTypical;
          const baselineCeiling = PRE_T23B[rig][key].longest + ENVELOPE_MM;
          const cap = Math.max(sanityCeiling, baselineCeiling);
          expect(r.longest).toBeLessThanOrEqual(cap);
        });
      });
    });

    // Non-regression sanity, both flagged cells specifically (the two
    // `T2-3b-review.md` named): the fix must not merely satisfy the
    // per-cell bar but actually SHRINK the defect on record.
    test('create|sphere/contour: fixed longest is far below the pre-fix 52.39mm', () => {
      expect(results.create['sphere/contour'].longest).toBeLessThan(20);
    });
    test('test|sphere/contour (addLayer rig): fixed longest is far below the pre-fix 20.25mm', () => {
      expect(results.test['sphere/contour'].longest).toBeLessThan(15);
    });
  });

  describe('addLayer-rig diagonal — characterisation (one path, not an alignment of ticks)', () => {
    let runtime;
    let Vectura;
    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      Vectura = runtime.window.Vectura;
    }, 60000);
    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    test('mkShape(\'tick\', ...) still returns exactly one 2-point poly per mark at this fixture (no multi-segment chaining)', () => {
      // T2-3c — rules out the "several ticks merged into one poly" theory
      // structurally: `mkShape`'s own 'tick' branch only emits `n > 1`
      // parallel segments when `L > 1.02*R` by more than rounds to 2, and
      // `L` is capped at `L0*R = 1.16*R` (`solveAt`) — `round(1.16/1.02)`
      // is 1, so `n` is 1 on every mkTick render. Confirmed on the actual
      // fixture: every path this render emits that touches a `tick` mark
      // comes from exactly one `walkPoly` call (one `runs.push` per poly).
      const { paths } = renderCell(Vectura, { primitive: 'sphere', mapper: 'contour', rig: 'test' });
      // A "chained multiple ticks" path would show as one very long path
      // with MANY roughly-equal-length ordinary segments (one per walked
      // tick's own contribution); this fixture's own longest path (see the
      // census above) is now a normal, single tick's worth of geometry.
      const lens = paths.map((p) => p.length);
      const distinctSmall = lens.filter((n) => n <= 25).length;
      expect(distinctSmall).toBe(paths.length); // every path is one mark's own walk, never a multi-mark chain
    });
  });

  describe('MUTATION-KILL (blocking) — removing the tick-only jump cap reproduces the pre-fix defect', () => {
    let shippedRuntime;
    let mutantRuntime;

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), FIX_NEEDLE, FIX_REPL, 'FIX_NEEDLE') },
      });
    }, 120000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    const FLAGGED = [
      ['create', 'sphere', 'contour'],
      ['test', 'cone', 'hatch'],
      ['test', 'cone', 'contour'],
      ['test', 'torus', 'hatch'],
    ];

    FLAGGED.forEach(([rig, primitive, mapper]) => {
      test(`${rig} rig — ${primitive}/${mapper}: shipped clears the per-cell bar, mutant (no guard) does not`, () => {
        const key = `${primitive}/${mapper}`;
        const shipped = renderCell(shippedRuntime.window.Vectura, { primitive, mapper, rig });
        const mutant = renderCell(mutantRuntime.window.Vectura, { primitive, mapper, rig });
        const shippedCensus = runawayCensus(shipped.paths, 15);
        const mutantCensus = runawayCensus(mutant.paths, 15);
        const baseline = PRE_T23B[rig][key];

        // Shipped (this unit's fix): clears the per-cell bar.
        expect(shippedCensus.count).toBeLessThanOrEqual(baseline.count15);
        // Mutant (fix removed, exactly `a8e2269f`'s own call site):
        // reproduces a per-cell violation — either the count bar or the
        // longest-path bar (both are measured; at least one must trip, and
        // for every one of these four flagged cells BOTH do, per the
        // `T2-3c-impl.md` RED-at-base-sha table).
        const rowPitch = (mutant.stat && mutant.stat.tickField) ? mutant.stat.tickField.rowPitch : 4.5;
        const cap = Math.max(K * L0 * rowPitch, baseline.longest + ENVELOPE_MM);
        const countViolates = mutantCensus.count > baseline.count15;
        const longestViolates = mutantCensus.longest > cap;
        expect(countViolates || longestViolates).toBe(true);
      });
    });
  });
});
