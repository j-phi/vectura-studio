/*
 * P3 feedback: every right-click context-menu control AND the contextual task
 * bar's core controls must ALSO be available in the top menu system, plus the
 * contextual task bar toggle (not only Document Setup). This test verifies the
 * new Object/Edit/View menu items exist, route to the shared verbs, and gate
 * on selection state.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('P3: top-menu Object/Edit/View parity with right-click + task bar', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const el = (id) => document.getElementById(id);
  const addLayer = (t = 'wavetable') => { const id = app.engine.addLayer(t); return app.engine.layers.find((l) => l.id === id); };

  test('the Object menu and its items exist in the top menu', () => {
    expect(el('btn-menu-object')).toBeTruthy();
    ['btn-object-flip-h', 'btn-object-flip-v', 'btn-object-isolate', 'btn-object-exit-isolation',
      'btn-object-simplify', 'btn-object-smooth', 'btn-object-transform', 'btn-object-edit-path',
      'btn-object-lock', 'btn-object-unlock', 'btn-object-outline-text',
      'btn-menu-duplicate', 'btn-menu-delete'].forEach((id) => {
      expect(el(id)).toBeTruthy();
    });
  });

  test('Flip Horizontal menu item routes to the same verb as the right-click menu', () => {
    app.engine.layers = [];
    const layer = addLayer('wavetable');
    app.renderer.setSelection([layer.id], layer.id);
    let calls = 0;
    const orig = window.Vectura.PathEditOps.flipLayers;
    window.Vectura.PathEditOps.flipLayers = (...a) => { calls += 1; return orig(...a); };
    try {
      app.ui.refreshTopMenuItemStates();
      expect(el('btn-object-flip-h').disabled).toBe(false);
      el('btn-object-flip-h').click();
      expect(calls).toBeGreaterThan(0);
    } finally {
      window.Vectura.PathEditOps.flipLayers = orig;
    }
  });

  test('Object items disable when nothing is selected', () => {
    app.renderer.setSelection([], null);
    app.ui.refreshTopMenuItemStates();
    expect(el('btn-object-flip-h').disabled).toBe(true);
    expect(el('btn-menu-duplicate').disabled).toBe(true);
    expect(el('btn-menu-delete').disabled).toBe(true);
  });

  test('Group enables on multi-select; Ungroup enables when a group is selected', () => {
    app.engine.layers = [];
    const a = addLayer('wavetable');
    const b = addLayer('wavetable');
    app.renderer.setSelection([a.id, b.id], a.id);
    app.ui.refreshTopMenuItemStates();
    expect(el('btn-group-layers').disabled).toBe(false);
    expect(el('btn-ungroup-layers').disabled).toBe(true);
  });

  test('View → Contextual Task Bar toggles the bar and reflects a checkmark', async () => {
    const CB = window.Vectura.UI.ContextBar;
    CB.setEnabled(true);
    app.ui.refreshTopMenuItemStates();
    expect(el('view-context-bar-checkmark').style.visibility).toBe('visible');

    el('btn-view-context-bar-toggle').click();
    await nextFrames();
    expect(CB.isEnabled()).toBe(false);
    app.ui.refreshTopMenuItemStates();
    expect(el('view-context-bar-checkmark').style.visibility).toBe('hidden');
    // restore
    CB.setEnabled(true);
  });

  test('Ungroup stays enabled when a group child (not the group) is selected', () => {
    app.engine.layers = [];
    const a = addLayer('wavetable');
    const b = addLayer('wavetable');
    app.renderer.setSelection([a.id, b.id], a.id);
    app.ui.groupSelection();
    // Select just one child of the freshly-created group.
    const child = app.engine.layers.find((l) => l && l.parentId && !l.isGroup);
    expect(child).toBeTruthy();
    app.renderer.setSelection([child.id], child.id);
    app.ui.refreshTopMenuItemStates();
    expect(el('btn-ungroup-layers').disabled).toBe(false);
  });

  test('Exit Isolation works with no selection (calls renderer.exitGroupEditMode)', () => {
    let exited = 0;
    const orig = app.renderer.exitGroupEditMode;
    app.renderer.exitGroupEditMode = function () { exited += 1; return orig.apply(this, arguments); };
    try {
      app.renderer.groupEditMode = { groupId: 'g', activeLayerId: null, kind: 'group' };
      app.renderer.setSelection([], null);
      app.ui.refreshTopMenuItemStates();
      expect(el('btn-object-exit-isolation').disabled).toBe(false);
      el('btn-object-exit-isolation').click();
      expect(exited).toBeGreaterThan(0);
    } finally {
      app.renderer.exitGroupEditMode = orig;
      app.renderer.groupEditMode = null;
    }
  });

  test('Outline Text menu item enables only when a text layer is selected', () => {
    app.engine.layers = [];
    const shape = addLayer('wavetable');
    app.renderer.setSelection([shape.id], shape.id);
    app.ui.refreshTopMenuItemStates();
    expect(el('btn-object-outline-text').disabled).toBe(true);

    const txtId = app.engine.addLayer('text');
    app.renderer.setSelection([txtId], txtId);
    app.ui.refreshTopMenuItemStates();
    expect(el('btn-object-outline-text').disabled).toBe(false);
  });
});
