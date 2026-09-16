/*
 * F1-width-bar-b — SIZE the `create`-rig ribbon-width gap (TESTS ONLY).
 * `ROUND3-RESUME-BRIEFS.md` §4 / `F1-width-bar-review.md` follow-up 3 /
 * LEDGER row 2b-1 / `docs/3d-audit/STILL-OPEN.md` (2026-09-13): F1-width-
 * bar's own floor is proven on the `addLayer` rig only -- the rig every RGR
 * test in this lane already uses. But `scripts/audit/scene3d-capture.js`'s
 * DEFAULT rig -- the ONE that produced every gallery screenshot Jay judges,
 * including decision 10's own evidence pictures -- is the DIFFERENT
 * `create` rig (`PRIMITIVE_CREATE_DEFAULTS` merged over
 * `PRIMITIVE_PARAM_DEFAULTS`). This file closes that gap.
 *
 * SCOPE, PER THE LEDGER'S OWN WORDING (row 2b-1, `STILL-OPEN.md`): "SIZE the
 * `create`-rig width gap, do not assume a bar is needed... report per-law
 * `create`-rig mean CLS_RIBBON width beside the `addLayer` numbers, and
 * propose a floor only if the populations warrant one." This is a
 * MEASURE-FIRST unit, not an automatic floor-for-every-law unit.
 *
 * FIXTURE, STATED PER THE STANDING RULE (rig, camera, density, every
 * non-default param, ground-plane ink included/excluded -- `ROUND3-RESUME-
 * BRIEFS.md` §0 rule 3):
 *   RIG:      `create` (`tests/helpers/scene3d-ribbon-width-create-rig.js`'s
 *             `measureRibbonWidthCreate` -- `PRIMITIVE_CREATE_DEFAULTS` over
 *             `PRIMITIVE_PARAM_DEFAULTS`, an inline `g.params.objects`/
 *             `lights`/`styleTable` envelope, reproduced VERBATIM from
 *             `scene3d-capture.js`'s `buildAndMeasure()` `else` branch,
 *             GH-2 `6ffaf9c6`).
 *   FIXTURE:  torus / hatch / fillDensity 50 (explicit -- the create rig
 *             ALWAYS sets fillDensity, unlike the addLayer rig's "law's own
 *             default" convention). fillAngle 45 (explicit literal, matching
 *             every gallery cell -- see helper file header).
 *   CAMERA:   'a' (app default) primary; 'b' (yaw+40/pitch-15, the gallery's
 *             own second angle) used for the drift envelope below.
 *   GROUND:   EXPLICITLY OFF (`q.ground = { enabled: false }`, the create
 *             rig's own construction) -- so every ink number in this file is
 *             OBJECT ink only, NEVER scene/ground ink. This is the one
 *             structural difference that matters most versus the addLayer
 *             rig's own helper, whose ground-ink confound (~2269mm, found by
 *             `F1-width-bar-reshoot.md`) simply cannot occur here.
 *   PEN:      0.30mm (read back from `lastRibbonStats.penWidth`).
 *
 * IDENTITY PROOF (this unit's own job): does the jsdom `create`-rig
 * construction above match a REAL browser page running the SAME
 * construction, on the SAME tree? `scripts/audit/scene3d-ribbon-width-
 * create-rig-identity.js` answers this for all four laws at `81925ee8`:
 * IDENTICAL path counts (282/278/138/229) on every law, but a DIFFERENT md5
 * -- because md5 is sensitive to cross-engine float64 last-ULP noise that a
 * geometric-equivalence check is not. A point-by-point max-coordinate-delta
 * diff (no rounding) found 5.12e-13mm / 8.53e-14mm / 2.84e-14mm / 2.27e-13mm
 * (interlockWeave/trochoidLoop/onePenDown/amplitudeOnly) -- 12-13 orders of
 * magnitude below the 0.3mm pen this whole file measures in. MD5 CANNOT
 * MATCH ON THIS PAIR OF ENGINES BY CONSTRUCTION (jsdom's `vm`-hosted V8 vs a
 * full headless Chromium's V8 round the same transcendental math to
 * slightly different last bits across ~280 paths' worth of coordinates --
 * ANY single 1-ULP difference anywhere changes the hash), but GEOMETRIC
 * EQUIVALENCE is proven to 12+ significant decimal digits, on all four laws,
 * both structurally (identical path/point counts) and numerically. Full
 * numbers: `docs/3d-audit/lane-reports/F1-width-bar-b-impl.md`.
 *
 * WHICH LAWS GET A FLOOR, AND WHY (measured, not assumed -- see the MEASURED
 * table below for the actual numbers):
 *   - `interlockWeave`, `trochoidLoop`: FLOORED. Both have a substantial,
 *     camera-stable `CLS_RIBBON` population (45->41 and 40->63 stretches
 *     across cameras 'a'->'b' respectively -- population size stays in the
 *     same order of magnitude, unlike `onePenDown` below) and a measurable,
 *     honest drift envelope. Floor = 0.85x the LOWER of the two measured
 *     camera widths, mirroring F1-width-bar's own addLayer-rig convention.
 *   - `onePenDown`: MEASURED ONLY, NO FLOOR. Its `CLS_RIBBON` population on
 *     this rig is tiny and CAMERA-UNSTABLE: 4 stretches at camera 'a', 6 at
 *     camera 'b' -- a 50% swing in POPULATION SIZE, not just width, between
 *     the two angles this repo's own gallery shoots. A mean over 4-6
 *     stretches is dominated by whichever stretch is largest; a floor set
 *     from either camera's reading would be a coin bar dressed as a
 *     regression guard. Per the ledger's own instruction ("propose a floor
 *     only if the populations warrant one"), this law does NOT get one here
 *     -- it gets a `ribbonStretchCount` pin instead (both cameras), so a
 *     FUTURE change that further destabilises this already-thin population
 *     is at least visible, exactly the `amplitudeOnly` convention below.
 *   - `amplitudeOnly`: EXCLUDED, own zero-population control (same
 *     disposition as the addLayer rig's own file -- unaffected by rig
 *     choice).
 *
 * MEASURED (this unit, `create` rig, torus/hatch/d=50/fillAngle-45,
 * `81925ee8`; addLayer-rig column reproduced from `scene3d-ribbon-width-bar
 * .test.js`'s own header for side-by-side comparison -- NOT re-derived here,
 * cited only):
 *
 *   law            | create camA width(cnt) | create camB width(cnt) | addLayer camA width (F1-width-bar's own number)
 *   interlockWeave | 0.98298 (45)            | 0.98121 (41)           | 0.9832
 *   trochoidLoop   | 0.93154 (40)            | 0.85254 (63)           | 0.9377
 *   onePenDown     | 0.92022 (4)             | 0.91425 (6)            | 0.8801
 *   amplitudeOnly  | n/a (0)                 | --                     | n/a (0)
 *
 * Repeat-run determinism confirmed exact on this rig too (three fresh
 * `loadVecturaRuntime` loads of the identical tree gave the identical
 * `interlockWeave` figure to the last printed digit) -- no floor slack
 * needed for run-to-run noise.
 *
 * `onePenDown` camera 'b' -- the addLayer-rig unit's own open follow-up 4,
 * attempted by both its implementer and reviewer and beaten by shared-
 * machine load both times -- IS MEASURED HERE (0.91425mm, 6 stretches),
 * `uptime` checked first per the ledger's instruction. It does not get a
 * floor (see above) but the number itself closes that standing gap.
 *
 * MUTATION-KILL (§0 rule 1, BLOCKING) -- the SAME two mutations as the
 * addLayer-rig file, reproduced here as this file's OWN copy (not a cross-
 * file require, per this lane's established convention), applied to the
 * `create`-rig construction:
 *   1. POSITIVE (must trip the floor): the same post-classification
 *      `hw.push(Math.max(half[i], HALF_MIN))` -> `* 0.6` scale. Measured:
 *      `ribbonStretchCount` UNCHANGED from shipped for both floored laws (45
 *      and 40 -- no survivor bias), width drops interlockWeave 0.983 ->
 *      0.590 (30% below its floor) and trochoidLoop 0.932 -> 0.559 (23%
 *      below its floor).
 *   2. NEGATIVE (must NOT trip the floor): F1-amp's own amplitude-floor
 *      wiring-revert. Measured: `ribbonStretchCount` CHANGES (45->30,
 *      40->36 -- a real mechanism/classification shift, expected and
 *      harmless) but width stays WELL above each floor (interlockWeave
 *      1.096, trochoidLoop 0.961) -- confirming the floor gates WIDTH, not
 *      an incidental population-size correlate.
 *
 *   npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { measureRibbonWidthCreate } = require('../helpers/scene3d-ribbon-width-create-rig');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');

// The two laws with a substantial, camera-stable CLS_RIBBON population on
// this rig -- see file header for the measured population counts that
// justify flooring these two and NOT `onePenDown`.
const FLOORED_LAWS = ['interlockWeave', 'trochoidLoop'];
const POPULATION_ONLY_LAW = 'onePenDown';
const NO_RIBBON_CONTROL_LAW = 'amplitudeOnly';

// Floor = 0.85x the LOWER of the two measured camera-angle widths (see file
// header MEASURED table) -- identical convention to the addLayer-rig file.
const WIDTH_FLOOR_MM = {
  interlockWeave: 0.9812093786482116 * 0.85, // = 0.83403 (camera 'b' was lower)
  trochoidLoop: 0.852543721783034 * 0.85, // = 0.72466 (camera 'b' was lower)
};

// `onePenDown`'s measured ribbonStretchCount per camera on this rig -- a
// population-stability CONTROL, not a width floor (see file header).
const ONE_PEN_DOWN_RIBBON_COUNT = { a: 4, b: 6 };

// ── Mutation 1 (POSITIVE, must trip the floor) -- identical needle to
// `scene3d-ribbon-width-bar.test.js` (own copy, no cross-file require).
const WIDTH_THIN_NEEDLE = '          hw.push(Math.max(half[i], HALF_MIN));';
const WIDTH_THIN_REPL = '          hw.push(Math.max(half[i], HALF_MIN) * 0.6);';

// ── Mutation 2 (NEGATIVE, must NOT trip the floor) -- F1-amp's own
// amplitude-floor wiring-revert, reproduced verbatim (own copy).
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

describe('SurfaceFill — F1-width-bar-b: SIZING the create-rig ribbon-width gap', () => {
  let shippedRuntime;
  let thinnedRuntime;
  let wiringRevertRuntime;
  const shippedA = {};
  const shippedB = {};
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

    [...FLOORED_LAWS, POPULATION_ONLY_LAW].forEach((law) => {
      shippedA[law] = measureRibbonWidthCreate(SV, { law, cameraAngle: 'a' });
      shippedB[law] = measureRibbonWidthCreate(SV, { law, cameraAngle: 'b' });
    });
    FLOORED_LAWS.forEach((law) => {
      thinned[law] = measureRibbonWidthCreate(TV, { law, cameraAngle: 'a' });
      wiringRevert[law] = measureRibbonWidthCreate(WV, { law, cameraAngle: 'a' });
    });
    shippedA[NO_RIBBON_CONTROL_LAW] = measureRibbonWidthCreate(SV, { law: NO_RIBBON_CONTROL_LAW, cameraAngle: 'a' });
  }, 600000);

  afterAll(async () => {
    if (shippedRuntime) await shippedRuntime.cleanup();
    if (thinnedRuntime) await thinnedRuntime.cleanup();
    if (wiringRevertRuntime) await wiringRevertRuntime.cleanup();
  });

  describe('GREEN — the shipped tree clears its own create-rig floor with real margin (both cameras)', () => {
    test.each(FLOORED_LAWS)('%s — camera a mean CLS_RIBBON width is at/above its floor', (law) => {
      const m = shippedA[law];
      expect(m.ribbonStretchCount, `${law}: no CLS_RIBBON stretches fired on the create rig -- fixture drifted?`).toBeGreaterThan(0);
      expect(m.meanRibbonWidthMm, `${law}: width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]}`)
        .toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law]);
    });
    test.each(FLOORED_LAWS)('%s — camera b mean CLS_RIBBON width is at/above its floor', (law) => {
      const m = shippedB[law];
      expect(m.ribbonStretchCount).toBeGreaterThan(0);
      expect(m.meanRibbonWidthMm, `${law}: camera-b width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]}`)
        .toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law]);
    });
  });

  describe('RED / MUTATION-KILL (POSITIVE) — a real thinning mutation trips the create-rig floor', () => {
    test.each(FLOORED_LAWS)('%s — the 0.6x width-scale mutation drops mean width BELOW the floor', (law) => {
      const m = thinned[law];
      expect(m.ribbonStretchCount).toBeGreaterThan(0);
      // No survivor bias: classification (classAt) already ran against the
      // UNSCALED half[] values before this mutation's line executes.
      expect(m.ribbonStretchCount, `${law}: mutation changed WHICH stretches are CLS_RIBBON, not just their width`)
        .toBe(shippedA[law].ribbonStretchCount);
      expect(m.meanRibbonWidthMm, `${law}: mutated width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]} -- mutation did not trip the floor`)
        .toBeLessThan(WIDTH_FLOOR_MM[law]);
      expect(m.meanRibbonWidthMm).toBeLessThan(shippedA[law].meanRibbonWidthMm);
    });
  });

  describe('NEGATIVE CONTROL — an unrelated mutation must NOT trip the create-rig floor', () => {
    test.each(FLOORED_LAWS)('%s — reverting F1-amp\'s own amplitude floor does not move mean width below the floor', (law) => {
      const m = wiringRevert[law];
      expect(m.ribbonStretchCount).toBeGreaterThan(0);
      expect(m.meanRibbonWidthMm, `${law}: wiring-revert width=${m.meanRibbonWidthMm}, floor=${WIDTH_FLOOR_MM[law]} -- floor is vacuously sensitive to an unrelated mutation`)
        .toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law]);
    });
  });

  describe(`${POPULATION_ONLY_LAW} — MEASURED, NOT FLOORED (population too small/camera-unstable on this rig)`, () => {
    test('camera a — ribbonStretchCount matches the measured, thin population (own control, not a width floor)', () => {
      expect(shippedA[POPULATION_ONLY_LAW].ribbonStretchCount).toBe(ONE_PEN_DOWN_RIBBON_COUNT.a);
    });
    test('camera b — ribbonStretchCount matches the measured, thin population, DIFFERENT from camera a by design (closes addLayer-rig follow-up 4: onePenDown camera b IS measured here)', () => {
      expect(shippedB[POPULATION_ONLY_LAW].ribbonStretchCount).toBe(ONE_PEN_DOWN_RIBBON_COUNT.b);
      expect(shippedB[POPULATION_ONLY_LAW].meanRibbonWidthMm).not.toBeNull();
    });
  });

  describe(`${NO_RIBBON_CONTROL_LAW} — excluded from any floor (no CLS_RIBBON population on this rig either); own control`, () => {
    test('ribbonStretchCount is 0 on the shipped create-rig tree (measured, not assumed)', () => {
      expect(shippedA[NO_RIBBON_CONTROL_LAW].ribbonStretchCount).toBe(0);
    });
  });

  describe('Ground-plane ink exclusion — the create rig has NO ground confound (structural, not measured per-run)', () => {
    test('the create-rig fixture explicitly disables ground, so totalInkMm is object ink only', () => {
      // measureRibbonWidthCreate always sets q.ground = { enabled: false };
      // this is a construction-time guarantee, asserted here so a future
      // edit to the helper that silently re-enables ground fails loudly
      // rather than reintroducing the exact confound F1-width-bar-reshoot.md
      // found on the addLayer rig.
      const helperSrc = fs.readFileSync(
        path.join(ROOT_DIR, 'tests/helpers/scene3d-ribbon-width-create-rig.js'),
        'utf8',
      );
      expect(helperSrc).toMatch(/q\.ground\s*=\s*\{\s*enabled:\s*false\s*\}/);
    });
  });
});
