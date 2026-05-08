/*
 * Vectura Studio — Layer right-click context menu (Phase 3 closure).
 *
 * Composes `window.Vectura.UI.overlays.Menu` to add a per-row context menu
 * to the layer list (`#layer-list`). Items map to existing engine/UI
 * actions; no new engine surface is introduced.
 *
 * Public API:
 *   window.Vectura.UI.Menus.LayerContext.bind(deps)
 *     deps: { getEl }
 *   window.Vectura.UI.Menus.LayerContext.attach(uiInstance)
 *     Hooks the contextmenu event on #layer-list. Idempotent — safe to call
 *     after every renderLayers().
 *
 * The menu is owned by the module (singleton) and reused across opens.
 *
 * Items (only those applicable to the clicked layer are enabled):
 *   - Rename       → focus the existing inline name field
 *   - Duplicate    → engine.duplicateLayer(id)
 *   - Delete       → engine.removeLayer(id)
 *   - Toggle visibility → cascades visible flag (matches the eye-icon click)
 *   - Toggle lock  → adds/removes id from ui.layerLockedIds
 *   - Expand into group → ui.expandLayer(layer)  [for non-shape, non-group]
 *
 * Compile gate at tests/unit/menus/layer-context-compile.test.js.
 * Integration coverage at tests/integration/menus/layer-context.test.js.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.Menus = UI.Menus || {};

  let DEPS = null;
  let _menu = null;
  let _attached = false;
  let _attachedListEl = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`LayerContextMenu.${name} invoked before bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const _findLayer = (ui, id) => {
    if (!ui || !ui.app || !ui.app.engine) return null;
    const layers = ui.app.engine.layers || [];
    return layers.find((l) => l && l.id === id) || null;
  };

  const _itemsFor = (ui, layer) => {
    const items = [];
    items.push({ key: 'rename', label: 'Rename' });
    items.push({ key: 'duplicate', label: 'Duplicate', shortcut: '⌘D' });
    items.push({ key: 'delete', label: 'Delete', shortcut: 'Del' });
    items.push({ separator: true });
    items.push({
      key: 'toggle-visibility',
      label: layer && layer.visible === false ? 'Show layer' : 'Hide layer',
    });
    const locked = ui.layerLockedIds && ui.layerLockedIds.has && ui.layerLockedIds.has(layer.id);
    items.push({
      key: 'toggle-lock',
      label: locked ? 'Unlock' : 'Lock',
    });
    if (layer && layer.type && layer.type !== 'shape' && !layer.isGroup) {
      items.push({ separator: true });
      items.push({ key: 'expand-into-group', label: 'Expand into group' });
    }
    return items;
  };

  const _runAction = (ui, layer, key) => {
    if (!ui || !layer) return;
    const engine = ui.app && ui.app.engine;
    if (!engine) return;
    if (key === 'rename') {
      const card = document.querySelector(`[data-layer-id="${layer.id}"] .lvl-name, [data-lvl-id="${layer.id}"] .lvl-name`);
      if (card && typeof card.focus === 'function') {
        card.focus();
        if (typeof card.setSelectionRange === 'function') {
          try { card.setSelectionRange(0, (card.value || '').length); } catch (_) { /* noop */ }
        }
      }
      return;
    }
    if (key === 'duplicate') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      engine.duplicateLayer(layer.id);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'delete') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      ui.unlockMirrorChildrenOnDelete?.(layer.id);
      engine.removeLayer(layer.id);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
    if (key === 'toggle-visibility') {
      if (ui.app.pushHistory) ui.app.pushHistory();
      const newVis = !layer.visible;
      const allLayers = engine.layers || [];
      const cascade = (l) => {
        l.visible = newVis;
        allLayers.filter((c) => c.parentId === l.id).forEach(cascade);
      };
      cascade(layer);
      engine.computeAllDisplayGeometry && engine.computeAllDisplayGeometry();
      ui.app.render && ui.app.render();
      ui.renderLayers && ui.renderLayers();
      return;
    }
    if (key === 'toggle-lock') {
      if (!ui.layerLockedIds) return;
      if (ui.layerLockedIds.has(layer.id)) ui.layerLockedIds.delete(layer.id);
      else ui.layerLockedIds.add(layer.id);
      ui.renderLayers && ui.renderLayers();
      return;
    }
    if (key === 'expand-into-group') {
      if (typeof ui.expandLayer === 'function') ui.expandLayer(layer);
      ui.renderLayers && ui.renderLayers();
      ui.app.render && ui.app.render();
      return;
    }
  };

  const _ensureMenu = () => {
    if (_menu) return _menu;
    if (!UI.overlays || !UI.overlays.Menu) {
      throw new Error('LayerContextMenu requires UI.overlays.Menu to be loaded first');
    }
    _menu = UI.overlays.Menu(document.body, { items: [], onSelect: () => {} });
    return _menu;
  };

  // Position the singleton menu at an arbitrary {x, y} (ignoring anchor logic
  // that the primitive uses for buttons). We synthesize a 1×1 anchor.
  const _openAt = (ui, layer, x, y) => {
    const menu = _ensureMenu();
    const items = _itemsFor(ui, layer);
    menu.update({
      items,
      onSelect: (key) => _runAction(ui, layer, key),
    });
    // Synthesize a tiny zero-size element at (x, y) so the primitive's
    // viewport-aware positionAgainst() + clickOutside guard work cleanly.
    let anchor = document.getElementById('vectura-layer-ctx-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'vectura-layer-ctx-anchor';
      anchor.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none;opacity:0;';
      document.body.appendChild(anchor);
    }
    anchor.style.top = `${y}px`;
    anchor.style.left = `${x}px`;
    if (menu.isOpen && menu.isOpen()) menu.close();
    menu.open(anchor);
  };

  const _onContextMenu = (ui) => (event) => {
    const card = event.target && event.target.closest && event.target.closest('[data-layer-id]');
    if (!card) return;
    const id = card.getAttribute('data-layer-id');
    if (!id) return;
    const layer = _findLayer(ui, id);
    if (!layer) return;
    event.preventDefault();
    _openAt(ui, layer, event.clientX, event.clientY);
  };

  const attach = (ui) => {
    requireDeps('attach');
    const list = document.getElementById('layer-list');
    if (!list) return;
    if (_attached && _attachedListEl === list) return;
    if (_attached && _attachedListEl && _attachedListEl !== list && _attachedListEl._vecturaCtxHandler) {
      _attachedListEl.removeEventListener('contextmenu', _attachedListEl._vecturaCtxHandler);
      _attachedListEl._vecturaCtxHandler = null;
    }
    const handler = _onContextMenu(ui);
    list.addEventListener('contextmenu', handler);
    list._vecturaCtxHandler = handler;
    _attached = true;
    _attachedListEl = list;
  };

  UI.Menus.LayerContext = {
    bind(deps) { DEPS = deps || {}; },
    attach,
    // Test helpers (not for production code paths).
    _itemsFor,
    _runAction,
    _reset() {
      if (_menu && typeof _menu.destroy === 'function') _menu.destroy();
      _menu = null;
      _attached = false;
      _attachedListEl = null;
      DEPS = null;
    },
  };
})();
