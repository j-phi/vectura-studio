/*
 * Vectura Studio — SwToggle component (Phase 1).
 *
 * The pill-style on/off switch from the mockup (`.sw-toggle` 30×16 px,
 * `.sw-track`, `.sw-thumb`). Wraps a hidden checkbox so form submission and
 * accessibility (Space/Enter, aria-checked) come for free.
 *
 * Props:
 *   checked        — boolean (initial). Default false.
 *   ariaLabel      — required string for screen-reader naming.
 *   disabled       — boolean. Default false.
 *   onChange(checked) — required callback.
 *
 * Returns: { el, update, destroy, getChecked, setChecked }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ checked: false, disabled: false }, initialProps);
    const utils = UI.utils || {};

    const el = document.createElement('label');
    el.className = 'sw-toggle';
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-checked', String(!!props.checked));
    if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!props.checked;
    input.disabled = !!props.disabled;
    el.appendChild(input);

    const track = document.createElement('span');
    track.className = 'sw-track';
    el.appendChild(track);

    const thumb = document.createElement('span');
    thumb.className = 'sw-thumb';
    el.appendChild(thumb);

    const sync = () => {
      el.setAttribute('aria-checked', String(input.checked));
      el.classList.toggle('is-checked', input.checked);
      el.classList.toggle('is-disabled', input.disabled);
    };

    const handleChange = () => {
      sync();
      if (typeof props.onChange === 'function') props.onChange(input.checked);
    };
    const handleKey = (event) => {
      if (input.disabled) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        input.checked = !input.checked;
        handleChange();
      }
    };
    const offChange = utils.on ? utils.on(input, 'change', handleChange) : (input.addEventListener('change', handleChange), () => input.removeEventListener('change', handleChange));
    const offKey = utils.on ? utils.on(el, 'keydown', handleKey) : (el.addEventListener('keydown', handleKey), () => el.removeEventListener('keydown', handleKey));
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;

    sync();
    if (host) host.appendChild(el);

    return {
      el,
      getChecked: () => input.checked,
      setChecked(next, { silent = false } = {}) {
        const v = !!next;
        if (input.checked === v) return;
        input.checked = v;
        sync();
        if (!silent && typeof props.onChange === 'function') props.onChange(v);
      },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.checked != null && newProps.checked !== input.checked) {
          input.checked = !!newProps.checked;
        }
        if (newProps && newProps.disabled != null) {
          input.disabled = !!newProps.disabled;
        }
        if (newProps && newProps.ariaLabel) {
          el.setAttribute('aria-label', newProps.ariaLabel);
        }
        sync();
        props = merged;
      },
      destroy() {
        offChange();
        offKey();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.SwToggle = create;
})();
