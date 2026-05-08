/*
 * Vectura Studio — NumStep component (Phase 1).
 *
 * Number stepper (mockup `.num-step`, `.num-step-btn`, `.num-step-inp`).
 * −/+ buttons step by `step`; arrow keys nudge in-input; wheel optional.
 *
 * Props:
 *   value     — initial number.
 *   min/max   — range bounds (optional; otherwise -Infinity..Infinity).
 *   step      — number; default 1.
 *   precision — decimals shown in the input. Default inferred from step.
 *   ariaLabel — string.
 *   disabled  — boolean.
 *   onChange(value) — required. Fires on commit (Enter / blur / button click).
 *
 * Returns: { el, update, destroy, getValue, setValue }
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

    const el = document.createElement('div');
    el.className = 'num-step';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'num-step-btn';
    decBtn.textContent = '−';
    decBtn.setAttribute('aria-label', 'Decrement');

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'num-step-inp';
    if (props.ariaLabel) input.setAttribute('aria-label', props.ariaLabel);

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'num-step-btn';
    incBtn.textContent = '+';
    incBtn.setAttribute('aria-label', 'Increment');

    el.appendChild(decBtn);
    el.appendChild(input);
    el.appendChild(incBtn);

    const clampValue = (v) => {
      const u = utils.clamp ? utils.clamp(v, props.min, props.max) : Math.min(Math.max(v, props.min), props.max);
      return Number(u.toFixed(props.precision));
    };

    const render = () => {
      input.value = value.toFixed(props.precision);
      decBtn.disabled = !!props.disabled || value <= props.min;
      incBtn.disabled = !!props.disabled || value >= props.max;
      input.disabled = !!props.disabled;
    };

    const commit = (next, fireChange = true) => {
      const v = clampValue(next);
      if (v === value) return;
      value = v;
      render();
      if (fireChange && typeof props.onChange === 'function') props.onChange(value);
    };

    const handleStep = (delta) => () => commit(value + delta * (props.step || 1));

    const handleKey = (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        commit(value + (event.shiftKey ? props.step * 10 : props.step));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        commit(value - (event.shiftKey ? props.step * 10 : props.step));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const parsed = parseFloat(input.value);
        if (Number.isFinite(parsed)) commit(parsed);
        else render();
        input.blur();
      }
    };
    const handleBlur = () => {
      const parsed = parseFloat(input.value);
      if (Number.isFinite(parsed)) commit(parsed);
      else render();
    };

    const offDec = utils.on ? utils.on(decBtn, 'click', handleStep(-1)) : (decBtn.addEventListener('click', handleStep(-1)), () => decBtn.removeEventListener('click', handleStep(-1)));
    const offInc = utils.on ? utils.on(incBtn, 'click', handleStep(1)) : (incBtn.addEventListener('click', handleStep(1)), () => incBtn.removeEventListener('click', handleStep(1)));
    const offKey = utils.on ? utils.on(input, 'keydown', handleKey) : (input.addEventListener('keydown', handleKey), () => input.removeEventListener('keydown', handleKey));
    const offBlur = utils.on ? utils.on(input, 'blur', handleBlur) : (input.addEventListener('blur', handleBlur), () => input.removeEventListener('blur', handleBlur));

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
        offDec(); offInc(); offKey(); offBlur();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.NumStep = create;
})();
