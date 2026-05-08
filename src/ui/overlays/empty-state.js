/*
 * Vectura Studio — EmptyState component (Phase 1).
 *
 * Inline empty-state surface for "no layers yet", "no patterns saved", etc.
 * Mockup language: monochrome --ui-muted illustration + a one-line CTA.
 *
 * Despite living in `overlays/` in the migration plan, EmptyState is an
 * inline panel (not a floating overlay) — placed in this folder per the
 * plan's file map (§3 Phase 1).
 *
 * Props:
 *   illustration — optional inline-SVG string for the icon. Default null.
 *   title        — short heading.
 *   message      — detail body.
 *   cta          — { label, onClick } button. Optional.
 *
 * Returns: { el, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const create = (host, initialProps = {}) => {
    let props = Object.assign({}, initialProps);

    const el = document.createElement('div');
    el.className = 'vectura-empty-state';
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'display: flex', 'flex-direction: column',
      'align-items: center', 'justify-content: center',
      'gap: 8px', 'padding: 24px 16px',
      'color: var(--ui-muted, #888)',
      'font-family: var(--font-ui, system-ui)',
      'text-align: center',
    ].join(';');

    const illustration = document.createElement('div');
    illustration.className = 'vectura-empty-state-illustration';
    illustration.style.color = 'var(--ui-muted, #888)';
    el.appendChild(illustration);

    const title = document.createElement('div');
    title.className = 'vectura-empty-state-title';
    title.style.cssText = 'font-weight: 600; color: var(--ui-text-2, #ccc); font-size: 13px;';
    el.appendChild(title);

    const message = document.createElement('div');
    message.className = 'vectura-empty-state-message';
    message.style.cssText = 'font-size: var(--font-size-sm, 11px); max-width: 320px; line-height: 1.4;';
    el.appendChild(message);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'add-btn';
    cta.style.marginTop = '8px';

    let ctaHandler = null;
    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };

    const render = () => {
      illustration.innerHTML = props.illustration || '';
      illustration.style.display = props.illustration ? '' : 'none';
      title.textContent = props.title || '';
      title.style.display = props.title ? '' : 'none';
      message.textContent = props.message || '';
      message.style.display = props.message ? '' : 'none';
      if (props.cta && props.cta.label) {
        cta.textContent = props.cta.label;
        if (cta.parentNode !== el) el.appendChild(cta);
        if (ctaHandler) cta.removeEventListener('click', ctaHandler);
        ctaHandler = (event) => {
          if (props.cta && typeof props.cta.onClick === 'function') props.cta.onClick(event);
        };
        bind(cta, 'click', ctaHandler);
      } else if (cta.parentNode === el) {
        el.removeChild(cta);
      }
    };

    render();
    if (host) host.appendChild(el);

    return {
      el,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        render();
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.overlays.EmptyState = create;
})();
