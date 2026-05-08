/*
 * Vectura Studio — Section component (Phase 1).
 *
 * Collapsible section with the mockup's left-accent bar (`.sect-hdr::before`,
 * 3×14 px, opacity 0.45 → 1 on hover) and a chevron arrow that rotates on
 * collapse. Mockup parity: sect (bordered container), sect-hdr (header
 * button), sect-arrow (chevron), sect-body (animated max-height body).
 *
 * The mockup uses `display: none` for collapse; per migration plan R-C1 this
 * component upgrades to an animated max-height transition (220 ms cubic-bezier
 * via --motion-panel-slide-*). Reduced motion shortens to ≤80 ms via
 * motion.css.
 *
 * Props:
 *   title          — string; section header label.
 *   collapsed      — boolean (initial). Default false.
 *   variant        — 'left' (default `.sect-hdr`) | 'right' (`.right-sect-hdr`).
 *   children       — function(bodyEl) called once during mount to populate the
 *                    body. Caller is responsible for any DOM inside the body.
 *   infoText       — optional info-badge tooltip text (slot for the small `i`).
 *   onToggle(open) — optional callback after the header is activated.
 *
 * Returns: { el, body, update, destroy, setCollapsed }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ collapsed: false, variant: 'left' }, initialProps);
    const utils = UI.utils || {};

    const el = document.createElement('section');
    el.className = 'sect';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = props.variant === 'right' ? 'right-sect-hdr' : 'sect-hdr';
    header.setAttribute('aria-expanded', String(!props.collapsed));

    const titleSpan = document.createElement('span');
    titleSpan.className = 'sect-hdr-title';
    titleSpan.textContent = props.title || '';
    header.appendChild(titleSpan);

    let infoInst = null;
    if (props.infoText && UI.InfoBadge) {
      infoInst = UI.InfoBadge(header, { text: props.infoText, placement: 'top' });
    }

    const arrow = document.createElement('span');
    arrow.className = 'sect-arrow' + (props.collapsed ? '' : ' down');
    arrow.setAttribute('aria-hidden', 'true');
    header.appendChild(arrow);

    const body = document.createElement('div');
    body.className = 'sect-body';
    body.style.overflow = 'hidden';
    if (props.collapsed) {
      body.style.maxHeight = '0px';
      body.style.padding = '0 var(--spacing-md, 12px)';
    }

    el.appendChild(header);
    el.appendChild(body);

    if (typeof props.children === 'function') {
      try { props.children(body); } catch (_) { /* surface in DOM via empty body */ }
    }

    const setCollapsed = (next, { animate = true } = {}) => {
      const collapsed = !!next;
      if (collapsed === !!props.collapsed) return;
      props.collapsed = collapsed;
      header.setAttribute('aria-expanded', String(!collapsed));
      arrow.classList.toggle('down', !collapsed);

      if (!animate || (utils.prefersReducedMotion && utils.prefersReducedMotion())) {
        body.style.transition = 'none';
        body.style.maxHeight = collapsed ? '0px' : '';
        body.style.padding = collapsed ? '0 var(--spacing-md, 12px)' : '';
        // Force reflow before re-enabling transition.
        // eslint-disable-next-line no-unused-expressions
        void body.offsetHeight;
        body.style.transition = '';
      } else {
        const dur = utils.cssVarPx ? '' : ''; // we read --motion-* via CSS itself
        body.style.transition = 'max-height var(--motion-panel-slide-dur, 220ms) var(--motion-panel-slide-ease, ease-out), padding var(--motion-panel-slide-dur, 220ms) var(--motion-panel-slide-ease, ease-out)';
        if (collapsed) {
          // From current scrollHeight to 0.
          body.style.maxHeight = body.scrollHeight + 'px';
          // eslint-disable-next-line no-unused-expressions
          void body.offsetHeight;
          body.style.maxHeight = '0px';
          body.style.padding = '0 var(--spacing-md, 12px)';
        } else {
          body.style.padding = '';
          body.style.maxHeight = body.scrollHeight + 'px';
          // After the transition lands, drop the inline cap so the body can
          // grow with content.
          const onEnd = (ev) => {
            if (ev.propertyName !== 'max-height') return;
            body.style.maxHeight = '';
            body.removeEventListener('transitionend', onEnd);
          };
          body.addEventListener('transitionend', onEnd);
        }
      }
      if (typeof props.onToggle === 'function') props.onToggle(!collapsed);
    };

    const handleHeaderClick = (ev) => {
      // Don't toggle if the click landed on the info badge (it has its own click handler).
      if (infoInst && infoInst.el && (ev.target === infoInst.el || infoInst.el.contains(ev.target))) return;
      setCollapsed(!props.collapsed);
    };
    const offClick = utils.on
      ? utils.on(header, 'click', handleHeaderClick)
      : (header.addEventListener('click', handleHeaderClick), () => header.removeEventListener('click', handleHeaderClick));

    if (host) host.appendChild(el);

    return {
      el,
      body,
      isCollapsed: () => !!props.collapsed,
      setCollapsed,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.title != null) titleSpan.textContent = newProps.title;
        if (newProps && newProps.variant && newProps.variant !== props.variant) {
          header.classList.toggle('sect-hdr', newProps.variant !== 'right');
          header.classList.toggle('right-sect-hdr', newProps.variant === 'right');
        }
        if (newProps && newProps.collapsed != null && newProps.collapsed !== props.collapsed) {
          setCollapsed(newProps.collapsed);
        }
        if (newProps && newProps.infoText != null && infoInst) {
          infoInst.update({ text: newProps.infoText });
        }
        props = merged;
      },
      destroy() {
        offClick();
        if (infoInst) infoInst.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.Section = create;
})();
