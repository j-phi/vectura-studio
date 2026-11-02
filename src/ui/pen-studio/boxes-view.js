/**
 * Pen Studio box list — window.Vectura.UI.PenStudioBoxes.mount(el, ctx).
 *
 * Left column: boxes (pinned first) with collapse, pin, export, add pen and
 * delete; pen rows show faint / owned sizes / unsaved / tuned markers. Click a
 * row to select; click the selected row again to rename it (an unsaved draft
 * name, like the header). Every change goes through ctx.setDoc / ctx.set.
 */
(() => {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.PenStudioBoxes) return;

  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const btn = (cls, text, onClick, attrs) => {
    const b = h('button', cls, text);
    b.type = 'button';
    if (attrs) Object.keys(attrs).forEach((k) => b.setAttribute(k, attrs[k]));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  function mount(host, ctx) {
    const L = () => ctx.L();
    const fmt = ctx.fmt || ((t, v) => String(t || '').replace(/\{(\w+)\}/g, (_m, k) => (v && v[k] != null ? v[k] : '')));
    const store = () => Vectura.PenStudioStore;
    const root = h('div', 'pen-studio-boxes-view');
    host.appendChild(root);
    let armedDelete = null;

    const penById = (doc, id) => doc.pens.find((p) => p.id === id) || null;

    const isFaint = (pen, sizes) => {
      const Lab = Vectura.PenStudioLab;
      if (!Lab || !Lab.fit || !sizes.length) return false;
      try {
        const res = Lab.fit(pen.color, ctx.getState().paperType, store().toDocPen(pen, sizes[0]));
        return !!(res && res.faint);
      } catch (_e) { return false; }
    };

    const noteFor = (pen, item) => {
      const st = ctx.getState();
      const D = Vectura.PenStudioDraft;
      const d = st.drafts[pen.id];
      if (D && D.isDirty && D.isDirty(pen, d)) return { text: L().UNSAVED_ROW || '● unsaved', cls: 'is-unsaved' };
      if (isFaint(pen, item.sizes)) return { text: L().FAINT || 'faint', cls: 'is-faint' };
      const tuned = pen.ink && Object.keys(pen.ink).length > 0;
      return { text: item.sizes.join(' ') + (tuned ? ' ✎' : ''), cls: '' };
    };

    function selectPen(box, pen) {
      ctx.set({ selPenId: pen.id, selBoxId: box.id, testSize: null, comp: null, note: null, editing: null });
    }

    function rowEl(box, item, doc) {
      const pen = penById(doc, item.penId);
      if (!pen) return null;
      const st = ctx.getState();
      const selected = st.selPenId === pen.id && st.selBoxId === box.id;
      const editing = selected && st.editing === `row:${pen.id}`;
      const li = h('li', `pen-studio-row${selected ? ' is-selected' : ''}`);
      li.setAttribute('data-pen-id', pen.id);
      const sw = h('span', 'pen-studio-swatch');
      sw.style.background = pen.color;
      const d = st.drafts[pen.id];
      const name = (d && d.name) || pen.name;
      const note = noteFor(pen, item);

      if (editing) {
        const main = h('div', 'pen-studio-row-main');
        main.appendChild(sw);
        const input = h('input', 'pen-studio-edit pen-studio-row-edit');
        input.type = 'text';
        input.value = name;
        input.maxLength = (ctx.cfg().LIMITS && ctx.cfg().LIMITS.nameMax) || 48;
        input.setAttribute('aria-label', L().FIELD_NAME || 'Name');
        input.setAttribute('data-ps-focus', `row-edit-${pen.id}`);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); UI.PenStudio._commitEdit('name', input.value); }
        });
        input.addEventListener('blur', () => {
          if (ctx.getState().editing === `row:${pen.id}`) UI.PenStudio._commitEdit('name', input.value);
        });
        main.appendChild(input);
        li.appendChild(main);
        ctx.afterRender(() => { if (input.isConnected) { input.focus(); input.select(); } });
        return li;
      }

      const main = btn('pen-studio-row-main', null, () => {
        if (selected) ctx.set({ editing: `row:${pen.id}` });
        else selectPen(box, pen);
      }, { 'data-ps-focus': `row-${pen.id}`, 'aria-pressed': selected ? 'true' : 'false', title: selected ? (L().CLICK_RENAME || 'Click to rename') : name });
      main.appendChild(sw);
      main.appendChild(h('span', 'pen-studio-row-name', name));
      main.appendChild(h('span', `pen-studio-row-note ${note.cls}`.trim(), note.text));
      li.appendChild(main);
      li.appendChild(btn('pen-studio-row-remove', '×', () => {
        const next = store().removePen(ctx.getDoc(), box.id, pen.id);
        const drafts = Object.assign({}, ctx.getState().drafts);
        delete drafts[pen.id];
        ctx.getState().drafts = drafts;
        ctx.setDoc(next);
      }, { 'aria-label': `${L().REMOVE_PEN || 'Remove pen'}: ${name}`, title: L().REMOVE_PEN || 'Remove pen' }));
      return li;
    }

    function boxEl(box, doc) {
      const wrap = h('section', `pen-studio-box${box.open ? ' is-open' : ''}${box.pinned ? ' is-pinned' : ''}`);
      wrap.setAttribute('data-box-id', box.id);
      const head = h('div', 'pen-studio-box-head');
      const toggle = btn('pen-studio-box-toggle', null, () => ctx.setDoc(store().setOpen(ctx.getDoc(), box.id, !box.open)), {
        'aria-expanded': box.open ? 'true' : 'false', 'data-ps-focus': `box-${box.id}`,
      });
      toggle.appendChild(h('span', 'pen-studio-chev', box.open ? '▾' : '▸'));
      toggle.appendChild(h('span', 'pen-studio-box-name', box.name));
      toggle.appendChild(h('span', 'pen-studio-box-count', String(box.items.length)));
      head.appendChild(toggle);
      const pinLabel = fmt(box.pinned ? (L().UNPIN || 'Unpin {name}') : (L().PIN || 'Pin {name}'), { name: box.name });
      head.appendChild(btn('pen-studio-box-pin', box.pinned ? '★' : '☆', () => ctx.setDoc(store().setPinned(ctx.getDoc(), box.id, !box.pinned)), {
        'aria-label': pinLabel, title: pinLabel, 'aria-pressed': box.pinned ? 'true' : 'false',
      }));
      head.appendChild(btn('pen-studio-box-export', '⤓', () => {
        const res = store().exportBox(ctx.getDoc(), box.id);
        if (res && res.ok) {
          ctx.set({ overlay: { kind: 'export', title: fmt(L().EXPORT_BOX_TITLE || 'Export box: {name}', { name: box.name }), text: res.text, filename: res.filename } });
        } else {
          ctx.set({ note: { text: L().EMPTY_BOX || 'This box has no pens yet.', tone: 'warn' } });
        }
      }, { 'aria-label': `${L().EXPORT || 'Export'} ${box.name}`, title: `${L().EXPORT || 'Export'} ${box.name}` }));
      head.appendChild(btn('pen-studio-box-add', '+', () => ctx.set({ overlay: { kind: 'add', boxId: box.id } }), {
        'aria-label': `${L().ADD_PEN || 'Add pen'}: ${box.name}`, title: `${L().ADD_PEN || 'Add pen'}: ${box.name}`,
      }));
      const armed = armedDelete === box.id;
      head.appendChild(btn(`pen-studio-box-delete${armed ? ' is-armed' : ''}`, armed ? (L().DELETE_CONFIRM || 'Delete?') : '×', () => {
        if (!armed) { armedDelete = box.id; update(); return; }
        armedDelete = null;
        const drafts = Object.assign({}, ctx.getState().drafts);
        box.items.forEach((i) => { delete drafts[i.penId]; });
        ctx.getState().drafts = drafts;
        ctx.setDoc(store().deleteBox(ctx.getDoc(), box.id));
      }, { 'aria-label': `${L().DELETE_BOX || 'Delete box'}: ${box.name}`, title: L().DELETE_BOX || 'Delete box' }));
      wrap.appendChild(head);

      if (box.open) {
        if (!box.items.length) {
          wrap.appendChild(h('p', 'pen-studio-box-empty', L().EMPTY_BOX || 'No pens yet. Add one with +.'));
        } else {
          const ul = h('ul', 'pen-studio-rows');
          box.items.forEach((item) => { const li = rowEl(box, item, doc); if (li) ul.appendChild(li); });
          wrap.appendChild(ul);
        }
      }
      return wrap;
    }

    function update() {
      const S = store();
      const doc = ctx.getDoc();
      if (armedDelete && !doc.boxes.some((b) => b.id === armedDelete)) armedDelete = null;
      const head = h('div', 'pen-studio-boxes-head');
      head.appendChild(h('h3', 'pen-studio-boxes-title', L().BOXES_HEAD || 'Boxes'));
      const acts = h('div', 'pen-studio-boxes-actions');
      acts.appendChild(btn('pen-studio-btn pen-studio-import-box', L().IMPORT_BOX || 'Import box', () => ctx.set({ overlay: { kind: 'import' } })));
      acts.appendChild(btn('pen-studio-btn pen-studio-new-box', L().NEW_BOX || 'New box', () => {
        ctx.setDoc(S.createBox(doc).doc);
      }));
      head.appendChild(acts);
      const list = h('div', 'pen-studio-box-list');
      S.sortedBoxes(doc).forEach((b) => list.appendChild(boxEl(b, doc)));
      root.replaceChildren(head, list);
    }

    update();
    return {
      update,
      destroy() { if (root.parentNode) root.parentNode.removeChild(root); },
    };
  }

  UI.PenStudioBoxes = { mount };
})();
