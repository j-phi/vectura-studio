/*
 * Vectura Studio — Modal overlay.
 *
 * Two coexisting APIs:
 *
 * (1) Phase 1 primitive — the focus-trapping, Esc-to-close, focus-restoring
 *     dialog used by Phase 3's Document Setup, Color Picker, Help, Export, etc.
 *
 *     const modal = UI.overlays.Modal(host, props);
 *     modal.open(), modal.close(), modal.update(props), modal.destroy()
 *
 *     Props:
 *       title             — string. Default ''.
 *       ariaLabel         — overrides title for screen readers.
 *       keyboard          — boolean (default true). Esc closes the modal.
 *       dismissOnBackdrop — boolean (default false).
 *       onOpen()/onClose()— optional lifecycle callbacks.
 *       render(bodyEl)    — required; called once with the body element so the
 *                           caller can populate it.
 *
 *     Returns: { el, body, isOpen, open, close, update, destroy }
 *
 * (2) Meridian Unit 1.7 promotion — the legacy mount wrappers that compose
 *     `this.modal` (the `#modal-overlay` overlay-card the rest of the UI uses
 *     via `this.openModal(...)` / `this.closeModal()`). Installed onto
 *     UI.prototype via `Modal.installOn(UI.prototype)`. These methods came
 *     from `src/ui/_ui-legacy.js`:
 *       - createModal()                — creates the #modal-overlay scaffold
 *       - openModal({ title, body, cardClass, onClose })
 *       - closeModal()
 *       - _mountGridSettingsPanel()    — delegates to Modals.GridSettings.mount
 *       - _mountDocumentSetupPanel()   — delegates to Modals.DocumentSetup.mount
 *
 *     `Modal.bind({ getEl })` must run before `installOn(proto)` is invoked
 *     against any prototype that will actually call these methods.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  // ---------------------------------------------------------------------------
  // (1) Phase 1 primitive: UI.overlays.Modal(host, props) factory.
  // ---------------------------------------------------------------------------

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

  // Preserve callable Modal(host, props) factory + attach Unit 1.7 namespace below.
  UI.overlays.Modal = create;

  // ---------------------------------------------------------------------------
  // (2) Meridian Unit 1.7: legacy mount wrappers extracted from _ui-legacy.js.
  // ---------------------------------------------------------------------------

  let DEPS = null;
  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Modal.${name} invoked before Modal.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  /**
   * Build the legacy #modal-overlay scaffold and append it to document.body.
   * Returns { overlay, titleEl, bodyEl } — stashed by the legacy UI ctor as
   * `this.modal` and consumed by openModal/closeModal.
   */
  function createModal() {
    requireDeps('createModal');
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div class="modal-title" id="modal-title"></div>
          <button class="modal-close" type="button" aria-label="Close modal">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const card = overlay.querySelector('.modal-card');
    const closeBtn = overlay.querySelector('.modal-close');
    const titleEl = overlay.querySelector('.modal-title');
    const bodyEl = overlay.querySelector('.modal-body');

    overlay.onclick = () => this.closeModal();
    card.onclick = (e) => e.stopPropagation();
    closeBtn.onclick = () => this.closeModal();

    return { overlay, titleEl, bodyEl };
  }

  function openModal({ title, body, cardClass = '', onClose = null }) {
    requireDeps('openModal');
    this._modalPrevFocus = document.activeElement || null;
    if (typeof this._modalCleanup === 'function') {
      const cleanup = this._modalCleanup;
      this._modalCleanup = null;
      cleanup();
    }
    this.modal.titleEl.textContent = title;
    this.modal.overlay.querySelector('.modal-card')?.setAttribute('class', `modal-card ${cardClass}`.trim());
    this.modal.bodyEl.innerHTML = '';
    if (typeof body === 'string') this.modal.bodyEl.innerHTML = body;
    else if (body instanceof Node) this.modal.bodyEl.appendChild(body);
    this._modalCleanup = typeof onClose === 'function' ? onClose : null;
    this.modal.overlay.classList.add('open');
    // Move focus to first focusable element in modal
    requestAnimationFrame(() => {
      const focusable = this.modal.overlay.querySelector('button, input, [tabindex="0"]');
      if (focusable) focusable.focus();
    });
  }

  function closeModal() {
    requireDeps('closeModal');
    this.modal.overlay.classList.remove('open');
    this.modal.overlay.querySelector('.modal-card')?.setAttribute('class', 'modal-card');
    if (typeof this._modalCleanup === 'function') {
      const cleanup = this._modalCleanup;
      this._modalCleanup = null;
      cleanup();
    }
    if (this._modalPrevFocus && typeof this._modalPrevFocus.focus === 'function') {
      this._modalPrevFocus.focus();
      this._modalPrevFocus = null;
    }
  }

  // Delegated to src/ui/modals/grid-settings.js (Phase 3 step 2).
  function _mountGridSettingsPanel() {
    requireDeps('_mountGridSettingsPanel');
    const host = document.querySelector('main');
    return window.Vectura.UI.Modals.GridSettings.mount(host);
  }

  // Delegated to src/ui/modals/document-setup.js (Phase 3 step 3).
  function _mountDocumentSetupPanel() {
    requireDeps('_mountDocumentSetupPanel');
    const host = document.querySelector('main');
    return window.Vectura.UI.Modals.DocumentSetup.mount(host);
  }

  // Attach Unit 1.7 surface to the (callable) Modal namespace.
  UI.overlays.Modal.bind = (deps) => { DEPS = deps; };
  UI.overlays.Modal.createModal = createModal;
  UI.overlays.Modal.openModal = openModal;
  UI.overlays.Modal.closeModal = closeModal;
  UI.overlays.Modal._mountGridSettingsPanel = _mountGridSettingsPanel;
  UI.overlays.Modal._mountDocumentSetupPanel = _mountDocumentSetupPanel;
  UI.overlays.Modal.installOn = (proto) => {
    proto.createModal = function () { return createModal.call(this); };
    proto.openModal = function (opts) { return openModal.call(this, opts); };
    proto.closeModal = function () { return closeModal.call(this); };
    proto._mountGridSettingsPanel = function () { return _mountGridSettingsPanel.call(this); };
    proto._mountDocumentSetupPanel = function () { return _mountDocumentSetupPanel.call(this); };
  };
})();
