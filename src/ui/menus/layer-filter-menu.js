/*
 * Vectura Studio — Layer filter dropdown (Phase 3 closure).
 *
 * Composes window.Vectura.UI.overlays.Menu to replace the bespoke
 * `#layer-filter-menu` <div> populated in src/ui/shortcuts.js. The list of
 * filter options matches the legacy `FILTER_OPTS` array verbatim. The
 * legacy DOM element (#layer-filter-menu) is retained as a no-op anchor so
 * the existing CSS class hooks ('hidden') don't break any visual style;
 * however, the rendered items live in the floating Menu primitive which
 * appends to document.body.
 *
 * Public API:
 *   window.Vectura.UI.Menus.LayerFilter.bind({ getEl })
 *   window.Vectura.UI.Menus.LayerFilter.attach(uiInstance)
 *     attach() wires the click on #layer-filter-btn — call once on bind.
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

  const FILTER_OPTS = [
    { v: 'all', l: 'All Layers' }, { v: 'groups', l: 'Groups Only' },
    { v: 'shape', l: 'Shape' }, { v: 'svg', l: 'SVG' },
    { v: 'polygon', l: 'Polygon' }, { v: 'pen', l: 'Pen' },
    { v: 'flowfield', l: 'Flowfield' }, { v: 'wavetable', l: 'Wavetable' },
    { v: 'hyphae', l: 'Hyphae' }, { v: 'topo', l: 'Topo' },
    { v: 'spiral', l: 'Spiral' }, { v: 'rings', l: 'Rings' },
    { v: 'grid', l: 'Grid' }, { v: 'boids', l: 'Boids' },
    { v: 'attractor', l: 'Attractor' }, { v: 'lissajous', l: 'Lissajous' },
    { v: 'harmonograph', l: 'Harmonograph' }, { v: 'pendula', l: 'Pendula' }, { v: 'rainfall', l: 'Rainfall' },
    { v: 'phylla', l: 'Phylla' }, { v: 'petalisDesigner', l: 'Petalis Designer' },
    { v: 'shapePack', l: 'Shapepack' },
  ];

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`LayerFilterMenu.${name} invoked before bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const _itemsFor = (currentFilter) => FILTER_OPTS.map((o) => ({
    key: o.v,
    label: (currentFilter === o.v ? '✓ ' : '   ') + o.l,
  }));

  const _ensureMenu = () => {
    if (_menu) return _menu;
    if (!UI.overlays || !UI.overlays.Menu) {
      throw new Error('LayerFilterMenu requires UI.overlays.Menu to be loaded first');
    }
    _menu = UI.overlays.Menu(document.body, { items: [], onSelect: () => {} });
    return _menu;
  };

  const open = (ui, anchor) => {
    const menu = _ensureMenu();
    const current = ui.layerFilterType || 'all';
    menu.update({
      items: _itemsFor(current),
      onSelect: (key) => {
        ui.layerFilterType = key;
        ui.layerFilterOpen = false;
        const filterBtn = document.getElementById('layer-filter-btn');
        if (filterBtn) {
          const active = key !== 'all' || !!ui.layerSearchQ;
          filterBtn.classList.toggle('active', active);
        }
        // Hide the legacy bespoke div so the old CSS class doesn't paint
        // its empty markup.
        document.getElementById('layer-filter-menu')?.classList.add('hidden');
        if (typeof ui.renderLayers === 'function') ui.renderLayers();
      },
    });
    if (menu.isOpen && menu.isOpen()) menu.close();
    menu.open(anchor);
  };

  const attach = (ui) => {
    requireDeps('attach');
    if (_attached) return;
    const filterBtn = document.getElementById('layer-filter-btn');
    if (!filterBtn) return;
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = _ensureMenu();
      if (menu.isOpen && menu.isOpen()) {
        menu.close();
        ui.layerFilterOpen = false;
      } else {
        open(ui, filterBtn);
        ui.layerFilterOpen = true;
      }
    });
    _attached = true;
  };

  UI.Menus.LayerFilter = {
    bind(deps) { DEPS = deps || {}; },
    attach,
    open,
    _itemsFor,
    FILTER_OPTS,
    _reset() {
      if (_menu && typeof _menu.destroy === 'function') _menu.destroy();
      _menu = null;
      _attached = false;
      DEPS = null;
    },
  };
})();
