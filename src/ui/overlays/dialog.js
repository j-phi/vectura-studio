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
 *
 * ── Prompt variant ────────────────────────────────────────────────────────
 * Text-input dialog (skinned window.prompt replacement). Same shell as
 * Dialog, plus a single-line input between message and footer. Enter
 * confirms, Esc cancels; the input is focused (existing text selected) on
 * open.
 *
 *   const dlg = UI.overlays.Prompt(host, props);
 *   dlg.open(), dlg.close(), dlg.destroy()
 *
 * Props:
 *   title          — string.
 *   message        — string body/label above the input.
 *   value          — initial input value. Default ''.
 *   placeholder    — input placeholder. Default ''.
 *   confirmLabel   — default 'OK'.
 *   cancelLabel    — default 'Cancel'.
 *   onConfirm(str) — required; receives the input's current value.
 *   onCancel()     — optional.
 *
 * Returns: { el, dialogEl, inputEl, isOpen, open, close, update, destroy }
 *
 * Convenience (async call sites replacing native window.prompt):
 *   UI.overlays.Prompt.show({ title, message, value, placeholder, … })
 *     → Promise<string|null> — resolves the entered string on OK/Enter,
 *       null on Cancel/Esc. Creates on document.body, self-destroys after
 *       the choice settles. Re-entrancy-safe: a second show() while one is
 *       open resolves the pending prompt with null before opening the next.
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

  // ---------------------------------------------------------------------------
  // Prompt — text-input dialog (window.prompt replacement).
  // ---------------------------------------------------------------------------

  const createPrompt = (host, initialProps = {}) => {
    let props = Object.assign({
      confirmLabel: 'OK', cancelLabel: 'Cancel', value: '', placeholder: '',
    }, initialProps);

    let modal = null;
    let confirmBtn = null;
    let cancelBtn = null;
    let inputEl = null;
    // Tracks the action that triggered the next close so onClose doesn't
    // double-fire onCancel when a button already handled the dismissal.
    let lastAction = null;

    const confirm = () => {
      lastAction = 'confirm';
      if (typeof props.onConfirm === 'function') props.onConfirm(inputEl ? inputEl.value : '');
      if (modal) modal.close();
    };
    const cancel = () => {
      lastAction = 'cancel';
      if (typeof props.onCancel === 'function') props.onCancel();
      if (modal) modal.close();
    };

    const renderBody = (body) => {
      const message = document.createElement('p');
      message.className = 'vectura-dialog-msg';
      message.textContent = props.message || '';
      body.appendChild(message);

      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'vectura-dialog-input';
      // No skin rule targets inputs inside .vectura-modal-body yet, so style
      // via tokens inline (same pattern as the Toast overlay primitive).
      inputEl.style.cssText = [
        'display: block', 'width: 100%', 'box-sizing: border-box',
        'margin: 0 0 16px',
        'padding: 7px 10px',
        'background: var(--ui-bg, #1a1a1c)',
        'color: var(--ui-text, #e0e0e0)',
        'border: 1px solid var(--ui-border, #333)',
        'border-radius: var(--radius-sm, 4px)',
        'font-family: var(--font-ui, system-ui, sans-serif)',
        'font-size: var(--font-size-sm, 11px)',
        'line-height: 1.4',
        'outline: none',
      ].join(';');
      inputEl.addEventListener('focus', () => { inputEl.style.borderColor = 'var(--ui-accent, #4e9ee1)'; });
      inputEl.addEventListener('blur', () => { inputEl.style.borderColor = 'var(--ui-border, #333)'; });
      inputEl.value = props.value != null ? `${props.value}` : '';
      if (props.placeholder) inputEl.placeholder = props.placeholder;
      if (props.message) inputEl.setAttribute('aria-label', props.message);
      // Enter confirms — stopPropagation so panel-level key handlers under
      // the backdrop never see it.
      inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          confirm();
        }
      });
      body.appendChild(inputEl);

      const footer = document.createElement('footer');
      footer.className = 'vectura-dialog-footer';

      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'hdr-btn';
      cancelBtn.textContent = props.cancelLabel;

      confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'add-btn';
      confirmBtn.textContent = props.confirmLabel;

      cancelBtn.addEventListener('click', cancel);
      confirmBtn.addEventListener('click', confirm);

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
        onOpen: () => {
          // Modal's own deferred focus lands on the input (first focusable).
          // Queue a second pass right after it to select the seeded text so
          // typing replaces it — matching native prompt ergonomics.
          const ownerDoc = (host && host.ownerDocument) || document;
          const win = ownerDoc.defaultView || window;
          win.setTimeout(() => {
            if (!inputEl || !modal || !modal.isOpen()) return;
            inputEl.focus();
            inputEl.select();
          }, 0);
        },
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
      inputEl,
      isOpen: () => modal && modal.isOpen(),
      open() { if (modal) modal.open(); },
      close() { if (modal) modal.close(); },
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        if (modal && newProps && newProps.title != null) modal.update({ title: newProps.title });
        if (inputEl && newProps && newProps.value != null) inputEl.value = `${newProps.value}`;
        if (inputEl && newProps && newProps.placeholder != null) inputEl.placeholder = newProps.placeholder;
      },
      destroy() { if (modal) modal.destroy(); },
    };
  };

  // Pending Prompt.show instance — a second show() while one is open settles
  // the first with null (cancel) so promises never dangle.
  let activePromptHandle = null;

  createPrompt.show = (props = {}) => new Promise((resolve) => {
    if (activePromptHandle) activePromptHandle.cancel();

    let settled = false;
    let inst = null;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (activePromptHandle && activePromptHandle.inst === inst) activePromptHandle = null;
      if (inst) inst.destroy();
      resolve(value);
    };

    inst = createPrompt(document.body, Object.assign({}, props, {
      onConfirm: (value) => settle(value),
      onCancel: () => settle(null),
    }));
    activePromptHandle = { inst, cancel: () => settle(null) };
    inst.open();
  });

  UI.overlays.Prompt = createPrompt;
})();
