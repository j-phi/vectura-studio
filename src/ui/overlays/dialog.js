/*
 * Vectura Studio — Dialog overlay (Phase 1).
 *
 * Confirmation dialog built on top of UI.overlays.Modal. Renders message +
 * confirm/cancel buttons. Esc cancels.
 *
 * Public API:
 *   const dlg = UI.overlays.Dialog(host, props);
 *   dlg.open(), dlg.close(), dlg.destroy()
 *
 * Props:
 *   title          — string.
 *   message        — string body.
 *   confirmLabel   — default 'Confirm'.
 *   cancelLabel    — default 'Cancel'.
 *   destructive    — boolean; styles confirm in danger variant.
 *   onConfirm()    — required.
 *   onCancel()     — optional.
 *
 * Returns: { open, close, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const create = (host, initialProps = {}) => {
    let props = Object.assign({
      confirmLabel: 'Confirm', cancelLabel: 'Cancel', destructive: false,
    }, initialProps);

    let modal = null;
    let confirmBtn = null;
    let cancelBtn = null;
    // Tracks the action that triggered the next close so onClose doesn't
    // double-fire onCancel when a button already handled the dismissal.
    let lastAction = null;

    const renderBody = (body) => {
      const message = document.createElement('p');
      message.className = 'vectura-dialog-msg';
      message.textContent = props.message || '';
      body.appendChild(message);

      const footer = document.createElement('footer');
      footer.className = 'vectura-dialog-footer';

      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'hdr-btn';
      cancelBtn.textContent = props.cancelLabel;

      confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = props.destructive ? 'hdr-btn is-danger' : 'add-btn';
      confirmBtn.textContent = props.confirmLabel;

      cancelBtn.addEventListener('click', () => {
        lastAction = 'cancel';
        if (typeof props.onCancel === 'function') props.onCancel();
        if (modal) modal.close();
      });
      confirmBtn.addEventListener('click', () => {
        lastAction = 'confirm';
        if (typeof props.onConfirm === 'function') props.onConfirm();
        if (modal) modal.close();
      });

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);
      body.appendChild(footer);
    };

    if (UI.overlays.Modal) {
      modal = UI.overlays.Modal(host, {
        title: props.title,
        keyboard: true,
        dismissOnBackdrop: false,
        render: renderBody,
        onClose: () => {
          // Esc-driven (or programmatic) close with no preceding button click
          // still routes to onCancel as the conventional choice.
          const wasButton = lastAction !== null;
          lastAction = null;
          if (!wasButton && typeof props.onCancel === 'function') props.onCancel();
        },
      });
    }

    return {
      el: modal && modal.el,
      dialogEl: modal && modal.dialog,
      isOpen: () => modal && modal.isOpen(),
      open() { if (modal) modal.open(); },
      close() { if (modal) modal.close(); },
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        if (modal && newProps && newProps.title != null) modal.update({ title: newProps.title });
      },
      destroy() { if (modal) modal.destroy(); },
    };
  };

  UI.overlays.Dialog = create;
})();
