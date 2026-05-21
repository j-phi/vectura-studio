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
  const Vectura = (window.Vectura = window.Vectura || {});

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
    { value: 'flowfield',  label: 'Flow Field' },
    { value: 'voronoi',    label: 'Voronoi' },
    { value: 'truchet',    label: 'Truchet' },
    { value: 'maze',       label: 'Maze' },
    { value: 'scribble',   label: 'Scribble' },
    { value: 'lsystem',    label: 'L-System' },
    { value: 'halftone',   label: 'Halftone' },
    { value: 'stripes',    label: 'Stripes' },
    { value: 'spirograph', label: 'Spirograph' },
    { value: 'weave',      label: 'Weave' },
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
  // `density: false` hides the global Fill Density slider for fills that have
  // their own per-fill spacing knob (e.g. mazeCellSize, weaveStrandWidth).
  // Default is `density: true` — only the six B-series fills below opt out.
  const FILL_CAPS = {
    none:        { angle: false, amplitude: false, dotSize: false, shift: false, density: false },
    hatch:       { angle: true,  amplitude: false, dotSize: false, shift: true,  lineCount: true },
    vhatch:      { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch45:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    dhatch135:   { angle: true,  amplitude: false, dotSize: false, shift: true  },
    crosshatch:  { angle: true,  amplitude: false, dotSize: false, shift: true  },
    xcrosshatch: { angle: true,  amplitude: false, dotSize: false, shift: true  },
    wavelines:   { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    zigzag:      { angle: true,  amplitude: true,  dotSize: false, shift: true  },
    wave:        { angle: true,  amplitude: true,  dotSize: false, shift: true, waveSmoothing: true, waveFrequency: true },
    stipple:     { angle: true,  amplitude: false, dotSize: true,  shift: true,  dotPattern: true  },
    dots:        { angle: true,  amplitude: false, dotSize: true,  shift: true,  dotPattern: true, dotShape: true, dotJitter: true },
    contour:     { angle: false, amplitude: false, dotSize: false, shift: false, contourDirection: true, contourStepVariance: true, contourSimplify: true, contourCenterPadding: true },
    spiral:      { angle: true,  amplitude: false, dotSize: false, shift: true,  spiralTightness: true, spiralDirection: true },
    radial:      { angle: true,  amplitude: false, dotSize: false, shift: true,  radialSkip: true },
    grid:        { angle: true,  amplitude: false, dotSize: true,  shift: true  },
    meander:     { angle: true,  amplitude: false, dotSize: false, shift: true  },
    triaxial:    { angle: true,  amplitude: false, dotSize: false, shift: true  },
    polygonal:   { angle: true,  amplitude: false, dotSize: false, shift: true,  axes: true, polyTile: true, polyPadding: true, polyRotation: true, polyRotationStep: true, polyScaleStep: true, polyScale: true },
    flowfield:   { angle: false, amplitude: false, dotSize: false, shift: false, density: false, flowFieldType: true, flowNoiseScale: true, flowSeed: true, flowTraceLen: true, flowSeparation: true },
    voronoi:     { angle: false, amplitude: false, dotSize: false, shift: false, voronoiSeeds: true, voronoiJitter: true, voronoiStroke: true, voronoiSeedMode: true },
    truchet:     { angle: false, amplitude: false, dotSize: false, shift: false, density: false, truchetTileSet: true, truchetTileSize: true, truchetSeed: true, truchetRotations: true },
    maze:        { angle: false, amplitude: false, dotSize: false, shift: false, density: false, mazeCellSize: true, mazeAlgorithm: true, mazeBranchBias: true, mazeSeed: true, mazeWallMode: true },
    scribble:    { angle: false, amplitude: false, dotSize: false, shift: false, scribbleSmoothness: true, scribbleSeed: true, scribbleCoverage: true },
    lsystem:     { angle: false, amplitude: false, dotSize: false, shift: false, density: false, lsysPreset: true, lsysIterations: true, lsysAngleVariance: true, lsysSeed: true, lsysScale: true },
    halftone:    { angle: false, amplitude: false, dotSize: false, shift: false, halftoneSource: true, halftoneMinR: true, halftoneMaxR: true, halftoneFrequency: true, halftoneAngle: true, halftoneInvert: true },
    stripes:     { angle: false, amplitude: false, dotSize: false, shift: false, stripeBandWidth: true, stripeGap: true, stripeAngle: true, stripePrimary: true, stripeSecondary: true, stripeSecondaryDensity: true },
    spirograph:  { angle: false, amplitude: false, dotSize: false, shift: false, density: false, spiroRatioA: true, spiroRatioB: true, spiroPhase: true, spiroTurns: true, spiroDeformation: true },
    weave:       { angle: false, amplitude: false, dotSize: false, shift: false, density: false, weavePattern: true, weaveStrandWidth: true, weaveGap: true, weaveAngle: true, weaveOver: true, weaveUnder: true },
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
    axesParam                 = 'fillAxes',
    polyTileParam             = 'fillPolyTile',
    waveSmoothingParam        = 'fillWaveSmoothing',
    waveFrequencyParam        = 'fillWaveFrequency',
    dotShapeParam             = 'fillDotShape',
    dotJitterParam            = 'fillDotJitter',
    lineCountParam            = 'fillLineCount',
    polyPaddingParam          = 'fillPolyPadding',
    polyRotationParam         = 'fillPolyRotation',
    polyRotationStepParam     = 'fillPolyRotationStep',
    polyScaleStepParam        = 'fillPolyScaleStep',
    polyScaleParam            = 'fillPolyScale',
    spiralTightnessParam      = 'fillSpiralTightness',
    spiralDirectionParam      = 'fillSpiralDirection',
    radialSkipParam           = 'fillRadialSkip',
    contourDirectionParam     = 'fillContourDirection',
    contourStepVarianceParam  = 'fillContourStepVariance',
    contourSimplifyParam      = 'fillContourSimplify',
    contourCenterPaddingParam = 'fillContourCenterPadding',
    flowFieldTypeParam        = 'fillFlowFieldType',
    flowNoiseScaleParam       = 'fillFlowNoiseScale',
    flowSeedParam             = 'fillFlowSeed',
    flowTraceLenParam         = 'fillFlowTraceLen',
    flowSeparationParam       = 'fillFlowSeparation',
    voronoiSeedsParam         = 'fillVoronoiSeeds',
    voronoiJitterParam        = 'fillVoronoiJitter',
    voronoiStrokeParam        = 'fillVoronoiStroke',
    voronoiSeedModeParam      = 'fillVoronoiSeedMode',
    truchetTileSetParam       = 'fillTruchetTileSet',
    truchetTileSizeParam      = 'fillTruchetTileSize',
    truchetSeedParam          = 'fillTruchetSeed',
    truchetRotationsParam     = 'fillTruchetRotations',
    mazeCellSizeParam         = 'fillMazeCellSize',
    mazeAlgorithmParam        = 'fillMazeAlgorithm',
    mazeBranchBiasParam       = 'fillMazeBranchBias',
    mazeSeedParam             = 'fillMazeSeed',
    mazeWallModeParam         = 'fillMazeWallMode',
    scribbleSmoothnessParam   = 'fillScribbleSmoothness',
    scribbleSeedParam         = 'fillScribbleSeed',
    scribbleCoverageParam     = 'fillScribbleCoverage',
    lsysPresetParam           = 'fillLsysPreset',
    lsysIterationsParam       = 'fillLsysIterations',
    lsysAngleVarianceParam    = 'fillLsysAngleVariance',
    lsysSeedParam             = 'fillLsysSeed',
    lsysScaleParam            = 'fillLsysScale',
    halftoneSourceParam       = 'fillHalftoneSource',
    halftoneMinRParam         = 'fillHalftoneMinR',
    halftoneMaxRParam         = 'fillHalftoneMaxR',
    halftoneFrequencyParam    = 'fillHalftoneFrequency',
    halftoneAngleParam        = 'fillHalftoneAngle',
    halftoneInvertParam       = 'fillHalftoneInvert',
    stripeBandWidthParam      = 'fillStripeBandWidth',
    stripeGapParam            = 'fillStripeGap',
    stripeAngleParam          = 'fillStripeAngle',
    stripePrimaryParam        = 'fillStripePrimary',
    stripeSecondaryParam      = 'fillStripeSecondary',
    stripeSecondaryDensityParam = 'fillStripeSecondaryDensity',
    spiroRatioAParam          = 'fillSpiroRatioA',
    spiroRatioBParam          = 'fillSpiroRatioB',
    spiroPhaseParam           = 'fillSpiroPhase',
    spiroTurnsParam           = 'fillSpiroTurns',
    spiroDeformationParam     = 'fillSpiroDeformation',
    weavePatternParam         = 'fillWeavePattern',
    weaveStrandWidthParam     = 'fillWeaveStrandWidth',
    weaveGapParam             = 'fillWeaveGap',
    weaveAngleParam           = 'fillWeaveAngle',
    weaveOverParam            = 'fillWeaveOver',
    weaveUnderParam           = 'fillWeaveUnder',
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
        // Honour FILL_CAPS.density. Default-true (undefined → true) so every
        // legacy fill keeps the slider; the six B-series fills that own their
        // own spacing knob opt out via `density: false`.
        showIf: (p) => isActive(p) && caps(p).density !== false,
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
          { value: 'circle',        label: 'Circle' },
          { value: 'square',        label: 'Square' },
          { value: 'filled-square', label: 'Filled Square' },
          { value: 'cross',         label: 'Cross' },
          { value: 'tick',          label: 'Tick' },
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
        id: polyScaleParam,
        label: 'Poly Scale',
        type: 'range',
        min: 0.1,
        max: 3.0,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).polyScale,
        infoKey: `${descKeyPrefix}.polyScale`,
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
        id: waveFrequencyParam,
        label: 'Wave Frequency',
        type: 'range',
        min: 0.25,
        max: 4.0,
        step: 0.05,
        showIf: (p) => isActive(p) && !!caps(p).waveFrequency,
        infoKey: `${descKeyPrefix}.waveFrequency`,
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
        id: contourDirectionParam,
        label: 'Contour Direction',
        type: 'select',
        options: [{ value: 'inset', label: 'Inset' }, { value: 'outset', label: 'Outset' }],
        showIf: (p) => isActive(p) && !!caps(p).contourDirection,
        infoKey: `${descKeyPrefix}.contourDirection`,
      },
      {
        id: contourStepVarianceParam,
        label: 'Step Variance',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).contourStepVariance,
        infoKey: `${descKeyPrefix}.contourStepVariance`,
      },
      {
        id: contourSimplifyParam,
        label: 'Simplify',
        type: 'range',
        min: 0,
        max: 0.5,
        step: 0.01,
        showIf: (p) => isActive(p) && !!caps(p).contourSimplify,
        infoKey: `${descKeyPrefix}.contourSimplify`,
      },
      {
        id: contourCenterPaddingParam,
        label: 'Center Padding',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.1,
        showIf: (p) => isActive(p) && !!caps(p).contourCenterPadding,
        infoKey: `${descKeyPrefix}.contourCenterPadding`,
      },
      {
        id: radialSkipParam,
        label: 'Radial Skip',
        type: 'range',
        min: 0,
        max: 5,
        step: 1,
        showIf: (p) => isActive(p) && !!caps(p).radialSkip,
        infoKey: `${descKeyPrefix}.radialSkip`,
      },
      // B1 Flow Field
      { id: flowFieldTypeParam, label: 'Field Type', type: 'select', options: [{ value: 'perlin', label: 'Perlin' }, { value: 'curl', label: 'Curl' }, { value: 'radial', label: 'Radial' }, { value: 'spiral', label: 'Spiral' }], showIf: (p) => isActive(p) && !!caps(p).flowFieldType, infoKey: `${descKeyPrefix}.flowFieldType` },
      { id: flowNoiseScaleParam, label: 'Noise Scale', type: 'range', min: 0.5, max: 20, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).flowNoiseScale, infoKey: `${descKeyPrefix}.flowNoiseScale` },
      { id: flowSeedParam, label: 'Seed', type: 'range', min: 0, max: 999, step: 1, showIf: (p) => isActive(p) && !!caps(p).flowSeed, infoKey: `${descKeyPrefix}.flowSeed` },
      { id: flowTraceLenParam, label: 'Trace Length', type: 'range', min: 5, max: 200, step: 1, showIf: (p) => isActive(p) && !!caps(p).flowTraceLen, infoKey: `${descKeyPrefix}.flowTraceLen` },
      { id: flowSeparationParam, label: 'Separation', type: 'range', min: 0.5, max: 10, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).flowSeparation, infoKey: `${descKeyPrefix}.flowSeparation` },
      // B2 Voronoi
      { id: voronoiSeedsParam, label: 'Seeds', type: 'range', min: 5, max: 400, step: 1, showIf: (p) => isActive(p) && !!caps(p).voronoiSeeds, infoKey: `${descKeyPrefix}.voronoiSeeds` },
      { id: voronoiJitterParam, label: 'Jitter', type: 'range', min: 0, max: 1, step: 0.01, showIf: (p) => isActive(p) && !!caps(p).voronoiJitter, infoKey: `${descKeyPrefix}.voronoiJitter` },
      { id: voronoiStrokeParam, label: 'Stroke', type: 'select', options: [{ value: 'boundary', label: 'Boundary' }, { value: 'centroid-spokes', label: 'Centroid Spokes' }, { value: 'concentric', label: 'Concentric' }, { value: 'boundary+centroid', label: 'Boundary + Centroid' }], showIf: (p) => isActive(p) && !!caps(p).voronoiStroke, infoKey: `${descKeyPrefix}.voronoiStroke` },
      { id: voronoiSeedModeParam, label: 'Seed Mode', type: 'select', options: [{ value: 'random', label: 'Random' }, { value: 'hexgrid', label: 'Hex Grid' }, { value: 'square', label: 'Square' }], showIf: (p) => isActive(p) && !!caps(p).voronoiSeedMode, infoKey: `${descKeyPrefix}.voronoiSeedMode` },
      // B3 Truchet
      { id: truchetTileSetParam, label: 'Tile Set', type: 'select', options: [{ value: 'quarter-arcs', label: 'Quarter Arcs' }, { value: 'diagonals', label: 'Diagonals' }, { value: 'dots-and-lines', label: 'Dots & Lines' }, { value: 'triangle-split', label: 'Triangle Split' }, { value: 'scribble', label: 'Scribble' }], showIf: (p) => isActive(p) && !!caps(p).truchetTileSet, infoKey: `${descKeyPrefix}.truchetTileSet` },
      { id: truchetTileSizeParam, label: 'Tile Spacing', type: 'range', min: 1, max: 30, step: 0.5, showIf: (p) => isActive(p) && !!caps(p).truchetTileSize, infoKey: `${descKeyPrefix}.truchetTileSize` },
      { id: truchetSeedParam, label: 'Seed', type: 'range', min: 0, max: 999, step: 1, showIf: (p) => isActive(p) && !!caps(p).truchetSeed, infoKey: `${descKeyPrefix}.truchetSeed` },
      { id: truchetRotationsParam, label: 'Rotations', type: 'range', min: 1, max: 4, step: 1, showIf: (p) => isActive(p) && !!caps(p).truchetRotations, infoKey: `${descKeyPrefix}.truchetRotations` },
      // B4 Maze
      { id: mazeCellSizeParam, label: 'Cell Spacing', type: 'range', min: 1, max: 20, step: 0.5, showIf: (p) => isActive(p) && !!caps(p).mazeCellSize, infoKey: `${descKeyPrefix}.mazeCellSize` },
      { id: mazeAlgorithmParam, label: 'Algorithm', type: 'select', options: [{ value: 'dfs', label: 'DFS' }, { value: 'wilson', label: 'Wilson' }, { value: 'eller', label: 'Eller' }, { value: 'recursive-division', label: 'Recursive Division' }], showIf: (p) => isActive(p) && !!caps(p).mazeAlgorithm, infoKey: `${descKeyPrefix}.mazeAlgorithm` },
      { id: mazeBranchBiasParam, label: 'Branch Bias', type: 'range', min: 0, max: 1, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).mazeBranchBias, infoKey: `${descKeyPrefix}.mazeBranchBias` },
      { id: mazeSeedParam, label: 'Seed', type: 'range', min: 0, max: 999, step: 1, showIf: (p) => isActive(p) && !!caps(p).mazeSeed, infoKey: `${descKeyPrefix}.mazeSeed` },
      { id: mazeWallModeParam, label: 'Render', type: 'select', options: [{ value: 'walls', label: 'Walls' }, { value: 'path', label: 'Path' }, { value: 'both', label: 'Both' }], showIf: (p) => isActive(p) && !!caps(p).mazeWallMode, infoKey: `${descKeyPrefix}.mazeWallMode` },
      // B5 Scribble
      { id: scribbleSmoothnessParam, label: 'Smoothness', type: 'range', min: 0, max: 1, step: 0.01, showIf: (p) => isActive(p) && !!caps(p).scribbleSmoothness, infoKey: `${descKeyPrefix}.scribbleSmoothness` },
      { id: scribbleSeedParam, label: 'Seed', type: 'range', min: 0, max: 999, step: 1, showIf: (p) => isActive(p) && !!caps(p).scribbleSeed, infoKey: `${descKeyPrefix}.scribbleSeed` },
      { id: scribbleCoverageParam, label: 'Coverage', type: 'range', min: 0.1, max: 3, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).scribbleCoverage, infoKey: `${descKeyPrefix}.scribbleCoverage` },
      // B6 L-System
      { id: lsysPresetParam, label: 'Preset', type: 'select', options: [{ value: 'coral', label: 'Coral' }, { value: 'lichen', label: 'Lichen' }, { value: 'plant', label: 'Plant' }, { value: 'dendritic', label: 'Dendritic' }, { value: 'algae', label: 'Algae' }], showIf: (p) => isActive(p) && !!caps(p).lsysPreset, infoKey: `${descKeyPrefix}.lsysPreset` },
      { id: lsysIterationsParam, label: 'Iterations', type: 'range', min: 1, max: 6, step: 1, showIf: (p) => isActive(p) && !!caps(p).lsysIterations, infoKey: `${descKeyPrefix}.lsysIterations` },
      { id: lsysAngleVarianceParam, label: 'Angle Variance', type: 'range', min: 0, max: 30, step: 0.5, showIf: (p) => isActive(p) && !!caps(p).lsysAngleVariance, infoKey: `${descKeyPrefix}.lsysAngleVariance` },
      { id: lsysSeedParam, label: 'Seed', type: 'range', min: 0, max: 999, step: 1, showIf: (p) => isActive(p) && !!caps(p).lsysSeed, infoKey: `${descKeyPrefix}.lsysSeed` },
      { id: lsysScaleParam, label: 'Scale', type: 'range', min: 0.2, max: 5, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).lsysScale, infoKey: `${descKeyPrefix}.lsysScale` },
      // B7 Halftone
      { id: halftoneSourceParam, label: 'Source', type: 'select', options: [{ value: 'radial', label: 'Radial' }, { value: 'linear', label: 'Linear' }, { value: 'noise', label: 'Noise' }, { value: 'distance-to-edge', label: 'Distance to Edge' }], showIf: (p) => isActive(p) && !!caps(p).halftoneSource, infoKey: `${descKeyPrefix}.halftoneSource` },
      { id: halftoneMinRParam, label: 'Min Radius', type: 'range', min: 0.05, max: 3, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).halftoneMinR, infoKey: `${descKeyPrefix}.halftoneMinR` },
      { id: halftoneMaxRParam, label: 'Max Radius', type: 'range', min: 0.1, max: 5, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).halftoneMaxR, infoKey: `${descKeyPrefix}.halftoneMaxR` },
      { id: halftoneFrequencyParam, label: 'Noise Grid Spacing', type: 'range', min: 0.5, max: 20, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).halftoneFrequency && p[halftoneSourceParam] === 'noise', infoKey: `${descKeyPrefix}.halftoneFrequency` },
      { id: halftoneAngleParam, label: 'Gradient Angle', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', showIf: (p) => isActive(p) && !!caps(p).halftoneAngle, infoKey: `${descKeyPrefix}.halftoneAngle` },
      { id: halftoneInvertParam, label: 'Invert', type: 'select', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], showIf: (p) => isActive(p) && !!caps(p).halftoneInvert, infoKey: `${descKeyPrefix}.halftoneInvert` },
      // B8 Stripes
      { id: stripeBandWidthParam, label: 'Band Spacing', type: 'range', min: 0.5, max: 50, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).stripeBandWidth, infoKey: `${descKeyPrefix}.stripeBandWidth` },
      { id: stripeGapParam, label: 'Gap', type: 'range', min: 0, max: 50, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).stripeGap, infoKey: `${descKeyPrefix}.stripeGap` },
      { id: stripeAngleParam, label: 'Angle', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', showIf: (p) => isActive(p) && !!caps(p).stripeAngle, infoKey: `${descKeyPrefix}.stripeAngle` },
      { id: stripePrimaryParam, label: 'Primary Fill', type: 'select', options: fillTypeOptions.filter((o) => o.value !== 'none' && o.value !== 'stripes'), showIf: (p) => isActive(p) && !!caps(p).stripePrimary, infoKey: `${descKeyPrefix}.stripePrimary` },
      { id: stripeSecondaryParam, label: 'Secondary Fill', type: 'select', options: fillTypeOptions.filter((o) => o.value !== 'stripes'), showIf: (p) => isActive(p) && !!caps(p).stripeSecondary, infoKey: `${descKeyPrefix}.stripeSecondary` },
      { id: stripeSecondaryDensityParam, label: 'Secondary Density', type: 'range', min: 0.1, max: 10, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).stripeSecondaryDensity && p[stripeSecondaryParam] && p[stripeSecondaryParam] !== 'none', infoKey: `${descKeyPrefix}.stripeSecondaryDensity` },
      // B9 Spirograph
      { id: spiroRatioAParam, label: 'Ratio A', type: 'range', min: 1, max: 20, step: 0.5, showIf: (p) => isActive(p) && !!caps(p).spiroRatioA, infoKey: `${descKeyPrefix}.spiroRatioA` },
      { id: spiroRatioBParam, label: 'Ratio B', type: 'range', min: 1, max: 20, step: 0.5, showIf: (p) => isActive(p) && !!caps(p).spiroRatioB, infoKey: `${descKeyPrefix}.spiroRatioB` },
      { id: spiroPhaseParam, label: 'Phase', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', showIf: (p) => isActive(p) && !!caps(p).spiroPhase, infoKey: `${descKeyPrefix}.spiroPhase` },
      { id: spiroTurnsParam, label: 'Turns', type: 'range', min: 1, max: 200, step: 1, showIf: (p) => isActive(p) && !!caps(p).spiroTurns, infoKey: `${descKeyPrefix}.spiroTurns` },
      { id: spiroDeformationParam, label: 'Deformation', type: 'range', min: 0, max: 1, step: 0.01, showIf: (p) => isActive(p) && !!caps(p).spiroDeformation, infoKey: `${descKeyPrefix}.spiroDeformation` },
      // B10 Weave
      { id: weavePatternParam, label: 'Pattern', type: 'select', options: [{ value: 'plain', label: 'Plain' }, { value: 'twill', label: 'Twill' }, { value: 'basket', label: 'Basket' }, { value: 'satin', label: 'Satin' }], showIf: (p) => isActive(p) && !!caps(p).weavePattern, infoKey: `${descKeyPrefix}.weavePattern` },
      { id: weaveStrandWidthParam, label: 'Strand Spacing', type: 'range', min: 0.3, max: 10, step: 0.1, showIf: (p) => isActive(p) && !!caps(p).weaveStrandWidth, infoKey: `${descKeyPrefix}.weaveStrandWidth` },
      { id: weaveGapParam, label: 'Gap', type: 'range', min: 0, max: 5, step: 0.05, showIf: (p) => isActive(p) && !!caps(p).weaveGap, infoKey: `${descKeyPrefix}.weaveGap` },
      { id: weaveAngleParam, label: 'Angle', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', showIf: (p) => isActive(p) && !!caps(p).weaveAngle, infoKey: `${descKeyPrefix}.weaveAngle` },
      { id: weaveOverParam, label: 'Over', type: 'range', min: 1, max: 6, step: 1, showIf: (p) => isActive(p) && !!caps(p).weaveOver && p[weavePatternParam] && p[weavePatternParam] !== 'plain', infoKey: `${descKeyPrefix}.weaveOver` },
      { id: weaveUnderParam, label: 'Under', type: 'range', min: 1, max: 6, step: 1, showIf: (p) => isActive(p) && !!caps(p).weaveUnder && p[weavePatternParam] && p[weavePatternParam] !== 'plain', infoKey: `${descKeyPrefix}.weaveUnder` },
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
