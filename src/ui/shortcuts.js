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
    const { getEl, SETTINGS, isPrimitiveShapeLayer, getContrastTextColor, openColorPickerAnchoredTo } = requireDeps('bindShortcuts');
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
      // Let the inline Petal Designer capture plain keys only when the user is
      // actually working inside it (its DOM holds focus / the event came from
      // it). Previously a sticky `focused` flag — set on mount, never cleared —
      // swallowed every non-modifier app shortcut whenever a petalis layer was
      // merely active.
      const inlineRoot = this.inlinePetalDesigner?.root;
      const inInlineDesigner =
        inlineRoot &&
        (inlineRoot.contains(e.target) ||
          (typeof document !== 'undefined' && inlineRoot.contains(document.activeElement)));
      if (inInlineDesigner && !e.metaKey && !e.ctrlKey) {
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
        if (key === 't') {
          e.preventDefault();
          this.setActiveTool?.('type');
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
    const _ALGO_LIST = (() => {
      const shared = window.Vectura.UI?.utils?.getDrawableAlgorithmOptions?.();
      if (Array.isArray(shared) && shared.length) return shared;
      const defaults = window.Vectura.ALGO_DEFAULTS || {};
      return Object.keys(defaults)
        .filter((type) => defaults[type] && !defaults[type].hidden)
        .map((type) => ({ type, label: defaults[type]?.label || type, is3d: !!defaults[type]?.is3d }))
        .sort((a, b) => a.label.localeCompare(b.label));
    })();
    // Build the algo submenu as a body-fixed element to escape pane stacking context
    let algoSubmenuEl = document.getElementById('lvl-algo-submenu');
    if (algoSubmenuEl) algoSubmenuEl.remove();
    algoSubmenuEl = document.createElement('div');
    algoSubmenuEl.id = 'lvl-algo-submenu';
    algoSubmenuEl.className = 'lvl-algo-submenu';
    this._algoMenuColor = (type) => window.Vectura.UI.utils.getAlgoMenuColor(type);
    algoSubmenuEl.innerHTML = window.Vectura.UI.utils.renderAlgoMenuHTML(_ALGO_LIST, null);
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
      // Reveal first so we can measure the (possibly scroll-capped) height.
      algoSubmenuEl.style.display = 'block';
      const PAD = 8;
      const mh = algoSubmenuEl.offsetHeight;
      const top = Math.max(PAD, Math.min(window.innerHeight - mh - PAD, r.top));
      algoSubmenuEl.style.top = `${top}px`;
      algoSubmenuEl.style.left = `${r.left - _ALGO_SUB_W}px`;
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
      } else if (t === 'morph') {
        this.insertMorphModifier();
        _toast('Added morph modifier');
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

    // ── Drawing-order (plot progress) slider ─────────────────────
    // Reveals the first N% of the whole document's pen path in plot order, like
    // watching the plotter draw partway. Drives Renderer.drawProgress; the gradient
    // fill tracks the value via a CSS var. Stays a pure render preview — no geometry
    // is mutated, so export is unaffected unless the user leaves it below 100%.
    const drawOrderInput = document.getElementById('draw-order-input');
    if (drawOrderInput) {
      const applyDrawOrder = (raw) => {
        const pct = Math.max(0, Math.min(100, Number(raw)));
        const frac = pct / 100;
        if (this.app.renderer) this.app.renderer.drawProgress = frac;
        const valEl = document.getElementById('draw-order-value');
        if (valEl) valEl.textContent = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
        drawOrderInput.style.setProperty('--draw-order-fill', `${pct}%`);
        // Recolour the thumb halo to the gradient colour under the handle as it drags.
        this.app.renderer?.refreshDrawOrderHalo?.();
        this.app.render();
      };
      drawOrderInput.addEventListener('input', (e) => applyDrawOrder(e.target.value));
      applyDrawOrder(drawOrderInput.value);
      // The bar's own title covers the general gesture; the slider gets a more
      // specific one for the two things a hover here can't otherwise tell you.
      drawOrderInput.title =
        'Drag to scrub (hold Shift for tenths) — click to play from here ' +
        '(Shift-click to play at 1/10 speed)';

      // Holding Shift while dragging switches the granularity from whole percent to
      // tenths of a percent, for scrubbing to a precise plot position. The `step`
      // attribute is what the browser consults on every pointermove to snap the
      // dragged value, so toggling it live (from the modifier key on the same
      // pointermove) is enough — no need to recompute position ourselves.
      let drawOrderDragActive = false;
      let drawOrderDragMoved = false;
      let drawOrderDragStartX = 0;
      let drawOrderDragStartY = 0;
      let drawOrderClickShift = false;
      let drawOrderPlayRaf = null;
      const DRAW_ORDER_DRAG_THRESHOLD = 3;
      const DRAW_ORDER_PLAY_RATE = 35; // percent per second

      const stopDrawOrderPlayback = () => {
        if (drawOrderPlayRaf != null) {
          cancelAnimationFrame(drawOrderPlayRaf);
          drawOrderPlayRaf = null;
        }
      };
      // Shift-click plays back at 1/10 speed with tenths visible, so a precise
      // stretch of the plot order can be watched unfold; a plain click plays at
      // full speed with whole-percent steps only (no stray decimals). The running
      // total is tracked in `current` — a plain JS float — rather than read back
      // from drawOrderInput.value each frame: with `step` at '1' (whole-percent
      // mode), the browser's native value-sanitization silently rounds any
      // fractional assignment to the nearest whole percent, so re-reading it would
      // reset the accumulator to ~0 (or a stray ".6") every single frame instead of
      // advancing smoothly.
      const startDrawOrderPlayback = (slow) => {
        stopDrawOrderPlayback();
        const rate = slow ? DRAW_ORDER_PLAY_RATE / 10 : DRAW_ORDER_PLAY_RATE;
        drawOrderInput.step = slow ? '0.1' : '1';
        let last = null;
        let current = Number(drawOrderInput.value) || 0;
        const tick = (ts) => {
          if (last == null) last = ts;
          const dt = (ts - last) / 1000;
          last = ts;
          current = Math.min(100, current + dt * rate);
          const shown = slow ? current : Math.round(current);
          drawOrderInput.value = String(shown);
          applyDrawOrder(shown);
          drawOrderPlayRaf = shown < 100 ? requestAnimationFrame(tick) : null;
        };
        drawOrderPlayRaf = requestAnimationFrame(tick);
      };

      drawOrderInput.addEventListener('pointerdown', (e) => {
        stopDrawOrderPlayback();
        drawOrderDragActive = true;
        drawOrderDragMoved = false;
        drawOrderDragStartX = e.clientX;
        drawOrderDragStartY = e.clientY;
        drawOrderClickShift = e.shiftKey;
        drawOrderInput.step = e.shiftKey ? '0.1' : '1';
      });
      window.addEventListener('pointermove', (e) => {
        if (!drawOrderDragActive) return;
        if (!drawOrderDragMoved) {
          const dx = e.clientX - drawOrderDragStartX;
          const dy = e.clientY - drawOrderDragStartY;
          if (Math.hypot(dx, dy) > DRAW_ORDER_DRAG_THRESHOLD) {
            drawOrderDragMoved = true;
            // Scrubbing the plot order previews the WHOLE document mid-draw; a
            // lingering canvas selection (handles, bbox) fights that preview visually.
            this.app.renderer?.clearSelection?.();
          }
        }
        drawOrderInput.step = e.shiftKey ? '0.1' : '1';
      });
      window.addEventListener('pointerup', () => {
        if (!drawOrderDragActive) return;
        drawOrderDragActive = false;
        drawOrderInput.step = '1';
        // A click that never dragged the playhead starts the plot-order playback,
        // scrubbing forward from wherever the handle currently sits. A Shift-click
        // plays back at 1/10 speed instead of the normal rate.
        if (!drawOrderDragMoved) {
          startDrawOrderPlayback(drawOrderClickShift);
        }
      });
    }
    // Eye → toggle the line-sort overlay (the order colouring + its legend) on the
    // primary canvas via its own non-persisted flag, so it is closed by default and
    // only opens on click. The renderer syncs the eye's open/closed state and gradient.
    document.getElementById('draw-order-overlay-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      SETTINGS.lineSortOverlayVisible = !(SETTINGS.lineSortOverlayVisible === true);
      this.app.renderer?.updateDrawOrderOverlayToggle?.();
      this.app.render();
    });

    // Gear → export settings: the draw-order readout (distance | lines | time)
    // is driven by the same optimization/pen settings the export modal owns, so
    // the gear opens that modal — deep-linked to the Line Sort tab, since that is
    // what governs draw order — for the user to tune them.
    document.getElementById('draw-order-settings')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openExportModal?.({ section: 'linesort' });
    });

    // Draw-Order palette button → inline Start Color / End Color / Line Thickness dialogue,
    // mirroring the export menu's legend gear, but editing the live canvas overlay settings.
    // (Relocated from the retired on-canvas legend gear to the Draw-Order panel.)
    const overlayGear = document.getElementById('draw-order-color-settings');
    const overlayPanel = document.getElementById('optimization-overlay-legend-settings-panel');
    const overlayStartBtn = document.getElementById('overlay-legend-start-color');
    const overlayStartInput = document.getElementById('overlay-legend-start-color-input');
    const overlayEndBtn = document.getElementById('overlay-legend-end-color');
    const overlayEndInput = document.getElementById('overlay-legend-end-color-input');
    const overlayThickness = document.getElementById('overlay-legend-thickness');
    if (overlayGear && overlayPanel) {
      const hexToCss = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      // Effective end colour: explicit override → per-layer line-sort secondary → the
      // start colour's complement (matches the renderer's gradient).
      const effectiveEndColor = () => {
        const override = (SETTINGS.optimizationOverlaySecondaryColor || '').trim();
        if (override) return override;
        const r = this.app.renderer;
        const secondary = r?.getLineSortOverlaySecondaryColor?.(this.app.engine?.layers || []);
        if (secondary) return secondary;
        const base = r?.hexToRgb?.(SETTINGS.optimizationOverlayColor || '#38bdf8');
        return base && r?.getComplementRgb ? hexToCss(r.getComplementRgb(base)) : '#f59e0b';
      };
      const syncPill = (btn, color) => {
        if (!btn) return;
        btn.textContent = (color || '').toUpperCase();
        btn.style.background = color;
        btn.style.color = getContrastTextColor(color);
      };
      const syncOverlayLegendControls = () => {
        const start = SETTINGS.optimizationOverlayColor || '#38bdf8';
        const end = effectiveEndColor();
        syncPill(overlayStartBtn, start);
        if (overlayStartInput) overlayStartInput.value = start;
        syncPill(overlayEndBtn, end);
        if (overlayEndInput) overlayEndInput.value = end;
        if (overlayThickness) overlayThickness.value = `${SETTINGS.optimizationOverlayWidth ?? 0.2}`;
      };
      overlayGear.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = overlayPanel.classList.contains('hidden');
        overlayPanel.classList.toggle('hidden', !willShow);
        if (willShow) syncOverlayLegendControls();
      });
      if (overlayStartBtn && overlayStartInput) {
        overlayStartBtn.onclick = () => openColorPickerAnchoredTo(overlayStartInput, overlayStartBtn, { title: 'Overlay Start Color', uiInstance: this });
        // Update ONLY the start pill — the end colour is edited independently and
        // must not be rewritten (it would otherwise jump to the start complement
        // on every start pick). The effective end is re-synced when the panel reopens.
        const apply = (e) => { SETTINGS.optimizationOverlayColor = e.target.value; syncPill(overlayStartBtn, e.target.value); this.app.render(); };
        overlayStartInput.oninput = apply;
        overlayStartInput.onchange = apply;
      }
      if (overlayEndBtn && overlayEndInput) {
        overlayEndBtn.onclick = () => openColorPickerAnchoredTo(overlayEndInput, overlayEndBtn, { title: 'Overlay End Color', uiInstance: this });
        const apply = (e) => { SETTINGS.optimizationOverlaySecondaryColor = e.target.value; syncPill(overlayEndBtn, e.target.value); this.app.render(); };
        overlayEndInput.oninput = apply;
        overlayEndInput.onchange = apply;
      }
      if (overlayThickness) {
        const apply = (e) => { SETTINGS.optimizationOverlayWidth = Math.max(0.05, Math.min(1, parseFloat(e.target.value) || 0.2)); this.app.render(); };
        overlayThickness.oninput = apply;
        overlayThickness.onchange = apply;
      }
    }

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
