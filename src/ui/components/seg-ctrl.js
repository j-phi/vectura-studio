/*
 * Vectura Studio — SegCtrl component (Phase 1).
 *
 * Segmented control (mockup `.seg-ctrl`, `.seg-opt`, `.seg-opt.active`).
 * Single-select; arrow keys cycle, Home/End jump to first/last.
 *
 * Props:
 *   options    — array of { value, label, ariaLabel? }; required.
 *   value      — initial selected value. Falls back to options[0].value.
 *   ariaLabel  — required, names the segmented group.
 *   onChange(value) — required.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({}, initialProps);
    const utils = UI.utils || {};
    const opts = Array.isArray(props.options) ? props.options.slice() : [];
    let value = props.value != null ? props.value : (opts[0] && opts[0].value);

    const el = document.createElement('div');
    el.className = 'seg-ctrl';
    el.setAttribute('role', 'radiogroup');
    if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);

    const buttons = [];
    const buildButtons = () => {
      el.textContent = '';
      buttons.length = 0;
      opts.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-opt';
        btn.setAttribute('role', 'radio');
        btn.dataset.value = String(opt.value);
        btn.textContent = opt.label || String(opt.value);
        if (opt.ariaLabel) btn.setAttribute('aria-label', opt.ariaLabel);
        el.appendChild(btn);
        buttons.push(btn);
      });
    };

    const sync = () => {
      buttons.forEach((btn) => {
        const isActive = btn.dataset.value === String(value);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', String(isActive));
        btn.tabIndex = isActive ? 0 : -1;
      });
    };

    const setValue = (next, { silent = false } = {}) => {
      const found = opts.find((o) => String(o.value) === String(next));
      if (!found) return;
      const changed = String(found.value) !== String(value);
      value = found.value;
      sync();
      if (changed && !silent && typeof props.onChange === 'function') props.onChange(value);
    };

    const handleClick = (event) => {
      const btn = event.target.closest && event.target.closest('.seg-opt');
      if (!btn || !el.contains(btn)) return;
      const opt = opts.find((o) => String(o.value) === btn.dataset.value);
      if (opt) setValue(opt.value);
    };
    const handleKey = (event) => {
      const idx = opts.findIndex((o) => String(o.value) === String(value));
      if (idx < 0) return;
      let nextIdx = idx;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIdx = (idx + 1) % opts.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIdx = (idx - 1 + opts.length) % opts.length;
      else if (event.key === 'Home') nextIdx = 0;
      else if (event.key === 'End') nextIdx = opts.length - 1;
      else return;
      event.preventDefault();
      setValue(opts[nextIdx].value);
      const btn = buttons[nextIdx];
      if (btn) btn.focus();
    };

    const offClick = utils.on ? utils.on(el, 'click', handleClick) : (el.addEventListener('click', handleClick), () => el.removeEventListener('click', handleClick));
    const offKey = utils.on ? utils.on(el, 'keydown', handleKey) : (el.addEventListener('keydown', handleKey), () => el.removeEventListener('keydown', handleKey));

    buildButtons();
    sync();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => value,
      setValue,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && Array.isArray(newProps.options)) {
          opts.length = 0;
          newProps.options.forEach((o) => opts.push(o));
          buildButtons();
          if (!opts.find((o) => String(o.value) === String(value))) {
            value = opts[0] ? opts[0].value : null;
          }
        }
        if (newProps && newProps.value != null) setValue(newProps.value, { silent: true });
        sync();
        props = merged;
      },
      destroy() {
        offClick();
        offKey();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.SegCtrl = create;
})();
