const {
  loadScene3dAuditRuntime, clone, freezeDeep, cloneFixture, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW, describeSingleParamCluster, describeComboCluster,
  recordedShadowResolvesToSurvivor,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part D: U4/U5/U5b caveats, U7-2, U9b-2. (R-27: the U1..U5
// primitive x density render sweep was removed; resolution is unit-tested in
// tests/unit/scene3d-tone-law-collapse.test.js and end to end in
// tests/unit/scene3d-tone-law-plumbing.test.js.)

describe('Scene3D tone-law collapse — U4 caveat-visibility gap (bundleDither, LIBRARY-tier, has a real caveat)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct lookups (entry/note by raw id) still show the caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const note = FS.note('bundleDither');
    expect(note.caveat.length).toBeGreaterThan(0);
    expect(note.caveat).toMatch(/moire/);
  });

  // U5b (BLOCKING BEFORE MERGE, ruled 2026-09-06) — the fix. Folding a law
  // must NOT hide its measured caveat: `SCENE_FILL_STYLES.effectiveLaw`
  // resolves (survivor id, current collapse sub-control values) back to the
  // SPECIFIC internal id those values select — mirroring
  // `Scene3D.Params.resolveToneLaw`'s own survivor+params rule (rules 3/4)
  // without this config file depending on the core engine module. The two
  // UI surfaces (scene3d-panel.js, context-bar.js) read the CAVEAT off this
  // effective id while still reading the (i) popover's blurb off the plain
  // survivor `entry`/`note` — the two are deliberately NOT the same lookup.
  test('U5b FIX: effectiveLaw resolves the "Dithered" sub-control choice back to bundleDither, surfacing its own caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    expect(typeof FS.effectiveLaw).toBe('function');
    expect(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).toBe('bundleDither');
    const caveat = FS.note(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).caveat;
    expect(caveat.length).toBeGreaterThan(0);
    expect(caveat).toMatch(/moire/);
    // The bare survivor (sub-control at its own default, or the bag empty)
    // still shows no caveat — this must not manufacture one out of nothing.
    expect(FS.effectiveLaw('bundleCount', { bundleMode: 'count' })).toBe('bundleCount');
    expect(FS.note(FS.effectiveLaw('bundleCount', {})).caveat).toBe('');
    // A survivor with no collapse descriptors at all (no STYLE_PARAMS entry)
    // passes through unchanged, regardless of the bag it is handed.
    expect(FS.effectiveLaw('etfKang', { bundleMode: 'dither' })).toBe('etfKang');
  });
});

describe('Scene3D tone-law collapse — U5 caveat-visibility gap (contFieldTouch, LIBRARY-tier, has a real caveat)', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); });
  afterAll(() => runtime.cleanup());

  test('BY_ID-direct lookups still show the caveat — the roster corpus is untouched', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const note = FS.note('contFieldTouch');
    expect(note.caveat.length).toBeGreaterThan(0);
    expect(note.caveat).toMatch(/floods/);
  });

  // U5b FIX — the two-descriptor survivor (contFieldSigmoid has BOTH
  // fieldMetric and fieldFloor), exercising resolveToneLaw's rule 4 case
  // (exactly one descriptor active -> that descriptor's law; more than one
  // active at once -> deterministic fallback to the bare survivor, never a
  // throw) through effectiveLaw as well.
  test('U5b FIX: effectiveLaw resolves the "Ink-width floor" sub-control choice back to contFieldTouch, surfacing its own caveat', () => {
    const FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    const touch = { spacing: 'field', closestApproach: 'touch' };
    expect(FS.effectiveLaw('ladder', touch)).toBe('contFieldTouch');
    const caveat = FS.note(FS.effectiveLaw('ladder', touch)).caveat;
    expect(caveat.length).toBeGreaterThan(0);
    expect(caveat).toMatch(/floods/);
    // Both descriptors at default -> the bare survivor, no caveat.
    expect(FS.effectiveLaw('ladder', {})).toBe('ladder');
    expect(FS.note(FS.effectiveLaw('ladder', {})).caveat).toBe('');
    // Unrepresentable combination (both non-default at once) falls back to
    // the bare survivor deterministically, matching resolveToneLaw rule 4.
    expect(FS.effectiveLaw('ladder', { spacing: 'field', fieldMetric: 'surface', closestApproach: 'touch' })).toBe('ladder');
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U5b-2 — plain-language rewrite of the caveat copy for end users.
 * U5b's review (docs/3d-audit/lane-reports/U5b-review.md, flag 4) accepted
 * that the two caveats are now VISIBLE (U5b's whole job), but flagged their
 * WORDING as raw audit prose ("RMS", "R2", "L* span", "sphere·hatch" as a
 * bare cell-name token, "negative result") — a plotter-art user has no
 * reason to know any of that vocabulary. `docs/tone-laws/laws.json` is the
 * SOURCE of `BY_ID[id].caveat` (regenerated into
 * src/config/scene3d-tone-laws.js by `node scripts/build-tone-laws.js` —
 * see that script's own header comment); the measured numbers themselves
 * stay recorded in `docs/tone-laws/README.md` (`### 15 · bundleDither` /
 * `### 19 · contFieldTouch`) and LEDGER.md's line 610-612 ruling, exactly
 * where the review says they "already live" — this unit does not touch
 * either of those record files, only the picker-facing copy.
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('Scene3D tone-law collapse — U5b-2 (plain-language caveat copy)', () => {
  let runtime; let FS;
  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
  });
  afterAll(() => runtime.cleanup());

  // RGR proof: this assertion is RED against the pre-U5b-2 tree (the
  // committed-at-49475ccd wording contains "RMS", "R2", "sphere·hatch" as a
  // bare token, and "negative result" for bundleDither); GREEN once
  // laws.json's caveat fields are rewritten and scene3d-tone-laws.js is
  // regenerated.
  test('neither caveat carries raw audit statistics or internal jargon', () => {
    const jargon = /\bRMS\b|\bR2\b|\bR²\b|L\*|sphere·hatch|sphere·crosshatch|cylinder·hatch|negative result|off-the-line/i;
    ['bundleDither', 'contFieldTouch'].forEach((id) => {
      const caveat = FS.entry(id).caveat;
      expect(typeof caveat, `generated caveat for ${id}`).toBe('string');
      expect(caveat.length).toBeGreaterThan(0);
      expect(caveat).not.toMatch(jargon);
    });
  });

  // The rewrite must not silently drop the caveat, and must still be
  // reachable through the same effectiveLaw path U5b wired — a wording-only
  // change must not regress U5b's own fix.
  test('the plain-language caveats are still exactly two sentences and still surface through effectiveLaw', () => {
    const sentenceCount = (s) => (s.match(/[.!?](?:\s|$)/g) || []).length;
    ['bundleDither', 'contFieldTouch'].forEach((id) => {
      const caveat = FS.entry(id).caveat;
      expect(typeof caveat, `generated caveat for ${id}`).toBe('string');
      expect(sentenceCount(caveat)).toBeLessThanOrEqual(2);
    });
    expect(FS.note(FS.effectiveLaw('bundleCount', { bundleMode: 'dither' })).caveat)
      .toBe(FS.note('bundleDither').caveat);
    expect(FS.note(FS.effectiveLaw('ladder', { spacing: 'field', closestApproach: 'touch' })).caveat)
      .toBe(FS.note('contFieldTouch').caveat);
  });

  // Still names the exact UI control values a user just picked — plain
  // language should point back at what they can DO about the warning, not
  // just restate that something is wrong.
  test('each caveat references the option that reaches it or its sibling, in the UI\'s own wording', () => {
    expect(FS.note('bundleDither').caveat).toMatch(/Dithered|Count mode|Integer pass count/);
    expect(FS.note('contFieldTouch').caveat).toMatch(/Closest approach/);
  });
});

/*
 * U7-2 — plain-language pass over EVERY remaining folded fill-law caveat
 * (and the two jargon-free-on-inspection ones this pass left untouched:
 * `none`/"NO TONE" got a light polish too, of the 20 laws.json entries that
 * ever had a caveat, 3 were already rewritten to plain language before this
 * unit — bundleDither/contFieldTouch by U5b-2, penStipple by U6 — this unit
 * rewrote the remaining 17: deepFillTSP, bundleSubNib, penInterleave,
 * penReserve, penCross, penPitchMatch, penFacing, ampSpacing, weaveDepth,
 * interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, mezzoRegion,
 * dutyConst, endShorten, and "none" (NO TONE). See
 * docs/3d-audit/lane-reports/U7-2-impl.md for the full old -> new table.
 *
 * The generated roster remains the user-facing source; keep only a cheap
 * populated-data check here. Editorial wording, length, and archive details
 * do not need a render-backed audit matrix.
 */
describe('Scene3D tone-law collapse — U7-2 (plain-language pass over every remaining caveat)', () => {
  let runtime; let FS;
  const REWRITTEN_IDS = [
    'none', 'deepFillTSP', 'bundleSubNib', 'penInterleave', 'penReserve', 'penCross',
    'penPitchMatch', 'penFacing', 'ampSpacing', 'weaveDepth', 'interlockWeave',
    'trochoidLoop', 'amplitudeOnly', 'onePenDown', 'mezzoRegion', 'dutyConst', 'endShorten',
  ];
  beforeAll(async () => {
    runtime = await loadScene3dAuditRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
  });
  afterAll(() => runtime.cleanup());

  // Check the generated caveat itself; FS.note adds a simulated-law fallback
  // and could stay nonempty even if this field disappeared.
  test('every rewritten caveat remains populated in the generated roster', () => {
    REWRITTEN_IDS.forEach((id) => {
      const caveat = FS.entry(id).caveat;
      expect(typeof caveat, `generated caveat for ${id}`).toBe('string');
      expect(caveat.length, `caveat for ${id}`).toBeGreaterThan(0);
    });
  });

});

/*
 * U9b-2 — tie the `shadowResolvesToSurvivor` test-side literal(s) to the
 * production-side `Shadows.toneLawApplies` set (U9b review follow-up 3 /
 * ROUND3-RESUME-BRIEFS.md §2 scope item 4).
 *
 * Today exactly one of the 6 `describeSingleParamCluster` call sites in this
 * file names anything (U8's, `['onePenDown']`) — the other 5 implicitly pass
 * `undefined`, defaulting every folded id there to the raw pass-through. That
 * per-call-site array is hand-written; nothing forces it to track
 * `shadows.js`'s own judgment of which folded ids have no recipe of their
 * own (`Shadows.toneLawApplies(id) === false`). This block is that force:
 * it recomputes the "should resolve forward" set directly from the shipped
 * roster + `Shadows.toneLawApplies`, independent of anything this file
 * declares, and asserts it against what was actually recorded across every
 * `describeSingleParamCluster` call. If a future unit adds a folded id to a
 * `*_LAW_RECIPES` table (making it distinguishable again) or removes one
 * (making a previously-fine id newly indistinguishable) WITHOUT updating the
 * matching `shadowResolvesToSurvivor` array, this test goes RED — the two
 * are still edited by hand in two different places (this test does not
 * eliminate that), but a mismatch between them can no longer pass silently.
 */
describe('U9b-2 — shadowResolvesToSurvivor coupling (test-side literal vs. production Shadows.toneLawApplies)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadScene3dAuditRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('every roster SHADOW_FORWARD id is an ALIASES id Shadows.toneLawApplies judges NOT distinguishable, and is the ONLY forwarded id', () => {
    const LAWS = V.SCENE3D_TONE_LAWS;
    const Shadows = V.Scene3D.Shadows;
    const forwarded = Object.keys(LAWS.SHADOW_FORWARD || {}).sort();
    // Today that is exactly onePenDown: its chart-space bridge has nothing to walk on a flat footprint.
    expect(forwarded).toEqual(['onePenDown']);
    forwarded.forEach((id) => {
      expect(LAWS.ALIASES[id]).toBeTruthy();
      expect(Shadows.toneLawApplies(id)).toBe(false);
      // ...and it forwards to a law that DOES have a recipe.
      expect(Shadows.toneLawApplies(LAWS.SHADOW_FORWARD[id])).toBe(true);
    });
    // The other aliases Shadows cannot distinguish (isophoteWidth, the flow / web laws) keep their own
    // id in the document; shadows.js draws the plain-hatch fallback (= Ladder) for them at render time.
    Object.keys(LAWS.ALIASES).filter((id) => !Shadows.toneLawApplies(id) && forwarded.indexOf(id) === -1).forEach((id) => {
      expect(V.Scene3D.Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw, id).toBe(id);
    });
    expect([...new Set(recordedShadowResolvesToSurvivor())].sort().filter((id) => forwarded.indexOf(id) === -1)).toEqual([]);
  });

  test('mutation: declared-vs-production comparison actually distinguishes a stale literal (not vacuously equal)', () => {
    // Simulate a stale test-side literal that forgot a second exception —
    // this is the shape of drift this coupling test exists to catch.
    const staleDeclared = [...new Set(recordedShadowResolvesToSurvivor())].sort();
    const withExtra = [...staleDeclared, 'someOtherFoldedId'].sort();
    expect(withExtra).not.toEqual(staleDeclared);
  });
});
