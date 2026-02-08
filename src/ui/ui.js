/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MACHINES, Algorithms, SeededRNG, SimpleNoise, Layer, PALETTES } =
    window.Vectura || {};

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundToStep = (value, step) => (step ? Math.round(value / step) * step : value);
  const DISPLAY_PRECISION = 2;
  const TRANSFORM_KEYS = ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'];
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const SEEDLESS_ALGOS = new Set(['lissajous', 'harmonograph', 'expanded', 'group']);
  const usesSeed = (type) => !SEEDLESS_ALGOS.has(type);
  const mapRange = (value, inMin, inMax, outMin, outMax) => {
    if (inMax === inMin) return outMin;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  };

  const stepPrecision = (step) => {
    const s = step?.toString?.() || '';
    if (!s.includes('.')) return 0;
    return s.split('.')[1].length;
  };

  const getDisplayConfig = (def) => {
    const min = def.displayMin ?? def.min;
    const max = def.displayMax ?? def.max;
    const step = def.displayStep ?? def.step ?? 1;
    const unit = def.displayUnit ?? '';
    const precision = Number.isFinite(def.displayPrecision) ? def.displayPrecision : stepPrecision(step);
    return { min, max, step, unit, precision };
  };

  const toDisplayValue = (def, value) => {
    if (def.displayMin !== undefined || def.displayMax !== undefined) {
      const dMin = def.displayMin ?? def.min;
      const dMax = def.displayMax ?? def.max;
      return mapRange(value, def.min, def.max, dMin, dMax);
    }
    return value;
  };

  const fromDisplayValue = (def, value) => {
    if (def.displayMin !== undefined || def.displayMax !== undefined) {
      const dMin = def.displayMin ?? def.min;
      const dMax = def.displayMax ?? def.max;
      return mapRange(value, dMin, dMax, def.min, def.max);
    }
    return value;
  };

  const formatValue = (value) => {
    if (typeof value === 'number') {
      const rounded = Math.round(value * Math.pow(10, DISPLAY_PRECISION)) / Math.pow(10, DISPLAY_PRECISION);
      return rounded.toString();
    }
    return value;
  };

  const PREVIEW = {
    width: 160,
    height: 90,
    margin: 8,
    maxPaths: 160,
    maxPoints: 2400,
    maxPointsPerPath: 240,
  };

  const COMMON_CONTROLS = [
    {
      id: 'smoothing',
      label: 'Smoothing',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'common.smoothing',
    },
    {
      id: 'curves',
      label: 'Curves',
      type: 'checkbox',
      infoKey: 'common.curves',
    },
    {
      id: 'simplify',
      label: 'Simplify',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'common.simplify',
    },
  ];

  const CONTROL_DEFS = {
    expanded: [],
    flowfield: [
      {
        id: 'noiseType',
        label: 'Noise Type',
        type: 'select',
        randomExclude: ['image'],
        options: [
          { value: 'simplex', label: 'Simplex' },
          { value: 'ridged', label: 'Ridged' },
          { value: 'billow', label: 'Billow' },
          { value: 'turbulence', label: 'Turbulence' },
          { value: 'swirl', label: 'Swirl' },
          { value: 'radial', label: 'Radial' },
          { value: 'checker', label: 'Checker' },
          { value: 'curl', label: 'Curl' },
        ],
        infoKey: 'flowfield.noiseType',
      },
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.001, max: 0.2, step: 0.001, infoKey: 'flowfield.noiseScale' },
      { id: 'lacunarity', label: 'Lacunarity', type: 'range', min: 1.2, max: 4.0, step: 0.1, infoKey: 'flowfield.lacunarity' },
      { id: 'gain', label: 'Gain', type: 'range', min: 0.2, max: 0.9, step: 0.05, infoKey: 'flowfield.gain' },
      {
        id: 'density',
        label: 'Density',
        type: 'range',
        min: 200,
        max: 12000,
        step: 100,
        confirmAbove: 6000,
        confirmMessage: 'High density can be slow. Continue?',
        randomMax: 4000,
        infoKey: 'flowfield.density',
      },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 0.5, max: 30, step: 0.5, infoKey: 'flowfield.stepLen' },
      {
        id: 'maxSteps',
        label: 'Max Steps',
        type: 'range',
        min: 20,
        max: 2000,
        step: 10,
        confirmAbove: 1000,
        confirmMessage: 'Large step counts can be slow. Continue?',
        randomMax: 600,
        infoKey: 'flowfield.maxSteps',
      },
      { id: 'force', label: 'Flow Force', type: 'range', min: 0.1, max: 6.0, step: 0.1, infoKey: 'flowfield.force' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'flowfield.angleOffset',
      },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 3.0, step: 0.05, infoKey: 'flowfield.chaos' },
      {
        id: 'octaves',
        label: 'Octaves',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        confirmAbove: 4,
        confirmMessage: 'Higher octaves are slower. Continue?',
        randomMax: 4,
        infoKey: 'flowfield.octaves',
      },
      { id: 'minSteps', label: 'Minimum Steps', type: 'range', min: 2, max: 200, step: 2, infoKey: 'flowfield.minSteps' },
      { id: 'minLength', label: 'Minimum Length', type: 'range', min: 0, max: 200, step: 2, infoKey: 'flowfield.minLength' },
    ],
    lissajous: [
      { id: 'freqX', label: 'Freq X', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqX' },
      { id: 'freqY', label: 'Freq Y', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqY' },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 0.01, step: 0.0001, infoKey: 'lissajous.damping' },
      { id: 'phase', label: 'Phase', type: 'range', min: 0, max: 6.28, step: 0.1, infoKey: 'lissajous.phase' },
      { id: 'resolution', label: 'Resolution', type: 'range', min: 50, max: 800, step: 10, infoKey: 'lissajous.resolution' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.2, step: 0.05, infoKey: 'lissajous.scale' },
      { id: 'closeLines', label: 'Close Lines', type: 'checkbox', infoKey: 'lissajous.closeLines' },
    ],
    harmonograph: [
      { type: 'section', label: 'Render' },
      {
        id: 'renderMode',
        label: 'Render Mode',
        type: 'select',
        options: [
          { value: 'line', label: 'Line' },
          { value: 'dashed', label: 'Dashed Line' },
          { value: 'points', label: 'Point Field' },
          { value: 'segments', label: 'Segments' },
        ],
        infoKey: 'harmonograph.renderMode',
      },
      { id: 'samples', label: 'Samples', type: 'range', min: 400, max: 12000, step: 100, infoKey: 'harmonograph.samples' },
      { id: 'duration', label: 'Duration (s)', type: 'range', min: 5, max: 120, step: 1, infoKey: 'harmonograph.duration' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.5, step: 0.05, infoKey: 'harmonograph.scale' },
      {
        id: 'paperRotation',
        label: 'Paper Rotation (Hz)',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        infoKey: 'harmonograph.paperRotation',
      },
      {
        id: 'dashLength',
        label: 'Dash Length (mm)',
        type: 'range',
        min: 0.5,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashLength',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'dashGap',
        label: 'Dash Gap (mm)',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashGap',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'pointStride',
        label: 'Point Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.pointStride',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'pointSize',
        label: 'Point Size (mm)',
        type: 'range',
        min: 0.1,
        max: 2,
        step: 0.1,
        infoKey: 'harmonograph.pointSize',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'segmentStride',
        label: 'Segment Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.segmentStride',
        showIf: (p) => p.renderMode === 'segments',
      },
      {
        id: 'segmentLength',
        label: 'Segment Length (mm)',
        type: 'range',
        min: 1,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.segmentLength',
        showIf: (p) => p.renderMode === 'segments',
      },
      { type: 'section', label: 'Pendulum 1' },
      { id: 'ampX1', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX1' },
      { id: 'ampY1', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY1' },
      {
        id: 'phaseX1',
        label: 'Phase X',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseX1',
      },
      {
        id: 'phaseY1',
        label: 'Phase Y',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseY1',
      },
      { id: 'freq1', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq1' },
      { id: 'micro1', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro1' },
      { id: 'damp1', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp1' },
      { type: 'section', label: 'Pendulum 2' },
      { id: 'ampX2', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX2' },
      { id: 'ampY2', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY2' },
      {
        id: 'phaseX2',
        label: 'Phase X',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseX2',
      },
      {
        id: 'phaseY2',
        label: 'Phase Y',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseY2',
      },
      { id: 'freq2', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq2' },
      { id: 'micro2', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro2' },
      { id: 'damp2', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp2' },
      { type: 'section', label: 'Pendulum 3' },
      { id: 'ampX3', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX3' },
      { id: 'ampY3', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY3' },
      {
        id: 'phaseX3',
        label: 'Phase X',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseX3',
      },
      {
        id: 'phaseY3',
        label: 'Phase Y',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'harmonograph.phaseY3',
      },
      { id: 'freq3', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq3' },
      { id: 'micro3', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro3' },
      { id: 'damp3', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp3' },
    ],
    wavetable: [
      { id: 'lines', label: 'Lines', type: 'range', min: 5, max: 160, step: 1, infoKey: 'wavetable.lines' },
      {
        id: 'noiseType',
        label: 'Noise Type',
        type: 'select',
        options: [
          { value: 'simplex', label: 'Simplex' },
          { value: 'ridged', label: 'Ridged' },
          { value: 'billow', label: 'Billow' },
          { value: 'turbulence', label: 'Turbulence' },
          { value: 'stripes', label: 'Stripes' },
          { value: 'marble', label: 'Marble' },
          { value: 'steps', label: 'Steps' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'warp', label: 'Warp' },
          { value: 'cellular', label: 'Cellular' },
          { value: 'fbm', label: 'Fractal' },
          { value: 'swirl', label: 'Swirl' },
          { value: 'radial', label: 'Radial' },
          { value: 'checker', label: 'Checker' },
          { value: 'zigzag', label: 'Zigzag' },
          { value: 'ripple', label: 'Ripple' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'grain', label: 'Grain' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'pulse', label: 'Pulse' },
          { value: 'image', label: 'Image' },
        ],
        infoKey: 'wavetable.noiseType',
      },
      {
        id: 'noiseImageId',
        label: 'Noise Image',
        type: 'image',
        accept: 'image/*',
        idKey: 'noiseImageId',
        nameKey: 'noiseImageName',
        infoKey: 'wavetable.noiseImage',
        showIf: (p) => p.noiseType === 'image',
      },
      {
        id: 'imageAlgo',
        label: 'Image Noise Mode',
        type: 'select',
        options: [
          { value: 'luma', label: 'Luma' },
          { value: 'invert', label: 'Invert' },
          { value: 'threshold', label: 'Threshold' },
          { value: 'posterize', label: 'Posterize' },
          { value: 'edge', label: 'Edge Detect' },
          { value: 'blur', label: 'Blur' },
        ],
        infoKey: 'wavetable.imageAlgo',
        showIf: (p) => p.noiseType === 'image',
      },
      {
        id: 'imageThreshold',
        label: 'Image Threshold',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        infoKey: 'wavetable.imageThreshold',
        showIf: (p) => p.noiseType === 'image' && p.imageAlgo === 'threshold',
      },
      {
        id: 'imagePosterize',
        label: 'Posterize Levels',
        type: 'range',
        min: 2,
        max: 10,
        step: 1,
        infoKey: 'wavetable.imagePosterize',
        showIf: (p) => p.noiseType === 'image' && p.imageAlgo === 'posterize',
      },
      {
        id: 'imageBlur',
        label: 'Image Blur',
        type: 'range',
        min: 0,
        max: 4,
        step: 1,
        infoKey: 'wavetable.imageBlur',
        showIf: (p) => p.noiseType === 'image' && (p.imageAlgo === 'blur' || p.imageAlgo === 'edge'),
      },
      { id: 'amplitude', label: 'Noise Amplitude', type: 'range', min: 2, max: 140, step: 1, infoKey: 'wavetable.amplitude' },
      { id: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.002, max: 0.08, step: 0.001, infoKey: 'wavetable.zoom' },
      { id: 'tilt', label: 'Row Shift', type: 'range', min: -12, max: 12, step: 1, infoKey: 'wavetable.tilt' },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'freq', label: 'Frequency', type: 'range', min: 0.2, max: 12.0, step: 0.1, infoKey: 'wavetable.freq' },
      {
        id: 'noiseAngle',
        label: 'Noise Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'wavetable.noiseAngle',
      },
      {
        id: 'lineOffset',
        label: 'Line Offset Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'wavetable.lineOffset',
      },
      {
        id: 'continuity',
        label: 'Continuity',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'single', label: 'Single' },
          { value: 'double', label: 'Double' },
        ],
        infoKey: 'wavetable.continuity',
      },
      { type: 'section', label: 'Edge Noise Dampening' },
      {
        id: 'edgeFadeMode',
        label: 'Edge Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.edgeFadeMode',
      },
      {
        id: 'edgeFade',
        label: 'Edge Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFade',
      },
      {
        id: 'edgeFadeThreshold',
        label: 'Edge Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeThreshold',
      },
      {
        id: 'edgeFadeFeather',
        label: 'Edge Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeFeather',
      },
      { type: 'section', label: 'Vertical Noise Dampening' },
      {
        id: 'verticalFadeMode',
        label: 'Vertical Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.verticalFadeMode',
      },
      {
        id: 'verticalFade',
        label: 'Vertical Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFade',
      },
      {
        id: 'verticalFadeThreshold',
        label: 'Vertical Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeThreshold',
      },
      {
        id: 'verticalFadeFeather',
        label: 'Vertical Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeFeather',
      },
      { id: 'dampenExtremes', label: 'Dampen Extremes', type: 'checkbox', infoKey: 'wavetable.dampenExtremes' },
      {
        id: 'overlapPadding',
        label: 'Overlap Padding (mm)',
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        infoKey: 'wavetable.overlapPadding',
      },
      { id: 'flatCaps', label: 'Flat Top/Bottom', type: 'checkbox', infoKey: 'wavetable.flatCaps' },
    ],
    rings: [
      { id: 'rings', label: 'Rings', type: 'range', min: 3, max: 120, step: 1, infoKey: 'rings.rings' },
      {
        id: 'noiseType',
        label: 'Noise Type',
        type: 'select',
        options: [
          { value: 'simplex', label: 'Simplex' },
          { value: 'ridged', label: 'Ridged' },
          { value: 'billow', label: 'Billow' },
          { value: 'turbulence', label: 'Turbulence' },
          { value: 'stripes', label: 'Stripes' },
          { value: 'marble', label: 'Marble' },
          { value: 'steps', label: 'Steps' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'warp', label: 'Warp' },
          { value: 'cellular', label: 'Cellular' },
          { value: 'fbm', label: 'Fractal' },
          { value: 'swirl', label: 'Swirl' },
          { value: 'radial', label: 'Radial' },
          { value: 'checker', label: 'Checker' },
          { value: 'zigzag', label: 'Zigzag' },
          { value: 'ripple', label: 'Ripple' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'grain', label: 'Grain' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'pulse', label: 'Pulse' },
        ],
        infoKey: 'rings.noiseType',
      },
      { id: 'amplitude', label: 'Noise Amplitude', type: 'range', min: 0, max: 40, step: 1, infoKey: 'rings.amplitude' },
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.0001, max: 0.01, step: 0.0001, infoKey: 'rings.noiseScale' },
      { id: 'noiseOffsetX', label: 'Noise Offset X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.noiseOffsetX' },
      { id: 'noiseOffsetY', label: 'Noise Offset Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.noiseOffsetY' },
      { id: 'noiseLayer', label: 'Noise Layer', type: 'range', min: 0, max: 5, step: 0.1, infoKey: 'rings.noiseLayer' },
      { id: 'noiseRadius', label: 'Noise Radius', type: 'range', min: 10, max: 200, step: 1, infoKey: 'rings.noiseRadius' },
      { id: 'gap', label: 'Ring Gap', type: 'range', min: 0.4, max: 3.0, step: 0.1, infoKey: 'rings.gap' },
      { id: 'offsetX', label: 'Ring Offset X', type: 'range', min: -100, max: 100, step: 1, infoKey: 'rings.offsetX' },
      { id: 'offsetY', label: 'Ring Offset Y', type: 'range', min: -100, max: 100, step: 1, infoKey: 'rings.offsetY' },
    ],
    topo: [
      { id: 'resolution', label: 'Resolution', type: 'range', min: 40, max: 240, step: 5, infoKey: 'topo.resolution' },
      { id: 'levels', label: 'Contour Levels', type: 'range', min: 4, max: 60, step: 1, infoKey: 'topo.levels' },
      {
        id: 'noiseType',
        label: 'Noise Type',
        type: 'select',
        options: [
          { value: 'simplex', label: 'Simplex' },
          { value: 'ridged', label: 'Ridged' },
          { value: 'billow', label: 'Billow' },
          { value: 'turbulence', label: 'Turbulence' },
          { value: 'stripes', label: 'Stripes' },
          { value: 'marble', label: 'Marble' },
          { value: 'steps', label: 'Steps' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'warp', label: 'Warp' },
          { value: 'cellular', label: 'Cellular' },
          { value: 'fbm', label: 'Fractal' },
          { value: 'swirl', label: 'Swirl' },
          { value: 'radial', label: 'Radial' },
          { value: 'checker', label: 'Checker' },
          { value: 'zigzag', label: 'Zigzag' },
          { value: 'ripple', label: 'Ripple' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'grain', label: 'Grain' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'pulse', label: 'Pulse' },
        ],
        infoKey: 'topo.noiseType',
      },
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.0001, max: 0.02, step: 0.0001, infoKey: 'topo.noiseScale' },
      { id: 'noiseOffsetX', label: 'Noise Offset X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'topo.noiseOffsetX' },
      { id: 'noiseOffsetY', label: 'Noise Offset Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'topo.noiseOffsetY' },
      { id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 6, step: 1, infoKey: 'topo.octaves' },
      { id: 'lacunarity', label: 'Lacunarity', type: 'range', min: 1.2, max: 4.0, step: 0.1, infoKey: 'topo.lacunarity' },
      { id: 'gain', label: 'Gain', type: 'range', min: 0.2, max: 0.9, step: 0.05, infoKey: 'topo.gain' },
      { id: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.05, infoKey: 'topo.sensitivity' },
      { id: 'thresholdOffset', label: 'Threshold Offset', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'topo.thresholdOffset' },
      {
        id: 'mappingMode',
        label: 'Mapping Mode',
        type: 'select',
        options: [
          { value: 'marching', label: 'Marching Squares' },
          { value: 'smooth', label: 'Smooth' },
          { value: 'bezier', label: 'Quadratic Bezier' },
          { value: 'gradient', label: 'Gradient Trace' },
        ],
        infoKey: 'topo.mappingMode',
      },
    ],
    rainfall: [
      { id: 'count', label: 'Drop Count', type: 'range', min: 20, max: 400, step: 10, infoKey: 'rainfall.count' },
      { id: 'traceLength', label: 'Trace Length', type: 'range', min: 20, max: 400, step: 5, infoKey: 'rainfall.traceLength' },
      { id: 'traceStep', label: 'Trace Step', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rainfall.traceStep' },
      { id: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.turbulence' },
      {
        id: 'rainfallAngle',
        label: 'Rainfall Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.rainfallAngle',
      },
      {
        id: 'windAngle',
        label: 'Wind Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.windAngle',
      },
      {
        id: 'dropRotate',
        label: 'Drop Head Rotate',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.dropRotate',
        showIf: (p) => p.dropShape !== 'none',
      },
      { id: 'windStrength', label: 'Wind Strength', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.windStrength' },
      { id: 'dropSize', label: 'Droplet Size', type: 'range', min: 0, max: 12, step: 0.5, infoKey: 'rainfall.dropSize' },
      {
        id: 'dropShape',
        label: 'Droplet Shape',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
          { value: 'teardrop', label: 'Teardrop' },
        ],
        infoKey: 'rainfall.dropShape',
      },
      {
        id: 'dropFill',
        label: 'Droplet Fill',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'hash', label: 'Grid' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'snake', label: 'Snake' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'rainfall.dropFill',
        showIf: (p) => p.dropShape !== 'none',
      },
      {
        id: 'fillDensity',
        label: 'Fill Density',
        type: 'range',
        min: 0.2,
        max: 2.0,
        step: 0.05,
        infoKey: 'rainfall.fillDensity',
        showIf: (p) => p.dropShape !== 'none' && p.dropFill !== 'none',
      },
      {
        id: 'fillAngle',
        label: 'Fill Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'rainfall.fillAngle',
        showIf: (p) => p.dropShape !== 'none' && p.dropFill !== 'none',
      },
      {
        id: 'fillPadding',
        label: 'Fill Padding (mm)',
        type: 'range',
        min: 0,
        max: 10,
        step: 0.1,
        infoKey: 'rainfall.fillPadding',
        showIf: (p) => p.dropShape !== 'none' && p.dropFill !== 'none',
      },
      {
        id: 'widthMultiplier',
        label: 'Rain Width',
        type: 'range',
        min: 1,
        max: 4,
        step: 1,
        infoKey: 'rainfall.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'snake', label: 'Snake' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'rainfall.thickeningMode',
      },
      {
        id: 'trailBreaks',
        label: 'Trail Breaks',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'sparse', label: 'Sparse' },
          { value: 'regular', label: 'Regular' },
          { value: 'stutter', label: 'Stutter' },
          { value: 'dashes', label: 'Dashes' },
          { value: 'fade', label: 'Fade' },
          { value: 'burst', label: 'Burst' },
          { value: 'drip', label: 'Drip' },
          { value: 'speckle', label: 'Speckle' },
        ],
        infoKey: 'rainfall.trailBreaks',
      },
      {
        id: 'breakRandomness',
        label: 'Break Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakRandomness',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakSpacing',
        label: 'Break Spacing',
        type: 'range',
        min: 2,
        max: 40,
        step: 1,
        infoKey: 'rainfall.breakSpacing',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakLengthJitter',
        label: 'Length Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakLengthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakWidthJitter',
        label: 'Width Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakWidthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'silhouetteId',
        label: 'Silhouette Image',
        type: 'image',
        accept: 'image/*',
        idKey: 'silhouetteId',
        nameKey: 'silhouetteName',
        infoKey: 'rainfall.silhouette',
        modalTitle: 'Select Silhouette Image',
        modalLabel: 'Silhouette Image',
        modalDescription: 'Drop a PNG/SVG with transparency; rain is generated inside opaque pixels.',
        dropLabel: 'Drop silhouette here',
      },
      {
        id: 'silhouetteWidth',
        label: 'Silhouette Width (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteWidth',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteHeight',
        label: 'Silhouette Height (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteHeight',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesX',
        label: 'Tiling X',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesY',
        label: 'Tiling Y',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteSpacing',
        label: 'Tile Spacing (mm)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'rainfall.silhouetteSpacing',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetX',
        label: 'Offset X (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetY',
        label: 'Offset Y (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteInvert',
        label: 'Invert Silhouette',
        type: 'checkbox',
        infoKey: 'rainfall.silhouetteInvert',
        showIf: (p) => Boolean(p.silhouetteId),
      },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 40, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Points / Quadrant', type: 'range', min: 4, max: 120, step: 2, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 60, step: 1, infoKey: 'spiral.startR' },
      { id: 'noiseAmp', label: 'Noise Amp', type: 'range', min: 0, max: 40, step: 1, infoKey: 'spiral.noiseAmp' },
      { id: 'noiseFreq', label: 'Noise Freq', type: 'range', min: 0.01, max: 0.5, step: 0.01, infoKey: 'spiral.noiseFreq' },
      { id: 'pulseAmp', label: 'Pulse Amp', type: 'range', min: 0, max: 0.4, step: 0.01, infoKey: 'spiral.pulseAmp' },
      { id: 'pulseFreq', label: 'Pulse Freq', type: 'range', min: 0.5, max: 8, step: 0.1, infoKey: 'spiral.pulseFreq' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'spiral.angleOffset',
      },
      { id: 'axisSnap', label: 'Axis Snap', type: 'checkbox', infoKey: 'spiral.axisSnap' },
      { id: 'close', label: 'Close Spiral', type: 'checkbox', infoKey: 'spiral.close' },
      {
        id: 'closeFeather',
        label: 'Close Feather',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'spiral.closeFeather',
        showIf: (p) => Boolean(p.close),
      },
    ],
    grid: [
      { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.rows' },
      { id: 'cols', label: 'Cols', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.cols' },
      { id: 'distortion', label: 'Distortion', type: 'range', min: 0, max: 40, step: 1, infoKey: 'grid.distortion' },
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.01, max: 0.2, step: 0.01, infoKey: 'grid.noiseScale' },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'grid.chaos' },
      {
        id: 'type',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'warp', label: 'Warp' },
          { value: 'shift', label: 'Shift' },
        ],
        infoKey: 'grid.type',
      },
    ],
    phylla: [
      {
        id: 'shapeType',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'phylla.shapeType',
      },
      { id: 'count', label: 'Count', type: 'range', min: 100, max: 2000, step: 50, infoKey: 'phylla.count' },
      { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'phylla.spacing' },
      {
        id: 'angleStr',
        label: 'Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 0.01,
        displayUnit: '°',
        infoKey: 'phylla.angleStr',
      },
      { id: 'divergence', label: 'Divergence', type: 'range', min: 0.5, max: 2.5, step: 0.1, infoKey: 'phylla.divergence' },
      { id: 'noiseInf', label: 'Noise Infl.', type: 'range', min: 0, max: 20, step: 1, infoKey: 'phylla.noiseInf' },
      { id: 'dotSize', label: 'Dot Size', type: 'range', min: 0.5, max: 3, step: 0.1, infoKey: 'phylla.dotSize' },
      {
        id: 'sides',
        label: 'Sides',
        type: 'range',
        min: 3,
        max: 100,
        step: 1,
        infoKey: 'phylla.sides',
        showIf: (params) => params.shapeType === 'polygon',
      },
      {
        id: 'sideJitter',
        label: 'Side Jitter',
        type: 'range',
        min: 0,
        max: 20,
        step: 1,
        infoKey: 'phylla.sideJitter',
        showIf: (params) => params.shapeType === 'polygon',
      },
    ],
    boids: [
      { id: 'count', label: 'Agents', type: 'range', min: 10, max: 300, step: 10, infoKey: 'boids.count' },
      { id: 'steps', label: 'Duration', type: 'range', min: 50, max: 400, step: 10, infoKey: 'boids.steps' },
      { id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 6, step: 0.1, infoKey: 'boids.speed' },
      { id: 'sepDist', label: 'Separation', type: 'range', min: 5, max: 60, step: 1, infoKey: 'boids.sepDist' },
      { id: 'alignDist', label: 'Alignment', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.alignDist' },
      { id: 'cohDist', label: 'Cohesion', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.cohDist' },
      { id: 'force', label: 'Steer Force', type: 'range', min: 0.01, max: 0.3, step: 0.01, infoKey: 'boids.force' },
      { id: 'sepWeight', label: 'Separation Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.sepWeight' },
      { id: 'alignWeight', label: 'Alignment Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.alignWeight' },
      { id: 'cohWeight', label: 'Cohesion Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.cohWeight' },
      {
        id: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'birds', label: 'Birds' },
          { value: 'fish', label: 'Fish' },
        ],
        infoKey: 'boids.mode',
      },
    ],
    attractor: [
      {
        id: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'lorenz', label: 'Lorenz' },
          { value: 'aizawa', label: 'Aizawa' },
        ],
        infoKey: 'attractor.type',
      },
      { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'attractor.scale' },
      { id: 'iter', label: 'Iterations', type: 'range', min: 300, max: 5000, step: 100, infoKey: 'attractor.iter' },
      { id: 'sigma', label: 'Sigma', type: 'range', min: 1, max: 30, step: 0.1, infoKey: 'attractor.sigma' },
      { id: 'rho', label: 'Rho', type: 'range', min: 5, max: 50, step: 0.1, infoKey: 'attractor.rho' },
      { id: 'beta', label: 'Beta', type: 'range', min: 0.5, max: 5, step: 0.1, infoKey: 'attractor.beta' },
      { id: 'dt', label: 'Time Step', type: 'range', min: 0.002, max: 0.03, step: 0.001, infoKey: 'attractor.dt' },
    ],
    hyphae: [
      { id: 'sources', label: 'Sources', type: 'range', min: 1, max: 10, step: 1, infoKey: 'hyphae.sources' },
      { id: 'steps', label: 'Growth Steps', type: 'range', min: 20, max: 200, step: 10, infoKey: 'hyphae.steps' },
      { id: 'branchProb', label: 'Branch Prob', type: 'range', min: 0, max: 0.2, step: 0.01, infoKey: 'hyphae.branchProb' },
      { id: 'angleVar', label: 'Wiggle', type: 'range', min: 0, max: 2.0, step: 0.1, infoKey: 'hyphae.angleVar' },
      { id: 'segLen', label: 'Segment Len', type: 'range', min: 1, max: 8, step: 0.1, infoKey: 'hyphae.segLen' },
      { id: 'maxBranches', label: 'Max Branches', type: 'range', min: 100, max: 3000, step: 50, infoKey: 'hyphae.maxBranches' },
    ],
    shapePack: [
      {
        id: 'shape',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'shapePack.shape',
      },
      { id: 'count', label: 'Max Count', type: 'range', min: 20, max: 800, step: 20, infoKey: 'shapePack.count' },
      {
        id: 'radiusRange',
        label: 'Radius Range',
        type: 'rangeDual',
        min: 0.5,
        max: 120,
        step: 0.5,
        minKey: 'minR',
        maxKey: 'maxR',
        infoKey: 'shapePack.radiusRange',
      },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'shapePack.padding' },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 100, max: 5000, step: 100, infoKey: 'shapePack.attempts' },
      { id: 'segments', label: 'Segments', type: 'range', min: 3, max: 64, step: 1, infoKey: 'shapePack.segments' },
      { id: 'rotationStep', label: 'Rotation Step', type: 'range', min: -30, max: 30, step: 1, infoKey: 'shapePack.rotationStep' },
      {
        id: 'perspectiveType',
        label: 'Perspective',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'radial', label: 'Radial' },
        ],
        infoKey: 'shapePack.perspectiveType',
      },
      { id: 'perspective', label: 'Perspective Amt', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'shapePack.perspective' },
      { id: 'perspectiveX', label: 'Perspective X', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveX' },
      { id: 'perspectiveY', label: 'Perspective Y', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveY' },
    ],
  };

  const INFO = {
    'global.algorithm': {
      title: 'Algorithm',
      description: 'Switches the generator for the active layer. Changing this resets that layer parameters to defaults.',
    },
    'global.seed': {
      title: 'Seed',
      description: 'Controls the random sequence used to generate the layer. Same seed equals the same output.',
    },
    'global.posX': {
      title: 'Pos X',
      description: 'Shifts the layer horizontally in millimeters.',
    },
    'global.posY': {
      title: 'Pos Y',
      description: 'Shifts the layer vertically in millimeters.',
    },
    'global.scaleX': {
      title: 'Scale X',
      description: 'Scales the layer horizontally around the center.',
    },
    'global.scaleY': {
      title: 'Scale Y',
      description: 'Scales the layer vertically around the center.',
    },
    'global.rotation': {
      title: 'Rotation',
      description: 'Rotates the active layer around its center in degrees.',
    },
    'global.paperSize': {
      title: 'Paper Size',
      description: 'Sets the paper dimensions used for bounds, centering, and export.',
    },
    'global.margin': {
      title: 'Margin',
      description: 'Keeps a safety border around the drawing area in millimeters.',
    },
    'global.truncate': {
      title: 'Truncate',
      description: 'Clips strokes to stay inside the margin boundary.',
    },
    'global.outsideOpacity': {
      title: 'Outside Opacity',
      description: 'Opacity for strokes drawn outside the margin when truncation is disabled.',
    },
    'global.marginLineVisible': {
      title: 'Visible Line',
      description: 'Shows a non-exported margin boundary on the canvas.',
    },
    'global.marginLineWeight': {
      title: 'Margin Line Weight',
      description: 'Line weight for the on-canvas margin guide (mm).',
    },
    'global.marginLineColor': {
      title: 'Margin Line Color',
      description: 'Stroke color for the on-canvas margin guide.',
    },
    'global.marginLineDotting': {
      title: 'Margin Line Dotting',
      description: 'Dash length for the margin guide. Set to 0 for a solid line.',
    },
    'global.selectionOutline': {
      title: 'Selection Outline',
      description: 'Toggles the selection silhouette around chosen lines.',
    },
    'global.selectionOutlineColor': {
      title: 'Selection Outline Color',
      description: 'Sets the color used for the selection silhouette.',
    },
    'global.selectionOutlineWidth': {
      title: 'Selection Outline Width',
      description: 'Controls the thickness of the selection silhouette.',
    },
    'global.speedDown': {
      title: 'Draw Speed',
      description: 'Used for time estimation when the pen is down.',
    },
    'global.speedUp': {
      title: 'Travel Speed',
      description: 'Used for time estimation when the pen is up.',
    },
    'global.precision': {
      title: 'Export Precision',
      description: 'Decimal precision for SVG coordinates. Higher values increase file size.',
    },
    'global.stroke': {
      title: 'Default Stroke',
      description: 'Sets the base line width for all layers in millimeters.',
    },
    'global.plotterOptimize': {
      title: 'Plotter Optimization',
      description: 'Removes fully overlapping paths for the same pen to reduce redundant plotting.',
    },
    'common.smoothing': {
      title: 'Smoothing',
      description: 'Softens sharp angles by averaging each point with its neighbors. 0 keeps raw lines.',
    },
    'common.curves': {
      title: 'Curves',
      description: 'Renders smooth quadratic curves between points instead of straight segments.',
    },
    'common.simplify': {
      title: 'Simplify',
      description: 'Reduces point density while keeping the overall form. Higher values simplify more.',
    },
    'flowfield.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the size of the flow field. Lower values create broad, smooth flow; higher values add detail.',
    },
    'flowfield.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the flavor of noise used to steer direction.',
    },
    'flowfield.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly noise frequency increases across octaves.',
    },
    'flowfield.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the field.',
    },
    'flowfield.density': {
      title: 'Density',
      description: 'Number of particles seeded. Higher density adds more paths.',
    },
    'flowfield.stepLen': {
      title: 'Step Length',
      description: 'Distance a particle moves per step. Larger steps create more angular paths.',
    },
    'flowfield.maxSteps': {
      title: 'Max Steps',
      description: 'Caps how long each particle travels before stopping.',
    },
    'flowfield.force': {
      title: 'Flow Force',
      description: 'Amplifies the influence of the noise field on direction.',
    },
    'flowfield.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the entire flow field direction.',
    },
    'flowfield.chaos': {
      title: 'Chaos',
      description: 'Adds random angular jitter on top of the flow field.',
    },
    'flowfield.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended together. More octaves add complexity.',
    },
    'flowfield.minSteps': {
      title: 'Minimum Steps',
      description: 'Removes very short paths by requiring a minimum number of steps.',
    },
    'flowfield.minLength': {
      title: 'Minimum Length',
      description: 'Removes short fragments by requiring a minimum path length.',
    },
    'lissajous.freqX': {
      title: 'Freq X',
      description: 'Oscillation rate along the X axis.',
    },
    'lissajous.freqY': {
      title: 'Freq Y',
      description: 'Oscillation rate along the Y axis.',
    },
    'lissajous.damping': {
      title: 'Damping',
      description: 'How quickly the curve decays over time. Higher values shorten the trail.',
    },
    'lissajous.phase': {
      title: 'Phase',
      description: 'Shifts the X wave relative to Y, changing the knot shape.',
    },
    'lissajous.resolution': {
      title: 'Resolution',
      description: 'Number of samples along the curve. Higher values create smoother lines.',
    },
    'lissajous.scale': {
      title: 'Scale',
      description: 'Overall size of the Lissajous curve.',
    },
    'lissajous.closeLines': {
      title: 'Close Lines',
      description: 'Closes the curve so both ends connect cleanly.',
    },
    'harmonograph.renderMode': {
      title: 'Render Mode',
      description: 'Choose line, dashed, point field, or segment rendering.',
    },
    'harmonograph.samples': {
      title: 'Samples',
      description: 'Number of points sampled along the curve.',
    },
    'harmonograph.duration': {
      title: 'Duration',
      description: 'Time span of the simulated pendulum motion.',
    },
    'harmonograph.scale': {
      title: 'Scale',
      description: 'Scales the overall drawing size.',
    },
    'harmonograph.paperRotation': {
      title: 'Paper Rotation',
      description: 'Rotates the drawing over time to add complexity.',
    },
    'harmonograph.dashLength': {
      title: 'Dash Length',
      description: 'Length of each dash segment.',
    },
    'harmonograph.dashGap': {
      title: 'Dash Gap',
      description: 'Gap between dash segments.',
    },
    'harmonograph.pointStride': {
      title: 'Point Stride',
      description: 'Skips points to control point field density.',
    },
    'harmonograph.pointSize': {
      title: 'Point Size',
      description: 'Radius of each point marker.',
    },
    'harmonograph.segmentStride': {
      title: 'Segment Stride',
      description: 'Spacing between short segment samples.',
    },
    'harmonograph.segmentLength': {
      title: 'Segment Length',
      description: 'Length of each short segment.',
    },
    'harmonograph.ampX1': {
      title: 'Pendulum 1 Amplitude X',
      description: 'X amplitude contribution for pendulum 1.',
    },
    'harmonograph.ampY1': {
      title: 'Pendulum 1 Amplitude Y',
      description: 'Y amplitude contribution for pendulum 1.',
    },
    'harmonograph.phaseX1': {
      title: 'Pendulum 1 Phase X',
      description: 'Phase offset on the X axis for pendulum 1.',
    },
    'harmonograph.phaseY1': {
      title: 'Pendulum 1 Phase Y',
      description: 'Phase offset on the Y axis for pendulum 1.',
    },
    'harmonograph.freq1': {
      title: 'Pendulum 1 Frequency',
      description: 'Oscillation frequency for pendulum 1.',
    },
    'harmonograph.micro1': {
      title: 'Pendulum 1 Micro Tuning',
      description: 'Fine frequency offset for pendulum 1.',
    },
    'harmonograph.damp1': {
      title: 'Pendulum 1 Damping',
      description: 'Decay rate applied to pendulum 1.',
    },
    'harmonograph.ampX2': {
      title: 'Pendulum 2 Amplitude X',
      description: 'X amplitude contribution for pendulum 2.',
    },
    'harmonograph.ampY2': {
      title: 'Pendulum 2 Amplitude Y',
      description: 'Y amplitude contribution for pendulum 2.',
    },
    'harmonograph.phaseX2': {
      title: 'Pendulum 2 Phase X',
      description: 'Phase offset on the X axis for pendulum 2.',
    },
    'harmonograph.phaseY2': {
      title: 'Pendulum 2 Phase Y',
      description: 'Phase offset on the Y axis for pendulum 2.',
    },
    'harmonograph.freq2': {
      title: 'Pendulum 2 Frequency',
      description: 'Oscillation frequency for pendulum 2.',
    },
    'harmonograph.micro2': {
      title: 'Pendulum 2 Micro Tuning',
      description: 'Fine frequency offset for pendulum 2.',
    },
    'harmonograph.damp2': {
      title: 'Pendulum 2 Damping',
      description: 'Decay rate applied to pendulum 2.',
    },
    'harmonograph.ampX3': {
      title: 'Pendulum 3 Amplitude X',
      description: 'X amplitude contribution for pendulum 3.',
    },
    'harmonograph.ampY3': {
      title: 'Pendulum 3 Amplitude Y',
      description: 'Y amplitude contribution for pendulum 3.',
    },
    'harmonograph.phaseX3': {
      title: 'Pendulum 3 Phase X',
      description: 'Phase offset on the X axis for pendulum 3.',
    },
    'harmonograph.phaseY3': {
      title: 'Pendulum 3 Phase Y',
      description: 'Phase offset on the Y axis for pendulum 3.',
    },
    'harmonograph.freq3': {
      title: 'Pendulum 3 Frequency',
      description: 'Oscillation frequency for pendulum 3.',
    },
    'harmonograph.micro3': {
      title: 'Pendulum 3 Micro Tuning',
      description: 'Fine frequency offset for pendulum 3.',
    },
    'harmonograph.damp3': {
      title: 'Pendulum 3 Damping',
      description: 'Decay rate applied to pendulum 3.',
    },
    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of horizontal rows in the wavetable.',
    },
    'wavetable.noiseType': {
      title: 'Noise Type',
      description: 'Selects the noise flavor used to shape the wavetable. Each mode has a distinct visual character.',
    },
    'wavetable.noiseImage': {
      title: 'Noise Image',
      description: 'Uses an uploaded image as the noise source. Brightness values become wave displacement.',
    },
    'wavetable.imageAlgo': {
      title: 'Image Noise Mode',
      description: 'Determines how the image is converted into noise values.',
    },
    'wavetable.imageThreshold': {
      title: 'Image Threshold',
      description: 'Threshold used to binarize the image before sampling.',
    },
    'wavetable.imagePosterize': {
      title: 'Posterize Levels',
      description: 'Reduces the image to a fixed number of tonal steps.',
    },
    'wavetable.imageBlur': {
      title: 'Image Blur',
      description: 'Blurs the image before sampling to smooth out details.',
    },
    'wavetable.amplitude': {
      title: 'Noise Amplitude',
      description: 'Amount of vertical displacement added by the noise field.',
    },
    'wavetable.zoom': {
      title: 'Noise Zoom',
      description: 'Scale of the noise field along the wavetable.',
    },
    'wavetable.tilt': {
      title: 'Row Shift',
      description: 'Offsets each row horizontally to create a slanted stack.',
    },
    'wavetable.gap': {
      title: 'Line Gap',
      description: 'Spacing multiplier between rows.',
    },
    'wavetable.freq': {
      title: 'Frequency',
      description: 'Noise frequency along the X axis.',
    },
    'wavetable.noiseAngle': {
      title: 'Noise Angle',
      description: 'Rotates the noise field direction used to displace the wave.',
    },
    'wavetable.lineOffset': {
      title: 'Line Offset Angle',
      description: 'Direction for noise displacement (0° = north, 180° = south).',
    },
    'wavetable.continuity': {
      title: 'Continuity',
      description: 'Connects adjacent wavetable rows on one side (single) or both sides (double).',
    },
    'wavetable.edgeFadeMode': {
      title: 'Edge Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the left, right, or both sides.',
    },
    'wavetable.edgeFade': {
      title: 'Edge Noise Dampening Amount',
      description: 'How strongly noise is dampened near the left/right edges (0-100).',
    },
    'wavetable.edgeFadeThreshold': {
      title: 'Edge Noise Dampening Threshold',
      description: 'Distance from the left/right edges where dampening applies (0-100). At 100, the full width is dampened.',
    },
    'wavetable.edgeFadeFeather': {
      title: 'Edge Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFade': {
      title: 'Vertical Noise Dampening Amount',
      description: 'How strongly noise is dampened toward the top/bottom (0-100).',
    },
    'wavetable.verticalFadeThreshold': {
      title: 'Vertical Noise Dampening Threshold',
      description: 'Distance from the top/bottom edges where dampening applies (0-100). At 100, the full height is dampened.',
    },
    'wavetable.verticalFadeFeather': {
      title: 'Vertical Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFadeMode': {
      title: 'Vertical Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the top, bottom, or both.',
    },
    'wavetable.dampenExtremes': {
      title: 'Dampen Extremes',
      description: 'Scales back displacement near the top and bottom margins.',
    },
    'wavetable.overlapPadding': {
      title: 'Overlap Padding',
      description: 'Total vertical buffer (in mm) between adjacent rows. 0 allows overlap.',
    },
    'wavetable.flatCaps': {
      title: 'Flat Top/Bottom',
      description: 'Adds flat lines at the top and bottom of the wavetable stack.',
    },
    'rings.rings': {
      title: 'Rings',
      description: 'Number of concentric rings to generate.',
    },
    'rings.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the noise field used to perturb ring radii.',
    },
    'rings.amplitude': {
      title: 'Noise Amplitude',
      description: 'Strength of the ring displacement from the base radius.',
    },
    'rings.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the frequency of noise sampling around each ring.',
    },
    'rings.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the noise sampling circle on the X axis.',
    },
    'rings.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the noise sampling circle on the Y axis.',
    },
    'rings.noiseLayer': {
      title: 'Noise Layer',
      description: 'Offsets each ring to a different slice of noise space.',
    },
    'rings.noiseRadius': {
      title: 'Noise Radius',
      description: 'Radius of the sampling circle in noise space.',
    },
    'rings.gap': {
      title: 'Ring Gap',
      description: 'Spacing multiplier between rings.',
    },
    'rings.offsetX': {
      title: 'Ring Offset X',
      description: 'Moves the ring stack horizontally before transforms.',
    },
    'rings.offsetY': {
      title: 'Ring Offset Y',
      description: 'Moves the ring stack vertically before transforms.',
    },
    'topo.resolution': {
      title: 'Resolution',
      description: 'Grid resolution used for sampling the scalar field.',
    },
    'topo.levels': {
      title: 'Contour Levels',
      description: 'Number of contour bands extracted from the scalar field.',
    },
    'topo.noiseType': {
      title: 'Noise Type',
      description: 'Selects the base noise used to create the height field.',
    },
    'topo.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls how quickly noise values change across the field.',
    },
    'topo.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the noise field sampling in X.',
    },
    'topo.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the noise field sampling in Y.',
    },
    'topo.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended into the height field.',
    },
    'topo.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly noise frequency increases per octave.',
    },
    'topo.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the height field.',
    },
    'topo.sensitivity': {
      title: 'Sensitivity',
      description: 'Adjusts contrast in the field before extracting contours.',
    },
    'topo.thresholdOffset': {
      title: 'Threshold Offset',
      description: 'Shifts all contour thresholds up or down.',
    },
    'topo.mappingMode': {
      title: 'Mapping Mode',
      description: 'Selects how contours are traced and smoothed.',
    },
    'rainfall.count': {
      title: 'Drop Count',
      description: 'Number of rain traces generated across the canvas.',
    },
    'rainfall.traceLength': {
      title: 'Trace Length',
      description: 'Length of each rain streak in millimeters.',
    },
    'rainfall.traceStep': {
      title: 'Trace Step',
      description: 'Distance between points along each trace.',
    },
    'rainfall.turbulence': {
      title: 'Turbulence',
      description: 'Adds jitter to rain direction over time.',
    },
    'rainfall.rainfallAngle': {
      title: 'Rainfall Angle',
      description: 'Sets the direction the droplet head faces (0° = north, 180° = south).',
    },
    'rainfall.windAngle': {
      title: 'Wind Angle',
      description: 'Direction of wind influence on the rain (0° = north, 180° = south).',
    },
    'rainfall.windStrength': {
      title: 'Wind Strength',
      description: 'Scales the wind’s influence on the rain direction.',
    },
    'rainfall.dropRotate': {
      title: 'Drop Head Rotate',
      description: 'Rotates the droplet head relative to the rain direction.',
    },
    'rainfall.dropSize': {
      title: 'Droplet Size',
      description: 'Size of the droplet marker at the end of each trace.',
    },
    'rainfall.dropShape': {
      title: 'Droplet Shape',
      description: 'Selects the marker shape for droplets.',
    },
    'rainfall.dropFill': {
      title: 'Droplet Fill',
      description: 'Adds a fill-style texture inside droplets.',
    },
    'rainfall.fillDensity': {
      title: 'Fill Density',
      description: 'Controls spacing or overlap of fill strokes inside droplets.',
    },
    'rainfall.fillAngle': {
      title: 'Fill Angle',
      description: 'Rotates the fill pattern inside the droplet.',
    },
    'rainfall.fillPadding': {
      title: 'Fill Padding',
      description: 'Adds padding between the droplet outline and its fill strokes.',
    },
    'rainfall.widthMultiplier': {
      title: 'Rain Width',
      description: 'Duplicates traces to simulate thicker rainfall.',
    },
    'rainfall.thickeningMode': {
      title: 'Thickening Mode',
      description: 'How duplicate traces are built (parallel, snake, sinusoidal).',
    },
    'rainfall.trailBreaks': {
      title: 'Trail Breaks',
      description: 'Adds controlled breaks and gaps to the rain streaks.',
    },
    'rainfall.breakRandomness': {
      title: 'Break Randomness',
      description: 'Adds randomness to break timing across all trail modes.',
    },
    'rainfall.breakSpacing': {
      title: 'Break Spacing',
      description: 'Average spacing between breaks along the trail.',
    },
    'rainfall.breakLengthJitter': {
      title: 'Length Randomization',
      description: 'Randomizes the length of each trail segment.',
    },
    'rainfall.breakWidthJitter': {
      title: 'Width Randomization',
      description: 'Randomizes the gap width between trail segments.',
    },
    'rainfall.silhouette': {
      title: 'Silhouette Image',
      description: 'Drops are generated inside the opaque area of the image.',
    },
    'rainfall.silhouetteWidth': {
      title: 'Silhouette Width',
      description: 'Width of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteHeight': {
      title: 'Silhouette Height',
      description: 'Height of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteTilesX': {
      title: 'Tiling X',
      description: 'Number of silhouette tiles across the canvas.',
    },
    'rainfall.silhouetteTilesY': {
      title: 'Tiling Y',
      description: 'Number of silhouette tiles down the canvas.',
    },
    'rainfall.silhouetteSpacing': {
      title: 'Tile Spacing',
      description: 'Spacing between silhouette tiles in millimeters.',
    },
    'rainfall.silhouetteOffsetX': {
      title: 'Offset X',
      description: 'Horizontal offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteOffsetY': {
      title: 'Offset Y',
      description: 'Vertical offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteInvert': {
      title: 'Invert Silhouette',
      description: 'Swaps filled and transparent regions of the silhouette.',
    },
    'spiral.loops': {
      title: 'Loops',
      description: 'Number of revolutions in the spiral.',
    },
    'spiral.res': {
      title: 'Resolution',
      description: 'Points per quadrant. Higher values create smoother spirals.',
    },
    'spiral.startR': {
      title: 'Inner Radius',
      description: 'Starting radius of the spiral.',
    },
    'spiral.noiseAmp': {
      title: 'Noise Amp',
      description: 'Amount of radial jitter applied to the spiral.',
    },
    'spiral.noiseFreq': {
      title: 'Noise Freq',
      description: 'How quickly the noise changes around the spiral.',
    },
    'spiral.pulseAmp': {
      title: 'Pulse Amp',
      description: 'Adds a rhythmic bulge to the spiral radius for a breathing effect.',
    },
    'spiral.pulseFreq': {
      title: 'Pulse Freq',
      description: 'Controls how many pulses appear per revolution.',
    },
    'spiral.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the spiral start angle in degrees.',
    },
    'spiral.axisSnap': {
      title: 'Axis Snap',
      description: 'Aligns spiral points to the X/Y axes at every quadrant.',
    },
    'spiral.close': {
      title: 'Close Spiral',
      description: 'Connects the outer end back into the spiral with a smooth closing curve.',
    },
    'spiral.closeFeather': {
      title: 'Close Feather',
      description: 'Controls how softly the closing curve arcs into the next loop.',
    },
    'grid.rows': {
      title: 'Rows',
      description: 'Number of horizontal grid lines.',
    },
    'grid.cols': {
      title: 'Cols',
      description: 'Number of vertical grid lines.',
    },
    'grid.distortion': {
      title: 'Distortion',
      description: 'Strength of the grid displacement.',
    },
    'grid.noiseScale': {
      title: 'Noise Scale',
      description: 'Scale of noise used to distort the grid.',
    },
    'grid.chaos': {
      title: 'Chaos',
      description: 'Random jitter added after distortion.',
    },
    'grid.type': {
      title: 'Mode',
      description: 'Warp bends both axes; Shift offsets rows vertically using noise.',
    },
    'phylla.shapeType': {
      title: 'Shape',
      description: 'Switch between true circles or polygonal markers.',
    },
    'phylla.count': {
      title: 'Count',
      description: 'Number of points in the phyllotaxis spiral.',
    },
    'phylla.spacing': {
      title: 'Spacing',
      description: 'Distance between successive points.',
    },
    'phylla.angleStr': {
      title: 'Angle',
      description: 'Divergence angle in degrees; near 137.5 yields sunflower-like spacing.',
    },
    'phylla.divergence': {
      title: 'Divergence',
      description: 'Scales radial growth rate.',
    },
    'phylla.noiseInf': {
      title: 'Noise Influence',
      description: 'Adds organic wobble to point positions.',
    },
    'phylla.dotSize': {
      title: 'Dot Size',
      description: 'Radius of each dot marker.',
    },
    'phylla.sides': {
      title: 'Sides',
      description: 'Number of sides for polygon markers.',
    },
    'phylla.sideJitter': {
      title: 'Side Jitter',
      description: 'Random variation applied to polygon side count.',
    },
    'boids.count': {
      title: 'Agents',
      description: 'Number of flocking agents.',
    },
    'boids.steps': {
      title: 'Duration',
      description: 'Number of simulation steps; controls trail length.',
    },
    'boids.speed': {
      title: 'Speed',
      description: 'Maximum speed of each agent.',
    },
    'boids.sepDist': {
      title: 'Separation',
      description: 'Radius where agents repel each other.',
    },
    'boids.alignDist': {
      title: 'Alignment',
      description: 'Radius where agents align velocities.',
    },
    'boids.cohDist': {
      title: 'Cohesion',
      description: 'Radius where agents steer toward the group center.',
    },
    'boids.force': {
      title: 'Steer Force',
      description: 'Strength of steering corrections.',
    },
    'boids.sepWeight': {
      title: 'Separation Weight',
      description: 'Balances how strongly agents avoid neighbors.',
    },
    'boids.alignWeight': {
      title: 'Alignment Weight',
      description: 'Balances how strongly agents match velocity.',
    },
    'boids.cohWeight': {
      title: 'Cohesion Weight',
      description: 'Balances how strongly agents steer toward the group center.',
    },
    'boids.mode': {
      title: 'Mode',
      description: 'Switches between bird-like flocking and fish-like schooling.',
    },
    'attractor.type': {
      title: 'Attractor Type',
      description: 'Selects the chaotic system used to generate the path.',
    },
    'attractor.scale': {
      title: 'Scale',
      description: 'Overall size of the attractor.',
    },
    'attractor.iter': {
      title: 'Iterations',
      description: 'Number of steps plotted in the attractor.',
    },
    'attractor.sigma': {
      title: 'Sigma',
      description: 'Lorenz system parameter controlling X/Y coupling.',
    },
    'attractor.rho': {
      title: 'Rho',
      description: 'Lorenz system parameter influencing chaotic spread.',
    },
    'attractor.beta': {
      title: 'Beta',
      description: 'Lorenz system parameter affecting Z damping.',
    },
    'attractor.dt': {
      title: 'Time Step',
      description: 'Integration step size; smaller values are smoother but slower.',
    },
    'hyphae.sources': {
      title: 'Sources',
      description: 'Number of starting growth points.',
    },
    'hyphae.steps': {
      title: 'Growth Steps',
      description: 'Number of growth iterations.',
    },
    'hyphae.branchProb': {
      title: 'Branch Probability',
      description: 'Chance of branching at each segment.',
    },
    'hyphae.angleVar': {
      title: 'Wiggle',
      description: 'Randomness in branch direction.',
    },
    'hyphae.segLen': {
      title: 'Segment Length',
      description: 'Length of each growth segment.',
    },
    'hyphae.maxBranches': {
      title: 'Max Branches',
      description: 'Hard cap to prevent runaway growth.',
    },
    'shapePack.shape': {
      title: 'Shape',
      description: 'Circle outputs true SVG circles; Polygon uses segments.',
    },
    'shapePack.count': {
      title: 'Max Count',
      description: 'Maximum number of shapes to place.',
    },
    'shapePack.radiusRange': {
      title: 'Radius Range',
      description: 'Minimum and maximum size for each packed shape.',
    },
    'shapePack.padding': {
      title: 'Padding',
      description: 'Extra spacing between shapes.',
    },
    'shapePack.attempts': {
      title: 'Attempts',
      description: 'Placement iterations before stopping.',
    },
    'shapePack.segments': {
      title: 'Segments',
      description: 'Polygon sides (min 3). Ignored when Shape = Circle.',
    },
    'shapePack.rotationStep': {
      title: 'Rotation Step',
      description: 'Adds rotation per shape index (function-based offset).',
    },
    'shapePack.perspectiveType': {
      title: 'Perspective Type',
      description: 'Perspective warp applied to polygons (none, vertical, horizontal, radial).',
    },
    'shapePack.perspective': {
      title: 'Perspective Amount',
      description: 'Strength of the perspective warp. Negative values invert the effect.',
    },
    'shapePack.perspectiveX': {
      title: 'Perspective X',
      description: 'Horizontal offset for the perspective origin (mm).',
    },
    'shapePack.perspectiveY': {
      title: 'Perspective Y',
      description: 'Vertical offset for the perspective origin (mm).',
    },
  };

  const smoothPath = (path, amount) => {
    if (!amount || amount <= 0 || path.length < 3) return path;
    const smoothed = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const avgX = (prev.x + next.x) / 2;
      const avgY = (prev.y + next.y) / 2;
      smoothed.push({
        x: curr.x * (1 - amount) + avgX * amount,
        y: curr.y * (1 - amount) + avgY * amount,
      });
    }
    smoothed.push(path[path.length - 1]);
    if (path.meta) smoothed.meta = path.meta;
    return smoothed;
  };

  const createBounds = (width, height, margin) => {
    const m = margin;
    return { width, height, m, dW: width - m * 2, dH: height - m * 2 };
  };

  const transformPoint = (pt, params, bounds) => {
    const cx = params.origin?.x ?? bounds.width / 2;
    const cy = params.origin?.y ?? bounds.height / 2;
    let x = pt.x - cx;
    let y = pt.y - cy;
    const scaleX = params.scaleX ?? 1;
    const scaleY = params.scaleY ?? 1;
    x *= scaleX;
    y *= scaleY;
    const rot = ((params.rotation ?? 0) * Math.PI) / 180;
    if (rot) {
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      x = rx;
      y = ry;
    }
    x += cx + (params.posX ?? 0);
    y += cy + (params.posY ?? 0);
    return { x, y };
  };

  const transformMeta = (meta, params, bounds) => {
    if (!meta || meta.kind !== 'circle') return meta;
    const center = transformPoint({ x: meta.cx, y: meta.cy }, params, bounds);
    const scaleX = params.scaleX ?? 1;
    const scaleY = params.scaleY ?? 1;
    const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
    const rot = ((params.rotation ?? 0) * Math.PI) / 180;
    return {
      ...meta,
      cx: center.x,
      cy: center.y,
      rx: Math.abs(baseR * scaleX),
      ry: Math.abs(baseR * scaleY),
      rotation: (meta.rotation ?? 0) + rot,
    };
  };

  const transformPath = (path, params, bounds) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => transformPoint(pt, params, bounds));
    if (path.meta) next.meta = transformMeta(path.meta, params, bounds);
    return next;
  };

  const limitPaths = (paths) => {
    const limited = [];
    let total = 0;
    for (const path of paths) {
      if (limited.length >= PREVIEW.maxPaths) break;
      let next = path;
      if (next.length > PREVIEW.maxPointsPerPath) {
        const step = Math.ceil(next.length / PREVIEW.maxPointsPerPath);
        next = next.filter((_, i) => i % step === 0);
        if (path.meta) next.meta = path.meta;
      }
      total += next.length;
      if (total > PREVIEW.maxPoints) break;
      limited.push(next);
    }
    return limited;
  };

  const clonePath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => ({ ...pt }));
    if (path.meta) next.meta = { ...path.meta };
    return next;
  };

  const clonePaths = (paths) => (paths || []).map((path) => clonePath(path));

  const pathToSvg = (path, precision, useCurves) => {
    if (!path || path.length < 2) return '';
    const fmt = (n) => Number(n).toFixed(precision);
    if (!useCurves || path.length < 3) {
      return `M ${path.map((pt) => `${fmt(pt.x)} ${fmt(pt.y)}`).join(' L ')}`;
    }
    let d = `M ${fmt(path[0].x)} ${fmt(path[0].y)}`;
    for (let i = 1; i < path.length - 1; i++) {
      const midX = (path[i].x + path[i + 1].x) / 2;
      const midY = (path[i].y + path[i + 1].y) / 2;
      d += ` Q ${fmt(path[i].x)} ${fmt(path[i].y)} ${fmt(midX)} ${fmt(midY)}`;
    }
    const last = path[path.length - 1];
    d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
    return d;
  };

  const shapeToSvg = (path, precision, useCurves) => {
    if (path && path.meta && path.meta.kind === 'circle') {
      const fmt = (n) => Number(n).toFixed(precision);
      const cx = path.meta.cx;
      const cy = path.meta.cy;
      const rx = path.meta.rx ?? path.meta.r;
      const ry = path.meta.ry ?? path.meta.r;
      const rotation = path.meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return '';
      if (Math.abs(rx - ry) < 0.001) {
        return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(rx)}" />`;
      }
      if (Math.abs(rotation) > 0.0001) {
        const deg = ((rotation * 180) / Math.PI).toFixed(3);
        return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${deg} ${fmt(
          cx
        )} ${fmt(cy)})" />`;
      }
      return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" />`;
    }
    const d = pathToSvg(path, precision, useCurves);
    return d ? `<path d="${d}" />` : '';
  };

  const renderPreviewSvg = (type, params, options = {}) => {
    if (!Algorithms || !Algorithms[type] || !SeededRNG || !SimpleNoise) return '';
    const width = options.width ?? PREVIEW.width;
    const height = options.height ?? PREVIEW.height;
    const margin = options.margin ?? PREVIEW.margin;
    const bounds = createBounds(width, height, margin);
    const base = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[type] ? ALGO_DEFAULTS[type] : {}),
      ...params,
    };
    const seed = Number.isFinite(base.seed) ? base.seed : 1;
    base.seed = seed;
    base.posX = base.posX ?? 0;
    base.posY = base.posY ?? 0;
    base.scaleX = base.scaleX ?? 1;
    base.scaleY = base.scaleY ?? 1;
    base.rotation = base.rotation ?? 0;
    const rng = new SeededRNG(seed);
    const noise = new SimpleNoise(seed);
    const rawPaths = Algorithms[type].generate(base, rng, noise, bounds) || [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rawPaths.forEach((path) => {
      if (!Array.isArray(path)) return;
      if (path.meta && path.meta.kind === 'circle') {
        const cx = path.meta.cx ?? path.meta.x;
        const cy = path.meta.cy ?? path.meta.y;
        const rx = path.meta.rx ?? path.meta.r;
        const ry = path.meta.ry ?? path.meta.r;
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(rx) && Number.isFinite(ry)) {
          minX = Math.min(minX, cx - rx);
          maxX = Math.max(maxX, cx + rx);
          minY = Math.min(minY, cy - ry);
          maxY = Math.max(maxY, cy + ry);
        }
        return;
      }
      path.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = width;
      maxY = height;
    }
    base.origin = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const smooth = clamp(base.smoothing ?? 0, 0, 1);
    const transformed = rawPaths.map((path) => {
      if (!Array.isArray(path)) return path;
      return smoothPath(transformPath(path, base, bounds), smooth);
    });
    const limited = limitPaths(transformed);
    const useCurves = Boolean(base.curves);
    const precision = 2;
    const strokeWidth = options.strokeWidth ?? 1.2;
    const pathsSvg = limited
      .map((path) => shapeToSvg(path, precision, useCurves))
      .filter(Boolean)
      .join('');
    return `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#fafafa" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        ${pathsSvg}
      </svg>
    `;
  };

  const buildRangeValue = (def, t) => {
    const min = Number(def.min);
    const max = Number(def.max);
    const val = min + (max - min) * t;
    const stepped = roundToStep(val, def.step);
    return clamp(stepped, min, max);
  };

  const buildVariantsFromDef = (def) => {
    if (!def) return null;
    if (def.type === 'checkbox') {
      return [
        { label: 'OFF', overrides: { [def.id]: false } },
        { label: 'ON', overrides: { [def.id]: true } },
      ];
    }
    if (def.type === 'select') {
      const first = def.options[0];
      const second = def.options[1] || def.options[def.options.length - 1];
      return [
        { label: first.label.toUpperCase(), overrides: { [def.id]: first.value } },
        { label: second.label.toUpperCase(), overrides: { [def.id]: second.value } },
      ];
    }
    if (def.type === 'rangeDual') {
      const min = Number(def.min);
      const max = Number(def.max);
      const lowMin = roundToStep(min + (max - min) * 0.1, def.step);
      const lowMax = roundToStep(min + (max - min) * 0.35, def.step);
      const highMin = roundToStep(min + (max - min) * 0.6, def.step);
      const highMax = roundToStep(min + (max - min) * 0.9, def.step);
      return [
        { label: 'SMALL', overrides: { [def.minKey]: lowMin, [def.maxKey]: lowMax } },
        { label: 'LARGE', overrides: { [def.minKey]: highMin, [def.maxKey]: highMax } },
      ];
    }
    if (def.type === 'range') {
      const low = buildRangeValue(def, 0.2);
      const high = buildRangeValue(def, 0.8);
      return [
        { label: 'LOW', overrides: { [def.id]: low } },
        { label: 'HIGH', overrides: { [def.id]: high } },
      ];
    }
    return null;
  };

  const resolvePreviewConfig = (key, ui) => {
    const [group, param] = key.split('.');
    const activeLayer = ui?.app?.engine?.getActiveLayer?.();
    const activeType = activeLayer?.type || 'flowfield';
    const baseParams = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[activeType] ? ALGO_DEFAULTS[activeType] : {}),
      seed: 1234,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
    };

    if (group === 'global') {
      if (param === 'algorithm') {
        const algoKeys = Object.keys(ALGO_DEFAULTS || {});
        const currentIndex = Math.max(0, algoKeys.indexOf(activeType));
        const altIndex = algoKeys.length > 1 ? (currentIndex + 1) % algoKeys.length : currentIndex;
        const altType = algoKeys[altIndex] || activeType;
        return {
          customVariants: [
            { label: 'CURRENT', type: activeType, params: baseParams },
            {
              label: 'ALT',
              type: altType,
              params: {
                ...(ALGO_DEFAULTS && ALGO_DEFAULTS[altType] ? ALGO_DEFAULTS[altType] : baseParams),
                seed: 1234,
                posX: 0,
                posY: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          ],
        };
      }
      if (param === 'seed') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'LOW', overrides: { seed: 1111 } },
            { label: 'HIGH', overrides: { seed: 9876 } },
          ],
        };
      }
      if (param === 'posX') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'posX', type: 'range', min: -40, max: 40, step: 1 },
        };
      }
      if (param === 'posY') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'posY', type: 'range', min: -30, max: 30, step: 1 },
        };
      }
      if (param === 'scaleX') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'scaleX', type: 'range', min: 0.6, max: 1.4, step: 0.05 },
        };
      }
      if (param === 'scaleY') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'scaleY', type: 'range', min: 0.6, max: 1.4, step: 0.05 },
        };
      }
      if (param === 'margin') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'TIGHT', overrides: {}, bounds: { margin: 4 } },
            { label: 'WIDE', overrides: {}, bounds: { margin: 14 } },
          ],
        };
      }
      if (param === 'stroke') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'THIN', overrides: {}, strokeWidth: 0.6 },
            { label: 'THICK', overrides: {}, strokeWidth: 1.8 },
          ],
        };
      }
      return null;
    }

    if (group === 'common') {
      const def = COMMON_CONTROLS.find((item) => item.id === param);
      if (!def) return null;
      return { type: activeType, baseParams, def };
    }

    if (group === 'wavetable') {
      const waveBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.wavetable ? ALGO_DEFAULTS.wavetable : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.wavetable || []).find((item) => item.id === param);
      if (def) {
        if (param === 'edgeFade') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFadeThreshold: 50, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeThreshold') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeFeather') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeThreshold: 50, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeMode') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeThreshold: 40 },
            def,
          };
        }
        if (param === 'verticalFade') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFadeThreshold: 50, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeThreshold') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeFeather') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeThreshold: 50, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeMode') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeThreshold: 40 },
            def,
          };
        }
      }
    }

    if (group === 'phylla') {
      const phyBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.phylla ? ALGO_DEFAULTS.phylla : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.phylla || []).find((item) => item.id === param);
      if (def && (param === 'sides' || param === 'sideJitter')) {
        return {
          type: 'phylla',
          baseParams: { ...phyBase, shapeType: 'polygon' },
          def,
        };
      }
    }

    if (group === 'shapePack') {
      const shapeBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.shapePack ? ALGO_DEFAULTS.shapePack : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.shapePack || []).find((item) => item.id === param);
      if (def) {
        if (param === 'segments' || param === 'rotationStep') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon' },
            def,
          };
        }
        if (param === 'perspectiveType') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon', perspective: 0.6 },
            def,
          };
        }
        if (param === 'perspective' || param === 'perspectiveX' || param === 'perspectiveY') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon', perspectiveType: 'radial', perspective: 0.6 },
            def,
          };
        }
      }
    }

    const defs = CONTROL_DEFS[group];
    if (!defs) return null;
    const def = defs.find((item) => item.id === param);
    if (!def) return null;
    const algoParams = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[group] ? ALGO_DEFAULTS[group] : baseParams),
      seed: 1234,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
    };
    return {
      type: group,
      baseParams: algoParams,
      def,
    };
  };

  const buildPreviewPair = (key, ui) => {
    const config = resolvePreviewConfig(key, ui);
    if (!config) return '';
    let variants = config.variants;
    if (!variants && config.def) variants = buildVariantsFromDef(config.def);
    if (config.customVariants) variants = config.customVariants;
    if (!variants || variants.length < 2) return '';

    const items = variants.map((variant) => {
      const type = variant.type || config.type;
      const params = variant.params || { ...config.baseParams, ...(variant.overrides || {}) };
      const svg = renderPreviewSvg(type, params, {
        margin: variant.bounds?.margin,
        strokeWidth: variant.strokeWidth,
      });
      return `
        <div class="modal-illustration">
          <div class="modal-ill-label">${variant.label}</div>
          ${svg}
        </div>
      `;
    });

    return `
      <div class="modal-illustrations">
        ${items.join('')}
      </div>
    `;
  };

  class UI {
    constructor(app) {
      this.app = app;
      this.controls = CONTROL_DEFS;
      this.modal = this.createModal();
      this.openPenMenu = null;
      this.openPaletteMenu = null;
      this.layerListOrder = [];
      this.lastLayerClickId = null;
      this.layerListFocus = false;

      this.initModuleDropdown();
      this.initMachineDropdown();
      this.bindGlobal();
      this.bindShortcuts();
      this.bindInfoButtons();
      document.addEventListener('click', () => {
        if (this.openPenMenu) {
          this.openPenMenu.classList.add('hidden');
          this.openPenMenu = null;
        }
        if (this.openPaletteMenu) {
          this.openPaletteMenu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
      });
      this.initPaneToggles();
      this.initBottomPaneToggle();
      this.initBottomPaneResizer();
      this.initPaneResizers();
      this.renderLayers();
      this.renderPens();
      this.initPaletteControls();
      this.buildControls();
      this.updateFormula();
      this.initSettingsValues();
      this.attachStaticInfoButtons();

      const rightPane = getEl('right-pane');
      const layerList = getEl('layer-list');
      if (layerList) {
        layerList.addEventListener('mousedown', () => {
          this.layerListFocus = true;
        });
      }
      document.addEventListener('mousedown', (e) => {
        if (rightPane && !rightPane.contains(e.target)) {
          this.layerListFocus = false;
        }
      });
    }

    createModal() {
      const overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div class="modal-title"></div>
            <button class="modal-close" type="button" aria-label="Close modal">✕</button>
          </div>
          <div class="modal-body"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      const card = overlay.querySelector('.modal-card');
      const closeBtn = overlay.querySelector('.modal-close');
      const titleEl = overlay.querySelector('.modal-title');
      const bodyEl = overlay.querySelector('.modal-body');

      overlay.addEventListener('click', () => this.closeModal());
      card.addEventListener('click', (e) => e.stopPropagation());
      closeBtn.addEventListener('click', () => this.closeModal());

      return { overlay, titleEl, bodyEl };
    }

    openModal({ title, body }) {
      this.modal.titleEl.textContent = title;
      this.modal.bodyEl.innerHTML = body;
      this.modal.overlay.classList.add('open');
    }

    closeModal() {
      this.modal.overlay.classList.remove('open');
    }

    buildHelpContent(focusShortcuts = false) {
      const shortcuts = `
        <div class="modal-section">
          <div class="modal-ill-label">Keyboard Shortcuts</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div><span class="text-vectura-accent">?</span> Open shortcuts</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + A</span> Select all layers (in layer list)</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + G</span> Group selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + G</span> Ungroup selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + [</span> Move layer down</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + ]</span> Move layer up</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + [ / ]</span> Send to back / front</div>
            <div><span class="text-vectura-accent">Delete</span> Remove selected layer(s)</div>
            <div><span class="text-vectura-accent">Arrow Keys</span> Nudge (Shift = bigger)</div>
            <div><span class="text-vectura-accent">Alt/Option + Drag</span> Duplicate layer</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Z</span> Undo</div>
          </div>
        </div>
      `;
      const guidance = `
        <div class="modal-section">
          <div class="modal-ill-label">Getting Started</div>
          <p class="modal-text">
            Choose an algorithm, adjust its parameters, and refine with transform controls. Use layers to stack
            multiple generations, then export SVG for plotting.
          </p>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            For Wavetable image noise, set Noise Type to Image and use Select Image to load a file.
            Rainfall supports silhouette images to constrain where drops appear.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Harmonograph layers combine damped pendulum waves; tweak frequency, phase, and damping for intricate loops.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Angle controls use circular dials—drag the marker to set direction.
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Canvas</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Shift + Drag to pan</div>
            <div>Mouse wheel to zoom</div>
            <div>Drag selection box to multi-select</div>
            <div>Drag to move selection; handles resize; top-right handle rotates (Shift snaps)</div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Layers &amp; Groups</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Click to select, Shift-click for ranges, Cmd/Ctrl-click to toggle.</div>
            <div>Drag the grip to reorder; groups can be collapsed with the caret.</div>
            <div>Expand a layer into sublayers for line-by-line control.</div>
            <div>Selection outline visibility, color, and thickness can be adjusted in Settings.</div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Pens &amp; Export</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Assign pens per layer or selection by dragging a pen onto layers.</div>
            <div>Use the palette dropdown to recolor pens; add or remove pens from the panel.</div>
            <div>Plotter Optimization in Settings removes fully overlapping paths per pen.</div>
            <div>SVG export preserves pen groupings for plotter workflows.</div>
          </div>
        </div>
      `;
      return focusShortcuts ? `${shortcuts}${guidance}` : `${guidance}${shortcuts}`;
    }

    openHelp(focusShortcuts = false) {
      const body = this.buildHelpContent(focusShortcuts);
      const title = focusShortcuts ? 'Keyboard Shortcuts' : 'Help Guide';
      this.openModal({ title, body });
    }

    getTransformSnapshot(params) {
      return TRANSFORM_KEYS.reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});
    }

    storeLayerParams(layer) {
      if (!layer) return;
      if (!layer.paramStates) layer.paramStates = {};
      const next = { ...layer.params };
      TRANSFORM_KEYS.forEach((key) => delete next[key]);
      layer.paramStates[layer.type] = clone(next);
    }

    restoreLayerParams(layer, nextType) {
      if (!layer) return;
      const base = ALGO_DEFAULTS[nextType] ? clone(ALGO_DEFAULTS[nextType]) : {};
      const stored = layer.paramStates?.[nextType] ? clone(layer.paramStates[nextType]) : null;
      const transform = this.getTransformSnapshot(layer.params);
      layer.type = nextType;
      layer.params = { ...base, ...(stored || {}), ...transform };
      this.storeLayerParams(layer);
    }

    randomizeLayerParams(layer) {
      if (!layer) return;
      const defs = [...(this.controls[layer.type] || []), ...COMMON_CONTROLS];
      const rng = (min, max) => min + Math.random() * (max - min);
      const safeRange = (min, max) => {
        const span = max - min;
        if (span <= 0) return { min, max };
        const pad = span * 0.1;
        const minSafe = min + pad;
        const maxSafe = max - pad;
        if (maxSafe <= minSafe) return { min, max };
        return { min: minSafe, max: maxSafe };
      };
      const roundStep = (value, step, min, max) => {
        const snapped = roundToStep(value, step);
        return clamp(snapped, min, max);
      };

      defs.forEach((def) => {
        if (def.showIf && !def.showIf(layer.params)) return;
        if (def.type === 'section' || def.type === 'file' || def.type === 'image') return;
        if (def.type === 'angle') {
          const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
          const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
          const { min, max } = safeRange(randMin, randMax);
          const step = def.step ?? 1;
          layer.params[def.id] = roundStep(rng(min, max), step, def.min, def.max);
          return;
        } else if (def.type === 'checkbox') {
          layer.params[def.id] = Math.random() > 0.5;
          return;
        }
        if (def.type === 'select') {
          const opts = def.options || [];
          const available = def.randomExclude ? opts.filter((opt) => !def.randomExclude.includes(opt.value)) : opts;
          if (!available.length) return;
          const pick = available[Math.floor(Math.random() * available.length)];
          layer.params[def.id] = pick.value;
          return;
        }
        if (def.type === 'rangeDual') {
          const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
          const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
          const { min, max } = safeRange(randMin, randMax);
          const step = def.step ?? 1;
          let a = rng(min, max);
          let b = rng(min, max);
          if (a > b) [a, b] = [b, a];
          if (b - a < step) b = Math.min(max, a + step);
          layer.params[def.minKey] = roundStep(a, step, def.min, def.max);
          layer.params[def.maxKey] = roundStep(b, step, def.min, def.max);
          return;
        }
        if (def.type === 'range') {
          const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
          const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
          const { min, max } = safeRange(randMin, randMax);
          const step = def.step ?? 1;
          layer.params[def.id] = roundStep(rng(min, max), step, def.min, def.max);
        }
      });
    }

    recenterLayerIfNeeded(layer) {
      if (!layer || !this.app.renderer) return;
      const bounds = this.app.renderer.getLayerBounds(layer);
      if (!bounds) return;
      const prof = this.app.engine.currentProfile;
      const inset = SETTINGS.truncate ? SETTINGS.margin : 0;
      const limitLeft = inset;
      const limitRight = prof.width - inset;
      const limitTop = inset;
      const limitBottom = prof.height - inset;
      const corners = Object.values(bounds.corners || {});
      if (!corners.length) return;
      const minX = Math.min(...corners.map((pt) => pt.x));
      const maxX = Math.max(...corners.map((pt) => pt.x));
      const minY = Math.min(...corners.map((pt) => pt.y));
      const maxY = Math.max(...corners.map((pt) => pt.y));
      const boundsW = maxX - minX;
      const boundsH = maxY - minY;
      const availableW = limitRight - limitLeft;
      const availableH = limitBottom - limitTop;
      let shiftX = 0;
      let shiftY = 0;

      if (boundsW > availableW) {
        shiftX = (limitLeft + limitRight) / 2 - (minX + maxX) / 2;
      } else {
        if (minX < limitLeft) shiftX = limitLeft - minX;
        if (maxX + shiftX > limitRight) shiftX = limitRight - maxX;
      }

      if (boundsH > availableH) {
        shiftY = (limitTop + limitBottom) / 2 - (minY + maxY) / 2;
      } else {
        if (minY < limitTop) shiftY = limitTop - minY;
        if (maxY + shiftY > limitBottom) shiftY = limitBottom - maxY;
      }

      if (Math.abs(shiftX) > 0.001 || Math.abs(shiftY) > 0.001) {
        layer.params.posX += shiftX;
        layer.params.posY += shiftY;
        this.app.engine.generate(layer.id);
      }
    }

    toggleSeedControls(type) {
      const seedControls = getEl('seed-controls');
      const show = usesSeed(type);
      if (seedControls) seedControls.style.display = show ? '' : 'none';
      const label = getEl('transform-label');
      if (label) label.textContent = show ? 'Transform & Seed' : 'Transform';
    }

    isDuplicateLayerName(name, excludeId) {
      const normalized = name.trim().toLowerCase();
      return this.app.engine.layers.some(
        (layer) => layer.id !== excludeId && layer.name.trim().toLowerCase() === normalized
      );
    }

    getLayerById(id) {
      return this.app.engine.layers.find((layer) => layer.id === id) || null;
    }

    getGroupForLayer(layer) {
      if (!layer || !layer.parentId) return null;
      const group = this.getLayerById(layer.parentId);
      return group && group.isGroup ? group : null;
    }

    isDescendant(targetId, ancestorId) {
      let current = this.getLayerById(targetId);
      while (current && current.parentId) {
        if (current.parentId === ancestorId) return true;
        current = this.getLayerById(current.parentId);
      }
      return false;
    }

    normalizeGroupOrder() {
      const layers = this.app.engine.layers;
      const groups = layers.filter((layer) => layer.isGroup);
      const groupIds = new Set(groups.map((group) => group.id));
      const childrenMap = new Map();
      layers.forEach((layer) => {
        if (layer.parentId && groupIds.has(layer.parentId)) {
          if (!childrenMap.has(layer.parentId)) childrenMap.set(layer.parentId, []);
          childrenMap.get(layer.parentId).push(layer);
        }
      });
      const getDescendants = (groupId) => {
        const children = childrenMap.get(groupId) || [];
        const ids = [];
        children.forEach((child) => {
          ids.push(child.id);
          if (child.isGroup) ids.push(...getDescendants(child.id));
        });
        return ids;
      };
      groups.forEach((group) => {
        const descendantIds = getDescendants(group.id);
        if (!descendantIds.length) return;
        const childIndexes = descendantIds
          .map((id) => layers.findIndex((layer) => layer.id === id))
          .filter((idx) => idx >= 0);
        if (!childIndexes.length) return;
        const maxIndex = Math.max(...childIndexes);
        const currentIndex = layers.findIndex((layer) => layer.id === group.id);
        if (currentIndex === -1) return;
        if (currentIndex === maxIndex + 1) return;
        layers.splice(currentIndex, 1);
        const insertIndex = Math.min(maxIndex + 1, layers.length);
        layers.splice(insertIndex, 0, group);
      });
    }

    moveSelectedLayers(direction) {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
        const layer = this.getLayerById(id);
        return layer && !layer.isGroup;
      });
      if (!selectedIds.length) return;
      const order = this.app.engine.layers.map((layer) => layer.id);
      const selected = new Set(selectedIds);
      if (direction === 'top' || direction === 'bottom') {
        const keep = order.filter((id) => !selected.has(id));
        const moving = order.filter((id) => selected.has(id));
        const next = direction === 'top' ? [...keep, ...moving] : [...moving, ...keep];
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = next.map((id) => map.get(id)).filter(Boolean);
      } else if (direction === 'up') {
        for (let i = order.length - 2; i >= 0; i--) {
          if (selected.has(order[i]) && !selected.has(order[i + 1])) {
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
          }
        }
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
      } else if (direction === 'down') {
        for (let i = 1; i < order.length; i++) {
          if (selected.has(order[i]) && !selected.has(order[i - 1])) {
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
          }
        }
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
      }
      this.normalizeGroupOrder();
      this.renderLayers();
      this.app.render();
    }

    groupSelection() {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
        const layer = this.getLayerById(id);
        return layer && !layer.isGroup;
      });
      if (selectedIds.length < 2) return;
      if (!Layer) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const layers = this.app.engine.layers;
      const selectedSet = new Set(selectedIds);
      const selectedLayers = layers.filter((layer) => selectedSet.has(layer.id));
      const maxIndex = Math.max(...selectedLayers.map((layer) => layers.indexOf(layer)));
      SETTINGS.globalLayerCount++;
      const groupName = `Group ${String(SETTINGS.globalLayerCount).padStart(2, '0')}`;
      const groupId = Math.random().toString(36).substr(2, 9);
      const group = new Layer(groupId, 'group', groupName);
      group.isGroup = true;
      group.groupType = 'group';
      group.groupCollapsed = false;
      group.visible = false;
      const primary = selectedLayers[0];
      if (primary) {
        group.penId = primary.penId;
        group.color = primary.color;
        group.strokeWidth = primary.strokeWidth;
        group.lineCap = primary.lineCap;
      }

      const oldParents = new Set();
      selectedLayers.forEach((layer) => {
        if (layer.parentId) oldParents.add(layer.parentId);
        layer.parentId = groupId;
        if (group.penId) {
          layer.penId = group.penId;
          layer.color = group.color;
          layer.strokeWidth = group.strokeWidth;
          layer.lineCap = group.lineCap;
        }
      });

      layers.splice(maxIndex + 1, 0, group);

      oldParents.forEach((parentId) => {
        const stillHas = layers.some((layer) => layer.parentId === parentId);
        if (!stillHas) {
          const idx = layers.findIndex((layer) => layer.id === parentId);
          if (idx >= 0) layers.splice(idx, 1);
        }
      });

      this.normalizeGroupOrder();
      this.renderLayers();
      this.app.render();
    }

    ungroupSelection() {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []);
      if (!selectedIds.length) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const layers = this.app.engine.layers;
      const groupIds = new Set();
      selectedIds.forEach((id) => {
        const layer = this.getLayerById(id);
        if (layer?.parentId) groupIds.add(layer.parentId);
      });
      if (!groupIds.size) return;
      groupIds.forEach((groupId) => {
        layers.forEach((layer) => {
          if (layer.parentId === groupId) {
            layer.parentId = null;
          }
        });
        const idx = layers.findIndex((layer) => layer.id === groupId);
        if (idx >= 0) layers.splice(idx, 1);
      });
      this.renderLayers();
      this.app.render();
    }

    getUniqueLayerName(base, excludeId) {
      const clean = base.trim() || 'Layer';
      if (!this.isDuplicateLayerName(clean, excludeId)) return clean;
      let count = 2;
      let next = `${clean} ${count}`;
      while (this.isDuplicateLayerName(next, excludeId)) {
        count += 1;
        next = `${clean} ${count}`;
      }
      return next;
    }

    showDuplicateNameError(name) {
      this.openModal({
        title: 'Name Unavailable',
        body: `<p class="modal-text">"${name}" is already in use. Layer names must be unique.</p>`,
      });
    }

    showValueError(value) {
      this.openModal({
        title: 'Invalid Value',
        body: `<p class="modal-text">"${value}" is outside the allowed range or format.</p>`,
      });
    }

    showInfo(key) {
      const info = INFO[key];
      if (!info) return;
      const illustration = buildPreviewPair(key, this);
      const body = `
        <p class="modal-text">${info.description}</p>
        ${illustration}
      `;
      this.openModal({ title: info.title, body });
    }

    attachInfoButton(labelEl, key) {
      if (!labelEl || labelEl.querySelector('.info-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-btn';
      btn.dataset.info = key;
      btn.setAttribute('aria-label', `Info about ${labelEl.textContent}`);
      btn.textContent = 'i';
      labelEl.appendChild(btn);
    }

    attachStaticInfoButtons() {
      const entries = [
        { inputId: 'generator-module', infoKey: 'global.algorithm' },
        { inputId: 'inp-seed', infoKey: 'global.seed' },
        { inputId: 'inp-pos-x', infoKey: 'global.posX' },
        { inputId: 'inp-pos-y', infoKey: 'global.posY' },
        { inputId: 'inp-scale-x', infoKey: 'global.scaleX' },
        { inputId: 'inp-scale-y', infoKey: 'global.scaleY' },
        { inputId: 'inp-rotation', infoKey: 'global.rotation' },
        { inputId: 'machine-profile', infoKey: 'global.paperSize' },
        { inputId: 'set-margin', infoKey: 'global.margin' },
        { inputId: 'set-truncate', infoKey: 'global.truncate' },
        { inputId: 'set-outside-opacity', infoKey: 'global.outsideOpacity' },
        { inputId: 'set-margin-line', infoKey: 'global.marginLineVisible' },
        { inputId: 'set-margin-line-weight', infoKey: 'global.marginLineWeight' },
        { inputId: 'set-margin-line-color', infoKey: 'global.marginLineColor' },
        { inputId: 'set-margin-line-dotting', infoKey: 'global.marginLineDotting' },
        { inputId: 'set-selection-outline', infoKey: 'global.selectionOutline' },
        { inputId: 'set-selection-outline-color', infoKey: 'global.selectionOutlineColor' },
        { inputId: 'set-selection-outline-width', infoKey: 'global.selectionOutlineWidth' },
        { inputId: 'set-speed-down', infoKey: 'global.speedDown' },
        { inputId: 'set-speed-up', infoKey: 'global.speedUp' },
        { inputId: 'set-precision', infoKey: 'global.precision' },
        { inputId: 'set-stroke', infoKey: 'global.stroke' },
        { inputId: 'set-plotter-opt', infoKey: 'global.plotterOptimize' },
      ];

      entries.forEach(({ inputId, infoKey }) => {
        const input = getEl(inputId);
        if (!input) return;
        const label =
          input.parentElement?.querySelector('label') ||
          input.parentElement?.parentElement?.querySelector('label') ||
          input.closest('.control-group')?.querySelector('.control-label');
        this.attachInfoButton(label, infoKey);
      });
    }

    bindInfoButtons() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-btn');
        if (!btn) return;
        const key = btn.dataset.info;
        this.showInfo(key);
      });
    }

    initModuleDropdown() {
      const select = getEl('generator-module');
      if (!select) return;
      select.innerHTML = '';
      Object.keys(ALGO_DEFAULTS).forEach((key) => {
        const def = ALGO_DEFAULTS[key];
        if (def && def.hidden) return;
        const opt = document.createElement('option');
        opt.value = key;
        const label = def?.label;
        opt.innerText = label || key.charAt(0).toUpperCase() + key.slice(1);
        select.appendChild(opt);
      });
    }

    initMachineDropdown() {
      const select = getEl('machine-profile');
      if (!select || !MACHINES) return;
      select.innerHTML = '';
      Object.entries(MACHINES).forEach(([key, profile]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = profile.name;
        select.appendChild(opt);
      });
      select.value = SETTINGS.paperSize && MACHINES[SETTINGS.paperSize] ? SETTINGS.paperSize : Object.keys(MACHINES)[0] || '';
    }

    getPaletteList() {
      return Array.isArray(PALETTES) ? PALETTES : window.Vectura?.PALETTES || [];
    }

    getActivePalette() {
      const palettes = this.getPaletteList();
      if (!palettes.length) return null;
      const target = palettes.find((palette) => palette.id === SETTINGS.paletteId);
      return target || palettes[0];
    }

    applyPaletteToPens(palette, options = {}) {
      if (!palette || !palette.colors || !palette.colors.length) return;
      const pens = SETTINGS.pens || [];
      pens.forEach((pen, index) => {
        pen.color = palette.colors[index % palette.colors.length];
      });
      this.app.engine.layers.forEach((layer) => {
        const pen = pens.find((p) => p.id === layer.penId);
        if (pen) layer.color = pen.color;
      });
      if (!options.skipRender) {
        this.renderPens();
        this.renderLayers();
        this.app.render();
      }
    }

    addPen() {
      if (this.app.pushHistory) this.app.pushHistory();
      const pens = SETTINGS.pens || [];
      const palette = this.getActivePalette();
      const colors = palette?.colors || [];
      const color = colors.length ? colors[pens.length % colors.length] : '#ffffff';
      const nextIndex = pens.length + 1;
      const pen = {
        id: `pen-${Math.random().toString(36).slice(2, 9)}`,
        name: `Pen ${nextIndex}`,
        color,
        width: SETTINGS.strokeWidth ?? 0.3,
      };
      pens.push(pen);
      this.renderPens();
      this.renderLayers();
    }

    removePen(penId) {
      const pens = SETTINGS.pens || [];
      if (pens.length <= 1) {
        this.openModal({
          title: 'Cannot Remove Pen',
          body: '<p class="modal-text">At least one pen must remain in the list.</p>',
        });
        return;
      }
      const idx = pens.findIndex((pen) => pen.id === penId);
      if (idx === -1) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const fallback = pens[idx - 1] || pens[idx + 1];
      pens.splice(idx, 1);
      this.app.engine.layers.forEach((layer) => {
        if (layer.penId === penId && fallback) {
          layer.penId = fallback.id;
          layer.color = fallback.color;
          layer.strokeWidth = fallback.width;
        }
      });
      this.renderPens();
      this.renderLayers();
      this.app.render();
    }

    initPaletteControls() {
      const toggle = getEl('palette-toggle');
      const menu = getEl('palette-menu');
      const options = getEl('palette-options');
      const search = getEl('palette-search');
      const addBtn = getEl('btn-add-pen');
      const palettes = this.getPaletteList();
      if (!toggle || !menu || !options || !search || !palettes.length) {
        if (addBtn) addBtn.onclick = () => this.addPen();
        return;
      }

      const setActiveLabel = () => {
        const active = this.getActivePalette();
        if (active) {
          SETTINGS.paletteId = active.id;
          toggle.textContent = active.name;
        }
      };

      const renderOptions = (filter = '') => {
        const term = filter.trim().toLowerCase();
        options.innerHTML = '';
        const list = palettes.filter((palette) => palette.name.toLowerCase().includes(term));
        list.forEach((palette) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'palette-option';
          btn.dataset.paletteId = palette.id;
          if (palette.id === SETTINGS.paletteId) btn.classList.add('active');
          btn.innerHTML = `
            <span class="palette-name">${palette.name}</span>
            <span class="palette-swatch">
              ${(palette.colors || [])
                .slice(0, 5)
                .map((color) => `<span style="background:${color}"></span>`)
                .join('')}
            </span>
          `;
          btn.onclick = (e) => {
            e.stopPropagation();
            SETTINGS.paletteId = palette.id;
            setActiveLabel();
            this.applyPaletteToPens(palette);
            menu.classList.add('hidden');
            this.openPaletteMenu = null;
          };
          options.appendChild(btn);
        });
      };

      setActiveLabel();
      renderOptions();

      toggle.onclick = (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
          if (this.openPenMenu) {
            this.openPenMenu.classList.add('hidden');
            this.openPenMenu = null;
          }
          if (this.openPaletteMenu && this.openPaletteMenu !== menu) {
            this.openPaletteMenu.classList.add('hidden');
          }
          renderOptions(search.value);
          menu.classList.remove('hidden');
          this.openPaletteMenu = menu;
          search.focus();
          search.select();
        } else {
          menu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
      };

      menu.addEventListener('click', (e) => e.stopPropagation());
      search.oninput = () => renderOptions(search.value);

      if (addBtn) {
        addBtn.onclick = () => this.addPen();
      }
    }

    initSettingsValues() {
      const margin = getEl('set-margin');
      const speedDown = getEl('set-speed-down');
      const speedUp = getEl('set-speed-up');
      const stroke = getEl('set-stroke');
      const precision = getEl('set-precision');
      const plotterOpt = getEl('set-plotter-opt');
      const undoSteps = getEl('set-undo');
      const truncate = getEl('set-truncate');
      const outsideOpacity = getEl('set-outside-opacity');
      const marginLine = getEl('set-margin-line');
      const marginLineWeight = getEl('set-margin-line-weight');
      const marginLineColor = getEl('set-margin-line-color');
      const marginLineDotting = getEl('set-margin-line-dotting');
      const showGuides = getEl('set-show-guides');
      const snapGuides = getEl('set-snap-guides');
      const selectionOutline = getEl('set-selection-outline');
      const selectionOutlineColor = getEl('set-selection-outline-color');
      const selectionOutlineWidth = getEl('set-selection-outline-width');
      const paperWidth = getEl('set-paper-width');
      const paperHeight = getEl('set-paper-height');
      const orientationToggle = getEl('set-orientation');
      const orientationLabel = getEl('orientation-label');
      const customFields = getEl('custom-size-fields');
      const bgColor = getEl('inp-bg-color');
      if (margin) margin.value = SETTINGS.margin;
      if (speedDown) speedDown.value = SETTINGS.speedDown;
      if (speedUp) speedUp.value = SETTINGS.speedUp;
      if (stroke) stroke.value = SETTINGS.strokeWidth;
      if (precision) precision.value = SETTINGS.precision;
      if (plotterOpt) plotterOpt.value = SETTINGS.plotterOptimize ?? 0;
      if (undoSteps) undoSteps.value = SETTINGS.undoSteps;
      if (truncate) truncate.checked = SETTINGS.truncate !== false;
      if (outsideOpacity) outsideOpacity.value = SETTINGS.outsideOpacity ?? 0.5;
      if (marginLine) marginLine.checked = Boolean(SETTINGS.marginLineVisible);
      if (marginLineWeight) marginLineWeight.value = SETTINGS.marginLineWeight ?? 0.2;
      if (marginLineColor) marginLineColor.value = SETTINGS.marginLineColor ?? '#52525b';
      if (marginLineDotting) marginLineDotting.value = SETTINGS.marginLineDotting ?? 0;
      if (showGuides) showGuides.checked = SETTINGS.showGuides !== false;
      if (snapGuides) snapGuides.checked = SETTINGS.snapGuides !== false;
      if (selectionOutline) selectionOutline.checked = SETTINGS.selectionOutline !== false;
      if (selectionOutlineColor) selectionOutlineColor.value = SETTINGS.selectionOutlineColor || '#ef4444';
      if (selectionOutlineWidth) selectionOutlineWidth.value = SETTINGS.selectionOutlineWidth ?? 0.4;
      if (bgColor) bgColor.value = SETTINGS.bgColor;
      if (paperWidth) paperWidth.value = SETTINGS.paperWidth ?? 210;
      if (paperHeight) paperHeight.value = SETTINGS.paperHeight ?? 297;
      if (orientationToggle) orientationToggle.checked = (SETTINGS.paperOrientation || 'landscape') === 'landscape';
      if (orientationLabel) {
        orientationLabel.textContent =
          (SETTINGS.paperOrientation || 'landscape') === 'landscape' ? 'Landscape' : 'Portrait';
      }
      if (customFields) {
        customFields.classList.toggle('hidden', SETTINGS.paperSize !== 'custom');
      }
    }

    initPaneToggles() {
      const leftPane = getEl('left-pane');
      const rightPane = getEl('right-pane');
      const bottomPane = getEl('bottom-pane');
      const leftBtn = getEl('btn-pane-toggle-left');
      const rightBtn = getEl('btn-pane-toggle-right');
      if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

      const isCollapsed = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed') && !pane.classList.contains('pane-force-open');
        return auto || pane.classList.contains('pane-collapsed');
      };

      const applyAutoCollapse = () => {
        const shouldAuto = window.innerWidth < 1200;
        document.body.classList.toggle('auto-collapsed', shouldAuto);
      };

      const togglePane = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed');
        if (auto) {
          pane.classList.toggle('pane-force-open');
        } else {
          pane.classList.toggle('pane-collapsed');
        }
      };

      leftBtn.addEventListener('click', () => togglePane(leftPane));
      rightBtn.addEventListener('click', () => togglePane(rightPane));
      window.addEventListener('resize', applyAutoCollapse);
      applyAutoCollapse();

      this.expandPanes = () => {
        leftPane.classList.remove('pane-collapsed', 'pane-force-open');
        rightPane.classList.remove('pane-collapsed', 'pane-force-open');
        document.body.classList.remove('auto-collapsed');
        document.documentElement.style.setProperty('--pane-left-width', '320px');
        document.documentElement.style.setProperty('--pane-right-width', '336px');
        document.documentElement.style.setProperty('--bottom-pane-height', '180px');
        if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
      };
    }

    initBottomPaneToggle() {
      const bottomPane = getEl('bottom-pane');
      const btn = getEl('btn-pane-toggle-bottom');
      if (!bottomPane || !btn) return;
      btn.addEventListener('click', () => bottomPane.classList.toggle('bottom-pane-collapsed'));
    }

    initBottomPaneResizer() {
      const resizer = getEl('bottom-resizer');
      const bottomPane = getEl('bottom-pane');
      if (!resizer || !bottomPane) return;
      const minHeight = 80;
      const maxHeight = 360;

      const startDrag = (e) => {
        e.preventDefault();
        resizer.classList.add('active');
        bottomPane.classList.remove('bottom-pane-collapsed');
        const startY = e.clientY;
        const startHeight = bottomPane.getBoundingClientRect().height;

        const onMove = (ev) => {
          const dy = ev.clientY - startY;
          const next = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
          document.documentElement.style.setProperty('--bottom-pane-height', `${next}px`);
        };
        const onUp = () => {
          resizer.classList.remove('active');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      resizer.addEventListener('mousedown', startDrag);
    }

    initPaneResizers() {
      const leftPane = getEl('left-pane');
      const rightPane = getEl('right-pane');
      const leftResizer = getEl('left-resizer');
      const rightResizer = getEl('right-resizer');
      if (!leftPane || !rightPane || !leftResizer || !rightResizer) return;

      const minLeft = 200;
      const maxLeft = 520;
      const minRight = 200;
      const maxRight = 520;

      const startDrag = (e, side) => {
        e.preventDefault();
        const startX = e.clientX;
        const startLeft = leftPane.getBoundingClientRect().width;
        const startRight = rightPane.getBoundingClientRect().width;
        const resizer = side === 'left' ? leftResizer : rightResizer;
        resizer.classList.add('active');
        document.body.classList.remove('auto-collapsed');
        leftPane.classList.remove('pane-collapsed');
        rightPane.classList.remove('pane-collapsed');

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          if (side === 'left') {
            const next = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
            document.documentElement.style.setProperty('--pane-left-width', `${next}px`);
          } else {
            const next = Math.max(minRight, Math.min(maxRight, startRight - dx));
            document.documentElement.style.setProperty('--pane-right-width', `${next}px`);
          }
        };

        const onUp = () => {
          resizer.classList.remove('active');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      leftResizer.addEventListener('mousedown', (e) => startDrag(e, 'left'));
      rightResizer.addEventListener('mousedown', (e) => startDrag(e, 'right'));
    }

    bindGlobal() {
      const addLayer = getEl('btn-add-layer');
      const moduleSelect = getEl('generator-module');
      const bgColor = getEl('inp-bg-color');
      const settingsPanel = getEl('settings-panel');
      const btnSettings = getEl('btn-settings');
      const btnCloseSettings = getEl('btn-close-settings');
      const btnHelp = getEl('btn-help');
      const machineProfile = getEl('machine-profile');
      const setMargin = getEl('set-margin');
      const setTruncate = getEl('set-truncate');
      const setOutsideOpacity = getEl('set-outside-opacity');
      const setMarginLine = getEl('set-margin-line');
      const setMarginLineWeight = getEl('set-margin-line-weight');
      const setMarginLineColor = getEl('set-margin-line-color');
      const setMarginLineDotting = getEl('set-margin-line-dotting');
      const setShowGuides = getEl('set-show-guides');
      const setSnapGuides = getEl('set-snap-guides');
      const setSelectionOutline = getEl('set-selection-outline');
      const setSelectionOutlineColor = getEl('set-selection-outline-color');
      const setSelectionOutlineWidth = getEl('set-selection-outline-width');
      const setSpeedDown = getEl('set-speed-down');
      const setSpeedUp = getEl('set-speed-up');
      const setStroke = getEl('set-stroke');
      const setPrecision = getEl('set-precision');
      const setPlotterOpt = getEl('set-plotter-opt');
      const setUndo = getEl('set-undo');
      const setPaperWidth = getEl('set-paper-width');
      const setPaperHeight = getEl('set-paper-height');
      const setOrientation = getEl('set-orientation');
      const orientationLabel = getEl('orientation-label');
      const customFields = getEl('custom-size-fields');
      const btnExport = getEl('btn-export');
      const btnResetView = getEl('btn-reset-view');

      if (addLayer && moduleSelect) {
        addLayer.onclick = () => {
          const t = moduleSelect.value;
          if (this.app.pushHistory) this.app.pushHistory();
          const id = this.app.engine.addLayer(t);
          if (this.app.renderer) this.app.renderer.setSelection([id], id);
          this.renderLayers();
          this.app.render();
        };
      }

      if (moduleSelect) {
        moduleSelect.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            this.storeLayerParams(l);
            const nextType = e.target.value;
            this.restoreLayerParams(l, nextType);
            const label = ALGO_DEFAULTS[l.type]?.label;
            const nextName = label || l.type.charAt(0).toUpperCase() + l.type.slice(1);
            l.name = this.getUniqueLayerName(nextName, l.id);
            this.buildControls();
            this.app.regen();
            this.renderLayers();
          }
        };
      }

      if (bgColor) {
        let armed = false;
        bgColor.onfocus = () => {
          if (!armed && this.app.pushHistory) this.app.pushHistory();
          armed = true;
        };
        bgColor.oninput = (e) => {
          SETTINGS.bgColor = e.target.value;
          this.app.render();
        };
        bgColor.onchange = () => {
          armed = false;
        };
      }

      if (btnSettings && settingsPanel) {
        btnSettings.onclick = () => settingsPanel.classList.toggle('open');
      }
      if (btnCloseSettings && settingsPanel) {
        btnCloseSettings.onclick = () => settingsPanel.classList.remove('open');
      }
      if (btnHelp) {
        btnHelp.onclick = () => this.openHelp(false);
      }

      if (machineProfile) {
        machineProfile.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = e.target.value;
          SETTINGS.paperSize = next;
          if (customFields) customFields.classList.toggle('hidden', next !== 'custom');
          if (next !== 'custom' && MACHINES && MACHINES[next]) {
            SETTINGS.paperWidth = MACHINES[next].width;
            SETTINGS.paperHeight = MACHINES[next].height;
            if (setPaperWidth) setPaperWidth.value = SETTINGS.paperWidth;
            if (setPaperHeight) setPaperHeight.value = SETTINGS.paperHeight;
          }
          this.app.engine.setProfile(next);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setMargin) {
        setMargin.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.margin = parseInt(e.target.value, 10);
          this.app.regen();
        };
      }
      if (setTruncate) {
        setTruncate.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.truncate = e.target.checked;
          this.app.render();
        };
      }
      if (setOutsideOpacity) {
        setOutsideOpacity.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(1, parseFloat(e.target.value)));
          SETTINGS.outsideOpacity = Number.isFinite(next) ? next : 0.5;
          e.target.value = SETTINGS.outsideOpacity;
          this.app.render();
        };
      }
      if (setMarginLine) {
        setMarginLine.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.marginLineVisible = e.target.checked;
          this.app.render();
        };
      }
      if (setMarginLineWeight) {
        setMarginLineWeight.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0.05, parseFloat(e.target.value));
          SETTINGS.marginLineWeight = Number.isFinite(next) ? next : 0.2;
          e.target.value = SETTINGS.marginLineWeight;
          this.app.render();
        };
      }
      if (setMarginLineColor) {
        setMarginLineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.marginLineColor = e.target.value || SETTINGS.marginLineColor;
          this.app.render();
        };
      }
      if (setMarginLineDotting) {
        setMarginLineDotting.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, parseFloat(e.target.value));
          SETTINGS.marginLineDotting = Number.isFinite(next) ? next : 0;
          e.target.value = SETTINGS.marginLineDotting;
          this.app.render();
        };
      }
      if (setShowGuides) {
        setShowGuides.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.showGuides = e.target.checked;
          this.app.render();
        };
      }
      if (setSnapGuides) {
        setSnapGuides.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.snapGuides = e.target.checked;
        };
      }
      if (setSelectionOutline) {
        setSelectionOutline.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.selectionOutline = e.target.checked;
          this.app.render();
        };
      }
      if (setSelectionOutlineColor) {
        setSelectionOutlineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.selectionOutlineColor = e.target.value || SETTINGS.selectionOutlineColor;
          this.app.render();
        };
      }
      if (setSelectionOutlineWidth) {
        setSelectionOutlineWidth.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0.1, parseFloat(e.target.value));
          SETTINGS.selectionOutlineWidth = Number.isFinite(next) ? next : 0.4;
          e.target.value = SETTINGS.selectionOutlineWidth;
          this.app.render();
        };
      }
      if (setSpeedDown) {
        setSpeedDown.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.speedDown = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setSpeedUp) {
        setSpeedUp.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.speedUp = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setStroke) {
        setStroke.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.strokeWidth = parseFloat(e.target.value);
          this.app.engine.layers.forEach((layer) => {
            layer.strokeWidth = SETTINGS.strokeWidth;
          });
          this.app.render();
        };
      }
      if (setPrecision) {
        setPrecision.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 3));
          SETTINGS.precision = next;
          e.target.value = next;
        };
      }
      if (setPaperWidth) {
        setPaperWidth.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, parseFloat(e.target.value));
          if (Number.isFinite(next)) SETTINGS.paperWidth = next;
          e.target.value = SETTINGS.paperWidth;
          if (SETTINGS.paperSize === 'custom') {
            this.app.engine.setProfile('custom');
            this.app.renderer.center();
            this.app.regen();
          }
        };
      }
      if (setPaperHeight) {
        setPaperHeight.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, parseFloat(e.target.value));
          if (Number.isFinite(next)) SETTINGS.paperHeight = next;
          e.target.value = SETTINGS.paperHeight;
          if (SETTINGS.paperSize === 'custom') {
            this.app.engine.setProfile('custom');
            this.app.renderer.center();
            this.app.regen();
          }
        };
      }
      if (setOrientation) {
        setOrientation.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.paperOrientation = e.target.checked ? 'landscape' : 'portrait';
          if (orientationLabel) {
            orientationLabel.textContent = e.target.checked ? 'Landscape' : 'Portrait';
          }
          const key = machineProfile?.value || SETTINGS.paperSize || 'a4';
          this.app.engine.setProfile(key);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setPlotterOpt) {
        setPlotterOpt.oninput = (e) => {
          const next = Math.max(0, Math.min(1, parseFloat(e.target.value)));
          SETTINGS.plotterOptimize = Number.isFinite(next) ? next : 0;
          this.app.render();
        };
      }
      if (setUndo) {
        setUndo.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20));
          SETTINGS.undoSteps = next;
          e.target.value = next;
          if (this.app.setUndoLimit) this.app.setUndoLimit(next);
        };
      }

      if (btnExport) {
        btnExport.onclick = () => this.exportSVG();
      }
      if (btnResetView) {
        btnResetView.onclick = () => {
          this.app.renderer.center();
          if (this.expandPanes) this.expandPanes();
          this.app.render();
        };
      }

      const bindTrans = (id, key) => {
        const el = getEl(id);
        if (!el) return;
        el.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            l.params[key] = parseFloat(e.target.value);
            this.app.regen();
          }
        };
      };
      bindTrans('inp-seed', 'seed');
      bindTrans('inp-pos-x', 'posX');
      bindTrans('inp-pos-y', 'posY');
      bindTrans('inp-scale-x', 'scaleX');
      bindTrans('inp-scale-y', 'scaleY');
      bindTrans('inp-rotation', 'rotation');

      const randSeed = getEl('btn-rand-seed');
      if (randSeed) {
        randSeed.onclick = () => {
          const l = this.app.engine.getActiveLayer();
          const seedInput = getEl('inp-seed');
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            l.params.seed = Math.floor(Math.random() * 99999);
            if (seedInput) seedInput.value = l.params.seed;
            this.app.regen();
            this.recenterLayerIfNeeded(l);
            this.app.render();
            this.buildControls();
            this.updateFormula();
          }
        };
      }
    }

    bindShortcuts() {
      window.addEventListener('keydown', (e) => {
        const target = e.target;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (isInput) return;

        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          e.preventDefault();
          this.openHelp(true);
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (this.app.undo) this.app.undo();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && this.layerListFocus) {
          e.preventDefault();
          const all = this.app.engine.layers.filter((layer) => !layer.isGroup).map((layer) => layer.id);
          const primary = all[all.length - 1] || null;
          if (this.app.renderer) this.app.renderer.setSelection(all, primary);
          this.app.engine.activeLayerId = primary;
          this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
          e.preventDefault();
          if (e.shiftKey) {
            this.ungroupSelection();
          } else {
            this.groupSelection();
          }
          return;
        }

        if ((e.metaKey || e.ctrlKey) && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
          e.preventDefault();
          if (this.app.pushHistory) this.app.pushHistory();
          const isRight = e.key === ']' || e.key === '}';
          const direction = isRight ? 'up' : 'down';
          if (e.shiftKey || e.key === '{' || e.key === '}') {
            this.moveSelectedLayers(isRight ? 'top' : 'bottom');
          } else {
            this.moveSelectedLayers(direction);
          }
          return;
        }

        const selected = this.app.renderer?.getSelectedLayer?.();
        if (!selected) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (this.app.pushHistory) this.app.pushHistory();
          const ids = Array.from(this.app.renderer?.selectedLayerIds || []);
          ids.forEach((id) => this.app.engine.removeLayer(id));
          if (this.app.renderer) {
            const nextId = this.app.engine.activeLayerId;
            this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
          }
          this.renderLayers();
          this.app.render();
          return;
        }
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (dx || dy) {
          e.preventDefault();
          if (this.app.pushHistory) this.app.pushHistory();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            selectedLayers.forEach((layer) => {
              layer.params.posX += dx;
              layer.params.posY += dy;
              this.app.engine.generate(layer.id);
            });
            this.app.render();
            const primary = this.app.renderer?.getSelectedLayer?.();
            if (primary) {
              const posX = getEl('inp-pos-x');
              const posY = getEl('inp-pos-y');
              if (posX) posX.value = primary.params.posX;
              if (posY) posY.value = primary.params.posY;
            }
          }
        }
      });
    }

    renderLayers() {
      const container = getEl('layer-list');
      if (!container) return;
      container.innerHTML = '';
      const layers = this.app.engine.layers.slice().reverse();
      const groupIds = new Set(layers.filter((layer) => layer.isGroup).map((layer) => layer.id));
      const groupMap = new Map();
      const orphans = [];
      const selectableIds = [];
      const gripMarkup = `
        <button class="layer-grip" type="button" aria-label="Reorder layer">
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
        </button>
      `;

      layers.forEach((layer) => {
        if (layer.parentId && groupIds.has(layer.parentId)) {
          if (!groupMap.has(layer.parentId)) groupMap.set(layer.parentId, []);
          groupMap.get(layer.parentId).push(layer);
        } else if (layer.parentId) {
          orphans.push(layer);
        }
      });

      const collectDescendants = (groupId) => {
        const children = groupMap.get(groupId) || [];
        const ids = [];
        children.forEach((child) => {
          ids.push(child.id);
          if (child.isGroup) ids.push(...collectDescendants(child.id));
        });
        return ids;
      };

      const hasSelectedDescendant = (groupId) => {
        const children = groupMap.get(groupId) || [];
        return children.some((child) => {
          if (this.app.renderer?.selectedLayerIds?.has(child.id)) return true;
          return child.isGroup ? hasSelectedDescendant(child.id) : false;
        });
      };

      const bindLayerReorderGrip = (grip, dragEl, options = {}) => {
        const { ensureSelection, getSelectedIds } = options;
        if (!grip || !dragEl) return;
        grip.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (ensureSelection) ensureSelection(e);
          let selectedIds = getSelectedIds ? getSelectedIds() : Array.from(this.app.renderer?.selectedLayerIds || []);
          if (!selectedIds.length) {
            const fallbackId = dragEl.dataset.layerId;
            if (fallbackId) selectedIds = [fallbackId];
          }
          if (!selectedIds.length) return;
          dragEl.classList.add('dragging');
          const indicator = document.createElement('div');
          indicator.className = 'layer-drop-indicator';
          container.insertBefore(indicator, dragEl.nextSibling);
          const currentOrder = this.app.engine.layers.map((layer) => layer.id).reverse();
          const selectedSet = new Set(selectedIds);
          const selectedInUi = currentOrder.filter((id) => selectedSet.has(id));
          if (!selectedInUi.length) return;
          let dropGroupId = null;
          let dropTarget = null;

          const onMove = (ev) => {
            const y = ev.clientY;
            const items = Array.from(container.querySelectorAll('.layer-item')).filter((item) => item !== dragEl);
            let inserted = false;
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                container.insertBefore(indicator, item);
                inserted = true;
                break;
              }
            }
            if (!inserted) container.appendChild(indicator);

            const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.layer-item');
            let nextGroup = null;
            if (hovered && hovered.dataset.layerId) {
              const hoveredLayer = this.getLayerById(hovered.dataset.layerId);
              if (hoveredLayer && hoveredLayer.isGroup && !selectedSet.has(hoveredLayer.id)) {
                nextGroup = hoveredLayer.id;
              }
            }
            if (dropTarget && dropTarget !== hovered) {
              dropTarget.classList.remove('group-drop-target');
              dropTarget = null;
            }
            if (nextGroup && hovered) {
              dropGroupId = nextGroup;
              dropTarget = hovered;
              dropTarget.classList.add('group-drop-target');
            } else {
              dropGroupId = null;
            }
          };

          const onUp = () => {
            dragEl.classList.remove('dragging');
            const siblings = Array.from(container.children);
            const indicatorIndex = siblings.indexOf(indicator);
            const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('layer-item'));
            const newIndex = before.length;
            indicator.remove();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (dropTarget) {
              dropTarget.classList.remove('group-drop-target');
              dropTarget = null;
            }

            if (dropGroupId) {
              const target = this.getLayerById(dropGroupId);
              if (target && target.isGroup) {
                if (this.app.pushHistory) this.app.pushHistory();
                target.groupCollapsed = false;
                const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
                const moveIds = selectedInUi.filter((id) => {
                  if (id === dropGroupId) return false;
                  const layer = map.get(id);
                  if (!layer) return false;
                  if (layer.isGroup && this.isDescendant(dropGroupId, layer.id)) return false;
                  return true;
                });
                const moveSet = new Set(moveIds);
                const remaining = this.app.engine.layers.filter((layer) => !moveSet.has(layer.id));
                moveIds.forEach((id) => {
                  const layer = map.get(id);
                  if (layer) layer.parentId = dropGroupId;
                });
                const insertIndex = remaining.findIndex((layer) => layer.id === dropGroupId);
                const engineInsert = insertIndex === -1 ? remaining.length : insertIndex;
                const moveEngineOrder = moveIds.slice().reverse().map((id) => map.get(id)).filter(Boolean);
                remaining.splice(engineInsert, 0, ...moveEngineOrder);
                this.app.engine.layers = remaining;
                this.normalizeGroupOrder();
                this.renderLayers();
                this.app.render();
                return;
              }
            }

            const nextOrder = currentOrder.filter((id) => !selectedSet.has(id));
            nextOrder.splice(newIndex, 0, ...selectedInUi);
            const nextEngineOrder = nextOrder.slice().reverse();
            const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
            this.app.engine.layers = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
            this.normalizeGroupOrder();
            this.renderLayers();
            this.app.render();
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
      };

      const renderGroupRow = (group, depth = 0) => {
        const el = document.createElement('div');
        const typeLabel = ALGO_DEFAULTS?.[group.groupType]?.label || group.groupType || 'Group';
        el.className =
          'layer-item layer-group flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2';
        el.dataset.layerId = group.id;
        const indent = depth * 12;
        if (indent) {
          el.style.marginLeft = `${indent}px`;
          el.style.width = `calc(100% - ${indent}px)`;
        }
        const isManualGroup = group.groupType === 'group';
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            ${gripMarkup}
            <button class="group-toggle" type="button" aria-label="Toggle group">${group.groupCollapsed ? '▸' : '▾'}</button>
            <span class="layer-name text-sm text-vectura-accent truncate">${group.name}</span>
            <input
              class="layer-name-input hidden w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none"
              type="text"
              value="${group.name}"
            />
            <span class="layer-badge text-[10px] text-vectura-muted uppercase tracking-widest">${typeLabel}</span>
          </div>
          <div class="flex items-center gap-1">
            ${isManualGroup
              ? `<div class="pen-assign">
                  <button class="pen-pill" type="button" aria-label="Assign pen">
                    <div class="pen-icon"></div>
                  </button>
                  <div class="pen-menu hidden"></div>
                </div>`
              : ''}
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete group">✕</button>
          </div>
        `;
        const toggle = el.querySelector('.group-toggle');
        const delBtn = el.querySelector('.btn-del');
        const penMenu = el.querySelector('.pen-menu');
        const penPill = el.querySelector('.pen-pill');
        const penIcon = el.querySelector('.pen-icon');
        const grip = el.querySelector('.layer-grip');
        const nameEl = el.querySelector('.layer-name');
        const nameInput = el.querySelector('.layer-name-input');
        if (toggle) {
          toggle.onclick = (e) => {
            e.stopPropagation();
            group.groupCollapsed = !group.groupCollapsed;
            this.renderLayers();
          };
        }
        const selectGroupChildren = (e, options = {}) => {
          const { skipList = false } = options;
          if (e && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
          }
          const children = groupMap.get(group.id) || [];
          const ids = children.map((child) => child.id);
          if (ids.length) {
            const primary = ids[ids.length - 1];
            if (this.app.renderer) this.app.renderer.setSelection(ids, primary);
            this.app.engine.activeLayerId = primary;
            this.lastLayerClickId = primary;
            if (!skipList) this.renderLayers();
            this.buildControls();
            this.updateFormula();
            this.app.render();
          }
        };
        el.onclick = (e) => {
          if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
          selectGroupChildren(e);
        };
        el.onmousedown = (e) => {
          if (e.target.closest('input')) return;
          e.preventDefault();
        };
        if (nameEl && nameInput) {
          let nameClickTimer = null;
          nameEl.onclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = window.setTimeout(() => {
              selectGroupChildren(e);
              nameClickTimer = null;
            }, 250);
          };
          nameEl.ondblclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = null;
            nameEl.classList.add('hidden');
            nameInput.classList.remove('hidden');
            nameInput.focus();
            nameInput.select();
          };
          nameInput.onblur = () => {
            const next = nameInput.value.trim();
            if (next && next !== group.name) {
              if (this.isDuplicateLayerName(next, group.id)) {
                this.showDuplicateNameError(next);
                nameInput.focus();
                nameInput.select();
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              group.name = next;
            }
            nameInput.value = group.name;
            nameInput.classList.add('hidden');
            nameEl.classList.remove('hidden');
            this.renderLayers();
          };
          nameInput.onkeydown = (e) => {
            if (e.key === 'Enter') nameInput.blur();
            if (e.key === 'Escape') {
              nameInput.value = group.name;
              nameInput.blur();
            }
          };
        }
        bindLayerReorderGrip(grip, el, {
          ensureSelection: (e) => selectGroupChildren(e, { skipList: true }),
          getSelectedIds: () => [group.id, ...collectDescendants(group.id)],
        });
        if (penMenu && penPill && penIcon) {
          const pens = SETTINGS.pens || [];
          const applyPen = (pen, options = {}) => {
            if (!pen) return;
            const { render = true } = options;
            group.penId = pen.id;
            group.color = pen.color;
            group.strokeWidth = pen.width;
            group.lineCap = group.lineCap || 'round';
            penIcon.style.background = pen.color;
            penIcon.style.color = pen.color;
            penIcon.style.setProperty('--pen-width', pen.width);
            penIcon.title = pen.name;
            const children = groupMap.get(group.id) || [];
            children.forEach((child) => {
              child.penId = pen.id;
              child.color = pen.color;
              child.strokeWidth = pen.width;
              child.lineCap = group.lineCap;
            });
            if (penMenu) {
              penMenu.querySelectorAll('.pen-option').forEach((opt) => {
                opt.classList.toggle('active', opt.dataset.penId === pen.id);
              });
            }
            if (render) {
              this.renderLayers();
              this.app.render();
            }
          };
          const current = pens.find((pen) => pen.id === group.penId) || pens[0];
          if (current) applyPen(current, { render: false });
          penMenu.innerHTML = pens
            .map(
              (pen) => `
                <button type="button" class="pen-option" data-pen-id="${pen.id}">
                  <span class="pen-icon" style="background:${pen.color}; color:${pen.color}; --pen-width:${pen.width}"></span>
                  <span class="pen-option-name">${pen.name}</span>
                </button>
              `
            )
            .join('');
          penMenu.querySelectorAll('.pen-option').forEach((opt) => {
            opt.onclick = (e) => {
              e.stopPropagation();
              if (this.app.pushHistory) this.app.pushHistory();
              const next = pens.find((pen) => pen.id === opt.dataset.penId);
              applyPen(next);
              penMenu.classList.add('hidden');
            };
          });
          penPill.onclick = (e) => {
            e.stopPropagation();
            if (this.openPenMenu && this.openPenMenu !== penMenu) {
              this.openPenMenu.classList.add('hidden');
            }
            penMenu.classList.toggle('hidden');
            this.openPenMenu = penMenu.classList.contains('hidden') ? null : penMenu;
          };
          el.ondragover = (ev) => {
            const types = Array.from(ev.dataTransfer?.types || []);
            if (!types.length || types.includes('text/pen-id') || types.includes('text/plain')) {
              ev.preventDefault();
              el.classList.add('dragging');
            }
          };
          el.ondragleave = () => el.classList.remove('dragging');
          el.ondrop = (ev) => {
            ev.preventDefault();
            el.classList.remove('dragging');
            const penId = ev.dataTransfer.getData('text/pen-id') || ev.dataTransfer.getData('text/plain');
            const next = pens.find((pen) => pen.id === penId);
            if (!next) return;
            if (this.app.pushHistory) this.app.pushHistory();
            applyPen(next);
            penMenu.classList.add('hidden');
          };
        }
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            this.app.engine.removeLayer(group.id);
            if (this.app.renderer) {
              const nextId = this.app.engine.activeLayerId;
              this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
            }
            this.renderLayers();
            this.app.render();
          };
        }
        container.appendChild(el);
      };

      const renderLayerRow = (l, opts = {}) => {
        const isChild = Boolean(opts.isChild);
        const depth = opts.depth ?? 0;
        const isActive = l.id === this.app.engine.activeLayerId;
        const isSelected = this.app.renderer?.selectedLayerIds?.has(l.id);
        const parentGroup = this.getGroupForLayer(l);
        const hidePen = parentGroup && parentGroup.groupType === 'group';
        const showExpand = !isChild && !l.isGroup;
        const expandMarkup = showExpand
          ? '<button class="text-sm text-vectura-muted hover:text-white px-1 btn-expand" aria-label="Expand layer">⇲</button>'
          : '';
        const moveMarkup = isChild
          ? ''
          : `
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-up" aria-label="Move layer up">▲</button>
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-down" aria-label="Move layer down">▼</button>
          `;
        const el = document.createElement('div');
        el.className = `layer-item ${isChild ? 'layer-sub' : ''} flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2 group cursor-pointer hover:bg-vectura-border ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
        el.dataset.layerId = l.id;
        const indent = depth * 12;
        if (indent) {
          el.style.marginLeft = `${indent}px`;
          el.style.width = `calc(100% - ${indent}px)`;
        }
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            ${gripMarkup}
            <input type="checkbox" ${l.visible ? 'checked' : ''} class="cursor-pointer" aria-label="Toggle layer visibility">
            <span class="layer-name text-sm truncate ${isActive ? 'text-white font-bold' : 'text-vectura-muted'}">${l.name}</span>
            <input
              class="layer-name-input hidden w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none"
              type="text"
              value="${l.name}"
            />
          </div>
          <div class="flex items-center gap-1">
            ${hidePen ? '' : `
              <div class="pen-assign">
                <button class="pen-pill" type="button" aria-label="Assign pen">
                  <div class="pen-icon"></div>
                </button>
                <div class="pen-menu hidden"></div>
              </div>
            `}
            ${expandMarkup}
            ${moveMarkup}
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-dup" aria-label="Duplicate layer">⧉</button>
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete layer">✕</button>
          </div>
        `;
        const nameEl = el.querySelector('.layer-name');
        const nameInput = el.querySelector('.layer-name-input');
        const visibilityEl = el.querySelector('input[type=checkbox]');
        const delBtn = el.querySelector('.btn-del');
        const upBtn = el.querySelector('.btn-up');
        const downBtn = el.querySelector('.btn-down');
        const dupBtn = el.querySelector('.btn-dup');
        const expandBtn = el.querySelector('.btn-expand');
        const grip = el.querySelector('.layer-grip');
        const penMenu = el.querySelector('.pen-menu');
        const penPill = el.querySelector('.pen-pill');
        const penIcon = el.querySelector('.pen-icon');

        const selectLayer = (e, options = {}) => {
          const { skipList = false } = options;
          if (e && e.shiftKey && this.lastLayerClickId && this.layerListOrder.length) {
            const list = this.layerListOrder;
            const start = list.indexOf(this.lastLayerClickId);
            const end = list.indexOf(l.id);
            if (start !== -1 && end !== -1) {
              const from = Math.min(start, end);
              const to = Math.max(start, end);
              const rangeIds = list.slice(from, to + 1);
              if (this.app.renderer) this.app.renderer.setSelection(rangeIds, l.id);
            } else {
              this.app.renderer.selectLayer(l);
            }
          } else if (e && (e.metaKey || e.ctrlKey)) {
            this.app.renderer.selectLayer(l, { toggle: true });
          } else {
            this.app.renderer.selectLayer(l);
          }
          this.app.engine.activeLayerId = this.app.renderer.selectedLayerId || l.id;
          this.lastLayerClickId = l.id;
          if (!skipList) this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
        };

        el.onclick = (e) => {
          if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
          selectLayer(e);
        };
        el.onmousedown = (e) => {
          if (e.target.closest('input')) return;
          e.preventDefault();
        };

        if (expandBtn) {
          expandBtn.onclick = (e) => {
            e.stopPropagation();
            this.expandLayer(l);
          };
        }

        if (nameEl && nameInput) {
          let nameClickTimer = null;
          nameEl.onclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = window.setTimeout(() => {
              selectLayer(e);
              nameClickTimer = null;
            }, 250);
          };
          nameEl.ondblclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = null;
            nameEl.classList.add('hidden');
            nameInput.classList.remove('hidden');
            nameInput.focus();
            nameInput.select();
          };
          nameInput.onblur = () => {
            const next = nameInput.value.trim();
            if (next && next !== l.name) {
              if (this.isDuplicateLayerName(next, l.id)) {
                this.showDuplicateNameError(next);
                nameInput.focus();
                nameInput.select();
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              l.name = next;
            }
            nameInput.value = l.name;
            nameInput.classList.add('hidden');
            nameEl.classList.remove('hidden');
            this.renderLayers();
          };
          nameInput.onkeydown = (e) => {
            if (e.key === 'Enter') nameInput.blur();
            if (e.key === 'Escape') {
              nameInput.value = l.name;
              nameInput.blur();
            }
          };
        }
        if (visibilityEl) {
          visibilityEl.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            l.visible = e.target.checked;
            this.app.render();
            this.app.updateStats();
          };
        }
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            this.app.engine.removeLayer(l.id);
            if (this.app.renderer) {
              const nextId = this.app.engine.activeLayerId;
              this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
            }
            this.renderLayers();
            this.app.render();
          };
        }
        if (upBtn && !isChild) {
          upBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            this.app.engine.moveLayer(l.id, 1);
            this.renderLayers();
            this.app.render();
          };
        }
        if (downBtn && !isChild) {
          downBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            this.app.engine.moveLayer(l.id, -1);
            this.renderLayers();
            this.app.render();
          };
        }
        if (dupBtn) {
          dupBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            const dup = this.app.engine.duplicateLayer(l.id);
            if (dup) {
              if (this.app.renderer) this.app.renderer.setSelection([dup.id], dup.id);
              this.renderLayers();
              this.app.render();
            }
          };
        }
        if (penMenu && penPill && penIcon) {
          const pens = SETTINGS.pens || [];
          const applyPen = (pen, targets = [l], options = {}) => {
            if (!pen) return;
            const { render = true } = options;
            targets.forEach((target) => {
              target.penId = pen.id;
              target.color = pen.color;
              target.strokeWidth = pen.width;
            });
            penIcon.style.background = pen.color;
            penIcon.style.color = pen.color;
            penIcon.style.setProperty('--pen-width', pen.width);
            penIcon.title = pen.name;
            if (penMenu) {
              penMenu.querySelectorAll('.pen-option').forEach((opt) => {
                opt.classList.toggle('active', opt.dataset.penId === pen.id);
              });
            }
            if (render) {
              this.renderLayers();
              this.app.render();
            }
          };
          const current = pens.find((pen) => pen.id === l.penId) || pens[0];
          if (current) applyPen(current, [l], { render: false });

          penMenu.innerHTML = pens
            .map(
              (pen) => `
                <button type="button" class="pen-option" data-pen-id="${pen.id}">
                  <span class="pen-icon" style="background:${pen.color}; color:${pen.color}; --pen-width:${pen.width}"></span>
                  <span class="pen-option-name">${pen.name}</span>
                </button>
              `
            )
            .join('');
          penMenu.querySelectorAll('.pen-option').forEach((opt) => {
            opt.onclick = (e) => {
              e.stopPropagation();
              if (this.app.pushHistory) this.app.pushHistory();
              const next = pens.find((pen) => pen.id === opt.dataset.penId);
              const selectedLayers = this.app.renderer?.selectedLayerIds?.has(l.id)
                ? this.app.renderer.getSelectedLayers()
                : [l];
              applyPen(next, selectedLayers);
              penMenu.classList.add('hidden');
            };
          });
          penPill.onclick = (e) => {
            e.stopPropagation();
            if (this.openPenMenu && this.openPenMenu !== penMenu) {
              this.openPenMenu.classList.add('hidden');
            }
            penMenu.classList.toggle('hidden');
            this.openPenMenu = penMenu.classList.contains('hidden') ? null : penMenu;
          };

          el.ondragover = (ev) => {
            const types = Array.from(ev.dataTransfer?.types || []);
            if (!types.length || types.includes('text/pen-id') || types.includes('text/plain')) {
              ev.preventDefault();
              el.classList.add('dragging');
            }
          };
          el.ondragleave = () => el.classList.remove('dragging');
          el.ondrop = (ev) => {
            ev.preventDefault();
            el.classList.remove('dragging');
            const penId = ev.dataTransfer.getData('text/pen-id') || ev.dataTransfer.getData('text/plain');
            const next = pens.find((pen) => pen.id === penId);
            if (!next) return;
            if (this.app.pushHistory) this.app.pushHistory();
            const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
            applyPen(next, selectedLayers.length ? selectedLayers : [l]);
            penMenu.classList.add('hidden');
          };
        }
        if (grip) {
          bindLayerReorderGrip(grip, el, {
            ensureSelection: (e) => {
              if (!this.app.renderer?.selectedLayerIds?.has(l.id)) {
                selectLayer(e, { skipList: true });
              }
            },
          });
        }
        container.appendChild(el);
        selectableIds.push(l.id);
      };

      const renderTree = (layer, depth = 0) => {
        if (layer.isGroup) {
          renderGroupRow(layer, depth);
          const children = groupMap.get(layer.id) || [];
          const showChildren = !layer.groupCollapsed;
          if (showChildren) {
            children.forEach((child) => renderTree(child, depth + 1));
          }
        } else {
          renderLayerRow(layer, { isChild: depth > 0, depth });
        }
      };

      layers.forEach((layer) => {
        if (layer.parentId && groupIds.has(layer.parentId)) return;
        renderTree(layer, 0);
      });

      orphans.forEach((layer) => renderTree(layer, 0));
      this.layerListOrder = selectableIds;
    }

    renderPens() {
      const container = getEl('pen-list');
      if (!container) return;
      container.innerHTML = '';
      const pens = SETTINGS.pens || [];

      pens.forEach((pen) => {
        const el = document.createElement('div');
        el.className = 'pen-item flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2';
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            <button class="pen-grip" type="button" aria-label="Reorder pen">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
            <div class="pen-icon"></div>
            <input
              class="pen-name-input w-full bg-transparent text-xs text-vectura-text focus:outline-none"
              value="${pen.name}"
            />
          </div>
          <div class="flex items-center gap-2">
            <div class="relative w-4 h-4 overflow-hidden rounded-full border border-vectura-border">
              <input type="color" class="pen-color" value="${pen.color}" aria-label="Pen color">
            </div>
            <input type="range" min="0.05" max="2" step="0.05" value="${pen.width}" class="pen-width">
            <span class="text-[10px] text-vectura-muted pen-width-value">${pen.width}</span>
            <button class="pen-remove" type="button" aria-label="Remove pen">✕</button>
          </div>
        `;
        const icon = el.querySelector('.pen-icon');
        const grip = el.querySelector('.pen-grip');
        const nameInput = el.querySelector('.pen-name-input');
        const colorInput = el.querySelector('.pen-color');
        const widthInput = el.querySelector('.pen-width');
        const widthValue = el.querySelector('.pen-width-value');
        const removeBtn = el.querySelector('.pen-remove');

        const applyIcon = () => {
          if (!icon) return;
          icon.style.background = pen.color;
          icon.style.color = pen.color;
          icon.style.setProperty('--pen-width', pen.width);
        };
        applyIcon();

        if (nameInput) {
          nameInput.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            pen.name = e.target.value.trim() || pen.name;
            this.renderLayers();
          };
        }

        if (colorInput) {
          colorInput.oninput = (e) => {
            pen.color = e.target.value;
            applyIcon();
            this.app.engine.layers.forEach((layer) => {
              if (layer.penId === pen.id) {
                layer.color = pen.color;
              }
            });
            this.app.render();
          };
        }

        if (widthInput && widthValue) {
          widthInput.oninput = (e) => {
            pen.width = parseFloat(e.target.value);
            widthValue.textContent = pen.width.toFixed(2);
            applyIcon();
            this.app.engine.layers.forEach((layer) => {
              if (layer.penId === pen.id) {
                layer.strokeWidth = pen.width;
              }
            });
            this.app.render();
          };
        }

        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removePen(pen.id);
          };
        }

        if (icon) {
          icon.draggable = true;
          icon.ondragstart = (e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/pen-id', pen.id);
            e.dataTransfer.setData('text/plain', pen.id);
          };
        }

        if (grip) {
          grip.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragEl = el;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'layer-drop-indicator';
            container.insertBefore(indicator, dragEl);
            const currentOrder = pens.map((p) => p.id);
            const startIndex = currentOrder.indexOf(pen.id);

            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(container.querySelectorAll('.pen-item')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  container.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) container.appendChild(indicator);
            };

            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(container.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('pen-item'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);

              if (newIndex !== startIndex) {
                const nextOrder = currentOrder.filter((id) => id !== pen.id);
                nextOrder.splice(newIndex, 0, pen.id);
                const map = new Map(pens.map((p) => [p.id, p]));
                SETTINGS.pens = nextOrder.map((id) => map.get(id)).filter(Boolean);
                this.renderPens();
                this.renderLayers();
              }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        }

        container.appendChild(el);
      });
    }

    expandLayer(layer) {
      if (!layer || layer.isGroup || layer.parentId) return;
      if (!Layer) return;
      if (this.app.pushHistory) this.app.pushHistory();
      if (!layer.paths || !layer.paths.length) {
        this.app.engine.generate(layer.id);
      }
      if (!layer.paths || !layer.paths.length) return;

      const groupId = layer.id;
      const baseName = layer.name;
      const pad = String(layer.paths.length).length;
      const pathMeta = layer.paths.map((path, index) => {
        let minX = Infinity;
        let minY = Infinity;
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const rx = path.meta.rx ?? path.meta.r ?? 0;
          const ry = path.meta.ry ?? path.meta.r ?? 0;
          minX = cx - rx;
          minY = cy - ry;
        } else if (Array.isArray(path)) {
          path.forEach((pt) => {
            if (!pt) return;
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
          });
        }
        if (!Number.isFinite(minX)) minX = 0;
        if (!Number.isFinite(minY)) minY = 0;
        return { path, index, minX, minY };
      });

      pathMeta.sort((a, b) => {
        if (a.minY !== b.minY) return a.minY - b.minY;
        if (a.minX !== b.minX) return a.minX - b.minX;
        return a.index - b.index;
      });

      const children = pathMeta.map((entry, index) => {
        const newId = Math.random().toString(36).substr(2, 9);
        const child = new Layer(newId, 'expanded', `${baseName} - Line ${String(index + 1).padStart(pad, '0')}`);
        child.parentId = groupId;
        child.params.seed = 0;
        child.params.posX = 0;
        child.params.posY = 0;
        child.params.scaleX = 1;
        child.params.scaleY = 1;
        child.params.rotation = 0;
        child.params.curves = Boolean(layer.params.curves);
        child.params.smoothing = 0;
        child.params.simplify = 0;
        child.sourcePaths = [clonePath(entry.path)];
        child.penId = layer.penId;
        child.color = layer.color;
        child.strokeWidth = layer.strokeWidth;
        child.lineCap = layer.lineCap;
        child.visible = layer.visible;
        return child;
      });

      layer.isGroup = true;
      layer.groupType = layer.type;
      layer.groupParams = clone(layer.params);
      layer.groupCollapsed = false;
      layer.type = 'group';
      layer.visible = false;
      layer.paths = [];
      layer.sourcePaths = null;
      layer.paramStates = {};

      const idx = this.app.engine.layers.findIndex((l) => l.id === groupId);
      const insertChildren = children.slice().reverse();
      if (idx >= 0) {
        this.app.engine.layers.splice(idx + 1, 0, ...insertChildren);
      } else {
        this.app.engine.layers.push(...insertChildren);
      }

      children.forEach((child) => this.app.engine.generate(child.id));
      const primary = children[0];
      if (primary) {
        this.app.engine.activeLayerId = primary.id;
        if (this.app.renderer) this.app.renderer.setSelection([primary.id], primary.id);
      }
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
    }

    openLayerSettings(layer) {
      const strokeValue = layer.strokeWidth ?? SETTINGS.strokeWidth;
      const capValue = layer.lineCap || 'round';
      const body = `
        <div class="modal-section">
          <div class="flex justify-between mb-2">
            <label class="control-label mb-0">Line Width (mm)</label>
            <span class="text-xs text-vectura-accent font-mono" id="layer-stroke-value">${strokeValue}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value="${strokeValue}"
            class="w-full"
            id="layer-stroke-input"
          />
        </div>
        <div class="modal-section">
          <label class="control-label">Line Cap</label>
          <select
            id="layer-cap-select"
            class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent"
          >
            <option value="round" ${capValue === 'round' ? 'selected' : ''}>Round</option>
            <option value="butt" ${capValue === 'butt' ? 'selected' : ''}>Flat</option>
            <option value="square" ${capValue === 'square' ? 'selected' : ''}>Square</option>
          </select>
        </div>
      `;

      this.openModal({
        title: `${layer.name} Settings`,
        body,
      });

      const bodyEl = this.modal.bodyEl;
      const strokeInput = bodyEl.querySelector('#layer-stroke-input');
      const strokeValueEl = bodyEl.querySelector('#layer-stroke-value');
      const capSelect = bodyEl.querySelector('#layer-cap-select');

      if (strokeInput && strokeValueEl) {
        strokeInput.oninput = (e) => {
          strokeValueEl.textContent = e.target.value;
        };
        strokeInput.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          layer.strokeWidth = parseFloat(e.target.value);
          this.app.render();
        };
      }
      if (capSelect) {
        capSelect.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          layer.lineCap = e.target.value;
          this.app.render();
        };
      }
    }

    loadNoiseImageFile(file, layer, nameEl, idKey = 'noiseImageId', nameKey = 'noiseImageName') {
      if (!file || !layer) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
          const id = `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          store[id] = { width: data.width, height: data.height, data: data.data };
          if (this.app.pushHistory) this.app.pushHistory();
          layer.params[idKey] = id;
          layer.params[nameKey] = file.name;
          if (nameEl) nameEl.textContent = file.name;
          this.app.regen();
          this.app.render();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    openNoiseImageModal(layer, options = {}) {
      const {
        nameEl,
        accept = 'image/*',
        idKey = 'noiseImageId',
        nameKey = 'noiseImageName',
        title = 'Select Noise Image',
        label = 'Noise Image',
        description = 'Drop an image here or browse to select a PNG/JPG for noise sampling.',
        dropLabel = 'Drop image here',
      } = options;
      const current = layer?.params?.[nameKey] || 'None selected';
      const body = `
        <div class="modal-section">
          <div class="modal-ill-label">${label}</div>
          <div class="modal-text text-xs text-vectura-muted mb-3">
            ${description}
          </div>
          <div id="noise-dropzone" class="noise-dropzone">${dropLabel}</div>
          <div class="flex items-center justify-between mt-3 gap-3">
            <label class="text-xs text-vectura-muted">Browse</label>
            <input id="noise-file-input" type="file" accept="${accept}" class="text-[10px] text-vectura-muted" />
          </div>
          <div class="text-[10px] text-vectura-muted mt-3">Current: ${current}</div>
        </div>
      `;
      this.openModal({ title, body });
      const bodyEl = this.modal.bodyEl;
      const dropzone = bodyEl.querySelector('#noise-dropzone');
      const fileInput = bodyEl.querySelector('#noise-file-input');
      const handleFile = (file) => {
        if (!file) return;
        this.loadNoiseImageFile(file, layer, nameEl, idKey, nameKey);
        this.closeModal();
      };
      if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('active');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('active');
          const file = e.dataTransfer?.files?.[0];
          handleFile(file);
        });
      }
      if (fileInput) {
        fileInput.onchange = () => {
          const file = fileInput.files?.[0];
          handleFile(file);
        };
      }
    }

    buildControls() {
      const container = getEl('dynamic-controls');
      if (!container) return;
      container.innerHTML = '';
      const layer = this.app.engine.getActiveLayer();
      if (!layer) return;

      const moduleSelect = getEl('generator-module');
      const seed = getEl('inp-seed');
      const posX = getEl('inp-pos-x');
      const posY = getEl('inp-pos-y');
      const scaleX = getEl('inp-scale-x');
      const scaleY = getEl('inp-scale-y');
      const rotation = getEl('inp-rotation');
      const isGroup = Boolean(layer.isGroup);
      const isStatic = Boolean(layer.parentId || layer.isGroup);
      if (moduleSelect) {
        Array.from(moduleSelect.options).forEach((opt) => {
          if (opt.dataset.temp === 'true') opt.remove();
        });
        const hasOption = Array.from(moduleSelect.options).some((opt) => opt.value === layer.type);
        if (!hasOption) {
          const opt = document.createElement('option');
          opt.value = layer.type;
          opt.dataset.temp = 'true';
          opt.innerText = ALGO_DEFAULTS?.[layer.type]?.label || layer.type;
          moduleSelect.appendChild(opt);
        }
        moduleSelect.value = layer.type;
        moduleSelect.disabled = isStatic;
        moduleSelect.classList.toggle('opacity-60', isStatic);
      }
      if (seed) seed.value = layer.params.seed;
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
      if (rotation) rotation.value = layer.params.rotation;
      this.toggleSeedControls(layer.type);

      const desc = getEl('algo-desc');
      if (desc) desc.innerText = DESCRIPTIONS[layer.type] || 'No description available.';
      if (moduleSelect) {
        const algoLabel = moduleSelect.parentElement?.querySelector('.control-label');
        const infoBtn = algoLabel?.querySelector('.info-btn');
        if (layer.type === 'phylla') {
          if (infoBtn) infoBtn.remove();
        } else if (algoLabel && !infoBtn) {
          this.attachInfoButton(algoLabel, 'global.algorithm');
        }
      }

      if (isGroup) {
        container.innerHTML = '<p class="text-xs text-vectura-muted">Select a sublayer to edit its parameters.</p>';
        return;
      }

      this.storeLayerParams(layer);

      const defs = [...(this.controls[layer.type] || []), ...COMMON_CONTROLS];
      if (!defs.length) return;

      const resetWrap = document.createElement('div');
      resetWrap.className = 'mb-4 grid grid-cols-2 gap-2';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className =
        'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
      resetBtn.textContent = 'Reset to Defaults';
      resetBtn.onclick = () => {
        if (this.app.pushHistory) this.app.pushHistory();
        const transform = this.getTransformSnapshot(layer.params);
        if (!layer.paramStates) layer.paramStates = {};
        delete layer.paramStates[layer.type];
        const base = ALGO_DEFAULTS[layer.type] ? clone(ALGO_DEFAULTS[layer.type]) : {};
        layer.params = { ...base, ...transform };
        this.storeLayerParams(layer);
        this.buildControls();
        this.app.regen();
        this.updateFormula();
      };
      const randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className =
        'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-muted transition-colors';
      randomBtn.textContent = 'Randomize Params';
      randomBtn.onclick = () => {
        const l = this.app.engine.getActiveLayer();
        if (!l) return;
        if (this.app.pushHistory) this.app.pushHistory();
        this.randomizeLayerParams(l);
        this.storeLayerParams(l);
        this.app.regen();
        this.recenterLayerIfNeeded(l);
        this.app.render();
        this.buildControls();
        this.updateFormula();
      };
      resetWrap.appendChild(resetBtn);
      resetWrap.appendChild(randomBtn);
      container.appendChild(resetWrap);

      const formatDisplayValue = (def, value) => {
        const displayVal = toDisplayValue(def, value);
        const { precision, unit } = getDisplayConfig(def);
        const factor = Math.pow(10, precision);
        const rounded = Math.round(displayVal * factor) / factor;
        return `${rounded}${unit}`;
      };

      const attachValueEditor = (opts) => {
        const { def, valueEl, inputEl, getValue, setValue } = opts;
        if (!valueEl || !inputEl) return;
        const { min, max, unit } = getDisplayConfig(def);
        const cleanup = () => {
          inputEl.classList.add('hidden');
          valueEl.classList.remove('hidden');
        };
        valueEl.onclick = (e) => {
          e.preventDefault();
          inputEl.value = formatDisplayValue(def, getValue()).replace(unit, '');
          valueEl.classList.add('hidden');
          inputEl.classList.remove('hidden');
          inputEl.focus();
          inputEl.select();
        };
        inputEl.onkeydown = (e) => {
          if (e.key === 'Enter') inputEl.blur();
          if (e.key === 'Escape') {
            cleanup();
          }
        };
        inputEl.onblur = () => {
          const raw = inputEl.value.trim().replace(unit, '');
          const parsed = Number.parseFloat(raw);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            this.showValueError(`${raw}${unit}`);
            cleanup();
            return;
          }
          setValue(parsed);
          cleanup();
        };
      };

      const angleGroups = new Map();
      const getAngleGroup = (key) => {
        if (!angleGroups.has(key)) {
          const row = document.createElement('div');
          row.className = 'angle-row';
          container.appendChild(row);
          angleGroups.set(key, row);
        }
        return angleGroups.get(key);
      };

      defs.forEach((def) => {
        if (def.showIf && !def.showIf(layer.params)) return;
        if (def.type === 'section') {
          const section = document.createElement('div');
          section.className = 'control-section';
          section.innerHTML = `<div class="control-section-title">${def.label}</div>`;
          container.appendChild(section);
          return;
        }
        if (def.type === 'image') {
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const div = document.createElement('div');
          div.className = 'mb-4';
          const idKey = def.idKey || `${def.id || 'image'}Id`;
          const nameKey = def.nameKey || `${def.id || 'image'}Name`;
          const name = layer.params[nameKey] || 'No file selected';
          div.innerHTML = `
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="text-[10px] text-vectura-muted hover:text-vectura-accent file-clear">Clear</button>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="noise-image-btn text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
                Select Image
              </button>
              <span class="text-[10px] text-vectura-muted file-name truncate">${name}</span>
            </div>
          `;
          const openBtn = div.querySelector('.noise-image-btn');
          const nameEl = div.querySelector('.file-name');
          const clearBtn = div.querySelector('.file-clear');
          if (clearBtn) {
            clearBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[idKey] = '';
              layer.params[nameKey] = '';
              if (nameEl) nameEl.textContent = 'No file selected';
              this.app.regen();
              this.app.render();
            };
          }
          if (openBtn) {
            openBtn.onclick = () =>
              this.openNoiseImageModal(layer, {
                nameEl,
                accept: def.accept,
                idKey,
                nameKey,
                title: def.modalTitle,
                label: def.modalLabel,
                description: def.modalDescription,
                dropLabel: def.dropLabel,
              });
          }
          container.appendChild(div);
          return;
        }
        let val = layer.params[def.id];
        const div = document.createElement('div');
        div.className = 'mb-4';
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const statsText = () => {
          const stats = layer.stats || {};
          const rawLines = stats.rawLines ?? layer.paths?.length ?? 0;
          const rawPoints = stats.rawPoints ?? 0;
          const simpLines = stats.simplifiedLines ?? rawLines;
          const simpPoints = stats.simplifiedPoints ?? rawPoints;
          return `Lines ${rawLines}→${simpLines} · Points ${rawPoints}→${simpPoints}`;
        };

        if (def.id === 'simplify') {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, val)}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full mb-2">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            <div class="text-[10px] text-vectura-muted simplify-stats">${statsText()}</div>
          `;
          const input = div.querySelector('input');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');
          const statsEl = div.querySelector('.simplify-stats');
          if (input && valueBtn && valueInput && statsEl) {
            input.oninput = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              layer.params[def.id] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            };
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal) => {
                if (this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                statsEl.textContent = statsText();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
              },
            });
          }
          container.appendChild(div);
          return;
        }

        if (def.type === 'angle') {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = clamp(toDisplayValue(def, val), min, max);
          div.innerHTML = `
            <div class="angle-label">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                def,
                val
              )}</button>
            </div>
            <div class="angle-control">
              <div class="angle-dial" style="--angle:${displayVal}deg;">
                <div class="angle-indicator"></div>
              </div>
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            </div>
          `;
          const dial = div.querySelector('.angle-dial');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');

          let lastDisplay = displayVal;
          const setAngle = (nextDisplay, commit = false) => {
            const clamped = clamp(roundToStep(nextDisplay, step), min, max);
            lastDisplay = clamped;
            if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
            if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
            if (commit) {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            }
          };

          if (dial) {
            const updateFromEvent = (e) => {
              const rect = dial.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const dx = e.clientX - cx;
              const dy = e.clientY - cy;
              let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
              if (deg < 0) deg += 360;
              setAngle(deg, false);
            };
            dial.addEventListener('mousedown', (e) => {
              e.preventDefault();
              updateFromEvent(e);
              const move = (ev) => updateFromEvent(ev);
              const up = () => {
                window.removeEventListener('mousemove', move);
                setAngle(lastDisplay, true);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up, { once: true });
            });
          }

          attachValueEditor({
            def,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => layer.params[def.id],
            setValue: (displayVal) => {
              setAngle(displayVal, true);
            },
          });
          const target = def.inlineGroup ? getAngleGroup(def.inlineGroup) : container;
          if (def.inlineGroup) div.classList.add('angle-item');
          target.appendChild(div);
          return;
        }

        if (def.type === 'checkbox') {
          const checked = Boolean(val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4">
          `;
          const input = div.querySelector('input');
          const span = div.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const next = Boolean(e.target.checked);
              span.innerText = next ? 'ON' : 'OFF';
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              if (def.id === 'curves') {
                this.app.render();
                this.updateFormula();
              } else {
                this.app.regen();
                this.updateFormula();
              }
            };
          }
        } else if (def.type === 'select') {
          if ((val === undefined || val === null) && def.options && def.options.length) {
            val = def.options[0].value;
            layer.params[def.id] = val;
          }
          const optionsHtml = def.options
            .map(
              (opt) =>
                `<option value="${opt.value}" ${val === opt.value ? 'selected' : ''}>${opt.label}</option>`
            )
            .join('');
          const currentLabel = def.options.find((opt) => opt.value === val)?.label || val;
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const input = div.querySelector('select');
          const span = div.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const next = e.target.value;
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
            };
          }
        } else if (def.type === 'rangeDual') {
          const minVal = layer.params[def.minKey];
          const maxVal = layer.params[def.maxKey];
          const { min: displayMin, max: displayMax, step: displayStep, unit } = getDisplayConfig(def);
          const displayMinVal = toDisplayValue(def, minVal);
          const displayMaxVal = toDisplayValue(def, maxVal);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, minVal)}-${formatDisplayValue(def, maxVal)}</button>
            </div>
            <div class="dual-range">
              <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMinVal}" data-handle="min">
              <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMaxVal}" data-handle="max">
            </div>
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const minInput = div.querySelector('input[data-handle="min"]');
          const maxInput = div.querySelector('input[data-handle="max"]');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');

          const syncValues = (changed) => {
            let min = parseFloat(minInput.value);
            let max = parseFloat(maxInput.value);
            if (min > max) {
              if (changed === 'min') max = min;
              else min = max;
            }
            min = clamp(min, displayMin, displayMax);
            max = clamp(max, displayMin, displayMax);
            minInput.value = min;
            maxInput.value = max;
            layer.params[def.minKey] = fromDisplayValue(def, min);
            layer.params[def.maxKey] = fromDisplayValue(def, max);
            if (valueBtn) {
              valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
                def,
                layer.params[def.maxKey]
              )}`;
            }
            const minOnTop = min >= max - displayStep;
            minInput.style.zIndex = minOnTop ? 2 : 1;
            maxInput.style.zIndex = minOnTop ? 1 : 2;
          };

          if (minInput && maxInput) {
            syncValues();
            minInput.oninput = () => syncValues('min');
            maxInput.oninput = () => syncValues('max');
            minInput.onchange = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              syncValues('min');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            maxInput.onchange = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              syncValues('max');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
          }
          if (valueBtn && valueInput) {
            valueBtn.onclick = (e) => {
              e.preventDefault();
              const currMin = toDisplayValue(def, layer.params[def.minKey]);
              const currMax = toDisplayValue(def, layer.params[def.maxKey]);
              valueInput.value = `${currMin}${unit}, ${currMax}${unit}`.replace(unit, '');
              valueBtn.classList.add('hidden');
              valueInput.classList.remove('hidden');
              valueInput.focus();
              valueInput.select();
            };
            valueInput.onkeydown = (e) => {
              if (e.key === 'Enter') valueInput.blur();
              if (e.key === 'Escape') {
                valueInput.classList.add('hidden');
                valueBtn.classList.remove('hidden');
              }
            };
            valueInput.onblur = () => {
              const raw = valueInput.value.replace(unit, '');
              const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
              if (parts.length !== 2) {
                this.showValueError(valueInput.value);
                valueInput.classList.add('hidden');
                valueBtn.classList.remove('hidden');
                return;
              }
              const minValParsed = Number.parseFloat(parts[0]);
              const maxValParsed = Number.parseFloat(parts[1]);
              if (
                !Number.isFinite(minValParsed) ||
                !Number.isFinite(maxValParsed) ||
                minValParsed < displayMin ||
                maxValParsed > displayMax ||
                minValParsed > maxValParsed
              ) {
                this.showValueError(valueInput.value);
                valueInput.classList.add('hidden');
                valueBtn.classList.remove('hidden');
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.minKey] = fromDisplayValue(def, minValParsed);
              layer.params[def.maxKey] = fromDisplayValue(def, maxValParsed);
              this.storeLayerParams(layer);
              this.app.regen();
              valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
                def,
                layer.params[def.maxKey]
              )}`;
              valueInput.classList.add('hidden');
              valueBtn.classList.remove('hidden');
              this.updateFormula();
            };
          }
        } else {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, val)}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = div.querySelector('input');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');
          if (input && valueBtn && valueInput) {
            const confirmHeavy = (displayVal) => {
              const nextVal = fromDisplayValue(def, displayVal);
              if (Number.isFinite(def.confirmAbove) && nextVal >= def.confirmAbove) {
                const message = def.confirmMessage || 'This value may be slow. Continue?';
                if (!window.confirm(message)) {
                  const resetVal = toDisplayValue(def, layer.params[def.id]);
                  input.value = resetVal;
                  valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                  return null;
                }
              }
              return nextVal;
            };
            input.oninput = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              const nextVal = confirmHeavy(nextDisplay);
              if (nextVal === null) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = nextVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal) => {
                const nextVal = confirmHeavy(displayVal);
                if (nextVal === null) return;
                if (this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = nextVal;
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
              },
            });
          }
        }
        container.appendChild(div);
      });
    }

    updateFormula() {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
      const formula = getEl('formula-display');
      const seedDisplay = getEl('formula-seed-display');
      if (formula) {
        const fmt = (val) => {
          if (typeof val === 'number') return Number.isFinite(val) ? val.toFixed(3) : `${val}`;
          if (typeof val === 'boolean') return val ? 'true' : 'false';
          if (val === null || val === undefined) return '';
          return `${val}`;
        };
        const entries = Object.entries(l.params || {}).map(([key, val]) => `${key} = ${fmt(val)}`);
        const valuesText = entries.length ? `Values:\\n${entries.join('\\n')}` : '';
        const formulaText = this.app.engine.getFormula(l.id);
        formula.innerText = valuesText ? `${formulaText}\\n\\n${valuesText}` : formulaText;
      }
      if (seedDisplay) {
        seedDisplay.style.display = usesSeed(l.type) ? '' : 'none';
        seedDisplay.innerText = `Seed: ${l.params.seed}`;
      }
    }

    exportSVG() {
      const prof = this.app.engine.currentProfile;
      const precision = Math.max(0, Math.min(6, SETTINGS.precision ?? 3));
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path
          .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
          .join('|');
      };
      const dedupe = optimize > 0 ? new Map() : null;
      let svg = `<?xml version="1.0" standalone="no"?><svg width="${prof.width}mm" height="${prof.height}mm" viewBox="0 0 ${prof.width} ${prof.height}" xmlns="http://www.w3.org/2000/svg">`;
      if (SETTINGS.truncate) {
        const m = SETTINGS.margin;
        const w = prof.width - m * 2;
        const h = prof.height - m * 2;
        svg += `<defs><clipPath id="margin-clip"><rect x="${m}" y="${m}" width="${w}" height="${h}" /></clipPath></defs>`;
        svg += `<g clip-path="url(#margin-clip)">`;
      }
      const penMap = new Map((SETTINGS.pens || []).map((pen) => [pen.id, pen]));
      const fallbackPen = {
        id: 'default',
        name: 'Default',
        color: '#000000',
        width: SETTINGS.strokeWidth ?? 0.3,
      };
      const groups = new Map();
      const order = [];
      this.app.engine.layers.forEach((l) => {
        if (!l.visible || l.isGroup) return;
        const pen = penMap.get(l.penId) || fallbackPen;
        const key = pen.id || fallbackPen.id;
        if (!groups.has(key)) {
          groups.set(key, { pen, layers: [] });
          order.push(key);
        }
        groups.get(key).layers.push(l);
      });

      order.forEach((key) => {
        const group = groups.get(key);
        if (!group) return;
        const pen = group.pen || fallbackPen;
        const penName = (pen.name || pen.id || 'Pen').replace(/\s/g, '_');
        svg += `<g id="pen_${penName}" stroke="${pen.color || 'black'}" fill="none">`;
        let seen = null;
        if (dedupe) {
          if (!dedupe.has(key)) dedupe.set(key, new Set());
          seen = dedupe.get(key);
        }
        group.layers.forEach((l) => {
          const strokeWidth = (l.strokeWidth ?? pen.width ?? SETTINGS.strokeWidth).toFixed(3);
          const lineCap = l.lineCap || 'round';
          const useCurves = Boolean(l.params && l.params.curves);
          svg += `<g id="${l.name.replace(/\s/g, '_')}" stroke-width="${strokeWidth}" stroke-linecap="${lineCap}" stroke-linejoin="round">`;
          l.paths.forEach((p) => {
            if (seen) {
              const key = pathKey(p);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
            }
            const markup = shapeToSvg(p, precision, useCurves);
            if (markup) svg += markup;
          });
          svg += `</g>`;
        });
        svg += `</g>`;
      });
      if (SETTINGS.truncate) {
        svg += `</g>`;
      }
      svg += `</svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vectura.svg';
      a.click();
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.UI = UI;
})();
