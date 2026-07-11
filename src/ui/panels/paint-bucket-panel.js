/**
 * Vectura Paint Bucket panel.
 *
 * Renders the contextual fill-options UI in the left pane while the paint
 * bucket tool is active. State lives in `SETTINGS.paintBucket` (persisted)
 * and is mirrored into a local `state.fillParams` bag. The renderer pulls
 * live params via `app.paintBucketPanel.getFillParams()` when pouring.
 *
 * Mirrors the pattern designer's fill control surface (see
 * src/ui/ui-fill-panel.js) but writes back to its own state bag instead of
 * a layer's params. Distance-bearing params (dot length, padding, shifts)
 * are stored canonically in millimetres; the UI converts to/from the active
 * document unit (mm or in) so values are sensible regardless of doc unit.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  // The variant grid + per-variant controls are rendered by the shared
  // Vectura.UI.FillControlSurface (src/ui/fill-control-surface.js); this panel
  // owns only the surrounding chrome (scope, pens, sensitivity, status, expand)
  // and the fill-record ↔ params mapping. FILL_TYPE_OPTIONS and the variant
  // schema now live in that one module so the Type Fill tab renders identically.

  const DEFAULTS = {
    fillMode: 'hatch',
    fillScope: 'all-objects',
    fillDensity: 1,
    fillAngle: 45,
    fillAmplitude: 1.0,
    fillDotLength: 0.5,       // mm; 0.5 default gives visible non-circle shapes
    fillDotRotation: 0,       // degrees, orients elongated dot
    fillPadding: 0,           // mm
    fillShiftX: 0,            // mm
    fillShiftY: 0,            // mm
    fillDotPattern: 'brick',
    fillDotShape: 'circle',
    fillDotJitter: 0,
    fillLineCount: 1,
    fillAxes: 3,
    fillPolyTile: 'grid',
    fillPolyPadding: 0,
    fillPolyRotation: 0,
    fillPolyRotationStep: 0,
    fillPolyScale: 1,
    fillWaveSmoothing: 1.0,
    fillWaveFrequency: 1.0,
    fillSpiralTightness: 1,
    fillSpiralDirection: 'cw',
    fillRadialSkip: 0,
    fillContourDirection: 'inset',
    fillContourStepVariance: 0,
    fillContourSimplify: 0.05,
    fillContourCenterPadding: 0,
    // B3 Truchet
    fillTruchetTileSet: 'quarter-arcs',
    fillTruchetTileSize: 6,
    fillTruchetSeed: 1,
    fillTruchetRotations: 4,
    // B4 Maze
    fillMazeCellSize: 5,
    fillMazeAlgorithm: 'dfs',
    fillMazeBranchBias: 0.5,
    fillMazeSeed: 1,
    fillMazeWallMode: 'walls',
    // B8 Stripes
    fillStripeBandWidth: 4,
    fillStripeGap: 2,
    fillStripeAngle: 0,
    fillStripePrimary: 'hatch',
    fillStripeSecondary: 'none',
    fillStripeSecondaryDensity: 2,
    // B10 Weave
    fillWeavePattern: 'plain',
    fillWeaveStrandWidth: 1.5,
    fillWeaveGap: 0.3,
    fillWeaveAngle: 0,
    fillWeaveOver: 1,
    fillWeaveUnder: 1,
    fillSensitivity: 5,
    penId: null,
  };

  function persistAndRedraw(state) {
    const SETTINGS = Vectura.SETTINGS || {};
    SETTINGS.paintBucket = { ...state.fillParams };
    state.app?.persistPreferencesDebounced?.();
    // When loading params from an adopted fill we deliberately skip the
    // retarget call so the fill record isn't rewritten with the panel's
    // pre-load state during the snap.
    if (!state._suppressRetarget) {
      // Retarget the active batch — when the user tweaks a slider/variant
      // after pouring, those records pick up the new values in place.
      // updateLastPaintedFills() recomputes display geometry when anything
      // changes; otherwise we still draw() to reflect preview state.
      state.app?.renderer?.updateLastPaintedFills?.(state.fillParams);
    }
    state.app?.renderer?.draw?.();
  }

  function populatePens(state) {
    const sel = document.getElementById('paint-bucket-pen');
    if (!sel) return;
    const SETTINGS = Vectura.SETTINGS || {};
    const pens = Array.isArray(SETTINGS.pens) ? SETTINGS.pens : [];
    sel.innerHTML = '';
    pens.forEach((pen) => {
      const opt = document.createElement('option');
      opt.value = pen.id;
      opt.textContent = pen.name ? `${pen.name}` : `${pen.id}`;
      sel.appendChild(opt);
    });
    if (state.fillParams.penId && pens.some((p) => p.id === state.fillParams.penId)) {
      sel.value = state.fillParams.penId;
    } else if (pens[0]) {
      state.fillParams.penId = pens[0].id;
      sel.value = pens[0].id;
    }
    sel.addEventListener('change', () => {
      state.fillParams.penId = sel.value;
      persistAndRedraw(state);
    });
  }

  function bindScopeToggle(state) {
    const toggle = document.getElementById('paint-bucket-scope-toggle');
    if (!toggle) return;
    const buttons = Array.from(toggle.querySelectorAll('.pb-scope-btn'));
    const current = state.fillParams.fillScope || 'all-objects';
    buttons.forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.pbScope === current ? 'true' : 'false');
    });
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.pbScope;
        if (state.fillParams.fillScope === scope) return;
        state.fillParams.fillScope = scope;
        buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.pbScope === scope ? 'true' : 'false'));
        persistAndRedraw(state);
        // Clear the hover stack so the next mousemove recomputes with new scope.
        state.app?.renderer?.clearPaintBucketHoverState?.();
      });
    });
  }

  function bindSensitivity(state) {
    // Replace the static index.html slider + chip with the shared UI.Slider
    // component (gradient fill, release halo, editable chip, dblclick reset).
    // The static ids are re-applied to the component's elements so external
    // automation keeps working.
    const staticInput = document.getElementById('paint-bucket-sensitivity');
    if (!staticInput || typeof UI.Slider !== 'function') return;
    const row = staticInput.closest('.paint-bucket-row');
    const staticWrap = staticInput.closest('.sld-fx-wrap');
    const staticChip = document.getElementById('paint-bucket-sensitivity-chip');
    if (!row || !staticWrap) return;
    const inst = UI.Slider(null, {
      value: Number(state.fillParams.fillSensitivity ?? DEFAULTS.fillSensitivity),
      min: 0.1, max: 20, step: 0.1,
      ariaLabel: 'Sensitivity',
      defaultValue: DEFAULTS.fillSensitivity,
      format: (v) => `${v}`,
      parse: (text) => Number(`${text}`.replace(/[^\d.\-]/g, '')),
      onChange: (v) => {
        if (!Number.isFinite(v)) return;
        state.fillParams.fillSensitivity = v;
        persistAndRedraw(state);
      },
    });
    staticWrap.remove();
    staticChip?.remove();
    inst.el.style.gridColumn = '2 / span 2';
    const rangeInput = inst.el.querySelector('input[type="range"]');
    if (rangeInput) rangeInput.id = 'paint-bucket-sensitivity';
    const chipEl = inst.el.querySelector('.slider-val');
    if (chipEl) chipEl.id = 'paint-bucket-sensitivity-chip';
    const wrapEl = inst.el.querySelector('.sld-fx-wrap');
    if (wrapEl) wrapEl.classList.add('paint-bucket-slider-wrap');
    row.appendChild(inst.el);
    state.sensitivitySlider = inst;
  }

  function setHint(text) {
    const el = document.getElementById('paint-bucket-panel-hint');
    if (el) el.textContent = text || '';
  }

  // Maps a fill record (canonical layer storage) back to the panel's
  // fillParams shape. Inverse of buildFillRecord() in paint-bucket-ops.js.
  function fillRecordToParams(rec) {
    if (!rec) return null;
    // Legacy fill records used `dotSize` as a ratio (0.1–3.0). When loading
    // those we leave the new `fillDotLength` at 0 (single point) unless the
    // record carries an explicit `dotLength` field.
    const legacyDotLen = rec.dotLength != null ? rec.dotLength : 0;
    // C1 migration: legacy 'wavelines' / 'zigzag' map to 'wave' with smoothing.
    // C2 migration: legacy 'stipple' / 'grid'  map to 'dots' with shape.
    let fillMode = rec.fillType ?? 'hatch';
    let waveSmoothing = rec.waveSmoothing;
    let waveFrequency = rec.waveFrequency;
    let dotShape = rec.dotShape;
    let dotPatternResolved = rec.dotPattern;
    let lineCount = rec.lineCount;
    if (fillMode === 'wavelines') {
      fillMode = 'wave';
      if (waveSmoothing == null) waveSmoothing = 1.0;
      if (waveFrequency == null) waveFrequency = 1.0;
    } else if (fillMode === 'zigzag') {
      fillMode = 'wave';
      if (waveSmoothing == null) waveSmoothing = 0.0;
      if (waveFrequency == null) waveFrequency = 1.0;
    } else if (fillMode === 'stipple') {
      fillMode = 'dots';
      if (dotShape == null) dotShape = 'circle';
    } else if (fillMode === 'grid') {
      fillMode = 'dots';
      if (dotShape == null) dotShape = 'tick';
      dotPatternResolved = 'grid';
    } else if (fillMode === 'crosshatch') {
      fillMode = 'hatch';
      if (lineCount == null) lineCount = 2;
    } else if (fillMode === 'triaxial') {
      fillMode = 'hatch';
      if (lineCount == null) lineCount = 3;
    }
    return {
      fillMode,
      fillWaveSmoothing: waveSmoothing,
      fillWaveFrequency: waveFrequency,
      fillDotShape: dotShape,
      fillDotJitter: rec.dotJitter,
      fillLineCount: lineCount,
      fillDensity: rec.density,
      fillAngle: rec.angle,
      fillAmplitude: rec.amplitude,
      fillDotLength: legacyDotLen,
      fillDotRotation: rec.dotRotation ?? 0,
      fillPadding: rec.padding,
      fillShiftX: rec.shiftX,
      fillShiftY: rec.shiftY,
      fillDotPattern: dotPatternResolved,
      fillAxes: rec.axes,
      fillPolyTile: rec.polyTile,
      fillPolyPadding: rec.polyPadding,
      fillPolyRotation: rec.polyRotation,
      fillPolyRotationStep: rec.polyRotationStep,
      fillPolyScale: rec.polyScale ?? 1,
      fillSpiralTightness: rec.spiralTightness,
      fillSpiralDirection: rec.spiralDirection,
      fillRadialSkip: rec.radialSkip,
      fillContourDirection: rec.contourDirection,
      fillContourStepVariance: rec.contourStepVariance,
      fillContourSimplify: rec.contourSimplify,
      fillContourCenterPadding: rec.contourCenterPadding ?? 0,
      // B3 Truchet
      fillTruchetTileSet: rec.truchetTileSet,
      fillTruchetTileSize: rec.truchetTileSize,
      fillTruchetSeed: rec.truchetSeed,
      fillTruchetRotations: rec.truchetRotations,
      // B4 Maze
      fillMazeCellSize: rec.mazeCellSize,
      fillMazeAlgorithm: rec.mazeAlgorithm,
      fillMazeBranchBias: rec.mazeBranchBias,
      fillMazeSeed: rec.mazeSeed,
      fillMazeWallMode: rec.mazeWallMode,
      // B8 Stripes
      fillStripeBandWidth: rec.stripeBandWidth,
      fillStripeGap: rec.stripeGap,
      fillStripeAngle: rec.stripeAngle,
      fillStripePrimary: rec.stripePrimary,
      fillStripeSecondary: rec.stripeSecondary,
      fillStripeSecondaryDensity: rec.stripeSecondaryDensity,
      // B10 Weave
      fillWeavePattern: rec.weavePattern,
      fillWeaveStrandWidth: rec.weaveStrandWidth,
      fillWeaveGap: rec.weaveGap,
      fillWeaveAngle: rec.weaveAngle,
      fillWeaveOver: rec.weaveOver,
      fillWeaveUnder: rec.weaveUnder,
      fillSensitivity: rec.sensitivity,
      penId: rec.penId,
    };
  }

  function loadParamsFromFill(state, rec) {
    const incoming = fillRecordToParams(rec);
    if (!incoming) return;
    // Merge — keep keys the fill record didn't carry (e.g. unrelated future
    // params) at their current value.
    Object.keys(incoming).forEach((k) => {
      if (incoming[k] !== undefined) state.fillParams[k] = incoming[k];
    });
    state._suppressRetarget = true;
    try {
      // Re-render the variant grid + slider controls so the DOM mirrors the
      // adopted fill. Then persist the new template to SETTINGS without
      // retargeting (the fill IS already at these params).
      state.surface?.refresh();
      const penSel = document.getElementById('paint-bucket-pen');
      if (penSel && state.fillParams.penId) penSel.value = state.fillParams.penId;
      if (state.sensitivitySlider && state.fillParams.fillSensitivity != null) {
        state.sensitivitySlider.setValue(Number(state.fillParams.fillSensitivity), { silent: true });
      }
      const SETTINGS = Vectura.SETTINGS || {};
      SETTINGS.paintBucket = { ...state.fillParams };
      state.app?.persistPreferencesDebounced?.();
    } finally {
      state._suppressRetarget = false;
    }
  }

  function setSampleEmptyMode(active) {
    const panel = document.getElementById('paint-bucket-panel');
    const notice = document.getElementById('paint-bucket-sample-empty');
    if (!panel || !notice) return;
    panel.classList.toggle('is-sampling-empty', !!active);
    notice.hidden = !active;
  }

  function updateStatusChip(activeCount) {
    const chip = document.getElementById('paint-bucket-status-chip');
    const text = document.getElementById('paint-bucket-status-chip-text');
    if (!chip) return;
    if (activeCount > 0) {
      chip.hidden = false;
      if (text) text.textContent = `Editing ${activeCount} fill${activeCount === 1 ? '' : 's'}`;
    } else {
      chip.hidden = true;
    }
  }

  function bindStatusChip(state) {
    const btn = document.getElementById('paint-bucket-status-chip-done');
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.app?.renderer?.commitActiveBatch?.();
    });
  }

  function getActiveExpandTarget(state) {
    const engine = state.app?.engine;
    if (!engine) return null;
    const layer = engine.getActiveLayer?.() || null;
    if (!layer || layer.isGroup) return null;
    if (!Array.isArray(layer.fills) || !layer.fills.length) return null;
    return layer;
  }

  function updateExpandButton(state) {
    const btn = document.getElementById('paint-bucket-expand-btn');
    if (!btn) return;
    const target = getActiveExpandTarget(state);
    btn.disabled = !target;
    btn.title = target
      ? `Expand ${target.fills.length} fill${target.fills.length === 1 ? '' : 's'} into a group`
      : 'Select a layer with paint-bucket fills to enable';
  }

  function bindExpandButton(state) {
    const btn = document.getElementById('paint-bucket-expand-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const target = getActiveExpandTarget(state);
      if (!target) return;
      const PBO = Vectura.PaintBucketOps;
      if (!PBO?.expandFill) return;
      // Commit any in-progress paint-bucket batch first — the original layer
      // is now nested and its fills cleared; stale batch refs would break the
      // status chip.
      state.app?.renderer?.commitActiveBatch?.();
      state.app?.pushHistory?.();
      const result = PBO.expandFill(state.app.engine, target);
      if (!result) return;
      state.app?.setSelection?.([result.groupId], result.groupId);
      state.app?.engine?.setActiveLayerId?.(result.groupId);
      state.app?.ui?.renderLayers?.();
      state.app?.render?.();
      updateExpandButton(state);
    });
    updateExpandButton(state);
  }

  function init(app) {
    if (!app) return;
    const section = document.getElementById('left-section-paint-bucket');
    if (!section) return;

    const SETTINGS = Vectura.SETTINGS || {};
    const persisted = SETTINGS.paintBucket || {};
    // Migrate legacy `fillDotSize` (ratio) → keep new `fillDotLength` at 0
    // unless the user had explicitly stored a length value.
    const merged = { ...DEFAULTS, ...persisted };
    if (persisted.fillDotLength == null && persisted.fillDotSize != null) {
      merged.fillDotLength = 0; // reset; legacy ratio is no longer meaningful
    }
    delete merged.fillDotSize;
    const state = {
      app,
      fillParams: merged,
    };

    const controlsEl = document.getElementById('paint-bucket-controls');
    const gridEl = document.getElementById('paint-bucket-variant-grid');

    // The variant grid + per-variant controls come from the shared surface.
    // The bucket owns no history stack for slider tweaks (its history is driven
    // by pour/retarget), so onEdit is a no-op; every value write persists the
    // template + retargets the live batch + redraws via persistAndRedraw.
    state.surface = Vectura.UI.FillControlSurface.mount({
      gridEl,
      controlsEl,
      params: state.fillParams,
      typeKey: 'fillMode',
      idPrefix: 'pb',
      defaults: DEFAULTS,
      onChange: () => persistAndRedraw(state),
    });

    populatePens(state);
    bindScopeToggle(state);
    bindSensitivity(state);
    bindStatusChip(state);
    bindExpandButton(state);
    updateStatusChip(0);

    const refresh = () => {
      state.surface?.refresh();
      updateExpandButton(state);
    };

    app.ui = app.ui || {};
    app.ui.refreshPaintBucketPanel = refresh;
    app.ui.setPaintBucketHint = setHint;
    app.paintBucketPanel = {
      getFillParams: () => ({ ...state.fillParams }),
      setHint,
      loadParamsFromFill: (rec) => loadParamsFromFill(state, rec),
      setNoFillMode: () => {
        state.fillParams.fillMode = 'none';
        state._suppressRetarget = true;
        try {
          state.surface?.refresh();
          const SETTINGS = Vectura.SETTINGS || {};
          SETTINGS.paintBucket = { ...state.fillParams };
          state.app?.persistPreferencesDebounced?.();
        } finally {
          state._suppressRetarget = false;
        }
      },
      onBatchStateChange: ({ activeCount = 0 } = {}) => {
        updateStatusChip(activeCount);
        updateExpandButton(state);
      },
      setSampleEmptyMode,
      updateExpandButton: () => updateExpandButton(state),
    };
  }

  UI.PaintBucketPanel = { init };
})();
