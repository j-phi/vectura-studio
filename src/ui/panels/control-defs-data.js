/**
 * Vectura control-defs data tables.
 *
 * Houses the static data tables consumed by the UI satellites:
 *
 *   Wave/noise option tables:
 *     WAVE_NOISE_OPTIONS, WAVE_NOISE_DESCRIPTIONS,
 *     IMAGE_NOISE_STYLE_OPTIONS, WAVE_PATTERN_TYPES, WAVE_CELL_TYPES,
 *     WAVE_STEP_TYPES, WAVE_WARP_TYPES, WAVE_SEEDED_TYPES,
 *     WAVE_NOISE_BLEND_OPTIONS, IMAGE_EFFECT_OPTIONS, IMAGE_EFFECT_DEFS,
 *     WAVE_TILE_OPTIONS, IMAGE_NOISE_DEFAULT_AMPLITUDE
 *
 *   Algorithm-specific NOISE_DEFS:
 *     WAVE_NOISE_DEFS, RINGS_NOISE_DEFS, TOPO_NOISE_DEFS,
 *     FLOWFIELD_NOISE_DEFS, GRID_NOISE_DEFS, PHYLLA_NOISE_DEFS,
 *     PETALIS_DRIFT_NOISE_DEFS, and the cloneNoiseDef helper.
 *
 *   Petalis registry data + factories + petal-designer constants:
 *     PETALIS_MODIFIER_TYPES, PETALIS_PETAL_MODIFIER_TYPES,
 *     PETALIS_SHADING_TYPES, PETALIS_LINE_TYPES,
 *     createPetalisModifier, createPetalModifier, createPetalisShading,
 *     PETAL_DESIGNER_TARGET_OPTIONS, PETAL_DESIGNER_PROFILE_*,
 *     PETAL_DESIGNER_WIDTH_MATCH_BASELINE, PETALIS_DESIGNER_DEFAULT_*,
 *     PETALIS_DESIGNER_VIEW_STYLE_OPTIONS, PETALIS_DESIGNER_RANDOMNESS_DEFS.
 *
 * Exposed publicly on window.Vectura.UI.ControlDefsData so satellites
 * (algo-config-panel, info-modals, noise-rack-panel, ui-petal-designer)
 * can consume the single source of truth without re-declaring locals.
 *
 * Additionally republishes the NOISE_DEFS keys + IMAGE_EFFECT_DEFS on the
 * pre-existing window.Vectura._UINoiseDefs namespace (introduced by the
 * noise-rack-panel work). COMMON_CONTROLS lives in src/ui/ui.js and is
 * merged into _UINoiseDefs by the orchestrator bootstrap.
 *
 * Load order: must run AFTER src/config/defaults.js (consumes ALGO_DEFAULTS
 * for PETALIS_DESIGNER_DEFAULT_*) and AFTER src/core/algorithms (uses
 * AlgorithmUtils.clamp). Currently loaded BEFORE src/ui/controls-registry.js
 * and src/ui/ui.js in index.html.
 *
 * Compile gate at tests/unit/control-defs-data-compile.test.js.
 */
(() => {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const { ALGO_DEFAULTS = {} } = Vectura;
  const clamp = (Vectura.AlgorithmUtils && Vectura.AlgorithmUtils.clamp)
    || ((v, lo, hi) => Math.max(lo, Math.min(hi, v)));

  const WAVE_NOISE_OPTIONS = [
    { value: 'billow', label: 'Billow' },
    { value: 'cellular', label: 'Cellular' },
    { value: 'checker', label: 'Checker' },
    { value: 'crackle', label: 'Crackle' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'domain', label: 'Domain Warp' },
    { value: 'dunes', label: 'Dunes' },
    { value: 'facet', label: 'Facet' },
    { value: 'fbm', label: 'Fractal' },
    { value: 'grain', label: 'Grain' },
    { value: 'image', label: 'Image' },
    { value: 'marble', label: 'Marble' },
    { value: 'moire', label: 'Moire' },
    { value: 'perlin', label: 'Perlin' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'pulse', label: 'Pulse' },
    { value: 'radial', label: 'Radial' },
    { value: 'ridged', label: 'Ridged' },
    { value: 'ripple', label: 'Ripple' },
    { value: 'sawtooth', label: 'Sawtooth' },
    { value: 'simplex', label: 'Simplex' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'steps', label: 'Steps' },
    { value: 'stripes', label: 'Stripes' },
    { value: 'swirl', label: 'Swirl' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'turbulence', label: 'Turbulence' },
    { value: 'value', label: 'Value' },
    { value: 'voronoi', label: 'Voronoi' },
    { value: 'warp', label: 'Warp' },
    { value: 'weave', label: 'Weave' },
    { value: 'zigzag', label: 'Zigzag' },
  ];

  const WAVE_NOISE_DESCRIPTIONS = {
    billow: 'Soft, cloud-like noise from absolute values.',
    cellular: 'Organic cell fields with crater-like edges.',
    checker: 'Alternating square grid pattern.',
    crackle: 'Cracked borders between Voronoi cells.',
    crosshatch: 'Interlaced angled line texture.',
    domain: 'Warped noise using domain distortion.',
    dunes: 'Sweeping dune bands with long gradients.',
    facet: 'Faceted plateaus with stepped transitions.',
    fbm: 'Fractal Brownian motion with layered octaves.',
    grain: 'Fine high-frequency grain texture.',
    image: 'Uses uploaded image luminance for displacement.',
    marble: 'Swirled marble streaks from sine warping.',
    moire: 'Interference waves with repeating offsets.',
    perlin: 'Classic Perlin gradient noise.',
    polygon: 'Centered polygon field with adjustable edges.',
    pulse: 'Radial pulse rings that expand outward.',
    radial: 'Circular waves emanating from the center.',
    ridged: 'Sharp ridges from inverted absolute noise.',
    ripple: 'Concentric ripple rings with falloff.',
    sawtooth: 'Ramping sawtooth bands.',
    simplex: 'Simplex gradient noise, smooth and balanced.',
    spiral: 'Spiral wave interference pattern.',
    steps: 'Quantized step bands with hard transitions.',
    stripes: 'Linear stripe bands across the canvas.',
    swirl: 'Rotational swirl pattern with curls.',
    triangle: 'Triangle wave pattern with sharp peaks.',
    turbulence: 'Layered absolute noise with bold contrast.',
    value: 'Value noise with blockier transitions.',
    voronoi: 'Voronoi cell distance field.',
    warp: 'Noise warped by itself for distortion.',
    weave: 'Woven cross pattern with alternating bands.',
    zigzag: 'Zigzag chevron waves.',
  };

  const IMAGE_NOISE_STYLE_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'curve', label: 'Curved' },
    { value: 'angled', label: 'Angled' },
    { value: 'noisy', label: 'Noisy' },
  ];

  const WAVE_PATTERN_TYPES = [
    'stripes',
    'marble',
    'checker',
    'zigzag',
    'ripple',
    'spiral',
    'crosshatch',
    'pulse',
    'swirl',
    'radial',
    'weave',
    'moire',
    'sawtooth',
    'dunes',
  ];
  const WAVE_CELL_TYPES = ['cellular', 'voronoi', 'crackle'];
  const WAVE_STEP_TYPES = ['steps', 'facet'];
  const WAVE_WARP_TYPES = ['warp', 'domain'];
  const WAVE_SEEDED_TYPES = ['steps', 'value', 'perlin', 'facet'];

  const WAVE_NOISE_BLEND_OPTIONS = [
    { value: 'add', label: 'Additive' },
    { value: 'subtract', label: 'Subtract' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'max', label: 'Max' },
    { value: 'min', label: 'Min' },
    { value: 'hatch-dark', label: 'Hatching Density (Chiaroscuro)' },
    { value: 'hatch-light', label: 'Hatching Density (Tenebrism)' },
  ];

  const IMAGE_EFFECT_OPTIONS = [
    { value: 'luma', label: 'Luma' },
    { value: 'brightness', label: 'Brightness' },
    { value: 'contrast', label: 'Contrast' },
    { value: 'gamma', label: 'Gamma' },
    { value: 'levels', label: 'Levels' },
    { value: 'invert', label: 'Invert' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'posterize', label: 'Posterize' },
    { value: 'edge', label: 'Edge Detect' },
    { value: 'blur', label: 'Blur' },
    { value: 'emboss', label: 'Emboss' },
    { value: 'sharpen', label: 'Sharpen' },
    { value: 'solarize', label: 'Solarize' },
    { value: 'pixelate', label: 'Pixelate' },
    { value: 'dither', label: 'Dither' },
    { value: 'median', label: 'Median' },
    { value: 'highpass', label: 'High Pass' },
    { value: 'lowpass', label: 'Low Pass' },
    { value: 'vignette', label: 'Vignette' },
    { value: 'curve', label: 'Tone Curve' },
    { value: 'bandpass', label: 'Bandpass' },
  ];

  const IMAGE_EFFECT_DEFS = [
    {
      key: 'mode',
      label: 'Effect Mode',
      type: 'select',
      options: IMAGE_EFFECT_OPTIONS,
      infoKey: 'wavetable.imageAlgo',
    },
    {
      key: 'imageBrightness',
      label: 'Brightness',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageBrightness',
      showIf: (e) => e.mode === 'brightness',
    },
    {
      key: 'imageLevelsLow',
      label: 'Levels Low',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageLevelsLow',
      showIf: (e) => e.mode === 'levels',
    },
    {
      key: 'imageLevelsHigh',
      label: 'Levels High',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageLevelsHigh',
      showIf: (e) => e.mode === 'levels',
    },
    {
      key: 'imageGamma',
      label: 'Gamma',
      type: 'range',
      min: 0.2,
      max: 3,
      step: 0.05,
      infoKey: 'wavetable.imageGamma',
      showIf: (e) => e.mode === 'gamma',
    },
    {
      key: 'imageContrast',
      label: 'Contrast',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageContrast',
      showIf: (e) => e.mode === 'contrast',
    },
    {
      key: 'imageEmbossStrength',
      label: 'Emboss Strength',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageEmbossStrength',
      showIf: (e) => e.mode === 'emboss',
    },
    {
      key: 'imageSharpenAmount',
      label: 'Sharpen Amount',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageSharpenAmount',
      showIf: (e) => e.mode === 'sharpen',
    },
    {
      key: 'imageSharpenRadius',
      label: 'Sharpen Radius',
      type: 'range',
      min: 0,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageSharpenRadius',
      showIf: (e) => e.mode === 'sharpen',
    },
    {
      key: 'imageMedianRadius',
      label: 'Median Radius',
      type: 'range',
      min: 1,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageMedianRadius',
      showIf: (e) => e.mode === 'median',
    },
    {
      key: 'imageBlurRadius',
      label: 'Blur Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageBlurRadius',
      showIf: (e) => e.mode === 'blur',
    },
    {
      key: 'imageBlurStrength',
      label: 'Blur Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageBlurStrength',
      showIf: (e) => e.mode === 'blur',
    },
    {
      key: 'imageSolarize',
      label: 'Solarize Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageSolarize',
      showIf: (e) => e.mode === 'solarize',
    },
    {
      key: 'imagePixelate',
      label: 'Pixelate',
      type: 'range',
      min: 2,
      max: 64,
      step: 1,
      infoKey: 'wavetable.imagePixelate',
      showIf: (e) => e.mode === 'pixelate',
    },
    {
      key: 'imageDither',
      label: 'Dither Amount',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageDither',
      showIf: (e) => e.mode === 'dither',
    },
    {
      key: 'imageThreshold',
      label: 'Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageThreshold',
      showIf: (e) => e.mode === 'threshold',
    },
    {
      key: 'imagePosterize',
      label: 'Posterize Levels',
      type: 'range',
      min: 2,
      max: 10,
      step: 1,
      infoKey: 'wavetable.imagePosterize',
      showIf: (e) => e.mode === 'posterize',
    },
    {
      key: 'imageEdgeBlur',
      label: 'Edge Blur Radius',
      type: 'range',
      min: 0,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageBlur',
      showIf: (e) => e.mode === 'edge',
    },
    {
      key: 'imageHighpassRadius',
      label: 'High Pass Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageHighpassRadius',
      showIf: (e) => e.mode === 'highpass',
    },
    {
      key: 'imageHighpassStrength',
      label: 'High Pass Strength',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageHighpassStrength',
      showIf: (e) => e.mode === 'highpass',
    },
    {
      key: 'imageLowpassRadius',
      label: 'Low Pass Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageLowpassRadius',
      showIf: (e) => e.mode === 'lowpass',
    },
    {
      key: 'imageLowpassStrength',
      label: 'Low Pass Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageLowpassStrength',
      showIf: (e) => e.mode === 'lowpass',
    },
    {
      key: 'imageVignetteStrength',
      label: 'Vignette Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageVignetteStrength',
      showIf: (e) => e.mode === 'vignette',
    },
    {
      key: 'imageVignetteRadius',
      label: 'Vignette Radius',
      type: 'range',
      min: 0.2,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageVignetteRadius',
      showIf: (e) => e.mode === 'vignette',
    },
    {
      key: 'imageCurveStrength',
      label: 'Curve Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageCurveStrength',
      showIf: (e) => e.mode === 'curve',
    },
    {
      key: 'imageBandCenter',
      label: 'Band Center',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageBandCenter',
      showIf: (e) => e.mode === 'bandpass',
    },
    {
      key: 'imageBandWidth',
      label: 'Band Width',
      type: 'range',
      min: 0.05,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageBandWidth',
      showIf: (e) => e.mode === 'bandpass',
    },
  ];

  const WAVE_TILE_OPTIONS = [
    { value: 'off', label: 'Off' },
    { value: 'brick', label: 'Brick' },
    { value: 'checker', label: 'Checker' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'grid', label: 'Grid' },
    { value: 'hex', label: 'Hex' },
    { value: 'offset', label: 'Offset' },
    { value: 'radial', label: 'Radial' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'wave', label: 'Wave' },
  ];
  const IMAGE_NOISE_DEFAULT_AMPLITUDE = 1.7;

  const WAVE_NOISE_DEFS = [
    {
      key: 'type',
      label: 'Noise Type',
      type: 'select',
      randomExclude: ['image'],
      options: WAVE_NOISE_OPTIONS,
      infoKey: 'wavetable.noiseType',
    },
    {
      key: 'noiseStyle',
      label: 'Noise Style',
      type: 'select',
      options: IMAGE_NOISE_STYLE_OPTIONS,
      infoKey: 'wavetable.imageNoiseStyle',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageInvertColor',
      label: 'Invert Color',
      type: 'checkbox',
      infoKey: 'wavetable.imageInvertColor',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageInvertOpacity',
      label: 'Invert Opacity',
      type: 'checkbox',
      infoKey: 'wavetable.imageInvertOpacity',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'blend',
      label: 'Blend Mode',
      type: 'select',
      options: WAVE_NOISE_BLEND_OPTIONS,
      infoKey: 'wavetable.noiseBlend',
    },
    {
      key: 'applyMode',
      label: 'Apply Mode',
      type: 'select',
      options: [
        { value: 'topdown', label: 'Top Down' },
        { value: 'linear', label: 'Linear' },
      ],
      infoKey: 'wavetable.noiseApplyMode',
      showIf: (n) => n.applyMode !== undefined,
    },
    { key: 'amplitude', label: 'Noise Amplitude', type: 'range', min: -100, max: 100, step: 0.1, infoKey: 'wavetable.amplitude' },
    { key: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.002, max: 0.08, step: 0.001, infoKey: 'wavetable.zoom' },
    {
      key: 'imageWidth',
      label: 'Noise Width',
      type: 'range',
      min: 0.1,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.imageWidth',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageHeight',
      label: 'Noise Height',
      type: 'range',
      min: 0.1,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.imageHeight',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'microFreq',
      label: 'Micro Frequency',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.1,
      infoKey: 'wavetable.imageMicroFreq',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'noiseThreshold',
      label: 'Noise Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageNoiseThreshold',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'freq',
      label: 'Frequency',
      type: 'range',
      min: 0.2,
      max: 12.0,
      step: 0.1,
      infoKey: 'wavetable.freq',
      showIf: (n) => n.type !== 'image',
    },
    {
      key: 'angle',
      label: 'Noise Angle',
      type: 'angle',
      min: 0,
      max: 360,
      step: 1,
      displayUnit: '°',
      infoKey: 'wavetable.noiseAngle',
    },
    {
      key: 'shiftX',
      label: 'Noise X-Shift',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.noiseShiftX',
    },
    {
      key: 'shiftY',
      label: 'Noise Y-Shift',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.noiseShiftY',
    },
    {
      key: 'tileMode',
      label: 'Tile Mode',
      type: 'select',
      options: WAVE_TILE_OPTIONS,
      infoKey: 'wavetable.noiseTileMode',
    },
    {
      key: 'tilePadding',
      label: 'Tile Padding',
      type: 'range',
      min: 0,
      max: 0.45,
      step: 0.01,
      infoKey: 'wavetable.noiseTilePadding',
      showIf: (n) => (n.tileMode || 'off') !== 'off',
    },
    {
      key: 'patternScale',
      label: 'Pattern Scale',
      type: 'range',
      min: 0.2,
      max: 6,
      step: 0.05,
      infoKey: 'wavetable.noisePatternScale',
      showIf: (n) => WAVE_PATTERN_TYPES.includes(n.type),
    },
    {
      key: 'warpStrength',
      label: 'Warp Strength',
      type: 'range',
      min: 0,
      max: 3,
      step: 0.05,
      infoKey: 'wavetable.noiseWarpStrength',
      showIf: (n) => WAVE_WARP_TYPES.includes(n.type),
    },
    {
      key: 'cellularScale',
      label: 'Cell Scale',
      type: 'range',
      min: 0.5,
      max: 6,
      step: 0.1,
      infoKey: 'wavetable.noiseCellScale',
      showIf: (n) => WAVE_CELL_TYPES.includes(n.type),
    },
    {
      key: 'cellularJitter',
      label: 'Cell Jitter',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noiseCellJitter',
      showIf: (n) => WAVE_CELL_TYPES.includes(n.type),
    },
    {
      key: 'stepsCount',
      label: 'Step Count',
      type: 'range',
      min: 2,
      max: 16,
      step: 1,
      infoKey: 'wavetable.noiseSteps',
      showIf: (n) => WAVE_STEP_TYPES.includes(n.type),
    },
    {
      key: 'seed',
      label: 'Noise Seed',
      type: 'range',
      min: 0,
      max: 9999,
      step: 1,
      infoKey: 'wavetable.noiseSeed',
      showIf: (n) => WAVE_SEEDED_TYPES.includes(n.type),
    },
    {
      key: 'polygonRadius',
      label: 'Polygon Radius',
      type: 'range',
      min: 0.2,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonRadius',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonSides',
      label: 'Polygon Sides',
      type: 'range',
      min: 3,
      max: 12,
      step: 1,
      infoKey: 'wavetable.noisePolygonSides',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonRotation',
      label: 'Polygon Rotation',
      type: 'angle',
      min: 0,
      max: 360,
      step: 1,
      displayUnit: '°',
      infoKey: 'wavetable.noisePolygonRotation',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonOutline',
      label: 'Outline Width',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonOutline',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonEdgeRadius',
      label: 'Edge Radius',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonEdge',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileScale',
      label: 'Tile Scale',
      type: 'range',
      min: 0.001,
      max: 100,
      step: 0.01,
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileShiftX',
      label: 'Tile X-Shift',
      type: 'range',
      min: -50,
      max: 50,
      step: 0.1,
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileShiftY',
      label: 'Tile Y-Shift',
      type: 'range',
      min: -50,
      max: 50,
      step: 0.1,
      showIf: (n) => n.type === 'polygon',
    },
  ];

  const cloneNoiseDef = (def, overrides = {}) => ({
    ...def,
    ...overrides,
    options: overrides.options || (Array.isArray(def.options) ? def.options.map((opt) => ({ ...opt })) : def.options),
  });

  const RINGS_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.map((def) => {
      if (def.key === 'applyMode') {
        return cloneNoiseDef(def, {
          options: [
            { value: 'orbit', label: 'Orbit Field' },
            { value: 'concentric', label: 'Concentric' },
            { value: 'topdown', label: 'Top Down' },
          ],
          infoKey: 'rings.noiseProjection',
        });
      }
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          min: -80,
          max: 80,
          step: 0.5,
          infoKey: 'rings.amplitude',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.0001,
          max: 0.02,
          step: 0.0001,
          infoKey: 'rings.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'rings.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'rings.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'ringDrift',
      label: 'Ring Drift',
      type: 'range',
      min: 0,
      max: 5,
      step: 0.1,
      infoKey: 'rings.noiseLayer',
      showIf: (n) => ['orbit', 'concentric'].includes(n.applyMode || 'orbit'),
    },
    {
      key: 'ringRadius',
      label: 'Path Span',
      type: 'range',
      min: 10,
      max: 240,
      step: 1,
      infoKey: 'rings.noisePathSpan',
      showIf: (n) => (n.applyMode || 'orbit') === 'concentric',
    },
    {
      key: 'ringRadius',
      label: 'Orbit Radius',
      type: 'range',
      min: 10,
      max: 240,
      step: 1,
      infoKey: 'rings.noiseOrbitRadius',
      showIf: (n) => (n.applyMode || 'orbit') === 'orbit',
    },
  ];

  const TOPO_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'topo.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.0001,
          max: 0.02,
          step: 0.0001,
          infoKey: 'topo.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'topo.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'topo.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'topo.octaves',
      showIf: (n) => n.type === 'fbm',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'topo.lacunarity',
      showIf: (n) => n.type === 'fbm',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'topo.gain',
      showIf: (n) => n.type === 'fbm',
    },
  ];

  // Image Surface reuses topo's heightfield-style noise controls, but the rack
  // is sampled across a fixed 1024-unit span (NOISE_SPAN), so it wants a far
  // wider Noise Scale range (high zoom = fine surface detail) and a lower
  // Frequency floor than topo's pixel-space defaults. Cloned so topo's own
  // sliders are unaffected.
  const IMAGE_SURFACE_NOISE_DEFS = TOPO_NOISE_DEFS.map((def) => {
    if (def.key === 'zoom') return cloneNoiseDef(def, { min: 0.0001, max: 20, step: 0.001 });
    if (def.key === 'freq') return cloneNoiseDef(def, { min: 0.001, step: 0.01 });
    return def;
  });

  const FLOWFIELD_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'flowfield.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'flowfield.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'flowfield.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'flowfield.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'flowfield.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'flowfield.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'flowfield.gain',
    },
  ];

  const GRID_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'grid.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'grid.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'grid.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'grid.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'grid.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'grid.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'grid.gain',
    },
  ];

  const PHYLLA_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'phylla.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'phylla.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'phylla.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'phylla.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'phylla.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'phylla.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'phylla.gain',
    },
  ];

  const PETALIS_DRIFT_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Drift Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 1,
          step: 0.001,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'petalis.driftNoise',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'petalis.driftNoise',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'petalis.driftNoise',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'petalis.driftNoise',
    },
  ];

  const PETALIS_MODIFIER_TYPES = [
    {
      value: 'ripple',
      label: 'Ripple',
      controls: [
        { key: 'amount', label: 'Amplitude (mm)', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'petalis.centerModRippleAmount' },
        { key: 'frequency', label: 'Frequency', type: 'range', min: 1, max: 16, step: 1, infoKey: 'petalis.centerModRippleFrequency' },
      ],
    },
    {
      value: 'twist',
      label: 'Twist',
      controls: [{ key: 'amount', label: 'Twist (deg)', type: 'range', min: -90, max: 90, step: 1, infoKey: 'petalis.centerModTwist' }],
    },
    {
      value: 'radialNoise',
      label: 'Radial Noise',
      controls: [
        { key: 'amount', label: 'Noise Amp (mm)', type: 'range', min: 0, max: 6, step: 0.1, infoKey: 'petalis.centerModNoiseAmount' },
        { key: 'seed', label: 'Noise Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.centerModNoiseSeed' },
      ],
    },
    {
      value: 'falloff',
      label: 'Density Falloff',
      controls: [{ key: 'amount', label: 'Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerModFalloff' }],
    },
    {
      value: 'offset',
      label: 'Offset',
      controls: [
        { key: 'offsetX', label: 'Offset X (mm)', type: 'range', min: -40, max: 40, step: 1, infoKey: 'petalis.centerModOffsetX' },
        { key: 'offsetY', label: 'Offset Y (mm)', type: 'range', min: -40, max: 40, step: 1, infoKey: 'petalis.centerModOffsetY' },
      ],
    },
    {
      value: 'clip',
      label: 'Clip/Trim',
      controls: [{ key: 'radius', label: 'Clip Radius (mm)', type: 'range', min: 1, max: 120, step: 1, infoKey: 'petalis.centerModClip' }],
    },
    {
      value: 'circularOffset',
      label: 'Circular Offset',
      controls: [
        { key: 'amount', label: 'Offset Amount (mm)', type: 'range', min: 0, max: 12, step: 0.1, infoKey: 'petalis.centerModCircularAmount' },
        { key: 'randomness', label: 'Randomness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerModCircularRandomness' },
        {
          key: 'direction',
          label: 'In/Out Bias',
          type: 'range',
          min: -1,
          max: 1,
          step: 0.05,
          infoKey: 'petalis.centerModCircularDirection',
        },
        { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.centerModCircularSeed' },
      ],
    },
  ];

  const createPetalisModifier = (type = 'ripple') => ({
    id: window.Vectura.generateId(),
    enabled: true,
    type,
    amount: 2,
    frequency: 6,
    scale: 0.2,
    noises: [],
    offsetX: 0,
    offsetY: 0,
    radius: 12,
    randomness: 0.5,
    direction: 0,
    seed: 0,
  });

  const PETALIS_PETAL_MODIFIER_TYPES = [
    {
      value: 'ripple',
      label: 'Ripple',
      controls: [
        { key: 'amount', label: 'Amplitude (mm)', type: 'range', min: 0, max: 6, step: 0.1, infoKey: 'petalis.petalModRippleAmount' },
        { key: 'frequency', label: 'Frequency', type: 'range', min: 1, max: 16, step: 1, infoKey: 'petalis.petalModRippleFrequency' },
      ],
    },
    {
      value: 'twist',
      label: 'Twist',
      controls: [{ key: 'amount', label: 'Twist (deg)', type: 'range', min: -60, max: 60, step: 1, infoKey: 'petalis.petalModTwist' }],
    },
    {
      value: 'noise',
      label: 'Noise',
      controls: [
        { key: 'amount', label: 'Noise Amp (mm)', type: 'range', min: 0, max: 4, step: 0.1, infoKey: 'petalis.petalModNoiseAmount' },
        { key: 'seed', label: 'Noise Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.petalModNoiseSeed' },
      ],
    },
    {
      value: 'shear',
      label: 'Shear',
      controls: [{ key: 'amount', label: 'Shear Amount', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.petalModShear' }],
    },
    {
      value: 'taper',
      label: 'Taper',
      controls: [{ key: 'amount', label: 'Taper Amount', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.petalModTaper' }],
    },
    {
      value: 'offset',
      label: 'Offset',
      controls: [
        { key: 'offsetX', label: 'Offset X (mm)', type: 'range', min: -20, max: 20, step: 0.5, infoKey: 'petalis.petalModOffsetX' },
        { key: 'offsetY', label: 'Offset Y (mm)', type: 'range', min: -20, max: 20, step: 0.5, infoKey: 'petalis.petalModOffsetY' },
      ],
    },
  ];

  const createPetalModifier = (type = 'ripple') => ({
    id: window.Vectura.generateId(),
    enabled: true,
    type,
    target: 'both',
    amount: 1.5,
    frequency: 8,
    scale: 0.2,
    noises: [],
    offsetX: 0,
    offsetY: 0,
    seed: 0,
  });

  const PETALIS_SHADING_TYPES = [
    { value: 'radial', label: 'Radial Hatch' },
    { value: 'parallel', label: 'Parallel Hatch' },
    { value: 'spiral', label: 'Spiral Hatch' },
    { value: 'stipple', label: 'Stipple' },
    { value: 'gradient', label: 'Gradient Lines' },
    { value: 'edge', label: 'Edge Hatch' },
    { value: 'rim', label: 'Rim Strokes' },
    { value: 'outline', label: 'Outline Emphasis' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'chiaroscuro', label: 'Chiaroscuro' },
    { value: 'contour', label: 'Contour Lines' },
    { value: 'vein', label: 'Venation' },
  ];

  const PETALIS_LINE_TYPES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'stitch', label: 'Stitch' },
  ];

  const createPetalisShading = (type = 'radial') => ({
    id: window.Vectura.generateId(),
    enabled: true,
    type,
    target: 'both',
    widthX: 100,
    widthY: 60,
    posX: 50,
    posY: 50,
    gapX: 0,
    gapY: 0,
    gapPosX: 50,
    gapPosY: 50,
    lineType: 'solid',
    lineSpacing: 1,
    density: 1,
    jitter: 0,
    lengthJitter: 0,
    angle: 0,
  });

  const PETAL_DESIGNER_TARGET_OPTIONS = [
    { value: 'inner', label: 'Inner' },
    { value: 'outer', label: 'Outer' },
    { value: 'both', label: 'Both' },
  ];
  const PETAL_DESIGNER_PROFILE_DIRECTORY = './src/config/petal-profiles/';
  const PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT = '.json,application/json';
  const PETAL_DESIGNER_PROFILE_TYPE = 'vectura-petal-profile';
  const PETAL_DESIGNER_PROFILE_VERSION = 1;
  const PETAL_DESIGNER_PROFILE_BUNDLE_KEY = 'PETAL_PROFILE_LIBRARY';
  const PETAL_DESIGNER_WIDTH_MATCH_BASELINE = 0.85;

  const PETALIS_DESIGNER_DEFAULT_INNER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.innerCount ?? 20, 5, 400)
  );
  const PETALIS_DESIGNER_DEFAULT_OUTER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.outerCount ?? 20, 5, 600)
  );
  const PETALIS_DESIGNER_DEFAULT_COUNT = Math.round(
    clamp(
      ALGO_DEFAULTS?.petalisDesigner?.count ??
        PETALIS_DESIGNER_DEFAULT_INNER_COUNT + PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
      5,
      800
    )
  );
  const PETALIS_DESIGNER_VIEW_STYLE_OPTIONS = [
    { value: 'overlay', label: 'Overlay' },
    { value: 'side-by-side', label: 'Side by Side' },
  ];
  const PETALIS_DESIGNER_RANDOMNESS_DEFS = [
    { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1, precision: 0 },
    { key: 'countJitter', label: 'Count Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'sizeJitter', label: 'Size Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'rotationJitter', label: 'Rotation Jitter', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'angularDrift', label: 'Angular Drift', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'driftStrength', label: 'Drift Strength', min: 0, max: 1, step: 0.05, precision: 2 },
    { key: 'driftNoise', label: 'Drift Noise', min: 0.05, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScale', label: 'Radius Scale', min: -1, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScaleCurve', label: 'Radius Scale Curve', min: 0.5, max: 2.5, step: 0.05, precision: 2 },
  ];

  UI.ControlDefsData = {
    // Option / type lists
    WAVE_NOISE_OPTIONS,
    WAVE_NOISE_DESCRIPTIONS,
    IMAGE_NOISE_STYLE_OPTIONS,
    WAVE_PATTERN_TYPES,
    WAVE_CELL_TYPES,
    WAVE_STEP_TYPES,
    WAVE_WARP_TYPES,
    WAVE_SEEDED_TYPES,
    WAVE_NOISE_BLEND_OPTIONS,
    IMAGE_EFFECT_OPTIONS,
    IMAGE_EFFECT_DEFS,
    WAVE_TILE_OPTIONS,
    IMAGE_NOISE_DEFAULT_AMPLITUDE,

    // Algorithm-specific NOISE_DEFS + helper
    WAVE_NOISE_DEFS,
    cloneNoiseDef,
    RINGS_NOISE_DEFS,
    TOPO_NOISE_DEFS,
    IMAGE_SURFACE_NOISE_DEFS,
    FLOWFIELD_NOISE_DEFS,
    GRID_NOISE_DEFS,
    PHYLLA_NOISE_DEFS,
    PETALIS_DRIFT_NOISE_DEFS,

    // Petalis registry + factories
    PETALIS_MODIFIER_TYPES,
    PETALIS_PETAL_MODIFIER_TYPES,
    PETALIS_SHADING_TYPES,
    PETALIS_LINE_TYPES,
    createPetalisModifier,
    createPetalModifier,
    createPetalisShading,

    // Petal-designer constants
    PETAL_DESIGNER_TARGET_OPTIONS,
    PETAL_DESIGNER_PROFILE_DIRECTORY,
    PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT,
    PETAL_DESIGNER_PROFILE_TYPE,
    PETAL_DESIGNER_PROFILE_VERSION,
    PETAL_DESIGNER_PROFILE_BUNDLE_KEY,
    PETAL_DESIGNER_WIDTH_MATCH_BASELINE,
    PETALIS_DESIGNER_DEFAULT_INNER_COUNT,
    PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
    PETALIS_DESIGNER_DEFAULT_COUNT,
    PETALIS_DESIGNER_VIEW_STYLE_OPTIONS,
    PETALIS_DESIGNER_RANDOMNESS_DEFS,
  };

  // Republish the NOISE_DEFS keys onto the pre-existing _UINoiseDefs
  // namespace consumed by src/ui/panels/noise-rack-panel.js. The legacy
  // bootstrap will merge in COMMON_CONTROLS once it loads.
  Vectura._UINoiseDefs = Object.assign(Vectura._UINoiseDefs || {}, {
    WAVE_NOISE_DEFS,
    RINGS_NOISE_DEFS,
    TOPO_NOISE_DEFS,
    IMAGE_SURFACE_NOISE_DEFS,
    FLOWFIELD_NOISE_DEFS,
    GRID_NOISE_DEFS,
    PHYLLA_NOISE_DEFS,
    PETALIS_DRIFT_NOISE_DEFS,
    IMAGE_EFFECT_DEFS,
  });
})();
