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
 * a layer's params.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const FILL_TYPE_OPTIONS = [
    { value: 'none',       label: 'None' },
    { value: 'hatch',      label: 'Hatch' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'wavelines',  label: 'Wavelines' },
    { value: 'zigzag',     label: 'Zigzag' },
    { value: 'stipple',    label: 'Stipple' },
    { value: 'contour',    label: 'Contour' },
    { value: 'spiral',     label: 'Spiral' },
    { value: 'radial',     label: 'Radial' },
    { value: 'grid',       label: 'Grid Dots' },
    { value: 'polygonal',  label: 'Polygonal' },
  ];

  const DEFAULTS = {
    fillMode: 'hatch',
    fillDensity: 4,
    fillAngle: 45,
    fillAmplitude: 1.0,
    fillDotSize: 0.6,
    fillPadding: 0,
    fillShiftX: 0,
    fillShiftY: 0,
    fillDotPattern: 'brick',
    fillAxes: 3,
    fillPolyTile: 'grid',
    fillRadialCentralDensity: 1.0,
    fillRadialOuterDiameter: 1.0,
    fillSensitivity: 5,
    penId: null,
  };

  // Control schema for the per-variant panel section. The visibility for each
  // entry is gated by Vectura.FillPanel.FILL_CAPS[fillMode]; this lets us
  // render only the controls that apply to the currently selected variant
  // exactly as the pattern designer does.
  const VARIANT_CONTROLS = [
    { id: 'fillDensity',                 label: 'Density',         type: 'range',  min: 1,    max: 50,  step: 0.5,  showAlways: true },
    { id: 'fillAngle',                   label: 'Angle',           type: 'range',  min: 0,    max: 360, step: 1,    unit: '°', capKey: 'angle' },
    { id: 'fillAmplitude',               label: 'Amplitude',       type: 'range',  min: 0.1,  max: 3.0, step: 0.05, capKey: 'amplitude' },
    { id: 'fillDotSize',                 label: 'Dot Size',        type: 'range',  min: 0.1,  max: 3.0, step: 0.05, capKey: 'dotSize' },
    { id: 'fillPadding',                 label: 'Padding (mm)',    type: 'range',  min: 0,    max: 10,  step: 0.1,  showAlways: true },
    { id: 'fillShiftX',                  label: 'Shift X',         type: 'range',  min: -50,  max: 50,  step: 0.5,  capKey: 'shift' },
    { id: 'fillShiftY',                  label: 'Shift Y',         type: 'range',  min: -50,  max: 50,  step: 0.5,  capKey: 'shift' },
    { id: 'fillDotPattern',              label: 'Dot Pattern',     type: 'select', options: [{ value: 'brick', label: 'Brick' }, { value: 'grid', label: 'Grid' }], capKey: 'dotPattern' },
    { id: 'fillAxes',                    label: 'Axes',            type: 'range',  min: 2,    max: 12,  step: 1,    capKey: 'axes' },
    { id: 'fillPolyTile',                label: 'Tile Method',     type: 'select', options: [{ value: 'grid', label: 'Grid' }, { value: 'brick', label: 'Brick' }, { value: 'hexagonal', label: 'Hexagonal' }, { value: 'off', label: 'Off (single)' }], capKey: 'polyTile' },
    { id: 'fillRadialCentralDensity',    label: 'Central Density', type: 'range',  min: 0.1,  max: 4.0, step: 0.1,  capKey: 'radialCentralDensity' },
    { id: 'fillRadialOuterDiameter',     label: 'Outer Diameter',  type: 'range',  min: 0.0,  max: 2.0, step: 0.05, capKey: 'radialOuterDiameter' },
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

    const html = VARIANT_CONTROLS
      .filter((ctrl) => ctrl.showAlways || (ctrl.capKey && caps[ctrl.capKey]))
      .map((ctrl) => renderControl(ctrl, state.fillParams[ctrl.id]))
      .join('');
    controlsEl.innerHTML = html;
    bindControls(state, controlsEl);
  }

  function renderControl(ctrl, value) {
    if (ctrl.type === 'range') {
      const v = value != null ? value : 0;
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}">
          <label class="paint-bucket-label" for="pb-${ctrl.id}">${ctrl.label}</label>
          <div class="sld-fx-wrap paint-bucket-slider-wrap">
            <input id="pb-${ctrl.id}" class="ctrl-slider" type="range" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${v}">
          </div>
          <input type="text" id="pb-${ctrl.id}-chip" class="slider-val" value="${v}${ctrl.unit || ''}" inputmode="decimal">
        </div>
      `;
    }
    if (ctrl.type === 'select') {
      const opts = ctrl.options.map((o) =>
        `<option value="${o.value}"${o.value === value ? ' selected' : ''}>${o.label}</option>`
      ).join('');
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}">
          <label class="paint-bucket-label" for="pb-${ctrl.id}">${ctrl.label}</label>
          <select id="pb-${ctrl.id}" class="paint-bucket-select">${opts}</select>
        </div>
      `;
    }
    return '';
  }

  function bindControls(state, controlsEl) {
    VARIANT_CONTROLS.forEach((ctrl) => {
      const input = controlsEl.querySelector(`#pb-${ctrl.id}`);
      if (!input) return;
      if (ctrl.type === 'range') {
        const chip = controlsEl.querySelector(`#pb-${ctrl.id}-chip`);
        const updateFromInput = () => {
          const num = Number(input.value);
          if (!Number.isFinite(num)) return;
          state.fillParams[ctrl.id] = num;
          if (chip) chip.value = `${num}${ctrl.unit || ''}`;
          updateSliderFill(input);
          persistAndRedraw(state);
        };
        input.addEventListener('input', updateFromInput);
        if (chip) {
          chip.addEventListener('change', () => {
            const num = Number(`${chip.value}`.replace(/[^\d.\-]/g, ''));
            if (!Number.isFinite(num)) return;
            const clamped = Math.min(ctrl.max, Math.max(ctrl.min, num));
            input.value = `${clamped}`;
            updateFromInput();
          });
        }
        updateSliderFill(input);
      } else if (ctrl.type === 'select') {
        input.addEventListener('change', () => {
          state.fillParams[ctrl.id] = input.value;
          persistAndRedraw(state);
        });
      }
    });
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
    return {
      fillMode: rec.fillType ?? 'hatch',
      fillDensity: rec.density,
      fillAngle: rec.angle,
      fillAmplitude: rec.amplitude,
      fillDotSize: rec.dotSize,
      fillPadding: rec.padding,
      fillShiftX: rec.shiftX,
      fillShiftY: rec.shiftY,
      fillDotPattern: rec.dotPattern,
      fillAxes: rec.axes,
      fillPolyTile: rec.polyTile,
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

  function init(app) {
    if (!app) return;
    const section = document.getElementById('left-section-paint-bucket');
    if (!section) return;

    const SETTINGS = Vectura.SETTINGS || {};
    const persisted = SETTINGS.paintBucket || {};
    const state = {
      app,
      fillParams: { ...DEFAULTS, ...persisted },
    };

    const controlsEl = document.getElementById('paint-bucket-controls');
    const hintEl = document.getElementById('paint-bucket-panel-hint');

    paintVariantButtons(state, controlsEl, hintEl);
    populatePens(state);
    bindSensitivity(state);
    renderControls(state, controlsEl, hintEl);
    bindStatusChip(state);
    updateStatusChip(0);

    const refresh = () => {
      refreshVariantSelection(state);
    };

    app.ui = app.ui || {};
    app.ui.refreshPaintBucketPanel = refresh;
    app.ui.setPaintBucketHint = setHint;
    app.paintBucketPanel = {
      getFillParams: () => ({ ...state.fillParams }),
      setHint,
      loadParamsFromFill: (rec) => loadParamsFromFill(state, controlsEl, hintEl, rec),
      onBatchStateChange: ({ activeCount = 0 } = {}) => updateStatusChip(activeCount),
    };
  }

  UI.PaintBucketPanel = { init };
})();
