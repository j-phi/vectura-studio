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
      if (typeof ui.openVecturaFile === 'function') ui.openVecturaFile(file);
    } else if (name.endsWith('.svg')) {
      if (typeof ui.importSvgFile === 'function') ui.importSvgFile(file);
    }
  };

  const attach = (ui) => {
    requireDeps('attach');
    if (_attached) return;
    if (!UI.overlays || !UI.overlays.DragDropOverlay) {
      throw new Error('DragDropRouter requires UI.overlays.DragDropOverlay to be loaded first');
    }
    _overlay = UI.overlays.DragDropOverlay(document.body, {
      message: 'Drop a .vectura project or .svg file to import',
      accept: ['.vectura', '.svg'],
      onDrop: (files) => {
        // Only the first matching file is consumed (matches the file-input
        // single-select semantics of the existing UI buttons).
        if (files && files.length) _route(ui, files[0]);
      },
    });
    _overlay.activate();
    _attached = true;
  };

  UI.Menus.DragDropRouter = {
    bind(deps) { DEPS = deps || {}; },
    attach,
    _route,
    _reset() {
      if (_overlay && typeof _overlay.destroy === 'function') _overlay.destroy();
      _overlay = null;
      _attached = false;
      DEPS = null;
    },
  };
})();
