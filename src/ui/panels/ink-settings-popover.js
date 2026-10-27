/**
 * Pen models UI — window.Vectura.UI.InkSettings.
 *
 * Two anchored popovers for a document pen (a bottom sheet on touch):
 *
 *   openModelPicker({ anchorEl, penId, app })
 *     Searchable list of pen models grouped by ink class, "Plain colour pen"
 *     first, each with a sample stroke drawn by Vectura.InkRenderer on the
 *     project paper. Picking a model writes model + default size + laid width
 *     (Vectura.PenModel.applyModel) in ONE undo step and cascades the width to
 *     the pen's layers (PensPanel.commitPenEdit).
 *
 *   openInkSettings({ anchorEl, penId, app })
 *     Model + size, the model's own colours, and the ink sliders (Bleed, Edge
 *     roughness, Opacity, Blobs & pools, Skips, Width jitter) that write
 *     pen.ink overrides. One undo step per slider drag / keyboard session,
 *     armed by the first input that actually changes the value (focus, Tab
 *     and no-op keys push nothing). "Reset to model defaults" removes the
 *     overrides in one step.
 *
 *   close(), isOpen(), refresh()
 *
 * Strings: UI_CONSTANTS.PEN_MODELS_UI. Ranges: PEN_MODELS.PARAM_LIMITS.
 * CSS: the "PEN MODELS" block in src/ui/skin/components.css.
 * Everything is preview only: SVG export plots pen.width in pen.color.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.InkSettings) return;

  const L = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_MODELS_UI) || {};
  const esc = (v) => (UI.utils && UI.utils.escapeHtml ? UI.utils.escapeHtml(v) : `${v ?? ''}`.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const settings = () => Vectura.SETTINGS || {};
  const penById = (id) => (settings().pens || []).find((p) => p && p.id === id) || null;
  const commit = (app, pen, fn, opts) => {
    const PP = Vectura.PensPanel || UI.PensPanel;
    return PP && PP.commitPenEdit ? PP.commitPenEdit(app, pen, fn, opts) : false;
  };

  let state = null;

  const close = () => {
    if (!state) return;
    const { el, doc, onDown, onKey, anchorEl } = state;
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('keydown', onKey, true);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    const returnFocus = state.returnFocus && anchorEl && anchorEl.isConnected ? anchorEl : null;
    state = null;
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
  };

  const isOpen = () => Boolean(state);

  const anchorFor = () => {
    if (!state) return null;
    if (state.anchorEl && state.anchorEl.isConnected) return state.anchorEl;
    // The pens list re-renders after an edit: re-find the row's control.
    const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(state.penId) : state.penId;
    const row = state.doc.querySelector(`.pen-item[data-pen-id="${sel}"]`);
    const next = row && row.querySelector(state.kind === 'model' ? '.pen-model-chip' : '.pen-ink-btn');
    if (next) state.anchorEl = next;
    return next || null;
  };

  const position = () => {
    if (!state) return;
    const { el } = state;
    const win = state.doc.defaultView || G;
    const sheet = state.doc.body && state.doc.body.classList.contains('touch-ui');
    el.classList.toggle('as-sheet', Boolean(sheet));
    if (sheet) { el.style.left = ''; el.style.top = ''; el.style.bottom = ''; return; }
    const a = anchorFor();
    const r = a && a.getBoundingClientRect ? a.getBoundingClientRect() : { left: win.innerWidth / 2, top: win.innerHeight / 2, width: 0, height: 0 };
    const off = L().OFFSET_PX ?? 6;
    const w = el.offsetWidth || 288;
    const below = win.innerHeight - (r.top + r.height);
    const above = below < (L().FLIP_THRESHOLD_PX ?? 360) && r.top > below;
    el.style.left = `${Math.max(8, Math.min(win.innerWidth - w - 8, Math.round(r.left)))}px`;
    if (above) { el.style.top = 'auto'; el.style.bottom = `${Math.round(win.innerHeight - r.top + off)}px`; } else { el.style.bottom = 'auto'; el.style.top = `${Math.round(r.top + r.height + off)}px`; }
  };

  const mount = (opts, kind, cls, title) => {
    close();
    const app = opts.app || G.app || null;
    const pen = penById(opts.penId);
    if (!app || !pen) return null;
    const doc = (opts.anchorEl && opts.anchorEl.ownerDocument) || G.document;
    const el = doc.createElement('div');
    el.className = `ink-pop ${cls}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    doc.body.appendChild(el);
    const onDown = (e) => {
      if (!state) return;
      if (state.el.contains(e.target)) return;
      const a = anchorFor();
      if (a && a.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (!state || e.key !== 'Escape') return;
      e.stopPropagation();
      state.returnFocus = true;
      close();
    };
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('keydown', onKey, true);
    state = { el, doc, app, penId: pen.id, kind, anchorEl: opts.anchorEl || null, onDown, onKey, returnFocus: false };
    return { el, app, pen, doc };
  };

  const header = (title, sub) => `
    <div class="ink-pop-head">
      <div class="ink-pop-title">${esc(title)}${sub ? `<span class="ink-pop-sub">${esc(sub)}</span>` : ''}</div>
      <button type="button" class="ink-pop-close" aria-label="${esc(L().CLOSE || 'Close')}">✕</button>
    </div>`;

  const bindClose = (el) => {
    const btn = el.querySelector('.ink-pop-close');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); state && (state.returnFocus = true); close(); });
  };

  // ---- model picker --------------------------------------------------------

  const samplePaper = () => {
    const P = Vectura.Paper;
    return P ? P.effective() : { type: 'none', color: '#ffffff', texture: 0, bleed: 0, seed: 1 };
  };

  const drawSampleInto = (canvas, pen) => {
    const IR = Vectura.InkRenderer;
    if (!IR || !canvas) return;
    const dpr = (G.devicePixelRatio || 1);
    const w = canvas.clientWidth || 88;
    const h = canvas.clientHeight || 22;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const paper = samplePaper();
    try {
      IR.drawSample(canvas, pen, paper, { widthMm: L().SAMPLE_WIDTH_MM || 14, background: paper.color });
    } catch (_e) { /* thumbnail only */ }
  };

  const openModelPicker = (opts = {}) => {
    const LB = L();
    const m = mount(opts, 'model', 'ink-pop-models', LB.PICKER_TITLE || 'Pen model');
    if (!m) return null;
    const { el, app, pen } = m;
    const PM = Vectura.PenModel;
    const C = Vectura.PEN_MODELS || { MODELS: {}, ORDER: [], CLASS_ORDER: [], CLASS_LABELS: {} };
    el.innerHTML = `${header(LB.PICKER_TITLE || 'Pen model', pen.name)}
      <input type="search" class="ink-pop-search" placeholder="${esc(LB.SEARCH_PLACEHOLDER || 'Search pens')}" aria-label="${esc(LB.SEARCH_PLACEHOLDER || 'Search pens')}" autocomplete="off" spellcheck="false">
      <div class="ink-pop-list" role="listbox" aria-label="${esc(LB.PICKER_TITLE || 'Pen model')}"></div>`;
    bindClose(el);
    const list = el.querySelector('.ink-pop-list');
    const search = el.querySelector('.ink-pop-search');
    const current = PM && PM.modelOf(pen) ? pen.model : 'plain';

    const rowHtml = (id, name, sub, approx) => `
      <button type="button" class="ink-model-row${id === current ? ' active' : ''}" role="option" aria-selected="${id === current}" data-model-id="${esc(id)}">
        <canvas class="ink-model-sample" aria-hidden="true"></canvas>
        <span class="ink-model-text"><span class="ink-model-name">${esc(name)}</span><span class="ink-model-sub">${esc(sub)}</span></span>
        ${approx ? `<span class="ink-model-approx" title="${esc(LB.APPROX_TITLE || '')}">${esc(LB.APPROX || 'approx.')}</span>` : ''}
      </button>`;

    const render = (term = '') => {
      const q = term.trim().toLowerCase();
      const match = (m2) => !q || `${m2.label} ${m2.short} ${m2.brand} ${m2.inkClass}`.toLowerCase().includes(q);
      let html = '';
      if (!q || `${LB.PLAIN_ROW || 'plain'} plain`.toLowerCase().includes(q)) html += rowHtml('plain', LB.PLAIN_ROW || 'Plain colour pen', LB.PLAIN_HINT || '', false);
      (C.CLASS_ORDER || []).forEach((cls) => {
        const ids = (C.ORDER || []).filter((id) => C.MODELS[id] && C.MODELS[id].inkClass === cls && match(C.MODELS[id]));
        if (!ids.length) return;
        html += `<div class="ink-model-group" role="presentation">${esc((C.CLASS_LABELS || {})[cls] || cls)}</div>`;
        ids.forEach((id) => {
          const md = C.MODELS[id];
          const sz = PM ? PM.defaultSizeOf(md) : null;
          html += rowHtml(id, md.label.toLowerCase().startsWith(md.brand.toLowerCase()) ? md.label : `${md.brand} ${md.label}`, sz ? `${sz.label} · ${Number(sz.laidWidthMm).toFixed(2)} mm` : '', md.confidence < 0.5);
        });
      });
      list.innerHTML = html || `<div class="ink-model-empty">${esc(LB.NO_MATCH || 'No pen matches')}</div>`;
      list.querySelectorAll('.ink-model-row').forEach((row) => {
        const id = row.dataset.modelId;
        const sample = { ...pen, id: `${pen.id}-sample` };
        if (PM) {
          delete sample.ink;
          if (id === 'plain') { delete sample.model; delete sample.size; } else PM.applyModel(sample, id);
        }
        drawSampleInto(row.querySelector('canvas'), sample);
      });
    };
    render();
    search.addEventListener('input', () => render(search.value));
    list.addEventListener('click', (e) => {
      const row = e.target && e.target.closest ? e.target.closest('.ink-model-row') : null;
      if (!row || !list.contains(row)) return;
      e.preventDefault();
      const id = row.dataset.modelId;
      const live = penById(state && state.penId);
      if (!live) { close(); return; }
      commit(app, live, (draft) => {
        if (id === 'plain') { if (!PM.modelOf(draft)) return false; PM.applyModel(draft, null); return true; }
        if (draft.model === id) return false;
        PM.applyModel(draft, id);
        return true;
      });
      if (state) state.returnFocus = true;
      close();
    });
    position();
    if (typeof search.focus === 'function') search.focus();
    return { el, close };
  };

  // ---- ink settings --------------------------------------------------------

  const fmt = (v, kind) => (kind === 'x' ? `×${Number(v).toFixed(2)}` : `${Math.round(Number(v) * 1000) / 10}%`);

  const openInkSettings = (opts = {}) => {
    const LB = L();
    const m = mount(opts, 'ink', 'ink-pop-settings', LB.INK_TITLE || 'Ink');
    if (!m) return null;
    const { el, app } = m;
    const PM = Vectura.PenModel;
    const C = Vectura.PEN_MODELS || { PARAM_LIMITS: {} };

    const build = () => {
      const pen = penById(state && state.penId);
      if (!pen) { close(); return; }
      const model = PM ? PM.modelOf(pen) : null;
      const sliders = (LB.SLIDERS || []).filter((sd) => C.PARAM_LIMITS[sd.key]);
      const colours = model ? model.colours.filter((c) => c.effect === 'plain') : [];
      const sizeOpts = model ? model.sizes.map((sz) => `<option value="${esc(sz.label)}"${sz.label === pen.size ? ' selected' : ''}>${esc(sz.label)} · ${Number(sz.laidWidthMm).toFixed(2)} mm</option>`).join('')
        + (model.sizes.some((sz) => sz.label === pen.size) ? '' : `<option value="custom" selected>${esc(LB.CUSTOM_SIZE || 'custom')} · ${Number(pen.width).toFixed(2)} mm</option>`) : '';
      const note = `${LB.PREVIEW_NOTE || ''}`.replace('{width}', Number(pen.width).toFixed(2));
      el.innerHTML = `${header(LB.INK_TITLE || 'Ink', pen.name)}
        <div class="ink-pop-body">
          <div class="ink-row">
            <span class="ink-row-label">${esc(LB.MODEL_LABEL || 'Model')}</span>
            <button type="button" class="ink-model-btn" aria-haspopup="dialog">${esc(PM ? PM.labelOf(pen) : 'Plain')}</button>
            ${model && model.confidence < 0.5 ? `<span class="ink-model-approx" title="${esc(LB.APPROX_TITLE || '')}">${esc(LB.APPROX || 'approx.')}</span>` : ''}
          </div>
          ${model ? `<div class="ink-row"><label class="ink-row-label" for="ink-size">${esc(LB.SIZE_LABEL || 'Pen size')}</label><select id="ink-size" class="ink-size">${sizeOpts}</select></div>` : ''}
          ${colours.length ? `<div class="ink-row ink-row-colours"><span class="ink-row-label">${esc(LB.MODEL_COLOURS || 'Model colours')}</span><div class="ink-swatches">${colours.map((c) => `<button type="button" class="ink-swatch${`${c.hex}`.toLowerCase() === `${pen.color}`.toLowerCase() ? ' active' : ''}" data-hex="${esc(c.hex)}" title="${esc(c.name)}" aria-label="${esc(c.name)}" style="--swatch:${esc(c.hex)}"></button>`).join('')}</div></div>` : ''}
          ${sliders.map((sd) => {
            const lim = C.PARAM_LIMITS[sd.key];
            const v = PM ? PM.inkValue(pen, sd.key) : 0;
            const changed = Boolean(pen.ink && Object.prototype.hasOwnProperty.call(pen.ink, sd.key));
            return `<div class="ink-row ink-slider-row${changed ? ' changed' : ''}">
              <label class="ink-row-label" for="ink-${esc(sd.key)}" title="${esc(sd.hint || '')}">${esc(sd.label)}</label>
              <input type="range" id="ink-${esc(sd.key)}" class="ctrl-slider ink-slider" data-key="${esc(sd.key)}" data-fmt="${esc(sd.fmt || 'pct')}" min="${lim[0]}" max="${lim[1]}" step="${sd.step || 0.01}" value="${v}">
              <span class="ink-slider-value">${esc(fmt(v, sd.fmt))}</span>
            </div>`;
          }).join('')}
          <div class="ink-actions"><button type="button" class="ink-reset"${PM && PM.hasInk(pen) ? '' : ' disabled'}>${esc(LB.RESET || 'Reset to model defaults')}</button></div>
          <p class="ink-note">${esc(note)}</p>
        </div>`;
      bindClose(el);
      const modelBtn = el.querySelector('.ink-model-btn');
      if (modelBtn) modelBtn.addEventListener('click', (e) => { e.preventDefault(); const a = anchorFor(); openModelPicker({ anchorEl: a, penId: pen.id, app }); });
      const sizeSel = el.querySelector('.ink-size');
      if (sizeSel) sizeSel.addEventListener('change', () => {
        const label = sizeSel.value;
        if (label === 'custom') return;
        commit(app, penById(state.penId), (draft) => { PM.applySize(draft, label); });
        build();
        position();
      });
      el.querySelectorAll('.ink-swatch').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        const hex = b.dataset.hex;
        commit(app, penById(state.penId), (draft) => { if (`${draft.color}`.toLowerCase() === `${hex}`.toLowerCase()) return false; draft.color = hex; draft.themeManaged = false; return true; });
        build();
      }));
      // Sliders: live preview while dragging; ONE undo step per drag /
      // keyboard session, armed by the first real change.
      el.querySelectorAll('.ink-slider').forEach((input) => {
        let armed = false;
        const key = input.dataset.key;
        const readout = input.parentNode.querySelector('.ink-slider-value');
        input.addEventListener('input', () => {
          const live = penById(state && state.penId);
          if (!live) return;
          const lim = C.PARAM_LIMITS[key];
          const v = Math.max(lim[0], Math.min(lim[1], Number(input.value)));
          if (!Number.isFinite(v)) return;
          if (Math.abs(PM.inkValue(live, key) - v) < 1e-9) return;
          if (!armed && app.pushHistory) app.pushHistory();
          armed = true;
          live.ink = Object.assign({}, live.ink || {}, { [key]: v });
          if (readout) readout.textContent = fmt(v, input.dataset.fmt);
          input.parentNode.classList.add('changed');
          const reset = el.querySelector('.ink-reset');
          if (reset) reset.disabled = false;
          if (app.render) app.render();
        });
        input.addEventListener('change', () => {
          armed = false;
          const row = state && state.doc.querySelector(`.pen-item[data-pen-id="${state.penId}"] .pen-ink-btn`);
          const live = penById(state && state.penId);
          if (row && live && PM) row.classList.toggle('has-overrides', PM.hasInk(live));
        });
      });
      const reset = el.querySelector('.ink-reset');
      if (reset) reset.addEventListener('click', (e) => {
        e.preventDefault();
        commit(app, penById(state.penId), (draft) => { if (!draft.ink) return false; delete draft.ink; return true; });
        build();
      });
    };
    build();
    position();
    const first = el.querySelector('.ink-model-btn');
    if (first && typeof first.focus === 'function') first.focus();
    return { el, close };
  };

  const refresh = () => {
    if (!state) return;
    position();
  };

  UI.InkSettings = { openModelPicker, openInkSettings, close, isOpen, refresh };
})();
