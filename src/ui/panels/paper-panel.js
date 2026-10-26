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
    body.innerHTML = `
      <div class="paper-swatch-grid" role="radiogroup" aria-label="${esc(S.TYPE_GROUP_LABEL || 'Paper type')}">${swatches}</div>
      <div class="paper-current" id="paper-current-name" aria-live="polite"></div>
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
      <div class="paper-actions">
        <button id="btn-paper-set-default" type="button" class="paper-action-btn" title="${esc(S.SET_DEFAULT_TITLE || '')}">${esc(S.SET_DEFAULT || 'Set as default')}</button>
        <button id="btn-paper-reset-default" type="button" class="paper-action-btn" title="${esc(S.USE_DEFAULT_TITLE || '')}">${esc(S.USE_DEFAULT || 'Use default')}</button>
      </div>
      <p class="paper-note">${esc(S.PREVIEW_NOTE || '')}</p>
    `;
  }

  function refreshPaperUI() {
    const deps = requireDeps('refreshPaperUI');
    const { getEl, getContrastTextColor } = deps;
    const body = getEl('paper-section-body', { silent: true });
    if (!body || !body.querySelector('.paper-swatch-grid')) return;
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
      // 'none' has no stock of its own: its swatch shows the project colour.
      if (btn.dataset.paperType === 'none') {
        const thumb = btn.querySelector('[data-paper-thumb]');
        const plainColor = paper.type === 'none' ? paper.color : (Vectura.Paper ? Vectura.Paper.themeDocumentBg() : '');
        if (thumb) thumb.style.backgroundColor = plainColor;
      }
    });
    const name = getEl('paper-current-name', { silent: true });
    if (name) name.textContent = info.hint ? `${info.label} — ${info.hint}` : (info.label || paper.type);
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
      write(P.forType(type, cur), true);
    };
    grid.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.paper-swatch') : null;
      if (btn && grid.contains(btn)) pick(btn.dataset.paperType);
    });
    grid.addEventListener('keydown', (e) => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      if (!keys.includes(e.key)) return;
      const btns = Array.from(grid.querySelectorAll('.paper-swatch'));
      const idx = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = btns[(Math.max(0, idx) + dir + btns.length) % btns.length];
      if (!next) return;
      e.preventDefault();
      pick(next.dataset.paperType);
      next.focus();
    });

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
