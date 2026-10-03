/*
 * TUX-037 — every destructive delete shows an Undo toast.
 * Entry points: row Delete, group Delete, multi-select Delete, layer context menu,
 * canvas context menu (Edit > Delete), keyboard Delete, pen delete.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('TUX-037 delete -> Undo toast', () => {
  let runtime, window, document, app;

  const boot = async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    window.Vectura.UI.CanvasContextMenu.mount(app);
    await waitForUi();
  };

  afterEach(() => {
    try { window?.Vectura?.UI?.CanvasContextMenu?.destroy?.(); } catch (_) {}
    runtime?.cleanup?.();
    runtime = null;
  });

  const toasts = () => [...document.querySelectorAll('#vectura-toast-host .vectura-toast')];
  const undoBtns = () => [...document.querySelectorAll('#vectura-toast-host [data-action="undo"]')];
  const ids = () => app.engine.layers.map((l) => l.id);
  const addLayers = (n) => {
    app.engine.layers = [];
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push(app.engine.addLayer('wavetable'));
    }
    app.pushHistory();
    app.ui.renderLayers();
    return out;
  };
  const rowDel = (id, title = 'Delete') => document.querySelector(`[data-layer-id="${id}"] .lvl-ab.del[title="${title}"]`);
  const select = (idList) => app.renderer.setSelection(idList, idList[idList.length - 1]);

  test('1. row Delete shows a toast with the layer name; Undo restores id and index', async () => {
    await boot();
    const [a, b] = addLayers(2);
    const before = ids();
    const name = app.engine.getLayerById(b).name;
    const btn = rowDel(b);
    expect(btn).toBeTruthy();
    btn.click();
    expect(ids()).not.toContain(b);
    expect(undoBtns().length).toBe(1);
    expect(toasts()[0].textContent).toContain(name);
    undoBtns()[0].click();
    expect(ids()).toEqual(before);
    expect(app.engine.layers.indexOf(app.engine.getLayerById(b))).toBe(before.indexOf(b));
    expect(toasts().length).toBe(0);
    expect(a).toBeTruthy();
  });

  test('2. group Delete + Undo restores group, children, order, parentIds, selection', async () => {
    await boot();
    const { Layer } = window.Vectura;
    app.engine.layers = [];
    const g = new Layer('grp1', 'group', 'Grp');
    g.isGroup = true; g.groupType = 'group'; g.groupCollapsed = false; g.parentId = null;
    const c1 = new Layer('kid1', 'shape', 'K1'); c1.parentId = g.id;
    const c2 = new Layer('kid2', 'shape', 'K2'); c2.parentId = g.id;
    app.engine.layers = [g, c2, c1];
    app.engine.activeLayerId = g.id;
    select([g.id]);
    app.pushHistory();
    app.ui.renderLayers();
    const shape = () => app.engine.layers.map((l) => [l.id, l.parentId ?? null]);
    const sel = () => [...app.renderer.selectedLayerIds];
    const beforeShape = shape(); const beforeSel = sel();
    rowDel(g.id, 'Delete group').click();
    expect(app.engine.layers.find((l) => l.id === g.id)).toBeFalsy();
    expect(undoBtns().length).toBe(1);
    undoBtns()[0].click();
    expect(shape()).toEqual(beforeShape);
    expect(sel()).toEqual(beforeSel);
  });

  test('3. modifier + masked layer: Undo (toast and Edit>Undo) restores lock set, parents, mask', async () => {
    await boot();
    app.engine.layers = [];
    const mid = app.engine.addModifierLayer('mirror');
    const child = app.engine.addLayer('wavetable');
    app.engine.getLayerById(child).parentId = mid;
    const masked = app.engine.addLayer('wavetable');
    const ml = app.engine.getLayerById(masked);
    ml.mask = { enabled: true, sourceIds: [], mode: 'parent', hideLayer: false, invert: false, materialized: false };
    ml.maskCapabilities = { canSource: true, reason: '', sourceType: 'closed-shape' };
    const maskKid = app.engine.addLayer('wavetable');
    app.engine.getLayerById(maskKid).parentId = masked;
    app.ui.layerLockedIds.add(child);
    app.pushHistory();
    app.ui.renderLayers();
    const snap = () => ({
      parents: app.engine.layers.map((l) => [l.id, l.parentId ?? null]),
      mask: JSON.stringify(app.engine.getLayerById(masked)?.mask),
      locks: [...app.ui.layerLockedIds],
    });
    const before = snap();
    expect(before.locks).toEqual([child]);

    rowDel(mid, 'Delete group').click();
    expect(app.ui.layerLockedIds.size).toBe(0);
    undoBtns()[0].click();
    expect(snap()).toEqual(before);

    rowDel(mid, 'Delete group').click();
    app.undo();
    expect(snap()).toEqual(before);
  });

  test('4. pen delete: toast Undo restores pens and layer.penId', async () => {
    await boot();
    const S = window.Vectura.SETTINGS;
    S.pens = [
      { id: 'pen-a', name: 'A', color: '#111111', width: 0.3 },
      { id: 'pen-b', name: 'B', color: '#222222', width: 0.3 },
    ];
    const [l1] = addLayers(1);
    app.engine.getLayerById(l1).penId = 'pen-b';
    app.pushHistory();
    app.ui.removePen('pen-b');
    expect(S.pens.map((p) => p.id)).toEqual(['pen-a']);
    expect(app.engine.getLayerById(l1).penId).toBe('pen-a');
    expect(undoBtns().length).toBe(1);
    expect(toasts()[0].textContent).toContain('B');
    undoBtns()[0].click();
    expect(S.pens.map((p) => p.id)).toEqual(['pen-a', 'pen-b']);
    expect(app.engine.getLayerById(l1).penId).toBe('pen-b');
  });

  test('5. stale guard: a later history edit disables Undo and never reverts it', async () => {
    await boot();
    const [, b] = addLayers(2);
    rowDel(b).click();
    const btn = undoBtns()[0];
    const first = app.engine.layers[0].id;
    document.querySelector(`[data-layer-id="${first}"] .lvl-ab[title^="Duplicate"]`).click();
    const afterDup = ids();
    expect(afterDup.length).toBe(2);
    btn.click();
    expect(ids()).toEqual(afterDup);
    expect(btn.disabled || !btn.isConnected).toBe(true);
  });

  test('6. a second delete replaces the toast', async () => {
    await boot();
    const [a, b] = addLayers(2);
    rowDel(b).click();
    const nameA = app.engine.getLayerById(a).name;
    rowDel(a).click();
    expect(undoBtns().length).toBe(1);
    expect(toasts()[0].textContent).toContain(nameA);
  });

  test('7. multi-select Delete and canvas-menu Delete each give one toast; Undo restores all', async () => {
    await boot();
    const three = addLayers(3);
    const before = ids();
    select([three[0], three[1]]);
    app.ui._lvlDelSel();
    expect(undoBtns().length).toBe(1);
    expect(toasts()[0].textContent).toMatch(/Deleted 2 layers/);
    undoBtns()[0].click();
    expect(ids()).toEqual(before);

    select([three[1], three[2]]);
    window.Vectura.UI.CanvasContextMenu.runCommand('delete');
    expect(undoBtns().length).toBe(1);
    undoBtns()[0].click();
    expect(ids()).toEqual(before);
  });

  test('8. keyboard Delete shows a toast', async () => {
    await boot();
    const [, b] = addLayers(2);
    select([b]);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(ids()).not.toContain(b);
    expect(undoBtns().length).toBe(1);
  });

  test('9. layer context menu Delete shows a toast', async () => {
    await boot();
    const [, b] = addLayers(2);
    const LC = window.Vectura.UI.Menus.LayerContext;
    expect(LC).toBeTruthy();
    LC._runAction(app.ui, app.engine.getLayerById(b), 'delete');
    expect(undoBtns().length).toBe(1);
  });

  test('9. a lock set after the checkpoint survives an unrelated undo', async () => {
    await boot();
    const [a] = addLayers(1);
    app.pushHistory();
    app.engine.getLayerById(a).name = 'renamed';
    app.ui.layerLockedIds.add(a);
    app.undo();
    expect(app.ui.layerLockedIds.has(a)).toBe(true);
  });

  test('10. saveVecturaFile does not write layerLockedIds into the document', async () => {
    await boot();
    const [a] = addLayers(1);
    app.ui.layerLockedIds.add(a);
    let blob = null;
    window.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    window.URL.revokeObjectURL = () => {};
    app.ui.saveVecturaFile();
    expect(blob).toBeTruthy();
    const text = await new Promise((res) => { const r = new window.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });
    const payload = JSON.parse(text);
    expect(payload.state.engine).toBeTruthy();
    expect('layerLockedIds' in payload.state).toBe(false);
  });
});
