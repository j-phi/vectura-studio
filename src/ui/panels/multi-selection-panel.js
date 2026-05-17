/**
 * Vectura multi-selection (Align/Distribute) panel.
 *
 * Activates in the left pane whenever 2+ layers are selected, replacing the
 * Algorithm-Configuration section with an Illustrator-style Align panel:
 *
 *   - 6 Align buttons (L/CH/R/T/CV/B)
 *   - 6 Distribute buttons (V T/C/B + H L/C/R)
 *   - 2 Distribute Spacing buttons + numeric input (mm)
 *   - 3 Align-To targets (Selection / Artboard / Key Object)
 *
 * Math lives in window.Vectura.AlignOps (pure, headless-testable). This module
 * is a thin view: it wires DOM, reads the selection from renderer, resolves
 * the artboard rect from engine.currentProfile, and calls
 * engine.applyAlignDeltas() inside a pushHistory() bracket so each click is
 * one undo step.
 *
 * Init is triggered from main.js after App boots. `app.ui.refreshAlignPanel`
 * is exposed so the existing selection-change callback can keep the
 * Align-To button states in sync without coupling this module to the
 * legacy UI prototype.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const ALIGN_OPS = new Set([
    'alignLeft', 'alignCenterH', 'alignRight',
    'alignTop',  'alignCenterV', 'alignBottom',
  ]);
  const DISTRIBUTE_OPS = new Set([
    'distributeLeft', 'distributeCenterH', 'distributeRight',
    'distributeTop',  'distributeCenterV', 'distributeBottom',
  ]);
  const SPACING_OPS = new Set(['distributeSpacingH', 'distributeSpacingV']);

  function $(id) { return document.getElementById(id); }

  function paintIcons() {
    const Icons = Vectura.Icons?.align;
    if (!Icons) return;
    document.querySelectorAll('.align-btn[data-align-op]').forEach((btn) => {
      const op = btn.dataset.alignOp;
      const factory = Icons[op];
      if (factory && !btn.dataset.iconPainted) {
        btn.innerHTML = factory();
        btn.dataset.iconPainted = '1';
      }
    });
    const targets = { artboard: 'targetArtboard', selection: 'targetSelection', key: 'targetKey' };
    document.querySelectorAll('.align-target-btn[data-align-to]').forEach((btn) => {
      const key = btn.dataset.alignTo;
      const factory = Icons[targets[key]];
      if (factory && !btn.dataset.iconPainted) {
        btn.innerHTML = factory();
        btn.dataset.iconPainted = '1';
      }
    });
  }

  function init(app) {
    if (!app) return;
    paintIcons();

    const section = $('left-section-multi-selection');
    if (!section) return;

    const state = {
      alignTo: 'selection',
      // spacing value is read fresh from the slider on each click; no need to mirror here.
    };

    const hintEl = $('align-panel-hint');
    const spacingSlider = $('inp-align-spacing');
    const spacingChip = $('align-spacing-chip');
    const spacingWrap = spacingSlider?.closest('.sld-fx-wrap');

    const syncSpacingFill = () => {
      if (!spacingSlider) return;
      const pct = ((Number(spacingSlider.value) - Number(spacingSlider.min)) /
        (Number(spacingSlider.max) - Number(spacingSlider.min))) * 100;
      const fill = pct + '%';
      spacingSlider.style.setProperty('--fill', fill);
      if (spacingWrap) spacingWrap.style.setProperty('--fill', fill);
    };

    if (spacingSlider) {
      spacingSlider.addEventListener('input', () => {
        if (spacingChip) spacingChip.value = spacingSlider.value;
        syncSpacingFill();
      });
    }
    if (spacingChip) {
      spacingChip.addEventListener('blur', () => {
        const v = Math.max(0, Math.min(100, Number(spacingChip.value) || 0));
        spacingChip.value = String(v);
        if (spacingSlider) { spacingSlider.value = String(v); syncSpacingFill(); }
      });
      spacingChip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); spacingChip.blur(); }
        else if (e.key === 'Escape') {
          spacingChip.value = spacingSlider?.value ?? '0';
          spacingChip.blur();
        }
      });
    }
    syncSpacingFill();

    const setHint = (text) => {
      if (hintEl) hintEl.textContent = text || '';
    };

    const renderer = () => app.renderer;
    const engine = () => app.engine;

    const boundsFor = (layer) => renderer().getLayerBounds(layer);

    const getEligibleLayers = () => {
      const selected = renderer()?.getSelectedLayers?.() || [];
      // Skip locked, hidden, and group containers — Illustrator parity.
      return selected.filter((l) => l && l.visible !== false && !l.isGroup);
    };

    const updateAlignToButtons = () => {
      const keyId = renderer()?.keyObjectId;
      document.querySelectorAll('.align-target-btn[data-align-to]').forEach((btn) => {
        const mode = btn.dataset.alignTo;
        const isActive = mode === state.alignTo;
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (mode === 'key') {
          btn.disabled = !keyId;
          if (!keyId && isActive) state.alignTo = 'selection';
        }
      });
      // Re-evaluate after possible alignTo reset.
      document.querySelectorAll('.align-target-btn[data-align-to]').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.dataset.alignTo === state.alignTo ? 'true' : 'false');
      });
      // Spacing requires a key object (Illustrator parity).
      const spacingDisabled = !keyId;
      document.querySelectorAll('.align-btn[data-align-op]').forEach((btn) => {
        const op = btn.dataset.alignOp;
        if (SPACING_OPS.has(op)) btn.disabled = spacingDisabled;
      });
      if (spacingSlider) spacingSlider.disabled = spacingDisabled;
      if (spacingChip) spacingChip.disabled = spacingDisabled;
      if (spacingDisabled && state.alignTo !== 'key') {
        setHint('Tip: click a selected layer to set it as the key object — needed for distribute spacing.');
      } else {
        setHint('');
      }
    };

    const paneTitleEl = document.querySelector('#left-pane .pane-title');
    const defaultPaneTitle = paneTitleEl?.textContent || 'GENERATOR';

    const refresh = () => {
      const selected = renderer()?.getSelectedLayers?.() || [];
      const isMulti = selected.length > 1;
      section.style.display = isMulti ? '' : 'none';
      if (paneTitleEl) {
        paneTitleEl.textContent = isMulti ? 'MULTIPLE SELECTION' : defaultPaneTitle;
      }
      if (!isMulti) return;
      updateAlignToButtons();
    };

    app.ui = app.ui || {};
    app.ui.refreshAlignPanel = refresh;

    // Wire Align-To buttons
    document.querySelectorAll('.align-target-btn[data-align-to]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const mode = btn.dataset.alignTo;
        if (mode === 'key' && !renderer()?.keyObjectId) {
          setHint('To set a key object, click a layer that is already part of the selection.');
          return;
        }
        state.alignTo = mode;
        updateAlignToButtons();
      });
    });

    // Wire Align / Distribute buttons
    document.querySelectorAll('.align-btn[data-align-op]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const op = btn.dataset.alignOp;
        const layers = getEligibleLayers();
        if (layers.length < 2) {
          setHint('Select 2+ unlocked layers to align or distribute.');
          return;
        }
        const profile = engine().currentProfile;
        const opts = {
          mode: state.alignTo,
          keyId: renderer()?.keyObjectId || null,
          artboard: { width: profile.width, height: profile.height },
        };

        const AO = Vectura.AlignOps;
        if (!AO) return;

        let deltas = null;
        if (ALIGN_OPS.has(op)) {
          deltas = AO.align(op, layers, boundsFor, opts);
        } else if (DISTRIBUTE_OPS.has(op)) {
          if (layers.length < 3 && state.alignTo === 'selection') {
            setHint('Distribute needs 3+ layers when aligning to Selection.');
            return;
          }
          deltas = AO.distribute(op, layers, boundsFor, opts);
        } else if (SPACING_OPS.has(op)) {
          if (!opts.keyId) {
            setHint('Distribute Spacing requires a key object.');
            return;
          }
          opts.spacing = Number(spacingSlider?.value) || 0;
          deltas = AO.distributeSpacing(op, layers, boundsFor, opts);
        } else {
          return;
        }

        const touched = deltas && Object.keys(deltas).length > 0;
        if (!touched) {
          setHint('Nothing to move.');
          return;
        }
        app.pushHistory?.();
        engine().applyAlignDeltas(deltas);
        app.render?.();
        if (app.ui?.renderLayers) app.ui.renderLayers();
        setHint('');
      });
    });

    refresh();
  }

  UI.MultiSelectionPanel = { init };
})();
