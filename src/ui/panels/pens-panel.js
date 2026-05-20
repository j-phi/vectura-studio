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
    const color = colors.length ? colors[pens.length % colors.length] : getThemeToken('--color-accent', '#ffffff');
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
        <div class="flex items-center gap-2 flex-1 overflow-hidden">
          <button class="pen-grip" type="button" aria-label="Reorder pen">
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
          </button>
          <div class="pen-icon"></div>
          <input
            class="pen-name-input w-full bg-transparent text-xs text-vectura-text focus:outline-none"
            value="${escapeHtml(pen.name)}"
          />
        </div>
        <div class="flex items-center gap-2">
          <div class="relative w-4 h-4 overflow-hidden rounded-full border border-vectura-border">
            <input type="color" class="pen-color" value="${pen.color}" aria-label="Pen color">
          </div>
          <input type="range" min="0.05" max="2" step="0.05" value="${pen.width}" class="pen-width">
          <span class="text-[10px] text-vectura-muted pen-width-value">${pen.width}</span>
          <button class="pen-remove" type="button" aria-label="Remove pen">✕</button>
        </div>
      `;
      const icon = el.querySelector('.pen-icon');
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
        const beginColorEdit = () => {
          if (preDragColor === null) preDragColor = pen.color;
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
            if (this.app.pushHistory) this.app.pushHistory();
          }
          preDragColor = null;
          applyColor(committed);
        };
      }

      if (widthInput && widthValue) {
        // Drag-commit pattern for the width range slider — see Bug-3 fix above.
        const applyWidth = (value) => {
          pen.width = parseFloat(value);
          widthValue.textContent = pen.width.toFixed(2);
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
        let preDragWidth = null;
        const beginWidthEdit = () => {
          if (preDragWidth === null) preDragWidth = pen.width;
        };
        widthInput.addEventListener('pointerdown', beginWidthEdit);
        widthInput.addEventListener('focus', beginWidthEdit);
        widthInput.oninput = (e) => applyWidth(e.target.value);
        widthInput.onchange = (e) => {
          const committed = parseFloat(e.target.value);
          if (preDragWidth !== null && preDragWidth !== committed) {
            pen.width = preDragWidth;
            if (this.app.pushHistory) this.app.pushHistory();
          }
          preDragWidth = null;
          applyWidth(e.target.value);
        };
      }

      if (removeBtn) {
        removeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removePen(pen.id);
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
        grip.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dragEl = el;
          dragEl.classList.add('dragging');
          const indicator = document.createElement('div');
          indicator.className = 'layer-drop-indicator';
          container.insertBefore(indicator, dragEl);
          const currentOrder = pens.map((p) => p.id);
          const startIndex = currentOrder.indexOf(pen.id);

          const onMove = (ev) => {
            const y = ev.clientY;
            const items = Array.from(container.querySelectorAll('.pen-item')).filter((item) => item !== dragEl);
            let inserted = false;
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                container.insertBefore(indicator, item);
                inserted = true;
                break;
              }
            }
            if (!inserted) container.appendChild(indicator);
          };

          const onUp = () => {
            dragEl.classList.remove('dragging');
            const siblings = Array.from(container.children);
            const indicatorIndex = siblings.indexOf(indicator);
            const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('pen-item'));
            const newIndex = before.length;
            indicator.remove();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);

            if (newIndex !== startIndex) {
              const nextOrder = currentOrder.filter((id) => id !== pen.id);
              nextOrder.splice(newIndex, 0, pen.id);
              const map = new Map(pens.map((p) => [p.id, p]));
              SETTINGS.pens = nextOrder.map((id) => map.get(id)).filter(Boolean);
              this.renderPens();
              this.renderLayers();
            }
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
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
    renderPens,
    getPenById,
    applyArmedPenToLayers,
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
})();

