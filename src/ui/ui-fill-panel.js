/**
 * Universal fill panel — shared constants and control-def builder used by
 * SVG Import, Rainfall, and Pattern Designer wherever fills are configured.
 */
(() => {
  window.Vectura = window.Vectura || {};

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
    hatch:       { angle: true,  amplitude: false, dotSize: false, shift: true  },
    vhatch:      { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch45:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch135:   { angle: true,  amplitude: false, dotSize: false, shift: true  },
    crosshatch:  { angle: true,  amplitude: false, dotSize: false, shift: true  },
    xcrosshatch: { angle: true,  amplitude: false, dotSize: false, shift: true  },
    wavelines:   { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    zigzag:      { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    stipple:     { angle: true,  amplitude: false, dotSize: true,  shift: true,  dotPattern: true  },
    contour:     { angle: false, amplitude: false, dotSize: false, shift: false },
    spiral:      { angle: true,  amplitude: false, dotSize: false, shift: true  },
    radial:      { angle: true,  amplitude: false, dotSize: false, shift: true,  radialCentralDensity: true, radialOuterDiameter: true },
    grid:        { angle: true,  amplitude: false, dotSize: true,  shift: true  },
    meander:     { angle: true,  amplitude: false, dotSize: false, shift: true  },
    triaxial:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    polygonal:   { angle: true,  amplitude: false, dotSize: false, shift: true,  axes: true, polyTile: true },
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
        min: 1,
        max: 50,
        step: 0.5,
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
        options: [{ value: 'brick', label: 'Brick' }, { value: 'grid', label: 'Grid' }],
        showIf: (p) => isActive(p) && !!caps(p).dotPattern,
        infoKey: `${descKeyPrefix}.dotPattern`,
      },
      {
        id: axesParam,
        label: 'Axes',
        type: 'range',
        min: 2,
        max: 12,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).axes,
        infoKey: `${descKeyPrefix}.axes`,
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

  window.Vectura.FillPanel = {
    FILL_TYPE_OPTIONS,
    FILL_TYPE_OPTIONS_RAINFALL,
    FILL_CAPS,
    buildFillControlDefs,
  };
})();
