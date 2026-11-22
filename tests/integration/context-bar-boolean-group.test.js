/**
 * Context bar — a combined shape (booleanGroup3d) selected. Style / Shadow /
 * Highlight / X-ray / Shape / pen write the style table or object def by the
 * GROUP id, which nothing reads, so they must not be live. They render
 * disabled with a pointer to the shapes inside; controls that do apply
 * (duplicate, drop, delete, helpers) stay live.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const NOTE = 'Set this on the shapes inside the combined shape';

describe('Contextual Task Bar — combined shape (boolean group) selected', () => {
  let runtime, window, app, CB;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const field = (label) => Array.from(host().querySelectorAll('.ctxbar-scene-field'))
    .find((f) => f.getAttribute('aria-label') === label);

  const build = () => {
    app.engine.layers = [];
    const gid = app.engine.addLayer('scene3d');
    const a = app.engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const bId = app.engine.addObjectToScene(gid, 'sphere');
    const bg = app.engine.createBooleanGroupFromSelection([a.id, bId]);
    app.engine.generate(gid);
    return { gid, a, bId, bg };
  };
  const select = (gid, id) => {
    app.renderer.setSelection([id], id);
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [id], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
  };

  test('group selected: object-style controls are disabled with the explanatory tooltip', () => {
    const { gid, bg } = build();
    select(gid, bg);
    expect(CB.getContext().kind).toBe('scene-object');
    ['Style', 'Shadow', 'Highlight', 'X-ray', 'Shape'].forEach((l) => {
      const f = field(l);
      expect(f, l).toBeTruthy();
      expect(f.getAttribute('aria-disabled'), l).toBe('true');
      expect(f.title, l).toContain(NOTE);
      f.click();
      expect(window.document.querySelector('.ctxbar-scene-flyout.is-open'), l).toBeFalsy();
    });
    const pen = host().querySelector('.ctxbar-scene-pen-chip');
    expect(pen).toBeFalsy();
  });

  test('group selected: delete / duplicate stay live', () => {
    const { gid, bg } = build();
    select(gid, bg);
    const btns = Array.from(host().querySelectorAll('.ctxbar-btn'));
    expect(btns.some((b) => /Duplicate object/.test(b.title || b.getAttribute('aria-label') || ''))).toBe(true);
    expect(btns.some((b) => /Delete object/.test(b.title || b.getAttribute('aria-label') || ''))).toBe(true);
  });

  test('a plain object keeps live Style / Shadow pills', () => {
    const { gid, a } = build();
    select(gid, a.id);
    ['Style', 'Shadow', 'Highlight', 'X-ray', 'Shape'].forEach((l) => {
      const f = field(l);
      expect(f, l).toBeTruthy();
      expect(f.getAttribute('aria-disabled'), l).not.toBe('true');
    });
    expect(host().querySelector('.ctxbar-scene-pen-chip')).toBeTruthy();
  });
});
