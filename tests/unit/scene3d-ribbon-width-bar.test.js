/*
 * F1-width-bar — THE FIRST GUARD ANYWHERE IN THIS REPO THAT MEASURES RIBBON
 * WIDTH. `ROUND3-RESUME-BRIEFS.md` §4 (BRIEF D) / LEDGER row 2b / SESSION-
 * SUMMARY.md §4 decision 10: F1-placement's nine red tests (fill rate,
 * coverage, residue, gap geometry) all stayed green while
 * `torus/hatch/onePenDown/interlockWeave` visibly went from bold filled
 * ribbons to thin wireframe zigzags — because NOTHING measured the quantity
 * that moved. This file is that instrument.
 *
 * WHICH HALF THIS GATES (§0 rule 1 — state it, mutation-prove it). This is a
 * FLOOR, gating the LOWER half only: "does not go THINNER than X". It says
 * nothing about a ribbon going wider (no ceiling), and nothing about ink,
 * fill rate, or streak geometry (already gated by
 * `scene3d-ribbon-f1b-streaks.test.js` / `scene3d-ribbon-wall-coverage.test.js`
 * / `scene3d-ribbon-f1-amp.test.js`). Under decision 10 answer (A) — accept
 * the thinner, even style, which is what is SHIPPED today — this is the
 * guard that stops the NEXT unit from thinning a ribbon further, unnoticed.
 * Under answer (B) it is F1-weight's acceptance instrument (its bar would
 * gate the RESTORED width from above this file's floor).
 *
 * WHICH LAWS. Of the four F1-amp subject laws (`interlockWeave`,
 * `trochoidLoop`, `amplitudeOnly`, `onePenDown` — `RIBBON_LAWS` ∩
 * `isWaveLaw()` ∩ `!isWv6()`), only THREE ever produce a `CLS_RIBBON`-class
 * stretch on this fixture (torus/hatch/density 50, the F1-amp/F1-erode-plan
 * §7 fixture): `interlockWeave`, `trochoidLoop`, `onePenDown`. Measured,
 * not assumed: `amplitudeOnly` reports `ribbonStretchCount: 0` on BOTH the
 * pre-F1-amp (`6e1ed52f`) and post-F1-amp (current) tree — every one of its
 * stretches falls in the narrower CLS_WALLS/CLS_CENTRE buckets on this
 * fixture, so there is no "wide ribbon" population to floor for it here.
 * Per §0 rule 1 ("only where the bar you were given has more than one
 * clause, name the clause you do not [cover]") and JOB 3's own instruction
 * ("set a bar ONLY where the populations separate"): `amplitudeOnly` is
 * EXCLUDED from the width floor, disclosed here rather than silently
 * dropped, and instead gets its own `ribbonStretchCount` control test below
 * (so a FUTURE change that starts pushing it into the wide bucket is at
 * least visible, even though this file cannot floor a width that does not
 * exist yet).
 *
 * THE CANONICAL MEASUREMENT (JOB 1/2). `tests/helpers/scene3d-ribbon-width.js`
 * is the ONE shared width/ink measurement this repo now has, used
 * identically by `scripts/audit/scene3d-ribbon-width.js` (the canonical CLI
 * script) and this file — see that helper's own header for the CLS_RIBBON/
 * CLS_WALLS disambiguation method (F1-erode-plan.md §7's own technique,
 * reproduced exactly: wrap `RibbonGeometry.buildRibbonMultiPolygon`, filter
 * on `minHalfWidth === penWidth/2`).
 *
 * THE DISCREPANCY (JOB 1), RESOLVED. Two independently-written scripts
 * measured `trochoidLoop`'s torus/hatch/d=50 ink on md5-IDENTICAL
 * `surface-fill.js` (`3bc61c32`) and disagreed: the F1-amp implementer's
 * report says `6645.83 -> 6581.01mm (-0.98%)`; F1-amp's reviewer
 * independently got `6645.828 -> 6572.712mm (-1.10%)`, cause unresolved at
 * the time. This unit's canonical script settles it: run against the
 * ACTUAL committed `3bc61c32` content (`git show 3bc61c32:<path>` as a
 * `scriptOverrides` swap, confirmed byte-identical to this file's own
 * current committed content by `git diff 3bc61c32 179d9218 -- <path>` =
 * zero lines), the reproducible reading is `6572.7118mm` -- matching the
 * REVIEWER's number to 4 decimal places, not the implementer's `6581.01`.
 * The other three subject laws matched BOTH reports exactly, before AND
 * after, which independently rules out a rig/fixture/density difference (
 * that would have moved all four, not one). Determinism was checked
 * directly too: three fresh runtime loads of the identical tree gave the
 * identical `trochoidLoop` figure to the last printed digit. CONCLUSION:
 * the reviewer's `-1.10%` is this repo's canonical number for
 * torus/hatch/trochoidLoop/d=50 on the addLayer rig at `3bc61c32`; the
 * implementer's original `-0.98%` does not reproduce under the standard
 * construction and is treated as a measurement slip in that one script, not
 * a legitimate second rig/fixture reading. Full reasoning + reproduction
 * commands: `scripts/audit/scene3d-ribbon-width.js`'s own header.
 *
 * MEASURED (this unit, JOB 2 -- addLayer/unit-fixture rig, torus/hatch/d=50,
 * default camera 'a', pen 0.30mm):
 *
 *   law             | pre (6e1ed52f) width mm (pen) | post (current) width mm (pen) | Δ
 *   interlockWeave  | 1.1381 (3.7938)                | 0.9832 (3.2772)                | -13.6%
 *   trochoidLoop    | 0.9739 (3.2463)                | 0.9377 (3.1258)                | -3.7%
 *   onePenDown      | 1.0089 (3.3630)                | 0.8801 (2.9335)                | -12.8%
 *   ampSpacing (WV6 control) | 0.7787 (2.5955)        | 0.7787 (2.5955)                | 0.0% (byte-identical, as F1-amp's own report requires)
 *
 * F1-amp's own report attributed its ink loss to erosion/self-occlusion
 * interaction with added arc length, NOT to width -- this unit's own
 * measurement extends that finding: F1-amp measurably thins WIDTH too, on
 * all three laws that have a width to measure, by a further 3.7-13.6% on
 * top of whatever F1-placement had already done. This is new evidence for
 * decision 10's packet, not previously reported by any unit.
 *
 * DUAL-RIG DISCLOSURE (§0 rule 3). Per this unit's own brief: "unit fixture
 * via the helper; create rig via MAIN's scripts/audit/scene3d-capture.js."
 * The INK half of that instruction is satisfied here and in this unit's own
 * evidence captures (`docs/3d-audit/fill-audit/after/F1-width-bar/`, both
 * rigs) -- `scene3d-capture.js` already reports whole-object `inkMm` per
 * cell on both rigs, and F1-amp's own reviewer already measured `onePenDown`
 * at -7.99% on `create` (condition 3). The WIDTH half is NOT extended to the
 * `create` rig by this file: `RibbonGeometry.buildRibbonMultiPolygon`
 * wrapping only works inside THIS process (a loaded runtime this file
 * controls) -- the `create` rig's own measurement pipeline runs inside a
 * real browser page driven by `scene3d-capture.js`, which does not expose
 * per-stretch width and is a MAIN-owned script this unit's tests-only grant
 * does not extend to editing. Disclosed, not hidden: the FLOOR below is
 * proven on the addLayer/unit fixture only, matching the rig every sibling
 * RGR file in this lane already uses for its own bars.
 *
 * THE FLOOR + MARGIN (JOB 3) -- the drift envelope, measured, not assumed.
 * Camera 'a' (default) vs 'b' (`scene3d-capture.js`'s own second named
 * angle, yaw 40/pitch -15) on the SAME shipped tree:
 *
 *   law             | camera 'a' mm | camera 'b' mm | spread
 *   interlockWeave  | 0.9832         | 0.9784         | -0.5%
 *   trochoidLoop    | 0.9377         | 0.8270         | -11.8% (this law's
 *                     own documented lattice sensitivity, LEDGER row 2c)
 *   onePenDown      | 0.8801         | not measured -- attempted, aborted
 *                     after 40+ min under heavy shared-machine load
 *                     (`uptime` load average ~4 at the time; every other
 *                     build in this file's own measurement session
 *                     completed in under a minute). Disclosed, not hidden.
 *
 * Floor = `0.85x` the LOWER of the two measured camera angles where both
 * exist (`interlockWeave`, `trochoidLoop`); for `onePenDown`, where only
 * camera 'a' could be measured in the time available, a LARGER `0.80x`
 * margin is used instead of `0.85x`, as a conservative stand-in for the
 * unmeasured cross-camera risk. Repeat-run determinism was separately
 * confirmed exact (three fresh runtime loads of the identical tree gave the
 * identical figure to the last printed digit -- no floor slack needed for
 * run-to-run noise on this fixture). Every floor sits comfortably BELOW the
 * width a genuine thinning mutation produces (see the mutation-kill below:
 * a 0.6x scale on the literal width-setting line drops every subject law's
 * width by 40%, 20-29% of margin past each floor -- see the constants
 * below for the exact figures).
 *
 * MUTATION-KILL (§0 rule 1, BLOCKING) -- TWO mutations, on the SAME
 * instrumentation, proving the floor gates WIDTH SPECIFICALLY and not any
 * arbitrary source diff:
 *   1. POSITIVE (must trip the floor): `WIDTH_THIN_NEEDLE` scales the
 *      half-width value fed into `buildRibbonMultiPolygon` for the
 *      CLS_RIBBON branch specifically (`hw.push(Math.max(half[i],
 *      HALF_MIN))` -> `hw.push(Math.max(half[i], HALF_MIN) * 0.6)`) by 0.6.
 *      NOTE, disclosed rather than hidden: an EARLIER attempt mutated the
 *      upstream per-sample assignment (`half[i] = penWidth * (perSample ?
 *      ... : runW) / 2`) instead, and measurement showed it did NOT move
 *      `onePenDown`'s width at all (identical ink to 12 significant
 *      digits) -- `onePenDown` takes the `runW` (run-mean) branch, which
 *      this file's own classification (`classAt`, run BEFORE the mutation
 *      point) evidently reads from a value already fixed by the time this
 *      line runs for that law on this fixture, so scaling it there can also
 *      migrate borderline samples OUT of the CLS_RIBBON bucket entirely
 *      (survivor bias) rather than merely narrowing the surviving ones.
 *      Mutating the POST-classification `hw.push` call instead avoids both
 *      problems: classification (`classAt`) has already run against the
 *      UNSCALED `half[]` values, so `ribbonStretchCount` is provably
 *      unaffected by this mutation (asserted below) and the scale applies
 *      uniformly to every law that reaches the CLS_RIBBON branch at all --
 *      a direct, unambiguous "a future change draws every ribbon stretch
 *      thinner without changing which stretches are ribbons" mutation.
 *   2. NEGATIVE (must NOT trip the floor): F1-amp's own amplitude-floor
 *      wiring-revert (`tests/unit/scene3d-ribbon-f1-amp.test.js`'s
 *      `WIRING_NEEDLE`, reproduced here) -- a real, mechanism-changing
 *      mutation (it un-ships F1-amp's own amplitude floor) that
 *      F1-erode-plan.md §7 already showed does NOT move width ("Width comes
 *      from the weight field ... not [amplitude]"). If this mutation
 *      tripped the width floor, the floor would be vacuously sensitive to
 *      ANY diff, not specifically to thinning -- it does not, confirming
 *      the floor is measuring the thing it claims to.
 *
 *   npx vitest run tests/unit/scene3d-ribbon-width-bar.test.js
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { measureRibbonWidth } = require('../helpers/scene3d-ribbon-width');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');

// The three laws that actually produce CLS_RIBBON-class geometry on this
// fixture (measured -- see file header). `amplitudeOnly` is the fourth
// F1-amp subject law and is explicitly excluded (own control test below).
const WIDTH_LAWS = ['interlockWeave', 'trochoidLoop', 'onePenDown'];
const NO_RIBBON_CONTROL_LAW = 'amplitudeOnly';

// Measured post-fix (current tree) mean ribbon width, mm, addLayer rig,
// torus/hatch/d=50 -- see file header table (both camera 'a' and 'b' where
// both were measured; camera 'a' only for onePenDown, disclosed above).
// The floor is the LOWER measured camera reading x 0.85 (interlockWeave,
// trochoidLoop); onePenDown uses x0.80 -- a larger margin standing in for
// the unmeasured cross-camera spread.
const WIDTH_FLOOR_MM = {
  interlockWeave: 0.9784 * 0.85, // = 0.83164 (camera 'b' was lower)
  trochoidLoop: 0.8270 * 0.85, // = 0.70295 (camera 'b' was lower)
  onePenDown: 0.8801 * 0.80, // = 0.70408 (camera 'a' only -- larger margin)
};

// ── Mutation 1 (POSITIVE, must trip the floor): thin the literal per-sample
// width assignment by 0.6x. This is surface-fill.js's OWN width-setting
// line (the one line every CLS_RIBBON stretch's `half[]` array is built
// from) -- a direct simulation of "a future unit thins a ribbon".
const WIDTH_THIN_NEEDLE = '          hw.push(Math.max(half[i], HALF_MIN));';
const WIDTH_THIN_REPL = '          hw.push(Math.max(half[i], HALF_MIN) * 0.6);';

// ── Mutation 2 (NEGATIVE, must NOT trip the floor): F1-amp's own amplitude-
// floor wiring-revert, reproduced verbatim from
// `tests/unit/scene3d-ribbon-f1-amp.test.js` (own copy, not a cross-file
// require, so this file has no hidden dependency on that file's internals
// staying stable).
const WIRING_NEEDLE = [
  "      if (TONE_ALGO === 'interlockWeave') return WV_AFLOOR_SHARE + (WV_AMAX - WV_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'trochoidLoop') return WV_TROCH_AFLOOR_SHARE + (WV_TROCH_AMAX - WV_TROCH_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'tourScribble') return k * WV_SCRIB_AMAX;",
  "      if (TONE_ALGO === 'amplitudeOnly') return WV_AFLOOR_SHARE + (0.46 - WV_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'onePenDown') return WV_AFLOOR_SHARE + (WV_AMAX - WV_AFLOOR_SHARE) * k;",
].join('\n');
const WIRING_REPL = [
  "      if (TONE_ALGO === 'interlockWeave') return k * WV_AMAX;",
  "      if (TONE_ALGO === 'trochoidLoop') return k * WV_TROCH_AMAX;",
  "      if (TONE_ALGO === 'tourScribble') return k * WV_SCRIB_AMAX;",
  "      if (TONE_ALGO === 'amplitudeOnly') return k * 0.46;",
  "      if (TONE_ALGO === 'onePenDown') return k * WV_AMAX;",
].join('\n');

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

describe('SurfaceFill — F1-width-bar: a FLOOR on mean CLS_RIBBON width, per wave-ribbon law', () => {
  let shippedRuntime;
  let thinnedRuntime;
  let wiringRevertRuntime;
  const shipped = {};
  const thinned = {};
  const wiringRevert = {};

  beforeAll(async () => {
    shippedRuntime = await loadVecturaRuntime({ includeUi: true });
    thinnedRuntime = await loadVecturaRuntime({
      includeUi: true,
      scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), WIDTH_THIN_NEEDLE, WIDTH_THIN_REPL, 'WIDTH_THIN_NEEDLE') },
    });
    wiringRevertRuntime = await loadVecturaRuntime({
      includeUi: true,
      scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), WIRING_NEEDLE, WIRING_REPL, 'WIRING_NEEDLE') },
    });
    const SV = shippedRuntime.window.Vectura;
    const TV = thinnedRuntime.window.Vectura;
    const WV = wiringRevertRuntime.window.Vectura;
    WIDTH_LAWS.forEach((law) => {
      shipped[law] = measureRibbonWidth(SV, { law });
      thinned[law] = measureRibbonWidth(TV, { law });
      wiringRevert[law] = measureRibbonWidth(WV, { law });
    });
    shipped[NO_RIBBON_CONTROL_LAW] = measureRibbonWidth(SV, { law: NO_RIBBON_CONTROL_LAW });
  }, 600000);

  afterAll(async () => {
    if (shippedRuntime) await shippedRuntime.cleanup();
    if (thinnedRuntime) await thinnedRuntime.cleanup();
    if (wiringRevertRuntime) await wiringRevertRuntime.cleanup();
  });

  describe('GREEN — the shipped tree clears its own floor with real margin', () => {
    test.each(WIDTH_LAWS)('%s — shipped mean CLS_RIBBON width is at/above its floor', (law) => {
      const m = shipped[law];
      expect(m.ribbonStretchCount, `${law}: no CLS_RIBBON stretches fired -- fixture drifted?`).toBeGreaterThan(0);
      expect(m.meanRibbonWidthMm, `${law}: width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]}`)
        .toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law]);
    });
  });

  describe('RED / MUTATION-KILL (POSITIVE) — a real thinning mutation trips the floor', () => {
    test.each(WIDTH_LAWS)('%s — the 0.6x width-scale mutation drops mean width BELOW the floor', (law) => {
      const m = thinned[law];
      expect(m.ribbonStretchCount).toBeGreaterThan(0);
      // No survivor bias: the mutation is applied strictly AFTER `classAt`
      // has already run, so the SAME stretches are still classified
      // CLS_RIBBON -- only their drawn width changed.
      expect(m.ribbonStretchCount, `${law}: mutation changed WHICH stretches are CLS_RIBBON, not just their width`)
        .toBe(shipped[law].ribbonStretchCount);
      expect(m.meanRibbonWidthMm, `${law}: mutated width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]} -- mutation did not trip the floor`)
        .toBeLessThan(WIDTH_FLOOR_MM[law]);
      // Sanity: the mutation actually thinned it relative to shipped, not by
      // accident of some other interaction.
      expect(m.meanRibbonWidthMm).toBeLessThan(shipped[law].meanRibbonWidthMm);
    });
  });

  describe('NEGATIVE CONTROL — a real, unrelated mutation must NOT trip the floor (not vacuously sensitive to any diff)', () => {
    test.each(WIDTH_LAWS)('%s — reverting F1-amp\'s own amplitude floor does not move mean width below the floor', (law) => {
      const m = wiringRevert[law];
      expect(m.ribbonStretchCount).toBeGreaterThan(0);
      expect(m.meanRibbonWidthMm, `${law}: wiring-revert width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]} -- floor is vacuously sensitive to an unrelated mutation`)
        .toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law]);
    });
  });

  describe(`${NO_RIBBON_CONTROL_LAW} — excluded from the width floor (no CLS_RIBBON population on this fixture); own control`, () => {
    test('ribbonStretchCount is 0 on the shipped tree (measured, not assumed) -- a future change that starts populating it should be visible here', () => {
      const m = shipped[NO_RIBBON_CONTROL_LAW];
      expect(m.ribbonStretchCount).toBe(0);
    });
  });
});
