/*
 * Vectura Studio — TogGrp component (Phase 1).
 *
 * Toggle button group (mockup `.tog-grp`, `.tog-btn`, `.tog-btn.active`).
 * Supports single-select (default) and multi-select via `multiple: true`.
 *
 * Props:
 *   options    — [{ value, label, ariaLabel? }]; required.
 *   value      — selected value (single) OR array (multi). Default: [] / null.
 *   multiple   — boolean. Default false.
 *   ariaLabel  — required, names the group.
 *   onChange(value) — receives string for single, array for multi.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ multiple: false }, initialProps);
    const utils = UI.utils || {};
    const opts = Array.isArray(props.options) ? props.options.slice() : [];

    let single = props.value != null && !Array.isArray(props.value) ? props.value : null;
    let multi = props.multiple
      ? (Array.isArray(props.value) ? props.value.slice() : [])
      : [];

    const el = document.createElement('div');
    el.className = 'tog-grp';
    el.setAttribute('role', props.multiple ? 'group' : 'radiogroup');
    if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);

    const buttons = [];
    const isActive = (val) => props.multiple
      ? multi.some((v) => String(v) === String(val))
      : String(single) === String(val);

    const build = () => {
      el.textContent = '';
      buttons.length = 0;
      opts.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tog-btn';
        btn.dataset.value = String(opt.value);
        btn.textContent = opt.label || String(opt.value);
        if (opt.ariaLabel) btn.setAttribute('aria-label', opt.ariaLabel);
        btn.setAttribute('role', props.multiple ? 'button' : 'radio');
        if (props.multiple) btn.setAttribute('aria-pressed', String(isActive(opt.value)));
        else btn.setAttribute('aria-checked', String(isActive(opt.value)));
        el.appendChild(btn);
        buttons.push(btn);
      });
    };

    const sync = () => {
      buttons.forEach((btn) => {
        const active = isActive(btn.dataset.value);
        btn.classList.toggle('active', active);
        if (props.multiple) btn.setAttribute('aria-pressed', String(active));
        else btn.setAttribute('aria-checked', String(active));
      });
    };

    const fire = () => {
      if (typeof props.onChange === 'function') {
        props.onChange(props.multiple ? multi.slice() : single);
      }
    };

    const setValue = (next, { silent = false } = {}) => {
      if (props.multiple) {
        const arr = Array.isArray(next) ? next.slice() : [];
        const sameLen = arr.length === multi.length;
        const same = sameLen && arr.every((v, i) => String(v) === String(multi[i]));
        multi = arr;
        sync();
        if (!same && !silent) fire();
      } else {
        if (String(single) === String(next)) return;
        single = next;
        sync();
        if (!silent) fire();
      }
    };

    const handleClick = (event) => {
      const btn = event.target.closest && event.target.closest('.tog-btn');
      if (!btn || !el.contains(btn)) return;
      const v = btn.dataset.value;
      if (props.multiple) {
        const idx = multi.findIndex((m) => String(m) === String(v));
        if (idx >= 0) multi.splice(idx, 1);
        else multi.push(v);
        sync();
        fire();
      } else {
        setValue(v);
      }
    };

    const offClick = utils.on ? utils.on(el, 'click', handleClick) : (el.addEventListener('click', handleClick), () => el.removeEventListener('click', handleClick));

    build();
    sync();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => (props.multiple ? multi.slice() : single),
      setValue,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        const optsChanged = newProps && Array.isArray(newProps.options);
        const modeChanged = newProps && newProps.multiple != null && !!newProps.multiple !== !!props.multiple;
        if (optsChanged) {
          opts.length = 0;
          newProps.options.forEach((o) => opts.push(o));
        }
        if (modeChanged) {
          props.multiple = !!newProps.multiple;
          el.setAttribute('role', props.multiple ? 'group' : 'radiogroup');
        }
        if (newProps && 'value' in newProps) {
          if (props.multiple) multi = Array.isArray(newProps.value) ? newProps.value.slice() : [];
          else single = newProps.value;
        }
        if (optsChanged || modeChanged) build();
        sync();
        props = merged;
      },
      destroy() {
        offClick();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.TogGrp = create;
})();
