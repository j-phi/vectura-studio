/**
 * Pen Studio dialogs — window.Vectura.UI.PenStudioDialogs.render(ctx).
 *
 * Returns the element for the session's `overlay` ({kind:'add'|'export'|
 * 'import'|'saveNew', …}) or null. The shell mounts it in a scrim inside the
 * Studio modal and rebuilds it on every render; typing mutates the overlay
 * object in place so no keystroke triggers a rebuild. Esc is handled by the
 * shell (closes the dialog only, not the Studio).
 */
(() => {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.PenStudioDialogs) return;

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
  const store = () => Vectura.PenStudioStore;
  const draftApi = () => Vectura.PenStudioDraft;
  const MODELS = () => (Vectura.PEN_MODELS && Vectura.PEN_MODELS.MODELS) || {};

  const IMPORT_ERR = {
    parse: 'That text is not valid JSON.',
    schema: 'This is not a Vectura pen file.',
    version: 'This file was made by a newer version of Vectura.',
    empty: 'The file has no usable pens.',
    'too-large': 'The file is too large to import.',
    'too-many': 'The file has too many pens.',
  };

  function frame(ctx, ov, title, sub, kindClass) {
    const L = ctx.L();
    const scrim = h('div', 'pen-studio-scrim');
    const dlg = h('div', `pen-studio-dialog ${kindClass}`);
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', title);
    dlg.appendChild(h('h3', 'pen-studio-dialog-title', title));
    if (sub) dlg.appendChild(h('p', 'pen-studio-dialog-sub', sub));
    const body = h('div', 'pen-studio-dialog-body');
    const foot = h('div', 'pen-studio-dialog-foot');
    dlg.appendChild(body);
    dlg.appendChild(foot);
    scrim.appendChild(dlg);
    const cancel = (label) => btn('pen-studio-btn pen-studio-dialog-cancel', label || L.CANCEL || 'Cancel', () => ctx.set({ overlay: null }));
    const focusOnce = (el, key) => {
      el.setAttribute('data-ps-focus', key);
      if (!ov._focused) { ov._focused = true; ctx.afterRender(() => el.focus()); }
    };
    return { scrim, dlg, body, foot, cancel, focusOnce };
  }

  const field = (label, control) => {
    const wrap = h('label', 'pen-studio-field');
    wrap.appendChild(h('span', 'pen-studio-field-label', label));
    wrap.appendChild(control);
    return wrap;
  };

  // ---- add pen -----------------------------------------------------------------

  const coloursFor = (ctx, modelId) => {
    const m = modelId ? MODELS()[modelId] : null;
    if (m && Array.isArray(m.colours) && m.colours.length) return m.colours;
    const pc = ctx.cfg().PLAIN_COLORS;
    const list = typeof pc === 'function' ? pc() : pc;
    return Array.isArray(list) && list.length ? list : [{ name: 'Black', hex: '#000000' }];
  };

  const defaultName = (modelId, colourName) => {
    const m = modelId ? MODELS()[modelId] : null;
    return `${m && m.short ? `${m.short} ` : ''}${colourName}`.slice(0, 48);
  };

  const defaultSizeLabel = (modelId) => {
    const m = modelId ? MODELS()[modelId] : null;
    const sizes = store().sizesOf(modelId || null);
    return m && m.defaultSize && sizes.some((s) => s.label === m.defaultSize) ? m.defaultSize : sizes[0].label;
  };

  function initAdd(ctx, ov) {
    if (ov.form) return ov.form;
    const order = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.ORDER) || Object.keys(MODELS());
    const model = order[0] || '';
    const c0 = coloursFor(ctx, model)[0];
    ov.form = { model, color: c0.hex, colorName: c0.name, name: defaultName(model, c0.name), nameTouched: false, sizes: [defaultSizeLabel(model)] };
    return ov.form;
  }

  function addDialog(ctx, ov) {
    const L = ctx.L();
    const f = initAdd(ctx, ov);
    const doc = ctx.getDoc();
    const box = doc.boxes.find((b) => b.id === ov.boxId) || doc.boxes[0];
    const fr = frame(ctx, ov, `${L.ADD_TITLE || 'Add a pen to'} ${box ? box.name : ''}`.trim(),
      L.ADD_SUB || 'Choose a model and color, then tick the sizes you own.', 'pen-studio-add');

    const sel = h('select', 'pen-studio-add-model');
    const order = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.ORDER) || Object.keys(MODELS());
    order.forEach((id) => {
      const o = h('option', null, MODELS()[id].label);
      o.value = id;
      sel.appendChild(o);
    });
    const plain = h('option', null, L.ADD_PLAIN_MODEL || 'Plain pen');
    plain.value = '';
    sel.appendChild(plain);
    sel.value = f.model;
    sel.addEventListener('change', () => {
      f.model = sel.value;
      const c0 = coloursFor(ctx, f.model)[0];
      f.color = c0.hex; f.colorName = c0.name;
      if (!f.nameTouched) f.name = defaultName(f.model, c0.name);
      f.sizes = [defaultSizeLabel(f.model)];
      ctx.set({ overlay: ov });
    });
    fr.body.appendChild(field(L.FIELD_MODEL || 'Model', sel));

    const colorsWrap = h('div', 'pen-studio-field');
    colorsWrap.appendChild(h('span', 'pen-studio-field-label', L.FIELD_COLOR || 'Color'));
    const swatches = h('div', 'pen-studio-swatches');
    coloursFor(ctx, f.model).forEach((c) => {
      const on = String(c.hex).toLowerCase() === String(f.color).toLowerCase();
      const b = btn(`pen-studio-color${on ? ' is-on' : ''}`, null, () => {
        f.color = c.hex; f.colorName = c.name;
        if (!f.nameTouched) f.name = defaultName(f.model, c.name);
        ctx.set({ overlay: ov });
      }, { title: c.name, 'aria-label': c.name, 'aria-pressed': on ? 'true' : 'false' });
      b.style.background = c.hex;
      swatches.appendChild(b);
    });
    colorsWrap.appendChild(swatches);
    const custom = h('input', 'pen-studio-color-custom');
    custom.type = 'color';
    custom.value = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#000000';
    custom.setAttribute('aria-label', L.CUSTOM_COLOR || 'Custom color');
    custom.title = L.CUSTOM_COLOR || 'Custom color';
    colorsWrap.appendChild(custom);
    fr.body.appendChild(colorsWrap);

    const name = h('input', 'pen-studio-add-name');
    name.type = 'text';
    name.maxLength = (ctx.cfg().LIMITS && ctx.cfg().LIMITS.nameMax) || 48;
    name.value = f.name;
    fr.focusOnce(name, 'add-name');
    name.addEventListener('input', () => { f.name = name.value; f.nameTouched = true; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
    fr.body.appendChild(field(L.FIELD_NAME || 'Name', name));

    const sizesWrap = h('div', 'pen-studio-field');
    sizesWrap.appendChild(h('span', 'pen-studio-field-label', L.FIELD_SIZES || 'Sizes you own'));
    const row = h('div', 'pen-studio-sizes');
    store().sizesOf(f.model || null).forEach((s) => {
      const on = f.sizes.indexOf(s.label) >= 0;
      row.appendChild(btn(`pen-studio-size${on ? ' is-on' : ''}`, `${s.label} · ${Number(s.nominalWidthMm).toFixed(2)} mm`, () => {
        let next = on ? f.sizes.filter((x) => x !== s.label) : f.sizes.concat([s.label]);
        if (!next.length) next = f.sizes;
        const order2 = store().sizesOf(f.model || null).map((z) => z.label);
        f.sizes = next.slice().sort((a, b) => order2.indexOf(a) - order2.indexOf(b));
        ctx.set({ overlay: ov });
      }, { 'aria-pressed': on ? 'true' : 'false', 'data-size': s.label }));
    });
    sizesWrap.appendChild(row);
    fr.body.appendChild(sizesWrap);

    const fit = h('p', 'pen-studio-fit-warn');
    fit.setAttribute('role', 'status');
    const refreshFit = () => {
      const Lab = Vectura.PenStudioLab;
      const type = ctx.getState().paperType;
      let msg = '';
      if (Lab && Lab.fit) {
        const sizes = store().sizesOf(f.model || null);
        const sz = sizes.find((s) => s.label === f.sizes[0]) || sizes[0];
        const res = Lab.fit(f.color, type, { color: f.color, width: sz.laidWidthMm, model: f.model || undefined, size: sz.label });
        if (res && (res.faint || res.note === 'barely')) {
          const papers = Lab.papers ? Lab.papers() : [];
          const p = papers.find((x) => x.type === type);
          msg = (L.FIT_WARN || 'Heads-up: this ink barely shows on {paper}.').replace('{paper}', p ? p.name : type);
        }
      }
      fit.textContent = msg;
      fit.hidden = !msg;
    };
    refreshFit();
    custom.addEventListener('input', () => { f.color = custom.value; refreshFit(); });
    custom.addEventListener('change', () => {
      f.color = custom.value;
      f.colorName = L.CUSTOM_NAME || 'Custom';
      if (!f.nameTouched) f.name = defaultName(f.model, f.colorName);
      ctx.set({ overlay: ov });
    });
    fr.body.appendChild(fit);

    function confirm() {
      const nm = String(f.name || '').replace(/\s+/g, ' ').trim().slice(0, 48) || (L.NEW_PEN_NAME || 'New pen');
      const res = store().addPen(ctx.getDoc(), box.id, { name: nm, color: f.color, model: f.model || null, sizes: f.sizes.slice() });
      if (!res || !res.doc) return;
      Object.assign(ctx.getState(), {
        selPenId: res.penId, selBoxId: box.id, testSize: null, comp: null, overlay: null, editing: null,
        note: { text: (L.NOTE_ADDED || 'Added {name} to {box}').replace('{name}', nm).replace('{box}', box.name), tone: 'ok' },
      });
      ctx.setDoc(res.doc);
    }
    fr.foot.appendChild(fr.cancel());
    fr.foot.appendChild(btn('pen-studio-btn primary pen-studio-add-confirm', L.ADD_PEN || 'Add pen', confirm));
    return fr.scrim;
  }

  // ---- export --------------------------------------------------------------------

  function exportDialog(ctx, ov) {
    const L = ctx.L();
    const fr = frame(ctx, ov, ov.title || L.EXPORT || 'Export', ov.filename || '', 'pen-studio-export');
    if (ov.error || !ov.text) {
      fr.body.appendChild(h('p', 'pen-studio-error', L.EXPORT_NOTHING || 'Nothing to export.'));
    } else {
      const ta = h('textarea', 'pen-studio-textarea');
      ta.readOnly = true;
      ta.value = ov.text;
      ta.setAttribute('aria-label', ov.title || 'Export');
      fr.body.appendChild(ta);
      fr.focusOnce(ta, 'export-text');
    }
    fr.foot.appendChild(fr.cancel(L.CLOSE || 'Close'));
    if (ov.text) {
      fr.foot.appendChild(btn('pen-studio-btn pen-studio-copy', L.EXPORT_COPY || 'Copy', () => {
        const nav = G.navigator;
        if (nav && nav.clipboard && nav.clipboard.writeText) nav.clipboard.writeText(ov.text).catch(() => {});
      }));
      fr.foot.appendChild(btn('pen-studio-btn primary pen-studio-download', L.EXPORT_DOWNLOAD || 'Download', () => {
        const D = Vectura.Download;
        if (D && D.saveBlob) D.saveBlob(new Blob([ov.text], { type: 'application/json' }), ov.filename || 'pens.vectura-pens.json');
      }));
    }
    return fr.scrim;
  }

  // ---- import --------------------------------------------------------------------

  function importDialog(ctx, ov) {
    const L = ctx.L();
    const fr = frame(ctx, ov, L.IMPORT_TITLE || 'Import box', L.IMPORT_SUB || 'Paste a .vectura-pens file, or choose one.', 'pen-studio-import');
    const ta = h('textarea', 'pen-studio-textarea');
    ta.value = ov.text || '';
    ta.spellcheck = false;
    ta.setAttribute('aria-label', L.IMPORT_TITLE || 'Import box');
    ta.addEventListener('input', () => { ov.text = ta.value; });
    fr.focusOnce(ta, 'import-text');
    fr.body.appendChild(ta);
    const file = h('input', 'pen-studio-file');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.setAttribute('aria-label', L.IMPORT_CHOOSE_FILE || 'Choose a file');
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new G.FileReader();
      reader.onload = () => { ov.text = String(reader.result || ''); ov.msg = null; ctx.set({ overlay: ov }); };
      reader.readAsText(f);
    });
    fr.body.appendChild(file);
    if (ov.msg) {
      const m = h('p', `pen-studio-msg tone-${ov.msg.tone}`, ov.msg.text);
      m.setAttribute('role', 'status');
      fr.body.appendChild(m);
    }
    fr.foot.appendChild(fr.cancel(L.CLOSE || 'Close'));
    fr.foot.appendChild(btn('pen-studio-btn primary pen-studio-import-go', L.IMPORT_GO || 'Import', () => {
      const res = store().importBox(ctx.getDoc(), ov.text || '');
      if (!res || !res.ok) {
        const reason = res && res.reason ? res.reason : 'schema';
        const key = `IMPORT_ERR_${String(reason).toUpperCase().replace(/-/g, '_')}`;
        ov.msg = { text: L[key] || IMPORT_ERR[reason] || IMPORT_ERR.schema, tone: 'error' };
        ctx.set({ overlay: ov });
        return;
      }
      const box = res.doc.boxes.find((b) => b.id === res.boxId);
      ov.msg = { text: (L.IMPORT_OK || 'Added “{name}” · {count} pens').replace('{name}', box ? box.name : '').replace('{count}', String(res.count)), tone: 'ok' };
      const first = box && box.items[0];
      Object.assign(ctx.getState(), { selBoxId: res.boxId, selPenId: first ? first.penId : ctx.getState().selPenId, testSize: null, comp: null, editing: null });
      ctx.setDoc(res.doc);
    }));
    return fr.scrim;
  }

  // ---- save as new -----------------------------------------------------------------

  function saveNewDialog(ctx, ov) {
    const L = ctx.L();
    const pen = ctx.selPen();
    if (!pen) return null;
    const st = ctx.getState();
    const D = draftApi();
    const draft = st.drafts[pen.id] || { ink: {} };
    const doc = ctx.getDoc();
    const cur = ctx.selBox();
    if (ov.name == null) {
      const d = D && D.defaultSaveNewName ? D.defaultSaveNewName(pen, draft) : `${pen.name} (custom)`;
      ov.name = String(d).slice(0, 48);
    }
    if (!ov.boxId) ov.boxId = cur ? cur.id : (doc.boxes[0] && doc.boxes[0].id);
    const fr = frame(ctx, ov, L.SAVE_NEW_TITLE || 'Save as a new pen', (L.SAVE_NEW_SUB || 'Based on {pen}').replace('{pen}', pen.name), 'pen-studio-save-new');

    const name = h('input', 'pen-studio-savenew-name');
    name.type = 'text';
    name.maxLength = (ctx.cfg().LIMITS && ctx.cfg().LIMITS.nameMax) || 48;
    name.value = ov.name;
    fr.focusOnce(name, 'savenew-name');
    const err = h('p', 'pen-studio-error', ov.err || '');
    err.setAttribute('role', 'alert');
    err.hidden = !ov.err;
    name.addEventListener('input', () => { ov.name = name.value; ov.err = ''; err.textContent = ''; err.hidden = true; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    fr.body.appendChild(field(L.FIELD_NAME || 'Name', name));

    const box = h('select', 'pen-studio-savenew-box');
    store().sortedBoxes(doc).forEach((b) => {
      const o = h('option', null, b.name);
      o.value = b.id;
      if (b.id === ov.boxId) o.selected = true;
      box.appendChild(o);
    });
    box.addEventListener('change', () => { ov.boxId = box.value; ov.err = ''; err.textContent = ''; err.hidden = true; });
    fr.body.appendChild(field(L.MOVE_TO || 'Box', box));
    fr.body.appendChild(err);

    function save() {
      const eff = D && D.effectiveInk ? D.effectiveInk(pen, draft) : Object.assign({}, pen.ink, draft.ink);
      const desc = draft.desc != null ? draft.desc : pen.desc;
      const res = store().saveAsNew(doc, pen.id, ov.boxId, ov.name, eff, desc);
      if (!res || !res.ok) {
        const target = doc.boxes.find((b) => b.id === ov.boxId);
        ov.err = res && res.reason === 'name-taken'
          ? (L.ERR_NAME_TAKEN || 'There is already a pen called “{name}” in {box}.').replace('{name}', String(ov.name).trim()).replace('{box}', target ? target.name : '')
          : (L.ERR_NAME_EMPTY || 'Give the new pen a name.');
        ctx.set({ overlay: ov });
        return;
      }
      const target = res.doc.boxes.find((b) => b.id === ov.boxId);
      const drafts = Object.assign({}, st.drafts);
      delete drafts[pen.id];
      Object.assign(st, {
        drafts, selPenId: res.penId, selBoxId: ov.boxId, overlay: null, editing: null,
        note: { text: (L.NOTE_SAVED_NEW || 'Saved new pen “{name}” in {box}').replace('{name}', String(ov.name).trim()).replace('{box}', target ? target.name : ''), tone: 'ok' },
      });
      ctx.setDoc(res.doc);
    }
    fr.foot.appendChild(fr.cancel());
    fr.foot.appendChild(btn('pen-studio-btn primary pen-studio-savenew-go', L.SAVE_NEW || 'Save as new', save));
    return fr.scrim;
  }

  function render(ctx) {
    const ov = ctx.getState().overlay;
    if (!ov) return null;
    switch (ov.kind) {
      case 'add': return addDialog(ctx, ov);
      case 'export': return exportDialog(ctx, ov);
      case 'import': return importDialog(ctx, ov);
      case 'saveNew': return saveNewDialog(ctx, ov);
      default: return null;
    }
  }

  UI.PenStudioDialogs = { render };
})();
