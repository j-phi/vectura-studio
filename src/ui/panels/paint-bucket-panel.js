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

  const FILL_TYPE_OPTIONS = [
    { value: 'none',       label: 'None' },
    { value: 'hatch',      label: 'Hatch' },
    { value: 'wave',       label: 'Wave' },
    { value: 'dots',       label: 'Dots' },
    { value: 'contour',    label: 'Contour' },
    { value: 'spiral',     label: 'Spiral' },
    { value: 'radial',     label: 'Radial' },
    { value: 'polygonal',  label: 'Polygonal' },
    { value: 'truchet',    label: 'Truchet' },
    { value: 'maze',       label: 'Maze' },
    { value: 'stripes',    label: 'Stripes' },
    { value: 'weave',      label: 'Weave' },
  ];

  const DEFAULTS = {
    fillMode: 'hatch',
    fillScope: 'all-objects',
    fillDensity: 1,
    fillAngle: 45,
    fillAmplitude: 1.0,
    fillDotLength: 0,         // mm; 0 = single point, up to 10mm
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
    fillPolyScaleStep: 0,
    fillRadialCentralDensity: 1.0,
    fillRadialOuterDiameter: 1.0,
    fillWaveSmoothing: 1.0,
    fillWaveFrequency: 1.0,
    fillSpiralTurns: 8,
    fillSpiralTightness: 0.5,
    fillSpiralDirection: 'cw',
    fillRadialSpokes: 36,
    fillRadialSkip: 0,
    fillContourDirection: 'inset',
    fillContourStepVariance: 0,
    fillContourSimplify: 0.05,
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

  // Distance-bearing params persisted in mm; the panel converts to/from
  // doc units at display time.
  const DISTANCE_PARAMS = new Set(['fillDotLength', 'fillPadding', 'fillShiftX', 'fillShiftY']);

  const getDocUnits = () => {
    const UU = Vectura.UnitUtils || {};
    const settings = Vectura.SETTINGS || {};
    return UU.normalizeDocumentUnits ? UU.normalizeDocumentUnits(settings.documentUnits) : 'metric';
  };
  const getUnitLabel = () => {
    const UU = Vectura.UnitUtils || {};
    return UU.getDocumentUnitLabel ? UU.getDocumentUnitLabel(getDocUnits()) : (getDocUnits() === 'imperial' ? 'in' : 'mm');
  };
  const mmToDoc = (v) => {
    const UU = Vectura.UnitUtils || {};
    if (UU.mmToDocumentUnits) return UU.mmToDocumentUnits(v, getDocUnits());
    return getDocUnits() === 'imperial' ? Number(v || 0) / 25.4 : Number(v || 0);
  };
  const docToMm = (v) => {
    const UU = Vectura.UnitUtils || {};
    if (UU.documentUnitsToMm) return UU.documentUnitsToMm(v, getDocUnits());
    return getDocUnits() === 'imperial' ? Number(v || 0) * 25.4 : Number(v || 0);
  };
  const docPrecision = () => (getDocUnits() === 'imperial' ? 3 : 2);
  const fmtDoc = (mm, digits = docPrecision()) => {
    const v = mmToDoc(mm);
    return Number.isFinite(v) ? v.toFixed(digits).replace(/\.?0+$/, '') || '0' : '0';
  };

  // Control schema for the per-variant panel section. The visibility for each
  // entry is gated by Vectura.FillPanel.FILL_CAPS[fillMode]; this lets us
  // render only the controls that apply to the currently selected variant
  // exactly as the pattern designer does.
  //
  // Range entries with `distance: true` are interpreted as millimetre values;
  // their min/max are also in mm and are translated to the active doc unit
  // for display + input. Angle entries render as div-based dials matching
  // the rest of the UI (algo-config-panel, noise-rack-panel).
  const VARIANT_CONTROLS = [
    { id: 'fillDensity',                 label: 'Density',           type: 'range',  min: 0.1,  max: 50,  step: 0.1,  showAlways: true },
    { id: 'fillAngle',                   label: 'Angle',             type: 'angle',  capKey: 'angle' },
    { id: 'fillAmplitude',               label: 'Amplitude',         type: 'range',  min: 0,    max: 5.0, step: 0.05, capKey: 'amplitude' },
    { id: 'fillDotLength',               label: 'Dot Size',          type: 'range',  min: 0,    max: 10,  step: 0.1,  distance: true, capKey: 'dotSize' },
    { id: 'fillDotRotation',             label: 'Dot Rotation',      type: 'angle',  capKey: 'dotSize', showIfDotLen: true },
    { id: 'fillPadding',                 label: 'Padding',           type: 'range',  min: 0,    max: 10,  step: 0.1,  distance: true, showAlways: true },
    { id: 'fillShiftX',                  label: 'Shift X',           type: 'range',  min: -50,  max: 50,  step: 0.5,  distance: true, capKey: 'shift' },
    { id: 'fillShiftY',                  label: 'Shift Y',           type: 'range',  min: -50,  max: 50,  step: 0.5,  distance: true, capKey: 'shift' },
    { id: 'fillDotPattern',              label: 'Dot Pattern',       type: 'select', options: [{ value: 'brick', label: 'Brick' }, { value: 'grid', label: 'Grid' }, { value: 'hex', label: 'Hex' }, { value: 'jitter', label: 'Jitter' }], capKey: 'dotPattern' },
    { id: 'fillDotShape',                label: 'Dot Shape',         type: 'select', options: [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'cross', label: 'Cross' }, { value: 'tick', label: 'Tick' }], capKey: 'dotShape' },
    { id: 'fillDotJitter',               label: 'Dot Jitter',        type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'dotJitter' },
    { id: 'fillLineCount',               label: 'Line Count',        type: 'range',  min: 1,    max: 3,   step: 1,    capKey: 'lineCount' },
    { id: 'fillAxes',                    label: 'Sides',             type: 'range',  min: 2,    max: 12,  step: 1,    capKey: 'axes' },
    { id: 'fillPolyTile',                label: 'Tile Method',       type: 'select', options: [{ value: 'grid', label: 'Grid' }, { value: 'brick', label: 'Brick' }, { value: 'hexagonal', label: 'Hexagonal' }, { value: 'off', label: 'Off (single)' }], capKey: 'polyTile' },
    { id: 'fillPolyPadding',             label: 'Poly Padding',      type: 'range',  min: 0,    max: 5,   step: 0.05, capKey: 'polyPadding' },
    { id: 'fillPolyRotation',            label: 'Poly Rotation',     type: 'angle',  capKey: 'polyRotation' },
    { id: 'fillPolyRotationStep',        label: 'Poly Rotation Step',type: 'range',  min: -45,  max: 45,  step: 0.5,  capKey: 'polyRotationStep' },
    { id: 'fillPolyScaleStep',           label: 'Poly Scale Step',   type: 'range',  min: -0.5, max: 0.5, step: 0.01, capKey: 'polyScaleStep' },
    { id: 'fillRadialCentralDensity',    label: 'Central Density',   type: 'range',  min: 0.1,  max: 4.0, step: 0.1,  capKey: 'radialCentralDensity' },
    { id: 'fillRadialOuterDiameter',     label: 'Outer Diameter',    type: 'range',  min: 0.0,  max: 2.0, step: 0.05, capKey: 'radialOuterDiameter' },
    { id: 'fillWaveSmoothing',           label: 'Wave Smoothing',    type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'waveSmoothing' },
    { id: 'fillWaveFrequency',           label: 'Wave Frequency',    type: 'range',  min: 0.25, max: 4.0, step: 0.05, capKey: 'waveFrequency' },
    { id: 'fillSpiralTurns',             label: 'Spiral Turns',      type: 'range',  min: 1,    max: 40,  step: 1,    capKey: 'spiralTurns' },
    { id: 'fillSpiralTightness',         label: 'Spiral Tightness',  type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'spiralTightness' },
    { id: 'fillSpiralDirection',         label: 'Spiral Direction',  type: 'select', options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Counterclockwise' }], capKey: 'spiralDirection' },
    { id: 'fillRadialSpokes',            label: 'Radial Spokes',     type: 'range',  min: 4,    max: 360, step: 1,    capKey: 'radialSpokes' },
    { id: 'fillRadialSkip',              label: 'Radial Skip',       type: 'range',  min: 0,    max: 5,   step: 1,    capKey: 'radialSkip' },
    { id: 'fillContourDirection',        label: 'Contour Direction', type: 'select', options: [{ value: 'inset', label: 'Inset' }, { value: 'outset', label: 'Outset' }], capKey: 'contourDirection' },
    { id: 'fillContourStepVariance',     label: 'Step Variance',     type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'contourStepVariance' },
    { id: 'fillContourSimplify',         label: 'Simplify',          type: 'range',  min: 0,    max: 0.5, step: 0.01, capKey: 'contourSimplify' },
    // B3 Truchet
    { id: 'fillTruchetTileSet',          label: 'Tile Set',          type: 'select', options: [{ value: 'quarter-arcs', label: 'Quarter Arcs' }, { value: 'diagonals', label: 'Diagonals' }, { value: 'dots-and-lines', label: 'Dots & Lines' }, { value: 'triangle-split', label: 'Triangle Split' }, { value: 'scribble', label: 'Scribble' }], capKey: 'truchetTileSet' },
    { id: 'fillTruchetTileSize',         label: 'Tile Spacing',      type: 'range',  min: 1,    max: 30,  step: 0.5,  capKey: 'truchetTileSize' },
    { id: 'fillTruchetSeed',             label: 'Seed',              type: 'range',  min: 0,    max: 999, step: 1,    capKey: 'truchetSeed' },
    { id: 'fillTruchetRotations',        label: 'Rotations',         type: 'range',  min: 1,    max: 4,   step: 1,    capKey: 'truchetRotations' },
    // B4 Maze
    { id: 'fillMazeCellSize',            label: 'Cell Spacing',      type: 'range',  min: 1,    max: 20,  step: 0.5,  capKey: 'mazeCellSize' },
    { id: 'fillMazeAlgorithm',           label: 'Algorithm',         type: 'select', options: [{ value: 'dfs', label: 'DFS' }, { value: 'wilson', label: 'Wilson' }, { value: 'eller', label: 'Eller' }, { value: 'recursive-division', label: 'Recursive Division' }], capKey: 'mazeAlgorithm' },
    { id: 'fillMazeBranchBias',          label: 'Branch Bias',       type: 'range',  min: 0,    max: 1,   step: 0.05, capKey: 'mazeBranchBias' },
    { id: 'fillMazeSeed',                label: 'Seed',              type: 'range',  min: 0,    max: 999, step: 1,    capKey: 'mazeSeed' },
    { id: 'fillMazeWallMode',            label: 'Render',            type: 'select', options: [{ value: 'walls', label: 'Walls' }, { value: 'path', label: 'Path' }, { value: 'both', label: 'Both' }], capKey: 'mazeWallMode' },
    // B8 Stripes
    { id: 'fillStripeBandWidth',         label: 'Band Spacing',      type: 'range',  min: 0.5,  max: 50,  step: 0.1,  capKey: 'stripeBandWidth' },
    { id: 'fillStripeGap',               label: 'Gap',               type: 'range',  min: 0,    max: 50,  step: 0.1,  capKey: 'stripeGap' },
    { id: 'fillStripeAngle',             label: 'Angle',             type: 'angle', capKey: 'stripeAngle' },
    { id: 'fillStripePrimary',           label: 'Primary Fill',      type: 'select', options: FILL_TYPE_OPTIONS.filter((o) => o.value !== 'none' && o.value !== 'stripes'), capKey: 'stripePrimary' },
    { id: 'fillStripeSecondary',         label: 'Secondary Fill',    type: 'select', options: FILL_TYPE_OPTIONS.filter((o) => o.value !== 'stripes'), capKey: 'stripeSecondary' },
    { id: 'fillStripeSecondaryDensity',  label: 'Secondary Density', type: 'range',  min: 0.1,  max: 10,  step: 0.1,  capKey: 'stripeSecondaryDensity' },
    // B10 Weave
    { id: 'fillWeavePattern',            label: 'Pattern',           type: 'select', options: [{ value: 'plain', label: 'Plain' }, { value: 'twill', label: 'Twill' }, { value: 'basket', label: 'Basket' }, { value: 'satin', label: 'Satin' }], capKey: 'weavePattern' },
    { id: 'fillWeaveStrandWidth',        label: 'Strand Spacing',    type: 'range',  min: 0.3,  max: 10,  step: 0.1,  capKey: 'weaveStrandWidth' },
    { id: 'fillWeaveGap',                label: 'Gap',               type: 'range',  min: 0,    max: 5,   step: 0.05, capKey: 'weaveGap' },
    { id: 'fillWeaveAngle',              label: 'Angle',             type: 'angle', capKey: 'weaveAngle' },
    { id: 'fillWeaveOver',               label: 'Over',              type: 'range',  min: 1,    max: 6,   step: 1,    capKey: 'weaveOver' },
    { id: 'fillWeaveUnder',              label: 'Under',             type: 'range',  min: 1,    max: 6,   step: 1,    capKey: 'weaveUnder' },
  ];

  function paintVariantButtons(state, controlsEl, hintEl) {
    const grid = document.getElementById('paint-bucket-variant-grid');
    if (!grid) return;
    grid.innerHTML = '';
    FILL_TYPE_OPTIONS.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pb-variant-btn';
      btn.dataset.bucketVariant = opt.value;
      btn.title = opt.label;
      btn.setAttribute('aria-label', opt.label);
      const factory = Vectura.Icons?.paintBucket?.[opt.value];
      btn.innerHTML = factory ? factory() : `<span class="pb-variant-text">${opt.label}</span>`;
      btn.setAttribute('aria-pressed', state.fillParams.fillMode === opt.value ? 'true' : 'false');
      btn.classList.toggle('active', state.fillParams.fillMode === opt.value);
      btn.addEventListener('click', () => {
        if (state.fillParams.fillMode === opt.value) return;
        state.fillParams.fillMode = opt.value;
        persistAndRedraw(state);
        renderControls(state, controlsEl, hintEl);
        refreshVariantSelection(state);
      });
      grid.appendChild(btn);
    });
  }

  function refreshVariantSelection(state) {
    const grid = document.getElementById('paint-bucket-variant-grid');
    if (!grid) return;
    Array.from(grid.querySelectorAll('.pb-variant-btn')).forEach((btn) => {
      const active = btn.dataset.bucketVariant === state.fillParams.fillMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

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

  function renderControls(state, controlsEl, hintEl) {
    if (!controlsEl) return;
    const caps = Vectura.FillPanel?.FILL_CAPS?.[state.fillParams.fillMode] || {};
    const isNone = state.fillParams.fillMode === 'none';

    if (isNone) {
      controlsEl.innerHTML = '<p class="paint-bucket-hint-inline">Pick a fill type to pour onto regions.</p>';
      return;
    }

    const dotLenActive = (state.fillParams.fillDotLength ?? 0) > 0;
    const html = VARIANT_CONTROLS
      .filter((ctrl) => {
        if (ctrl.showAlways) return true;
        return ctrl.capKey && caps[ctrl.capKey];
      })
      .map((ctrl) => {
        const hidden = ctrl.showIfDotLen && !dotLenActive;
        return renderControl(ctrl, state.fillParams[ctrl.id], hidden);
      })
      .join('');
    controlsEl.innerHTML = html;
    bindControls(state, controlsEl);
  }

  function renderControl(ctrl, value, hidden = false) {
    const hiddenAttr = hidden ? ' style="display:none"' : '';
    if (ctrl.type === 'range') {
      const distance = !!ctrl.distance;
      const min = distance ? mmToDoc(ctrl.min) : ctrl.min;
      const max = distance ? mmToDoc(ctrl.max) : ctrl.max;
      const step = distance
        ? (getDocUnits() === 'imperial' ? Math.max(0.001, ctrl.step / 25.4) : ctrl.step)
        : ctrl.step;
      const v = value != null ? value : 0;
      const displayV = distance ? mmToDoc(v) : v;
      const displayStr = distance ? fmtDoc(v) : `${displayV}`;
      const unit = distance ? getUnitLabel() : (ctrl.unit || '');
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label" for="pb-${ctrl.id}">${ctrl.label}</label>
          <div class="sld-fx-wrap paint-bucket-slider-wrap">
            <input id="pb-${ctrl.id}" class="ctrl-slider" type="range" min="${min}" max="${max}" step="${step}" value="${displayV}">
          </div>
          <input type="text" id="pb-${ctrl.id}-chip" class="slider-val" value="${displayStr}${unit ? unit : ''}" inputmode="decimal">
        </div>
      `;
    }
    if (ctrl.type === 'angle') {
      const v = Number.isFinite(value) ? value : 0;
      const display = ((v % 360) + 360) % 360;
      return `
        <div class="paint-bucket-row paint-bucket-row-angle" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label">${ctrl.label}</label>
          <div class="angle-control" data-pb-angle="${ctrl.id}">
            <div class="angle-dial" style="--angle:${(display + 90) % 360}deg;">
              <div class="angle-indicator"></div>
            </div>
          </div>
          <input type="text" id="pb-${ctrl.id}-chip" class="slider-val" value="${Math.round(display)}°" inputmode="decimal">
        </div>
      `;
    }
    if (ctrl.type === 'select') {
      const opts = ctrl.options.map((o) =>
        `<option value="${o.value}"${o.value === value ? ' selected' : ''}>${o.label}</option>`
      ).join('');
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label" for="pb-${ctrl.id}">${ctrl.label}</label>
          <select id="pb-${ctrl.id}" class="paint-bucket-select">${opts}</select>
        </div>
      `;
    }
    return '';
  }

  function bindControls(state, controlsEl) {
    VARIANT_CONTROLS.forEach((ctrl) => {
      if (ctrl.type === 'range') {
        bindRange(state, controlsEl, ctrl);
      } else if (ctrl.type === 'angle') {
        bindAngle(state, controlsEl, ctrl);
      } else if (ctrl.type === 'select') {
        const sel = controlsEl.querySelector(`#pb-${ctrl.id}`);
        if (!sel) return;
        sel.addEventListener('change', () => {
          state.fillParams[ctrl.id] = sel.value;
          persistAndRedraw(state);
        });
      }
    });
  }

  function bindRange(state, controlsEl, ctrl) {
    const input = controlsEl.querySelector(`#pb-${ctrl.id}`);
    if (!input) return;
    const chip = controlsEl.querySelector(`#pb-${ctrl.id}-chip`);
    const distance = !!ctrl.distance;
    const unit = distance ? getUnitLabel() : (ctrl.unit || '');
    const minDisplay = distance ? mmToDoc(ctrl.min) : ctrl.min;
    const maxDisplay = distance ? mmToDoc(ctrl.max) : ctrl.max;
    const writeChip = (displayNum) => {
      if (!chip) return;
      const txt = distance
        ? `${Number(displayNum).toFixed(docPrecision()).replace(/\.?0+$/, '') || '0'}${unit}`
        : `${displayNum}${unit}`;
      chip.value = txt;
    };
    const updateFromInput = () => {
      const numDisplay = Number(input.value);
      if (!Number.isFinite(numDisplay)) return;
      const stored = distance ? docToMm(numDisplay) : numDisplay;
      state.fillParams[ctrl.id] = stored;
      writeChip(numDisplay);
      updateSliderFill(input);
      persistAndRedraw(state);
      // Dot length > 0 unhides the dot-rotation row in place (no rerender so
      // the active drag/listeners stay attached).
      if (ctrl.id === 'fillDotLength') {
        const dotRotRow = controlsEl.querySelector('[data-ctrl="fillDotRotation"]');
        if (dotRotRow) dotRotRow.style.display = stored > 0 ? '' : 'none';
      }
    };
    input.addEventListener('input', updateFromInput);
    if (chip) {
      chip.addEventListener('change', () => {
        const cleaned = `${chip.value}`.replace(/[^\d.\-]/g, '');
        const num = Number(cleaned);
        if (!Number.isFinite(num)) return;
        const clamped = Math.min(maxDisplay, Math.max(minDisplay, num));
        input.value = `${clamped}`;
        updateFromInput();
      });
    }
    updateSliderFill(input);
  }

  function bindAngle(state, controlsEl, ctrl) {
    const row = controlsEl.querySelector(`[data-pb-angle="${ctrl.id}"]`);
    if (!row) return;
    const dial = row.querySelector('.angle-dial');
    const chip = controlsEl.querySelector(`#pb-${ctrl.id}-chip`);
    if (!dial) return;
    const wrap = (deg) => ((deg % 360) + 360) % 360;
    const setAngle = (deg, commit) => {
      const v = wrap(deg);
      state.fillParams[ctrl.id] = v;
      dial.style.setProperty('--angle', `${(v + 90) % 360}deg`);
      if (chip) chip.value = `${Math.round(v)}°`;
      if (commit) persistAndRedraw(state);
    };
    const updateFromEvent = (e) => {
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const deg = Math.atan2(dy, dx) * 180 / Math.PI;
      setAngle(deg, false);
    };
    dial.addEventListener('mousedown', (e) => {
      e.preventDefault();
      updateFromEvent(e);
      const move = (ev) => updateFromEvent(ev);
      const up = () => {
        window.removeEventListener('mousemove', move);
        const v = Number(state.fillParams[ctrl.id]);
        setAngle(Number.isFinite(v) ? v : 0, true);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up, { once: true });
    });
    dial.addEventListener('dblclick', (e) => {
      e.preventDefault();
      setAngle(0, true);
    });
    if (chip) {
      chip.addEventListener('change', () => {
        const cleaned = `${chip.value}`.replace(/[^\d.\-]/g, '');
        const num = Number(cleaned);
        if (!Number.isFinite(num)) return;
        setAngle(num, true);
      });
    }
  }

  function updateSliderFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return;
    const pct = ((val - min) / (max - min)) * 100;
    const wrap = input.closest('.sld-fx-wrap');
    if (wrap) wrap.style.setProperty('--fill', `${pct}%`);
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
    const input = document.getElementById('paint-bucket-sensitivity');
    const chip = document.getElementById('paint-bucket-sensitivity-chip');
    if (!input) return;
    input.value = `${state.fillParams.fillSensitivity ?? DEFAULTS.fillSensitivity}`;
    if (chip) chip.value = input.value;
    updateSliderFill(input);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) {
        state.fillParams.fillSensitivity = v;
        if (chip) chip.value = `${v}`;
        updateSliderFill(input);
        persistAndRedraw(state);
      }
    });
    if (chip) {
      chip.addEventListener('change', () => {
        const v = Number(`${chip.value}`.replace(/[^\d.\-]/g, ''));
        if (!Number.isFinite(v)) return;
        const clamped = Math.min(20, Math.max(0.1, v));
        input.value = `${clamped}`;
        state.fillParams.fillSensitivity = clamped;
        chip.value = `${clamped}`;
        updateSliderFill(input);
        persistAndRedraw(state);
      });
    }
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
      fillPolyScaleStep: rec.polyScaleStep,
      fillSpiralTurns: rec.spiralTurns,
      fillSpiralTightness: rec.spiralTightness,
      fillSpiralDirection: rec.spiralDirection,
      fillRadialSpokes: rec.radialSpokes,
      fillRadialSkip: rec.radialSkip,
      fillContourDirection: rec.contourDirection,
      fillContourStepVariance: rec.contourStepVariance,
      fillContourSimplify: rec.contourSimplify,
      fillRadialCentralDensity: rec.centralDensity,
      fillRadialOuterDiameter: rec.outerDiameter,
      fillSensitivity: rec.sensitivity,
      penId: rec.penId,
    };
  }

  function loadParamsFromFill(state, controlsEl, hintEl, rec) {
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
      refreshVariantSelection(state);
      renderControls(state, controlsEl, hintEl);
      const penSel = document.getElementById('paint-bucket-pen');
      if (penSel && state.fillParams.penId) penSel.value = state.fillParams.penId;
      const sensInput = document.getElementById('paint-bucket-sensitivity');
      const sensChip = document.getElementById('paint-bucket-sensitivity-chip');
      if (sensInput && state.fillParams.fillSensitivity != null) {
        sensInput.value = `${state.fillParams.fillSensitivity}`;
        if (sensChip) sensChip.value = `${state.fillParams.fillSensitivity}`;
        updateSliderFill(sensInput);
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
    const hintEl = document.getElementById('paint-bucket-panel-hint');

    paintVariantButtons(state, controlsEl, hintEl);
    populatePens(state);
    bindScopeToggle(state);
    bindSensitivity(state);
    renderControls(state, controlsEl, hintEl);
    bindStatusChip(state);
    bindExpandButton(state);
    updateStatusChip(0);

    const refresh = () => {
      refreshVariantSelection(state);
      renderControls(state, controlsEl, hintEl);
      updateExpandButton(state);
    };

    app.ui = app.ui || {};
    app.ui.refreshPaintBucketPanel = refresh;
    app.ui.setPaintBucketHint = setHint;
    app.paintBucketPanel = {
      getFillParams: () => ({ ...state.fillParams }),
      setHint,
      loadParamsFromFill: (rec) => loadParamsFromFill(state, controlsEl, hintEl, rec),
      setNoFillMode: () => {
        state.fillParams.fillMode = 'none';
        state._suppressRetarget = true;
        try {
          refreshVariantSelection(state);
          renderControls(state, controlsEl, hintEl);
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
