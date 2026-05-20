/**
 * Universal fill panel — shared constants and control-def builder used by
 * SVG Import, Rainfall, and Pattern Designer wherever fills are configured.
 *
 * Unit 1.8 (Meridian cleanup): also owns the pattern-fill prototype methods
 * (_buildPatternFillPanel, _applyPatternFillFromCanvas) lifted verbatim from
 * the legacy ui.js. The IIFE-local DI bag is empty — both methods only
 * touch `this.*` UI.prototype methods and `window.Vectura.*` global
 * registries (PatternRegistry, AlgorithmRegistry, UI.EmptyStates).
 */
(() => {
  window.Vectura = window.Vectura || {};

  let DEPS = null;

  const FILL_TYPE_OPTIONS = [
    { value: 'none',       label: 'None' },
    { value: 'hatch',      label: 'Hatch' },
    { value: 'wave',       label: 'Wave' },
    { value: 'dots',       label: 'Dots' },
    { value: 'contour',    label: 'Contour' },
    { value: 'spiral',     label: 'Spiral' },
    { value: 'radial',     label: 'Radial' },
    { value: 'polygonal',  label: 'Polygonal' },
  ];

  const FILL_TYPE_OPTIONS_RAINFALL = [
    { value: 'none',       label: 'None' },
    { value: 'spiral',     label: 'Spiral' },
    { value: 'hash',       label: 'Grid' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'snake',      label: 'Snake' },
    { value: 'sinusoidal', label: 'Sinusoidal' },
  ];

  // Per-algorithm capability flags.  padding is always true for non-none fills;
  // omitting it here since the panel always shows it when fill is active.
  const FILL_CAPS = {
    none:        { angle: false, amplitude: false, dotSize: false, shift: false },
    hatch:       { angle: true,  amplitude: false, dotSize: false, shift: true,  lineCount: true },
    vhatch:      { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch45:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch135:   { angle: true,  amplitude: false, dotSize: false, shift: true  },
    crosshatch:  { angle: true,  amplitude: false, dotSize: false, shift: true  },
    xcrosshatch: { angle: true,  amplitude: false, dotSize: false, shift: true  },
    wavelines:   { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    zigzag:      { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    wave:        { angle: true,  amplitude: true,  dotSize: false, shift: true, waveSmoothing: true, waveHarmonics: true },
    stipple:     { angle: true,  amplitude: false, dotSize: true,  shift: true,  dotPattern: true  },
    dots:        { angle: true,  amplitude: false, dotSize: true,  shift: true,  dotPattern: true, dotShape: true, dotJitter: true },
    contour:     { angle: false, amplitude: false, dotSize: false, shift: false },
    spiral:      { angle: true,  amplitude: false, dotSize: false, shift: true,  spiralTurns: true, spiralTightness: true, spiralDirection: true },
    radial:      { angle: true,  amplitude: false, dotSize: false, shift: true,  radialCentralDensity: true, radialOuterDiameter: true },
    grid:        { angle: true,  amplitude: false, dotSize: true,  shift: true  },
    meander:     { angle: true,  amplitude: false, dotSize: false, shift: true  },
    triaxial:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    polygonal:   { angle: true,  amplitude: false, dotSize: false, shift: true,  axes: true, polyTile: true, polyPadding: true, polyRotation: true, polyRotationStep: true, polyScaleStep: true },
    // Rainfall-specific
    hash:        { angle: true,  amplitude: false, dotSize: false, shift: true  },
    snake:       { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    sinusoidal:  { angle: true,  amplitude: true,  dotSize: false, shift: true  },
  };

  /**
   * Returns an array of CONTROL_DEF objects for the fill panel.
   *
   * @param {object} opts
   * @param {Array}    opts.fillTypeOptions  - array of { value, label }
   * @param {string}   opts.typeParam        - layer param key for fill type
   * @param {string}   opts.densityParam
   * @param {string}   opts.angleParam
   * @param {string}   opts.amplitudeParam
   * @param {string}   opts.paddingParam
   * @param {string}   opts.dotSizeParam
   * @param {string}   opts.shiftXParam
   * @param {string}   opts.shiftYParam
   * @param {Function} opts.showIfBase       - outer condition, e.g. (p) => hasClosed(p)
   * @param {string}   opts.descKeyPrefix    - prefix for infoKey lookups, e.g. 'fill'
   */
  const buildFillControlDefs = ({
    fillTypeOptions = FILL_TYPE_OPTIONS,
    typeParam = 'fillMode',
    densityParam = 'fillDensity',
    angleParam = 'fillAngle',
    amplitudeParam = 'fillAmplitude',
    paddingParam = 'fillPadding',
    dotSizeParam = 'fillDotSize',
    shiftXParam = 'fillShiftX',
    shiftYParam = 'fillShiftY',
    dotPatternParam           = 'fillDotPattern',
    radialCentralDensityParam = 'fillRadialCentralDensity',
    radialOuterDiameterParam  = 'fillRadialOuterDiameter',
    axesParam                 = 'fillAxes',
    polyTileParam             = 'fillPolyTile',
    waveSmoothingParam        = 'fillWaveSmoothing',
    waveHarmonicsParam        = 'fillWaveHarmonics',
    dotShapeParam             = 'fillDotShape',
    dotJitterParam            = 'fillDotJitter',
    lineCountParam            = 'fillLineCount',
    polyPaddingParam          = 'fillPolyPadding',
    polyRotationParam         = 'fillPolyRotation',
    polyRotationStepParam     = 'fillPolyRotationStep',
    polyScaleStepParam        = 'fillPolyScaleStep',
    spiralTurnsParam          = 'fillSpiralTurns',
    spiralTightnessParam      = 'fillSpiralTightness',
    spiralDirectionParam      = 'fillSpiralDirection',
    showIfBase = () => true,
    descKeyPrefix = 'fill',
  } = {}) => {
    const isActive = (p) => showIfBase(p) && p[typeParam] !== 'none';
    const caps = (p) => FILL_CAPS[p[typeParam]] || {};

    return [
      {
        id: typeParam,
        label: 'Fill',
        type: 'select',
        options: fillTypeOptions,
        showIf: showIfBase,
        infoKey: `${descKeyPrefix}.type`,
      },
      {
        id: densityParam,
        label: 'Fill Density',
        type: 'range',
        min: 0.1,
        max: 50,
        step: 0.1,
        showIf: isActive,
        infoKey: `${descKeyPrefix}.density`,
      },
      {
        id: angleParam,
        label: 'Fill Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => isActive(p) && !!caps(p).angle,
        infoKey: `${descKeyPrefix}.angle`,
      },
      {
        id: amplitudeParam,
        label: 'Amplitude',
        type: 'range',
        min: 0.1,
        max: 3.0,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).amplitude,
        infoKey: `${descKeyPrefix}.amplitude`,
      },
      {
        id: dotSizeParam,
        label: 'Dot Size',
        type: 'range',
        min: 0.1,
        max: 3.0,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).dotSize,
        infoKey: `${descKeyPrefix}.dotSize`,
      },
      {
        id: paddingParam,
        label: 'Fill Padding (mm)',
        type: 'range',
        min: 0,
        max: 10,
        step: 0.1,
        showIf: isActive,
        infoKey: `${descKeyPrefix}.padding`,
      },
      {
        id: shiftXParam,
        label: 'Shift X',
        type: 'range',
        min: -50,
        max: 50,
        step: 0.5,
        showIf: (p) => isActive(p) && !!caps(p).shift,
        infoKey: `${descKeyPrefix}.shiftX`,
      },
      {
        id: shiftYParam,
        label: 'Shift Y',
        type: 'range',
        min: -50,
        max: 50,
        step: 0.5,
        showIf: (p) => isActive(p) && !!caps(p).shift,
        infoKey: `${descKeyPrefix}.shiftY`,
      },
      {
        id: dotPatternParam,
        label: 'Dot Pattern',
        type: 'select',
        options: [
          { value: 'brick',  label: 'Brick' },
          { value: 'grid',   label: 'Grid' },
          { value: 'hex',    label: 'Hex' },
          { value: 'jitter', label: 'Jitter' },
        ],
        showIf: (p) => isActive(p) && !!caps(p).dotPattern,
        infoKey: `${descKeyPrefix}.dotPattern`,
      },
      {
        id: dotShapeParam,
        label: 'Dot Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
          { value: 'cross',  label: 'Cross' },
          { value: 'tick',   label: 'Tick' },
        ],
        showIf: (p) => isActive(p) && !!caps(p).dotShape,
        infoKey: `${descKeyPrefix}.dotShape`,
      },
      {
        id: dotJitterParam,
        label: 'Dot Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).dotJitter,
        infoKey: `${descKeyPrefix}.dotJitter`,
      },
      {
        id: axesParam,
        label: 'Sides',
        type: 'range',
        min: 2,
        max: 12,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).axes,
        infoKey: `${descKeyPrefix}.axes`,
      },
      {
        id: polyPaddingParam,
        label: 'Poly Padding',
        type: 'range',
        min: 0,
        max: 5,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).polyPadding,
        infoKey: `${descKeyPrefix}.polyPadding`,
      },
      {
        id: polyRotationParam,
        label: 'Poly Rotation',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => isActive(p) && !!caps(p).polyRotation,
        infoKey: `${descKeyPrefix}.polyRotation`,
      },
      {
        id: polyRotationStepParam,
        label: 'Poly Rotation Step',
        type: 'range',
        min: -45,
        max: 45,
        step: 0.5,
        showIf: (p) => isActive(p) && !!caps(p).polyRotationStep,
        infoKey: `${descKeyPrefix}.polyRotationStep`,
      },
      {
        id: polyScaleStepParam,
        label: 'Poly Scale Step',
        type: 'range',
        min: -0.5,
        max: 0.5,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).polyScaleStep,
        infoKey: `${descKeyPrefix}.polyScaleStep`,
      },
      {
        id: polyTileParam,
        label: 'Tile Method',
        type: 'select',
        options: [
          { value: 'grid',       label: 'Grid' },
          { value: 'brick',      label: 'Brick' },
          { value: 'hexagonal',  label: 'Hexagonal' },
          { value: 'off',        label: 'Off (single)' },
        ],
        showIf: (p) => isActive(p) && !!caps(p).polyTile,
        infoKey: `${descKeyPrefix}.polyTile`,
      },
      {
        id: lineCountParam,
        label: 'Line Count',
        type: 'range',
        min: 1,
        max: 3,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).lineCount,
        infoKey: `${descKeyPrefix}.lineCount`,
      },
      {
        id: waveSmoothingParam,
        label: 'Wave Smoothing',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).waveSmoothing,
        infoKey: `${descKeyPrefix}.waveSmoothing`,
      },
      {
        id: waveHarmonicsParam,
        label: 'Wave Harmonics',
        type: 'range',
        min: 1,
        max: 3,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).waveHarmonics,
        infoKey: `${descKeyPrefix}.waveHarmonics`,
      },
      {
        id: spiralTurnsParam,
        label: 'Spiral Turns',
        type: 'range',
        min: 1,
        max: 40,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).spiralTurns,
        infoKey: `${descKeyPrefix}.spiralTurns`,
      },
      {
        id: spiralTightnessParam,
        label: 'Spiral Tightness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).spiralTightness,
        infoKey: `${descKeyPrefix}.spiralTightness`,
      },
      {
        id: spiralDirectionParam,
        label: 'Spiral Direction',
        type: 'select',
        options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Counterclockwise' }],
        showIf: (p) => isActive(p) && !!caps(p).spiralDirection,
        infoKey: `${descKeyPrefix}.spiralDirection`,
      },
      {
        id: radialCentralDensityParam,
        label: 'Central Density',
        type: 'range',
        min: 0.1,
        max: 4.0,
        step: 0.1,
        showIf: (p) => isActive(p) && !!caps(p).radialCentralDensity,
        infoKey: `${descKeyPrefix}.radialCentralDensity`,
      },
      {
        id: radialOuterDiameterParam,
        label: 'Outer Diameter',
        type: 'range',
        min: 0.0,
        max: 2.0,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).radialOuterDiameter,
        infoKey: `${descKeyPrefix}.radialOuterDiameter`,
      },
    ];
  };

  // ──────────────────────────────────────────────────────────────────────
  // Unit 1.8 (Meridian cleanup): pattern-fill prototype methods lifted from
  // legacy ui.js. Installed onto UI.prototype via FillPanel.installOn().
  // ──────────────────────────────────────────────────────────────────────

  function _buildPatternFillPanel(container) {
    const isErase = this.activeTool === 'fill-pattern-erase';
    const layer = this.app.engine?.getActiveLayer?.();
    const PR = window.Vectura?.PatternRegistry;
    const patterns = PR?.getPatterns?.() || PR?.getAll?.() || [];

    const hdr = document.createElement('p');
    hdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-3';
    hdr.textContent = isErase ? 'Erase Pattern Fill' : 'Pattern Fill';
    container.appendChild(hdr);

    if (patterns.length) {
      const browserHdr = document.createElement('p');
      browserHdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-2';
      browserHdr.textContent = 'Pattern';
      container.appendChild(browserHdr);

      const list = document.createElement('div');
      list.className = 'flex flex-col gap-0.5 mb-4 overflow-y-auto';
      list.style.maxHeight = '10rem';
      const currentId = layer?.params?.patternId || '';
      patterns.forEach((pat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-xs text-left px-2 py-1 rounded hover:bg-vectura-border transition-colors truncate';
        btn.style.color = pat.id === currentId ? 'var(--vectura-accent)' : '';
        btn.style.background = pat.id === currentId ? 'var(--vectura-border)' : '';
        btn.textContent = pat.name || pat.id;
        btn.title = pat.name || pat.id;
        btn.onclick = () => {
          if (layer) {
            layer.params = layer.params || {};
            layer.params.patternId = pat.id;
            this.storeLayerParams?.(layer);
            this.app.regen?.();
          }
          this._buildPatternFillPanel(container);
        };
        list.appendChild(btn);
      });
      container.appendChild(list);
    } else {
      // Phase 4: empty-state illustration for the pattern catalog.
      const ES = window.Vectura?.UI?.EmptyStates;
      if (ES && typeof ES.attach === 'function') {
        const wrap = document.createElement('div');
        wrap.className = 'pattern-empty-state-wrap';
        wrap.style.marginBottom = '16px';
        container.appendChild(wrap);
        ES.attach(wrap, {
          kind: 'patterns',
          title: 'No patterns yet',
          message: 'Open the Pattern Designer to create your first.',
        });
      } else {
        const msg = document.createElement('p');
        msg.className = 'text-xs text-vectura-muted mb-4';
        msg.textContent = 'No patterns registered.';
        container.appendChild(msg);
      }
    }

    if (!isErase) {
      const settingsHdr = document.createElement('p');
      settingsHdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-2';
      settingsHdr.textContent = 'Fill Settings';
      container.appendChild(settingsHdr);

      this._patternFillSettings = this._patternFillSettings || { fillType: 'hatch', density: 1 };

      const fillTypes = [
        ['hatch', 'Hatch'], ['wave', 'Wave'], ['dots', 'Dots'],
        ['contour', 'Contour'], ['spiral', 'Spiral'], ['radial', 'Radial'],
      ];
      const typeRow = document.createElement('div');
      typeRow.className = 'mb-2';
      const typeLabel = document.createElement('label');
      typeLabel.className = 'control-label block mb-1';
      typeLabel.textContent = 'Fill Type';
      typeRow.appendChild(typeLabel);
      const typeSelect = document.createElement('select');
      typeSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent';
      fillTypes.forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        typeSelect.appendChild(o);
      });
      typeSelect.value = this._patternFillSettings.fillType;
      typeSelect.onchange = () => { this._patternFillSettings.fillType = typeSelect.value; };
      typeRow.appendChild(typeSelect);
      container.appendChild(typeRow);

      const densRow = document.createElement('div');
      densRow.className = 'mb-2';
      const densLabel = document.createElement('label');
      densLabel.className = 'control-label block mb-1';
      densLabel.textContent = 'Density';
      densRow.appendChild(densLabel);
      const densInput = document.createElement('input');
      densInput.type = 'number'; densInput.step = '0.1'; densInput.min = '0.1'; densInput.max = '10';
      densInput.className = 'w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent';
      densInput.value = this._patternFillSettings.density;
      densInput.oninput = () => { this._patternFillSettings.density = parseFloat(densInput.value) || 1; };
      densRow.appendChild(densInput);
      container.appendChild(densRow);
    }
  }

  function _applyPatternFillFromCanvas({ tool, worldX, worldY }) {
    const layer = this.app.engine?.getActiveLayer?.();
    if (!layer || layer.type !== 'pattern') return;
    const AR = window.Vectura?.AlgorithmRegistry;
    if (!AR) return;
    const patternId = layer.params?.patternId;
    if (!patternId) return;
    const data = AR.patternGetGroups?.(patternId);
    if (!data) return;
    const scale = layer.params?.scale ?? 1;
    const originX = layer.params?.originX ?? 0;
    const originY = layer.params?.originY ?? 0;
    const tileSpacingX = layer.params?.tileSpacingX ?? 0;
    const tileSpacingY = layer.params?.tileSpacingY ?? 0;
    const { vbW, vbH } = data;
    const scaledW = (vbW + tileSpacingX) * scale;
    const scaledH = (vbH + tileSpacingY) * scale;
    if (scaledW <= 0 || scaledH <= 0) return;
    const tileX = (((worldX - originX) % scaledW) + scaledW) % scaledW / scale;
    const tileY = (((worldY - originY) % scaledH) + scaledH) % scaledH / scale;
    const hit = AR.patternGetFillTargetsAtPoint?.(patternId, tileX, tileY, { cache: true });
    const target = hit?.smallest;
    if (!target) return;

    this.app.pushHistory?.();
    if (!layer.params.patternFills) layer.params.patternFills = [];
    const isErase = tool === 'fill-pattern-erase';

    if (isErase) {
      layer.params.patternFills = layer.params.patternFills.filter(
        (f) => !this._fillMatchesTarget?.(f, target)
      );
    } else {
      const alreadyFilled = layer.params.patternFills.some(
        (f) => this._fillMatchesTarget?.(f, target)
      );
      if (!alreadyFilled) {
        const fs = this._patternFillSettings || {};
        const cloneRegion = (r) => (Array.isArray(r) ? r.map((pt) => ({ ...pt })) : []);
        const record = {
          id: `fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          targetIds: [target.id],
          regions: (target.regions || []).map((r) => cloneRegion(r)),
          region: cloneRegion(target.outer || target.regions?.[0] || []),
          fillType: fs.fillType || 'hatch',
          density: fs.density ?? 1,
          penId: null,
          angle: 0,
          amplitude: 1.0,
          dotSize: 1.0,
          padding: 0,
          shiftX: 0,
          shiftY: 0,
        };
        layer.params.patternFills.push(record);
      }
    }

    this.storeLayerParams?.(layer);
    this.app.regen?.();
    this.app.renderer?.draw?.();
  }

  window.Vectura.FillPanel = {
    FILL_TYPE_OPTIONS,
    FILL_TYPE_OPTIONS_RAINFALL,
    FILL_CAPS,
    buildFillControlDefs,
    /**
     * Inject closure-captured legacy ui.js IIFE locals (currently empty —
     * the pattern-fill methods only touch this.* and window.Vectura.*).
     * Idempotent. Called once from the legacy ui.js IIFE.
     */
    bind(deps) {
      DEPS = deps || {};
    },
    _buildPatternFillPanel,
    _applyPatternFillFromCanvas,
    installOn(proto) {
      proto._buildPatternFillPanel = function(container) { return _buildPatternFillPanel.call(this, container); };
      proto._applyPatternFillFromCanvas = function(payload) { return _applyPatternFillFromCanvas.call(this, payload); };
    },
  };
})();
