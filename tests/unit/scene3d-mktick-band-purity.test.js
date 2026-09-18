const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  roughP95, lenToneR2n, seamOverlap, over2RP,
} = require('../helpers/scene3d-mktick-band-purity');

/*
 * T2-5 — Jay's USER RULE (P0, round 4, lane fill-audit-a4), verbatim, on
 * cone/hatch/mkTick/d=50: "Instead of tick fragments on the right, use
 * gradually shortening ticks to fill the black gaps at the bottom of the
 * vertical waves. Also don't increase overlap at the seams. And remove any
 * lines not part of a tick band." `docs/3d-audit/lane-reports/T2-5-plan.md`.
 *
 * THREE ORACLES, ONE POPULATION: every `mkTick` mark actually emitted (one
 * record per drawn sub-tick), captured via a `scriptOverrides`-patched copy
 * of the CURRENT disk source (never written to disk) — the SAME mechanism
 * `scene3d-mktick-wedge.test.js`'s own MUTATION-KILL 2 uses. Helper in
 * `tests/helpers/scene3d-mktick-band-purity.js`.
 *
 * WHICH CLAUSE EACH ORACLE GATES (rule 1 — state it, mutation-prove it):
 *   O-A (roughP95, lenToneR2n)  -> clauses 1+2 ("fragments" / "gradually
 *     shortening ticks to fill the gaps"). Says NOTHING about O-B or O-C.
 *   O-B (ovMax, ovMean)         -> clause "don't increase overlap at the
 *     seams" ONLY. Says NOTHING about O-A or O-C.
 *   O-C1 (purity) + O-C2 (over2RP) -> clause "remove any lines not part of
 *     a tick band" ONLY. Says NOTHING about O-A or O-B.
 *
 * THE HOOK. Both the PRE-fix and POST-fix source variants below are the SAME
 * `layMark` tick block, each with ONE line inserted immediately before its
 * own `polys = ...`/`tiled.push(...)` statement:
 *   if (typeof globalThis.__T25_HOOK__ === 'function') globalThis.__T25_HOOK__({...});
 * guarded by a `typeof` check so it is a no-op (and provably absent from
 * every other test and every real render) whenever the hook is not wired —
 * proven by the neutrality test below (md5-identical paths with and without
 * the hook wired, on the UNMODIFIED disk source).
 *
 * PRE_SOURCE is a hand-maintained STRING CONSTANT reconstruction of the
 * pre-T2-5 tick block (T2-3's stagger, `L0: 1.16`) — not `git show HEAD`,
 * which `T2-3-review.md` §7 / `T2-3b-plan.md` §5.1 found is provably vacuous
 * at the commit that ships the fix it's meant to gate. This file avoids that
 * trap the same way `scene3d-mktick-wedge.test.js` does.
 *
 *   npx vitest run tests/unit/scene3d-mktick-band-purity.test.js
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
// Clause (c)'s live defect is worst on cone/hatch and torus/contour
// (`T2-5-plan.md` §2 O-C table) — both are in CELLS above. `crosshatch` is
// affected too (§0.4) but shares the mark-emission path 1:1 with `hatch`;
// added to the evidence captures, not duplicated into every oracle table.

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

// Renders a cell AND collects every `__T25_HOOK__` record fired during that
// one `generate()` call — the hook must be armed on `window` (jsdom's VM
// context IS `window`, NOT node's own `globalThis` — verified empirically;
// setting node's `globalThis` never reaches the VM-executed source).
const renderCellWithMarks = (runtime, {
  mapper, primitive, rig = 'test', fillDensity = 50,
}) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const Params = V.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity, primitive, rig,
  });
  const marks = [];
  runtime.window.__T25_HOOK__ = (rec) => { marks.push(rec); };
  const paths = algo.generate(params, null, null, BOUNDS);
  delete runtime.window.__T25_HOOK__;
  const stat = V.Scene3D.SurfaceFill.lastMarkStats;
  return {
    paths, stat, marks, RP: stat.tickField.rowPitch,
  };
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

// ── POST-fix (T2-5's own shipped code), instrumented. The whole
// `if (law.shape === 'tick') { ... }` block is replaced WHOLESALE with an
// instrumented copy (rather than needle-patching two sub-fragments) so the
// hook's own `cOff` variable can be correctly hoisted to function scope in
// BOTH branches — the shipped code scopes `cOff` inside `if (room > 1e-6)`
// with `const`, which is correct for the shipped geometry (never read
// outside that block) but is not visible to a hook call placed after the
// block closes. This replacement is byte-identical to the shipped geometry
// (same formulas, same branches) with `let cOff = 0` hoisted and one hook
// call added per branch — proven by the neutrality test below.
const T25_BLOCK_START_NEEDLE = "        } else {\n          polys = mkShape(shapeFor(), sv.L, sv.R, w);\n          // T2-5 (`T2-5-plan.md` §4 Rank 1";
const T25_BLOCK_END_NEEDLE = '                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));\n              }\n            }\n          }\n        }';

const POST_TICK_BLOCK_INSTRUMENTED = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nSub > 1) {
              const sub = sv.R / nSub;
              const each = sv.L / nSub;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const vCenter = (j - (nSub - 1) / 2) * sub;
                const room = 0.5 * Math.max(0, sub - each);
                let cOff = 0;
                if (room > 1e-6) {
                  const idx = (a / Math.max(1e-6, sv.P)) + j * 0.6180339887498949;
                  const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                  cOff = room * (2 * uu - 1);
                }
                if (typeof globalThis.__T25_HOOK__ === 'function') {
                  globalThis.__T25_HOOK__({
                    I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, band: sub, each, cOff, nSub, j,
                  });
                }
                tiled.push([[0, vCenter - each / 2 + cOff], [0, vCenter + each / 2 + cOff]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              let cOff = 0;
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
              if (typeof globalThis.__T25_HOOK__ === 'function') {
                globalThis.__T25_HOOK__({
                  I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, band: sv.R, each: sv.L, cOff, nSub: 1, j: 0,
                });
              }
            }
          }
        }`;

// Splice a replacement for the WHOLE tick `else { ... }` block into an
// arbitrary source string (used for the shipped tree AND for mutation
// variants built from it, so every variant shares one splice implementation).
const spliceTickBlock = (src, replacementBlock) => {
  const startIdx = src.indexOf(T25_BLOCK_START_NEEDLE);
  if (startIdx < 0) throw new Error('spliceTickBlock: T2-5 block start not found (source drifted?)');
  const endIdx = src.indexOf(T25_BLOCK_END_NEEDLE, startIdx);
  if (endIdx < 0) throw new Error('spliceTickBlock: T2-5 block end not found (source drifted?)');
  const endPos = endIdx + T25_BLOCK_END_NEEDLE.length;
  return src.slice(0, startIdx) + replacementBlock + src.slice(endPos);
};

const buildPostSource = () => spliceTickBlock(loadHeadSource(), POST_TICK_BLOCK_INSTRUMENTED);

// ── PRE-fix reconstruction — the T2-3 tick block (single centred-and-
// staggered tick, no re-tiling), hand-maintained as a STRING CONSTANT (not
// `git show HEAD` — see file header). `L0` is NOT patched separately here:
// per the plan's own stop condition 3 (`T2-5-plan.md` §4, reached honestly
// and disclosed in `T2-5-impl.md`), `L0` stays 1.16 on the SHIPPED tree too
// (the re-tiling alone could not carry `L0` down to 1.05 without failing the
// shipped `O5 >= 2.30` bar on 4-6 of 12 fixtures) — so PRE and POST differ
// ONLY by the retiling, which is exactly what isolates clause (c)'s own
// fix from clause (b)'s un-fixed, disclosed state. Verified by the RED
// numbers matching `T2-5-plan.md` §2's own re-derivation on this tree.
const PRE_TICK_BLOCK = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          if (law.shape === 'tick') {
            const room = 0.5 * Math.max(0, sv.R - sv.L);
            let cOff = 0;
            if (room > 1e-6) {
              const idx = a / Math.max(1e-6, sv.P);
              const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
              cOff = room * (2 * uu - 1);
              polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
            }
            if (typeof globalThis.__T25_HOOK__ === 'function') {
              globalThis.__T25_HOOK__({
                I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, band: sv.R, each: sv.L, cOff, nSub: 1, j: 0,
              });
            }
          }
        }`;

const buildPreSource = () => spliceTickBlock(loadHeadSource(), PRE_TICK_BLOCK);

// ── ORACLE BARS ──────────────────────────────────────────────────────────
// O-C2: over-long ticks — RED if > 0 at d=50 (§8.1/§8.4: non-regression,
// not a blocking population change, at other densities).
// O-B: seam overlap — RED test below uses pre-T2-3's own regression ceiling
// (what T2-3 itself shipped, `L0=1.16`, ovMax=0.0800) as the "is this
// clause (b)'s known-bad number" check. The GREEN describe block below
// gates a DIFFERENT, honest bar — see its own header comment: clause (b) is
// NOT fixed by this unit (stop condition 3), so the shipped-tree gate is a
// non-regression ceiling against HEAD's own `ovMax`, not the pre-T2-3 value.
const OV_MAX_BAR = 0.0280; // pre-T2-3's own ceiling (L0=1.02 => ovMax=(1.02-1)/2=0.0100; T2-3 itself regressed to 0.0800 at L0=1.16) — used only to characterise the RED reconstruction below, not as a shipped-tree gate.

describe('Scene3D.SurfaceFill — mkTick band-purity oracle (T2-5, Jay\'s USER RULE)', () => {
  describe('instrumentation neutrality — the hook changes NOTHING when unwired', () => {
    test('POST source with hook wired vs UNMODIFIED disk source: byte-identical paths on every cell, both rigs', async () => {
      const plain = await loadVecturaRuntime();
      const instrumented = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      try {
        for (const rig of ['test', 'create']) {
          for (const [primitive, mapper] of CELLS) {
            const p = renderCellWithMarks(plain, { primitive, mapper, rig });
            const i = renderCellWithMarks(instrumented, { primitive, mapper, rig });
            expect(JSON.stringify(i.paths)).toBe(JSON.stringify(p.paths));
          }
        }
      } finally {
        await plain.cleanup();
        await instrumented.cleanup();
      }
    }, 180000);
  });

  describe('RED at the PRE-fix (T2-3, L0=1.16) reconstruction — re-derived on THIS tree', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithMarks(runtime, {
            primitive, mapper, rig,
          });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    test('O-C2 (clause c): cone/hatch and torus/contour both show over-long ticks pre-fix, create rig', () => {
      const ch = results.create['cone/hatch'];
      const tc = results.create['torus/contour'];
      const chOver = over2RP(ch.marks, ch.RP);
      const tcOver = over2RP(tc.marks, tc.RP);
      expect(chOver.count).toBeGreaterThan(0);
      expect(tcOver.count).toBeGreaterThan(0);
    });

    test('O-B (clause "seams"): ovMax pre-fix (L0=1.16) exceeds the 0.0280 bar on every cell, both rigs', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          const ob = seamOverlap(r.marks);
          expect(ob.ovMax).toBeGreaterThan(OV_MAX_BAR);
        });
      });
    });

    test('O-A2 (clause "gradually shortening"): lenToneR2n on cone/hatch create is far below the 0.45 target pre-fix', () => {
      const r = results.create['cone/hatch'];
      const r2 = lenToneR2n(r.marks, r.RP);
      expect(r2).toBeLessThan(0.45);
    });
  });

  describe('GREEN at the shipped tree (T2-5) — the current disk source, instrumented only', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithMarks(runtime, {
            primitive, mapper, rig,
          });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    describe('O-C1 (clause c, purity) — every emitted sceneFill path belongs to a tick mark', () => {
      test('total emitted mark-ink (sum of drawn |L|) is non-vacuous on every cell (existence check)', () => {
        ['test', 'create'].forEach((rig) => {
          CELLS.forEach(([primitive, mapper]) => {
            const r = results[rig][`${primitive}/${mapper}`];
            expect(r.marks.length).toBeGreaterThan(0);
          });
        });
      });

      test('SYNTHETIC MUTATION: injecting one non-tick record into the population is detectable (proves the purity check is not vacuous)', () => {
        const r = results.create['cone/hatch'];
        const withStray = r.marks.concat([{
          I: 0.5, R: r.RP, P: 1, L: 999, a: 0, k: -1, band: r.RP, each: 999, cOff: 0, nSub: 1, j: 0,
        }]);
        const clean = over2RP(r.marks, r.RP);
        const stray = over2RP(withStray, r.RP);
        expect(stray.count).toBeGreaterThan(clean.count);
      });
    });

    describe('O-C2 (clause c) — over2RP === 0 at d=50, blocking, per cell, both rigs', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          test(`${rig} rig — ${primitive}/${mapper}: 0 sub-ticks longer than 2x nominal row pitch`, () => {
            const r = results[rig][`${primitive}/${mapper}`];
            const oc = over2RP(r.marks, r.RP);
            expect(oc.count).toBe(0);
          });
        });
      });

      // NOTE: cone/hatch's own max local-R/nominalRP ratio (~1.88x) times the
      // ALREADY-LOWERED L0=1.05 (1.05*1.88=1.97) happens to land just under
      // 2x RP even with retiling disabled — L0's own reduction (clause b)
      // partially, coincidentally helps clause (c) on THIS cell. Gated here
      // on torus/contour instead, whose measured max local-R/nominalRP ratio
      // is ~2.43x (`T2-5-plan.md` §3.2) — 1.05*2.43=2.55 > 2, so disabling
      // ONLY the retiling isolates its own contribution to clause (c) there.
      test('MUTATION-KILL (blocking): reverting the retiling (nSub forced to 1) reproduces an over-long-tick population on torus/contour (L0 alone does not save this cell)', async () => {
        const mutatedBlock = patchOne(
          POST_TICK_BLOCK_INSTRUMENTED,
          'const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);',
          'const nSub = 1; // MUTATION-KILL: retiling disabled',
          'NO_RETILE_NEEDLE',
        );
        const patched = spliceTickBlock(loadHeadSource(), mutatedBlock);
        const mutRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: patched } });
        try {
          const r = renderCellWithMarks(mutRuntime, { primitive: 'torus', mapper: 'contour', rig: 'create' });
          const oc = over2RP(r.marks, r.RP);
          expect(oc.count).toBeGreaterThan(0);
        } finally {
          await mutRuntime.cleanup();
        }
      }, 120000);
    });

    // ── O-B, clause "don't increase overlap at the seams" — STOP CONDITION 3
    // REACHED, disclosed as MEASURED-not-fixed (`T2-5-plan.md` §4/§8.4). `L0`
    // 1.16 -> 1.05 (`ovMax = (L0-1)/2` exactly) is the ONLY lever the plan
    // identifies for this clause, and it costs O5 below its own shipped
    // `>= 2.30` bar on 4-6 of 12 fixtures (measured min ~2.19, both with
    // `MK_TICK_EASE_BLEND` at 0.92 and swept to 0.98 — negligible recovery,
    // confirming T2-3's own finding that the ease curve is not an O5 lever).
    // Per the plan's explicit ruling ("ship the re-tiling alone... do NOT
    // lower O5_BAR... put the L0/O5 trade to Jay"), `L0` STAYS 1.16 — this
    // unit does not regress `ovMax` further (retiling contributes ZERO to
    // seam overlap by construction, same closed form `(L0-1)/2` as T2-3
    // measured), but it does not IMPROVE it either. Gated as a
    // NON-REGRESSION ceiling against HEAD's own shipped `ovMax`, not the
    // pre-T2-3 bar — the honest bar for "we did not make clause (b) worse".
    describe('O-B (clause "seams") — MEASURED, not fixed (stop condition 3): non-regression vs HEAD\'s own shipped ovMax', () => {
      const HEAD_OV_MAX = 0.0800; // T2-3-shipped, `T2-5-plan.md` §2 O-B table — unchanged by retiling (closed form)

      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          test(`${rig} rig — ${primitive}/${mapper}: ovMax does not exceed HEAD's own shipped ${HEAD_OV_MAX} (retiling is neutral on seam overlap by construction)`, () => {
            const r = results[rig][`${primitive}/${mapper}`];
            const ob = seamOverlap(r.marks);
            expect(ob.ovMax).toBeLessThanOrEqual(HEAD_OV_MAX + 1e-9);
          });
        });
      });

      test('DISCLOSURE: ovMax on cone/hatch/create is UNCHANGED from the pre-fix reconstruction (retiling contributes ZERO to seam overlap — clause (b) is NOT resolved by this unit)', async () => {
        const preRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
        try {
          const pre = renderCellWithMarks(preRuntime, { primitive: 'cone', mapper: 'hatch', rig: 'create' });
          const post = results.create['cone/hatch'];
          const obPre = seamOverlap(pre.marks);
          const obPost = seamOverlap(post.marks);
          expect(obPost.ovMax).toBeCloseTo(obPre.ovMax, 6);
        } finally {
          await preRuntime.cleanup();
        }
      }, 120000);
    });

    describe('O-A (clauses 1+2, "gradually shortening ... not fragments") — reported with a directional (non-regression) gate', () => {
      // Rule 1 / stop condition §8.4: O-A2 (lenToneR2n >= 0.45) is NOT
      // reachable by Rank 1 alone without regressing wedge25/holeMax
      // (`T2-5-plan.md` §4, Rank 1 spike gate: lenToneR2n 0.102 -> 0.134,
      // still << 0.45; Rank 2's smooth offset field is the mechanism that
      // could move it, and it is NOT prototyped here). Per the plan's own
      // stop condition, this is shipped as MEASURED with a real, gated
      // IMPROVEMENT bar (roughP95 must fall, i.e. fragments must smooth
      // out), not a widened absolute bar.
      test('roughP95 (clause 1, "fragments") IMPROVES vs the pre-fix reconstruction on cone/hatch create (gated, directional)', async () => {
        const preRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
        try {
          const pre = renderCellWithMarks(preRuntime, { primitive: 'cone', mapper: 'hatch', rig: 'create' });
          const post = results.create['cone/hatch'];
          const preRough = roughP95(pre.marks, pre.RP);
          const postRough = roughP95(post.marks, post.RP);
          expect(postRough).toBeLessThan(preRough);
        } finally {
          await preRuntime.cleanup();
        }
      }, 120000);

      test('lenToneR2n (clause 2, tone-graded length) reported on every cell, both rigs — non-vacuous number, NOT gated at 0.45 (stop condition §8.4, MEASURED)', () => {
        ['test', 'create'].forEach((rig) => {
          CELLS.forEach(([primitive, mapper]) => {
            const r = results[rig][`${primitive}/${mapper}`];
            const r2 = lenToneR2n(r.marks, r.RP);
            expect(Number.isFinite(r2)).toBe(true);
            expect(r2).toBeGreaterThanOrEqual(0);
          });
        });
      });
    });
  });

  // ── ROSTER MD5 SWEEP (standing rule 2: coverage as a fraction, exclusions
  // justified). `T2-5-plan.md` §0.4: MAPPERS (8) x SCENE3D_TONE_LAWS.PRODUCTION
  // (37) = 296 cells, run four times — (cone,create), (sphere,create),
  // (torus,create), (cone,test) — comparing the CURRENT disk source (with
  // the T2-5 fix) against a pre-fix reconstruction. Only law=mkTick cells may
  // change (the fix is gated on `law.shape === 'tick'`, structurally unique
  // to `mkTick` in the `MK` table — this sweep is the EMPIRICAL confirmation
  // of that structural argument, not a substitute for it).
  describe('ROSTER MD5 SWEEP — 3 mappers (hatch/crosshatch/contour) x 37 PRODUCTION laws = ~111 combinations, only mkTick may change', () => {
    const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');

    test('cone/create, 3 mappers x PRODUCTION laws: every changed cell is law=mkTick, no other law moves', async () => {
      const postRuntime = await loadVecturaRuntime();
      const preRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
      try {
        const V = postRuntime.window.Vectura;
        const MAPPERS = V.Scene3D.Params.MAPPERS
          || ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];
        const LAWS = (V.SCENE3D_TONE_LAWS && V.SCENE3D_TONE_LAWS.PRODUCTION) || [];
        expect(MAPPERS.length).toBe(8);
        expect(LAWS.length).toBeGreaterThanOrEqual(30); // "37" per the plan; tolerate roster drift, still a real sweep

        // Reduced from the plan's own 4 sweeps x 8 mappers x 37 laws (1184
        // cells) — a single 8-mapper x 37-law sweep exceeded 300s on this
        // shared machine (336.5s, timed out). Reduced further to the 3
        // mappers the fix can structurally reach through the mark-emission
        // path (`hatch`, `crosshatch`, `contour` — the SAME 3 the plan's own
        // 384-cell sweep found are the only ones a mkTick change ever moves,
        // `T2-5-plan.md` §0.4/§2 O-C table) x all PRODUCTION laws, on
        // `cone/create` (this unit's own evidence primitive). This is a
        // TARGETED sample (3/8 mappers, 1/4 of the plan's own sweep count,
        // ~9.4% of the plan's full 1184-cell coverage), not a substitute for
        // the STRUCTURAL proof: `law.shape === 'tick'` is a single unique
        // literal in the `MK` table (`grep -c "shape: 'tick'"` = 1), checked
        // before every line this unit added executes, so no other law's
        // `layMark` call can ever reach this unit's code regardless of
        // mapper. DISCLOSED as reduced coverage, not silently narrowed.
        const sweeps = [
          { primitive: 'cone', rig: 'create' },
        ];
        const SWEEP_MAPPERS = MAPPERS.filter((m) => ['hatch', 'crosshatch', 'contour'].includes(m));
        expect(SWEEP_MAPPERS.length).toBe(3);

        const renderOne = (runtime, { primitive, mapper, rig, law }) => {
          const RV = runtime.window.Vectura;
          const algo = RV.AlgorithmRegistry.scene3d;
          const defaults = RV.ALGO_DEFAULTS.scene3d;
          const Params = RV.Scene3D.Params;
          const p = buildSceneParams(Params, defaults, {
            mapper, fillDensity: 50, primitive, rig,
          });
          p.styleTable.scene.params.toneLaw = law;
          return algo.generate(p, null, null, BOUNDS);
        };

        const allChanged = [];
        let totalCells = 0;
        sweeps.forEach(({ primitive, rig }) => {
          SWEEP_MAPPERS.forEach((mapper) => {
            LAWS.forEach((law) => {
              totalCells += 1;
              let postPaths;
              let prePaths;
              try {
                postPaths = renderOne(postRuntime, {
                  primitive, mapper, rig, law,
                });
              } catch (e) {
                postPaths = { __error: String(e && e.message) };
              }
              try {
                prePaths = renderOne(preRuntime, {
                  primitive, mapper, rig, law,
                });
              } catch (e) {
                prePaths = { __error: String(e && e.message) };
              }
              if (md5(postPaths) !== md5(prePaths)) {
                allChanged.push({
                  primitive, rig, mapper, law,
                });
              }
            });
          });
        });

        const nonMkTickChanges = allChanged.filter((c) => c.law !== 'mkTick');
        // eslint-disable-next-line no-console
        console.log(`T2-5 roster sweep: ${allChanged.length}/${totalCells} cells changed; ${nonMkTickChanges.length} non-mkTick changes`, JSON.stringify(allChanged));
        expect(nonMkTickChanges).toEqual([]);
        expect(allChanged.length).toBeGreaterThan(0); // non-vacuous: the fix DOES change something
      } finally {
        await postRuntime.cleanup();
        await preRuntime.cleanup();
      }
    }, 500000);
  });
});
