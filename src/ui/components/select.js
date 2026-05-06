/*
 * Vectura Studio — Select component (Phase 1).
 *
 * Wraps the mockup `.ctrl-sel-wrap` + `.ctrl-sel` markup. Uses a native
 * <select> element under the hood so platform UX (keyboard navigation,
 * type-ahead, mobile picker) is correct without re-implementing it.
 *
 * Props:
 *   options    — [{ value, label, disabled? }] OR [{ group, options: [...] }] for optgroups.
 *   value      — initial value.
 *   ariaLabel  — string.
 *   disabled   — boolean.
 *   onChange(value) — required.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ disabled: false }, initialProps);
    const utils = UI.utils || {};

    const el = document.createElement('div');
    el.className = 'ctrl-sel-wrap';

    const select = document.createElement('select');
    select.className = 'ctrl-sel';
    if (props.ariaLabel) select.setAttribute('aria-label', props.ariaLabel);
    el.appendChild(select);

    const buildOptions = () => {
      select.textContent = '';
      const list = Array.isArray(props.options) ? props.options : [];
      list.forEach((entry) => {
        if (entry && Array.isArray(entry.options)) {
          const grp = document.createElement('optgroup');
          grp.label = entry.group || '';
          entry.options.forEach((opt) => {
            const o = document.createElement('option');
            o.value = String(opt.value);
            o.textContent = opt.label || String(opt.value);
            if (opt.disabled) o.disabled = true;
            grp.appendChild(o);
          });
          select.appendChild(grp);
        } else if (entry) {
          const o = document.createElement('option');
          o.value = String(entry.value);
          o.textContent = entry.label || String(entry.value);
          if (entry.disabled) o.disabled = true;
          select.appendChild(o);
        }
      });
      if (props.value != null) select.value = String(props.value);
    };

    const handleChange = () => {
      if (typeof props.onChange === 'function') props.onChange(select.value);
    };
    const offChange = utils.on ? utils.on(select, 'change', handleChange) : (select.addEventListener('change', handleChange), () => select.removeEventListener('change', handleChange));

    select.disabled = !!props.disabled;
    buildOptions();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => select.value,
      setValue(next, { silent = false } = {}) {
        const v = String(next);
        if (select.value === v) return;
        select.value = v;
        if (!silent) handleChange();
      },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        const optionsChanged = newProps && Array.isArray(newProps.options);
        const valueChanged = newProps && 'value' in newProps;
        if (optionsChanged) props.options = newProps.options;
        if (valueChanged) props.value = newProps.value;
        if (newProps && newProps.disabled != null) select.disabled = !!newProps.disabled;
        if (newProps && newProps.ariaLabel) select.setAttribute('aria-label', newProps.ariaLabel);
        if (optionsChanged || valueChanged) buildOptions();
        props = merged;
      },
      destroy() {
        offChange();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.Select = create;
})();
