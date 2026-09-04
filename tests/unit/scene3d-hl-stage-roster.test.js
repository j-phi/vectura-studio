/**
 * THE HL_STAGE STAGES 2-7 DEBT, COUNTED IN ONE PLACE.
 *
 * `HL_STAGE` (`src/core/scene3d/surface-fill.js:276`) ships at Stage 1:
 * `masterGrid` / `dither` / `continuitySink` true, the other nine flags false.
 * Those nine false flags switch off a real, tested apparatus (zones, coverage
 * cap, feather, hysteresis, specular, light-driven highlight, treatment
 * dispatch, dash duty, graded shadow) — and 35 unit + 13 visual assertions
 * describe exactly what it should do once it is live. Deleting that code (and
 * the tests) to make CI green would be the failure mode CLAUDE.md forbids
 * ("never delete coverage to make it pass"); shipping the tests red would make
 * every future PR's `test:ci` lie. The resolution, decided in
 * `docs/pre-release-hardening-log.md` PRH-027: gate each dormant suite on the
 * flag it depends on, so it re-arms automatically the moment that flag flips.
 *
 * THIS FILE IS THE SOLE REGISTER OF THAT DEBT. No other file counts it.
 * Whoever flips an `HL_STAGE` flag — on purpose, to start the Stage 2-7
 * re-measurement effort PRH-027 describes, or by accident — MUST update this
 * file in the same change:
 *   - Test 1 pins the exact 12 flag values shipped at Stage 1. Flipping any of
 *     them fails Test 1 immediately, which is the loud failure that sends the
 *     flipper here.
 *   - Test 2 pins which suites are gated on which flag, so a reader can see the
 *     whole blast radius of a flag flip without grepping the repo.
 *   - Test 3 verifies the gate wiring is still textually present in each
 *     roster file — not just described here — so a refactor that silently
 *     drops a `describe.skip`/`test.skip` guard (leaving the assertion
 *     permanently dormant with no way to re-arm) is caught too.
 *
 * `scene3d-fill-boundary-ends.test.js`'s `torus · crosshatch` case is
 * DELIBERATELY EXCLUDED — it was never an HL_STAGE consequence. It is the
 * boundary detector's own tangency-at-a-second-cell limit, fixed for real by
 * widening `ALLOW` (see that file's `:243-266`). It is always green and is not
 * part of this roster.
 */
const fs = require('fs');
const path = require('path');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// The exact Stage 1 shape. RGR note: this literal was written first as
// `toneZones: true` to confirm the assertion actually fails against the
// shipped `false` before being corrected — see the unit's report for the
// before/after transcript.
const STAGE_1 = {
  masterGrid: true,
  toneZones: false,
  dither: true,
  coverageCap: false,
  feather: false,
  hysteresis: false,
  specular: false,
  lightDriven: false,
  treatment: false,
  dashDuty: false,
  shadowGrade: false,
  continuitySink: true,
};

// file -> { flag(s) it reads, the exact gate-declaration line(s) that must
// still be present, and a short description of what it gates }. Hardcoded, on
// purpose (§3 of Unit 5's job): this is the roster, not a derivation of it.
const ROSTER = {
  toneZones: [
    {
      file: 'tests/unit/scene3d-form-ladder.test.js',
      what: "the form ladder's O1/O2/O3/F-M/O4-O7/O13 ink ratios (O6 stays green — it is a structural constant check)",
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
    {
      file: 'tests/unit/scene3d-cross-frame.test.js',
      what: 'O17 — the crossed family holds ~65° on screen (whole describe)',
      wiring: 'const whenZones = STAGE.toneZones ? describe : describe.skip;',
    },
    {
      file: 'tests/unit/scene3d-form-shadow-limb.test.js',
      what: "O3 — the form shadow's crossed family does not run to the contour",
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
    {
      file: 'tests/unit/scene3d-surface-fill.test.js',
      what: 'tone asymmetry across the curved surface (lit side thins)',
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
    {
      file: 'tests/unit/scene3d-appdefault-lit-floor.test.js',
      what: 'the app-default lit cap keeps ink (litMaxPitchPen floor)',
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
    {
      file: 'tests/unit/scene3d-fill-ruling-continuity.test.js',
      what: 'zone-confined crossed families ("gate*") stop at their zone',
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
    {
      file: 'tests/visual/scene3d-tone-baseline.test.js',
      what: '10 sphere-* tone goldens + the specular/inversion-sensitivity contracts that read the curved zone apparatus',
      wiring: 'const whenZones = STAGE.toneZones ? test : test.skip;',
    },
  ],
  coverageCap: [
    {
      file: 'tests/unit/scene3d-plot-safety.test.js',
      what: 'the object-side composed coverage ceiling (C15 on the object)',
      wiring: 'const whenCoverageCap = STAGE.coverageCap ? test : test.skip;',
    },
    {
      file: 'tests/unit/scene3d-subwindow-density.test.js',
      what: 'the pole-caustic sub-window miss ceiling (whole describe)',
      wiring: 'const whenCoverageCap = STAGE.coverageCap ? describe : describe.skip;',
    },
  ],
  specular: [
    {
      file: 'tests/unit/scene3d-surface-fill.test.js',
      what: 'the specular toggle changing the curved fill (blank glint cap)',
      wiring: 'const whenSpecular = STAGE.specular ? test : test.skip;',
    },
  ],
  lightDriven: [
    {
      file: 'tests/unit/scene3d-light-driven-highlight.test.js',
      what: 'lightDriven highlightSensitivity binary-vs-graded ink',
      wiring: 'const whenLightDriven = STAGE.lightDriven ? test : test.skip;',
    },
  ],
  treatment: [
    {
      file: 'tests/unit/scene3d-highlight.test.js',
      what: 'the highlight-band treatment dispatch (dashed/sparse/none)',
      wiring: 'const whenTreatment = STAGE.treatment ? test : test.skip;',
    },
  ],
  dashDuty: [],
  shadowGrade: [
    {
      file: 'tests/unit/scene3d-light-driven-highlight.test.js',
      what: 'shadowSensitivity graded darkening on the dark side',
      wiring: 'const whenShadowGrade = STAGE.shadowGrade ? test : test.skip;',
    },
  ],
  feather: [],
  hysteresis: [],
  // The 3 TRUE flags at Stage 1 — live, not dormant, so they gate no suite.
  // Listed explicitly (empty) so the roster names all 12 flags, not just the
  // 9 false ones, and a reader does not have to guess whether a missing key
  // means "forgotten" or "on purpose".
  masterGrid: [],
  dither: [],
  continuitySink: [],
};

describe('HL_STAGE Stages 2-7 debt roster (the single register — see file header)', () => {
  test('the shipped flags are exactly Stage 1 — flipping any one of these must update this file', () => {
    expect(readHlStageSync()).toEqual(STAGE_1);
  });

  test('the sync reader agrees with the live runtime (no drift between the two readers)', async () => {
    const runtime = await loadVecturaRuntime();
    try {
      expect(runtime.window.Vectura.Scene3D.SurfaceFill.hlStage).toEqual(STAGE_1);
    } finally {
      runtime.cleanup();
    }
  });

  test('the roster names exactly the 12 flags, including the 3 that gate nothing', () => {
    expect(Object.keys(ROSTER).sort()).toEqual(Object.keys(STAGE_1).sort());
    // masterGrid, dither and continuitySink are Stage 1's TRUE flags — they are
    // live, not dormant, so they gate no suite.
    expect(ROSTER.masterGrid).toEqual([]);
    expect(ROSTER.dither).toEqual([]);
    expect(ROSTER.continuitySink).toEqual([]);
    // feather, hysteresis and dashDuty are false but gate nothing on their own
    // in this branch (per §0 of the integration plan: "feather gates nothing";
    // hysteresis and dashDuty have no test written against them in isolation).
    expect(ROSTER.feather).toEqual([]);
    expect(ROSTER.hysteresis).toEqual([]);
    expect(ROSTER.dashDuty).toEqual([]);
    // The 9 non-trivial entries, by flag.
    expect(ROSTER.toneZones.length).toBe(7);
    expect(ROSTER.coverageCap.length).toBe(2);
    expect(ROSTER.specular.length).toBe(1);
    expect(ROSTER.lightDriven.length).toBe(1);
    expect(ROSTER.treatment.length).toBe(1);
    expect(ROSTER.shadowGrade.length).toBe(1);
  });

  test('every roster entry is a real file, and every gate declaration it names is still wired', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const missing = [];
    Object.entries(ROSTER).forEach(([flag, entries]) => {
      entries.forEach(({ file, wiring }) => {
        const abs = path.join(rootDir, file);
        if (!fs.existsSync(abs)) { missing.push(`${file}: file does not exist`); return; }
        const src = fs.readFileSync(abs, 'utf8');
        if (!src.includes(wiring)) {
          missing.push(`${file}: gate wiring for '${flag}' not found — expected literal "${wiring}"`);
        }
      });
    });
    expect(missing).toEqual([]);
  });

  test("scene3d-fill-boundary-ends.test.js's torus·crosshatch is excluded — it is not an HL_STAGE consequence", () => {
    const abs = path.join(path.resolve(__dirname, '../..'), 'tests/unit/scene3d-fill-boundary-ends.test.js');
    const src = fs.readFileSync(abs, 'utf8');
    // It must NOT be flag-gated — it is a real, always-on fix (the ALLOW
    // widening), not a dormant assertion waiting on a flag flip.
    expect(src.includes('read-hl-stage-sync')).toBe(false);
    expect(src.includes("'torus/crosshatch'")).toBe(true);
  });
});
