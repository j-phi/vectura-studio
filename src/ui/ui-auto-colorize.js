/**
 * Auto-colorization methods for the UI class.
 * Mixed into UI.prototype by ui.js.
 */
(() => {
  const { SETTINGS = {} } = window.Vectura || {};

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const getEl = (id, options = {}) => {
    const { silent = false } = options;
    const el = document.getElementById(id);
    if (!el && !silent) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const AUTO_COLOR_COMMON_PARAMS = [
    { id: 'penOffset', label: 'Pen Offset', type: 'range', min: -12, max: 12, step: 1 },
    { id: 'penStride', label: 'Pen Stride', type: 'range', min: 1, max: 8, step: 1 },
    { id: 'penMirror', label: 'Mirror Pen Order', type: 'checkbox' },
    { id: 'penJitter', label: 'Pen Jitter', type: 'range', min: 0, max: 1, step: 0.05 },
  ];

  const AUTO_COLOR_MODES = [
    {
      value: 'none',
      label: 'None (First Pen)',
      params: [],
    },
    {
      value: 'concentric',
      label: 'Concentric Rings',
      params: [
        { id: 'radiusStart', label: 'Inner Radius (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'radiusEnd', label: 'Outer Radius (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Width (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
        { id: 'bandGrowth', label: 'Band Growth', type: 'range', min: -1, max: 1, step: 0.05 },
      ],
    },
    {
      value: 'horizontal',
      label: 'Horizontal Bands',
      params: [
        { id: 'bandStart', label: 'Start Y (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandEnd', label: 'End Y (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Height (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
      ],
    },
    {
      value: 'vertical',
      label: 'Vertical Bands',
      params: [
        { id: 'bandStart', label: 'Start X (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandEnd', label: 'End X (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Width (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
      ],
    },
    {
      value: 'spiral',
      label: 'Spiral Sweep',
      params: [
        { id: 'angleOffset', label: 'Angle Offset (°)', type: 'range', min: -180, max: 180, step: 1 },
        { id: 'spiralTurns', label: 'Spiral Turns', type: 'range', min: 0.2, max: 4, step: 0.1 },
      ],
    },
    {
      value: 'angle',
      label: 'Angle Slice',
      params: [
        { id: 'angleOffset', label: 'Angle Offset (°)', type: 'range', min: -180, max: 180, step: 1 },
        { id: 'angleSpan', label: 'Angle Span (°)', type: 'range', min: 30, max: 360, step: 5 },
      ],
    },
    {
      value: 'size',
      label: 'Size-Based',
      params: [
        { id: 'sizeCurve', label: 'Size Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05 },
        { id: 'sizeInvert', label: 'Invert', type: 'checkbox' },
      ],
    },
    {
      value: 'random',
      label: 'Random (Seeded)',
      params: [{ id: 'randomSeed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1 }],
    },
    {
      value: 'order',
      label: 'Layer Order',
      params: [],
    },
    {
      value: 'reverse',
      label: 'Reverse Order',
      params: [],
    },
    {
      value: 'algorithm',
      label: 'Algorithm Type',
      params: [],
    },
  ].map((mode) => ({
    ...mode,
    params: [...(mode.params || []), ...AUTO_COLOR_COMMON_PARAMS],
  }));

  window.Vectura = window.Vectura || {};
  window.Vectura._UIAutoColorizeMixin = {
    getAutoColorizationConfig() {
      const fallback = {
        enabled: false,
        scope: 'all',
        mode: 'none',
        params: {
          penOffset: 0,
          penStride: 1,
          penMirror: false,
          penJitter: 0,
          radiusStart: 0,
          radiusEnd: 100,
          bandSize: 20,
          bandOffset: 0,
          bandGrowth: 0,
          bandStart: 0,
          bandEnd: 100,
          angleOffset: 0,
          angleSpan: 360,
          spiralTurns: 1,
          sizeCurve: 1,
          sizeInvert: false,
          randomSeed: 1,
        },
      };
      if (!SETTINGS.autoColorization || typeof SETTINGS.autoColorization !== 'object') {
        SETTINGS.autoColorization = {};
      }
      const config = SETTINGS.autoColorization;
      if (typeof config.enabled !== 'boolean') config.enabled = fallback.enabled;
      if (typeof config.scope !== 'string') config.scope = fallback.scope;
      if (typeof config.mode !== 'string') config.mode = fallback.mode;
      if (!config.params || typeof config.params !== 'object') config.params = {};
      Object.entries(fallback.params).forEach(([key, value]) => {
        if (config.params[key] === undefined) config.params[key] = value;
      });
      return config;
    },

    initAutoColorizationPanel() {
      const section = getEl('auto-colorization-section');
      const header = getEl('auto-colorization-header');
      const body = getEl('auto-colorization-body');
      const enabledToggle = getEl('auto-colorization-enabled');
      const scopeSelect = getEl('auto-colorization-scope');
      const modeSelect = getEl('auto-colorization-mode');
      const applyBtn = getEl('auto-colorization-apply');
      const paramsTarget = getEl('auto-colorization-params');
      const statusEl = getEl('auto-colorization-status');
      this.autoColorizationStatusEl = statusEl || null;
      if (!section || !header || !body || !enabledToggle || !scopeSelect || !modeSelect || !paramsTarget) return;

      const config = this.getAutoColorizationConfig();
      const modeValues = new Set(AUTO_COLOR_MODES.map((mode) => mode.value));
      if (!modeValues.has(config.mode)) config.mode = AUTO_COLOR_MODES[0].value;
      const setCollapsed = (next) => {
        SETTINGS.autoColorizationCollapsed = next;
        section.classList.toggle('collapsed', next);
        body.style.display = next ? 'none' : '';
        if (header) header.setAttribute('aria-expanded', next ? 'false' : 'true');
      };
      const initialCollapsed = SETTINGS.autoColorizationCollapsed !== false;
      setCollapsed(initialCollapsed);

      header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));

      modeSelect.innerHTML = AUTO_COLOR_MODES.map((mode) => `<option value="${mode.value}">${mode.label}</option>`).join('');

      enabledToggle.checked = Boolean(config.enabled);
      scopeSelect.value = config.scope || 'all';
      modeSelect.value = config.mode || AUTO_COLOR_MODES[0].value;

      const applyIfContinuous = (options = {}) => {
        if (!config.enabled) {
          if (this.autoColorizationStatusEl) this.autoColorizationStatusEl.textContent = 'Staged';
          return;
        }
        this.applyAutoColorization({ ...options, source: 'continuous' });
      };

      const renderParams = () => {
        paramsTarget.innerHTML = '';
        const mode = AUTO_COLOR_MODES.find((item) => item.value === config.mode) || AUTO_COLOR_MODES[0];
        if (!mode || !mode.params || !mode.params.length) {
          paramsTarget.innerHTML = '<p class="text-xs text-vectura-muted">No additional parameters.</p>';
          return;
        }
        mode.params.forEach((param) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'mb-3';
          if (param.type === 'checkbox') {
            wrapper.innerHTML = `
              <div class="flex items-center justify-between">
                <label class="control-label mb-0">${param.label}</label>
                <input type="checkbox" class="cursor-pointer" ${config.params[param.id] ? 'checked' : ''} />
              </div>
            `;
            const input = wrapper.querySelector('input');
            input.onchange = () => {
              config.params[param.id] = Boolean(input.checked);
              applyIfContinuous({ commit: true });
            };
          } else {
            const value = config.params[param.id] ?? param.min ?? 0;
            wrapper.innerHTML = `
              <div class="flex items-center justify-between mb-1">
                <label class="control-label mb-0">${param.label}</label>
                <span class="text-xs text-vectura-accent">${value}${param.unit || ''}</span>
              </div>
              <input
                type="range"
                min="${param.min}"
                max="${param.max}"
                step="${param.step ?? 1}"
                value="${value}"
                class="w-full"
              />
            `;
            const input = wrapper.querySelector('input');
            const display = wrapper.querySelector('span');
            input.oninput = () => {
              const next = parseFloat(input.value);
              config.params[param.id] = Number.isFinite(next) ? next : value;
              if (display) display.textContent = `${input.value}${param.unit || ''}`;
              applyIfContinuous({ commit: false });
            };
            input.onchange = () => {
              const next = parseFloat(input.value);
              config.params[param.id] = Number.isFinite(next) ? next : value;
              applyIfContinuous({ commit: true });
            };
          }
          paramsTarget.appendChild(wrapper);
        });
      };

      enabledToggle.onchange = () => {
        config.enabled = Boolean(enabledToggle.checked);
        if (config.enabled) {
          this.applyAutoColorization({ commit: true });
        } else if (this.autoColorizationStatusEl) {
          this.autoColorizationStatusEl.textContent = 'Staged';
        }
      };
      scopeSelect.onchange = () => {
        config.scope = scopeSelect.value;
        applyIfContinuous({ commit: true });
      };
      modeSelect.onchange = () => {
        config.mode = modeSelect.value;
        renderParams();
        applyIfContinuous({ commit: true });
      };
      if (applyBtn) {
        applyBtn.onclick = () => {
          this.applyAutoColorization({ commit: true, force: true, source: 'manual' });
        };
      }

      renderParams();
      if (config.enabled) {
        this.applyAutoColorization({ commit: false });
      } else if (this.autoColorizationStatusEl) {
        this.autoColorizationStatusEl.textContent = 'Staged';
      }
    },

    getAutoColorizationTargets(scope) {
      const layers = this.app.engine.layers || [];
      let targetIds = [];
      if (scope === 'active') {
        const active = this.app.engine.getActiveLayer ? this.app.engine.getActiveLayer() : null;
        if (active) targetIds = [active.id];
      } else if (scope === 'selected') {
        const selected = this.app.renderer?.getSelectedLayers?.() || [];
        if (selected.length) targetIds = selected.map((layer) => layer.id);
        else {
          const active = this.app.engine.getActiveLayer ? this.app.engine.getActiveLayer() : null;
          if (active) targetIds = [active.id];
        }
      } else {
        targetIds = layers.map((layer) => layer.id);
      }
      const targetSet = new Set(targetIds);
      const expanded = [];
      const seen = new Set();
      const childrenByParent = new Map();
      layers.forEach((layer) => {
        if (layer.parentId) {
          if (!childrenByParent.has(layer.parentId)) childrenByParent.set(layer.parentId, []);
          childrenByParent.get(layer.parentId).push(layer);
        }
      });
      const addLayer = (layer) => {
        if (!layer || seen.has(layer.id)) return;
        if (layer.isGroup) {
          const children = childrenByParent.get(layer.id) || [];
          children.forEach((child) => addLayer(child));
          return;
        }
        seen.add(layer.id);
        expanded.push(layer);
      };
      layers.forEach((layer) => {
        if (targetSet.has(layer.id)) addLayer(layer);
      });
      return expanded;
    },

    applyAutoColorization(options = {}) {
      const {
        commit = false,
        force = false,
        skipLayerRender = false,
        skipAppRender = false,
        source = 'auto',
      } = options;
      if (this.isApplyingAutoColorization) {
        this.pendingAutoColorizationOptions = {
          ...(this.pendingAutoColorizationOptions || {}),
          ...options,
          commit: Boolean(options.commit || this.pendingAutoColorizationOptions?.commit),
          force: Boolean(options.force || this.pendingAutoColorizationOptions?.force),
          skipLayerRender: Boolean(
            (this.pendingAutoColorizationOptions?.skipLayerRender ?? true) && (options.skipLayerRender ?? true)
          ),
          skipAppRender: Boolean((this.pendingAutoColorizationOptions?.skipAppRender ?? true) && (options.skipAppRender ?? true)),
        };
        if (this.autoColorizationStatusEl) {
          this.autoColorizationStatusEl.textContent = source === 'manual' ? 'Applying…' : 'Auto updating…';
        }
        return;
      }
      const config = this.getAutoColorizationConfig();
      if (!config.enabled && !force) return;
      const pens = SETTINGS.pens || [];
      if (!pens.length) return;
      const targets = this.getAutoColorizationTargets(config.scope);
      if (!targets.length) return;

      const renderer = this.app.renderer;
      const profile = this.app.engine.currentProfile;
      const center = { x: profile.width / 2, y: profile.height / 2 };
      const infos = targets.map((layer, index) => {
        const bounds = renderer?.getLayerBounds ? renderer.getLayerBounds(layer) : null;
        const c = bounds?.center || center;
        const dx = c.x - center.x;
        const dy = c.y - center.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const area = bounds ? Math.abs((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) : 0;
        return { layer, index, bounds, center: c, dist, angle, area };
      });
      const maxRadius = Math.min(profile.width, profile.height) / 2;
      const areas = infos.map((info) => info.area);
      const minArea = Math.min(...areas);
      const maxArea = Math.max(...areas);
      const areaSpan = Math.max(1e-6, maxArea - minArea);
      const mode = config.mode || 'none';
      const params = config.params || {};

      const hashString = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = (h << 5) - h + str.charCodeAt(i);
          h |= 0;
        }
        return Math.abs(h);
      };

      const typeIndex = new Map();
      let nextTypeIdx = 0;

      const assignIndex = (info, idx) => {
        const total = pens.length;
        const normalized = ((idx % total) + total) % total;
        const pen = pens[normalized] || pens[0];
        if (!pen) return;
        const layer = info.layer;
        layer.penId = pen.id;
        layer.color = pen.color;
        layer.strokeWidth = pen.width;
      };

      const penStride = Math.max(1, Math.round(params.penStride ?? 1));
      const penOffset = Math.round(params.penOffset ?? 0);
      const penMirror = params.penMirror === true;
      const penJitter = clamp(params.penJitter ?? 0, 0, 1);
      const jitterSeed = params.randomSeed ?? 0;
      const applyPenModifiers = (idx, info) => {
        const total = pens.length;
        if (!total) return 0;
        let next = idx * penStride + penOffset;
        if (penJitter > 0 && total > 1) {
          const h = hashString(`${info.layer.id}-${info.index}-${jitterSeed}`);
          const chance = (h % 1000) / 1000;
          if (chance < penJitter) {
            next += ((h >> 10) & 1) === 0 ? -1 : 1;
          }
        }
        if (penMirror && total > 1) {
          const span = total * 2 - 2;
          const wrapped = ((next % span) + span) % span;
          next = wrapped < total ? wrapped : span - wrapped;
        }
        return next;
      };

      const pctToRange = (value, maxValue, fallback) => {
        const raw = Number.isFinite(value) ? value : fallback;
        return (clamp(raw, 0, 100) / 100) * maxValue;
      };
      const radiusStart = pctToRange(params.radiusStart, maxRadius, 0);
      const radiusEnd = (() => {
        const end = pctToRange(params.radiusEnd, maxRadius, 100);
        return end > radiusStart ? end : maxRadius;
      })();
      const bandSize = Math.max(1, params.bandSize ?? 20);
      const bandOffset = params.bandOffset ?? 0;
      const bandGrowth = params.bandGrowth ?? 0;
      const bandSpan = mode === 'vertical' ? profile.width : profile.height;
      const bandStart = pctToRange(params.bandStart, bandSpan, 0);
      const bandEnd = (() => {
        const end = pctToRange(params.bandEnd, bandSpan, 100);
        return end > bandStart ? end : bandSpan;
      })();

      if (commit && this.app.pushHistory) this.app.pushHistory();

      if (this.autoColorizationStatusEl) {
        if (source === 'manual') {
          this.autoColorizationStatusEl.textContent = 'Applied';
        } else if (config.enabled) {
          this.autoColorizationStatusEl.textContent = 'Auto updating…';
        } else {
          this.autoColorizationStatusEl.textContent = '';
        }
      }

      this.isApplyingAutoColorization = true;
      try {
        let changed = false;
        infos.forEach((info) => {
          let idx = 0;
          switch (mode) {
            case 'none':
              idx = 0;
              break;
            case 'concentric': {
              const dist = Math.max(0, info.dist - radiusStart);
              const span = Math.max(1, radiusEnd - radiusStart);
              const t = Math.max(0, Math.min(1, dist / span));
              const growth = 1 + bandGrowth * (t - 0.5);
              const effectiveBand = Math.max(1, bandSize * growth);
              idx = Math.floor((dist + bandOffset) / effectiveBand);
              break;
            }
            case 'horizontal': {
              const pos = info.center.y;
              const span = Math.max(1, bandEnd - bandStart);
              const clamped = Math.max(0, Math.min(span, pos - bandStart + bandOffset));
              idx = Math.floor(clamped / Math.max(1, bandSize));
              break;
            }
            case 'vertical': {
              const pos = info.center.x;
              const span = Math.max(1, bandEnd - bandStart);
              const clamped = Math.max(0, Math.min(span, pos - bandStart + bandOffset));
              idx = Math.floor(clamped / Math.max(1, bandSize));
              break;
            }
            case 'spiral': {
              const turns = Math.max(0.2, params.spiralTurns ?? 1);
              const angle = info.angle + ((params.angleOffset ?? 0) * Math.PI) / 180;
              const t = (angle / (Math.PI * 2) + 0.5 + (info.dist / Math.max(1, maxRadius)) * turns) % 1;
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'angle': {
              const offset = params.angleOffset ?? 0;
              const span = Math.max(10, params.angleSpan ?? 360);
              const angleDeg = ((info.angle * 180) / Math.PI + 360 + offset) % 360;
              const t = Math.max(0, Math.min(1, angleDeg / span));
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'size': {
              const curve = Math.max(0.5, params.sizeCurve ?? 1);
              let t = (info.area - minArea) / areaSpan;
              t = Math.max(0, Math.min(1, Math.pow(t, curve)));
              if (params.sizeInvert) t = 1 - t;
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'random': {
              const seed = params.randomSeed ?? 0;
              const h = hashString(`${info.layer.id}-${seed}`);
              idx = h % pens.length;
              break;
            }
            case 'reverse':
              idx = pens.length - 1 - (info.index % pens.length);
              break;
            case 'algorithm': {
              if (!typeIndex.has(info.layer.type)) {
                typeIndex.set(info.layer.type, nextTypeIdx++);
              }
              idx = typeIndex.get(info.layer.type) % pens.length;
              break;
            }
            case 'order':
            default:
              idx = info.index % pens.length;
              break;
          }
          if (mode !== 'none') idx = applyPenModifiers(idx, info);
          const beforePen = info.layer.penId;
          const beforeColor = info.layer.color;
          const beforeWidth = info.layer.strokeWidth;
          assignIndex(info, idx);
          if (beforePen !== info.layer.penId || beforeColor !== info.layer.color || beforeWidth !== info.layer.strokeWidth) {
            changed = true;
          }
        });

        if (changed || force) {
          if (!skipLayerRender) this.renderLayers();
          if (!skipAppRender) this.app.render();
        }
      } finally {
        this.isApplyingAutoColorization = false;
      }

      if (this.pendingAutoColorizationOptions) {
        const nextOptions = this.pendingAutoColorizationOptions;
        this.pendingAutoColorizationOptions = null;
        this.applyAutoColorization(nextOptions);
      }
    },
  };
})();
