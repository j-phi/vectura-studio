/**
 * Paper panel (paper selector) — window.Vectura.UI.PaperPanel.
 *
 * The "Paper" section at the top of the right pane's Pen / Paper tab:
 *   - swatch grid of paper types (radiogroup, ≥44 px targets, thumbnails from
 *     Vectura.PaperTexture.thumbDataURL)
 *   - paper colour (any colour) — picking a type resets the colour to that
 *     type's stock colour; editing the colour keeps the type
 *   - Texture / Ink bleed sliders (disabled for 'none')
 *   - "Set as default" (writes the user's single default paper, a preference)
 *     and "Use default" (applies the default to this document, with undo)
 *   - a "Default" badge when the project paper equals the default
 *   - custom papers ("My papers", browser-local via Vectura.Paper.customLibrary):
 *     custom swatches after the built-ins (each with a ⋯ menu: Rename /
 *     Delete / Export), "+ Save as custom…", a section ⋯ menu (Export all /
 *     Import…), a "From file — Save to my papers" status for a paper that
 *     came inside the document, and an Advanced disclosure (realism
 *     parameter sliders, custom papers only; one undo step per drag;
 *     "Update saved paper")
 *
 * Every project write goes through app.setProjectPaper (→ Vectura.Paper.setActive),
 * one undo checkpoint per edit session (a click, a colour-picker session, a
 * slider drag).
 *
 * DI bag (bind): { getEl, getContrastTextColor, openColorPickerAnchoredTo }
 * Installed methods: initPaperSection(), refreshPaperUI().
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) throw new Error(`PaperPanel.${name} invoked before PaperPanel.bind(deps) — load order broken`);
    return DEPS;
  };

  const strings = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PAPER_PANEL) || {};
  const settings = () => Vectura.SETTINGS || {};
  // Canonical escaper (src/ui/utils.js), resolved at call time.
  const esc = (v) => UI.utils.escapeHtml(v);

  const currentPaper = () => {
    const P = Vectura.Paper;
    return P ? P.effective() : { type: 'none', color: settings().bgColor || '#ffffff', texture: 0, bleed: 0, seed: 1 };
  };

  const pct = (v) => Math.round((Number(v) || 0) * 100);
  const CSS_ESCAPE = (v) => (G.CSS && typeof G.CSS.escape === 'function' ? G.CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));

  const fmt = (template, vars) => String(template || '').replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));

  const Paper = () => Vectura.Paper;
  const library = () => (Vectura.Paper && Vectura.Paper.customLibrary ? Vectura.Paper.customLibrary() : null);
  const toast = (message, variant = 'info') => {
    const T = UI.overlays && UI.overlays.Toast;
    if (T && typeof T.show === 'function') {
      try { T.show({ message, variant }); } catch (_e) { /* toast is best-effort */ }
    }
  };
  const errorText = (reason) => {
    const E = strings().ERRORS || {};
    return E[reason] || E.invalid || 'Something went wrong.';
  };

  // The custom swatches: every library entry, plus the project's own custom
  // paper when it came from a file (not in the library).
  const customSwatchModel = () => {
    const P = Paper();
    const lib = library();
    if (!P || !lib) return { entries: [], fromFile: null };
    const entries = P.syncCustomTypes ? P.syncCustomTypes() : lib.list();
    const cur = currentPaper();
    const fromFile = cur.custom && P.isCustomId(cur.type) && !entries.some((e) => e.id === cur.type)
      ? { id: cur.type, name: cur.custom.name }
      : null;
    return { entries, fromFile };
  };

  const customSwatchHtml = (id, name, fromFile) => {
    const S = strings();
    const PT = Vectura.PaperTexture;
    const thumb = PT && PT.thumbDataURL ? PT.thumbDataURL(id, { px: S.THUMB_PX || 96 }) : '';
    const info = (Vectura.PAPERS && Vectura.PAPERS.TYPES && Vectura.PAPERS.TYPES[id]) || {};
    const label = esc(name);
    const suffix = esc(fromFile ? (S.FROM_FILE_SUFFIX || 'from this file') : (S.CUSTOM_SUFFIX || 'custom paper'));
    return `<div class="paper-swatch-wrap is-custom${fromFile ? ' is-from-file' : ''}" role="none" data-custom-id="${esc(id)}">
        <button type="button" class="paper-swatch is-custom" role="radio" aria-checked="false" data-paper-type="${esc(id)}" title="${label} — ${suffix}" aria-label="${label} (${suffix})">
          <span class="paper-swatch-thumb" data-paper-thumb${thumb ? ` style="background-image:url('${thumb}')"` : ''}></span>
          <span class="paper-swatch-label">${esc(info.short || name)}</span>
        </button>
        <button type="button" class="paper-swatch-more" data-paper-more="${esc(id)}" aria-haspopup="menu" tabindex="-1" aria-label="${esc(S.SWATCH_MENU_LABEL || 'Actions for')} ${label}" title="${esc(S.SWATCH_MENU_LABEL || 'Actions for')} ${label}">⋯</button>
      </div>`;
  };

  // Rebuild only the custom part of the grid (the built-in swatches are static).
  function renderCustomSwatches(body) {
    const grid = body.querySelector('.paper-swatch-grid');
    if (!grid) return;
    grid.querySelectorAll('.paper-swatch-wrap.is-custom').forEach((n) => n.remove());
    const { entries, fromFile } = customSwatchModel();
    const html = entries.map((e) => customSwatchHtml(e.id, e.name, false)).join('')
      + (fromFile ? customSwatchHtml(fromFile.id, fromFile.name, true) : '');
    if (html) grid.insertAdjacentHTML('beforeend', html);
    body.dataset.customSig = customSignature();
  }

  // Changes whenever the custom swatches need rebuilding: library contents,
  // the project's custom type and its embedded parameters (thumbnails).
  function customSignature() {
    const lib = library();
    const cur = currentPaper();
    let ids = '';
    try { ids = lib ? lib.list().map((e) => `${e.id}:${e.name}:${JSON.stringify(e.params)}:${e.color}`).join(',') : ''; } catch (_e) { ids = ''; }
    const proj = cur.custom ? `${cur.type}:${cur.custom.name}:${JSON.stringify(cur.custom.params)}:${cur.custom.color}` : '';
    return `${ids}|${proj}`;
  }

  const paramDisplay = (key, value) => {
    const lim = ((Vectura.PAPERS && Vectura.PAPERS.PARAM_LIMITS) || {})[key] || {};
    const v = Number(value) || 0;
    switch (lim.unit) {
      case 'mm': return `${v.toFixed(2)} mm`;
      case 'rad': return `${Math.round((v * 180) / Math.PI)}°`;
      case 'x': return `${v.toFixed(2)}×`;
      case 'signed': return `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
      default: return `${Math.round(v * 100)}%`;
    }
  };

  function buildBody(body) {
    const S = strings();
    const PAPERS = Vectura.PAPERS || { ORDER: ['none'], TYPES: { none: { label: 'None' } } };
    const PT = Vectura.PaperTexture;
    const swatches = PAPERS.ORDER.map((type) => {
      const info = PAPERS.TYPES[type] || {};
      // 'none' is a plain colour chip (its colour follows the project/theme).
      const thumb = type !== 'none' && PT && PT.thumbDataURL ? PT.thumbDataURL(type, { px: S.THUMB_PX || 96 }) : '';
      const label = esc(info.label || type);
      const hint = esc(info.hint || '');
      return `<button type="button" class="paper-swatch" role="radio" aria-checked="false" data-paper-type="${esc(type)}" title="${label}${hint ? ` — ${hint}` : ''}" aria-label="${label}">
          <span class="paper-swatch-thumb" data-paper-thumb${thumb ? ` style="background-image:url('${thumb}')"` : ''}></span>
          <span class="paper-swatch-label">${esc(info.short || info.label || type)}</span>
        </button>`;
    }).join('');
    const min = S.SLIDER_MIN ?? 0;
    const max = S.SLIDER_MAX ?? 100;
    const LIM = PAPERS.PARAM_LIMITS || {};
    const LABELS = S.PARAM_LABELS || {};
    const advancedRows = (PAPERS.PARAM_KEYS || []).map((key) => {
      const lim = LIM[key] || { min: 0, max: 1, step: 0.01 };
      const id = `paper-param-${key}`;
      return `<div class="paper-row paper-param-row">
          <label class="paper-row-label" for="${id}">${esc(LABELS[key] || key)}</label>
          <input type="range" id="${id}" class="ctrl-slider paper-slider paper-param-slider" data-paper-param="${esc(key)}" min="${lim.min}" max="${lim.max}" step="${lim.step}" value="${lim.min}" />
          <span id="${id}-value" class="paper-slider-value paper-param-value"></span>
        </div>`;
    }).join('');
    body.innerHTML = `
      <div class="paper-swatch-grid" role="radiogroup" aria-label="${esc(S.TYPE_GROUP_LABEL || 'Paper type')}">${swatches}</div>
      <div class="paper-custom-bar">
        <button id="btn-paper-save-custom" type="button" class="paper-action-btn paper-save-custom" title="${esc(S.SAVE_AS_CUSTOM_TITLE || '')}">${esc(S.SAVE_AS_CUSTOM || '+ Save as custom…')}</button>
        <button id="btn-paper-texture" type="button" class="paper-action-btn paper-texture-btn" aria-haspopup="menu" title="${esc(S.TEXTURE_BTN_TITLE || '')}">${esc(S.TEXTURE_BTN || 'Texture…')}</button>
        <button id="btn-paper-library-menu" type="button" class="paper-icon-btn" aria-haspopup="menu" aria-label="${esc(S.LIBRARY_MENU_LABEL || 'My papers: export or import')}" title="${esc(S.LIBRARY_MENU_LABEL || 'My papers: export or import')}">⋯</button>
      </div>
      <div class="paper-current" id="paper-current-name" aria-live="polite"></div>
      <p id="paper-attribution" class="paper-attribution" hidden></p>
      <div id="paper-custom-status" class="paper-custom-status" hidden>
        <span id="paper-custom-status-text" class="paper-custom-status-text"></span>
        <button id="btn-paper-custom-save" type="button" class="paper-action-btn paper-custom-status-btn"></button>
      </div>
      <div class="paper-row">
        <span class="paper-row-label">${esc(S.COLOR_LABEL || 'Color')}</span>
        <button id="paper-color-pill" type="button" class="value-chip paper-color-pill" aria-label="Paper color">#FFFFFF</button>
        <input type="color" id="inp-paper-color" class="hidden" aria-label="Paper color" />
      </div>
      <div class="paper-row">
        <label class="paper-row-label" for="paper-texture">${esc(S.TEXTURE_LABEL || 'Texture')}</label>
        <input type="range" id="paper-texture" class="ctrl-slider paper-slider" min="${min}" max="${max}" step="1" value="0" />
        <span id="paper-texture-value" class="paper-slider-value">0%</span>
      </div>
      <div class="paper-row">
        <label class="paper-row-label" for="paper-bleed">${esc(S.BLEED_LABEL || 'Ink bleed')}</label>
        <input type="range" id="paper-bleed" class="ctrl-slider paper-slider" min="${min}" max="${max}" step="1" value="0" />
        <span id="paper-bleed-value" class="paper-slider-value">0%</span>
      </div>
      <details id="paper-advanced" class="paper-advanced" hidden>
        <summary class="paper-advanced-summary">${esc(S.ADVANCED || 'Advanced')}</summary>
        <div class="paper-advanced-body">
          <p class="paper-note">${esc(S.ADVANCED_HINT || '')}</p>
          ${advancedRows}
          <div class="paper-actions">
            <button id="btn-paper-update-saved" type="button" class="paper-action-btn" title="${esc(S.UPDATE_SAVED_TITLE || '')}">${esc(S.UPDATE_SAVED || 'Update saved paper')}</button>
          </div>
        </div>
      </details>
      <div class="paper-actions">
        <button id="btn-paper-set-default" type="button" class="paper-action-btn" title="${esc(S.SET_DEFAULT_TITLE || '')}">${esc(S.SET_DEFAULT || 'Set as default')}</button>
        <button id="btn-paper-reset-default" type="button" class="paper-action-btn" title="${esc(S.USE_DEFAULT_TITLE || '')}">${esc(S.USE_DEFAULT || 'Use default')}</button>
      </div>
      <p class="paper-note">${esc(S.PREVIEW_NOTE || '')}</p>
      <input type="file" id="inp-paper-import" class="hidden" accept="${esc(S.IMPORT_ACCEPT || '.json,application/json')}" aria-label="${esc(S.MENU_IMPORT || 'Import papers')}" tabindex="-1" />
      <input type="file" id="inp-paper-texture" class="hidden" accept="${esc(((Vectura.PAPERS || {}).IMAGE || {}).ACCEPT || 'image/png,image/jpeg,image/webp')}" aria-label="${esc(S.MENU_TEXTURE_UPLOAD || 'Upload image')}" tabindex="-1" />
    `;
    renderCustomSwatches(body);
  }

  // Library state of the project's custom paper:
  //   null (not custom) | 'from-file' | 'modified' | 'saved'
  const customState = (paper) => {
    const P = Paper();
    const lib = library();
    if (!P || !lib || !paper.custom || !P.isCustomId(paper.type)) return null;
    const entry = lib.get(paper.type);
    if (!entry) return 'from-file';
    const same = entry.base === paper.custom.base && P.paramsEqual(entry.params, paper.custom.params)
      && entry.color === paper.color
      && Math.round(entry.defaultTexture * 100) === Math.round(paper.texture * 100)
      && Math.round(entry.defaultBleed * 100) === Math.round(paper.bleed * 100);
    return same ? 'saved' : 'modified';
  };

  function refreshCustomControls(paper) {
    const { getEl } = requireDeps('refreshCustomControls');
    const S = strings();
    const state = customState(paper);
    const status = getEl('paper-custom-status', { silent: true });
    const statusText = getEl('paper-custom-status-text', { silent: true });
    const statusBtn = getEl('btn-paper-custom-save', { silent: true });
    if (status) {
      status.hidden = !state;
      status.dataset.state = state || '';
      if (statusText) {
        statusText.textContent = state === 'from-file' ? (S.STATUS_FROM_FILE || 'From file')
          : state === 'modified' ? (S.STATUS_MODIFIED || 'Changed from your saved paper')
            : (S.STATUS_SAVED || 'Saved in My papers');
      }
      if (statusBtn) {
        statusBtn.hidden = state !== 'from-file' && state !== 'modified';
        statusBtn.textContent = state === 'from-file' ? (S.SAVE_TO_LIBRARY || 'Save to my papers') : (S.UPDATE_SAVED || 'Update saved paper');
      }
    }
    const attr = getEl('paper-attribution', { silent: true });
    if (attr) {
      const src = paper.custom && paper.custom.source;
      attr.hidden = !src;
      attr.textContent = '';
      if (src) {
        const parts = [src.title, src.author, src.provider, src.licence].filter((v, i, a) => v && a.indexOf(v) === i);
        attr.appendChild(document.createTextNode(`${S.ATTRIBUTION_PREFIX || 'Texture:'} ${parts.join(' · ')}`));
        if (src.url && /^https:\/\//.test(src.url)) {
          const a = document.createElement('a');
          a.href = src.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = ` ${S.SEARCH_SOURCE || 'Source page'}`;
          attr.appendChild(a);
        }
      }
    }
    const adv = getEl('paper-advanced', { silent: true });
    if (adv) {
      adv.hidden = !state;
      if (!state) adv.open = false;
    }
    if (state && paper.custom) {
      const params = paper.custom.params || {};
      (Vectura.PAPERS.PARAM_KEYS || []).forEach((key) => {
        const el = getEl(`paper-param-${key}`, { silent: true });
        const out = getEl(`paper-param-${key}-value`, { silent: true });
        if (el && el.dataset.dragging !== 'true') el.value = String(params[key]);
        if (out) out.textContent = paramDisplay(key, params[key]);
      });
    }
    const upd = getEl('btn-paper-update-saved', { silent: true });
    if (upd) {
      upd.textContent = state === 'from-file' ? (S.SAVE_TO_LIBRARY || 'Save to my papers') : (S.UPDATE_SAVED || 'Update saved paper');
      upd.disabled = state === 'saved';
    }
  }

  function refreshPaperUI() {
    const deps = requireDeps('refreshPaperUI');
    const { getEl, getContrastTextColor } = deps;
    const body = getEl('paper-section-body', { silent: true });
    if (!body || !body.querySelector('.paper-swatch-grid')) return;
    if (body.dataset.customSig !== customSignature()) renderCustomSwatches(body);
    const paper = currentPaper();
    const PAPERS = Vectura.PAPERS || { TYPES: {} };
    const known = Vectura.Paper ? Vectura.Paper.isKnownType(paper.type) : true;
    const info = (known ? PAPERS.TYPES[paper.type] : PAPERS.TYPES.none) || {};
    body.querySelectorAll('.paper-swatch').forEach((btn) => {
      // A paper type from a newer build renders (and is ticked) as None.
      const shown = Vectura.Paper && !Vectura.Paper.isKnownType(paper.type) ? 'none' : paper.type;
      const on = btn.dataset.paperType === shown;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      // The checked custom swatch's ⋯ is the one keyboard stop for its menu.
      const wrap = btn.closest ? btn.closest('.paper-swatch-wrap') : null;
      const more = wrap ? wrap.querySelector('.paper-swatch-more') : null;
      if (more) more.tabIndex = on ? 0 : -1;
      if (wrap) wrap.classList.toggle('active', on);
      // 'none' has no stock of its own: its swatch shows the project colour.
      if (btn.dataset.paperType === 'none') {
        const thumb = btn.querySelector('[data-paper-thumb]');
        const plainColor = paper.type === 'none' ? paper.color : (Vectura.Paper ? Vectura.Paper.themeDocumentBg() : '');
        if (thumb) thumb.style.backgroundColor = plainColor;
      }
    });
    const name = getEl('paper-current-name', { silent: true });
    const label = paper.custom ? paper.custom.name : info.label;
    if (name) name.textContent = info.hint ? `${label} — ${info.hint}` : (label || paper.type);
    refreshCustomControls.call(this, paper);
    const pill = getEl('paper-color-pill', { silent: true });
    const input = getEl('inp-paper-color', { silent: true });
    if (input) input.value = paper.color;
    if (pill) {
      pill.textContent = paper.color.toUpperCase();
      pill.style.background = paper.color;
      pill.style.color = getContrastTextColor ? getContrastTextColor(paper.color) : '';
    }
    const plain = paper.type === 'none';
    [['paper-texture', paper.texture], ['paper-bleed', paper.bleed]].forEach(([id, value]) => {
      const el = getEl(id, { silent: true });
      const out = getEl(`${id}-value`, { silent: true });
      if (el) {
        if (document.activeElement !== el || el.dataset.dragging !== 'true') el.value = String(pct(value));
        el.disabled = plain;
      }
      if (out) out.textContent = plain ? "—" : `${pct(value)}%`;
    });
    const S = settings();
    const isDefault = Boolean(S.paperDefault && Vectura.Paper && Vectura.Paper.equals(paper, S.paperDefault));
    const badge = getEl('paper-default-badge', { silent: true });
    if (badge) {
      badge.hidden = !isDefault;
      badge.textContent = strings().DEFAULT_BADGE || 'Default';
    }
    const setBtn = getEl('btn-paper-set-default', { silent: true });
    if (setBtn) setBtn.disabled = isDefault;
    const useBtn = getEl('btn-paper-reset-default', { silent: true });
    // Nothing to apply without a default (the swatches cover the theme sheet).
    if (useBtn) useBtn.disabled = isDefault || !S.paperDefault;
    if (typeof this.refreshDefaultPaperControls === 'function') this.refreshDefaultPaperControls();
  }

  function initPaperSection() {
    const deps = requireDeps('initPaperSection');
    const { getEl, openColorPickerAnchoredTo } = deps;
    const section = getEl('paper-global-section', { silent: true });
    const header = getEl('paper-section-header', { silent: true });
    const body = getEl('paper-section-body', { silent: true });
    if (!section || !header || !body) return;
    const app = this.app;
    const S = strings();
    buildBody(body);

    const setCollapsed = (next) => {
      section.classList.toggle('collapsed', Boolean(next));
      body.style.display = next ? 'none' : '';
      header.setAttribute('aria-expanded', next ? 'false' : 'true');
    };
    setCollapsed(false);
    header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));

    const write = (cfg, history) => {
      if (app && typeof app.setProjectPaper === 'function') app.setProjectPaper(cfg, { history });
      else if (Vectura.Paper) Vectura.Paper.setActive(cfg, { app, history, render: true });
      refreshPaperUI.call(this);
    };

    // Type swatches: one undo step per pick; a pick resets colour/texture/bleed
    // to the type's stock values.
    const grid = body.querySelector('.paper-swatch-grid');
    const pick = (type) => {
      const P = Vectura.Paper;
      if (!P) return;
      const cur = currentPaper();
      if (cur.type === type) return;
      // A library paper is applied from its saved entry (its own stock
      // colour, slider values and realism block).
      const lib = library();
      const entry = P.isCustomId && P.isCustomId(type) && lib ? lib.get(type) : null;
      const next = entry ? P.fromCustomEntry(entry, cur) : P.forType(type, cur);
      if (next) write(next, true);
    };
    grid.addEventListener('click', (e) => {
      const more = e.target && e.target.closest ? e.target.closest('.paper-swatch-more') : null;
      if (more && grid.contains(more)) {
        e.preventDefault();
        openSwatchMenu(more.dataset.paperMore, more);
        return;
      }
      const btn = e.target && e.target.closest ? e.target.closest('.paper-swatch') : null;
      if (btn && grid.contains(btn)) pick(btn.dataset.paperType);
    });
    grid.addEventListener('keydown', (e) => {
      // Context-menu key / Shift+F10 on a custom swatch opens its ⋯ menu.
      const sw = e.target && e.target.closest ? e.target.closest('.paper-swatch.is-custom') : null;
      if (sw && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
        e.preventDefault();
        const more = sw.parentNode && sw.parentNode.querySelector('.paper-swatch-more');
        openSwatchMenu(sw.dataset.paperType, more || sw);
        return;
      }
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      if (!keys.includes(e.key)) return;
      const btns = Array.from(grid.querySelectorAll('.paper-swatch'));
      const idx = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = btns[(Math.max(0, idx) + dir + btns.length) % btns.length];
      if (!next) return;
      e.preventDefault();
      pick(next.dataset.paperType);
      // The pick may have rebuilt the custom swatches: focus the live node.
      const live = grid.querySelector(`.paper-swatch[data-paper-type="${CSS_ESCAPE(next.dataset.paperType)}"]`) || next;
      live.focus();
    });

    // ---- custom papers -----------------------------------------------------
    const P0 = Vectura.Paper;
    const nameOf = (id) => {
      const lib = library();
      const entry = lib ? lib.get(id) : null;
      if (entry) return entry.name;
      const cur = currentPaper();
      return cur.type === id && cur.custom ? cur.custom.name : id;
    };
    const download = (res, count) => {
      if (!res || !res.ok) { toast(errorText(res && res.reason), 'danger'); return; }
      const D = Vectura.Download;
      try {
        const blob = new Blob([res.text], { type: 'application/json' });
        if (D && typeof D.saveBlob === 'function') D.saveBlob(blob, res.filename);
        toast(fmt(S.TOAST_EXPORTED, { count }), 'success');
      } catch (_e) {
        toast(errorText('unavailable'), 'danger');
      }
    };
    const exportOne = (id) => {
      const lib = library();
      if (!lib || !P0) return Promise.resolve(null);
      let extra = [];
      let ids = [id];
      if (!lib.has(id)) {
        // A paper that came inside the document: export it without saving it.
        const cur = currentPaper();
        if (cur.type !== id || !cur.custom) return Promise.resolve(null);
        const entry = P0.entryFromPaper(cur, cur.custom.name, id);
        extra = [{ ...entry, id, image: cur.custom.image }];
        ids = [];
      }
      return P0.exportCustomPapers(ids, extra).then((res) => {
        if (res.ok && !lib.has(id)) res.filename = `${(Vectura.PAPERS.CUSTOM || {}).FILE_STEM || 'vectura-papers'}-${id}.json`;
        download(res, 1);
        return res;
      });
    };
    const exportAll = () => {
      const lib = library();
      if (!lib || !P0) return Promise.resolve(null);
      if (!lib.list().length) { toast(S.TOAST_NOTHING_TO_EXPORT || 'My papers is empty', 'info'); return Promise.resolve(null); }
      return P0.exportCustomPapers(null).then((res) => { download(res, res.count); return res; });
    };

    // Save the project's paper (or a built-in) into the library. With
    // `keepId` (Save to my papers / Update saved paper) the entry keeps the
    // project's id so the document and the library stay linked.
    const saveCurrent = (name, { keepId = false } = {}) => {
      const lib = library();
      if (!lib || !P0) return null;
      const cur = currentPaper();
      const id = keepId && cur.custom && P0.isCustomId(cur.type) ? cur.type : null;
      const entry = P0.entryFromPaper(cur, name, id);
      const res = entry ? lib.put(entry) : { ok: false, reason: 'invalid' };
      if (!res.ok) { toast(errorText(res.reason), 'danger'); return null; }
      return res.item;
    };

    const promptName = (opts) => {
      const Prompt = UI.overlays && UI.overlays.Prompt;
      if (Prompt && typeof Prompt.show === 'function') return Prompt.show(opts);
      const v = typeof G.prompt === 'function' ? G.prompt(opts.message || '', opts.value || '') : null;
      return Promise.resolve(v);
    };

    const saveAsCustom = () => {
      if (!P0) return Promise.resolve(null);
      const cur = currentPaper();
      const T = Vectura.PAPERS.TYPES;
      const baseName = cur.custom ? cur.custom.name : ((T[cur.type] && T[cur.type].label) || 'Paper');
      return promptName({
        title: S.SAVE_PROMPT_TITLE || 'Save as custom paper',
        message: S.SAVE_PROMPT_MESSAGE || 'Name',
        value: fmt(S.CUSTOM_NAME_SUGGEST || '{name} (custom)', { name: baseName }),
        confirmLabel: S.SAVE_PROMPT_CONFIRM || 'Save',
      }).then((name) => {
        if (name == null || !String(name).trim()) return null;
        const item = saveCurrent(String(name));
        if (!item) return null;
        // The document switches to the new custom paper (one undo step);
        // it looks the same, now as a custom type.
        const next = P0.fromCustomEntry(item, currentPaper());
        if (next) write({ ...next, color: currentPaper().color }, true);
        toast(fmt(S.TOAST_SAVED, { name: item.name }), 'success');
        return item;
      });
    };

    const renameCustom = (id) => {
      const lib = library();
      if (!lib || !lib.has(id)) return Promise.resolve(null);
      return promptName({
        title: S.RENAME_PROMPT_TITLE || 'Rename paper',
        message: S.RENAME_PROMPT_MESSAGE || 'New name',
        value: nameOf(id),
        confirmLabel: S.RENAME_PROMPT_CONFIRM || 'Rename',
      }).then((name) => {
        if (name == null || !String(name).trim()) return null;
        const res = lib.rename(id, String(name));
        if (!res.ok) { toast(errorText(res.reason), 'danger'); return null; }
        // The open document's embedded name follows (no undo step: a name
        // is not a visible change).
        const cur = currentPaper();
        if (cur.type === id && cur.custom) write({ ...cur, custom: { ...cur.custom, name: res.item.name } }, false);
        else refreshPaperUI.call(this);
        toast(fmt(S.TOAST_RENAMED, { name: res.item.name }), 'success');
        return res.item;
      });
    };

    const deleteCustom = (id) => {
      const lib = library();
      if (!lib || !lib.has(id)) return;
      const name = nameOf(id);
      const doDelete = () => {
        const res = lib.remove(id);
        if (!res.ok) { toast(errorText(res.reason), 'danger'); return; }
        // A document or default on this paper keeps working: its own block
        // stays registered. Otherwise drop the runtime type.
        const S0 = settings();
        const inUse = (S0.paper && S0.paper.type === id) || (S0.paperDefault && S0.paperDefault.type === id);
        if (!inUse && P0 && P0.unregisterCustomType) P0.unregisterCustomType(id);
        refreshPaperUI.call(this);
        toast(fmt(S.TOAST_DELETED, { name }), 'info');
      };
      const D = UI.overlays && UI.overlays.Dialog;
      if (typeof D !== 'function') { doDelete(); return; }
      D(document.body, {
        title: S.DELETE_TITLE || 'Delete paper',
        message: fmt(S.DELETE_MESSAGE, { name }),
        confirmLabel: S.DELETE_CONFIRM || 'Delete',
        destructive: true,
        onConfirm: doDelete,
      }).open();
    };

    const readFileText = (file) => {
      if (file && typeof file.text === 'function') return file.text();
      return new Promise((resolve, reject) => {
        try {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(fr.error);
          fr.readAsText(file);
        } catch (err) { reject(err); }
      });
    };

    const importText = async (text) => {
      if (!library() || !P0) return null;
      const res = await P0.importCustomPapers(text);
      if (!res.ok) { toast(errorText(res.reason), 'danger'); return res; }
      const parts = [fmt(S.TOAST_IMPORTED, { added: res.added.length })];
      if (res.skipped) parts.push(fmt(S.TOAST_IMPORT_SKIPPED, res));
      if (res.renamed) parts.push(fmt(S.TOAST_IMPORT_RENAMED, res));
      if (res.rejected) parts.push(fmt(S.TOAST_IMPORT_REJECTED, res));
      toast(parts.join(' · '), res.added.length ? 'success' : 'info');
      refreshPaperUI.call(this);
      return res;
    };
    const importInput = getEl('inp-paper-import', { silent: true });
    const importFile = (file) => {
      const C = (Vectura.PAPERS && Vectura.PAPERS.CUSTOM) || {};
      if (!file) return Promise.resolve(null);
      const I = (Vectura.PAPERS && Vectura.PAPERS.IMAGE) || {};
      if (Number(file.size) > (I.importMaxBytes || C.MAX_BYTES || 512 * 1024)) {
        toast(errorText('too-large'), 'danger');
        return Promise.resolve({ ok: false, reason: 'too-large' });
      }
      return readFileText(file).then((text) => importText(text), () => {
        toast(errorText('parse'), 'danger');
        return { ok: false, reason: 'parse' };
      });
    };
    if (importInput) {
      importInput.addEventListener('change', () => {
        const file = importInput.files && importInput.files[0];
        const done = importFile(file);
        importInput.value = '';
        this._paperImportPending = done;
      });
    }
    const chooseImport = () => { if (importInput) importInput.click(); };

    let menu = null;
    const openMenu = (items, anchor, onSelect) => {
      const M = UI.overlays && UI.overlays.Menu;
      if (typeof M !== 'function') return;
      if (menu && menu.isOpen()) menu.close();
      if (!menu) menu = M(document.body, { items, onSelect });
      else menu.update({ items, onSelect });
      menu.el.classList.add('paper-menu');
      menu.open(anchor);
    };
    const openSwatchMenu = (id, anchor) => {
      const lib = library();
      const inLib = Boolean(lib && lib.has(id));
      const items = inLib
        ? [
          { key: 'rename', label: S.MENU_RENAME || 'Rename…' },
          { key: 'export', label: S.MENU_EXPORT || 'Export' },
          { separator: true },
          { key: 'delete', label: S.MENU_DELETE || 'Delete…' },
        ]
        : [
          { key: 'save', label: S.MENU_SAVE_TO_LIBRARY || 'Save to my papers' },
          { key: 'export', label: S.MENU_EXPORT || 'Export' },
        ];
      openMenu(items, anchor, (key) => {
        if (key === 'rename') renameCustom(id);
        else if (key === 'export') exportOne(id);
        else if (key === 'delete') deleteCustom(id);
        else if (key === 'save') saveToLibrary();
      });
    };
    const openLibraryMenu = (anchor) => {
      const cur = currentPaper();
      const lib = library();
      const curId = cur.custom && lib && lib.has(cur.type) ? cur.type : null;
      const items = [];
      if (curId) {
        const name = nameOf(curId);
        items.push(
          { key: 'rename-current', label: fmt(S.MENU_RENAME_CURRENT, { name }) },
          { key: 'export-current', label: fmt(S.MENU_EXPORT_CURRENT, { name }) },
          { key: 'delete-current', label: fmt(S.MENU_DELETE_CURRENT, { name }) },
          { separator: true },
        );
      }
      items.push(
        { key: 'export-all', label: S.MENU_EXPORT_ALL || 'Export all my papers', disabled: !(lib && lib.list().length) },
        { key: 'import', label: S.MENU_IMPORT || 'Import papers…' },
      );
      openMenu(items, anchor, (key) => {
        if (key === 'rename-current') renameCustom(curId);
        else if (key === 'export-current') exportOne(curId);
        else if (key === 'delete-current') deleteCustom(curId);
        else if (key === 'export-all') exportAll();
        else if (key === 'import') chooseImport();
      });
    };

    // From file → library (same id), or store the edited settings.
    const saveToLibrary = () => {
      const cur = currentPaper();
      if (!cur.custom) return null;
      const lib = library();
      const existed = Boolean(lib && lib.has(cur.type));
      const item = saveCurrent(existed ? nameOf(cur.type) : cur.custom.name, { keepId: true });
      if (!item) return null;
      // Keep the document's embedded block in step with the stored entry.
      write({ ...cur, custom: { ...cur.custom, name: item.name, color: item.color } }, false);
      toast(fmt(existed ? S.TOAST_UPDATED : S.TOAST_SAVED, { name: item.name }), 'success');
      return item;
    };

    // ---- image papers (photo/scan, upload or online search) ----------------
    const TI = () => UI.PaperTextureImport;
    let pendingSource = null;
    const imageErr = (reason) => ((S.IMAGE_ERRORS || {})[reason]) || errorText(reason);
    const createImagePaper = async ({ image, meanColor, name, source }) => {
      const lib = library();
      if (!lib || !P0 || !image) return false;
      const PAPERS = Vectura.PAPERS;
      const base = (PAPERS.CUSTOM && PAPERS.CUSTOM.DEFAULT_BASE) || 'cold-press';
      const params = {};
      (PAPERS.PARAM_KEYS || []).forEach((k) => { params[k] = PAPERS.TYPES[base][k]; });
      Object.assign(params, (PAPERS.IMAGE && PAPERS.IMAGE.paramOverrides) || {});
      const stored = await P0.storeImage(image);
      if (!stored.ok) { toast(errorText(stored.reason), 'danger'); return false; }
      const lean = { ref: image.ref, tileMm: image.tileMm, w: image.w, h: image.h };
      const res = lib.put({
        name: name || S.IMPORT_DEFAULT_NAME || 'Paper photo', base, color: meanColor, params, image: lean, source,
        defaultTexture: 0.85, defaultBleed: PAPERS.TYPES[base].defaultBleed,
      });
      if (!res.ok) { toast(errorText(res.reason), 'danger'); return false; }
      // Register with the pixels we already have, then switch the document
      // to the new paper (one undo step).
      P0.registerCustomType({ ...res.item, image }, res.item.id);
      const next = P0.fromCustomEntry(res.item, currentPaper());
      if (next) write(next, true);
      toast(fmt(S.TOAST_SAVED, { name: res.item.name }), 'success');
      return true;
    };
    const openImport = (opts) => {
      const T = TI();
      if (!T) return null;
      const dlg = T.openImportDialog(this, { ...opts, onCreate: createImagePaper });
      this._paperImageImport = dlg;
      return dlg;
    };
    const textureInput = getEl('inp-paper-texture', { silent: true });
    if (textureInput) {
      textureInput.addEventListener('change', () => {
        const file = textureInput.files && textureInput.files[0];
        textureInput.value = '';
        if (!file) return;
        const source = pendingSource;
        pendingSource = null;
        P0 && Vectura.PaperImage && Vectura.PaperImage.checkBlob(file).then((chk) => {
          if (!chk.ok) { toast(imageErr(chk.reason), 'danger'); return; }
          openImport({ blob: file, source, name: source && source.title });
        });
      });
    }
    const chooseTexture = (source = null) => {
      pendingSource = source;
      if (textureInput) textureInput.click();
    };
    const openSearch = () => {
      const T = TI();
      if (!T) return null;
      const sheet = T.openSearchSheet(this, {
        onPicked: (picked) => openImport(picked),
        onUpload: (source) => { if (typeof this.closeModal === 'function') this.closeModal(); chooseTexture(source); },
        onFile: (file, source) => {
          Vectura.PaperImage.checkBlob(file).then((chk) => {
            if (!chk.ok) { toast(imageErr(chk.reason), 'danger'); return; }
            openImport({ blob: file, source, name: source && source.title });
          });
        },
      });
      this._paperSearchSheet = sheet;
      return sheet;
    };
    const textureBtn = getEl('btn-paper-texture', { silent: true });
    if (textureBtn) {
      textureBtn.onclick = () => openMenu([
        { key: 'upload', label: S.MENU_TEXTURE_UPLOAD || 'Upload image…' },
        { key: 'search', label: S.MENU_TEXTURE_SEARCH || 'Search online textures…' },
      ], textureBtn, (key) => {
        if (key === 'upload') chooseTexture(null);
        else if (key === 'search') openSearch();
      });
    }
    // A decoded image paper repaints the canvas and refreshes thumbnails.
    if (typeof G.addEventListener === 'function' && !this._paperTextureReadyListener) {
      this._paperTextureReadyListener = () => {
        const b = getEl('paper-section-body', { silent: true });
        if (b) renderCustomSwatches(b);
        refreshPaperUI.call(this);
        if (app && typeof app.render === 'function' && app.renderer) app.render();
      };
      G.addEventListener('vectura:paper-texture-ready', this._paperTextureReadyListener);
    }

    const saveCustomBtn = getEl('btn-paper-save-custom', { silent: true });
    if (saveCustomBtn) saveCustomBtn.onclick = () => { this._paperSavePending = saveAsCustom(); };
    const libMenuBtn = getEl('btn-paper-library-menu', { silent: true });
    if (libMenuBtn) libMenuBtn.onclick = () => openLibraryMenu(libMenuBtn);
    const statusBtn = getEl('btn-paper-custom-save', { silent: true });
    if (statusBtn) statusBtn.onclick = () => saveToLibrary();
    const updateBtn = getEl('btn-paper-update-saved', { silent: true });
    if (updateBtn) updateBtn.onclick = () => saveToLibrary();

    // Advanced: realism parameter sliders (custom papers only). They write
    // the document's embedded block; one undo step per drag/keyboard
    // session, armed by the first real change.
    body.querySelectorAll('.paper-param-slider').forEach((el) => {
      const key = el.dataset.paperParam;
      let armed = false;
      el.addEventListener('pointerdown', () => { el.dataset.dragging = 'true'; });
      el.addEventListener('input', () => {
        const cur = currentPaper();
        if (!cur.custom || !P0) return;
        const lim = (Vectura.PAPERS.PARAM_LIMITS || {})[key] || { min: 0, max: 1 };
        const v = Math.max(lim.min, Math.min(lim.max, Number(el.value)));
        if (!Number.isFinite(v)) return;
        if (Math.round((cur.custom.params[key] || 0) * 1e4) === Math.round(v * 1e4)) return;
        if (!armed && app && app.pushHistory) app.pushHistory();
        armed = true;
        write({ ...cur, custom: { ...cur.custom, params: { ...cur.custom.params, [key]: v } } }, false);
      });
      el.addEventListener('change', () => {
        armed = false;
        delete el.dataset.dragging;
        refreshPaperUI.call(this);
      });
    });

    // Test/automation seam: the same flows the controls drive.
    this._paperCustomActions = { saveAsCustom, renameCustom, deleteCustom, exportOne, exportAll, importText, importFile, saveToLibrary, openSwatchMenu, openLibraryMenu, createImagePaper, openImport, openSearch, chooseTexture };

    // Colour: any colour; one undo step per picker session. The step is
    // armed by the first ACTUAL colour change (opening the picker and
    // cancelling leaves no empty undo step); each picker open starts a new
    // session.
    const pill = getEl('paper-color-pill', { silent: true });
    const input = getEl('inp-paper-color', { silent: true });
    let colorArmed = false;
    if (pill && input) {
      pill.onclick = () => {
        colorArmed = false;
        if (typeof openColorPickerAnchoredTo === 'function') {
          openColorPickerAnchoredTo(input, pill, { title: S.COLOR_PICKER_TITLE || 'Paper Color', uiInstance: this });
        }
      };
      const applyColor = (value, done) => {
        const P = Vectura.Paper;
        if (!P || !P.isHexColor(value)) return;
        const cur = currentPaper();
        if (P.toHex6(value) !== cur.color) {
          if (!colorArmed && app && app.pushHistory) app.pushHistory();
          colorArmed = true;
          write({ ...cur, color: value }, false);
        }
        if (done) colorArmed = false;
      };
      input.oninput = (e) => applyColor(e.target.value, false);
      input.onchange = (e) => applyColor(e.target.value, true);
    }

    // Sliders: one undo step per drag/keyboard session, armed by the first
    // input that actually changes the value (Tab/focus/no-op keys push
    // nothing); disarmed on commit.
    const bindSlider = (id, key) => {
      const el = getEl(id, { silent: true });
      if (!el) return;
      let armed = false;
      el.addEventListener('pointerdown', () => { el.dataset.dragging = 'true'; });
      el.addEventListener('input', () => {
        if (el.disabled) return;
        const v = Math.max(0, Math.min(1, Number(el.value) / 100));
        const cur = currentPaper();
        if (Math.round(cur[key] * 100) === Math.round(v * 100)) return;
        if (!armed && app && app.pushHistory) app.pushHistory();
        armed = true;
        write({ ...cur, [key]: v }, false);
      });
      el.addEventListener('change', () => {
        armed = false;
        delete el.dataset.dragging;
        refreshPaperUI.call(this);
      });
    };
    bindSlider('paper-texture', 'texture');
    bindSlider('paper-bleed', 'bleed');

    const setDefault = getEl('btn-paper-set-default', { silent: true });
    if (setDefault) {
      setDefault.onclick = () => {
        if (app && typeof app.setPaperDefault === 'function') app.setPaperDefault(currentPaper());
        refreshPaperUI.call(this);
      };
    }
    const useDefault = getEl('btn-paper-reset-default', { silent: true });
    if (useDefault) {
      useDefault.onclick = () => {
        const P = Vectura.Paper;
        if (!P) return;
        const def = settings().paperDefault ? P.normalize(settings().paperDefault) : P.builtinDefault();
        write(def, true);
      };
    }

    if (typeof G.addEventListener === 'function' && !this._paperChangeListener) {
      this._paperChangeListener = () => refreshPaperUI.call(this);
      G.addEventListener('vectura:paper-change', this._paperChangeListener);
      // My papers changed (this tab or a store write): rebuild the swatches.
      G.addEventListener('vectura:library-change', this._paperChangeListener);
    }
    refreshPaperUI.call(this);
  }

  UI.PaperPanel = {
    bind(deps) {
      DEPS = deps;
    },
    initPaperSection,
    refreshPaperUI,
    installOn(proto) {
      proto.initPaperSection = function() { return initPaperSection.call(this); };
      proto.refreshPaperUI = function() { return refreshPaperUI.call(this); };
    },
  };
})();
