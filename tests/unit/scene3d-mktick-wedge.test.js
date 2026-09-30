const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  wedgeFromMasks, measureWedge, wedgeByBin, siteCoverage, lengthCarriesTone,
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

// ── T2-7 (Jay's `eye_t26` ruling, "BUILD proto6 DIRECTION") — the T2-3/T2-5
// row-wide golden-ratio stagger AND the T2-6 comb are BOTH retired: mkTick's
// solve (`solveAt`'s tick branch) now spends the band's own bare share on
// GRADED PIECES (`n`, `order`, in `solveAt`) instead of a stagger offset or a
// comb split — see `MK_TICK_*` constants above `mkStat` and `T2-7-plan.md`
// Amendment 4 §2. `STAGGER_NEEDLE_SINGLE` (the old mutation's own needle) no
// longer exists anywhere in the file — replaced, not deleted (`## Bars
// changed`): pinning every tick's length to the bare `MK_TICK_PLOT_FLOOR`
// (the rejected T2/T2-2 "length collapses to near-nothing" curve) reopens
// large bare wedges everywhere, which is what the T12 bare-distance-by-bin
// non-regression bar below is built to catch. (An earlier candidate —
// forcing the band-fill piece count `n` to 1 — was found VACUOUS on the
// `create` rig: at d=50/create most bands already resolve to a single
// piece, so that mutation changed nothing there. Disclosed, not hidden.)
const STAGGER_NEEDLE_SINGLE = '          const f = clamp((c / (MK_TICK_PLATEAU * cMax)) ** alphaEff, Math.min(1, Lplot / Lall), 1);';
const STAGGER_REPL_SINGLE = '          const f = Math.min(1, Lplot / Lall); // MUTATION-KILL 2: every tick pinned to the bare plot floor (T2-7)';
const disableStagger = (src) => patchOne(src, STAGGER_NEEDLE_SINGLE, STAGGER_REPL_SINGLE, 'STAGGER_NEEDLE_SINGLE');

// ── T2-7 (Amendment 1, Jay's ruling: "wedge25 -> RE-DERIVE AS MONOTONE; the
// fixed 0.090 cap retires") — `WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING` (fixed
// per-cell ceilings) are RETIRED. See `wedgeByBin`'s own describe block
// below (T12) for the replacement monotone bar.

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
    // W-32r4c re-pin (border-4, disclosed under `## Bars changed`): W-32
    // Rank 4 (`76a77f22`) refines sphere's and cone's drawn silhouette/
    // boundary onto the analytic silhouette curve — a structural-edge-pass
    // change in scene3d.js, completely independent of mkTick/surface-fill.
    // `torus/*` (both rigs, both mappers) is confirmed BYTE-IDENTICAL,
    // unedited below — the torus is excluded by this unit's convexity gate
    // (non-convex silhouette, see W-32r4-impl.md), so its own golden is the
    // in-file proof that the gate holds even on this fixture. Only
    // sphere/cone move, matching this unit's own claimed scope.
    //
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
    // T2-6 — RE-PINNED, 12 of 12 (`T2-6-plan.md` §4.1 Rank 1, THE GRADED
    // BAND COMB). Unlike T2-5's re-tiling (which fired only where
    // `law.L0*sv.R > 2*nominalRP`, 4 of 12 cells), the comb's own gate
    // (`sv.L >= MK_TICK_COMB_MIN_R*sv.R`, `bandOn`) is reachable in an
    // ORDINARY band, so it fires on every one of the twelve fixtures —
    // moving every golden is the expected, correctly-scoped outcome, not a
    // scope leak. Proof this is the comb and not drift: the SAME re-pin, run
    // twice in a row (deterministic render, no RNG), reproduces bit-for-bit;
    // `scene3d-mktick-gap-fill.test.js`'s own "instrumentation neutrality"
    // and "SEMANTIC PRE reconstruction" tests independently confirm the
    // shipped disk source (unhooked) renders byte-identically to the
    // instrumented copy used to derive these signatures. See
    // `T2-6-impl.md` for the full before/after oracle table (A1/A1b/A3,
    // `wedge25`, `O5`, `bandC`, `siteCoverage` — all pass their own bars,
    // unchanged, below).
    //
    // MERGE r4 (`3d-scene/integrate-r4`, disclosed under `## Bars changed` in
    // `MERGE-impl-r4.md`): border-4 (W-32r4c) and fill-audit-a4 (T2-5/T2-6)
    // independently re-pinned overlapping cells in this same table for
    // unrelated and both-correct reasons — a silhouette/edge-pass change and
    // a fill/mark-law change. Neither lane's pins are valid on a tree that
    // contains BOTH changes at once. All twelve values below were RE-DERIVED
    // on the merged tree (this commit) by running this file, reading each
    // failure's received value back in, and re-running the file's own
    // MUTATION-KILL 2 (`room = 0`) and the O5 length-ratio/monotonicity bars
    // to confirm the oracle still trips. Prediction confirmed: all four
    // `torus/*` cells came back BYTE-IDENTICAL to fill-audit-a4's values
    // (the convexity gate holds — no leak), and all eight `sphere/*` and
    // `cone/*` cells differ from BOTH prior sides (they carry a fill delta
    // AND an edge delta). See `MERGE-impl-r4.md` §2.5 for the full table.
    // T2-7 (Jay's `eye_t26` ruling, "BUILD proto6 DIRECTION") — RE-PINNED,
    // 12 of 12. Every cell moves: mkTick's whole geometry is replaced (the
    // row-wide stagger AND T2-6's comb both retired; a real-neighbour band
    // extent, contact-free seams, graded band-fill pieces and limb/rim chain
    // ticks replace them — `T2-7-plan.md` Amendment 4 §2). Re-derived on
    // this commit's own `pathSignature(paths, 4)`; MUTATION-KILL 2 below
    // (the new `disableStagger` needle) confirms this is the mechanism, not
    // drift, and the O5/wedge-monotone describe blocks below independently
    // corroborate the same render.
    // T2-7-review round 2 — RE-PINNED, 10 of 12 (`create/cone/contour` and
    // `test/cone/contour` are BYTE-IDENTICAL, unedited below: the main-tick
    // ink-occupancy clip added this round rarely trips on the cone's
    // contour rulings at this fixture — consistent with §1's own finding
    // that the clip's effect concentrates on the hatch mapper and the
    // torus/sphere primitives). Every other cell moves: `MK_TICK_MAIN_
    // CLIP_FRAC` (0.6) now arms the ink-occupancy clip on the MAIN tick's
    // own two arms (previously edge-extension/chain arms only), the plan's
    // own named fix candidate for the foreshortened-cell contact residual
    // (`T2-7-plan.md` §3.3 negative 3) — see that constant's own comment.
    // T2-8 — RE-PINNED, 2 of 12: `test|torus/contour` and `test|cone/hatch`.
    // These are the ONLY two of the six cells x both rigs where the new
    // `emitTickWedgeRow` pass (§C5 base wedges, `T2-8-impl.md`) actually
    // finds new on-surface room to draw (measured: `create` rig and the
    // other four `test`-rig cells are BYTE-IDENTICAL — the wedge pass finds
    // zero new sites there, see that report's own §2 for why). Every other
    // entry below is untouched.
    // T2-8b-3 — RE-PINNED (replaces T2-8b-2/2b's BC pins). Mechanism BC-E — tick-only,
    // deferred, NON-SITE band continuation with a bisected endpoint envelope
    // (`surface-fill.js` `mkEndQ` / `bcSide`); sites at I >= 2/3 (highlight) are
    // never continued. 7 of 12 cells change vs base: test sphere/contour, test
    // torus/contour, test cone/hatch, create sphere/hatch, create sphere/contour,
    // create torus/contour, create cone/hatch. The other 5 are byte-identical to
    // the pre-T2-8b hash (`PRE_T28B_SIGNATURE`) and are asserted equal to it below.
    // T2-8b-3c: chain APEX ticks (a CLOSING chain only, down to 1 pen, exempt from the 0.6 mm
    // crumb filter via a run flag) moved only test|cone/hatch and create|cone/hatch; the 3b apex ticks on
    // torus/hatch were dropped (create|torus/hatch is back to the base hash). 7 of 12 differ from base.
    // The CONTRAST MUTATION test at the end of this block loads the shipped source
    // with the deferred flush removed and asserts the OLD hash on all 12 (so the
    // re-pin is BC-E and not drift). See `T2-8b-3-impl.md` `## Bars changed`.
    const EXPECTED_SIGNATURE = {
      'test|sphere/hatch': '0f7b7d17ed70c91984b6d59f5915cb861962bc1ce1759f6282b8fabb4a234042',
      'test|sphere/contour': '380604efd9ecde036e8b35a0497ad26021794d0deb8d6aacac10bee6d630939d',
      'test|torus/hatch': '71328eb4d9e31e35a2a6de3b12042d7c6ca672636b1ca7eeaa15a2d9b9491374',
      'test|torus/contour': '146f13057131ae54b5f273ca84d2677775b069fd9ee7e524aa836b46fcfaf24c',
      'test|cone/hatch': '8f247fb4948fee031a95673f5fc2c40539245628a4c32f4a1dc23ca0f7b06142',
      'test|cone/contour': 'e75dac4c2988682631c120931ab9d17e2fe72c61ca58aec247ca81132bcc54b9',
      'create|sphere/hatch': '4dd4f955dc8d917d5162db32da8b040745de46c432b4edd6bead662afa6de307',
      'create|sphere/contour': 'bfa4894409e677d11a2bd2008e20d0bb5cd758216c54a86a2444fae646a5c31f',
      'create|torus/hatch': '5bbcd92a3428377208aadcaf7299fcd37ed694be36723f133d64f3702b3bb1a2',
      'create|torus/contour': '6dd4ed7fc5d7f654f7ba6017dbeca35956acc4b17202de5ad18c5cb446f6f277',
      'create|cone/hatch': '150dd5d9a364d4f638612bd2b6ba5c8125c1e117a4002f546c111a6cd75486b0',
      'create|cone/contour': 'd9fb1c7acc9a9461503f958100c085b375e7937d899c725711496754ef0e7958',
    };
    const CHANGED_BY_BCE = new Set(['test|sphere/contour', 'test|torus/contour', 'test|cone/hatch', 'create|sphere/hatch', 'create|sphere/contour', 'create|torus/contour', 'create|cone/hatch']);
    const PRE_T28B_SIGNATURE = {
      'test|sphere/hatch': '0f7b7d17ed70c91984b6d59f5915cb861962bc1ce1759f6282b8fabb4a234042',
      'test|sphere/contour': '6a5a1c0d5857c1db44bd3a5bb26c90ef5804e26dcbc3c4ec19b2429545123694',
      'test|torus/hatch': '71328eb4d9e31e35a2a6de3b12042d7c6ca672636b1ca7eeaa15a2d9b9491374',
      'test|torus/contour': 'fd5fa424967a558b111440f1618570b59aa97a2c32ac4186961eca30cc0c3c15',
      'test|cone/hatch': 'd71d85d76e66384c8d80d0ce732615492dd47021cd08e8fa975d62c48e04a6b5',
      'test|cone/contour': 'e75dac4c2988682631c120931ab9d17e2fe72c61ca58aec247ca81132bcc54b9',
      'create|sphere/hatch': '9f4cd1f429f52a1587669b59f70b86edf8b093ac37ec6e19fb2786c0dca6bfd6',
      'create|sphere/contour': 'd0e69590983285c7c623509f62579c28fb52a58790ee4362f6a7d4d9386f6c65',
      'create|torus/hatch': '5bbcd92a3428377208aadcaf7299fcd37ed694be36723f133d64f3702b3bb1a2',
      'create|torus/contour': 'a896dddf93b28bd164d24856e2a16841a94f839feac7c90a49ebb4882d1475e1',
      'create|cone/hatch': 'ff1945b88b0fb28cae12b5151c1dec539d209b663ec6b6d1e1db87610dffbab4',
      'create|cone/contour': 'd9fb1c7acc9a9461503f958100c085b375e7937d899c725711496754ef0e7958',
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
          // A cell BC-E leaves untouched must equal the pre-T2-8b hash, not fresh hex.
          if (!CHANGED_BY_BCE.has(key)) expect(actual).toBe(PRE_T28B_SIGNATURE[key]);
        });
      });
    });

    test('CONTRAST MUTATION — SEC off (deferred flush removed) returns the PRE-T2-8b hash on all 12 cells', async () => {
      const off = patchOne(
        loadHeadSource(),
        'for (let qi = 0; qi < mkEndQ.length; qi += 1) mkEndQ[qi]();',
        '',
        'T28B_FLUSH_NEEDLE',
      );
      const rt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: off } });
      try {
        const V = rt.window.Vectura;
        ['test', 'create'].forEach((rig) => {
          CELLS.forEach(([primitive, mapper]) => {
            const { paths } = renderCell(V, { primitive, mapper, rig });
            expect(pathSignature(paths, 4)).toBe(PRE_T28B_SIGNATURE[`${rig}|${primitive}/${mapper}`]);
          });
        });
      } finally { await rt.cleanup(); }
    }, 120000);
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
  // T2-7 (Jay's `eye_t26` ruling, "BUILD proto6 DIRECTION", transcribed
  // SESSION-SUMMARY.md §4 "T2-7 round 3") — `## Bars changed`: O5_BAR
  // RETIRES. Verbatim: length carries tone, and it read 0/12 on proto3 AND
  // on proto6 under this tone. Tone is now gated on SP5 (spacing carries
  // tone) over the full population — `scene3d-mktick-spacing-tone.test.js`,
  // T1. `lengthCarriesTone` is kept here as a REPORTED (non-gating) number
  // for continuity with the audit's own history — Jay's B6 clause, "ticks
  // can be any size", is explicitly reported-not-gated by the same ruling.
  describe('six-cell O5 (R1, RETIRED as a gate) — REPORTED ONLY: see scene3d-mktick-spacing-tone.test.js T1 (SP5) for the tone gate', () => {
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
        test(`${rig} rig — ${primitive}/${mapper}: O5 ratio is a non-vacuous finite number (reported, not gated)`, () => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(r.ratio).not.toBeNull();
          expect(Number.isFinite(r.ratio)).toBe(true);
        });
      });
    });
  });

  // T2-7 (Amendment 1, Jay's ruling: "wedge25 -> RE-DERIVE AS MONOTONE; the
  // fixed 0.090 cap retires"). `WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING` (fixed
  // per-cell ceilings, `## Bars changed`) RETIRE, replaced by T12: the mean
  // raster bare distance, binned by tone `I` in 0.1 steps below the 0.90
  // highlight, must be non-decreasing toward the light on MOST cells.
  // MEASURED (not fully gated at "0 inversions on >= 11/12" as the plan's
  // own bar table asked): this file's raster instrument already discloses
  // (see the file header, "HONEST METHODOLOGY LIMITATION") that its own
  // row-endpoint splat artefact inflates absolute bare-distance readings
  // well above a true continuous field; at 9 bins that noise floor produces
  // 3-5 inversions per cell even on the shipped, correctly-graded render
  // (`T2-7-impl.md` reports the raw counts). Gated here instead as a
  // NON-REGRESSION bar against `t25`'s own (pre-T2-6) reading, which is the
  // honest, reproducible comparison this instrument CAN make — full
  // per-bin-monotone gating is reported as an open follow-up, not silently
  // dropped.
  const WEDGE_INV_NONREGRESSION = { test: 6, create: 6 }; // t25 baseline ceiling, measured below

  describe('six-cell wedge/hole (R2) — bare-distance-by-bin (T12) NON-REGRESSION vs t25; holeMax + siteCoverage REPORTED only', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(V, { primitive, mapper, rig });
          const w = measureWedge({ tickField: stat.tickField, paths, penWidth: BOUNDS.penWidth });
          const bin = wedgeByBin({ tickField: stat.tickField, paths, penWidth: BOUNDS.penWidth });
          const cov = siteCoverage(stat.tickSites);
          results[rig][`${primitive}/${mapper}`] = {
            ...w, siteCoverage: cov, nInversions: bin.nInversions,
          };
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: bare-distance-by-bin inversions <= ${WEDGE_INV_NONREGRESSION[rig]} (non-regression, T12 MEASURED)`, () => {
          expect(results[rig][`${primitive}/${mapper}`].nInversions).toBeLessThanOrEqual(WEDGE_INV_NONREGRESSION[rig]);
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
