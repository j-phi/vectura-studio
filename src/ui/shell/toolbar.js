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
    fillButtons.forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.fill;
        if (mode === 'erase')           this.setActiveTool('fill-erase');
        else if (mode === 'pattern')    this.setActiveTool('fill-pattern');
        else if (mode === 'pattern-erase') this.setActiveTool('fill-pattern-erase');
      };
    });

    // Returns which side of the button the submenu should open toward,
    // based on toolbar dock state or floating position.
    const computeMenuDir = (button) => {
      const tb = button.closest('#tool-bar');
      if (!tb) return 'right';
      if (tb.classList.contains('toolbar-docked-bottom')) return 'above';
      if (tb.classList.contains('toolbar-docked-top'))    return 'below';
      if (tb.classList.contains('toolbar-docked-right'))  return 'left';
      if (tb.classList.contains('toolbar-docked-left'))   return 'right';
      // Floating: open toward whichever axis has more space.
      const tr = tb.getBoundingClientRect();
      const isHoriz = tr.width > tr.height;
      if (isHoriz) return tr.top > window.innerHeight / 2 ? 'above' : 'below';
      return tr.left > window.innerWidth / 2 ? 'left' : 'right';
    };

    // Positions a portal menu next to its button, clamped to the viewport.
    const positionMenu = (menu, button, dir) => {
      const r = button.getBoundingClientRect();
      const GAP = 6, PAD = 8;
      const vw = window.innerWidth, vh = window.innerHeight;
      menu.style.visibility = 'hidden';
      menu.classList.add('open');
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.classList.remove('open');
      menu.style.visibility = '';
      let left, top;
      if (dir === 'right')  { left = r.right + GAP;      top = r.top; }
      if (dir === 'left')   { left = r.left - GAP - mw;  top = r.top; }
      if (dir === 'below')  { left = r.left;              top = r.bottom + GAP; }
      if (dir === 'above')  { left = r.left;              top = r.top - GAP - mh; }
      menu.style.left = `${Math.max(PAD, Math.min(vw - mw - PAD, left))}px`;
      menu.style.top  = `${Math.max(PAD, Math.min(vh - mh - PAD, top))}px`;
    };

    // Syncs the data-submenu-dir attribute on every submenu button in the
    // toolbar so the directional chevron arrow always points toward the menu.
    const updateAllSubmenuDirs = (tb) => {
      tb.querySelectorAll('.tool-btn[data-has-submenu]').forEach((btn) => {
        btn.dataset.submenuDir = computeMenuDir(btn);
      });
    };

    const initSubtoolMenu = (config) => {
      const { button, menu, buttons, onActivate, onSelect } = config;
      if (!button || !menu) return;
      let holdTimer = null;
      let menuOpen = false;
      let hoverBtn = null;

      // Portal the submenu into document.body so .tool-bar's overflow:hidden
      // cannot clip it. Inline position:fixed + computed coords on open.
      menu.style.position = 'fixed';
      document.body.appendChild(menu);

      const setHover = (btn) => {
        if (hoverBtn === btn) return;
        hoverBtn = btn || null;
        buttons.forEach((sub) => sub.classList.toggle('hover', sub === hoverBtn));
      };
      const openMenu = (e) => {
        menuOpen = true;
        const dir = computeMenuDir(button);
        button.dataset.submenuDir = dir;
        positionMenu(menu, button, dir);
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
        mods.ctrl = false;
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
          const dir = computeMenuDir(algoDrawBtn);
          algoDrawBtn.dataset.submenuDir = dir;
          // Measure while hidden, then position, then reveal.
          popup.style.visibility = 'hidden';
          popup.classList.remove('hidden');
          const mw = popup.offsetWidth, mh = popup.offsetHeight;
          const r = algoDrawBtn.getBoundingClientRect();
          const GAP = 6, PAD = 8;
          const vw = window.innerWidth, vh = window.innerHeight;
          let left, top;
          if (dir === 'right')  { left = r.right + GAP;      top = r.top; }
          if (dir === 'left')   { left = r.left - GAP - mw;  top = r.top; }
          if (dir === 'below')  { left = r.left;              top = r.bottom + GAP; }
          if (dir === 'above')  { left = r.left;              top = r.top - GAP - mh; }
          popup.style.left = `${Math.max(PAD, Math.min(vw - mw - PAD, left))}px`;
          popup.style.top  = `${Math.max(PAD, Math.min(vh - mh - PAD, top))}px`;
          popup.style.visibility = '';
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

    this._updateAllSubmenuDirs = () => updateAllSubmenuDirs(toolbar);
    initToolBarDock.call(this, toolbar);
    requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
  }

  const DOCK_CLASSES = ['toolbar-docked-left', 'toolbar-docked-right', 'toolbar-docked-top', 'toolbar-docked-bottom'];

  function initToolBarDock(toolbar) {
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const shell = toolbar.closest('.workspace-shell') || toolbar.parentElement;
    const viewport = document.getElementById('viewport-container');
    if (!shell || !viewport) return;

    // ── Inject drag handle ──────────────────────────────────────
    const handle = document.createElement('div');
    handle.className = 'toolbar-drag-handle';
    handle.setAttribute('aria-label', 'Drag toolbar');
    handle.title = 'Drag to move';
    handle.innerHTML = '<svg class="handle-horiz" width="14" height="8" viewBox="0 0 14 8" fill="currentColor" aria-hidden="true">'
      + '<circle cx="2.5" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="11.5" cy="2" r="1.2"/>'
      + '<circle cx="2.5" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/><circle cx="11.5" cy="6" r="1.2"/>'
      + '</svg>'
      + '<svg class="handle-vert" width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">'
      + '<circle cx="2" cy="2.5" r="1.2"/><circle cx="6" cy="2.5" r="1.2"/>'
      + '<circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>'
      + '<circle cx="2" cy="11.5" r="1.2"/><circle cx="6" cy="11.5" r="1.2"/>'
      + '</svg>';
    toolbar.prepend(handle);

    // ── Inject footer (pin + home + rotate + pop-out) at bottom of toolbar ──
    const footer = document.createElement('div');
    footer.className = 'toolbar-footer';
    footer.innerHTML =
      '<button class="toolbar-pin-btn" type="button" title="Lock toolbar position" aria-label="Lock toolbar position" aria-pressed="false">'
      + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<line x1="12" y1="17" x2="12" y2="22"/>'
      + '<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>'
      + '</svg></button>'
      + '<button class="toolbar-home-btn" type="button" title="Reset toolbar position" aria-label="Reset toolbar position">'
      + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'
      + '</svg></button>'
      + '<button class="toolbar-rotate-btn" type="button" title="Rotate toolbar orientation" aria-label="Rotate toolbar orientation" aria-pressed="false">'
      + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M21 12a9 9 0 1 1-3.5-7.1"/><polyline points="21 3 21 9 15 9"/>'
      + '</svg></button>'
      + '<button class="toolbar-popout-btn" type="button" title="Pop out toolbar" aria-label="Restore floating toolbar">'
      + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>'
      + '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'
      + '</svg></button>';
    toolbar.appendChild(footer); // appended last so it sits at the bottom

    // ── Inject snap zones into viewport-container ───────────────
    ['left', 'right', 'top', 'bottom'].forEach((side) => {
      const zone = document.createElement('div');
      zone.className = `toolbar-snap-zone toolbar-snap-zone-${side}`;
      zone.dataset.dock = side;
      viewport.appendChild(zone);
    });

    const pinBtn    = footer.querySelector('.toolbar-pin-btn');
    const homeBtn   = footer.querySelector('.toolbar-home-btn');
    const rotateBtn = footer.querySelector('.toolbar-rotate-btn');
    const popoutBtn = footer.querySelector('.toolbar-popout-btn');

    // anchor used to restore toolbar to its original position in shell after bottom-dock
    const toolbarAnchor = toolbar.nextSibling;

    // ── Helpers ─────────────────────────────────────────────────
    const getCurrentDock = () => {
      for (const cls of DOCK_CLASSES) {
        if (toolbar.classList.contains(cls)) return cls.replace('toolbar-docked-', '');
      }
      return null;
    };

    const clearDockPadding = () => {
      ['Left', 'Right', 'Top', 'Bottom'].forEach((s) => { viewport.style['padding' + s] = ''; });
    };

    const applyDockPadding = (side) => {
      const r = toolbar.getBoundingClientRect();
      clearDockPadding();
      if (side === 'left')   viewport.style.paddingLeft   = r.width  + 'px';
      if (side === 'right')  viewport.style.paddingRight  = r.width  + 'px';
      if (side === 'top')    viewport.style.paddingTop    = r.height + 'px';
      if (side === 'bottom') viewport.style.paddingBottom = r.height + 'px';
    };

    const clampFloat = (x, y) => {
      const tw = toolbar.offsetWidth  || 46;
      const th = toolbar.offsetHeight || 100;
      const sr = shell.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(sr.width  - tw, x)),
        y: Math.max(0, Math.min(sr.height - th, y)),
      };
    };

    const restoreToShell = () => {
      if (toolbar.parentElement !== shell) {
        shell.insertBefore(toolbar, toolbarAnchor);
      }
    };

    const setFloat = (rawX, rawY) => {
      restoreToShell();
      // Strip dock classes and reset inline dimensions before measuring offsetHeight
      // so defaultY is computed against the toolbar's natural floating size, not the
      // docked 100%-height value.
      toolbar.classList.remove(...DOCK_CLASSES);
      ['position', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height']
        .forEach((p) => { toolbar.style[p] = ''; });
      const sr = shell.getBoundingClientRect();
      const defaultX = 10;
      const defaultY = Math.round(sr.height / 2 - (toolbar.offsetHeight || 150) / 2);
      const { x, y } = clampFloat(rawX ?? defaultX, rawY ?? defaultY);
      toolbar.style.position  = 'absolute';
      toolbar.style.transform = 'none';
      toolbar.style.left   = x + 'px';
      toolbar.style.top    = y + 'px';
      clearDockPadding();
    };

    const dockToolbar = (side) => {
      // For bottom-dock: move toolbar inside viewport-container so
      // position:absolute bottom:0 sits above the bottom pane, not over it.
      // All other sides stay in the shell.
      if (side !== 'bottom') restoreToShell();
      toolbar.classList.remove(...DOCK_CLASSES);
      ['position', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height']
        .forEach((p) => { toolbar.style[p] = ''; });
      toolbar.classList.add('toolbar-docked-' + side);
      if (side === 'bottom') viewport.appendChild(toolbar);
      requestAnimationFrame(() => {
        applyDockPadding(side);
        window.dispatchEvent(new Event('resize')); // trigger tutorial highlight reflow
      });
      SETTINGS.toolbarDock = side;
      this.app?.persistPreferencesDebounced?.();
      requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
    };

    const undockToFloat = () => {
      setFloat(null, null); // restoreToShell() called inside setFloat
      SETTINGS.toolbarDock = null;
      this.app?.persistPreferencesDebounced?.();
      window.dispatchEvent(new Event('resize')); // trigger tutorial highlight reflow
      requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
    };

    const updateSnapPreview = (snap) => {
      viewport.querySelectorAll('.toolbar-snap-zone').forEach((z) => {
        z.classList.toggle('snap-active', z.dataset.dock === snap);
      });
    };

    // Phone/tablet mobile-layout anchors the toolbar to the top of the screen
    // via `body.mobile-layout #tool-bar { position: static; order: 1 }` in the
    // flex-column shell. Inline-style float/dock would override that and push
    // the bar off-screen — defer to CSS in mobile-layout. Stay resilient to
    // resizes across the breakpoint by re-clearing in the resize handler.
    const isMobileLayout = () => document.body.classList.contains('mobile-layout');
    const clearInlineLayout = () => {
      toolbar.classList.remove(...DOCK_CLASSES);
      ['position', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height']
        .forEach((p) => { toolbar.style[p] = ''; });
      clearDockPadding();
    };

    // ── Restore saved state ──────────────────────────────────────
    if (isMobileLayout()) {
      clearInlineLayout();
    } else {
      if (SETTINGS.toolbarHorizontal) {
        toolbar.classList.add('toolbar-floating-horizontal');
        rotateBtn.classList.add('active');
        rotateBtn.setAttribute('aria-pressed', 'true');
      }
      if (SETTINGS.toolbarDock) {
        dockToolbar(SETTINGS.toolbarDock);
      } else {
        setFloat(SETTINGS.toolbarX, SETTINGS.toolbarY);
      }
      if (SETTINGS.toolbarLocked) {
        toolbar.classList.add('toolbar-locked');
        pinBtn.classList.add('active');
        pinBtn.setAttribute('aria-pressed', 'true');
      }
    }

    // ── Drag ─────────────────────────────────────────────────────
    const SNAP_THRESHOLD = 48;
    let isDragging = false;
    let startClientX, startClientY, startLeft, startTop, currentSnap;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (toolbar.classList.contains('toolbar-locked')) return;
      if (getCurrentDock()) {
        // Float-mode dimensions differ from the docked ones (esp. top/bottom
        // dock, where the bar is horizontal and the handle sits on its left
        // edge). Switch to float, then anchor the handle directly under the
        // cursor — un-clamped, so undocking near a viewport edge can't yank
        // the bar away from the user's grip.
        restoreToShell();
        toolbar.classList.remove(...DOCK_CLASSES);
        ['position', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height']
          .forEach((p) => { toolbar.style[p] = ''; });
        toolbar.style.position = 'absolute';
        toolbar.style.transform = 'none';
        clearDockPadding();
        const sr = shell.getBoundingClientRect();
        const tw = toolbar.offsetWidth || 46;
        const handleH = handle.offsetHeight || 14;
        toolbar.style.left = (e.clientX - sr.left - tw / 2) + 'px';
        toolbar.style.top  = (e.clientY - sr.top  - handleH / 2) + 'px';
        SETTINGS.toolbarDock = null;
        this.app?.persistPreferencesDebounced?.();
        // Note: no `window.resize` dispatch here. The resize handler below
        // re-clamps the floating toolbar, which would yank the freshly
        // cursor-anchored position back inside the viewport (visible esp.
        // when undocking from the bottom edge). Tutorial-highlight reflow
        // happens at pointerup when the drag settles.
        requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
      }
      isDragging    = true;
      handle.setPointerCapture(e.pointerId);
      startClientX  = e.clientX;
      startClientY  = e.clientY;
      startLeft     = parseFloat(toolbar.style.left) || 0;
      startTop      = parseFloat(toolbar.style.top)  || 0;
      currentSnap   = null;
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      toolbar.style.left = (startLeft + dx) + 'px';
      toolbar.style.top  = (startTop  + dy) + 'px';

      // Snap detection: closest toolbar edge vs. viewport-container edges
      const vp = viewport.getBoundingClientRect();
      const tb = toolbar.getBoundingClientRect();
      let snap = null;
      if (tb.left   - vp.left   < SNAP_THRESHOLD) snap = 'left';
      else if (vp.right  - tb.right  < SNAP_THRESHOLD) snap = 'right';
      else if (tb.top    - vp.top    < SNAP_THRESHOLD) snap = 'top';
      else if (vp.bottom - tb.bottom < SNAP_THRESHOLD) snap = 'bottom';
      updateSnapPreview(snap);
      currentSnap = snap;
    });

    handle.addEventListener('pointerup', () => {
      if (!isDragging) return;
      isDragging = false;
      if (currentSnap) {
        dockToolbar(currentSnap);
      } else {
        SETTINGS.toolbarX = parseFloat(toolbar.style.left) || 0;
        SETTINGS.toolbarY = parseFloat(toolbar.style.top)  || 0;
        this.app?.persistPreferencesDebounced?.();
        this._updateAllSubmenuDirs?.();
      }
      updateSnapPreview(null);
      currentSnap = null;
    });

    handle.addEventListener('pointercancel', () => {
      isDragging = false;
      updateSnapPreview(null);
      currentSnap = null;
    });

    // ── Lock / home / rotate / pop-out ───────────────────────────
    pinBtn.addEventListener('click', () => {
      const locked = toolbar.classList.toggle('toolbar-locked');
      SETTINGS.toolbarLocked = locked;
      pinBtn.classList.toggle('active', locked);
      pinBtn.setAttribute('aria-pressed', String(locked));
      this.app?.persistPreferencesDebounced?.();
    });

    homeBtn.addEventListener('click', () => {
      SETTINGS.toolbarX = null;
      SETTINGS.toolbarY = null;
      SETTINGS.toolbarDock = null;
      setFloat(null, null);
      window.dispatchEvent(new Event('resize'));
      this.app?.persistPreferencesDebounced?.();
      requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
    });

    rotateBtn.addEventListener('click', () => {
      const horizontal = toolbar.classList.toggle('toolbar-floating-horizontal');
      SETTINGS.toolbarHorizontal = horizontal;
      rotateBtn.classList.toggle('active', horizontal);
      rotateBtn.setAttribute('aria-pressed', String(horizontal));
      // If currently floating, re-center to the new natural size; if docked,
      // the orientation only takes effect after undock, so leave layout alone.
      if (!getCurrentDock()) setFloat(null, null);
      this.app?.persistPreferencesDebounced?.();
      requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
    });

    popoutBtn.addEventListener('click', () => {
      SETTINGS.toolbarX = null;
      SETTINGS.toolbarY = null;
      SETTINGS.toolbarDock = null;
      setFloat(null, null);
      window.dispatchEvent(new Event('resize'));
      this.app?.persistPreferencesDebounced?.();
      requestAnimationFrame(() => this._updateAllSubmenuDirs?.());
    });

    // ── Resize: re-clamp float or re-apply dock padding ─────────
    window.addEventListener('resize', () => {
      if (isMobileLayout()) {
        // Crossing into mobile-layout (or already there): hand layout back to
        // the CSS rule so the toolbar stays anchored to the top.
        clearInlineLayout();
        return;
      }
      const dock = getCurrentDock();
      if (dock) {
        requestAnimationFrame(() => applyDockPadding(dock));
      } else {
        const x = parseFloat(toolbar.style.left) || 0;
        const y = parseFloat(toolbar.style.top)  || 0;
        const { x: cx, y: cy } = clampFloat(x, y);
        toolbar.style.left = cx + 'px';
        toolbar.style.top  = cy + 'px';
      }
    });
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
    installOn(proto) {
      proto.updateLightSourceTool = function() { return updateLightSourceTool.call(this); };
      proto.initToolBar = function() { return initToolBar.call(this); };
    },
  };
})();
