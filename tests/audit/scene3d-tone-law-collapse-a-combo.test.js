const {
  loadVecturaRuntime, clone, freezeDeep, cloneFixture, createCapturedOptionsCache,
  BOUNDS, SUN, SLOW, describeSingleParamCluster, describeComboCluster,
  recordedShadowResolvesToSurvivor,
} = require('../helpers/scene3d-tone-law-collapse-shared');

// Split part A: U7 + U8 + M4 Wave combo cluster.


// U5b-3 (generative cross-check: effectiveLaw ≡ resolveToneLaw) lives in its
// own file, tests/unit/scene3d-fill-style-effective-law.test.js — split out
// so it can be lifted cleanly at rebase against main's chunked U0 rewrite of
// this file and U9's in-flight edits to it on handoff-c2 (orchestrator
// direction, U5b-2/3 checkpoint follow-up).

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U7 — C-07 · survivor `ampSpacing` · param `nesting`
 * Folded: weaveDepth ('nested'). Bare option: single->ampSpacing.
 * RED (pre-U7, verified via a scratch `git stash` of the two implementation
 * files, not asserted here): resolveToneLaw({toneLaw:'ampSpacing',
 * nesting:'nested'}) returned 'ampSpacing' unchanged (no STYLE_PARAMS entry)
 * — rendering diverged from weaveDepth's own picture (3925.9 vs 3917.8 mm
 * ink on torus+hatch+med, within 0.2% — a genuinely tight pair per the
 * plan's own §1 C-07 note). GREEN below closes it by construction, same
 * mechanism U1-U5 ran five times (see docs/3d-audit/lane-reports/U1-U5-impl.md).
 *
 * TWO CONDITIONS THIS UNIT ADDS ON TOP OF THE STANDARD TEMPLATE (secretary
 * flags on U7's brief, docs/3d-audit/STILL-OPEN.md):
 *
 * (a) The standing caveat ruling ("folding a law must NOT hide its measured
 * caveat", U5b) binds U7 too — but U7 is the FIRST cluster in this chain
 * where BOTH the survivor (`ampSpacing`) AND the folded id (`weaveDepth`)
 * carry their own real, DIFFERENT measured caveats (every earlier cluster's
 * survivor had none). `effectiveLaw`/`resolveToneLaw` must therefore surface
 * `ampSpacing`'s own caveat at the descriptor default (`nesting:'single'`)
 * — not silently show nothing, as U4/U5's survivors correctly did — and
 * swap to `weaveDepth`'s distinct caveat once `nesting:'nested'` is picked.
 * See the "U7 caveat" describe block below, and
 * tests/unit/scene3d-fill-style-effective-law.test.js (the shared U5b-3
 * cross-check, extended here rather than duplicated in a private test).
 *
 * (b) `ampSpacing` is the survivor, and F1-placement's ruled condition 4
 * (docs/3d-audit/STILL-OPEN.md, fill-audit-a2 lane) requires `ampSpacing`
 * and the rest of the WV6 family to render BYTE-IDENTICAL — a live ruling
 * on another lane depends on that exact law being unaffected by this fold.
 * U1-U5's aggregate 48-law sweep (test 4, U0 block) only ever proved this on
 * ONE cell (torus+hatch+med default density, sphere-only geometry via
 * captureOpts). The "U7 multi-primitive x multi-density" describe block
 * below extends that proof across every primitive the audit's own capture
 * script (scripts/audit/scene3d-capture.js: TIER_B_PRIMITIVES minus `box`,
 * which is unreachable for ampSpacing/weaveDepth per
 * docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl) x every density it
 * sweeps (DENSITY_VALUES low/med/max) can reach — sphere/torus/cone x
 * low/med/max, 9 combinations, not just 1.
 * ═══════════════════════════════════════════════════════════════════════
 */
describeComboCluster('Scene3D tone-law collapse — U7 + U8 + M4 (Wave: Phase x Waveform x Pen down)', {
  survivor: 'ampSpacing',
  folded: [
    { id: 'weaveDepth', params: { wavePhase: 'anti', waveAmp: 'solve' } },
    { id: 'interlockWeave', params: { wavePhase: 'anti' } },
    { id: 'onePenDown', params: { penDown: 'continuous' } },
    { id: 'trochoidLoop', params: { waveForm: 'loop' } },
    { id: 'amplitudeOnly', params: { waveForm: 'zigzag' } },
  ],
  legacyBags: [
    { bag: { toneLaw: 'ampSpacing', nesting: 'single' }, id: 'ampSpacing' },
    { bag: { toneLaw: 'ampSpacing', nesting: 'nested' }, id: 'weaveDepth' },
    { bag: { toneLaw: 'interlockWeave', penDown: 'perRuling' }, id: 'interlockWeave' },
    { bag: { toneLaw: 'interlockWeave', penDown: 'continuous' }, id: 'onePenDown' },
  ],
});
