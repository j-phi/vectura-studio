/*
 * Vectura Studio — NumberInput component (Phase 1).
 *
 * A bare numeric input styled like the mockup's `.ctrl-inp`. Differs from
 * NumStep by NOT showing −/+ steppers; useful in dense rows where the
 * stepper buttons would crowd the layout.
 *
 * Props:
 *   value     — number.
 *   min, max  — clamp on commit. Optional.
 *   step      — used by ArrowUp/Down nudges and precision inference.
 *   precision — decimals; inferred from step.
 *   ariaLabel — string.
 *   placeholder — string.
 *   disabled  — boolean.
 *   onChange(value) — fires on Enter / blur / arrow nudges.
 *
 * Returns: { el, update, destroy, getValue, setValue, focus }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const inferPrecision = (step) => {
    if (!Number.isFinite(step) || step === 0) return 0;
    const txt = String(step);
    const dot = txt.indexOf('.');
    return dot < 0 ? 0 : txt.length - dot - 1;
  };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ step: 1, min: -Infinity, max: Infinity, disabled: false }, initialProps);
    if (props.precision == null) props.precision = inferPrecision(props.step);
    const utils = UI.utils || {};
    let value = Number.isFinite(props.value) ? props.value : 0;

    const el = document.createElement('input');
    el.type = 'text';
    el.inputMode = 'decimal';
    el.className = 'ctrl-inp';
    if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);
    if (props.placeholder) el.placeholder = props.placeholder;

    const clampValue = (v) => {
      const u = utils.clamp ? utils.clamp(v, props.min, props.max) : Math.min(Math.max(v, props.min), props.max);
      return Number(u.toFixed(props.precision));
    };
    const render = () => {
      el.value = value.toFixed(props.precision);
      el.disabled = !!props.disabled;
    };
    const commit = (next, fire = true) => {
      const v = clampValue(next);
      if (v === value) { render(); return; }
      value = v;
      render();
      if (fire && typeof props.onChange === 'function') props.onChange(value);
    };

    const handleKey = (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        commit(value + (event.shiftKey ? props.step * 10 : props.step));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        commit(value - (event.shiftKey ? props.step * 10 : props.step));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const parsed = parseFloat(el.value);
        if (Number.isFinite(parsed)) commit(parsed);
        else render();
        el.blur();
      } else if (event.key === 'Escape') {
        render();
        el.blur();
      }
    };
    const handleBlur = () => {
      const parsed = parseFloat(el.value);
      if (Number.isFinite(parsed)) commit(parsed);
      else render();
    };
    const offKey = utils.on ? utils.on(el, 'keydown', handleKey) : (el.addEventListener('keydown', handleKey), () => el.removeEventListener('keydown', handleKey));
    const offBlur = utils.on ? utils.on(el, 'blur', handleBlur) : (el.addEventListener('blur', handleBlur), () => el.removeEventListener('blur', handleBlur));

    render();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => value,
      setValue(next, { silent = false } = {}) {
        const v = clampValue(next);
        if (v === value) return;
        value = v;
        render();
        if (!silent && typeof props.onChange === 'function') props.onChange(value);
      },
      focus() { el.focus(); },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.step != null && newProps.precision == null) {
          merged.precision = inferPrecision(newProps.step);
        }
        props = merged;
        if (newProps && newProps.value != null && Number.isFinite(newProps.value)) {
          value = clampValue(newProps.value);
        } else {
          value = clampValue(value);
        }
        render();
      },
      destroy() {
        offKey(); offBlur();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.NumberInput = create;
})();
