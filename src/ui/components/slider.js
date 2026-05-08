/*
 * Vectura Studio — Slider component (Phase 1).
 *
 * Wraps the mockup's `.slider-row` + `.sld-fx-wrap` + `.ctrl-slider` markup
 * (or `.pen-sld` when variant === 'pen'). Drives:
 *   - the gradient fill (--fill CSS var)
 *   - the thumb-release halo (.just-released → motion.css keyframe)
 *   - the side-pulse fx-active wrap (sld-fx-wrap.fx-active)
 *   - an optional inline editable value chip (.slider-val)
 *
 * Modes:
 *   single (default) — one <input type="range"> + value chip.
 *   dual             — `props.dual: true`, two thumbs with a min/max pair.
 *
 * Props (single):
 *   value     — number.
 *   min, max  — range.
 *   step      — number; default 1.
 *   precision — decimals shown in chip; inferred from step.
 *   ariaLabel — required.
 *   variant   — 'main' (default, 4 px) | 'pen' (3 px).
 *   showChip  — boolean; default true. Hide for inline pen rows that share
 *               the chip with another control.
 *   onChange(value) — fires on every input event during drag.
 *   onCommit(value) — fires on release (change/pointerup/blur).
 *
 * Props (dual):
 *   value     — { min, max } pair.
 *   onChange / onCommit receive the same shape.
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
    let props = Object.assign({
      min: 0, max: 100, step: 1, variant: 'main', dual: false, showChip: true,
    }, initialProps);
    if (props.precision == null) props.precision = inferPrecision(props.step);
    const utils = UI.utils || {};
    const motion = UI.motion || {};

    let value = props.dual
      ? Object.assign({ min: props.min, max: props.max }, props.value || {})
      : (Number.isFinite(props.value) ? props.value : props.min);

    const el = document.createElement('div');
    el.className = 'slider-row';

    const wrap = document.createElement('div');
    wrap.className = 'sld-fx-wrap';
    el.appendChild(wrap);

    const sliderClass = props.variant === 'pen' ? 'pen-sld' : 'ctrl-slider';

    let chip = null;
    if (props.showChip) {
      chip = document.createElement('input');
      chip.type = 'text';
      chip.inputMode = 'decimal';
      chip.className = props.variant === 'pen' ? 'pen-w' : 'slider-val';
      chip.setAttribute('aria-label', `${props.ariaLabel || 'Value'}: numeric`);
      el.appendChild(chip);
    }

    const formatChip = (v) => {
      if (props.dual) return `${v.min.toFixed(props.precision)} – ${v.max.toFixed(props.precision)}`;
      return v.toFixed(props.precision);
    };
    const updateFill = (slider) => {
      const min = Number(slider.min);
      const max = Number(slider.max);
      const v = Number(slider.value);
      const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
      slider.style.setProperty('--fill', pct + '%');
      wrap.style.setProperty('--fill', pct + '%');
    };

    const buildSingle = () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = sliderClass;
      slider.min = String(props.min);
      slider.max = String(props.max);
      slider.step = String(props.step);
      slider.value = String(value);
      slider.setAttribute('aria-label', props.ariaLabel || 'Slider');
      wrap.appendChild(slider);
      return slider;
    };

    const slider = props.dual ? null : buildSingle();
    let sliderMin = null;
    let sliderMax = null;
    if (props.dual) {
      sliderMin = document.createElement('input');
      sliderMin.type = 'range';
      sliderMin.className = sliderClass + ' is-dual-min';
      sliderMin.min = String(props.min); sliderMin.max = String(props.max); sliderMin.step = String(props.step);
      sliderMin.value = String(value.min);
      sliderMin.setAttribute('aria-label', `${props.ariaLabel || 'Range'} (min)`);
      sliderMax = document.createElement('input');
      sliderMax.type = 'range';
      sliderMax.className = sliderClass + ' is-dual-max';
      sliderMax.min = String(props.min); sliderMax.max = String(props.max); sliderMax.step = String(props.step);
      sliderMax.value = String(value.max);
      sliderMax.setAttribute('aria-label', `${props.ariaLabel || 'Range'} (max)`);
      wrap.appendChild(sliderMin);
      wrap.appendChild(sliderMax);
    }

    const renderChip = () => { if (chip) chip.value = formatChip(value); };

    const renderFill = () => {
      if (props.dual) { updateFill(sliderMin); updateFill(sliderMax); }
      else { updateFill(slider); }
    };

    const fire = (channel, payload) => {
      const fn = props[channel];
      if (typeof fn === 'function') fn(payload);
    };

    const onSingleInput = () => {
      const v = Number(slider.value);
      value = v;
      renderChip(); renderFill();
      fire('onChange', v);
    };
    const onSingleChange = () => {
      if (motion.triggerThumbRelease) motion.triggerThumbRelease(slider);
      if (motion.triggerSliderPulse) motion.triggerSliderPulse(wrap);
      fire('onCommit', value);
    };

    const enforceDual = () => {
      const min = Math.min(Number(sliderMin.value), Number(sliderMax.value));
      const max = Math.max(Number(sliderMin.value), Number(sliderMax.value));
      sliderMin.value = String(min);
      sliderMax.value = String(max);
      value = { min, max };
    };

    const onDualInput = () => {
      enforceDual();
      renderChip(); renderFill();
      fire('onChange', { min: value.min, max: value.max });
    };
    const onDualChange = (which) => () => {
      if (motion.triggerThumbRelease) motion.triggerThumbRelease(which);
      if (motion.triggerSliderPulse) motion.triggerSliderPulse(wrap);
      fire('onCommit', { min: value.min, max: value.max });
    };

    const onChipKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        chip.blur();
      } else if (event.key === 'Escape') {
        renderChip();
        chip.blur();
      }
    };
    const onChipBlur = () => {
      if (props.dual) { renderChip(); return; }
      const parsed = parseFloat(chip.value);
      if (!Number.isFinite(parsed)) { renderChip(); return; }
      const clamped = utils.clamp ? utils.clamp(parsed, props.min, props.max) : Math.min(Math.max(parsed, props.min), props.max);
      value = Number(clamped.toFixed(props.precision));
      slider.value = String(value);
      renderChip(); renderFill();
      fire('onChange', value);
      fire('onCommit', value);
    };

    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };

    if (props.dual) {
      bind(sliderMin, 'input', onDualInput);
      bind(sliderMax, 'input', onDualInput);
      bind(sliderMin, 'change', onDualChange(sliderMin));
      bind(sliderMax, 'change', onDualChange(sliderMax));
    } else {
      bind(slider, 'input', onSingleInput);
      bind(slider, 'change', onSingleChange);
    }
    if (chip) {
      bind(chip, 'keydown', onChipKey);
      bind(chip, 'blur', onChipBlur);
    }

    renderChip();
    renderFill();
    if (host) host.appendChild(el);

    const setValue = (next, { silent = false } = {}) => {
      if (props.dual) {
        const min = Math.min(Number(next.min), Number(next.max));
        const max = Math.max(Number(next.min), Number(next.max));
        value = { min, max };
        sliderMin.value = String(min); sliderMax.value = String(max);
      } else {
        const v = Number(next);
        if (!Number.isFinite(v)) return;
        value = v;
        slider.value = String(v);
      }
      renderChip(); renderFill();
      if (!silent) {
        fire('onChange', props.dual ? { min: value.min, max: value.max } : value);
      }
    };

    return {
      el,
      getValue: () => (props.dual ? { min: value.min, max: value.max } : value),
      setValue,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && newProps.step != null && newProps.precision == null) {
          merged.precision = inferPrecision(newProps.step);
        }
        // Re-attach inputs' min/max/step if changed.
        if (newProps && (newProps.min != null || newProps.max != null || newProps.step != null)) {
          const list = props.dual ? [sliderMin, sliderMax] : [slider];
          list.forEach((s) => {
            if (newProps.min != null) s.min = String(newProps.min);
            if (newProps.max != null) s.max = String(newProps.max);
            if (newProps.step != null) s.step = String(newProps.step);
          });
        }
        if (newProps && 'value' in newProps) {
          props = merged;
          setValue(newProps.value, { silent: true });
        } else {
          props = merged;
          renderChip(); renderFill();
        }
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.Slider = create;
})();
