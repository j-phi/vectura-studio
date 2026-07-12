/*
 * Vectura Studio — AngleDial component (Phase 1).
 *
 * Mockup parity: `.angle-ctrl` (row) > `.angle-dial` (38×38 SVG) +
 * `.angle-inp-wrap` (input + ° unit). Pointer drag updates the angle;
 * release plays the dial-wave halo via UI.motion.triggerDialWave — an rAF
 * expanding ring that originates from the handle's current position (where
 * the drag/reset just landed), clipped to the dial's outer ring so it never
 * escapes the dial face even when it starts near the edge.
 *
 * Geometry: 0° points up (-y); positive angles rotate clockwise. Display
 * normalizes to [0, 360). Internally the value can pass through full
 * revolutions if `props.allowOverflow` is true.
 *
 * Props:
 *   value       — number (degrees).
 *   ariaLabel   — string.
 *   onChange(v) — fires on every drag step.
 *   onCommit(v) — fires on pointerup / Enter.
 *   allowOverflow — boolean. Default false (wraps).
 *   defaultValue — optional; double-click on the dial resets to it.
 *
 * The dial SVG itself is keyboard-operable: arrows nudge (Shift ×10),
 * Home returns to 0°.
 *
 * Returns: { el, dialEl, inputEl, getValue, setValue, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const NS = 'http://www.w3.org/2000/svg';
  const SIZE = 38;
  const CENTER = SIZE / 2;
  const RING_R = 16;
  const HANDLE_R = 2.4;

  const wrap360 = (deg) => {
    let v = deg % 360;
    if (v < 0) v += 360;
    return v;
  };

  const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));

  // Folds `deg` into the descriptor's real [min, max] domain instead of the
  // hardcoded [0, 360) that wrap360() always produced. Full-circle domains
  // (max - min >= 360, e.g. the default 0..360 or an explicit -180..180) use a
  // plain modular fold and are byte-identical to the old wrap360() behavior
  // when min=0,max=360. Narrower (half-circle-or-less) domains, e.g. -90..90,
  // can legitimately receive input outside [min, max] (a drag/nudge into the
  // dial's "back half" dead zone) — fold to a candidate and also try its ±360
  // twins, keeping whichever needs the smallest clamp adjustment into
  // [min, max] so dead-zone input saturates to the nearest valid edge rather
  // than jumping to the wrong extreme.
  const wrapToDomain = (deg, min = 0, max = 360) => {
    const span = max - min;
    if (!Number.isFinite(span) || span <= 0) return deg;
    if (span >= 360) {
      return ((deg - min) % span + span) % span + min;
    }
    const folded = ((deg - min) % 360 + 360) % 360 + min;
    const candidates = [folded - 360, folded, folded + 360];
    let best = candidates[0];
    let bestAdj = Math.abs(clampNum(candidates[0], min, max) - candidates[0]);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const adj = Math.abs(clampNum(c, min, max) - c);
      if (adj < bestAdj) {
        best = c;
        bestAdj = adj;
      }
    }
    return clampNum(best, min, max);
  };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ allowOverflow: false, min: 0, max: 360 }, initialProps);
    const utils = UI.utils || {};
    const motion = UI.motion || {};
    let value = Number.isFinite(props.value) ? props.value : 0;

    const el = document.createElement('div');
    el.className = 'angle-ctrl';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'angle-dial');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width', String(SIZE));
    svg.setAttribute('height', String(SIZE));
    svg.setAttribute('role', 'slider');
    svg.setAttribute('aria-valuemin', String(props.min));
    svg.setAttribute('aria-valuemax', String(props.max));
    svg.tabIndex = 0;

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'dial-ring');
    ring.setAttribute('cx', String(CENTER));
    ring.setAttribute('cy', String(CENTER));
    ring.setAttribute('r', String(RING_R));
    svg.appendChild(ring);

    const ringInner = document.createElementNS(NS, 'circle');
    ringInner.setAttribute('class', 'dial-ring-inner');
    ringInner.setAttribute('cx', String(CENTER));
    ringInner.setAttribute('cy', String(CENTER));
    ringInner.setAttribute('r', String(RING_R - 4));
    svg.appendChild(ringInner);

    const needle = document.createElementNS(NS, 'line');
    needle.setAttribute('class', 'dial-needle');
    needle.setAttribute('x1', String(CENTER));
    needle.setAttribute('y1', String(CENTER));
    svg.appendChild(needle);

    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('class', 'dial-center');
    center.setAttribute('cx', String(CENTER));
    center.setAttribute('cy', String(CENTER));
    center.setAttribute('r', '2');
    svg.appendChild(center);

    const handle = document.createElementNS(NS, 'circle');
    handle.setAttribute('class', 'dial-handle');
    handle.setAttribute('r', String(HANDLE_R));
    svg.appendChild(handle);

    el.appendChild(svg);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'angle-inp-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'angle-inp';
    input.setAttribute('aria-label', props.ariaLabel ? `${props.ariaLabel} (degrees)` : 'Angle (degrees)');
    inputWrap.appendChild(input);
    const unit = document.createElement('span');
    unit.className = 'angle-unit';
    unit.textContent = '°';
    inputWrap.appendChild(unit);
    el.appendChild(inputWrap);

    const computePoint = (deg) => {
      // 0° points up.
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: CENTER + RING_R * Math.cos(rad), y: CENTER + RING_R * Math.sin(rad) };
    };

    const render = () => {
      const { min, max } = props;
      const display = props.allowOverflow ? value : wrapToDomain(value, min, max);
      const { x, y } = computePoint(display);
      needle.setAttribute('x2', String(x));
      needle.setAttribute('y2', String(y));
      handle.setAttribute('cx', String(x));
      handle.setAttribute('cy', String(y));
      input.value = Math.round(display).toString();
      svg.setAttribute('aria-valuenow', String(Math.round(display)));
      svg.setAttribute('aria-valuemin', String(min));
      svg.setAttribute('aria-valuemax', String(max));
    };

    const fire = (channel, v) => {
      const fn = props[channel];
      if (typeof fn === 'function') fn(v);
    };

    // Wave originates from the handle's current position (where the drag/
    // reset just landed), not the dial center — clipped to the outer ring so
    // it never visually escapes the dial face even when it starts near the
    // edge.
    const triggerWave = () => {
      if (!motion.triggerDialWave) return;
      const hx = parseFloat(handle.getAttribute('cx'));
      const hy = parseFloat(handle.getAttribute('cy'));
      motion.triggerDialWave(svg, hx, hy, { clipCx: CENTER, clipCy: CENTER, clipR: RING_R });
    };

    const setValue = (next, { silent = false } = {}) => {
      const v = props.allowOverflow ? Number(next) : wrapToDomain(Number(next), props.min, props.max);
      if (!Number.isFinite(v)) return;
      const changed = v !== value;
      value = v;
      render();
      if (changed && !silent) fire('onChange', value);
    };

    let dragging = false;
    const onPointerDown = (event) => {
      dragging = true;
      svg.classList.add('is-dragging');
      try { svg.setPointerCapture(event.pointerId); } catch (_) {}
      handlePointer(event);
    };
    const handlePointer = (event) => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      setValue(deg);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      handlePointer(event);
    };
    const onPointerUp = (event) => {
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('is-dragging');
      try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
      triggerWave();
      fire('onCommit', value);
    };

    const onInputKey = (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setValue(value + (event.shiftKey ? 10 : 1));
        fire('onCommit', value);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setValue(value - (event.shiftKey ? 10 : 1));
        fire('onCommit', value);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const parsed = parseFloat(input.value);
        if (Number.isFinite(parsed)) setValue(parsed);
        fire('onCommit', value);
        input.blur();
      } else if (event.key === 'Escape') {
        render();
        input.blur();
      }
    };
    const onInputBlur = () => {
      const parsed = parseFloat(input.value);
      if (Number.isFinite(parsed)) {
        setValue(parsed);
        fire('onCommit', value);
      } else {
        render();
      }
    };

    const onDialKey = (event) => {
      const step = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault();
        setValue(value + step);
        fire('onCommit', value);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setValue(value - step);
        fire('onCommit', value);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setValue(0);
        fire('onCommit', value);
      }
    };

    const onDialDblClick = (event) => {
      if (props.defaultValue == null) return;
      event.preventDefault();
      setValue(props.defaultValue);
      triggerWave();
      fire('onCommit', value);
    };

    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };
    bind(svg, 'pointerdown', onPointerDown);
    bind(svg, 'pointermove', onPointerMove);
    bind(svg, 'pointerup', onPointerUp);
    bind(svg, 'pointercancel', onPointerUp);
    bind(svg, 'keydown', onDialKey);
    bind(svg, 'dblclick', onDialDblClick);
    bind(input, 'keydown', onInputKey);
    bind(input, 'blur', onInputBlur);

    render();
    if (host) host.appendChild(el);

    return {
      el,
      dialEl: svg,
      inputEl: input,
      getValue: () => (props.allowOverflow ? value : wrapToDomain(value, props.min, props.max)),
      setValue,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        props = merged;
        if (newProps && newProps.value != null) setValue(newProps.value, { silent: true });
        else render();
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.AngleDial = create;
})();
