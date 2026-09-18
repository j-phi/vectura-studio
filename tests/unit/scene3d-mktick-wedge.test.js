const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  wedgeFromMasks, measureWedge, siteCoverage, lengthCarriesTone,
} = require('../helpers/scene3d-mktick-wedge');
const { pathSignature } = require('../helpers/path-signature');

/*
 * T2-3 — mkTick's RASTERISED BARE-WEDGE ORACLE (R2) + the length-carries-
 * tone oracle (R1). `docs/3d-audit/lane-reports/T2-3-plan.md`.
 *
 * WHY THIS FILE EXISTS. `user-reports/8.png`, Jay's rule, has two clauses:
 *   R1 "ticks must have VARIABLE LENGTH ... tick length carries the tone."
 *   R2 "the field stays complete ... the only gaps allowed are where
 *       highlights are" (a HARD-EDGED gap, anywhere else, is the defect).
 * Two earlier units (T2 `dbad2d88`, T2-2 `9d911b05`) both shipped R1 and
 * were BOTH rejected on R2: `mkShape`'s `'tick'` branch spends its entire
 * length response in the ACROSS-ROW direction, centred on the row line
 * (`surface-fill.js`'s tick branch, ~:2637), so every mm the curve removes
 * opens a bare strip of `(R-L)/2` on BOTH sides of every row — a WEDGE,
 * because `L` grades along the row. `T2-3-plan.md` §0 measured T2 and T2-2
 * as the SAME RENDER on this defect (curves differ by <=1.15% of the
 * length range) — the curve was never the lever. `T2-2-review.md` §7's
 * BLOCKING finding was that NEITHER unit's own test suite could tell a
 * wedge-free render from a wedged one (the mean-of-thirds O5 oracle only
 * samples the two anchors' thirds and cannot see an interior plateau; a
 * "field stays complete" test in that unit duplicated an unrelated
 * wholesale-refusal check). This file is the missing instrument, landed
 * FIRST per the orchestrator's ruling, before the fix it gates.
 *
 * WHICH HALF EACH ORACLE GATES (state it, per the standing ruling):
 *   - `lengthCarriesTone` (the O5 tests below) gates R1 ONLY: mean drawn
 *     tick length, dark third vs light third, ratio >= 3.0 and monotone.
 *     It says NOTHING about whether the bare space between ticks is
 *     scattered (fine, legitimate light tone) or converged into a wedge
 *     (the defect) — that is R2, gated separately below.
 *   - `wedge25`/`holeMax` (the raster tests below) gate R2 ONLY: whether
 *     bare space, where it exists outside the highlight, reads as
 *     scattered texture or a converging hole. They say NOTHING about
 *     whether tick length actually carries tone (a law that never varied
 *     length at all — e.g. `chan:'count'` — would ALSO score well here,
 *     since a near-full-length tick everywhere leaves little bare space to
 *     measure; R1 is what rules that out).
 *   - `siteCoverage` is REPORTED, not gated, on purpose (see below) — it is
 *     the metric BOTH rejected units passed while shipping the wedge.
 *
 * THE RASTER (mutation-proved below, `wedgeFromMasks`'s own unit tests).
 * `mkStat.tickField` (`surface-fill.js`, gated to `law.shape === 'tick'`)
 * republishes the along-row field samples every ruling already computes —
 * no extra `sampleAt` calls — as flat `[x, y, I, ...]` triples plus
 * `rowPitch = masterPitch / MK_ROW_COV`. Each point is splatted as a disc
 * of radius `rowPitch/2` (the row's own half-pitch) at PPMM=6 px/mm
 * (a 0.1667mm raster cell — a 0.3mm pen stroke is ~1.8 px wide, fine enough
 * to resolve a bare gap of one pen width) to reconstruct the SHADED
 * SILHOUETTE (surface, non-highlight); the algorithm's own returned paths
 * are stamped as the ink mask; a two-pass chamfer distance transform from
 * ink gives, per shaded pixel, its distance to the nearest ink. `wedge25`
 * is the fraction of shaded pixels at least `0.25*rowPitch` from any ink
 * (a hole at least HALF a row pitch across); `holeMax` is the diameter (in
 * row pitches) of the single largest inscribed bare disc.
 *
 * HONEST METHODOLOGY LIMITATION, DISCLOSED (do not skip this). The plan's
 * own instrument (`T2-3-plan.md` §2) built its silhouette from a DENSE,
 * INDEPENDENT 461x461 continuous `sampleAt` sweep — a true 2D field. This
 * file's silhouette instead comes from mkTick's own coarse ALONG-ROW field
 * samples, isotropically splatted (no per-point row-direction vector is
 * available outside `surface-fill.js`'s own frame, and adding one would
 * mean sampling well outside the tick placement/MK-constants scope this
 * unit is granted). Measured consequence: every ROW ENDPOINT's disc
 * necessarily extends `rowPitch/2` past the row's own true tip (there is
 * no neighbouring sample beyond it to bound the disc), which the plan's
 * continuous field sweep does not suffer from. This raises this file's
 * absolute `wedge25`/`holeMax` readings well above the plan's own
 * (`~0.07-0.09` vs the plan's `~0.001-0.05`) and makes `holeMax`
 * ({@link SIX_CELL below}) DOMINATED by that endpoint artefact rather than
 * by the real defect (it barely moves between a staggered and an
 * un-staggered render on this fixture — MEASURED, not assumed, see the
 * mutation-kill below). Per the standing rule ("name what you do not
 * gate"): `holeMax` is REPORTED here, not gated. `wedge25`, however,
 * SURVIVES this noise floor as a real, monotone, cross-rig, six-cell signal
 * (measured below) — smaller in magnitude than the plan's own report, but
 * real — and IS gated, as a six-cell-MEAN blocking bar (the more robust
 * aggregate, exactly the reasoning `T2-3-plan.md` §2.4 used for its own W2)
 * plus a per-cell NON-REGRESSION ceiling (protects the stagger from being
 * silently reverted; per-cell separation from a no-stagger mutant is thin
 * on this instrument on some cells — disclosed in the mutation-kill below,
 * not hidden).
 *
 * MUTATION-KILL (BLOCKING, both directions):
 *   1. Instrument correctness, on hand-built SYNTHETIC masks (no renderer
 *      involved) — a fabricated wedge (two ink bands with a triangular gap
 *      between them) MUST trip `wedge25`/`holeMax`; a wedge-free, evenly
 *      speckled bare pattern (small holes, none far from ink) must NOT.
 *   2. Real-render mutation — the SAME `layMark` stagger insertion with
 *      `room` forced to 0 (i.e. this tree's own `chan:'len'` mechanism,
 *      full `L0=1.16`/`BLEND=0.92`, but centred on the row line exactly as
 *      T2/T2-2 shipped) MEASURED on both rigs, all six cells:
 *
 *        six-cell mean wedge25   | staggered (shipped) | no-stagger mutant
 *        addLayer/test rig       | 0.07622              | 0.08890  (+16.6%)
 *        create rig              | 0.08878              | 0.10278  (+15.8%)
 *
 *      Monotone in the SAME direction on all 12 cell x rig combinations
 *      individually (every one of the 6 cells, both rigs, mutant >=
 *      shipped — see the six-cell table in `T2-3-impl.md`). `holeMax` does
 *      NOT separate this way (both trees ~1.0-1.1 on every cell) — this is
 *      the measured basis for reporting, not gating, `holeMax`.
 *
 *   npx vitest run tests/unit/scene3d-mktick-wedge.test.js
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

// ── MUTATION 2's needle: force the T2-3 stagger's own `room` to zero, i.e.
// this tree's `chan:'len'` mechanism (L0=1.16, BLEND=0.92) but centred on
// the row line exactly as T2/T2-2 shipped (the defect T2-review.md and
// T2-2-review.md both photographed).
// T2-5 — the stagger now has TWO `room` computations (the re-tiled loop's
// own sub-band room, and the nSub===1 fallthrough's whole-row room, both in
// `surface-fill.js`'s `layMark` tick block). Disabling BOTH is what
// reproduces "centred on the row line exactly as T2/T2-2 shipped" — the
// mutant this test measures against.
const STAGGER_NEEDLE_TILED = 'const room = 0.5 * Math.max(0, sub - each);';
const STAGGER_REPL_TILED = 'const room = 0; // MUTATION-KILL 2: stagger disabled (re-tiled branch)';
const STAGGER_NEEDLE_SINGLE = "              const room = 0.5 * Math.max(0, sv.R - sv.L);";
const STAGGER_REPL_SINGLE = '              const room = 0; // MUTATION-KILL 2: stagger disabled (single-tick branch)';
const disableStagger = (src) => {
  let out = patchOne(src, STAGGER_NEEDLE_TILED, STAGGER_REPL_TILED, 'STAGGER_NEEDLE_TILED');
  out = patchOne(out, STAGGER_NEEDLE_SINGLE, STAGGER_REPL_SINGLE, 'STAGGER_NEEDLE_SINGLE');
  return out;
};

// ── Six-cell mutation-kill 2 bars (blocking on the MEAN, non-regression
// ceiling per cell — see file header for the full measured table and the
// honest disclosure of why per-cell separation is thin on some cells).
const WEDGE_MEAN_BAR = { test: 0.0800, create: 0.0950 };
const WEDGE_CELL_CEILING = { test: 0.090, create: 0.180 };

describe('Scene3D.SurfaceFill — mkTick bare-wedge oracle (T2-3, R2) + O5 (R1)', () => {
  describe('instrument correctness — synthetic masks (no renderer)', () => {
    const PPMM = 6;
    const ROW_PITCH = 4.5; // mm, representative of the real fixture (~4.4-4.5)
    const W = 60 * PPMM; // 60mm wide raster
    const H = 20 * PPMM; // 20mm tall raster

    const blankSurf = () => new Uint8Array(W * H);
    const blankTone = (v) => new Float32Array(W * H).fill(v);

    test('a SYNTHETIC WEDGE (two ink bands, converging bare triangle between them) trips wedge25 and holeMax', () => {
      const surf = blankSurf();
      surf.fill(1); // whole raster is "on the object"
      const tone = blankTone(0.3); // well below the 0.90 highlight threshold everywhere
      const ink = new Uint8Array(W * H);
      // Two horizontal ink bands, `ROW_PITCH` px-worth apart in mm, leaving a
      // WIDE bare gap between them (a converging wedge in miniature: the gap
      // narrows toward one end of the raster).
      const rowPitchPx = Math.round(ROW_PITCH * PPMM);
      const topRow = Math.round(3 * PPMM);
      const botRow = topRow + rowPitchPx * 2; // two row-pitches apart -> a wide gap
      for (let x = 0; x < W; x += 1) {
        // taper the "ink extent" so the gap converges toward x=W (the wedge)
        const inkHalf = Math.round((1 - x / W) * 2 * PPMM) + 1;
        for (let dy = -inkHalf; dy <= inkHalf; dy += 1) {
          if (topRow + dy >= 0 && topRow + dy < H) ink[(topRow + dy) * W + x] = 1;
          if (botRow + dy >= 0 && botRow + dy < H) ink[(botRow + dy) * W + x] = 1;
        }
      }
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      expect(r.wedge25).toBeGreaterThan(0.05);
      expect(r.holeMax).toBeGreaterThan(1.0); // a hole at least one full row pitch across
    });

    test('a WEDGE-FREE render (fine, evenly speckled bare gaps, none far from ink) does NOT trip wedge25/holeMax', () => {
      const surf = blankSurf();
      surf.fill(1);
      const tone = blankTone(0.3);
      const ink = new Uint8Array(W * H);
      // A dense, even grid of short ink dashes every ~1mm in both axes — the
      // bare space between them is small and uniform everywhere, never
      // converging into a hole.
      const stepPx = Math.round(1.0 * PPMM);
      for (let y = 0; y < H; y += stepPx) {
        for (let x = 0; x < W; x += 1) {
          if ((x % stepPx) < Math.round(0.6 * PPMM)) {
            for (let dy = 0; dy < Math.max(1, Math.round(0.3 * PPMM)); dy += 1) {
              if (y + dy < H) ink[(y + dy) * W + x] = 1;
            }
          }
        }
      }
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      expect(r.wedge25).toBeLessThan(0.02);
      expect(r.holeMax).toBeLessThan(0.6);
    });

    test('bare area WITHIN the highlight zone (tone >= 0.90) is excluded — R2 explicitly allows gaps only there', () => {
      const surf = blankSurf();
      surf.fill(1);
      const tone = blankTone(0.95); // entirely highlight
      const ink = new Uint8Array(W * H); // zero ink anywhere
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      // Every "surface" pixel is highlight, so there is nothing SHADED to
      // measure bare area over at all.
      expect(r.shadedPx).toBe(0);
      expect(r.wedge25).toBeNull();
    });
  });

  // ── T2-3b deliverable (a): the `git show HEAD:...` "RED at the pre-fix
  // tree" block above is provably vacuous at the commit that ships it — HEAD
  // IS the post-fix tree the instant this file's own commit lands, so the
  // second assertion throws inside `beforeAll` forever after
  // (`T2-3-review.md` §7, BLOCKING; the same anti-pattern `W-38b` removed
  // from `scene3d-facet-min-rulings.test.js`). Replaced with the `W-38b`
  // pattern: pinned `pathSignature` goldens (a string constant in THIS file,
  // not "the same code as the runtime under test") plus a live-disk-source
  // mechanism assertion. `docs/3d-audit/lane-reports/T2-3b-plan.md` §5.
  describe('mechanism assertions — read from the LIVE disk source, not `git show HEAD` (T2-3b)', () => {
    test("mkTick is on the T2-2/T2-3 chan:'len' mechanism, not the pre-fix chan:'count' design", () => {
      const src = loadHeadSource();
      expect(src).toMatch(/mkTick:\s*\{[^}]*chan: 'len'/);
      expect(src).not.toMatch(/mkTick:\s*\{[^}]*chan: 'count'/);
    });

    test("T2-3b's own area floor (Lfloor) is present in the lenChan branch of solveAt", () => {
      const src = loadHeadSource();
      expect(src).toContain('const Lfloor = g * PMIN;');
    });
  });

  describe('pinned pathSignature goldens, both rigs, all six cells (RE-PIN ONLY WITH PROOF)', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths } = renderCell(V, { primitive, mapper, rig });
          results[rig][`${primitive}/${mapper}`] = pathSignature(paths, 4);
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    // RE-PIN ONLY WITH PROOF (mutation-kill in the commit body/report; see
    // T2-3b-impl.md). Recorded from a run with this table empty — each miss
    // prints `'<rig>|<cell>': '<sha256>',` to paste back (the
    // `scene3d-hlr-spatial-index-identity.test.js` missing-entry convention).
    // T2-3b (b): RE-PINNED — Rank 1 (the `Lfloor` area-restoring smooth
    // floor, `surface-fill.js`'s `lenChan` branch of `solveAt`) changes
    // mkTick's own geometry on every one of these 12 combinations (that
    // change IS the fix's own mutation-kill proof — see T2-3b-impl.md
    // "MUTATION-KILL 1"). Prior values (pre-Rank-1, T2-3b (a)'s commit) are
    // recorded in that commit's history for the diff.
    // T2-3c — RE-PINNED again, 11 of 12. The tick-only walk jump-guard
    // (`MK_TICK_JUMP_PEN`, `surface-fill.js`'s `walkFrom`/`walkPoly`) refuses
    // any walked step whose real screen distance blows past the walk's own
    // per-step budget — see that constant's comment for the mechanism and
    // `T2-3c-impl.md` for the per-cell longest-path proof this re-pin rests
    // on. `create|cone/contour` is the ONE cell this tree's own runaway
    // census (both the T2-3b review's and this unit's) never found a single
    // step over 5 mm on — its golden is UNCHANGED, byte-for-byte, which is
    // itself part of the mutation-kill proof (a guard that is truly inert on
    // an unaffected cell should not move that cell's own fingerprint).
    // T2-5 — RE-PINNED, 4 of 12: `test|torus/contour`, `test|cone/hatch`,
    // `create|torus/contour`, `create|cone/hatch` — exactly the cells whose
    // ask (`law.L0 * sv.R`) exceeds `2 * nominalRP` at this fixture, i.e.
    // where the re-tiling (`nSub > 1`) actually fires. `nSub` is sized as the
    // MINIMUM split that clears the over2RP bar itself
    // (`ceil(L0*R / (2*nominalRP))`), not a blanket round-to-nearest — a
    // tighter threshold than the plan's own sketch, chosen so the fix
    // touches only what clause (c) requires and leaves
    // `scene3d-mark-laws-draw.test.js`'s own O1 sagitta oracle (a file
    // outside this unit's ALLOWED scope) passing with margin. The other 8 of
    // 12 (including `sphere/hatch`, which the looser threshold used to
    // touch) are UNCHANGED byte-for-byte (`nSub === 1` there — proven
    // identical by construction, see `layMark`'s tick block). `L0` stays
    // 1.16 (stop condition 3, `T2-5-plan.md` §4 — see `T2-5-impl.md`), so the
    // change is the re-tiling ALONE. Mutation-kill: reverting the re-tiling
    // (forcing `nSub = 1`) reproduces an over-long-tick population on the
    // affected cells — proved in `scene3d-mktick-band-purity.test.js`'s own
    // O-C2 MUTATION-KILL (blocking).
    const EXPECTED_SIGNATURE = {
      'test|sphere/hatch': 'af0b4a9146aaffed83172d45fd803003ecc4edbc1235b5b07f06ec3d4b8c4308',
      'test|sphere/contour': '93933cdfe37148467c9b07bd535b4591e5a7e476f22eba1edce7734ffbb46e96',
      'test|torus/hatch': '7c12b6b4b17a54461852c3384dc3808f4adfb87eb14860c3c4a7b18b4923f4ca',
      'test|torus/contour': '9badc0813901afdc6245addb43c13e69c521c2819f7507dca9ae1a78ab67300b',
      'test|cone/hatch': '6d366bbc49212ce90ed80ba7011934b408f4fc98e91e123fda4fd248322dfa42',
      'test|cone/contour': '3aff4e5cdb31a1cbdfa96fe7e7cb0778e578316cdcd02f3d93520b573ab2f438',
      'create|sphere/hatch': '7de0d679be955f4c8c0012f22f62607318790ffb300a1d181a7b91c3c2de4a7f',
      'create|sphere/contour': 'ee6137a05a246a22294764059f12c3de32e2583bfc1d0012400b0a67f9806e09',
      'create|torus/hatch': '467252415a17e9d9e5d1b02e701e618ed3dd10db96057a313ffdf8fb85822916',
      'create|torus/contour': '69370635bff442cdde5c8f1804622dc9f6e136e67a5107fe9326fd81a472c960',
      'create|cone/hatch': '18081e43ea243f16d46f4f0ba5df63cc42211df4563c4ff64ee7834e9e29b6d1',
      'create|cone/contour': '3a64b05a04bd92367d0896e5f6382a6b36de60e0a44b7322b6b32b4f899b0bed',
    };

    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: pathSignature(paths, 4) is pinned`, () => {
          const key = `${rig}|${primitive}/${mapper}`;
          const actual = results[rig][`${primitive}/${mapper}`];
          const expected = EXPECTED_SIGNATURE[key];
          if (expected === 'PENDING') {
            // eslint-disable-next-line no-console
            console.log(`EXPECTED_SIGNATURE missing entry — paste this in: '${key}': '${actual}',`);
          }
          expect(actual).toBe(expected);
        });
      });
    });
  });

  // ── T2-3b (b): bar LOWERED 3.0 -> 2.30, per Jay's ruling on
  // `T2-3b-plan.md` §4.4 option (A) — see `## Bars changed` in
  // T2-3b-impl.md for the full derivation. `T2-3b-plan.md` §3.4: at the
  // period floor (`P = PMIN`) the maximum deliverable ink-area fraction at
  // a given tick length is `(L/R)*(w/PMIN) = 0.909*L/R`, so an
  // AREA-CORRECT tick has `L >= mkAsk(I)*R/0.909` — the tone *determines*
  // the length over the whole midtone, and O5 (dark-third / light-third
  // mean length) collapses onto the ratio of `mkAsk` over those thirds,
  // which on this fixture is ~2.3-3.2. The `>= 3.0` bar was T2-3's own
  // planner's PROXY for "length carries tone" (user-reports/8.png R1), not
  // a number Jay chose; it sits ABOVE the ceiling an area-correct tick can
  // reach at this row density (`MK_ROW_COV`, T3's — not this unit's, see
  // `T2-3b-plan.md` §3.3/§4.4 option (C), filed to T3 as a measured
  // requirement to halve the row pitch). RE-LOWER ONLY WITH THE SAME PROOF.
  const O5_BAR = 2.30;

  describe(`six-cell O5 (R1) — gated: length ratio >= ${O5_BAR}, monotone, both rigs, ALL six cells`, () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { stat } = renderCell(V, { primitive, mapper, rig });
          results[rig][`${primitive}/${mapper}`] = lengthCarriesTone(stat.lenByThird, stat.cntByThird);
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: O5 ratio >= ${O5_BAR} and monotone dark>=mid>=light`, () => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(r.ratio).not.toBeNull();
          expect(r.ratio).toBeGreaterThanOrEqual(O5_BAR);
          expect(r.monotone).toBe(true);
        });
      });
    });
  });

  describe('six-cell wedge/hole (R2) — wedge25 gated (mean blocking, per-cell non-regression ceiling); holeMax + siteCoverage REPORTED only', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(V, { primitive, mapper, rig });
          const w = measureWedge({ tickField: stat.tickField, paths, penWidth: BOUNDS.penWidth });
          const cov = siteCoverage(stat.tickSites);
          results[rig][`${primitive}/${mapper}`] = { ...w, siteCoverage: cov };
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      test(`${rig} rig — six-cell MEAN wedge25 <= ${WEDGE_MEAN_BAR[rig]} (BLOCKING mutation-kill-2 bar)`, () => {
        const vals = CELLS.map(([p, m]) => results[rig][`${p}/${m}`].wedge25);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(mean).toBeLessThanOrEqual(WEDGE_MEAN_BAR[rig]);
      });

      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: wedge25 <= ${WEDGE_CELL_CEILING[rig]} (non-regression ceiling)`, () => {
          expect(results[rig][`${primitive}/${mapper}`].wedge25).toBeLessThanOrEqual(WEDGE_CELL_CEILING[rig]);
        });
      });
    });

    test('holeMax and siteCoverage are non-vacuous numbers on every cell, both rigs (REPORTED, not gated — see file header)', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(Number.isFinite(r.holeMax)).toBe(true);
          expect(r.siteCoverage).toBeGreaterThan(0.90);
        });
      });
    });
  });

  describe('MUTATION-KILL 2 — the T2-3 stagger, real render, both rigs, all six cells (proves wedge25 gates the PLACEMENT fix, not an unrelated diff)', () => {
    let shippedRuntime;
    let mutantRuntime;
    const shipped = { test: {}, create: {} };
    const mutant = { test: {}, create: {} };

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: disableStagger(loadHeadSource()) },
      });
      const SV = shippedRuntime.window.Vectura;
      const MV = mutantRuntime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const s = renderCell(SV, { primitive, mapper, rig });
          const m = renderCell(MV, { primitive, mapper, rig });
          shipped[rig][`${primitive}/${mapper}`] = measureWedge({ tickField: s.stat.tickField, paths: s.paths, penWidth: BOUNDS.penWidth });
          mutant[rig][`${primitive}/${mapper}`] = measureWedge({ tickField: m.stat.tickField, paths: m.paths, penWidth: BOUNDS.penWidth });
        });
      });
    }, 180000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    ['test', 'create'].forEach((rig) => {
      test(`${rig} rig — six-cell MEAN wedge25: shipped (staggered) < no-stagger mutant`, () => {
        const meanOf = (obj) => {
          const vals = CELLS.map(([p, m]) => obj[rig][`${p}/${m}`].wedge25);
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        expect(meanOf(shipped)).toBeLessThan(meanOf(mutant));
      });

      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: shipped wedge25 <= no-stagger mutant's (monotone direction, per cell)`, () => {
          const key = `${primitive}/${mapper}`;
          expect(shipped[rig][key].wedge25).toBeLessThanOrEqual(mutant[rig][key].wedge25);
        });
      });
    });
  });
});
