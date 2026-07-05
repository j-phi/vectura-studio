/*
 * CTX-1 — canvas right-click context menu (Lane M).
 *
 * The menu module self-attaches its own `contextmenu` listener to the canvas
 * (it does NOT edit renderer.js). Its <script> tag is added to index.html by
 * the phase integrator, so — like the isolation breadcrumb — the runtime loader
 * won't pick it up; we inject the config + module into the same jsdom window.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 60));

const CONFIG_PATH = path.resolve(__dirname, '../../src/config/context-menu.js');
const MODULE_PATH = path.resolve(__dirname, '../../src/ui/shell/canvas-context-menu.js');

const injectScript = (window, filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const runner = new Function(
    'window', 'document', 'globalThis',
    'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'performance',
    code
  );
  runner(
    window, window.document, window,
    window.requestAnimationFrame, window.cancelAnimationFrame,
    window.setTimeout.bind(window), window.clearTimeout.bind(window),
    window.performance || { now: () => Date.now() }
  );
};

describe('CTX-1 — canvas context menu', () => {
  let runtime, window, document, app, CM;

  const boot = async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    ({ window, document } = runtime);
    injectScript(window, CONFIG_PATH);
    injectScript(window, MODULE_PATH);
    app = window.app = new window.Vectura.App();
    CM = window.Vectura.UI.CanvasContextMenu;
    CM.mount(app);
    await waitForUi();
  };

  afterEach(() => {
    try { window?.Vectura?.UI?.CanvasContextMenu?.destroy?.(); } catch (_) {}
    runtime?.cleanup?.();
    runtime = null;
  });

  const addLayers = (n) => {
    app.engine.layers = [];
    const ids = [];
    for (let i = 0; i < n; i += 1) {
      const id = app.engine.addLayer('wavetable');
      ids.push(id);
      app.engine.generate(id);
    }
    app.engine.computeAllDisplayGeometry();
    return ids;
  };

  const idsOf = (items) => items.filter((it) => !it.separator).map((it) => it.id);
  const item = (items, id) => items.find((it) => it.id === id);

  test('exposes the CanvasContextMenu API', async () => {
    await boot();
    expect(typeof CM.mount).toBe('function');
    expect(typeof CM.openAt).toBe('function');
    expect(typeof CM.buildItems).toBe('function');
    expect(typeof CM.close).toBe('function');
  });

  test('with NO selection, menu is the Undo / Redo subset only', async () => {
    await boot();
    app.renderer.setSelection([], null);
    const items = CM.buildItems();
    expect(idsOf(items)).toEqual(['undo', 'redo']);
  });

  test('with a multi-selection, menu lists the full verb set', async () => {
    await boot();
    const ids = addLayers(2);
    app.renderer.setSelection(ids, ids[0]);
    const items = CM.buildItems();
    const menuIds = idsOf(items);
    ['duplicate', 'delete', 'undo', 'redo', 'group', 'ungroup', 'isolate',
      'simplify', 'smooth', 'flip-h', 'flip-v', 'transform'].forEach((id) => {
      expect(menuIds).toContain(id);
    });
    // Group is enabled for 2+ layers; ungroup/isolate disabled (no group here).
    expect(item(items, 'group').enabled).toBe(true);
    expect(item(items, 'ungroup').enabled).toBe(false);
    expect(item(items, 'isolate').enabled).toBe(false);
    expect(item(items, 'flip-h').enabled).toBe(true);
  });

  test('a single non-group selection disables Group with a reason', async () => {
    await boot();
    const ids = addLayers(1);
    app.renderer.setSelection(ids, ids[0]);
    const items = CM.buildItems();
    const group = item(items, 'group');
    expect(group.enabled).toBe(false);
    expect(group.reason).toBeTruthy();
    // Duplicate/Delete are always available with a selection.
    expect(item(items, 'duplicate').enabled).toBe(true);
    expect(item(items, 'delete').enabled).toBe(true);
  });

  test('right-clicking the canvas opens the menu; Escape closes it', async () => {
    await boot();
    const ids = addLayers(2);
    app.renderer.setSelection(ids, ids[0]);
    const canvas = document.getElementById('main-canvas');
    const evt = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 });
    canvas.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(CM.getElement()).toBeTruthy();
    expect(document.querySelector('.canvas-ctx-menu')).toBeTruthy();
    // Disabled items carry their reason as a title.
    const ungroupBtn = document.querySelector('.canvas-ctx-item[data-ctx-id="ungroup"]');
    expect(ungroupBtn.disabled).toBe(true);
    expect(ungroupBtn.title).toBeTruthy();

    const esc = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc);
    expect(CM.getElement()).toBeNull();
    expect(document.querySelector('.canvas-ctx-menu')).toBeNull();
  });

  test('Duplicate routes to ui.duplicateLayers', async () => {
    await boot();
    const ids = addLayers(1);
    app.renderer.setSelection(ids, ids[0]);
    let called = null;
    const orig = app.ui.duplicateLayers.bind(app.ui);
    app.ui.duplicateLayers = (layers) => { called = layers; return orig(layers); };
    CM.openAt(50, 50);
    document.querySelector('.canvas-ctx-item[data-ctx-id="duplicate"]').click();
    expect(Array.isArray(called)).toBe(true);
    expect(called.length).toBe(1);
    // Menu closes after activating an item.
    expect(CM.getElement()).toBeNull();
  });

  test('Flip Horizontal routes to PathEditOps.flipLayers with axis + app', async () => {
    await boot();
    const ids = addLayers(1);
    app.renderer.setSelection(ids, ids[0]);
    let args = null;
    const orig = window.Vectura.PathEditOps.flipLayers;
    window.Vectura.PathEditOps.flipLayers = (layerIds, axis, opts) => { args = { layerIds, axis, opts }; return orig(layerIds, axis, opts); };
    CM.openAt(50, 50);
    document.querySelector('.canvas-ctx-item[data-ctx-id="flip-h"]').click();
    expect(args).toBeTruthy();
    expect(args.axis).toBe('horizontal');
    expect(args.opts && args.opts.app).toBe(app);
    window.Vectura.PathEditOps.flipLayers = orig;
  });

  test('Delete removes the selected layers under one history step', async () => {
    await boot();
    const ids = addLayers(2);
    app.renderer.setSelection(ids, ids[0]);
    app.pushHistory(); // baseline
    const before = app.history.length;
    CM.openAt(50, 50);
    document.querySelector('.canvas-ctx-item[data-ctx-id="delete"]').click();
    expect(app.engine.layers.length).toBe(0);
    expect(app.history.length).toBe(before + 1);
  });

  test('Undo/Redo route to the existing top-menu action', async () => {
    await boot();
    addLayers(1);
    app.renderer.setSelection([], null);
    // Seed history so Undo is genuinely enabled (needs >= 2 entries).
    app.pushHistory();
    app.pushHistory();
    let action = null;
    const orig = app.ui.triggerTopMenuAction.bind(app.ui);
    app.ui.triggerTopMenuAction = (btnId) => { action = btnId; return true; };
    CM.openAt(50, 50);
    // No selection → only undo/redo present.
    const undoBtn = document.querySelector('.canvas-ctx-item[data-ctx-id="undo"]');
    expect(undoBtn).toBeTruthy();
    expect(undoBtn.disabled).toBe(false);
    undoBtn.click();
    expect(action).toBe('btn-undo');
    app.ui.triggerTopMenuAction = orig;
  });
});
