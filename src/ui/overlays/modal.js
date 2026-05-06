/*
 * Vectura Studio — Modal overlay (Phase 1).
 *
 * The base modal primitive used by Phase 3's Document Setup, Color Picker,
 * Help, Export, etc. Owns:
 *   - backdrop element
 *   - focus trap (UI.focus.trap)
 *   - focus restoration on close
 *   - Esc-to-close (opt-out via keyboard:false)
 *   - click-outside dismissal (opt-in via dismissOnBackdrop)
 *
 * Public API:
 *   const modal = UI.overlays.Modal(host, props);
 *   modal.open(), modal.close(), modal.update(props), modal.destroy()
 *
 * Props:
 *   title             — string. Default ''.
 *   ariaLabel         — overrides title for screen readers.
 *   keyboard          — boolean (default true). Esc closes the modal.
 *   dismissOnBackdrop — boolean (default false).
 *   onOpen()/onClose()— optional lifecycle callbacks.
 *   render(bodyEl)    — required; called once with the body element so the
 *                       caller can populate it.
 *
 * Returns: { el, body, isOpen, open, close, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ keyboard: true, dismissOnBackdrop: false }, initialProps);
    const utils = UI.utils || {};
    const focus = UI.focus || {};
    const ownerDoc = (host && host.ownerDocument) || document;
    const win = ownerDoc.defaultView || window;

    const backdrop = ownerDoc.createElement('div');
    backdrop.className = 'vectura-modal-backdrop';
    backdrop.style.cssText = [
      'position: fixed', 'inset: 0',
      'background: rgba(0, 0, 0, 0.42)',
      'display: none',
      'align-items: center', 'justify-content: center',
      'z-index: 1000',
    ].join(';');

    const dialog = ownerDoc.createElement('div');
    dialog.className = 'vectura-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    if (props.ariaLabel) dialog.setAttribute('aria-label', props.ariaLabel);
    else if (props.title) dialog.setAttribute('aria-label', props.title);

    if (props.title) {
      const header = ownerDoc.createElement('header');
      header.className = 'vectura-modal-hdr';
      const h2 = ownerDoc.createElement('h2');
      h2.textContent = props.title;
      header.appendChild(h2);
      dialog.appendChild(header);
    }

    const body = ownerDoc.createElement('div');
    body.className = 'vectura-modal-body';
    dialog.appendChild(body);

    if (typeof props.render === 'function') {
      try { props.render(body); } catch (_) { /* visible via empty body */ }
    }

    backdrop.appendChild(dialog);
    (host || ownerDoc.body).appendChild(backdrop);

    let trapHandle = null;
    let restoreFocus = null;
    let open = false;

    const handleKey = (event) => {
      if (!props.keyboard) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const handleBackdropClick = (event) => {
      if (!props.dismissOnBackdrop) return;
      if (event.target === backdrop) close();
    };
    const offKey = utils.on ? utils.on(ownerDoc, 'keydown', handleKey) : (ownerDoc.addEventListener('keydown', handleKey), () => ownerDoc.removeEventListener('keydown', handleKey));
    const offBackdrop = utils.on ? utils.on(backdrop, 'click', handleBackdropClick) : (backdrop.addEventListener('click', handleBackdropClick), () => backdrop.removeEventListener('click', handleBackdropClick));

    function doOpen() {
      if (open) return;
      open = true;
      restoreFocus = focus.restoreOnReturn ? focus.restoreOnReturn(ownerDoc) : null;
      backdrop.style.display = 'flex';
      // After display:flex, defer focus to next microtask so DOM is laid out.
      win.setTimeout(() => {
        const focusables = focus.getFocusable ? focus.getFocusable(dialog) : [];
        if (focusables.length) focusables[0].focus();
        else dialog.tabIndex = -1, dialog.focus();
      }, 0);
      trapHandle = focus.trap ? focus.trap(dialog) : null;
      if (typeof props.onOpen === 'function') props.onOpen();
    }

    function close() {
      if (!open) return;
      open = false;
      backdrop.style.display = 'none';
      if (trapHandle && typeof trapHandle.release === 'function') trapHandle.release();
      trapHandle = null;
      if (typeof restoreFocus === 'function') restoreFocus();
      restoreFocus = null;
      if (typeof props.onClose === 'function') props.onClose();
    }

    return {
      el: backdrop,
      dialog,
      body,
      isOpen: () => open,
      open: doOpen,
      close,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.title != null) {
          let header = dialog.querySelector('.vectura-modal-hdr h2');
          if (!header) {
            const hdr = ownerDoc.createElement('header');
            hdr.className = 'vectura-modal-hdr';
            const h2 = ownerDoc.createElement('h2');
            hdr.appendChild(h2);
            dialog.insertBefore(hdr, body);
            header = h2;
          }
          header.textContent = newProps.title;
        }
        if (newProps && newProps.ariaLabel) dialog.setAttribute('aria-label', newProps.ariaLabel);
        props = merged;
      },
      destroy() {
        if (open) close();
        offKey();
        offBackdrop();
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      },
    };
  };

  UI.overlays.Modal = create;
})();
