const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * ═══════════════════════════════════════════════════════════════════════
 * W-10d-3 — generative cross-check: `SCENE_FILL_STYLES.displayParams` seeds
 * the DISPLAY bag a picker sub-control reads for a RAW folded `toneLaw` (a
 * `.vectura` saved before the U1-U5 collapse, or any live-composed leaf —
 * `object3d`/`booleanGroup3d`/`sceneGroup3d` leaves are never migrated at
 * load, engine.js:422 runs only `migrateScene` for those types). Without
 * this seed, `FS.styleParams(law)`'s `has` check in both
 * `scene3d-panel.js`'s `fillStyleControls` and `context-bar.js`'s
 * `buildStyleBody` is always false for a raw bag, and the sub-control falls
 * back to its descriptor DEFAULT even though `normalizeStyle`'s migration
 * shim (params.js:833) reconstructs the sibling key correctly on the
 * COMPOSE-time copy the canvas renders from — the render is right, only the
 * displayed value lies. See docs/3d-audit/lane-reports/W-10d-3-plan.md.
 *
 * This is a THIRD site independently encoding ALIASES -> sibling-key
 * knowledge, after `params.js`'s `normalizeStyle` shim and U5b's
 * `SCENE_FILL_STYLES.effectiveLaw` (fill-collapse-2, unmerged at the time
 * this unit landed — see `tests/unit/scene3d-fill-style-effective-law.test.js`
 * on that branch, commit 1e681432). This file is written so its two tests
 * can be folded into that U5b-3 file at integration (same cross-check
 * shape: independent-oracle agreement across the full ALIASES/STYLE_PARAMS
 * surface) — the secretary's condition on this unit. It lives in its own
 * file for the same reason U5b-3 does: `tests/unit/scene3d-tone-law-
 * collapse.test.js` is a documented three-way merge hazard and a
 * self-contained cross-check has no reason to share that hot file.
 *
 * RGR proof (mutation, §3.3 of the plan): stubbing
 * `SCENE_FILL_STYLES.displayParams = (raw, bag) => bag` (present-but-inert,
 * the exact "same shape, wrong content" bug class this cross-check hunts
 * for) makes G1 fail on real value mismatches (e.g.
 * `expected 'coarse' to be 'fine'`), never a TypeError, and G3's identity
 * check still passes trivially (a stub that returns its input unmodified
 * IS the identity — the mutation is only caught by G1's independent oracle).
 * Reverting restores GREEN.
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('Scene3D tone-law collapse — W-10d-3 (generative cross-check: displayParams)', () => {
  let runtime; let FS; let Params; let R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    FS = runtime.window.Vectura.SCENE_FILL_STYLES;
    Params = runtime.window.Vectura.Scene3D.Params;
    R = runtime.window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  test('G1 — every one of the 13 ALIASES entries: the seeded display value round-trips through resolveToneLaw back to the SAME folded id, for every descriptor key the alias declares', () => {
    const aliasIds = Object.keys(R.ALIASES);
    expect(aliasIds.length).toBe(13);
    let checked = 0;
    aliasIds.forEach((id) => {
      const alias = R.ALIASES[id];
      const bag = FS.displayParams(id, { toneLaw: id });
      const descriptors = R.STYLE_PARAMS[alias.into] || [];
      const expectedLaw = Params.resolveToneLaw(Params.normalizeStyle({ params: { toneLaw: id } }).params);
      // Independent-oracle check: normalizeStyle/resolveToneLaw never see
      // `displayParams`'s output — they re-derive the folded id from the
      // RAW bag through the migration shim, entirely separately from the
      // display seed. Agreement here means the two independent
      // reconstructions (compose-time shim, display-time seed) land on the
      // same option for every descriptor.
      expect(expectedLaw).toBe(id);
      Object.keys(alias.params).forEach((key) => {
        const d = descriptors.find((x) => x.key === key);
        expect(d).toBeTruthy();
        const dv = bag[key];
        const opt = d.options.find((o) => o.value === dv);
        expect(opt).toBeTruthy();
        expect(opt.law).toBe(expectedLaw);
        checked += 1;
      });
    });
    // Matches the plan's own measured count — one descriptor key per alias
    // for 12 of the 13, and one key for contFieldTouch too (13 total) — as
    // a floor, not a ceiling, so a future collapse (U6+) only grows this.
    expect(checked).toBeGreaterThanOrEqual(13);
  });

  test('G2 — integrity: every ALIASES[id].params key is a declared STYLE_PARAMS descriptor of its survivor, and every seeded value is a real option there (guards against a `<select>` value with no matching `<option>`)', () => {
    const aliasIds = Object.keys(R.ALIASES);
    expect(aliasIds.length).toBeGreaterThan(0);
    aliasIds.forEach((id) => {
      const alias = R.ALIASES[id];
      const descriptors = R.STYLE_PARAMS[alias.into];
      expect(Array.isArray(descriptors)).toBe(true);
      Object.keys(alias.params).forEach((key) => {
        const d = descriptors.find((x) => x.key === key);
        expect(d).toBeTruthy();
        const value = alias.params[key];
        expect(d.options.some((o) => o.value === value)).toBe(true);
      });
    });
  });

  test('G3 — no-op identity: a non-folded bag (every PICKER_IDS survivor, plus undefined/empty/garbage) returns the SAME object reference, unmodified', () => {
    const bag = { toneLaw: 'ladder', rungMode: 'coarse' };
    R.PICKER_IDS.forEach((id) => {
      const out = FS.displayParams(id, bag);
      expect(out).toBe(bag);
    });
    [undefined, '', '__garbage__'].forEach((rawValue) => {
      const out = FS.displayParams(rawValue, bag);
      expect(out).toBe(bag);
    });
    // Also true when the bag itself carries no toneLaw at all (the seed
    // falls back to reading `paramsBag.toneLaw`, per the plan's edit 1).
    const bareBag = { rungMode: 'coarse' };
    expect(FS.displayParams(undefined, bareBag)).toBe(bareBag);
  });
});
