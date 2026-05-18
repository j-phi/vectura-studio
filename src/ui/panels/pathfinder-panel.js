/**
 * Vectura Pathfinder panel.
 *
 * Sibling of the Align panel inside the Multiple-Selection pane. Wires the
 * Shape Modes (Unite, Minus Front, Intersect, Exclude) and the destructive
 * Pathfinders row (Divide, Trim, Merge, Crop, Outline, Minus Back) against
 * Vectura.PathfinderOps.
 *
 * Init is triggered from main.js after App boots. `app.ui.refreshPathfinderPanel`
 * is exposed so selection-change callbacks can refresh button state without
 * coupling to the legacy UI prototype.
 *
 * Source-geometry toggle: SETTINGS.pathfinderMode persists across sessions
 * (default 'silhouette').
 *
 * Collapse: the Pathfinder subpanel is now a top-level .left-panel-section
 * (#left-section-multi-pathfinder); its outer header is wired by
 * MultiSelectionPanel.initCollapsibleSections, so this module no longer
 * manages collapse state directly.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const SHAPE_MODE_OPS = new Set(['unite', 'minusFront', 'intersect', 'exclude']);
  const PATHFINDER_OPS = new Set(['divide', 'trim', 'merge', 'crop', 'outline', 'minusBack']);

  const OP_LABELS = {
    unite: 'Unite', minusFront: 'Minus Front', intersect: 'Intersect', exclude: 'Exclude',
    divide: 'Divide', trim: 'Trim', merge: 'Merge', crop: 'Crop', outline: 'Outline', minusBack: 'Minus Back',
  };

  const PATHFINDER_DISABLED_HINTS = {
    divide:    'Select 2+ overlapping layers to divide.',
    trim:      'Select 2+ overlapping layers to trim.',
    merge:     'Select 2+ overlapping layers to merge.',
    crop:      'Select 2+ layers; the topmost crops the rest.',
    outline:   'Select 2+ overlapping layers to outline.',
    minusBack: 'Select 2+ layers; everything below subtracts from the top.',
  };

  const ERROR_HINTS = {
    'too-many-layers':             'Divide supports up to 8 layers; please reduce the selection.',
    'front-ineligible-for-crop':   'Crop needs a closed front shape — switch to Silhouette.',
    'front-ineligible-for-minusBack': 'Minus Back needs a closed front shape — switch to Silhouette.',
  };

  function paintIcons() {
    const Icons = Vectura.Icons?.pathfinder;
    if (!Icons) return;
    document.querySelectorAll('.pf-btn[data-pf-op]').forEach((btn) => {
      const op = btn.dataset.pfOp;
      const factory = Icons[op];
      if (factory && !btn.dataset.iconPainted) {
        btn.innerHTML = factory();
        btn.dataset.iconPainted = '1';
      }
    });
  }

  function init(app) {
    if (!app) return;
    paintIcons();

    const panel = document.querySelector('.pathfinder-panel');
    if (!panel) return;

    const hintEl = document.getElementById('pathfinder-panel-hint');
    const expandBtn = panel.querySelector('[data-pf-action="expand"]');
    const modeBtns = Array.from(panel.querySelectorAll('.pf-mode-btn[data-pf-mode]'));
    const opBtns = Array.from(panel.querySelectorAll('.pf-btn[data-pf-op]'));

    const SETTINGS = Vectura.SETTINGS || {};
    const state = {
      mode: SETTINGS.pathfinderMode === 'shape-only' ? 'shape-only' : 'silhouette',
    };
    SETTINGS.pathfinderMode = state.mode;

    const setHint = (text) => { if (hintEl) hintEl.textContent = text || ''; };

    const renderer = () => app.renderer;
    const Engine = () => app.engine;

    // Walk parentId chain to find the topmost compound ancestor of a layer.
    // Returns the layer itself if it has no compound ancestor.
    const liftToCompoundAncestor = (layer) => {
      const engine = Engine();
      if (!layer || !engine?.layers) return layer;
      let cur = layer;
      let highest = layer;
      const seen = new Set();
      while (cur?.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        const parent = engine.layers.find((l) => l.id === cur.parentId);
        if (!parent) break;
        if (parent.type === 'compound') highest = parent;
        cur = parent;
      }
      return highest;
    };

    const getEligibleLayers = () => {
      const selected = renderer()?.getSelectedLayers?.() || [];
      // Lift compound descendants up to their compound ancestor so a selection
      // that includes both a compound and its hidden children still operates
      // on the compound as a single unit. Otherwise Minus Front would reparent
      // the children out of their compound and flatten it.
      const lifted = selected.map((l) => liftToCompoundAncestor(l));
      const seen = new Set();
      const unique = [];
      lifted.forEach((l) => {
        if (l && !seen.has(l.id)) { seen.add(l.id); unique.push(l); }
      });
      // Skip locked, hidden, and modifier-group containers.
      return unique.filter((l) =>
        l && l.visible !== false && (!l.isGroup || l.type === 'compound'));
    };

    const eligibleForShapeOnly = (layers) => {
      const PO = Vectura.PathfinderOps;
      if (!PO) return [];
      return layers.filter((l) => PO.shapeOnlyEligibility(l).ok);
    };

    const paintModeButtons = () => {
      modeBtns.forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.dataset.pfMode === state.mode ? 'true' : 'false');
      });
    };

    const getSelectedCompound = () => {
      const selected = renderer()?.getSelectedLayers?.() || [];
      return selected.length === 1 && selected[0]?.type === 'compound' ? selected[0] : null;
    };

    const refresh = () => {
      const selected = renderer()?.getSelectedLayers?.() || [];
      const compound = getSelectedCompound();
      const eligibleAll = getEligibleLayers();
      const usableInMode = state.mode === 'shape-only'
        ? eligibleForShapeOnly(eligibleAll)
        : eligibleAll;

      // Shape-mode buttons are enabled either when 2+ layers are selected
      // (create-compound path) or when a single compound is selected
      // (change-opType path).
      const shapeModesEnabled = Boolean(compound) || usableInMode.length >= 2;
      // Pathfinder row enabled when 2+ eligible (after mode filter); a single
      // compound does NOT enable them (user must Expand first per PRD §3).
      const pathfindersEnabled = !compound && usableInMode.length >= 2;
      const activeOp = compound?.compound?.opType || null;
      opBtns.forEach((btn) => {
        const op = btn.dataset.pfOp;
        if (SHAPE_MODE_OPS.has(op)) {
          btn.disabled = !shapeModesEnabled;
          btn.setAttribute('aria-pressed', activeOp && activeOp === op ? 'true' : 'false');
        } else if (PATHFINDER_OPS.has(op)) {
          btn.disabled = !pathfindersEnabled;
        }
      });

      // Expand: enabled only when exactly one compound layer is selected.
      if (expandBtn) expandBtn.disabled = !compound;

      // Hint messaging. Pathfinder-row-specific hints override shape-mode
      // hints when no shape-mode action is possible AND the user's selection
      // suggests they wanted a Pathfinder op.
      if (compound) {
        // Single compound selected — Shape Modes can change op, but Pathfinders
        // are blocked. Show the Pathfinder-block hint (per PRD §3 universal rule).
        setHint('Expand the compound shape first to use Pathfinders.');
      } else if (selected.length < 2) {
        setHint('Select 2+ layers to combine.');
      } else if (state.mode === 'shape-only' && usableInMode.length < 2) {
        const ineligible = eligibleAll.length - usableInMode.length;
        setHint(ineligible > 0
          ? `Shape-Only needs 2+ closed shapes. Switch to Silhouette to include ${ineligible} other layer${ineligible === 1 ? '' : 's'}.`
          : 'Shape-Only needs 2+ closed shapes.');
      } else {
        setHint('');
      }

      paintModeButtons();
    };

    app.ui = app.ui || {};
    app.ui.refreshPathfinderPanel = refresh;

    // Mode toggle.
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = btn.dataset.pfMode === 'shape-only' ? 'shape-only' : 'silhouette';
        if (next === state.mode) return;
        state.mode = next;
        SETTINGS.pathfinderMode = next;
        app.persistPreferencesDebounced?.();
        refresh();
      });
    });

    // Shape Mode buttons + destructive Pathfinder ops.
    opBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        const op = btn.dataset.pfOp;
        const PO = Vectura.PathfinderOps;
        if (!PO) return;

        // Destructive Pathfinder-row dispatch (Divide / Trim / Merge / Crop /
        // Outline / Minus Back). Wraps the op in pushHistory → mutate → render.
        if (PATHFINDER_OPS.has(op)) {
          const layers = getEligibleLayers();
          const usable = state.mode === 'shape-only' ? eligibleForShapeOnly(layers) : layers;
          if (usable.length < 2) {
            setHint(PATHFINDER_DISABLED_HINTS[op] || 'Select 2+ layers.');
            return;
          }
          if (typeof PO.applyPathfinder !== 'function') {
            setHint(`${OP_LABELS[op]} is unavailable.`);
            return;
          }
          // Push history BEFORE mutation so undo restores pre-op state. If the
          // op turns out to be a no-op (null/error), pop the snapshot via undo
          // semantics: we can't directly pop, so we only push if the op
          // succeeded — call first, then push around a re-execution? No — that
          // would mutate twice. Instead: snapshot, call, and if no-op, undo
          // the snapshot. Simpler: push first, call, and on no-op call
          // app.undo?.() to roll back (harmless since we just pushed).
          app.pushHistory?.();
          const result = PO.applyPathfinder(app.engine, usable, op, state.mode);
          if (result === null) {
            // Empty geometry — roll back the history push and hint.
            app.undo?.();
            setHint(`${OP_LABELS[op]} produced no geometry.`);
            return;
          }
          if (result && result.error) {
            app.undo?.();
            setHint(ERROR_HINTS[result.error] || `${OP_LABELS[op]} failed.`);
            return;
          }
          // Success.
          app.engine.computeAllDisplayGeometry?.();
          if (result && result.groupId && renderer()?.setSelection) {
            renderer().setSelection([result.groupId]);
          } else if (result && Array.isArray(result.layerIds) && result.layerIds.length && renderer()?.setSelection) {
            // Minus Back returns a single layer (no group) — select it.
            renderer().setSelection(result.layerIds);
          }
          app.render?.();
          if (app.ui?.renderLayers) app.ui.renderLayers();
          if (app.ui?.refreshAlignPanel) app.ui.refreshAlignPanel();
          refresh();
          setHint('');
          return;
        }

        if (!SHAPE_MODE_OPS.has(op)) return;

        // Change-op-type path: a single existing compound is selected → mutate
        // its opType in place and recompute, no new layer.
        const compound = getSelectedCompound();
        if (compound) {
          if (compound.compound?.opType === op) { refresh(); return; }
          app.pushHistory?.();
          compound.compound = compound.compound || {};
          compound.compound.opType = op;
          PO.recomputeCompound?.(compound, Engine());
          Engine().computeAllDisplayGeometry?.();
          app.render?.();
          if (app.ui?.renderLayers) app.ui.renderLayers();
          refresh();
          return;
        }

        // Create-compound path: 2+ layers selected.
        const layers = getEligibleLayers();
        const usable = state.mode === 'shape-only' ? eligibleForShapeOnly(layers) : layers;
        if (usable.length < 2) {
          setHint(state.mode === 'shape-only'
            ? 'Shape-Only needs 2+ closed shapes.'
            : 'Select 2+ layers to combine.');
          return;
        }
        if (!PO.createCompound) return;

        app.pushHistory?.();
        const compoundId = PO.createCompound(Engine(), usable, op, state.mode);
        if (!compoundId) {
          setHint('Could not create compound shape.');
          return;
        }
        Engine().computeAllDisplayGeometry?.();
        // Select the new compound (and only the compound).
        if (renderer()?.setSelection) {
          renderer().setSelection([compoundId]);
        } else if (Engine()) {
          Engine().activeLayerId = compoundId;
        }
        app.render?.();
        if (app.ui?.renderLayers) app.ui.renderLayers();
        if (app.ui?.refreshAlignPanel) app.ui.refreshAlignPanel();
        refresh();
        setHint('');
      });
    });

    // Expand.
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (expandBtn.disabled) return;
        const selected = renderer()?.getSelectedLayers?.() || [];
        if (selected.length !== 1 || selected[0]?.type !== 'compound') return;
        app.pushHistory?.();
        Vectura.PathfinderOps.expand(Engine(), selected[0]);
        Engine().computeAllDisplayGeometry?.();
        app.render?.();
        if (app.ui?.renderLayers) app.ui.renderLayers();
        refresh();
      });
    }

    refresh();
  }

  UI.PathfinderPanel = { init };
})();
