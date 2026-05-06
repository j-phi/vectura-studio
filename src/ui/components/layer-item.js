/*
 * Vectura Studio — LayerItem component (Phase 1).
 *
 * Mockup parity: `.layer-item` row > `.layer-bar` (color stripe), `.layer-name`,
 * `.layer-tag` (algorithm/type badge), `.layer-acts` (visibility/lock/etc.).
 *
 * Props:
 *   id          — unique layer id; surfaced on the root element via dataset.
 *   name        — display name.
 *   tag         — short uppercase string ('FLOWFIELD', 'PETAL', etc.).
 *   color       — '#rrggbb' for the left bar.
 *   active      — boolean; toggles `.active` class.
 *   dim         — boolean; toggles `.dim` class.
 *   visible     — boolean for the eye action.
 *   locked      — boolean for the lock action.
 *   actions     — optional [{ key, icon, label, active? }] override.
 *                 Defaults to [eye, lock] from window.Vectura.Icons.layer.
 *   onClick(id) — main row click (selection).
 *   onAction(actionKey, id, event) — fires on action button press.
 *   onReorder(fromId, toId, position) — invoked when a drag-and-drop completes.
 *
 * Returns: { el, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const defaultActions = (visible, locked) => {
    const Icons = (window.Vectura && window.Vectura.Icons && window.Vectura.Icons.layer) || null;
    const eye = Icons ? (visible ? Icons.eye() : Icons.eyeOff()) : (visible ? '◉' : '◌');
    const lock = Icons ? (locked ? Icons.lock() : Icons.lockOpen()) : (locked ? '🔒' : '🔓');
    return [
      { key: 'visibility', label: visible ? 'Hide layer' : 'Show layer', icon: eye, active: !visible },
      { key: 'lock', label: locked ? 'Unlock layer' : 'Lock layer', icon: lock, active: locked },
    ];
  };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ active: false, dim: false, visible: true, locked: false }, initialProps);
    const utils = UI.utils || {};

    const el = document.createElement('div');
    el.className = 'layer-item';
    el.dataset.layerId = String(props.id || '');
    el.setAttribute('role', 'option');
    el.setAttribute('draggable', 'true');

    const bar = document.createElement('span');
    bar.className = 'layer-bar';
    el.appendChild(bar);

    const name = document.createElement('span');
    name.className = 'layer-name';
    el.appendChild(name);

    const tag = document.createElement('span');
    tag.className = 'layer-tag';
    el.appendChild(tag);

    const acts = document.createElement('div');
    acts.className = 'layer-acts';
    el.appendChild(acts);

    const renderActions = () => {
      acts.textContent = '';
      const list = Array.isArray(props.actions) ? props.actions : defaultActions(props.visible, props.locked);
      list.forEach((act) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'layer-act';
        btn.dataset.actionKey = act.key;
        if (act.active) btn.classList.add('is-active');
        if (act.label) btn.setAttribute('aria-label', act.label);
        if (act.icon) btn.innerHTML = act.icon;
        else btn.textContent = '·';
        acts.appendChild(btn);
      });
    };

    const render = () => {
      el.classList.toggle('active', !!props.active);
      el.classList.toggle('dim', !!props.dim);
      el.setAttribute('aria-selected', String(!!props.active));
      bar.style.background = props.color || 'transparent';
      name.textContent = props.name || '';
      if (props.tag) {
        tag.textContent = props.tag;
        tag.style.display = '';
      } else {
        tag.style.display = 'none';
      }
      renderActions();
    };

    const handleClick = (event) => {
      const actionBtn = event.target.closest && event.target.closest('.layer-act');
      if (actionBtn && acts.contains(actionBtn)) {
        if (typeof props.onAction === 'function') props.onAction(actionBtn.dataset.actionKey, props.id, event);
        return;
      }
      if (typeof props.onClick === 'function') props.onClick(props.id, event);
    };

    const handleDragStart = (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/x-vectura-layer-id', String(props.id));
      }
      el.classList.add('is-dragging');
    };
    const handleDragEnd = () => { el.classList.remove('is-dragging'); };
    const handleDragOver = (event) => {
      if (!event.dataTransfer) return;
      const types = event.dataTransfer.types;
      if (types && Array.from(types).indexOf('text/x-vectura-layer-id') < 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const isAbove = event.clientY < rect.top + rect.height / 2;
      el.classList.toggle('drop-above', isAbove);
      el.classList.toggle('drop-below', !isAbove);
    };
    const handleDragLeave = () => {
      el.classList.remove('drop-above', 'drop-below');
    };
    const handleDrop = (event) => {
      const fromId = event.dataTransfer && event.dataTransfer.getData('text/x-vectura-layer-id');
      el.classList.remove('drop-above', 'drop-below');
      if (!fromId || String(fromId) === String(props.id)) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
      if (typeof props.onReorder === 'function') props.onReorder(fromId, props.id, position);
    };

    const offs = [];
    const bind = (target, evt, fn) => {
      target.addEventListener(evt, fn);
      offs.push(() => target.removeEventListener(evt, fn));
    };
    bind(el, 'click', handleClick);
    bind(el, 'dragstart', handleDragStart);
    bind(el, 'dragend', handleDragEnd);
    bind(el, 'dragover', handleDragOver);
    bind(el, 'dragleave', handleDragLeave);
    bind(el, 'drop', handleDrop);

    render();
    if (host) host.appendChild(el);

    return {
      el,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        props = merged;
        if (newProps && newProps.id != null) el.dataset.layerId = String(newProps.id);
        render();
      },
      destroy() {
        offs.forEach((fn) => fn());
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.LayerItem = create;
})();
