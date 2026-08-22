/**
 * A GROUND-quad selection must not be offered object controls it cannot use.
 *
 * Jay, 2026-08-16: "I'm also unable to enable x-ray in some situations like
 * this: clicking x-ray does nothing." The contextual task bar's summary read
 * `ground`, not the capsule he was looking at.
 *
 * MECHANISM — a canvas pick on the ground plane sets
 * `sceneSelection.objectIds = ['ground']`. That is a fixed SENTINEL id, not a
 * layer id: renderer `_sceneChildLayerFor` refuses it by name, as five other
 * renderer sites do, and no object3d child layer stands behind it. So every
 * bridge that mutates an object DEF refuses it — setSceneObjectField,
 * setSceneObjectPrimitive, duplicateSceneObjects, dropSceneObjectsToGround,
 * setSceneObjectVisibility and deleteSceneObjects all return false or [].
 *
 * The bar drew the full object toolset regardless, so the X-ray flyout showed a
 * live-looking Solid | X-ray segment whose click wrote nothing and whose
 * in-place rebuild re-read 'Solid' — the reported "does nothing". Those
 * controls are now ABSENT on a ground-only selection, matching how this
 * codebase already handles inapplicable controls (the `none` highlight
 * treatment, Dash length under a solid line type, Shadow ▸ Angle under Follow
 * light): removed, never shown disabled.
 *
 * The regression pin against OVER-hiding is just as important: the ground's
 * STYLE is real. `styleTable.byObject.ground` resolves and the quad repaints,
 * so the pen chip and the Style / Shadow / Highlight flyouts must survive.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('Scene X-ray — a ground-quad selection omits object-DEF controls', () => {
  let runtime; let window; let document; let app; let engine; let renderer; let CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    engine = app.engine;
    renderer = app.renderer;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // A real scene TREE (group + object3d + sceneLight3d + sceneGround3d) — the
  // only shape a user can build today, and the shape the defect lives in.
  const buildScene = () => {
    engine.layers = engine.layers.filter((l) => l.type !== 'scene3d' && !l.parentId);
    const gid = engine.addSceneTree();
    const kids = engine.getLayerChildren(gid);
    return {
      gid,
      group: engine.getLayerById(gid),
      obj: kids.find((k) => k.type === 'object3d'),
      ground: kids.find((k) => k.type === 'sceneGround3d'),
    };
  };

  const select = (gid, objectIds) => {
    renderer.setSelection([gid], gid);
    renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
    CB.restoreState();
  };

  const host = () => CB.getContentHost();
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  // fs-s1/fs-u1 — Shape/Style/Shadow/Highlight/X-ray are all icon-only (no
  // visible label text), so lookup goes through aria-label, their accessible
  // name.
  const pillLabels = () => pills().map((f) => f.getAttribute('aria-label'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const outsideClick = () => {
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  };
  // Composed scene ink lives on group.scenePaths, never layer.paths.
  const groundPaths = (group) => {
    engine.computeAllDisplayGeometry();
    return (group.scenePaths || []).filter((p) => {
      const t = p && p.meta && p.meta.sceneTarget;
      return t && t.objectId === 'ground';
    });
  };

  describe('mechanism', () => {
    test('every object-DEF bridge refuses the ground sentinel id', () => {
      const { gid, obj } = buildScene();
      // There is no record to write…
      expect(renderer.getSceneObjectRecord(gid, 'ground')).toBeNull();
      // …so the write the X-ray flyout performs is a no-op. This is the defect.
      expect(renderer.setSceneObjectField(gid, ['ground'], 'visibility', 'xray')).toBe(false);
      expect(renderer.setSceneObjectVisibility(gid, ['ground'])).toBe(false);
      expect(renderer.dropSceneObjectsToGround(gid, ['ground'])).toBe(false);
      expect(renderer.deleteSceneObjects(gid, ['ground'])).toBe(false);
      expect(renderer.duplicateSceneObjects(gid, ['ground'])).toEqual([]);
      // A real object is unaffected — the refusal is about the sentinel, not
      // about scene trees.
      expect(renderer.setSceneObjectField(gid, [obj.id], 'visibility', 'xray')).toBe(true);
      expect(renderer.getSceneObjectRecord(gid, obj.id).visibility).toBe('xray');
    });

    test('the ground STYLE is real — it must not be hidden along with the rest', () => {
      const { gid, group } = buildScene();
      expect(renderer.setSceneObjectStyle(gid, ['ground'], { penId: 'pen-2' })).toBe(true);
      const pens = new Set(groundPaths(group).map((p) => p.meta.penId || null));
      expect(pens.has('pen-2')).toBe(true);
    });
  });

  describe('the contextual task bar', () => {
    test('X-ray pill is present for an object and ABSENT for the ground', () => {
      const { gid, obj } = buildScene();

      select(gid, [obj.id]);
      expect(CB.getContext().kind).toBe('scene-object');
      expect(pillLabels()).toContain('X-ray');

      select(gid, ['ground']);
      expect(CB.getContext().kind).toBe('scene-object');
      expect(pillLabels()).not.toContain('X-ray');
    });

    test('Shape picker and the Duplicate / Drop / Solid-X-ray / Delete verbs are absent too', () => {
      const { gid, obj } = buildScene();

      select(gid, [obj.id]);
      expect(pillLabels()).toContain('Shape');
      expect(host().querySelectorAll('.ctxbar-btn').length).toBeGreaterThan(0);

      select(gid, ['ground']);
      expect(pillLabels()).not.toContain('Shape');
      // The object-DEF VERBS must go. Scene-wide view controls legitimately
      // stay — the viewport-helpers toggle backs SETTINGS.sceneHelpersVisible,
      // which is a whole-scene preference, not a property of the selection,
      // exactly like Style/Shadow/Highlight survive in the next test. Assert
      // the verbs are gone rather than counting every button, so adding a
      // scene-wide control never silently reads as a regression here.
      const btnNames = [...host().querySelectorAll('.ctxbar-btn')]
        .map((b) => b.getAttribute('aria-label') || '');
      const sceneWide = btnNames.filter((n) => /viewport helpers/i.test(n));
      const verbs = btnNames.filter((n) => !/viewport helpers/i.test(n));
      expect(verbs).toEqual([]);
      expect(sceneWide.length).toBe(1);
    });

    test('Style / Shadow / Highlight and the pen chip SURVIVE (they write the style table)', () => {
      const { gid } = buildScene();
      select(gid, ['ground']);
      expect(pillLabels()).toEqual(['Style', 'Shadow', 'Highlight']);
      expect(host().querySelector('.ctxbar-scene-pen-chip')).toBeTruthy();
    });

    test('Shadow ▾ omits only the per-object Cast row for the ground', () => {
      const { gid, obj } = buildScene();

      select(gid, [obj.id]);
      pillByLabel('Shadow').click();
      expect(rowCtl(openFly(), 'Cast')).toBeTruthy();
      outsideClick();

      select(gid, ['ground']);
      pillByLabel('Shadow').click();
      const fly = openFly();
      // Cast writes obj.shadow.enabled — and the ground RECEIVES shadows rather
      // than casting them, so the row is meaningless as well as inert.
      expect(rowCtl(fly, 'Cast')).toBeNull();
      // The scene-wide rows are still there — the flyout is not gutted.
      expect(rowCtl(fly, 'Style')).toBeTruthy();
      outsideClick();
    });

    test('a MIXED ground + object selection keeps X-ray (the write reaches the object)', () => {
      const { gid, obj } = buildScene();
      select(gid, ['ground', obj.id]);
      expect(pillLabels()).toContain('X-ray');
    });

    test('the summary names the ground child layer, not the bare sentinel token', () => {
      const { gid, ground } = buildScene();
      select(gid, ['ground']);
      const summary = host().querySelector('.ctxbar-scene-summary');
      expect(summary).toBeTruthy();
      // Was a bare lowercase `ground` — indistinguishable from an object the
      // user had named that, which is how Jay came to think he had the capsule.
      expect(summary.textContent).toBe(ground.name);
      expect(summary.textContent).not.toBe('ground');
    });
  });
});
