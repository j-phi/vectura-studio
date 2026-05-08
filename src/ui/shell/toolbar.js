/**
 * Vectura toolbar (Phase 2 step 3 seventh extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.Toolbar — initToolBar() (the full 500-line
 * toolbar initialization: tool buttons, subtool menus, algo-draw picker,
 * renderer callbacks) and updateLightSourceTool() (petalis light-source
 * button visibility).
 *
 * initToolBar assigns methods to `this` (the UI instance): setActiveTool,
 * setShapeMode, setScissorMode, setSelectionMode, setPenMode,
 * cycleToolSubmode. These are called from bindShortcuts and elsewhere via
 * the UI instance — the .call(this) delegation preserves the same behavior.
 *
 * DI bag: { getEl, isPetalisLayerType }. SETTINGS from window.Vectura at
 * call time.
 *
 * Compile gate at tests/unit/toolbar-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Toolbar.${name} invoked before Toolbar.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function updateLightSourceTool() {
    const { getEl, isPetalisLayerType } = requireDeps('updateLightSourceTool');
    const btn = getEl('btn-light-source');
    if (!btn) return;
    const activeLayer = this.app?.engine?.getActiveLayer?.();
    const show = isPetalisLayerType(activeLayer?.type);
    btn.classList.toggle('hidden', !show);
  }

  function initToolBar() {
    const { getEl } = requireDeps('initToolBar');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const toolbar = getEl('tool-bar');
    if (!toolbar) return;
    toolbar.innerHTML = this.createMainToolbarMarkup();
    const toolButtons = Array.from(toolbar.querySelectorAll('.tool-btn[data-tool]'));
    const scissorButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-scissor]'));
    const selectButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-select]'));
    const penButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-pen]'));
    const fillButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-fill]'));
    const shapeButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-shape]'));
    const scissorButton = toolbar.querySelector('.tool-btn[data-tool="scissor"]');
    const scissorMenu = toolbar.querySelector('.tool-submenu[aria-label="Scissor subtools"]');
    const selectButton = toolbar.querySelector('.tool-btn[data-tool="select"]');
    const selectMenu = toolbar.querySelector('.tool-submenu[data-menu="select"]');
    const penButton = toolbar.querySelector('.tool-btn[data-tool="pen"]');
    const penMenu = toolbar.querySelector('.tool-submenu[data-menu="pen"]');
    const fillButton = toolbar.querySelector('.tool-btn[data-tool="fill"]');
    const fillMenu = toolbar.querySelector('.tool-submenu[aria-label="Fill subtools"]');
    const shapeButton = toolbar.querySelector('.tool-btn[data-tool="shape"]');
    const shapeMenu = toolbar.querySelector('.tool-submenu[data-menu="shape"]');
    const lightSourceBtn = getEl('btn-light-source');
    const selectionModes = selectButtons.map((btn) => btn.dataset.select).filter(Boolean);
    const scissorModes = scissorButtons.map((btn) => btn.dataset.scissor).filter(Boolean);
    const penModes = penButtons.map((btn) => btn.dataset.pen).filter(Boolean);
    const shapeToolFromMode = (mode) => `shape-${mode}`;

    const updateToolIcon = (tool, mode) => {
      const button = toolbar.querySelector(`.tool-btn[data-tool="${tool}"]`);
      const icon = button?.querySelector('.tool-icon');
      let sourceBtn = null;
      if (tool === 'select') {
        sourceBtn = selectButtons.find((btn) => btn.dataset.select === mode);
      } else if (tool === 'scissor') {
        sourceBtn = scissorButtons.find((btn) => btn.dataset.scissor === mode);
      } else if (tool === 'pen') {
        sourceBtn = penButtons.find((btn) => btn.dataset.pen === mode);
      } else if (tool === 'shape') {
        sourceBtn = shapeButtons.find((btn) => btn.dataset.shape === mode);
      }
      const sourceSvg = sourceBtn?.querySelector('svg');
      if (!icon || !sourceSvg) return;
      icon.innerHTML = sourceSvg.innerHTML;
      icon.setAttribute('viewBox', sourceSvg.getAttribute('viewBox') || '0 0 24 24');
    };

    const syncButtons = () => {
      const fillActive = ['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'].includes(this.activeTool);
      const shapeActive = `${this.activeTool}`.startsWith('shape-');
      toolButtons.forEach((btn) => {
        if (btn.dataset.tool === 'fill') {
          btn.classList.toggle('active', fillActive);
          btn.setAttribute('aria-pressed', fillActive ? 'true' : 'false');
        } else if (btn.dataset.tool === 'shape') {
          btn.classList.toggle('active', shapeActive);
          btn.setAttribute('aria-pressed', shapeActive ? 'true' : 'false');
        } else {
          btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
          btn.setAttribute('aria-pressed', btn.dataset.tool === this.activeTool ? 'true' : 'false');
        }
      });
      scissorButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.scissor === this.scissorMode);
      });
      selectButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.select === this.selectionMode);
      });
      penButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.pen === this.penMode);
      });
      fillButtons.forEach((btn) => {
        const v = btn.dataset.fill;
        btn.classList.toggle('active',
          (v === 'erase'         && this.activeTool === 'fill-erase') ||
          (v === 'pattern'       && this.activeTool === 'fill-pattern') ||
          (v === 'pattern-erase' && this.activeTool === 'fill-pattern-erase')
        );
      });
      shapeButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.shape === this.shapeMode && shapeActive);
      });
    };

    this.setActiveTool = (tool, options = {}) => {
      if (!tool) return;
      const { temporary = false } = options;
      const prevTool = this.activeTool;
      this.activeTool = tool;
      if (!temporary) {
        SETTINGS.activeTool = tool;
        this.previousTool = tool;
      }
      if (`${tool}`.startsWith('shape-')) {
        const mode = tool.slice('shape-'.length);
        this.shapeMode = mode;
        if (!temporary) SETTINGS.shapeMode = mode;
        updateToolIcon('shape', mode);
      }
      if (this.app.renderer?.setTool) this.app.renderer.setTool(tool);
      syncButtons();
      const isPatternFillTool = (t) => t === 'fill-pattern' || t === 'fill-pattern-erase';
      if (isPatternFillTool(tool) || isPatternFillTool(prevTool)) {
        this.buildControls?.();
      }
    };

    this.setShapeMode = (mode) => {
      if (!mode) return;
      this.shapeMode = mode;
      SETTINGS.shapeMode = mode;
      updateToolIcon('shape', mode);
      syncButtons();
    };

    this.setScissorMode = (mode) => {
      if (!mode) return;
      this.scissorMode = mode;
      SETTINGS.scissorMode = mode;
      if (this.app.renderer?.setScissorMode) this.app.renderer.setScissorMode(mode);
      updateToolIcon('scissor', this.scissorMode);
      syncButtons();
    };

    this.setSelectionMode = (mode) => {
      if (!mode) return;
      this.selectionMode = mode;
      SETTINGS.selectionMode = mode;
      if (this.app.renderer?.setSelectionMode) this.app.renderer.setSelectionMode(mode);
      updateToolIcon('select', this.selectionMode);
      syncButtons();
    };

    this.setPenMode = (mode) => {
      if (!mode) return;
      this.penMode = mode;
      SETTINGS.penMode = mode;
      if (this.app.renderer?.setPenMode) this.app.renderer.setPenMode(mode);
      updateToolIcon('pen', this.penMode);
      syncButtons();
    };

    const cycleMode = (current, modes) => {
      if (!modes.length) return current;
      const idx = modes.indexOf(current);
      const nextIndex = idx === -1 ? 0 : (idx + 1) % modes.length;
      return modes[nextIndex];
    };

    this.cycleToolSubmode = (tool) => {
      if (tool === 'select') {
        const next = cycleMode(this.selectionMode, selectionModes);
        this.setSelectionMode(next);
        this.setActiveTool('select');
        return;
      }
      if (tool === 'scissor') {
        const next = cycleMode(this.scissorMode, scissorModes);
        this.setScissorMode(next);
        this.setActiveTool('scissor');
        return;
      }
      if (tool === 'pen') {
        const next = cycleMode(this.penMode, penModes);
        this.setPenMode(next);
        this.setActiveTool('pen');
      }
    };

    toolButtons.forEach((btn) => {
      if (btn.dataset.tool === 'scissor') return;
      if (btn.dataset.tool === 'shape') return;
      btn.onclick = () => {
        const tool = btn.dataset.tool;
        this.setActiveTool(tool);
      };
    });
    scissorButtons.forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.scissor;
        this.setActiveTool('scissor');
        this.setScissorMode(mode);
      };
    });
    selectButtons.forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.select;
        this.setActiveTool('select');
        this.setSelectionMode(mode);
      };
    });
    penButtons.forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.pen;
        this.setActiveTool('pen');
        this.setPenMode(mode);
      };
    });
    shapeButtons.forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.shape;
        this.setActiveTool(shapeToolFromMode(mode));
      };
    });

    const initSubtoolMenu = (config) => {
      const { button, menu, buttons, onActivate, onSelect } = config;
      if (!button || !menu) return;
      let holdTimer = null;
      let menuOpen = false;
      let hoverBtn = null;

      const setHover = (btn) => {
        if (hoverBtn === btn) return;
        hoverBtn = btn || null;
        buttons.forEach((sub) => sub.classList.toggle('hover', sub === hoverBtn));
      };
      const openMenu = (e) => {
        menuOpen = true;
        menu.classList.add('open');
        setHover(null);
        if (e) {
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
          setHover(btn);
        }
      };
      const closeMenu = () => {
        menuOpen = false;
        menu.classList.remove('open');
        setHover(null);
      };

      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (holdTimer) window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          holdTimer = null;
          openMenu(e);
        }, 280);
      });

      document.addEventListener('pointermove', (e) => {
        if (!menuOpen) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
        setHover(btn);
      });

      document.addEventListener('pointerup', (e) => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
          if (onActivate) onActivate();
          return;
        }
        if (!menuOpen) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
        if (btn && onSelect) onSelect(btn);
        closeMenu();
      });

      document.addEventListener('pointerdown', (e) => {
        if (!menuOpen) return;
        if (menu.contains(e.target) || button.contains(e.target)) return;
        closeMenu();
      });
    };

    initSubtoolMenu({
      button: scissorButton,
      menu: scissorMenu,
      buttons: scissorButtons,
      onActivate: () => this.setActiveTool('scissor'),
      onSelect: (btn) => {
        const mode = btn.dataset.scissor;
        this.setActiveTool('scissor');
        this.setScissorMode(mode);
      },
    });

    initSubtoolMenu({
      button: penButton,
      menu: penMenu,
      buttons: penButtons,
      onActivate: () => this.setActiveTool('pen'),
      onSelect: (btn) => {
        const mode = btn.dataset.pen;
        this.setActiveTool('pen');
        this.setPenMode(mode);
      },
    });

    initSubtoolMenu({
      button: selectButton,
      menu: selectMenu,
      buttons: selectButtons,
      onActivate: () => this.setActiveTool('select'),
      onSelect: (btn) => {
        const mode = btn.dataset.select;
        this.setActiveTool('select');
        this.setSelectionMode(mode);
      },
    });

    initSubtoolMenu({
      button: fillButton,
      menu: fillMenu,
      buttons: fillButtons,
      onActivate: () => this.setActiveTool('fill'),
      onSelect: (btn) => {
        if (btn.dataset.fill === 'erase')         this.setActiveTool('fill-erase');
        else if (btn.dataset.fill === 'pattern')       this.setActiveTool('fill-pattern');
        else if (btn.dataset.fill === 'pattern-erase') this.setActiveTool('fill-pattern-erase');
      },
    });

    initSubtoolMenu({
      button: shapeButton,
      menu: shapeMenu,
      buttons: shapeButtons,
      onActivate: () => this.setActiveTool(shapeToolFromMode(this.shapeMode)),
      onSelect: (btn) => {
        const mode = btn.dataset.shape;
        this.setActiveTool(shapeToolFromMode(mode));
      },
    });

    if (lightSourceBtn) {
      lightSourceBtn.onclick = () => this.startLightSourcePlacement();
    }

    this.setActiveTool(this.activeTool);
    this.setScissorMode(this.scissorMode);
    this.setSelectionMode(this.selectionMode);
    this.setPenMode(this.penMode);
    this.setShapeMode(this.shapeMode);
    syncButtons();

    if (this.app.renderer) {
      this.app.renderer.onPenComplete = (payload) => this.createManualLayerFromPath(payload);
      this.app.renderer.onShapeComplete = (payload) => this.createManualLayerFromPath(payload);
      this.app.renderer.onScissor = (payload) => this.applyScissor(payload);
      this.app.renderer.onClearTransientModifiers = () => {
        const mods = (window.Vectura.SETTINGS || {}).touchModifiers;
        if (!mods) return;
        mods.shift = false;
        mods.alt = false;
        mods.meta = false;
        this.refreshTouchModifierButtons?.();
      };
      this.app.renderer.onAlgoDrawComplete = ({ algoType, rect }) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const id = this.app.engine.addLayer(algoType);
        const layer = this.getLayerById?.(id);
        if (layer && rect.w > 10 && rect.h > 10) {
          const bounds = this.app.renderer.getLayerBounds(layer);
          const lw = bounds ? bounds.maxX - bounds.minX : 0;
          const lh = bounds ? bounds.maxY - bounds.minY : 0;
          if (bounds && lw > 0 && lh > 0) {
            const oldScaleX = layer.params.scaleX ?? 1;
            const oldScaleY = layer.params.scaleY ?? 1;
            const newScaleX = oldScaleX * rect.w / lw;
            const newScaleY = oldScaleY * rect.h / lh;
            const cLocalX = (bounds.minX + bounds.maxX) / 2;
            const cLocalY = (bounds.minY + bounds.maxY) / 2;
            layer.params.scaleX = newScaleX;
            layer.params.scaleY = newScaleY;
            layer.params.posX = (rect.x + rect.w / 2) - bounds.origin.x - cLocalX * rect.w / lw;
            layer.params.posY = (rect.y + rect.h / 2) - bounds.origin.y - cLocalY * rect.h / lh;
            this.app.engine.generate(id);
          }
        }
        if (layer) this.rememberDrawableLayerType?.(layer);
        if (this.app.renderer) this.app.renderer.setSelection([id], id);
        this.renderLayers();
        this.app.render();
        this.setActiveTool?.('select');
      };
      this.app.renderer.onDirectEditStart = () => {
        if (this.app.pushHistory) this.app.pushHistory();
      };
      this.app.renderer.onDirectEditCommit = () => {
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      };
    }

    // ── algo-draw press-and-hold picker ─────────────────────────
    const algoDrawBtn = toolbar.querySelector('.tool-btn[data-tool="algo-draw"]');
    if (algoDrawBtn) {
      algoDrawBtn.setAttribute('data-has-submenu', 'true');
      const _ALGO_PICK_LIST = [
        { type: 'attractor',       label: 'Attractor' },
        { type: 'boids',           label: 'Boids' },
        { type: 'flowfield',       label: 'Flowfield' },
        { type: 'grid',            label: 'Grid' },
        { type: 'harmonograph',    label: 'Harmonograph' },
        { type: 'hyphae',          label: 'Hyphae' },
        { type: 'lissajous',       label: 'Lissajous' },
        { type: 'pattern',         label: 'Pattern' },
        { type: 'petalisDesigner', label: 'Petalis Designer' },
        { type: 'phylla',          label: 'Phylla' },
        { type: 'rainfall',        label: 'Rainfall' },
        { type: 'rings',           label: 'Rings' },
        { type: 'shapePack',       label: 'Shapepack' },
        { type: 'spiral',          label: 'Spiral' },
        { type: 'svgDistort',      label: 'SVG Import' },
        { type: 'terrain',         label: 'Terrain' },
        { type: 'topo',            label: 'Topo' },
        { type: 'wavetable',       label: 'Wavetable' },
      ];
      let _algoPickerTimer = null;
      const _buildAlgoPickerPopup = () => {
        let el = document.getElementById('algo-draw-picker');
        if (!el) {
          el = document.createElement('div');
          el.id = 'algo-draw-picker';
          el.className = 'algo-draw-picker hidden';
          el.innerHTML = _ALGO_PICK_LIST.map(({ type, label }) =>
            `<div class="algo-pick-item" data-algo-type="${type}">` +
            `<span class="lvl-algo-sub-ico" style="color:${this._algoMenuColor?.(type) ?? 'currentColor'}">${(this._LVL_I?.[type] ?? this._LVL_I?.grid)?.() ?? ''}</span>${label}</div>`
          ).join('');
          this._refreshAlgoPickerColors = () => {
            el.querySelectorAll('.algo-pick-item').forEach((item) => {
              const type = item.getAttribute('data-algo-type');
              const ico = item.querySelector('.lvl-algo-sub-ico');
              if (type && ico) ico.style.color = this._algoMenuColor?.(type) ?? 'currentColor';
            });
          };
          el.addEventListener('click', (ev) => {
            const picked = ev.target.closest('.algo-pick-item');
            if (!picked) return;
            const t = picked.dataset.algoType;
            if (this.app.renderer) this.app.renderer.algoDraftType = t;
            updateAlgoDrawIcon(t);
            algoDrawBtn.title = `Draw Algorithm: ${t}`;
            el.classList.add('hidden');
            this.setActiveTool?.('algo-draw');
          });
          document.addEventListener('click', (ev) => {
            if (!el.classList.contains('hidden') && !el.contains(ev.target) && ev.target !== algoDrawBtn) {
              el.classList.add('hidden');
            }
          }, true);
          document.body.appendChild(el);
        }
        return el;
      };
      const updateAlgoDrawIcon = (type) => {
        const icon = algoDrawBtn.querySelector('.tool-icon');
        if (!icon) return;
        const srcStr = (this._LVL_I?.[type] ?? this._LVL_I?.wavetable)?.();
        if (!srcStr) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = srcStr;
        const srcSvg = tmp.querySelector('svg');
        if (!srcSvg) return;
        icon.innerHTML = srcSvg.innerHTML;
        for (const attr of ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
          const v = srcSvg.getAttribute(attr);
          if (v) icon.setAttribute(attr, v);
        }
      };
      algoDrawBtn.addEventListener('pointerdown', (e) => {
        algoDrawBtn.setPointerCapture?.(e.pointerId);
        _algoPickerTimer = setTimeout(() => {
          const popup = _buildAlgoPickerPopup();
          const r = algoDrawBtn.getBoundingClientRect();
          popup.style.left = `${r.right + 6}px`;
          popup.style.top = `${r.top}px`;
          popup.classList.remove('hidden');
        }, 400);
      });
      algoDrawBtn.addEventListener('pointerup', (e) => {
        clearTimeout(_algoPickerTimer);
        const popup = document.getElementById('algo-draw-picker');
        if (popup && !popup.classList.contains('hidden')) {
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          const picked = hit?.closest('.algo-pick-item');
          if (picked) {
            const t = picked.dataset.algoType;
            if (this.app.renderer) this.app.renderer.algoDraftType = t;
            updateAlgoDrawIcon(t);
            algoDrawBtn.title = `Draw Algorithm: ${t}`;
            popup.classList.add('hidden');
            this.setActiveTool?.('algo-draw');
          }
        }
      });
      algoDrawBtn.addEventListener('pointercancel', () => clearTimeout(_algoPickerTimer));
      updateAlgoDrawIcon('wavetable');
    }
  }

  UI.Toolbar = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    updateLightSourceTool,
    initToolBar,
  };
})();
