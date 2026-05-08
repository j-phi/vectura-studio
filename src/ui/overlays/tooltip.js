/*
 * Vectura Studio — Tooltip overlay (Phase 1).
 *
 * Lightweight hover-/focus-driven tooltip. Used by info-badge and any other
 * element that wants help text on hover. Long content can opt into a
 * "Read more" affordance that opens a modal — that linkage lives at the
 * info-badge layer; this overlay is content-agnostic.
 *
 * Public API:
 *   const tip = UI.overlays.Tooltip(host, props);
 *   tip.show(target, opts), tip.hide(), tip.update({...}), tip.destroy()
 *
 * Props:
 *   text            — string; required for show().
 *   placement       — 'top' | 'bottom' | 'left' | 'right'. Default 'top'.
 *   maxWidth        — px; default 240.
 *   delayShow       — ms hover delay before showing. Default 200.
 *   delayHide       — ms after pointerleave before hiding. Default 80.
 *
 * The overlay is a single root element that gets reused across show()/hide()
 * pairs. It positions relative to viewport using getBoundingClientRect() and
 * collides with viewport edges by flipping placement.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const DEFAULTS = { placement: 'top', maxWidth: 240, delayShow: 200, delayHide: 80 };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({}, DEFAULTS, initialProps);
    const ownerDoc = (host && host.ownerDocument) || document;

    const el = ownerDoc.createElement('div');
    el.className = 'vectura-tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.cssText = [
      'position: fixed',
      'z-index: 9999',
      'max-width: ' + props.maxWidth + 'px',
      'padding: 6px 10px',
      'background: var(--ui-panel, #252525)',
      'color: var(--ui-text, #e0e0e0)',
      'border: 1px solid var(--ui-border, #333)',
      'border-radius: var(--radius-sm, 4px)',
      'font-family: var(--font-ui, system-ui, sans-serif)',
      'font-size: var(--font-size-xs, 10px)',
      'line-height: 1.4',
      'pointer-events: none',
      'opacity: 0',
      'visibility: hidden',
      'transition: opacity 0.12s, visibility 0s linear 0.12s',
    ].join(';');
    (host || ownerDoc.body).appendChild(el);

    let showTimer = 0;
    let hideTimer = 0;
    let visible = false;
    let currentTarget = null;

    const reposition = () => {
      if (!currentTarget) return;
      const rect = currentTarget.getBoundingClientRect();
      const tipRect = el.getBoundingClientRect();
      const win = ownerDoc.defaultView || window;
      const vw = win.innerWidth || ownerDoc.documentElement.clientWidth || 1024;
      const vh = win.innerHeight || ownerDoc.documentElement.clientHeight || 768;
      const margin = 6;

      let placement = props.placement;
      let top = 0;
      let left = 0;

      const compute = (p) => {
        if (p === 'top') {
          top = rect.top - tipRect.height - margin;
          left = rect.left + (rect.width - tipRect.width) / 2;
        } else if (p === 'bottom') {
          top = rect.bottom + margin;
          left = rect.left + (rect.width - tipRect.width) / 2;
        } else if (p === 'left') {
          top = rect.top + (rect.height - tipRect.height) / 2;
          left = rect.left - tipRect.width - margin;
        } else if (p === 'right') {
          top = rect.top + (rect.height - tipRect.height) / 2;
          left = rect.right + margin;
        }
      };
      compute(placement);

      // Edge-flip if off-screen.
      if (top < 0 && placement === 'top') { placement = 'bottom'; compute(placement); }
      else if (top + tipRect.height > vh && placement === 'bottom') { placement = 'top'; compute(placement); }
      else if (left < 0 && placement === 'left') { placement = 'right'; compute(placement); }
      else if (left + tipRect.width > vw && placement === 'right') { placement = 'left'; compute(placement); }

      // Clamp horizontally so we don't run off either edge.
      if (left < margin) left = margin;
      if (left + tipRect.width > vw - margin) left = vw - margin - tipRect.width;
      if (top < margin) top = margin;

      el.style.top = top + 'px';
      el.style.left = left + 'px';
      el.dataset.placement = placement;
    };

    const reveal = () => {
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.style.transitionDelay = '0s';
      visible = true;
      reposition();
    };

    const conceal = () => {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      visible = false;
      currentTarget = null;
    };

    const show = (target, opts = {}) => {
      if (!target) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
      currentTarget = target;
      const delay = Number.isFinite(opts.delay) ? opts.delay : props.delayShow;
      el.textContent = (opts.text != null ? opts.text : props.text) || '';
      if (opts.maxWidth) el.style.maxWidth = opts.maxWidth + 'px';
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(reveal, delay);
    };

    const hide = (opts = {}) => {
      if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
      const delay = Number.isFinite(opts.delay) ? opts.delay : props.delayHide;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(conceal, delay);
    };

    return {
      el,
      show,
      hide,
      reposition,
      isVisible: () => visible,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        if (newProps && newProps.maxWidth) el.style.maxWidth = newProps.maxWidth + 'px';
      },
      destroy() {
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) clearTimeout(hideTimer);
        if (el.parentNode) el.parentNode.removeChild(el);
        currentTarget = null;
      },
    };
  };

  UI.overlays.Tooltip = create;
})();
