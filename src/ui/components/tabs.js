/*
 * Vectura Studio — Tabs component (Phase 1).
 *
 * Wraps the mockup's `.tab-bar` + `.tab-btn` + `.tab-panel.active` markup.
 * Composing component owns the panel content via `panels` prop or via the
 * `mountPanel(host, value)` callback.
 *
 * Props:
 *   tabs       — [{ value, label, ariaLabel? }]; required.
 *   active     — initial tab value.
 *   ariaLabel  — string.
 *   onChange(value) — required.
 *
 * Returns: { el, bar, getActive, setActive, update, destroy }
 *   `el` is the tab bar; the consumer renders panels separately and listens
 *   to onChange to swap content. (Mockup uses sibling .tab-panel divs; we
 *   stay agnostic so the consumer can place panels anywhere.)
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({}, initialProps);
    const utils = UI.utils || {};
    let tabs = Array.isArray(props.tabs) ? props.tabs.slice() : [];
    let active = props.active != null ? props.active : (tabs[0] && tabs[0].value);

    const bar = document.createElement('div');
    bar.className = 'tab-bar';
    bar.setAttribute('role', 'tablist');
    if (props.ariaLabel) bar.setAttribute('aria-label', props.ariaLabel);

    const buttons = [];
    const buildButtons = () => {
      bar.textContent = '';
      buttons.length = 0;
      tabs.forEach((tab) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-btn';
        btn.setAttribute('role', 'tab');
        btn.dataset.value = String(tab.value);
        btn.textContent = tab.label || String(tab.value);
        if (tab.ariaLabel) btn.setAttribute('aria-label', tab.ariaLabel);
        bar.appendChild(btn);
        buttons.push(btn);
      });
    };

    const sync = () => {
      buttons.forEach((btn) => {
        const isActive = btn.dataset.value === String(active);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.tabIndex = isActive ? 0 : -1;
      });
    };

    const setActive = (next, { silent = false } = {}) => {
      const found = tabs.find((t) => String(t.value) === String(next));
      if (!found) return;
      const changed = String(found.value) !== String(active);
      active = found.value;
      sync();
      if (changed && !silent && typeof props.onChange === 'function') props.onChange(active);
    };

    const handleClick = (event) => {
      const btn = event.target.closest && event.target.closest('.tab-btn');
      if (!btn || !bar.contains(btn)) return;
      const tab = tabs.find((t) => String(t.value) === btn.dataset.value);
      if (tab) setActive(tab.value);
    };
    const handleKey = (event) => {
      const idx = tabs.findIndex((t) => String(t.value) === String(active));
      if (idx < 0) return;
      let next = idx;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (idx + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      setActive(tabs[next].value);
      const btn = buttons[next];
      if (btn) btn.focus();
    };
    const offClick = utils.on ? utils.on(bar, 'click', handleClick) : (bar.addEventListener('click', handleClick), () => bar.removeEventListener('click', handleClick));
    const offKey = utils.on ? utils.on(bar, 'keydown', handleKey) : (bar.addEventListener('keydown', handleKey), () => bar.removeEventListener('keydown', handleKey));

    buildButtons();
    sync();
    if (host) host.appendChild(bar);

    return {
      el: bar,
      bar,
      getActive: () => active,
      setActive,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && Array.isArray(newProps.tabs)) {
          tabs = newProps.tabs.slice();
          buildButtons();
          if (!tabs.find((t) => String(t.value) === String(active))) {
            active = tabs[0] ? tabs[0].value : null;
          }
        }
        if (newProps && newProps.active != null) setActive(newProps.active, { silent: true });
        sync();
        props = merged;
      },
      destroy() {
        offClick(); offKey();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      },
    };
  };

  UI.Tabs = create;
})();
