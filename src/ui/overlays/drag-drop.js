/*
 * Vectura Studio — DragDropOverlay (Phase 1).
 *
 * Full-window drag-and-drop receiver. Listens at the window level and shows a
 * visual prompt while the user is dragging files. Used by SVG import, .vectura
 * open, rainfall silhouette, pattern import in Phase 3.
 *
 * Public API:
 *   const dnd = UI.overlays.DragDropOverlay(host, props);
 *   dnd.activate(), dnd.deactivate(), dnd.destroy()
 *
 * Props:
 *   accept       — array of MIME types or file extensions to highlight.
 *                  Default: any files.
 *   message      — string shown while drag is in progress.
 *   onDrop(files, event) — required.
 *
 * Returns: { el, activate, deactivate, isActive, destroy }
 *
 * The overlay automatically listens to window dragenter/leave/over/drop once
 * `activate()` is called. The visible prompt only renders while at least one
 * dragenter has fired without a matching dragleave.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ message: 'Drop file to import' }, initialProps);
    const utils = UI.utils || {};
    const ownerDoc = (host && host.ownerDocument) || document;
    const win = ownerDoc.defaultView || window;

    const el = ownerDoc.createElement('div');
    el.className = 'vectura-drag-drop-overlay';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position: fixed', 'inset: 0',
      'display: none',
      'align-items: center', 'justify-content: center',
      'background: rgba(0, 0, 0, 0.55)',
      'z-index: 7000',
      'font-family: var(--font-ui, system-ui)',
      'font-size: 14px',
      'color: #fff',
      'pointer-events: none',
    ].join(';');

    const inner = ownerDoc.createElement('div');
    inner.className = 'vectura-drag-drop-prompt';
    inner.style.cssText = [
      'padding: 24px 32px',
      'border: 2px dashed var(--ui-accent, #4e9ee1)',
      'border-radius: 12px',
      'background: rgba(20, 30, 50, 0.7)',
    ].join(';');
    inner.textContent = props.message;
    el.appendChild(inner);
    (host || ownerDoc.body).appendChild(el);

    let active = false;
    let dragDepth = 0;
    let visible = false;

    const matchesAccept = (file) => {
      const accept = Array.isArray(props.accept) ? props.accept : [];
      if (!accept.length) return true;
      return accept.some((entry) => {
        if (!entry) return false;
        if (entry.startsWith('.')) return file.name && file.name.toLowerCase().endsWith(entry.toLowerCase());
        if (entry.endsWith('/*')) return file.type && file.type.startsWith(entry.slice(0, -1));
        return file.type === entry;
      });
    };

    const setVisible = (next) => {
      if (visible === !!next) return;
      visible = !!next;
      el.style.display = visible ? 'flex' : 'none';
    };

    const onDragEnter = (event) => {
      // Only count if there are files in the transfer.
      const types = event.dataTransfer && event.dataTransfer.types;
      if (!types || Array.from(types).indexOf('Files') < 0) return;
      dragDepth += 1;
      event.preventDefault();
      setVisible(true);
    };
    const onDragOver = (event) => {
      const types = event.dataTransfer && event.dataTransfer.types;
      if (!types || Array.from(types).indexOf('Files') < 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event) => {
      const types = event.dataTransfer && event.dataTransfer.types;
      if (!types || Array.from(types).indexOf('Files') < 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setVisible(false);
    };
    const onDrop = (event) => {
      const types = event.dataTransfer && event.dataTransfer.types;
      if (!types || Array.from(types).indexOf('Files') < 0) return;
      event.preventDefault();
      dragDepth = 0;
      setVisible(false);
      const files = Array.from(event.dataTransfer.files || []);
      const matching = files.filter(matchesAccept);
      if (matching.length === 0) return;
      if (typeof props.onDrop === 'function') props.onDrop(matching, event);
    };

    const handlers = [
      ['dragenter', onDragEnter],
      ['dragover', onDragOver],
      ['dragleave', onDragLeave],
      ['drop', onDrop],
    ];
    let offs = [];

    const activate = () => {
      if (active) return;
      active = true;
      offs = handlers.map(([evt, fn]) => {
        win.addEventListener(evt, fn);
        return () => win.removeEventListener(evt, fn);
      });
    };
    const deactivate = () => {
      if (!active) return;
      active = false;
      offs.forEach((fn) => fn());
      offs = [];
      dragDepth = 0;
      setVisible(false);
    };

    return {
      el,
      activate,
      deactivate,
      isActive: () => active,
      isVisible: () => visible,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        if (newProps && newProps.message) inner.textContent = newProps.message;
      },
      destroy() {
        deactivate();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.overlays.DragDropOverlay = create;
})();
