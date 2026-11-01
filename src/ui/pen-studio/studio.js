/**
 * Pen Studio shell — window.Vectura.UI.PenStudio.
 *
 *   open({ app, penId?, anchorEl? }) -> handle { close, isOpen, ctx }
 *   close()   isOpen()
 *
 * A large modal (UI.overlays.Modal, class `pen-studio`) with three columns:
 * boxes (UI.PenStudioBoxes) | pen header + lab (UI.PenStudioLab) | pair
 * (UI.PenStudioPair). The shell owns the session state, the ctx shared with
 * the sub-views, the pen header (click-to-edit name / description, move,
 * export, "Use in document") and the dialog layer (UI.PenStudioDialogs).
 *
 * Session state lives in module memory only (never persisted). The Studio
 * paper is local state: nothing here writes the project paper or SETTINGS
 * except "Use in document", which is one undo step.
 */
(() => {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.PenStudio) return;

  const L = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_STUDIO) || {};
  const cfg = () => Vectura.PEN_STUDIO || {};
  const store = () => Vectura.PenStudioStore;
  const draftApi = () => Vectura.PenStudioDraft;
  const fmt = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  const lim = () => cfg().LIMITS || {};

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

  const freshState = () => ({
    selPenId: null,
    selBoxId: null,
    testSize: null,
    paperType: 'bristol-smooth',
    view: 'one',
    comp: null,
    n: (cfg().WEAVE && cfg().WEAVE.default) || 5,
    weave: 'alt',
    drafts: {},
    editing: null,
    note: null,
    overlay: null,
  });

  let state = freshState();
  let session = null;

  const penById = (doc, id) => (doc && doc.pens || []).find((p) => p.id === id) || null;

  // ---- derived helpers (also exposed on ctx) --------------------------------

  const modelOf = (pen) => {
    const M = Vectura.PEN_MODELS && Vectura.PEN_MODELS.MODELS;
    return pen && pen.model && M ? M[pen.model] || null : null;
  };

  const selPen = () => penById(session.doc, state.selPenId);
  const selBox = () => {
    const S = store();
    return state.selPenId && S ? S.boxOf(session.doc, state.selPenId) : null;
  };
  const ownedSizes = () => {
    const box = selBox();
    const item = box && box.items.find((i) => i.penId === state.selPenId);
    return item ? item.sizes.slice() : [];
  };
  const testSizeLabel = () => {
    const owned = ownedSizes();
    if (state.testSize && owned.indexOf(state.testSize) >= 0) return state.testSize;
    return owned[0] || null;
  };
  const targetDocPen = () => {
    const pens = (Vectura.SETTINGS && Vectura.SETTINGS.pens) || [];
    return session && session.targetId ? pens.find((p) => p && p.id === session.targetId) || null : null;
  };
  const draftOf = (penId) => state.drafts[penId] || { ink: {} };

  const ensureSelection = () => {
    const S = store();
    const doc = session.doc;
    let pen = state.selPenId ? penById(doc, state.selPenId) : null;
    let box = pen ? S.boxOf(doc, pen.id) : null;
    if (!pen || !box) {
      pen = null; box = null;
      const boxes = S.sortedBoxes(doc);
      for (let i = 0; i < boxes.length && !pen; i += 1) {
        const it = boxes[i].items[0];
        if (it) { pen = penById(doc, it.penId); box = boxes[i]; }
      }
    }
    state.selPenId = pen ? pen.id : null;
    state.selBoxId = box ? box.id : (state.selBoxId && doc.boxes.some((b) => b.id === state.selBoxId) ? state.selBoxId : null);
    if (state.testSize && ownedSizes().indexOf(state.testSize) < 0) state.testSize = null;
  };

  // ---- ctx -------------------------------------------------------------------

  const setNote = (text, tone) => { state.note = text ? { text, tone: tone || 'ok' } : null; };

  const makeCtx = (app) => ({
    app,
    getDoc: () => session.doc,
    setDoc(doc) {
      session.doc = doc;
      const res = store().save(doc);
      if (res && res.ok === false) {
        setNote(res.reason === 'quota' ? (L().ERR_QUOTA || 'Storage is full. Changes are kept until you close Pen Studio.') : (L().ERR_UNAVAILABLE || 'Storage is unavailable. Changes are kept until you close Pen Studio.'), 'warn');
      }
      render();
    },
    getState: () => state,
    set(patch) {
      Object.assign(state, patch || {});
      render();
    },
    L,
    cfg,
    fmt,
    selPen,
    selBox,
    ownedSizes,
    testSizeLabel,
    draftOf,
    afterRender: (fn) => { if (session) session.afterRender.push(fn); },
    get targetDocPen() { return targetDocPen(); },
  });

  // ---- apply to document -------------------------------------------------------

  const toast = (message, variant) => {
    const T = UI.overlays && UI.overlays.Toast;
    if (T && typeof T.show === 'function') {
      try { T.show({ message, variant: variant || 'success' }); } catch (_e) { /* best-effort */ }
    }
  };

  const effectivePen = (pen) => {
    const d = state.drafts[pen.id];
    const D = draftApi();
    const eff = Object.assign({}, pen);
    if (d) {
      if (d.name) eff.name = d.name;
      if (d.desc != null) eff.desc = d.desc;
      eff.ink = D && D.effectiveInk ? D.effectiveInk(pen, d) : Object.assign({}, pen.ink || {}, d.ink || {});
    }
    return eff;
  };

  function useInDocument() {
    const pen = selPen();
    const label = testSizeLabel();
    if (!pen || !label) return false;
    const PL = Vectura.PenLibrary;
    const rec = store().toDocPen(effectivePen(pen), label);
    const app = session.app;
    const target = targetDocPen();
    let done = false;
    if (target) {
      const PP = Vectura.PensPanel || UI.PensPanel;
      done = !!(PP && PP.commitPenEdit && PP.commitPenEdit(app, target, (d) => (PL.applyEntry(d, rec) ? true : false)));
    } else if (PL && Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) {
      const file = PL.toFilePen(rec);
      if (file) {
        const pens = Vectura.SETTINGS.pens;
        if (app && app.pushHistory) app.pushHistory();
        const added = Object.assign({ id: PL.newPenId(new Set(pens.map((p) => p && p.id))) }, file, { themeManaged: false });
        pens.push(added);
        session.targetId = added.id;
        const ui = app && app.ui;
        if (ui && ui.renderPens) ui.renderPens();
        if (ui && ui.renderLayers) ui.renderLayers();
        if (app && app.render) app.render();
        done = true;
      }
    }
    if (done) {
      const msg = fmt(L().TOAST_APPLIED || 'Applied {name}', { name: rec.name });
      toast(msg, 'success');
      setNote(msg, 'ok');
    } else {
      setNote(L().NOTE_NO_CHANGE || 'The document pen already matches.', 'warn');
    }
    render();
    return done;
  }

  // ---- pen header --------------------------------------------------------------

  const displayName = (pen) => {
    const d = state.drafts[pen.id];
    return (d && d.name) || pen.name;
  };
  const defaultDesc = (pen) => {
    const m = modelOf(pen);
    if (!m) return '';
    const CL = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.CLASS_LABELS) || {};
    return `${m.label}${CL[m.inkClass] ? ` · ${CL[m.inkClass]}` : ''}`;
  };
  const savedDesc = (pen) => pen.desc || defaultDesc(pen);
  const displayDesc = (pen) => {
    const d = state.drafts[pen.id];
    return d && d.desc != null ? d.desc : savedDesc(pen);
  };

  function commitEdit(kind, raw) {
    const pen = selPen();
    if (!pen) return;
    const max = kind === 'name' ? (lim().nameMax || 48) : (lim().descMax || 80);
    const value = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, max);
    const d = Object.assign({ ink: {} }, state.drafts[pen.id]);
    if (kind === 'name') {
      if (!value || value === pen.name) delete d.name; else d.name = value;
    } else if (value === savedDesc(pen)) delete d.desc;
    else d.desc = value;
    const drafts = Object.assign({}, state.drafts, { [pen.id]: d });
    state.drafts = drafts;
    state.editing = null;
    state.note = null;
    render();
  }

  function editable(kind, cls, text, placeholder) {
    if (state.editing === kind) {
      const input = h('input', `pen-studio-edit ${cls}`);
      input.type = 'text';
      input.value = text;
      input.maxLength = kind === 'name' ? (lim().nameMax || 48) : (lim().descMax || 80);
      input.setAttribute('data-ps-focus', `edit-${kind}`);
      input.setAttribute('aria-label', kind === 'name' ? (L().FIELD_NAME || 'Name') : (L().FIELD_DESC || 'Description'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitEdit(kind, input.value); }
      });
      input.addEventListener('blur', () => { if (state.editing === kind) commitEdit(kind, input.value); });
      session.afterRender.push(() => { input.focus(); input.select(); });
      session.editInputs[kind] = input;
      return input;
    }
    const b = btn(`pen-studio-editable ${cls}`, text || placeholder || '', () => { state.editing = kind; render(); }, {
      title: kind === 'name' ? (L().CLICK_RENAME || 'Click to rename') : (L().CLICK_EDIT_DESC || 'Click to edit the description'),
    });
    if (!text) b.classList.add('is-placeholder');
    return b;
  }

  function buildHeader() {
    const S = store();
    const pen = selPen();
    const wrap = h('div', 'pen-studio-head');
    if (!pen) {
      wrap.appendChild(h('p', 'pen-studio-empty', L().EMPTY_BOX || 'Add a pen to a box to start.'));
      return wrap;
    }
    const m = modelOf(pen);
    const dirty = !!(draftApi() && draftApi().isDirty && draftApi().isDirty(pen, state.drafts[pen.id]));

    const swatch = h('span', 'pen-studio-swatch');
    swatch.style.background = pen.color;
    const text = h('div', 'pen-studio-head-text');
    const nameRow = h('div', 'pen-studio-name-row');
    nameRow.appendChild(editable('name', 'pen-studio-name', displayName(pen)));
    const badge = h('span', 'pen-studio-badge', m
      ? `${m.label}${typeof m.confidence === 'number' ? ` · ${Math.round(m.confidence * 100)}%` : ''}`
      : (L().ADD_PLAIN_MODEL || 'Plain pen'));
    if (m && typeof m.confidence === 'number') badge.title = fmt(L().CONFIDENCE_TITLE || 'Model confidence {pct}%', { pct: Math.round(m.confidence * 100) });
    nameRow.appendChild(badge);
    if (dirty) nameRow.appendChild(h('span', 'pen-studio-unsaved', L().UNSAVED || 'Unsaved changes'));
    text.appendChild(nameRow);
    text.appendChild(editable('desc', 'pen-studio-desc', displayDesc(pen), L().DESC_PLACEHOLDER || 'Add a description'));

    const actions = h('div', 'pen-studio-head-actions');
    const move = h('select', 'pen-studio-move');
    move.setAttribute('aria-label', L().MOVE_TO || 'Move to box');
    const cur = selBox();
    S.sortedBoxes(session.doc).forEach((b) => {
      const o = h('option', null, b.name);
      o.value = b.id;
      if (cur && b.id === cur.id) o.selected = true;
      move.appendChild(o);
    });
    move.title = L().MOVE_TO || 'Move to box';
    move.addEventListener('change', () => {
      if (!cur || move.value === cur.id) return;
      const to = move.value;
      session.ctx.setDoc(S.movePen(session.doc, pen.id, cur.id, to));
      state.selBoxId = to;
      render();
    });
    actions.appendChild(move);
    actions.appendChild(btn('pen-studio-btn pen-studio-export-pen', L().EXPORT_PEN || 'Export pen', () => {
      const label = testSizeLabel();
      let doc = session.doc;
      if (dirty && S.updatePen) doc = S.updatePen(doc, pen.id, { name: displayName(pen), desc: displayDesc(pen), ink: effectivePen(pen).ink });
      const res = S.exportPen(doc, pen.id, label);
      state.overlay = res && res.ok
        ? { kind: 'export', title: fmt(L().EXPORT_PEN_TITLE || 'Export pen: {name}', { name: displayName(pen) }), text: res.text, filename: res.filename }
        : { kind: 'export', title: L().EXPORT_PEN || 'Export pen', text: '', error: true, filename: 'pen.vectura-pens.json' };
      render();
    }));
    const target = targetDocPen();
    const use = btn('pen-studio-btn pen-studio-use primary', target
      ? fmt(L().USE_REPLACE || 'Apply to {pen}', { pen: target.name })
      : (L().USE_ADD || 'Add to document'), () => useInDocument());
    use.disabled = !testSizeLabel();
    actions.appendChild(use);

    wrap.appendChild(swatch);
    wrap.appendChild(text);
    wrap.appendChild(actions);
    if (state.note && state.note.text) {
      const n = h('div', `pen-studio-note tone-${state.note.tone || 'ok'}`, state.note.text);
      n.setAttribute('role', 'status');
      wrap.appendChild(n);
    }
    return wrap;
  }

  // ---- render --------------------------------------------------------------------

  function mountSub(key, name, host) {
    const C = UI[name];
    if (!C || typeof C.mount !== 'function') return;
    if (!session[key]) session[key] = C.mount(host, session.ctx);
    else if (session[key].update) session[key].update();
  }

  function render() {
    if (!session) return;
    const doc = document;
    const active = doc.activeElement;
    const focusKey = active && active.getAttribute ? active.getAttribute('data-ps-focus') : null;
    session.afterRender = [];
    session.editInputs = {};
    ensureSelection();

    session.headHost.replaceChildren(buildHeader());
    const hasPen = !!state.selPenId;
    session.labHost.hidden = !hasPen;
    session.pairHost.hidden = !hasPen;
    if (hasPen) {
      mountSub('lab', 'PenStudioLab', session.labHost);
      mountSub('pair', 'PenStudioPair', session.pairHost);
    }
    mountSub('boxes', 'PenStudioBoxes', session.boxesHost);

    const D = UI.PenStudioDialogs;
    const ov = D && D.render ? D.render(session.ctx) : null;
    session.overlayHost.replaceChildren();
    if (ov) session.overlayHost.appendChild(ov);
    session.overlayHost.hidden = !ov;

    session.afterRender.forEach((fn) => fn());
    if (focusKey && !session.afterRender.length) {
      const again = session.root.querySelector(`[data-ps-focus="${focusKey}"]`);
      if (again && again !== doc.activeElement) again.focus();
    }
  }

  // Esc peels one layer: dialog, then an inline edit, then (via Modal) the Studio.
  function onKeyCapture(e) {
    if (e.key !== 'Escape' || !session) return;
    if (state.overlay) {
      e.stopImmediatePropagation();
      e.preventDefault();
      state.overlay = null;
      render();
    } else if (state.editing) {
      e.stopImmediatePropagation();
      e.preventDefault();
      state.editing = null;
      render();
    }
  }

  function teardown() {
    if (!session) return;
    const s = session;
    session = null;
    document.removeEventListener('keydown', onKeyCapture, true);
    ['lab', 'pair', 'boxes'].forEach((k) => { if (s[k] && s[k].destroy) { try { s[k].destroy(); } catch (_e) { /* best-effort */ } } });
    if (s.modal) s.modal.destroy();
    const back = s.anchorEl && s.anchorEl.isConnected ? s.anchorEl : s.prevFocus;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  }

  function pickInitialPen(doc, docPenId) {
    const target = docPenId && Vectura.SETTINGS && (Vectura.SETTINGS.pens || []).find((p) => p && p.id === docPenId);
    if (!target) return;
    const hit = (doc.pens || []).find((p) => p.name === target.name && String(p.color).toLowerCase() === String(target.color).toLowerCase());
    if (hit) { state.selPenId = hit.id; state.testSize = null; }
  }

  function open(opts = {}) {
    if (session) return session.handle;
    const S = store();
    if (!S) return null;
    const modal = UI.overlays && UI.overlays.Modal;
    if (!modal) return null;
    const doc = S.load();
    session = {
      app: opts.app || null,
      doc,
      targetId: opts.penId || null,
      anchorEl: opts.anchorEl || null,
      prevFocus: document.activeElement,
      afterRender: [],
      editInputs: {},
    };
    session.ctx = makeCtx(opts.app || null);
    pickInitialPen(doc, opts.penId);

    const m = modal(document.body, {
      ariaLabel: L().TITLE || 'Pen Studio',
      keyboard: true,
      dismissOnBackdrop: false,
      onClose: teardown,
    });
    session.modal = m;
    m.dialog.classList.add('pen-studio');
    m.el.classList.add('pen-studio-backdrop');

    const root = h('div', 'pen-studio-shell');
    session.root = root;
    const top = h('header', 'pen-studio-top');
    const titles = h('div', 'pen-studio-titles');
    titles.appendChild(h('h2', 'pen-studio-title', L().TITLE || 'Pen Studio'));
    titles.appendChild(h('p', 'pen-studio-subtitle', L().SUBTITLE || 'Test pens on paper, tune them, and keep them in boxes.'));
    top.appendChild(titles);
    top.appendChild(btn('pen-studio-btn pen-studio-close', L().CLOSE || 'Close', () => handle.close(), { 'aria-label': L().CLOSE || 'Close' }));
    root.appendChild(top);

    const cols = h('div', 'pen-studio-cols');
    session.boxesHost = h('aside', 'pen-studio-boxes');
    const center = h('section', 'pen-studio-main');
    session.headHost = h('div', 'pen-studio-head-host');
    session.labHost = h('div', 'pen-studio-lab-host');
    center.appendChild(session.headHost);
    center.appendChild(session.labHost);
    session.pairHost = h('aside', 'pen-studio-pair-host');
    cols.appendChild(session.boxesHost);
    cols.appendChild(center);
    cols.appendChild(session.pairHost);
    root.appendChild(cols);
    session.overlayHost = h('div', 'pen-studio-overlay-host');
    session.overlayHost.hidden = true;
    root.appendChild(session.overlayHost);
    m.body.appendChild(root);

    document.addEventListener('keydown', onKeyCapture, true);
    const handle = {
      close: () => { if (session && session.modal) session.modal.close(); },
      isOpen: () => !!session,
      get ctx() { return session ? session.ctx : null; },
    };
    session.handle = handle;
    m.open();
    render();
    return handle;
  }

  UI.PenStudio = {
    open,
    close: () => { if (session) session.handle.close(); },
    isOpen: () => !!session,
    // Test seam: forget session state (module memory) between suites.
    _reset: () => { if (session) session.handle.close(); state = freshState(); },
    _commitEdit: commitEdit,
  };
})();
