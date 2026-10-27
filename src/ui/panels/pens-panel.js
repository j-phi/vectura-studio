/**
 * Vectura pens panel (Phase 2 step 4 sixth panel extraction).
 *
 * Exposes window.Vectura.UI.PensPanel — the pen color list, palette
 * controls, and arming/assignment UI.
 *
 * Methods lifted verbatim from class UI:
 *   - setArmedPen / clearArmedPen / refreshArmedPenUI
 *   - getPaletteList / getActivePalette / applyPaletteToPens
 *   - addPen / removePen
 *   - initPaletteControls (deferred from step 3 — large pens-panel method)
 *   - renderPens
 *   - getPenById / applyArmedPenToLayers (Unit 1.6 — pen-workflow application)
 *
 * The legacy UI prototype delegates to this module via 1-line
 * pass-throughs. Function bodies still reference `this.*` methods that
 * remain on the legacy prototype (renderLayers, applyAutoColorization,
 * getAutoColorizationConfig, getAutoColorizationTargets, app.pushHistory,
 * app.engine, app.render, openModal, etc.).
 *
 * DI bag: { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken }.
 *
 * Compile gate at tests/unit/pens-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`PensPanel.${name} invoked before PensPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  // Pen width feeds generated GEOMETRY for some layer types (text banding,
  // scene3d / object3d surface fill + ribbons): regenerate every affected
  // layer's outermost ancestor after a committed width change.
  const PEN_GEOMETRY_TYPES = new Set(['text', 'scene3d', 'object3d']);
  function regenPenGeometry(app, pen) {
    const engine = app && app.engine;
    if (!engine || !pen) return;
    const S = (DEPS && DEPS.SETTINGS) || Vectura.SETTINGS || {};
    const fallbackPen = S.pens && S.pens[0] && S.pens[0].id;
    const usesPen = (layer) => PEN_GEOMETRY_TYPES.has(layer.type)
      && ((layer.penId || null) === pen.id || (!layer.penId && fallbackPen === pen.id));
    const rootOf = (layer) => {
      let cur = layer;
      let guard = 0;
      while (cur && cur.parentId && guard < 64) {
        const up = engine.getLayerById(cur.parentId);
        if (!up) break;
        cur = up; guard += 1;
      }
      return cur;
    };
    const ids = new Set();
    engine.layers.forEach((layer) => { if (usesPen(layer)) ids.add(rootOf(layer).id); });
    if (!ids.size) return;
    ids.forEach((id) => engine.generate(id));
    if (engine.computeAllDisplayGeometry) engine.computeAllDisplayGeometry();
  }

  /**
   * Pen models: one undo step around a pen edit (model / size / colour pick /
   * reset), then cascade the pen's colour + width to its layers, regenerate
   * width-dependent geometry when the width changed, and repaint.
   * `mutate(pen)` returns false to cancel (no history entry).
   */
  function commitPenEdit(app, pen, mutate, opts = {}) {
    if (!pen || typeof mutate !== 'function') return false;
    const before = JSON.stringify(pen);
    const prevWidth = pen.width;
    const draft = JSON.parse(before);
    if (mutate(draft) === false) return false;
    if (JSON.stringify(draft) === before) return false;
    if (!opts.skipHistory && app && app.pushHistory) app.pushHistory();
    Object.keys(pen).forEach((k) => { if (!(k in draft)) delete pen[k]; });
    Object.assign(pen, draft);
    if (app && app.engine) {
      app.engine.layers.forEach((layer) => {
        if (layer.penId !== pen.id) return;
        layer.color = pen.color;
        layer.strokeWidth = pen.width;
      });
      if (pen.width !== prevWidth) regenPenGeometry(app, pen);
    }
    const ui = app && app.ui;
    if (ui && !opts.skipRender) {
      if (ui.renderPens) ui.renderPens();
      if (ui.renderLayers) ui.renderLayers();
    }
    if (app && app.render) app.render();
    return true;
  }

  function setArmedPen(penId) {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('setArmedPen');
    this.armedPenId = penId || null;
    this.refreshArmedPenUI();
  }

  function clearArmedPen() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('clearArmedPen');
    this.setArmedPen(null);
  }

  function refreshArmedPenUI() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('refreshArmedPenUI');
    const container = getEl('pen-list');
    if (!container) return;
    container.querySelectorAll('.pen-item').forEach((item) => {
      item.classList.toggle('dragging', item.dataset.penId === this.armedPenId);
    });
  }

  function getPaletteList() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('getPaletteList');
    return Array.isArray(PALETTES) ? PALETTES : window.Vectura?.PALETTES || [];
  }

  function getActivePalette() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('getActivePalette');
    const palettes = this.getPaletteList();
    if (!palettes.length) return null;
    const target = palettes.find((palette) => palette.id === SETTINGS.paletteId);
    return target || palettes[0];
  }

  function applyPaletteToPens(palette, options = {}) {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('applyPaletteToPens');
    if (!palette || !palette.colors || !palette.colors.length) return;
    const pens = SETTINGS.pens || [];
    const autoColorization = this.getAutoColorizationConfig();
    const applyToLayers = options.applyToLayers !== undefined ? Boolean(options.applyToLayers) : Boolean(autoColorization.enabled);
    pens.forEach((pen, index) => {
      pen.color = palette.colors[index % palette.colors.length];
      // A palette is a deliberate pick: the theme/paper stops managing Pen 1.
      pen.themeManaged = false;
    });
    if (applyToLayers) {
      this.app.engine.layers.forEach((layer) => {
        const pen = pens.find((p) => p.id === layer.penId);
        if (pen) layer.color = pen.color;
      });
      this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
    }
    if (!options.skipRender) {
      this.renderPens();
      this.renderLayers();
      this.app.render();
    }
  }

  function addPen() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('addPen');
    if (this.app.pushHistory) this.app.pushHistory();
    const pens = SETTINGS.pens || [];
    const palette = this.getActivePalette();
    const colors = palette?.colors || [];
    const color = colors.length ? colors[pens.length % colors.length] : getThemeToken('--ui-accent', '#ffffff');
    const nextIndex = pens.length + 1;
    const pen = {
      id: `pen-${Math.random().toString(36).slice(2, 9)}`,
      name: `Pen ${nextIndex}`,
      color,
      width: SETTINGS.strokeWidth ?? 0.3,
    };
    pens.push(pen);
    this.renderPens();
    this.renderLayers();
  }

  function removePen(penId) {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('removePen');
    const pens = SETTINGS.pens || [];
    if (pens.length <= 1) {
      this.openModal({
        title: 'Cannot Remove Pen',
        body: '<p class="modal-text">At least one pen must remain in the list.</p>',
      });
      return;
    }
    const idx = pens.findIndex((pen) => pen.id === penId);
    if (idx === -1) return;
    if (this.app.pushHistory) this.app.pushHistory();
    const penToken = this.app.history?.[this.app.history.length - 1];
    const penName = pens[idx].name || 'pen';
    const fallback = pens[idx - 1] || pens[idx + 1];
    pens.splice(idx, 1);
    this.app.engine.layers.forEach((layer) => {
      if (layer.penId === penId && fallback) {
        layer.penId = fallback.id;
        layer.color = fallback.color;
        layer.strokeWidth = fallback.width;
      }
    });
    if (this.armedPenId === penId) this.clearArmedPen();
    this.renderPens();
    this.renderLayers();
    this.app.render();
    this.notifyUndoable?.(`Deleted pen "${penName}"`, penToken);
  }

  function initPaletteControls() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('initPaletteControls');
    const toggle = getEl('palette-toggle');
    const menu = getEl('palette-menu');
    const options = getEl('palette-options');
    const search = getEl('palette-search');
    const addBtn = getEl('btn-add-pen');
    const palettes = this.getPaletteList();
    if (!toggle || !menu || !options || !search || !palettes.length) {
      if (addBtn) addBtn.onclick = () => this.addPen();
      return;
    }

    const setActiveLabel = () => {
      const active = this.getActivePalette();
      if (active) {
        SETTINGS.paletteId = active.id;
        toggle.textContent = active.name;
      }
    };

    const renderOptions = (filter = '') => {
      const term = filter.trim().toLowerCase();
      options.innerHTML = '';
      const list = palettes.filter((palette) => palette.name.toLowerCase().includes(term));
      list.forEach((palette) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-option';
        btn.dataset.paletteId = palette.id;
        if (palette.id === SETTINGS.paletteId) btn.classList.add('active');
        btn.innerHTML = `
          <span class="palette-name">${palette.name}</span>
          <span class="palette-swatch">
            ${(palette.colors || [])
              .slice(0, 5)
              .map((color) => `<span style="background:${color}"></span>`)
              .join('')}
          </span>
        `;
        btn.onclick = (e) => {
          e.stopPropagation();
          SETTINGS.paletteId = palette.id;
          setActiveLabel();
          this.applyPaletteToPens(palette);
          menu.classList.add('hidden');
          this.openPaletteMenu = null;
        };
        options.appendChild(btn);
      });
    };

    setActiveLabel();
    renderOptions();

    toggle.onclick = (e) => {
      e.stopPropagation();
      const isHidden = menu.classList.contains('hidden');
      if (isHidden) {
        if (this.openPenMenu) {
          this.openPenMenu.classList.add('hidden');
          this.openPenMenu = null;
        }
        if (this.openPaletteMenu && this.openPaletteMenu !== menu) {
          this.openPaletteMenu.classList.add('hidden');
        }
        renderOptions(search.value);
        menu.classList.remove('hidden');
        this.openPaletteMenu = menu;
        search.focus();
        search.select();
      } else {
        menu.classList.add('hidden');
        this.openPaletteMenu = null;
      }
    };

    menu.addEventListener('click', (e) => e.stopPropagation());
    search.oninput = () => renderOptions(search.value);

    if (addBtn) {
      addBtn.onclick = () => this.addPen();
    }
    initPenFileControls.call(this);
  }

  // Pens header ⋯ menu: Export pens / Import pens… / My pens… (pen files and
  // the My pens library: Vectura.PenLibrary + UI.InkSettings).
  function initPenFileControls() {
    const { getEl } = requireDeps('initPenFileControls');
    const btn = getEl('btn-pens-menu', { silent: true });
    const input = getEl('inp-pens-import', { silent: true });
    if (!btn || btn._vecturaWired) return;
    btn._vecturaWired = true;
    const LBL = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_MODELS_UI) || {};
    const IS = () => UI.InkSettings || {};
    let menu = null;
    if (input) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        const done = IS().importPensFile ? IS().importPensFile(this.app, file) : Promise.resolve(null);
        input.value = '';
        this._penImportPending = done;
      });
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const M = UI.overlays && UI.overlays.Menu;
      const S = (DEPS && DEPS.SETTINGS) || Vectura.SETTINGS || {};
      const items = [
        { key: 'export', label: LBL().MENU_EXPORT_PENS || 'Export pens' },
        { key: 'import', label: LBL().MENU_IMPORT_PENS || 'Import pens…' },
        { separator: true },
        { key: 'library', label: LBL().MENU_MY_PENS || 'My pens…' },
      ];
      const onSelect = (key) => {
        if (key === 'export' && IS().exportPens) IS().exportPens(S.pens || []);
        else if (key === 'import' && input) input.click();
        else if (key === 'library' && IS().openMyPens) IS().openMyPens({ anchorEl: btn, app: this.app });
      };
      if (typeof M !== 'function') return;
      if (menu && menu.isOpen()) { menu.close(); return; }
      if (!menu) menu = M(document.body, { items, onSelect });
      else menu.update({ items, onSelect });
      menu.el.classList.add('pens-menu');
      menu.open(btn);
    });
  }

  function renderPens() {
    const { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken } = requireDeps('renderPens');
    const container = getEl('pen-list');
    if (!container) return;
    container.innerHTML = '';
    const pens = SETTINGS.pens || [];

    pens.forEach((pen) => {
      const el = document.createElement('div');
      el.className = 'pen-item flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2';
      el.dataset.penId = pen.id;
      el.innerHTML = `
        <div class="pen-line">
        <div class="pen-row-a flex items-center gap-2 flex-1 overflow-hidden">
          <button class="pen-grip" type="button" aria-label="Reorder pen">
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
          </button>
          <div class="pen-icon"></div>
          <input
            type="text"
            class="pen-name-input w-full bg-transparent text-xs text-vectura-text focus:outline-none"
            value="${escapeHtml(pen.name)}"
          />
        </div>
        <div class="pen-row-b flex items-center gap-2">
          <div class="pen-swatch relative w-4 h-4 overflow-hidden rounded-full border border-vectura-border">
            <input type="color" class="pen-color" value="${pen.color}" aria-label="Pen color">
          </div>
          <input type="range" min="0.05" max="2" step="0.05" value="${pen.width}" class="pen-width">
          <input type="number" min="0.05" max="2" step="0.05" value="${pen.width}"
            class="pen-width-value w-10 bg-transparent text-[10px] text-vectura-muted text-right focus:outline-none"
            inputmode="decimal" aria-label="Pen stroke weight (mm)">
          <button class="pen-remove" type="button" aria-label="Remove pen">✕</button>
        </div>
        </div>
        <div class="pen-row-c">
          <button class="pen-model-chip" type="button" aria-haspopup="dialog"></button>
          <select class="pen-size" aria-label="Pen size"></select>
          <button class="pen-ink-btn" type="button" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2.5c3.2 4.3 6 7.9 6 11.3A6 6 0 0 1 6 13.8c0-3.4 2.8-7 6-11.3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 14.5a3 3 0 0 0 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      `;
      const icon = el.querySelector('.pen-icon');
      const swatch = el.querySelector('.pen-swatch');
      const grip = el.querySelector('.pen-grip');
      const nameInput = el.querySelector('.pen-name-input');
      const colorInput = el.querySelector('.pen-color');
      const widthInput = el.querySelector('.pen-width');
      const widthValue = el.querySelector('.pen-width-value');
      const removeBtn = el.querySelector('.pen-remove');

      const applyIcon = () => {
        if (!icon) return;
        icon.style.background = pen.color;
        icon.style.color = pen.color;
        icon.style.setProperty('--pen-width', pen.width);
        // The coarse-pointer swatch (TUX-041) draws the colour from this variable.
        if (swatch) swatch.style.setProperty('--pen-color', pen.color);
      };
      applyIcon();

      if (nameInput) {
        nameInput.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          pen.name = e.target.value.trim() || pen.name;
          this.renderLayers();
        };
      }

      if (colorInput) {
        // Drag-commit pattern (Bug-3 fix, v1.1.10 audit):
        //   - `input` fires continuously during the drag → live update only,
        //     no history mutation (would flood history with intermediate values).
        //   - On commit, push ONE history entry. We accomplish this by
        //     stashing the pre-drag value on pointerdown/focus and committing
        //     a snapshot on `change` (drag release / picker close), so the
        //     captured snapshot reflects the *pre-drag* state (matching the
        //     "push-before-change" convention used elsewhere in the app).
        // Mirrors the transform-commit pattern at app.js:111.
        const applyColor = (value) => {
          pen.color = value;
          // A user-picked colour: the theme/paper stops managing this pen.
          pen.themeManaged = false;
          applyIcon();
          this.app.engine.layers.forEach((layer) => {
            if (layer.penId === pen.id) {
              layer.color = pen.color;
            }
          });
          if (SETTINGS.autoColorization?.enabled) {
            this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
          }
          this.renderLayers();
          this.app.render();
        };
        let preDragColor = null;
        let preDragManaged;
        const beginColorEdit = () => {
          if (preDragColor === null) { preDragColor = pen.color; preDragManaged = pen.themeManaged; }
        };
        colorInput.addEventListener('pointerdown', beginColorEdit);
        colorInput.addEventListener('focus', beginColorEdit);
        colorInput.oninput = (e) => applyColor(e.target.value);
        colorInput.onchange = (e) => {
          const committed = e.target.value;
          if (preDragColor !== null && preDragColor !== committed) {
            // Restore the pre-drag value, snapshot it as the history entry,
            // then re-apply the committed value. This preserves the
            // "push-before-change" invariant captureState() relies on.
            pen.color = preDragColor;
            pen.themeManaged = preDragManaged;
            if (this.app.pushHistory) this.app.pushHistory();
          }
          preDragColor = null;
          applyColor(committed);
        };
      }

      if (widthInput && widthValue) {
        // Per-pen stroke weight: a range slider AND an editable numeric textbox,
        // kept in sync. Both use the drag/edit-commit pattern (see Bug-3 above):
        //   - live `input` cascades to layers + repaints, no history;
        //   - `change` (drag release / Enter / blur) pushes ONE history entry
        //     and regenerates text layers whose banded geometry depends on pen
        //     width.
        const WMIN = 0.05;
        const WMAX = 2;
        const clampW = (mm) => Math.max(WMIN, Math.min(WMAX, Number(mm) || WMIN));
        // Sync the sibling control's displayed value without re-triggering its
        // own handler (assigning .value does not dispatch input/change).
        const applyWidth = (value, source) => {
          pen.width = clampW(value);
          if (source !== 'slider') widthInput.value = String(pen.width);
          if (source !== 'field') widthValue.value = pen.width.toFixed(2);
          applyIcon();
          this.app.engine.layers.forEach((layer) => {
            if (layer.penId === pen.id) {
              layer.strokeWidth = pen.width;
            }
          });
          if (SETTINGS.autoColorization?.enabled) {
            this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
          }
          this.app.render();
        };
        // Pen width feeds generated GEOMETRY — not just the drawn stroke —
        // for more than one layer type:
        //   - 'text': the banded bold spaces its concentric passes by the
        //     physical pen;
        //   - 'scene3d' / 'object3d': the curved surface fill derives its
        //     ruling pitch, its minimum mark, its speck floor AND (since the
        //     pen-width ribbon work) the entire WIDTH of every variable-width
        //     stroke from `bounds.penWidth` — see surface-fill.js's
        //     `penWidth` / `ribbonize`. Repainting alone leaves the hatch
        //     pitched for the old pen and every ribbon sized for it.
        // Commit-only: never during the live drag/type.
        //
        // TWO fixes over the old text-only version, both measured: the type
        // set, and regenerating EVERY affected layer instead of calling
        // `app.regen()` — which regenerates `engine.activeLayerId` alone and
        // silently left a second layer on the same pen stale.
        const regenPenGeometryLayers = () => {
          regenPenGeometry(this.app, pen);
          this.app.render();
        };
        let preEditWidth = null;
        const beginWidthEdit = () => {
          if (preEditWidth === null) preEditWidth = pen.width;
        };
        const commitWidth = (rawValue, source) => {
          const committed = clampW(rawValue);
          if (preEditWidth !== null && preEditWidth !== committed) {
            pen.width = preEditWidth;
            if (this.app.pushHistory) this.app.pushHistory();
          }
          preEditWidth = null;
          applyWidth(committed, source);
          // Pen models: a typed / dragged width off the size's laid width
          // marks the size 'custom' (the chip + size select show it).
          if (Vectura.PenModel && Vectura.PenModel.modelOf(pen)) {
            const prevSize = pen.size;
            Vectura.PenModel.syncSizeToWidth(pen);
            if (pen.size !== prevSize) {
              const sel = el.querySelector('.pen-size');
              if (sel) {
                if (!Array.from(sel.options).some((o) => o.value === pen.size)) {
                  const o = document.createElement('option');
                  o.value = 'custom';
                  sel.appendChild(o);
                }
                const custom = Array.from(sel.options).find((o) => o.value === 'custom');
                if (custom) custom.textContent = `${(Vectura.UI_CONSTANTS?.PEN_MODELS_UI?.CUSTOM_SIZE) || 'custom'} · ${pen.width.toFixed(2)} mm`;
                sel.value = pen.size;
              }
            }
          }
          // Normalize the textbox display on commit even when the field was the
          // edit source — a number input does not auto-clamp its text to
          // min/max on blur, so "5" (max 2) would otherwise keep reading "5"
          // while pen.width is really 2.
          widthValue.value = pen.width.toFixed(2);
          regenPenGeometryLayers();
        };

        widthInput.addEventListener('pointerdown', beginWidthEdit);
        widthInput.addEventListener('focus', beginWidthEdit);
        widthInput.oninput = (e) => applyWidth(e.target.value, 'slider');
        widthInput.onchange = (e) => commitWidth(e.target.value, 'slider');

        widthValue.addEventListener('focus', beginWidthEdit);
        widthValue.oninput = (e) => {
          // Ignore intermediate empty / partial entries; apply once parseable.
          if (e.target.value === '' || Number.isNaN(Number(e.target.value))) return;
          applyWidth(e.target.value, 'field');
        };
        widthValue.onchange = (e) => commitWidth(e.target.value, 'field');
      }

      if (removeBtn) {
        removeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removePen(pen.id);
        };
      }

      // Pen models: chip (model picker), size select, ink settings.
      const modelChip = el.querySelector('.pen-model-chip');
      const sizeSelect = el.querySelector('.pen-size');
      const inkBtn = el.querySelector('.pen-ink-btn');
      const PM = Vectura.PenModel;
      const LBL = (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_MODELS_UI) || {};
      const model = PM ? PM.modelOf(pen) : null;
      if (modelChip) {
        // The size select carries the size, so the chip names the model only.
        // A plain pen with a special ink names the ink (e.g. "Metallic").
        const fxName = !model && PM && PM.effectLabel ? PM.effectLabel(pen) : '';
        modelChip.textContent = model ? model.short : (fxName || (PM ? PM.labelOf(pen) : (LBL.PLAIN_LABEL || 'Plain')));
        modelChip.title = LBL.CHIP_TITLE || 'Pen model';
        modelChip.setAttribute('aria-label', `${LBL.PICKER_TITLE || 'Pen model'}: ${modelChip.textContent}`);
        modelChip.classList.toggle('is-plain', !model);
        modelChip.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const IS = UI.InkSettings;
          if (IS && IS.openModelPicker) IS.openModelPicker({ anchorEl: modelChip, penId: pen.id, app: this.app });
        };
      }
      if (sizeSelect) {
        if (model) {
          const opts = model.sizes.map((sz) => `<option value="${escapeHtml(sz.label)}">${escapeHtml(sz.label)} · ${Number(sz.laidWidthMm).toFixed(2)} mm</option>`);
          if (pen.size === 'custom' || !model.sizes.some((sz) => sz.label === pen.size)) {
            opts.push(`<option value="custom">${escapeHtml(LBL.CUSTOM_SIZE || 'custom')} · ${Number(pen.width).toFixed(2)} mm</option>`);
          }
          sizeSelect.innerHTML = opts.join('');
          sizeSelect.value = model.sizes.some((sz) => sz.label === pen.size) ? pen.size : 'custom';
          sizeSelect.hidden = false;
          sizeSelect.title = LBL.SIZE_LABEL || 'Pen size';
          sizeSelect.onchange = (e) => {
            const label = e.target.value;
            if (label === 'custom') return;
            commitPenEdit(this.app, pen, (draft) => { PM.applySize(draft, label); });
          };
        } else {
          sizeSelect.innerHTML = '';
          sizeSelect.hidden = true;
        }
      }
      if (inkBtn) {
        inkBtn.title = LBL.INK_BUTTON || 'Ink settings';
        inkBtn.setAttribute('aria-label', `${LBL.INK_BUTTON || 'Ink settings'}: ${pen.name || ''}`);
        inkBtn.classList.toggle('has-overrides', Boolean(PM && PM.hasInk(pen)));
        inkBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const IS = UI.InkSettings;
          if (IS && IS.openInkSettings) IS.openInkSettings({ anchorEl: inkBtn, penId: pen.id, app: this.app });
        };
      }

      if (icon) {
        icon.draggable = true;
        icon.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse') return;
          e.preventDefault();
          e.stopPropagation();
          this.setArmedPen(this.armedPenId === pen.id ? null : pen.id);
        });
        // touch-alt: TUX-038 a finger arms the pen on pointerdown (above); tapping a layer then applies it
        icon.ondblclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targets = this.getAutoColorizationTargets('selected');
          if (!targets.length) return;
          if (this.app.pushHistory) this.app.pushHistory();
          targets.forEach((layer) => {
            layer.penId = pen.id;
            layer.color = pen.color;
            layer.strokeWidth = pen.width;
          });
          this.renderLayers();
          this.app.render();
        };
        icon.ondragstart = (e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/pen-id', pen.id);
          e.dataTransfer.setData('text/plain', pen.id);
        };
      }

      if (grip) {
        window.Vectura.UI.PointerReorder.bind(grip, {
          container: container,
          itemSelector: '.pen-item',
          dragEl: el,
          indicatorClass: 'layer-drop-indicator',
          onCommit: (newIndex, startIndex) => {
            const currentOrder = pens.map((p) => p.id);
            const nextOrder = currentOrder.filter((id) => id !== pen.id);
            nextOrder.splice(newIndex, 0, pen.id);
            const map = new Map(pens.map((p) => [p.id, p]));
            SETTINGS.pens = nextOrder.map((id) => map.get(id)).filter(Boolean);
            this.renderPens();
            this.renderLayers();
          },
        });
      }

      container.appendChild(el);
    });

    this.refreshArmedPenUI();

    if (SETTINGS.autoColorization?.enabled) {
      this.applyAutoColorization({ commit: false });
    }
  }


  function getPenById(id) {
    const { SETTINGS } = requireDeps('getPenById');
    return (SETTINGS.pens || []).find((pen) => pen.id === id) || null;
  }

  // === COL-2 (Tools Parity, Phase 1 Lane D) ================================
  // Shared pen-assignment helper. Vectura's color model is pen-based: a
  // layer's color is a reference to a document pen, stored as layer.penId
  // (authoritative) plus the denormalized caches layer.color/strokeWidth.
  // Plot-order optimization groups strokes by penId (engine.js), so the
  // triple MUST always be written together — never color alone. This is the
  // single shared implementation of that triple-write, used by the Pen
  // Picker popover (pen-picker-popover.js). The four pre-existing inline
  // triple-write sites (layers-panel.js applyPen, group/expand propagation,
  // pens-panel.js applyArmedPenToLayers and the pen-edit cascade) are NOT
  // migrated in this lane per the SPEC — that consolidation is a follow-up
  // owned by the lanes that own those files.
  //
  // Pure function: no DEPS required, no history/render side effects — the
  // caller owns pushHistory (one undo step per apply) and re-render.

  /**
   * Write the full penId/color/strokeWidth triple of `penId` onto every
   * target layer. Never performs a partial write: if `penId` does not
   * resolve to a pen in `pens`, no layer is touched and null is returned.
   * @param {Array<{id,name,color,width}>} pens - document pen list (SETTINGS.pens)
   * @param {Array<object>} targetLayers - layers to assign
   * @param {string} penId - id of the pen to assign
   * @returns {object|null} the resolved pen record, or null if not found
   */
  function assignPenToLayers(pens, targetLayers, penId) {
    const list = Array.isArray(pens) ? pens : [];
    const pen = list.find((p) => p && p.id === penId) || null;
    if (!pen) return null;
    const layers = Array.isArray(targetLayers) ? targetLayers.filter(Boolean) : [];
    layers.forEach((layer) => {
      layer.penId = pen.id;
      layer.color = pen.color;
      layer.strokeWidth = pen.width;
      // Parity with the existing assignment sites (layers-panel.js applyPen,
      // applyArmedPenToLayers below): default lineCap only when absent.
      if (!layer.lineCap) layer.lineCap = 'round';
    });
    return pen;
  }

  /**
   * Popover/chip-facing read: report the selection's shared pen, or a mixed
   * state when penIds diverge (COL-2/COL-3 `?` chip). A missing penId is its
   * own bucket — a layer without a pen is "mixed" against any penned layer.
   * @param {Array} pens - document pen list (SETTINGS.pens)
   * @param {Array} layers - selected layers
   * @returns {{penId: string|null, pen: object|null, mixed: boolean}}
   */
  function getSelectionPenState(pens, layers) {
    const list = Array.isArray(layers) ? layers.filter(Boolean) : [];
    if (!list.length) return { penId: null, pen: null, mixed: false };
    const first = list[0].penId || null;
    const mixed = list.some((layer) => (layer.penId || null) !== first);
    if (mixed || first === null) return { penId: null, pen: null, mixed };
    const pen = (Array.isArray(pens) ? pens : []).find((p) => p && p.id === first) || null;
    return { penId: first, pen, mixed: false };
  }
  // === end COL-2 ===========================================================

  function applyArmedPenToLayers(targetLayers) {
    requireDeps('applyArmedPenToLayers');
    if (!this.armedPenId) return false;
    const pen = this.getPenById(this.armedPenId);
    if (!pen) return false;
    const layers = Array.isArray(targetLayers) ? targetLayers.filter(Boolean) : [];
    if (!layers.length) return false;
    if (this.app.pushHistory) this.app.pushHistory();
    layers.forEach((layer) => {
      layer.penId = pen.id;
      layer.color = pen.color;
      layer.strokeWidth = pen.width;
      if (!layer.lineCap) layer.lineCap = 'round';
    });
    // U3 — an Object 3D row routes ink through its style pen (layers-panel.js).
    if (typeof UI.syncObject3dPen === 'function') UI.syncObject3dPen(this.app, layers, pen);
    this.clearArmedPen();
    this.renderLayers();
    this.app.render();
    return true;
  }


  UI.PensPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps - { getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken }
     */
    bind(deps) {
      DEPS = deps;
    },
    setArmedPen,
    clearArmedPen,
    refreshArmedPenUI,
    getPaletteList,
    getActivePalette,
    applyPaletteToPens,
    addPen,
    removePen,
    initPaletteControls,
    initPenFileControls,
    renderPens,
    getPenById,
    applyArmedPenToLayers,
    // COL-2: shared triple-write helper + popover-facing reads (pure, no
    // bind() required). Also exposed at the SPEC-named alias Vectura.PensPanel.
    assignPenToLayers,
    getSelectionPenState,
    // Pen models: shared one-undo-step pen edit + width-geometry regen.
    commitPenEdit,
    regenPenGeometry,
    installOn(proto) {
      proto.setArmedPen = function(penId) { return setArmedPen.call(this, penId); };
      proto.clearArmedPen = function() { return clearArmedPen.call(this); };
      proto.refreshArmedPenUI = function() { return refreshArmedPenUI.call(this); };
      proto.getPaletteList = function() { return getPaletteList.call(this); };
      proto.getActivePalette = function() { return getActivePalette.call(this); };
      proto.applyPaletteToPens = function(palette, options = {}) { return applyPaletteToPens.call(this, palette, options); };
      proto.addPen = function() { return addPen.call(this); };
      proto.removePen = function(penId) { return removePen.call(this, penId); };
      proto.initPaletteControls = function() { return initPaletteControls.call(this); };
      proto.renderPens = function() { return renderPens.call(this); };
      proto.getPenById = function(id) { return getPenById.call(this, id); };
      proto.applyArmedPenToLayers = function(targetLayers) { return applyArmedPenToLayers.call(this, targetLayers); };
    },
  };

  // COL-2: the SPEC names the helper `Vectura.PensPanel.assignPenToLayers`.
  // Alias the panel namespace there (same object as Vectura.UI.PensPanel) so
  // both paths resolve to the single shared implementation.
  Vectura.PensPanel = UI.PensPanel;
})();

