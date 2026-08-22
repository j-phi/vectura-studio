/**
 * Scene3D.Params — `toneLaw` / `toneQuantLevels` / `toneFlowMode` whitelisting
 * (Wave 1, Unit 3 of the tone-law integration plan).
 *
 * `clampStyleParam` (params.js) is the single choke point every style param
 * passes through on normalize — see `normalizeStyle` / `normalizeStyleTable`.
 * This file pins:
 *   1. A known-good `toneLaw` string survives normalization unchanged.
 *   2. Junk values (bad string, number, null, object) fall back to 'ladder'.
 *   3. `toneLaw` round-trips through `normalizeStyleTable` at all three scopes
 *      (scene / byObject / byFace).
 *   4. Cascade fidelity: whole-style-wins means a byFace override WITHOUT
 *      `toneLaw` resolves to a style with no `toneLaw` key at all — it does
 *      NOT inherit the object's law. This is the semantics `style-cascade.js`
 *      already documents; this test pins it explicitly for `toneLaw` so a
 *      future per-field-merge "fix" cannot silently break it.
 *   5. `sanitizeSceneParams` on a payload with no `sceneVersion` still returns
 *      `sceneVersion === 4` — proof that no SCENE_MIGRATIONS step was added
 *      for this feature (a missing `toneLaw` resolves at normalize time, the
 *      same reasoning `HIGHLIGHT_TREATMENT_ALIASES` uses for `keep` → `none`).
 *   6. `toneQuantLevels` clamps to [4, 256] and defaults to 128;
 *      `toneFlowMode` accepts only 'iso' | 'grad'.
 *
 * Required directly (node environment, module.exports guard) — no DOM, no
 * runtime loader, same pattern as scene3d-style-cascade.test.js.
 *
 * Vectura.SCENE3D_TONE_LAWS (Wave 1 Unit 1) may not be loaded in this test
 * process — `clampStyleParam`'s 'toneLaw' case falls back to `!R` (accept any
 * string) when the roster is absent, exactly like Unit 2's dispatcher. That
 * fallback is exercised here since this file never loads the config module.
 */
const Params = require('../../src/core/scene3d/params.js');
const StyleCascade = require('../../src/core/scene3d/style-cascade.js');

describe('Scene3D.Params — toneLaw whitelist', () => {
  test('a plausible toneLaw string survives normalizeStyle unchanged', () => {
    const out = Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'etfKang' } });
    expect(out.params.toneLaw).toBe('etfKang');
  });

  test('junk toneLaw values fall back to the committed default (ladder)', () => {
    expect(Params.normalizeStyle({ params: { toneLaw: 42 } }).params.toneLaw).toBe('ladder');
    expect(Params.normalizeStyle({ params: { toneLaw: null } }).params.toneLaw).toBe('ladder');
    expect(Params.normalizeStyle({ params: { toneLaw: {} } }).params.toneLaw).toBe('ladder');
    expect(Params.normalizeStyle({ params: { toneLaw: undefined } }).params.toneLaw).toBe('ladder');
  });

  test('when the roster IS loaded, an unknown id also falls back to ladder', () => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const prior = globalScope.Vectura.SCENE3D_TONE_LAWS;
    globalScope.Vectura.SCENE3D_TONE_LAWS = { IDS: ['ladder', 'etfKang', 'none'] };
    try {
      expect(Params.normalizeStyle({ params: { toneLaw: 'etfKang' } }).params.toneLaw).toBe('etfKang');
      expect(Params.normalizeStyle({ params: { toneLaw: 'nope' } }).params.toneLaw).toBe('ladder');
    } finally {
      globalScope.Vectura.SCENE3D_TONE_LAWS = prior;
    }
  });

  test('round-trips through normalizeStyleTable at all three scopes', () => {
    const table = Params.normalizeStyleTable({
      scene: { mapper: 'hatch', params: { toneLaw: 'nibAngle' } },
      byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: 'mkScribble' } } },
      byFace: { 'obj-1/face:+X': { mapper: 'hatch', params: { toneLaw: 'contFieldSigmoid' } } },
    });
    expect(table.scene.params.toneLaw).toBe('nibAngle');
    expect(table.byObject['obj-1'].params.toneLaw).toBe('mkScribble');
    expect(table.byFace['obj-1/face:+X'].params.toneLaw).toBe('contFieldSigmoid');
  });

  test('cascade fidelity: a byFace override without toneLaw does NOT inherit the object law (whole-style-wins)', () => {
    const table = {
      scene: { penId: null, mapper: 'hatch', params: { toneLaw: 'ladder' } },
      byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } },
      byFace: { 'obj-1/face:+X': { penId: null, mapper: 'hatch', params: {} } },
    };
    const face = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:+X' });
    expect(face.params.toneLaw).toBeUndefined();
    expect('toneLaw' in face.params).toBe(false);

    const object = StyleCascade.resolve(table, { objectId: 'obj-1', faceId: 'face:-X' });
    expect(object.params.toneLaw).toBe('etfKang');
  });

  test('sanitizeSceneParams with no sceneVersion still lands on the current SCENE_VERSION (no migration added)', () => {
    const out = Params.sanitizeSceneParams({
      styleTable: { scene: { mapper: 'hatch', params: { toneLaw: 'etfKang' } }, byObject: {}, byFace: {} },
    });
    expect(out.sceneVersion).toBe(Params.SCENE_VERSION);
    expect(out.sceneVersion).toBe(4);
  });

  test('toneQuantLevels clamps to [4, 256] and defaults to 128', () => {
    expect(Params.normalizeStyle({ params: { toneQuantLevels: 128 } }).params.toneQuantLevels).toBe(128);
    expect(Params.normalizeStyle({ params: { toneQuantLevels: 999 } }).params.toneQuantLevels).toBe(256);
    expect(Params.normalizeStyle({ params: { toneQuantLevels: 0 } }).params.toneQuantLevels).toBe(4);
    expect(Params.normalizeStyle({ params: { toneQuantLevels: 'nope' } }).params.toneQuantLevels).toBe(128);
  });

  test('toneFlowMode accepts only iso | grad', () => {
    expect(Params.normalizeStyle({ params: { toneFlowMode: 'iso' } }).params.toneFlowMode).toBe('iso');
    expect(Params.normalizeStyle({ params: { toneFlowMode: 'grad' } }).params.toneFlowMode).toBe('grad');
    expect(Params.normalizeStyle({ params: { toneFlowMode: 'bogus' } }).params.toneFlowMode).toBe('iso');
    expect(Params.normalizeStyle({ params: { toneFlowMode: null } }).params.toneFlowMode).toBe('iso');
  });

  // fs-e2 Job 2 (P2) — an unrecognized toneLaw id used to be rewritten to
  // 'ladder' with NO record at all. A future roster change (an id deleted
  // from src/config/scene3d-tone-laws.js) could then silently re-render a
  // saved document with no way to notice. `warnUnknownToneLaw` adds a
  // one-time-per-id console.warn — observability only, behavior unchanged.
  describe('unknown toneLaw — one-time console warning (observability only, behavior unchanged)', () => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    let warnSpy;
    let prior;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      prior = globalScope.Vectura.SCENE3D_TONE_LAWS;
      globalScope.Vectura.SCENE3D_TONE_LAWS = { IDS: ['ladder', 'etfKang', 'none'] };
    });
    afterEach(() => {
      warnSpy.mockRestore();
      globalScope.Vectura.SCENE3D_TONE_LAWS = prior;
    });

    test('fires once for an unknown id, names the id and the fallback', () => {
      const out = Params.normalizeStyle({ params: { toneLaw: 'totallyMadeUp' } });
      expect(out.params.toneLaw).toBe('ladder'); // clamp behavior unchanged
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = warnSpy.mock.calls[0].join(' ');
      expect(msg).toContain('totallyMadeUp');
      expect(msg).toContain('ladder');
    });

    test('does NOT fire again for the SAME unknown id (one-time, not per-call/per-path/per-frame)', () => {
      Params.normalizeStyle({ params: { toneLaw: 'repeatOffender' } });
      Params.normalizeStyle({ params: { toneLaw: 'repeatOffender' } });
      Params.normalizeStyle({ params: { toneLaw: 'repeatOffender' } });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('does NOT fire for a known id', () => {
      const out = Params.normalizeStyle({ params: { toneLaw: 'etfKang' } });
      expect(out.params.toneLaw).toBe('etfKang');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('does NOT fire for an absent/undefined toneLaw (the ordinary no-op default path)', () => {
      const out = Params.normalizeStyle({ params: { toneLaw: undefined } });
      expect(out.params.toneLaw).toBe('ladder');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
