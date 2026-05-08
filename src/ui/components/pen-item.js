/*
 * Vectura Studio — PenItem component (Phase 1).
 *
 * Mockup parity: `.pen-item` row > `.pen-dot` (color swatch),
 * `.pen-nm` (label), inline pen slider (3 px, `.pen-sld`) for thickness,
 * and `.pen-w` value chip. Composes UI.Slider in pen variant.
 *
 * Props:
 *   id          — unique pen id (surfaced via dataset).
 *   label       — short pen tag e.g. "P1".
 *   color       — '#rrggbb'.
 *   weight      — current line weight (number).
 *   weightMin / weightMax / weightStep — slider bounds. Default 0.05/2/0.05.
 *   onColorClick(id) — opens the color picker (consumer wires the modal).
 *   onWeightChange(weight, id) — fires during drag.
 *   onWeightCommit(weight, id) — fires on release.
 *
 * Returns: { el, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({
      weightMin: 0.05, weightMax: 2, weightStep: 0.05, weight: 0.4, color: '#000000',
    }, initialProps);
    const utils = UI.utils || {};

    const el = document.createElement('div');
    el.className = 'pen-item';
    el.dataset.penId = String(props.id || '');

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'pen-dot';
    dot.setAttribute('aria-label', `Pen ${props.label || props.id} color`);
    el.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'pen-nm';
    el.appendChild(label);

    let sliderInst = null;
    if (UI.Slider) {
      sliderInst = UI.Slider(el, {
        ariaLabel: `Pen ${props.label || props.id} weight`,
        variant: 'pen',
        value: props.weight,
        min: props.weightMin, max: props.weightMax, step: props.weightStep,
        onChange: (v) => {
          if (typeof props.onWeightChange === 'function') props.onWeightChange(v, props.id);
        },
        onCommit: (v) => {
          if (typeof props.onWeightCommit === 'function') props.onWeightCommit(v, props.id);
        },
      });
    }

    const render = () => {
      dot.style.background = props.color || '#000';
      label.textContent = props.label || (props.id != null ? `P${props.id}` : '');
    };

    const handleDotClick = () => {
      if (typeof props.onColorClick === 'function') props.onColorClick(props.id);
    };
    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };
    bind(dot, 'click', handleDotClick);

    render();
    if (host) host.appendChild(el);

    return {
      el,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        props = merged;
        if (newProps && newProps.id != null) el.dataset.penId = String(newProps.id);
        if (sliderInst && newProps && (newProps.weight != null || newProps.weightMin != null || newProps.weightMax != null || newProps.weightStep != null)) {
          sliderInst.update({
            value: newProps.weight != null ? newProps.weight : props.weight,
            min: newProps.weightMin != null ? newProps.weightMin : props.weightMin,
            max: newProps.weightMax != null ? newProps.weightMax : props.weightMax,
            step: newProps.weightStep != null ? newProps.weightStep : props.weightStep,
          });
        }
        render();
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (sliderInst) sliderInst.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.PenItem = create;
})();
