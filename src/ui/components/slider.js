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
 *   defaultValue — optional; double-click on the track resets to it
 *               (fires onChange + onCommit). Dual mode takes {min, max}.
 *               On touch, a long-press on the control's label opens "Reset to default"
 *               (TUX-038, UI.attachResetHold). The label is `labelEl`, or the host's only
 *               `.control-label`.
 *   labelEl   — optional element; the long-press reset target.
 *   format(v) — optional chip-text override (e.g. unit suffixes).
 *   parse(text) — optional chip-edit parser paired with format.
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

  // TUX-038: the iOS decimal pad has no minus key. A negative-capable chip (min < 0) and a dual chip
  // (its text holds a dash and two numbers) use the full keyboard. The legacy rangeDual editor in
  // algo-config-panel.js applies the same rule per input (see attachValueEditor there).
  const chipInputMode = (p) => ((p.dual || (Number.isFinite(p.min) && p.min < 0)) ? 'text' : 'decimal');

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
      chip.inputMode = chipInputMode(props);
      chip.enterKeyHint = 'done';
      chip.className = props.variant === 'pen' ? 'pen-w' : 'slider-val';
      chip.setAttribute('aria-label', `${props.ariaLabel || 'Value'}: numeric`);
      el.appendChild(chip);
    }

    const formatChip = (v) => {
      if (typeof props.format === 'function') return props.format(props.dual ? { min: v.min, max: v.max } : v);
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
      const parsed = typeof props.parse === 'function' ? props.parse(chip.value) : parseFloat(chip.value);
      if (!Number.isFinite(parsed)) { renderChip(); return; }
      const clamped = utils.clamp ? utils.clamp(parsed, props.min, props.max) : Math.min(Math.max(parsed, props.min), props.max);
      value = Number(clamped.toFixed(props.precision));
      slider.value = String(value);
      renderChip(); renderFill();
      fire('onChange', value);
      fire('onCommit', value);
    };

    // One reset for the mouse (dblclick) and for touch (label long-press menu, TUX-038).
    const doReset = () => {
      if (props.defaultValue == null) return;
      setValue(props.defaultValue);
      if (props.dual) {
        if (motion.triggerThumbRelease) motion.triggerThumbRelease(sliderMax);
      } else if (motion.triggerThumbRelease) {
        motion.triggerThumbRelease(slider);
      }
      if (motion.triggerSliderPulse) motion.triggerSliderPulse(wrap);
      fire('onCommit', props.dual ? { min: value.min, max: value.max } : value);
    };
    const onResetDblClick = (event) => {
      if (props.defaultValue == null) return;
      event.preventDefault();
      doReset();
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
      // touch-alt: TUX-038 label long-press opens "Reset to default" (UI.attachResetHold)
      bind(sliderMin, 'dblclick', onResetDblClick);
      bind(sliderMax, 'dblclick', onResetDblClick);
    } else {
      bind(slider, 'input', onSingleInput);
      bind(slider, 'change', onSingleChange);
      // touch-alt: TUX-038 label long-press opens "Reset to default" (UI.attachResetHold)
      bind(slider, 'dblclick', onResetDblClick);
    }
    if (typeof UI.attachResetHold === 'function') {
      const labelEl = UI.findResetLabel ? UI.findResetLabel(host, props.labelEl) : props.labelEl;
      if (labelEl) {
        offs.push(UI.attachResetHold(labelEl, {
          getDefault: () => props.defaultValue,
          reset: doReset,
          label: props.ariaLabel,
        }));
      }
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
        if (chip && newProps && newProps.min != null) chip.inputMode = chipInputMode(merged);
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

  /*
   * RangeTouch (TUX-043) — one delegated, document-level touch controller for EVERY
   * <input type="range"> (UI.Slider, bare sites in other panels, #draw-order-input).
   *
   * Policy: pointerType 'touch' and 'pen' are controlled; 'mouse' is never touched, so native
   * track-jump and the slider's dblclick reset keep working (also on an iPad trackpad).
   *   idle -> undecided (pointerdown) -> 'scroll' (mostly vertical past 8px, or pointercancel)
   *                                    -> 'drag'   (mostly sideways past 8px)
   * 'drag' moves the value RELATIVELY (start value + finger delta / track length), dispatches a
   * bubbling `input` per move and exactly one `change` on release. A tap or a scroll changes
   * nothing and dispatches nothing. Native (trusted) input/change events from the browser's own
   * range handling are restored and swallowed at window capture while a touch gesture is active
   * and for GUARD_MS after it (the native tap/click lands after pointerup). Pointer events are
   * never stopped or prevented, and touchstart is never cancelled (native momentum scroll and
   * the draw-order tap-to-play in shortcuts.js keep working).
   * Vertical ranges (writing-mode) swap axes. CSS: touch-action pan-y (pan-x vertical).
   */
  const RangeTouch = (() => {
    const LOCK_PX = 8;
    const GUARD_MS = 500;
    const state = { gesture: null };
    const held = new Map(); // range input -> { value, until }
    let selfDispatch = false;

    const isRange = (el) => !!el && el.tagName === 'INPUT' && el.type === 'range' && !el.disabled
      && !(el.closest && el.closest('[data-range-touch="off"]'));

    const groupOf = (el) => {
      if (!el.classList.contains('is-dual-min') && !el.classList.contains('is-dual-max')) return [el];
      const host = el.parentElement;
      const mn = host && host.querySelector('.is-dual-min');
      const mx = host && host.querySelector('.is-dual-max');
      return mn && mx ? [mn, mx] : [el];
    };

    const axisInfo = (el) => {
      const cs = getComputedStyle(el);
      const vertical = /^(vertical|sideways)/.test(cs.writingMode || '');
      const rtl = cs.direction === 'rtl';
      // The ::-webkit-slider-thumb computed width is unreliable (it can echo the input width), so the
      // CSS token drives the geometry. Outside the coarse block the legacy thumbs are ~14px.
      let thumb = parseFloat(cs.getPropertyValue('--touch-slider-thumb'));
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (!Number.isFinite(thumb) || thumb <= 0 || !coarse) thumb = coarse ? 28 : 14;
      const r = el.getBoundingClientRect();
      const len = Math.max(1, (vertical ? r.height : r.width) - thumb);
      return { vertical, rtl, thumb, len, rect: r };
    };

    const numeric = (el) => {
      const min = Number(el.min) || 0;
      const max = el.max === '' ? 100 : Number(el.max);
      const step = Number(el.step);
      return { min, max, step: Number.isFinite(step) && step > 0 ? step : 0 };
    };

    // Screen coordinate (along the primary axis) of an input's thumb centre.
    const thumbCoord = (el, info) => {
      const { min, max } = numeric(el);
      const frac = max === min ? 0 : (Number(el.value) - min) / (max - min);
      const f = info.rtl ? 1 - frac : frac;
      const origin = info.vertical ? info.rect.top : info.rect.left;
      return origin + info.thumb / 2 + f * info.len;
    };

    const snap = (el, raw) => {
      const { min, max, step } = numeric(el);
      let v = Math.min(max, Math.max(min, raw));
      if (step) {
        v = min + Math.round((v - min) / step) * step;
        const dot = String(step).indexOf('.');
        v = Number(v.toFixed(dot < 0 ? 0 : String(step).length - dot - 1));
        v = Math.min(max, Math.max(min, v));
      }
      return v;
    };

    const emit = (el, type) => {
      selfDispatch = true;
      try { el.dispatchEvent(new Event(type, { bubbles: true })); } finally { selfDispatch = false; }
    };

    const hold = (el, value, until) => { held.set(el, { value: String(value), until }); };
    const restore = (el) => {
      const h = held.get(el);
      if (h && el.value !== h.value) el.value = h.value;
    };

    // After release the hold stays for GUARD_MS: the browser's own tap/click handling lands after
    // pointerup. Nothing is restored on a timer, so a programmatic value set (undo, setValue)
    // right after a gesture is never clobbered; only trusted native events are intercepted.
    const releaseLater = (g) => {
      const until = performance.now() + GUARD_MS;
      g.group.forEach((el) => { const h = held.get(el); if (h) h.until = until; });
      setTimeout(() => {
        g.group.forEach((el) => {
          const h = held.get(el);
          if (h && performance.now() >= h.until) held.delete(el);
        });
      }, GUARD_MS + 40);
    };

    const onDown = (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      const el = e.target;
      if (!isRange(el)) return;
      if (state.gesture && state.gesture.id !== e.pointerId) return; // second finger: ignore
      releasePending();
      const group = groupOf(el);
      const g = {
        id: e.pointerId, origin: el, group, mode: 'undecided',
        x0: e.clientX, y0: e.clientY, info: axisInfo(el),
        chosen: null, startValue: 0, last: null, changed: false,
      };
      state.gesture = g;
      group.forEach((r) => hold(r, r.value, Infinity));
    };

    const lock = (g, e) => {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (Math.hypot(dx, dy) <= LOCK_PX) return;
      const along = Math.abs(g.info.vertical ? dy : dx);
      const across = Math.abs(g.info.vertical ? dx : dy);
      if (along < across) { g.mode = 'scroll'; return; }
      g.mode = 'drag';
      let chosen = g.origin;
      if (g.group.length === 2) {
        const [mn, mx] = g.group;
        const p0 = g.info.vertical ? g.y0 : g.x0;
        const dMin = Math.abs(thumbCoord(mn, g.info) - p0);
        const dMax = Math.abs(thumbCoord(mx, g.info) - p0);
        if (Math.abs(dMin - dMax) < 4) {
          const delta = (g.info.vertical ? dy : dx) * (g.info.rtl ? -1 : 1);
          chosen = delta >= 0 ? mx : mn;
        } else {
          chosen = dMin < dMax ? mn : mx;
        }
      }
      g.chosen = chosen;
      g.startValue = Number(chosen.value);
      g.last = g.startValue;
      try { g.origin.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer ids may not be capturable */ }
    };

    const onMove = (e) => {
      const g = state.gesture;
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'undecided') lock(g, e);
      if (g.mode !== 'drag') return;
      const info = g.info;
      const d = (info.vertical ? e.clientY - g.y0 : e.clientX - g.x0) * (info.rtl ? -1 : 1);
      const { min, max } = numeric(g.chosen);
      let v = snap(g.chosen, g.startValue + (d / info.len) * (max - min));
      if (g.group.length === 2) {
        const other = g.group[0] === g.chosen ? g.group[1] : g.group[0];
        const o = Number(other.value);
        v = g.chosen === g.group[0] ? Math.min(v, o) : Math.max(v, o);
      }
      if (v === g.last) return;
      g.last = v;
      g.chosen.value = String(v);
      hold(g.chosen, v, Infinity);
      emit(g.chosen, 'input');
    };

    // A cancelled sequence (the browser took the gesture to scroll) keeps its hold until the touch
    // sequence really ends: the trusted native `change` lands at touchend, after a long scroll,
    // far later than GUARD_MS. `pendingEnd` is released by touchend/touchcancel or the next
    // pointerdown; a long fallback timer stops a missed touchend from holding forever.
    const pendingEnd = new Set();
    const FALLBACK_MS = 8000;
    const releasePending = () => {
      pendingEnd.forEach((g) => releaseLater(g));
      pendingEnd.clear();
    };

    const finish = (e, cancelled) => {
      const g = state.gesture;
      if (!g || e.pointerId !== g.id) return;
      state.gesture = null;
      if (cancelled) {
        // Restore the pre-gesture value; the app only ever saw `input` events, so emit one input
        // with the restored value (none if it never left startValue) and NO change.
        if (g.mode === 'drag' && g.chosen) {
          const moved = g.last !== g.startValue;
          g.chosen.value = String(g.startValue);
          hold(g.chosen, g.startValue, Infinity);
          if (moved) emit(g.chosen, 'input');
        }
        g.group.forEach((r) => { restore(r); });
        const until = performance.now() + FALLBACK_MS;
        g.group.forEach((r) => { const h = held.get(r); if (h) h.until = until; });
        pendingEnd.add(g);
        try { g.origin.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
        return;
      }
      if (g.mode === 'drag' && g.last !== g.startValue) {
        g.chosen.value = String(g.last);
        hold(g.chosen, g.last, Infinity);
        emit(g.chosen, 'change');
      } else {
        g.group.forEach((r) => { if (r.value !== held.get(r)?.value) restore(r); });
      }
      releaseLater(g);
      try { g.origin.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
    };

    // Window capture runs before every per-element listener (slider.js and bare sites), so app
    // code never sees a value the controller did not produce.
    const guard = (e) => {
      if (selfDispatch || !e.isTrusted) return;
      const el = e.target;
      const h = held.get(el);
      if (!h || performance.now() > h.until) return;
      if (el.value !== h.value) el.value = h.value;
      e.stopImmediatePropagation();
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', (e) => finish(e, false), true);
    document.addEventListener('pointercancel', (e) => finish(e, true), true);
    document.addEventListener('touchend', releasePending, true);
    document.addEventListener('touchcancel', releasePending, true);
    window.addEventListener('input', guard, true);
    window.addEventListener('change', guard, true);

    return { state, held, LOCK_PX, GUARD_MS };
  })();
  UI.RangeTouch = RangeTouch;
})();
