/*
 * Vectura Studio — Window-level drag-drop router (Phase 3 closure).
 *
 * Composes window.Vectura.UI.overlays.DragDropOverlay to receive any file
 * dropped on the page and dispatch by extension:
 *   .vectura → ui.openVecturaFile(file)
 *   .svg     → ui.importSvgFile(file)
 *
 * Other file types are ignored (and the overlay is dismissed).
 *
 * Public API:
 *   window.Vectura.UI.Menus.DragDropRouter.bind({})
 *   window.Vectura.UI.Menus.DragDropRouter.attach(uiInstance)
 *
 * The overlay is created lazily on first attach() and persisted across the
 * page lifetime (the underlying primitive is idempotent).
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.Menus = UI.Menus || {};

  let DEPS = null;
  let _overlay = null;
  let _attached = false;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`DragDropRouter.${name} invoked before bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const _route = (ui, file) => {
    if (!file || !ui) return;
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.vectura')) {
      if (typeof ui.openVecturaFile === 'function') return ui.openVecturaFile(file);
    } else if (name.endsWith('.svg')) {
      if (typeof ui.importSvgFile === 'function') return ui.importSvgFile(file);
    }
  };

  // Every .vectura file opens (several go through ui.openVecturaFiles as one ordered batch); the FIRST .svg is
  // imported as before. In a mixed drop the projects open first and the SVG is then imported into the last
  // project left on the canvas (importing first would be wiped by the project open). Extra SVGs are ignored.
  const _routeMany = (ui, files) => {
    const list = Array.from(files || []).filter(Boolean);
    const ext = (f) => (f.name || '').toLowerCase();
    const vec = list.filter((f) => ext(f).endsWith('.vectura'));
    const svg = list.find((f) => ext(f).endsWith('.svg'));
    if (vec.length > 1 && typeof ui.openVecturaFiles === 'function') {
      const done = ui.openVecturaFiles(vec);
      if (svg) Promise.resolve(done).then(() => _route(ui, svg));
      return;
    }
    if (vec.length) {
      const done = _route(ui, vec[0]);
      if (svg) Promise.resolve(done).then(() => _route(ui, svg));
      return;
    }
    if (svg) _route(ui, svg);
  };

  const attach = (ui) => {
    requireDeps('attach');
    if (_attached) return;
    if (!UI.overlays || !UI.overlays.DragDropOverlay) {
      throw new Error('DragDropRouter requires UI.overlays.DragDropOverlay to be loaded first');
    }
    _overlay = UI.overlays.DragDropOverlay(document.body, {
      message: 'Drop .vectura projects or an .svg file to import',
      accept: ['.vectura', '.svg'],
      onDrop: (files) => {
        if (files && files.length) _routeMany(ui, files);
      },
    });
    _overlay.activate();
    _attached = true;
  };

  UI.Menus.DragDropRouter = {
    bind(deps) { DEPS = deps || {}; },
    attach,
    _route,
    _routeMany,
    _reset() {
      if (_overlay && typeof _overlay.destroy === 'function') _overlay.destroy();
      _overlay = null;
      _attached = false;
      DEPS = null;
    },
  };
})();
