/**
 * Vectura algo-config panel (Phase 2 step 2 extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.AlgoConfigPanel — the buildControls() dispatch loop
 * lifted verbatim out of the legacy `class UI` IIFE. The legacy UI prototype's
 * buildControls() is now a thin delegator that calls into this module.
 *
 * The function body still references many `this.*` methods and properties that
 * remain on the legacy UI prototype (storeLayerParams, isModifierLayer, the
 * pattern-designer / petalis-designer mixins, attachInfoButton, etc.). Those
 * stay where they are until later Phase 2 steps decompose the orchestrator.
 *
 * The IIFE-level constants buildControls() closure-captures from legacy ui.js
 * (getEl, COMMON_CONTROLS, OPTIMIZATION_STEPS, all *_NOISE_DEFS,
 * PETALIS_*_TYPES, *_PRESET_LIBRARY, TRANSFORM_KEYS, IMAGE_NOISE_DEFAULT_AMPLITUDE)
 * are injected once via AlgoConfigPanel.bind(deps) from legacy ui.js. The
 * window.Vectura.* globals (ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS,
 * MODIFIER_DESCRIPTIONS) are pulled directly from window.Vectura.
 *
 * The compile gate at tests/unit/algo-config-panel-compile.test.js asserts the
 * module loads under JSDOM and exposes the contract surface — mirroring the
 * controls-registry compile gate that caught three escaped helpers in step 1.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  // Dependency bag injected by legacy src/ui/ui.js IIFE via AlgoConfigPanel.bind().
  // Until bind() runs, buildControls() throws a clear error rather than silent ReferenceError.
  let DEPS = null;

  const requireDeps = () => {
    if (!DEPS) {
      throw new Error('AlgoConfigPanel.buildControls invoked before AlgoConfigPanel.bind(deps) — load order broken');
    }
    return DEPS;
  };

  // Re-pulled per-call so the destructuring matches the legacy IIFE preamble shape.
  // ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MODIFIER_DESCRIPTIONS already live on
  // window.Vectura (see src/config/defaults.js, src/config/descriptions.js).
  const fromVectura = () => {
    const V = G.Vectura || {};
    return {
      ALGO_DEFAULTS: V.ALGO_DEFAULTS,
      SETTINGS: V.SETTINGS,
      DESCRIPTIONS: V.DESCRIPTIONS,
      MODIFIER_DESCRIPTIONS: V.MODIFIER_DESCRIPTIONS,
    };
  };

  const RAND_SPARKS = [
    { dx: '-14px', dy: '-12px', color: 'rgba(217,70,239,0.9)',  delay: '0s'    },
    { dx: '13px',  dy: '-14px', color: 'rgba(192,132,252,0.9)', delay: '0.03s' },
    { dx: '16px',  dy: '8px',   color: 'rgba(56,189,248,0.85)', delay: '0.06s' },
    { dx: '-13px', dy: '9px',   color: 'rgba(217,70,239,0.8)',  delay: '0.04s' },
    { dx: '7px',   dy: '13px',  color: 'rgba(192,132,252,0.8)', delay: '0.02s' },
    { dx: '-6px',  dy: '-16px', color: 'rgba(56,189,248,0.9)',  delay: '0.05s' },
  ];

  function fireRandSparks(x, y) {
    RAND_SPARKS.forEach(({ dx, dy, color, delay }) => {
      const s = document.createElement('span');
      s.className = 'rand-spark-overlay';
      s.style.left = x + 'px';
      s.style.top  = y + 'px';
      s.style.setProperty('--dx', dx);
      s.style.setProperty('--dy', dy);
      s.style.setProperty('--spark-color', color);
      s.style.animationDelay = delay;
      document.body.appendChild(s);
      s.addEventListener('animationend', () => s.remove(), { once: true });
    });
  }

  function buildControls() {
    // Closure-captured legacy IIFE locals — destructured fresh each call so the
    // new file matches the original body's reference set 1:1. The deps bag is
    // injected once at startup via AlgoConfigPanel.bind() from legacy ui.js
    // (see end of src/ui/ui.js).
    const {
      // constants & data
      COMMON_CONTROLS, OPTIMIZATION_STEPS, IMAGE_NOISE_DEFAULT_AMPLITUDE,
      WAVE_NOISE_DEFS, RINGS_NOISE_DEFS, TOPO_NOISE_DEFS, RASTER_PLANE_NOISE_DEFS, FLOWFIELD_NOISE_DEFS,
      GRID_NOISE_DEFS, PHYLLA_NOISE_DEFS, PETALIS_DRIFT_NOISE_DEFS,
      PETALIS_MODIFIER_TYPES, PETALIS_PETAL_MODIFIER_TYPES, PETALIS_SHADING_TYPES,
      PETALIS_LINE_TYPES,
      PETALIS_PRESET_LIBRARY, TERRAIN_PRESET_LIBRARY, RINGS_PRESET_LIBRARY,
      HARMONOGRAPH_PRESET_LIBRARY, PENDULA_PRESET_LIBRARY,
      TRANSFORM_KEYS,
      // DOM / value helpers
      getEl, escapeHtml, roundToStep, clone, clamp,
      attachKeyboardRangeNudge, formatValue, formatDisplayValue,
      getDisplayConfig, toDisplayValue, fromDisplayValue, getDisplayLabel,
      getContrastTextColor, openColorPickerAnchoredTo,
      // unit helpers
      getDocumentUnitLabel, mmToDocumentUnits, documentUnitsToMm,
      // modifier / petalis factories & predicates
      isModifierLayer, isPetalisLayerType,
      createPetalisModifier, createPetalModifier, createPetalisShading,
    } = requireDeps();
    const { ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MODIFIER_DESCRIPTIONS } = fromVectura();

    const restoreScrollFn = this.captureLeftPanelScrollPosition();
    let scrollRestored = false;
    const restoreLeftPanelScroll = () => {
      if (scrollRestored) return;
      scrollRestored = true;
      restoreScrollFn();
    };
    try {
    const container = getEl('dynamic-controls');
    if (!container) {
      restoreLeftPanelScroll();
      return;
    }
    // Cmd/Ctrl+S, scoped to focus within the config panel, opens the preset Save
    // modal when the active layer is dirty (its save pip is visible). Bound once
    // — the container element persists across rebuilds (only innerHTML is reset).
    // preventDefault stops the browser save dialog; stopPropagation keeps the
    // global "Save .vectura" shortcut from also firing.
    if (!this._presetSaveKeyBound) {
      this._presetSaveKeyBound = true;
      container.addEventListener('keydown', (e) => {
        const primary = e.metaKey || e.ctrlKey;
        if (!primary || e.shiftKey || e.altKey) return;
        if ((e.key || '').toLowerCase() !== 's') return;
        const pip = container.querySelector('.hg-preset-save-pip:not([hidden])');
        if (!pip || typeof this._activePresetGallerySave !== 'function') return;
        e.preventDefault();
        e.stopPropagation();
        this._activePresetGallerySave();
      });
    }
    if (this.harmonographPlotterState?.rafId) {
      window.cancelAnimationFrame(this.harmonographPlotterState.rafId);
    }
    this.harmonographPlotterState = null;
    this.destroyInlinePetalisDesigner();
    this.destroyInlinePatternDesigner();
    container.innerHTML = '';
    // Cleared each rebuild; re-registered if this layer mounts a preset gallery.
    this._activePresetGalleryRefresh = null;
    this._activePresetGallerySave = null;
    // Cleared each rebuild; re-registered if this layer mounts the image-source
    // widget (rasterPlane) so its preview can live-refresh after every edit.
    this._activeImageSourceRefresh = null;
    // Tear down any floating image-source pane before the rebuild; the widget
    // re-creates it (from the persisted _imageSourcePopout state) if the layer
    // being built is still rasterPlane and still popped out. Prevents the
    // floating pane orphaning over the canvas when another layer is selected.
    if (this._imageSourcePopoutEl) {
      this._imageSourcePopoutEl.remove();
      this._imageSourcePopoutEl = null;
    }
    // --- Export optimization panel (hoisted) ---------------------------------
    // These helpers + renderOptimizationPanel are defined here, above the
    // layer-type early returns below, so the export modal's optimization panel
    // still renders when the active layer bails out early (Text/Mirror panels,
    // groups, multi-selection, paint tools). Without this a Text-only document
    // opened an empty Export settings pane. renderExportOptimizationIfOpen() is
    // invoked on every early-return path while the modal is open, and once more
    // at the normal end of buildControls(). See src/ui/modals/export-svg.js.
    const valueEditorMap = new WeakMap();
    const collectValueChips = () =>
      Array.from(container.querySelectorAll('.value-chip')).filter((chip) => chip.offsetParent !== null);

    const openInlineEditor = (opts) => {
      const { def, valueEl, getValue, setValue, parseValue, formatValue } = opts;
      if (!valueEl) return;
      const { min, max, unit, step, precision } = getDisplayConfig(def);
      const parent = valueEl;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'inline-value-input';
      const currentValue = getValue ? getValue() : 0;
      const displayValue = formatValue ? formatValue(currentValue) : formatDisplayValue(def, currentValue);
      input.value = `${displayValue}`.replace(unit, '').trim();
      const prevPosition = parent.style.position;
      const prevColor = parent.style.color;
      const prevShadow = parent.style.textShadow;
      const prevWidth = parent.style.width;
      const prevMinWidth = parent.style.minWidth;
      const prevFlex = parent.style.flex;
      if (!prevPosition || prevPosition === 'static') parent.style.position = 'relative';
      input.style.left = '0';
      input.style.top = '0';
      input.style.width = '100%';
      input.style.height = '100%';
      parent.appendChild(input);
      parent.style.color = 'transparent';
      parent.style.textShadow = 'none';
      parent.style.flex = '0 0 auto';
      input.focus({ preventScroll: true });
      input.select();

      const growToFit = () => {
        input.style.width = 'auto';
        const padding = 14;
        const desired = Math.max(parent.offsetWidth, input.scrollWidth + padding);
        parent.style.minWidth = `${desired}px`;
        parent.style.width = `${desired}px`;
        input.style.width = '100%';
      };

      growToFit();

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (input.parentElement) input.parentElement.removeChild(input);
        parent.style.color = prevColor;
        parent.style.textShadow = prevShadow;
        parent.style.width = prevWidth;
        parent.style.minWidth = prevMinWidth;
        parent.style.flex = prevFlex;
        if (!prevPosition || prevPosition === 'static') parent.style.position = '';
      };

      const apply = () => {
        const raw = input.value.trim().replace(unit, '');
        if (parseValue) {
          const parsed = parseValue(raw);
          if (!parsed) {
            this.showValueError(raw);
            return false;
          }
          setValue(parsed, { commit: true });
          return true;
        }
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
          this.showValueError(`${raw}${unit}`, { min, max, unit, precision });
          return false;
        }
        setValue(parsed, { commit: true });
        return true;
      };

      const openNeighbor = (dir) => {
        const chips = collectValueChips();
        const idx = chips.indexOf(valueEl);
        if (idx === -1) return;
        const next = chips[idx + dir];
        if (!next) return;
        const nextOpts = valueEditorMap.get(next);
        if (!nextOpts) return;
        window.requestAnimationFrame(() => openInlineEditor({ ...nextOpts, valueEl: next }));
      };

      const nudge = (direction, multiplier = 1) => {
        const numericStep = Number.isFinite(step) && step > 0 ? step : 1;
        const delta = numericStep * multiplier * direction;
        const current = Number.parseFloat(input.value);
        if (!Number.isFinite(current)) return;
        const next = clamp(current + delta, min, max);
        const factor = Math.pow(10, precision);
        const displayValue = Math.round(next * factor) / factor;
        input.value = `${displayValue}`;
        if (parseValue) return;
        setValue(displayValue, { commit: false, live: true });
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const ok = apply();
          cleanup();
          if (!ok) return;
          return;
        }
        if (e.key === 'Escape') {
          cleanup();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const ok = apply();
          cleanup();
          if (ok) openNeighbor(e.shiftKey ? -1 : 1);
          return;
        }
        if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
          e.preventDefault();
          if (parseValue) return;
          const direction = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
          const mult = e.shiftKey ? 10 : 1;
          nudge(direction, mult);
        }
      });
      input.addEventListener('input', () => {
        growToFit();
      });
      input.addEventListener('blur', () => {
        if (!apply()) {
          cleanup();
          return;
        }
        cleanup();
      });
    };

    const attachValueEditor = (opts) => {
      const { valueEl } = opts;
      if (!valueEl) return;
      valueEditorMap.set(valueEl, opts);
      valueEl.ondblclick = (e) => {
        e.preventDefault();
        openInlineEditor({ ...opts, valueEl });
      };
    };

    // Shared UI.Slider factory for def-driven controls. The component owns the
    // fill gradient, release halo/pulse motion, chip rendering + inline chip
    // editing, and dblclick-reset (via defaultValue). Values flowing through
    // onChange/onCommit are DISPLAY values — the same numbers the old
    // parseFloat(e.target.value) handlers saw. `format`/`parse` route the chip
    // through the def's display config (unit suffixes like ° / mm / %).
    const createDefSlider = (host, def, opts = {}) => {
      const { min, max, step, unit, precision } = getDisplayConfig(def);
      return UI.Slider(host, {
        value: opts.value,
        min, max, step, precision,
        ariaLabel: opts.ariaLabel || getDisplayLabel(def) || 'Value',
        defaultValue: opts.defaultValue,
        format: (v) => formatDisplayValue(def, fromDisplayValue(def, v)),
        parse: (text) => parseFloat(String(text).replace(unit, '')),
        onChange: opts.onChange,
        onCommit: opts.onCommit,
      });
    };
    // Standard header row (label + optional info button) above a mounted control.
    const controlHeaderHtml = (def, infoBtnHtml = '') => `
      <div class="flex items-center gap-2 mb-1">
        <label class="control-label mb-0">${getDisplayLabel(def)}</label>
        ${infoBtnHtml}
      </div>
    `;

    const renderOptimizationPanel = (target) => {
      if (!target) return;
      const panel = document.createElement('div');
      panel.className = 'optimization-panel';
      panel.innerHTML = '';

      const getTargets = () => {
        return this.getOptimizationTargets();
      };

      const normalizeConfig = (config) => {
        if (!config) return null;
        if (!Array.isArray(config.steps)) config.steps = [];
        const defaults = SETTINGS.optimizationDefaults || { bypassAll: false, steps: [] };
        const defaultSteps = Array.isArray(defaults.steps) ? defaults.steps : [];
        const defaultMap = new Map(defaultSteps.map((step) => [step.id, step]));
        config.steps = config.steps.map((step) => ({
          ...(defaultMap.get(step.id) || {}),
          ...step,
        }));
        defaultSteps.forEach((step) => {
          if (!config.steps.some((s) => s.id === step.id)) {
            config.steps.push(clone(step));
          }
        });
        if (config.bypassAll === undefined) config.bypassAll = defaults.bypassAll ?? false;
        return config;
      };

      const getStepDefaults = (id) => {
        const defaults = SETTINGS.optimizationDefaults || { steps: [] };
        return (defaults.steps || []).find((step) => step.id === id) || {};
      };

      const isDocumentLengthControl = (def) => def?.displayUnit === 'mm' || /\(mm\)/.test(def?.label || '');
      const getOptimizationLabel = (label = '') => label.replace(/\(mm\)/g, `(${this.getDocumentUnitLabel()})`);
      const getOptimizationDisplayConfig = (def) => {
        if (!isDocumentLengthControl(def)) return getDisplayConfig(def);
        const config = this.getDocumentLengthConfig({
          minMm: def.min,
          maxMm: def.max,
          stepMm: def.step,
          precision: def.displayPrecision,
        });
        return {
          min: config.min,
          max: config.max,
          step: config.step,
          unit: config.unitLabel,
          precision: config.precision,
        };
      };
      const toOptimizationDisplayValue = (def, value) => {
        if (isDocumentLengthControl(def)) return mmToDocumentUnits(value, this.getDocumentUnits());
        return toDisplayValue(def, value);
      };
      const fromOptimizationDisplayValue = (def, value) => {
        if (isDocumentLengthControl(def)) return documentUnitsToMm(value, this.getDocumentUnits());
        return fromDisplayValue(def, value);
      };
      const targets = getTargets();
      const config = targets.length ? normalizeConfig(this.app.engine.ensureLayerOptimization(targets[0])) : null;

      const updateStats = () => {
        const scopedTargets = getTargets();
        if (!config || !scopedTargets.length) return;
        this.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
        const before = this.app.engine.computeStats(scopedTargets, { useOptimized: false, includePlotterOptimize: false });
        const after = this.app.engine.computeStats(scopedTargets, { useOptimized: true, includePlotterOptimize: true });
        const beforeEl = panel.querySelector('[data-opt-stat="before"]');
        const afterEl = panel.querySelector('[data-opt-stat="after"]');
        const formatStats = (stats) =>
          `Lines ${stats.lines || 0} • Points ${stats.points || 0} • ${stats.distance} • ${stats.time}`;
        if (beforeEl) beforeEl.textContent = formatStats(before);
        if (afterEl) afterEl.textContent = formatStats(after);
      };

      const rerenderOptimizationPreview = () => {
        const scopedTargets = getTargets();
        if (!scopedTargets.length) return;
        this.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
        this.app.render();
        updateStats();
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };

      const applyOptimization = (mutator) => {
        const scopedTargets = getTargets();
        if (!scopedTargets.length) return;
        const scope = SETTINGS.optimizationScope || 'all';
        const baseConfig = normalizeConfig(this.app.engine.ensureLayerOptimization(scopedTargets[0]));
        if (mutator) mutator(baseConfig);
        if (scope !== 'active') {
          const snapshot = clone(baseConfig);
          scopedTargets.forEach((layer, idx) => {
            if (idx === 0) return;
            layer.optimization = clone(snapshot);
          });
          this.app.optimizeLayers(scopedTargets, { config: snapshot, includePlotterOptimize: true });
        } else {
          this.app.optimizeLayers(scopedTargets, { config: baseConfig, includePlotterOptimize: true });
        }
        this.app.render();
        updateStats();
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };

      const buildRow = (label, controlEl) => {
        const row = document.createElement('div');
        row.className = 'optimization-row';
        const lab = document.createElement('label');
        lab.className = 'control-label mb-0';
        lab.textContent = label;
        row.appendChild(lab);
        row.appendChild(controlEl);
        return row;
      };

      const scopeSelect = document.createElement('select');
      scopeSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
      scopeSelect.innerHTML = `
        <option value="active">Active Layer</option>
        <option value="selected">Selected Layers</option>
        <option value="all">All Layers</option>
      `;
      scopeSelect.value = SETTINGS.optimizationScope || 'all';
      scopeSelect.onchange = (e) => {
        SETTINGS.optimizationScope = e.target.value;
        this.buildControls();
        this.app.render();
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
      panel.appendChild(buildRow('Scope', scopeSelect));

      if ((SETTINGS.optimizationScope || 'all') === 'selected') {
        const selectedLayers = (this.app.renderer?.getSelectedLayers?.() || []).filter((l) => l && !l.isGroup);
        const infoEl = document.createElement('div');
        infoEl.className = 'text-xs px-1 pb-1';
        if (!selectedLayers.length) {
          infoEl.classList.add('text-amber-400');
          infoEl.textContent = 'No layers selected — exporting all layers';
        } else {
          infoEl.classList.add('text-vectura-muted');
          const names = selectedLayers.map((l) => l.name || l.id);
          const shown = names.slice(0, 3).join(', ');
          const extra = names.length > 3 ? ` and ${names.length - 3} more` : '';
          infoEl.textContent = `${selectedLayers.length} selected: ${shown}${extra}`;
        }
        panel.appendChild(infoEl);
      }

      const previewSelect = document.createElement('select');
      previewSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
      previewSelect.innerHTML = `
        <option value="off">Off</option>
        <option value="replace">Replace</option>
        <option value="overlay">Overlay</option>
      `;
      previewSelect.value = SETTINGS.lineSortOverlayVisible
        ? 'overlay'
        : ((SETTINGS.optimizationPreview || 'off') === 'replace' ? 'replace' : 'off');
      previewSelect.onchange = (e) => {
        const mode = e.target.value;
        // The canvas line-sort overlay is its own (non-persisted) flag so it stays off
        // by default and is only shown via the eye toggle / this select; 'replace' still
        // rides optimizationPreview (it swaps the drawn geometry for the optimized paths).
        SETTINGS.lineSortOverlayVisible = mode === 'overlay';
        SETTINGS.optimizationPreview = mode === 'replace' ? 'replace' : 'off';
        this.buildControls();
        this.app.render();
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
      panel.appendChild(buildRow('Preview', previewSelect));

      const exportToggle = document.createElement('input');
      exportToggle.type = 'checkbox';
      exportToggle.checked = Boolean(SETTINGS.optimizationExport);
      exportToggle.onchange = (e) => {
        const next = Boolean(e.target.checked);
        SETTINGS.optimizationExport = next;
        // Master switch: turning Export Optimized off bypasses every step so
        // the per-step toggles in the sidebar visually deactivate too. Turning
        // it back on lifts the bypass; per-step `enabled` flags retain their
        // user-set values.
        applyOptimization((cfg) => {
          cfg.bypassAll = !next;
          cfg.steps = (cfg.steps || []).map((step) => ({ ...step, bypass: !next }));
        });
        this.buildControls();
      };
      panel.appendChild(buildRow('Export Optimized', exportToggle));

      const getHexComplement = (hex) => {
        const raw = `${hex || ''}`.trim().replace('#', '');
        const normalized =
          raw.length === 3
            ? raw
                .split('')
                .map((c) => `${c}${c}`)
                .join('')
            : raw;
        if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#c74307';
        const r = 255 - parseInt(normalized.slice(0, 2), 16);
        const g = 255 - parseInt(normalized.slice(2, 4), 16);
        const b = 255 - parseInt(normalized.slice(4, 6), 16);
        const toHex = (v) => v.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      };

      const overlayStyleControls = document.createElement('div');
      overlayStyleControls.className = 'color-thickness-control';
      const overlayColorPreview = document.createElement('button');
      overlayColorPreview.type = 'button';
      overlayColorPreview.className = 'value-chip text-xs text-vectura-accent font-mono color-thickness-pill';
      overlayColorPreview.textContent = `${(SETTINGS.optimizationOverlayColor || '#38bdf8').toUpperCase()}`;
      overlayColorPreview.style.background = SETTINGS.optimizationOverlayColor || '#38bdf8';
      overlayColorPreview.style.color = getContrastTextColor(SETTINGS.optimizationOverlayColor || '#38bdf8');
      const overlayColorInput = document.createElement('input');
      overlayColorInput.type = 'color';
      overlayColorInput.value = SETTINGS.optimizationOverlayColor || '#38bdf8';
      overlayColorInput.className = 'hidden';

      const overlaySizeControls = document.createElement('div');
      overlaySizeControls.className = 'color-thickness-size';
      const overlayWidthConfig = this.getDocumentLengthConfig({ minMm: 0.05, maxMm: 1, stepMm: 0.05 });
      const overlayWidth = document.createElement('input');
      overlayWidth.type = 'range';
      overlayWidth.min = `${overlayWidthConfig.min}`;
      overlayWidth.max = `${overlayWidthConfig.max}`;
      overlayWidth.step = `${overlayWidthConfig.step}`;
      overlayWidth.value = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth ?? 0.2, { precision: overlayWidthConfig.precision });
      const overlayWidthInput = document.createElement('input');
      overlayWidthInput.type = 'number';
      overlayWidthInput.min = `${overlayWidthConfig.min}`;
      overlayWidthInput.max = `${overlayWidthConfig.max}`;
      overlayWidthInput.step = `${overlayWidthConfig.step}`;
      overlayWidthInput.value = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth ?? 0.2, { precision: overlayWidthConfig.precision });
      overlayWidthInput.className =
        'w-14 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none';
      const overlayMm = document.createElement('span');
      overlayMm.className = 'text-[10px] text-vectura-muted';
      overlayMm.textContent = overlayWidthConfig.unitLabel;
      overlaySizeControls.appendChild(overlayWidth);
      overlaySizeControls.appendChild(overlayWidthInput);
      overlaySizeControls.appendChild(overlayMm);

      const overlayResetBtn = document.createElement('button');
      overlayResetBtn.type = 'button';
      overlayResetBtn.className = 'text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted';
      overlayResetBtn.textContent = 'Reset';

      const applyOverlayStyle = (opts = {}) => {
        const { color, width, commit = false } = opts;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        if (typeof color === 'string' && color) {
          SETTINGS.optimizationOverlayColor = color;
          overlayColorPreview.textContent = color.toUpperCase();
          overlayColorPreview.style.background = color;
          overlayColorPreview.style.color = getContrastTextColor(color);
        }
        if (width !== undefined) {
          const next = Math.max(0.05, Math.min(1, this.parseDocumentNumber(width, { fallbackMm: SETTINGS.optimizationOverlayWidth ?? 0.2 })));
          SETTINGS.optimizationOverlayWidth = Number.isFinite(next) ? next : 0.2;
          const displayWidth = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth, { precision: overlayWidthConfig.precision });
          overlayWidth.value = displayWidth;
          overlayWidthInput.value = displayWidth;
        }
        rerenderOptimizationPreview();
      };

      overlayColorPreview.onclick = () => openColorPickerAnchoredTo(overlayColorInput, overlayColorPreview, { title: 'Overlay Color', uiInstance: this });
      overlayColorInput.oninput = (e) => applyOverlayStyle({ color: e.target.value });
      overlayColorInput.onchange = (e) => applyOverlayStyle({ color: e.target.value, commit: true });
      overlayWidth.oninput = (e) => applyOverlayStyle({ width: e.target.value });
      overlayWidth.onchange = (e) => applyOverlayStyle({ width: e.target.value, commit: true });
      overlayWidthInput.oninput = (e) => applyOverlayStyle({ width: e.target.value });
      overlayWidthInput.onchange = (e) => applyOverlayStyle({ width: e.target.value, commit: true });
      overlayResetBtn.onclick = () => {
        applyOverlayStyle({ color: '#38bdf8', width: 0.2, commit: true });
      };

      const overlayColorField = document.createElement('div');
      overlayColorField.className = 'style-field';
      const overlayColorLabel = document.createElement('span');
      overlayColorLabel.className = 'style-field-label';
      overlayColorLabel.textContent = 'Line Color';
      overlayColorField.appendChild(overlayColorLabel);
      overlayColorField.appendChild(overlayColorPreview);
      overlayColorField.appendChild(overlayColorInput);

      const overlayThicknessField = document.createElement('div');
      overlayThicknessField.className = 'style-field';
      const overlayThicknessLabel = document.createElement('span');
      overlayThicknessLabel.className = 'style-field-label';
      overlayThicknessLabel.textContent = 'Line Thickness';
      overlayThicknessField.appendChild(overlayThicknessLabel);
      overlayThicknessField.appendChild(overlaySizeControls);

      const overlayResetField = document.createElement('div');
      overlayResetField.className = 'style-field';
      const overlayResetLabel = document.createElement('span');
      overlayResetLabel.className = 'style-field-label';
      overlayResetLabel.textContent = 'Reset';
      overlayResetField.appendChild(overlayResetLabel);
      overlayResetField.appendChild(overlayResetBtn);

      overlayStyleControls.appendChild(overlayColorField);
      overlayStyleControls.appendChild(overlayThicknessField);
      overlayStyleControls.appendChild(overlayResetField);
      const overlayStyleRow = buildRow('Overlay Style', overlayStyleControls);
      if (!SETTINGS.lineSortOverlayVisible) overlayStyleRow.classList.add('hidden');
      panel.appendChild(overlayStyleRow);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'opt-reset';
      resetBtn.textContent = 'Reset Optimizations';
      resetBtn.onclick = () => {
        const defaults = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
        applyOptimization((cfg) => {
          cfg.bypassAll = defaults.bypassAll ?? false;
          cfg.steps = clone(defaults.steps || []);
        });
        this.buildControls();
      };
      const resetRow = document.createElement('div');
      resetRow.className = 'optimization-actions';
      resetRow.appendChild(resetBtn);
      panel.appendChild(resetRow);

      const stats = document.createElement('div');
      stats.className = 'optimization-stats';
      stats.innerHTML = `
        <div class="optimization-stat-row">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Before</span>
          <span class="text-[10px] text-vectura-accent" data-opt-stat="before">Lines 0 • Points 0 • 0m • 0:00</span>
        </div>
        <div class="optimization-stat-row">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">After</span>
          <span class="text-[10px] text-vectura-accent" data-opt-stat="after">Lines 0 • Points 0 • 0m • 0:00</span>
        </div>
      `;
      panel.appendChild(stats);

      if (!config) {
        target.appendChild(panel);
        return;
      }

      const list = document.createElement('div');
      list.className = 'optimization-list';

      const buildExportSettingsCard = () => {
        const card = document.createElement('div');
        card.className = 'optimization-card';
        card.innerHTML = `
          <div class="optimization-card-header">
            <div class="optimization-card-title">
              <span>Export Settings</span>
            </div>
          </div>
        `;
        const controlsWrap = document.createElement('div');
        controlsWrap.className = 'optimization-controls';

        const precisionValue = Math.max(0, Math.min(6, parseInt(SETTINGS.precision, 10) || 3));
        const precisionControl = document.createElement('div');
        precisionControl.className = 'optimization-control';
        precisionControl.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">Precision</label>
          </div>
        `;
        let precisionSlider = null;
        const applyPrecision = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(6, parseInt(raw, 10) || 3));
          SETTINGS.precision = next;
          // The legacy handler snapped the slider back when the raw value was
          // coerced (e.g. 0 → 3 via the `|| 3` fallback); mirror that so the
          // thumb/chip never disagree with SETTINGS.precision.
          if (precisionSlider && precisionSlider.getValue() !== next) {
            precisionSlider.setValue(next, { silent: true });
          }
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        precisionSlider = UI.Slider(precisionControl, {
          value: precisionValue, min: 0, max: 6, step: 1,
          ariaLabel: 'Export precision',
          defaultValue: 3,
          onChange: (v) => applyPrecision(v),
          onCommit: (v) => applyPrecision(v, { commit: true }),
        });
        controlsWrap.appendChild(precisionControl);

        const strokeOverrideOn = SETTINGS.strokeWidthOverride === true;
        const strokeOverrideControl = document.createElement('div');
        strokeOverrideControl.className = 'optimization-control';
        strokeOverrideControl.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">Export Stroke Override</label>
            <span class="text-xs text-vectura-accent font-mono">${strokeOverrideOn ? 'ON' : 'OFF'}</span>
          </div>
          <label class="sw-toggle" role="switch" aria-checked="${strokeOverrideOn ? 'true' : 'false'}">
            <input type="checkbox" ${strokeOverrideOn ? 'checked' : ''} />
            <span class="sw-track"></span>
            <span class="sw-thumb"></span>
          </label>
        `;
        const strokeOverrideToggle = strokeOverrideControl.querySelector('input');
        const strokeOverrideState = strokeOverrideControl.querySelector('span');
        const strokeOverrideSwitch = strokeOverrideControl.querySelector('.sw-toggle');

        const strokeConfig = this.getDocumentLengthConfig({ minMm: 0, maxMm: 5, stepMm: 0.05 });
        const strokeValueDisplay = this.formatDocumentNumber(SETTINGS.strokeWidth ?? 0.3, { precision: strokeConfig.precision });
        const strokeControl = document.createElement('div');
        strokeControl.className = 'optimization-control';
        strokeControl.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">Stroke (${strokeConfig.unitLabel})</label>
          </div>
        `;
        const applyStroke = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.strokeWidth ?? 0.3 }));
          SETTINGS.strokeWidth = Number.isFinite(next) ? next : 0.3;
          this.app.engine.layers.forEach((layer) => {
            layer.strokeWidth = SETTINGS.strokeWidth;
          });
          this.app.render();
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        const strokeSlider = UI.Slider(strokeControl, {
          value: parseFloat(strokeValueDisplay),
          min: strokeConfig.min, max: strokeConfig.max, step: strokeConfig.step,
          precision: strokeConfig.precision,
          ariaLabel: 'Export stroke width',
          defaultValue: mmToDocumentUnits(0.3, this.getDocumentUnits()),
          format: (v) => `${this.formatDocumentNumber(this.parseDocumentNumber(v, { fallbackMm: 0.3 }), { precision: strokeConfig.precision })}${strokeConfig.unitLabel}`,
          parse: (text) => parseFloat(String(text).replace(strokeConfig.unitLabel, '')),
          onChange: (v) => applyStroke(v),
          onCommit: (v) => applyStroke(v, { commit: true }),
        });
        const strokeRange = strokeSlider.el.querySelector('input[type="range"]');
        const setStrokeSliderVisible = (visible) => {
          strokeControl.hidden = !visible;
          if (strokeRange) strokeRange.disabled = !visible;
        };
        setStrokeSliderVisible(strokeOverrideOn);
        if (strokeOverrideToggle) {
          strokeOverrideToggle.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const enabled = Boolean(e.target.checked);
            SETTINGS.strokeWidthOverride = enabled;
            if (strokeOverrideState) strokeOverrideState.textContent = enabled ? 'ON' : 'OFF';
            if (strokeOverrideSwitch) strokeOverrideSwitch.setAttribute('aria-checked', enabled ? 'true' : 'false');
            setStrokeSliderVisible(enabled);
            this.app.persistPreferencesDebounced?.();
            this.app.render();
            updateStats();
            if (this.exportModalState?.isOpen) this.renderExportPreview();
          };
        }
        controlsWrap.appendChild(strokeOverrideControl);
        controlsWrap.appendChild(strokeControl);

        const hiddenGeometryControl = document.createElement('div');
        hiddenGeometryControl.className = 'optimization-control';
        hiddenGeometryControl.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">Remove Hidden Geometry</label>
            <span class="text-xs text-vectura-accent font-mono">${SETTINGS.removeHiddenGeometry !== false ? 'ON' : 'OFF'}</span>
          </div>
          <label class="sw-toggle" role="switch" aria-checked="${SETTINGS.removeHiddenGeometry !== false ? 'true' : 'false'}">
            <input type="checkbox" ${SETTINGS.removeHiddenGeometry !== false ? 'checked' : ''} />
            <span class="sw-track"></span>
            <span class="sw-thumb"></span>
          </label>
        `;
        const hiddenGeometryToggle = hiddenGeometryControl.querySelector('input');
        const hiddenGeometryState = hiddenGeometryControl.querySelector('span');
        if (hiddenGeometryToggle && hiddenGeometryState) {
          hiddenGeometryToggle.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            SETTINGS.removeHiddenGeometry = Boolean(e.target.checked);
            hiddenGeometryState.textContent = SETTINGS.removeHiddenGeometry ? 'ON' : 'OFF';
            this.app.persistPreferencesDebounced?.();
            if (this.exportModalState?.isOpen) this.renderExportPreview();
          };
        }
        controlsWrap.appendChild(hiddenGeometryControl);

        const toggleControl = document.createElement('div');
        toggleControl.className = 'optimization-control';
        toggleControl.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">Plotter Optimization</label>
            <span class="text-xs text-vectura-accent font-mono">${SETTINGS.plotterOptimize > 0 ? 'ON' : 'OFF'}</span>
          </div>
          <label class="sw-toggle" role="switch" aria-checked="${SETTINGS.plotterOptimize > 0 ? 'true' : 'false'}">
            <input type="checkbox" />
            <span class="sw-track"></span>
            <span class="sw-thumb"></span>
          </label>
        `;
        const plotterToggle = toggleControl.querySelector('input');
        const toggleState = toggleControl.querySelector('span');
        const toleranceControl = document.createElement('div');
        toleranceControl.className = 'optimization-control';
        const currentTolerance = Math.max(0.01, Math.min(1, SETTINGS.plotterOptimize || 0.1));
        const toleranceConfig = this.getDocumentLengthConfig({ minMm: 0.01, maxMm: 1, stepMm: 0.01 });
        const toleranceDisplay = this.formatDocumentNumber(currentTolerance, { precision: toleranceConfig.precision });
        toleranceControl.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">Optimization Tolerance (${toleranceConfig.unitLabel})</label>
          </div>
        `;
        const clampTolerance = (raw) => {
          const next = this.parseDocumentNumber(raw, { fallbackMm: 0.1 });
          if (!Number.isFinite(next)) return 0.1;
          return Math.max(0.01, Math.min(1, next));
        };
        const applyTolerance = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = clampTolerance(raw);
          SETTINGS.plotterOptimize = plotterToggle?.checked ? next : 0;
          if (toggleState) toggleState.textContent = SETTINGS.plotterOptimize > 0 ? 'ON' : 'OFF';
          rerenderOptimizationPreview();
        };
        const tolSlider = UI.Slider(toleranceControl, {
          value: parseFloat(toleranceDisplay),
          min: toleranceConfig.min, max: toleranceConfig.max, step: toleranceConfig.step,
          precision: toleranceConfig.precision,
          ariaLabel: 'Optimization tolerance',
          defaultValue: mmToDocumentUnits(0.1, this.getDocumentUnits()),
          format: (v) => `${this.formatDocumentNumber(clampTolerance(v), { precision: toleranceConfig.precision })}${toleranceConfig.unitLabel}`,
          parse: (text) => parseFloat(String(text).replace(toleranceConfig.unitLabel, '')),
          onChange: (v) => applyTolerance(v),
          onCommit: (v) => applyTolerance(v, { commit: true }),
        });
        const tolRange = tolSlider.el.querySelector('input[type="range"]');
        const setToleranceVisible = (visible) => {
          toleranceControl.hidden = !visible;
          if (tolRange) tolRange.disabled = !visible;
        };
        if (plotterToggle) {
          plotterToggle.checked = SETTINGS.plotterOptimize > 0;
          setToleranceVisible(plotterToggle.checked);
          plotterToggle.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const enabled = Boolean(e.target.checked);
            setToleranceVisible(enabled);
            const clamped = clampTolerance(tolSlider.getValue());
            SETTINGS.plotterOptimize = enabled ? clamped : 0;
            if (toggleState) toggleState.textContent = enabled ? 'ON' : 'OFF';
            rerenderOptimizationPreview();
          };
        }
        controlsWrap.appendChild(toggleControl);
        controlsWrap.appendChild(toleranceControl);

        card.appendChild(controlsWrap);
        return card;
      };

      const formatOptValue = (def, value) => {
        const { precision, unit } = getOptimizationDisplayConfig(def);
        const factor = Math.pow(10, precision);
        const displayValue = toOptimizationDisplayValue(def, value ?? 0);
        const rounded = Math.round(displayValue * factor) / factor;
        return `${rounded}${unit}`;
      };

      const buildRangeControl = (stepConfig, def) => {
        const control = document.createElement('div');
        control.className = 'optimization-control';
        const value = stepConfig[def.key] ?? getStepDefaults(stepConfig.id)[def.key] ?? def.min ?? 0;
        if (stepConfig[def.key] === undefined) stepConfig[def.key] = value;
        const { min, max, step, unit } = getOptimizationDisplayConfig(def);
        control.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getOptimizationLabel(def.label)}</label>
          </div>
        `;
        const applyStepValue = (next) => {
          applyOptimization((cfg) => {
            const stepCfg = cfg.steps.find((s) => s.id === stepConfig.id);
            if (stepCfg) stepCfg[def.key] = next;
          });
        };
        const defaults = getStepDefaults(stepConfig.id);
        UI.Slider(control, {
          value: toOptimizationDisplayValue(def, value),
          min, max, step,
          ariaLabel: getOptimizationLabel(def.label),
          defaultValue: defaults[def.key] === undefined
            ? undefined
            : toOptimizationDisplayValue(def, defaults[def.key]),
          format: (v) => formatOptValue(def, fromOptimizationDisplayValue(def, v)),
          parse: (text) => parseFloat(String(text).replace(unit, '')),
          // Live regen on every input (matches the old oninput handler); the
          // release motion is played by the component itself, and step ranges
          // never pushed history on change.
          onChange: (v) => applyStepValue(fromOptimizationDisplayValue(def, v)),
        });
        return control;
      };

      const buildSelectControl = (stepConfig, def) => {
        const control = document.createElement('div');
        control.className = 'optimization-control';
        let value = stepConfig[def.key];
        if ((value === undefined || value === null) && def.options?.length) {
          value = def.options[0].value;
          stepConfig[def.key] = value;
        }
        const optionsHtml = (def.options || [])
          .map((opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`)
          .join('');
        const currentLabel = def.options.find((opt) => opt.value === value)?.label || value;
        control.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
          </div>
          <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
            ${optionsHtml}
          </select>
        `;
        const input = control.querySelector('select');
        const span = control.querySelector('span');
        if (input && span) {
          input.onchange = (e) => {
            const next = e.target.value;
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
            span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaults = getStepDefaults(stepConfig.id);
            const next = defaults[def.key] ?? def.options?.[0]?.value;
            if (next === undefined) return;
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
            input.value = next;
            span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
          });
        }
        return control;
      };

      const buildCheckboxControl = (stepConfig, def) => {
        const control = document.createElement('div');
        control.className = 'optimization-control';
        const checked = Boolean(stepConfig[def.key]);
        control.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
          </div>
        `;
        const span = control.querySelector('span');
        const applyValue = (next) => {
          if (span) span.textContent = next ? 'ON' : 'OFF';
          applyOptimization((cfg) => {
            const step = cfg.steps.find((s) => s.id === stepConfig.id);
            if (step) step[def.key] = next;
          });
        };
        // UI.SwToggle brings keyboard (Space/Enter + focus ring) and
        // aria-checked state the hand-rolled markup lacked (same migration as
        // the algorithm `type:'checkbox'` defs below).
        const toggle = UI.SwToggle(control, {
          checked,
          ariaLabel: getDisplayLabel(def) || def.key,
          onChange: applyValue,
        });
        // dblclick on the pill resets to the step default — legacy parity.
        const cbInput = toggle.el.querySelector('input[type="checkbox"]');
        if (cbInput) {
          cbInput.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaults = getStepDefaults(stepConfig.id);
            if (defaults[def.key] === undefined) return;
            const next = Boolean(defaults[def.key]);
            toggle.setChecked(next, { silent: true });
            applyValue(next);
          });
        }
        return control;
      };

      const bindReorderGrip = (grip, card, stepId) => {
        if (!grip) return;
        grip.onmousedown = (e) => {
          e.preventDefault();
          const dragEl = card;
          dragEl.classList.add('dragging');
          const indicator = document.createElement('div');
          indicator.className = 'optimization-drop-indicator';
          list.insertBefore(indicator, dragEl.nextSibling);
          const currentOrder = config.steps.map((step) => step.id);
          const startIndex = currentOrder.indexOf(stepId);
          const onMove = (ev) => {
            const y = ev.clientY;
            const items = Array.from(list.querySelectorAll('.optimization-card')).filter((item) => item !== dragEl);
            let inserted = false;
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                list.insertBefore(indicator, item);
                inserted = true;
                break;
              }
            }
            if (!inserted) list.appendChild(indicator);
          };
          const onUp = () => {
            dragEl.classList.remove('dragging');
            const siblings = Array.from(list.children);
            const indicatorIndex = siblings.indexOf(indicator);
            const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('optimization-card'));
            const newIndex = before.length;
            indicator.remove();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (newIndex === startIndex || newIndex < 0) return;
            applyOptimization((cfg) => {
              const order = cfg.steps.map((step) => step.id).filter((id) => id !== stepId);
              const targetIndex = Math.max(0, Math.min(order.length, newIndex));
              order.splice(targetIndex, 0, stepId);
              const map = new Map(cfg.steps.map((step) => [step.id, step]));
              cfg.steps = order.map((id) => map.get(id)).filter(Boolean);
            });
            this.buildControls();
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
      };

      list.appendChild(buildExportSettingsCard());

      OPTIMIZATION_STEPS.forEach((def) => {
        const stepConfig = config.steps.find((step) => step.id === def.id) || { id: def.id, enabled: false, bypass: false };
        if (!config.steps.find((step) => step.id === def.id)) config.steps.push(stepConfig);
        const card = document.createElement('div');
        card.className = 'optimization-card';
        card.dataset.stepId = def.id;
        const header = document.createElement('div');
        header.className = 'optimization-card-header';
        header.innerHTML = `
          <div class="optimization-card-title">
            <button class="optimization-grip" type="button" aria-label="Reorder optimization">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
            <span>${getDisplayLabel(def)}</span>
          </div>
          <div class="optimization-card-actions">
            <label class="opt-toggle">
              <label class="sw-toggle" role="switch" aria-checked="${stepConfig.enabled ? 'true' : 'false'}">
                <input type="checkbox" ${stepConfig.enabled ? 'checked' : ''} />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
              Apply
            </label>
            <label class="opt-toggle">
              <label class="sw-toggle" role="switch" aria-checked="${stepConfig.bypass ? 'true' : 'false'}">
                <input type="checkbox" ${stepConfig.bypass ? 'checked' : ''} />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
              Bypass
            </label>
          </div>
        `;
        const grip = header.querySelector('.optimization-grip');
        bindReorderGrip(grip, card, def.id);
        const [applyToggle, bypassStepToggle] = header.querySelectorAll('input[type="checkbox"]');
        if (applyToggle) {
          applyToggle.onchange = (e) => {
            const next = Boolean(e.target.checked);
            // Enabling line sort lights up the print-order overlay ONLY inside
            // the export modal (where the gradient preview lives). On the main
            // canvas we no longer force the overlay on — the Draw Order slider is
            // the canonical print-order preview there, so an auto-overlay just
            // adds a confusing second visualization the user didn't ask for.
            if (def.id === 'linesort' && next && this.exportModalState?.isOpen) {
              if ((this.exportModalState.previewMode || 'off') === 'off') {
                this.exportModalState.previewMode = 'overlay';
                const previewSelect = this.exportModalState.root?.querySelector('#export-preview-mode');
                if (previewSelect) previewSelect.value = 'overlay';
              }
              SETTINGS.optimizationPreview = this.exportModalState.previewMode;
            }
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === def.id);
              if (step) step.enabled = next;
            });
            this.buildControls();
          };
        }
        if (bypassStepToggle) {
          bypassStepToggle.onchange = (e) => {
            const next = Boolean(e.target.checked);
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === def.id);
              if (step) step.bypass = next;
              cfg.bypassAll = (cfg.steps || []).every((s) => Boolean(s.bypass));
            });
            this.buildControls();
          };
        }
        card.appendChild(header);

        const controlsWrap = document.createElement('div');
        controlsWrap.className = 'optimization-controls';
        const isDisabled = !stepConfig.enabled || config.bypassAll;
        if (isDisabled) controlsWrap.classList.add('is-disabled');
        (def.controls || []).forEach((cDef) => {
          let control = null;
          if (cDef.type === 'select') control = buildSelectControl(stepConfig, cDef);
          else if (cDef.type === 'checkbox') control = buildCheckboxControl(stepConfig, cDef);
          else control = buildRangeControl(stepConfig, cDef);
          if (control) {
            const inputs = control.querySelectorAll('input, select, button');
            inputs.forEach((input) => {
              if (input.type === 'button') return;
              input.disabled = isDisabled;
            });
            controlsWrap.appendChild(control);
          }
        });
        card.appendChild(controlsWrap);
        list.appendChild(card);
      });

      panel.appendChild(list);
      target.appendChild(panel);
      updateStats();
    };

    const renderExportOptimizationIfOpen = () => {
      if (!this.exportModalState?.isOpen) return;
      const optimizationTarget = getEl('optimization-controls');
      if (!optimizationTarget) return;
      optimizationTarget.innerHTML = '';
      renderOptimizationPanel(optimizationTarget);
    };

    const paintBucketSection = getEl('left-section-paint-bucket', { silent: true });
    const paintBucketActive = this.activeTool === 'fill' || this.activeTool === 'fill-erase';
    if (paintBucketActive) {
      this._showWelcomePanel(false);
      const algoSec = getEl('left-section-algorithm', { silent: true });
      const algoConfSec = getEl('left-section-algorithm-configuration', { silent: true });
      const multiSel = getEl('left-section-multi-selection', { silent: true });
      const multiInfo = getEl('left-section-multi-info', { silent: true });
      const multiXform = getEl('left-section-multi-transform', { silent: true });
      const multiPf = getEl('left-section-multi-pathfinder', { silent: true });
      if (algoSec) algoSec.style.display = 'none';
      if (algoConfSec) algoConfSec.style.display = 'none';
      if (multiSel) multiSel.style.display = 'none';
      if (multiInfo) multiInfo.style.display = 'none';
      if (multiXform) multiXform.style.display = 'none';
      if (multiPf) multiPf.style.display = 'none';
      if (paintBucketSection) {
        // CSS-10: drop the initial-state `.is-hidden` utility class before
        // letting inline style govern visibility (the class is `!important`).
        paintBucketSection.classList.remove('is-hidden');
        paintBucketSection.style.display = '';
      }
      this.app?.ui?.refreshPaintBucketPanel?.();
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }
    if (paintBucketSection) paintBucketSection.style.display = 'none';
    if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
      this._showWelcomePanel(false);
      const algoSec = getEl('left-section-algorithm', { silent: true });
      const algoConfSec = getEl('left-section-algorithm-configuration', { silent: true });
      if (algoSec) algoSec.style.display = 'none';
      if (algoConfSec) algoConfSec.style.display = 'none';
      this._buildPatternFillPanel(container);
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }

    // Multi-selection: show four sibling subpanels (Multiple Selection / Transform
    // / Align / Pathfinder), each rendered as a top-level .left-panel-section so
    // each picks up the accent-bar treatment. The transform/seed inputs are
    // relocated into the Transform subpanel; the description goes in the
    // Multiple-Selection subpanel. Single-selection restoration moves the
    // transform section back to its home inside #left-section-algorithm-body.
    const multiSelectedLayers = (this.app.renderer?.getSelectedLayers?.() || []);
    const isMultiSelection = multiSelectedLayers.length > 1;
    const algoBodyEl = getEl('left-section-algorithm-body', { silent: true });
    const moduleLabelEl = getEl('primary-module-label', { silent: true });
    const moduleLabelWrap = moduleLabelEl?.parentElement || null;
    const moduleTriggerEl = getEl('generator-module-trigger', { silent: true });
    const algoAboutEl = getEl('algo-about', { silent: true });
    const seedControlsEl = getEl('seed-controls', { silent: true });
    const transformSectionEl = getEl('algorithm-transform-section', { silent: true });
    const algoSectionEl = getEl('left-section-algorithm', { silent: true });
    const algoConfigSectionEl = getEl('left-section-algorithm-configuration', { silent: true });
    const primaryTitleEl = getEl('left-section-primary-title', { silent: true });
    const multiInfoSection = getEl('left-section-multi-info', { silent: true });
    const multiInfoBody = getEl('left-section-multi-info-body', { silent: true });
    const multiTransformSection = getEl('left-section-multi-transform', { silent: true });
    const multiTransformBody = getEl('left-section-multi-transform-body', { silent: true });
    const multiPathfinderSection = getEl('left-section-multi-pathfinder', { silent: true });
    const existingMultiNotice = document.querySelector('[data-multi-selection-notice]');
    if (existingMultiNotice) existingMultiNotice.remove();

    const multiSelSection = getEl('left-section-multi-selection', { silent: true });
    if (isMultiSelection) {
      this._showWelcomePanel(false);
      if (algoSectionEl) algoSectionEl.style.display = 'none';
      if (algoConfigSectionEl) algoConfigSectionEl.style.display = 'none';
      // CSS-10: each of these four sections begins life with `.is-hidden`
      // (display:none !important). Strip the class on first reveal so the
      // subsequent inline style.display='' actually unhides them.
      if (multiSelSection) { multiSelSection.classList.remove('is-hidden'); multiSelSection.style.display = ''; }
      if (multiInfoSection) { multiInfoSection.classList.remove('is-hidden'); multiInfoSection.style.display = ''; }
      if (multiTransformSection) { multiTransformSection.classList.remove('is-hidden'); multiTransformSection.style.display = ''; }
      if (multiPathfinderSection) { multiPathfinderSection.classList.remove('is-hidden'); multiPathfinderSection.style.display = ''; }
      if (primaryTitleEl) primaryTitleEl.textContent = 'Algorithm';
      if (moduleLabelWrap) moduleLabelWrap.style.display = '';
      if (moduleTriggerEl) moduleTriggerEl.style.display = '';
      if (algoAboutEl) algoAboutEl.style.display = '';
      if (seedControlsEl) seedControlsEl.style.display = 'none';

      // Relocate the Transform section into the multi-Transform subpanel body
      // (its single-selection home is back inside #left-section-algorithm-body).
      if (transformSectionEl && multiTransformBody && transformSectionEl.parentElement !== multiTransformBody) {
        multiTransformBody.appendChild(transformSectionEl);
      }
      if (transformSectionEl) {
        transformSectionEl.style.display = '';
        // Force the Transform's inner global-section body open — the outer
        // .left-panel-section header now drives collapse for the whole subpanel.
        transformSectionEl.classList.remove('collapsed');
        const innerHeader = getEl('algorithm-transform-header', { silent: true });
        if (innerHeader) innerHeader.style.display = 'none';
        const innerBody = getEl('algorithm-transform-body', { silent: true });
        if (innerBody) {
          // CSS-10: strip initial `.is-hidden` class before unhiding.
          innerBody.classList.remove('is-hidden');
          innerBody.style.display = '';
        }
      }

      const notice = document.createElement('p');
      notice.dataset.multiSelectionNotice = 'true';
      notice.className = 'text-xs text-vectura-muted leading-relaxed';
      notice.textContent = `${multiSelectedLayers.length} layers selected. Select a single layer to edit its parameters. Transform changes below apply to all selected layers.`;
      if (multiInfoBody) {
        multiInfoBody.innerHTML = '';
        multiInfoBody.appendChild(notice);
      }
      this.app?.ui?.refreshAlignPanel?.();
      this.app?.ui?.refreshPathfinderPanel?.();

      const sharedValue = (getter) => {
        let v = null;
        for (let i = 0; i < multiSelectedLayers.length; i++) {
          const cur = getter(multiSelectedLayers[i]);
          if (i === 0) v = cur;
          else if (cur !== v) return null;
        }
        return v;
      };
      const formatPosShared = (v) => (v == null ? '' : (typeof this.formatDocumentNumber === 'function'
        ? this.formatDocumentNumber(v, { trimTrailingZeros: true })
        : v));
      const posXEl = getEl('inp-pos-x');
      const posYEl = getEl('inp-pos-y');
      const scaleXEl = getEl('inp-scale-x');
      const scaleYEl = getEl('inp-scale-y');
      const rotEl = getEl('inp-rotation');
      const applyShared = (el, value, formatter) => {
        if (!el) return;
        el.value = value == null ? '' : (formatter ? formatter(value) : value);
        el.placeholder = value == null ? 'Multiple' : '';
      };
      applyShared(posXEl, sharedValue((l) => l.params?.posX ?? null), formatPosShared);
      applyShared(posYEl, sharedValue((l) => l.params?.posY ?? null), formatPosShared);
      applyShared(scaleXEl, sharedValue((l) => l.params?.scaleX ?? null));
      applyShared(scaleYEl, sharedValue((l) => l.params?.scaleY ?? null));
      applyShared(rotEl, sharedValue((l) => l.params?.rotation ?? null));

      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }

    // Single-selection: restore any chrome a prior multi-selection pass hid.
    if (algoSectionEl) algoSectionEl.style.display = '';
    if (multiSelSection) multiSelSection.style.display = 'none';
    if (multiInfoSection) multiInfoSection.style.display = 'none';
    if (multiTransformSection) multiTransformSection.style.display = 'none';
    if (multiPathfinderSection) multiPathfinderSection.style.display = 'none';
    if (primaryTitleEl) primaryTitleEl.textContent = 'Algorithm';
    if (moduleLabelWrap) moduleLabelWrap.style.display = '';
    if (moduleTriggerEl) moduleTriggerEl.style.display = '';
    // Respect the persisted ABOUT visibility instead of force-showing it: the
    // task bar's "Show Properties panel" hides ABOUT to surface more controls,
    // and that must survive the next buildControls() rebuild (P3 feedback).
    if (algoAboutEl) {
      const aboutHidden = window.Vectura && window.Vectura.SETTINGS
        && window.Vectura.SETTINGS.aboutVisible === false;
      algoAboutEl.style.display = aboutHidden ? 'none' : '';
    }
    if (seedControlsEl) seedControlsEl.style.display = '';
    // Return the Transform section to its single-selection home (last child of
    // #left-section-algorithm-body) and restore its inner header so the nested
    // global-section collapse works again.
    if (transformSectionEl && algoBodyEl && transformSectionEl.parentElement !== algoBodyEl) {
      algoBodyEl.appendChild(transformSectionEl);
    }
    const innerXformHeader = getEl('algorithm-transform-header', { silent: true });
    if (innerXformHeader) innerXformHeader.style.display = '';
    ['inp-pos-x', 'inp-pos-y', 'inp-scale-x', 'inp-scale-y', 'inp-rotation'].forEach((id) => {
      const el = getEl(id, { silent: true });
      if (el && el.placeholder) el.placeholder = '';
    });
    const layer = this.app.engine.getActiveLayer();
    if (!layer) {
      this._showWelcomePanel(true);
      restoreLeftPanelScroll();
      return;
    }
    this._showWelcomePanel(false);
    this.ensurePatternLayerSelection(layer);

    const moduleSelect = getEl('generator-module');
    const seed = getEl('inp-seed');
    const posX = getEl('inp-pos-x');
    const posY = getEl('inp-pos-y');
    const scaleX = getEl('inp-scale-x');
    const scaleY = getEl('inp-scale-y');
    const rotation = getEl('inp-rotation');
    const isGroup = Boolean(layer.isGroup);
    const isModifier = this.isModifierLayer(layer);
    const isStatic = Boolean(isGroup || isModifier);
    const algoSection = getEl('left-section-algorithm', { silent: true });
    const algoConfigSection = getEl('left-section-algorithm-configuration', { silent: true });
    const hideAlgoPanels = isGroup && !isModifier;
    if (algoSection) algoSection.style.display = hideAlgoPanels ? 'none' : '';
    if (algoConfigSection) algoConfigSection.style.display = hideAlgoPanels ? 'none' : '';
    if (hideAlgoPanels) {
      // Pathfinder compound: reveal the Pathfinder panel (lives in the
      // multi-selection section) so the user can change op type or expand.
      if (layer.type === 'compound' && multiSelSection) {
        // CSS-10: strip the initial `.is-hidden` utility before unhiding.
        multiSelSection.classList.remove('is-hidden');
        multiSelSection.style.display = '';
        if (primaryTitleEl) primaryTitleEl.textContent = 'Pathfinder';
        this.app?.ui?.refreshAlignPanel?.();
        this.app?.ui?.refreshPathfinderPanel?.();
      }
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }
    this.updatePrimaryPanelMode(layer);
    if (algoSection) {
      const _SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
      if (!_SETTINGS.uiSections) _SETTINGS.uiSections = this.getLeftSectionDefaults();
      const _algoBody = algoSection.querySelector('.left-panel-section-body');
      const _algoHdr = algoSection.querySelector('.left-panel-section-header');
      if (isModifier) {
        const secs = _SETTINGS.uiSections;
        const modCollapsed = Object.prototype.hasOwnProperty.call(secs, 'modifierSection')
          ? secs.modifierSection !== false
          : true;
        algoSection.classList.toggle('collapsed', modCollapsed);
        if (_algoBody) _algoBody.style.display = modCollapsed ? 'none' : '';
        if (_algoHdr) {
          _algoHdr.setAttribute('aria-expanded', modCollapsed ? 'false' : 'true');
          _algoHdr.onclick = () => {
            const next = !algoSection.classList.contains('collapsed');
            _SETTINGS.uiSections.modifierSection = next;
            algoSection.classList.toggle('collapsed', next);
            if (_algoBody) _algoBody.style.display = next ? 'none' : '';
            _algoHdr.setAttribute('aria-expanded', next ? 'false' : 'true');
            this.app.persistPreferencesDebounced?.();
          };
        }
      } else if (_algoHdr) {
        _algoHdr.onclick = () => {
          this.setLeftSectionCollapsed('algorithm', !algoSection.classList.contains('collapsed'));
        };
      }
    }
    this.syncPrimaryModuleDropdown(layer);
    if (moduleSelect) {
      if (!isModifier) {
        Array.from(moduleSelect.options).forEach((opt) => {
          if (opt.dataset.temp === 'true') opt.remove();
        });
        const hasOption = Array.from(moduleSelect.options).some((opt) => opt.value === layer.type);
        if (!hasOption) {
          const opt = document.createElement('option');
          opt.value = layer.type;
          opt.dataset.temp = 'true';
          opt.innerText = ALGO_DEFAULTS?.[layer.type]?.label || layer.type;
          moduleSelect.appendChild(opt);
        }
        moduleSelect.value = layer.type;
        moduleSelect.disabled = isStatic;
        moduleSelect.classList.toggle('opacity-60', isStatic);
        this._syncModuleDisplay();
      }
    }
    if (seed) seed.value = layer.params.seed;
    const formatPos = (v) => (typeof this.formatDocumentNumber === 'function'
      ? this.formatDocumentNumber(v, { trimTrailingZeros: true })
      : v);
    if (posX) posX.value = formatPos(layer.params.posX);
    if (posY) posY.value = formatPos(layer.params.posY);
    if (scaleX) scaleX.value = layer.params.scaleX;
    if (scaleY) scaleY.value = layer.params.scaleY;
    if (rotation) rotation.value = layer.params.rotation;
    if (!isModifier) this.toggleSeedControls(layer.type);

    const desc = getEl('algo-desc');
    if (desc) {
      desc.innerText = isModifier
        ? MODIFIER_DESCRIPTIONS?.[this.getModifierState(layer)?.type || 'mirror'] || 'No description available.'
        : DESCRIPTIONS[layer.type] || 'No description available.';
    }
    if (moduleSelect) {
      const algoLabel = moduleSelect.parentElement?.querySelector('.control-label');
      if (algoLabel && !algoLabel.querySelector('.info-btn')) {
        this.attachInfoButton(algoLabel, 'global.algorithm');
      }
    }

    const algoDefs = isModifier ? [] : this.controls[layer.type] || [];
    const commonDefs = COMMON_CONTROLS;
    const hasConditionalDefs = algoDefs.some((def) => typeof def.showIf === 'function');
    const hasNoiseConditional = WAVE_NOISE_DEFS.some((def) => typeof def.showIf === 'function');
    if (!isModifier && !algoDefs.length && !commonDefs.length) {
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }

    if (isModifier) {
      const modType = this.getModifierState(layer)?.type;
      if (modType === 'morph' && window.Vectura.UI.MorphPanel) {
        window.Vectura.UI.MorphPanel.build(this, layer, container);
      } else {
        window.Vectura.UI.MirrorPanel.build(this, layer, container);
      }
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }

    // Bespoke tabbed Text panel (synthesis design). Replaces the generic
    // control list for text layers — same early-return escape hatch the
    // Mirror/Morph modifier panels use. Inert until ui-text-panel.js loads.
    if (
      layer.type === 'text' &&
      window.Vectura.UI.TextPanel &&
      typeof window.Vectura.UI.TextPanel.build === 'function'
    ) {
      window.Vectura.UI.TextPanel.build(this, layer, container);
      renderExportOptimizationIfOpen();
      restoreLeftPanelScroll();
      return;
    }

    if (isGroup) {
      const msg = document.createElement('p');
      msg.className = 'text-xs text-vectura-muted mb-4';
      msg.textContent = 'Select a sublayer to edit its parameters.';
      container.appendChild(msg);
    } else {
      this.storeLayerParams(layer);
    }

    const resetWrap = document.createElement('div');
    resetWrap.className = 'mb-4 grid grid-cols-2 gap-2';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.onclick = () => {
      if (this.app.pushHistory) this.app.pushHistory();
      const transform = this.getDefaultTransformForType(layer.type, layer.params);
      if (!layer.paramStates) layer.paramStates = {};
      delete layer.paramStates[layer.type];
      const base = ALGO_DEFAULTS[layer.type] ? clone(ALGO_DEFAULTS[layer.type]) : {};
      layer.params = { ...base, ...transform };
      this.storeLayerParams(layer);
      this.buildControls();
      this.app.regen();
      this.updateFormula();
    };
    const randomBtn = document.createElement('button');
    randomBtn.type = 'button';
    randomBtn.id = 'btn-randomize-params';
    randomBtn.className = 'w-full text-xs border px-2 py-2';
    randomBtn.textContent = 'Randomize';
    randomBtn.onclick = (e) => {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
      const rect = randomBtn.getBoundingClientRect();
      const x = e.clientX || (rect.left + rect.width / 2);
      const y = e.clientY || (rect.top + rect.height / 2);
      fireRandSparks(x, y);
      if (this.app.pushHistory) this.app.pushHistory();
      this.randomizeLayerParams(l);
      this.storeLayerParams(l);
      this.app.regen();
      this.recenterLayerIfNeeded(l);
      this.app.render();
      this.buildControls();
      this.updateFormula();
    };
    resetWrap.appendChild(resetBtn);
    resetWrap.appendChild(randomBtn);
    if (!isGroup) container.appendChild(resetWrap);

    const getDefaultValue = (def) => {
      const defaults = (ALGO_DEFAULTS && ALGO_DEFAULTS[layer.type]) || {};
      if (def.type === 'rangeDual') {
        if (
          Object.prototype.hasOwnProperty.call(defaults, def.minKey) &&
          Object.prototype.hasOwnProperty.call(defaults, def.maxKey)
        ) {
          return { min: defaults[def.minKey], max: defaults[def.maxKey] };
        }
        return null;
      }
      if (def.id && Object.prototype.hasOwnProperty.call(defaults, def.id)) {
        return defaults[def.id];
      }
      if (def.default !== undefined) return def.default;
      return null;
    };

    // The 3D algorithms (spiralizer, polyhedron, topoform, rasterPlane) bake
    // the Curves toggle into their geometry at GENERATE time — their paths are
    // stamped `meta.straight` / `meta.forceCurves`, which override the renderer's
    // draw-time curve smoothing — so toggling Curves must regenerate, not just
    // re-render, or it has no visible effect.
    const curvesBakedAtGenerate = (lyr) =>
      !!(ALGO_DEFAULTS && lyr && ALGO_DEFAULTS[lyr.type] && ALGO_DEFAULTS[lyr.type].is3d);


    const globalSection = document.createElement('div');
    globalSection.className = 'global-section';
    globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
    const globalHeader = document.createElement('button');
    globalHeader.type = 'button';
    globalHeader.className = 'global-section-header';
    globalHeader.innerHTML = `
      <span class="global-section-title">Post-Processing Lab</span>
      <span class="global-section-toggle" aria-hidden="true"></span>
    `;
    const globalBody = document.createElement('div');
    globalBody.className = 'global-section-body';
    if (this.globalSectionCollapsed) globalBody.style.display = 'none';
    globalHeader.onclick = () => {
      this.globalSectionCollapsed = !this.globalSectionCollapsed;
      globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
      globalBody.style.display = this.globalSectionCollapsed ? 'none' : '';
    };
    globalSection.appendChild(globalHeader);
    globalSection.appendChild(globalBody);

    const inlineGroups = new Map();
    const getInlineGroup = (key) => {
      if (!inlineGroups.has(key)) {
        const row = document.createElement('div');
        row.className = 'control-inline-row';
        container.appendChild(row);
        inlineGroups.set(key, row);
      }
      return inlineGroups.get(key);
    };

    const basePendulumTemplate = {
      enabled: true,
      ampX: 100,
      ampY: 100,
      phaseX: 0,
      phaseY: 0,
      freq: 2,
      micro: 0,
      damp: 0.002,
    };
    const pendulumTemplates = ((ALGO_DEFAULTS?.harmonograph?.pendulums || []).map((pend, idx) => ({
      ...basePendulumTemplate,
      ...clone(pend),
      id: pend.id || `pend-${idx + 1}`,
      enabled: pend.enabled !== false,
    })) || []);
    const getPendulumDefault = (index, key) => {
      const template =
        pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
      return template[key] !== undefined ? template[key] : basePendulumTemplate[key];
    };
    const ensurePendulums = () => {
      let pendulums = layer.params.pendulums;
      if (!Array.isArray(pendulums) || !pendulums.length) {
        const legacy = [];
        for (let i = 1; i <= 3; i += 1) {
          const ampX = layer.params[`ampX${i}`];
          const ampY = layer.params[`ampY${i}`];
          if (ampX === undefined && ampY === undefined) continue;
          legacy.push({
            id: `pend-${i}`,
            enabled: true,
            ampX: ampX ?? basePendulumTemplate.ampX,
            ampY: ampY ?? basePendulumTemplate.ampY,
            phaseX: layer.params[`phaseX${i}`] ?? basePendulumTemplate.phaseX,
            phaseY: layer.params[`phaseY${i}`] ?? basePendulumTemplate.phaseY,
            freq: layer.params[`freq${i}`] ?? basePendulumTemplate.freq,
            micro: layer.params[`micro${i}`] ?? basePendulumTemplate.micro,
            damp: layer.params[`damp${i}`] ?? basePendulumTemplate.damp,
          });
        }
        pendulums = legacy.length ? legacy : clone(pendulumTemplates);
        layer.params.pendulums = pendulums;
      }
      pendulums = pendulums.map((pend, idx) => ({
        ...basePendulumTemplate,
        ...(pend || {}),
        id: pend?.id || `pend-${idx + 1}`,
        enabled: pend?.enabled !== false,
      }));
      layer.params.pendulums = pendulums;
      return pendulums;
    };
    const createPendulum = (index) => {
      const template =
        pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
      return {
        ...clone(template),
        id: `pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
        enabled: true,
      };
    };
    const pendulumParamDefs = [
      { key: 'ampX', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX' },
      { key: 'ampY', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY' },
      {
        key: 'phaseX',
        label: 'Phase X',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseX',
      },
      {
        key: 'phaseY',
        label: 'Phase Y',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseY',
      },
      { key: 'freq', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq' },
      { key: 'micro', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro' },
      { key: 'damp', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp' },
    ];

    const maybeRebuildControls = () => {
      if (hasConditionalDefs) this.buildControls();
    };

    const maybeRebuildNoiseControls = () => {
      if (hasNoiseConditional) this.buildControls();
    };


    // Generic preset apply path — every algorithm with a preset library routes
    // through this (the gallery mounts for any non-empty library). A preset
    // defines the whole figure (and may ship a motion patch); we clone the
    // algorithm's defaults, merge the preset params on top, then re-impose the
    // layer's transform (and a small per-algorithm preserve set) so applying a
    // preset never moves/resizes it on the canvas or drops algorithm-orthogonal
    // tuning like smoothing. `presetId === 'custom'` just stamps the custom
    // marker (petalisDesigner also clears its derived shading state). The caller
    // owns pushHistory (one entry per user action).
    const EXTRA_PRESERVED = {
      rings: ['smoothing', 'simplify', 'curves', 'outerDiameter', 'centerDiameter'],
      petalisDesigner: ['smoothing', 'simplify', 'curves'],
      terrain: ['smoothing', 'simplify', 'curves'],
    };
    const lookupPreset = (type, presetId) => {
      const libs = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.PresetLibraries;
      const builtIn = (libs && libs[type]) || [];
      let hit = builtIn.find((item) => item.id === presetId);
      if (hit) return hit;
      // User presets live in localStorage (keyed by system); the gallery offers
      // them in the same list, so apply must resolve them too.
      try {
        const raw = typeof localStorage !== 'undefined' && localStorage.getItem(`vectura.user_presets.${type}`);
        const user = raw ? JSON.parse(raw) : [];
        hit = Array.isArray(user) ? user.find((item) => item.id === presetId) : null;
      } catch (_) { hit = null; }
      return hit || null;
    };
    const applyPreset = (presetId) => {
      if (presetId === 'custom') {
        layer.params.preset = 'custom';
        if (layer.type === 'petalisDesigner') {
          layer.params.shadings = [];
          layer.params.innerShading = false;
          layer.params.outerShading = false;
        }
        this.storeLayerParams(layer);
        this.app.regen();
        this.buildControls();
        this.updateFormula();
        return;
      }
      const preset = lookupPreset(layer.type, presetId);
      const base = ALGO_DEFAULTS?.[layer.type] ? clone(ALGO_DEFAULTS[layer.type]) : {};
      const preserved = new Set([...TRANSFORM_KEYS, ...(EXTRA_PRESERVED[layer.type] || [])]);
      const nextParams = { ...base, ...(preset?.params || {}) };
      preserved.forEach((key) => {
        if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
      });
      nextParams.preset = presetId;
      layer.params = { ...layer.params, ...nextParams };
      this.storeLayerParams(layer);
      this.app.regen();
      this.buildControls();
      this.updateFormula();
    };
    // Surface the active layer's preset applier for out-of-panel callers (the
    // contextual task bar's preset flyout). Re-stashed each buildControls() so
    // it always closes over the current active layer; the caller owns history.
    this._applyActivePreset = applyPreset;

    const renderDef = (def, targetEl) => {
      const target = targetEl || container;
      if (def.showIf && !def.showIf(layer.params)) return;
      if (def.type === 'section') {
        // Collapsible variant (UX1 / WU10): `{ type:'section', collapsed:true }`
        // renders a closed disclosure whose body collects the controls that
        // FOLLOW it (the render loop routes them via the returned body — see the
        // `algoDefs` loop below). A plain section WITHOUT `collapsed` renders the
        // exact same flat header + sibling controls as before (backward-compat).
        if (def.collapsed) {
          const section = document.createElement('div');
          section.className = 'control-section control-section--collapsible is-collapsed';
          const header = document.createElement('button');
          header.type = 'button';
          header.className = 'control-section-title control-section-toggle';
          header.setAttribute('aria-expanded', 'false');
          header.innerHTML = `<span class="control-section-label">${getDisplayLabel(def)}</span><span class="control-section-caret" aria-hidden="true"></span>`;
          const body = document.createElement('div');
          body.className = 'control-section-body';
          const toggle = () => {
            const open = section.classList.toggle('is-collapsed');
            // classList.toggle returns the NEW presence of `is-collapsed`.
            header.setAttribute('aria-expanded', open ? 'false' : 'true');
          };
          header.addEventListener('click', toggle);
          section.appendChild(header);
          section.appendChild(body);
          target.appendChild(section);
          // Signal the render loop to route subsequent controls into this body.
          return body;
        }
        const section = document.createElement('div');
        section.className = 'control-section';
        section.innerHTML = `<div class="control-section-title">${getDisplayLabel(def)}</div>`;
        target.appendChild(section);
        return;
      }
      if (def.type === 'sectionHint') {
        // Small muted empty-state hint (R3/UX10 / WU9). showIf already early-returns
        // above, so reaching here means the hint should show.
        const hint = document.createElement('div');
        hint.className = 'control-section-hint';
        hint.textContent = def.text || '';
        target.appendChild(hint);
        return;
      }
      // Universal preset gallery: the preset control is a thumbnail GALLERY, not
      // a <select>. The registry still declares it as a select (so the control
      // slot exists); here we intercept it for ANY algorithm whose preset
      // library is non-empty and mount the grouped popover, which routes clicks
      // through the SAME generic apply path. No per-algorithm branches.
      if (def.id === 'preset') {
        const V = (typeof window !== 'undefined' ? window : globalThis)?.Vectura;
        const presetLib = V?.PresetLibraries?.[layer.type] ?? [];
        if (presetLib.length > 0) {
          const gallery = V?.UI?.PresetGallery || V?.UI?.HarmonographPresetGallery;
          if (typeof gallery === 'function') {
            const inst = gallery(target, {
              layer,
              presets: presetLib,
              // Keys a preset apply never overwrites — the gallery ignores these
              // when deciding whether the layer still matches its named preset
              // (so moving/resizing a layer doesn't read as "diverged").
              preservedKeys: [...TRANSFORM_KEYS, ...(EXTRA_PRESERVED[layer.type] || [])],
              onApply: (presetId) => {
                if (this.app.pushHistory) this.app.pushHistory();
                applyPreset(presetId);
              },
              // The save flow mutates the preset marker — wrap it in history so
              // Cmd+Z is consistent with onApply.
              pushHistory: () => { if (this.app.pushHistory) this.app.pushHistory(); },
            });
            // Register the live divergence refresh so app.regen() (fired after
            // every param edit) flips the trigger to "Custom" the instant a
            // param differs from the preset — and back when it's restored.
            this._activePresetGalleryRefresh = inst && typeof inst.refresh === 'function' ? inst.refresh : null;
            // The save pip's modal opener, surfaced for the Cmd/Ctrl+S accelerator.
            this._activePresetGallerySave = inst && typeof inst.openSave === 'function' ? inst.openSave : null;
          }
          return;
        }
      }

      if (def.type === 'svgImportButton') {
        const wrap = document.createElement('div');
        wrap.className = 'mb-4';
        const nameEl = document.createElement('div');
        nameEl.className = 'text-[11px] text-vectura-muted mb-2';
        nameEl.textContent = layer.params.svgName
          ? `Loaded: ${layer.params.svgName}`
          : 'No SVG loaded';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
        btn.textContent = layer.params.svgName ? 'Replace SVG…' : 'Import SVG…';
        btn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.svg,image/svg+xml';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const groups = this.parseSvgToLayerGroups(reader.result);
              if (!groups.length) {
                this.openModal({ title: 'No Paths Found', body: '<p class="modal-text">The SVG contained no vector paths.</p>' });
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params.importedGroups = groups.map((g) => ({
                name: g.name,
                paths: g.paths,
                isClosed: g.isClosed || false,
                originalFill: g.originalFill || null,
              }));
              layer.params.svgName = file.name;
              this.storeLayerParams(layer);
              this.app.engine.generate(layer.id);
              this.buildControls();
              this.updateFormula();
              this.app.render();
            };
            reader.readAsText(file);
          };
          input.click();
        };
        wrap.appendChild(nameEl);
        wrap.appendChild(btn);
        target.appendChild(wrap);
        return;
      }
      if (def.type === 'stlImport') {
        const wrap = document.createElement('div');
        wrap.className = 'mb-4';
        const nameEl = document.createElement('div');
        nameEl.className = 'text-[11px] text-vectura-muted mb-2';
        const loaded = layer.params.importedMesh;
        nameEl.textContent = layer.params.meshName
          ? `Loaded: ${layer.params.meshName}${loaded && loaded.triangles ? ` · ${loaded.triangles} tris` : ''}`
          : 'No STL loaded';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
        btn.textContent = layer.params.meshName ? 'Replace STL…' : 'Import STL…';
        btn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.stl,model/stl,application/vnd.ms-pki.stl';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              let mesh;
              try {
                mesh = window.Vectura.StlParser.parse(reader.result, file.name);
              } catch (err) {
                this.openModal({ title: 'STL Import Failed', body: '<p class="modal-text">Could not read this STL file. Make sure it is a valid binary or ASCII .stl mesh.</p>' });
                return;
              }
              if (!mesh || !mesh.vertices?.length || !mesh.faces?.length) {
                this.openModal({ title: 'No Mesh Found', body: '<p class="modal-text">The STL contained no triangles.</p>' });
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params.importedMesh = mesh;
              layer.params.meshName = mesh.name || file.name;
              this.storeLayerParams(layer);
              this.app.engine.generate(layer.id);
              this.buildControls();
              this.updateFormula();
              this.app.render();
            };
            reader.readAsArrayBuffer(file);
          };
          input.click();
        };
        wrap.appendChild(nameEl);
        wrap.appendChild(btn);
        target.appendChild(wrap);
        return;
      }
      if (def.type === 'petalDesignerInline') {
        if (!isPetalisLayerType(layer.type)) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'petal-designer-inline-wrap mb-4';
        target.appendChild(wrapper);
        this.mountInlinePetalisDesigner(layer, wrapper);
        return;
      }
      if (def.type === 'petalProfileGallery') {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-4';
        target.appendChild(wrapper);
        this.mountPetalProfileGallery(layer, wrapper, def);
        return;
      }
      if (def.type === 'actionButton') {
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-4';
        wrapper.innerHTML = `
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
          </div>
          <button type="button" class="w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors">
            ${def.buttonLabel || getDisplayLabel(def)}
          </button>
        `;
        const btn = wrapper.querySelector('button');
        if (btn) {
          btn.onclick = () => {
            if (def.action === 'setLightSource') {
              this.startLightSourcePlacement();
            } else if (typeof def.onClick === 'function') {
              def.onClick();
            }
          };
        }
        target.appendChild(wrapper);
        return;
      }
      if (def.type === 'patternSelect') {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-4';
        const registry = window.Vectura?.PatternRegistry;
        const allBundled = (window.Vectura?.BUNDLED_PATTERNS || window.Vectura?.PATTERNS || []).filter((p) => !p.custom);
        const userPatterns = registry?.getCustomPatterns?.() || [];
        const currentId = layer.params.patternId || '';
        let activeTab = userPatterns.some((p) => p.id === currentId) ? 'user' : 'default';

        const injectSvgPreview = (item, meta) => {
          if (!meta?.svg) return;
          const parser = new DOMParser();
          const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
          const svg = doc.querySelector('svg');
          if (!svg) return;
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          svg.style.maxHeight = '24px';
          svg.querySelectorAll('*').forEach((el) => {
            if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', 'currentColor');
            if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') el.setAttribute('fill', 'currentColor');
            if (el.style.stroke && el.style.stroke !== 'none') el.style.stroke = 'currentColor';
            if (el.style.fill && el.style.fill !== 'none') el.style.fill = 'currentColor';
          });
          const cont = document.createElement('div');
          cont.className = 'w-full px-2 text-vectura-text opacity-80';
          cont.appendChild(svg);
          item.insertBefore(cont, item.firstChild);
        };

        const renderPicker = () => {
          const patterns = activeTab === 'user' ? userPatterns : allBundled;
          const tabBar = `
            <div class="flex gap-0 mb-2 border-b border-vectura-border">
              <button type="button" data-ps-tab="default"
                class="text-[10px] px-2 py-1 border-b-2 transition-colors ${activeTab === 'default' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
                Default
              </button>
              <button type="button" data-ps-tab="user"
                class="text-[10px] px-2 py-1 border-b-2 transition-colors ${activeTab === 'user' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
                User Patterns${userPatterns.length ? ` (${userPatterns.length})` : ''}
              </button>
            </div>`;
          let gridHtml = `<div class="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-vectura-bg border border-vectura-border" data-pattern-grid>`;
          if (patterns.length) {
            patterns.forEach((p) => {
              const isSel = layer.params.patternId === p.id;
              const selC = isSel ? 'border-vectura-accent bg-vectura-border opacity-100' : 'border-transparent opacity-60 hover:opacity-100';
              const dotHtml = p.custom ? `<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400" title="Stored in browser localStorage"></span>` : '';
              gridHtml += `<div class="pattern-item relative cursor-pointer border rounded flex flex-col items-center justify-center pt-2 ${selC}" data-id="${p.id}" title="${p.name}">${dotHtml}
                <div class="w-full text-[9px] text-center truncate px-1 pb-1 pt-1 text-vectura-muted leading-tight">${p.name}</div>
              </div>`;
            });
          } else {
            gridHtml += `<div class="col-span-4 text-[10px] text-vectura-muted py-2 text-center">No patterns yet. Use Save Pattern to add one.</div>`;
          }
          gridHtml += `</div>`;
          wrapper.innerHTML = tabBar + gridHtml;

          wrapper.querySelectorAll('[data-ps-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
              activeTab = btn.dataset.psTab;
              renderPicker();
            });
          });

          wrapper.querySelectorAll('.pattern-item[data-id]').forEach((item) => {
            const pId = item.dataset.id;
            const meta = patterns.find((x) => x.id === pId);
            injectSvgPreview(item, meta);
            item.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params.patternId = item.dataset.id;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          });
        };

        renderPicker();
        target.appendChild(wrapper);
        return;
      }
      if (def.type === 'fontPicker') {
        // Built-in stroke faces plus the full web-font catalog, behind two tabs.
        // The web list is fetched lazily on first open; selecting a web family
        // kicks off its outline load (the layer re-renders when it lands).
        const Web = window.Vectura?.GoogleFonts;
        const builtins = def.builtins || [];
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const MAX_BROWSE = 80;    // unfiltered web list is capped — search to go deeper
        const MAX_RESULTS = 1000; // ceiling on a filtered web list (search reaches deep)
        const Stroke = window.Vectura?.StrokeFont;

        const wrapper = document.createElement('div');
        wrapper.className = 'mb-4';

        const keyLabel = (key) => {
          if (Web && Web.isWebFontKey(key)) {
            const e = Web.findFamily(Web.keyToId(key));
            return e ? e.family : Web.keyToId(key);
          }
          const b = builtins.find((o) => o.value === key);
          return b ? b.label : key;
        };

        let activeTab = (Web && Web.isWebFontKey(layer.params.font)) ? 'google' : 'builtin';
        let query = '';

        const choose = (value) => {
          if (value === layer.params.font) return;
          if (this.app.pushHistory) this.app.pushHistory();
          layer.params.font = value;
          this.storeLayerParams(layer);
          const isWeb = Web && Web.isWebFontKey(value);
          const needsLoad = isWeb && !Web.getParsed(Web.keyToId(value));
          if (isWeb) Web.ensureFont(Web.keyToId(value)).catch(() => {});
          // When the newly chosen web family isn't parsed yet, keep the glyphs that
          // are currently on the canvas and let the async-load regen hook swap
          // straight to the real outlines once they land — regenerating now would
          // flash the built-in stroke fallback in between. Parsed web families and
          // built-in faces are available immediately, so those swap right away.
          if (!needsLoad) this.app.regen();
          this.buildControls();
          this.updateFormula();
        };

        // Header: label + the active family name.
        const head = document.createElement('div');
        head.className = 'flex justify-between mb-1';
        head.innerHTML = `
          <div class="flex items-center gap-2">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            ${infoBtn}
          </div>
          <span class="text-xs text-vectura-accent font-mono truncate max-w-[55%] text-right" data-font-current></span>`;
        head.querySelector('[data-font-current]').textContent = keyLabel(layer.params.font);
        wrapper.appendChild(head);

        // Persistent body shell — only the list re-renders on search so the input
        // keeps focus while typing.
        const tabBar = document.createElement('div');
        tabBar.className = 'flex gap-0 mb-2 border-b border-vectura-border';
        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Search fonts…';
        search.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs mb-2 focus:outline-none focus:border-vectura-accent';
        const listEl = document.createElement('div');
        listEl.className = 'grid grid-cols-1 gap-1 max-h-56 overflow-y-auto p-1 bg-vectura-bg border border-vectura-border';

        // Build a tiny inline SVG sample of a built-in stroke face, drawn from the
        // face's own polylines. Best-effort: returns null if StrokeFont is missing
        // or layout fails (jsdom/offline never throws here).
        const builtinSampleSvg = (fontId, sample) => {
          if (!Stroke || typeof Stroke.layout !== 'function') return null;
          try {
            const res = Stroke.layout(sample || 'Abc', { font: fontId, size: 14 });
            const paths = (res && res.paths) || [];
            if (!paths.length) return null;
            const w = Math.max(1, res.width || 1);
            const h = Math.max(1, res.height || 1);
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            // Pad slightly so descenders/strokes aren't clipped.
            svg.setAttribute('viewBox', `-1 -2 ${w + 2} ${h + 4}`);
            svg.setAttribute('height', '16');
            svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
            svg.setAttribute('fill', 'none');
            svg.style.maxWidth = '100%';
            svg.style.display = 'block';
            paths.forEach((pts) => {
              const pl = document.createElementNS(ns, 'polyline');
              pl.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
              pl.setAttribute('stroke', 'currentColor');
              pl.setAttribute('stroke-width', '1');
              pl.setAttribute('stroke-linecap', 'round');
              pl.setAttribute('stroke-linejoin', 'round');
              svg.appendChild(pl);
            });
            return svg;
          } catch (_) {
            return null;
          }
        };

        // Lazily render a Google family's NAME in its own typeface. We trigger the
        // preview FontFace load only for items that become visible, and apply the
        // family once it resolves (if the button is still mounted). Degrades
        // silently offline/headless — never throws.
        const triggerWebPreview = (btn, id, family) => {
          if (!Web || !btn || !id || !family) return;
          try {
            const apply = () => {
              if (!btn.isConnected) return;
              btn.style.fontFamily = `'Vectura WF ${family}', sans-serif`;
            };
            const p = Web.ensureFont(id);
            if (p && typeof p.then === 'function') p.then(apply).catch(() => {});
          } catch (_) { /* no-op offline/headless */ }
        };

        // One shared observer for the visible Google items; recreated per render.
        let webObserver = null;
        const observeWebPreview = (btn, id, family) => {
          if (!Web) return;
          try {
            if (typeof IntersectionObserver === 'function') {
              if (!webObserver) {
                webObserver = new IntersectionObserver((entries, obs) => {
                  entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    obs.unobserve(e.target);
                    triggerWebPreview(e.target, e.target._wfId, e.target._wfFamily);
                  });
                });
              }
              btn._wfId = id;
              btn._wfFamily = family;
              webObserver.observe(btn);
            } else {
              // No IntersectionObserver (jsdom): just trigger for the shown slice.
              triggerWebPreview(btn, id, family);
            }
          } catch (_) { /* no-op */ }
        };

        const itemBtn = (value, label, opts = {}) => {
          const isSel = layer.params.font === value;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.value = value;
          btn.className = `text-left text-[11px] px-2 py-1 border truncate transition-colors ${
            isSel ? 'border-vectura-accent text-vectura-accent bg-vectura-border' : 'border-transparent text-vectura-muted hover:text-vectura-text hover:bg-vectura-border'
          }`;
          btn.title = label;
          if (opts.svgSample) {
            // Built-in face: name plus an inline stroke sample beneath it.
            const name = document.createElement('div');
            name.className = 'truncate';
            name.textContent = label;
            btn.appendChild(name);
            const sample = builtinSampleSvg(opts.fontId, opts.sampleText);
            if (sample) {
              const cont = document.createElement('div');
              cont.className = 'mt-0.5 opacity-80';
              cont.appendChild(sample);
              btn.appendChild(cont);
            }
          } else {
            btn.textContent = label;
            if (opts.webId) observeWebPreview(btn, opts.webId, label);
          }
          btn.onclick = () => choose(value);
          return btn;
        };

        const note = (msg) => {
          const p = document.createElement('div');
          p.className = 'text-[10px] text-vectura-muted py-2 px-1 text-center';
          p.textContent = msg;
          return p;
        };

        const renderList = () => {
          // Drop any previous observer so stale, off-screen buttons stop firing.
          if (webObserver) { try { webObserver.disconnect(); } catch (_) {} webObserver = null; }
          listEl.replaceChildren();
          if (activeTab === 'builtin') {
            const q = query.trim().toLowerCase();
            const rows = builtins.filter((o) => !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
            if (!rows.length) { listEl.appendChild(note('No built-in fonts match.')); return; }
            rows.forEach((o) => listEl.appendChild(
              itemBtn(o.value, o.label, { svgSample: true, fontId: o.value, sampleText: o.sample || 'Abcdef' })
            ));
            return;
          }
          // Google Fonts tab.
          if (!Web) { listEl.appendChild(note('Web fonts are unavailable.')); return; }
          const st = Web.getCatalogStatus();
          if (st.status === 'idle') Web.loadCatalog().then(renderList).catch(renderList);
          if (st.status !== 'ready') {
            listEl.appendChild(note(
              st.status === 'loading' || st.status === 'idle' ? 'Loading web fonts…' : (st.errorMessage || 'Web fonts are unavailable.')
            ));
            return;
          }
          const q = query.trim().toLowerCase();
          const all = Web.getFamilies();
          const matched = q ? all.filter((f) => f.family.toLowerCase().includes(q)) : all;
          const shown = q ? matched.slice(0, MAX_RESULTS) : matched.slice(0, MAX_BROWSE);
          shown.forEach((f) => listEl.appendChild(itemBtn(Web.idToKey(f.id), f.family, { webId: f.id })));
          if (!matched.length) {
            listEl.appendChild(note(q ? `No web fonts match “${query.trim()}”. Try another spelling.` : 'No web fonts available.'));
          } else if (shown.length < matched.length) {
            listEl.appendChild(note(`Showing ${shown.length} of ${matched.length}.${q ? '' : ' Search to reach the full catalog.'}`));
          }
        };

        const renderTabs = () => {
          tabBar.replaceChildren();
          [['builtin', 'Built-in'], ['google', 'Google Fonts']].forEach(([id, label]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `text-[10px] px-2 py-1 border-b-2 transition-colors ${
              activeTab === id ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'
            }`;
            b.textContent = label;
            b.onclick = () => { activeTab = id; query = ''; search.value = ''; renderTabs(); renderList(); };
            tabBar.appendChild(b);
          });
        };

        search.addEventListener('input', () => { query = search.value; renderList(); });
        renderTabs();
        wrapper.append(tabBar, search, listEl);
        renderList();
        target.appendChild(wrapper);
        return;
      }
      if (def.type === 'patternDesignerInline') {
        const wrapper = document.createElement('div');
        wrapper.className = 'pattern-designer-inline-wrap mt-3';
        target.appendChild(wrapper);
        this.mountInlinePatternDesigner(layer, wrapper);
        return;
      }
      if (def.type === 'patternSubPens') {
         const patData = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(layer.params.patternId);
         if (!patData || !patData.groups || patData.groups.length === 0) return;
         
         const wrapper = document.createElement('div');
         wrapper.className = 'mt-4 border-t border-vectura-border pt-4';
         const header = document.createElement('label');
         header.className = 'control-label mb-2 block';
         header.textContent = 'Element Pen Mapping';
         wrapper.appendChild(header);
         
         const pens = SETTINGS.pens || [];
         patData.groups.forEach(g => {
            const currentPenId = layer.params.penMapping?.[g.id] || 'default';
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between mb-2';
            row.innerHTML = `<span class="text-[11px] text-vectura-muted">${g.label}</span>
               <select class="w-32 bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent" data-gid="${g.id}">
                  <option value="default">Layer Pen</option>
                  ${pens.map(pen => `<option value="${escapeHtml(pen.id)}" ${currentPenId === pen.id ? 'selected' : ''}>${escapeHtml(pen.name || pen.id)}</option>`).join('')}
               </select>
            `;
            const sel = row.querySelector('select');
            sel.onchange = (e) => {
               if (this.app.pushHistory) this.app.pushHistory();
               if (!layer.params.penMapping) layer.params.penMapping = {};
               layer.params.penMapping[e.target.dataset.gid] = e.target.value === 'default' ? null : e.target.value;
               this.storeLayerParams(layer);
               this.app.regen();
               this.buildControls();
            };
            wrapper.appendChild(row);
         });
         
         target.appendChild(wrapper);
         return;
      }
      if (def.type === 'noisePreview') {
        const wrapper = document.createElement('div');
        target.appendChild(wrapper);
        if (typeof this.mountNoisePreviewWidget === 'function') {
          this.mountNoisePreviewWidget(layer, wrapper);
        }
        return;
      }
      if (def.type === 'image') {
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const div = document.createElement('div');
        div.className = 'mb-4';
        const idKey = def.idKey || `${def.id || 'image'}Id`;
        const nameKey = def.nameKey || `${def.id || 'image'}Name`;
        const name = layer.params[nameKey] || 'No file selected';
        div.innerHTML = `
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <button type="button" class="text-[10px] text-vectura-muted hover:text-vectura-accent file-clear">Clear</button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="noise-image-btn text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              Select Image
            </button>
            <span class="text-[10px] text-vectura-muted file-name truncate">${name}</span>
          </div>
        `;
        const openBtn = div.querySelector('.noise-image-btn');
        const nameEl = div.querySelector('.file-name');
        const clearBtn = div.querySelector('.file-clear');
        if (clearBtn) {
          clearBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[idKey] = '';
            layer.params[nameKey] = '';
            if (nameEl) nameEl.textContent = 'No file selected';
            this.app.regen();
            this.app.render();
            maybeRebuildControls();
          };
        }
        if (openBtn) {
          openBtn.onclick = () =>
            this.openNoiseImageModal(layer, {
              nameEl,
              accept: def.accept,
              idKey,
              nameKey,
              title: def.modalTitle,
              label: def.modalLabel,
              description: def.modalDescription,
              dropLabel: def.dropLabel,
            });
        }
        target.appendChild(div);
        return;
      }
      if (def.type === 'pendulumList') {
        const pendulums = ensurePendulums();
        const list = document.createElement('div');
        list.className = 'pendulum-list mb-4';
        const header = document.createElement('div');
        header.className = 'pendulum-list-header';
        header.innerHTML = `
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Pendulums</span>
          <span class="pendulum-freq-ratio text-[10px] font-mono text-vectura-muted" title="Frequency ratio of enabled pendulums"></span>
          <button type="button" class="pendulum-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
            + Add Pendulum
          </button>
        `;
        const ratioEl = header.querySelector('.pendulum-freq-ratio');

        // Reduce the enabled pendulums' frequencies to a compact integer ratio
        // (e.g. freqs 2 & 3 -> "3:2"). Non-integer freqs are scaled to a common
        // 100ths denominator, then reduced by gcd. Returns '' for <2 enabled.
        const computeFreqRatio = () => {
          const freqs = pendulums
            .filter((p) => p.enabled !== false)
            .map((p) => Number(p.freq))
            .filter((f) => Number.isFinite(f) && f > 0);
          if (freqs.length < 2) return '';
          const gcd2 = (a, b) => {
            a = Math.abs(a);
            b = Math.abs(b);
            while (b) { [a, b] = [b, a % b]; }
            return a || 1;
          };
          // Scale to integers (freqs use a 0.01 step), then reduce.
          const ints = freqs.map((f) => Math.round(f * 100));
          let g = ints[0];
          for (let i = 1; i < ints.length; i += 1) g = gcd2(g, ints[i]);
          const reduced = ints.map((n) => Math.round(n / g));
          return reduced.join(':');
        };
        const updateFreqRatio = () => {
          if (ratioEl) ratioEl.textContent = computeFreqRatio();
        };
        updateFreqRatio();

        // Per-pendulum mini-trace: evaluate ONLY this pendulum's contribution
        // via the shared core, auto-fit its bbox into the small canvas. Guarded
        // for the jsdom no-op ctx (getContext may return a stub or null).
        const HC = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.HarmonographCore;
        const readToken = (name, fallback) => {
          try {
            const root = document.documentElement;
            const v = root && getComputedStyle ? getComputedStyle(root).getPropertyValue(name) : '';
            return (v && v.trim()) || fallback;
          } catch (_) {
            return fallback;
          }
        };
        const drawMiniTrace = (canvas, pend) => {
          if (!canvas || typeof canvas.getContext !== 'function') return;
          const ctx = canvas.getContext('2d');
          if (!ctx || typeof ctx.beginPath !== 'function') return;
          const w = canvas.width;
          const h = canvas.height;
          try { ctx.clearRect(0, 0, w, h); } catch (_) { /* no-op ctx */ }
          if (pend.enabled === false || !HC || typeof HC.evaluatePath !== 'function') return;
          let path = [];
          try {
            path = HC.evaluatePath(
              {
                pendulums: [pend],
                scale: layer.params.scale,
                duration: layer.params.duration,
                samples: 1200,
              },
              { sampleCap: 300 }
            ).path || [];
          } catch (_) {
            path = [];
          }
          if (path.length < 2) return;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          path.forEach((pt) => {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          });
          const span = Math.max(maxX - minX, maxY - minY, 1);
          const pad = 4;
          const s = (Math.min(w, h) - pad * 2) / span;
          const toCanvas = (pt) => ({
            x: (pt.x - (minX + maxX) / 2) * s + w / 2,
            y: (pt.y - (minY + maxY) / 2) * s + h / 2,
          });
          try {
            ctx.strokeStyle = readToken('--plotter-path-base', 'rgba(113,113,122,0.55)');
            ctx.lineWidth = 1;
            ctx.beginPath();
            path.forEach((pt, i) => {
              const c = toCanvas(pt);
              if (i === 0) ctx.moveTo(c.x, c.y);
              else ctx.lineTo(c.x, c.y);
            });
            ctx.stroke();
          } catch (_) { /* no-op ctx */ }
        };

        // A square drag-vector pad. Both the Release pad (the ampX/ampY swing
        // vector) and the Phase pad (phaseX/phaseY) share this builder; `cfg`
        // says how to read params into a [-1,1] handle and write a drag back.
        // clampMode 'disk' keeps the handle inside the circle (amplitude as a
        // magnitude); 'square' clamps each axis independently so every
        // phaseX/phaseY combination stays reachable. It commits through the same
        // path the sliders use (storeLayerParams → app.regen → updateFormula →
        // onCardCommit) so the canvas, mini-trace, and virtual-plotter ghost all
        // stay in sync. NOTE: the Release pad never touches phase (keeping
        // phaseX≠phaseY is what stops a nudge collapsing the figure to a line).
        const AMP_MAX = 200; // matches the ampX/ampY slider max
        const buildVectorPad = (pendulum, onCommit, cfg) => {
          const afterCommit = () => { if (typeof onCommit === 'function') onCommit(); };
          const infoPrefix = layer.type === 'pendula' ? 'pendula' : 'harmonograph';
          const pad = document.createElement('div');
          pad.className = `pendulum-pluck-pad pendulum-vector-pad pad-${cfg.padKey}`;
          pad.innerHTML = `
            <div class="pluck-pad-label">
              <span class="control-label">${cfg.label}</span>
              <button type="button" class="info-btn" data-info="${infoPrefix}.${cfg.infoSuffix}">i</button>
            </div>
            <canvas class="pluck-pad-canvas" aria-label="${cfg.aria}"></canvas>
          `;
          const canvas = pad.querySelector('canvas');
          const CSS_SIZE = 92;
          const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
          canvas.width = Math.round(CSS_SIZE * dpr);
          canvas.height = Math.round(CSS_SIZE * dpr);

          const clampVec = (vx, vy) => {
            if (cfg.clampMode === 'square') return { vx: clamp(vx, -1, 1), vy: clamp(vy, -1, 1) };
            const len = Math.hypot(vx, vy);
            return len > 1 ? { vx: vx / len, vy: vy / len } : { vx, vy };
          };

          const drawPad = () => {
            if (!canvas || typeof canvas.getContext !== 'function') return;
            const ctx = canvas.getContext('2d');
            if (!ctx || typeof ctx.beginPath !== 'function') return;
            // Draw in logical CSS coords; the DPR-scaled backing store is handled
            // by this transform. Guarded for jsdom mocks lacking setTransform.
            if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            try { ctx.clearRect(0, 0, CSS_SIZE, CSS_SIZE); } catch (_) { return; }
            const cx = CSS_SIZE / 2;
            const cy = CSS_SIZE / 2;
            const radius = (CSS_SIZE / 2) - 6;
            const accent = readToken('--ui-accent', '#6366f1');
            const base = readToken('--plotter-path-base', 'rgba(113,113,122,0.55)');
            const r = cfg.read(pendulum);
            const { vx, vy } = clampVec(r.vx, r.vy);
            const hx = cx + vx * radius;
            const hy = cy + vy * radius;
            try {
              // bounding ring
              ctx.strokeStyle = base;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.stroke();
              // faint center crosshair
              ctx.beginPath();
              ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
              ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
              ctx.stroke();
              // vector line
              ctx.strokeStyle = accent;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(hx, hy);
              ctx.stroke();
              // handle dot
              ctx.fillStyle = accent;
              ctx.beginPath();
              ctx.arc(hx, hy, 4, 0, Math.PI * 2);
              ctx.fill();
            } catch (_) { /* no-op ctx */ }
          };
          // Expose the redraw so onCardCommit can refresh the handle when the
          // numeric advanced controls change the source-of-truth params.
          pad._redraw = drawPad;
          drawPad();

          const applyFromEvent = (ev) => {
            const rect = canvas.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const radius = rect.width / 2;
            const { vx, vy } = clampVec(
              radius > 0 ? (ev.clientX - cx) / radius : 0,
              radius > 0 ? (ev.clientY - cy) / radius : 0
            );
            cfg.write(pendulum, vx, vy);
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
            afterCommit();
            drawPad();
          };

          if (canvas) {
            const onDown = (e) => {
              if (pendulum.enabled === false) return;
              if (typeof e.preventDefault === 'function') e.preventDefault();
              // Push history ONCE per drag, on pointerdown (sliders push on change).
              if (this.app.pushHistory) this.app.pushHistory();
              applyFromEvent(e);
              const move = (ev) => applyFromEvent(ev);
              const up = () => { window.removeEventListener('pointermove', move); };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up, { once: true });
            };
            // Pointer events alone cover mouse, touch, and pen. Do NOT also bind
            // mousedown — real browsers emit a compatibility mousedown after
            // pointerdown, which would double-push history and double-regen.
            canvas.addEventListener('pointerdown', onDown);
          }
          return pad;
        };

        const RELEASE_PAD_CFG = {
          padKey: 'release',
          label: 'Release',
          infoSuffix: 'pluckPad',
          aria: "Release pad — drag to set this pendulum's X (horizontal) and Y (vertical) swing amplitude",
          clampMode: 'disk',
          read: (p) => ({ vx: (p.ampX || 0) / AMP_MAX, vy: (p.ampY || 0) / AMP_MAX }),
          write: (p, vx, vy) => { p.ampX = Math.round(vx * AMP_MAX); p.ampY = Math.round(vy * AMP_MAX); },
        };
        const PHASE_PAD_CFG = {
          padKey: 'phase',
          label: 'Phase',
          infoSuffix: 'phasePad',
          aria: "Phase pad — drag to set this pendulum's X (horizontal) and Y (vertical) phase",
          clampMode: 'square',
          // phase 0..360 spans the pad: left/top = 0°, centre = 180°, right/bottom = 360°.
          read: (p) => ({ vx: ((((p.phaseX || 0) % 360) + 360) % 360) / 180 - 1, vy: ((((p.phaseY || 0) % 360) + 360) % 360) / 180 - 1 }),
          write: (p, vx, vy) => { p.phaseX = Math.round((vx + 1) * 180); p.phaseY = Math.round((vy + 1) * 180); },
        };
        const buildPluckPad = (pendulum, onCommit) => buildVectorPad(pendulum, onCommit, RELEASE_PAD_CFG);
        const buildPhasePad = (pendulum, onCommit) => buildVectorPad(pendulum, onCommit, PHASE_PAD_CFG);

        // Per-parameter padlock — toggles a lock that the dice/mutate
        // (applyHarmonographFamilyBias) reads to SKIP a param for this pendulum.
        // Locks live in layer.params.pendulumParamLocks[pendulumId][paramKey]
        // so they serialize with the params for free.
        const lockIcon = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.Icons?.layer;
        const buildParamLock = (pendulum, def) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pendulum-param-lock';
          btn.dataset.paramKey = def.key;
          btn.setAttribute('aria-label', `Lock ${getDisplayLabel(def)} from dice`);
          const isLocked = () => Boolean(layer.params.pendulumParamLocks?.[pendulum.id]?.[def.key]);
          const renderState = () => {
            const locked = isLocked();
            btn.classList.toggle('is-locked', locked);
            btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
            const ico = lockIcon ? (locked ? lockIcon.lock?.() : lockIcon.lockOpen?.()) : '';
            btn.innerHTML = ico || (locked ? '🔒' : '🔓');
          };
          renderState();
          btn.onclick = (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            const locks = layer.params.pendulumParamLocks || (layer.params.pendulumParamLocks = {});
            const forPend = locks[pendulum.id] || (locks[pendulum.id] = {});
            if (forPend[def.key]) {
              delete forPend[def.key];
              if (Object.keys(forPend).length === 0) delete locks[pendulum.id];
            } else {
              forPend[def.key] = true;
            }
            // Persist (no regen — a lock changes nothing about the geometry).
            this.storeLayerParams(layer);
            renderState();
          };
          return btn;
        };

        const addBtn = header.querySelector('.pendulum-add');
        if (addBtn) {
          addBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            pendulums.push(createPendulum(pendulums.length));
            layer.params.pendulums = pendulums;
            this.storeLayerParams(layer);
            this.app.regen();
            this.buildControls();
            this.updateFormula();
          };
        }
        list.appendChild(header);

        const buildRangeControl = (pendulum, def, idx, onCommit) => {
          const afterCommit = () => { if (typeof onCommit === 'function') onCommit(); };
          const control = document.createElement('div');
          control.className = 'pendulum-control';
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
          const defaultVal = getPendulumDefault(idx, def.key);
          control.innerHTML = controlHeaderHtml(def, infoBtn);
          // Live drag ('input') only refreshed the chip — the component owns
          // that now — while release ('change'), keyboard, chip edits, and
          // dblclick-reset all committed: history + param + regen.
          const slider = createDefSlider(control, def, {
            value: toDisplayValue(def, value),
            defaultValue: defaultVal === undefined ? undefined : toDisplayValue(def, defaultVal),
            onCommit: (nextDisplay) => {
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
              afterCommit();
            },
          });
          const rangeEl = slider.el.querySelector('input[type="range"]');
          if (rangeEl) rangeEl.disabled = !pendulum.enabled;
          return control;
        };

        const buildAngleControl = (pendulum, def, idx, onCommit) => {
          const afterCommit = () => { if (typeof onCommit === 'function') onCommit(); };
          const control = document.createElement('div');
          control.className = 'pendulum-control';
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = clamp(toDisplayValue(def, value), min, max);
          control.innerHTML = `
            <div class="angle-label">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${getDisplayLabel(def)}</label>
                ${infoBtn}
              </div>
            </div>
          `;
          const defaultVal = getPendulumDefault(idx, def.key);
          // Drag ('mousemove') only moved the needle — the component owns that —
          // while release/dblclick/text-entry committed: history + param + regen.
          const dial = UI.AngleDial(control, {
            value: displayVal,
            min,
            max,
            ariaLabel: getDisplayLabel(def),
            defaultValue: defaultVal === undefined ? undefined : toDisplayValue(def, defaultVal),
            onCommit: (deg) => {
              const clamped = clamp(roundToStep(deg, step), min, max);
              if (clamped !== dial.getValue()) dial.setValue(clamped, { silent: true });
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum[def.key] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
              afterCommit();
            },
          });
          if (!pendulum.enabled) {
            dial.dialEl.classList.add('angle-disabled');
            dial.dialEl.style.pointerEvents = 'none';
            dial.dialEl.tabIndex = -1;
            dial.inputEl.disabled = true;
          }
          return control;
        };

        pendulums.forEach((pendulum, idx) => {
          const card = document.createElement('div');
          card.className = `pendulum-card${pendulum.enabled ? '' : ' pendulum-disabled'}`;
          const headerRow = document.createElement('div');
          headerRow.className = 'pendulum-header';
          headerRow.innerHTML = `
            <label class="pendulum-title">Pendulum ${idx + 1}</label>
            <canvas class="pendulum-mini-trace" width="64" height="40" aria-hidden="true"></canvas>
            <div class="pendulum-actions">
              <label class="pendulum-toggle">
                <label class="sw-toggle" role="switch" aria-checked="${pendulum.enabled ? 'true' : 'false'}">
                  <input type="checkbox" ${pendulum.enabled ? 'checked' : ''} />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
                <span>Active</span>
              </label>
              <button type="button" class="pendulum-delete" aria-label="Delete pendulum">🗑</button>
            </div>
          `;
          const miniTrace = headerRow.querySelector('.pendulum-mini-trace');
          let pluckPadEl = null;
          let phasePadEl = null;
          // Redraw THIS card's thumbnail + refresh the shared ratio whenever any
          // of this pendulum's controls commit (no rAF loop). Editing the numeric
          // advanced controls also refreshes both pad handles, since the numerics
          // remain the source of truth.
          const onCardCommit = () => {
            drawMiniTrace(miniTrace, pendulum);
            updateFreqRatio();
            if (pluckPadEl && typeof pluckPadEl._redraw === 'function') pluckPadEl._redraw();
            if (phasePadEl && typeof phasePadEl._redraw === 'function') phasePadEl._redraw();
          };
          drawMiniTrace(miniTrace, pendulum);
          const toggle = headerRow.querySelector('input');
          const deleteBtn = headerRow.querySelector('.pendulum-delete');
          if (toggle) {
            toggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum.enabled = Boolean(e.target.checked);
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (deleteBtn) {
            deleteBtn.onclick = () => {
              if (pendulums.length <= 1) {
                this.openModal({
                  title: 'Pendulum Required',
                  body: `<p class="modal-text">Keep at least one pendulum active in the harmonograph.</p>`,
                });
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              pendulums.splice(idx, 1);
              layer.params.pendulums = pendulums;
              // Drop the deleted pendulum's dice locks so they don't accumulate
              // as orphaned cruft in the serialized project.
              if (layer.params.pendulumParamLocks) delete layer.params.pendulumParamLocks[pendulum.id];
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          card.appendChild(headerRow);

          // The two drag pads are the promoted controls — mounted first, side by
          // side, before the numeric controls: Release sets the swing amplitude
          // (ampX/ampY), Phase sets the timing offset (phaseX/phaseY).
          const padRow = document.createElement('div');
          padRow.className = 'pendulum-pad-row';
          pluckPadEl = buildPluckPad(pendulum, onCardCommit);
          phasePadEl = buildPhasePad(pendulum, onCardCommit);
          padRow.appendChild(pluckPadEl);
          padRow.appendChild(phasePadEl);
          card.appendChild(padRow);

          // Build a single control + its padlock, appended into a row.
          const ADVANCED_KEYS = new Set(['ampX', 'ampY', 'phaseX', 'phaseY']);
          const buildControlRow = (pDef) => {
            const row = document.createElement('div');
            row.className = 'pendulum-control-row';
            const control =
              pDef.type === 'angle'
                ? buildAngleControl(pendulum, pDef, idx, onCardCommit)
                : buildRangeControl(pendulum, pDef, idx, onCardCommit);
            row.appendChild(control);
            row.appendChild(buildParamLock(pendulum, pDef));
            return row;
          };

          const visibleDefs = pendulumParamDefs.filter((d) => !ADVANCED_KEYS.has(d.key));
          const advancedDefs = pendulumParamDefs.filter((d) => ADVANCED_KEYS.has(d.key));

          const controls = document.createElement('div');
          controls.className = 'noise-controls';
          visibleDefs.forEach((pDef) => controls.appendChild(buildControlRow(pDef)));
          card.appendChild(controls);

          // The four numeric amp/phase controls move behind an Advanced
          // disclosure — the pad is the promoted control, but the numerics
          // remain the editable source of truth.
          const advanced = document.createElement('details');
          advanced.className = 'pendulum-advanced';
          const summary = document.createElement('summary');
          summary.className = 'pendulum-advanced-summary';
          summary.textContent = 'Advanced';
          advanced.appendChild(summary);
          const advancedControls = document.createElement('div');
          advancedControls.className = 'noise-controls';
          advancedDefs.forEach((pDef) => advancedControls.appendChild(buildControlRow(pDef)));
          advanced.appendChild(advancedControls);
          card.appendChild(advanced);

          list.appendChild(card);
        });

        target.appendChild(list);
        return;
      }
      if (def.type === 'harmonographPlotter') {
        // Harmonograph family: harmonograph + the pendula studio.
        if (layer.type !== 'harmonograph' && layer.type !== 'pendula') return;
        this.mountHarmonographPlotter(layer, target);
        return;
      }
      if (def.type === 'harmonographMotion') {
        if (layer.type !== 'harmonograph' && layer.type !== 'pendula') return;
        const rack = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.UI?.HarmonographMotionRack;
        if (typeof rack !== 'function') return;
        // The Motion Rack component OWNS its mount node (it clears it on every
        // re-render), so give it a dedicated host appended to the shared panel
        // container — never the container itself, or it would wipe every
        // control rendered before it.
        const host = document.createElement('div');
        target.appendChild(host);
        rack(host, {
          layer,
          // generate() bakes motion into the geometry, so a Motion Rack edit
          // regenerates the layer to update the MAIN canvas — and regen() now
          // also rebuilds the plotter's cached ghost (single refresh point), so
          // the preview matches without a full panel rebuild.
          commit: () => {
            this.app.pushHistory?.();
            this.storeLayerParams(layer);
            this.app.regen?.();
          },
        });
        return;
      }
      if (def.type === 'modifierList') {
        if (!isPetalisLayerType(layer.type)) return;
        const modifiers = Array.isArray(layer.params.centerModifiers) ? layer.params.centerModifiers : [];
        layer.params.centerModifiers = modifiers;

        const list = document.createElement('div');
        list.className = 'noise-list mb-4';
        const header = document.createElement('div');
        header.className = 'noise-list-header';
        header.innerHTML = `
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${getDisplayLabel(def) || 'Center Modifiers'}</span>
          <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
            + Add Modifier
          </button>
        `;
        const addBtn = header.querySelector('.noise-add');
        if (addBtn) {
          addBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            modifiers.push(createPetalisModifier('ripple'));
            layer.params.centerModifiers = modifiers;
            this.storeLayerParams(layer);
            this.app.regen();
            this.buildControls();
            this.updateFormula();
          };
        }
        list.appendChild(header);

        const modifierGripMarkup = `
          <button class="noise-grip" type="button" aria-label="Reorder modifier">
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
          </button>
        `;

        const getModifierType = (type) =>
          PETALIS_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_MODIFIER_TYPES[0];

        const buildModifierRangeControl = (modifier, def) => {
          const control = document.createElement('div');
          control.className = 'noise-control';
          const value = modifier[def.key] ?? def.min ?? 0;
          if (modifier[def.key] === undefined) modifier[def.key] = value;
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = controlHeaderHtml(def, infoBtn);
          // Live drag ('input') only refreshed the chip (component-owned now);
          // release/keyboard/chip-edit/dblclick-reset commit: history + regen.
          // dblclick-reset targets the param's TRUE default — the value a
          // freshly created modifier gets (createPetalisModifier factory) —
          // matching every other slider's reset-to-default; def.min is only
          // the fallback for keys the factory doesn't seed.
          const factoryDefaults = createPetalisModifier(modifier.type);
          const resetTarget = factoryDefaults[def.key] !== undefined ? factoryDefaults[def.key] : (def.min ?? 0);
          const slider = createDefSlider(control, def, {
            value: toDisplayValue(def, value),
            defaultValue: toDisplayValue(def, resetTarget),
            onCommit: (nextDisplay) => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            },
          });
          const rangeEl = slider.el.querySelector('input[type="range"]');
          if (rangeEl) rangeEl.disabled = !modifier.enabled;
          const chipEl = slider.el.querySelector('.slider-val');
          if (chipEl) chipEl.classList.toggle('opacity-60', !modifier.enabled);
          return control;
        };

        const bindModifierReorderGrip = (grip, card, modifier) => {
          if (!grip) return;
          grip.onmousedown = (e) => {
            e.preventDefault();
            const dragEl = card;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'noise-drop-indicator';
            list.insertBefore(indicator, dragEl.nextSibling);
            const currentOrder = modifiers.map((item) => item.id);
            const startIndex = currentOrder.indexOf(modifier.id);

            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  list.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) list.appendChild(indicator);
            };

            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(list.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);

              if (newIndex !== startIndex) {
                const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                nextOrder.splice(newIndex, 0, modifier.id);
                const map = new Map(modifiers.map((item) => [item.id, item]));
                layer.params.centerModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        };

        modifiers.forEach((modifier, idx) => {
          if (!modifier.id) modifier.id = `mod-${idx + 1}`;
          const card = document.createElement('div');
          card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
          card.dataset.modifierId = modifier.id;
          const headerRow = document.createElement('div');
          headerRow.className = 'noise-header';
          headerRow.innerHTML = `
            <div class="flex items-center gap-2">
              ${modifierGripMarkup}
              <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <label class="sw-toggle" role="switch" aria-checked="${modifier.enabled ? 'true' : 'false'}">
                <input type="checkbox" ${modifier.enabled ? 'checked' : ''} />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
            </div>
          `;
          const toggle = headerRow.querySelector('input[type="checkbox"]');
          const deleteBtn = headerRow.querySelector('.noise-delete');
          const grip = headerRow.querySelector('.noise-grip');
          bindModifierReorderGrip(grip, card, modifier);
          if (toggle) {
            toggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifier.enabled = Boolean(e.target.checked);
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (deleteBtn) {
            deleteBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              const index = modifiers.findIndex((item) => item.id === modifier.id);
              if (index >= 0) modifiers.splice(index, 1);
              layer.params.centerModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          card.appendChild(headerRow);

          const controls = document.createElement('div');
          controls.className = 'noise-controls';
          const typeDef = getModifierType(modifier.type);
          const typeSelect = document.createElement('div');
          typeSelect.className = 'noise-control';
          const optionsHtml = PETALIS_MODIFIER_TYPES.map(
            (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
          ).join('');
          const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.centerModType">i</button>`;
          typeSelect.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">Modifier Type</label>
                ${typeInfoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const select = typeSelect.querySelector('select');
          const label = typeSelect.querySelector('span');
          if (select && label) {
            select.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const nextType = e.target.value;
              const next = { ...createPetalisModifier(nextType), id: modifier.id, enabled: modifier.enabled };
              Object.assign(modifier, next);
              label.textContent = getModifierType(nextType).label;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          controls.appendChild(typeSelect);
          typeDef.controls.forEach((cDef) => {
            controls.appendChild(buildModifierRangeControl(modifier, cDef));
          });
          if (this.isPetalisNoiseModifier(modifier)) {
            this.mountPetalisModifierNoiseRack(layer, controls, modifier, { label: 'Noise Rack' });
          }
          card.appendChild(controls);
          list.appendChild(card);
        });

        target.appendChild(list);
        return;
      }
      if (def.type === 'petalModifierList') {
        if (!isPetalisLayerType(layer.type)) return;
        const modifiers = Array.isArray(layer.params.petalModifiers) ? layer.params.petalModifiers : [];
        layer.params.petalModifiers = modifiers;

        const list = document.createElement('div');
        list.className = 'noise-list mb-4';
        const header = document.createElement('div');
        header.className = 'noise-list-header';
        header.innerHTML = `
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${getDisplayLabel(def) || 'Petal Modifiers'}</span>
          <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
            + Add Modifier
          </button>
        `;
        const addBtn = header.querySelector('.noise-add');
        if (addBtn) {
          addBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            modifiers.push(createPetalModifier('ripple'));
            layer.params.petalModifiers = modifiers;
            this.storeLayerParams(layer);
            this.app.regen();
            this.buildControls();
            this.updateFormula();
          };
        }
        list.appendChild(header);

        const modifierGripMarkup = `
          <button class="noise-grip" type="button" aria-label="Reorder modifier">
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
          </button>
        `;

        const getModifierType = (type) =>
          PETALIS_PETAL_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_PETAL_MODIFIER_TYPES[0];

        const buildModifierRangeControl = (modifier, def) => {
          const control = document.createElement('div');
          control.className = 'noise-control';
          const value = modifier[def.key] ?? def.min ?? 0;
          if (modifier[def.key] === undefined) modifier[def.key] = value;
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = controlHeaderHtml(def, infoBtn);
          // Live drag ('input') only refreshed the chip (component-owned now);
          // release/keyboard/chip-edit/dblclick-reset commit: history + regen.
          // dblclick-reset targets the param's TRUE default — the value a
          // freshly created petal modifier gets (createPetalModifier factory) —
          // matching every other slider's reset-to-default; def.min is only
          // the fallback for keys the factory doesn't seed.
          const factoryDefaults = createPetalModifier(modifier.type);
          const resetTarget = factoryDefaults[def.key] !== undefined ? factoryDefaults[def.key] : (def.min ?? 0);
          const slider = createDefSlider(control, def, {
            value: toDisplayValue(def, value),
            defaultValue: toDisplayValue(def, resetTarget),
            onCommit: (nextDisplay) => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            },
          });
          const rangeEl = slider.el.querySelector('input[type="range"]');
          if (rangeEl) rangeEl.disabled = !modifier.enabled;
          const chipEl = slider.el.querySelector('.slider-val');
          if (chipEl) chipEl.classList.toggle('opacity-60', !modifier.enabled);
          return control;
        };

        const bindModifierReorderGrip = (grip, card, modifier) => {
          if (!grip) return;
          grip.onmousedown = (e) => {
            e.preventDefault();
            const dragEl = card;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'noise-drop-indicator';
            list.insertBefore(indicator, dragEl.nextSibling);
            const currentOrder = modifiers.map((item) => item.id);
            const startIndex = currentOrder.indexOf(modifier.id);

            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  list.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) list.appendChild(indicator);
            };

            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(list.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);

              if (newIndex !== startIndex) {
                const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                nextOrder.splice(newIndex, 0, modifier.id);
                const map = new Map(modifiers.map((item) => [item.id, item]));
                layer.params.petalModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        };

        modifiers.forEach((modifier, idx) => {
          if (!modifier.id) modifier.id = `petal-${idx + 1}`;
          const card = document.createElement('div');
          card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
          card.dataset.modifierId = modifier.id;
          const headerRow = document.createElement('div');
          headerRow.className = 'noise-header';
          headerRow.innerHTML = `
            <div class="flex items-center gap-2">
              ${modifierGripMarkup}
              <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <label class="sw-toggle" role="switch" aria-checked="${modifier.enabled ? 'true' : 'false'}">
                <input type="checkbox" ${modifier.enabled ? 'checked' : ''} />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
            </div>
          `;
          const toggle = headerRow.querySelector('input[type="checkbox"]');
          const deleteBtn = headerRow.querySelector('.noise-delete');
          const grip = headerRow.querySelector('.noise-grip');
          bindModifierReorderGrip(grip, card, modifier);
          if (toggle) {
            toggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifier.enabled = Boolean(e.target.checked);
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (deleteBtn) {
            deleteBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              const index = modifiers.findIndex((item) => item.id === modifier.id);
              if (index >= 0) modifiers.splice(index, 1);
              layer.params.petalModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          card.appendChild(headerRow);

          const controls = document.createElement('div');
          controls.className = 'noise-controls';
          const typeDef = getModifierType(modifier.type);
          const typeSelect = document.createElement('div');
          typeSelect.className = 'noise-control';
          const optionsHtml = PETALIS_PETAL_MODIFIER_TYPES.map(
            (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
          ).join('');
          const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.petalModType">i</button>`;
          typeSelect.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">Modifier Type</label>
                ${typeInfoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const select = typeSelect.querySelector('select');
          const label = typeSelect.querySelector('span');
          if (select && label) {
            select.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const nextType = e.target.value;
              const next = { ...createPetalModifier(nextType), id: modifier.id, enabled: modifier.enabled };
              Object.assign(modifier, next);
              label.textContent = getModifierType(nextType).label;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          controls.appendChild(typeSelect);
          typeDef.controls.forEach((cDef) => {
            controls.appendChild(buildModifierRangeControl(modifier, cDef));
          });
          if (this.isPetalisNoiseModifier(modifier)) {
            this.mountPetalisModifierNoiseRack(layer, controls, modifier, { label: 'Noise Rack' });
          }
          card.appendChild(controls);
          list.appendChild(card);
        });

        target.appendChild(list);
        return;
      }
      if (def.type === 'shadingList') {
        if (!isPetalisLayerType(layer.type)) return;
        const shadings = Array.isArray(layer.params.shadings) ? layer.params.shadings : [];
        layer.params.shadings = shadings;

        const list = document.createElement('div');
        list.className = 'noise-list mb-4';
        const header = document.createElement('div');
        header.className = 'noise-list-header';
        header.innerHTML = `
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${getDisplayLabel(def) || 'Shading Stack'}</span>
          <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
            + Add Shading
          </button>
        `;
        const addBtn = header.querySelector('.noise-add');
        if (addBtn) {
          addBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            shadings.push(createPetalisShading('radial'));
            layer.params.shadings = shadings;
            this.storeLayerParams(layer);
            this.app.regen();
            this.buildControls();
            this.updateFormula();
          };
        }
        list.appendChild(header);

        const shadingGripMarkup = `
          <button class="noise-grip" type="button" aria-label="Reorder shading">
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
            <span class="dot"></span><span class="dot"></span>
          </button>
        `;

        const getShadingType = (type) =>
          PETALIS_SHADING_TYPES.find((opt) => opt.value === type) || PETALIS_SHADING_TYPES[0];

        const buildShadingRangeControl = (shade, def) => {
          const control = document.createElement('div');
          control.className = 'noise-control';
          const value = shade[def.key] ?? def.min ?? 0;
          if (shade[def.key] === undefined) shade[def.key] = value;
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = controlHeaderHtml(def, infoBtn);
          // Same contract as buildModifierRangeControl: commit on release only.
          // dblclick-reset targets the param's TRUE default — the value a
          // freshly created shading gets (createPetalisShading factory) —
          // with def.min only as fallback for unseeded keys.
          const shadingDefaults = createPetalisShading(shade.type);
          const resetTarget = shadingDefaults[def.key] !== undefined ? shadingDefaults[def.key] : (def.min ?? 0);
          const slider = createDefSlider(control, def, {
            value: toDisplayValue(def, value),
            defaultValue: toDisplayValue(def, resetTarget),
            onCommit: (nextDisplay) => {
              if (this.app.pushHistory) this.app.pushHistory();
              shade[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            },
          });
          const rangeEl = slider.el.querySelector('input[type="range"]');
          if (rangeEl) rangeEl.disabled = !shade.enabled;
          const chipEl = slider.el.querySelector('.slider-val');
          if (chipEl) chipEl.classList.toggle('opacity-60', !shade.enabled);
          return control;
        };

        const buildShadingAngleControl = (shade, def) => {
          const control = document.createElement('div');
          control.className = 'noise-control';
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const value = shade[def.key] ?? def.min ?? 0;
          if (shade[def.key] === undefined) shade[def.key] = value;
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = clamp(toDisplayValue(def, value), min, max);
          control.innerHTML = `
            <div class="angle-label">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${getDisplayLabel(def)}</label>
                ${infoBtn}
              </div>
            </div>
          `;
          // dblclick-reset targets the shading TYPE's true default (same
          // contract as buildShadingRangeControl), falling back to def.min.
          const shadingDefaults = createPetalisShading(shade.type);
          const resetTarget = shadingDefaults[def.key] !== undefined ? shadingDefaults[def.key] : (def.min ?? 0);
          const dial = UI.AngleDial(control, {
            value: displayVal,
            min,
            max,
            ariaLabel: getDisplayLabel(def) || 'Angle',
            defaultValue: toDisplayValue(def, resetTarget),
            onCommit: (deg) => {
              const clamped = clamp(roundToStep(deg, step), min, max);
              if (clamped !== dial.getValue()) dial.setValue(clamped, { silent: true });
              if (this.app.pushHistory) this.app.pushHistory();
              shade[def.key] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            },
          });
          if (!shade.enabled) {
            dial.el.classList.add('angle-disabled', 'opacity-60');
            dial.dialEl.style.pointerEvents = 'none';
            dial.dialEl.tabIndex = -1;
            if (dial.inputEl) dial.inputEl.disabled = true;
          }
          return control;
        };

        const buildShadingSelect = (shade, def, options) => {
          const control = document.createElement('div');
          control.className = 'noise-control';
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          let value = shade[def.key];
          if (value === undefined || value === null) {
            value = options[0]?.value;
            shade[def.key] = value;
          }
          const optionsHtml = options
            .map(
              (opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
            )
            .join('');
          const currentLabel = options.find((opt) => opt.value === value)?.label || value;
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${getDisplayLabel(def)}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const input = control.querySelector('select');
          const span = control.querySelector('span');
          if (input && span) {
            input.disabled = !shade.enabled;
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              shade[def.key] = e.target.value;
              span.textContent = options.find((opt) => opt.value === shade[def.key])?.label || shade[def.key];
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
          }
          return control;
        };

        const bindShadingReorderGrip = (grip, card, shading) => {
          if (!grip) return;
          grip.onmousedown = (e) => {
            e.preventDefault();
            const dragEl = card;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'noise-drop-indicator';
            list.insertBefore(indicator, dragEl.nextSibling);
            const currentOrder = shadings.map((item) => item.id);
            const startIndex = currentOrder.indexOf(shading.id);

            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  list.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) list.appendChild(indicator);
            };

            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(list.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);

              if (newIndex !== startIndex) {
                const nextOrder = currentOrder.filter((id) => id !== shading.id);
                nextOrder.splice(newIndex, 0, shading.id);
                const map = new Map(shadings.map((item) => [item.id, item]));
                layer.params.shadings = nextOrder.map((id) => map.get(id)).filter(Boolean);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        };

        const shadingRangeDefs = [
          { key: 'lineSpacing', label: 'Line Spacing (mm)', type: 'range', min: 0.2, max: 8, step: 0.1, displayUnit: 'mm', infoKey: 'petalis.shadingLineSpacing' },
          { key: 'density', label: 'Line Density', type: 'range', min: 0.2, max: 3, step: 0.05, infoKey: 'petalis.shadingDensity' },
          { key: 'jitter', label: 'Line Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingJitter' },
          { key: 'lengthJitter', label: 'Length Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingLengthJitter' },
          { key: 'angle', label: 'Hatch Angle', type: 'angle', min: -90, max: 90, step: 1, displayUnit: '°', infoKey: 'petalis.shadingAngle' },
          { key: 'widthX', label: 'Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthX' },
          { key: 'posX', label: 'Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosX' },
          { key: 'gapX', label: 'Gap Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapX' },
          { key: 'gapPosX', label: 'Gap Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosX' },
          { key: 'widthY', label: 'Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthY' },
          { key: 'posY', label: 'Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosY' },
          { key: 'gapY', label: 'Gap Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapY' },
          { key: 'gapPosY', label: 'Gap Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosY' },
        ];

        shadings.forEach((shade, idx) => {
          if (!shade.id) shade.id = `shade-${idx + 1}`;
          const card = document.createElement('div');
          card.className = `noise-card${shade.enabled ? '' : ' noise-disabled'}`;
          card.dataset.shadingId = shade.id;
          const headerRow = document.createElement('div');
          headerRow.className = 'noise-header';
          headerRow.innerHTML = `
            <div class="flex items-center gap-2">
              ${shadingGripMarkup}
              <span class="noise-title">Shading ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <label class="sw-toggle" role="switch" aria-checked="${shade.enabled ? 'true' : 'false'}">
                <input type="checkbox" ${shade.enabled ? 'checked' : ''} />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete shading">🗑</button>
            </div>
          `;
          const toggle = headerRow.querySelector('input[type="checkbox"]');
          const deleteBtn = headerRow.querySelector('.noise-delete');
          const grip = headerRow.querySelector('.noise-grip');
          bindShadingReorderGrip(grip, card, shade);
          if (toggle) {
            toggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              shade.enabled = Boolean(e.target.checked);
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (deleteBtn) {
            deleteBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              const index = shadings.findIndex((item) => item.id === shade.id);
              if (index >= 0) shadings.splice(index, 1);
              layer.params.shadings = shadings;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          card.appendChild(headerRow);

          const controls = document.createElement('div');
          controls.className = 'noise-controls';
          const typeSelectDef = { key: 'type', label: 'Shading Type', infoKey: 'petalis.shadingType' };
          controls.appendChild(buildShadingSelect(shade, typeSelectDef, PETALIS_SHADING_TYPES));
          const lineTypeDef = { key: 'lineType', label: 'Line Type', infoKey: 'petalis.shadingLineType' };
          controls.appendChild(buildShadingSelect(shade, lineTypeDef, PETALIS_LINE_TYPES));
          shadingRangeDefs.forEach((cDef) => {
            if (cDef.type === 'angle') controls.appendChild(buildShadingAngleControl(shade, cDef));
            else controls.appendChild(buildShadingRangeControl(shade, cDef));
          });
          card.appendChild(controls);
          list.appendChild(card);
        });

        target.appendChild(list);
        return;
      }
      if (def.type === 'noiseList') {
        const noiseSource =
          def.source ||
          (layer.type === 'spiral'
            ? 'spiral'
            : layer.type === 'rings'
              ? 'rings'
              : layer.type === 'topo'
                ? 'topo'
                : layer.type === 'flowfield'
                  ? 'flowfield'
                  : layer.type === 'svgDistort'
                    ? 'svgDistort'
                    : layer.type === 'grid'
                      ? 'grid'
                      : layer.type === 'phylla'
                        ? 'phylla'
                        : 'wavetable');
        const noiseDefs =
          noiseSource === 'rings'
            ? RINGS_NOISE_DEFS
            : noiseSource === 'rasterPlane'
              ? RASTER_PLANE_NOISE_DEFS
              : noiseSource === 'topo'
                ? TOPO_NOISE_DEFS
              : noiseSource === 'flowfield' || noiseSource === 'svgDistort'
                ? FLOWFIELD_NOISE_DEFS
                : noiseSource === 'grid'
                  ? GRID_NOISE_DEFS
                  : noiseSource === 'phylla'
                    ? PHYLLA_NOISE_DEFS
                    : noiseSource === 'petalisDrift'
                      ? PETALIS_DRIFT_NOISE_DEFS
                    : WAVE_NOISE_DEFS;
        const noises =
          noiseSource === 'spiral'
            ? this.ensureSpiralNoises(layer)
            : noiseSource === 'rings'
              ? this.ensureRingsNoises(layer)
              : noiseSource === 'topo'
                ? this.ensureTopoNoises(layer)
                : noiseSource === 'rasterPlane'
                  ? this.ensureRasterPlaneNoises(layer)
                : noiseSource === 'flowfield'
                  ? this.ensureFlowfieldNoises(layer)
                  : noiseSource === 'svgDistort'
                    ? this.ensureSvgDistortNoises(layer)
                    : noiseSource === 'grid'
                      ? this.ensureGridNoises(layer)
                      : noiseSource === 'phylla'
                        ? this.ensurePhyllaNoises(layer)
                        : noiseSource === 'petalisDrift'
                          ? this.ensurePetalisDriftNoises(layer)
                          : this.ensureWavetableNoises(layer);
        const assignNoiseStack = (nextNoises) => {
          if (noiseSource === 'petalisDrift') layer.params.driftNoises = nextNoises;
          else layer.params.noises = nextNoises;
        };
        const { base: noiseBase, templates: noiseTemplates } = this.getWavetableNoiseTemplates(noiseSource);
        const getNoiseDefault = (index, key) => {
          if (key === 'amplitude') {
            const current = noises[index];
            if (current?.type === 'image') return IMAGE_NOISE_DEFAULT_AMPLITUDE;
          }
          const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
          if (template && Object.prototype.hasOwnProperty.call(template, key)) return template[key];
          return noiseBase[key];
        };
        const resetNoise = (noise, index) => {
          const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
          const keepType = noise.type;
          const keepBlend = noise.blend;
          Object.keys(noiseBase).forEach((key) => {
            if (key === 'id') return;
            const nextVal = template[key] !== undefined ? template[key] : noiseBase[key];
            noise[key] = Array.isArray(nextVal) ? clone(nextVal) : nextVal;
          });
          if (keepType) noise.type = keepType;
          if (keepBlend) noise.blend = keepBlend;
          if (noise.type === 'image') {
            noise.tileMode = 'off';
            noise.tilePadding = 0;
            noise.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
          } else if (!noise.tileMode) {
            noise.tileMode = noiseBase.tileMode || 'off';
          }
          if (!noise.noiseStyle) noise.noiseStyle = noiseBase.noiseStyle || 'linear';
          if (noise.noiseThreshold === undefined) noise.noiseThreshold = noiseBase.noiseThreshold ?? 0;
          if (noise.imageWidth === undefined) noise.imageWidth = noiseBase.imageWidth ?? 1;
          if (noise.imageHeight === undefined) noise.imageHeight = noiseBase.imageHeight ?? 1;
          if (noise.microFreq === undefined) noise.microFreq = noiseBase.microFreq ?? 0;
          if (noise.imageInvertColor === undefined) noise.imageInvertColor = noiseBase.imageInvertColor || false;
          if (noise.imageInvertOpacity === undefined) noise.imageInvertOpacity = noiseBase.imageInvertOpacity || false;
          if (noise.applyMode === undefined && noiseBase.applyMode) noise.applyMode = noiseBase.applyMode;
          this.normalizeImageEffects(noise, noiseBase.imageEffects?.[0]);
        };

        this._buildNoiseRack(target, {
          layer,
          noiseDefs,
          noiseBase,
          noiseTemplates,
          noises,
          assignNoiseStack,
          getNoiseDefault,
          resetNoise,
          createNoise: (idx) =>
            noiseSource === 'spiral' ? this.createSpiralNoise(idx)
            : noiseSource === 'rings' ? this.createRingsNoise(idx)
            : noiseSource === 'topo' ? this.createTopoNoise(idx)
            : noiseSource === 'rasterPlane' ? this.createRasterPlaneNoise(idx)
            : noiseSource === 'flowfield' ? this.createFlowfieldNoise(idx)
            : noiseSource === 'svgDistort' ? this.createFlowfieldNoise(idx)
            : noiseSource === 'grid' ? this.createGridNoise(idx)
            : noiseSource === 'phylla' ? this.createPhyllaNoise(idx)
            : noiseSource === 'petalisDrift' ? this.createPetalisDriftNoise(idx)
            : this.createWavetableNoise(idx),
          label: getDisplayLabel(def) || 'Noise Stack',
          containerClass: 'noise-list mb-4',
        });
        return;
      }
      let val = layer.params[def.id];
      const div = document.createElement('div');
      div.className = 'mb-4';
      const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
      const statsText = () => {
        const stats = layer.stats || {};
        const rawLines = stats.rawLines ?? layer.paths?.length ?? 0;
        const rawPoints = stats.rawPoints ?? 0;
        const simpLines = stats.simplifiedLines ?? rawLines;
        const simpPoints = stats.simplifiedPoints ?? rawPoints;
        return `Lines ${rawLines}→${simpLines} · Points ${rawPoints}→${simpPoints}`;
      };

      // Free-text parameter (single-line `text`, multi-line `textarea`). The only
      // control that writes a raw string to layer.params; used by the Text
      // algorithm. History is pushed once per edit session (on first keystroke).
      if (def.type === 'text' || def.type === 'textarea') {
        const cur = val == null ? '' : String(val);
        const field = def.type === 'textarea'
          ? `<textarea rows="${def.rows || 2}" class="value-input w-full bg-vectura-bg border border-vectura-border p-2 text-xs" style="resize:vertical;font-family:inherit;line-height:1.4;">${escapeHtml(cur)}</textarea>`
          : `<input type="text" class="value-input w-full bg-vectura-bg border border-vectura-border p-2 text-xs" value="${escapeHtml(cur)}" />`;
        div.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            ${infoBtn}
          </div>
          ${field}
        `;
        const input = div.querySelector('textarea, input');
        if (input) {
          if (def.placeholder) input.setAttribute('placeholder', def.placeholder);
          let pushed = false;
          const commit = () => {
            const next = input.value;
            if (layer.params[def.id] === next) return;
            if (!pushed && this.app.pushHistory) { this.app.pushHistory(); pushed = true; }
            layer.params[def.id] = next;
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          input.addEventListener('input', commit);
          input.addEventListener('change', () => { commit(); pushed = false; });
          input.addEventListener('blur', () => { pushed = false; });
        }
        container.appendChild(div);
        return;
      }

      // Picture upload for the image-driven algorithms (Dotscreen, Weave). Decodes
      // the chosen file to a data URL (persisted in params) + a runtime raster via
      // Vectura.ImageSource, then regenerates. Falls back to a built-in subject when
      // empty. Mirrors the other branches' history/store/regen contract.
      if (def.type === 'imageUpload') {
        const IS = window.Vectura.ImageSource;
        const hasImg = Boolean(layer.params.imageSrc);
        const thumb = hasImg
          ? `<img src="${escapeHtml(layer.params.imageSrc)}" alt="" style="max-width:100%;max-height:120px;display:block;margin:0 auto;border:1px solid var(--vectura-border,#333);" />`
          : '<div class="text-[10px] text-vectura-muted text-center py-4 border border-vectura-border">Built-in sphere — choose a picture</div>';
        div.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            ${infoBtn}
          </div>
          <div class="mb-2">${thumb}</div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" data-img-choose class="w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors">Choose…</button>
            <button type="button" data-img-clear class="w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border transition-colors" ${hasImg ? '' : 'disabled style="opacity:.4;"'}>Clear</button>
          </div>
          <input type="file" accept="image/*" data-img-file hidden />
        `;
        const fileInput = div.querySelector('[data-img-file]');
        const chooseBtn = div.querySelector('[data-img-choose]');
        const clearBtn = div.querySelector('[data-img-clear]');
        if (chooseBtn && fileInput) chooseBtn.onclick = () => fileInput.click();
        if (fileInput) {
          fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || '');
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params.imageSrc = dataUrl;
              layer.params.imageName = file.name || 'picture';
              layer.params.imageSourceKind = 'imported';
              layer.params.imageId = IS ? IS.decode(dataUrl, () => { this.app.regen(); }) : '';
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
            };
            reader.readAsDataURL(file);
          };
        }
        if (clearBtn && hasImg) {
          clearBtn.onclick = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params.imageSrc = '';
            layer.params.imageName = '';
            layer.params.imageId = '';
            layer.params.imageSourceKind = 'builtin';
            this.storeLayerParams(layer);
            this.app.regen();
            this.buildControls();
          };
        }
        container.appendChild(div);
        return;
      }

      if (def.id === 'simplify') {
        div.innerHTML = controlHeaderHtml(def, infoBtn);
        const statsEl = document.createElement('div');
        statsEl.className = 'text-[10px] text-vectura-muted simplify-stats';
        statsEl.textContent = statsText();
        const defaultVal = getDefaultValue(def);
        // 'input' only refreshed the chip (component-owned); commits refresh
        // the simplification stats line after the regen.
        createDefSlider(div, def, {
          value: toDisplayValue(def, val),
          defaultValue: (defaultVal === null || defaultVal === undefined)
            ? undefined
            : toDisplayValue(def, defaultVal),
          onCommit: (nextDisplay) => {
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = fromDisplayValue(def, nextDisplay);
            this.storeLayerParams(layer);
            this.app.regen();
            statsEl.textContent = statsText();
            this.updateFormula();
          },
        });
        div.appendChild(statsEl);
        target.appendChild(div);
        return;
      }

      if (def.type === 'lightPad') {
        // Square XY pad: drag a point to position the light (and thus the specular
        // highlight). The point's position is the light's screen-XY direction;
        // distance from centre maps to elevation (centre = head-on, edge = grazing).
        // Writes two params (azimuth + elevation) in one gesture.
        const azKey = def.azParam || 'lightAzimuth';
        const elKey = def.elParam || 'lightElevation';
        const azDefault = def.azDefault ?? 135;
        const elDefault = def.elDefault ?? 45;
        const readAz = () => (Number.isFinite(layer.params[azKey]) ? layer.params[azKey] : azDefault);
        const readEl = () => (Number.isFinite(layer.params[elKey]) ? layer.params[elKey] : elDefault);
        div.innerHTML = `
          <div class="angle-label">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${Math.round(readAz())}° · ${Math.round(readEl())}°</button>
          </div>
          <div class="light-pad" tabindex="0" title="Drag to position the light">
            <div class="light-pad-disk"></div>
            <div class="light-pad-handle"></div>
          </div>
        `;
        const pad = div.querySelector('.light-pad');
        const handle = div.querySelector('.light-pad-handle');
        const valueBtn = div.querySelector('.value-chip');
        // az/el → unit-square point (y up positive). mag = cos(el); point = mag·(cos az, sin az).
        const place = (az, el) => {
          const a = (az * Math.PI) / 180;
          const mag = Math.cos((el * Math.PI) / 180);
          const px = Math.cos(a) * mag;
          const py = Math.sin(a) * mag;
          handle.style.left = `${(px * 0.5 + 0.5) * 100}%`;
          handle.style.top = `${(0.5 - py * 0.5) * 100}%`;
          if (valueBtn) valueBtn.innerText = `${Math.round(az)}° · ${Math.round(el)}°`;
        };
        place(readAz(), readEl());
        let pushed = false;
        const apply = (e, commit) => {
          const rect = pad.getBoundingClientRect();
          let nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          let ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          let mag = Math.hypot(nx, ny);
          if (mag > 1) { nx /= mag; ny /= mag; mag = 1; }
          let az = (Math.atan2(ny, nx) * 180) / Math.PI;
          if (az < 0) az += 360;
          const el = (Math.acos(clamp(mag, 0, 1)) * 180) / Math.PI;
          layer.params[azKey] = Math.round(az);
          layer.params[elKey] = Math.round(el);
          place(Math.round(az), Math.round(el));
          this.storeLayerParams(layer);
          this.app.regen(commit ? undefined : { preview: true });
          this.updateFormula();
        };
        // Pointer events + pointer capture so the pad also works with touch and
        // pen input (mouse-only mousedown/mousemove wiring predated this) and
        // keeps receiving moves when the pointer leaves the pad mid-drag.
        let padDragging = false;
        const endPadDrag = (e) => {
          // Always detach the window fallback listeners, even if the drag
          // already ended through the pad's own pointerup.
          window.removeEventListener('pointerup', endPadDrag);
          window.removeEventListener('pointercancel', endPadDrag);
          if (!padDragging) return;
          padDragging = false;
          try { pad.releasePointerCapture(e.pointerId); } catch (_) {}
          apply(e, true);
          pushed = false;
          maybeRebuildControls();
        };
        pad.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          padDragging = true;
          try { pad.setPointerCapture(e.pointerId); } catch (_) {}
          // Window-level fallback: if setPointerCapture failed (unsupported or
          // element detached), a pointerup outside the pad would never reach
          // the pad's listeners and the drag would stick until the next click.
          window.addEventListener('pointerup', endPadDrag);
          window.addEventListener('pointercancel', endPadDrag);
          if (!pushed && this.app.pushHistory) { this.app.pushHistory(); pushed = true; }
          apply(e, false);
        });
        pad.addEventListener('pointermove', (e) => {
          if (!padDragging) return;
          apply(e, false);
        });
        pad.addEventListener('pointerup', endPadDrag);
        pad.addEventListener('pointercancel', endPadDrag);
        pad.addEventListener('dblclick', (e) => {
          e.preventDefault();
          if (this.app.pushHistory) this.app.pushHistory();
          layer.params[azKey] = azDefault;
          layer.params[elKey] = elDefault;
          place(azDefault, elDefault);
          this.storeLayerParams(layer);
          this.app.regen();
          this.updateFormula();
          maybeRebuildControls();
        });
        container.appendChild(div);
        return;
      }

      if (def.type === 'angle') {
        const { min, max, step } = getDisplayConfig(def);
        const displayVal = clamp(toDisplayValue(def, val), min, max);
        div.innerHTML = `
          <div class="angle-label">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
          </div>
        `;
        const defaultVal = getDefaultValue(def);
        // Drag only moved the needle (component-owned); release, keyboard,
        // dblclick-reset, and text entry commit: history + param + regen.
        const dial = UI.AngleDial(div, {
          value: displayVal,
          min,
          max,
          ariaLabel: getDisplayLabel(def) || 'Angle',
          defaultValue: (defaultVal === null || defaultVal === undefined)
            ? undefined
            : toDisplayValue(def, defaultVal),
          onCommit: (deg) => {
            const clamped = clamp(roundToStep(deg, step), min, max);
            if (clamped !== dial.getValue()) dial.setValue(clamped, { silent: true });
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = fromDisplayValue(def, clamped);
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          },
        });
        const target = def.inlineGroup ? getInlineGroup(def.inlineGroup) : container;
        if (def.inlineGroup) div.classList.add('control-inline-item', 'angle-item');
        target.appendChild(div);
        return;
      }

      if (def.type === 'checkbox') {
        const checked = Boolean(val);
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
          </div>
        `;
        // UI.SwToggle brings keyboard (Space/Enter + focus ring) and
        // aria-checked state the hand-rolled markup lacked. The redundant
        // "ON/OFF" text span is dropped — the pill itself is the state.
        const toggle = UI.SwToggle(div, {
          checked,
          ariaLabel: getDisplayLabel(def) || def.id,
          onChange: (next) => {
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = next;
            // Enabling Raster-Plane "Lines as Planes" seeds the relief defaults that
            // read best for extruded curtains: a small base lift so flat regions
            // still extrude, see-through OFF so the solid faces occlude, and a gentle
            // Occlusion Bias so the depth-occlusion reads without eating the front
            // ridges (the raw default sits at maximum occlusion). Mirrors the
            // wavetable/topoform param-cascade precedents in the sibling select
            // onchange handler below.
            if (layer.type === 'rasterPlane' && def.id === 'horizontalLinesAsPlanes' && next === true) {
              layer.params.baseHeight = 1;
              layer.params.seeThrough = false;
              layer.params.depthBias = 1.5;
            }
            this.storeLayerParams(layer);
            // `curves` is normally a render-time flag (the renderer smooths
            // polylines on draw), so toggling it only needs a re-render. The 3D
            // algorithms bake curves at GENERATE time (their paths are stamped
            // straight / forceCurves), so for those the toggle must regenerate or
            // it does nothing. See `curveSurfacePath` in raster-plane.js.
            if (def.id === 'curves' && !curvesBakedAtGenerate(layer)) {
              this.app.render();
              this.updateFormula();
            } else {
              this.app.regen();
              this.updateFormula();
            }
            maybeRebuildControls();
          },
        });
        // dblclick on the pill resets to the algorithm default — parity with
        // the legacy hand-rolled toggle and with the sliders' dblclick-reset.
        const cbInput = toggle.el.querySelector('input[type="checkbox"]');
        if (cbInput) {
          cbInput.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Boolean(defaultVal);
            toggle.setChecked(next, { silent: true });
            layer.params[def.id] = next;
            this.storeLayerParams(layer);
            if (def.id === 'curves' && !curvesBakedAtGenerate(layer)) {
              this.app.render();
              this.updateFormula();
            } else {
              this.app.regen();
              this.updateFormula();
            }
            maybeRebuildControls();
          });
        }
        const target = def.inlineGroup ? getInlineGroup(def.inlineGroup) : container;
        if (def.inlineGroup) div.classList.add('control-inline-item');
        target.appendChild(div);
        return;
      } else if (def.type === 'select') {
        if ((val === undefined || val === null) && def.options && def.options.length) {
          val = def.options[0].value;
          layer.params[def.id] = val;
        }
        if (def.options?.length && !def.options.some((opt) => opt.value === val)) {
          val = def.options[0].value;
          layer.params[def.id] = val;
        }
        const optionsHtml = def.options
          .map(
            (opt) =>
              `<option value="${opt.value}" ${val === opt.value ? 'selected' : ''}>${opt.label}</option>`
          )
          .join('');
        const currentLabel = def.options.find((opt) => opt.value === val)?.label || val;
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
          </div>
          <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
            ${optionsHtml}
          </select>
        `;
        const input = div.querySelector('select');
        const span = div.querySelector('span');
        if (input && span) {
          input.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const next = e.target.value;
            // Preset control fallback: the universal gallery intercepts the
            // preset control for any algorithm with a non-empty library (see
            // renderDef), so this <select> branch is normally unreachable. Keep
            // it wired to the SAME generic apply path so any fallback select
            // (empty-library algorithm, or gallery component missing) stays in
            // lock-step — no duplicated merge logic per algorithm.
            if (def.id === 'preset') {
              applyPreset(next);
              return;
            }
            layer.params[def.id] = next;
            if (layer.type === 'wavetable' && def.id === 'lineStructure' && next === 'vertical') {
              layer.params.lineOffset = 135;
            }
            // Raster-Plane Bars read best as a watertight solid relief: switching
            // into Bars seeds See-Through OFF so the box faces occlude instead of
            // drawing every hidden back edge (mirrors the Lines-as-Planes cascade).
            if (layer.type === 'rasterPlane' && def.id === 'mode' && next === 'bars') {
              layer.params.seeThrough = false;
            }
            if (layer.type === 'topoform' && def.id === 'sourceMode' && next === 'capsule') {
              const sx = layer.params.primitiveScaleX ?? 65;
              const sy = layer.params.primitiveScaleY ?? 65;
              const sz = layer.params.primitiveScaleZ ?? 65;
              if (sy <= Math.min(sx, sz)) {
                layer.params.primitiveScaleY = Math.round(Math.min(sx, sz) * 1.8);
              }
            }
            this.storeLayerParams(layer);
            span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
            this.app.regen();
            this.updateFormula();
            maybeRebuildControls();
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaultVal = getDefaultValue(def);
            const fallback = def.options?.[0]?.value;
            const next = defaultVal !== null && defaultVal !== undefined ? defaultVal : fallback;
            if (next === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = next;
            this.storeLayerParams(layer);
            input.value = next;
            span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
            this.app.regen();
            this.updateFormula();
            maybeRebuildControls();
          });
        }
      } else if (def.type === 'colorModal') {
        const colorVal = val || '#ffffff';
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <button type="button" class="color-modal-trigger text-[10px] text-vectura-accent border border-vectura-border px-2 py-1 rounded">
              Set Color
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span class="color-swatch" style="background:${colorVal}"></span>
            <span class="text-xs text-vectura-accent font-mono color-value">${colorVal}</span>
          </div>
        `;
        const btn = div.querySelector('.color-modal-trigger');
        const swatch = div.querySelector('.color-swatch');
        const valueEl = div.querySelector('.color-value');
        if (btn && swatch && valueEl) {
          btn.onclick = () => {
            this.openColorModal({
              title: getDisplayLabel(def),
              value: layer.params[def.id] || colorVal,
              onApply: (next) => {
                if (this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = next;
                this.storeLayerParams(layer);
                swatch.style.background = next;
                valueEl.textContent = next;
                this.app.regen();
                this.updateFormula();
              },
            });
          };
        }
      } else if (def.type === 'color') {
        const colorVal = val || '#ffffff';
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <span class="text-xs text-vectura-accent font-mono">${colorVal}</span>
          </div>
          <input type="color" value="${colorVal}" class="w-full h-8 bg-transparent border border-vectura-border rounded">
        `;
        const input = div.querySelector('input');
        const span = div.querySelector('span');
        if (input && span) {
          input.oninput = (e) => {
            span.innerText = e.target.value;
          };
          input.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = e.target.value;
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaultVal = getDefaultValue(def);
            if (!defaultVal) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = defaultVal;
            input.value = defaultVal;
            span.innerText = defaultVal;
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          });
        }
      } else if (def.type === 'rangeDual') {
        const minVal = layer.params[def.minKey];
        const maxVal = layer.params[def.maxKey];
        const { min: displayMin, max: displayMax, step: displayStep } = getDisplayConfig(def);
        const displayMinVal = toDisplayValue(def, minVal);
        const displayMaxVal = toDisplayValue(def, maxVal);
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, minVal)}-${formatDisplayValue(def, maxVal)}</button>
          </div>
          <div class="dual-range">
            <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMinVal}" data-handle="min">
            <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMaxVal}" data-handle="max">
          </div>
        `;
        const minInput = div.querySelector('input[data-handle="min"]');
        const maxInput = div.querySelector('input[data-handle="max"]');
        const valueBtn = div.querySelector('.value-chip');
        const resetToDefault = () => {
          const defaults = getDefaultValue(def);
          if (!defaults || defaults.min === undefined || defaults.max === undefined) return;
          if (this.app.pushHistory) this.app.pushHistory();
          layer.params[def.minKey] = defaults.min;
          layer.params[def.maxKey] = defaults.max;
          if (minInput) minInput.value = toDisplayValue(def, defaults.min);
          if (maxInput) maxInput.value = toDisplayValue(def, defaults.max);
          this.storeLayerParams(layer);
          this.app.regen();
          if (valueBtn) {
            valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
              def,
              layer.params[def.maxKey]
            )}`;
          }
          this.updateFormula();
        };

        const syncValues = (changed) => {
          let min = parseFloat(minInput.value);
          let max = parseFloat(maxInput.value);
          if (min > max) {
            if (changed === 'min') max = min;
            else min = max;
          }
          min = clamp(min, displayMin, displayMax);
          max = clamp(max, displayMin, displayMax);
          minInput.value = min;
          maxInput.value = max;
          layer.params[def.minKey] = fromDisplayValue(def, min);
          layer.params[def.maxKey] = fromDisplayValue(def, max);
          if (valueBtn) {
            valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
              def,
              layer.params[def.maxKey]
            )}`;
          }
          const minOnTop = min >= max - displayStep;
          minInput.style.zIndex = minOnTop ? 2 : 1;
          maxInput.style.zIndex = minOnTop ? 1 : 2;
        };

        if (minInput && maxInput) {
          syncValues();
          minInput.oninput = () => syncValues('min');
          maxInput.oninput = () => syncValues('max');
          minInput.onchange = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            syncValues('min');
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          maxInput.onchange = () => {
            if (this.app.pushHistory) this.app.pushHistory();
            syncValues('max');
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          attachKeyboardRangeNudge(minInput, () => {
            syncValues('min');
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          });
          attachKeyboardRangeNudge(maxInput, () => {
            syncValues('max');
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          });
          minInput.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetToDefault();
          });
          maxInput.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetToDefault();
          });
        }
        if (valueBtn) {
          attachValueEditor({
            def,
            valueEl: valueBtn,
            getValue: () => ({
              min: layer.params[def.minKey],
              max: layer.params[def.maxKey],
            }),
            formatValue: (current) => {
              const currMin = toDisplayValue(def, current.min);
              const currMax = toDisplayValue(def, current.max);
              return `${currMin}, ${currMax}`;
            },
            parseValue: (raw) => {
              const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
              if (parts.length !== 2) return null;
              const minValParsed = Number.parseFloat(parts[0]);
              const maxValParsed = Number.parseFloat(parts[1]);
              if (
                !Number.isFinite(minValParsed) ||
                !Number.isFinite(maxValParsed) ||
                minValParsed < displayMin ||
                maxValParsed > displayMax ||
                minValParsed > maxValParsed
              ) {
                return null;
              }
              return { min: minValParsed, max: maxValParsed };
            },
            setValue: (vals, opts) => {
              if (!vals) return;
              const commit = opts?.commit !== false;
              if (commit && this.app.pushHistory) this.app.pushHistory();
              if (minInput) minInput.value = vals.min;
              if (maxInput) maxInput.value = vals.max;
              syncValues();
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            },
          });
        }
      } else {
        div.innerHTML = controlHeaderHtml(def, infoBtn);
        const defaultVal = getDefaultValue(def);
        let livePreviewHistoryPushed = false;
        // Committed value at the start of the current livePreview drag session,
        // captured before the first preview write. A confirmAbove dialog's
        // Cancel restores THIS, not layer.params (which livePreview mutates).
        let liveGestureStartValue;
        let slider = null;
        // The confirmAbove dialog is async: the layer can be deleted (or undone
        // away) while it sits open. Always re-resolve by id at settle time; a
        // null result means the captured closure `layer` is dead.
        const resolveLiveLayer = () => {
          const engine = this.app?.engine;
          if (!engine) return null;
          if (typeof engine.getLayerById === 'function') return engine.getLayerById(layer.id) || null;
          return (engine.layers || []).find((l) => l && l.id === layer.id) || null;
        };
        const applyCommit = (nextVal, targetLayer = layer) => {
          if (!livePreviewHistoryPushed && this.app.pushHistory) this.app.pushHistory();
          livePreviewHistoryPushed = false;
          targetLayer.params[def.id] = nextVal;
          this.storeLayerParams(targetLayer);
          this.app.regen();
          this.updateFormula();
          maybeRebuildControls();
        };
        const revertSlider = () => {
          if (!slider) return;
          slider.setValue(toDisplayValue(def, layer.params[def.id]), { silent: true });
        };
        slider = createDefSlider(div, def, {
          value: toDisplayValue(def, val),
          defaultValue: (defaultVal === null || defaultVal === undefined)
            ? undefined
            : toDisplayValue(def, defaultVal),
          // 'input' during drag: chip/fill are component-owned; livePreview
          // defs additionally push history once per drag session and preview-
          // regenerate on every step — exactly the legacy oninput contract.
          onChange: (nextDisplay) => {
            if (!def.livePreview) return;
            if (!livePreviewHistoryPushed && this.app.pushHistory) {
              liveGestureStartValue = layer.params[def.id];
              this.app.pushHistory();
              livePreviewHistoryPushed = true;
            }
            layer.params[def.id] = fromDisplayValue(def, nextDisplay);
            this.storeLayerParams(layer);
            this.app.regen({ preview: true });
            this.updateFormula();
          },
          // 'change' on release (also keyboard steps, chip edits, and
          // dblclick-reset): full commit — history (unless livePreview already
          // pushed this session) + store + regen + possible control rebuild.
          onCommit: (nextDisplay) => {
            const nextVal = fromDisplayValue(def, nextDisplay);
            if (Number.isFinite(def.confirmAbove) && nextVal >= def.confirmAbove) {
              const message = def.confirmMessage || 'This value may be slow. Continue?';
              if (UI.overlays?.Dialog) {
                const dlg = UI.overlays.Dialog(document.body, {
                  title: 'Heavy computation',
                  message,
                  confirmLabel: 'Continue',
                  cancelLabel: 'Cancel',
                  onConfirm: () => {
                    dlg.destroy();
                    // No-op if the layer died while the dialog was open —
                    // writing into the stale closure object would target a
                    // removed layer and corrupt the undo stack.
                    const liveLayer = resolveLiveLayer();
                    if (!liveLayer) {
                      livePreviewHistoryPushed = false;
                      return;
                    }
                    applyCommit(nextVal, liveLayer);
                  },
                  onCancel: () => {
                    dlg.destroy();
                    // livePreview+confirmAbove hardening: a livePreview drag
                    // already wrote preview values into layer.params before the
                    // dialog opened. Restore the pre-gesture committed snapshot
                    // (and regen) instead of trusting layer.params, and disarm
                    // the once-per-gesture history flag.
                    if (livePreviewHistoryPushed) {
                      livePreviewHistoryPushed = false;
                      const liveLayer = resolveLiveLayer();
                      if (liveLayer && liveGestureStartValue !== undefined) {
                        liveLayer.params[def.id] = liveGestureStartValue;
                        this.storeLayerParams(liveLayer);
                        this.app.regen();
                        this.updateFormula();
                      }
                    }
                    revertSlider();
                  },
                });
                dlg.open();
              } else if (window.confirm(message)) {
                applyCommit(nextVal);
              } else {
                revertSlider();
              }
              return;
            }
            applyCommit(nextVal);
          },
        });
      }
      const inlineTarget = def.inlineGroup ? getInlineGroup(def.inlineGroup) : target;
      if (def.inlineGroup) div.classList.add('control-inline-item');
      inlineTarget.appendChild(div);
    };


    if (!isGroup) {
      let groupTarget = null;
      // Routing pointer for collapsible sections (UX1 / WU10). When a
      // `{ type:'section', collapsed:true }` is rendered, renderDef returns its
      // body element; subsequent controls route into it until the NEXT section
      // (collapsed or plain) or a collapsibleGroup boundary resets it back to the
      // base target. Plain (non-collapsed) sections leave this null, so their
      // following controls stay siblings exactly as before (backward-compat).
      let sectionBody = null;
      for (const def of algoDefs) {
        if (def.type === 'section') {
          // Any new section ends the previous collapsible section's body. The
          // header itself renders at the group/base level, never nested inside
          // the prior collapsed body.
          sectionBody = null;
          const maybeBody = renderDef(def, groupTarget);
          if (maybeBody) sectionBody = maybeBody;
          continue;
        }
        if (def.type === 'collapsibleGroup') {
          if (this.treeRingParamsCollapsed === undefined) this.treeRingParamsCollapsed = false;
          const collapsed = this.treeRingParamsCollapsed;
          const group = document.createElement('div');
          group.className = 'algo-param-group';
          group.classList.toggle('collapsed', collapsed);
          const header = document.createElement('button');
          header.type = 'button';
          header.className = 'algo-param-group-header';
          const ringIcon = window.Vectura.Icons.misc.ring();
          header.innerHTML = `<span class="algo-param-group-title">${ringIcon}${getDisplayLabel(def)}</span><span class="algo-param-group-toggle" aria-hidden="true"></span>`;
          const body = document.createElement('div');
          body.className = 'algo-param-group-body';
          if (collapsed) body.style.display = 'none';
          header.onclick = () => {
            this.treeRingParamsCollapsed = !this.treeRingParamsCollapsed;
            group.classList.toggle('collapsed', this.treeRingParamsCollapsed);
            body.style.display = this.treeRingParamsCollapsed ? 'none' : '';
          };
          group.appendChild(header);
          group.appendChild(body);
          container.appendChild(group);
          groupTarget = body;
          // A group boundary closes any open collapsible section.
          sectionBody = null;
        } else if (def.type === 'collapsibleGroupEnd') {
          groupTarget = null;
          sectionBody = null;
        } else {
          renderDef(def, sectionBody || groupTarget);
        }
      }
    }
    if (commonDefs.length) {
      container.appendChild(globalSection);
      // Mirror the algoDefs loop's collapsible-section routing so common defs can
      // also use `{ type:'section', collapsed:true }`. globalBody is the base.
      let commonSectionBody = null;
      for (const def of commonDefs) {
        if (def.type === 'section') {
          commonSectionBody = null;
          const maybeBody = renderDef(def, globalBody);
          if (maybeBody) commonSectionBody = maybeBody;
          continue;
        }
        renderDef(def, commonSectionBody || globalBody);
      }
    }
    renderExportOptimizationIfOpen();
    restoreLeftPanelScroll();
    if (this.exportModalState?.isOpen) {
      this.decorateExportControlsPanel();
      this.renderExportPreview();
    }
    } finally {
      restoreLeftPanelScroll();
    }
  }

  /**
   * Grouped installer for the algorithm module dropdown
   * (`generator-module` + `generator-module-trigger`) and the transform
   * inputs (`inp-seed`, `inp-pos-x`/-y, `inp-scale-x`/-y, `inp-rotation`,
   * `btn-rand-seed`). `this` is the UI instance — handlers reach for
   * `this.app`, `this.isModifierLayer`, `this.storeLayerParams`,
   * `this.rememberDrawableLayerType`, `this.restoreLayerParams`,
   * `this.getUniqueLayerName`, `this.buildControls`,
   * `this.refreshModifierLayer`, `this._showModuleMenu`,
   * `this.recenterLayerIfNeeded`, `this.updateFormula`,
   * `this.parseDocumentNumber` via the prototype.
   */
  function bindAlgoConfigListeners() {
    const deps = requireDeps('bindAlgoConfigListeners');
    const { getEl, isModifierLayer } = deps;
    const ALGO_DEFAULTS = (typeof window !== 'undefined' && window.Vectura?.ALGO_DEFAULTS) || {};
    const createModifierState =
      deps.createModifierState
        || (typeof window !== 'undefined' && window.Vectura?.Modifiers?.createModifierState)
        || ((type) => ({ type, enabled: true, guidesVisible: true, guidesLocked: false, mirrors: [] }));
    const createMirrorLine =
      deps.createMirrorLine
        || (typeof window !== 'undefined' && window.Vectura?.Modifiers?.createMirrorLine)
        || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));

    const moduleSelect = getEl('generator-module', { silent: true });
    if (moduleSelect) {
      moduleSelect.onchange = (e) => {
        const l = this.app.engine.getActiveLayer();
        if (l) {
          if (this.app.pushHistory) this.app.pushHistory();
          if (isModifierLayer(l)) {
            const nextType = e.target.value;
            l.modifier = createModifierState(nextType, {
              mirrors: [createMirrorLine(0)],
            });
            this.buildControls();
            this.refreshModifierLayer(l, { rebuildControls: false });
            return;
          }
          this.storeLayerParams(l);
          const nextType = e.target.value;
          this.rememberDrawableLayerType(nextType);
          this.restoreLayerParams(l, nextType);
          if (l.type !== 'shape') l.sourcePaths = null;
          if (this.app.renderer?.directSelection?.layerId === l.id) {
            this.app.renderer.clearDirectSelection();
          }
          const label = (ALGO_DEFAULTS && ALGO_DEFAULTS[l.type]?.label);
          const nextName = label || l.type.charAt(0).toUpperCase() + l.type.slice(1);
          l.name = this.getUniqueLayerName(nextName, l.id);
          this.buildControls();
          this.app.regen();
          this.renderLayers();
        }
      };
    }

    const moduleTrigger = document.getElementById('generator-module-trigger');
    if (moduleTrigger) {
      moduleTrigger.addEventListener('click', () => {
        const select = getEl('generator-module', { silent: true });
        if (select?.disabled) return;
        const menu = document.getElementById('gm-module-menu');
        if (menu && !menu.classList.contains('hidden')) {
          menu.classList.add('hidden');
        } else {
          this._showModuleMenu();
        }
      });
    }

    const TRANSLATION_KEYS = new Set(['posX', 'posY']);
    const bindTrans = (id, key) => {
      const el = getEl(id, { silent: true });
      if (!el) return;
      el.onchange = (e) => {
        // In multi-selection mode the transform inputs apply to every selected
        // layer; a blank value (placeholder "Multiple") means "leave unchanged".
        const selected = this.app.renderer?.getSelectedLayers?.() || [];
        const targets = selected.length > 1 ? selected : (this.app.engine.getActiveLayer() ? [this.app.engine.getActiveLayer()] : []);
        if (!targets.length) return;
        const rawValue = e.target.value;
        if (rawValue === '' || rawValue == null) return;
        if (this.app.pushHistory) this.app.pushHistory();
        if (TRANSLATION_KEYS.has(key)) {
          targets.forEach((layer) => {
            const prev = layer.params[key] ?? 0;
            const next = this.parseDocumentNumber(rawValue, { fallbackMm: prev });
            layer.params[key] = next;
            const delta = next - prev;
            if (delta) {
              const dx = key === 'posX' ? delta : 0;
              const dy = key === 'posY' ? delta : 0;
              window.Vectura?.PaintBucketOps?.translateLayerFills?.(layer, dx, dy);
            }
          });
        } else {
          const parsed = parseFloat(rawValue);
          if (!Number.isFinite(parsed)) return;
          targets.forEach((layer) => { layer.params[key] = parsed; });
        }
        // app.regen() only regenerates the active layer's geometry. For multi-
        // selection the other selected layers need an explicit generate() pass
        // so their baked paths pick up the new transform.
        if (targets.length > 1) {
          const activeId = this.app.engine.activeLayerId;
          targets.forEach((layer) => {
            if (layer.id !== activeId) this.app.engine.generate(layer.id);
          });
        }
        this.app.regen();
      };
    };
    bindTrans('inp-seed', 'seed');
    bindTrans('inp-pos-x', 'posX');
    bindTrans('inp-pos-y', 'posY');
    bindTrans('inp-scale-x', 'scaleX');
    bindTrans('inp-scale-y', 'scaleY');
    bindTrans('inp-rotation', 'rotation');

    const randSeed = getEl('btn-rand-seed', { silent: true });
    if (randSeed) {
      randSeed.onclick = () => {
        const l = this.app.engine.getActiveLayer();
        const seedInput = getEl('inp-seed', { silent: true });
        // Reroll feedback on the dice affordance (existing motion helper —
        // same pulse the header buttons use; no new keyframes).
        const motion = window.Vectura?.UI?.motion;
        if (motion?.triggerBtnPulse) motion.triggerBtnPulse(randSeed);
        if (l) {
          if (this.app.pushHistory) this.app.pushHistory();
          l.params.seed = Math.floor(Math.random() * 99999);
          if (seedInput) seedInput.value = l.params.seed;
          this.app.regen();
          this.recenterLayerIfNeeded(l);
          this.app.render();
          this.buildControls();
          this.updateFormula();
        }
      };
    }
  }

  // `toggleSeedControls` reads `getEl` from DEPS (already bound) and
  // identifies seedless algos via the locally-defined SEEDLESS_ALGOS set.
  const SEEDLESS_ALGOS_LIST = ['lissajous', 'harmonograph', 'pendula', 'shape', 'group'];
  function toggleSeedControls(type) {
    const getEl = (DEPS && DEPS.getEl)
      || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
    const show = !SEEDLESS_ALGOS_LIST.includes(type);
    const seedControls = getEl('seed-controls', { silent: true });
    if (seedControls) seedControls.style.display = show ? '' : 'none';
    const label = getEl('transform-label', { silent: true });
    if (label) label.textContent = show ? 'Transform & Seed' : 'Transform';
  }

  UI.AlgoConfigPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    buildControls,
    bindAlgoConfigListeners,
    toggleSeedControls,
    installOn(proto) {
      proto.buildControls = function() { return buildControls.call(this); };
      proto.bindAlgoConfigListeners = function() { return bindAlgoConfigListeners.call(this); };
      proto.toggleSeedControls = function(type) { return toggleSeedControls.call(this, type); };
    },
  };
})();
