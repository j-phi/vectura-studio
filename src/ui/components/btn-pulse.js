/*
 * Vectura Studio — BtnPulse component (Phase 1).
 *
 * A button that plays the .btn-pulse keyframe on click. Mockup parity:
 * `.menu-entry`, `.hdr-btn`, `.tab-btn`, `.tool-btn`, `.add-btn` all use the
 * .btn-pulse class for the press animation; this component is the canonical
 * factory that wires the trigger.
 *
 * Props:
 *   label    — button text (string).
 *   icon     — optional inner-HTML string for an inline SVG icon (left of label).
 *   variant  — 'default' (mockup `.hdr-btn`) | 'primary' (mockup `.add-btn`)
 *              | 'tool' (mockup `.tool-btn`, square). Default: 'default'.
 *   ariaLabel — optional aria-label override (e.g. icon-only buttons).
 *   disabled — boolean.
 *   onClick(event) — required.
 *
 * Returns: { el, update(newProps), destroy() }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const VARIANT_CLASS = {
    default: 'hdr-btn',
    primary: 'add-btn',
    tool: 'tool-btn',
  };

  const create = (host, initialProps = {}) => {
    const motion = (UI.motion && UI.motion.triggerBtnPulse) || (() => {});
    const utils = UI.utils || {};
    let props = Object.assign({ variant: 'default', disabled: false }, initialProps);

    const el = document.createElement('button');
    el.type = 'button';
    el.classList.add(VARIANT_CLASS[props.variant] || VARIANT_CLASS.default);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'btn-pulse-label';
    el.appendChild(labelSpan);

    const handleClick = (event) => {
      if (el.disabled) return;
      motion(el);
      if (typeof props.onClick === 'function') props.onClick(event);
    };
    const offClick = utils.on ? utils.on(el, 'click', handleClick) : (el.addEventListener('click', handleClick), () => el.removeEventListener('click', handleClick));

    const applyProps = (next) => {
      // variant — swap the active class (hdr-btn / add-btn / tool-btn) atomically.
      Object.values(VARIANT_CLASS).forEach((cls) => el.classList.remove(cls));
      el.classList.add(VARIANT_CLASS[next.variant] || VARIANT_CLASS.default);

      // label / icon
      labelSpan.textContent = next.label || '';
      // Remove any previous leading icon node before re-adding.
      const existingIcon = el.querySelector(':scope > .btn-pulse-icon');
      if (existingIcon) existingIcon.remove();
      if (next.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'btn-pulse-icon';
        iconSpan.innerHTML = next.icon;
        iconSpan.setAttribute('aria-hidden', 'true');
        el.insertBefore(iconSpan, labelSpan);
      }

      el.disabled = !!next.disabled;
      if (next.ariaLabel) {
        el.setAttribute('aria-label', next.ariaLabel);
      } else if (next.label) {
        el.removeAttribute('aria-label');
      }
    };

    applyProps(props);
    if (host) host.appendChild(el);

    return {
      el,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        applyProps(props);
      },
      destroy() {
        offClick();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.BtnPulse = create;
})();
