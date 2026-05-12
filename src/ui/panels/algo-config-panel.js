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

  function buildControls() {
    // Closure-captured legacy IIFE locals — destructured fresh each call so the
    // new file matches the original body's reference set 1:1. The deps bag is
    // injected once at startup via AlgoConfigPanel.bind() from legacy ui.js
    // (see end of src/ui/ui.js).
    const {
      // constants & data
      COMMON_CONTROLS, OPTIMIZATION_STEPS, IMAGE_NOISE_DEFAULT_AMPLITUDE,
      WAVE_NOISE_DEFS, RINGS_NOISE_DEFS, TOPO_NOISE_DEFS, FLOWFIELD_NOISE_DEFS,
      GRID_NOISE_DEFS, PHYLLA_NOISE_DEFS, PETALIS_DRIFT_NOISE_DEFS,
      PETALIS_MODIFIER_TYPES, PETALIS_PETAL_MODIFIER_TYPES, PETALIS_SHADING_TYPES,
      PETALIS_LINE_TYPES,
      PETALIS_PRESET_LIBRARY, TERRAIN_PRESET_LIBRARY, RINGS_PRESET_LIBRARY,
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
    if (this.harmonographPlotterState?.rafId) {
      window.cancelAnimationFrame(this.harmonographPlotterState.rafId);
    }
    this.harmonographPlotterState = null;
    this.destroyInlinePetalisDesigner();
    this.destroyInlinePatternDesigner();
    container.innerHTML = '';
    if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
      this._showWelcomePanel(false);
      const algoSec = getEl('left-section-algorithm', { silent: true });
      const algoConfSec = getEl('left-section-algorithm-configuration', { silent: true });
      if (algoSec) algoSec.style.display = 'none';
      if (algoConfSec) algoConfSec.style.display = 'none';
      this._buildPatternFillPanel(container);
      restoreLeftPanelScroll();
      return;
    }
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
    if (hideAlgoPanels) { restoreLeftPanelScroll(); return; }
    this.updatePrimaryPanelMode(layer);
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
    if (posX) posX.value = layer.params.posX;
    if (posY) posY.value = layer.params.posY;
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
      restoreLeftPanelScroll();
      return;
    }

    if (isModifier) {
      this.buildMirrorModifierControls(layer, container);
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
    randomBtn.className =
      'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-muted transition-colors';
    randomBtn.textContent = 'Randomize Params';
    randomBtn.onclick = () => {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
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
          this.showValueError(`${raw}${unit}`);
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

    const syncSliderFill = (slider) => {
      const mn = parseFloat(slider.min) || 0;
      const mx = parseFloat(slider.max) || 100;
      const pct = ((parseFloat(slider.value) - mn) / (mx - mn)) * 100;
      slider.style.setProperty('--fill', pct.toFixed(1) + '%');
      const wrap = slider.closest('.sld-fx-wrap');
      if (wrap) wrap.style.setProperty('--fill', pct.toFixed(1) + '%');
    };
    const triggerSliderMotion = (slider) => {
      const m = window.Vectura?.UI?.motion;
      if (!m) return;
      const wrap = slider.closest('.sld-fx-wrap');
      if (wrap && m.triggerSliderPulse) m.triggerSliderPulse(wrap);
      if (m.triggerThumbRelease) m.triggerThumbRelease(slider);
    };

    const renderDef = (def, targetEl) => {
      const target = targetEl || container;
      if (def.showIf && !def.showIf(layer.params)) return;
      if (def.type === 'section') {
        const section = document.createElement('div');
        section.className = 'control-section';
        section.innerHTML = `<div class="control-section-title">${getDisplayLabel(def)}</div>`;
        target.appendChild(section);
        return;
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
      if (def.type === 'petalDesignerInline') {
        if (!isPetalisLayerType(layer.type)) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'petal-designer-inline-wrap mb-4';
        target.appendChild(wrapper);
        this.mountInlinePetalisDesigner(layer, wrapper);
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
          <button type="button" class="pendulum-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
            + Add Pendulum
          </button>
        `;
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

        const buildRangeControl = (pendulum, def, idx) => {
          const control = document.createElement('div');
          control.className = 'pendulum-control';
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, value);
          control.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <div class="slider-row">
              <div class="sld-fx-wrap">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
              </div>
              <button type="button" class="value-chip">${formatDisplayValue(def, value)}</button>
            </div>
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          if (input) syncSliderFill(input);
          const resetValue = () => {
            const nextVal = getPendulumDefault(idx, def.key);
            if (nextVal === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            pendulum[def.key] = nextVal;
            if (input) input.value = toDisplayValue(def, nextVal);
            if (valueBtn) valueBtn.innerText = formatDisplayValue(def, nextVal);
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          if (input && valueBtn) {
            input.disabled = !pendulum.enabled;
            input.oninput = (e) => {
              syncSliderFill(e.target);
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              triggerSliderMotion(e.target);
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              pendulum[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              pendulum[def.key] = fromDisplayValue(def, nextDisplay);
              syncSliderFill(input);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetValue();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              getValue: () => pendulum[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                pendulum[def.key] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, pendulum[def.key]);
                this.updateFormula();
              },
            });
          }
          return control;
        };

        const buildAngleControl = (pendulum, def, idx) => {
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
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                def,
                value
              )}</button>
            </div>
            <div class="angle-control">
              <div class="angle-dial" style="--angle:${displayVal}deg;">
                <div class="angle-indicator"></div>
              </div>
            </div>
          `;
          const dial = control.querySelector('.angle-dial');
          const valueBtn = control.querySelector('.value-chip');
          let lastDisplay = displayVal;
          const setAngle = (nextDisplay, commit = false) => {
            const clamped = clamp(roundToStep(nextDisplay, step), min, max);
            lastDisplay = clamped;
            if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
            if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
            if (commit) {
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum[def.key] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            }
          };
          const resetAngle = () => {
            const nextVal = getPendulumDefault(idx, def.key);
            if (nextVal === undefined) return;
            setAngle(toDisplayValue(def, nextVal), true);
          };
          if (dial) {
            dial.classList.toggle('angle-disabled', !pendulum.enabled);
            dial.addEventListener('mousedown', (e) => {
              if (!pendulum.enabled) return;
              e.preventDefault();
              const updateFromEvent = (ev) => {
                const rect = dial.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = ev.clientX - cx;
                const dy = ev.clientY - cy;
                let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                if (deg < 0) deg += 360;
                setAngle(deg, false);
              };
              updateFromEvent(e);
              const move = (ev) => updateFromEvent(ev);
              const up = () => {
                window.removeEventListener('mousemove', move);
                setAngle(lastDisplay, true);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up, { once: true });
            });
            dial.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetAngle();
            });
          }
          if (valueBtn) {
            valueBtn.classList.toggle('opacity-60', !pendulum.enabled);
            attachValueEditor({
              def,
              valueEl: valueBtn,
              getValue: () => pendulum[def.key],
            setValue: (displayVal, opts) => {
              const commit = opts?.commit !== false;
              setAngle(displayVal, commit);
            },
            });
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
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          card.appendChild(headerRow);
          const controls = document.createElement('div');
          controls.className = 'noise-controls';
          pendulumParamDefs.forEach((pDef) => {
            controls.appendChild(
              pDef.type === 'angle'
                ? buildAngleControl(pendulum, pDef, idx)
                : buildRangeControl(pendulum, pDef, idx)
            );
          });
          card.appendChild(controls);
          list.appendChild(card);
        });

        target.appendChild(list);
        return;
      }
      if (def.type === 'harmonographPlotter') {
        if (layer.type !== 'harmonograph') return;
        this.mountHarmonographPlotter(layer, target);
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
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, value);
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <div class="slider-row">
              <div class="sld-fx-wrap">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
              </div>
              <button type="button" class="value-chip">${formatDisplayValue(def, value)}</button>
            </div>
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          const valueInput = control.querySelector('.value-input');
          if (input) syncSliderFill(input);
          if (input && valueBtn) {
            input.disabled = !modifier.enabled;
            valueBtn.classList.toggle('opacity-60', !modifier.enabled);
            input.oninput = (e) => {
              syncSliderFill(e.target);
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              triggerSliderMotion(e.target);
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              syncSliderFill(input);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              modifier[def.key] = def.min ?? 0;
              input.value = toDisplayValue(def, modifier[def.key]);
              syncSliderFill(input);
              valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => modifier[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                modifier[def.key] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.updateFormula();
              },
            });
          }
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
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, value);
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <div class="slider-row">
              <div class="sld-fx-wrap">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
              </div>
              <button type="button" class="value-chip">${formatDisplayValue(def, value)}</button>
            </div>
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          const valueInput = control.querySelector('.value-input');
          if (input) syncSliderFill(input);
          if (input && valueBtn) {
            input.disabled = !modifier.enabled;
            valueBtn.classList.toggle('opacity-60', !modifier.enabled);
            input.oninput = (e) => {
              syncSliderFill(e.target);
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              triggerSliderMotion(e.target);
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              modifier[def.key] = fromDisplayValue(def, nextDisplay);
              syncSliderFill(input);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              modifier[def.key] = def.min ?? 0;
              input.value = toDisplayValue(def, modifier[def.key]);
              syncSliderFill(input);
              valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => modifier[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                modifier[def.key] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.updateFormula();
              },
            });
          }
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
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, value);
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          control.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
              <label class="control-label mb-0">${getDisplayLabel(def)}</label>
              ${infoBtn}
            </div>
            <div class="slider-row">
              <div class="sld-fx-wrap">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
              </div>
              <button type="button" class="value-chip">${formatDisplayValue(def, value)}</button>
            </div>
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          const valueInput = control.querySelector('.value-input');
          if (input) syncSliderFill(input);
          if (input && valueBtn) {
            input.disabled = !shade.enabled;
            valueBtn.classList.toggle('opacity-60', !shade.enabled);
            input.oninput = (e) => {
              syncSliderFill(e.target);
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              triggerSliderMotion(e.target);
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              shade[def.key] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              shade[def.key] = fromDisplayValue(def, nextDisplay);
              syncSliderFill(input);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              shade[def.key] = def.min ?? 0;
              input.value = toDisplayValue(def, shade[def.key]);
              syncSliderFill(input);
              valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => shade[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                shade[def.key] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
                this.updateFormula();
              },
            });
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
          { key: 'angle', label: 'Hatch Angle', type: 'range', min: -90, max: 90, step: 1, displayUnit: '°', infoKey: 'petalis.shadingAngle' },
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
            controls.appendChild(buildShadingRangeControl(shade, cDef));
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
            : noiseSource === 'flowfield' ? this.createFlowfieldNoise(idx)
            : noiseSource === 'svgDistort' ? this.createFlowfieldNoise(idx)
            : noiseSource === 'grid' ? this.createGridNoise(idx)
            : noiseSource === 'phylla' ? this.createPhyllaNoise(idx)
            : noiseSource === 'petalisDrift' ? this.createPetalisDriftNoise(idx)
            : this.createWavetableNoise(idx),
          label: getDisplayLabel(def) || 'Noise Stack',
          containerClass: 'noise-list mb-4',
          attachValueEditor,
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

      if (def.id === 'simplify') {
        const { min, max, step } = getDisplayConfig(def);
        const displayVal = toDisplayValue(def, val);
        div.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            ${infoBtn}
          </div>
          <div class="slider-row mb-2">
            <div class="sld-fx-wrap">
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${formatDisplayValue(def, val)}</button>
          </div>
          <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          <div class="text-[10px] text-vectura-muted simplify-stats">${statsText()}</div>
        `;
        const input = div.querySelector('input[type="range"]');
        const valueBtn = div.querySelector('.value-chip');
        const valueInput = div.querySelector('.value-input');
        const statsEl = div.querySelector('.simplify-stats');
        if (input) syncSliderFill(input);
        if (input && valueBtn && valueInput && statsEl) {
          const resetToDefault = () => {
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = defaultVal;
            this.storeLayerParams(layer);
            input.value = toDisplayValue(def, defaultVal);
            syncSliderFill(input);
            valueBtn.innerText = formatDisplayValue(def, defaultVal);
            this.app.regen();
            statsEl.textContent = statsText();
            this.updateFormula();
          };
          input.oninput = (e) => {
            syncSliderFill(e.target);
            const nextDisplay = parseFloat(e.target.value);
            valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
          };
          input.onchange = (e) => {
            triggerSliderMotion(e.target);
            if (this.app.pushHistory) this.app.pushHistory();
            const nextDisplay = parseFloat(e.target.value);
            layer.params[def.id] = fromDisplayValue(def, nextDisplay);
            this.storeLayerParams(layer);
            this.app.regen();
            statsEl.textContent = statsText();
            this.updateFormula();
          };
          attachKeyboardRangeNudge(input, (nextDisplay) => {
            layer.params[def.id] = fromDisplayValue(def, nextDisplay);
            syncSliderFill(input);
            this.storeLayerParams(layer);
            this.app.regen();
            statsEl.textContent = statsText();
            this.updateFormula();
          });
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetToDefault();
          });
          attachValueEditor({
            def,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => layer.params[def.id],
            setValue: (displayVal, opts) => {
              const commit = opts?.commit !== false;
              if (commit && this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = fromDisplayValue(def, displayVal);
              this.storeLayerParams(layer);
              this.app.regen();
              statsEl.textContent = statsText();
              valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
              this.updateFormula();
            },
          });
        }
        target.appendChild(div);
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
            <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
              def,
              val
            )}</button>
          </div>
          <div class="angle-control">
            <div class="angle-dial" style="--angle:${displayVal}deg;">
              <div class="angle-indicator"></div>
            </div>
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          </div>
        `;
        const dial = div.querySelector('.angle-dial');
        const valueBtn = div.querySelector('.value-chip');
        const valueInput = div.querySelector('.value-input');

        let lastDisplay = displayVal;
        const setAngle = (nextDisplay, commit = false, live = false) => {
          const clamped = clamp(roundToStep(nextDisplay, step), min, max);
          lastDisplay = clamped;
          if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
          if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
          if (commit || live) {
            if (commit && this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = fromDisplayValue(def, clamped);
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          }
        };
        const resetAngle = () => {
          const defaultVal = getDefaultValue(def);
          if (defaultVal === null || defaultVal === undefined) return;
          setAngle(toDisplayValue(def, defaultVal), true);
        };

        if (dial) {
          const updateFromEvent = (e) => {
            const rect = dial.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
            if (deg < 0) deg += 360;
            setAngle(deg, false);
          };
          dial.addEventListener('mousedown', (e) => {
            e.preventDefault();
            updateFromEvent(e);
            const move = (ev) => updateFromEvent(ev);
            const up = () => {
              window.removeEventListener('mousemove', move);
              setAngle(lastDisplay, true);
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up, { once: true });
          });
          dial.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetAngle();
          });
        }

        attachValueEditor({
          def,
          valueEl: valueBtn,
          inputEl: valueInput,
          getValue: () => layer.params[def.id],
          setValue: (displayVal, opts) => {
            const commit = opts?.commit !== false;
            const live = Boolean(opts?.live);
            setAngle(displayVal, commit, live);
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
            <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
          </div>
          <label class="sw-toggle" role="switch" aria-checked="${checked ? 'true' : 'false'}">
            <input type="checkbox" ${checked ? 'checked' : ''} />
            <span class="sw-track"></span>
            <span class="sw-thumb"></span>
          </label>
        `;
        const input = div.querySelector('input');
        const span = div.querySelector('span');
        if (input && span) {
          input.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Boolean(e.target.checked);
            span.innerText = next ? 'ON' : 'OFF';
            layer.params[def.id] = next;
            this.storeLayerParams(layer);
            if (def.id === 'curves') {
              this.app.render();
              this.updateFormula();
            } else {
              this.app.regen();
              this.updateFormula();
            }
            maybeRebuildControls();
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Boolean(defaultVal);
            input.checked = next;
            span.innerText = next ? 'ON' : 'OFF';
            layer.params[def.id] = next;
            this.storeLayerParams(layer);
            if (def.id === 'curves') {
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
            if (isPetalisLayerType(layer.type) && def.id === 'preset' && next === 'custom') {
              layer.params.preset = 'custom';
              layer.params.shadings = [];
              layer.params.innerShading = false;
              layer.params.outerShading = false;
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            if (isPetalisLayerType(layer.type) && def.id === 'preset' && next !== 'custom') {
              const preset = (PETALIS_PRESET_LIBRARY || []).find((item) => item.id === next);
              const presetBase = 'petalisDesigner';
              const base = ALGO_DEFAULTS?.[presetBase] ? clone(ALGO_DEFAULTS[presetBase]) : {};
              const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves']);
              const nextParams = { ...base, ...(preset?.params || {}) };
              preserved.forEach((key) => {
                if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
              });
              nextParams.preset = next;
              layer.params = { ...layer.params, ...nextParams };
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            if (layer.type === 'terrain' && def.id === 'preset' && next === 'custom') {
              layer.params.preset = 'custom';
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            if (layer.type === 'terrain' && def.id === 'preset' && next !== 'custom') {
              const preset = (TERRAIN_PRESET_LIBRARY || []).find((item) => item.id === next);
              const base = ALGO_DEFAULTS?.terrain ? clone(ALGO_DEFAULTS.terrain) : {};
              const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves']);
              const nextParams = { ...base, ...(preset?.params || {}) };
              preserved.forEach((key) => {
                if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
              });
              nextParams.preset = next;
              layer.params = { ...layer.params, ...nextParams };
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            if (layer.type === 'rings' && def.id === 'preset' && next === 'custom') {
              layer.params.preset = 'custom';
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            if (layer.type === 'rings' && def.id === 'preset' && next !== 'custom') {
              const preset = (RINGS_PRESET_LIBRARY || []).find((item) => item.id === next);
              const base = ALGO_DEFAULTS?.rings ? clone(ALGO_DEFAULTS.rings) : {};
              const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves', 'outerDiameter', 'centerDiameter']);
              const nextParams = { ...base, ...(preset?.params || {}) };
              preserved.forEach((key) => {
                if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
              });
              nextParams.preset = next;
              layer.params = { ...layer.params, ...nextParams };
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              return;
            }
            layer.params[def.id] = next;
            if (layer.type === 'wavetable' && def.id === 'lineStructure' && next === 'vertical') {
              layer.params.lineOffset = 135;
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
        const { min, max, step } = getDisplayConfig(def);
        const displayVal = toDisplayValue(def, val);
        div.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getDisplayLabel(def)}</label>
            ${infoBtn}
          </div>
          <div class="slider-row">
            <div class="sld-fx-wrap">
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${formatDisplayValue(def, val)}</button>
          </div>
          <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
        `;
        const input = div.querySelector('input[type="range"]');
        const valueBtn = div.querySelector('.value-chip');
        const valueInput = div.querySelector('.value-input');
        if (input) syncSliderFill(input);
        if (input && valueBtn && valueInput) {
          const confirmHeavy = (displayVal) => {
            const nextVal = fromDisplayValue(def, displayVal);
            if (Number.isFinite(def.confirmAbove) && nextVal >= def.confirmAbove) {
              const message = def.confirmMessage || 'This value may be slow. Continue?';
              if (!window.confirm(message)) {
                const resetVal = toDisplayValue(def, layer.params[def.id]);
                input.value = resetVal;
                syncSliderFill(input);
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                return null;
              }
            }
            return nextVal;
          };
          const resetToDefault = () => {
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = defaultVal;
            this.storeLayerParams(layer);
            input.value = toDisplayValue(def, defaultVal);
            syncSliderFill(input);
            valueBtn.innerText = formatDisplayValue(def, defaultVal);
            this.app.regen();
            this.updateFormula();
            maybeRebuildControls();
          };
          input.oninput = (e) => {
            syncSliderFill(e.target);
            const nextDisplay = parseFloat(e.target.value);
            valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
          };
          input.onchange = (e) => {
            triggerSliderMotion(e.target);
            const nextDisplay = parseFloat(e.target.value);
            const nextVal = confirmHeavy(nextDisplay);
            if (nextVal === null) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.id] = nextVal;
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
            maybeRebuildControls();
          };
          attachKeyboardRangeNudge(input, (nextDisplay) => {
            const nextVal = confirmHeavy(nextDisplay);
            if (nextVal === null) return;
            layer.params[def.id] = nextVal;
            syncSliderFill(input);
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
            maybeRebuildControls();
          });
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetToDefault();
          });
          attachValueEditor({
            def,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => layer.params[def.id],
            setValue: (displayVal, opts) => {
              const nextVal = confirmHeavy(displayVal);
              if (nextVal === null) return;
              const commit = opts?.commit !== false;
              if (commit && this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = nextVal;
              input.value = toDisplayValue(def, nextVal);
              syncSliderFill(input);
              this.storeLayerParams(layer);
              this.app.regen();
              valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
              this.updateFormula();
              maybeRebuildControls();
            },
          });
        }
      }
      const inlineTarget = def.inlineGroup ? getInlineGroup(def.inlineGroup) : target;
      if (def.inlineGroup) div.classList.add('control-inline-item');
      inlineTarget.appendChild(div);
    };

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
      const toOptimizationEditorDef = (def) => {
        if (!isDocumentLengthControl(def)) return def;
        const display = getOptimizationDisplayConfig(def);
        return {
          ...def,
          displayMin: display.min,
          displayMax: display.max,
          displayStep: display.step,
          displayUnit: display.unit,
          displayPrecision: display.precision,
        };
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
      previewSelect.value = SETTINGS.optimizationPreview || 'off';
      previewSelect.onchange = (e) => {
        SETTINGS.optimizationPreview = e.target.value;
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
      if ((SETTINGS.optimizationPreview || 'off') !== 'overlay') overlayStyleRow.classList.add('hidden');
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
          <div class="slider-row">
            <div class="sld-fx-wrap">
              <input type="range" min="0" max="6" step="1" value="${precisionValue}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${precisionValue}</button>
          </div>
        `;
        const precisionRange = precisionControl.querySelector('input[type="range"]');
        const precisionChip = precisionControl.querySelector('.value-chip');
        if (precisionRange) syncSliderFill(precisionRange);
        const applyPrecision = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(6, parseInt(raw, 10) || 3));
          SETTINGS.precision = next;
          if (precisionRange) {
            precisionRange.value = `${next}`;
            syncSliderFill(precisionRange);
          }
          if (precisionChip) precisionChip.textContent = `${next}`;
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        if (precisionRange) {
          precisionRange.oninput = (e) => applyPrecision(e.target.value);
          precisionRange.onchange = (e) => applyPrecision(e.target.value, { commit: true });
        }
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
          <div class="slider-row">
            <div class="sld-fx-wrap">
              <input type="range" min="${strokeConfig.min}" max="${strokeConfig.max}" step="${strokeConfig.step}" value="${strokeValueDisplay}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${strokeValueDisplay}${strokeConfig.unitLabel}</button>
          </div>
        `;
        const strokeRange = strokeControl.querySelector('input[type="range"]');
        const strokeChip = strokeControl.querySelector('.value-chip');
        if (strokeRange) syncSliderFill(strokeRange);
        const setStrokeSliderVisible = (visible) => {
          strokeControl.hidden = !visible;
          if (strokeRange) strokeRange.disabled = !visible;
        };
        setStrokeSliderVisible(strokeOverrideOn);
        const applyStroke = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.strokeWidth ?? 0.3 }));
          SETTINGS.strokeWidth = Number.isFinite(next) ? next : 0.3;
          this.app.engine.layers.forEach((layer) => {
            layer.strokeWidth = SETTINGS.strokeWidth;
          });
          const display = this.formatDocumentNumber(SETTINGS.strokeWidth, { precision: strokeConfig.precision });
          if (strokeRange) {
            strokeRange.value = display;
            syncSliderFill(strokeRange);
          }
          if (strokeChip) strokeChip.textContent = `${display}${strokeConfig.unitLabel}`;
          this.app.render();
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        if (strokeRange) {
          strokeRange.oninput = (e) => applyStroke(e.target.value);
          strokeRange.onchange = (e) => applyStroke(e.target.value, { commit: true });
        }
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
          <div class="slider-row">
            <div class="sld-fx-wrap">
              <input type="range" min="${toleranceConfig.min}" max="${toleranceConfig.max}" step="${toleranceConfig.step}" value="${toleranceDisplay}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${toleranceDisplay}${toleranceConfig.unitLabel}</button>
          </div>
        `;
        const tolRange = toleranceControl.querySelector('input[type="range"]');
        if (tolRange) syncSliderFill(tolRange);
        const tolNumber = toleranceControl.querySelector('input[type="number"]');
        const tolValue = toleranceControl.querySelector('.value-chip');
        const setToleranceVisible = (visible) => {
          toleranceControl.hidden = !visible;
          if (tolRange) tolRange.disabled = !visible;
          if (tolNumber) tolNumber.disabled = !visible;
        };
        const clampTolerance = (raw) => {
          const next = this.parseDocumentNumber(raw, { fallbackMm: 0.1 });
          if (!Number.isFinite(next)) return 0.1;
          return Math.max(0.01, Math.min(1, next));
        };
        const applyTolerance = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = clampTolerance(raw);
          const displayValue = this.formatDocumentNumber(next, { precision: toleranceConfig.precision });
          if (tolRange) {
            tolRange.value = displayValue;
            syncSliderFill(tolRange);
          }
          if (tolNumber) tolNumber.value = displayValue;
          if (tolValue) tolValue.textContent = `${displayValue}${toleranceConfig.unitLabel}`;
          SETTINGS.plotterOptimize = plotterToggle?.checked ? next : 0;
          if (toggleState) toggleState.textContent = SETTINGS.plotterOptimize > 0 ? 'ON' : 'OFF';
          rerenderOptimizationPreview();
        };
        if (plotterToggle) {
          plotterToggle.checked = SETTINGS.plotterOptimize > 0;
          setToleranceVisible(plotterToggle.checked);
          plotterToggle.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const enabled = Boolean(e.target.checked);
            setToleranceVisible(enabled);
            const rawTol = tolNumber?.value || tolRange?.value || 0.1;
            const clamped = clampTolerance(rawTol);
            SETTINGS.plotterOptimize = enabled ? clamped : 0;
            if (toggleState) toggleState.textContent = enabled ? 'ON' : 'OFF';
            rerenderOptimizationPreview();
          };
        }
        if (tolRange) {
          tolRange.oninput = (e) => applyTolerance(e.target.value);
          tolRange.onchange = (e) => applyTolerance(e.target.value, { commit: true });
        }
        if (tolNumber) {
          tolNumber.oninput = (e) => applyTolerance(e.target.value);
          tolNumber.onchange = (e) => applyTolerance(e.target.value, { commit: true });
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
        const { min, max, step } = getOptimizationDisplayConfig(def);
        const displayValue = toOptimizationDisplayValue(def, value);
        const editorDef = toOptimizationEditorDef(def);
        control.innerHTML = `
          <div class="flex items-center gap-2 mb-1">
            <label class="control-label mb-0">${getOptimizationLabel(def.label)}</label>
          </div>
          <div class="slider-row">
            <div class="sld-fx-wrap">
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayValue}" class="ctrl-slider">
            </div>
            <button type="button" class="value-chip">${formatOptValue(def, value)}</button>
          </div>
          <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
        `;
        const input = control.querySelector('input[type="range"]');
        const valueBtn = control.querySelector('.value-chip');
        const valueInput = control.querySelector('.value-input');
        if (input) syncSliderFill(input);
        if (input && valueBtn) {
          input.oninput = (e) => {
            syncSliderFill(e.target);
            const next = fromOptimizationDisplayValue(def, parseFloat(e.target.value));
            valueBtn.textContent = formatOptValue(def, next);
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
          };
          input.onchange = (e) => { triggerSliderMotion(e.target); };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaults = getStepDefaults(stepConfig.id);
            if (defaults[def.key] === undefined) return;
            const next = defaults[def.key];
            input.value = toOptimizationDisplayValue(def, next);
            syncSliderFill(input);
            valueBtn.textContent = formatOptValue(def, next);
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
          });
          attachValueEditor({
            def: editorDef,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => stepConfig[def.key],
            setValue: (displayVal, opts) => {
              input.value = displayVal;
              syncSliderFill(input);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = fromOptimizationDisplayValue(def, displayVal);
              });
            },
          });
        }
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
          <label class="sw-toggle" role="switch" aria-checked="${checked ? 'true' : 'false'}">
            <input type="checkbox" ${checked ? 'checked' : ''} />
            <span class="sw-track"></span>
            <span class="sw-thumb"></span>
          </label>
        `;
        const input = control.querySelector('input');
        const span = control.querySelector('span');
        if (input && span) {
          input.onchange = (e) => {
            const next = Boolean(e.target.checked);
            span.textContent = next ? 'ON' : 'OFF';
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const defaults = getStepDefaults(stepConfig.id);
            if (defaults[def.key] === undefined) return;
            const next = Boolean(defaults[def.key]);
            input.checked = next;
            span.textContent = next ? 'ON' : 'OFF';
            applyOptimization((cfg) => {
              const step = cfg.steps.find((s) => s.id === stepConfig.id);
              if (step) step[def.key] = next;
            });
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
            if (def.id === 'linesort' && next) {
              if (this.exportModalState?.isOpen) {
                if ((this.exportModalState.previewMode || 'off') === 'off') {
                  this.exportModalState.previewMode = 'overlay';
                  const previewSelect = this.exportModalState.root?.querySelector('#export-preview-mode');
                  if (previewSelect) previewSelect.value = 'overlay';
                }
                SETTINGS.optimizationPreview = this.exportModalState.previewMode;
              } else if ((SETTINGS.optimizationPreview || 'off') === 'off') {
                SETTINGS.optimizationPreview = 'overlay';
              }
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

    if (!isGroup) {
      let groupTarget = null;
      for (const def of algoDefs) {
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
        } else if (def.type === 'collapsibleGroupEnd') {
          groupTarget = null;
        } else {
          renderDef(def, groupTarget);
        }
      }
    }
    if (commonDefs.length) {
      container.appendChild(globalSection);
      commonDefs.forEach((def) => renderDef(def, globalBody));
    }
    const optimizationTarget = getEl('optimization-controls');
    if (optimizationTarget && this.exportModalState?.isOpen) {
      optimizationTarget.innerHTML = '';
      renderOptimizationPanel(optimizationTarget);
    }
    restoreLeftPanelScroll();
    if (this.exportModalState?.isOpen) {
      this.decorateExportControlsPanel();
      this.renderExportPreview();
    }
    } finally {
      restoreLeftPanelScroll();
    }
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
    installOn(proto) {
      proto.buildControls = function() { return buildControls.call(this); };
    },
  };
})();
