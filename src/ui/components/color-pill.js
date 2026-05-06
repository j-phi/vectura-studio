/*
 * Vectura Studio — ColorPill component (Phase 1).
 *
 * The hex-pill button used to open a color picker (mockup `.color-thickness-pill`
 * / Phase 2 will rename to `.color-pill` once the new chrome lands). Displays
 * the current color value plus a small swatch, and exposes an `onOpen`
 * callback that the consumer wires to a modal/picker.
 *
 * Props:
 *   value       — '#rrggbb' string. Required.
 *   ariaLabel   — string for screen reader name.
 *   disabled    — boolean.
 *   onOpen(value, anchorEl) — invoked when the pill is clicked/Enter pressed.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  const normalizeHex = (input) => {
    if (typeof input !== 'string') return null;
    const m = input.trim().match(HEX_RE);
    if (!m) return null;
    let body = m[1];
    if (body.length === 3) body = body.split('').map((c) => c + c).join('');
    return ('#' + body).toLowerCase();
  };

  // Per WCAG: relative luminance to decide whether to outline with light or dark.
  const luminance = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const ch = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ disabled: false }, initialProps);
    const utils = UI.utils || {};
    let value = normalizeHex(props.value) || '#000000';

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'color-pill value-chip';
    if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);

    const swatch = document.createElement('span');
    swatch.className = 'color-pill-swatch';
    swatch.style.cssText = [
      'display: inline-block',
      'width: 12px; height: 12px',
      'border-radius: 50%',
      'border: 1px solid var(--ui-border, rgba(0,0,0,0.2))',
      'margin-right: 6px',
      'vertical-align: middle',
    ].join(';');
    el.appendChild(swatch);

    const label = document.createElement('span');
    label.className = 'color-pill-label';
    el.appendChild(label);

    const render = () => {
      label.textContent = value.toUpperCase();
      swatch.style.background = value;
      // Luma-aware outline: bright colors get a dark border, dark get a light one.
      const lum = luminance(value);
      el.classList.toggle('color-pill-on-dark', lum < 0.4);
      el.disabled = !!props.disabled;
      el.setAttribute('aria-label', props.ariaLabel ? `${props.ariaLabel} ${value}` : value);
    };

    const handleClick = (event) => {
      if (el.disabled) return;
      if (typeof props.onOpen === 'function') props.onOpen(value, el, event);
    };
    const handleKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick(event);
      }
    };
    const offClick = utils.on ? utils.on(el, 'click', handleClick) : (el.addEventListener('click', handleClick), () => el.removeEventListener('click', handleClick));
    const offKey = utils.on ? utils.on(el, 'keydown', handleKey) : (el.addEventListener('keydown', handleKey), () => el.removeEventListener('keydown', handleKey));

    render();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => value,
      setValue(next) {
        const v = normalizeHex(next);
        if (!v || v === value) return;
        value = v;
        render();
      },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.value != null) {
          const v = normalizeHex(newProps.value);
          if (v) value = v;
        }
        if (newProps && newProps.disabled != null) merged.disabled = !!newProps.disabled;
        props = merged;
        render();
      },
      destroy() {
        offClick(); offKey();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.ColorPill = create;
})();
