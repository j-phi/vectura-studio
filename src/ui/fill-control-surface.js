/**
 * Vectura shared Fill Control Surface.
 *
 * The variant grid (fill-type buttons) + per-variant parameter controls that
 * the paint bucket panel presents. Extracted here so every fill UI renders the
 * SAME controls from ONE implementation instead of each panel hand-rolling its
 * own subset. The paint bucket panel (src/ui/panels/paint-bucket-panel.js) and
 * the Type layer's Fill tab (src/ui/ui-text-panel.js) both mount this surface.
 *
 * The engine, fill record, and geometry generation are already shared
 * (PaintBucketOps.buildFillRecord → AlgorithmRegistry._generatePatternFillPaths);
 * this closes the last gap — the control surface — so the two agree on the exact
 * set of fill types and their parameters.
 *
 * mount(opts) writes directly into a caller-owned params bag and reports edits
 * through two hooks so each host keeps its own history/persistence model:
 *   - onEdit()             fires ONCE at the start of an interaction, BEFORE the
 *                          first mutation (snapshot point for undo history).
 *   - onChange(committed)  fires AFTER each value write; committed=false for live
 *                          drag frames, true on release / discrete change.
 *
 * Distance-bearing params are stored canonically in millimetres; the surface
 * converts to/from the active document unit (mm or in) for display + input,
 * exactly as the paint bucket panel does.
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

  // Distance-bearing params persisted in mm; converted to/from doc units at
  // display time. (Kept in sync with paint-bucket-panel's DISTANCE_PARAMS.)
  const DISTANCE_PARAMS = new Set(['fillDotLength', 'fillPadding', 'fillShiftX', 'fillShiftY', 'fillContourCenterPadding']);

  // Control schema for the per-variant section. Visibility for each entry is
  // gated by Vectura.FillPanel.FILL_CAPS[fillType]; only the controls that apply
  // to the current variant render, exactly as the pattern designer does. Range
  // entries with `distance: true` are millimetre values (min/max in mm) shown in
  // the active doc unit. Angle entries render as div-based dials matching the
  // rest of the UI.
  const VARIANT_CONTROLS = [
    { id: 'fillDensity',                 label: 'Density',           type: 'range',  min: 0.1,  max: 50,  step: 0.1,  showAlways: true, maxByMode: { contour: 100, spiral: 2 } },
    { id: 'fillAngle',                   label: 'Angle',             type: 'angle',  capKey: 'angle' },
    { id: 'fillAmplitude',               label: 'Amplitude',         type: 'range',  min: 0,    max: 5.0, step: 0.05, capKey: 'amplitude' },
    { id: 'fillDotShape',                label: 'Dot Shape',         type: 'select', options: [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'filled-square', label: 'Filled Square' }, { value: 'cross', label: 'Cross' }, { value: 'tick', label: 'Tick' }], capKey: 'dotShape' },
    { id: 'fillDotPattern',              label: 'Dot Pattern',       type: 'select', options: [{ value: 'brick', label: 'Brick' }, { value: 'grid', label: 'Grid' }, { value: 'hex', label: 'Hex' }, { value: 'jitter', label: 'Jitter' }], capKey: 'dotPattern' },
    { id: 'fillDotLength',               label: 'Dot Size',          type: 'range',  min: 0,    max: 10,  step: 0.1,  distance: true, capKey: 'dotSize' },
    { id: 'fillDotRotation',             label: 'Dot Rotation',      type: 'angle',  capKey: 'dotSize', showIfDotLen: true },
    { id: 'fillDotJitter',               label: 'Dot Jitter',        type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'dotJitter' },
    { id: 'fillPadding',                 label: 'Padding',           type: 'range',  min: 0,    max: 10,  step: 0.1,  distance: true, showAlways: true },
    { id: 'fillShiftX',                  label: 'Shift X',           type: 'range',  min: -50,  max: 50,  step: 0.5,  distance: true, capKey: 'shift' },
    { id: 'fillShiftY',                  label: 'Shift Y',           type: 'range',  min: -50,  max: 50,  step: 0.5,  distance: true, capKey: 'shift' },
    { id: 'fillLineCount',               label: 'Line Count',        type: 'range',  min: 1,    max: 3,   step: 1,    capKey: 'lineCount' },
    { id: 'fillAxes',                    label: 'Sides',             type: 'range',  min: 2,    max: 12,  step: 1,    capKey: 'axes' },
    { id: 'fillPolyTile',                label: 'Tile Method',       type: 'select', options: [{ value: 'grid', label: 'Grid' }, { value: 'brick', label: 'Brick' }, { value: 'hexagonal', label: 'Hexagonal' }, { value: 'off', label: 'Off (single)' }], capKey: 'polyTile' },
    { id: 'fillPolyPadding',             label: 'Poly Padding',      type: 'range',  min: 0,    max: 5,   step: 0.05, capKey: 'polyPadding' },
    { id: 'fillPolyRotation',            label: 'Poly Rotation',     type: 'angle',  capKey: 'polyRotation' },
    { id: 'fillPolyRotationStep',        label: 'Poly Rotation Step',type: 'range',  min: -45,  max: 45,  step: 0.5,  capKey: 'polyRotationStep' },
    { id: 'fillPolyScale',               label: 'Poly Scale',        type: 'range',  min: 0.1,  max: 3.0, step: 0.05, capKey: 'polyScale' },
    { id: 'fillWaveSmoothing',           label: 'Wave Smoothing',    type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'waveSmoothing' },
    { id: 'fillWaveFrequency',           label: 'Wave Frequency',    type: 'range',  min: 0.25, max: 4.0, step: 0.05, capKey: 'waveFrequency' },
    { id: 'fillSpiralTightness',         label: 'Spiral Tightness',  type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'spiralTightness' },
    { id: 'fillSpiralDirection',         label: 'Spiral Direction',  type: 'select', options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Counterclockwise' }], capKey: 'spiralDirection' },
    { id: 'fillRadialSkip',              label: 'Radial Skip',       type: 'range',  min: 0,    max: 5,   step: 1,    capKey: 'radialSkip' },
    { id: 'fillContourDirection',        label: 'Contour Direction', type: 'select', options: [{ value: 'inset', label: 'Inset' }, { value: 'outset', label: 'Outset' }], capKey: 'contourDirection' },
    { id: 'fillContourStepVariance',     label: 'Step Variance',     type: 'range',  min: 0,    max: 1,   step: 0.01, capKey: 'contourStepVariance' },
    { id: 'fillContourSimplify',         label: 'Simplify',          type: 'range',  min: 0,    max: 0.5, step: 0.01, capKey: 'contourSimplify' },
    { id: 'fillContourCenterPadding',    label: 'Center Padding',    type: 'range',  min: 0,    max: 20,  step: 0.1,  distance: true, capKey: 'contourCenterPadding' },
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

  // ── doc-unit helpers ────────────────────────────────────────────────────
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

  function renderControlHtml(ctrl, value, hidden, fillMode, idPrefix) {
    const hiddenAttr = hidden ? ' style="display:none"' : '';
    if (ctrl.type === 'range') {
      // Range rows render just the label cell; bindRange() mounts the shared
      // UI.Slider component (slider + editable value chip) into the row.
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label" for="${idPrefix}-${ctrl.id}">${ctrl.label}</label>
        </div>
      `;
    }
    if (ctrl.type === 'angle') {
      const v = Number.isFinite(value) ? value : 0;
      const display = ((v % 360) + 360) % 360;
      // The .angle-control div is a mount point: bindAngle() mounts the shared
      // UI.AngleDial (keyboard-operable SVG dial) into it. The host chip stays
      // separate because it shows/edits the PARAM convention (see bindAngle's
      // dial-space mapping note), which the dial's own input cannot express.
      return `
        <div class="paint-bucket-row paint-bucket-row-angle" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label">${ctrl.label}</label>
          <div class="angle-control" data-fcs-angle="${ctrl.id}"></div>
          <input type="text" id="${idPrefix}-${ctrl.id}-chip" class="slider-val" value="${Math.round(display)}°" inputmode="decimal">
        </div>
      `;
    }
    if (ctrl.type === 'select') {
      const opts = ctrl.options.map((o) =>
        `<option value="${o.value}"${o.value === value ? ' selected' : ''}>${o.label}</option>`
      ).join('');
      return `
        <div class="paint-bucket-row" data-ctrl="${ctrl.id}"${hiddenAttr}>
          <label class="paint-bucket-label" for="${idPrefix}-${ctrl.id}">${ctrl.label}</label>
          <select id="${idPrefix}-${ctrl.id}" class="paint-bucket-select">${opts}</select>
        </div>
      `;
    }
    return '';
  }

  /**
   * Mount the shared fill control surface.
   *
   * @param {object}      opts
   * @param {HTMLElement} opts.gridEl      container for the variant-type buttons
   * @param {HTMLElement} opts.controlsEl  container for the per-variant controls
   * @param {object}      opts.params      caller-owned bag (mutated in place)
   * @param {string}     [opts.typeKey]    key in params holding the fill type
   *                                        ('fillMode' for the bucket, 'fillType'
   *                                        for text). FILL_CAPS is keyed by value.
   * @param {string[]}   [opts.exclude]    control ids to omit (host owns them)
   * @param {string}     [opts.idPrefix]   DOM id namespace (avoids cross-panel id
   *                                        collisions when both are mounted)
   * @param {object}     [opts.icons]      variant-button icon factory map
   * @param {string}     [opts.noneHint]   hint shown when the type is 'none'
   * @param {object}     [opts.defaults]   param-id → default value map (stored
   *                                        units, i.e. mm for distance params);
   *                                        wires double-click-to-reset on sliders
   * @param {Function}   [opts.onEdit]     () → snapshot point, before first write
   * @param {Function}   [opts.onChange]   (committed) → after a value write
   * @returns {{refresh: Function, refreshVariants: Function}}
   */
  function mount(opts = {}) {
    const {
      gridEl,
      controlsEl,
      params,
      typeKey = 'fillMode',
      fillTypeOptions = FILL_TYPE_OPTIONS,
      exclude = [],
      idPrefix = 'pb',
      icons = (Vectura.Icons && Vectura.Icons.paintBucket) || {},
      noneHint = 'Pick a fill type to pour onto regions.',
      defaults = {},
      onEdit = () => {},
      onChange = () => {},
    } = opts;
    if (!params) return { refresh: () => {}, refreshVariants: () => {} };
    const excludeSet = new Set(exclude);
    const get = (k) => params[k];
    const set = (k, v) => { params[k] = v; };

    function refreshVariantSelection() {
      if (!gridEl) return;
      Array.from(gridEl.querySelectorAll('.pb-variant-btn')).forEach((btn) => {
        const active = btn.dataset.bucketVariant === get(typeKey);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function renderVariantGrid() {
      if (!gridEl) return;
      gridEl.innerHTML = '';
      fillTypeOptions.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pb-variant-btn';
        btn.dataset.bucketVariant = opt.value;
        btn.title = opt.label;
        btn.setAttribute('aria-label', opt.label);
        const factory = icons?.[opt.value];
        btn.innerHTML = factory ? factory() : `<span class="pb-variant-text">${opt.label}</span>`;
        btn.setAttribute('aria-pressed', get(typeKey) === opt.value ? 'true' : 'false');
        btn.classList.toggle('active', get(typeKey) === opt.value);
        btn.addEventListener('click', () => {
          if (get(typeKey) === opt.value) return;
          onEdit();
          set(typeKey, opt.value);
          // Contour reads density as ring count; a high default makes the first
          // pour legible (mirrors the paint bucket's variant switch).
          if (opt.value === 'contour') set('fillDensity', 50);
          onChange(true);
          renderControls();
          refreshVariantSelection();
        });
        gridEl.appendChild(btn);
      });
    }

    function renderControls() {
      if (!controlsEl) return;
      const caps = Vectura.FillPanel?.FILL_CAPS?.[get(typeKey)] || {};
      if (get(typeKey) === 'none') {
        controlsEl.innerHTML = `<p class="paint-bucket-hint-inline">${noneHint}</p>`;
        return;
      }
      const dotLenActive = (get('fillDotLength') ?? 0) > 0;
      const dotShapeIsCircle = (get('fillDotShape') ?? 'circle') === 'circle';
      const html = VARIANT_CONTROLS
        .filter((ctrl) => {
          if (excludeSet.has(ctrl.id)) return false;
          if (ctrl.showAlways) return true;
          return ctrl.capKey && caps[ctrl.capKey];
        })
        .map((ctrl) => {
          // Dot Rotation shows when dotLength > 0 (for circle spirals) OR when a
          // non-circle shape is selected (rotation always orients the glyph).
          const hidden = ctrl.showIfDotLen && !dotLenActive && dotShapeIsCircle;
          return renderControlHtml(ctrl, get(ctrl.id), hidden, get(typeKey), idPrefix);
        })
        .join('');
      controlsEl.innerHTML = html;
      bindControls();
    }

    function bindControls() {
      VARIANT_CONTROLS.forEach((ctrl) => {
        if (excludeSet.has(ctrl.id)) return;
        if (ctrl.type === 'range') bindRange(ctrl);
        else if (ctrl.type === 'angle') bindAngle(ctrl);
        else if (ctrl.type === 'select') bindSelect(ctrl);
      });
    }

    function bindSelect(ctrl) {
      const sel = controlsEl.querySelector(`#${idPrefix}-${ctrl.id}`);
      if (!sel) return;
      sel.addEventListener('change', () => {
        onEdit();
        set(ctrl.id, sel.value);
        onChange(true);
        // Dot shape governs whether the Dot Rotation row is meaningful.
        if (ctrl.id === 'fillDotShape') {
          const dotShapeIsCircle = sel.value === 'circle';
          const dotLenActive = (get('fillDotLength') ?? 0) > 0;
          const dotRotRow = controlsEl.querySelector('[data-ctrl="fillDotRotation"]');
          if (dotRotRow) dotRotRow.style.display = (dotLenActive || !dotShapeIsCircle) ? '' : 'none';
        }
      });
    }

    function bindRange(ctrl) {
      const row = controlsEl.querySelector(`[data-ctrl="${ctrl.id}"]`);
      if (!row || typeof UI.Slider !== 'function') return;
      const distance = !!ctrl.distance;
      const unit = distance ? getUnitLabel() : (ctrl.unit || '');
      const effectiveMax = ctrl.maxByMode?.[get(typeKey)] ?? ctrl.max;
      const min = distance ? mmToDoc(ctrl.min) : ctrl.min;
      const max = distance ? mmToDoc(effectiveMax) : effectiveMax;
      const step = distance
        ? (getDocUnits() === 'imperial' ? Math.max(0.001, ctrl.step / 25.4) : ctrl.step)
        : ctrl.step;
      const stored = get(ctrl.id) != null ? get(ctrl.id) : 0;
      const defRaw = defaults[ctrl.id];
      const defaultValue = Number.isFinite(defRaw)
        ? (distance ? mmToDoc(defRaw) : defRaw)
        : undefined;
      // onEdit fires ONCE per interaction, before the first write (history
      // snapshot); the flag arms on the first live frame and disarms on commit.
      let editing = false;
      const apply = (displayNum, committed) => {
        if (!Number.isFinite(displayNum)) return;
        const storedV = distance ? docToMm(displayNum) : displayNum;
        set(ctrl.id, storedV);
        onChange(committed);
        // Dot rotation shows when dotLength > 0 OR a non-circle shape is selected.
        if (ctrl.id === 'fillDotLength') {
          const dotShapeIsCircle = (get('fillDotShape') ?? 'circle') === 'circle';
          const dotRotRow = controlsEl.querySelector('[data-ctrl="fillDotRotation"]');
          if (dotRotRow) dotRotRow.style.display = (storedV > 0 || !dotShapeIsCircle) ? '' : 'none';
        }
      };
      const inst = UI.Slider(row, {
        value: distance ? mmToDoc(stored) : stored,
        min, max, step,
        precision: distance ? docPrecision() : undefined,
        ariaLabel: ctrl.label,
        defaultValue,
        format: (v) => (distance
          ? `${Number(v).toFixed(docPrecision()).replace(/\.?0+$/, '') || '0'}${unit}`
          : `${v}${unit}`),
        parse: (text) => Number(`${text}`.replace(/[^\d.\-]/g, '')),
        onChange: (v) => {
          if (!editing) { editing = true; onEdit(); }
          apply(v, false);
        },
        onCommit: (v) => {
          editing = false;
          apply(v, true);
        },
      });
      // Slot the component into the row grid and reapply the host ids/classes
      // the paint-bucket layout, tests, and <label for> wiring key on.
      inst.el.style.gridColumn = '2 / span 2';
      const rangeInput = inst.el.querySelector('input[type="range"]');
      if (rangeInput) rangeInput.id = `${idPrefix}-${ctrl.id}`;
      const chipEl = inst.el.querySelector('.slider-val');
      if (chipEl) chipEl.id = `${idPrefix}-${ctrl.id}-chip`;
      const wrapEl = inst.el.querySelector('.sld-fx-wrap');
      if (wrapEl) wrapEl.classList.add('paint-bucket-slider-wrap');
    }

    function bindAngle(ctrl) {
      const row = controlsEl.querySelector(`[data-fcs-angle="${ctrl.id}"]`);
      if (!row || typeof UI.AngleDial !== 'function') return;
      const chip = controlsEl.querySelector(`#${idPrefix}-${ctrl.id}-chip`);
      const wrap = (deg) => ((deg % 360) + 360) % 360;
      // CONVENTION MAPPING — fill params vs UI.AngleDial dial-space:
      // Fill angles are stored screen-atan2 style: 0° = east (3 o'clock),
      // growing clockwise. UI.AngleDial's dial-space is 0° = up (12 o'clock),
      // also clockwise. The legacy hand-rolled dial rendered its needle at
      // `--angle:(param+90)deg` in that same 0°-up space, so
      //   dial-space = param + 90.
      // Keeping this offset preserves BOTH the needle direction and the
      // pointer→param mapping exactly as before — this is the recorded 90°
      // fillAngle convention gotcha; do NOT "simplify" the offset away, or
      // every hatch rotates 90° out from under its needle.
      const paramToDial = (v) => wrap(v + 90);
      const dialToParam = (d) => wrap(d - 90);
      const stored = Number(get(ctrl.id));
      const paramVal = Number.isFinite(stored) ? wrap(stored) : 0;
      // dblclick resets to the HOST's default for this param (e.g. the paint
      // bucket's DEFAULTS.fillAngle = 45), not a hardcoded 0.
      const defRaw = defaults[ctrl.id];
      const defaultParam = Number.isFinite(defRaw) ? wrap(defRaw) : 0;
      // onEdit fires ONCE per interaction, before the first write (history
      // snapshot) — same arming pattern as bindRange.
      let editing = false;
      const writeParam = (v, committed) => {
        set(ctrl.id, v);
        if (chip) chip.value = `${Math.round(v)}°`;
        onChange(committed);
      };
      const dial = UI.AngleDial(row, {
        value: paramToDial(paramVal),
        ariaLabel: ctrl.label,
        defaultValue: paramToDial(defaultParam),
        onChange: (d) => {
          if (!editing) { editing = true; onEdit(); }
          writeParam(dialToParam(d), false);
        },
        onCommit: (d) => {
          if (!editing) onEdit();
          editing = false;
          writeParam(dialToParam(d), true);
        },
      });
      // The dial's own numeric input reads in dial-space (param + 90) — hide
      // it and keep the host chip, which shows the param values users know
      // from the fill engine (and which tests/labels key on).
      const innerWrap = dial.el.querySelector('.angle-inp-wrap');
      if (innerWrap) innerWrap.style.display = 'none';
      if (chip) {
        chip.addEventListener('change', () => {
          const cleaned = `${chip.value}`.replace(/[^\d.\-]/g, '');
          const num = Number(cleaned);
          if (!Number.isFinite(num)) {
            const cur = Number(get(ctrl.id));
            chip.value = `${Math.round(Number.isFinite(cur) ? wrap(cur) : 0)}°`;
            return;
          }
          onEdit();
          const v = wrap(num);
          dial.setValue(paramToDial(v), { silent: true });
          writeParam(v, true);
        });
      }
    }

    renderVariantGrid();
    renderControls();

    return {
      refresh() { refreshVariantSelection(); renderControls(); },
      refreshVariants: refreshVariantSelection,
    };
  }

  UI.FillControlSurface = { mount, FILL_TYPE_OPTIONS, VARIANT_CONTROLS, DISTANCE_PARAMS };
})();
