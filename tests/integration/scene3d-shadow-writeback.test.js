/**
 * U9b-2 — the onePenDown shadow write-back is the ONE undisclosed exception
 * U9b's reviewer found (docs/3d-audit/lane-reports/U9b-review.md §(2)).
 *
 * Recap of the finding this file pins: `clampShadowToneLaw` (src/core/scene3d/
 * params.js) forward-resolves a raw `shadowToneLaw:'onePenDown'` to its
 * survivor `interlockWeave` (U9b's fix — onePenDown has no shadow recipe of
 * its own; passed through raw it silently fell back to plain-hatch, byte-
 * identical to `ladder`). `normalizeShadow` runs at BOTH:
 *   - the LOAD channel (`engine.js:1941`, `layer.params = sanitizeImportedParams(
 *     data.params, data.type)` for a `scene3d` layer -> `sanitizeSceneParams` ->
 *     `normalizeParams` -> `out.shadow = normalizeShadow(src.shadow)`) — this
 *     result IS persisted onto the live layer;
 *   - the RENDER/compose channel (`scene3d.js generate()`, `const p =
 *     Params.normalizeParams(params)`) — a local, never-written-back copy;
 *     `collectSceneParams` (the compose-time assembly step) spreads
 *     `group.params.shadow` through UNCHANGED, so nothing at compose time even
 *     LOOKS at `clampShadowToneLaw`'s shadow branch on the live bag.
 * So a document saved with `shadowToneLaw:'onePenDown'` has its STORED value
 * silently and permanently rewritten to `'interlockWeave'` the next time it is
 * loaded — every one of the other 17 ALIASES ids keeps U9's "no write-back,
 * raw pass-through" guarantee; `onePenDown` alone does not. This is the exact
 * shape `docs/3d-audit/lane-reports/W-10d-2-plan.md` rules for the STYLE bag's
 * own (unrelated) write-back: fires once at load, persisted, not per compose,
 * no undo entry, round-trips the written-back value. This file proves the
 * shadow bag's write-back follows that identical shape, and that
 * `onePenDown` is provably the ONLY id it applies to today.
 *
 * See the `## Disclosure` section of this unit's report,
 * docs/3d-audit/lane-reports/U9b-2-impl.md, for the contract stated in prose.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};

describe('U9b-2 — onePenDown shadow write-back (the ONE undisclosed exception, now disclosed + pinned)', () => {
  let runtime, V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    if (typeof runtime.window.getThemeToken !== 'function') {
      runtime.window.getThemeToken = (_token, fallback) => fallback ?? '';
    }
    V = runtime.window.Vectura;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // Build a fresh scene3d GROUP (addLayer('scene3d') -> addSceneTree, the
  // real user-facing "Add Layer -> 3D Scene" entry), set its group-level
  // shadow bag, then round-trip it through a NEW engine's exportState ->
  // importState — so LOAD-channel assertions are against a REOPENED
  // document, not a hand-poked in-memory bag. Mirrors W-10d-2's own
  // `openLeaf` helper (tests/integration/scene3d-fill-style-picker.test.js),
  // adapted for the scene-level shadow bag instead of an object3d leaf style.
  const openScene = (shadowBag) => {
    const e1 = new V.VectorEngine();
    const gid = e1.addLayer('scene3d');
    const group1 = e1.layers.find((l) => l.id === gid);
    group1.params.shadow = { ...group1.params.shadow, ...shadowBag };
    const e2 = new V.VectorEngine();
    e2.importState(JSON.parse(JSON.stringify(e1.exportState())));
    const group2 = e2.layers.find((l) => l.type === 'scene3d' && l.isGroup);
    return { e1, e2, group2 };
  };

  // ── (a) fires ONCE at load, never at compose ────────────────────────────
  describe('(a) write-back fires once at load, never per compose', () => {
    test('LOAD: a scene saved with shadowToneLaw:"onePenDown" reopens as "interlockWeave"', () => {
      const { group2 } = openScene({ shadowToneLaw: 'onePenDown' });
      expect(group2.params.shadow.shadowToneLaw).toBe('interlockWeave');
    });

    test('control: a scene saved with a DIFFERENT folded id (e.g. "fineLadder") reopens UNCHANGED (U9\'s raw pass-through, not this exception)', () => {
      const { group2 } = openScene({ shadowToneLaw: 'fineLadder' });
      expect(group2.params.shadow.shadowToneLaw).toBe('fineLadder');
    });

    test('once-only / idempotent: re-importing an already-migrated document is byte-identical', () => {
      const { e2, group2 } = openScene({ shadowToneLaw: 'onePenDown' });
      const snap1 = JSON.stringify(group2.params.shadow);
      const e3 = new V.VectorEngine();
      e3.importState(JSON.parse(JSON.stringify(e2.exportState())));
      const group3 = e3.layers.find((l) => l.type === 'scene3d' && l.isGroup);
      expect(JSON.stringify(group3.params.shadow)).toBe(snap1);
      expect(group3.params.shadow.shadowToneLaw).toBe('interlockWeave');
    });

    // U9b-2/U5b-4 reviewer follow-up 2: this test alone is vacuous against a
    // "write-back also fires on every compose" regression, because the value
    // is already resolved to `interlockWeave` here and re-resolving an
    // already-resolved value is a no-op either way — the sibling bypass test
    // below (raw, unresolved `onePenDown`, never loaded) is the load-bearing
    // proof of the "never per compose" claim; this test only proves stability
    // of the already-resolved state.
    test('no per-pass rewrite after load: the bag is byte-identical across 3 composes', () => {
      const { e2, group2 } = openScene({ shadowToneLaw: 'onePenDown' });
      const snap0 = JSON.stringify(group2.params.shadow);
      expect(group2.params.shadow.shadowToneLaw).toBe('interlockWeave'); // already resolved at load
      e2.computeAllDisplayGeometry();
      const snap1 = JSON.stringify(group2.params.shadow);
      e2.computeAllDisplayGeometry();
      const snap2 = JSON.stringify(group2.params.shadow);
      e2.computeAllDisplayGeometry();
      const snap3 = JSON.stringify(group2.params.shadow);
      expect(snap1).toBe(snap0);
      expect(snap2).toBe(snap0);
      expect(snap3).toBe(snap0);
    });

    test('the compose channel structurally cannot write back: a LIVE bag holding raw "onePenDown" (never loaded through sanitizeImportedParams) survives 3 composes untouched', () => {
      // Bypasses the load channel entirely — the group is built in-memory and
      // its shadow bag is set directly, exactly like a live user edit. This
      // isolates the claim "compose never rewrites" from "load already
      // resolved it before compose ever ran" (the test above).
      const e1 = new V.VectorEngine();
      const gid = e1.addLayer('scene3d');
      const group = e1.layers.find((l) => l.id === gid);
      group.params.shadow = { ...group.params.shadow, shadowToneLaw: 'onePenDown' };
      const snap0 = JSON.stringify(group.params.shadow);
      expect(group.params.shadow.shadowToneLaw).toBe('onePenDown'); // raw, unresolved — no load ever ran
      e1.computeAllDisplayGeometry();
      const snap1 = JSON.stringify(group.params.shadow);
      e1.computeAllDisplayGeometry();
      const snap2 = JSON.stringify(group.params.shadow);
      e1.computeAllDisplayGeometry();
      const snap3 = JSON.stringify(group.params.shadow);
      // Never resolved by compose — stays raw 'onePenDown' every time.
      expect(snap1).toBe(snap0);
      expect(snap2).toBe(snap0);
      expect(snap3).toBe(snap0);
      expect(group.params.shadow.shadowToneLaw).toBe('onePenDown');
      // The compositor's own assembled scene input still resolves it (for
      // the RENDER only, ephemerally) — collectSceneParams spreads
      // `shadow` raw, and scene3d.js's generate() normalizes a LOCAL copy;
      // neither writes back. group._sceneAssembled.shadow is that raw,
      // unresolved passthrough (the actual resolve-for-drawing happens one
      // level deeper, inside generate(), on a copy this test cannot see —
      // which is exactly the point: nothing observable on the layer/group
      // params bag ever changes from a compose).
      expect(group._sceneAssembled.shadow.shadowToneLaw).toBe('onePenDown');
    });
  });

  // ── (b) no undo entry at load ───────────────────────────────────────────
  describe('(b) no undo entry at load', () => {
    test('app.applyState of a doc needing the onePenDown write-back pushes no history itself', () => {
      const app = new V.App();
      const e1 = new V.VectorEngine();
      const gid = e1.addLayer('scene3d');
      const group = e1.layers.find((l) => l.id === gid);
      group.params.shadow = { ...group.params.shadow, shadowToneLaw: 'onePenDown' };
      const affectedState = { engine: e1.exportState(), settings: JSON.parse(JSON.stringify(V.SETTINGS)) };

      const e0 = new V.VectorEngine();
      e0.addLayer('scene3d');
      const controlState = { engine: e0.exportState(), settings: JSON.parse(JSON.stringify(V.SETTINGS)) };

      app.history = [];
      const beforeAffected = app.history.length;
      app.applyState(JSON.parse(JSON.stringify(affectedState)));
      const afterAffected = app.history.length;

      // Confirm the write-back really did fire on THIS load (else the "no
      // entry" result would be vacuously true for the wrong reason). Must be
      // read here, before controlState is applied and replaces app.engine's
      // layers with the control's (fixing a test-ordering bug: reading this
      // after both applyState calls would report the control's default
      // 'ladder' shadowToneLaw instead of the affected doc's 'interlockWeave').
      const group2 = app.engine.layers.find((l) => l.type === 'scene3d' && l.isGroup);
      expect(group2.params.shadow.shadowToneLaw).toBe('interlockWeave');

      app.history = [];
      const beforeControl = app.history.length;
      app.applyState(JSON.parse(JSON.stringify(controlState)));
      const afterControl = app.history.length;

      expect(afterAffected).toBe(beforeAffected);
      expect(afterControl).toBe(beforeControl);
      expect(afterAffected).toBe(afterControl);
    });

    test('undo/redo: the migrated value survives push/edit/undo (never resurrects onePenDown)', () => {
      const app = new V.App();
      const e1 = new V.VectorEngine();
      const gid = e1.addLayer('scene3d');
      const group = e1.layers.find((l) => l.id === gid);
      group.params.shadow = { ...group.params.shadow, shadowToneLaw: 'onePenDown' };
      app.applyState({ engine: e1.exportState(), settings: JSON.parse(JSON.stringify(V.SETTINGS)) });
      app.history = [];
      app.pushHistory();
      const findGroup = () => app.engine.layers.find((l) => l.type === 'scene3d' && l.isGroup);
      expect(findGroup().params.shadow.shadowToneLaw).toBe('interlockWeave');
      findGroup().params.shadow.shadowAngle = 200;
      app.pushHistory();
      app.undo();
      expect(findGroup().params.shadow.shadowToneLaw).toBe('interlockWeave');
    });
  });

  // ── (c) round-trips the survivor in .vectura save/load ─────────────────
  describe('(c) round trip', () => {
    test('saving the migrated doc serializes "interlockWeave"; re-import is a no-op', () => {
      const { e2, group2 } = openScene({ shadowToneLaw: 'onePenDown' });
      const exported = e2.exportState();
      const savedGroup = exported.layers.find((l) => l.id === group2.id);
      expect(savedGroup.params.shadow.shadowToneLaw).toBe('interlockWeave');
      const e3 = new V.VectorEngine();
      e3.importState(JSON.parse(JSON.stringify(exported)));
      const group3 = e3.layers.find((l) => l.id === group2.id);
      expect(group3.params.shadow.shadowToneLaw).toBe('interlockWeave');
    });
  });

  // ── (d) the exceptions, enumerated ──────────────────────────────────────
  // Only a roster SHADOW_FORWARD id (onePenDown -> interlockWeave: its chart-space bridge has nothing to
  // walk on a flat footprint) is rewritten by the shadow bag. Every other alias keeps its own id in the
  // document, including the ones with no shadow recipe (isophoteWidth, defectSplit, deepFillTSP): shadows.js
  // draws its plain-hatch fallback (= Ladder) for them at render time and the picker displays Ladder.
  describe('(d) only SHADOW_FORWARD ids are rewritten by the shadow bag (every other id: raw pass-through)', () => {
    const sweep = () => {
      const Params = V.Scene3D.Params;
      return Object.keys(V.SCENE3D_TONE_LAWS.ALIASES).map((id) => ({ id, out: Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw }));
    };
    test('sweep: every ALIASES id passes through raw, bar onePenDown (-> interlockWeave)', () => {
      const exceptions = sweep().filter(({ id, out }) => out !== id);
      expect(exceptions).toEqual([{ id: 'onePenDown', out: 'interlockWeave' }]);
    });
    test('the recipe-less aliases keep their id and the picker shows Ladder for them', () => {
      const FS = V.SCENE_FILL_STYLES;
      ['isophoteWidth', 'defectSplit', 'deepFillTSP'].forEach((id) => {
        expect(V.Scene3D.Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw).toBe(id);
        expect(FS.shadowDisplayLaw(id, FS.resolve(id))).toBe('ladder');
      });
    });
  });
});
