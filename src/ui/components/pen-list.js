/*
 * Vectura Studio — PenList component (Phase 1).
 *
 * Reusable list of PenItem rows. Used by:
 *   - the Pens tab (full document pen list, mockup `.pen-list`)
 *   - the pattern algorithm's sub-pen editor (CONTROL_DEFS `patternSubPens`)
 *
 * Composes UI.PenItem rows; exposes add/remove buttons and forwards weight
 * + color callbacks back up to the consumer.
 *
 * Props:
 *   pens          — [{ id, label, color, weight }] array.
 *   minCount      — Default 1.
 *   maxCount      — Default Infinity.
 *   weightMin/Max/Step — passed through to PenItem.
 *   showAddRemove — boolean. Default true.
 *   onChange(pens) — required.
 *   onColorClick(id) — opens picker.
 *
 * Returns: { el, update, destroy, getValue, setValue }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const PALETTE = ['#1f4ed8', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

  const create = (host, initialProps = {}) => {
    let props = Object.assign({
      minCount: 1, maxCount: Infinity, showAddRemove: true,
      weightMin: 0.05, weightMax: 2, weightStep: 0.05,
    }, initialProps);
    let value = Array.isArray(props.pens) ? props.pens.map((p) => Object.assign({}, p)) : [];

    const el = document.createElement('div');
    el.className = 'pen-list';

    const itemsHost = document.createElement('div');
    itemsHost.className = 'pen-list-items';
    el.appendChild(itemsHost);

    const footer = document.createElement('div');
    footer.className = 'pen-list-footer';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add Pen';
    if (props.showAddRemove) footer.appendChild(addBtn);
    el.appendChild(footer);

    const itemInsts = [];

    const fire = () => {
      if (typeof props.onChange === 'function') props.onChange(value.map((p) => Object.assign({}, p)));
    };

    const blankPen = () => {
      const id = `pen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const color = PALETTE[value.length % PALETTE.length];
      return { id, label: `P${value.length + 1}`, color, weight: 0.4 };
    };

    const renderItem = (pen, index) => {
      const row = document.createElement('div');
      row.className = 'pen-list-row';
      row.dataset.index = String(index);

      let item = null;
      if (UI.PenItem) {
        item = UI.PenItem(row, Object.assign({}, pen, {
          weightMin: props.weightMin, weightMax: props.weightMax, weightStep: props.weightStep,
          onColorClick: (id) => {
            if (typeof props.onColorClick === 'function') props.onColorClick(id);
          },
          onWeightChange: (w, id) => {
            const idx = value.findIndex((p) => p.id === id);
            if (idx >= 0) { value[idx].weight = w; fire(); }
          },
          onWeightCommit: (w, id) => {
            const idx = value.findIndex((p) => p.id === id);
            if (idx >= 0) { value[idx].weight = w; fire(); }
          },
        }));
      }
      if (props.showAddRemove && value.length > props.minCount) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'layer-act pen-list-remove';
        remove.setAttribute('aria-label', `Remove pen ${pen.label || pen.id}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          value = value.filter((p) => p.id !== pen.id);
          renderItems();
          fire();
        });
        row.appendChild(remove);
      }
      itemsHost.appendChild(row);
      if (item) itemInsts.push(item);
    };

    const renderItems = () => {
      itemInsts.forEach((inst) => inst.destroy());
      itemInsts.length = 0;
      itemsHost.textContent = '';
      value.forEach((p, i) => renderItem(p, i));
      addBtn.disabled = value.length >= props.maxCount;
    };

    addBtn.addEventListener('click', () => {
      if (value.length >= props.maxCount) return;
      value.push(blankPen());
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
        if (newProps && Array.isArray(newProps.pens)) {
          value = newProps.pens.map((p) => Object.assign({}, p));
        }
        props = merged;
        renderItems();
      },
      destroy() {
        itemInsts.forEach((inst) => inst.destroy());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.PenList = create;
})();
