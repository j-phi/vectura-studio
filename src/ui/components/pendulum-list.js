/*
 * Vectura Studio — PendulumList component (Phase 1).
 *
 * Editable list of pendulums for the harmonograph algorithm. Each pendulum
 * exposes { frequency, phase, decay, amplitude }; the consumer provides the
 * slider configuration and reordering happens locally via add/remove buttons.
 *
 * Props:
 *   pendulums    — [{ frequency, phase, decay, amplitude }] array.
 *   ariaLabel    — string. Default 'Pendulums'.
 *   minCount     — number. Default 1.
 *   maxCount     — number. Default 4.
 *   ranges       — { frequency: { min, max, step }, phase: {...}, decay: {...}, amplitude: {...} }
 *                  Optional; sensible defaults applied per parameter.
 *   onChange(pendulums) — required.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 *
 * The list mounts one Slider per parameter per pendulum; the parent panel
 * is the bridge for engine reads/writes (consistent with the Phase 1 contract
 * — components don't reach into engine state directly).
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const DEFAULT_RANGES = {
    frequency: { min: 0, max: 8, step: 0.001 },
    phase: { min: 0, max: 360, step: 1 },
    decay: { min: 0, max: 0.05, step: 0.0001 },
    amplitude: { min: 0, max: 1, step: 0.01 },
  };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ minCount: 1, maxCount: 4, ariaLabel: 'Pendulums' }, initialProps);
    const ranges = Object.assign({}, DEFAULT_RANGES, props.ranges || {});
    let value = Array.isArray(props.pendulums) ? props.pendulums.map((p) => Object.assign({}, p)) : [];

    const el = document.createElement('div');
    el.className = 'pendulum-list';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', props.ariaLabel);

    const itemsHost = document.createElement('div');
    itemsHost.className = 'pendulum-list-items';
    el.appendChild(itemsHost);

    const footer = document.createElement('div');
    footer.className = 'pendulum-list-footer';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add Pendulum';
    footer.appendChild(addBtn);
    el.appendChild(footer);

    const sliderInsts = [];

    const fire = () => {
      if (typeof props.onChange === 'function') props.onChange(value.map((p) => Object.assign({}, p)));
    };

    const blankPendulum = () => ({ frequency: 1, phase: 0, decay: 0.001, amplitude: 0.5 });

    const renderRow = (pendulum, index) => {
      const row = document.createElement('div');
      row.className = 'pendulum-row';
      row.dataset.index = String(index);

      const head = document.createElement('div');
      head.className = 'pendulum-row-head';
      const title = document.createElement('span');
      title.className = 'pendulum-row-title';
      title.textContent = `Pendulum ${index + 1}`;
      head.appendChild(title);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'layer-act';
      remove.setAttribute('aria-label', 'Remove pendulum');
      remove.textContent = '×';
      remove.disabled = value.length <= props.minCount;
      remove.addEventListener('click', () => {
        if (value.length <= props.minCount) return;
        value.splice(index, 1);
        renderItems();
        fire();
      });
      head.appendChild(remove);
      row.appendChild(head);

      ['frequency', 'phase', 'decay', 'amplitude'].forEach((key) => {
        const range = ranges[key];
        const labelRow = document.createElement('div');
        labelRow.className = 'ctrl-row';
        const lbl = document.createElement('span');
        lbl.className = 'ctrl-sub-lbl';
        lbl.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        labelRow.appendChild(lbl);
        row.appendChild(labelRow);

        if (UI.Slider) {
          const inst = UI.Slider(row, {
            ariaLabel: `Pendulum ${index + 1} ${key}`,
            value: pendulum[key] != null ? pendulum[key] : 0,
            min: range.min, max: range.max, step: range.step,
            onChange: (v) => { value[index][key] = v; fire(); },
            onCommit: () => fire(),
          });
          sliderInsts.push(inst);
        }
      });

      itemsHost.appendChild(row);
    };

    const renderItems = () => {
      sliderInsts.forEach((inst) => inst.destroy());
      sliderInsts.length = 0;
      itemsHost.textContent = '';
      value.forEach((p, i) => renderRow(p, i));
      addBtn.disabled = value.length >= props.maxCount;
    };

    addBtn.addEventListener('click', () => {
      if (value.length >= props.maxCount) return;
      value.push(blankPendulum());
      renderItems();
      fire();
    });

    renderItems();
    if (host) host.appendChild(el);

    return {
      el,
      getValue: () => value.map((p) => Object.assign({}, p)),
      setValue(next, { silent = false } = {}) {
        value = Array.isArray(next) ? next.map((p) => Object.assign({}, p)) : [];
        renderItems();
        if (!silent) fire();
      },
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && Array.isArray(newProps.pendulums)) {
          value = newProps.pendulums.map((p) => Object.assign({}, p));
        }
        if (newProps && newProps.ranges) {
          Object.assign(ranges, newProps.ranges);
        }
        if (newProps && newProps.minCount != null) merged.minCount = newProps.minCount;
        if (newProps && newProps.maxCount != null) merged.maxCount = newProps.maxCount;
        props = merged;
        renderItems();
      },
      destroy() {
        sliderInsts.forEach((inst) => inst.destroy());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.PendulumList = create;
})();
