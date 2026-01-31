/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS } = window.Vectura || {};

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const CONTROL_DEFS = {
    flowfield: [
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.001, max: 0.1, step: 0.001 },
      { id: 'density', label: 'Density', type: 'range', min: 100, max: 5000, step: 100 },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 1, max: 20, step: 1 },
      { id: 'maxSteps', label: 'Max Steps', type: 'range', min: 10, max: 500, step: 10 },
      { id: 'force', label: 'Distortion Force', type: 'range', min: 0.1, max: 5.0, step: 0.1 },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 1.0, step: 0.1 },
      { id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 4, step: 1 },
    ],
    lissajous: [
      { id: 'freqX', label: 'Freq X', type: 'range', min: 1, max: 20, step: 0.1 },
      { id: 'freqY', label: 'Freq Y', type: 'range', min: 1, max: 20, step: 0.1 },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 0.01, step: 0.0001 },
      { id: 'phase', label: 'Phase', type: 'range', min: 0, max: 6.28, step: 0.1 },
      { id: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1 },
      { id: 'resolution', label: 'Resolution', type: 'range', min: 10, max: 200, step: 10 },
    ],
    wavetable: [
      { id: 'lines', label: 'Lines', type: 'range', min: 5, max: 100, step: 1 },
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 1, max: 100, step: 1 },
      { id: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.001, max: 0.1, step: 0.001 },
      { id: 'tilt', label: 'Tilt Y', type: 'range', min: -10, max: 10, step: 1 },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.1, max: 3.0, step: 0.1 },
      { id: 'freq', label: 'Frequency', type: 'range', min: 0.1, max: 5.0, step: 0.1 },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 50, step: 1 },
      { id: 'res', label: 'Resolution', type: 'range', min: 10, max: 200, step: 10 },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 50, step: 1 },
      { id: 'noiseAmp', label: 'Noise Amp', type: 'range', min: 0, max: 50, step: 1 },
      { id: 'noiseFreq', label: 'Noise Freq', type: 'range', min: 0.01, max: 1.0, step: 0.01 },
    ],
    grid: [
      { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 50, step: 1 },
      { id: 'cols', label: 'Cols', type: 'range', min: 2, max: 50, step: 1 },
      { id: 'distortion', label: 'Distortion', type: 'range', min: 0, max: 50, step: 1 },
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.01, max: 0.2, step: 0.01 },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 10, step: 0.1 },
    ],
    phylla: [
      { id: 'count', label: 'Count', type: 'range', min: 100, max: 2000, step: 100 },
      { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 10, step: 0.1 },
      { id: 'angleStr', label: 'Angle', type: 'range', min: 130, max: 140, step: 0.01 },
      { id: 'divergence', label: 'Divergence', type: 'range', min: 0.5, max: 2.0, step: 0.1 },
      { id: 'noiseInf', label: 'Noise Infl.', type: 'range', min: 0, max: 20, step: 1 },
    ],
    boids: [
      { id: 'count', label: 'Agents', type: 'range', min: 10, max: 300, step: 10 },
      { id: 'steps', label: 'Duration', type: 'range', min: 50, max: 500, step: 10 },
      { id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 5, step: 0.1 },
      { id: 'sepDist', label: 'Separation', type: 'range', min: 1, max: 50, step: 1 },
      { id: 'alignDist', label: 'Alignment', type: 'range', min: 1, max: 50, step: 1 },
      { id: 'cohDist', label: 'Cohesion', type: 'range', min: 1, max: 50, step: 1 },
      { id: 'force', label: 'Steer Force', type: 'range', min: 0.01, max: 0.2, step: 0.01 },
    ],
    attractor: [
      { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 20, step: 0.1 },
      { id: 'iter', label: 'Iterations', type: 'range', min: 100, max: 5000, step: 100 },
      { id: 'sigma', label: 'Sigma', type: 'range', min: 1, max: 50, step: 0.1 },
      { id: 'rho', label: 'Rho', type: 'range', min: 1, max: 100, step: 0.1 },
      { id: 'beta', label: 'Beta', type: 'range', min: 0.1, max: 10, step: 0.1 },
      { id: 'dt', label: 'Time Step', type: 'range', min: 0.001, max: 0.05, step: 0.001 },
    ],
    hyphae: [
      { id: 'sources', label: 'Sources', type: 'range', min: 1, max: 10, step: 1 },
      { id: 'steps', label: 'Growth Steps', type: 'range', min: 10, max: 200, step: 10 },
      { id: 'branchProb', label: 'Branch Prob', type: 'range', min: 0, max: 0.2, step: 0.01 },
      { id: 'angleVar', label: 'Wiggle', type: 'range', min: 0, max: 2.0, step: 0.1 },
      { id: 'segLen', label: 'Segment Len', type: 'range', min: 1, max: 10, step: 0.1 },
    ],
    circles: [
      { id: 'count', label: 'Max Count', type: 'range', min: 10, max: 1000, step: 10 },
      { id: 'minR', label: 'Min Radius', type: 'range', min: 0.5, max: 10, step: 0.5 },
      { id: 'maxR', label: 'Max Radius', type: 'range', min: 2, max: 50, step: 1 },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5 },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 50, max: 5000, step: 50 },
    ],
    cityscape: [
      { id: 'rows', label: 'Rows', type: 'range', min: 1, max: 5, step: 1 },
      { id: 'minW', label: 'Min Width', type: 'range', min: 5, max: 50, step: 1 },
      { id: 'maxW', label: 'Max Width', type: 'range', min: 10, max: 100, step: 1 },
      { id: 'minH', label: 'Min Height', type: 'range', min: 5, max: 100, step: 1 },
      { id: 'maxH', label: 'Max Height', type: 'range', min: 10, max: 150, step: 1 },
      { id: 'windowProb', label: 'Window Prob', type: 'range', min: 0, max: 1, step: 0.05 },
      { id: 'detail', label: 'Roof Detail', type: 'range', min: 0, max: 1, step: 0.05 },
    ],
  };

  class UI {
    constructor(app) {
      this.app = app;
      this.controls = CONTROL_DEFS;

      this.initModuleDropdown();
      this.bindGlobal();
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.initSettingsValues();
    }

    initModuleDropdown() {
      const select = getEl('generator-module');
      if (!select) return;
      select.innerHTML = '';
      Object.keys(ALGO_DEFAULTS).forEach((key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = key.charAt(0).toUpperCase() + key.slice(1);
        select.appendChild(opt);
      });
    }

    initSettingsValues() {
      const margin = getEl('set-margin');
      const speedDown = getEl('set-speed-down');
      const speedUp = getEl('set-speed-up');
      const stroke = getEl('set-stroke');
      const precision = getEl('set-precision');
      const bgColor = getEl('inp-bg-color');
      if (margin) margin.value = SETTINGS.margin;
      if (speedDown) speedDown.value = SETTINGS.speedDown;
      if (speedUp) speedUp.value = SETTINGS.speedUp;
      if (stroke) stroke.value = SETTINGS.strokeWidth;
      if (precision) precision.value = SETTINGS.precision;
      if (bgColor) bgColor.value = SETTINGS.bgColor;
    }

    bindGlobal() {
      const addLayer = getEl('btn-add-layer');
      const moduleSelect = getEl('generator-module');
      const bgColor = getEl('inp-bg-color');
      const settingsPanel = getEl('settings-panel');
      const btnSettings = getEl('btn-settings');
      const btnCloseSettings = getEl('btn-close-settings');
      const machineProfile = getEl('machine-profile');
      const setMargin = getEl('set-margin');
      const setSpeedDown = getEl('set-speed-down');
      const setSpeedUp = getEl('set-speed-up');
      const setStroke = getEl('set-stroke');
      const btnExport = getEl('btn-export');
      const btnResetView = getEl('btn-reset-view');

      if (addLayer && moduleSelect) {
        addLayer.onclick = () => {
          const t = moduleSelect.value;
          this.app.engine.addLayer(t);
          this.renderLayers();
          this.app.render();
        };
      }

      if (moduleSelect) {
        moduleSelect.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            l.type = e.target.value;
            l.params = JSON.parse(JSON.stringify(ALGO_DEFAULTS[l.type]));
            const seed = getEl('inp-seed');
            const posX = getEl('inp-pos-x');
            const posY = getEl('inp-pos-y');
            const scaleX = getEl('inp-scale-x');
            const scaleY = getEl('inp-scale-y');
            l.params.seed = parseInt(seed?.value, 10) || Math.floor(Math.random() * 999);
            l.params.posX = parseFloat(posX?.value) || 0;
            l.params.posY = parseFloat(posY?.value) || 0;
            l.params.scaleX = parseFloat(scaleX?.value) || 1;
            l.params.scaleY = parseFloat(scaleY?.value) || 1;
            this.buildControls();
            this.app.regen();
          }
        };
      }

      if (bgColor) {
        bgColor.oninput = (e) => {
          SETTINGS.bgColor = e.target.value;
          this.app.render();
        };
      }

      if (btnSettings && settingsPanel) {
        btnSettings.onclick = () => settingsPanel.classList.toggle('open');
      }
      if (btnCloseSettings && settingsPanel) {
        btnCloseSettings.onclick = () => settingsPanel.classList.remove('open');
      }

      if (machineProfile) {
        machineProfile.onchange = (e) => {
          this.app.engine.setProfile(e.target.value);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setMargin) {
        setMargin.onchange = (e) => {
          SETTINGS.margin = parseInt(e.target.value, 10);
          this.app.regen();
        };
      }
      if (setSpeedDown) {
        setSpeedDown.onchange = (e) => {
          SETTINGS.speedDown = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setSpeedUp) {
        setSpeedUp.onchange = (e) => {
          SETTINGS.speedUp = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setStroke) {
        setStroke.onchange = (e) => {
          SETTINGS.strokeWidth = parseFloat(e.target.value);
          this.app.render();
        };
      }

      if (btnExport) {
        btnExport.onclick = () => this.exportSVG();
      }
      if (btnResetView) {
        btnResetView.onclick = () => this.app.renderer.center();
      }

      const bindTrans = (id, key) => {
        const el = getEl(id);
        if (!el) return;
        el.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            l.params[key] = parseFloat(e.target.value);
            this.app.regen();
          }
        };
      };
      bindTrans('inp-seed', 'seed');
      bindTrans('inp-pos-x', 'posX');
      bindTrans('inp-pos-y', 'posY');
      bindTrans('inp-scale-x', 'scaleX');
      bindTrans('inp-scale-y', 'scaleY');

      const randSeed = getEl('btn-rand-seed');
      if (randSeed) {
        randSeed.onclick = () => {
          const l = this.app.engine.getActiveLayer();
          const seedInput = getEl('inp-seed');
          if (l) {
            l.params.seed = Math.floor(Math.random() * 99999);
            if (seedInput) seedInput.value = l.params.seed;
            this.app.regen();
            this.updateFormula();
          }
        };
      }
    }

    renderLayers() {
      const container = getEl('layer-list');
      if (!container) return;
      container.innerHTML = '';
      this.app.engine.layers
        .slice()
        .reverse()
        .forEach((l) => {
          const el = document.createElement('div');
          const isActive = l.id === this.app.engine.activeLayerId;
          el.className = `flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2 group cursor-pointer hover:bg-vectura-border ${
            isActive ? 'active' : ''
          }`;
          el.innerHTML = `
            <div class="flex items-center gap-2 flex-1 overflow-hidden">
              <input type="checkbox" ${l.visible ? 'checked' : ''} class="cursor-pointer" aria-label="Toggle layer visibility">
              <span class="text-xs truncate ${isActive ? 'text-white font-bold' : 'text-vectura-muted'}">${l.name}</span>
            </div>
            <div class="flex items-center gap-1">
              <button class="text-[10px] text-vectura-muted hover:text-white px-1 btn-up" aria-label="Move layer up">▲</button>
              <button class="text-[10px] text-vectura-muted hover:text-white px-1 btn-down" aria-label="Move layer down">▼</button>
              <div class="relative w-3 h-3 overflow-hidden rounded-full border border-vectura-border ml-1">
                <input type="color" value="${l.color}" class="color-picker" aria-label="Layer color">
              </div>
              <button class="text-xs text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete layer">✕</button>
            </div>
          `;
          const nameEl = el.querySelector('span');
          const visibilityEl = el.querySelector('input[type=checkbox]');
          const colorEl = el.querySelector('.color-picker');
          const delBtn = el.querySelector('.btn-del');
          const upBtn = el.querySelector('.btn-up');
          const downBtn = el.querySelector('.btn-down');

          if (nameEl) {
            nameEl.onclick = () => {
              this.app.engine.activeLayerId = l.id;
              this.renderLayers();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (visibilityEl) {
            visibilityEl.onchange = (e) => {
              l.visible = e.target.checked;
              this.app.render();
              this.app.updateStats();
            };
          }
          if (colorEl) {
            colorEl.oninput = (e) => {
              l.color = e.target.value;
              this.app.render();
            };
          }
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.removeLayer(l.id);
              this.renderLayers();
              this.app.render();
            };
          }
          if (upBtn) {
            upBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.moveLayer(l.id, 1);
              this.renderLayers();
              this.app.render();
            };
          }
          if (downBtn) {
            downBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.moveLayer(l.id, -1);
              this.renderLayers();
              this.app.render();
            };
          }
          container.appendChild(el);
        });
    }

    buildControls() {
      const container = getEl('dynamic-controls');
      if (!container) return;
      container.innerHTML = '';
      const layer = this.app.engine.getActiveLayer();
      if (!layer) return;

      const moduleSelect = getEl('generator-module');
      const seed = getEl('inp-seed');
      const posX = getEl('inp-pos-x');
      const posY = getEl('inp-pos-y');
      const scaleX = getEl('inp-scale-x');
      const scaleY = getEl('inp-scale-y');
      if (moduleSelect) moduleSelect.value = layer.type;
      if (seed) seed.value = layer.params.seed;
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;

      const desc = getEl('algo-desc');
      if (desc) desc.innerText = DESCRIPTIONS[layer.type] || 'No description available.';

      const defs = this.controls[layer.type];
      if (!defs) return;

      defs.forEach((def) => {
        const val = layer.params[def.id];
        const div = document.createElement('div');
        div.className = 'mb-4';
        div.innerHTML = `
          <div class="flex justify-between mb-1">
            <label class="control-label mb-0">${def.label}</label>
            <span class="text-xs text-vectura-accent font-mono">${val}</span>
          </div>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" class="w-full">
        `;
        const input = div.querySelector('input');
        const span = div.querySelector('span');
        if (input && span) {
          input.oninput = (e) => (span.innerText = e.target.value);
          input.onchange = (e) => {
            layer.params[def.id] = parseFloat(e.target.value);
            this.app.regen();
            this.updateFormula();
          };
        }
        container.appendChild(div);
      });
    }

    updateFormula() {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
      const formula = getEl('formula-display');
      const seedDisplay = getEl('formula-seed-display');
      if (formula) formula.innerText = this.app.engine.getFormula(l.id);
      if (seedDisplay) seedDisplay.innerText = `Seed: ${l.params.seed}`;
    }

    exportSVG() {
      const prof = this.app.engine.currentProfile;
      let svg = `<?xml version="1.0" standalone="no"?><svg width="${prof.width}mm" height="${prof.height}mm" viewBox="0 0 ${prof.width} ${prof.height}" xmlns="http://www.w3.org/2000/svg">`;
      this.app.engine.layers.forEach((l) => {
        if (!l.visible) return;
        svg += `<g id="${l.name.replace(/\s/g, '_')}" stroke="black" stroke-width="0.3" fill="none">`;
        l.paths.forEach((p) => {
          if (p.length < 2) return;
          svg += `<path d="M ${p.map((pt) => `${pt.x.toFixed(3)} ${pt.y.toFixed(3)}`).join(' L ')}" />`;
        });
        svg += `</g>`;
      });
      svg += `</svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vectura.svg';
      a.click();
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.UI = UI;
})();
