const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * ═══════════════════════════════════════════════════════════════════════
 * U5b-3 — generative cross-check: `SCENE_FILL_STYLES.effectiveLaw` and
 * `Scene3D.Params.resolveToneLaw` are two independent hand-written copies
 * of the same survivor+params -> internal-id rule (U5b's review, flag 2).
 * The review fuzz-tested the two by hand (45 combinations, 0 mismatches,
 * including the contFieldSigmoid UNREPRESENTABLE 2-descriptor case) and
 * asked for that proof to be mechanical, not by inspection, so a future
 * change to either resolver that silently reintroduces the U5b class of bug
 * (a caveat vanishing for one surface but not the other) is caught here
 * instead of by a reviewer re-deriving it by hand again.
 *
 * This lives in its own file (not appended to
 * tests/unit/scene3d-tone-law-collapse.test.js) because that file is
 * concurrently being rewritten by other in-flight lanes (main's chunked U0
 * sweeps, U9 on handoff-c2) — a self-contained cross-check test has no
 * reason to share a hot file and fight those rebases.
 *
 * RGR proof for this test-only addition (no production behavior changes —
 * `effectiveLaw` already agrees with `resolveToneLaw` today, confirmed by
 * the review's own fuzz test): RED was reproduced by mutation, not by
 * reverting a real fix — temporarily stubbing `SCENE_FILL_STYLES.effectiveLaw`
 * to `(survivorId) => survivorId` (the exact "present but wrong" shape the
 * review used for its own mutation test) made this test fail immediately
 * (`expected 'bundleCount' to be 'bundleDither'`, and 44 further mismatches);
 * reverting the stub restores GREEN. See docs/3d-audit/lane-reports/U5b-2-impl.md
 * for the exact commands run.
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('Scene3D tone-law collapse — U5b-3 (generative cross-check: effectiveLaw ≡ resolveToneLaw)', () => {
  let runtime; let FS; let Params; let R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    Params = runtime.window.Vectura.Scene3D.Params;
    R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  test('every survivor in STYLE_PARAMS agrees between effectiveLaw and resolveToneLaw, across the full cross-product of descriptor values (options + missing + garbage), including every unrepresentable multi-descriptor combination', () => {
    const survivors = Object.keys(R.STYLE_PARAMS);
    expect(survivors.length).toBeGreaterThan(0);
    let checked = 0;
    survivors.forEach((survivor) => {
      const descriptors = R.STYLE_PARAMS[survivor];
      // Every option value the descriptor itself declares, plus a garbage
      // sentinel neither resolver's option list recognizes, plus "omit the
      // key entirely" (modelled as undefined and filtered out below).
      const valuesFor = (d) => [...d.options.map((o) => o.value), '__garbage__', undefined];
      // Cartesian product across every descriptor this survivor declares —
      // generalizes past contFieldSigmoid's 2 to however many a future unit
      // (U6/U7/U8) adds.
      let combos = [{}];
      descriptors.forEach((d) => {
        const next = [];
        valuesFor(d).forEach((v) => {
          combos.forEach((c) => {
            const bag = { ...c };
            if (v !== undefined) bag[d.key] = v;
            next.push(bag);
          });
        });
        combos = next;
      });
      combos.forEach((bag) => {
        const viaConfig = FS.effectiveLaw(survivor, bag);
        const viaEngine = Params.resolveToneLaw({ toneLaw: survivor, ...bag });
        expect(viaConfig).toBe(viaEngine);
        checked += 1;
      });
    });
    // Matches the review's own independently-run fuzz test count (45
    // combinations across the 5 current survivors) as a floor, not a
    // ceiling — a future survivor/descriptor only grows this.
    expect(checked).toBeGreaterThanOrEqual(45);
  });

  test('the UNREPRESENTABLE 2-descriptor case (contFieldSigmoid, both fieldMetric and fieldFloor non-default at once) is covered explicitly, never throws, and both resolvers agree on the bare-survivor fallback', () => {
    const bag = { fieldMetric: 'surface', fieldFloor: 'touch' };
    expect(() => FS.effectiveLaw('contFieldSigmoid', bag)).not.toThrow();
    expect(() => Params.resolveToneLaw({ toneLaw: 'contFieldSigmoid', ...bag })).not.toThrow();
    expect(FS.effectiveLaw('contFieldSigmoid', bag)).toBe('contFieldSigmoid');
    expect(Params.resolveToneLaw({ toneLaw: 'contFieldSigmoid', ...bag })).toBe('contFieldSigmoid');
  });

  // U7 (C-07, ampSpacing/nesting) — secretary condition (a),
  // docs/3d-audit/STILL-OPEN.md: "the standing caveat ruling binds U7 ...
  // the generative cross-check must cover the new fold." Unlike every
  // earlier cluster in this chain, U7 is the first where BOTH the survivor
  // (`ampSpacing`) AND the folded id (`weaveDepth`) carry their own real,
  // DIFFERENT measured caveats — so this pins that `FS.note` reads the
  // RIGHT one of the two off `effectiveLaw`'s result, not just "a" caveat.
  // This lives in the SHARED cross-check file (not a private test in
  // scene3d-tone-law-collapse.test.js's own U7 block) because it is the
  // third site encoding ALIASES-> sibling-key knowledge that must never
  // drift from `resolveToneLaw`/`effectiveLaw` (the same reason U5b-3 itself
  // exists) — a caveat-survival regression here is exactly the class of bug
  // this file was built to catch mechanically instead of by inspection.
  test('U7: weaveDepth\'s caveat survives the fold through effectiveLaw, and is distinct from ampSpacing\'s own — both resolvers agree', () => {
    const R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
    expect(R.ALIASES.weaveDepth).toEqual({ into: 'ampSpacing', params: { nesting: 'nested' } });
    expect(R.BY_ID.ampSpacing.caveat.length).toBeGreaterThan(0);
    expect(R.BY_ID.weaveDepth.caveat.length).toBeGreaterThan(0);
    expect(R.BY_ID.ampSpacing.caveat).not.toBe(R.BY_ID.weaveDepth.caveat);

    // Default (nesting:'single', or omitted) -> ampSpacing's OWN caveat,
    // not empty (unlike every earlier survivor in this chain).
    expect(FS.effectiveLaw('ampSpacing', {})).toBe('ampSpacing');
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing' })).toBe('ampSpacing');
    expect(FS.note(FS.effectiveLaw('ampSpacing', {})).caveat).toBe(R.BY_ID.ampSpacing.caveat);

    // nesting:'nested' -> weaveDepth's DISTINCT caveat, agreed by both
    // resolvers, and it must not silently fall back to ampSpacing's own.
    expect(FS.effectiveLaw('ampSpacing', { nesting: 'nested' })).toBe('weaveDepth');
    expect(Params.resolveToneLaw({ toneLaw: 'ampSpacing', nesting: 'nested' })).toBe('weaveDepth');
    const foldedCaveat = FS.note(FS.effectiveLaw('ampSpacing', { nesting: 'nested' })).caveat;
    expect(foldedCaveat).toBe(R.BY_ID.weaveDepth.caveat);
    expect(foldedCaveat).not.toBe(R.BY_ID.ampSpacing.caveat);
  });

  // U8 (C-08, interlockWeave/penDown) — LEDGER.md row 12b: "carry U7's
  // finding forward" — checked and confirmed true: BOTH `interlockWeave`
  // (survivor) AND `onePenDown` (folded) carry their own real, DISTINCT
  // measured caveats, the same situation U7 hit first. Pinned here in the
  // SHARED cross-check file for the same reason as the U7 case above — the
  // third site encoding ALIASES-> sibling-key knowledge must never drift
  // from `resolveToneLaw`/`effectiveLaw`.
  test('U8: onePenDown\'s caveat survives the fold through effectiveLaw, and is distinct from interlockWeave\'s own — both resolvers agree', () => {
    const R2 = runtime.window.Vectura.SCENE3D_TONE_LAWS;
    expect(R2.ALIASES.onePenDown).toEqual({ into: 'interlockWeave', params: { penDown: 'continuous' } });
    expect(R2.BY_ID.interlockWeave.caveat.length).toBeGreaterThan(0);
    expect(R2.BY_ID.onePenDown.caveat.length).toBeGreaterThan(0);
    expect(R2.BY_ID.interlockWeave.caveat).not.toBe(R2.BY_ID.onePenDown.caveat);

    // Default (penDown:'perRuling', or omitted) -> interlockWeave's OWN
    // caveat, not empty.
    expect(FS.effectiveLaw('interlockWeave', {})).toBe('interlockWeave');
    expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave' })).toBe('interlockWeave');
    expect(FS.note(FS.effectiveLaw('interlockWeave', {})).caveat).toBe(R2.BY_ID.interlockWeave.caveat);

    // penDown:'continuous' -> onePenDown's DISTINCT caveat, agreed by both
    // resolvers, and it must not silently fall back to interlockWeave's own.
    expect(FS.effectiveLaw('interlockWeave', { penDown: 'continuous' })).toBe('onePenDown');
    expect(Params.resolveToneLaw({ toneLaw: 'interlockWeave', penDown: 'continuous' })).toBe('onePenDown');
    const foldedCaveat2 = FS.note(FS.effectiveLaw('interlockWeave', { penDown: 'continuous' })).caveat;
    expect(foldedCaveat2).toBe(R2.BY_ID.onePenDown.caveat);
    expect(foldedCaveat2).not.toBe(R2.BY_ID.interlockWeave.caveat);
  });

  // U6 (C-06/W-18a, penInterleave/penMode) — the FROZEN-ON-JAY cluster,
  // unblocked 2026-09-10. Unlike U7/U8's two-caveat pair, this is a
  // FOUR-caveat cluster: the survivor (`penInterleave`) AND all three folded
  // ids (`penPitchMatch`, `penFacing`, `penStipple`) each carry their own
  // real, DISTINCT measured caveats. `penStipple`'s caveat is additionally
  // the mark-class-move explanation (its markClass moved 'dot' -> 'hatch'),
  // not the bare three-pens-simulated restatement its siblings carry —
  // pinned here in the SHARED cross-check file for the same reason as the
  // U7/U8 cases above.
  test('U6: all three folded ids (penPitchMatch, penFacing, penStipple) survive the fold through effectiveLaw with their OWN distinct caveats — both resolvers agree', () => {
    const R3 = runtime.window.Vectura.SCENE3D_TONE_LAWS;
    expect(R3.ALIASES.penPitchMatch).toEqual({ into: 'penInterleave', params: { penMode: 'pitchMatch' } });
    expect(R3.ALIASES.penFacing).toEqual({ into: 'penInterleave', params: { penMode: 'facing' } });
    expect(R3.ALIASES.penStipple).toEqual({ into: 'penInterleave', params: { penMode: 'stipple' } });

    const ids = ['penInterleave', 'penPitchMatch', 'penFacing', 'penStipple'];
    ids.forEach((id) => expect(R3.BY_ID[id].caveat.length, id).toBeGreaterThan(0));
    // NOT all four are pairwise distinct — measured, not assumed:
    // penPitchMatch and penFacing carry the EXACT SAME "three pens are
    // simulated" sentence (both true, both correctly stating the same
    // real fact); this is a genuine duplicate, unlike U7/U8's pairs. What
    // matters is that penStipple's own caveat (the mark-class-move
    // explanation) is DISTINCT from every sibling, and penInterleave's own
    // (longer, "in scene3d.js"/"read every number...") is also distinct.
    expect(R3.BY_ID.penPitchMatch.caveat).toBe(R3.BY_ID.penFacing.caveat);
    [['penInterleave', 'penPitchMatch'], ['penInterleave', 'penFacing'], ['penInterleave', 'penStipple'],
      ['penPitchMatch', 'penStipple'], ['penFacing', 'penStipple']].forEach(([a, b]) => {
      expect(R3.BY_ID[a].caveat, `${a} vs ${b}`).not.toBe(R3.BY_ID[b].caveat);
    });

    // Default (penMode:'interleave', or omitted) -> penInterleave's OWN
    // caveat, not empty. Compared via FS.note() on BOTH sides (not the raw
    // BY_ID field) because all four C-06 members are `simulated` — note()
    // auto-prepends SIMULATED_NOTE, so the raw BY_ID caveat alone would
    // never match what the UI actually shows.
    expect(FS.effectiveLaw('penInterleave', {})).toBe('penInterleave');
    expect(Params.resolveToneLaw({ toneLaw: 'penInterleave' })).toBe('penInterleave');
    expect(FS.note(FS.effectiveLaw('penInterleave', {})).caveat).toBe(FS.note('penInterleave').caveat);

    // Each of the other three penMode values -> its OWN distinct law and
    // caveat, agreed by both resolvers, never silently falling back to
    // penInterleave's own.
    [
      { penMode: 'pitchMatch', law: 'penPitchMatch' },
      { penMode: 'facing', law: 'penFacing' },
      { penMode: 'stipple', law: 'penStipple' },
    ].forEach(({ penMode, law }) => {
      expect(FS.effectiveLaw('penInterleave', { penMode })).toBe(law);
      expect(Params.resolveToneLaw({ toneLaw: 'penInterleave', penMode })).toBe(law);
      const foldedCaveat = FS.note(FS.effectiveLaw('penInterleave', { penMode })).caveat;
      expect(foldedCaveat).toBe(FS.note(law).caveat);
      expect(foldedCaveat).not.toBe(FS.note('penInterleave').caveat);
    });

    // penStipple's caveat specifically explains the mark-class move, not the
    // bare three-pens-simulated fact SIMULATED_NOTE already auto-prepends.
    expect(R3.BY_ID.penStipple.caveat).toMatch(/Parallel hatching/);
  });
});
