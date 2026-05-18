/**
 * Vectura shortcuts module (Phase 2 step 5b extraction).
 *
 * Exposes window.Vectura.UI.Shortcuts — keyboard shortcut wiring lifted
 * verbatim from class UI. Includes both the keydown / keyup handlers and
 * the layers-add / filter / search menu wiring that historically lived in
 * the same `bindShortcuts()` body.
 *
 * Methods lifted verbatim from class UI:
 *   - bindShortcuts          (installs keydown/keyup + layer-add menu wiring)
 *   - handleTopMenuShortcut  (returns true when an event matches a top-menu
 *                             accelerator and was dispatched)
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl, SETTINGS, isPrimitiveShapeLayer }.
 *
 * Compile gate at tests/unit/shortcuts-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Shortcuts.${name} invoked before Shortcuts.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function handleTopMenuShortcut(e) {
    requireDeps('handleTopMenuShortcut');
    const primary = e.metaKey || e.ctrlKey;
    const key = (e.key || '').toLowerCase();
    if (primary && !e.shiftKey && !e.altKey && key === 'z') {
      return this.triggerTopMenuAction('btn-undo');
    }
    if (primary && e.shiftKey && !e.altKey && key === 'z') {
      return this.triggerTopMenuAction('btn-redo');
    }
    if (primary && !e.shiftKey && !e.altKey && key === 'y') {
      return this.triggerTopMenuAction('btn-redo');
    }
    if (primary && !e.shiftKey && !e.altKey && key === 'o') {
      return this.triggerTopMenuAction('btn-open-vectura');
    }
    if (primary && !e.shiftKey && !e.altKey && key === 's') {
      return this.triggerTopMenuAction('btn-save-vectura');
    }
    if (primary && e.shiftKey && !e.altKey && key === 'p') {
      return this.triggerTopMenuAction('btn-import-svg');
    }
    if (primary && e.shiftKey && !e.altKey && key === 'e') {
      return this.triggerTopMenuAction('btn-export');
    }
    if (primary && !e.shiftKey && !e.altKey && key === 'k') {
      this.toggleSettingsPanel();
      this.setTopMenuOpen(null, false);
      return true;
    }
    if (primary && !e.shiftKey && !e.altKey && key === '0') {
      return this.triggerTopMenuAction('btn-reset-view');
    }
    if (!primary && !e.shiftKey && !e.altKey && e.key === 'F1') {
      this.openHelp(false);
      this.setTopMenuOpen(null, false);
      return true;
    }
    if (e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && key === 'g') {
      return this.triggerTopMenuAction('btn-group-layers');
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && key === 'g') {
      return this.triggerTopMenuAction('btn-ungroup-layers');
    }
    if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && key === 'g') {
      return this.triggerTopMenuAction('btn-view-grid-toggle');
    }
    return false;
  }

  function bindShortcuts() {
    const { getEl, SETTINGS, isPrimitiveShapeLayer } = requireDeps('bindShortcuts');
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;
      if (this.handleTopMenuShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (this.petalDesigner) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closePetalDesigner();
        }
        return;
      }
      if (this.inlinePetalDesigner?.focused && !e.metaKey && !e.ctrlKey) {
        return;
      }

      if (e.code === 'Space') {
        if (!this.spacePanActive) {
          e.preventDefault();
          this.spacePanActive = true;
          this.spacePanTool = this.activeTool;
          this.setActiveTool?.('hand', { temporary: true });
        }
        return;
      }

      if (e.key === 'Alt' && (this.activeTool === 'fill' || this.activeTool === 'fill-pattern') && !this.fillEraseModifierActive) {
        e.preventDefault();
        this.fillEraseModifierActive = true;
        this.fillEraseRestoreTool = this.activeTool;
        this.setActiveTool?.(this.activeTool === 'fill-pattern' ? 'fill-pattern-erase' : 'fill-erase', { temporary: true });
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        this.openHelp(true);
        return;
      }

      // Shift+F7 → focus the Align panel when 2+ layers are selected
      // (Illustrator's native shortcut). No-op otherwise.
      if (e.key === 'F7' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const selected = this.app.renderer?.getSelectedLayers?.() || [];
        if (selected.length < 2) return;
        const section = document.getElementById('left-section-multi-selection');
        if (!section) return;
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        section.classList.add('align-panel-flash');
        setTimeout(() => section.classList.remove('align-panel-flash'), 600);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
        if (selectedLayers.length) {
          this.duplicateLayers(selectedLayers);
        } else {
          const active = this.app.engine.getActiveLayer?.();
          if (active) this.duplicateLayers([active]);
        }
        return;
      }

      if (!e.metaKey && !e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
        if (selectedLayers.length) {
          this.duplicateLayers(selectedLayers);
        } else {
          const active = this.app.engine.getActiveLayer?.();
          if (active) this.duplicateLayers([active]);
        }
        return;
      }

      if (!e.metaKey && !e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'v') {
          e.preventDefault();
          this.setActiveTool?.('select');
          return;
        }
        if (key === 'q') {
          e.preventDefault();
          this.setActiveTool?.('lasso');
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          this.setActiveTool?.('direct');
          return;
        }
        if (key === 'm') {
          e.preventDefault();
          this.setActiveTool?.('shape-rect');
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          this.setActiveTool?.('shape-oval');
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          this.setActiveTool?.('shape-polygon');
          return;
        }
        if (key === 'u') {
          e.preventDefault();
          this.setActiveTool?.('shape-line');
          return;
        }
        if (key === 'f') {
          e.preventDefault();
          if (e.shiftKey) this.setActiveTool?.('fill-erase');
          else this.setActiveTool?.('fill');
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          if (this.activeTool === 'pen') {
            this.cycleToolSubmode?.('pen');
          } else {
            this.setActiveTool?.('pen');
          }
          return;
        }
        if (key === '+' || (key === '=' && e.shiftKey)) {
          e.preventDefault();
          this.setActiveTool?.('pen');
          this.setPenMode?.('add');
          return;
        }
        if (key === '-') {
          e.preventDefault();
          this.setActiveTool?.('pen');
          this.setPenMode?.('delete');
          return;
        }
        if (key === 'c' && e.shiftKey) {
          e.preventDefault();
          this.setActiveTool?.('pen');
          this.setPenMode?.('anchor');
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          if (this.activeTool === 'scissor') {
            this.cycleToolSubmode?.('scissor');
          } else {
            this.setActiveTool?.('scissor');
          }
          return;
        }
        if (key === 'x') {
          e.preventDefault();
          this.setActiveTool?.('algo-draw');
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const engine = this.app.engine;
        const all = engine.layers.filter((layer) => {
          // Compound containers ARE user-facing units (they render their baked
          // silhouette) — include them. Other groups (modifier containers, plain
          // groups) and any layer nested inside a compound are skipped.
          if (layer.isGroup && layer.type !== 'compound') return false;
          if (engine.hasCompoundAncestor?.(layer)) return false;
          return true;
        }).map((layer) => layer.id);
        const primary = all[all.length - 1] || null;
        if (this.app.renderer) this.app.renderer.setSelection(all, primary);
        this.app.engine.activeLayerId = primary;
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
        return;
      }

      if (this.activeTool === 'pen') {
        if (this.penMode !== 'draw') {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.setPenMode?.('draw');
            return;
          }
        }
        if (this.penMode === 'draw' && e.key === 'Enter') {
          e.preventDefault();
          this.app.renderer?.commitPenPath?.();
          return;
        }
        if (this.penMode === 'draw' && e.key === 'Escape') {
          e.preventDefault();
          this.app.renderer?.cancelPenPath?.();
          return;
        }
        if (this.penMode === 'draw' && e.key === 'Backspace') {
          e.preventDefault();
          this.app.renderer?.undoPenPoint?.();
          return;
        }
      }

      if (this.activeTool === 'algo-draw' && e.key === 'Escape') {
        e.preventDefault();
        this.app.renderer?.cancelAlgoDraft?.();
        return;
      }

      if (`${this.activeTool}`.startsWith('shape-')) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.app.renderer?.cancelShapeDraft?.();
          return;
        }
        if (
          this.activeTool === 'shape-polygon' &&
          this.app.renderer?.shapeDraft &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown')
        ) {
          e.preventDefault();
          this.app.renderer.adjustShapeDraftSides?.(e.key === 'ArrowUp' ? 1 : -1);
          return;
        }
      }

      if (this.activeTool === 'scissor' && e.key === 'Escape') {
        e.preventDefault();
        this.app.renderer?.cancelScissor?.();
        return;
      }

      // Esc in fill mode commits the active batch (clears the chip + outline).
      // No-op if the batch is empty so other Esc handlers downstream still run.
      if ((this.activeTool === 'fill' || this.activeTool === 'fill-erase') && e.key === 'Escape') {
        const refs = this.app.renderer?.lastPaintedFillRefs;
        if (Array.isArray(refs) && refs.length) {
          e.preventDefault();
          this.app.renderer?.commitActiveBatch?.();
          return;
        }
      }

      if (this.activeTool === 'select' && e.key === 'Escape' && this.app.renderer?.groupEditMode) {
        e.preventDefault();
        this.app.renderer.exitGroupEditMode();
        return;
      }



      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
        const targets = selectedLayers.filter((layer) => layer && !layer.isGroup && !isPrimitiveShapeLayer(layer));
        if (!targets.length) return;
        if (this.app.pushHistory) this.app.pushHistory();
        targets.forEach((layer) => this.expandLayer(layer, { skipHistory: true }));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
        e.preventDefault();
        const isRight = e.key === ']' || e.key === '}';
        const direction = isRight ? 'up' : 'down';
        let changed = false;
        if (e.shiftKey || e.key === '{' || e.key === '}') {
          changed = this.moveSelectedLayers(isRight ? 'top' : 'bottom');
        } else {
          changed = this.moveSelectedLayers(direction);
        }
        if (changed && this.app.pushHistory) this.app.pushHistory();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.app.renderer?.lightSourceSelected) {
          e.preventDefault();
          this.app.renderer.clearLightSource?.();
          return;
        }
      }

      const selected = this.app.renderer?.getSelectedLayer?.();
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (this.app.pushHistory) this.app.pushHistory();
        const ids = Array.from(this.app.renderer?.selectedLayerIds || []);
        ids.forEach((id) => {
          this.unlockMirrorChildrenOnDelete?.(id);
          this.app.engine.removeLayer(id);
        });
        if (this.app.renderer) {
          const nextId = this.app.engine.activeLayerId;
          this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
        }
        this.renderLayers();
        this.app.render();
        return;
      }
      const step = (e.metaKey || e.ctrlKey) ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      if (dx || dy) {
        e.preventDefault();
        // If direct-select tool is active with a path selected, nudge anchors
        const renderer = this.app.renderer;
        if (renderer?.activeTool === 'direct' && renderer.directSelection?.anchors?.length) {
          if (this.app.pushHistory) this.app.pushHistory();
          const ds = renderer.directSelection;
          const indicesToMove = ds.selectedIndices?.size
            ? [...ds.selectedIndices]
            : ds.anchors.map((_, i) => i);
          indicesToMove.forEach(i => {
            const a = ds.anchors[i];
            if (!a) return;
            a.x += dx; a.y += dy;
            if (a.in) { a.in.x += dx; a.in.y += dy; }
            if (a.out) { a.out.x += dx; a.out.y += dy; }
          });
          renderer.applyDirectPath();
          renderer.draw();
          return;
        }
        // Skip locked layers so arrow-key nudging respects the lock state
        // the same way pointer-drag does.
        const isLocked = this.app.renderer?.isLayerLocked;
        const allSelected = this.app.renderer?.getSelectedLayers?.() || [];
        const selectedLayers = isLocked
          ? allSelected.filter((l) => !isLocked.call(this.app.renderer, l.id))
          : allSelected;
        if (selectedLayers.length) {
          if (this.app.pushHistory) this.app.pushHistory();
          selectedLayers.forEach((layer) => {
            layer.params.posX += dx;
            layer.params.posY += dy;
            window.Vectura?.PaintBucketOps?.translateLayerFills?.(layer, dx, dy);
            this.app.engine.generate(layer.id);
          });
          this.app.render();
          const primary = this.app.renderer?.getSelectedLayer?.();
          if (primary) {
            const posX = getEl('inp-pos-x');
            const posY = getEl('inp-pos-y');
            if (posX) posX.value = primary.params.posX;
            if (posY) posY.value = primary.params.posY;
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const target = e.target;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;
      if (e.code === 'Space' && this.spacePanActive) {
        e.preventDefault();
        this.spacePanActive = false;
        const restore = this.spacePanTool || this.previousTool || 'select';
        this.setActiveTool?.(restore);
        return;
      }
      if (e.key === 'Alt' && this.fillEraseModifierActive) {
        e.preventDefault();
        this.fillEraseModifierActive = false;
        const restore = this.fillEraseRestoreTool || 'fill';
        this.fillEraseRestoreTool = null;
        if (this.activeTool === 'fill-erase' || this.activeTool === 'fill-pattern-erase') this.setActiveTool?.(restore, { temporary: true });
      }
    });

    this._LVL_I = window.Vectura.Icons.layer;

    // ── Layers V8: add dropdown ──────────────────────────────────
    const _ALGO_LIST = [
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
    // Build the algo submenu as a body-fixed element to escape pane stacking context
    let algoSubmenuEl = document.getElementById('lvl-algo-submenu');
    if (algoSubmenuEl) algoSubmenuEl.remove();
    algoSubmenuEl = document.createElement('div');
    algoSubmenuEl.id = 'lvl-algo-submenu';
    algoSubmenuEl.className = 'lvl-algo-submenu';
    this._algoMenuColor = (type) => {
      const pid = SETTINGS.layerBarPaletteId || 'prism';
      const palettes = window.Vectura.LAYER_PALETTES || [];
      const pal = palettes.find((p) => p.id === pid) || palettes.find((p) => p.id === 'prism');
      const c = pal?.colors;
      if (!c) return 'currentColor';
      return c[type] || c._default || 'currentColor';
    };
    algoSubmenuEl.innerHTML = _ALGO_LIST.map(({ type, label }) =>
      `<div class="lvl-algo-sub-item" data-add="algo" data-algo-type="${type}">` +
      `<span class="lvl-algo-sub-ico" style="color:${this._algoMenuColor(type)}">${(this._LVL_I[type] ?? this._LVL_I.grid)?.() ?? ''}</span>${label}</div>`
    ).join('');
    this._refreshAlgoSubmenuColors = () => {
      if (!algoSubmenuEl) return;
      algoSubmenuEl.querySelectorAll('.lvl-algo-sub-item').forEach((item) => {
        const type = item.getAttribute('data-algo-type');
        const ico = item.querySelector('.lvl-algo-sub-ico');
        if (type && ico) ico.style.color = this._algoMenuColor(type);
      });
    };
    document.body.appendChild(algoSubmenuEl);

    // Position and show/hide the submenu on hover of the parent item
    const algoParentItem = document.querySelector('.lvl-add-has-sub[data-add="algo-parent"]');
    let _algoSubHideTimer = null;
    const _ALGO_SUB_W = 180;
    const _showAlgoSub = () => {
      clearTimeout(_algoSubHideTimer);
      const r = algoParentItem.getBoundingClientRect();
      algoSubmenuEl.style.top = `${r.top}px`;
      algoSubmenuEl.style.left = `${r.left - _ALGO_SUB_W}px`;
      algoSubmenuEl.style.display = 'block';
    };
    const _hideAlgoSub = () => {
      _algoSubHideTimer = setTimeout(() => { algoSubmenuEl.style.display = 'none'; }, 80);
    };
    algoParentItem?.addEventListener('mouseenter', _showAlgoSub);
    algoParentItem?.addEventListener('mouseleave', _hideAlgoSub);
    algoSubmenuEl.addEventListener('mouseenter', () => clearTimeout(_algoSubHideTimer));
    algoSubmenuEl.addEventListener('mouseleave', _hideAlgoSub);

    // Clicking a submenu item closes the submenu and the add menu
    algoSubmenuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.lvl-algo-sub-item');
      if (!item) return;
      algoSubmenuEl.style.display = 'none';
      _doAddAlgoLayer(item.dataset.algoType || this.getPreferredNewLayerType?.() || 'wavetable');
      this.layerAddOpen = false;
      addMenuEl?.classList.add('hidden');
      this.renderLayers();
      this.app.render();
    });

    const addMenuEl = document.getElementById('layer-add-menu');
    const addBtn = document.getElementById('btn-add-layer');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        this.layerAddOpen = !this.layerAddOpen;
        addMenuEl?.classList.toggle('hidden', !this.layerAddOpen);
      };
    }

    const _toast = (message, variant = 'success') => {
      const T = window.Vectura?.UI?.overlays?.Toast;
      if (T && typeof T.show === 'function') {
        try { T.show({ message, variant, duration: 2200 }); } catch (_) { /* noop */ }
      }
    };

    const _doAddAlgoLayer = (layerType) => {
      if (this.app.pushHistory) this.app.pushHistory();
      const activeLayer = this.app.engine.getActiveLayer?.();
      const id = this.app.engine.addLayer(layerType);
      const created = this.getLayerById?.(id);
      if (created) this.rememberDrawableLayerType?.(created);
      const selectedModifier = activeLayer && this.isModifierLayer?.(activeLayer) ? activeLayer : null;
      if (selectedModifier && created) {
        this.assignLayersToParent?.(selectedModifier.id, [created], { selectAssigned: true, primaryId: id });
      } else if (this.app.renderer) {
        this.app.renderer.setSelection([id], id);
      }
      _toast(`Added ${layerType} layer`);
    };

    addMenuEl?.addEventListener('click', (e) => {
      const item = e.target.closest('.lvl-add-item, .lvl-algo-sub-item');
      if (!item) return;
      this.layerAddOpen = false;
      addMenuEl.classList.add('hidden');
      const t = item.dataset.add;
      if (t === 'layer') {
        if (this.app.pushHistory) this.app.pushHistory();
        const id = this.app.engine.addEmptyLayer?.();
        if (id && this.app.renderer) this.app.renderer.setSelection([id], id);
        _toast('Added empty layer');
      } else if (t === 'algo') {
        _doAddAlgoLayer(item.dataset.algoType || this.getPreferredNewLayerType?.() || 'wavetable');
      } else if (t === 'algo-parent') {
        _doAddAlgoLayer(this.getPreferredNewLayerType?.() || 'wavetable');
      } else if (t === 'group') {
        if (this.app.pushHistory) this.app.pushHistory();
        const id = this.app.engine.addGroupLayer?.();
        if (id && this.app.renderer) this.app.renderer.setSelection([id], id);
        _toast('Added group');
      } else if (t === 'mirror') {
        this.insertMirrorModifier();
        _toast('Added mirror modifier');
      }
      this.setActiveTool?.('select');
      this.renderLayers();
      this.app.render();
    });

    // ── Layers V8: search ────────────────────────────────────────
    document.getElementById('layer-search-input')?.addEventListener('input', (e) => {
      this.layerSearchQ = e.target.value;
      document.getElementById('layer-filter-btn')?.classList.toggle(
        'active', !!this.layerSearchQ || this.layerFilterType !== 'all'
      );
      this.renderLayers();
    });

    // ── Layers V8: filter ────────────────────────────────────────
    // Phase 3 closure: layer filter dropdown migrated to UI.Menus.LayerFilter
    // (composes UI.overlays.Menu). The bespoke #layer-filter-menu DOM element
    // remains in index.html as a stub; the new menu is owned by the floating
    // Menu primitive and attaches its own click handler on #layer-filter-btn.
    if (window.Vectura?.UI?.Menus?.LayerFilter?.attach) {
      window.Vectura.UI.Menus.LayerFilter.attach(this);
    }

    // ── Layers V8: close menus on outside click ──────────────────
    // The new LayerFilter menu primitive handles its own outside-click guard;
    // we still need to close the legacy add-menu + algo-submenu below.
    document.addEventListener('click', () => {
      if (this.layerAddOpen) {
        this.layerAddOpen = false;
        addMenuEl?.classList.add('hidden');
        algoSubmenuEl.style.display = 'none';
      }
    });
  }

  UI.Shortcuts = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl, SETTINGS, isPrimitiveShapeLayer }
     */
    bind(deps) {
      DEPS = deps;
    },
    bindShortcuts,
    handleTopMenuShortcut,
    installOn(proto) {
      proto.bindShortcuts = function() { return bindShortcuts.call(this); };
      proto.handleTopMenuShortcut = function(e) { return handleTopMenuShortcut.call(this, e); };
    },
  };
})();
