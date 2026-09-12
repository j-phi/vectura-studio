/**
 * T4b — CI guard for T4's restored dark end (W-05b/W-06b plan, follow-up to
 * unit U4/T4). TESTS ONLY — no `src/` change in this unit.
 *
 * THE GAP THIS CLOSES
 * --------------------
 * T4 restored `mkDashRamp`'s band states so sphere/hatch/d=220 ink cleared
 * Jay's decision-1(B) bar (>= 1500mm) on the REAL creation-defaults capture
 * pipeline (`scripts/audit/scene3d-capture.js`) — measured 758.5 -> 1501.1mm,
 * a margin of only +0.07%. T4-review's own follow-up (1) flagged the gap:
 * "no automated CI test enforces the 1500mm figure ... only a one-time
 * manual capture-script run does." T4's own unit-test fixture
 * (`scene3d-mark-laws-draw.test.js`) cannot restate that literal bar in CI
 * because it uses a SMALLER reference sphere (radius 20 / detail 16,
 * `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS`) — on that fixture d=220 measures
 * only 981.6mm, permanently below 1500mm regardless of the fix's health (a
 * fixture ceiling, not evidence of the bug). This file closes that gap by
 * driving the sphere the CAPTURE PIPELINE actually renders, in CI.
 *
 * WHY THIS DRIVES engine.addLayer, NOT algo.generate(params)
 * ------------------------------------------------------------
 * A synthetic params bag would supply the very radius/detail values under
 * test (CLAUDE.md, "Where a default actually comes from" — a unit test
 * calling `generate(params)` directly can only ever see one of a scene
 * object's four possible default origins). This fixture instead drives the
 * REAL insert entry `engine.addLayer('scene3d')` -> `addSceneTree` ->
 * `addObjectToScene` (identical harness shape to
 * `scene3d-insert-default-ink.test.js`), so the object's `radius`/`detail`
 * come from `Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS.sphere` (25/28) exactly
 * as a real "Add Layer -> 3D Scene" click gives a user — not a literal this
 * file types in.
 *
 * Confirmed independently before writing the assertions below (2026-09-12,
 * this worktree, `dcc91872`): this fixture's unfiltered `group.scenePaths`
 * ink is 1501.0636578167772mm — reproducing `T4-review.md` §1's own,
 * independently-derived 1501.0636578167414mm (real/PRIMITIVE_CREATE_DEFAULTS
 * row, camera angle 'a' = `DEFAULT_CAMERA` verbatim) to 10 significant
 * digits. This really is "the same pipeline T4 measured on," not a
 * lookalike fixture that happens to be close.
 *
 * THE GUARD SHAPE (W-26b-3 / U9-2 precedent — LEDGER.md 0930cb2d "floor+band
 * shape adopted as prescribed" — the row-1a brief is explicit that this is
 * the shape wanted, NOT the lighter one-sided margin)
 * ---------------------------------------------------------------
 * A bar pinned at 1501.1 with ONLY a +/-10% band would (a) fail on ordinary
 * platform/fixture drift that lands outside that narrow band, and (b) PASS a
 * genuine regression all the way down to ~1351mm (1501.1 * 0.9) — nearly
 * double T4's own measured pre-fix number. Measured first, not guessed:
 *
 *   - REPEATABILITY: 5 identical in-process builds of this exact fixture are
 *     BIT-IDENTICAL (1501.0636578167772mm every time). `surface-fill.js` has
 *     zero `Math.random` calls (T4-review §1's own audit) and ink here is
 *     pure path-length math in document-mm space, computed before any
 *     canvas/DPI step (T4-review §1) — so `deviceScaleFactor` ("dsf 2" in
 *     the capture pipeline, `fill-audit-handoff.md`) cannot move this number
 *     at all and was not swept for that reason.
 *   - DRIFT ENVELOPE: an 8-point sweep of UNRELATED params (sun azimuth
 *     +/-2deg, sun elevation +/-2deg, camera yaw +/-2deg, camera pitch
 *     +/-2deg — the same class of "perturb something unrelated" measurement
 *     U9-2 used for its own envelope) measured on this fixture 2026-09-12:
 *     min 1479.741978529062mm (camera pitch -2deg), max 1517.5171325517256mm
 *     (camera yaw -2deg). The capture script's own SECOND named camera angle
 *     ('b': yaw 40 / pitch -15) measures 1528.9971472739608mm on this same
 *     fixture — a DIFFERENT cell, not drift, included here only as a further
 *     data point the floor also clears.
 *   - REGRESSION NUMBER: reverse-applying T4's own `surface-fill.js` hunk
 *     (`git diff a3b651f0^ a3b651f0 -- src/core/scene3d/surface-fill.js`,
 *     applied with `git apply -R`) onto a `git archive` scratch export of
 *     this worktree's HEAD (`dcc91872`) and re-measuring this EXACT fixture
 *     gives 758.5005509047427mm — reproducing T4-review's own independently
 *     measured 758.501mm RED number to 10 significant digits. Full repro
 *     steps are in `docs/3d-audit/lane-reports/T4b-impl.md`.
 *
 * FLOOR = 1400mm: 79.7mm (5.4%) BELOW the whole measured drift envelope
 * (envelope min 1479.74mm), and 641.5mm (84.6% of the regression value)
 * ABOVE the measured regression number (758.5mm) — wide margins on both
 * sides, not a value reverse-engineered from "smallest number that passes."
 * BAND = measured-baseline +/-10% ([1350.96mm, 1651.17mm]) — a second,
 * tighter, independent check on the identical quantity, layered ON TOP of
 * the floor (never the band alone), exactly the W-26b-3/U9-2 shape.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('T4b — CI guard: sphere/hatch/mkDashRamp d=220 ink on the creation-defaults insert pipeline', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // The real insert entry (engine.addLayer('scene3d') -> addSceneTree ->
  // addObjectToScene), same harness shape as
  // scene3d-insert-default-ink.test.js. Only the seeded sphere's STYLE is
  // overridden (mapper/density/toneLaw) to reach the specific cell T4/Jay
  // named; radius/detail are left exactly as PRIMITIVE_CREATE_DEFAULTS seeds
  // them — never typed in by this file.
  const buildFixture = () => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.getLayerById(groupId);
    // Isolate the OBJECT's own ink, matching scene3d-capture.js's own
    // `q.ground = {enabled:false}; q.backdrop = {enabled:false}` isolation.
    // Deleting the ground CHILD is the real, user-reachable way to turn the
    // scene-tree's ground off (addGroundToScene's own doc comment: "deleting
    // it turns it off").
    engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'sceneGround3d')
      .forEach((l) => engine.removeLayer(l.id));
    group.params.backdrop = { enabled: false };
    const light = engine.layers.find((l) => l.parentId === groupId && l.type === 'sceneLight3d');
    light.params.castShadows = false; // matches scene3d-capture.js's own SUN
    const object = engine.layers.find((l) => l.parentId === groupId && l.type === 'object3d');
    object.params.style = {
      penId: null,
      mapper: 'hatch',
      params: { fillAngle: 45, fillDensity: 220, toneLaw: 'mkDashRamp' },
    };
    engine.computeAllDisplayGeometry();
    return { engine, group, object };
  };

  const totalInk = (group) => {
    let ink = 0;
    (group.scenePaths || []).forEach((p) => {
      if (!Array.isArray(p)) return;
      for (let i = 1; i < p.length; i += 1) ink += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    });
    return ink;
  };

  test('the fixture reproduces the CREATE-defaults sphere (radius 25 / detail 28), not the smaller PARAM-defaults reference', () => {
    const { object } = buildFixture();
    expect(object.params.primitive).toBe('sphere'); // ALGO_DEFAULTS.object3d's seed primitive
    expect(object.params.params.radius).toBe(25);
    expect(object.params.params.detail).toBe(28);
  });

  test('is deterministic (no RNG in the mark-law path): 3 independent builds of this fixture agree to the mm', () => {
    const a = totalInk(buildFixture().group);
    const b = totalInk(buildFixture().group);
    const c = totalInk(buildFixture().group);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('HEADLINE (T4b) — d=220 ink has a floor BELOW the measured drift envelope, plus a tight fingerprint band (not a bare +/-10% coin bar)', () => {
    const ink = totalInk(buildFixture().group);

    // FLOOR — 1400mm. Below the measured 8-point unrelated-perturbation
    // envelope's minimum (1479.74mm, camera pitch -2deg) with 79.7mm/5.4%
    // headroom; above the measured regression value (758.5mm, T4's own
    // mechanism reverse-applied) with 641.5mm/84.6% headroom. A regression
    // that reproduced T4's pre-fix number trips this; ordinary drift does
    // not.
    expect(ink).toBeGreaterThan(1400);

    // BAND — measured baseline (1501.0636578167772mm) +/-10%. A tighter,
    // independent second check on the identical quantity (W-26b-3/U9-2
    // shape: floor below the whole envelope, PLUS a band around the
    // fingerprint — never the band alone).
    const BASELINE_INK = 1501.0636578167772;
    expect(ink).toBeGreaterThanOrEqual(BASELINE_INK * 0.9);
    expect(ink).toBeLessThanOrEqual(BASELINE_INK * 1.1);
  });

  test('non-regression sanity: d=220 ink clears the measured pre-fix (T4 reverted) number by a wide margin', () => {
    // 758.5005509047427mm is what THIS EXACT fixture measures with T4's own
    // surface-fill.js hunk (`a3b651f0`) reverse-applied in a scratch export
    // (repro steps in T4b-impl.md) — reproducing T4-review's independently
    // measured 758.501mm RED number to 10 significant digits. The 1.5x
    // multiplier mirrors T4's own O9-restated non-regression-floor
    // convention (`scene3d-mark-laws-draw.test.js`'s `> 510.9*1.5`).
    const PRE_FIX_INK = 758.5005509047427;
    const ink = totalInk(buildFixture().group);
    expect(ink).toBeGreaterThan(PRE_FIX_INK * 1.5);
  });
});
