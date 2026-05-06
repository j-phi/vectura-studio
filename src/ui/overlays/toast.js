/*
 * Vectura Studio — Toast overlay (Phase 1).
 *
 * Lightweight notification surface. Singleton container hosts a stack of
 * dismissable toasts. Use cases per plan §3 Phase 3: layer-add success,
 * project save/load result, export complete, error states.
 *
 * Public API:
 *   const toast = UI.overlays.Toast.show({ message, variant, duration });
 *   toast.dismiss()
 *
 * Props:
 *   message  — string. Required.
 *   variant  — 'info' | 'success' | 'warning' | 'danger'. Default 'info'.
 *   duration — ms before auto-dismiss. Default 4000. 0 disables.
 *   onClick(toast) — optional click handler.
 *
 * Returns: { el, dismiss, update }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const ROLE = {
    info: 'status',
    success: 'status',
    warning: 'alert',
    danger: 'alert',
  };

  const ensureContainer = (ownerDoc) => {
    let host = ownerDoc.getElementById('vectura-toast-host');
    if (host) return host;
    host = ownerDoc.createElement('div');
    host.id = 'vectura-toast-host';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Notifications');
    host.style.cssText = [
      'position: fixed', 'top: 16px', 'right: 16px',
      'display: flex', 'flex-direction: column', 'gap: 8px',
      'z-index: 9000', 'pointer-events: none',
    ].join(';');
    ownerDoc.body.appendChild(host);
    return host;
  };

  const show = (props) => {
    const ownerDoc = document;
    const variant = props && props.variant ? props.variant : 'info';
    const duration = props && Number.isFinite(props.duration) ? props.duration : 4000;
    const host = ensureContainer(ownerDoc);

    const el = ownerDoc.createElement('div');
    el.className = `vectura-toast vectura-toast-${variant}`;
    el.setAttribute('role', ROLE[variant] || 'status');
    el.setAttribute('aria-live', variant === 'danger' || variant === 'warning' ? 'assertive' : 'polite');
    el.style.cssText = [
      'pointer-events: auto',
      'padding: 8px 14px',
      'min-width: 200px', 'max-width: 320px',
      'background: var(--ui-panel, #252525)',
      'color: var(--ui-text, #e0e0e0)',
      'border: 1px solid var(--ui-border, #333)',
      'border-left: 3px solid var(--ui-accent, #4e9ee1)',
      'border-radius: var(--radius-sm, 4px)',
      'font-family: var(--font-ui, system-ui, sans-serif)',
      'font-size: var(--font-size-sm, 11px)',
      'line-height: 1.4',
      'box-shadow: 0 6px 24px rgba(0,0,0,0.35)',
      'cursor: pointer',
    ].join(';');
    el.textContent = (props && props.message) || '';
    host.appendChild(el);

    let dismissed = false;
    let timer = 0;
    let pausedAt = 0;
    let remaining = duration;
    let startedAt = Date.now();

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      if (el.parentNode) el.parentNode.removeChild(el);
    };

    const startAuto = () => {
      if (duration <= 0) return;
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    };

    const pause = () => {
      if (!timer) return;
      pausedAt = Date.now();
      remaining -= pausedAt - startedAt;
      clearTimeout(timer);
      timer = 0;
    };
    const resume = () => {
      if (timer || remaining <= 0 || dismissed) return;
      startAuto();
    };

    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focus', pause);
    el.addEventListener('blur', resume);
    el.addEventListener('click', () => {
      if (props && typeof props.onClick === 'function') props.onClick({ dismiss });
      dismiss();
    });

    startAuto();
    return {
      el,
      dismiss,
      update(newProps) {
        if (newProps && typeof newProps.message === 'string') el.textContent = newProps.message;
      },
    };
  };

  UI.overlays.Toast = { show };
})();
