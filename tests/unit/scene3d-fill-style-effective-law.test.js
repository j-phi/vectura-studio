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
});
