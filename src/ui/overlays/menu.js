/*
 * Vectura Studio — Menu overlay (Phase 1).
 *
 * Floating dropdown menu (mockup `.menu-dropdown` + `.menu-entry`). Single
 * level (Phase 3 wires up the layer add submenu separately). Anchored to
 * an arbitrary element via getBoundingClientRect.
 *
 * Public API:
 *   const menu = UI.overlays.Menu(host, props);
 *   menu.open(anchor), menu.close(), menu.update(props), menu.destroy()
 *
 * Props:
 *   items   — [{ key, label, shortcut?, icon?, disabled?, separator?, category? }]
 *   onSelect(key, item) — required.
 *   placement — 'bottom' (default) | 'top'.
 *
 * Returns: { el, isOpen, open, close, update, destroy }
 *
 * Keyboard: ArrowDown/Up cycle, Home/End jump, Enter selects, Esc closes,
 * type-ahead picks first matching label.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ placement: 'bottom' }, initialProps);
    const utils = UI.utils || {};
    const ownerDoc = (host && host.ownerDocument) || document;

    const el = ownerDoc.createElement('div');
    el.className = 'menu-dropdown';
    el.setAttribute('role', 'menu');
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
    el.style.display = 'none';

    const entries = [];
    const buildItems = () => {
      el.textContent = '';
      entries.length = 0;
      const items = Array.isArray(props.items) ? props.items : [];
      items.forEach((item) => {
        if (item.separator) {
          const sep = ownerDoc.createElement('div');
          sep.className = 'menu-sep';
          sep.setAttribute('role', 'separator');
          el.appendChild(sep);
          return;
        }
        if (item.category) {
          const cat = ownerDoc.createElement('div');
          cat.className = 'menu-cat';
          cat.textContent = item.category;
          el.appendChild(cat);
          return;
        }
        const entry = ownerDoc.createElement('div');
        entry.className = 'menu-entry';
        entry.dataset.key = String(item.key);
        entry.setAttribute('role', 'menuitem');
        entry.tabIndex = -1;
        if (item.disabled) entry.classList.add('dim');
        const label = ownerDoc.createElement('span');
        label.className = 'menu-entry-label';
        label.textContent = item.label || String(item.key);
        entry.appendChild(label);
        if (item.shortcut) {
          const sc = ownerDoc.createElement('span');
          sc.className = 'msc';
          sc.textContent = item.shortcut;
          entry.appendChild(sc);
        }
        el.appendChild(entry);
        entries.push({ item, entry });
      });
    };

    let anchor = null;
    let isOpen = false;
    let highlightIdx = -1;
    let typeAheadTimer = 0;
    let typeAheadBuf = '';

    const win = ownerDoc.defaultView || window;

    const positionAgainst = (target) => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const menuRect = el.getBoundingClientRect();
      const vw = win.innerWidth || ownerDoc.documentElement.clientWidth || 1024;
      const vh = win.innerHeight || ownerDoc.documentElement.clientHeight || 768;

      let top = props.placement === 'top' ? rect.top - menuRect.height - 4 : rect.bottom + 4;
      let left = rect.left;
      if (left + menuRect.width > vw - 4) left = Math.max(4, vw - 4 - menuRect.width);
      if (top + menuRect.height > vh - 4 && props.placement !== 'top') top = Math.max(4, rect.top - menuRect.height - 4);
      if (top < 4) top = 4;
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    };

    const setHighlight = (idx) => {
      entries.forEach(({ entry }, i) => {
        const isHi = i === idx;
        entry.classList.toggle('is-active', isHi);
        if (isHi) entry.focus();
      });
      highlightIdx = idx;
    };

    const handleClickOutside = (event) => {
      if (!isOpen) return;
      if (!el.contains(event.target) && (!anchor || !anchor.contains(event.target))) close();
    };

    const handleKey = (event) => {
      if (!isOpen) return;
      const enabled = entries.filter((e) => !e.item.disabled);
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        close();
        if (anchor && typeof anchor.focus === 'function') anchor.focus();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const e = entries[highlightIdx];
        if (e && !e.item.disabled) {
          if (typeof props.onSelect === 'function') props.onSelect(e.item.key, e.item);
          close();
        }
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (direction !== 0) {
        event.preventDefault();
        if (!enabled.length) return;
        const currentIdx = enabled.findIndex((e) => entries.indexOf(e) === highlightIdx);
        const nextIdx = (currentIdx + direction + enabled.length) % enabled.length;
        setHighlight(entries.indexOf(enabled[nextIdx]));
        return;
      }
      if (event.key === 'Home') { event.preventDefault(); if (enabled.length) setHighlight(entries.indexOf(enabled[0])); return; }
      if (event.key === 'End') { event.preventDefault(); if (enabled.length) setHighlight(entries.indexOf(enabled[enabled.length - 1])); return; }
      if (event.key.length === 1 && /\S/.test(event.key)) {
        typeAheadBuf += event.key.toLowerCase();
        if (typeAheadTimer) clearTimeout(typeAheadTimer);
        typeAheadTimer = setTimeout(() => { typeAheadBuf = ''; }, 600);
        const found = enabled.find((e) => (e.item.label || '').toLowerCase().startsWith(typeAheadBuf));
        if (found) setHighlight(entries.indexOf(found));
      }
    };

    const handleEntryClick = (event) => {
      const target = event.target.closest && event.target.closest('.menu-entry');
      if (!target || !el.contains(target)) return;
      const found = entries.find(({ entry }) => entry === target);
      if (!found || found.item.disabled) return;
      if (typeof props.onSelect === 'function') props.onSelect(found.item.key, found.item);
      close();
    };

    const offClick = utils.on ? utils.on(el, 'click', handleEntryClick) : (el.addEventListener('click', handleEntryClick), () => el.removeEventListener('click', handleEntryClick));
    const offKey = utils.on ? utils.on(ownerDoc, 'keydown', handleKey) : (ownerDoc.addEventListener('keydown', handleKey), () => ownerDoc.removeEventListener('keydown', handleKey));
    const offOutside = utils.on ? utils.on(ownerDoc, 'mousedown', handleClickOutside) : (ownerDoc.addEventListener('mousedown', handleClickOutside), () => ownerDoc.removeEventListener('mousedown', handleClickOutside));

    buildItems();
    (host || ownerDoc.body).appendChild(el);

    function open(target) {
      if (isOpen) return;
      anchor = target || null;
      el.style.display = 'block';
      el.classList.add('open');
      isOpen = true;
      positionAgainst(anchor);
      const enabled = entries.filter((e) => !e.item.disabled);
      if (enabled.length) setHighlight(entries.indexOf(enabled[0]));
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      el.style.display = 'none';
      el.classList.remove('open');
      highlightIdx = -1;
      entries.forEach(({ entry }) => entry.classList.remove('is-active'));
    }

    return {
      el,
      isOpen: () => isOpen,
      open,
      close,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        if (newProps && Array.isArray(newProps.items)) {
          props.items = newProps.items;
          buildItems();
        }
        if (newProps && newProps.placement) merged.placement = newProps.placement;
        props = merged;
      },
      destroy() {
        if (typeAheadTimer) clearTimeout(typeAheadTimer);
        offClick(); offKey(); offOutside();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.overlays.Menu = create;
})();
