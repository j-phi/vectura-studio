/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const {
    ALGO_DEFAULTS,
    SETTINGS,
    DESCRIPTIONS,
    MACHINES,
    Algorithms,
    SeededRNG,
    SimpleNoise,
    Layer,
    PALETTES,
    PRESETS,
    PETALIS_PRESETS,
    RandomizationUtils,
  } = window.Vectura || {};

  const PETALIS_PRESET_LIBRARY = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(PETALIS_PRESETS) ? PETALIS_PRESETS : [])
    .filter((preset) => {
      const system = preset?.preset_system || 'petalisDesigner';
      return system === 'petalisDesigner';
    });
  const PETALIS_LAYER_TYPES = new Set(['petalisDesigner']);
  const isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type);

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
  const lerp = (a, b, t) => a + (b - a) * t;

  const segmentIntersection = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-9) return null;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  };

  const segmentCircleIntersections = (a, b, center, radius) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    const sqrt = Math.sqrt(disc);
    const t1 = (-B - sqrt) / (2 * A);
    const t2 = (-B + sqrt) / (2 * A);
    return [t1, t2].filter((t) => t >= 0 && t <= 1);
  };

  const splitPathByShape = (path, shape) => {
    if (!Array.isArray(path) || path.length < 2) return null;
    const output = [];
    let current = [path[0]];
    let hit = false;
    const addSegment = () => {
      if (current.length > 1) output.push(current);
      current = [];
    };

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      let ts = [];
      if (shape.mode === 'line' && shape.line) {
        const t = segmentIntersection(a, b, shape.line.a, shape.line.b);
        if (t !== null) ts.push(t);
      } else if (shape.mode === 'rect' && shape.rect) {
        const { x, y, w, h } = shape.rect;
        const r1 = { x, y };
        const r2 = { x: x + w, y };
        const r3 = { x: x + w, y: y + h };
        const r4 = { x, y: y + h };
        [segmentIntersection(a, b, r1, r2),
          segmentIntersection(a, b, r2, r3),
          segmentIntersection(a, b, r3, r4),
          segmentIntersection(a, b, r4, r1),
        ].forEach((t) => {
          if (t !== null) ts.push(t);
        });
      } else if (shape.mode === 'circle' && shape.circle) {
        ts = segmentCircleIntersections(a, b, shape.circle, shape.circle.r);
      }

      ts = ts.filter((t) => t > 1e-4 && t < 1 - 1e-4).sort((t1, t2) => t1 - t2);
      if (!ts.length) {
        if (!current.length) current.push(a);
        current.push(b);
        continue;
      }

      hit = true;
      let lastPoint = a;
      if (!current.length) current.push(lastPoint);
      ts.forEach((t) => {
        const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        current.push(pt);
        addSegment();
        current.push(pt);
        lastPoint = pt;
      });
      current.push(b);
    }

    if (current.length > 1) output.push(current);
    if (!hit) return null;
    return output;
  };

  const expandCirclePath = (meta, segments = 80) => {
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const r = meta.r ?? meta.rx ?? 0;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
    return pts;
  };

  const sampleQuadratic = (p0, c, p1, segments = 10) => {
    const pts = [];
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      pts.push({
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
      });
    }
    return pts;
  };

  const resampleCurvedPath = (path) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const newPath = [path[0]];
    let current = path[0];
    for (let i = 1; i < path.length - 1; i++) {
      const ctrl = path[i];
      const next = path[i + 1];
      const end = { x: (ctrl.x + next.x) / 2, y: (ctrl.y + next.y) / 2 };
      const pts = sampleQuadratic(current, ctrl, end, 8);
      pts.forEach((p) => newPath.push(p));
      current = end;
    }
    newPath.push(path[path.length - 1]);
    if (path.meta) newPath.meta = path.meta;
    return newPath;
  };

  const clipPathToRect = (path, rect) => {
    const segments = splitPathByShape(path, { mode: 'rect', rect });
    if (!segments) {
      const pt = path[0];
      if (pt && pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h) {
        return [path];
      }
      return [];
    }
    return segments.filter((seg) => {
      if (!seg.length) return false;
      const first = seg[0];
      const last = seg[seg.length - 1];
      const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      return (
        mid.x >= rect.x - 1e-4 &&
        mid.x <= rect.x + rect.w + 1e-4 &&
        mid.y >= rect.y - 1e-4 &&
        mid.y <= rect.y + rect.h + 1e-4
      );
    });
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

  const OPTIMIZATION_STEPS = [
    {
      id: 'linesimplify',
      label: 'Line Simplify',
      controls: [
        { key: 'tolerance', label: 'Tolerance (mm)', type: 'range', min: 0, max: 2, step: 0.05 },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: [
            { value: 'polyline', label: 'Polyline' },
            { value: 'curve', label: 'Curve' },
          ],
        },
      ],
    },
    {
      id: 'linesort',
      label: 'Line Sort',
      controls: [
        {
          key: 'method',
          label: 'Method',
          type: 'select',
          options: [
            { value: 'nearest', label: 'Nearest' },
            { value: 'greedy', label: 'Greedy' },
            { value: 'angle', label: 'Angle' },
          ],
        },
        {
          key: 'direction',
          label: 'Direction',
          type: 'select',
          options: [
            { value: 'none', label: 'None' },
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
            { value: 'radial', label: 'Radial' },
          ],
        },
        {
          key: 'grouping',
          label: 'Grouping',
          type: 'select',
          options: [
            { value: 'layer', label: 'Per Layer' },
            { value: 'pen', label: 'Per Pen' },
            { value: 'combined', label: 'Combined' },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'Filter',
      controls: [
        { key: 'minLength', label: 'Min Length (mm)', type: 'range', min: 0, max: 20, step: 0.2 },
        { key: 'maxLength', label: 'Max Length (mm)', type: 'range', min: 0, max: 80, step: 0.5 },
        { key: 'removeTiny', label: 'Remove Tiny', type: 'checkbox' },
      ],
    },
    {
      id: 'multipass',
      label: 'Multipass',
      controls: [
        { key: 'passes', label: 'Passes', type: 'range', min: 1, max: 6, step: 1 },
        { key: 'offset', label: 'Offset (mm)', type: 'range', min: 0, max: 2, step: 0.05 },
        { key: 'jitter', label: 'Jitter (mm)', type: 'range', min: 0, max: 1, step: 0.05 },
        { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1 },
      ],
    },
  ];

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
  ];

  const PETALIS_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(PETALIS_PRESET_LIBRARY)
      ? PETALIS_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const PETAL_PROFILE_OPTIONS = [
    { value: 'oval', label: 'Oval' },
    { value: 'teardrop', label: 'Teardrop' },
    { value: 'lanceolate', label: 'Lanceolate' },
    { value: 'heart', label: 'Heart' },
    { value: 'spoon', label: 'Spoon' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'notched', label: 'Notched' },
    { value: 'spatulate', label: 'Spatulate' },
    { value: 'marquise', label: 'Marquise' },
    { value: 'dagger', label: 'Dagger' },
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
        { key: 'scale', label: 'Noise Scale', type: 'range', min: 0.05, max: 1.0, step: 0.05, infoKey: 'petalis.centerModNoiseScale' },
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
    id: `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    type,
    amount: 2,
    frequency: 6,
    scale: 0.2,
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
        { key: 'scale', label: 'Noise Scale', type: 'range', min: 0.05, max: 1.0, step: 0.05, infoKey: 'petalis.petalModNoiseScale' },
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
    id: `petal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    type,
    target: 'both',
    amount: 1.5,
    frequency: 8,
    scale: 0.2,
    offsetX: 0,
    offsetY: 0,
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
  ];

  const PETALIS_LINE_TYPES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'stitch', label: 'Stitch' },
  ];

  const AUTO_COLOR_COMMON_PARAMS = [
    { id: 'penOffset', label: 'Pen Offset', type: 'range', min: -12, max: 12, step: 1 },
    { id: 'penStride', label: 'Pen Stride', type: 'range', min: 1, max: 8, step: 1 },
    { id: 'penMirror', label: 'Mirror Pen Order', type: 'checkbox' },
    { id: 'penJitter', label: 'Pen Jitter', type: 'range', min: 0, max: 1, step: 0.05 },
  ];

  const AUTO_COLOR_MODES = [
    {
      value: 'none',
      label: 'None (First Pen)',
      params: [],
    },
    {
      value: 'concentric',
      label: 'Concentric Rings',
      params: [
        { id: 'radiusStart', label: 'Inner Radius (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'radiusEnd', label: 'Outer Radius (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Width (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
        { id: 'bandGrowth', label: 'Band Growth', type: 'range', min: -1, max: 1, step: 0.05 },
      ],
    },
    {
      value: 'horizontal',
      label: 'Horizontal Bands',
      params: [
        { id: 'bandStart', label: 'Start Y (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandEnd', label: 'End Y (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Height (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
      ],
    },
    {
      value: 'vertical',
      label: 'Vertical Bands',
      params: [
        { id: 'bandStart', label: 'Start X (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandEnd', label: 'End X (%)', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'bandSize', label: 'Band Width (mm)', type: 'range', min: 1, max: 200, step: 1 },
        { id: 'bandOffset', label: 'Band Offset (mm)', type: 'range', min: -200, max: 200, step: 1 },
      ],
    },
    {
      value: 'spiral',
      label: 'Spiral Sweep',
      params: [
        { id: 'angleOffset', label: 'Angle Offset (°)', type: 'range', min: -180, max: 180, step: 1 },
        { id: 'spiralTurns', label: 'Spiral Turns', type: 'range', min: 0.2, max: 4, step: 0.1 },
      ],
    },
    {
      value: 'angle',
      label: 'Angle Slice',
      params: [
        { id: 'angleOffset', label: 'Angle Offset (°)', type: 'range', min: -180, max: 180, step: 1 },
        { id: 'angleSpan', label: 'Angle Span (°)', type: 'range', min: 30, max: 360, step: 5 },
      ],
    },
    {
      value: 'size',
      label: 'Size-Based',
      params: [
        { id: 'sizeCurve', label: 'Size Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05 },
        { id: 'sizeInvert', label: 'Invert', type: 'checkbox' },
      ],
    },
    {
      value: 'random',
      label: 'Random (Seeded)',
      params: [{ id: 'randomSeed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1 }],
    },
    {
      value: 'order',
      label: 'Layer Order',
      params: [],
    },
    {
      value: 'reverse',
      label: 'Reverse Order',
      params: [],
    },
    {
      value: 'algorithm',
      label: 'Algorithm Type',
      params: [],
    },
  ].map((mode) => ({
    ...mode,
    params: [...(mode.params || []), ...AUTO_COLOR_COMMON_PARAMS],
  }));

  const createPetalisShading = (type = 'radial') => ({
    id: `shade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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
        id: 'widthMultiplier',
        label: 'Line Thickness',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'harmonograph.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'harmonograph.thickeningMode',
      },
      {
        id: 'loopDrift',
        label: 'Anti-Loop Drift',
        type: 'range',
        min: 0,
        max: 0.08,
        step: 0.0005,
        infoKey: 'harmonograph.loopDrift',
      },
      {
        id: 'settleThreshold',
        label: 'Settle Cutoff',
        type: 'range',
        min: 0,
        max: 40,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.settleThreshold',
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
      {
        id: 'gapSize',
        label: 'Gap Size',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapSize',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapOffset',
        label: 'Gap Offset',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapOffset',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapRandomness',
        label: 'Spacing Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'harmonograph.gapRandomness',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      { type: 'pendulumList' },
      { type: 'harmonographPlotter' },
      { type: 'section', label: 'Pendulum Guides' },
      {
        id: 'showPendulumGuides',
        label: 'Show Guides',
        type: 'checkbox',
        infoKey: 'harmonograph.showPendulumGuides',
      },
      {
        id: 'pendulumGuideColor',
        label: 'Guide Color',
        type: 'colorModal',
        infoKey: 'harmonograph.pendulumGuideColor',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
      {
        id: 'pendulumGuideWidth',
        label: 'Guide Thickness (mm)',
        type: 'range',
        min: 0.05,
        max: 2,
        step: 0.05,
        displayUnit: 'mm',
        infoKey: 'harmonograph.pendulumGuideWidth',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
    ],
    petalis: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Preset',
        type: 'select',
        options: PETALIS_PRESET_OPTIONS,
        infoKey: 'petalis.preset',
      },
      { type: 'section', label: 'Petal Geometry' },
      {
        id: 'petalProfile',
        label: 'Petal Profile',
        type: 'select',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.petalProfile',
      },
      { id: 'petalScale', label: 'Petal Scale (mm)', type: 'range', min: 1, max: 80, step: 1, infoKey: 'petalis.petalScale' },
      {
        id: 'petalWidthRatio',
        label: 'Width/Length Ratio',
        type: 'range',
        min: 0.01,
        max: 2,
        step: 0.01,
        infoKey: 'petalis.petalWidthRatio',
      },
      { id: 'petalLengthRatio', label: 'Length Ratio', type: 'range', min: 0.1, max: 5, step: 0.05, infoKey: 'petalis.petalLengthRatio' },
      { id: 'petalSizeRatio', label: 'Size Ratio', type: 'range', min: 0.01, max: 5, step: 0.05, infoKey: 'petalis.petalSizeRatio' },
      { id: 'leafSidePos', label: 'Side Position', type: 'range', min: 0.1, max: 0.9, step: 0.01, infoKey: 'petalis.leafSidePos' },
      { id: 'leafSideWidth', label: 'Side Width', type: 'range', min: 0.2, max: 2, step: 0.01, infoKey: 'petalis.leafSideWidth' },
      { id: 'petalSteps', label: 'Petal Resolution', type: 'range', min: 12, max: 80, step: 2, infoKey: 'petalis.petalSteps' },
      { id: 'layering', label: 'Layering', type: 'checkbox', infoKey: 'petalis.layering' },
      {
        id: 'anchorToCenter',
        label: 'Anchor to Center Ring',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'central', label: 'Central Petals Only' },
          { value: 'all', label: 'All Petals' },
        ],
        infoKey: 'petalis.anchorToCenter',
      },
      {
        id: 'anchorRadiusRatio',
        label: 'Anchor Radius Ratio',
        type: 'range',
        min: 0.2,
        max: 3,
        step: 0.05,
        showIf: (p) => p.anchorToCenter && p.anchorToCenter !== 'off',
        infoKey: 'petalis.anchorRadiusRatio',
      },
      { id: 'tipSharpness', label: 'Tip Sharpness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipSharpness' },
      { id: 'tipTwist', label: 'Tip Rotate', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.tipTwist' },
      { id: 'centerCurlBoost', label: 'Center Tip Rotate Boost', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.centerCurlBoost' },
      { id: 'tipCurl', label: 'Tip Rounding', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipCurl' },
      { id: 'baseFlare', label: 'Base Flare', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.baseFlare' },
      { id: 'basePinch', label: 'Base Pinch', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.basePinch' },
      { id: 'edgeWaveAmp', label: 'Edge Wave Amp', type: 'range', min: 0, max: 0.6, step: 0.01, infoKey: 'petalis.edgeWaveAmp' },
      { id: 'edgeWaveFreq', label: 'Edge Wave Freq', type: 'range', min: 0, max: 14, step: 0.5, infoKey: 'petalis.edgeWaveFreq' },
      { id: 'centerWaveBoost', label: 'Center Wave Boost', type: 'range', min: 0, max: 2, step: 0.05, infoKey: 'petalis.centerWaveBoost' },
      { type: 'section', label: 'Petal Modifiers' },
      { type: 'petalModifierList', label: 'Petal Modifiers' },
      { type: 'section', label: 'Distribution & Spiral' },
      { id: 'count', label: 'Petal Count', type: 'range', min: 5, max: 800, step: 1, infoKey: 'petalis.count' },
      {
        id: 'ringMode',
        label: 'Ring Mode',
        type: 'select',
        options: [
          { value: 'single', label: 'Single' },
          { value: 'dual', label: 'Dual' },
        ],
        infoKey: 'petalis.ringMode',
      },
      {
        id: 'innerCount',
        label: 'Inner Petal Count',
        type: 'range',
        min: 5,
        max: 400,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.innerCount',
      },
      {
        id: 'outerCount',
        label: 'Outer Petal Count',
        type: 'range',
        min: 5,
        max: 600,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.outerCount',
      },
      {
        id: 'ringSplit',
        label: 'Ring Split',
        type: 'range',
        min: 0.15,
        max: 0.85,
        step: 0.01,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringSplit',
      },
      {
        id: 'innerOuterLock',
        label: 'Inner = Outer',
        type: 'checkbox',
        infoKey: 'petalis.innerOuterLock',
      },
      {
        id: 'profileTransitionPosition',
        label: 'Profile Transition Position (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionPosition',
      },
      {
        id: 'profileTransitionFeather',
        label: 'Profile Transition Feather (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionFeather',
      },
      {
        id: 'ringOffset',
        label: 'Ring Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringOffset',
      },
      {
        id: 'spiralMode',
        label: 'Phyllotaxis Mode',
        type: 'select',
        options: [
          { value: 'golden', label: 'Golden Angle' },
          { value: 'custom', label: 'Custom Angle' },
        ],
        infoKey: 'petalis.spiralMode',
      },
      {
        id: 'customAngle',
        label: 'Custom Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => p.spiralMode === 'custom',
        infoKey: 'petalis.customAngle',
      },
      { id: 'spiralTightness', label: 'Spiral Tightness', type: 'range', min: 0.5, max: 50, step: 0.1, infoKey: 'petalis.spiralTightness' },
      { id: 'radialGrowth', label: 'Radial Growth', type: 'range', min: 0.05, max: 20, step: 0.05, infoKey: 'petalis.radialGrowth' },
      { id: 'spiralStart', label: 'Spiral Start', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'petalis.spiralStart' },
      { id: 'spiralEnd', label: 'Spiral End', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'petalis.spiralEnd' },
      { type: 'section', label: 'Center Morphing' },
      { id: 'centerSizeMorph', label: 'Size Morph', type: 'range', min: -100, max: 100, step: 1, infoKey: 'petalis.centerSizeMorph' },
      { id: 'centerSizeCurve', label: 'Size Morph Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.centerSizeCurve' },
      { id: 'centerShapeMorph', label: 'Shape Morph', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerShapeMorph' },
      {
        id: 'centerProfile',
        label: 'Center Profile',
        type: 'select',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.centerProfile',
      },
      { id: 'budMode', label: 'Bud Mode', type: 'checkbox', infoKey: 'petalis.budMode' },
      { id: 'budRadius', label: 'Bud Radius', type: 'range', min: 0.05, max: 2, step: 0.01, showIf: (p) => p.budMode, infoKey: 'petalis.budRadius' },
      { id: 'budTightness', label: 'Bud Tightness', type: 'range', min: 0, max: 10, step: 0.1, showIf: (p) => p.budMode, infoKey: 'petalis.budTightness' },
      { type: 'section', label: 'Central Elements' },
      {
        id: 'centerType',
        label: 'Center Type',
        type: 'select',
        options: [
          { value: 'disk', label: 'Disk' },
          { value: 'dome', label: 'Dome' },
          { value: 'starburst', label: 'Starburst' },
          { value: 'dot', label: 'Dot Field' },
          { value: 'filament', label: 'Filament Cluster' },
        ],
        infoKey: 'petalis.centerType',
      },
      { id: 'centerRadius', label: 'Center Radius (mm)', type: 'range', min: 2, max: 40, step: 1, infoKey: 'petalis.centerRadius' },
      { id: 'centerDensity', label: 'Center Density', type: 'range', min: 4, max: 120, step: 1, infoKey: 'petalis.centerDensity' },
      { id: 'centerFalloff', label: 'Center Falloff', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerFalloff' },
      { id: 'centerRing', label: 'Secondary Ring', type: 'checkbox', infoKey: 'petalis.centerRing' },
      { id: 'centerRingRadius', label: 'Ring Radius (mm)', type: 'range', min: 3, max: 60, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingRadius' },
      { id: 'centerRingDensity', label: 'Ring Density', type: 'range', min: 6, max: 120, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingDensity' },
      { id: 'centerConnectors', label: 'Connect to Petals', type: 'checkbox', infoKey: 'petalis.centerConnectors' },
      { id: 'connectorCount', label: 'Connector Count', type: 'range', min: 4, max: 120, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorCount' },
      { id: 'connectorLength', label: 'Connector Length (mm)', type: 'range', min: 2, max: 40, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorLength' },
      { id: 'connectorJitter', label: 'Connector Jitter', type: 'range', min: 0, max: 1, step: 0.05, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorJitter' },
      { type: 'modifierList', label: 'Center Modifiers' },
      { type: 'section', label: 'Randomness & Seed' },
      { id: 'countJitter', label: 'Count Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.countJitter' },
      { id: 'sizeJitter', label: 'Size Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.sizeJitter' },
      {
        id: 'rotationJitter',
        label: 'Rotation Jitter',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.rotationJitter',
      },
      {
        id: 'angularDrift',
        label: 'Angular Drift',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.angularDrift',
      },
      { id: 'driftStrength', label: 'Drift Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.driftStrength' },
      { id: 'driftNoise', label: 'Drift Noise', type: 'range', min: 0.05, max: 1, step: 0.05, infoKey: 'petalis.driftNoise' },
      { id: 'radiusScale', label: 'Radius Scale', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.radiusScale' },
      { id: 'radiusScaleCurve', label: 'Radius Scale Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.radiusScaleCurve' },
    ],
    wavetable: [
      { id: 'lines', label: 'Lines', type: 'range', min: 5, max: 160, step: 1, infoKey: 'wavetable.lines' },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'tilt', label: 'Row Shift', type: 'range', min: -12, max: 12, step: 1, infoKey: 'wavetable.tilt' },
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
      { type: 'noiseList' },
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
      { id: 'count', label: 'Drop Count', type: 'range', min: 20, max: 2000, step: 10, infoKey: 'rainfall.count' },
      { id: 'traceLength', label: 'Trace Length', type: 'range', min: 20, max: 400, step: 5, infoKey: 'rainfall.traceLength' },
      {
        id: 'lengthJitter',
        label: 'Length Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.lengthJitter',
      },
      { id: 'traceStep', label: 'Trace Step', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rainfall.traceStep' },
      {
        id: 'stepJitter',
        label: 'Step Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.stepJitter',
      },
      { id: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.turbulence' },
      {
        id: 'gustStrength',
        label: 'Gust Strength',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.gustStrength',
      },
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
        id: 'angleJitter',
        label: 'Angle Jitter',
        type: 'range',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'rainfall.angleJitter',
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
        id: 'dropSizeJitter',
        label: 'Drop Size Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.dropSizeJitter',
        showIf: (p) => p.dropShape !== 'none',
      },
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
        min: 0.1,
        max: 12.0,
        step: 0.1,
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
          { value: 'drop', label: 'Drop' },
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
      { type: 'section', label: 'Noise Stack' },
      {
        id: 'noiseApply',
        label: 'Noise Target',
        type: 'select',
        options: [
          { value: 'trails', label: 'Trails' },
          { value: 'droplets', label: 'Droplets' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'rainfall.noiseApply',
      },
      { type: 'noiseList' },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 150, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Points / Quadrant', type: 'range', min: 4, max: 120, step: 2, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 60, step: 1, infoKey: 'spiral.startR' },
      { type: 'noiseList' },
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
        max: 200,
        step: 0.5,
        minKey: 'minR',
        maxKey: 'maxR',
        displayUnit: 'mm',
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

  const PETALIS_DESIGNER_REMOVED_CONTROL_IDS = new Set([
    'petalProfile',
    'tipSharpness',
    'tipTwist',
    'centerCurlBoost',
    'tipCurl',
    'baseFlare',
    'basePinch',
    'count',
    'ringMode',
    'innerCount',
    'outerCount',
    'ringSplit',
    'innerOuterLock',
    'profileTransitionPosition',
    'profileTransitionFeather',
    'petalLengthRatio',
    'petalSizeRatio',
    'leafSidePos',
    'leafSideWidth',
    'edgeWaveAmp',
    'edgeWaveFreq',
    'centerWaveBoost',
    'centerSizeMorph',
    'centerSizeCurve',
    'centerShapeMorph',
    'centerProfile',
    'countJitter',
    'sizeJitter',
    'rotationJitter',
    'angularDrift',
    'driftStrength',
    'driftNoise',
    'radiusScale',
    'radiusScaleCurve',
  ]);
  const PETALIS_DESIGNER_REMOVED_SECTION_LABELS = new Set([
    'Petal Modifiers',
    'Center Morphing',
    'Randomness & Seed',
  ]);
  const PETALIS_DESIGNER_REMOVED_CONTROL_TYPES = new Set(['petalModifierList']);
  const petalisDesignerControls = [
    { type: 'section', label: 'Petal Designer' },
    { type: 'petalDesignerInline' },
    ...(CONTROL_DEFS.petalis || [])
      .map((def) => (def && typeof def === 'object' ? { ...def } : def))
      .filter((def) => {
        if (!def || typeof def !== 'object') return true;
        if (def.id && PETALIS_DESIGNER_REMOVED_CONTROL_IDS.has(def.id)) return false;
        if (PETALIS_DESIGNER_REMOVED_CONTROL_TYPES.has(def.type)) return false;
        if (def.type === 'section' && PETALIS_DESIGNER_REMOVED_SECTION_LABELS.has(def.label)) return false;
        return true;
      }),
  ];
  CONTROL_DEFS.petalisDesigner = petalisDesignerControls;

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
      title: 'Crop Art to Margins',
      description: 'Clips strokes to stay inside the margin boundary.',
    },
    'global.cropExports': {
      title: 'Crop Exports to Margin',
      description: 'Physically clips paths at the margin boundary during SVG export (recommended for plotters).',
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
    'global.cookiePreferences': {
      title: 'Cookie Preferences',
      description: 'Stores UI preferences in a browser cookie so they persist between visits.',
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
    'harmonograph.gapSize': {
      title: 'Gap Size',
      description: 'Adds extra spacing between dashes, points, or segments.',
    },
    'harmonograph.gapOffset': {
      title: 'Gap Offset',
      description: 'Shifts the spacing pattern forward along the path.',
    },
    'harmonograph.gapRandomness': {
      title: 'Spacing Randomness',
      description: 'Randomizes the spacing between elements (0 = none, 1 = maximum).',
    },
    'harmonograph.widthMultiplier': {
      title: 'Line Thickness',
      description: 'Stacks multiple parallel strokes to build thicker lines.',
    },
    'harmonograph.thickeningMode': {
      title: 'Thickening Mode',
      description: 'Controls how the thickness strokes are arranged (parallel or sinusoidal).',
    },
    'harmonograph.loopDrift': {
      title: 'Anti-Loop Drift',
      description: 'Adds a gradual frequency drift over time to break repeated loop closure.',
    },
    'harmonograph.settleThreshold': {
      title: 'Settle Cutoff',
      description: 'Stops sampling once motion stays below this amplitude near the center (0 disables).',
    },
    'harmonograph.showPendulumGuides': {
      title: 'Pendulum Guides',
      description: 'Overlays each pendulum contribution to visualize the motion in the canvas.',
    },
    'harmonograph.pendulumGuideColor': {
      title: 'Guide Color',
      description: 'Stroke color for the pendulum helper overlay.',
    },
    'harmonograph.pendulumGuideWidth': {
      title: 'Guide Thickness',
      description: 'Stroke weight for the pendulum helper overlay.',
    },
    'harmonograph.ampX': {
      title: 'Amplitude X',
      description: 'Horizontal amplitude contribution of this pendulum.',
    },
    'harmonograph.ampY': {
      title: 'Amplitude Y',
      description: 'Vertical amplitude contribution of this pendulum.',
    },
    'harmonograph.phaseX': {
      title: 'Phase X',
      description: 'Phase offset for the X oscillator.',
    },
    'harmonograph.phaseY': {
      title: 'Phase Y',
      description: 'Phase offset for the Y oscillator.',
    },
    'harmonograph.freq': {
      title: 'Frequency',
      description: 'Oscillation frequency for this pendulum.',
    },
    'harmonograph.micro': {
      title: 'Micro Tuning',
      description: 'Fine tuning offset that nudges the frequency.',
    },
    'harmonograph.damp': {
      title: 'Damping',
      description: 'Decay rate applied to this pendulum.',
    },
    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of horizontal rows in the wavetable.',
    },
    'wavetable.noiseType': {
      title: 'Noise Type',
      body: (ui) => {
        const base = ui?.getWavetableNoiseTemplates?.('wavetable')?.base || {};
        const baseParams = {
          ...(ALGO_DEFAULTS?.wavetable ? clone(ALGO_DEFAULTS.wavetable) : {}),
          lines: 40,
          gap: 1.2,
          tilt: 0,
          lineOffset: 0,
          noises: [],
        };
        const items = WAVE_NOISE_OPTIONS.map((opt) => {
          const desc = WAVE_NOISE_DESCRIPTIONS[opt.value] || '';
          const params = {
            ...baseParams,
            noises: [
              {
                ...clone(base),
                type: opt.value,
                amplitude: 6,
                zoom: 0.03,
                freq: 1,
                enabled: true,
              },
            ],
          };
          const svg = renderPreviewSvg('wavetable', params, { strokeWidth: 0.8 });
          return `
            <div class="modal-illustration">
              <div class="modal-ill-label">${opt.label}</div>
              ${desc ? `<div class="modal-ill-desc">${desc}</div>` : ''}
              ${svg}
            </div>
          `;
        }).join('');
        return `
          <p class="modal-text">
            Each noise type shapes line displacement differently. Image modes use uploaded luminance as the base signal.
          </p>
          <div class="modal-illustrations scrollable">
            ${items}
          </div>
        `;
      },
      hidePreview: true,
    },
    'wavetable.noiseBlend': {
      title: 'Blend Mode',
      description:
        'Controls how this noise layer combines with the noises above it. Hatching Density modes bias displacement based on light/dark tone to simulate shading.',
    },
    'wavetable.noiseApplyMode': {
      title: 'Apply Mode',
      description: 'Top Down samples noise in global canvas space. Linear maps noise along the spiral path.',
    },
    'wavetable.imageNoiseStyle': {
      title: 'Noise Style',
      description: 'Shapes how dark vs. light image values influence the displacement.',
    },
    'wavetable.imageNoiseThreshold': {
      title: 'Noise Threshold',
      description: 'Controls how dark a pixel must be before it contributes full noise impact.',
    },
    'wavetable.imageWidth': {
      title: 'Noise Width',
      description: 'Scales image sampling horizontally. 1 keeps native aspect; higher widens, lower narrows.',
    },
    'wavetable.imageHeight': {
      title: 'Noise Height',
      description: 'Scales image sampling vertically.',
    },
    'wavetable.imageMicroFreq': {
      title: 'Micro Frequency',
      description: 'Adds micro-scale wave modulation based on image darkness.',
    },
    'wavetable.imageInvertColor': {
      title: 'Invert Color',
      description: 'Flips the luminance values of the image before effects are applied.',
    },
    'wavetable.imageInvertOpacity': {
      title: 'Invert Opacity',
      description: 'Inverts the image alpha contribution so transparent areas become active.',
    },
    'wavetable.noiseTileMode': {
      title: 'Tile Mode',
      description: 'Repeats the noise in patterned tiles (grid, brick, hex, etc.). Off keeps a single centered field.',
    },
    'wavetable.noiseTilePadding': {
      title: 'Tile Padding',
      description: 'Adds breathing room between tiles by shrinking the active tile area.',
    },
    'wavetable.noiseImage': {
      title: 'Noise Image',
      description: 'Uses an uploaded image as the noise source. Brightness values become wave displacement.',
    },
    'wavetable.imageAlgo': {
      title: 'Image Effect Mode',
      description: 'Determines how each image effect transforms luminance before displacement.',
    },
    'wavetable.imageBrightness': {
      title: 'Image Brightness',
      description: 'Offsets the sampled luminance brighter or darker.',
    },
    'wavetable.imageLevelsLow': {
      title: 'Levels Low',
      description: 'Clips darker tones before remapping the image levels.',
    },
    'wavetable.imageLevelsHigh': {
      title: 'Levels High',
      description: 'Clips lighter tones before remapping the image levels.',
    },
    'wavetable.imageEmbossStrength': {
      title: 'Emboss Strength',
      description: 'Emphasizes directional relief like an embossed surface.',
    },
    'wavetable.imageSharpenAmount': {
      title: 'Sharpen Amount',
      description: 'Boosts local contrast to emphasize edges.',
    },
    'wavetable.imageSharpenRadius': {
      title: 'Sharpen Radius',
      description: 'Neighborhood size used for sharpening.',
    },
    'wavetable.imageMedianRadius': {
      title: 'Median Radius',
      description: 'Neighborhood size used for median filtering.',
    },
    'wavetable.imageGamma': {
      title: 'Image Gamma',
      description: 'Adjusts midtone weighting before sampling the image.',
    },
    'wavetable.imageContrast': {
      title: 'Image Contrast',
      description: 'Boosts or reduces contrast prior to sampling.',
    },
    'wavetable.imageBlurRadius': {
      title: 'Blur Radius',
      description: 'Radius for blur sampling when Blur mode is active.',
    },
    'wavetable.imageBlurStrength': {
      title: 'Blur Strength',
      description: 'Blend amount between sharp and blurred luminance.',
    },
    'wavetable.imageSolarize': {
      title: 'Solarize Threshold',
      description: 'Inverts tones above the threshold for a photographic solarize effect.',
    },
    'wavetable.imagePixelate': {
      title: 'Pixelate',
      description: 'Samples the image in larger blocks for a chunky pixel effect.',
    },
    'wavetable.imageDither': {
      title: 'Dither Amount',
      description: 'Applies a patterned threshold to create a stippled tone map.',
    },
    'wavetable.imageHighpassRadius': {
      title: 'High Pass Radius',
      description: 'Kernel size for extracting high-frequency detail.',
    },
    'wavetable.imageHighpassStrength': {
      title: 'High Pass Strength',
      description: 'Boosts edge contrast from the high-pass filter.',
    },
    'wavetable.imageLowpassRadius': {
      title: 'Low Pass Radius',
      description: 'Kernel size for smoothing the image.',
    },
    'wavetable.imageLowpassStrength': {
      title: 'Low Pass Strength',
      description: 'Blends the low-pass filter into the luminance.',
    },
    'wavetable.imageVignetteStrength': {
      title: 'Vignette Strength',
      description: 'Darkens edges to emphasize the center.',
    },
    'wavetable.imageVignetteRadius': {
      title: 'Vignette Radius',
      description: 'Controls how far the vignette reaches into the image.',
    },
    'wavetable.imageCurveStrength': {
      title: 'Tone Curve Strength',
      description: 'Applies an S-curve to emphasize midtones.',
    },
    'wavetable.imageBandCenter': {
      title: 'Band Center',
      description: 'Target luminance for the bandpass mask.',
    },
    'wavetable.imageBandWidth': {
      title: 'Band Width',
      description: 'Range of luminance values preserved by bandpass.',
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
      title: 'Edge Blur Radius',
      description: 'Radius used for edge detection smoothing.',
    },
    'wavetable.amplitude': {
      title: 'Noise Amplitude',
      description: 'Amount of vertical displacement added by this noise layer.',
    },
    'wavetable.zoom': {
      title: 'Noise Zoom',
      description: 'Scale of this noise field along the wavetable.',
    },
    'wavetable.noiseShiftX': {
      title: 'Noise X-Shift',
      description: 'Offsets the noise field horizontally. 0 keeps it centered.',
    },
    'wavetable.noiseShiftY': {
      title: 'Noise Y-Shift',
      description: 'Offsets the noise field vertically. 0 keeps it centered.',
    },
    'wavetable.noisePatternScale': {
      title: 'Pattern Scale',
      description: 'Adjusts the spacing of pattern-driven noises like stripes or moire.',
    },
    'wavetable.noiseWarpStrength': {
      title: 'Warp Strength',
      description: 'Controls how aggressively the noise field is warped.',
    },
    'wavetable.noiseCellScale': {
      title: 'Cell Scale',
      description: 'Sets the size of cells for cellular/voronoi noise types.',
    },
    'wavetable.noiseCellJitter': {
      title: 'Cell Jitter',
      description: 'Randomizes cell positions to soften or sharpen cell boundaries.',
    },
    'wavetable.noiseSteps': {
      title: 'Step Count',
      description: 'Number of discrete steps for stepped or faceted noise.',
    },
    'wavetable.noiseSeed': {
      title: 'Noise Seed',
      description: 'Offsets the noise pattern for seeded modes like Steps or Value.',
    },
    'wavetable.noisePolygonRadius': {
      title: 'Polygon Radius',
      description: 'Controls the overall size of the polygon noise shape.',
    },
    'wavetable.noisePolygonSides': {
      title: 'Polygon Sides',
      description: 'Sets the number of sides in the polygon.',
    },
    'wavetable.noisePolygonRotation': {
      title: 'Polygon Rotation',
      description: 'Rotates the polygon around its center.',
    },
    'wavetable.noisePolygonOutline': {
      title: 'Polygon Outline Width',
      description: 'Defines the outline thickness when using polygon noise.',
    },
    'wavetable.noisePolygonEdge': {
      title: 'Polygon Edge Radius',
      description: 'Softens polygon edges for a rounded profile.',
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
      description: 'Noise frequency along the X axis for this layer.',
    },
    'wavetable.noiseAngle': {
      title: 'Noise Angle',
      description: 'Rotates this noise field direction used to displace the wave.',
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
    'rainfall.lengthJitter': {
      title: 'Length Jitter',
      description: 'Adds randomized variation to the streak length.',
    },
    'rainfall.traceStep': {
      title: 'Trace Step',
      description: 'Distance between points along each trace.',
    },
    'rainfall.stepJitter': {
      title: 'Step Jitter',
      description: 'Randomizes spacing between points along each trace.',
    },
    'rainfall.turbulence': {
      title: 'Turbulence',
      description: 'Adds jitter to rain direction over time.',
    },
    'rainfall.gustStrength': {
      title: 'Gust Strength',
      description: 'Adds slower, broader directional gusts to the rain.',
    },
    'rainfall.rainfallAngle': {
      title: 'Rainfall Angle',
      description: 'Sets the direction the droplet head faces (0° = north, 180° = south).',
    },
    'rainfall.angleJitter': {
      title: 'Angle Jitter',
      description: 'Random variation applied to each drop’s direction.',
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
    'rainfall.dropSizeJitter': {
      title: 'Drop Size Jitter',
      description: 'Adds size variation to droplets for more organic rain.',
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
      description: 'Controls how tightly fill strokes are packed inside droplets (higher fills in more).',
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
    'rainfall.noiseApply': {
      title: 'Noise Target',
      description: 'Choose whether the noise stack affects trails, droplets, or both.',
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
      description: 'Minimum and maximum radius for each packed shape (in millimeters).',
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
    'petalis.preset': {
      title: 'Preset',
      description: 'Loads a curated Petalis recipe. Presets overwrite petal, distribution, center, and shading parameters.',
    },
    'petalis.petalProfile': {
      title: 'Petal Profile',
      description: 'Selects the base silhouette used to build each petal (oval, teardrop, lanceolate, etc.).',
    },
    'petalis.petalScale': {
      title: 'Petal Scale',
      description: 'Controls the overall petal size in millimeters before ring scaling or morphing is applied.',
    },
    'petalis.petalWidthRatio': {
      title: 'Width/Length Ratio',
      description: 'Sets how wide the petal is relative to its length. Lower values create thinner petals.',
    },
    'petalis.petalLengthRatio': {
      title: 'Length Ratio',
      description: 'Multiplies the petal length without changing the width ratio.',
    },
    'petalis.petalSizeRatio': {
      title: 'Size Ratio',
      description: 'Scales both width and length uniformly for the petal silhouette.',
    },
    'petalis.leafSidePos': {
      title: 'Side Position',
      description: 'Moves the widest point of the petal up or down along its length.',
    },
    'petalis.leafSideWidth': {
      title: 'Side Width',
      description: 'Scales the maximum width defined by the side control point.',
    },
    'petalis.petalSteps': {
      title: 'Petal Resolution',
      description: 'Number of points used to draw each petal. Higher values create smoother curves.',
    },
    'petalis.layering': {
      title: 'Layering',
      description: 'When enabled, inner petals visually occlude outer petals by clipping overlapping outlines.',
    },
    'petalis.anchorToCenter': {
      title: 'Anchor to Center Ring',
      description: 'Anchors petals to the central ring (central only, all petals, or off for free radial placement).',
    },
    'petalis.anchorRadiusRatio': {
      title: 'Anchor Radius Ratio',
      description: 'Scales the anchor radius used for petal attachment to the center ring.',
    },
    'petalis.tipSharpness': {
      title: 'Tip Sharpness',
      description: 'Controls how pointy the petal tip is while keeping the base rounded. At 0 the tip is fully rounded.',
    },
    'petalis.tipTwist': {
      title: 'Tip Rotate',
      description: 'Rotates the tip shape to create subtle spiraling at the petal tip.',
    },
    'petalis.centerCurlBoost': {
      title: 'Center Tip Rotate Boost',
      description: 'Boosts tip rotation for petals closer to the center to emphasize a curled core.',
    },
    'petalis.tipCurl': {
      title: 'Tip Rounding',
      description: 'Rounds the outer petal tip. 0 keeps a sharp edge, 1 approaches a semicircular tip.',
    },
    'petalis.baseFlare': {
      title: 'Base Flare',
      description: 'Flares the petal base outward, widening where it attaches to the center.',
    },
    'petalis.basePinch': {
      title: 'Base Pinch',
      description: 'Narrows the petal base for a tighter, tapered attachment.',
    },
    'petalis.edgeWaveAmp': {
      title: 'Edge Wave Amplitude',
      description: 'Adds waviness along petal edges. Higher values create deeper scallops.',
    },
    'petalis.edgeWaveFreq': {
      title: 'Edge Wave Frequency',
      description: 'Controls the number of wave cycles along each petal edge.',
    },
    'petalis.centerWaveBoost': {
      title: 'Center Wave Boost',
      description: 'Boosts edge waviness for petals nearer the center.',
    },
    'petalis.count': {
      title: 'Petal Count',
      description: 'Total number of petals when using a single ring layout.',
    },
    'petalis.ringMode': {
      title: 'Ring Mode',
      description: 'Chooses between a single ring or dual inner/outer rings.',
    },
    'petalis.innerCount': {
      title: 'Inner Petal Count',
      description: 'Number of petals in the inner ring when dual mode is enabled.',
    },
    'petalis.outerCount': {
      title: 'Outer Petal Count',
      description: 'Number of petals in the outer ring when dual mode is enabled.',
    },
    'petalis.ringSplit': {
      title: 'Ring Split',
      description: 'Controls how the radius range is divided between inner and outer rings.',
    },
    'petalis.innerOuterLock': {
      title: 'Inner = Outer',
      description: 'Locks the outer profile to mirror the inner profile while editing.',
    },
    'petalis.profileTransitionPosition': {
      title: 'Profile Transition Position',
      description: 'Sets the radial position where petals transition from inner profile to outer profile.',
    },
    'petalis.profileTransitionFeather': {
      title: 'Profile Transition Feather',
      description: 'Controls the blend width for transitioning from inner to outer profile.',
    },
    'petalis.ringOffset': {
      title: 'Ring Offset',
      description: 'Rotates the outer ring relative to the inner ring.',
    },
    'petalis.spiralMode': {
      title: 'Phyllotaxis Mode',
      description: 'Uses the golden angle or a custom angle to distribute petals radially.',
    },
    'petalis.customAngle': {
      title: 'Custom Angle',
      description: 'Custom phyllotaxis angle in degrees when Phyllotaxis Mode is set to Custom.',
    },
    'petalis.spiralTightness': {
      title: 'Spiral Tightness',
      description: 'Controls how quickly petals spiral out from the center.',
    },
    'petalis.radialGrowth': {
      title: 'Radial Growth',
      description: 'Scales the radial distance of petals from the center.',
    },
    'petalis.spiralStart': {
      title: 'Spiral Start',
      description: 'Sets where the spiral begins along the radial range (0 = center, 1 = edge).',
    },
    'petalis.spiralEnd': {
      title: 'Spiral End',
      description: 'Sets where the spiral ends along the radial range (lower values keep outer petals tighter).',
    },
    'petalis.centerSizeMorph': {
      title: 'Size Morph',
      description: 'Scales petals near the center up or down based on distance to the core.',
    },
    'petalis.centerSizeCurve': {
      title: 'Size Morph Curve',
      description: 'Controls how quickly size morphing ramps from center to outer ring.',
    },
    'petalis.centerShapeMorph': {
      title: 'Shape Morph',
      description: 'Blends between the petal profile and the center profile near the core.',
    },
    'petalis.centerProfile': {
      title: 'Center Profile',
      description: 'Profile used for petals near the center when shape morphing is active.',
    },
    'petalis.budMode': {
      title: 'Bud Mode',
      description: 'Shrinks and tightens petals near the center to create a closed bud.',
    },
    'petalis.budRadius': {
      title: 'Bud Radius',
      description: 'Controls how far from the center the bud effect spreads.',
    },
    'petalis.budTightness': {
      title: 'Bud Tightness',
      description: 'Strength of the bud squeeze; higher values pull petals tighter.',
    },
    'petalis.centerType': {
      title: 'Center Type',
      description: 'Selects the central element style (disk, dome, starburst, dot field, filament cluster).',
    },
    'petalis.centerRadius': {
      title: 'Center Radius',
      description: 'Sets the radius of the central element in millimeters.',
    },
    'petalis.centerDensity': {
      title: 'Center Density',
      description: 'Controls how many central elements are drawn (dots, rays, filaments).',
    },
    'petalis.centerFalloff': {
      title: 'Center Falloff',
      description: 'Reduces central element density toward the outer edge of the center.',
    },
    'petalis.centerRing': {
      title: 'Secondary Ring',
      description: 'Adds a ring of small dots around the center.',
    },
    'petalis.centerRingRadius': {
      title: 'Ring Radius',
      description: 'Radius of the secondary dot ring.',
    },
    'petalis.centerRingDensity': {
      title: 'Ring Density',
      description: 'Number of dots in the secondary ring.',
    },
    'petalis.centerConnectors': {
      title: 'Connect to Petals',
      description: 'Draws connector strokes between the center and nearby petals.',
    },
    'petalis.connectorCount': {
      title: 'Connector Count',
      description: 'How many connector strokes to generate.',
    },
    'petalis.connectorLength': {
      title: 'Connector Length',
      description: 'Length of each connector stroke in millimeters.',
    },
    'petalis.connectorJitter': {
      title: 'Connector Jitter',
      description: 'Random angular variance for connector placement.',
    },
    'petalis.countJitter': {
      title: 'Count Jitter',
      description: 'Randomizes petal counts per ring for more organic variability.',
    },
    'petalis.sizeJitter': {
      title: 'Size Jitter',
      description: 'Adds per-petal size variance for natural irregularity.',
    },
    'petalis.rotationJitter': {
      title: 'Rotation Jitter',
      description: 'Random rotation offset applied to each petal.',
    },
    'petalis.angularDrift': {
      title: 'Angular Drift',
      description: 'Adds a smooth angular drift across the petal sequence.',
    },
    'petalis.driftStrength': {
      title: 'Drift Strength',
      description: 'Controls how strongly drift affects petal rotation.',
    },
    'petalis.driftNoise': {
      title: 'Drift Noise',
      description: 'Noise scale used to modulate angular drift.',
    },
    'petalis.radiusScale': {
      title: 'Radius Scale',
      description: 'Scales petal radius outward or inward across the ring.',
    },
    'petalis.radiusScaleCurve': {
      title: 'Radius Scale Curve',
      description: 'Controls how quickly the radius scale changes from center to edge.',
    },
    'petalis.centerModRippleAmount': {
      title: 'Center Ripple Amount',
      description: 'Amplitude of radial ripples applied to the center elements.',
    },
    'petalis.centerModType': {
      title: 'Center Modifier Type',
      description: 'Selects which modifier is applied to the center elements (ripple, twist, noise, etc.).',
    },
    'petalis.centerModRippleFrequency': {
      title: 'Center Ripple Frequency',
      description: 'Number of ripple cycles around the center.',
    },
    'petalis.centerModTwist': {
      title: 'Center Twist',
      description: 'Rotational twist applied across the center elements.',
    },
    'petalis.centerModNoiseAmount': {
      title: 'Center Noise Amount',
      description: 'Strength of noise displacement on center elements.',
    },
    'petalis.centerModNoiseScale': {
      title: 'Center Noise Scale',
      description: 'Scale of noise used to displace center elements.',
    },
    'petalis.centerModFalloff': {
      title: 'Center Falloff Strength',
      description: 'Compresses center elements toward the core based on radius.',
    },
    'petalis.centerModOffsetX': {
      title: 'Center Offset X',
      description: 'Offsets center elements horizontally in millimeters.',
    },
    'petalis.centerModOffsetY': {
      title: 'Center Offset Y',
      description: 'Offsets center elements vertically in millimeters.',
    },
    'petalis.centerModClip': {
      title: 'Center Clip Radius',
      description: 'Clips center elements to a maximum radius.',
    },
    'petalis.centerModCircularAmount': {
      title: 'Circular Offset Amount',
      description: 'Magnitude of circular offsets applied to ring elements.',
    },
    'petalis.centerModCircularRandomness': {
      title: 'Circular Offset Randomness',
      description: 'Controls how much random variation is applied to circular offsets.',
    },
    'petalis.centerModCircularDirection': {
      title: 'Circular Offset Bias',
      description: 'Biases the circular offset inward, outward, or both.',
    },
    'petalis.centerModCircularSeed': {
      title: 'Circular Offset Seed',
      description: 'Seed for the circular offset noise pattern.',
    },
    'petalis.petalModRippleAmount': {
      title: 'Petal Ripple Amount',
      description: 'Amplitude of ripples along the petal length.',
    },
    'petalis.petalModType': {
      title: 'Petal Modifier Type',
      description: 'Selects which modifier is applied to petals (ripple, twist, noise, shear, taper, offset).',
    },
    'petalis.petalModRippleFrequency': {
      title: 'Petal Ripple Frequency',
      description: 'Number of ripple cycles along each petal.',
    },
    'petalis.petalModTwist': {
      title: 'Petal Twist',
      description: 'Twists petals along their length for a corkscrew effect.',
    },
    'petalis.petalModNoiseAmount': {
      title: 'Petal Noise Amount',
      description: 'Strength of noise displacement applied to petal geometry.',
    },
    'petalis.petalModNoiseScale': {
      title: 'Petal Noise Scale',
      description: 'Scale of the noise field that perturbs petals.',
    },
    'petalis.petalModShear': {
      title: 'Petal Shear',
      description: 'Shears petals diagonally to bias the silhouette.',
    },
    'petalis.petalModTaper': {
      title: 'Petal Taper',
      description: 'Tapers petals toward the tip or base depending on the sign.',
    },
    'petalis.petalModOffsetX': {
      title: 'Petal Offset X',
      description: 'Offsets petal geometry horizontally in millimeters.',
    },
    'petalis.petalModOffsetY': {
      title: 'Petal Offset Y',
      description: 'Offsets petal geometry vertically in millimeters.',
    },
    'petalis.shadingType': {
      title: 'Shading Type',
      description: 'Selects the shading style applied inside or along the petal.',
    },
    'petalis.shadingLineType': {
      title: 'Shading Line Type',
      description: 'Chooses solid, dashed, dotted, or stitch rendering for the shading strokes.',
    },
    'petalis.shadingLineSpacing': {
      title: 'Line Spacing',
      description: 'Distance between shading strokes in millimeters.',
    },
    'petalis.shadingDensity': {
      title: 'Line Density',
      description: 'Multiplies the number of shading strokes without changing the base spacing.',
    },
    'petalis.shadingJitter': {
      title: 'Line Jitter',
      description: 'Adds controlled randomness to the spacing of shading strokes.',
    },
    'petalis.shadingLengthJitter': {
      title: 'Length Jitter',
      description: 'Randomizes how far shading strokes extend along the petal.',
    },
    'petalis.shadingAngle': {
      title: 'Hatch Angle',
      description: 'Rotation of the shading strokes relative to the petal axis, without shifting the shading band position.',
    },
    'petalis.shadingWidthX': {
      title: 'Width X',
      description: 'Horizontal coverage of shading along the petal length (percentage).',
    },
    'petalis.shadingPosX': {
      title: 'Position X',
      description: 'Horizontal center position of the shading band (percentage).',
    },
    'petalis.shadingGapX': {
      title: 'Gap Width X',
      description: 'Horizontal gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosX': {
      title: 'Gap Position X',
      description: 'Horizontal location of the shading gap (percentage).',
    },
    'petalis.shadingWidthY': {
      title: 'Width Y',
      description: 'Vertical coverage of shading across the petal width (percentage).',
    },
    'petalis.shadingPosY': {
      title: 'Position Y',
      description: 'Vertical center position of the shading band (percentage).',
    },
    'petalis.shadingGapY': {
      title: 'Gap Width Y',
      description: 'Vertical gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosY': {
      title: 'Gap Position Y',
      description: 'Vertical location of the shading gap (percentage).',
    },
    'petalis.lightSource': {
      title: 'Set Light Source',
      description: 'Places a draggable light source marker on the canvas to preview lighting direction (in development).',
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
    if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
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
      this.inlinePetalDesigner = null;
      this.layerListOrder = [];
      this.lastLayerClickId = null;
      this.globalSectionCollapsed = false;
      this.armedPenId = null;
      this.activeTool = SETTINGS.activeTool || 'select';
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.selectionMode = SETTINGS.selectionMode || 'rect';
      this.penMode = SETTINGS.penMode || 'draw';
      this.spacePanActive = false;
      this.previousTool = this.activeTool;
      this.harmonographPlotterState = null;
      this.isApplyingAutoColorization = false;
      this.pendingAutoColorizationOptions = null;
      this.autoColorizationStatusEl = null;
      this.topMenuTriggers = [];
      this.openTopMenuTrigger = null;
      this.petalDesignerProfiles = [];
      this.petalDesignerProfilesLoaded = false;
      this.petalDesignerProfilesLoading = null;

      this.initModuleDropdown();
      this.initMachineDropdown();
      this.bindGlobal();
      this.bindShortcuts();
      this.bindInfoButtons();
      this.initLeftPanelSections();
      this.initAboutSection();
      this.initAlgorithmTransformSection();
      this.initTouchModifierBar();
      this.initTouchMouseBridge();
      this.initTopMenuBar();
      document.addEventListener('click', () => {
        if (this.openPenMenu) {
          this.openPenMenu.classList.add('hidden');
          this.openPenMenu = null;
        }
        if (this.openPaletteMenu) {
          this.openPaletteMenu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
        this.setTopMenuOpen(null, false);
      });
      this.initPaneToggles();
      this.initBottomPaneToggle();
      this.initBottomPaneResizer();
      this.initPaneResizers();
      this.initToolBar();
      this.initPensSection();
      this.renderLayers();
      this.renderPens();
      this.initPaletteControls();
      this.initAutoColorizationPanel();
      this.buildControls();
      this.updateFormula();
      this.initSettingsValues();
      this.attachStaticInfoButtons();

    }

    setTopMenuOpen(trigger = null, open = true) {
      const triggers = Array.isArray(this.topMenuTriggers) ? this.topMenuTriggers : [];
      const nextTrigger = open ? trigger : null;
      triggers.forEach((btn) => {
        const panel = btn.parentElement?.querySelector('[data-top-menu-panel]');
        const isActive = Boolean(nextTrigger) && btn === nextTrigger;
        btn.classList.toggle('open', isActive);
        btn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (panel) {
          panel.classList.toggle('open', isActive);
          panel.hidden = !isActive;
        }
      });
      this.openTopMenuTrigger = nextTrigger || null;
    }

    initTopMenuBar() {
      const menubar = getEl('top-menubar');
      if (!menubar) return;
      const triggers = Array.from(menubar.querySelectorAll('[data-top-menu-trigger]'));
      if (!triggers.length) return;
      const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
      const useMacNotation = /mac|iphone|ipad|ipod/.test(platform);
      menubar.querySelectorAll('.top-menu-shortcut[data-shortcut-mac]').forEach((el) => {
        const macLabel = el.dataset.shortcutMac || '';
        const winLabel = el.dataset.shortcutWin || macLabel;
        el.textContent = useMacNotation ? macLabel : winLabel;
      });
      this.topMenuTriggers = triggers;
      const getPanel = (trigger) => trigger?.parentElement?.querySelector('[data-top-menu-panel]') || null;
      const getItems = (panel) =>
        Array.from(panel?.querySelectorAll('.top-menu-item:not([disabled])') || []);
      const focusTriggerByDelta = (current, delta) => {
        const index = triggers.indexOf(current);
        if (index < 0) return current;
        const nextIndex = (index + delta + triggers.length) % triggers.length;
        const next = triggers[nextIndex];
        next?.focus();
        return next;
      };

      triggers.forEach((trigger) => {
        const panel = getPanel(trigger);
        trigger.setAttribute('aria-expanded', 'false');
        if (panel) panel.hidden = true;
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const shouldOpen = this.openTopMenuTrigger !== trigger;
          this.setTopMenuOpen(trigger, shouldOpen);
        });
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = focusTriggerByDelta(trigger, 1);
            if (this.openTopMenuTrigger) this.setTopMenuOpen(next, true);
            return;
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = focusTriggerByDelta(trigger, -1);
            if (this.openTopMenuTrigger) this.setTopMenuOpen(prev, true);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.setTopMenuOpen(trigger, true);
            const first = getItems(panel)[0];
            if (first) first.focus();
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const shouldOpen = this.openTopMenuTrigger !== trigger;
            this.setTopMenuOpen(trigger, shouldOpen);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.setTopMenuOpen(null, false);
          }
        });
        if (!panel) return;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.addEventListener('keydown', (e) => {
          const items = getItems(panel);
          if (!items.length) return;
          const focused = document.activeElement;
          const idx = items.indexOf(focused);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = idx < 0 ? items[0] : items[(idx + 1) % items.length];
            next?.focus();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = idx < 0 ? items[items.length - 1] : items[(idx - 1 + items.length) % items.length];
            prev?.focus();
            return;
          }
          if (e.key === 'Home') {
            e.preventDefault();
            items[0]?.focus();
            return;
          }
          if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1]?.focus();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.setTopMenuOpen(null, false);
            trigger.focus();
          }
        });
        getItems(panel).forEach((item) => {
          item.addEventListener('click', () => {
            this.setTopMenuOpen(null, false);
          });
        });
      });

      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !this.openTopMenuTrigger) return;
        this.setTopMenuOpen(null, false);
      });
    }

    scrollLayerToTop(layerId) {
      const container = getEl('layer-list');
      if (!container || !layerId) return;
      const el = container.querySelector(`[data-layer-id="${layerId}"]`);
      if (!el) return;
      container.scrollTop = Math.max(0, el.offsetTop);
    }

    captureLeftPanelScrollPosition() {
      const pane = document.getElementById('left-panel-content');
      if (!pane) return () => {};
      const prevScrollTop = pane.scrollTop;
      return () => {
        window.requestAnimationFrame(() => {
          const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
          pane.scrollTop = Math.min(prevScrollTop, maxScroll);
        });
      };
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

    openColorModal({ title, value, onApply }) {
      const safeValue = value || '#ffffff';
      const body = `
        <div class="color-modal">
          <div class="color-modal-row">
            <input type="color" class="color-modal-input" value="${safeValue}">
            <input type="text" class="color-modal-hex" value="${safeValue}" aria-label="Hex color">
          </div>
          <div class="color-modal-preview" style="background:${safeValue}"></div>
          <div class="color-modal-actions">
            <button type="button" class="color-modal-cancel">Cancel</button>
            <button type="button" class="color-modal-apply">Apply</button>
          </div>
        </div>
      `;
      this.openModal({ title, body });

      const input = this.modal.bodyEl.querySelector('.color-modal-input');
      const hexInput = this.modal.bodyEl.querySelector('.color-modal-hex');
      const preview = this.modal.bodyEl.querySelector('.color-modal-preview');
      const cancelBtn = this.modal.bodyEl.querySelector('.color-modal-cancel');
      const applyBtn = this.modal.bodyEl.querySelector('.color-modal-apply');

      const normalizeHex = (raw) => {
        if (!raw) return null;
        let next = raw.trim();
        if (!next.startsWith('#')) next = `#${next}`;
        if (/^#[0-9a-fA-F]{3}$/.test(next)) {
          next = `#${next[1]}${next[1]}${next[2]}${next[2]}${next[3]}${next[3]}`;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(next)) return null;
        return next.toLowerCase();
      };
      const sync = (next) => {
        if (input) input.value = next;
        if (hexInput) hexInput.value = next;
        if (preview) preview.style.background = next;
      };

      if (input) {
        input.oninput = (e) => {
          const next = e.target.value;
          sync(next);
        };
      }
      if (hexInput) {
        hexInput.oninput = (e) => {
          const normalized = normalizeHex(e.target.value);
          if (normalized) sync(normalized);
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = () => this.closeModal();
      }
      if (applyBtn) {
        applyBtn.onclick = () => {
          const normalized = normalizeHex(hexInput?.value || input?.value || '');
          if (!normalized) {
            this.showValueError(hexInput?.value || '');
            return;
          }
          if (onApply) onApply(normalized);
          this.closeModal();
        };
      }
    }

    closeModal() {
      this.modal.overlay.classList.remove('open');
    }

    getLeftSectionDefaults() {
      return {
        algorithm: false,
        algorithmTransform: true,
        algorithmConfiguration: false,
        optimization: true,
      };
    }

    getLeftSectionMap() {
      return {
        algorithm: getEl('left-section-algorithm'),
        algorithmConfiguration: getEl('left-section-algorithm-configuration'),
        optimization: getEl('left-section-optimization'),
      };
    }

    setLeftSectionCollapsed(key, collapsed, options = {}) {
      const { persist = true } = options;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections[key] = Boolean(collapsed);
      const sectionMap = this.getLeftSectionMap();
      const section = sectionMap[key];
      if (!section) return;
      const body = section.querySelector('.left-panel-section-body');
      section.classList.toggle('collapsed', Boolean(collapsed));
      if (body) body.style.display = collapsed ? 'none' : '';
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initLeftPanelSections() {
      const defaults = this.getLeftSectionDefaults();
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...defaults };
      } else {
        SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
      }
      const sectionMap = this.getLeftSectionMap();
      Object.entries(sectionMap).forEach(([key, section]) => {
        if (!section) return;
        const header = section.querySelector('.left-panel-section-header');
        const collapsed = SETTINGS.uiSections[key] === true;
        this.setLeftSectionCollapsed(key, collapsed, { persist: false });
        if (!header) return;
        header.onclick = () => {
          const next = !section.classList.contains('collapsed');
          this.setLeftSectionCollapsed(key, next);
        };
      });
    }

    setAlgorithmTransformCollapsed(collapsed, options = {}) {
      const { persist = true } = options;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections.algorithmTransform = Boolean(collapsed);
      const section = getEl('algorithm-transform-section');
      if (!section) return;
      const body = getEl('algorithm-transform-body') || section.querySelector('.global-section-body');
      section.classList.toggle('collapsed', Boolean(collapsed));
      if (body) body.style.display = collapsed ? 'none' : '';
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initAlgorithmTransformSection() {
      const section = getEl('algorithm-transform-section');
      const header = getEl('algorithm-transform-header');
      if (!section) return;
      const defaults = this.getLeftSectionDefaults();
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...defaults };
      } else {
        SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
      }
      const collapsed = SETTINGS.uiSections.algorithmTransform !== false;
      this.setAlgorithmTransformCollapsed(collapsed, { persist: false });
      if (!header) return;
      header.onclick = () => {
        const next = !section.classList.contains('collapsed');
        this.setAlgorithmTransformCollapsed(next);
      };
    }

    setAboutVisible(visible, options = {}) {
      const { persist = true } = options;
      SETTINGS.aboutVisible = visible !== false;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections.algorithmAbout = SETTINGS.aboutVisible;
      const about = getEl('algo-about');
      if (about) about.style.display = SETTINGS.aboutVisible ? '' : 'none';
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initAboutSection() {
      const closeBtn = getEl('algo-about-close');
      const remembered =
        SETTINGS.uiSections &&
        typeof SETTINGS.uiSections === 'object' &&
        Object.prototype.hasOwnProperty.call(SETTINGS.uiSections, 'algorithmAbout')
          ? SETTINGS.uiSections.algorithmAbout
          : undefined;
      if (remembered !== undefined) {
        SETTINGS.aboutVisible = remembered !== false;
      } else if (SETTINGS.aboutVisible === undefined) {
        SETTINGS.aboutVisible = true;
      }
      this.setAboutVisible(SETTINGS.aboutVisible, { persist: false });
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setAboutVisible(false);
        };
      }
    }

    isTouchCapable() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      return (navigator?.maxTouchPoints || 0) > 0;
    }

    setTouchModifier(key, active) {
      if (!SETTINGS.touchModifiers || typeof SETTINGS.touchModifiers !== 'object') {
        SETTINGS.touchModifiers = { shift: false, alt: false, meta: false, pan: false };
      }
      SETTINGS.touchModifiers[key] = Boolean(active);
      this.refreshTouchModifierButtons();
      this.app.persistPreferencesDebounced?.();
    }

    refreshTouchModifierButtons() {
      const bar = getEl('touch-modifier-bar');
      if (!bar) return;
      const mods = SETTINGS.touchModifiers || {};
      bar.querySelectorAll('.touch-mod-btn').forEach((btn) => {
        const key = btn.dataset.touchMod;
        btn.classList.toggle('active', Boolean(mods[key]));
      });
    }

    initTouchModifierBar() {
      const bar = getEl('touch-modifier-bar');
      if (!bar) return;
      if (!SETTINGS.touchModifiers || typeof SETTINGS.touchModifiers !== 'object') {
        SETTINGS.touchModifiers = { shift: false, alt: false, meta: false, pan: false };
      } else {
        SETTINGS.touchModifiers = {
          shift: Boolean(SETTINGS.touchModifiers.shift),
          alt: Boolean(SETTINGS.touchModifiers.alt),
          meta: Boolean(SETTINGS.touchModifiers.meta),
          pan: Boolean(SETTINGS.touchModifiers.pan),
        };
      }
      bar.classList.toggle('hidden', !this.isTouchCapable());
      bar.querySelectorAll('.touch-mod-btn').forEach((btn) => {
        btn.onclick = () => {
          const key = btn.dataset.touchMod;
          if (!key) return;
          this.setTouchModifier(key, !Boolean(SETTINGS.touchModifiers?.[key]));
        };
      });
      this.refreshTouchModifierButtons();
      window.addEventListener('resize', () => {
        bar.classList.toggle('hidden', !this.isTouchCapable());
      });
    }

    initTouchMouseBridge() {
      if (this.touchMouseBridgeInitialized) return;
      this.touchMouseBridgeInitialized = true;
      let activePointerId = null;
      const bridgeSelector = '.pane-resizer, .bottom-resizer, .layer-grip, .pen-grip, .noise-grip, .optimization-grip, .angle-dial';
      const shouldBridge = (target) => {
        if (!target || !target.closest) return false;
        if (target.closest('#main-canvas')) return false;
        if (target.closest('.petal-designer-window')) return false;
        return Boolean(target.closest(bridgeSelector));
      };
      const toMouse = (type, source) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: source.clientX,
          clientY: source.clientY,
          screenX: source.screenX,
          screenY: source.screenY,
          button: 0,
          buttons: type === 'mouseup' ? 0 : 1,
        });

      document.addEventListener(
        'pointerdown',
        (e) => {
          if (e.pointerType === 'mouse') return;
          if (activePointerId !== null) return;
          if (!shouldBridge(e.target)) return;
          activePointerId = e.pointerId;
          e.target.dispatchEvent(toMouse('mousedown', e));
          e.preventDefault();
        },
        { passive: false, capture: true }
      );
      document.addEventListener(
        'pointermove',
        (e) => {
          if (e.pointerType === 'mouse') return;
          if (e.pointerId !== activePointerId) return;
          window.dispatchEvent(toMouse('mousemove', e));
          e.preventDefault();
        },
        { passive: false, capture: true }
      );
      const endBridge = (e) => {
        if (e.pointerType === 'mouse') return;
        if (e.pointerId !== activePointerId) return;
        window.dispatchEvent(toMouse('mouseup', e));
        activePointerId = null;
      };
      document.addEventListener('pointerup', endBridge, { capture: true });
      document.addEventListener('pointercancel', endBridge, { capture: true });
    }

    getPetalDesignerLayer() {
      const active = this.app.engine.getActiveLayer?.();
      if (isPetalisLayerType(active?.type)) return active;
      return (this.app.engine.layers || []).find((layer) => isPetalisLayerType(layer?.type)) || null;
    }

    normalizePetalDesignerProfileId(value, fallback = 'petal-profile') {
      const raw = `${value ?? ''}`.trim().toLowerCase();
      const cleaned = raw
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');
      if (cleaned) return cleaned;
      return `${fallback}-${Date.now().toString(36)}`;
    }

    normalizePetalDesignerProfileName(value, fallback = 'Petal Profile') {
      const safe = `${value ?? ''}`.trim();
      return safe || fallback;
    }

    normalizePetalDesignerProfileShape(shape, side = 'outer', options = {}) {
      const allowPresetFallback = options.allowPresetFallback !== false;
      if (!shape) return null;
      if (typeof shape === 'string') {
        if (!allowPresetFallback) return null;
        return this.buildProfileDesignerShape(shape, side);
      }
      if (typeof shape === 'object' && typeof shape.profile === 'string' && !Array.isArray(shape.anchors)) {
        if (!allowPresetFallback) return null;
        return this.buildProfileDesignerShape(shape.profile, side);
      }
      if (!Array.isArray(shape.anchors) || shape.anchors.length < 2) return null;
      const next = this.cloneDesignerShape(shape);
      this.normalizeDesignerShape(next);
      next.profile = typeof next.profile === 'string' ? next.profile : 'teardrop';
      return next;
    }

    normalizePetalDesignerProfileDefinition(raw, options = {}) {
      if (!raw || typeof raw !== 'object') return null;
      const fallbackId = this.normalizePetalDesignerProfileId(options.fallbackId || 'petal-profile');
      const id = this.normalizePetalDesignerProfileId(raw.id || fallbackId, fallbackId);
      const name = this.normalizePetalDesignerProfileName(raw.name, id);
      const source = options.source || 'project';
      const sourcePath = options.sourcePath || '';
      const allowPresetFallback = options.allowPresetFallback !== false;
      const shapes = raw.shapes && typeof raw.shapes === 'object' ? raw.shapes : {};
      const target = this.normalizePetalDesignerRingTarget(raw.target, 'both');
      let inner = this.normalizePetalDesignerProfileShape(raw.inner || shapes.inner, 'inner', {
        allowPresetFallback,
      });
      let outer = this.normalizePetalDesignerProfileShape(raw.outer || shapes.outer, 'outer', {
        allowPresetFallback,
      });
      if (allowPresetFallback && !inner && typeof raw.innerProfile === 'string') {
        inner = this.buildProfileDesignerShape(raw.innerProfile, 'inner');
      }
      if (allowPresetFallback && !outer && typeof raw.outerProfile === 'string') {
        outer = this.buildProfileDesignerShape(raw.outerProfile, 'outer');
      }
      const sharedShape =
        this.normalizePetalDesignerProfileShape(raw.shape || shapes.both, 'outer', {
          allowPresetFallback,
        }) ||
        (allowPresetFallback && typeof raw.profile === 'string'
          ? this.buildProfileDesignerShape(raw.profile, 'outer')
          : null);
      if (sharedShape) {
        if (!inner && target !== 'outer') {
          inner = this.normalizePetalDesignerProfileShape(sharedShape, 'inner', {
            allowPresetFallback,
          });
        }
        if (!outer && target !== 'inner') {
          outer = this.normalizePetalDesignerProfileShape(sharedShape, 'outer', {
            allowPresetFallback,
          });
        }
      }
      if (!inner && !outer) return null;
      return { id, name, inner, outer, source, sourcePath };
    }

    extractPetalDesignerProfileFileNames(listingText) {
      if (typeof listingText !== 'string' || !listingText.trim()) return [];
      const files = [];
      const seen = new Set();
      const regex = /href="([^"]+)"/gi;
      let match = regex.exec(listingText);
      while (match) {
        const rawHref = `${match[1] || ''}`.trim();
        const cleanHref = rawHref.split('#')[0].split('?')[0];
        if (cleanHref && !cleanHref.endsWith('/')) {
          const name = decodeURIComponent(cleanHref.split('/').pop() || '');
          if (name.toLowerCase().endsWith('.json') && name.toLowerCase() !== 'index.json' && !seen.has(name)) {
            seen.add(name);
            files.push(name);
          }
        }
        match = regex.exec(listingText);
      }
      return files;
    }

    extractPetalDesignerProfileFileNamesFromIndex(indexPayload) {
      const list = Array.isArray(indexPayload)
        ? indexPayload
        : Array.isArray(indexPayload?.files)
        ? indexPayload.files
        : [];
      const seen = new Set();
      return list
        .map((entry) => `${entry || ''}`.trim())
        .filter((entry) => entry.toLowerCase().endsWith('.json'))
        .filter((entry) => entry.toLowerCase() !== 'index.json')
        .filter((entry) => {
          if (seen.has(entry)) return false;
          seen.add(entry);
          return true;
        });
    }

    getPetalDesignerProfileLibrary() {
      if (Array.isArray(this.petalDesignerProfiles) && this.petalDesignerProfiles.length) {
        return this.petalDesignerProfiles;
      }
      return [];
    }

    getBundledPetalDesignerProfileDefinitions() {
      const bundle = window?.Vectura?.[PETAL_DESIGNER_PROFILE_BUNDLE_KEY];
      if (Array.isArray(bundle)) return bundle;
      if (bundle && Array.isArray(bundle.profiles)) return bundle.profiles;
      return [];
    }

    async loadPetalDesignerProfiles(options = {}) {
      const { force = false } = options;
      const isFileProtocol = window?.location?.protocol === 'file:';
      if (!force && isFileProtocol && this.petalDesignerProfilesLoaded) return this.getPetalDesignerProfileLibrary();
      if (!force && this.petalDesignerProfilesLoading) return this.petalDesignerProfilesLoading;
      this.petalDesignerProfilesLoading = (async () => {
        const bundledProfiles = [];
        const fetchedProfiles = [];
        const addProjectProfile = (target, payload, sourcePath, fallbackId = '') => {
          const normalized = this.normalizePetalDesignerProfileDefinition(payload, {
            fallbackId,
            source: 'project',
            sourcePath,
            allowPresetFallback: false,
          });
          if (normalized) target.push(normalized);
        };
        const bundled = this.getBundledPetalDesignerProfileDefinitions();
        bundled.forEach((payload, index) => {
          if (!payload || typeof payload !== 'object') return;
          const sourcePath =
            typeof payload.sourcePath === 'string' && payload.sourcePath.trim()
              ? payload.sourcePath.trim()
              : `bundle-${index + 1}.json`;
          const fallbackId =
            typeof payload.id === 'string' && payload.id.trim()
              ? payload.id.trim()
              : sourcePath.replace(/\.json$/i, '');
          addProjectProfile(bundledProfiles, payload, sourcePath, fallbackId);
        });
        if (!isFileProtocol) {
          const profileFiles = new Set();
          try {
            const indexRes = await fetch(`${PETAL_DESIGNER_PROFILE_DIRECTORY}index.json`, { cache: 'no-store' });
            if (indexRes.ok) {
              const indexPayload = await indexRes.json();
              this.extractPetalDesignerProfileFileNamesFromIndex(indexPayload).forEach((file) => profileFiles.add(file));
            }
          } catch (err) {
            // Folder index is optional.
          }
          try {
            const dirRes = await fetch(PETAL_DESIGNER_PROFILE_DIRECTORY, { cache: 'no-store' });
            if (dirRes.ok) {
              const listing = await dirRes.text();
              this.extractPetalDesignerProfileFileNames(listing).forEach((file) => profileFiles.add(file));
            }
          } catch (err) {
            // Directory listing support depends on the static host.
          }
          for (const filename of profileFiles) {
            const fallbackId = filename.replace(/\.json$/i, '');
            try {
              const res = await fetch(`${PETAL_DESIGNER_PROFILE_DIRECTORY}${filename}`, { cache: 'no-store' });
              if (!res.ok) continue;
              const payload = await res.json();
              addProjectProfile(fetchedProfiles, payload, filename, fallbackId);
            } catch (err) {
              // Ignore malformed files and continue loading valid profiles.
            }
          }
        }
        const sourceProfiles = isFileProtocol
          ? bundledProfiles
          : fetchedProfiles.length
          ? fetchedProfiles
          : bundledProfiles;
        const merged = new Map();
        sourceProfiles.forEach((profile) => merged.set(profile.id, profile));
        this.petalDesignerProfiles = Array.from(merged.values()).sort((a, b) =>
          `${a.name || ''}`.localeCompare(`${b.name || ''}`)
        );
        this.petalDesignerProfilesLoaded = true;
        return this.petalDesignerProfiles;
      })();
      try {
        return await this.petalDesignerProfilesLoading;
      } finally {
        this.petalDesignerProfilesLoading = null;
      }
    }

    getPetalDesignerProfilesForSide(side = 'outer') {
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const otherSide = safeSide === 'inner' ? 'outer' : 'inner';
      return this.getPetalDesignerProfileLibrary().filter((profile) => profile?.[safeSide] || profile?.[otherSide]);
    }

    getPetalDesignerProfileById(profileId) {
      const id = `${profileId || ''}`.trim();
      if (!id) return null;
      return this.getPetalDesignerProfileLibrary().find((profile) => profile?.id === id) || null;
    }

    ensurePetalDesignerProfileSelections(state) {
      if (!state || typeof state !== 'object') return { inner: '', outer: '' };
      const source =
        state.profileSelections && typeof state.profileSelections === 'object'
          ? state.profileSelections
          : {
              inner: state.profileSelectionInner,
              outer: state.profileSelectionOuter,
            };
      state.profileSelections = {
        inner: typeof source.inner === 'string' ? source.inner : '',
        outer: typeof source.outer === 'string' ? source.outer : '',
      };
      return state.profileSelections;
    }

    applyPetalDesignerProfileSelection(state, side, profileId, options = {}) {
      if (!state) return false;
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const profile = this.getPetalDesignerProfileById(profileId);
      if (!profile) return false;
      const shape = profile[safeSide] || profile[safeSide === 'inner' ? 'outer' : 'inner'];
      if (!shape) return false;
      state[safeSide] = this.cloneDesignerShape(shape);
      this.normalizeDesignerShape(state[safeSide]);
      const selections = this.ensurePetalDesignerProfileSelections(state);
      selections[safeSide] = profile.id;
      if (options.applyBoth && profile.inner && profile.outer) {
        state.inner = this.cloneDesignerShape(profile.inner);
        state.outer = this.cloneDesignerShape(profile.outer);
        this.normalizeDesignerShape(state.inner);
        this.normalizeDesignerShape(state.outer);
        selections.inner = profile.id;
        selections.outer = profile.id;
      }
      if (safeSide === 'inner' || safeSide === 'outer') {
        state.activeTarget = safeSide;
        state.target = safeSide;
      }
      if (options.syncLock !== false) this.syncInnerOuterLock(state, safeSide);
      return true;
    }

    buildPetalDesignerProfileExportPayload(state, options = {}) {
      if (!state) return null;
      const scope = options.scope === 'inner' || options.scope === 'outer' ? options.scope : 'both';
      const rawName = `${options.name || ''}`.trim();
      const fallbackName = scope === 'both' ? 'Petal Profile Pair' : `${scope === 'inner' ? 'Inner' : 'Outer'} Petal Profile`;
      const name = this.normalizePetalDesignerProfileName(rawName, fallbackName);
      const id = this.normalizePetalDesignerProfileId(options.id || name);
      const payload = {
        type: PETAL_DESIGNER_PROFILE_TYPE,
        version: PETAL_DESIGNER_PROFILE_VERSION,
        id,
        name,
        created: new Date().toISOString(),
      };
      if (scope === 'both' || scope === 'inner') {
        payload.inner = this.cloneDesignerShape(state.inner);
      }
      if (scope === 'both' || scope === 'outer') {
        payload.outer = this.cloneDesignerShape(state.outer);
      }
      if (scope !== 'both') {
        payload.target = scope;
      }
      return payload;
    }

    downloadJsonPayload(payload, filename = 'profile.json') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async importPetalDesignerProfileFile(file, side, state) {
      if (!file) return { applied: false, profile: null };
      const text = await file.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch (err) {
        throw new Error('Invalid JSON');
      }
      const fallbackId = this.normalizePetalDesignerProfileId(`${file.name || 'imported-profile'}`.replace(/\.json$/i, ''));
      const profile = this.normalizePetalDesignerProfileDefinition(payload, {
        fallbackId,
        source: 'import',
        sourcePath: file.name || '',
      });
      if (!profile) {
        throw new Error('Profile has no usable inner/outer shape.');
      }
      const library = this.getPetalDesignerProfileLibrary();
      const merged = new Map(library.map((entry) => [entry.id, entry]));
      merged.set(profile.id, profile);
      this.petalDesignerProfiles = Array.from(merged.values()).sort((a, b) =>
        `${a.name || ''}`.localeCompare(`${b.name || ''}`)
      );
      this.petalDesignerProfilesLoaded = true;
      let applied = false;
      const appliedSides = [];
      if (state) {
        if (profile.inner && profile.outer) {
          applied = this.applyPetalDesignerProfileSelection(state, side, profile.id, {
            applyBoth: true,
            syncLock: true,
          });
          if (applied) {
            appliedSides.push('inner', 'outer');
          }
        } else {
          applied = this.applyPetalDesignerProfileSelection(state, side, profile.id, {
            applyBoth: false,
            syncLock: true,
          });
          if (applied) appliedSides.push(side === 'inner' ? 'inner' : 'outer');
        }
      }
      return { applied, profile, appliedSides };
    }

    makeDefaultDesignerShape(layer, side = 'outer') {
      const p = layer?.params || {};
      const source = side === 'inner' && p.designerInner ? p.designerInner : side === 'outer' && p.designerOuter ? p.designerOuter : null;
      if (source?.anchors && source.anchors.length >= 2) {
        return {
          profile: source.profile || p.petalProfile || 'teardrop',
          anchors: JSON.parse(JSON.stringify(source.anchors)),
        };
      }
      const profile = p.petalProfile || 'teardrop';
      return this.buildProfileDesignerShape(profile, side);
    }

    buildProfileDesignerShape(profile = 'teardrop', side = 'outer') {
      const widthScale = side === 'inner' ? 0.86 : 1;
      const makeFourPointShape = ({
        upperT,
        upperW,
        lowerT,
        lowerW,
        topOutT = null,
        topOutW = 0,
        upperInT = null,
        upperOutT = null,
        lowerInT = null,
        lowerOutT = null,
        bottomInT = null,
        bottomInW = 0,
      }) => {
        const uT = clamp(upperT, 0.14, 0.45);
        const lT = clamp(Math.max(uT + 0.16, lowerT), 0.5, 0.9);
        const uW = Math.max(0.05, upperW);
        const lW = Math.max(0.05, lowerW);
        const oTop = clamp(topOutT ?? uT * 0.42, 0.04, uT - 0.02);
        const iUpper = clamp(upperInT ?? uT * 0.72, oTop + 0.01, uT - 0.02);
        const oUpper = clamp(upperOutT ?? lerp(uT, lT, 0.34), uT + 0.02, lT - 0.04);
        const iLower = clamp(lowerInT ?? lerp(uT, lT, 0.68), oUpper + 0.02, lT - 0.02);
        const oLower = clamp(lowerOutT ?? lerp(lT, 1, 0.38), lT + 0.02, 0.96);
        const iBottom = clamp(bottomInT ?? lerp(lT, 1, 0.62), oLower + 0.02, 0.98);
        const iTop = clamp(-oTop * 0.7, -0.35, -0.02);
        const oBottom = clamp(1 + (1 - iBottom) * 0.7, 1.02, 1.35);
        return [
          { t: 0, w: 0, in: { t: iTop, w: 0 }, out: { t: oTop, w: topOutW } },
          {
            t: uT,
            w: uW,
            in: { t: iUpper, w: uW },
            out: { t: oUpper, w: uW },
          },
          {
            t: lT,
            w: lW,
            in: { t: iLower, w: lW },
            out: { t: oLower, w: lW },
          },
          { t: 1, w: 0, in: { t: iBottom, w: bottomInW }, out: { t: oBottom, w: 0 } },
        ];
      };
      const scaleAnchor = (anchor) => ({
        ...anchor,
        w: Math.max(0, (anchor.w || 0) * widthScale),
        in: anchor.in ? { ...anchor.in, w: Math.max(0, (anchor.in.w || 0) * widthScale) } : null,
        out: anchor.out ? { ...anchor.out, w: Math.max(0, (anchor.out.w || 0) * widthScale) } : null,
      });
      const templates = {
        oval: makeFourPointShape({
          upperT: 0.27,
          upperW: 0.74,
          lowerT: 0.73,
          lowerW: 0.74,
          topOutW: 0.08,
          bottomInW: 0.08,
        }),
        teardrop: makeFourPointShape({
          upperT: 0.24,
          upperW: 0.36,
          lowerT: 0.71,
          lowerW: 0.86,
          topOutW: 0.01,
          topOutT: 0.095,
          upperInT: 0.165,
          upperOutT: 0.44,
          lowerInT: 0.64,
          lowerOutT: 0.86,
          bottomInT: 0.95,
          bottomInW: 0.04,
        }),
        lanceolate: makeFourPointShape({
          upperT: 0.29,
          upperW: 0.4,
          lowerT: 0.68,
          lowerW: 0.62,
          topOutW: 0.01,
          bottomInW: 0.04,
        }),
        heart: makeFourPointShape({
          upperT: 0.24,
          upperW: 0.72,
          lowerT: 0.66,
          lowerW: 0.9,
          topOutW: 0.18,
          bottomInW: 0.14,
        }),
        spoon: makeFourPointShape({
          upperT: 0.32,
          upperW: 0.36,
          lowerT: 0.76,
          lowerW: 1.08,
          topOutW: 0.02,
          bottomInW: 0.2,
        }),
        rounded: makeFourPointShape({
          upperT: 0.31,
          upperW: 0.84,
          lowerT: 0.69,
          lowerW: 0.84,
          topOutW: 0.12,
          bottomInW: 0.12,
        }),
        notched: makeFourPointShape({
          upperT: 0.25,
          upperW: 0.56,
          lowerT: 0.69,
          lowerW: 0.82,
          topOutW: 0.2,
          bottomInW: 0.1,
        }),
        spatulate: makeFourPointShape({
          upperT: 0.36,
          upperW: 0.42,
          lowerT: 0.74,
          lowerW: 1.02,
          topOutW: 0.03,
          bottomInW: 0.18,
        }),
        marquise: makeFourPointShape({
          upperT: 0.3,
          upperW: 0.64,
          lowerT: 0.7,
          lowerW: 0.64,
          topOutW: 0.01,
          bottomInW: 0.01,
        }),
        dagger: makeFourPointShape({
          upperT: 0.27,
          upperW: 0.28,
          lowerT: 0.67,
          lowerW: 0.4,
          topOutW: 0,
          bottomInW: 0,
        }),
      };
      const template = templates[profile] || templates.teardrop;
      return {
        profile,
        anchors: template.map((anchor) => scaleAnchor(anchor)),
      };
    }

    cloneDesignerShape(shape) {
      return shape ? JSON.parse(JSON.stringify(shape)) : null;
    }

    syncInnerOuterLock(state, sourceSide = null) {
      if (!state) return;
      const lockShapes = Boolean(state.innerOuterLock);
      if (!lockShapes) return;
      const source = sourceSide === 'inner' || sourceSide === 'outer'
        ? sourceSide
        : state.activeTarget === 'outer'
        ? 'outer'
        : 'inner';
      if (source === 'outer') {
        state.inner = this.cloneDesignerShape(state.outer);
        state.activeTarget = 'outer';
        state.target = 'outer';
        return;
      }
      state.outer = this.cloneDesignerShape(state.inner);
      state.activeTarget = 'inner';
      state.target = 'inner';
    }

    normalizeDesignerShape(shape) {
      if (!shape || !Array.isArray(shape.anchors)) return;
      const clampHandleT = (value) => clamp(value, -1, 2);
      const normalizeHandle = (value, fallbackT, fallbackW) => {
        if (!value) return null;
        const t = Number.isFinite(value.t) ? value.t : fallbackT;
        const w = Number.isFinite(value.w) ? value.w : fallbackW;
        return {
          t: clampHandleT(t),
          w,
        };
      };
      shape.anchors = shape.anchors
        .map((anchor) => ({
          t: clamp(anchor?.t ?? 0, 0, 1),
          w: Math.max(0, anchor?.w ?? 0),
          in: normalizeHandle(anchor?.in, anchor?.t ?? 0, anchor?.w ?? 0),
          out: normalizeHandle(anchor?.out, anchor?.t ?? 0, anchor?.w ?? 0),
        }))
        .sort((a, b) => a.t - b.t);
      if (shape.anchors.length < 2) {
        shape.anchors = [
          { t: 0, w: 0, in: { t: -0.1, w: 0 }, out: { t: 0.12, w: 0.06 } },
          { t: 0.28, w: 0.5, in: { t: 0.18, w: 0.5 }, out: { t: 0.44, w: 0.5 } },
          { t: 0.72, w: 0.88, in: { t: 0.56, w: 0.88 }, out: { t: 0.84, w: 0.88 } },
          { t: 1, w: 0, in: { t: 0.88, w: 0.12 }, out: { t: 1.1, w: 0 } },
        ];
      }
      shape.anchors[0].t = 0;
      shape.anchors[0].w = 0;
      shape.anchors[shape.anchors.length - 1].t = 1;
      shape.anchors[shape.anchors.length - 1].w = 0;
      if (!shape.anchors[0].in) {
        shape.anchors[0].in = { t: -0.1, w: 0 };
      }
      if (!shape.anchors[shape.anchors.length - 1].out) {
        shape.anchors[shape.anchors.length - 1].out = { t: 1.1, w: 0 };
      }

      for (let i = 0; i < shape.anchors.length; i++) {
        const anchor = shape.anchors[i];
        if (anchor.in) {
          anchor.in.t = clampHandleT(anchor.in.t);
          if (!Number.isFinite(anchor.in.w)) anchor.in.w = anchor.w;
        }
        if (anchor.out) {
          anchor.out.t = clampHandleT(anchor.out.t);
          if (!Number.isFinite(anchor.out.w)) anchor.out.w = anchor.w;
        }
      }
    }

    normalizeDesignerSymmetryMode(value) {
      if (value === 'horizontal' || value === 'vertical' || value === 'both') return value;
      return 'none';
    }

    designerSymmetryHasHorizontalAxis(value) {
      const mode = this.normalizeDesignerSymmetryMode(value);
      return mode === 'horizontal' || mode === 'both';
    }

    designerSymmetryHasVerticalAxis(value) {
      const mode = this.normalizeDesignerSymmetryMode(value);
      return mode === 'vertical' || mode === 'both';
    }

    getPetalDesignerSymmetryForSide(state, side = 'outer') {
      if (!state || typeof state !== 'object') return 'none';
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const key = safeSide === 'inner' ? 'innerSymmetry' : 'outerSymmetry';
      const fallback = this.normalizeDesignerSymmetryMode(state.designerSymmetry);
      if (state[key] === undefined) {
        state[key] = fallback;
      }
      return this.normalizeDesignerSymmetryMode(state[key]);
    }

    setPetalDesignerSymmetryForSide(state, side, value) {
      if (!state || typeof state !== 'object') return;
      const safeSide = side === 'inner' ? 'inner' : 'outer';
      const key = safeSide === 'inner' ? 'innerSymmetry' : 'outerSymmetry';
      state[key] = this.normalizeDesignerSymmetryMode(value);
      state.designerSymmetry = state[key];
    }

    normalizePetalDesignerViewStyle(value) {
      return value === 'side-by-side' ? 'side-by-side' : 'overlay';
    }

    ensurePetalDesignerState(layer) {
      if (!layer) return null;
      const params = layer.params || {};
      const shadings = Array.isArray(params.shadings) ? params.shadings : [];
      const shapeTarget = this.normalizePetalDesignerRingTarget(params.petalShape ?? params.petalRing, 'inner');
      const activeTarget = shapeTarget === 'outer' ? 'outer' : 'inner';
      const defaultSymmetry = this.normalizeDesignerSymmetryMode(params.designerSymmetry);
      const innerCount = Math.round(
        clamp(params.innerCount ?? params.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400)
      );
      const outerCount = Math.round(
        clamp(params.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600)
      );
      const countSplit = innerCount / Math.max(1, innerCount + outerCount);
      const transitionPosition = clamp(countSplit * 100, 0, 100);
      const state = {
        layerId: layer.id,
        outer: this.makeDefaultDesignerShape(layer, 'outer'),
        inner: this.makeDefaultDesignerShape(layer, 'inner'),
        shadings: shadings.map((shade, index) =>
          this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
        ),
        petalModifiers: (Array.isArray(params.petalModifiers) ? params.petalModifiers : []).map((modifier, index) =>
          this.normalizePetalDesignerModifier(modifier, index)
        ),
        innerOuterLock: Boolean(params.innerOuterLock || shapeTarget === 'both'),
        designerSymmetry: defaultSymmetry,
        innerSymmetry: this.normalizeDesignerSymmetryMode(params.designerInnerSymmetry ?? defaultSymmetry),
        outerSymmetry: this.normalizeDesignerSymmetryMode(params.designerOuterSymmetry ?? defaultSymmetry),
        count: Math.round(clamp(params.count ?? innerCount, 5, 800)),
        innerCount,
        outerCount,
        profileTransitionPosition: transitionPosition,
        profileTransitionFeather: clamp(params.profileTransitionFeather ?? 0, 0, 100),
        widthRatio: this.normalizePetalDesignerWidthRatio(params.petalWidthRatio ?? 1, 1),
        target: activeTarget,
        activeTarget,
        profileSelections: {
          inner: `${params.designerProfileSelectionInner || ''}`,
          outer: `${params.designerProfileSelectionOuter || ''}`,
        },
        viewStyle: this.normalizePetalDesignerViewStyle(
          params.petalVisualizerViewStyle ?? params.petalViewStyle ?? 'overlay'
        ),
        seed: Math.round(clamp(params.seed ?? 1, 0, 9999)),
        countJitter: clamp(params.countJitter ?? 0.1, 0, 0.5),
        sizeJitter: clamp(params.sizeJitter ?? 0.12, 0, 0.5),
        rotationJitter: clamp(params.rotationJitter ?? 6, 0, 45),
        angularDrift: clamp(params.angularDrift ?? 0, 0, 45),
        driftStrength: clamp(params.driftStrength ?? 0.1, 0, 1),
        driftNoise: clamp(params.driftNoise ?? 0.2, 0.05, 1),
        radiusScale: clamp(params.radiusScale ?? 0.2, -1, 1),
        radiusScaleCurve: clamp(params.radiusScaleCurve ?? 1.2, 0.5, 2.5),
        randomnessOpen: false,
        views: {
          outer: { zoom: 1, panX: 0, panY: 0 },
          inner: { zoom: 1, panX: 0, panY: 0 },
        },
      };
      this.normalizeDesignerShape(state.outer);
      this.normalizeDesignerShape(state.inner);
      this.ensurePetalDesignerProfileSelections(state);
      this.syncInnerOuterLock(state);
      return state;
    }

    createPetalDesignerMarkup(options = {}) {
      const {
        showClose = true,
        showPopOut = false,
        showPopIn = false,
        canvasWidth = 260,
        canvasHeight = 220,
      } = options;
      const symmetryOptions = [
        { value: 'none', label: 'None' },
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
        { value: 'both', label: 'Horizontal and Vertical' },
      ]
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
      const viewStyleOptions = PETALIS_DESIGNER_VIEW_STYLE_OPTIONS
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
      const buildProfileEditorCard = (side, title) => `
        <div class="petal-profile-editor-card" data-petal-profile-editor="${side}">
          <div class="petal-profile-editor-card-title">${title}</div>
          <label class="petal-slider-label">
            <span>Profile</span>
            <span class="petal-slider-value" data-petal-profile-label="${side}">None</span>
            <select data-petal-profile-select="${side}">
              <option value="">No Profiles Found</option>
            </select>
          </label>
          <label class="petal-slider-label">
            <span>Symmetry</span>
            <span class="petal-slider-value" data-petal-symmetry-label="${side}">None</span>
            <select data-petal-symmetry-side="${side}">${symmetryOptions}</select>
          </label>
          <div class="petal-profile-editor-actions">
            <button type="button" class="petal-copy-btn" data-petal-profile-import="${side}">Import</button>
            <button type="button" class="petal-copy-btn" data-petal-profile-export="${side}">Export ${title}</button>
          </div>
          <input type="file" class="hidden" accept="${PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT}" data-petal-profile-file="${side}" />
        </div>
      `;
      return `
        <div class="petal-designer-header">
          <div class="petal-designer-title">Petal Designer</div>
          <div class="petal-designer-actions">
            <button type="button" class="petal-tool-btn" data-petal-tool="direct" title="Direct Selection (A)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 2L14 12H9.5L12.5 21L9.5 22L6.5 13L3 16Z" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </button>
            <button type="button" class="petal-tool-btn" data-petal-tool="pen" title="Add Point (P / +)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.2L20.2 10.2L14.8 21.8H9.2L3.8 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                <circle cx="12" cy="11.6" r="1.6" fill="currentColor" />
              </svg>
            </button>
            <button type="button" class="petal-tool-btn" data-petal-tool="delete" title="Delete Point (-)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </button>
            <button type="button" class="petal-tool-btn" data-petal-tool="anchor" title="Anchor Point (Shift + C)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M3.5 12h5M15.5 12h5M12 3.5v5M12 15.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </button>
            ${showPopOut ? '<button type="button" class="petal-popout" aria-label="Pop Out Petal Designer" title="Pop Out">⧉</button>' : ''}
            ${showPopIn ? '<button type="button" class="petal-popin" aria-label="Pop In Petal Designer" title="Pop In">↩</button>' : ''}
            ${showClose ? '<button type="button" class="petal-close" aria-label="Close Petal Designer">✕</button>' : ''}
          </div>
        </div>
        <div class="petal-designer-structure">
          <label class="petal-slider-label" data-petal-inner-count-wrap>
            <span>Inner Petal Count</span>
            <span class="petal-slider-value" data-petal-slider-value="inner-count" data-petal-slider-precision="0"></span>
            <input type="range" min="5" max="400" step="1" data-petal-inner-count>
          </label>
          <label class="petal-slider-label" data-petal-outer-count-wrap>
            <span>Outer Petal Count</span>
            <span class="petal-slider-value" data-petal-slider-value="outer-count" data-petal-slider-precision="0"></span>
            <input type="range" min="5" max="600" step="1" data-petal-outer-count>
          </label>
          <label class="petal-slider-label" data-petal-split-feather-wrap>
            <span>Split Feathering</span>
            <span class="petal-slider-value" data-petal-slider-value="split-feather" data-petal-slider-precision="0" data-petal-slider-unit="%"></span>
            <input type="range" min="0" max="100" step="1" data-petal-split-feather>
          </label>
        </div>
        <div class="petal-designer-transition">
          <label class="petal-transition-lock">
            <input type="checkbox" data-petal-inner-outer-lock>
            <span>Inner = Outer</span>
          </label>
        </div>
        <div class="petal-designer-visualizer">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">PETAL VISUALIZER</div>
            <label class="petal-visualizer-mode">
              <span>View Style</span>
              <select data-petal-view-style>${viewStyleOptions}</select>
            </label>
          </div>
          <div class="petal-designer-grid" data-petal-visualizer-grid>
            <div class="petal-cell" data-petal-cell="overlay">
              <div class="petal-cell-title" data-petal-canvas-title="overlay">Overlay</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="overlay"></canvas>
            </div>
            <div class="petal-cell hidden" data-petal-cell="inner">
              <div class="petal-cell-title" data-petal-canvas-title="inner">Inner Shape</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="inner"></canvas>
            </div>
            <div class="petal-cell hidden" data-petal-cell="outer">
              <div class="petal-cell-title" data-petal-canvas-title="outer">Outer Shape</div>
              <canvas width="${canvasWidth}" height="${canvasHeight}" data-petal-canvas="outer"></canvas>
            </div>
          </div>
        </div>
        <div class="petal-designer-profile-editor">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">PROFILE EDITOR</div>
          </div>
          <div class="petal-profile-editor-grid">
            ${buildProfileEditorCard('inner', 'Inner Shape')}
            ${buildProfileEditorCard('outer', 'Outer Shape')}
          </div>
          <div class="petal-profile-editor-footer">
            <button type="button" class="petal-copy-btn" data-petal-profile-export-pair>Export Pair</button>
          </div>
        </div>
        <div class="petal-designer-shading">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">Shading Stack</div>
            <button type="button" class="petal-copy-btn" data-petal-shading-add>+ Add Shading</button>
          </div>
          <div class="petal-designer-shading-stack" data-petal-shading-stack></div>
        </div>
        <div class="petal-designer-shading">
          <div class="petal-designer-shading-header">
            <div class="petal-designer-shading-title">Modifier Stack</div>
            <button type="button" class="petal-copy-btn" data-petal-modifier-add>+ Add Modifier</button>
          </div>
          <div class="petal-designer-shading-stack" data-petal-modifier-stack></div>
        </div>
        <details class="petal-designer-randomness" data-petal-randomness-panel>
          <summary>Randomness &amp; Seed</summary>
          <div class="petal-designer-randomness-stack" data-petal-randomness-stack></div>
        </details>
      `;
    }

    normalizePetalDesignerRingTarget(value, fallback = 'both') {
      if (value === 'inner' || value === 'outer' || value === 'both') return value;
      return fallback === 'inner' || fallback === 'outer' || fallback === 'both' ? fallback : 'both';
    }

    normalizePetalDesignerShadingTarget(value, fallback = 'both') {
      return this.normalizePetalDesignerRingTarget(value, fallback);
    }

    getPetalDesignerTarget(state) {
      if (!state) return 'inner';
      const fallback = this.normalizePetalDesignerRingTarget(state.target, 'inner');
      if (state.activeTarget !== 'inner' && state.activeTarget !== 'outer') {
        state.activeTarget = fallback === 'outer' ? 'outer' : 'inner';
      }
      state.target = state.activeTarget;
      return state.activeTarget;
    }

    getPetalDesignerShadingTarget(state) {
      return 'both';
    }

    normalizePetalDesignerShadings(state, options = {}) {
      const { defaultTarget = 'both' } = options;
      const fallbackTarget = this.normalizePetalDesignerShadingTarget(defaultTarget, 'both');
      const shadings = Array.isArray(state?.shadings) ? state.shadings : [];
      const normalized = shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: fallbackTarget })
      );
      if (state) state.shadings = normalized;
      return normalized;
    }

    getPetalDesignerShadingsForTarget(state, target, options = {}) {
      const safeTarget = this.normalizePetalDesignerShadingTarget(target, 'both');
      const all = this.normalizePetalDesignerShadings(state, options);
      return all
        .filter(
          (shade) => this.normalizePetalDesignerShadingTarget(shade?.target, options.defaultTarget || 'both') === safeTarget
        )
        .map((shade, index) => this.normalizePetalDesignerShading(shade, index, { defaultTarget: safeTarget }));
    }

    setPetalDesignerShadingsForTarget(state, target, stack, options = {}) {
      if (!state) return;
      const safeTarget = this.normalizePetalDesignerShadingTarget(target, 'both');
      const fallbackTarget = this.normalizePetalDesignerShadingTarget(options.defaultTarget, 'both');
      const all = this.normalizePetalDesignerShadings(state, { defaultTarget: fallbackTarget });
      const preserved = all.filter(
        (shade) => this.normalizePetalDesignerShadingTarget(shade?.target, fallbackTarget) !== safeTarget
      );
      const incoming = Array.isArray(stack) ? stack : [];
      const normalizedIncoming = incoming.map((shade, index) =>
        this.normalizePetalDesignerShading(
          {
            ...(shade || {}),
            target: safeTarget,
          },
          index,
          { defaultTarget: safeTarget }
        )
      );
      state.shadings = preserved.concat(normalizedIncoming);
    }

    getPetalDesignerCountSplit(state) {
      if (!state) return 0.5;
      const inner = Math.max(
        0,
        Math.round(clamp(state.innerCount ?? state.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400))
      );
      const outer = Math.max(
        0,
        Math.round(clamp(state.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600))
      );
      const total = inner + outer;
      if (total <= 0) return 0.5;
      return clamp(inner / total, 0, 1);
    }

    syncPetalDesignerTransitionFromCounts(state) {
      if (!state) return 0.5;
      const split = this.getPetalDesignerCountSplit(state);
      state.profileTransitionPosition = clamp(split * 100, 0, 100);
      return split;
    }

    getPetalDesignerView(state, side = null) {
      if (!state) return { zoom: 1, panX: 0, panY: 0 };
      if (!state.views || typeof state.views !== 'object') {
        state.views = {
          outer: { zoom: 1, panX: 0, panY: 0 },
          inner: { zoom: 1, panX: 0, panY: 0 },
        };
      }
      if (!state.views.outer) state.views.outer = { zoom: 1, panX: 0, panY: 0 };
      if (!state.views.inner) state.views.inner = { zoom: 1, panX: 0, panY: 0 };
      const key = side || this.getPetalDesignerTarget(state);
      const view = state.views[key] || state.views.outer;
      view.zoom = clamp(Number(view.zoom) || 1, 0.35, 4.5);
      view.panX = Number.isFinite(view.panX) ? view.panX : 0;
      view.panY = Number.isFinite(view.panY) ? view.panY : 0;
      return view;
    }

    getPetalDesignerActiveShape(state) {
      return this.getPetalDesignerTarget(state) === 'inner' ? state.inner : state.outer;
    }

    normalizePetalDesignerShading(shade = {}, index = 0, options = {}) {
      const { defaultTarget = 'both' } = options;
      const base = createPetalisShading('radial');
      const target = this.normalizePetalDesignerShadingTarget(shade?.target, defaultTarget);
      return {
        ...base,
        ...(shade || {}),
        id: shade?.id || `designer-shade-${index + 1}`,
        enabled: shade?.enabled !== false,
        target,
        type: shade?.type || base.type,
        lineType: shade?.lineType || base.lineType,
        widthX: clamp(shade?.widthX ?? base.widthX, 0, 100),
        widthY: clamp(shade?.widthY ?? base.widthY, 0, 100),
        posX: clamp(shade?.posX ?? base.posX, 0, 100),
        posY: clamp(shade?.posY ?? base.posY, 0, 100),
        gapX: clamp(shade?.gapX ?? base.gapX, 0, 100),
        gapY: clamp(shade?.gapY ?? base.gapY, 0, 100),
        gapPosX: clamp(shade?.gapPosX ?? base.gapPosX, 0, 100),
        gapPosY: clamp(shade?.gapPosY ?? base.gapPosY, 0, 100),
        lineSpacing: clamp(shade?.lineSpacing ?? base.lineSpacing, 0.2, 8),
        density: clamp(shade?.density ?? base.density, 0.2, 3),
        jitter: clamp(shade?.jitter ?? base.jitter, 0, 1),
        lengthJitter: clamp(shade?.lengthJitter ?? base.lengthJitter, 0, 1),
        angle: clamp(shade?.angle ?? base.angle, -90, 90),
      };
    }

    getPetalDesignerModifierType(type) {
      return PETALIS_PETAL_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_PETAL_MODIFIER_TYPES[0];
    }

    normalizePetalDesignerModifierTarget(value, fallback = 'both') {
      return this.normalizePetalDesignerRingTarget(value, fallback);
    }

    normalizePetalDesignerModifier(modifier = {}, index = 0) {
      const typeDef = this.getPetalDesignerModifierType(modifier?.type);
      const base = createPetalModifier(typeDef.value);
      const next = {
        ...base,
        ...(modifier || {}),
        id: modifier?.id || `designer-mod-${index + 1}`,
        enabled: modifier?.enabled !== false,
        type: typeDef.value,
        target: this.normalizePetalDesignerModifierTarget(modifier?.target, 'both'),
      };
      typeDef.controls.forEach((def) => {
        const fallback = base[def.key] ?? def.min ?? 0;
        const raw = Number(next[def.key]);
        const safe = Number.isFinite(raw) ? raw : fallback;
        next[def.key] = clamp(safe, def.min, def.max);
      });
      return next;
    }

    normalizePetalDesignerModifiers(state) {
      const modifiers = Array.isArray(state?.petalModifiers) ? state.petalModifiers : [];
      const normalized = modifiers.map((modifier, index) => this.normalizePetalDesignerModifier(modifier, index));
      if (state && typeof state === 'object') state.petalModifiers = normalized;
      return normalized;
    }

    setPetalDesignerSliderValue(pd, key, value) {
      const root = pd?.root;
      if (!root) return;
      const el = root.querySelector(`[data-petal-slider-value="${key}"]`);
      if (!el) return;
      const precision = Number.parseInt(el.dataset.petalSliderPrecision || '0', 10);
      const unit = el.dataset.petalSliderUnit || '';
      const factor = Math.pow(10, Number.isFinite(precision) ? precision : 0);
      const rounded = Math.round((Number(value) || 0) * factor) / factor;
      el.textContent = `${rounded}${unit}`;
    }

    renderPetalDesignerShadingStack(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const list = pd.root.querySelector('[data-petal-shading-stack]');
      const addBtn = pd.root.querySelector('[data-petal-shading-add]');
      if (!list || !addBtn) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      let shadings = this.normalizePetalDesignerShadings(pd.state, { defaultTarget: 'both' });
      const syncState = () => {
        pd.state.shadings = shadings.map((shade, index) =>
          this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
        );
        shadings = pd.state.shadings;
      };

      addBtn.onclick = () => {
        const activeSide = this.getPetalDesignerTarget(pd.state);
        shadings = shadings.concat([
          this.normalizePetalDesignerShading(createPetalisShading('radial'), shadings.length, {
            defaultTarget: activeSide,
          }),
        ]);
        syncState();
        this.renderPetalDesignerShadingStack(pd, onApply);
        onApply();
      };

      const rangeDefs = [
        { key: 'lineSpacing', label: 'Line Spacing', min: 0.2, max: 8, step: 0.1, precision: 1, unit: 'mm' },
        { key: 'density', label: 'Line Density', min: 0.2, max: 3, step: 0.05, precision: 2 },
        { key: 'jitter', label: 'Line Jitter', min: 0, max: 1, step: 0.05, precision: 2 },
        { key: 'lengthJitter', label: 'Length Jitter', min: 0, max: 1, step: 0.05, precision: 2 },
        { key: 'angle', label: 'Hatch Angle', min: -90, max: 90, step: 1, precision: 0, unit: '°' },
        { key: 'widthX', label: 'Width X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'posX', label: 'Position X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapX', label: 'Gap Width X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapPosX', label: 'Gap Position X', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'widthY', label: 'Width Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'posY', label: 'Position Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapY', label: 'Gap Width Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
        { key: 'gapPosY', label: 'Gap Position Y', min: 0, max: 100, step: 1, precision: 0, unit: '%' },
      ];

      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };

      list.innerHTML = '';
      shadings.forEach((shade, idx) => {
        const card = document.createElement('div');
        card.className = `noise-card${shade.enabled ? '' : ' noise-disabled'}`;
        card.innerHTML = `
          <div class="noise-header">
            <div class="flex items-center gap-2">
              <span class="noise-title">Shading ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <button type="button" class="petal-copy-btn" data-shade-up title="Move up">↑</button>
              <button type="button" class="petal-copy-btn" data-shade-down title="Move down">↓</button>
              <label class="noise-toggle">
                <input type="checkbox" ${shade.enabled ? 'checked' : ''} data-shade-enabled>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete shading" data-shade-delete>🗑</button>
            </div>
          </div>
        `;
        const controls = document.createElement('div');
        controls.className = 'noise-controls';

        const makeSelect = (label, key, options) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionMarkup = options
            .map((opt) => `<option value="${opt.value}" ${shade[key] === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          wrap.innerHTML = `
            <span>${label}</span>
            <span class="petal-slider-value">${options.find((opt) => opt.value === shade[key])?.label || shade[key]}</span>
            <select data-shade-key="${key}">${optionMarkup}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !shade.enabled;
            input.onchange = () => {
              shade[key] =
                key === 'target'
                  ? this.normalizePetalDesignerShadingTarget(input.value, 'both')
                  : input.value;
              shadings[idx] = shade;
              syncState();
              valueLabel.textContent = options.find((opt) => opt.value === shade[key])?.label || shade[key];
              onApply();
            };
          }
          return wrap;
        };

        const makeRange = (def) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const value = clamp(shade[def.key] ?? def.min, def.min, def.max);
          shade[def.key] = value;
          wrap.innerHTML = `
            <span>${def.label}</span>
            <span class="petal-slider-value">${formatValue(value, def.precision, def.unit || '')}</span>
            <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" data-shade-key="${def.key}">
          `;
          const input = wrap.querySelector('input');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !shade.enabled;
            const onRange = (live = false) => {
              const next = Number.parseFloat(input.value);
              if (!Number.isFinite(next)) return;
              shade[def.key] = clamp(next, def.min, def.max);
              shadings[idx] = shade;
              syncState();
              valueLabel.textContent = formatValue(shade[def.key], def.precision, def.unit || '');
              onApply({ live });
            };
            input.oninput = () => onRange(true);
            input.onchange = () => onRange(false);
          }
          return wrap;
        };

        controls.appendChild(makeSelect('Shading Type', 'type', PETALIS_SHADING_TYPES));
        controls.appendChild(makeSelect('Petal Shape', 'target', PETAL_DESIGNER_TARGET_OPTIONS));
        controls.appendChild(makeSelect('Line Type', 'lineType', PETALIS_LINE_TYPES));
        rangeDefs.forEach((def) => controls.appendChild(makeRange(def)));
        card.appendChild(controls);

        const upBtn = card.querySelector('[data-shade-up]');
        const downBtn = card.querySelector('[data-shade-down]');
        const enabledInput = card.querySelector('[data-shade-enabled]');
        const deleteBtn = card.querySelector('[data-shade-delete]');
        if (upBtn) {
          upBtn.disabled = idx === 0;
          upBtn.onclick = () => {
            if (idx <= 0) return;
            const next = shadings.slice();
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            shadings = next;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (downBtn) {
          downBtn.disabled = idx >= shadings.length - 1;
          downBtn.onclick = () => {
            if (idx >= shadings.length - 1) return;
            const next = shadings.slice();
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            shadings = next;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (enabledInput) {
          enabledInput.onchange = () => {
            shade.enabled = Boolean(enabledInput.checked);
            shadings[idx] = shade;
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        if (deleteBtn) {
          deleteBtn.onclick = () => {
            shadings.splice(idx, 1);
            syncState();
            this.renderPetalDesignerShadingStack(pd, onApply);
            onApply();
          };
        }
        list.appendChild(card);
      });
    }

    renderPetalDesignerModifierStack(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const list = pd.root.querySelector('[data-petal-modifier-stack]');
      const addBtn = pd.root.querySelector('[data-petal-modifier-add]');
      if (!list || !addBtn) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      let modifiers = this.normalizePetalDesignerModifiers(pd.state);
      const syncState = () => {
        pd.state.petalModifiers = modifiers.map((modifier, index) =>
          this.normalizePetalDesignerModifier(modifier, index)
        );
        modifiers = pd.state.petalModifiers;
      };
      addBtn.onclick = () => {
        const activeSide = this.getPetalDesignerTarget(pd.state);
        modifiers = modifiers.concat([
          this.normalizePetalDesignerModifier(
            {
              ...createPetalModifier('ripple'),
              target: activeSide,
            },
            modifiers.length
          ),
        ]);
        syncState();
        this.renderPetalDesignerModifierStack(pd, onApply);
        onApply();
      };
      const stepToPrecision = (step) => {
        const text = `${step ?? 1}`;
        if (!text.includes('.')) return 0;
        return text.split('.')[1].length;
      };
      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };
      list.innerHTML = '';
      modifiers.forEach((modifier, idx) => {
        const typeDef = this.getPetalDesignerModifierType(modifier.type);
        const card = document.createElement('div');
        card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
        card.innerHTML = `
          <div class="noise-header">
            <div class="flex items-center gap-2">
              <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <button type="button" class="petal-copy-btn" data-mod-up title="Move up">↑</button>
              <button type="button" class="petal-copy-btn" data-mod-down title="Move down">↓</button>
              <label class="noise-toggle">
                <input type="checkbox" ${modifier.enabled ? 'checked' : ''} data-mod-enabled>
              </label>
              <button type="button" class="noise-delete" aria-label="Delete modifier" data-mod-delete>🗑</button>
            </div>
          </div>
        `;
        const controls = document.createElement('div');
        controls.className = 'noise-controls';
        const makeTypeSelect = () => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionsHtml = PETALIS_PETAL_MODIFIER_TYPES
            .map((opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          wrap.innerHTML = `
            <span>Modifier Type</span>
            <span class="petal-slider-value">${typeDef.label}</span>
            <select data-mod-type>${optionsHtml}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            input.onchange = () => {
              modifiers[idx] = this.normalizePetalDesignerModifier(
                {
                  ...modifier,
                  type: input.value,
                },
                idx
              );
              syncState();
              this.renderPetalDesignerModifierStack(pd, onApply);
              onApply();
            };
          }
          return wrap;
        };
        const makeTargetSelect = () => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const optionsHtml = PETAL_DESIGNER_TARGET_OPTIONS
            .map((opt) => `<option value="${opt.value}" ${modifier.target === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          const currentLabel =
            PETAL_DESIGNER_TARGET_OPTIONS.find((opt) => opt.value === modifier.target)?.label || modifier.target || 'Both';
          wrap.innerHTML = `
            <span>Petal Shape</span>
            <span class="petal-slider-value">${currentLabel}</span>
            <select data-mod-target>${optionsHtml}</select>
          `;
          const input = wrap.querySelector('select');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            input.onchange = () => {
              modifier.target = this.normalizePetalDesignerModifierTarget(input.value, 'both');
              modifiers[idx] = this.normalizePetalDesignerModifier(modifier, idx);
              syncState();
              valueLabel.textContent =
                PETAL_DESIGNER_TARGET_OPTIONS.find((opt) => opt.value === modifier.target)?.label || modifier.target;
              onApply();
            };
          }
          return wrap;
        };
        const makeRange = (def) => {
          const wrap = document.createElement('label');
          wrap.className = 'petal-slider-label';
          const precision = stepToPrecision(def.step);
          const unit = def.displayUnit || '';
          const value = clamp(modifier[def.key] ?? def.min ?? 0, def.min, def.max);
          modifier[def.key] = value;
          wrap.innerHTML = `
            <span>${def.label}</span>
            <span class="petal-slider-value">${formatValue(value, precision, unit)}</span>
            <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}">
          `;
          const input = wrap.querySelector('input');
          const valueLabel = wrap.querySelector('.petal-slider-value');
          if (input && valueLabel) {
            input.disabled = !modifier.enabled;
            const onRange = (live = false) => {
              const next = Number.parseFloat(input.value);
              if (!Number.isFinite(next)) return;
              modifier[def.key] = clamp(next, def.min, def.max);
              modifiers[idx] = modifier;
              syncState();
              valueLabel.textContent = formatValue(modifier[def.key], precision, unit);
              onApply({ live });
            };
            input.oninput = () => onRange(true);
            input.onchange = () => onRange(false);
          }
          return wrap;
        };
        controls.appendChild(makeTypeSelect());
        controls.appendChild(makeTargetSelect());
        typeDef.controls.forEach((def) => controls.appendChild(makeRange(def)));
        card.appendChild(controls);
        const upBtn = card.querySelector('[data-mod-up]');
        const downBtn = card.querySelector('[data-mod-down]');
        const enabledInput = card.querySelector('[data-mod-enabled]');
        const deleteBtn = card.querySelector('[data-mod-delete]');
        if (upBtn) {
          upBtn.disabled = idx === 0;
          upBtn.onclick = () => {
            if (idx <= 0) return;
            const next = modifiers.slice();
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            modifiers = next;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (downBtn) {
          downBtn.disabled = idx >= modifiers.length - 1;
          downBtn.onclick = () => {
            if (idx >= modifiers.length - 1) return;
            const next = modifiers.slice();
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            modifiers = next;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (enabledInput) {
          enabledInput.onchange = () => {
            modifier.enabled = Boolean(enabledInput.checked);
            modifiers[idx] = modifier;
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        if (deleteBtn) {
          deleteBtn.onclick = () => {
            modifiers.splice(idx, 1);
            syncState();
            this.renderPetalDesignerModifierStack(pd, onApply);
            onApply();
          };
        }
        list.appendChild(card);
      });
    }

    renderPetalDesignerRandomnessPanel(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const panel = pd.root.querySelector('[data-petal-randomness-panel]');
      const stack = pd.root.querySelector('[data-petal-randomness-stack]');
      if (!panel || !stack) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      panel.open = Boolean(pd.state.randomnessOpen);
      panel.ontoggle = () => {
        pd.state.randomnessOpen = panel.open;
      };
      const formatValue = (value, precision = 0, unit = '') => {
        const factor = Math.pow(10, precision);
        const rounded = Math.round((Number(value) || 0) * factor) / factor;
        return `${rounded}${unit}`;
      };
      stack.innerHTML = '';
      PETALIS_DESIGNER_RANDOMNESS_DEFS.forEach((def) => {
        const wrap = document.createElement('label');
        wrap.className = 'petal-slider-label';
        const value = clamp(pd.state[def.key] ?? def.min ?? 0, def.min, def.max);
        pd.state[def.key] = value;
        wrap.innerHTML = `
          <span>${def.label}</span>
          <span class="petal-slider-value">${formatValue(value, def.precision || 0, def.unit || '')}</span>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${value}">
        `;
        const input = wrap.querySelector('input');
        const valueLabel = wrap.querySelector('.petal-slider-value');
        if (input && valueLabel) {
          const onRange = (live = false) => {
            const next = Number.parseFloat(input.value);
            if (!Number.isFinite(next)) return;
            pd.state[def.key] = clamp(next, def.min, def.max);
            valueLabel.textContent = formatValue(pd.state[def.key], def.precision || 0, def.unit || '');
            onApply({ live });
          };
          input.oninput = () => onRange(true);
          input.onchange = () => onRange(false);
        }
        stack.appendChild(wrap);
      });
    }

    renderPetalDesignerProfileEditor(pd, applyChanges = null) {
      if (!pd?.root || !pd?.state) return;
      const onApply =
        applyChanges ||
        pd.applyChanges ||
        ((opts = {}) => {
          const live = Boolean(opts.live);
          this.applyPetalDesignerToLayer(pd.state, {
            refreshControls: !live,
            persistState: !live,
          });
          this.renderPetalDesigner(pd);
        });
      const selections = this.ensurePetalDesignerProfileSelections(pd.state);
      const activeSide = this.getPetalDesignerTarget(pd.state);
      const symmetryLabelFromValue = (value) => {
        const normalized = this.normalizeDesignerSymmetryMode(value);
        const match = [
          { value: 'none', label: 'None' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'both', label: 'Horizontal and Vertical' },
        ].find((item) => item.value === normalized);
        return match ? match.label : 'None';
      };
      ['inner', 'outer'].forEach((side) => {
        const card = pd.root.querySelector(`[data-petal-profile-editor="${side}"]`);
        if (!card) return;
        card.classList.toggle('is-active', side === activeSide);
        const profileSelect = card.querySelector(`select[data-petal-profile-select="${side}"]`);
        const profileLabel = card.querySelector(`[data-petal-profile-label="${side}"]`);
        const symmetrySelect = card.querySelector(`select[data-petal-symmetry-side="${side}"]`);
        const symmetryLabel = card.querySelector(`[data-petal-symmetry-label="${side}"]`);
        const importBtn = card.querySelector(`[data-petal-profile-import="${side}"]`);
        const exportBtn = card.querySelector(`[data-petal-profile-export="${side}"]`);
        const fileInput = card.querySelector(`input[data-petal-profile-file="${side}"]`);
        const profiles = this.getPetalDesignerProfilesForSide(side);
        if (profileSelect) {
          profileSelect.innerHTML = profiles.length
            ? profiles
                .map((profile) => `<option value="${profile.id}">${profile.name}</option>`)
                .join('')
            : '<option value="">No Profiles Found</option>';
          profileSelect.disabled = !profiles.length;
          const currentId = `${selections[side] || ''}`;
          const hasCurrent = profiles.some((profile) => profile.id === currentId);
          const nextId = hasCurrent ? currentId : profiles[0]?.id || '';
          profileSelect.value = nextId;
          selections[side] = nextId;
          if (profileLabel) {
            profileLabel.textContent = profiles.find((profile) => profile.id === nextId)?.name || 'None';
          }
          profileSelect.onfocus = () => {
            pd.state.activeTarget = side;
            pd.state.target = side;
            this.syncPetalDesignerControls(pd);
            this.renderPetalDesigner(pd);
          };
          profileSelect.onchange = () => {
            const selectedId = profileSelect.value;
            if (!selectedId) return;
            pd.state.activeTarget = side;
            pd.state.target = side;
            const applied = this.applyPetalDesignerProfileSelection(pd.state, side, selectedId, {
              applyBoth: false,
              syncLock: true,
            });
            if (!applied) return;
            if (profileLabel) {
              profileLabel.textContent = profiles.find((profile) => profile.id === selectedId)?.name || selectedId;
            }
            this.syncPetalDesignerControls(pd);
            onApply();
          };
        }
        if (symmetrySelect) {
          const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
          symmetrySelect.value = symmetry;
          if (symmetryLabel) symmetryLabel.textContent = symmetryLabelFromValue(symmetry);
          symmetrySelect.onfocus = () => {
            pd.state.activeTarget = side;
            pd.state.target = side;
            this.syncPetalDesignerControls(pd);
            this.renderPetalDesigner(pd);
          };
          symmetrySelect.onchange = () => {
            pd.state.activeTarget = side;
            pd.state.target = side;
            this.setPetalDesignerSymmetryForSide(pd.state, side, symmetrySelect.value);
            if (symmetryLabel) symmetryLabel.textContent = symmetryLabelFromValue(symmetrySelect.value);
            this.syncPetalDesignerControls(pd);
            onApply();
          };
        }
        if (importBtn && fileInput) {
          importBtn.onclick = () => {
            pd.state.activeTarget = side;
            pd.state.target = side;
            this.syncPetalDesignerControls(pd);
            fileInput.value = '';
            fileInput.click();
          };
          fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
              const result = await this.importPetalDesignerProfileFile(file, side, pd.state);
              if (!result.applied) {
                throw new Error('Profile import did not apply.');
              }
              this.syncPetalDesignerControls(pd);
              this.renderPetalDesignerProfileEditor(pd, onApply);
              onApply();
            } catch (err) {
              this.openModal({
                title: 'Invalid Profile',
                body: `<p class="modal-text">That profile file could not be imported.</p>`,
              });
            } finally {
              fileInput.value = '';
            }
          };
        }
        if (exportBtn) {
          exportBtn.onclick = () => {
            const fallback = `${side}-petal-profile`;
            const requested = window.prompt('Profile name', fallback);
            if (requested === null) return;
            const payload = this.buildPetalDesignerProfileExportPayload(pd.state, {
              scope: side,
              name: requested,
            });
            if (!payload) return;
            this.downloadJsonPayload(payload, `${payload.id}.json`);
          };
        }
      });
      const exportPairBtn = pd.root.querySelector('[data-petal-profile-export-pair]');
      if (exportPairBtn) {
        exportPairBtn.onclick = () => {
          const requested = window.prompt('Profile pair name', 'petal-profile-pair');
          if (requested === null) return;
          const payload = this.buildPetalDesignerProfileExportPayload(pd.state, {
            scope: 'both',
            name: requested,
          });
          if (!payload) return;
          this.downloadJsonPayload(payload, `${payload.id}.json`);
        };
      }
    }

    syncPetalDesignerControls(pd) {
      if (!pd?.root || !pd?.state) return;
      this.syncInnerOuterLock(pd.state);
      const side = this.getPetalDesignerTarget(pd.state);
      const viewStyleSelect = pd.root.querySelector('select[data-petal-view-style]');
      const innerCountInput = pd.root.querySelector('input[data-petal-inner-count]');
      const outerCountInput = pd.root.querySelector('input[data-petal-outer-count]');
      const splitFeatherInput = pd.root.querySelector('input[data-petal-split-feather]');
      const innerCountWrap = pd.root.querySelector('[data-petal-inner-count-wrap]');
      const outerCountWrap = pd.root.querySelector('[data-petal-outer-count-wrap]');
      const splitFeatherWrap = pd.root.querySelector('[data-petal-split-feather-wrap]');
      const lockToggle = pd.root.querySelector('input[data-petal-inner-outer-lock]');
      const visualizerGrid = pd.root.querySelector('[data-petal-visualizer-grid]');
      const overlayCell = pd.root.querySelector('[data-petal-cell="overlay"]');
      const innerCell = pd.root.querySelector('[data-petal-cell="inner"]');
      const outerCell = pd.root.querySelector('[data-petal-cell="outer"]');
      const overlayTitle = pd.root.querySelector('[data-petal-canvas-title="overlay"]');
      const innerTitle = pd.root.querySelector('[data-petal-canvas-title="inner"]');
      const outerTitle = pd.root.querySelector('[data-petal-canvas-title="outer"]');
      this.ensurePetalDesignerProfileSelections(pd.state);
      pd.state.activeTarget = side;
      pd.state.target = side;
      const innerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, 'inner');
      const outerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, 'outer');
      pd.state.innerSymmetry = innerSymmetry;
      pd.state.outerSymmetry = outerSymmetry;
      pd.state.designerSymmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
      pd.state.viewStyle = this.normalizePetalDesignerViewStyle(pd.state.viewStyle);
      pd.state.count = Math.round(clamp(pd.state.count ?? PETALIS_DESIGNER_DEFAULT_COUNT, 5, 800));
      pd.state.innerCount = Math.round(
        clamp(pd.state.innerCount ?? pd.state.count ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT, 5, 400)
      );
      pd.state.outerCount = Math.round(
        clamp(pd.state.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT, 5, 600)
      );
      this.syncPetalDesignerTransitionFromCounts(pd.state);
      pd.state.profileTransitionFeather = clamp(pd.state.profileTransitionFeather ?? 0, 0, 100);
      pd.state.seed = Math.round(clamp(pd.state.seed ?? 1, 0, 9999));
      pd.state.countJitter = clamp(pd.state.countJitter ?? 0.1, 0, 0.5);
      pd.state.sizeJitter = clamp(pd.state.sizeJitter ?? 0.12, 0, 0.5);
      pd.state.rotationJitter = clamp(pd.state.rotationJitter ?? 6, 0, 45);
      pd.state.angularDrift = clamp(pd.state.angularDrift ?? 0, 0, 45);
      pd.state.driftStrength = clamp(pd.state.driftStrength ?? 0.1, 0, 1);
      pd.state.driftNoise = clamp(pd.state.driftNoise ?? 0.2, 0.05, 1);
      pd.state.radiusScale = clamp(pd.state.radiusScale ?? 0.2, -1, 1);
      pd.state.radiusScaleCurve = clamp(pd.state.radiusScaleCurve ?? 1.2, 0.5, 2.5);
      this.normalizePetalDesignerModifiers(pd.state);
      if (visualizerGrid) {
        visualizerGrid.classList.toggle('is-side-by-side', pd.state.viewStyle === 'side-by-side');
      }
      if (overlayCell) overlayCell.classList.toggle('hidden', pd.state.viewStyle === 'side-by-side');
      if (innerCell) innerCell.classList.toggle('hidden', pd.state.viewStyle !== 'side-by-side');
      if (outerCell) outerCell.classList.toggle('hidden', pd.state.viewStyle !== 'side-by-side');
      if (overlayTitle) {
        const activeLabel = side === 'inner' ? 'Inner Active' : 'Outer Active';
        overlayTitle.textContent = `Overlay (${activeLabel})`;
      }
      if (innerTitle) innerTitle.textContent = side === 'inner' ? 'Inner Shape (Active)' : 'Inner Shape';
      if (outerTitle) outerTitle.textContent = side === 'outer' ? 'Outer Shape (Active)' : 'Outer Shape';
      if (viewStyleSelect) viewStyleSelect.value = pd.state.viewStyle;
      if (innerCountInput) innerCountInput.value = pd.state.innerCount;
      if (outerCountInput) outerCountInput.value = pd.state.outerCount;
      if (splitFeatherInput) splitFeatherInput.value = pd.state.profileTransitionFeather;
      if (innerCountWrap) innerCountWrap.classList.remove('hidden');
      if (outerCountWrap) outerCountWrap.classList.remove('hidden');
      if (splitFeatherWrap) splitFeatherWrap.classList.remove('hidden');
      if (lockToggle) lockToggle.checked = Boolean(pd.state.innerOuterLock);
      this.setPetalDesignerSliderValue(pd, 'inner-count', pd.state.innerCount);
      this.setPetalDesignerSliderValue(pd, 'outer-count', pd.state.outerCount);
      this.setPetalDesignerSliderValue(pd, 'split-feather', pd.state.profileTransitionFeather);
      this.renderPetalDesignerProfileEditor(pd, pd.applyChanges);
    }

    bindPetalDesignerUI(pd, options = {}) {
      if (!pd?.root || !pd?.state) return;
      const { refreshControls = true } = options;
      const applyChanges = (opts = {}) => {
        const live = Boolean(opts.live);
        this.applyPetalDesignerToLayer(pd.state, {
          refreshControls: !live && refreshControls,
          persistState: !live,
        });
        this.renderPetalDesigner(pd);
      };
      pd.applyChanges = applyChanges;
      const setTool = (tool) => {
        pd.tool = tool;
        pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.petalTool === tool);
        });
      };
      const viewStyleSelect = pd.root.querySelector('select[data-petal-view-style]');
      const innerCountInput = pd.root.querySelector('input[data-petal-inner-count]');
      const outerCountInput = pd.root.querySelector('input[data-petal-outer-count]');
      const splitFeatherInput = pd.root.querySelector('input[data-petal-split-feather]');
      const lockToggle = pd.root.querySelector('input[data-petal-inner-outer-lock]');
      if (viewStyleSelect) {
        viewStyleSelect.onchange = () => {
          pd.state.viewStyle = this.normalizePetalDesignerViewStyle(viewStyleSelect.value);
          this.syncPetalDesignerControls(pd);
          this.renderPetalDesigner(pd);
        };
      }
      if (innerCountInput) {
        const onInnerCount = (live = false) => {
          const next = Number.parseFloat(innerCountInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.innerCount = Math.round(clamp(next, 5, 400));
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        innerCountInput.oninput = () => onInnerCount(true);
        innerCountInput.onchange = () => onInnerCount(false);
      }
      if (outerCountInput) {
        const onOuterCount = (live = false) => {
          const next = Number.parseFloat(outerCountInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.outerCount = Math.round(clamp(next, 5, 600));
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        outerCountInput.oninput = () => onOuterCount(true);
        outerCountInput.onchange = () => onOuterCount(false);
      }
      if (lockToggle) {
        lockToggle.onchange = () => {
          pd.state.innerOuterLock = Boolean(lockToggle.checked);
          this.syncInnerOuterLock(pd.state, this.getPetalDesignerTarget(pd.state));
          this.syncPetalDesignerControls(pd);
          applyChanges();
        };
      }
      if (splitFeatherInput) {
        const onFeather = (live = false) => {
          const next = Number.parseFloat(splitFeatherInput.value);
          if (!Number.isFinite(next)) return;
          pd.state.profileTransitionFeather = clamp(next, 0, 100);
          this.syncPetalDesignerControls(pd);
          applyChanges({ live });
        };
        splitFeatherInput.oninput = () => onFeather(true);
        splitFeatherInput.onchange = () => onFeather(false);
      }
      this.renderPetalDesignerProfileEditor(pd, applyChanges);
      pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
        btn.onclick = () => setTool(btn.dataset.petalTool || 'direct');
      });
      const closeBtn = pd.root.querySelector('.petal-close');
      if (closeBtn) closeBtn.onclick = () => this.closePetalDesigner();
      const popOutBtn = pd.root.querySelector('.petal-popout');
      if (popOutBtn) popOutBtn.onclick = () => this.popOutInlinePetalDesigner();
      const popInBtn = pd.root.querySelector('.petal-popin');
      if (popInBtn) popInBtn.onclick = () => this.popInPetalDesigner();
      this.renderPetalDesignerShadingStack(pd, applyChanges);
      this.renderPetalDesignerModifierStack(pd, applyChanges);
      this.renderPetalDesignerRandomnessPanel(pd, applyChanges);
      this.loadPetalDesignerProfiles()
        .then(() => {
          if (!pd?.root?.isConnected) return;
          this.renderPetalDesignerProfileEditor(pd, applyChanges);
          this.syncPetalDesignerControls(pd);
          this.renderPetalDesigner(pd);
        })
        .catch(() => {
          // Profile ingestion can fail when static hosting blocks directory reads.
        });
      setTool('direct');
      this.syncPetalDesignerControls(pd);
    }

    openPetalDesigner(options = {}) {
      const { layer: requestedLayer = null, fromInline = false } = options;
      const layer = requestedLayer || this.getPetalDesignerLayer();
      if (!layer) {
        this.openModal({
          title: 'Petal Designer',
          body:
            '<p class="modal-text">Add or select a <strong>Petalis</strong> layer first to open the Petal Designer.</p>',
        });
        return;
      }
      if (!fromInline && this.inlinePetalDesigner && this.inlinePetalDesigner.state?.layerId === layer.id) {
        this.inlinePetalDesigner.focused = true;
        this.inlinePetalDesigner.root?.classList.add('focused');
        return;
      }
      this.closePetalDesigner();
      const state = this.ensurePetalDesignerState(layer);
      if (!state) return;
      const root = document.createElement('div');
      root.id = 'petal-designer-window';
      root.className = 'petal-designer-window';
      root.innerHTML = this.createPetalDesignerMarkup({
        showPopIn: true,
        canvasWidth: 220,
        canvasHeight: 180,
      });
      document.body.appendChild(root);

      this.petalDesigner = {
        root,
        state,
        tool: 'direct',
        drag: null,
        windowDrag: null,
        keyHandler: null,
      };
      this.bindPetalDesignerDrag(this.petalDesigner);
      this.bindPetalDesignerUI(this.petalDesigner);
      this.bindPetalDesignerCanvases(this.petalDesigner);
      this.bindPetalDesignerShortcuts(this.petalDesigner);
      this.applyPetalDesignerToLayer(state);
      this.renderPetalDesigner(this.petalDesigner);
    }

    popOutInlinePetalDesigner() {
      const inline = this.inlinePetalDesigner;
      if (!inline?.state?.layerId) return;
      const layer = (this.app.engine.layers || []).find((entry) => entry?.id === inline.state.layerId);
      if (!layer) return;
      this.destroyInlinePetalisDesigner();
      this.openPetalDesigner({ layer, fromInline: true });
    }

    popInPetalDesigner() {
      const modalState = this.petalDesigner?.state;
      this.closePetalDesigner();
      if (!modalState?.layerId) return;
      const layer = (this.app.engine.layers || []).find((entry) => entry?.id === modalState.layerId);
      if (!layer) return;
      this.buildControls();
      if (this.inlinePetalDesigner?.state?.layerId === layer.id) {
        this.inlinePetalDesigner.focused = true;
        this.inlinePetalDesigner.root?.classList.add('focused');
      }
    }

    closePetalDesigner() {
      if (!this.petalDesigner) return;
      const { root, keyHandler, cleanupDrag, cleanupCanvas } = this.petalDesigner;
      if (cleanupDrag) cleanupDrag();
      if (cleanupCanvas) cleanupCanvas();
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      if (root && root.parentElement) root.remove();
      this.petalDesigner = null;
    }

    destroyInlinePetalisDesigner() {
      if (!this.inlinePetalDesigner) return;
      const { root, keyHandler, cleanupCanvas, cleanupOutside } = this.inlinePetalDesigner;
      if (cleanupCanvas) cleanupCanvas();
      if (cleanupOutside) cleanupOutside();
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      if (root && root.parentElement) root.remove();
      this.inlinePetalDesigner = null;
    }

    mountInlinePetalisDesigner(layer, mountTarget) {
      if (!layer || !mountTarget) return;
      this.destroyInlinePetalisDesigner();
      const state = this.ensurePetalDesignerState(layer);
      if (!state) return;

      const root = document.createElement('div');
      root.className = 'petal-designer-window petal-designer-inline';
      root.innerHTML = this.createPetalDesignerMarkup({
        showClose: false,
        showPopOut: true,
        canvasWidth: 220,
        canvasHeight: 180,
      });
      mountTarget.appendChild(root);
      const pd = {
        root,
        state,
        tool: 'direct',
        drag: null,
        keyHandler: null,
        cleanupCanvas: null,
        cleanupOutside: null,
        focused: false,
        inline: true,
      };

      const focusInline = () => {
        pd.focused = true;
        root.classList.add('focused');
      };
      focusInline();
      root.addEventListener('pointerdown', focusInline);
      const onOutsidePointer = (e) => {
        if (root.contains(e.target)) return;
        pd.focused = false;
        root.classList.remove('focused');
      };
      document.addEventListener('pointerdown', onOutsidePointer);
      pd.cleanupOutside = () => {
        root.removeEventListener('pointerdown', focusInline);
        document.removeEventListener('pointerdown', onOutsidePointer);
      };

      this.inlinePetalDesigner = pd;
      this.bindPetalDesignerUI(pd, { refreshControls: false });
      this.bindPetalDesignerCanvases(pd, { refreshControls: false });
      this.bindPetalDesignerShortcuts(pd, { allowClose: false, requireFocus: true });
      this.applyPetalDesignerToLayer(state, { refreshControls: false });
      this.renderPetalDesigner(pd);
    }

    bindPetalDesignerDrag(pd = this.petalDesigner) {
      if (!pd?.root) return;
      const header = pd.root.querySelector('.petal-designer-header');
      if (!header) return;
      const startDrag = (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
        const rect = pd.root.getBoundingClientRect();
        pd.windowDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        pd.root.classList.add('dragging');
      };
      const move = (e) => {
        if (!pd.windowDrag) return;
        const left = Math.max(12, e.clientX - pd.windowDrag.dx);
        const top = Math.max(12, e.clientY - pd.windowDrag.dy);
        pd.root.style.left = `${left}px`;
        pd.root.style.top = `${top}px`;
      };
      const end = () => {
        pd.windowDrag = null;
        pd.root.classList.remove('dragging');
      };
      header.addEventListener('pointerdown', startDrag);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      pd.cleanupDrag = () => {
        header.removeEventListener('pointerdown', startDrag);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      const viewport = document.getElementById('viewport-container')?.getBoundingClientRect();
      const fallbackLeft = viewport ? viewport.left + 24 : 120;
      const fallbackTop = viewport ? viewport.top + 24 : 120;
      pd.root.style.left = `${fallbackLeft}px`;
      pd.root.style.top = `${fallbackTop}px`;
    }

    bindPetalDesignerShortcuts(pd = this.petalDesigner, options = {}) {
      if (!pd?.root) return;
      const { allowClose = true, requireFocus = false } = options;
      const setTool = (tool) => {
        pd.tool = tool;
        pd.root.querySelectorAll('.petal-tool-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.petalTool === tool);
        });
      };
      const handler = (e) => {
        if (!pd?.root) return;
        if (requireFocus && !pd.focused) return;
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
        const key = e.key.toLowerCase();
        if (key === 'escape') {
          if (!allowClose) return;
          e.preventDefault();
          if (pd.inline) this.destroyInlinePetalisDesigner();
          else this.closePetalDesigner();
          return;
        }
        if (key === 'a' || key === 'v') {
          e.preventDefault();
          setTool('direct');
        } else if (key === 'p' || key === '+') {
          e.preventDefault();
          setTool('pen');
        } else if (key === '-') {
          e.preventDefault();
          setTool('delete');
        } else if (key === 'c' && e.shiftKey) {
          e.preventDefault();
          setTool('anchor');
        }
      };
      pd.keyHandler = handler;
      window.addEventListener('keydown', handler);
    }

    bindPetalDesignerCanvases(pd = this.petalDesigner, options = {}) {
      if (!pd?.root) return;
      const { refreshControls = true } = options;
      const applyChanges = (opts = {}) => {
        const live = Boolean(opts.live);
        this.applyPetalDesignerToLayer(pd.state, {
          refreshControls: !live && refreshControls,
          persistState: !live,
        });
        this.renderPetalDesigner(pd);
      };
      const canvases = Array.from(pd.root.querySelectorAll('canvas[data-petal-canvas]'));
      if (!canvases.length) return;
      const canvasByRole = new Map();
      const getCanvasRole = (canvas) => {
        const role = canvas?.dataset?.petalCanvas;
        if (role === 'inner' || role === 'outer') return role;
        return 'overlay';
      };
      const getCanvasForSide = (side) => canvasByRole.get(side) || canvasByRole.get('overlay') || canvases[0];
      const getSideForCanvas = (canvas) => {
        const role = getCanvasRole(canvas);
        return role === 'inner' || role === 'outer' ? role : this.getPetalDesignerTarget(pd.state);
      };
      const getViewForCanvas = (canvas, side = null) => {
        const role = getCanvasRole(canvas);
        if (role === 'inner' || role === 'outer') return this.getPetalDesignerView(pd.state, role);
        return this.getPetalDesignerView(pd.state, side || this.getPetalDesignerTarget(pd.state));
      };
      const activateCanvasSide = (canvas) => {
        const role = getCanvasRole(canvas);
        if (role !== 'inner' && role !== 'outer') return this.getPetalDesignerTarget(pd.state);
        pd.state.target = role;
        pd.state.activeTarget = role;
        this.syncPetalDesignerControls(pd);
        this.renderPetalDesignerShadingStack(pd, applyChanges);
        this.renderPetalDesigner(pd);
        return role;
      };
      const normalizePointForCanvas = (fromCanvas, toCanvas, point) => {
        const sourceMetrics = this.getDesignerCanvasMetrics(fromCanvas);
        const targetMetrics = this.getDesignerCanvasMetrics(toCanvas);
        const nx = clamp(point.x / Math.max(1e-6, sourceMetrics.width), 0, 1);
        const ny = clamp(point.y / Math.max(1e-6, sourceMetrics.height), 0, 1);
        return {
          x: nx * targetMetrics.width,
          y: ny * targetMetrics.height,
        };
      };
      const zoomViewAtPoint = (side, canvas, point, factor) => {
        if (!canvas) return;
        const view = this.getPetalDesignerView(pd.state, side);
        const prevZoom = view.zoom;
        view.zoom = clamp(view.zoom * factor, 0.35, 4.5);
        const scale = view.zoom / Math.max(1e-6, prevZoom);
        view.panX = point.x - (point.x - view.panX) * scale;
        view.panY = point.y - (point.y - view.panY) * scale;
      };
      const zoomBothSides = (sourceCanvas, sourcePoint, factor) => {
        ['inner', 'outer'].forEach((side) => {
          const targetCanvas = getCanvasForSide(side);
          const targetPoint = normalizePointForCanvas(sourceCanvas, targetCanvas, sourcePoint);
          zoomViewAtPoint(side, targetCanvas, targetPoint, factor);
        });
      };
      if (!pd.canvasHover || typeof pd.canvasHover !== 'object') pd.canvasHover = {};
      const readModifiers = (e) => {
        const mods = SETTINGS.touchModifiers || {};
        const isTouch = e?.pointerType === 'touch';
        return {
          shift: Boolean(e?.shiftKey || (isTouch && mods.shift)),
          alt: Boolean(e?.altKey || (isTouch && mods.alt)),
          meta: Boolean(e?.metaKey || e?.ctrlKey || (isTouch && mods.meta)),
        };
      };
      const setCursor = (canvas, e = null) => {
        if (!canvas) return;
        const role = getCanvasRole(canvas);
        const hoverKey = role;
        if (pd.canvasPan && pd.canvasPan.canvas === canvas) {
          canvas.style.cursor = 'grabbing';
          return;
        }
        const side = getSideForCanvas(canvas);
        const shape = pd.state?.[side];
        const view = getViewForCanvas(canvas, side);
        const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
        let hit = pd.canvasHover?.[hoverKey] || null;
        if (shape && e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
          const pos = this.getDesignerCanvasPoint(canvas, e);
          hit = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
          pd.canvasHover[hoverKey] = hit;
        }
        const modifiers = readModifiers(e || {});
        if (pd.tool === 'direct' || (pd.tool === 'pen' && modifiers.meta)) {
          if (hit) {
            canvas.style.cursor = hit.kind === 'anchor' ? 'move' : 'pointer';
            return;
          }
          canvas.style.cursor = 'crosshair';
          return;
        }
        if (pd.tool === 'pen') {
          if (modifiers.alt && (hit?.kind === 'anchor' || hit?.kind === 'handle')) {
            canvas.style.cursor = 'copy';
            return;
          }
          canvas.style.cursor = hit ? (hit.kind === 'anchor' ? 'move' : 'pointer') : 'crosshair';
          return;
        }
        if (pd.tool === 'delete') {
          canvas.style.cursor = hit?.kind === 'anchor' ? 'not-allowed' : 'crosshair';
          return;
        }
        if (pd.tool === 'anchor') {
          canvas.style.cursor = hit?.kind === 'anchor' ? 'copy' : 'crosshair';
          return;
        }
        canvas.style.cursor = 'crosshair';
      };
      const cleanupFns = [];
      canvases.forEach((canvas) => {
        const role = getCanvasRole(canvas);
        canvasByRole.set(role, canvas);
      });
      canvases.forEach((canvas) => {
        const role = getCanvasRole(canvas);
        const hoverKey = role;
        const touchPoints = new Map();
        let pinch = null;
        const readPair = () => {
          if (touchPoints.size < 2) return null;
          const values = Array.from(touchPoints.values());
          return [values[0], values[1]];
        };
        const onDown = (e) => {
          if (role === 'inner' || role === 'outer') activateCanvasSide(canvas);
          if (e.pointerType === 'touch') {
            touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPoints.size >= 2) {
              const pair = readPair();
              if (pair) {
                const [a, b] = pair;
                const side = getSideForCanvas(canvas);
                const view = getViewForCanvas(canvas, side);
                pinch = {
                  side,
                  startZoom: view.zoom,
                  startPanX: view.panX,
                  startPanY: view.panY,
                  startCenter: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
                  startDistance: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
                };
                pd.drag = null;
              }
              if (canvas.setPointerCapture) {
                try {
                  canvas.setPointerCapture(e.pointerId);
                } catch (err) {
                  // Ignore capture failures.
                }
              }
              e.preventDefault();
              setCursor(canvas, e);
              return;
            }
          }
          if (pinch) return;
          if (e.button === 1) {
            e.preventDefault();
            const side = getSideForCanvas(canvas);
            pd.canvasPan = { pointerId: e.pointerId, canvas, side, x: e.clientX, y: e.clientY };
            setCursor(canvas, e);
            return;
          }
          if (e.button !== undefined && e.button !== 0) return;
          e.preventDefault();
          const side = getSideForCanvas(canvas);
          const shape = pd.state[side];
          const view = getViewForCanvas(canvas, side);
          const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
          const pos = this.getDesignerCanvasPoint(canvas, e);
          const hit = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
          const modifiers = readModifiers(e);
          if (pd.tool === 'direct' || (pd.tool === 'pen' && modifiers.meta)) {
            if (hit) {
              pd.drag = { mode: 'control', side, canvas, hit, pointerId: e.pointerId };
              setCursor(canvas, e);
              return;
            }
          } else if (pd.tool === 'pen') {
            if (modifiers.alt && hit && (hit.kind === 'anchor' || hit.kind === 'handle')) {
              this.toggleDesignerAnchor(shape, hit.index, hit.kind === 'handle' ? hit.which : null);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, side);
              applyChanges();
              setCursor(canvas, e);
              return;
            }
            if (hit) {
              pd.drag = { mode: 'control', side, canvas, hit, pointerId: e.pointerId };
              setCursor(canvas, e);
              return;
            }
            const index = this.insertDesignerAnchor(shape, canvas, pos, view);
            if (Number.isFinite(index)) {
              pd.drag = {
                mode: 'pen-new',
                side,
                canvas,
                pointerId: e.pointerId,
                index,
              };
            }
            applyChanges();
            setCursor(canvas, e);
            return;
          } else if (pd.tool === 'delete') {
            if (hit && hit.kind === 'anchor' && hit.index > 0 && hit.index < shape.anchors.length - 1 && shape.anchors.length > 3) {
              shape.anchors.splice(hit.index, 1);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, side);
              applyChanges();
            }
            setCursor(canvas, e);
            return;
          } else if (pd.tool === 'anchor') {
            if (hit && hit.kind === 'anchor') {
              this.toggleDesignerAnchor(shape, hit.index);
              this.normalizeDesignerShape(shape);
              this.syncInnerOuterLock(pd.state, side);
              applyChanges();
            }
            setCursor(canvas, e);
          }
        };
        const onMove = (e) => {
          if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
            touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }
          if (pinch) {
            const pair = readPair();
            if (!pair) return;
            const [a, b] = pair;
            const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
            const dist = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
            const view = this.getPetalDesignerView(pd.state, pinch.side);
            const ratio = dist / Math.max(1e-6, pinch.startDistance);
            view.zoom = clamp(pinch.startZoom * ratio, 0.35, 4.5);
            view.panX = pinch.startPanX + (center.x - pinch.startCenter.x);
            view.panY = pinch.startPanY + (center.y - pinch.startCenter.y);
            this.renderPetalDesigner(pd);
            if (e.cancelable) e.preventDefault();
            setCursor(canvas, e);
            return;
          }
          if (pd.canvasPan && pd.canvasPan.canvas === canvas) {
            if (pd.canvasPan.pointerId !== undefined && e.pointerId !== undefined && pd.canvasPan.pointerId !== e.pointerId) return;
            const view = getViewForCanvas(canvas, pd.canvasPan.side);
            view.panX += e.clientX - pd.canvasPan.x;
            view.panY += e.clientY - pd.canvasPan.y;
            pd.canvasPan.x = e.clientX;
            pd.canvasPan.y = e.clientY;
            this.renderPetalDesigner(pd);
            setCursor(canvas, e);
            return;
          }
          if (!pd.drag) {
            if (e.pointerType !== 'touch') {
              const side = getSideForCanvas(canvas);
              const shape = pd.state?.[side];
              const view = getViewForCanvas(canvas, side);
              const symmetry = this.getPetalDesignerSymmetryForSide(pd.state, side);
              if (shape) {
                const pos = this.getDesignerCanvasPoint(canvas, e);
                pd.canvasHover[hoverKey] = this.hitDesignerShapeControl(shape, canvas, pos, view, symmetry);
              } else {
                pd.canvasHover[hoverKey] = null;
              }
              setCursor(canvas, e);
            }
            return;
          }
          if (pd.drag.canvas !== canvas) return;
          if (pd.drag.pointerId !== undefined && e.pointerId !== undefined && pd.drag.pointerId !== e.pointerId) return;
          const { side, canvas: dragCanvas, hit } = pd.drag;
          const shape = pd.state[side];
          if (!shape) return;
          const view = getViewForCanvas(dragCanvas, side);
          const pos = this.getDesignerCanvasPoint(dragCanvas, e);
          if (pd.drag.mode === 'pen-new') {
            this.updateDesignerPenHandleDrag(shape, pd.drag.index, dragCanvas, pos, e, view);
          } else {
            this.updateDesignerDrag(shape, dragCanvas, hit, pos, e, view);
          }
          this.normalizeDesignerShape(shape);
          this.syncInnerOuterLock(pd.state, side);
          applyChanges({ live: true });
          setCursor(canvas, e);
        };
        const onUp = (e) => {
          const hadDrag = Boolean(pd.drag && pd.drag.canvas === canvas);
          if (e.pointerType === 'touch') {
            touchPoints.delete(e.pointerId);
            if (touchPoints.size < 2) pinch = null;
          }
          if (pd.canvasPan && pd.canvasPan.canvas === canvas && pd.canvasPan.pointerId !== undefined && e.pointerId !== undefined && pd.canvasPan.pointerId === e.pointerId) {
            pd.canvasPan = null;
            setCursor(canvas, e);
          }
          if (pd.drag && pd.drag.canvas === canvas) {
            if (pd.drag.pointerId !== undefined && e.pointerId !== undefined && pd.drag.pointerId !== e.pointerId) return;
            pd.drag = null;
            if (hadDrag) applyChanges();
          }
          setCursor(canvas, e);
        };
        const onWheel = (e) => {
          e.preventDefault();
          if (role === 'inner' || role === 'outer') activateCanvasSide(canvas);
          const pos = this.getDesignerCanvasPoint(canvas, e);
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          zoomBothSides(canvas, pos, factor);
          this.renderPetalDesigner(pd);
          canvases.forEach((entry) => setCursor(entry, e));
        };
        const onLeave = () => {
          pd.canvasHover[hoverKey] = null;
          setCursor(canvas);
        };
        const onResize = () => this.renderPetalDesigner(pd);
        const resizeObserver =
          typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => this.renderPetalDesigner(pd))
            : null;
        if (resizeObserver) resizeObserver.observe(canvas);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerleave', onLeave);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('resize', onResize);
        cleanupFns.push(() => {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointerleave', onLeave);
          canvas.removeEventListener('wheel', onWheel);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          window.removeEventListener('resize', onResize);
          if (resizeObserver) resizeObserver.disconnect();
        });
        this.syncDesignerCanvasResolution(canvas);
        setCursor(canvas);
      });
      pd.cleanupCanvas = () => {
        cleanupFns.forEach((cleanup) => cleanup());
      };
    }

    getDesignerCanvasMetrics(canvas) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const width = Math.max(1, rect.width || canvas?.clientWidth || canvas?.width / dpr || 1);
      const height = Math.max(1, rect.height || canvas?.clientHeight || canvas?.height / dpr || 1);
      return { width, height, dpr };
    }

    syncDesignerCanvasResolution(canvas) {
      if (!canvas) return this.getDesignerCanvasMetrics(canvas);
      const metrics = this.getDesignerCanvasMetrics(canvas);
      const targetWidth = Math.max(1, Math.round(metrics.width * metrics.dpr));
      const targetHeight = Math.max(1, Math.round(metrics.height * metrics.dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      return metrics;
    }

    getDesignerCanvasPoint(canvas, e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    normalizePetalDesignerWidthRatio(value, fallback = 1) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return clamp(fallback, 0.01, 2);
      return clamp(numeric, 0.01, 2);
    }

    getPetalDesignerWidthRatioForCanvas(canvas, fallback = 1) {
      const resolveFromDesigner = (designerState) => {
        if (!designerState?.root || !designerState?.state || !canvas || !designerState.root.contains(canvas)) {
          return null;
        }
        const layer = this.getLayerById(designerState.state.layerId);
        const value = layer?.params?.petalWidthRatio ?? designerState.state?.widthRatio;
        return this.normalizePetalDesignerWidthRatio(value, fallback);
      };
      return resolveFromDesigner(this.petalDesigner)
        ?? resolveFromDesigner(this.inlinePetalDesigner)
        ?? this.normalizePetalDesignerWidthRatio(fallback, 1);
    }

    designerToCanvas(canvas, point, view = null) {
      const { width: w, height: h } = this.getDesignerCanvasMetrics(canvas);
      const cx = w * 0.5;
      const baseY = h * 0.88;
      const tSpan = h * 0.74;
      const widthRatio = this.getPetalDesignerWidthRatioForCanvas(canvas, 1);
      const widthScale = widthRatio / PETAL_DESIGNER_WIDTH_MATCH_BASELINE;
      const wSpan = w * 0.28 * widthScale;
      const zoom = Math.max(0.35, view?.zoom ?? 1);
      const panX = view?.panX ?? 0;
      const panY = view?.panY ?? 0;
      const baseX = cx + point.w * wSpan;
      const baseYY = baseY - point.t * tSpan;
      return {
        x: (baseX - cx) * zoom + cx + panX,
        y: (baseYY - h * 0.5) * zoom + h * 0.5 + panY,
      };
    }

    canvasToDesigner(canvas, point, view = null, options = {}) {
      const { width: w, height: h } = this.getDesignerCanvasMetrics(canvas);
      const cx = w * 0.5;
      const baseY = h * 0.88;
      const tSpan = h * 0.74;
      const widthRatio = this.getPetalDesignerWidthRatioForCanvas(canvas, 1);
      const widthScale = widthRatio / PETAL_DESIGNER_WIDTH_MATCH_BASELINE;
      const wSpan = w * 0.28 * widthScale;
      const zoom = Math.max(0.35, view?.zoom ?? 1);
      const panX = view?.panX ?? 0;
      const panY = view?.panY ?? 0;
      const baseX = (point.x - cx - panX) / zoom + cx;
      const baseYY = (point.y - h * 0.5 - panY) / zoom + h * 0.5;
      const rawT = (baseY - baseYY) / Math.max(1e-6, tSpan);
      const clampT = options?.clampT !== false;
      return {
        t: clampT ? clamp(rawT, 0, 1) : rawT,
        w: (baseX - cx) / Math.max(1e-6, wSpan),
      };
    }

    sampleDesignerWidthAt(edge, t) {
      if (!Array.isArray(edge) || edge.length < 2) return 0;
      if (t <= edge[0].t) return Math.max(0, edge[0].w);
      if (t >= edge[edge.length - 1].t) return Math.max(0, edge[edge.length - 1].w);
      for (let i = 1; i < edge.length; i++) {
        const a = edge[i - 1];
        const b = edge[i];
        if (t <= b.t + 1e-6) {
          const denom = Math.max(1e-6, b.t - a.t);
          const mix = clamp((t - a.t) / denom, 0, 1);
          return Math.max(0, lerp(a.w, b.w, mix));
        }
      }
      return Math.max(0, edge[edge.length - 1].w);
    }

    applyDesignerEdgeSymmetry(edge, symmetry = 'none') {
      if (!Array.isArray(edge) || edge.length < 2) return edge || [];
      const mode = this.normalizeDesignerSymmetryMode(symmetry);
      if (!this.designerSymmetryHasVerticalAxis(mode)) {
        return edge.map((pt) => ({ t: clamp(pt.t, 0, 1), w: Math.max(0, pt.w) }));
      }
      return edge.map((pt) => {
        const t = clamp(pt.t, 0, 1);
        const mirrored = this.sampleDesignerWidthAt(edge, 1 - t);
        return { t, w: Math.max(0, (Math.max(0, pt.w) + mirrored) * 0.5) };
      });
    }

    sampleDesignerEdge(shape, stepsPerSeg = 18, symmetry = 'none') {
      this.normalizeDesignerShape(shape);
      const anchors = shape.anchors || [];
      if (anchors.length < 2) return [];
      const cubic = (p0, p1, p2, p3, t) => {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        return {
          t: uuu * p0.t + 3 * uu * t * p1.t + 3 * u * tt * p2.t + ttt * p3.t,
          w: uuu * p0.w + 3 * uu * t * p1.w + 3 * u * tt * p2.w + ttt * p3.w,
        };
      };
      const out = [];
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        const c1 = a.out || { t: lerp(a.t, b.t, 1 / 3), w: a.w };
        const c2 = b.in || { t: lerp(a.t, b.t, 2 / 3), w: b.w };
        for (let s = 0; s <= stepsPerSeg; s++) {
          if (out.length && s === 0) continue;
          const pt = cubic(a, c1, c2, b, s / stepsPerSeg);
          out.push({ t: clamp(pt.t, 0, 1), w: Math.max(0, pt.w) });
        }
      }
      return this.applyDesignerEdgeSymmetry(out, symmetry);
    }

    buildDesignerPolygon(shape, symmetry = 'none') {
      const right = this.sampleDesignerEdge(shape, 36, symmetry);
      if (!right.length) return [];
      const left = right
        .slice(1, -1)
        .reverse()
        .map((pt) => ({ t: pt.t, w: -pt.w }));
      return right.concat(left);
    }

    drawDesignerGrid(ctx, canvas) {
      const { width, height, dpr } = this.syncDesignerCanvasResolution(canvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.fillStyle = '#0f1116';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.lineWidth = 1;
      const gap = 20;
      for (let x = 0; x <= width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawDesignerShape(canvas, shape, options = {}) {
      const {
        shading = null,
        shadings = null,
        showControls = false,
        view = null,
        symmetry = 'none',
        clearCanvas = true,
        fillStyle = 'rgba(56, 189, 248, 0.08)',
        strokeStyle = '#67e8f9',
      } = options;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (clearCanvas) this.drawDesignerGrid(ctx, canvas);
      const polygon = this.buildDesignerPolygon(shape, symmetry);
      if (!polygon.length) return;
      const points = polygon.map((pt) => this.designerToCanvas(canvas, pt, view));

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.4;
      ctx.fill();
      ctx.stroke();

      const activeShadings = Array.isArray(shadings)
        ? shadings.filter((item) => item && item.enabled !== false)
        : shading
        ? [shading]
        : [];
      if (activeShadings.length) {
        ctx.save();
        ctx.clip();
        const center = points.reduce(
          (acc, point) => {
            acc.x += point.x;
            acc.y += point.y;
            return acc;
          },
          { x: 0, y: 0 }
        );
        center.x /= Math.max(1, points.length);
        center.y /= Math.max(1, points.length);
        const edge = this.sampleDesignerEdge(shape, 96, symmetry);
        const seededUnit = (seed) => {
          const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
          return raw - Math.floor(raw);
        };
        const sampleWidthAt = (t) => {
          const safeT = clamp(t, 0, 1);
          if (!edge.length) return 0;
          if (edge.length === 1) return Math.max(0, edge[0].w || 0);
          for (let i = 1; i < edge.length; i++) {
            const a = edge[i - 1];
            const b = edge[i];
            if (safeT > b.t && i < edge.length - 1) continue;
            const span = Math.max(1e-6, b.t - a.t);
            const mix = clamp((safeT - a.t) / span, 0, 1);
            return Math.max(0, lerp(a.w, b.w, mix));
          }
          return Math.max(0, edge[edge.length - 1].w || 0);
        };
        const pointAt = (t, offset) => {
          const w = sampleWidthAt(t);
          return this.designerToCanvas(canvas, { t: clamp(t, 0, 1), w: clamp(offset, -1, 1) * w }, view);
        };
        const rotatePath = (path, deg = 0) => {
          if (!Array.isArray(path) || path.length < 2) return path;
          const rad = (deg * Math.PI) / 180;
          if (Math.abs(rad) < 1e-5) return path;
          const pivot = path.reduce(
            (acc, pt) => {
              acc.x += pt.x;
              acc.y += pt.y;
              return acc;
            },
            { x: 0, y: 0 }
          );
          pivot.x /= Math.max(1, path.length);
          pivot.y /= Math.max(1, path.length);
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          return path.map((pt) => {
            const dx = pt.x - pivot.x;
            const dy = pt.y - pivot.y;
            return {
              x: pivot.x + dx * cos - dy * sin,
              y: pivot.y + dx * sin + dy * cos,
            };
          });
        };
        const strokePath = (path) => {
          if (!Array.isArray(path) || path.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
        };
        const slicePathByPattern = (path, dash, gap) => {
          if (!Array.isArray(path) || path.length < 2) return [];
          const segments = [];
          let draw = true;
          let remaining = dash;
          let current = [];
          for (let i = 0; i < path.length - 1; i++) {
            let a = path[i];
            let b = path[i + 1];
            let segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen < 1e-6) continue;
            while (segLen > 1e-6) {
              const step = Math.min(segLen, remaining);
              const t = step / segLen;
              const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
              if (draw) {
                if (!current.length) current.push(a);
                current.push(pt);
              }
              segLen -= step;
              a = pt;
              if (Math.abs(step - remaining) < 1e-6) {
                if (draw && current.length > 1) segments.push(current);
                current = [];
                draw = !draw;
                remaining = draw ? dash : gap;
              } else {
                remaining -= step;
              }
            }
          }
          if (draw && current.length > 1) segments.push(current);
          return segments;
        };
        const applyLineType = (path, lineType, spacingPx) => {
          const safeSpacing = Math.max(2, spacingPx || 4);
          if (lineType === 'dashed') {
            return slicePathByPattern(path, safeSpacing * 2, safeSpacing * 1.2);
          }
          if (lineType === 'dotted') {
            return slicePathByPattern(path, safeSpacing * 0.4, safeSpacing * 1.4);
          }
          if (lineType === 'stitch') {
            return slicePathByPattern(path, safeSpacing * 1.2, safeSpacing * 0.8);
          }
          return [path];
        };
        const buildRanges = (shade) => {
          const widthX = clamp(shade.widthX ?? 100, 0, 100) / 100;
          const posX = clamp(shade.posX ?? 50, 0, 100) / 100;
          const half = widthX * 0.5;
          const tStart = clamp(posX - half, 0, 1);
          const tEnd = clamp(posX + half, 0, 1);
          const gapX = clamp(shade.gapX ?? 0, 0, 100) / 100;
          const gapPosX = clamp(shade.gapPosX ?? 50, 0, 100) / 100;
          const gapHalf = gapX * 0.5;
          const gapStart = gapPosX - gapHalf;
          const gapEnd = gapPosX + gapHalf;
          const ranges = [];
          if (gapX > 0 && gapStart < tEnd && gapEnd > tStart) {
            if (tStart < gapStart) ranges.push([tStart, clamp(gapStart, 0, 1)]);
            if (gapEnd < tEnd) ranges.push([clamp(gapEnd, 0, 1), tEnd]);
          } else {
            ranges.push([tStart, tEnd]);
          }
          return ranges;
        };
        const buildOffsets = (shade, spacingPx) => {
          const widthY = clamp(shade.widthY ?? 100, 0, 100) / 100;
          const posY = clamp(shade.posY ?? 50, 0, 100) / 100;
          const offsetCenter = (posY - 0.5) * 2;
          const halfRange = widthY;
          const offsetStart = clamp(offsetCenter - halfRange, -1, 1);
          const offsetEnd = clamp(offsetCenter + halfRange, -1, 1);
          const gapY = clamp(shade.gapY ?? 0, 0, 100) / 100;
          const gapPosY = clamp(shade.gapPosY ?? 50, 0, 100) / 100;
          const gapCenter = (gapPosY - 0.5) * 2;
          const gapHalf = gapY;
          const gapStart = gapCenter - gapHalf;
          const gapEnd = gapCenter + gapHalf;
          const density = Math.max(0.2, shade.density ?? 1);
          const widthPx = Math.max(8, sampleWidthAt(clamp(posY, 0, 1)) * 2);
          const span = Math.abs(offsetEnd - offsetStart) * widthPx;
          const count = Math.max(1, Math.round((span / Math.max(1, spacingPx)) * density));
          return { offsetStart, offsetEnd, gapStart, gapEnd, count };
        };
        const buildLinePath = (shade, offset, tStart, tEnd, seedBase, options = {}) => {
          const { angleOffset = 0, gradient = false, spiral = false } = options;
          const span = Math.max(1e-4, tEnd - tStart);
          const steps = Math.max(10, Math.round(70 * span));
          const jitter = clamp(shade.jitter ?? 0, 0, 1);
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const mix = i / steps;
            const t = lerp(tStart, tEnd, mix);
            let localOffset = offset;
            if (spiral) localOffset += (mix - 0.5) * 0.6;
            if (gradient) localOffset = lerp(localOffset, localOffset * 0.45, mix);
            if (jitter > 0) {
              const unit = seededUnit(seedBase + i * 17.37);
              localOffset += (unit - 0.5) * jitter * 0.35;
            }
            pts.push(pointAt(t, localOffset));
          }
          return rotatePath(pts, (shade.angle ?? 0) + angleOffset);
        };
        const strokePolygon = (scale = 1) => {
          const path = points.map((pt) => ({
            x: center.x + (pt.x - center.x) * scale,
            y: center.y + (pt.y - center.y) * scale,
          }));
          if (!path.length) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
          ctx.closePath();
          ctx.stroke();
        };

        activeShadings.forEach((shade, idx) => {
          const alpha = 0.22 + Math.min(idx, 4) * 0.08;
          ctx.strokeStyle = `rgba(125, 211, 252, ${Math.min(0.6, alpha).toFixed(2)})`;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = 1;
          const type = shade.type || 'radial';
          const spacingPx = Math.max(2, (shade.lineSpacing ?? 1) * 8);
          const lineType = shade.lineType || 'solid';
          const ranges = buildRanges(shade);
          const { offsetStart, offsetEnd, gapStart, gapEnd, count } = buildOffsets(shade, spacingPx);

          if (type === 'outline' || type === 'rim' || type === 'contour') {
            strokePolygon(1);
            if (type === 'rim') {
              strokePolygon(0.93);
            }
            if (type === 'contour') {
              const levels = clamp(Math.round(2 + (shade.density ?? 1) * 3), 2, 8);
              for (let i = 1; i <= levels; i++) {
                const scale = 1 - (i / (levels + 1)) * 0.36;
                strokePolygon(scale);
              }
            }
            return;
          }

          for (let i = 0; i < count; i++) {
            const frac = count === 1 ? 0.5 : i / (count - 1);
            let offset = lerp(offsetStart, offsetEnd, frac);
            if (offset >= gapStart && offset <= gapEnd) continue;
            if (type === 'chiaroscuro') {
              offset = lerp(offsetStart, offsetEnd, Math.pow(frac, 1.6));
            }
            if (type === 'edge') {
              const edgeMix = frac < 0.5 ? frac * 2 : (frac - 0.5) * 2;
              offset =
                frac < 0.5
                  ? lerp(offsetStart, -0.75, edgeMix)
                  : lerp(0.75, offsetEnd, edgeMix);
            }
            ranges.forEach(([tStart, tEnd], rangeIndex) => {
              if (tEnd <= tStart) return;
              let localStart = tStart;
              let localEnd = tEnd;
              const lengthJitter = clamp(shade.lengthJitter ?? 0, 0, 1);
              if (lengthJitter > 0) {
                const span = Math.max(0.001, tEnd - tStart);
                const jitterAmt = span * lengthJitter * 0.5;
                const startJitter = seededUnit(idx * 500 + i * 67 + rangeIndex * 11 + 1) - 0.5;
                const endJitter = seededUnit(idx * 500 + i * 67 + rangeIndex * 11 + 2) - 0.5;
                localStart = clamp(tStart + startJitter * jitterAmt, 0, 1);
                localEnd = clamp(tEnd + endJitter * jitterAmt, 0, 1);
                if (localEnd < localStart) [localStart, localEnd] = [localEnd, localStart];
                if (localEnd - localStart < 0.01) return;
              }
              const seedBase = idx * 1000 + i * 37 + rangeIndex * 101;
              if (type === 'stipple') {
                const dots = Math.max(
                  6,
                  Math.round((localEnd - localStart) * 42 * Math.max(0.2, shade.density ?? 1))
                );
                const jitter = clamp(shade.jitter ?? 0, 0, 1);
                for (let d = 0; d < dots; d++) {
                  const t = lerp(localStart, localEnd, (d + 1) / (dots + 1));
                  const jitterUnit = seededUnit(seedBase + d * 7) - 0.5;
                  const dotPt = pointAt(t, offset + jitterUnit * jitter * 0.35);
                  ctx.beginPath();
                  ctx.arc(dotPt.x, dotPt.y, 0.8, 0, Math.PI * 2);
                  ctx.fill();
                }
                return;
              }
              const drawPath = (linePath) => {
                const typed = applyLineType(linePath, lineType, spacingPx);
                typed.forEach((segment) => strokePath(segment));
              };
              if (type === 'crosshatch') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { angleOffset: 0 }));
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase + 13, { angleOffset: 90 }));
                return;
              }
              if (type === 'spiral') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { spiral: true }));
                return;
              }
              if (type === 'gradient') {
                drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase, { gradient: true }));
                return;
              }
              drawPath(buildLinePath(shade, offset, localStart, localEnd, seedBase));
            });
          }
        });
        ctx.restore();
      }

      if (showControls) {
        const controls = this.sampleDesignerControls(shape, canvas, view, symmetry);
        controls.forEach((control) => {
          if (control.kind === 'handle') {
            const anchorW = control.mirror ? -control.anchor.w : control.anchor.w;
            const anchor = this.designerToCanvas(canvas, { t: control.anchor.t, w: anchorW }, view);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(control.point.x, control.point.y);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = control.kind === 'anchor' ? '#22d3ee' : '#67e8f9';
          ctx.lineWidth = 1.2;
          const r = control.kind === 'anchor' ? 3.2 : 2.3;
          ctx.arc(control.point.x, control.point.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    sampleDesignerControls(shape, canvas, view = null, symmetry = 'none') {
      const out = [];
      const mirrorEpsilon = 1e-6;
      const showMirroredControls = this.designerSymmetryHasHorizontalAxis(symmetry);
      this.normalizeDesignerShape(shape);
      (shape.anchors || []).forEach((anchor, index) => {
        const base = this.designerToCanvas(canvas, anchor, view);
        out.push({ kind: 'anchor', point: base, index, mirror: false, anchor });
        if (showMirroredControls && index > 0 && index < shape.anchors.length - 1) {
          const mirror = this.designerToCanvas(canvas, { t: anchor.t, w: -anchor.w }, view);
          out.push({ kind: 'anchor', point: mirror, index, mirror: true, anchor });
        }
        if (anchor.in) {
          out.push({
            kind: 'handle',
            which: 'in',
            point: this.designerToCanvas(canvas, anchor.in, view),
            index,
            mirror: false,
            anchor,
          });
          if (showMirroredControls && Math.abs(anchor.in.w) > mirrorEpsilon) {
            out.push({
              kind: 'handle',
              which: 'in',
              point: this.designerToCanvas(canvas, { t: anchor.in.t, w: -anchor.in.w }, view),
              index,
              mirror: true,
              anchor,
            });
          }
        }
        if (anchor.out) {
          out.push({
            kind: 'handle',
            which: 'out',
            point: this.designerToCanvas(canvas, anchor.out, view),
            index,
            mirror: false,
            anchor,
          });
          if (showMirroredControls && Math.abs(anchor.out.w) > mirrorEpsilon) {
            out.push({
              kind: 'handle',
              which: 'out',
              point: this.designerToCanvas(canvas, { t: anchor.out.t, w: -anchor.out.w }, view),
              index,
              mirror: true,
              anchor,
            });
          }
        }
      });
      return out;
    }

    hitDesignerShapeControl(shape, canvas, pos, view = null, symmetry = 'none') {
      const controls = this.sampleDesignerControls(shape, canvas, view, symmetry);
      let best = null;
      let bestDist = Infinity;
      controls.forEach((control) => {
        const dx = pos.x - control.point.x;
        const dy = pos.y - control.point.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = control;
        }
      });
      return bestDist <= 10 ? best : null;
    }

    toggleDesignerAnchor(shape, index, which = null) {
      const anchor = shape?.anchors?.[index];
      if (!anchor) return;
      if (which === 'in' || which === 'out') {
        if (anchor[which]) {
          anchor[which] = null;
          return;
        }
        const opposite = which === 'in' ? 'out' : 'in';
        const source = anchor[opposite] || { t: anchor.t + (which === 'out' ? 0.08 : -0.08), w: anchor.w };
        const dt = anchor.t - source.t;
        const dw = anchor.w - source.w;
        anchor[which] = {
          t: anchor.t + dt,
          w: anchor.w + dw,
        };
        return;
      }
      if (anchor.in || anchor.out) {
        anchor.in = null;
        anchor.out = null;
        return;
      }
      const prev = shape.anchors[Math.max(0, index - 1)] || anchor;
      const next = shape.anchors[Math.min(shape.anchors.length - 1, index + 1)] || anchor;
      const dt = Math.max(0.05, Math.min(0.2, (next.t - prev.t) * 0.33));
      anchor.in = { t: anchor.t - dt, w: anchor.w };
      anchor.out = { t: anchor.t + dt, w: anchor.w };
    }

    insertDesignerAnchor(shape, canvas, pos, view = null) {
      const p = this.canvasToDesigner(canvas, pos, view);
      const w = Math.max(0, Math.abs(p.w));
      let insertAt = shape.anchors.findIndex((anchor) => anchor.t > p.t);
      if (insertAt <= 0) insertAt = shape.anchors.length - 1;
      const prev = shape.anchors[Math.max(0, insertAt - 1)];
      const next = shape.anchors[Math.min(shape.anchors.length - 1, insertAt)];
      const t = clamp(p.t, (prev?.t ?? 0) + 0.02, (next?.t ?? 1) - 0.02);
      const dt = Math.max(0.04, Math.min(0.2, ((next?.t ?? 1) - (prev?.t ?? 0)) * 0.18));
      shape.anchors.splice(insertAt, 0, {
        t,
        w,
        in: { t: t - dt, w },
        out: { t: t + dt, w },
      });
      this.normalizeDesignerShape(shape);
      return insertAt;
    }

    snapDesignerHandle(anchor, point) {
      const dt = point.t - anchor.t;
      const dw = point.w - anchor.w;
      if (Math.abs(dt) >= Math.abs(dw)) {
        return { t: point.t, w: anchor.w };
      }
      return { t: anchor.t, w: point.w };
    }

    updateDesignerPenHandleDrag(shape, index, canvas, pos, e, view = null) {
      const anchor = shape?.anchors?.[index];
      if (!anchor) return;
      const pRaw = this.canvasToDesigner(canvas, pos, view, { clampT: false });
      const p = e?.shiftKey ? this.snapDesignerHandle(anchor, pRaw) : pRaw;
      const prev = shape.anchors[index - 1];
      const next = shape.anchors[index + 1];
      const nextT = clamp(
        p.t,
        (prev?.t ?? anchor.t) - 1,
        (next?.t ?? anchor.t) + 1
      );
      const nextW = p.w;
      const dist = Math.hypot(nextT - anchor.t, nextW - anchor.w);
      if (dist <= 0.01) {
        anchor.in = null;
        anchor.out = null;
        return;
      }
      anchor.out = { t: nextT, w: nextW };
      const breakHandle = Boolean(e?.altKey || SETTINGS.touchModifiers?.alt);
      if (!breakHandle) {
        const dt = anchor.t - nextT;
        const dw = anchor.w - nextW;
        anchor.in = { t: anchor.t + dt, w: anchor.w + dw };
      }
    }

    updateDesignerDrag(shape, canvas, hit, pos, e, view = null) {
      const anchor = shape.anchors[hit.index];
      if (!anchor) return;
      const pRaw = this.canvasToDesigner(canvas, pos, view, { clampT: hit.kind === 'anchor' });
      const p = e?.shiftKey && hit.kind === 'handle' ? this.snapDesignerHandle(anchor, pRaw) : pRaw;
      const controlPoint = hit.kind === 'handle' && hit.mirror ? { t: p.t, w: -p.w } : p;
      if (hit.kind === 'anchor') {
        if (hit.index === 0 || hit.index === shape.anchors.length - 1) return;
        const prev = shape.anchors[hit.index - 1];
        const next = shape.anchors[hit.index + 1];
        const nextT = clamp(p.t, (prev?.t ?? 0) + 0.02, (next?.t ?? 1) - 0.02);
        const nextW = Math.max(0, Math.abs(p.w));
        const dt = nextT - anchor.t;
        const dw = nextW - anchor.w;
        anchor.t = nextT;
        anchor.w = nextW;
        if (anchor.in) {
          anchor.in.t = anchor.in.t + dt;
          anchor.in.w = anchor.in.w + dw;
        }
        if (anchor.out) {
          anchor.out.t = anchor.out.t + dt;
          anchor.out.w = anchor.out.w + dw;
        }
      } else if (hit.kind === 'handle') {
        const which = hit.which;
        anchor[which] = {
          t: controlPoint.t,
          w: controlPoint.w,
        };
        const breakHandle = Boolean(e.altKey || SETTINGS.touchModifiers?.alt);
        if (!breakHandle) {
          const dt = anchor.t - anchor[which].t;
          const dw = anchor.w - anchor[which].w;
          const opposite = which === 'in' ? 'out' : 'in';
          anchor[opposite] = {
            t: anchor.t + dt,
            w: anchor.w + dw,
          };
        }
      }
    }

    renderPetalDesigner(pd = this.petalDesigner) {
      if (!pd?.root) return;
      const overlayCanvas = pd.root.querySelector('canvas[data-petal-canvas="overlay"]');
      const innerCanvas = pd.root.querySelector('canvas[data-petal-canvas="inner"]');
      const outerCanvas = pd.root.querySelector('canvas[data-petal-canvas="outer"]');
      if (!overlayCanvas && !innerCanvas && !outerCanvas) return;
      this.syncPetalDesignerControls(pd);
      const activeSide = this.getPetalDesignerTarget(pd.state);
      const viewStyle = this.normalizePetalDesignerViewStyle(pd.state?.viewStyle);
      const allShadings = this.normalizePetalDesignerShadings(pd.state, { defaultTarget: 'both' });
      const shadingForSide = (side) =>
        allShadings.filter((shade) => {
          const target = this.normalizePetalDesignerShadingTarget(shade?.target, 'both');
          return target === 'both' || target === side;
        });
      const drawSide = (canvas, side, options = {}) => {
        if (!canvas) return;
        const isActive = side === activeSide;
        const showControls = options.showControls !== undefined ? options.showControls : isActive;
        const shape = side === 'inner' ? pd.state.inner : pd.state.outer;
        const clearCanvas = options.clearCanvas !== false;
        this.drawDesignerShape(canvas, shape, {
          shadings: shadingForSide(side),
          showControls,
          view: this.getPetalDesignerView(pd.state, side),
          symmetry: this.getPetalDesignerSymmetryForSide(pd.state, side),
          clearCanvas,
          fillStyle: isActive ? 'rgba(56, 189, 248, 0.1)' : 'rgba(34, 211, 238, 0.05)',
          strokeStyle: isActive ? '#67e8f9' : 'rgba(103, 232, 249, 0.55)',
        });
      };
      if (viewStyle === 'side-by-side') {
        drawSide(innerCanvas, 'inner', {
          showControls: activeSide === 'inner',
        });
        drawSide(outerCanvas, 'outer', {
          showControls: activeSide === 'outer',
        });
        return;
      }
      const canvas = overlayCanvas || innerCanvas || outerCanvas;
      const drawOrder = activeSide === 'inner' ? ['outer', 'inner'] : ['inner', 'outer'];
      drawOrder.forEach((side, index) => {
        drawSide(canvas, side, {
          showControls: side === activeSide,
          clearCanvas: index === 0,
        });
      });
    }

    applyPetalDesignerToLayer(state, options = {}) {
      const { refreshControls = true, persistState = true } = options;
      if (!state) return;
      const layer = this.getLayerById(state.layerId);
      if (!layer || !isPetalisLayerType(layer.type)) return;
      state.target = this.normalizePetalDesignerRingTarget(state.activeTarget ?? state.target, 'inner');
      state.viewStyle = this.normalizePetalDesignerViewStyle(state.viewStyle);
      state.activeTarget = state.target === 'outer' ? 'outer' : 'inner';
      state.target = state.activeTarget;
      this.syncInnerOuterLock(state, state.activeTarget);
      this.normalizeDesignerShape(state.outer);
      this.normalizeDesignerShape(state.inner);
      const params = layer.params || {};
      const selections = this.ensurePetalDesignerProfileSelections(state);
      state.innerSymmetry = this.getPetalDesignerSymmetryForSide(state, 'inner');
      state.outerSymmetry = this.getPetalDesignerSymmetryForSide(state, 'outer');
      state.designerSymmetry = this.getPetalDesignerSymmetryForSide(state, state.activeTarget);
      state.innerCount = Math.round(
        clamp(
          state.innerCount ?? params.innerCount ?? PETALIS_DESIGNER_DEFAULT_INNER_COUNT,
          5,
          400
        )
      );
      state.outerCount = Math.round(
        clamp(
          state.outerCount ?? params.outerCount ?? PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
          5,
          600
        )
      );
      const countSplit = this.syncPetalDesignerTransitionFromCounts(state);
      state.profileTransitionFeather = clamp(state.profileTransitionFeather ?? params.profileTransitionFeather ?? 0, 0, 100);
      state.count = Math.round(
        clamp(
          state.innerCount + state.outerCount,
          5,
          800
        )
      );
      state.seed = Math.round(clamp(state.seed ?? params.seed ?? 1, 0, 9999));
      state.countJitter = clamp(state.countJitter ?? params.countJitter ?? 0.1, 0, 0.5);
      state.sizeJitter = clamp(state.sizeJitter ?? params.sizeJitter ?? 0.12, 0, 0.5);
      state.rotationJitter = clamp(state.rotationJitter ?? params.rotationJitter ?? 6, 0, 45);
      state.angularDrift = clamp(state.angularDrift ?? params.angularDrift ?? 0, 0, 45);
      state.driftStrength = clamp(state.driftStrength ?? params.driftStrength ?? 0.1, 0, 1);
      state.driftNoise = clamp(state.driftNoise ?? params.driftNoise ?? 0.2, 0.05, 1);
      state.radiusScale = clamp(state.radiusScale ?? params.radiusScale ?? 0.2, -1, 1);
      state.radiusScaleCurve = clamp(state.radiusScaleCurve ?? params.radiusScaleCurve ?? 1.2, 0.5, 2.5);
      params.designerOuter = JSON.parse(JSON.stringify(state.outer));
      params.designerInner = JSON.parse(JSON.stringify(state.inner));
      params.designerSymmetry = state.designerSymmetry;
      params.designerInnerSymmetry = state.innerSymmetry;
      params.designerOuterSymmetry = state.outerSymmetry;
      params.designerProfileSelectionInner = selections.inner;
      params.designerProfileSelectionOuter = selections.outer;
      params.petalVisualizerViewStyle = state.viewStyle;
      params.count = state.count;
      params.petalShape = state.activeTarget;
      params.petalRing = state.activeTarget;
      params.ringMode = 'dual';
      params.innerCount = state.innerCount;
      params.outerCount = state.outerCount;
      params.ringSplit = countSplit;
      params.innerOuterLock = Boolean(state.innerOuterLock);
      params.profileTransitionPosition = clamp(state.profileTransitionPosition ?? countSplit * 100, 0, 100);
      params.profileTransitionFeather = clamp(state.profileTransitionFeather ?? 0, 0, 100);
      params.petalSteps = Math.max(64, Math.round(params.petalSteps ?? 64));
      params.petalProfile = state.outer.profile || params.petalProfile || 'teardrop';
      params.petalWidthRatio = Number.isFinite(params.petalWidthRatio) ? params.petalWidthRatio : 1;
      state.widthRatio = this.normalizePetalDesignerWidthRatio(params.petalWidthRatio, 1);
      params.petalLengthRatio = 1;
      params.petalSizeRatio = 1;
      params.leafSidePos = 0.45;
      params.leafSideWidth = 1;
      params.centerProfile = null;
      params.centerSizeMorph = 0;
      params.centerSizeCurve = 1;
      params.centerShapeMorph = 0;
      params.centerWaveBoost = 0;
      params.edgeWaveAmp = 0;
      params.edgeWaveFreq = 0;
      params.seed = state.seed;
      params.countJitter = state.countJitter;
      params.sizeJitter = state.sizeJitter;
      params.rotationJitter = state.rotationJitter;
      params.angularDrift = state.angularDrift;
      params.driftStrength = state.driftStrength;
      params.driftNoise = state.driftNoise;
      params.radiusScale = state.radiusScale;
      params.radiusScaleCurve = state.radiusScaleCurve;
      const shadings = Array.isArray(state.shadings) ? state.shadings : [];
      state.shadings = shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
      );
      params.shadings = state.shadings.map((shade, index) =>
        this.normalizePetalDesignerShading(shade, index, { defaultTarget: 'both' })
      );
      const modifiers = this.normalizePetalDesignerModifiers(state);
      params.petalModifiers = modifiers.map((modifier, index) =>
        this.normalizePetalDesignerModifier(modifier, index)
      );
      if (persistState) this.storeLayerParams(layer);
      this.app.engine.generate(layer.id);
      if (this.app.engine.activeLayerId === layer.id) {
        if (refreshControls) this.buildControls();
        this.updateFormula();
      }
      this.renderLayers();
      this.app.render();
    }

    buildHelpContent(focusShortcuts = false) {
      const shortcuts = `
        <div class="modal-section">
          <div class="modal-ill-label">Keyboard Shortcuts</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div><span class="text-vectura-accent">?</span> Open shortcuts</div>
            <div><span class="text-vectura-accent">F1</span> Help guide</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + O</span> Open Project</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + S</span> Save Project</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + P</span> Import SVG</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + E</span> Export SVG</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + K</span> Settings</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + 0</span> Reset View</div>
            <div><span class="text-vectura-accent">V</span> Selection tool (press again to cycle modes)</div>
            <div><span class="text-vectura-accent">A</span> Direct selection tool</div>
            <div><span class="text-vectura-accent">P</span> Pen tool (press again to cycle subtools)</div>
            <div><span class="text-vectura-accent">+</span> Add anchor point tool</div>
            <div><span class="text-vectura-accent">-</span> Delete anchor point tool</div>
            <div><span class="text-vectura-accent">Shift + C</span> Anchor point tool</div>
            <div><span class="text-vectura-accent">C</span> Scissor tool (press again to cycle modes)</div>
            <div><span class="text-vectura-accent">Space</span> Hand tool (temporary)</div>
            <div><span class="text-vectura-accent">Petal Designer</span> A/P/+/-/Shift+C, Shift-constrain, Alt convert/break/remove handle, Cmd/Ctrl temporary direct</div>
            <div><span class="text-vectura-accent">Petal Designer</span> Middle-click drag pans, mouse wheel zooms both petals together when both are visible</div>
            <div><span class="text-vectura-accent">Enter</span> Commit pen path</div>
            <div><span class="text-vectura-accent">Double-click</span> Close pen path near start</div>
            <div><span class="text-vectura-accent">Backspace</span> Remove last pen point</div>
            <div><span class="text-vectura-accent">Esc</span> Cancel pen/scissor</div>
            <div><span class="text-vectura-accent">Shift</span> Constrain pen angle / handles (Scissor line snaps 15°)</div>
            <div><span class="text-vectura-accent">Alt/Option</span> Break pen handles</div>
            <div><span class="text-vectura-accent">Direct Tool</span> Drag endpoints/handles on individual line paths</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl</span> Temporary selection while using Pen</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + A</span> Select all layers (from anywhere)</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + G</span> Group selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + G</span> Ungroup selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + E</span> Expand selection into sublayers</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + D</span> Duplicate selection (Alt/Option + D fallback)</div>
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
            Wavetable noise stacks can be added, reordered, and blended with tile patterns and image effects.
            Image noise includes an Image Effects stack plus optional style shaping.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Petalis includes an embedded panel; use its pop-out icon (⧉) to open the same panel in a floating window and pop-in (↩) to dock it back.
            It includes flower presets, radial petal controls, a PETAL VISUALIZER pane (Overlay or Side by Side), a PROFILE EDITOR for inner/outer profile import/export, an Export Pair button below both profile cards, a shading stack with in-place hatch-angle rotation, and a matching modifier stack.
            Shape comes from editable inner/outer curves, each stack item has its own Petal Shape target (Inner/Outer/Both), and the designer keeps symmetry per side with a collapsible Randomness &amp; Seed section at the bottom.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            PROFILE dropdown entries come from <code>src/config/petal-profiles</code> and remain available when opening <code>index.html</code> directly (no local server required).
            If you edit profile JSON files, run <code>npm run profiles:bundle</code> so the <code>library.js</code> file:// fallback stays in sync.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Left panel sections are collapsible; Transform &amp; Seed lives inside Algorithm in its own collapsible sub-panel (collapsed by default), and ABOUT visibility is remembered.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Switching algorithms restores position, scale, and rotation to the target algorithm defaults.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Harmonograph layers combine damped pendulum waves; tweak frequency, phase, and damping for intricate loops.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Toggle pendulums on/off, add new ones, and enable Pendulum Guides to visualize each contribution.
            Use Anti-Loop Drift and Settle Cutoff to curb repeated loop paths.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Harmonograph includes a Virtual Plotter panel with playback speed controls and a scrubbable playhead preview.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Post-Processing Lab holds smoothing, curves, and simplify for the active layer.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Optimization tools (linesimplify, linesort, filter, multipass) can be previewed with replace/overlay and
            optionally included on export.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Use the File menu to Save/Open full .vectura projects, Import SVG, and Export SVG.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Angle controls use circular dials—drag the marker to set direction.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Double-click a value to edit it inline (Tab/Shift+Tab to hop between params; arrows nudge, Shift = 10x).
            Double-click a control to reset it to defaults.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Reset to Defaults restores full algorithm defaults, including transform values (seed, position, scale, rotation).
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Canvas</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Shift + Drag to pan</div>
            <div>Mouse wheel to zoom</div>
            <div>Petal Designer: middle-click drag pans and wheel zooms both visible petals equally.</div>
            <div>Touch: one-finger tool input, two-finger pan/pinch zoom.</div>
            <div>On tablets, use Shift/Alt/Meta/Pan touch modifier buttons near the toolbar.</div>
            <div>On phones, use the top File/Edit/View/Help menu bar plus pane toggles or edge tabs to open Generator/Layers, and use the floating Model toggle to expand/collapse the formula panel.</div>
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
            <div>Double-click a pen icon to apply that pen to the selected layers instantly.</div>
            <div>Touch fallback: tap a pen icon to arm it, then tap layers/groups to apply.</div>
            <div>The Pens panel can be collapsed from its section header; use the palette dropdown to recolor pens, then add/remove/reorder pens as needed.</div>
            <div>Auto-Colorization includes None mode, one-shot Apply, and Continuous Apply Changes.</div>
            <div>If Continuous Apply Changes is off, mode/parameter/palette updates are staged until you press Apply (including repeatedly applying different modes in sequence).</div>
            <div>Plotter Optimization in Settings removes fully overlapping paths per pen.</div>
            <div>Toggle Export Optimized to include optimization passes in the exported SVG.</div>
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

    getDefaultTransformForType(type, currentParams = {}) {
      const base = ALGO_DEFAULTS[type] || {};
      const fallbackSeed = Number.isFinite(currentParams.seed) ? currentParams.seed : 1;
      return {
        seed: Number.isFinite(base.seed) ? base.seed : fallbackSeed,
        posX: Number.isFinite(base.posX) ? base.posX : 0,
        posY: Number.isFinite(base.posY) ? base.posY : 0,
        scaleX: Number.isFinite(base.scaleX) ? base.scaleX : 1,
        scaleY: Number.isFinite(base.scaleY) ? base.scaleY : 1,
        rotation: Number.isFinite(base.rotation) ? base.rotation : 0,
      };
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
      const transform = this.getDefaultTransformForType(nextType, layer.params);
      layer.type = nextType;
      layer.params = { ...base, ...(stored || {}), ...transform };
      this.storeLayerParams(layer);
    }

    getWavetableNoiseTemplates(source = 'wavetable') {
      const base = {
        enabled: true,
        type: 'simplex',
        blend: 'add',
        amplitude: 9,
        zoom: 0.02,
        freq: 1.0,
        angle: 0,
        shiftX: 0,
        shiftY: 0,
        tileMode: 'off',
        tilePadding: 0,
        patternScale: 1,
        warpStrength: 1,
        cellularScale: 1,
        cellularJitter: 1,
        stepsCount: 5,
        seed: 0,
        applyMode: source === 'spiral' ? 'topdown' : undefined,
        noiseStyle: 'linear',
        noiseThreshold: 0,
        imageWidth: 1,
        imageHeight: 1,
        microFreq: 0,
        imageInvertColor: false,
        imageInvertOpacity: false,
        imageId: '',
        imageName: '',
        imagePreview: '',
        imageAlgo: 'luma',
        imageEffects: [
          {
            id: 'effect-1',
            enabled: true,
            mode: 'luma',
            imageBrightness: 0,
            imageLevelsLow: 0,
            imageLevelsHigh: 1,
            imageEmbossStrength: 1,
            imageSharpenAmount: 1,
            imageSharpenRadius: 1,
            imageMedianRadius: 1,
            imageGamma: 1,
            imageContrast: 1,
            imageSolarize: 0.5,
            imagePixelate: 12,
            imageDither: 0.5,
            imageThreshold: 0.5,
            imagePosterize: 5,
            imageBlur: 0,
            imageBlurRadius: 0,
            imageBlurStrength: 1,
            imageEdgeBlur: 0,
            imageHighpassRadius: 1,
            imageHighpassStrength: 1,
            imageLowpassRadius: 2,
            imageLowpassStrength: 0.6,
            imageVignetteStrength: 0.4,
            imageVignetteRadius: 0.85,
            imageCurveStrength: 0.4,
            imageBandCenter: 0.5,
            imageBandWidth: 0.3,
          },
        ],
        imageThreshold: 0.5,
        imagePosterize: 5,
        imageBlur: 0,
        imageBlurRadius: 0,
        imageBlurStrength: 1,
        imageBrightness: 0,
        imageLevelsLow: 0,
        imageLevelsHigh: 1,
        imageEmbossStrength: 1,
        imageSharpenAmount: 1,
        imageSharpenRadius: 1,
        imageMedianRadius: 1,
        imageGamma: 1,
        imageContrast: 1,
        imageSolarize: 0.5,
        imagePixelate: 12,
        imageDither: 0.5,
        polygonRadius: 2,
        polygonSides: 6,
        polygonRotation: 0,
        polygonOutline: 0,
        polygonEdgeRadius: 0,
      };
      const templates = (ALGO_DEFAULTS?.[source]?.noises || []).map((noise, idx) => ({
        ...base,
        ...clone(noise),
        id: noise?.id || `noise-${idx + 1}`,
        enabled: noise?.enabled !== false,
      }));
      return { base, templates };
    }

    normalizeImageEffects(noise, baseEffect) {
      if (!noise) return;
      const effectBase = baseEffect ? clone(baseEffect) : { id: 'effect-1', enabled: true, mode: 'luma' };
      const mergeEffect = (effect, idx) => ({
        ...clone(effectBase),
        ...(effect || {}),
        id: effect?.id || `effect-${idx + 1}`,
        enabled: effect?.enabled !== false,
        mode: effect?.mode || effectBase.mode,
      });

      if (!Array.isArray(noise.imageEffects) || !noise.imageEffects.length) {
        const legacy = mergeEffect(
          {
            mode: noise.imageAlgo || effectBase.mode || 'luma',
            imageBrightness: noise.imageBrightness ?? effectBase.imageBrightness,
            imageLevelsLow: noise.imageLevelsLow ?? effectBase.imageLevelsLow,
            imageLevelsHigh: noise.imageLevelsHigh ?? effectBase.imageLevelsHigh,
            imageEmbossStrength: noise.imageEmbossStrength ?? effectBase.imageEmbossStrength,
            imageSharpenAmount: noise.imageSharpenAmount ?? effectBase.imageSharpenAmount,
            imageSharpenRadius: noise.imageSharpenRadius ?? effectBase.imageSharpenRadius,
            imageMedianRadius: noise.imageMedianRadius ?? effectBase.imageMedianRadius,
            imageGamma: noise.imageGamma ?? effectBase.imageGamma,
            imageContrast: noise.imageContrast ?? effectBase.imageContrast,
            imageSolarize: noise.imageSolarize ?? effectBase.imageSolarize,
            imagePixelate: noise.imagePixelate ?? effectBase.imagePixelate,
            imageDither: noise.imageDither ?? effectBase.imageDither,
            imageThreshold: noise.imageThreshold ?? effectBase.imageThreshold,
            imagePosterize: noise.imagePosterize ?? effectBase.imagePosterize,
            imageBlur: noise.imageBlur ?? effectBase.imageBlur,
            imageBlurRadius: noise.imageBlurRadius ?? effectBase.imageBlurRadius,
            imageBlurStrength: noise.imageBlurStrength ?? effectBase.imageBlurStrength,
          },
          0
        );
        noise.imageEffects = [legacy];
        return;
      }
      noise.imageEffects = noise.imageEffects.map((effect, idx) => mergeEffect(effect, idx));
    }

    ensureWavetableNoises(layer) {
      if (!layer || (layer.type !== 'wavetable' && layer.type !== 'rainfall')) return [];
      const { base, templates } = this.getWavetableNoiseTemplates('wavetable');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude:
            (layer.params.noiseType || base.type) === 'image' && layer.params.amplitude === undefined
              ? IMAGE_NOISE_DEFAULT_AMPLITUDE
              : layer.params.amplitude ?? base.amplitude,
          zoom: layer.params.zoom ?? base.zoom,
          freq: layer.params.freq ?? base.freq,
          angle: layer.params.noiseAngle ?? base.angle,
          shiftX: base.shiftX,
          shiftY: base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          imageId: layer.params.noiseImageId || base.imageId,
          imageName: layer.params.noiseImageName || base.imageName,
          imagePreview: base.imagePreview,
          imageAlgo: layer.params.imageAlgo || base.imageAlgo,
          imageThreshold: layer.params.imageThreshold ?? base.imageThreshold,
          imagePosterize: layer.params.imagePosterize ?? base.imagePosterize,
          imageBlur: layer.params.imageBlur ?? base.imageBlur,
          imageBlurRadius: base.imageBlurRadius,
          imageBlurStrength: base.imageBlurStrength,
          imageBrightness: base.imageBrightness,
          imageLevelsLow: base.imageLevelsLow,
          imageLevelsHigh: base.imageLevelsHigh,
          imageEmbossStrength: base.imageEmbossStrength,
          imageSharpenAmount: base.imageSharpenAmount,
          imageSharpenRadius: base.imageSharpenRadius,
          imageMedianRadius: base.imageMedianRadius,
          imageGamma: base.imageGamma,
          imageContrast: base.imageContrast,
          imageSolarize: base.imageSolarize,
          imagePixelate: base.imagePixelate,
          imageDither: base.imageDither,
          noiseStyle: base.noiseStyle,
          noiseThreshold: base.noiseThreshold,
          imageWidth: base.imageWidth,
          imageHeight: base.imageHeight,
          microFreq: base.microFreq,
        };
        this.normalizeImageEffects(legacy, base.imageEffects?.[0]);
        noises = [legacy];
        layer.params.noises = noises;
      }
      noises = noises.map((noise, idx) => {
        const template = templates[idx] || templates[templates.length - 1] || base;
        const next = {
          ...base,
          ...clone(template),
          ...(noise || {}),
          id: noise?.id || template.id || `noise-${idx + 1}`,
          enabled: noise?.enabled !== false,
        };
        if (!next.tileMode) next.tileMode = next.type === 'image' ? 'off' : base.tileMode;
        if (next.tileMode === 'off') next.tilePadding = 0;
        if (next.type === 'image' && next.imageWidth === undefined && next.freq !== undefined) {
          next.imageWidth = next.freq;
        }
        if (next.type === 'image' && (noise?.amplitude === undefined || noise?.amplitude === null)) {
          next.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
        }
        if (!next.noiseStyle) next.noiseStyle = base.noiseStyle || 'linear';
        if (next.noiseThreshold === undefined) next.noiseThreshold = base.noiseThreshold ?? 0;
        if (next.imageWidth === undefined) next.imageWidth = base.imageWidth ?? 1;
        if (next.imageHeight === undefined) next.imageHeight = base.imageHeight ?? 1;
        if (next.microFreq === undefined) next.microFreq = base.microFreq ?? 0;
        if (next.imageInvertColor === undefined) next.imageInvertColor = base.imageInvertColor || false;
        if (next.imageInvertOpacity === undefined) next.imageInvertOpacity = base.imageInvertOpacity || false;
        this.normalizeImageEffects(next, base.imageEffects?.[0]);
        return next;
      });
      layer.params.noises = noises;
      return noises;
    }

    ensureSpiralNoises(layer) {
      if (!layer || layer.type !== 'spiral') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('spiral');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: base.type,
          blend: base.blend,
          amplitude: layer.params.noiseAmp ?? base.amplitude,
          zoom: layer.params.noiseFreq ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: base.shiftX,
          shiftY: base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          imageId: base.imageId,
          imageName: base.imageName,
          imagePreview: base.imagePreview,
          imageAlgo: base.imageAlgo,
          imageThreshold: base.imageThreshold,
          imagePosterize: base.imagePosterize,
          imageBlur: base.imageBlur,
          imageBlurRadius: base.imageBlurRadius,
          imageBlurStrength: base.imageBlurStrength,
          imageBrightness: base.imageBrightness,
          imageLevelsLow: base.imageLevelsLow,
          imageLevelsHigh: base.imageLevelsHigh,
          imageEmbossStrength: base.imageEmbossStrength,
          imageSharpenAmount: base.imageSharpenAmount,
          imageSharpenRadius: base.imageSharpenRadius,
          imageMedianRadius: base.imageMedianRadius,
          imageGamma: base.imageGamma,
          imageContrast: base.imageContrast,
          imageSolarize: base.imageSolarize,
          imagePixelate: base.imagePixelate,
          imageDither: base.imageDither,
          noiseStyle: base.noiseStyle,
          noiseThreshold: base.noiseThreshold,
          imageWidth: base.imageWidth,
          imageHeight: base.imageHeight,
          microFreq: base.microFreq,
        };
        this.normalizeImageEffects(legacy, base.imageEffects?.[0]);
        noises = [legacy];
        layer.params.noises = noises;
      }
      noises = noises.map((noise, idx) => {
        const template = templates[idx] || templates[templates.length - 1] || base;
        const next = {
          ...base,
          ...clone(template),
          ...(noise || {}),
          id: noise?.id || template.id || `noise-${idx + 1}`,
          enabled: noise?.enabled !== false,
        };
        if (!next.tileMode) next.tileMode = next.type === 'image' ? 'off' : base.tileMode;
        if (next.tileMode === 'off') next.tilePadding = 0;
        if (!next.applyMode) next.applyMode = base.applyMode || 'topdown';
        if (next.type === 'image' && next.imageWidth === undefined && next.freq !== undefined) {
          next.imageWidth = next.freq;
        }
        if (next.type === 'image' && (noise?.amplitude === undefined || noise?.amplitude === null)) {
          next.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
        }
        if (!next.noiseStyle) next.noiseStyle = base.noiseStyle || 'linear';
        if (next.noiseThreshold === undefined) next.noiseThreshold = base.noiseThreshold ?? 0;
        if (next.imageWidth === undefined) next.imageWidth = base.imageWidth ?? 1;
        if (next.imageHeight === undefined) next.imageHeight = base.imageHeight ?? 1;
        if (next.microFreq === undefined) next.microFreq = base.microFreq ?? 0;
        if (next.imageInvertColor === undefined) next.imageInvertColor = base.imageInvertColor || false;
        if (next.imageInvertOpacity === undefined) next.imageInvertOpacity = base.imageInvertOpacity || false;
        this.normalizeImageEffects(next, base.imageEffects?.[0]);
        return next;
      });
      layer.params.noises = noises;
      return noises;
    }

    createWavetableNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('wavetable');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    }

    createSpiralNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('spiral');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
        applyMode: template.applyMode ?? 'topdown',
      };
    }

    randomizeLayerParams(layer) {
      if (!layer || !RandomizationUtils?.randomizeLayerParams) return;
      RandomizationUtils.randomizeLayerParams({
        layer,
        controls: this.controls,
        commonControls: COMMON_CONTROLS,
        waveNoiseDefs: WAVE_NOISE_DEFS,
        ensureWavetableNoises: () => this.ensureWavetableNoises(layer),
        ensureSpiralNoises: () => this.ensureSpiralNoises(layer),
      });
      this.applyRandomizationBias(layer);
    }

    applyRandomizationBias(layer) {
      if (!layer || !layer.params) return;
      if (layer.type === 'shapePack') {
        this.applyShapePackRandomBias(layer.params);
      } else if (layer.type === 'petalisDesigner') {
        this.applyPetalisRandomBias(layer.params);
      } else if (layer.type === 'rainfall') {
        this.applyRainfallRandomBias(layer.params);
      } else if (layer.type === 'lissajous') {
        this.applyLissajousRandomBias(layer.params);
      }
    }

    applyShapePackRandomBias(params) {
      params.count = Math.round(clamp(params.count ?? 320, 220, 760));
      params.attempts = Math.round(clamp(params.attempts ?? 1800, 900, 5000));
      params.padding = clamp(params.padding ?? 1, 0, 2.5);
      const minR = clamp(params.minR ?? 1.5, 0.5, 9);
      const maxR = clamp(params.maxR ?? 16, minR + 2, 42);
      params.minR = minR;
      params.maxR = maxR;
      params.perspective = clamp(params.perspective ?? 0, -0.35, 0.45);
      if (Math.random() < 0.15) {
        params.maxR = clamp(params.maxR * 1.35, params.minR + 2, 55);
        params.count = Math.round(clamp(params.count * 0.8, 160, 760));
      }
    }

    applyPetalisRandomBias(params) {
      params.petalSteps = Math.round(clamp(params.petalSteps ?? 32, 14, 44));
      params.count = Math.round(clamp(params.count ?? 240, 40, 360));
      params.innerCount = Math.round(clamp(params.innerCount ?? 110, 20, 190));
      params.outerCount = Math.round(clamp(params.outerCount ?? 170, 30, 250));
      params.spiralTightness = clamp(params.spiralTightness ?? 1.2, 0.7, 5);
      params.radialGrowth = clamp(params.radialGrowth ?? 1, 0.25, 3.2);
      params.centerDensity = Math.round(clamp(params.centerDensity ?? 40, 6, 85));
      params.connectorCount = Math.round(clamp(params.connectorCount ?? 20, 4, 70));
      const designerDual = Boolean(
        params.useDesignerShapeOnly || params.label === 'Petalis' || params.label === 'Petalis Designer'
      );
      const dualRings = designerDual ? true : params.ringMode === 'dual';
      if (dualRings) {
        const sum = (params.innerCount || 0) + (params.outerCount || 0);
        const maxDual = 420;
        if (sum > maxDual) {
          const ratio = maxDual / Math.max(1, sum);
          params.innerCount = Math.max(20, Math.round(params.innerCount * ratio));
          params.outerCount = Math.max(30, Math.round(params.outerCount * ratio));
        }
      }
      if (Math.random() < 0.12) {
        params.count = Math.round(clamp(params.count * 1.35, 60, 520));
        params.petalSteps = Math.round(clamp(params.petalSteps + 6, 14, 56));
      }
    }

    applyRainfallRandomBias(params) {
      params.count = Math.round(clamp(params.count ?? 320, 60, 900));
      params.traceLength = Math.round(clamp(params.traceLength ?? 90, 30, 190));
      params.traceStep = Math.round(clamp(params.traceStep ?? 5, 2, 12));
      params.dropSize = clamp(params.dropSize ?? 2, 0, 6);
      params.fillDensity = clamp(params.fillDensity ?? 1.2, 0.1, 3.5);
      params.widthMultiplier = Math.round(clamp(params.widthMultiplier ?? 1, 1, 3));
      params.turbulence = clamp(params.turbulence ?? 0.2, 0, 0.9);
      params.gustStrength = clamp(params.gustStrength ?? 0.2, 0, 0.75);
      if (Math.random() < 0.18) {
        params.count = Math.round(clamp(params.count * 1.2, 60, 1200));
        params.traceLength = Math.round(clamp(params.traceLength * 1.15, 30, 240));
      }
    }

    applyLissajousRandomBias(params) {
      const interestingPairs = [
        [3, 4],
        [5, 7],
        [7, 9],
        [4, 9],
        [2.5, 7.5],
        [6, 11],
        [3.5, 8.5],
      ];
      const pair = interestingPairs[Math.floor(Math.random() * interestingPairs.length)] || [3, 4];
      const xJitter = (Math.random() - 0.5) * 1.4;
      const yJitter = (Math.random() - 0.5) * 1.4;
      params.freqX = clamp(pair[0] + xJitter, 0.5, 12);
      params.freqY = clamp(pair[1] + yJitter, 0.5, 12);
      if (Math.abs(params.freqX - params.freqY) < 0.6) {
        params.freqY = clamp(params.freqY + 1.2, 0.5, 12);
      }
      params.resolution = Math.round(clamp(params.resolution ?? 320, 220, 800));
      params.damping = clamp(params.damping ?? 0.002, 0.0002, 0.0058);
      params.scale = clamp(params.scale ?? 0.8, 0.35, 1.15);
      params.phase = clamp(params.phase ?? 0, 0, Math.PI * 2);
      params.closeLines = Math.random() > 0.25;
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

    getPenById(id) {
      return (SETTINGS.pens || []).find((pen) => pen.id === id) || null;
    }

    setArmedPen(penId) {
      this.armedPenId = penId || null;
      this.refreshArmedPenUI();
    }

    clearArmedPen() {
      this.setArmedPen(null);
    }

    refreshArmedPenUI() {
      const container = getEl('pen-list');
      if (!container) return;
      container.querySelectorAll('.pen-item').forEach((item) => {
        item.classList.toggle('dragging', item.dataset.penId === this.armedPenId);
      });
    }

    applyArmedPenToLayers(targetLayers) {
      if (!this.armedPenId) return false;
      const pen = this.getPenById(this.armedPenId);
      if (!pen) return false;
      const layers = Array.isArray(targetLayers) ? targetLayers.filter(Boolean) : [];
      if (!layers.length) return false;
      if (this.app.pushHistory) this.app.pushHistory();
      layers.forEach((layer) => {
        layer.penId = pen.id;
        layer.color = pen.color;
        layer.strokeWidth = pen.width;
        if (!layer.lineCap) layer.lineCap = 'round';
      });
      this.clearArmedPen();
      this.renderLayers();
      this.app.render();
      return true;
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
      window.requestAnimationFrame(() => this.scrollLayerToTop(groupId));
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

    duplicateLayers(targetLayers, options = {}) {
      const { select = true } = options;
      const layers = (targetLayers || []).filter((layer) => layer && !layer.isGroup);
      if (!layers.length) return [];
      if (this.app.pushHistory) this.app.pushHistory();
      const order = this.app.engine.layers.map((layer) => layer.id);
      const sorted = layers
        .slice()
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      const duplicates = [];
      sorted.forEach((layer) => {
        const dup = this.app.engine.duplicateLayer(layer.id);
        if (dup) duplicates.push(dup);
      });
      if (duplicates.length && select && this.app.renderer) {
        const ids = duplicates.map((layer) => layer.id);
        const primary = ids[ids.length - 1] || null;
        this.app.renderer.setSelection(ids, primary);
      }
      this.renderLayers();
      this.buildControls();
      this.app.render();
      return duplicates;
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
      const illustration = info.hidePreview ? '' : buildPreviewPair(key, this);
      const bodyContent = info.body
        ? typeof info.body === 'function'
          ? info.body(this)
          : info.body
        : `<p class="modal-text">${info.description}</p>`;
      const body = `
        ${bodyContent}
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
        { inputId: 'set-crop-exports', infoKey: 'global.cropExports' },
        { inputId: 'set-outside-opacity', infoKey: 'global.outsideOpacity' },
        { inputId: 'set-margin-line', infoKey: 'global.marginLineVisible' },
        { inputId: 'set-margin-line-weight', infoKey: 'global.marginLineWeight' },
        { inputId: 'set-margin-line-color', infoKey: 'global.marginLineColor' },
        { inputId: 'set-margin-line-dotting', infoKey: 'global.marginLineDotting' },
        { inputId: 'set-selection-outline', infoKey: 'global.selectionOutline' },
        { inputId: 'set-selection-outline-color', infoKey: 'global.selectionOutlineColor' },
        { inputId: 'set-selection-outline-width', infoKey: 'global.selectionOutlineWidth' },
        { inputId: 'set-cookie-preferences', infoKey: 'global.cookiePreferences' },
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
        if (key === 'global.algorithm') {
          e.preventDefault();
          this.setAboutVisible(!(SETTINGS.aboutVisible !== false));
          return;
        }
        this.showInfo(key);
      });
    }

    initModuleDropdown() {
      const select = getEl('generator-module');
      if (!select) return;
      select.innerHTML = '';
      const keys = Object.keys(ALGO_DEFAULTS || {}).filter((key) => !(ALGO_DEFAULTS[key] && ALGO_DEFAULTS[key].hidden));
      keys.forEach((key) => {
        const def = ALGO_DEFAULTS[key];
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
      const autoColorization = this.getAutoColorizationConfig();
      const applyToLayers = options.applyToLayers !== undefined ? Boolean(options.applyToLayers) : Boolean(autoColorization.enabled);
      pens.forEach((pen, index) => {
        pen.color = palette.colors[index % palette.colors.length];
      });
      if (applyToLayers) {
        this.app.engine.layers.forEach((layer) => {
          const pen = pens.find((p) => p.id === layer.penId);
          if (pen) layer.color = pen.color;
        });
        this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
      }
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
      if (this.armedPenId === penId) this.clearArmedPen();
      this.renderPens();
      this.renderLayers();
      this.app.render();
    }

    initPensSection() {
      const section = getEl('pens-global-section');
      const header = getEl('pens-section-header');
      const body = getEl('pens-section-body');
      if (!section || !header || !body) return;

      const setCollapsed = (next) => {
        SETTINGS.pensCollapsed = Boolean(next);
        section.classList.toggle('collapsed', Boolean(next));
        body.style.display = next ? 'none' : '';
      };

      setCollapsed(SETTINGS.pensCollapsed === true);
      header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));
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

    getAutoColorizationConfig() {
      const fallback = {
        enabled: false,
        scope: 'all',
        mode: 'none',
        params: {
          penOffset: 0,
          penStride: 1,
          penMirror: false,
          penJitter: 0,
          radiusStart: 0,
          radiusEnd: 100,
          bandSize: 20,
          bandOffset: 0,
          bandGrowth: 0,
          bandStart: 0,
          bandEnd: 100,
          angleOffset: 0,
          angleSpan: 360,
          spiralTurns: 1,
          sizeCurve: 1,
          sizeInvert: false,
          randomSeed: 1,
        },
      };
      if (!SETTINGS.autoColorization || typeof SETTINGS.autoColorization !== 'object') {
        SETTINGS.autoColorization = {};
      }
      const config = SETTINGS.autoColorization;
      if (typeof config.enabled !== 'boolean') config.enabled = fallback.enabled;
      if (typeof config.scope !== 'string') config.scope = fallback.scope;
      if (typeof config.mode !== 'string') config.mode = fallback.mode;
      if (!config.params || typeof config.params !== 'object') config.params = {};
      Object.entries(fallback.params).forEach(([key, value]) => {
        if (config.params[key] === undefined) config.params[key] = value;
      });
      return config;
    }

    initAutoColorizationPanel() {
      const section = getEl('auto-colorization-section');
      const header = getEl('auto-colorization-header');
      const body = getEl('auto-colorization-body');
      const enabledToggle = getEl('auto-colorization-enabled');
      const scopeSelect = getEl('auto-colorization-scope');
      const modeSelect = getEl('auto-colorization-mode');
      const applyBtn = getEl('auto-colorization-apply');
      const paramsTarget = getEl('auto-colorization-params');
      const statusEl = getEl('auto-colorization-status');
      this.autoColorizationStatusEl = statusEl || null;
      if (!section || !header || !body || !enabledToggle || !scopeSelect || !modeSelect || !paramsTarget) return;

      const config = this.getAutoColorizationConfig();
      const modeValues = new Set(AUTO_COLOR_MODES.map((mode) => mode.value));
      if (!modeValues.has(config.mode)) config.mode = AUTO_COLOR_MODES[0].value;
      const setCollapsed = (next) => {
        SETTINGS.autoColorizationCollapsed = next;
        section.classList.toggle('collapsed', next);
        body.style.display = next ? 'none' : '';
      };
      const initialCollapsed = SETTINGS.autoColorizationCollapsed !== false;
      setCollapsed(initialCollapsed);

      header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));

      modeSelect.innerHTML = AUTO_COLOR_MODES.map((mode) => `<option value="${mode.value}">${mode.label}</option>`).join('');

      enabledToggle.checked = Boolean(config.enabled);
      scopeSelect.value = config.scope || 'all';
      modeSelect.value = config.mode || AUTO_COLOR_MODES[0].value;

      const applyIfContinuous = (options = {}) => {
        if (!config.enabled) {
          if (this.autoColorizationStatusEl) this.autoColorizationStatusEl.textContent = 'Staged';
          return;
        }
        this.applyAutoColorization({ ...options, source: 'continuous' });
      };

      const renderParams = () => {
        paramsTarget.innerHTML = '';
        const mode = AUTO_COLOR_MODES.find((item) => item.value === config.mode) || AUTO_COLOR_MODES[0];
        if (!mode || !mode.params || !mode.params.length) {
          paramsTarget.innerHTML = '<p class="text-xs text-vectura-muted">No additional parameters.</p>';
          return;
        }
        mode.params.forEach((param) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'mb-3';
          if (param.type === 'checkbox') {
            wrapper.innerHTML = `
              <div class="flex items-center justify-between">
                <label class="control-label mb-0">${param.label}</label>
                <input type="checkbox" class="cursor-pointer" ${config.params[param.id] ? 'checked' : ''} />
              </div>
            `;
            const input = wrapper.querySelector('input');
            input.onchange = () => {
              config.params[param.id] = Boolean(input.checked);
              applyIfContinuous({ commit: true });
            };
          } else {
            const value = config.params[param.id] ?? param.min ?? 0;
            wrapper.innerHTML = `
              <div class="flex items-center justify-between mb-1">
                <label class="control-label mb-0">${param.label}</label>
                <span class="text-xs text-vectura-accent">${value}${param.unit || ''}</span>
              </div>
              <input
                type="range"
                min="${param.min}"
                max="${param.max}"
                step="${param.step ?? 1}"
                value="${value}"
                class="w-full"
              />
            `;
            const input = wrapper.querySelector('input');
            const display = wrapper.querySelector('span');
            input.oninput = () => {
              const next = parseFloat(input.value);
              config.params[param.id] = Number.isFinite(next) ? next : value;
              if (display) display.textContent = `${input.value}${param.unit || ''}`;
              applyIfContinuous({ commit: false });
            };
            input.onchange = () => {
              const next = parseFloat(input.value);
              config.params[param.id] = Number.isFinite(next) ? next : value;
              applyIfContinuous({ commit: true });
            };
          }
          paramsTarget.appendChild(wrapper);
        });
      };

      enabledToggle.onchange = () => {
        config.enabled = Boolean(enabledToggle.checked);
        if (config.enabled) {
          this.applyAutoColorization({ commit: true });
        } else if (this.autoColorizationStatusEl) {
          this.autoColorizationStatusEl.textContent = 'Staged';
        }
      };
      scopeSelect.onchange = () => {
        config.scope = scopeSelect.value;
        applyIfContinuous({ commit: true });
      };
      modeSelect.onchange = () => {
        config.mode = modeSelect.value;
        renderParams();
        applyIfContinuous({ commit: true });
      };
      if (applyBtn) {
        applyBtn.onclick = () => {
          this.applyAutoColorization({ commit: true, force: true, source: 'manual' });
        };
      }

      renderParams();
      if (config.enabled) {
        this.applyAutoColorization({ commit: false });
      } else if (this.autoColorizationStatusEl) {
        this.autoColorizationStatusEl.textContent = 'Staged';
      }
    }

    getAutoColorizationTargets(scope) {
      const layers = this.app.engine.layers || [];
      let targetIds = [];
      if (scope === 'active') {
        const active = this.app.engine.getActiveLayer ? this.app.engine.getActiveLayer() : null;
        if (active) targetIds = [active.id];
      } else if (scope === 'selected') {
        const selected = this.app.renderer?.getSelectedLayers?.() || [];
        if (selected.length) targetIds = selected.map((layer) => layer.id);
        else {
          const active = this.app.engine.getActiveLayer ? this.app.engine.getActiveLayer() : null;
          if (active) targetIds = [active.id];
        }
      } else {
        targetIds = layers.map((layer) => layer.id);
      }
      const targetSet = new Set(targetIds);
      const expanded = [];
      const seen = new Set();
      const childrenByParent = new Map();
      layers.forEach((layer) => {
        if (layer.parentId) {
          if (!childrenByParent.has(layer.parentId)) childrenByParent.set(layer.parentId, []);
          childrenByParent.get(layer.parentId).push(layer);
        }
      });
      const addLayer = (layer) => {
        if (!layer || seen.has(layer.id)) return;
        if (layer.isGroup) {
          const children = childrenByParent.get(layer.id) || [];
          children.forEach((child) => addLayer(child));
          return;
        }
        seen.add(layer.id);
        expanded.push(layer);
      };
      layers.forEach((layer) => {
        if (targetSet.has(layer.id)) addLayer(layer);
      });
      return expanded;
    }

    applyAutoColorization(options = {}) {
      const {
        commit = false,
        force = false,
        skipLayerRender = false,
        skipAppRender = false,
        source = 'auto',
      } = options;
      if (this.isApplyingAutoColorization) {
        this.pendingAutoColorizationOptions = {
          ...(this.pendingAutoColorizationOptions || {}),
          ...options,
          commit: Boolean(options.commit || this.pendingAutoColorizationOptions?.commit),
          force: Boolean(options.force || this.pendingAutoColorizationOptions?.force),
          skipLayerRender: Boolean(
            (this.pendingAutoColorizationOptions?.skipLayerRender ?? true) && (options.skipLayerRender ?? true)
          ),
          skipAppRender: Boolean((this.pendingAutoColorizationOptions?.skipAppRender ?? true) && (options.skipAppRender ?? true)),
        };
        if (this.autoColorizationStatusEl) {
          this.autoColorizationStatusEl.textContent = source === 'manual' ? 'Applying…' : 'Auto updating…';
        }
        return;
      }
      const config = this.getAutoColorizationConfig();
      if (!config.enabled && !force) return;
      const pens = SETTINGS.pens || [];
      if (!pens.length) return;
      const targets = this.getAutoColorizationTargets(config.scope);
      if (!targets.length) return;

      const renderer = this.app.renderer;
      const profile = this.app.engine.currentProfile;
      const center = { x: profile.width / 2, y: profile.height / 2 };
      const infos = targets.map((layer, index) => {
        const bounds = renderer?.getLayerBounds ? renderer.getLayerBounds(layer) : null;
        const c = bounds?.center || center;
        const dx = c.x - center.x;
        const dy = c.y - center.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const area = bounds ? Math.abs((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) : 0;
        return { layer, index, bounds, center: c, dist, angle, area };
      });
      const maxRadius = Math.min(profile.width, profile.height) / 2;
      const areas = infos.map((info) => info.area);
      const minArea = Math.min(...areas);
      const maxArea = Math.max(...areas);
      const areaSpan = Math.max(1e-6, maxArea - minArea);
      const mode = config.mode || 'none';
      const params = config.params || {};

      const hashString = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
          h = (h << 5) - h + str.charCodeAt(i);
          h |= 0;
        }
        return Math.abs(h);
      };

      const typeIndex = new Map();
      let nextTypeIdx = 0;

      const assignIndex = (info, idx) => {
        const total = pens.length;
        const normalized = ((idx % total) + total) % total;
        const pen = pens[normalized] || pens[0];
        if (!pen) return;
        const layer = info.layer;
        layer.penId = pen.id;
        layer.color = pen.color;
        layer.strokeWidth = pen.width;
      };

      const penStride = Math.max(1, Math.round(params.penStride ?? 1));
      const penOffset = Math.round(params.penOffset ?? 0);
      const penMirror = params.penMirror === true;
      const penJitter = clamp(params.penJitter ?? 0, 0, 1);
      const jitterSeed = params.randomSeed ?? 0;
      const applyPenModifiers = (idx, info) => {
        const total = pens.length;
        if (!total) return 0;
        let next = idx * penStride + penOffset;
        if (penJitter > 0 && total > 1) {
          const h = hashString(`${info.layer.id}-${info.index}-${jitterSeed}`);
          const chance = (h % 1000) / 1000;
          if (chance < penJitter) {
            next += ((h >> 10) & 1) === 0 ? -1 : 1;
          }
        }
        if (penMirror && total > 1) {
          const span = total * 2 - 2;
          const wrapped = ((next % span) + span) % span;
          next = wrapped < total ? wrapped : span - wrapped;
        }
        return next;
      };

      const pctToRange = (value, maxValue, fallback) => {
        const raw = Number.isFinite(value) ? value : fallback;
        return (clamp(raw, 0, 100) / 100) * maxValue;
      };
      const radiusStart = pctToRange(params.radiusStart, maxRadius, 0);
      const radiusEnd = (() => {
        const end = pctToRange(params.radiusEnd, maxRadius, 100);
        return end > radiusStart ? end : maxRadius;
      })();
      const bandSize = Math.max(1, params.bandSize ?? 20);
      const bandOffset = params.bandOffset ?? 0;
      const bandGrowth = params.bandGrowth ?? 0;
      const bandSpan = mode === 'vertical' ? profile.width : profile.height;
      const bandStart = pctToRange(params.bandStart, bandSpan, 0);
      const bandEnd = (() => {
        const end = pctToRange(params.bandEnd, bandSpan, 100);
        return end > bandStart ? end : bandSpan;
      })();

      if (commit && this.app.pushHistory) this.app.pushHistory();

      if (this.autoColorizationStatusEl) {
        if (source === 'manual') {
          this.autoColorizationStatusEl.textContent = 'Applied';
        } else if (config.enabled) {
          this.autoColorizationStatusEl.textContent = 'Auto updating…';
        } else {
          this.autoColorizationStatusEl.textContent = '';
        }
      }

      this.isApplyingAutoColorization = true;
      try {
        let changed = false;
        infos.forEach((info) => {
          let idx = 0;
          switch (mode) {
            case 'none':
              idx = 0;
              break;
            case 'concentric': {
              const dist = Math.max(0, info.dist - radiusStart);
              const span = Math.max(1, radiusEnd - radiusStart);
              const t = Math.max(0, Math.min(1, dist / span));
              const growth = 1 + bandGrowth * (t - 0.5);
              const effectiveBand = Math.max(1, bandSize * growth);
              idx = Math.floor((dist + bandOffset) / effectiveBand);
              break;
            }
            case 'horizontal': {
              const pos = info.center.y;
              const span = Math.max(1, bandEnd - bandStart);
              const clamped = Math.max(0, Math.min(span, pos - bandStart + bandOffset));
              idx = Math.floor(clamped / Math.max(1, bandSize));
              break;
            }
            case 'vertical': {
              const pos = info.center.x;
              const span = Math.max(1, bandEnd - bandStart);
              const clamped = Math.max(0, Math.min(span, pos - bandStart + bandOffset));
              idx = Math.floor(clamped / Math.max(1, bandSize));
              break;
            }
            case 'spiral': {
              const turns = Math.max(0.2, params.spiralTurns ?? 1);
              const angle = info.angle + ((params.angleOffset ?? 0) * Math.PI) / 180;
              const t = (angle / (Math.PI * 2) + 0.5 + (info.dist / Math.max(1, maxRadius)) * turns) % 1;
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'angle': {
              const offset = params.angleOffset ?? 0;
              const span = Math.max(10, params.angleSpan ?? 360);
              const angleDeg = ((info.angle * 180) / Math.PI + 360 + offset) % 360;
              const t = Math.max(0, Math.min(1, angleDeg / span));
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'size': {
              const curve = Math.max(0.5, params.sizeCurve ?? 1);
              let t = (info.area - minArea) / areaSpan;
              t = Math.max(0, Math.min(1, Math.pow(t, curve)));
              if (params.sizeInvert) t = 1 - t;
              idx = Math.floor(t * pens.length);
              break;
            }
            case 'random': {
              const seed = params.randomSeed ?? 0;
              const h = hashString(`${info.layer.id}-${seed}`);
              idx = h % pens.length;
              break;
            }
            case 'reverse':
              idx = pens.length - 1 - (info.index % pens.length);
              break;
            case 'algorithm': {
              if (!typeIndex.has(info.layer.type)) {
                typeIndex.set(info.layer.type, nextTypeIdx++);
              }
              idx = typeIndex.get(info.layer.type) % pens.length;
              break;
            }
            case 'order':
            default:
              idx = info.index % pens.length;
              break;
          }
          if (mode !== 'none') idx = applyPenModifiers(idx, info);
          const beforePen = info.layer.penId;
          const beforeColor = info.layer.color;
          const beforeWidth = info.layer.strokeWidth;
          assignIndex(info, idx);
          if (beforePen !== info.layer.penId || beforeColor !== info.layer.color || beforeWidth !== info.layer.strokeWidth) {
            changed = true;
          }
        });

        if (changed || force) {
          if (!skipLayerRender) this.renderLayers();
          if (!skipAppRender) this.app.render();
        }
      } finally {
        this.isApplyingAutoColorization = false;
      }

      if (this.pendingAutoColorizationOptions) {
        const nextOptions = this.pendingAutoColorizationOptions;
        this.pendingAutoColorizationOptions = null;
        this.applyAutoColorization(nextOptions);
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
      const cropExports = getEl('set-crop-exports');
      const outsideOpacity = getEl('set-outside-opacity');
      const marginLine = getEl('set-margin-line');
      const marginLineWeight = getEl('set-margin-line-weight');
      const marginLineColor = getEl('set-margin-line-color');
      const marginLineDotting = getEl('set-margin-line-dotting');
      const showGuides = getEl('set-show-guides');
      const snapGuides = getEl('set-snap-guides');
      const gridOverlay = getEl('set-grid-overlay');
      const selectionOutline = getEl('set-selection-outline');
      const selectionOutlineColor = getEl('set-selection-outline-color');
      const selectionOutlineWidth = getEl('set-selection-outline-width');
      const cookiePreferences = getEl('set-cookie-preferences');
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
      if (cropExports) cropExports.checked = SETTINGS.cropExports !== false;
      if (outsideOpacity) outsideOpacity.value = SETTINGS.outsideOpacity ?? 0.5;
      if (marginLine) marginLine.checked = Boolean(SETTINGS.marginLineVisible);
      if (marginLineWeight) marginLineWeight.value = SETTINGS.marginLineWeight ?? 0.2;
      if (marginLineColor) marginLineColor.value = SETTINGS.marginLineColor ?? '#52525b';
      if (marginLineDotting) marginLineDotting.value = SETTINGS.marginLineDotting ?? 0;
      if (showGuides) showGuides.checked = SETTINGS.showGuides !== false;
      if (snapGuides) snapGuides.checked = SETTINGS.snapGuides !== false;
      if (gridOverlay) gridOverlay.checked = SETTINGS.gridOverlay === true;
      if (selectionOutline) selectionOutline.checked = SETTINGS.selectionOutline !== false;
      if (selectionOutlineColor) selectionOutlineColor.value = SETTINGS.selectionOutlineColor || '#ef4444';
      if (selectionOutlineWidth) selectionOutlineWidth.value = SETTINGS.selectionOutlineWidth ?? 0.4;
      if (cookiePreferences) cookiePreferences.checked = SETTINGS.cookiePreferencesEnabled === true;
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
      const mobileLeftBtn = getEl('btn-mobile-pane-left');
      const mobileRightBtn = getEl('btn-mobile-pane-right');
      if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

      const isMobileViewport = () => window.innerWidth < 900;

      const isCollapsed = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed') && !pane.classList.contains('pane-force-open');
        return auto || pane.classList.contains('pane-collapsed');
      };

      const applyAutoCollapse = () => {
        const viewportWidth = window.innerWidth;
        const shouldAuto = viewportWidth < 640;
        const isMobileLayout = viewportWidth < 900;
        document.body.classList.toggle('auto-collapsed', shouldAuto);
        document.body.classList.toggle('mobile-layout', isMobileLayout);
        if (bottomPane) {
          bottomPane.classList.toggle('bottom-pane-collapsed', isMobileLayout);
        }
      };

      const togglePane = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed');
        const willOpen = auto ? !pane.classList.contains('pane-force-open') : pane.classList.contains('pane-collapsed');
        if (willOpen && isMobileViewport()) {
          const sibling = pane === leftPane ? rightPane : leftPane;
          sibling.classList.remove('pane-force-open');
          sibling.classList.add('pane-collapsed');
        }
        if (auto) {
          pane.classList.remove('pane-collapsed');
          pane.classList.toggle('pane-force-open');
        } else {
          pane.classList.toggle('pane-collapsed');
        }
      };

      leftBtn.addEventListener('click', () => togglePane(leftPane));
      rightBtn.addEventListener('click', () => togglePane(rightPane));
      if (mobileLeftBtn) mobileLeftBtn.addEventListener('click', () => togglePane(leftPane));
      if (mobileRightBtn) mobileRightBtn.addEventListener('click', () => togglePane(rightPane));
      window.addEventListener('resize', applyAutoCollapse);
      applyAutoCollapse();

      this.expandPanes = () => {
        leftPane.classList.remove('pane-collapsed', 'pane-force-open');
        rightPane.classList.remove('pane-collapsed', 'pane-force-open');
        document.body.classList.remove('auto-collapsed', 'mobile-layout');
        document.documentElement.style.setProperty('--pane-left-width', '519px');
        document.documentElement.style.setProperty('--pane-right-width', '336px');
        document.documentElement.style.setProperty('--bottom-pane-height', '180px');
        if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
      };
    }

    initBottomPaneToggle() {
      const bottomPane = getEl('bottom-pane');
      const btn = getEl('btn-pane-toggle-bottom');
      const mobileBtn = getEl('btn-mobile-pane-bottom');
      if (!bottomPane || !btn) return;
      const toggleBottomPane = () => {
        bottomPane.classList.toggle('bottom-pane-collapsed');
      };
      btn.addEventListener('click', toggleBottomPane);
      if (mobileBtn) mobileBtn.addEventListener('click', toggleBottomPane);
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

    updateLightSourceTool() {
      const btn = getEl('btn-light-source');
      if (!btn) return;
      const activeLayer = this.app?.engine?.getActiveLayer?.();
      const show = isPetalisLayerType(activeLayer?.type);
      btn.classList.toggle('hidden', !show);
    }

    initToolBar() {
      const toolbar = getEl('tool-bar');
      if (!toolbar) return;
      const toolButtons = Array.from(toolbar.querySelectorAll('.tool-btn[data-tool]'));
      const scissorButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-scissor]'));
      const selectButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-select]'));
      const penButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-pen]'));
      const scissorButton = toolbar.querySelector('.tool-btn[data-tool="scissor"]');
      const scissorMenu = toolbar.querySelector('.tool-submenu[aria-label="Scissor subtools"]');
      const selectButton = toolbar.querySelector('.tool-btn[data-tool="select"]');
      const selectMenu = toolbar.querySelector('.tool-submenu[data-menu="select"]');
      const penButton = toolbar.querySelector('.tool-btn[data-tool="pen"]');
      const penMenu = toolbar.querySelector('.tool-submenu[data-menu="pen"]');
      const lightSourceBtn = getEl('btn-light-source');
      const selectionModes = selectButtons.map((btn) => btn.dataset.select).filter(Boolean);
      const scissorModes = scissorButtons.map((btn) => btn.dataset.scissor).filter(Boolean);
      const penModes = penButtons.map((btn) => btn.dataset.pen).filter(Boolean);

      const updateToolIcon = (tool, mode) => {
        const button = toolbar.querySelector(`.tool-btn[data-tool="${tool}"]`);
        const icon = button?.querySelector('.tool-icon');
        let sourceBtn = null;
        if (tool === 'select') {
          sourceBtn = selectButtons.find((btn) => btn.dataset.select === mode);
        } else if (tool === 'scissor') {
          sourceBtn = scissorButtons.find((btn) => btn.dataset.scissor === mode);
        } else if (tool === 'pen') {
          sourceBtn = penButtons.find((btn) => btn.dataset.pen === mode);
        }
        const sourceSvg = sourceBtn?.querySelector('svg');
        if (!icon || !sourceSvg) return;
        icon.innerHTML = sourceSvg.innerHTML;
        icon.setAttribute('viewBox', sourceSvg.getAttribute('viewBox') || '0 0 24 24');
      };

      const syncButtons = () => {
        toolButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
        });
        scissorButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.scissor === this.scissorMode);
        });
        selectButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.select === this.selectionMode);
        });
        penButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.pen === this.penMode);
        });
      };

      this.setActiveTool = (tool, options = {}) => {
        if (!tool) return;
        const { temporary = false } = options;
        this.activeTool = tool;
        if (!temporary) {
          SETTINGS.activeTool = tool;
          this.previousTool = tool;
        }
        if (this.app.renderer?.setTool) this.app.renderer.setTool(tool);
        syncButtons();
      };

      this.setScissorMode = (mode) => {
        if (!mode) return;
        this.scissorMode = mode;
        SETTINGS.scissorMode = mode;
        if (this.app.renderer?.setScissorMode) this.app.renderer.setScissorMode(mode);
        updateToolIcon('scissor', this.scissorMode);
        syncButtons();
      };

      this.setSelectionMode = (mode) => {
        if (!mode) return;
        this.selectionMode = mode;
        SETTINGS.selectionMode = mode;
        if (this.app.renderer?.setSelectionMode) this.app.renderer.setSelectionMode(mode);
        updateToolIcon('select', this.selectionMode);
        syncButtons();
      };

      this.setPenMode = (mode) => {
        if (!mode) return;
        this.penMode = mode;
        SETTINGS.penMode = mode;
        if (this.app.renderer?.setPenMode) this.app.renderer.setPenMode(mode);
        updateToolIcon('pen', this.penMode);
        syncButtons();
      };

      const cycleMode = (current, modes) => {
        if (!modes.length) return current;
        const idx = modes.indexOf(current);
        const nextIndex = idx === -1 ? 0 : (idx + 1) % modes.length;
        return modes[nextIndex];
      };

      this.cycleToolSubmode = (tool) => {
        if (tool === 'select') {
          const next = cycleMode(this.selectionMode, selectionModes);
          this.setSelectionMode(next);
          this.setActiveTool('select');
          return;
        }
        if (tool === 'scissor') {
          const next = cycleMode(this.scissorMode, scissorModes);
          this.setScissorMode(next);
          this.setActiveTool('scissor');
          return;
        }
        if (tool === 'pen') {
          const next = cycleMode(this.penMode, penModes);
          this.setPenMode(next);
          this.setActiveTool('pen');
        }
      };

      toolButtons.forEach((btn) => {
        if (btn.dataset.tool === 'scissor') return;
        btn.onclick = () => {
          const tool = btn.dataset.tool;
          this.setActiveTool(tool);
        };
      });
      scissorButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.scissor;
          this.setActiveTool('scissor');
          this.setScissorMode(mode);
        };
      });
      selectButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.select;
          this.setActiveTool('select');
          this.setSelectionMode(mode);
        };
      });
      penButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.pen;
          this.setActiveTool('pen');
          this.setPenMode(mode);
        };
      });

      const initSubtoolMenu = (config) => {
        const { button, menu, buttons, onActivate, onSelect } = config;
        if (!button || !menu) return;
        let holdTimer = null;
        let menuOpen = false;
        let hoverBtn = null;

        const setHover = (btn) => {
          if (hoverBtn === btn) return;
          hoverBtn = btn || null;
          buttons.forEach((sub) => sub.classList.toggle('hover', sub === hoverBtn));
        };
        const openMenu = (e) => {
          menuOpen = true;
          menu.classList.add('open');
          setHover(null);
          if (e) {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
            setHover(btn);
          }
        };
        const closeMenu = () => {
          menuOpen = false;
          menu.classList.remove('open');
          setHover(null);
        };

        button.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (holdTimer) window.clearTimeout(holdTimer);
          holdTimer = window.setTimeout(() => {
            holdTimer = null;
            openMenu(e);
          }, 280);
        });

        document.addEventListener('pointermove', (e) => {
          if (!menuOpen) return;
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
          setHover(btn);
        });

        document.addEventListener('pointerup', (e) => {
          if (holdTimer) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
            if (onActivate) onActivate();
            return;
          }
          if (!menuOpen) return;
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
          if (btn && onSelect) onSelect(btn);
          closeMenu();
        });

        document.addEventListener('pointerdown', (e) => {
          if (!menuOpen) return;
          if (menu.contains(e.target) || button.contains(e.target)) return;
          closeMenu();
        });
      };

      initSubtoolMenu({
        button: scissorButton,
        menu: scissorMenu,
        buttons: scissorButtons,
        onActivate: () => this.setActiveTool('scissor'),
        onSelect: (btn) => {
          const mode = btn.dataset.scissor;
          this.setActiveTool('scissor');
          this.setScissorMode(mode);
        },
      });

      initSubtoolMenu({
        button: penButton,
        menu: penMenu,
        buttons: penButtons,
        onActivate: () => this.setActiveTool('pen'),
        onSelect: (btn) => {
          const mode = btn.dataset.pen;
          this.setActiveTool('pen');
          this.setPenMode(mode);
        },
      });

      initSubtoolMenu({
        button: selectButton,
        menu: selectMenu,
        buttons: selectButtons,
        onActivate: () => this.setActiveTool('select'),
        onSelect: (btn) => {
          const mode = btn.dataset.select;
          this.setActiveTool('select');
          this.setSelectionMode(mode);
        },
      });

      if (lightSourceBtn) {
        lightSourceBtn.onclick = () => this.startLightSourcePlacement();
      }

      this.setActiveTool(this.activeTool);
      this.setScissorMode(this.scissorMode);
      this.setSelectionMode(this.selectionMode);
      this.setPenMode(this.penMode);
      syncButtons();

      if (this.app.renderer) {
        this.app.renderer.onPenComplete = (payload) => this.createManualLayerFromPath(payload);
        this.app.renderer.onScissor = (payload) => this.applyScissor(payload);
        this.app.renderer.onDirectEditStart = () => {
          if (this.app.pushHistory) this.app.pushHistory();
        };
        this.app.renderer.onDirectEditCommit = () => {
          this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
        };
      }
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
      const setCropExports = getEl('set-crop-exports');
      const setOutsideOpacity = getEl('set-outside-opacity');
      const setMarginLine = getEl('set-margin-line');
      const setMarginLineWeight = getEl('set-margin-line-weight');
      const setMarginLineColor = getEl('set-margin-line-color');
      const setMarginLineDotting = getEl('set-margin-line-dotting');
      const setShowGuides = getEl('set-show-guides');
      const setSnapGuides = getEl('set-snap-guides');
      const setGridOverlay = getEl('set-grid-overlay');
      const setSelectionOutline = getEl('set-selection-outline');
      const setSelectionOutlineColor = getEl('set-selection-outline-color');
      const setSelectionOutlineWidth = getEl('set-selection-outline-width');
      const setCookiePreferences = getEl('set-cookie-preferences');
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
      const btnSaveVectura = getEl('btn-save-vectura');
      const btnOpenVectura = getEl('btn-open-vectura');
      const btnImportSvg = getEl('btn-import-svg');
      const fileOpenVectura = getEl('file-open-vectura');
      const fileImportSvg = getEl('file-import-svg');
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
      if (setCropExports) {
        setCropExports.onchange = (e) => {
          SETTINGS.cropExports = e.target.checked;
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
        btnSettings.onclick = () => settingsPanel.classList.add('open');
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
      if (setGridOverlay) {
        setGridOverlay.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.gridOverlay = e.target.checked;
          this.app.render();
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
      if (setCookiePreferences) {
        setCookiePreferences.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.cookiePreferencesEnabled = e.target.checked;
          if (!SETTINGS.cookiePreferencesEnabled) {
            this.app.clearPreferenceCookie?.();
          } else {
            this.app.persistPreferences?.({ force: true });
          }
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
      if (btnSaveVectura) {
        btnSaveVectura.onclick = () => this.saveVecturaFile();
      }
      if (btnOpenVectura && fileOpenVectura) {
        btnOpenVectura.onclick = () => fileOpenVectura.click();
        fileOpenVectura.onchange = () => {
          const file = fileOpenVectura.files?.[0];
          if (file) this.openVecturaFile(file);
          fileOpenVectura.value = '';
        };
      }
      if (btnImportSvg && fileImportSvg) {
        btnImportSvg.onclick = () => fileImportSvg.click();
        fileImportSvg.onchange = () => {
          const file = fileImportSvg.files?.[0];
          if (file) this.importSvgFile(file);
          fileImportSvg.value = '';
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

    triggerTopMenuAction(buttonId) {
      const button = getEl(buttonId);
      if (!button) return false;
      button.click();
      this.setTopMenuOpen(null, false);
      return true;
    }

    handleTopMenuShortcut(e) {
      const primary = e.metaKey || e.ctrlKey;
      const key = (e.key || '').toLowerCase();
      if (primary && !e.shiftKey && !e.altKey && key === 'o') {
        return this.triggerTopMenuAction('btn-open-vectura');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 's') {
        return this.triggerTopMenuAction('btn-save-vectura');
      }
      if (primary && e.shiftKey && !e.altKey && key === 'p') {
        return this.triggerTopMenuAction('btn-import-svg');
      }
      if (primary && e.shiftKey && !e.altKey && key === 'e') {
        return this.triggerTopMenuAction('btn-export');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 'k') {
        return this.triggerTopMenuAction('btn-settings');
      }
      if (primary && !e.shiftKey && !e.altKey && key === '0') {
        return this.triggerTopMenuAction('btn-reset-view');
      }
      if (!primary && !e.shiftKey && !e.altKey && e.key === 'F1') {
        this.openHelp(false);
        this.setTopMenuOpen(null, false);
        return true;
      }
      return false;
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
        if (this.handleTopMenuShortcut(e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.petalDesigner) {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.closePetalDesigner();
          }
          return;
        }
        if (this.inlinePetalDesigner?.focused && !e.metaKey && !e.ctrlKey) {
          return;
        }

        if (e.code === 'Space') {
          if (!this.spacePanActive) {
            e.preventDefault();
            this.spacePanActive = true;
            this.spacePanTool = this.activeTool;
            this.setActiveTool?.('hand', { temporary: true });
          }
          return;
        }

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

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          e.stopPropagation();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            this.duplicateLayers(selectedLayers);
          } else {
            const active = this.app.engine.getActiveLayer?.();
            if (active) this.duplicateLayers([active]);
          }
          return;
        }

        if (!e.metaKey && !e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            this.duplicateLayers(selectedLayers);
          } else {
            const active = this.app.engine.getActiveLayer?.();
            if (active) this.duplicateLayers([active]);
          }
          return;
        }

        if (!e.metaKey && !e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (key === 'v') {
            e.preventDefault();
            if (this.activeTool === 'select') {
              this.cycleToolSubmode?.('select');
            } else {
              this.setActiveTool?.('select');
            }
            return;
          }
          if (key === 'a') {
            e.preventDefault();
            this.setActiveTool?.('direct');
            return;
          }
          if (key === 'p') {
            e.preventDefault();
            if (this.activeTool === 'pen') {
              this.cycleToolSubmode?.('pen');
            } else {
              this.setActiveTool?.('pen');
            }
            return;
          }
          if (key === '+' || (key === '=' && e.shiftKey)) {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('add');
            return;
          }
          if (key === '-') {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('delete');
            return;
          }
          if (key === 'c' && e.shiftKey) {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('anchor');
            return;
          }
          if (key === 'c') {
            e.preventDefault();
            if (this.activeTool === 'scissor') {
              this.cycleToolSubmode?.('scissor');
            } else {
              this.setActiveTool?.('scissor');
            }
            return;
          }
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
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

        if (this.activeTool === 'pen') {
          if (this.penMode !== 'draw') {
            if (e.key === 'Escape') {
              e.preventDefault();
              this.setPenMode?.('draw');
              return;
            }
          }
          if (this.penMode === 'draw' && e.key === 'Enter') {
            e.preventDefault();
            this.app.renderer?.commitPenPath?.();
            return;
          }
          if (this.penMode === 'draw' && e.key === 'Escape') {
            e.preventDefault();
            this.app.renderer?.cancelPenPath?.();
            return;
          }
          if (this.penMode === 'draw' && e.key === 'Backspace') {
            e.preventDefault();
            this.app.renderer?.undoPenPoint?.();
            return;
          }
        }

        if (this.activeTool === 'scissor' && e.key === 'Escape') {
          e.preventDefault();
          this.app.renderer?.cancelScissor?.();
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

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          const targets = selectedLayers.filter((layer) => layer && !layer.parentId && !layer.isGroup);
          if (!targets.length) return;
          if (this.app.pushHistory) this.app.pushHistory();
          targets.forEach((layer) => this.expandLayer(layer, { skipHistory: true }));
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

        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.app.renderer?.lightSourceSelected) {
            e.preventDefault();
            this.app.renderer.clearLightSource?.();
            return;
          }
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

      window.addEventListener('keyup', (e) => {
        const target = e.target;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (isInput) return;
        if (e.code === 'Space' && this.spacePanActive) {
          e.preventDefault();
          this.spacePanActive = false;
          const restore = this.spacePanTool || this.previousTool || 'select';
          this.setActiveTool?.(restore);
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
        <button class="layer-grip" type="button" aria-label="Reorder layer" title="Reorder layer">
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
            <button class="group-toggle" type="button" aria-label="Toggle group" title="Toggle group">${group.groupCollapsed ? '▸' : '▾'}</button>
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
                  <button class="pen-pill" type="button" aria-label="Assign pen" title="Assign pen">
                    <div class="pen-icon"></div>
                  </button>
                  <div class="pen-menu hidden"></div>
                </div>`
              : ''}
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete group" title="Delete group">✕</button>
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
          if (this.armedPenId) {
            const children = groupMap.get(group.id) || [];
            if (this.applyArmedPenToLayers(children)) return;
          }
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
            const { render = true, syncTargets = true } = options;
            if (syncTargets) {
              group.penId = pen.id;
              group.color = pen.color;
              group.strokeWidth = pen.width;
              group.lineCap = group.lineCap || 'round';
            }
            penIcon.style.background = pen.color;
            penIcon.style.color = pen.color;
            penIcon.style.setProperty('--pen-width', pen.width);
            penIcon.title = pen.name;
            if (syncTargets) {
              const children = groupMap.get(group.id) || [];
              children.forEach((child) => {
                child.penId = pen.id;
                child.color = pen.color;
                child.strokeWidth = pen.width;
                child.lineCap = group.lineCap;
              });
            }
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
          if (current) applyPen(current, { render: false, syncTargets: false });
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
        const hidePen = false;
        const showExpand = !isChild && !l.isGroup;
        const expandMarkup = showExpand
          ? '<button class="text-sm text-vectura-muted hover:text-white px-1 btn-expand" aria-label="Expand layer" title="Expand layer">⇲</button>'
          : '';
        const moveMarkup = isChild
          ? ''
          : `
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-up" aria-label="Move layer up" title="Move layer up">▲</button>
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-down" aria-label="Move layer down" title="Move layer down">▼</button>
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
            <input
              type="checkbox"
              ${l.visible ? 'checked' : ''}
              class="cursor-pointer"
              aria-label="Toggle layer visibility"
              title="Toggle visibility"
            >
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
                <button class="pen-pill" type="button" aria-label="Assign pen" title="Assign pen">
                  <div class="pen-icon"></div>
                </button>
                <div class="pen-menu hidden"></div>
              </div>
            `}
            ${expandMarkup}
            ${moveMarkup}
            <button class="text-sm text-vectura-muted hover:text-white px-1 btn-dup" aria-label="Duplicate layer" title="Duplicate layer">⧉</button>
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete layer" title="Delete layer">✕</button>
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
          if (this.armedPenId) {
            const targets = this.app.renderer?.selectedLayerIds?.has(l.id)
              ? this.app.renderer.getSelectedLayers()
              : [l];
            if (this.applyArmedPenToLayers(targets)) return;
          }
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
            this.duplicateLayers([l]);
          };
        }
        if (penMenu && penPill && penIcon) {
          const pens = SETTINGS.pens || [];
          const applyPen = (pen, targets = [l], options = {}) => {
            if (!pen) return;
            const { render = true, syncTargets = true } = options;
            if (syncTargets) {
              targets.forEach((target) => {
                target.penId = pen.id;
                target.color = pen.color;
                target.strokeWidth = pen.width;
              });
            }
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
          if (current) applyPen(current, [l], { render: false, syncTargets: false });

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
      this.updateLightSourceTool();
      if (SETTINGS.autoColorization?.enabled && !this.isApplyingAutoColorization) {
        this.applyAutoColorization({ commit: false, skipLayerRender: true });
      }
    }

    renderPens() {
      const container = getEl('pen-list');
      if (!container) return;
      container.innerHTML = '';
      const pens = SETTINGS.pens || [];

      pens.forEach((pen) => {
        const el = document.createElement('div');
        el.className = 'pen-item flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2';
        el.dataset.penId = pen.id;
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
            if (SETTINGS.autoColorization?.enabled) {
              this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
            }
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
            if (SETTINGS.autoColorization?.enabled) {
              this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
            }
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
          icon.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            e.preventDefault();
            e.stopPropagation();
            this.setArmedPen(this.armedPenId === pen.id ? null : pen.id);
          });
          icon.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targets = this.getAutoColorizationTargets('selected');
            if (!targets.length) return;
            if (this.app.pushHistory) this.app.pushHistory();
            targets.forEach((layer) => {
              layer.penId = pen.id;
              layer.color = pen.color;
              layer.strokeWidth = pen.width;
            });
            this.renderLayers();
            this.app.render();
          };
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

      this.refreshArmedPenUI();

      if (SETTINGS.autoColorization?.enabled) {
        this.applyAutoColorization({ commit: false });
      }
    }

    expandLayer(layer, options = {}) {
      if (!layer || layer.isGroup || layer.parentId) return;
      if (!Layer) return;
      const { skipHistory = false, returnChildren = false, suppressRender = false, selectChildren = true } = options;
      if (!skipHistory && this.app.pushHistory) this.app.pushHistory();
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
        const metaGroup = path?.meta?.group;
        const metaLabel = path?.meta?.label;
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
        return { path, index, minX, minY, group: metaGroup, label: metaLabel };
      });

      pathMeta.sort((a, b) => {
        if (a.minY !== b.minY) return a.minY - b.minY;
        if (a.minX !== b.minX) return a.minX - b.minX;
        return a.index - b.index;
      });

      const groupNodes = new Map();
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
        if (entry.group) {
          let groupNode = groupNodes.get(entry.group);
          if (!groupNode) {
            const groupId = Math.random().toString(36).substr(2, 9);
            groupNode = new Layer(groupId, 'group', entry.group);
            groupNode.isGroup = true;
            groupNode.groupType = 'group';
            groupNode.groupCollapsed = false;
            groupNode.visible = false;
            groupNode.parentId = layer.id;
            groupNode.penId = layer.penId;
            groupNode.color = layer.color;
            groupNode.strokeWidth = layer.strokeWidth;
            groupNode.lineCap = layer.lineCap;
            groupNodes.set(entry.group, groupNode);
          }
          child.parentId = groupNode.id;
          if (entry.label) child.name = entry.label;
        } else if (entry.label) {
          child.name = entry.label;
        }
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
      const orderedItems = [];
      const seenGroups = new Set();
      pathMeta.forEach((entry, idx) => {
        const child = children[idx];
        if (entry.group) {
          const groupNode = groupNodes.get(entry.group);
          if (groupNode && !seenGroups.has(groupNode.id)) {
            orderedItems.push(groupNode);
            seenGroups.add(groupNode.id);
          }
        }
        orderedItems.push(child);
      });
      const insertChildren = orderedItems.reverse();
      if (idx >= 0) {
        this.app.engine.layers.splice(idx + 1, 0, ...insertChildren);
      } else {
        this.app.engine.layers.push(...insertChildren);
      }

      children.forEach((child) => this.app.engine.generate(child.id));
      const primary = children[0];
      if (primary && selectChildren) {
        this.app.engine.activeLayerId = primary.id;
        if (this.app.renderer) this.app.renderer.setSelection([primary.id], primary.id);
      }
      if (!suppressRender) {
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      }
      if (returnChildren) return children;
    }

    createManualLayerFromPath(payload) {
      const path = Array.isArray(payload) ? payload : payload?.path;
      const anchors = Array.isArray(payload?.anchors) ? payload.anchors : null;
      const closed = Boolean(payload?.closed);
      if (!Layer || !Array.isArray(path) || path.length < 2) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const engine = this.app.engine;
      SETTINGS.globalLayerCount++;
      const num = String(SETTINGS.globalLayerCount).padStart(2, '0');
      const id = Math.random().toString(36).substr(2, 9);
      const layer = new Layer(id, 'expanded', `Pen Path ${num}`);
      const active = engine.getActiveLayer ? engine.getActiveLayer() : null;
      layer.params.seed = 0;
      layer.params.posX = 0;
      layer.params.posY = 0;
      layer.params.scaleX = 1;
      layer.params.scaleY = 1;
      layer.params.rotation = 0;
      layer.params.curves = Boolean(active?.params?.curves);
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      layer.parentId = active?.parentId ?? null;
      if (active) {
        layer.penId = active.penId;
        layer.color = active.color;
        layer.strokeWidth = active.strokeWidth;
        layer.lineCap = active.lineCap;
      }
      const cloned = path.map((pt) => ({ x: pt.x, y: pt.y }));
      if (anchors && anchors.length >= 2) {
        cloned.meta = {
          anchors: anchors.map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
            in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
            out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
          })),
          closed,
        };
      }
      layer.sourcePaths = [cloned];
      const idx = engine.layers.findIndex((l) => l.id === engine.activeLayerId);
      const insertIndex = idx >= 0 ? idx + 1 : engine.layers.length;
      engine.layers.splice(insertIndex, 0, layer);
      engine.activeLayerId = id;
      engine.generate(id);
      if (this.app.renderer) this.app.renderer.setSelection([id], id);
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
    }

    getGroupDescendants(groupId) {
      const out = [];
      const walk = (id) => {
        this.app.engine.layers.forEach((layer) => {
          if (layer.parentId !== id) return;
          if (layer.isGroup) {
            walk(layer.id);
          } else {
            out.push(layer);
          }
        });
      };
      walk(groupId);
      return out;
    }

    splitExpandedLayer(layer, segments) {
      if (!Layer || !layer || !segments || !segments.length) return [];
      const engine = this.app.engine;
      const idx = engine.layers.findIndex((l) => l.id === layer.id);
      const pad = String(segments.length).length;
      const children = segments.map((seg, i) => {
        const newId = Math.random().toString(36).substr(2, 9);
        const child = new Layer(newId, 'expanded', `${layer.name} Cut ${String(i + 1).padStart(pad, '0')}`);
        child.parentId = layer.parentId;
        child.params.seed = 0;
        child.params.posX = 0;
        child.params.posY = 0;
        child.params.scaleX = 1;
        child.params.scaleY = 1;
        child.params.rotation = 0;
        child.params.curves = Boolean(layer.params.curves);
        child.params.smoothing = 0;
        child.params.simplify = 0;
        child.sourcePaths = [seg.map((pt) => ({ x: pt.x, y: pt.y }))];
        child.penId = layer.penId;
        child.color = layer.color;
        child.strokeWidth = layer.strokeWidth;
        child.lineCap = layer.lineCap;
        child.visible = layer.visible;
        return child;
      });
      if (idx >= 0) {
        engine.layers.splice(idx, 1, ...children);
      } else {
        engine.layers.push(...children);
      }
      children.forEach((child) => engine.generate(child.id));
      return children;
    }

    applyScissor(payload) {
      if (!payload) return;
      const shape = {
        mode: payload.mode,
        line: payload.line,
        rect: payload.rect,
        circle: payload.circle,
      };
      if (!shape.mode) return;
      if (this.app.pushHistory) this.app.pushHistory();

      const renderer = this.app.renderer;
      const engine = this.app.engine;
      const baseTargets = engine.layers.filter((layer) => !layer.isGroup && layer.visible);
      const targets = [];

      baseTargets.forEach((layer) => {
        if (layer.isGroup) {
          targets.push(...this.getGroupDescendants(layer.id));
          return;
        }
        if (layer.type !== 'expanded' && !layer.parentId) {
          const expanded = this.expandLayer(layer, { skipHistory: true, returnChildren: true, suppressRender: true, selectChildren: false });
          if (expanded && expanded.length) targets.push(...expanded);
          return;
        }
        targets.push(layer);
      });

      const uniqueTargets = Array.from(new Map(targets.map((layer) => [layer.id, layer])).values());
      const newSelection = [];

      uniqueTargets.forEach((layer) => {
        const src = layer.sourcePaths || layer.paths || [];
        let segments = [];
        let didSplit = false;
        src.forEach((path) => {
          const basePath = path && path.meta && path.meta.kind === 'circle' ? expandCirclePath(path.meta, 80) : path;
          const split = splitPathByShape(basePath, shape);
          if (!split || !split.length) {
            segments.push(path);
            return;
          }
          segments = segments.concat(split);
          didSplit = true;
        });
        if (!segments.length || !didSplit) return;
        if (segments.length === 1) {
          layer.sourcePaths = segments.map((seg) => seg.map((pt) => ({ x: pt.x, y: pt.y })));
          engine.generate(layer.id);
          newSelection.push(layer.id);
          return;
        }
        const children = this.splitExpandedLayer(layer, segments);
        newSelection.push(...children.map((child) => child.id));
      });

      this.normalizeGroupOrder?.();
      this.renderLayers();
      this.app.render();
      if (newSelection.length && renderer) {
        const primary = newSelection[newSelection.length - 1];
        renderer.setSelection(newSelection, primary);
        engine.activeLayerId = primary;
      }
    }

    startLightSourcePlacement() {
      if (!this.app.renderer) return;
      this.setActiveTool?.('select');
      this.app.renderer.setLightSourceMode?.(true);
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

    loadNoiseImageFile(
      file,
      layer,
      nameEl,
      idKey = 'noiseImageId',
      nameKey = 'noiseImageName',
      target = null,
      previewKey = ''
    ) {
      if (!file || !layer) return;
      const reader = new FileReader();
      reader.onload = () => {
        const preview = reader.result;
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
          const owner = target || layer.params;
          if (!owner) return;
          owner[idKey] = id;
          owner[nameKey] = file.name;
          if (target && target.type === 'image') {
            owner.zoom = 0.02;
            owner.imageWidth = owner.imageWidth ?? 1;
            owner.imageHeight = owner.imageHeight ?? 1;
            owner.shiftX = owner.shiftX ?? 0;
            owner.shiftY = owner.shiftY ?? 0;
          }
          if (previewKey) owner[previewKey] = preview;
          if (nameEl) nameEl.textContent = file.name;
          this.storeLayerParams(layer);
          this.app.regen();
          this.app.render();
          this.buildControls();
          this.updateFormula();
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

    computeHarmonographPlotterData(layer) {
      const params = layer?.params || {};
      const samples = Math.max(200, Math.floor(params.samples ?? 4000));
      const duration = Math.max(1, params.duration ?? 30);
      const scale = params.scale ?? 1;
      const rotSpeed = (params.paperRotation ?? 0) * Math.PI * 2;
      const loopDrift = params.loopDrift ?? 0;
      const settleThreshold = Math.max(0, params.settleThreshold ?? 0);
      const settleWindow = Math.max(1, Math.floor(params.settleWindow ?? 24));
      const pendulums = (Array.isArray(params.pendulums) ? params.pendulums : [])
        .filter((pend) => pend?.enabled !== false)
        .map((pend) => ({
          ax: pend.ampX ?? 0,
          ay: pend.ampY ?? 0,
          phaseX: ((pend.phaseX ?? 0) * Math.PI) / 180,
          phaseY: ((pend.phaseY ?? 0) * Math.PI) / 180,
          freq: pend.freq ?? 1,
          micro: pend.micro ?? 0,
          damp: Math.max(0, pend.damp ?? 0),
        }));
      if (!pendulums.length) return { path: [], durationSec: 0 };
      const dt = duration / samples;
      const path = [];
      let settleCount = 0;
      for (let i = 0; i <= samples; i += 1) {
        const t = i * dt;
        let x = 0;
        let y = 0;
        pendulums.forEach((pend) => {
          const freq = (pend.freq + pend.micro + loopDrift * t) * Math.PI * 2;
          const decay = Math.exp(-pend.damp * t);
          x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
          y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
        });
        x *= scale;
        y *= scale;
        if (rotSpeed) {
          const ang = rotSpeed * t;
          const rx = x * Math.cos(ang) - y * Math.sin(ang);
          const ry = x * Math.sin(ang) + y * Math.cos(ang);
          x = rx;
          y = ry;
        }
        path.push({ x, y, t });
        if (settleThreshold > 0) {
          const mag = Math.hypot(x, y);
          settleCount = mag <= settleThreshold ? settleCount + 1 : 0;
          if (settleCount >= settleWindow) break;
        }
      }

      return { path, durationSec: path[path.length - 1]?.t ?? 0 };
    }

    mountHarmonographPlotter(layer, target) {
      if (!target) return;
      const data = this.computeHarmonographPlotterData(layer);
      const speeds = [0.25, 0.5, 1, 2, 4];
      const maxPlayhead = Math.max(0, data.path.length - 1);
      const initialPlayhead = clamp(this.harmonographPlotterState?.playhead ?? 0, 0, maxPlayhead);
      const rememberedSpeed = this.harmonographPlotterState?.speed ?? 1;
      const initialSpeed = speeds.includes(rememberedSpeed) ? rememberedSpeed : 1;
      const durationSec = Math.max(0.1, data.durationSec || layer?.params?.duration || 1);
      const progressPerMs = maxPlayhead > 0 ? maxPlayhead / (durationSec * 1000) : 0;
      const wrapper = document.createElement('div');
      wrapper.className = 'harmonograph-plotter mb-4';
      wrapper.innerHTML = `
        <div class="harmonograph-plotter-head">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Virtual Plotter</span>
          <button type="button" class="harmonograph-plotter-play text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">Play</button>
        </div>
        <canvas class="harmonograph-plotter-canvas" width="240" height="240"></canvas>
        <div class="harmonograph-plotter-meta text-[10px] text-vectura-muted">Scrub the playhead to preview the drawing sequence.</div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Playhead</label>
          <input class="harmonograph-plotter-range" type="range" min="0" max="${maxPlayhead}" step="1" value="${initialPlayhead}">
        </div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Speed</label>
          <select class="harmonograph-plotter-speed bg-vectura-bg border border-vectura-border p-1 text-[10px] focus:outline-none focus:border-vectura-accent">
            ${speeds
              .map((speed) => `<option value="${speed}" ${speed === initialSpeed ? 'selected' : ''}>${speed}x</option>`)
              .join('')}
          </select>
        </div>
      `;
      target.appendChild(wrapper);
      const canvas = wrapper.querySelector('.harmonograph-plotter-canvas');
      const playBtn = wrapper.querySelector('.harmonograph-plotter-play');
      const range = wrapper.querySelector('.harmonograph-plotter-range');
      const speedSelect = wrapper.querySelector('.harmonograph-plotter-speed');
      if (!canvas || !range || !speedSelect || !playBtn) return;

      const state = {
        rafId: null,
        playing: false,
        playhead: clamp(parseInt(range.value, 10) || 0, 0, maxPlayhead),
        speed: initialSpeed,
        lastTs: 0,
        maxPlayhead,
        progressPerMs,
      };
      this.harmonographPlotterState = state;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#101115';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!data.path.length) return;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        data.path.forEach((pt) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        const span = Math.max(spanX, spanY, 1);
        const pad = 16;
        const scale = (Math.min(canvas.width, canvas.height) - pad * 2) / span;
        const toCanvas = (pt) => ({
          x: (pt.x - (minX + maxX) / 2) * scale + canvas.width / 2,
          y: (pt.y - (minY + maxY) / 2) * scale + canvas.height / 2,
        });

        ctx.strokeStyle = 'rgba(113,113,122,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        data.path.forEach((pt, idx) => {
          const c = toCanvas(pt);
          if (idx === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        });
        ctx.stroke();

        const limit = clamp(state.playhead, 0, data.path.length - 1);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i <= limit; i += 1) {
          const c = toCanvas(data.path[i]);
          if (i === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();

        const head = toCanvas(data.path[limit]);
        ctx.fillStyle = '#fafafa';
        ctx.beginPath();
        ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
        ctx.fill();
      };

      const tick = (ts) => {
        if (!state.playing) return;
        const last = state.lastTs || ts;
        const delta = Math.max(0, ts - last);
        state.lastTs = ts;
        const step = delta * state.progressPerMs * state.speed;
        state.playhead += step;
        if (state.playhead >= state.maxPlayhead) {
          state.playhead = state.maxPlayhead;
          state.playing = false;
          state.rafId = null;
          playBtn.textContent = 'Play';
        }
        range.value = `${Math.round(state.playhead)}`;
        draw();
        if (state.playing) state.rafId = window.requestAnimationFrame(tick);
      };

      playBtn.onclick = () => {
        if (state.maxPlayhead <= 0) return;
        if (!state.playing && state.playhead >= state.maxPlayhead) {
          state.playhead = 0;
          range.value = '0';
          draw();
        }
        state.playing = !state.playing;
        playBtn.textContent = state.playing ? 'Pause' : 'Play';
        if (state.playing) {
          state.lastTs = 0;
          state.rafId = window.requestAnimationFrame(tick);
        } else if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }
      };
      range.oninput = (e) => {
        state.playhead = clamp(parseInt(e.target.value, 10) || 0, 0, state.maxPlayhead);
        if (state.playing) state.lastTs = 0;
        draw();
      };
      speedSelect.onchange = (e) => {
        const nextSpeed = parseFloat(e.target.value);
        state.speed = Number.isFinite(nextSpeed) ? nextSpeed : 1;
        if (state.playing) state.lastTs = 0;
      };
      if (state.maxPlayhead <= 0) {
        playBtn.disabled = true;
        playBtn.classList.add('opacity-60', 'cursor-not-allowed');
        range.disabled = true;
        speedSelect.disabled = true;
      }

      draw();
    }

    buildControls() {
      const restoreLeftPanelScroll = this.captureLeftPanelScrollPosition();
      const container = getEl('dynamic-controls');
      if (!container) {
        restoreLeftPanelScroll();
        return;
      }
      if (this.harmonographPlotterState?.rafId) {
        window.cancelAnimationFrame(this.harmonographPlotterState.rafId);
      }
      this.harmonographPlotterState = null;
      this.destroyInlinePetalisDesigner();
      container.innerHTML = '';
      const layer = this.app.engine.getActiveLayer();
      if (!layer) {
        restoreLeftPanelScroll();
        return;
      }

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
        if (algoLabel && !algoLabel.querySelector('.info-btn')) {
          this.attachInfoButton(algoLabel, 'global.algorithm');
        }
      }

      const algoDefs = this.controls[layer.type] || [];
      const commonDefs = COMMON_CONTROLS;
      const hasConditionalDefs = algoDefs.some((def) => typeof def.showIf === 'function');
      const hasNoiseConditional = WAVE_NOISE_DEFS.some((def) => typeof def.showIf === 'function');
      if (!algoDefs.length && !commonDefs.length) {
        restoreLeftPanelScroll();
        return;
      }

      if (isGroup) {
        const msg = document.createElement('p');
        msg.className = 'text-xs text-vectura-muted mb-4';
        msg.textContent = 'Select a sublayer to edit its parameters.';
        container.appendChild(msg);
      } else {
        this.storeLayerParams(layer);
      }

      const resetWrap = document.createElement('div');
      resetWrap.className = 'mb-4 grid grid-cols-2 gap-2';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className =
        'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
      resetBtn.textContent = 'Reset to Defaults';
      resetBtn.onclick = () => {
        if (this.app.pushHistory) this.app.pushHistory();
        const transform = this.getDefaultTransformForType(layer.type, layer.params);
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
      if (!isGroup) container.appendChild(resetWrap);

      const formatDisplayValue = (def, value) => {
        const displayVal = toDisplayValue(def, value);
        const { precision, unit } = getDisplayConfig(def);
        const factor = Math.pow(10, precision);
        const rounded = Math.round(displayVal * factor) / factor;
        return `${rounded}${unit}`;
      };

      const getDefaultValue = (def) => {
        const defaults = (ALGO_DEFAULTS && ALGO_DEFAULTS[layer.type]) || {};
        if (def.type === 'rangeDual') {
          if (
            Object.prototype.hasOwnProperty.call(defaults, def.minKey) &&
            Object.prototype.hasOwnProperty.call(defaults, def.maxKey)
          ) {
            return { min: defaults[def.minKey], max: defaults[def.maxKey] };
          }
          return null;
        }
        if (def.id && Object.prototype.hasOwnProperty.call(defaults, def.id)) {
          return defaults[def.id];
        }
        if (def.default !== undefined) return def.default;
        return null;
      };

      const valueEditorMap = new WeakMap();
      const collectValueChips = () =>
        Array.from(container.querySelectorAll('.value-chip')).filter((chip) => chip.offsetParent !== null);

      const openInlineEditor = (opts) => {
        const { def, valueEl, getValue, setValue, parseValue, formatValue } = opts;
        if (!valueEl) return;
        const { min, max, unit, step, precision } = getDisplayConfig(def);
        const parent = valueEl;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-value-input';
        const currentValue = getValue ? getValue() : 0;
        const displayValue = formatValue ? formatValue(currentValue) : formatDisplayValue(def, currentValue);
        input.value = `${displayValue}`.replace(unit, '').trim();
        const prevPosition = parent.style.position;
        const prevColor = parent.style.color;
        const prevShadow = parent.style.textShadow;
        const prevWidth = parent.style.width;
        const prevMinWidth = parent.style.minWidth;
        const prevFlex = parent.style.flex;
        if (!prevPosition || prevPosition === 'static') parent.style.position = 'relative';
        input.style.left = '0';
        input.style.top = '0';
        input.style.width = '100%';
        input.style.height = '100%';
        parent.appendChild(input);
        parent.style.color = 'transparent';
        parent.style.textShadow = 'none';
        parent.style.flex = '0 0 auto';
        input.focus();
        input.select();

        const growToFit = () => {
          input.style.width = 'auto';
          const padding = 14;
          const desired = Math.max(parent.offsetWidth, input.scrollWidth + padding);
          parent.style.minWidth = `${desired}px`;
          parent.style.width = `${desired}px`;
          input.style.width = '100%';
        };

        growToFit();

        let closed = false;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (input.parentElement) input.parentElement.removeChild(input);
          parent.style.color = prevColor;
          parent.style.textShadow = prevShadow;
          parent.style.width = prevWidth;
          parent.style.minWidth = prevMinWidth;
          parent.style.flex = prevFlex;
          if (!prevPosition || prevPosition === 'static') parent.style.position = '';
        };

        const apply = () => {
          const raw = input.value.trim().replace(unit, '');
          if (parseValue) {
            const parsed = parseValue(raw);
            if (!parsed) {
              this.showValueError(raw);
              return false;
            }
            setValue(parsed, { commit: true });
            return true;
          }
          const parsed = Number.parseFloat(raw);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            this.showValueError(`${raw}${unit}`);
            return false;
          }
          setValue(parsed, { commit: true });
          return true;
        };

        const openNeighbor = (dir) => {
          const chips = collectValueChips();
          const idx = chips.indexOf(valueEl);
          if (idx === -1) return;
          const next = chips[idx + dir];
          if (!next) return;
          const nextOpts = valueEditorMap.get(next);
          if (!nextOpts) return;
          window.requestAnimationFrame(() => openInlineEditor({ ...nextOpts, valueEl: next }));
        };

        const nudge = (direction, multiplier = 1) => {
          const numericStep = Number.isFinite(step) && step > 0 ? step : 1;
          const delta = numericStep * multiplier * direction;
          const current = Number.parseFloat(input.value);
          if (!Number.isFinite(current)) return;
          const next = clamp(current + delta, min, max);
          const factor = Math.pow(10, precision);
          const displayValue = Math.round(next * factor) / factor;
          input.value = `${displayValue}`;
          if (parseValue) return;
          setValue(displayValue, { commit: false, live: true });
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const ok = apply();
            cleanup();
            if (!ok) return;
            return;
          }
          if (e.key === 'Escape') {
            cleanup();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const ok = apply();
            cleanup();
            if (ok) openNeighbor(e.shiftKey ? -1 : 1);
            return;
          }
          if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
            e.preventDefault();
            if (parseValue) return;
            const direction = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
            const mult = e.shiftKey ? 10 : 1;
            nudge(direction, mult);
          }
        });
        input.addEventListener('input', () => {
          growToFit();
        });
        input.addEventListener('blur', () => {
          if (!apply()) {
            cleanup();
            return;
          }
          cleanup();
        });
      };

      const attachKeyboardRangeNudge = (input, applyValue) => {
        if (!input || !applyValue) return;
        const isArrowKey = (key) => ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(key);
        const clearFlag = () => {
          delete input.dataset.keyboardAdjust;
        };
        input.addEventListener('keydown', (e) => {
          if (!isArrowKey(e.key)) return;
          input.dataset.keyboardAdjust = '1';
        });
        input.addEventListener('keyup', (e) => {
          if (!isArrowKey(e.key)) return;
          clearFlag();
        });
        input.addEventListener('blur', () => {
          clearFlag();
        });
        input.addEventListener('input', () => {
          if (!input.dataset.keyboardAdjust) return;
          const nextDisplay = parseFloat(input.value);
          if (!Number.isFinite(nextDisplay)) return;
          applyValue(nextDisplay);
        });
      };

      const attachValueEditor = (opts) => {
        const { valueEl } = opts;
        if (!valueEl) return;
        valueEditorMap.set(valueEl, opts);
        valueEl.ondblclick = (e) => {
          e.preventDefault();
          openInlineEditor({ ...opts, valueEl });
        };
      };

      const globalSection = document.createElement('div');
      globalSection.className = 'global-section';
      globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
      const globalHeader = document.createElement('button');
      globalHeader.type = 'button';
      globalHeader.className = 'global-section-header';
      globalHeader.innerHTML = `
        <span class="global-section-title">Post-Processing Lab</span>
        <span class="global-section-toggle" aria-hidden="true"></span>
      `;
      const globalBody = document.createElement('div');
      globalBody.className = 'global-section-body';
      if (this.globalSectionCollapsed) globalBody.style.display = 'none';
      globalHeader.onclick = () => {
        this.globalSectionCollapsed = !this.globalSectionCollapsed;
        globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
        globalBody.style.display = this.globalSectionCollapsed ? 'none' : '';
      };
      globalSection.appendChild(globalHeader);
      globalSection.appendChild(globalBody);

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

      const basePendulumTemplate = {
        enabled: true,
        ampX: 100,
        ampY: 100,
        phaseX: 0,
        phaseY: 0,
        freq: 2,
        micro: 0,
        damp: 0.002,
      };
      const pendulumTemplates = ((ALGO_DEFAULTS?.harmonograph?.pendulums || []).map((pend, idx) => ({
        ...basePendulumTemplate,
        ...clone(pend),
        id: pend.id || `pend-${idx + 1}`,
        enabled: pend.enabled !== false,
      })) || []);
      const getPendulumDefault = (index, key) => {
        const template =
          pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
        return template[key] !== undefined ? template[key] : basePendulumTemplate[key];
      };
      const ensurePendulums = () => {
        let pendulums = layer.params.pendulums;
        if (!Array.isArray(pendulums) || !pendulums.length) {
          const legacy = [];
          for (let i = 1; i <= 3; i += 1) {
            const ampX = layer.params[`ampX${i}`];
            const ampY = layer.params[`ampY${i}`];
            if (ampX === undefined && ampY === undefined) continue;
            legacy.push({
              id: `pend-${i}`,
              enabled: true,
              ampX: ampX ?? basePendulumTemplate.ampX,
              ampY: ampY ?? basePendulumTemplate.ampY,
              phaseX: layer.params[`phaseX${i}`] ?? basePendulumTemplate.phaseX,
              phaseY: layer.params[`phaseY${i}`] ?? basePendulumTemplate.phaseY,
              freq: layer.params[`freq${i}`] ?? basePendulumTemplate.freq,
              micro: layer.params[`micro${i}`] ?? basePendulumTemplate.micro,
              damp: layer.params[`damp${i}`] ?? basePendulumTemplate.damp,
            });
          }
          pendulums = legacy.length ? legacy : clone(pendulumTemplates);
          layer.params.pendulums = pendulums;
        }
        pendulums = pendulums.map((pend, idx) => ({
          ...basePendulumTemplate,
          ...(pend || {}),
          id: pend?.id || `pend-${idx + 1}`,
          enabled: pend?.enabled !== false,
        }));
        layer.params.pendulums = pendulums;
        return pendulums;
      };
      const createPendulum = (index) => {
        const template =
          pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
        return {
          ...clone(template),
          id: `pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          enabled: true,
        };
      };
      const pendulumParamDefs = [
        { key: 'ampX', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX' },
        { key: 'ampY', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY' },
        {
          key: 'phaseX',
          label: 'Phase X',
          type: 'angle',
          min: 0,
          max: 360,
          step: 1,
          displayUnit: '°',
          infoKey: 'harmonograph.phaseX',
        },
        {
          key: 'phaseY',
          label: 'Phase Y',
          type: 'angle',
          min: 0,
          max: 360,
          step: 1,
          displayUnit: '°',
          infoKey: 'harmonograph.phaseY',
        },
        { key: 'freq', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq' },
        { key: 'micro', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro' },
        { key: 'damp', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp' },
      ];

      const maybeRebuildControls = () => {
        if (hasConditionalDefs) this.buildControls();
      };

      const maybeRebuildNoiseControls = () => {
        if (hasNoiseConditional) this.buildControls();
      };

      const renderDef = (def, targetEl) => {
        const target = targetEl || container;
        if (def.showIf && !def.showIf(layer.params)) return;
        if (def.type === 'section') {
          const section = document.createElement('div');
          section.className = 'control-section';
          section.innerHTML = `<div class="control-section-title">${def.label}</div>`;
          target.appendChild(section);
          return;
        }
        if (def.type === 'petalDesignerInline') {
          if (!isPetalisLayerType(layer.type)) return;
          const wrapper = document.createElement('div');
          wrapper.className = 'petal-designer-inline-wrap mb-4';
          target.appendChild(wrapper);
          this.mountInlinePetalisDesigner(layer, wrapper);
          return;
        }
        if (def.type === 'actionButton') {
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const wrapper = document.createElement('div');
          wrapper.className = 'mb-4';
          wrapper.innerHTML = `
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
            </div>
            <button type="button" class="w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors">
              ${def.buttonLabel || def.label}
            </button>
          `;
          const btn = wrapper.querySelector('button');
          if (btn) {
            btn.onclick = () => {
              if (def.action === 'setLightSource') {
                this.startLightSourcePlacement();
              } else if (typeof def.onClick === 'function') {
                def.onClick();
              }
            };
          }
          target.appendChild(wrapper);
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
              maybeRebuildControls();
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
          target.appendChild(div);
          return;
        }
        if (def.type === 'pendulumList') {
          const pendulums = ensurePendulums();
          const list = document.createElement('div');
          list.className = 'pendulum-list mb-4';
          const header = document.createElement('div');
          header.className = 'pendulum-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Pendulums</span>
            <button type="button" class="pendulum-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Pendulum
            </button>
          `;
          const addBtn = header.querySelector('.pendulum-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              pendulums.push(createPendulum(pendulums.length));
              layer.params.pendulums = pendulums;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const buildRangeControl = (pendulum, def, idx) => {
            const control = document.createElement('div');
            control.className = 'pendulum-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
            `;
            const input = control.querySelector('input');
            const valueBtn = control.querySelector('.value-chip');
            const resetValue = () => {
              const nextVal = getPendulumDefault(idx, def.key);
              if (nextVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum[def.key] = nextVal;
              if (input) input.value = toDisplayValue(def, nextVal);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, nextVal);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            if (input && valueBtn) {
              input.disabled = !pendulum.enabled;
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                pendulum[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                pendulum[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetValue();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                getValue: () => pendulum[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  pendulum[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, pendulum[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const buildAngleControl = (pendulum, def, idx) => {
            const control = document.createElement('div');
            control.className = 'pendulum-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = clamp(toDisplayValue(def, value), min, max);
            control.innerHTML = `
              <div class="angle-label">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <div class="angle-control">
                <div class="angle-dial" style="--angle:${displayVal}deg;">
                  <div class="angle-indicator"></div>
                </div>
              </div>
            `;
            const dial = control.querySelector('.angle-dial');
            const valueBtn = control.querySelector('.value-chip');
            let lastDisplay = displayVal;
            const setAngle = (nextDisplay, commit = false) => {
              const clamped = clamp(roundToStep(nextDisplay, step), min, max);
              lastDisplay = clamped;
              if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
              if (commit) {
                if (this.app.pushHistory) this.app.pushHistory();
                pendulum[def.key] = fromDisplayValue(def, clamped);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              }
            };
            const resetAngle = () => {
              const nextVal = getPendulumDefault(idx, def.key);
              if (nextVal === undefined) return;
              setAngle(toDisplayValue(def, nextVal), true);
            };
            if (dial) {
              dial.classList.toggle('angle-disabled', !pendulum.enabled);
              dial.addEventListener('mousedown', (e) => {
                if (!pendulum.enabled) return;
                e.preventDefault();
                const updateFromEvent = (ev) => {
                  const rect = dial.getBoundingClientRect();
                  const cx = rect.left + rect.width / 2;
                  const cy = rect.top + rect.height / 2;
                  const dx = ev.clientX - cx;
                  const dy = ev.clientY - cy;
                  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                  if (deg < 0) deg += 360;
                  setAngle(deg, false);
                };
                updateFromEvent(e);
                const move = (ev) => updateFromEvent(ev);
                const up = () => {
                  window.removeEventListener('mousemove', move);
                  setAngle(lastDisplay, true);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up, { once: true });
              });
              dial.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetAngle();
              });
            }
            if (valueBtn) {
              valueBtn.classList.toggle('opacity-60', !pendulum.enabled);
              attachValueEditor({
                def,
                valueEl: valueBtn,
                getValue: () => pendulum[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                setAngle(displayVal, commit);
              },
              });
            }
            return control;
          };

          pendulums.forEach((pendulum, idx) => {
            const card = document.createElement('div');
            card.className = `pendulum-card${pendulum.enabled ? '' : ' pendulum-disabled'}`;
            const headerRow = document.createElement('div');
            headerRow.className = 'pendulum-header';
            headerRow.innerHTML = `
              <label class="pendulum-title">Pendulum ${idx + 1}</label>
              <div class="pendulum-actions">
                <label class="pendulum-toggle">
                  <input type="checkbox" ${pendulum.enabled ? 'checked' : ''}>
                  <span>Active</span>
                </label>
                <button type="button" class="pendulum-delete" aria-label="Delete pendulum">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('input');
            const deleteBtn = headerRow.querySelector('.pendulum-delete');
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                pendulum.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (pendulums.length <= 1) {
                  this.openModal({
                    title: 'Pendulum Required',
                    body: `<p class="modal-text">Keep at least one pendulum active in the harmonograph.</p>`,
                  });
                  return;
                }
                if (this.app.pushHistory) this.app.pushHistory();
                pendulums.splice(idx, 1);
                layer.params.pendulums = pendulums;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);
            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            pendulumParamDefs.forEach((pDef) => {
              controls.appendChild(
                pDef.type === 'angle'
                  ? buildAngleControl(pendulum, pDef, idx)
                  : buildRangeControl(pendulum, pDef, idx)
              );
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'harmonographPlotter') {
          if (layer.type !== 'harmonograph') return;
          this.mountHarmonographPlotter(layer, target);
          return;
        }
        if (def.type === 'modifierList') {
          if (!isPetalisLayerType(layer.type)) return;
          const modifiers = Array.isArray(layer.params.centerModifiers) ? layer.params.centerModifiers : [];
          layer.params.centerModifiers = modifiers;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Center Modifiers'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Modifier
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifiers.push(createPetalisModifier('ripple'));
              layer.params.centerModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const modifierGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder modifier">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getModifierType = (type) =>
            PETALIS_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_MODIFIER_TYPES[0];

          const buildModifierRangeControl = (modifier, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = modifier[def.key] ?? def.min ?? 0;
            if (modifier[def.key] === undefined) modifier[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !modifier.enabled;
              valueBtn.classList.toggle('opacity-60', !modifier.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                modifier[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, modifier[def.key]);
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => modifier[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  modifier[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const bindModifierReorderGrip = (grip, card, modifier) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = modifiers.map((item) => item.id);
              const startIndex = currentOrder.indexOf(modifier.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                  nextOrder.splice(newIndex, 0, modifier.id);
                  const map = new Map(modifiers.map((item) => [item.id, item]));
                  layer.params.centerModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          modifiers.forEach((modifier, idx) => {
            if (!modifier.id) modifier.id = `mod-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
            card.dataset.modifierId = modifier.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${modifierGripMarkup}
                <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${modifier.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindModifierReorderGrip(grip, card, modifier);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                modifier.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = modifiers.findIndex((item) => item.id === modifier.id);
                if (index >= 0) modifiers.splice(index, 1);
                layer.params.centerModifiers = modifiers;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeDef = getModifierType(modifier.type);
            const typeSelect = document.createElement('div');
            typeSelect.className = 'noise-control';
            const optionsHtml = PETALIS_MODIFIER_TYPES.map(
              (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.centerModType">i</button>`;
            typeSelect.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">Modifier Type</label>
                  ${typeInfoBtn}
                </div>
                <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
              </div>
              <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
                ${optionsHtml}
              </select>
            `;
            const select = typeSelect.querySelector('select');
            const label = typeSelect.querySelector('span');
            if (select && label) {
              select.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextType = e.target.value;
                const next = { ...createPetalisModifier(nextType), id: modifier.id, enabled: modifier.enabled };
                Object.assign(modifier, next);
                label.textContent = getModifierType(nextType).label;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            controls.appendChild(typeSelect);
            typeDef.controls.forEach((cDef) => {
              controls.appendChild(buildModifierRangeControl(modifier, cDef));
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'petalModifierList') {
          if (!isPetalisLayerType(layer.type)) return;
          const modifiers = Array.isArray(layer.params.petalModifiers) ? layer.params.petalModifiers : [];
          layer.params.petalModifiers = modifiers;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Petal Modifiers'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Modifier
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifiers.push(createPetalModifier('ripple'));
              layer.params.petalModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const modifierGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder modifier">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getModifierType = (type) =>
            PETALIS_PETAL_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_PETAL_MODIFIER_TYPES[0];

          const buildModifierRangeControl = (modifier, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = modifier[def.key] ?? def.min ?? 0;
            if (modifier[def.key] === undefined) modifier[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !modifier.enabled;
              valueBtn.classList.toggle('opacity-60', !modifier.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                modifier[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, modifier[def.key]);
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => modifier[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  modifier[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const bindModifierReorderGrip = (grip, card, modifier) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = modifiers.map((item) => item.id);
              const startIndex = currentOrder.indexOf(modifier.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                  nextOrder.splice(newIndex, 0, modifier.id);
                  const map = new Map(modifiers.map((item) => [item.id, item]));
                  layer.params.petalModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          modifiers.forEach((modifier, idx) => {
            if (!modifier.id) modifier.id = `petal-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
            card.dataset.modifierId = modifier.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${modifierGripMarkup}
                <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${modifier.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindModifierReorderGrip(grip, card, modifier);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                modifier.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = modifiers.findIndex((item) => item.id === modifier.id);
                if (index >= 0) modifiers.splice(index, 1);
                layer.params.petalModifiers = modifiers;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeDef = getModifierType(modifier.type);
            const typeSelect = document.createElement('div');
            typeSelect.className = 'noise-control';
            const optionsHtml = PETALIS_PETAL_MODIFIER_TYPES.map(
              (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.petalModType">i</button>`;
            typeSelect.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">Modifier Type</label>
                  ${typeInfoBtn}
                </div>
                <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
              </div>
              <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
                ${optionsHtml}
              </select>
            `;
            const select = typeSelect.querySelector('select');
            const label = typeSelect.querySelector('span');
            if (select && label) {
              select.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextType = e.target.value;
                const next = { ...createPetalModifier(nextType), id: modifier.id, enabled: modifier.enabled };
                Object.assign(modifier, next);
                label.textContent = getModifierType(nextType).label;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            controls.appendChild(typeSelect);
            typeDef.controls.forEach((cDef) => {
              controls.appendChild(buildModifierRangeControl(modifier, cDef));
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'shadingList') {
          if (!isPetalisLayerType(layer.type)) return;
          const shadings = Array.isArray(layer.params.shadings) ? layer.params.shadings : [];
          layer.params.shadings = shadings;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Shading Stack'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Shading
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              shadings.push(createPetalisShading('radial'));
              layer.params.shadings = shadings;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const shadingGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder shading">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getShadingType = (type) =>
            PETALIS_SHADING_TYPES.find((opt) => opt.value === type) || PETALIS_SHADING_TYPES[0];

          const buildShadingRangeControl = (shade, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = shade[def.key] ?? def.min ?? 0;
            if (shade[def.key] === undefined) shade[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !shade.enabled;
              valueBtn.classList.toggle('opacity-60', !shade.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                shade[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                shade[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                shade[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, shade[def.key]);
                valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => shade[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  shade[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const buildShadingSelect = (shade, def, options) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            let value = shade[def.key];
            if (value === undefined || value === null) {
              value = options[0]?.value;
              shade[def.key] = value;
            }
            const optionsHtml = options
              .map(
                (opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
              )
              .join('');
            const currentLabel = options.find((opt) => opt.value === value)?.label || value;
            control.innerHTML = `
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
            const input = control.querySelector('select');
            const span = control.querySelector('span');
            if (input && span) {
              input.disabled = !shade.enabled;
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                shade[def.key] = e.target.value;
                span.textContent = options.find((opt) => opt.value === shade[def.key])?.label || shade[def.key];
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
            }
            return control;
          };

          const bindShadingReorderGrip = (grip, card, shading) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = shadings.map((item) => item.id);
              const startIndex = currentOrder.indexOf(shading.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== shading.id);
                  nextOrder.splice(newIndex, 0, shading.id);
                  const map = new Map(shadings.map((item) => [item.id, item]));
                  layer.params.shadings = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          const shadingRangeDefs = [
            { key: 'lineSpacing', label: 'Line Spacing (mm)', type: 'range', min: 0.2, max: 8, step: 0.1, displayUnit: 'mm', infoKey: 'petalis.shadingLineSpacing' },
            { key: 'density', label: 'Line Density', type: 'range', min: 0.2, max: 3, step: 0.05, infoKey: 'petalis.shadingDensity' },
            { key: 'jitter', label: 'Line Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingJitter' },
            { key: 'lengthJitter', label: 'Length Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingLengthJitter' },
            { key: 'angle', label: 'Hatch Angle', type: 'range', min: -90, max: 90, step: 1, displayUnit: '°', infoKey: 'petalis.shadingAngle' },
            { key: 'widthX', label: 'Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthX' },
            { key: 'posX', label: 'Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosX' },
            { key: 'gapX', label: 'Gap Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapX' },
            { key: 'gapPosX', label: 'Gap Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosX' },
            { key: 'widthY', label: 'Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthY' },
            { key: 'posY', label: 'Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosY' },
            { key: 'gapY', label: 'Gap Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapY' },
            { key: 'gapPosY', label: 'Gap Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosY' },
          ];

          shadings.forEach((shade, idx) => {
            if (!shade.id) shade.id = `shade-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${shade.enabled ? '' : ' noise-disabled'}`;
            card.dataset.shadingId = shade.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${shadingGripMarkup}
                <span class="noise-title">Shading ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${shade.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete shading">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindShadingReorderGrip(grip, card, shade);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                shade.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = shadings.findIndex((item) => item.id === shade.id);
                if (index >= 0) shadings.splice(index, 1);
                layer.params.shadings = shadings;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeSelectDef = { key: 'type', label: 'Shading Type', infoKey: 'petalis.shadingType' };
            controls.appendChild(buildShadingSelect(shade, typeSelectDef, PETALIS_SHADING_TYPES));
            const lineTypeDef = { key: 'lineType', label: 'Line Type', infoKey: 'petalis.shadingLineType' };
            controls.appendChild(buildShadingSelect(shade, lineTypeDef, PETALIS_LINE_TYPES));
            shadingRangeDefs.forEach((cDef) => {
              controls.appendChild(buildShadingRangeControl(shade, cDef));
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'noiseList') {
          const noiseSource = layer.type === 'spiral' ? 'spiral' : 'wavetable';
          const noises =
            layer.type === 'spiral' ? this.ensureSpiralNoises(layer) : this.ensureWavetableNoises(layer);
          const { base: noiseBase, templates: noiseTemplates } = this.getWavetableNoiseTemplates(noiseSource);
          const getNoiseDefault = (index, key) => {
            if (key === 'amplitude') {
              const current = noises[index];
              if (current?.type === 'image') return IMAGE_NOISE_DEFAULT_AMPLITUDE;
            }
            const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
            if (template && Object.prototype.hasOwnProperty.call(template, key)) return template[key];
            return noiseBase[key];
          };
          const resetNoise = (noise, index) => {
            const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
            const keepType = noise.type;
            const keepBlend = noise.blend;
            Object.keys(noiseBase).forEach((key) => {
              if (key === 'id') return;
              const nextVal = template[key] !== undefined ? template[key] : noiseBase[key];
              noise[key] = Array.isArray(nextVal) ? clone(nextVal) : nextVal;
            });
            if (keepType) noise.type = keepType;
            if (keepBlend) noise.blend = keepBlend;
            if (noise.type === 'image') {
              noise.tileMode = 'off';
              noise.tilePadding = 0;
              noise.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
            } else if (!noise.tileMode) {
              noise.tileMode = noiseBase.tileMode || 'off';
            }
            if (!noise.noiseStyle) noise.noiseStyle = noiseBase.noiseStyle || 'linear';
            if (noise.noiseThreshold === undefined) noise.noiseThreshold = noiseBase.noiseThreshold ?? 0;
            if (noise.imageWidth === undefined) noise.imageWidth = noiseBase.imageWidth ?? 1;
            if (noise.imageHeight === undefined) noise.imageHeight = noiseBase.imageHeight ?? 1;
            if (noise.microFreq === undefined) noise.microFreq = noiseBase.microFreq ?? 0;
            if (noise.imageInvertColor === undefined) noise.imageInvertColor = noiseBase.imageInvertColor || false;
            if (noise.imageInvertOpacity === undefined) noise.imageInvertOpacity = noiseBase.imageInvertOpacity || false;
            if (noise.applyMode === undefined && noiseBase.applyMode) noise.applyMode = noiseBase.applyMode;
            this.normalizeImageEffects(noise, noiseBase.imageEffects?.[0]);
          };

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Noise Stack</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Noise
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              const nextNoise =
                layer.type === 'spiral' ? this.createSpiralNoise(noises.length) : this.createWavetableNoise(noises.length);
              noises.push(nextNoise);
              layer.params.noises = noises;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const noiseGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder noise">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const buildRangeControl = (noise, def, idx) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = noise[def.key] ?? getNoiseDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            const resetValue = () => {
              const nextVal = getNoiseDefault(idx, def.key);
              if (nextVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              noise[def.key] = nextVal;
              if (input) input.value = toDisplayValue(def, nextVal);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, nextVal);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            if (input && valueBtn) {
              input.disabled = !noise.enabled;
              valueBtn.classList.toggle('opacity-60', !noise.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                noise[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                noise[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetValue();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => noise[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  noise[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, noise[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const buildSelectControl = (noise, def, idx) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            let value = noise[def.key];
            if ((value === undefined || value === null) && def.options && def.options.length) {
              value = def.options[0].value;
              noise[def.key] = value;
            }
            const optionsHtml = def.options
              .map(
                (opt) =>
                  `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
              )
              .join('');
            const currentLabel = def.options.find((opt) => opt.value === value)?.label || value;
            control.innerHTML = `
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
            const input = control.querySelector('select');
            const span = control.querySelector('span');
            if (input && span) {
              input.disabled = !noise.enabled;
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const next = e.target.value;
                const prev = noise[def.key];
                noise[def.key] = next;
                if (def.key === 'type') {
                  const fallbackTileMode = getNoiseDefault(idx, 'tileMode') || 'off';
                  if (next === 'image') {
                    noise.tileMode = 'off';
                    noise.tilePadding = 0;
                    const baseAmplitude = noiseBase.amplitude;
                    if (
                      prev !== 'image' &&
                      (!Number.isFinite(noise.amplitude) || Math.abs((noise.amplitude ?? 0) - baseAmplitude) < 1e-6)
                    ) {
                      noise.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
                    }
                  } else if (!noise.tileMode) {
                    noise.tileMode = fallbackTileMode;
                  }
                }
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.updateFormula();
                if (def.key === 'type') this.buildControls();
                else maybeRebuildNoiseControls();
              };
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                const defaultVal = getNoiseDefault(idx, def.key);
                const fallback = def.options?.[0]?.value;
                const next = defaultVal !== undefined ? defaultVal : fallback;
                if (next === undefined) return;
                if (this.app.pushHistory) this.app.pushHistory();
                const prev = noise[def.key];
                noise[def.key] = next;
                if (def.key === 'type') {
                  const fallbackTileMode = getNoiseDefault(idx, 'tileMode') || 'off';
                  if (next === 'image') {
                    noise.tileMode = 'off';
                    noise.tilePadding = 0;
                    if (prev !== 'image') {
                      noise.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
                    }
                  } else if (!noise.tileMode) {
                    noise.tileMode = fallbackTileMode;
                  }
                }
                this.storeLayerParams(layer);
                input.value = next;
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.updateFormula();
                if (def.key === 'type') this.buildControls();
                else maybeRebuildNoiseControls();
              });
            }
            return control;
          };

          const buildAngleControl = (noise, def, idx) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = noise[def.key] ?? getNoiseDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = clamp(toDisplayValue(def, value), min, max);
            control.innerHTML = `
              <div class="angle-label">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <div class="angle-control">
                <div class="angle-dial" style="--angle:${displayVal}deg;">
                  <div class="angle-indicator"></div>
                </div>
                <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
              </div>
            `;
            const dial = control.querySelector('.angle-dial');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            let lastDisplay = displayVal;
            if (valueBtn) valueBtn.classList.toggle('opacity-60', !noise.enabled);
            const setAngle = (nextDisplay, commit = false, live = false) => {
              const clamped = clamp(roundToStep(nextDisplay, step), min, max);
              lastDisplay = clamped;
              if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
              if (commit || live) {
                if (commit && this.app.pushHistory) this.app.pushHistory();
                noise[def.key] = fromDisplayValue(def, clamped);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              }
            };
            const resetAngle = () => {
              const defaultVal = getNoiseDefault(idx, def.key);
              if (defaultVal === undefined) return;
              setAngle(toDisplayValue(def, defaultVal), true);
            };
            if (dial) {
              dial.classList.toggle('angle-disabled', !noise.enabled);
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
                if (!noise.enabled) return;
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
              dial.addEventListener('dblclick', (e) => {
                if (!noise.enabled) return;
                e.preventDefault();
                resetAngle();
              });
            }
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => noise[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                const live = Boolean(opts?.live);
                setAngle(displayVal, commit, live);
              },
            });
            return control;
          };

          const buildNoiseImageBlock = (noise, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'noise-image-block mb-3';
            const hasImage = Boolean(noise.imagePreview);
            const truncateFilename = (value) => {
              if (!value) return 'No file selected';
              const parts = value.split('.');
              if (parts.length < 2) return value.length > 10 ? `${value.slice(0, 10)}…` : value;
              const ext = parts.pop();
              const base = parts.join('.');
              const shortBase = base.length > 10 ? `${base.slice(0, 10)}…` : base;
              return `${shortBase}.${ext}`;
            };
            const name = truncateFilename(noise.imageName || '');
            const preview = hasImage
              ? `<img src="${noise.imagePreview}" alt="Noise preview">`
              : `<div class="noise-image-empty text-[10px] text-vectura-muted">Drop image</div>`;
            wrap.innerHTML = `
              <div class="noise-image-row">
                <div class="noise-image-left">
                  <div class="noise-dropzone compact${hasImage ? ' hidden' : ''}">Drop image</div>
                  <button type="button" class="noise-image-btn text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors${hasImage ? ' hidden' : ''}">
                    Select Image
                  </button>
                </div>
                <div class="noise-image-right">
                  <div class="noise-image-preview ${hasImage ? 'active' : 'hidden'}">
                    ${preview}
                    <button type="button" class="noise-image-clear text-[10px] text-vectura-muted hover:text-vectura-accent${hasImage ? '' : ' hidden'}">Clear</button>
                  </div>
                  <div class="text-[10px] text-vectura-muted mt-2 noise-image-name${hasImage ? '' : ' hidden'}">${name}</div>
                </div>
              </div>
              <input type="file" accept="image/*" class="noise-image-input hidden">
            `;
            const dropzone = wrap.querySelector('.noise-dropzone');
            const selectBtn = wrap.querySelector('.noise-image-btn');
            const clearBtn = wrap.querySelector('.noise-image-clear');
            const nameEl = wrap.querySelector('.noise-image-name');
            const previewEl = wrap.querySelector('.noise-image-preview');
            const fileInput = wrap.querySelector('.noise-image-input');

            const applyFile = (file) => {
              if (!file) return;
              this.loadNoiseImageFile(file, layer, nameEl, 'imageId', 'imageName', noise, 'imagePreview');
            };

            if (dropzone) {
              dropzone.addEventListener('dragover', (e) => {
                if (!noise.enabled) return;
                e.preventDefault();
                dropzone.classList.add('active');
              });
              dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
              dropzone.addEventListener('drop', (e) => {
                if (!noise.enabled) return;
                e.preventDefault();
                dropzone.classList.remove('active');
                const file = e.dataTransfer?.files?.[0];
                applyFile(file);
              });
            }
            if (previewEl) {
              previewEl.addEventListener('dragover', (e) => {
                if (!noise.enabled) return;
                e.preventDefault();
                previewEl.classList.add('active');
              });
              previewEl.addEventListener('dragleave', () => previewEl.classList.remove('active'));
              previewEl.addEventListener('drop', (e) => {
                if (!noise.enabled) return;
                e.preventDefault();
                previewEl.classList.remove('active');
                const file = e.dataTransfer?.files?.[0];
                applyFile(file);
              });
            }
            if (selectBtn && fileInput) {
              selectBtn.disabled = !noise.enabled;
              selectBtn.onclick = () => {
                if (!noise.enabled) return;
                fileInput.click();
              };
              fileInput.onchange = () => {
                const file = fileInput.files?.[0];
                applyFile(file);
              };
            }
            if (clearBtn) {
              clearBtn.disabled = !noise.enabled;
              clearBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                noise.imageId = '';
                noise.imageName = '';
                noise.imagePreview = '';
                if (nameEl) nameEl.textContent = 'No file selected';
                if (previewEl) {
                  previewEl.innerHTML = `<div class="noise-image-empty text-[10px] text-vectura-muted">No image</div>`;
                }
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }

            wrap.classList.toggle('hidden', noise.type !== 'image');
            return wrap;
          };

          const buildImageEffectsList = (noise) => {
            const wrap = document.createElement('div');
            wrap.className = 'image-effects';
            if (noise.type !== 'image') {
              wrap.classList.add('hidden');
              return wrap;
            }

            const baseEffect = noiseBase.imageEffects?.[0] || { mode: 'luma', enabled: true };
            this.normalizeImageEffects(noise, baseEffect);

            const effects = Array.isArray(noise.imageEffects) ? noise.imageEffects : [];
            const header = document.createElement('div');
            header.className = 'image-effects-header';
            header.innerHTML = `
              <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Image Effects</span>
              <button type="button" class="image-effect-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
                + Add Effect
              </button>
            `;
            const addBtn = header.querySelector('.image-effect-add');
            if (addBtn) {
              addBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const next = {
                  ...clone(baseEffect),
                  id: `effect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                  enabled: true,
                  mode: baseEffect.mode || 'luma',
                };
                effects.push(next);
                noise.imageEffects = effects;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            wrap.appendChild(header);

            const effectGripMarkup = `
              <button class="noise-grip" type="button" aria-label="Reorder effect">
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
              </button>
            `;

            const buildEffectRangeControl = (effect, def) => {
              const control = document.createElement('div');
              control.className = 'noise-control';
              const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
              const value = effect[def.key] ?? baseEffect[def.key] ?? 0;
              if (effect[def.key] === undefined) effect[def.key] = value;
              const { min, max, step } = getDisplayConfig(def);
              const displayVal = toDisplayValue(def, value);
              control.innerHTML = `
                <div class="flex justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <label class="control-label mb-0">${def.label}</label>
                    ${infoBtn}
                  </div>
                  <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                    def,
                    value
                  )}</button>
                </div>
                <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
                <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
              `;
              const input = control.querySelector('input[type="range"]');
              const valueBtn = control.querySelector('.value-chip');
              const valueInput = control.querySelector('.value-input');
              if (input && valueBtn) {
                input.disabled = !noise.enabled || !effect.enabled;
                valueBtn.classList.toggle('opacity-60', !noise.enabled || !effect.enabled);
                input.oninput = (e) => {
                  const nextDisplay = parseFloat(e.target.value);
                  valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
                };
                input.onchange = (e) => {
                  if (this.app.pushHistory) this.app.pushHistory();
                  const nextDisplay = parseFloat(e.target.value);
                  effect[def.key] = fromDisplayValue(def, nextDisplay);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.updateFormula();
                };
                attachKeyboardRangeNudge(input, (nextDisplay) => {
                  effect[def.key] = fromDisplayValue(def, nextDisplay);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.updateFormula();
                });
                input.addEventListener('dblclick', (e) => {
                  e.preventDefault();
                  const nextVal = baseEffect[def.key];
                  if (nextVal === undefined) return;
                  if (this.app.pushHistory) this.app.pushHistory();
                  effect[def.key] = nextVal;
                  input.value = toDisplayValue(def, nextVal);
                  valueBtn.innerText = formatDisplayValue(def, nextVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.updateFormula();
                });
                attachValueEditor({
                  def,
                  valueEl: valueBtn,
                  inputEl: valueInput,
                  getValue: () => effect[def.key],
                  setValue: (displayVal, opts) => {
                    const commit = opts?.commit !== false;
                    if (commit && this.app.pushHistory) this.app.pushHistory();
                    effect[def.key] = fromDisplayValue(def, displayVal);
                    this.storeLayerParams(layer);
                    this.app.regen();
                    valueBtn.innerText = formatDisplayValue(def, effect[def.key]);
                    this.updateFormula();
                  },
                });
              }
              return control;
            };

            const buildEffectSelectControl = (effect, def) => {
              const control = document.createElement('div');
              control.className = 'noise-control';
              const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
              let value = effect[def.key];
              if ((value === undefined || value === null) && def.options && def.options.length) {
                value = def.options[0].value;
                effect[def.key] = value;
              }
              const optionsHtml = def.options
                .map(
                  (opt) =>
                    `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
                )
                .join('');
              const currentLabel = def.options.find((opt) => opt.value === value)?.label || value;
              control.innerHTML = `
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
              const input = control.querySelector('select');
              const span = control.querySelector('span');
              if (input && span) {
                input.disabled = !noise.enabled || !effect.enabled;
                input.onchange = (e) => {
                  if (this.app.pushHistory) this.app.pushHistory();
                  const next = e.target.value;
                  effect[def.key] = next;
                  this.storeLayerParams(layer);
                  span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                };
              }
              return control;
            };

            const bindEffectReorderGrip = (grip, card, effect) => {
              if (!grip) return;
              grip.onmousedown = (e) => {
                e.preventDefault();
                const dragEl = card;
                dragEl.classList.add('dragging');
                const indicator = document.createElement('div');
                indicator.className = 'image-effect-drop-indicator';
                wrap.insertBefore(indicator, dragEl.nextSibling);
                const currentOrder = effects.map((item) => item.id);
                const startIndex = currentOrder.indexOf(effect.id);

                const onMove = (ev) => {
                  const y = ev.clientY;
                  const items = Array.from(wrap.querySelectorAll('.image-effect-card')).filter((item) => item !== dragEl);
                  let inserted = false;
                  for (const item of items) {
                    const rect = item.getBoundingClientRect();
                    if (y < rect.top + rect.height / 2) {
                      wrap.insertBefore(indicator, item);
                      inserted = true;
                      break;
                    }
                  }
                  if (!inserted) wrap.appendChild(indicator);
                };

                const onUp = () => {
                  dragEl.classList.remove('dragging');
                  const siblings = Array.from(wrap.children);
                  const indicatorIndex = siblings.indexOf(indicator);
                  const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('image-effect-card'));
                  const newIndex = before.length;
                  indicator.remove();
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);

                  if (newIndex !== startIndex) {
                    const nextOrder = currentOrder.filter((id) => id !== effect.id);
                    nextOrder.splice(newIndex, 0, effect.id);
                    const map = new Map(effects.map((item) => [item.id, item]));
                    noise.imageEffects = nextOrder.map((id) => map.get(id)).filter(Boolean);
                    this.storeLayerParams(layer);
                    this.app.regen();
                    this.buildControls();
                    this.updateFormula();
                  }
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              };
            };

            effects.forEach((effect, idx) => {
              if (!effect.id) effect.id = `effect-${idx + 1}`;
              const card = document.createElement('div');
              card.className = `image-effect-card${effect.enabled ? '' : ' noise-disabled'}`;
              card.dataset.effectId = effect.id;
              const headerRow = document.createElement('div');
              headerRow.className = 'image-effect-header';
              headerRow.innerHTML = `
                <div class="flex items-center gap-2">
                  ${effectGripMarkup}
                  <span class="image-effect-title">Effect ${String(idx + 1).padStart(2, '0')}</span>
                </div>
                <div class="noise-actions">
                  <label class="noise-toggle">
                    <input type="checkbox" ${effect.enabled ? 'checked' : ''}>
                  </label>
                  <button type="button" class="noise-delete" aria-label="Delete effect">🗑</button>
                </div>
              `;
              const toggle = headerRow.querySelector('.noise-toggle input');
              const deleteBtn = headerRow.querySelector('.noise-delete');
              const grip = headerRow.querySelector('.noise-grip');
              bindEffectReorderGrip(grip, card, effect);
              if (toggle) {
                toggle.onchange = (e) => {
                  if (this.app.pushHistory) this.app.pushHistory();
                  effect.enabled = Boolean(e.target.checked);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                };
              }
              if (deleteBtn) {
                deleteBtn.onclick = () => {
                  if (effects.length <= 1) {
                    this.openModal({
                      title: 'Keep one effect',
                      body: `<p class="modal-text">At least one image effect is required.</p>`,
                    });
                    return;
                  }
                  if (this.app.pushHistory) this.app.pushHistory();
                  const index = effects.findIndex((item) => item.id === effect.id);
                  if (index >= 0) effects.splice(index, 1);
                  noise.imageEffects = effects;
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                };
              }
              card.appendChild(headerRow);

              const controls = document.createElement('div');
              controls.className = 'pendulum-controls';
              IMAGE_EFFECT_DEFS.forEach((def) => {
                if (def.showIf && !def.showIf(effect)) return;
                if (def.type === 'select') controls.appendChild(buildEffectSelectControl(effect, def));
                else controls.appendChild(buildEffectRangeControl(effect, def));
              });
              card.appendChild(controls);
              wrap.appendChild(card);
            });

            return wrap;
          };

          const bindNoiseReorderGrip = (grip, card, noise) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = noises.map((n) => n.id);
              const startIndex = currentOrder.indexOf(noise.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== noise.id);
                  nextOrder.splice(newIndex, 0, noise.id);
                  const map = new Map(noises.map((n) => [n.id, n]));
                  layer.params.noises = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          noises.forEach((noise, idx) => {
            if (!noise.id) noise.id = `noise-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${noise.enabled ? '' : ' noise-disabled'}`;
            card.dataset.noiseId = noise.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${noiseGripMarkup}
                <span class="noise-title">Noise ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${noise.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete noise">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindNoiseReorderGrip(grip, card, noise);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                noise.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (noises.length <= 1) {
                  this.openModal({
                    title: 'Keep one noise',
                    body: `<p class="modal-text">At least one noise layer is required for wavetable generation.</p>`,
                  });
                  return;
                }
                if (this.app.pushHistory) this.app.pushHistory();
                const index = noises.findIndex((item) => item.id === noise.id);
                if (index >= 0) noises.splice(index, 1);
                layer.params.noises = noises;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const tools = document.createElement('div');
            tools.className = 'flex gap-2 mb-3';
            tools.innerHTML = `
              <button type="button" class="noise-reset text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">
                Reset
              </button>
              <button type="button" class="noise-rand text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">
                Randomize
              </button>
            `;
            const resetBtn = tools.querySelector('.noise-reset');
            const randBtn = tools.querySelector('.noise-rand');
            if (resetBtn) {
              resetBtn.disabled = !noise.enabled;
              resetBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                resetNoise(noise, idx);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (randBtn) {
              randBtn.disabled = !noise.enabled;
              randBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                WAVE_NOISE_DEFS.forEach((nDef) => {
                  if (nDef.showIf && !nDef.showIf(noise)) return;
                  if (nDef.key === 'type' || nDef.key === 'blend') return;
                  if (nDef.type === 'select') {
                    const opts = nDef.options || [];
                    const available = nDef.randomExclude ? opts.filter((opt) => !nDef.randomExclude.includes(opt.value)) : opts;
                    if (!available.length) return;
                    const pick = available[Math.floor(Math.random() * available.length)];
                    noise[nDef.key] = pick.value;
                    return;
                  }
                  if (nDef.type === 'angle') {
                    const step = nDef.step ?? 1;
                    const next = Math.random() * (nDef.max - nDef.min) + nDef.min;
                    noise[nDef.key] = clamp(roundToStep(next, step), nDef.min, nDef.max);
                    return;
                  }
                  if (nDef.type === 'range') {
                    const step = nDef.step ?? 1;
                    const next = Math.random() * (nDef.max - nDef.min) + nDef.min;
                    noise[nDef.key] = clamp(roundToStep(next, step), nDef.min, nDef.max);
                  }
                });
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }

            const controls = document.createElement('div');
            controls.className = 'pendulum-controls';
            let toolsInserted = false;
            WAVE_NOISE_DEFS.forEach((nDef) => {
              if (nDef.showIf && !nDef.showIf(noise)) return;
              if (nDef.type === 'angle') {
                controls.appendChild(buildAngleControl(noise, nDef, idx));
              } else if (nDef.type === 'select') {
                controls.appendChild(buildSelectControl(noise, nDef, idx));
              } else {
                controls.appendChild(buildRangeControl(noise, nDef, idx));
              }
              if (nDef.key === 'type') {
                controls.appendChild(buildNoiseImageBlock(noise, idx));
              }
              if (nDef.key === 'imageInvertOpacity') {
                controls.appendChild(buildImageEffectsList(noise));
              }
              if (nDef.key === 'blend' && !toolsInserted) {
                controls.appendChild(tools);
                toolsInserted = true;
              }
            });
            if (!toolsInserted) controls.appendChild(tools);
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
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
            const resetToDefault = () => {
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              this.storeLayerParams(layer);
              input.value = toDisplayValue(def, defaultVal);
              valueBtn.innerText = formatDisplayValue(def, defaultVal);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            };
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
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              layer.params[def.id] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                statsEl.textContent = statsText();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
              },
            });
          }
          target.appendChild(div);
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
          const setAngle = (nextDisplay, commit = false, live = false) => {
            const clamped = clamp(roundToStep(nextDisplay, step), min, max);
            lastDisplay = clamped;
            if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
            if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
            if (commit || live) {
              if (commit && this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            }
          };
          const resetAngle = () => {
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            setAngle(toDisplayValue(def, defaultVal), true);
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
            dial.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetAngle();
            });
          }

          attachValueEditor({
            def,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => layer.params[def.id],
            setValue: (displayVal, opts) => {
              const commit = opts?.commit !== false;
              const live = Boolean(opts?.live);
              setAngle(displayVal, commit, live);
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
              maybeRebuildControls();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              const next = Boolean(defaultVal);
              input.checked = next;
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
              maybeRebuildControls();
            });
          }
        } else if (def.type === 'select') {
          if ((val === undefined || val === null) && def.options && def.options.length) {
            val = def.options[0].value;
            layer.params[def.id] = val;
          }
          if (def.options?.length && !def.options.some((opt) => opt.value === val)) {
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
              if (isPetalisLayerType(layer.type) && def.id === 'preset' && next === 'custom') {
                layer.params.preset = 'custom';
                layer.params.shadings = [];
                layer.params.innerShading = false;
                layer.params.outerShading = false;
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (isPetalisLayerType(layer.type) && def.id === 'preset' && next !== 'custom') {
                const preset = (PETALIS_PRESET_LIBRARY || []).find((item) => item.id === next);
                const presetBase = 'petalisDesigner';
                const base = ALGO_DEFAULTS?.[presetBase] ? clone(ALGO_DEFAULTS[presetBase]) : {};
                const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves']);
                const nextParams = { ...base, ...(preset?.params || {}) };
                preserved.forEach((key) => {
                  if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
                });
                nextParams.preset = next;
                layer.params = { ...layer.params, ...nextParams };
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              const fallback = def.options?.[0]?.value;
              const next = defaultVal !== null && defaultVal !== undefined ? defaultVal : fallback;
              if (next === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              input.value = next;
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            });
          }
        } else if (def.type === 'colorModal') {
          const colorVal = val || '#ffffff';
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="color-modal-trigger text-[10px] text-vectura-accent border border-vectura-border px-2 py-1 rounded">
                Set Color
              </button>
            </div>
            <div class="flex items-center gap-2">
              <span class="color-swatch" style="background:${colorVal}"></span>
              <span class="text-xs text-vectura-accent font-mono color-value">${colorVal}</span>
            </div>
          `;
          const btn = div.querySelector('.color-modal-trigger');
          const swatch = div.querySelector('.color-swatch');
          const valueEl = div.querySelector('.color-value');
          if (btn && swatch && valueEl) {
            btn.onclick = () => {
              this.openColorModal({
                title: def.label,
                value: layer.params[def.id] || colorVal,
                onApply: (next) => {
                  if (this.app.pushHistory) this.app.pushHistory();
                  layer.params[def.id] = next;
                  this.storeLayerParams(layer);
                  swatch.style.background = next;
                  valueEl.textContent = next;
                  this.app.regen();
                  this.updateFormula();
                },
              });
            };
          }
        } else if (def.type === 'color') {
          const colorVal = val || '#ffffff';
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${colorVal}</span>
            </div>
            <input type="color" value="${colorVal}" class="w-full h-8 bg-transparent border border-vectura-border rounded">
          `;
          const input = div.querySelector('input');
          const span = div.querySelector('span');
          if (input && span) {
            input.oninput = (e) => {
              span.innerText = e.target.value;
            };
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = e.target.value;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              if (!defaultVal) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              input.value = defaultVal;
              span.innerText = defaultVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
          }
        } else if (def.type === 'rangeDual') {
          const minVal = layer.params[def.minKey];
          const maxVal = layer.params[def.maxKey];
          const { min: displayMin, max: displayMax, step: displayStep } = getDisplayConfig(def);
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
          `;
          const minInput = div.querySelector('input[data-handle="min"]');
          const maxInput = div.querySelector('input[data-handle="max"]');
          const valueBtn = div.querySelector('.value-chip');
          const resetToDefault = () => {
            const defaults = getDefaultValue(def);
            if (!defaults || defaults.min === undefined || defaults.max === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.minKey] = defaults.min;
            layer.params[def.maxKey] = defaults.max;
            if (minInput) minInput.value = toDisplayValue(def, defaults.min);
            if (maxInput) maxInput.value = toDisplayValue(def, defaults.max);
            this.storeLayerParams(layer);
            this.app.regen();
            if (valueBtn) {
              valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
                def,
                layer.params[def.maxKey]
              )}`;
            }
            this.updateFormula();
          };

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
            attachKeyboardRangeNudge(minInput, () => {
              syncValues('min');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            attachKeyboardRangeNudge(maxInput, () => {
              syncValues('max');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            minInput.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            maxInput.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
          }
          if (valueBtn) {
            attachValueEditor({
              def,
              valueEl: valueBtn,
              getValue: () => ({
                min: layer.params[def.minKey],
                max: layer.params[def.maxKey],
              }),
              formatValue: (current) => {
                const currMin = toDisplayValue(def, current.min);
                const currMax = toDisplayValue(def, current.max);
                return `${currMin}, ${currMax}`;
              },
              parseValue: (raw) => {
                const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
                if (parts.length !== 2) return null;
                const minValParsed = Number.parseFloat(parts[0]);
                const maxValParsed = Number.parseFloat(parts[1]);
                if (
                  !Number.isFinite(minValParsed) ||
                  !Number.isFinite(maxValParsed) ||
                  minValParsed < displayMin ||
                  maxValParsed > displayMax ||
                  minValParsed > maxValParsed
                ) {
                  return null;
                }
                return { min: minValParsed, max: maxValParsed };
              },
              setValue: (vals, opts) => {
                if (!vals) return;
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                if (minInput) minInput.value = vals.min;
                if (maxInput) maxInput.value = vals.max;
                syncValues();
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              },
            });
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
            const resetToDefault = () => {
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              this.storeLayerParams(layer);
              input.value = toDisplayValue(def, defaultVal);
              valueBtn.innerText = formatDisplayValue(def, defaultVal);
              this.app.regen();
              this.updateFormula();
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
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              const nextVal = confirmHeavy(nextDisplay);
              if (nextVal === null) return;
              layer.params[def.id] = nextVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal, opts) => {
                const nextVal = confirmHeavy(displayVal);
                if (nextVal === null) return;
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = nextVal;
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
              },
            });
          }
        }
        target.appendChild(div);
      };

      const renderOptimizationPanel = (target) => {
        if (!target) return;
        const panel = document.createElement('div');
        panel.className = 'optimization-panel';
        panel.innerHTML = `<div class="control-section-title">Optimization</div>`;

        const getTargets = () => {
          const scope = SETTINGS.optimizationScope || 'active';
          let targets = [];
          if (scope === 'selected') {
            targets = this.app.renderer?.getSelectedLayers?.() || [];
          } else if (scope === 'all') {
            targets = this.app.engine.layers.filter((l) => !l.isGroup);
          } else {
            const active = this.app.engine.getActiveLayer();
            if (active) targets = [active];
          }
          if (!targets.length) {
            const active = this.app.engine.getActiveLayer();
            if (active) targets = [active];
          }
          return targets.filter((l) => l && !l.isGroup);
        };

        const normalizeConfig = (config) => {
          if (!config) return null;
          if (!Array.isArray(config.steps)) config.steps = [];
          const defaults = SETTINGS.optimizationDefaults || { bypassAll: false, steps: [] };
          const defaultSteps = Array.isArray(defaults.steps) ? defaults.steps : [];
          const defaultMap = new Map(defaultSteps.map((step) => [step.id, step]));
          config.steps = config.steps.map((step) => ({
            ...(defaultMap.get(step.id) || {}),
            ...step,
          }));
          defaultSteps.forEach((step) => {
            if (!config.steps.some((s) => s.id === step.id)) {
              config.steps.push(clone(step));
            }
          });
          if (config.bypassAll === undefined) config.bypassAll = defaults.bypassAll ?? false;
          return config;
        };

        const getStepDefaults = (id) => {
          const defaults = SETTINGS.optimizationDefaults || { steps: [] };
          return (defaults.steps || []).find((step) => step.id === id) || {};
        };

        const targets = getTargets();
        const config = targets.length ? normalizeConfig(this.app.engine.ensureLayerOptimization(targets[0])) : null;

        const updateStats = () => {
          const scopedTargets = getTargets();
          if (!config || !scopedTargets.length) return;
          this.app.engine.optimizeLayers(scopedTargets);
          const before = this.app.engine.computeStats(scopedTargets, { useOptimized: false });
          const after = this.app.engine.computeStats(scopedTargets, { useOptimized: true });
          const beforeEl = panel.querySelector('[data-opt-stat="before"]');
          const afterEl = panel.querySelector('[data-opt-stat="after"]');
          const formatStats = (stats) =>
            `Lines ${stats.lines || 0} • Points ${stats.points || 0} • ${stats.distance} • ${stats.time}`;
          if (beforeEl) beforeEl.textContent = formatStats(before);
          if (afterEl) afterEl.textContent = formatStats(after);
        };

        const applyOptimization = (mutator) => {
          const scopedTargets = getTargets();
          if (!scopedTargets.length) return;
          const scope = SETTINGS.optimizationScope || 'active';
          const baseConfig = normalizeConfig(this.app.engine.ensureLayerOptimization(scopedTargets[0]));
          if (mutator) mutator(baseConfig);
          if (scope !== 'active') {
            const snapshot = clone(baseConfig);
            scopedTargets.forEach((layer, idx) => {
              if (idx === 0) return;
              layer.optimization = clone(snapshot);
            });
            this.app.engine.optimizeLayers(scopedTargets, { config: snapshot });
          } else {
            this.app.engine.optimizeLayers(scopedTargets, { config: baseConfig });
          }
          this.app.render();
          updateStats();
        };

        const buildRow = (label, controlEl) => {
          const row = document.createElement('div');
          row.className = 'optimization-row';
          const lab = document.createElement('label');
          lab.className = 'control-label mb-0';
          lab.textContent = label;
          row.appendChild(lab);
          row.appendChild(controlEl);
          return row;
        };

        const scopeSelect = document.createElement('select');
        scopeSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        scopeSelect.innerHTML = `
          <option value="active">Active Layer</option>
          <option value="selected">Selected Layers</option>
          <option value="all">All Layers</option>
        `;
        scopeSelect.value = SETTINGS.optimizationScope || 'active';
        scopeSelect.onchange = (e) => {
          SETTINGS.optimizationScope = e.target.value;
          this.buildControls();
          this.app.render();
        };
        panel.appendChild(buildRow('Scope', scopeSelect));

        const previewSelect = document.createElement('select');
        previewSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        previewSelect.innerHTML = `
          <option value="off">Off</option>
          <option value="replace">Replace</option>
          <option value="overlay">Overlay</option>
        `;
        previewSelect.value = SETTINGS.optimizationPreview || 'off';
        previewSelect.onchange = (e) => {
          SETTINGS.optimizationPreview = e.target.value;
          this.buildControls();
          this.app.render();
        };
        panel.appendChild(buildRow('Preview', previewSelect));

        const exportToggle = document.createElement('input');
        exportToggle.type = 'checkbox';
        exportToggle.checked = Boolean(SETTINGS.optimizationExport);
        exportToggle.onchange = (e) => {
          SETTINGS.optimizationExport = Boolean(e.target.checked);
        };
        panel.appendChild(buildRow('Export Optimized', exportToggle));

        const bypassToggle = document.createElement('input');
        bypassToggle.type = 'checkbox';
        bypassToggle.checked = Boolean(config?.bypassAll);
        bypassToggle.onchange = (e) => {
          if (!config) return;
          applyOptimization((cfg) => {
            cfg.bypassAll = Boolean(e.target.checked);
          });
        };
        panel.appendChild(buildRow('Bypass All', bypassToggle));

        const overlayControls = document.createElement('div');
        overlayControls.className = 'optimization-overlay';
        const overlayColor = document.createElement('input');
        overlayColor.type = 'color';
        overlayColor.value = SETTINGS.optimizationOverlayColor || '#38bdf8';
        overlayColor.oninput = (e) => {
          SETTINGS.optimizationOverlayColor = e.target.value;
          this.app.render();
        };
        const overlayWidth = document.createElement('input');
        overlayWidth.type = 'range';
        overlayWidth.min = '0.05';
        overlayWidth.max = '1';
        overlayWidth.step = '0.05';
        overlayWidth.value = SETTINGS.optimizationOverlayWidth ?? 0.2;
        overlayWidth.oninput = (e) => {
          const next = parseFloat(e.target.value);
          SETTINGS.optimizationOverlayWidth = next;
          overlayWidthLabel.textContent = `${next.toFixed(2)}mm`;
          this.app.render();
        };
        const overlayWidthLabel = document.createElement('span');
        overlayWidthLabel.className = 'text-[10px] text-vectura-muted';
        overlayWidthLabel.textContent = `${SETTINGS.optimizationOverlayWidth ?? 0.2}mm`;
        overlayControls.appendChild(overlayColor);
        overlayControls.appendChild(overlayWidth);
        overlayControls.appendChild(overlayWidthLabel);
        const overlayRow = buildRow('Overlay Style', overlayControls);
        if ((SETTINGS.optimizationPreview || 'off') !== 'overlay') overlayRow.classList.add('hidden');
        panel.appendChild(overlayRow);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'opt-reset';
        resetBtn.textContent = 'Reset Optimizations';
        resetBtn.onclick = () => {
          const defaults = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
          applyOptimization((cfg) => {
            cfg.bypassAll = defaults.bypassAll ?? false;
            cfg.steps = clone(defaults.steps || []);
          });
          this.buildControls();
        };
        const resetRow = document.createElement('div');
        resetRow.className = 'optimization-actions';
        resetRow.appendChild(resetBtn);
        panel.appendChild(resetRow);

        const stats = document.createElement('div');
        stats.className = 'optimization-stats';
        stats.innerHTML = `
          <div class="optimization-stat-row">
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Before</span>
            <span class="text-[10px] text-vectura-accent" data-opt-stat="before">Lines 0 • Points 0 • 0m • 0:00</span>
          </div>
          <div class="optimization-stat-row">
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">After</span>
            <span class="text-[10px] text-vectura-accent" data-opt-stat="after">Lines 0 • Points 0 • 0m • 0:00</span>
          </div>
        `;
        panel.appendChild(stats);

        if (!config) {
          target.appendChild(panel);
          return;
        }

        const list = document.createElement('div');
        list.className = 'optimization-list';

        const formatOptValue = (def, value) => {
          const { precision, unit } = getDisplayConfig(def);
          const factor = Math.pow(10, precision);
          const rounded = Math.round((value ?? 0) * factor) / factor;
          return `${rounded}${unit}`;
        };

        const buildRangeControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          const value = stepConfig[def.key] ?? getStepDefaults(stepConfig.id)[def.key] ?? def.min ?? 0;
          if (stepConfig[def.key] === undefined) stepConfig[def.key] = value;
          const { min, max, step } = getDisplayConfig(def);
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${def.label}</label>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatOptValue(
                def,
                value
              )}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="w-full">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          const valueInput = control.querySelector('.value-input');
          if (input && valueBtn) {
            input.oninput = (e) => {
              const next = parseFloat(e.target.value);
              valueBtn.textContent = formatOptValue(def, next);
            };
            input.onchange = (e) => {
              const next = parseFloat(e.target.value);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              if (defaults[def.key] === undefined) return;
              const next = defaults[def.key];
              input.value = next;
              valueBtn.textContent = formatOptValue(def, next);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => stepConfig[def.key],
              setValue: (displayVal, opts) => {
                applyOptimization((cfg) => {
                  const step = cfg.steps.find((s) => s.id === stepConfig.id);
                  if (step) step[def.key] = displayVal;
                });
              },
            });
          }
          return control;
        };

        const buildSelectControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          let value = stepConfig[def.key];
          if ((value === undefined || value === null) && def.options?.length) {
            value = def.options[0].value;
            stepConfig[def.key] = value;
          }
          const optionsHtml = (def.options || [])
            .map((opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          const currentLabel = def.options.find((opt) => opt.value === value)?.label || value;
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${def.label}</label>
              <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const input = control.querySelector('select');
          const span = control.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              const next = e.target.value;
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
              span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              const next = defaults[def.key] ?? def.options?.[0]?.value;
              if (next === undefined) return;
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
              input.value = next;
              span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
            });
          }
          return control;
        };

        const buildCheckboxControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          const checked = Boolean(stepConfig[def.key]);
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${def.label}</label>
              <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4">
          `;
          const input = control.querySelector('input');
          const span = control.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              const next = Boolean(e.target.checked);
              span.textContent = next ? 'ON' : 'OFF';
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              if (defaults[def.key] === undefined) return;
              const next = Boolean(defaults[def.key]);
              input.checked = next;
              span.textContent = next ? 'ON' : 'OFF';
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            });
          }
          return control;
        };

        const bindReorderGrip = (grip, card, stepId) => {
          if (!grip) return;
          grip.onmousedown = (e) => {
            e.preventDefault();
            const dragEl = card;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'optimization-drop-indicator';
            list.insertBefore(indicator, dragEl.nextSibling);
            const currentOrder = config.steps.map((step) => step.id);
            const startIndex = currentOrder.indexOf(stepId);
            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(list.querySelectorAll('.optimization-card')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  list.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) list.appendChild(indicator);
            };
            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(list.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('optimization-card'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              if (newIndex === startIndex || newIndex < 0) return;
              applyOptimization((cfg) => {
                const order = cfg.steps.map((step) => step.id).filter((id) => id !== stepId);
                const targetIndex = Math.max(0, Math.min(order.length, newIndex));
                order.splice(targetIndex, 0, stepId);
                const map = new Map(cfg.steps.map((step) => [step.id, step]));
                cfg.steps = order.map((id) => map.get(id)).filter(Boolean);
              });
              this.buildControls();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        };

        OPTIMIZATION_STEPS.forEach((def) => {
          const stepConfig = config.steps.find((step) => step.id === def.id) || { id: def.id, enabled: false, bypass: false };
          if (!config.steps.find((step) => step.id === def.id)) config.steps.push(stepConfig);
          const card = document.createElement('div');
          card.className = 'optimization-card';
          card.dataset.stepId = def.id;
          const header = document.createElement('div');
          header.className = 'optimization-card-header';
          header.innerHTML = `
            <div class="optimization-card-title">
              <button class="optimization-grip" type="button" aria-label="Reorder optimization">
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
              </button>
              <span>${def.label}</span>
            </div>
            <div class="optimization-card-actions">
              <label class="opt-toggle"><input type="checkbox" ${stepConfig.enabled ? 'checked' : ''}>Apply</label>
              <label class="opt-toggle"><input type="checkbox" ${stepConfig.bypass ? 'checked' : ''}>Bypass</label>
            </div>
          `;
          const grip = header.querySelector('.optimization-grip');
          bindReorderGrip(grip, card, def.id);
          const [applyToggle, bypassStepToggle] = header.querySelectorAll('input[type="checkbox"]');
          if (applyToggle) {
            applyToggle.onchange = (e) => {
              const next = Boolean(e.target.checked);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === def.id);
                if (step) step.enabled = next;
              });
              this.buildControls();
            };
          }
          if (bypassStepToggle) {
            bypassStepToggle.onchange = (e) => {
              const next = Boolean(e.target.checked);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === def.id);
                if (step) step.bypass = next;
              });
              this.buildControls();
            };
          }
          card.appendChild(header);

          const controlsWrap = document.createElement('div');
          controlsWrap.className = 'optimization-controls';
          const isDisabled = !stepConfig.enabled || config.bypassAll;
          if (isDisabled) controlsWrap.classList.add('is-disabled');
          (def.controls || []).forEach((cDef) => {
            let control = null;
            if (cDef.type === 'select') control = buildSelectControl(stepConfig, cDef);
            else if (cDef.type === 'checkbox') control = buildCheckboxControl(stepConfig, cDef);
            else control = buildRangeControl(stepConfig, cDef);
            if (control) {
              const inputs = control.querySelectorAll('input, select, button');
              inputs.forEach((input) => {
                if (input.type === 'button') return;
                input.disabled = isDisabled;
              });
              controlsWrap.appendChild(control);
            }
          });
          card.appendChild(controlsWrap);
          list.appendChild(card);
        });

        panel.appendChild(list);
        target.appendChild(panel);
        updateStats();
      };

      if (!isGroup) {
        algoDefs.forEach((def) => renderDef(def, container));
      }
      if (commonDefs.length) {
        container.appendChild(globalSection);
        commonDefs.forEach((def) => renderDef(def, globalBody));
      }
      const optimizationTarget = getEl('optimization-controls');
      if (optimizationTarget) {
        optimizationTarget.innerHTML = '';
        renderOptimizationPanel(optimizationTarget);
      }
      restoreLeftPanelScroll();
    }

    updateFormula() {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
      const formula = getEl('formula-display');
      const seedDisplay = getEl('formula-seed-display');
      if (formula) {
        const escapeHtml = (str) =>
          `${str}`
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const fmt = (val) => {
          if (typeof val === 'number') return Number.isFinite(val) ? val.toFixed(3) : `${val}`;
          if (typeof val === 'boolean') return val ? 'true' : 'false';
          if (val === null || val === undefined) return '';
          if (Array.isArray(val)) return val.map((item) => fmt(item)).join(', ');
          if (typeof val === 'object') return JSON.stringify(val);
          return `${val}`;
        };
        const entries = [];
        Object.entries(l.params || {}).forEach(([key, val]) => {
          if (key === 'pendulums' && Array.isArray(val)) {
            val.forEach((pend, idx) => {
              if (!pend || typeof pend !== 'object') return;
              Object.entries(pend).forEach(([pKey, pVal]) => {
                if (pKey === 'id') return;
                entries.push([`P${idx + 1}.${pKey}`, fmt(pVal)]);
              });
            });
            return;
          }
          if (key === 'noises' && Array.isArray(val)) {
            val.forEach((noise, idx) => {
              if (!noise || typeof noise !== 'object') return;
              Object.entries(noise).forEach(([nKey, nVal]) => {
                if (nKey === 'id' || nKey === 'imagePreview') return;
                entries.push([`N${idx + 1}.${nKey}`, fmt(nVal)]);
              });
            });
            return;
          }
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            Object.entries(val).forEach(([subKey, subVal]) => {
              entries.push([`${key}.${subKey}`, fmt(subVal)]);
            });
            return;
          }
          entries.push([key, fmt(val)]);
        });
        const formulaText = this.app.engine.getFormula(l.id);
        const formulaLines = `${formulaText || ''}`.split('\n').filter((line) => line.trim().length);
        const formulaHtml = formulaLines
          .map((line) => `<div class="formula-line">${escapeHtml(line)}</div>`)
          .join('');
        const valuesHtml = entries.length
          ? `
            <div class="formula-values">
              <div class="formula-values-title">Values</div>
              ${entries
                .map(
                  ([key, val]) =>
                    `<div class="formula-row"><span class="formula-key">${escapeHtml(
                      key
                    )}</span><span class="formula-val">${escapeHtml(val)}</span></div>`
                )
                .join('')}
            </div>
          `
          : '';
        formula.innerHTML = `
          <div class="formula-block">
            <div class="formula-equation">${formulaHtml || '<span class="text-vectura-muted">Select a layer...</span>'}</div>
            ${valuesHtml}
          </div>
        `;
      }
      if (seedDisplay) {
        seedDisplay.style.display = usesSeed(l.type) ? '' : 'none';
        seedDisplay.innerText = `Seed: ${l.params.seed}`;
      }
    }

    getAppVersion() {
      const meta = document.querySelector('.pane-meta');
      if (!meta) return '';
      return `${meta.textContent || ''}`.replace('V.', '').trim();
    }

    saveVecturaFile() {
      const version = this.getAppVersion();
      const images = window.Vectura?.NOISE_IMAGES || {};
      const imagePayload = Object.entries(images).reduce((acc, [id, img]) => {
        if (!img || !img.data) return acc;
        acc[id] = {
          width: img.width,
          height: img.height,
          data: Array.from(img.data),
        };
        return acc;
      }, {});
      const payload = {
        type: 'vectura',
        version,
        created: new Date().toISOString(),
        state: this.app.captureState(),
        images: imagePayload,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `vectura-${date}.vectura`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    openVecturaFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const state = data?.state || data;
          if (!state?.engine || !state?.settings) {
            throw new Error('Missing state payload');
          }
          if (data?.images) {
            const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
            Object.entries(data.images).forEach(([id, img]) => {
              if (!img || !Array.isArray(img.data)) return;
              store[id] = {
                width: img.width,
                height: img.height,
                data: new Uint8ClampedArray(img.data),
              };
            });
          }
          this.app.applyState(state);
          this.app.history = [];
          this.app.pushHistory();
        } catch (err) {
          this.openModal({
            title: 'Invalid File',
            body: `<p class="modal-text">That file could not be loaded as a .vectura document.</p>`,
          });
        }
      };
      reader.readAsText(file);
    }

    importSvgFile(file) {
      if (!file || !Layer) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        const groups = this.parseSvgToLayerGroups(text);
        if (!groups.length) {
          this.openModal({
            title: 'No Paths Found',
            body: `<p class="modal-text">The SVG did not contain any vector paths to import.</p>`,
          });
          return;
        }
        if (this.app.pushHistory) this.app.pushHistory();
        const created = [];
        groups.forEach((group) => {
          const id = Math.random().toString(36).substr(2, 9);
          const name = this.getUniqueLayerName(group.name || 'Imported SVG', id);
          const layer = new Layer(id, 'expanded', name);
          layer.params.seed = 0;
          layer.params.smoothing = 0;
          layer.params.simplify = 0;
          layer.params.curves = false;
          layer.sourcePaths = clone(group.paths);
          if (group.stroke) layer.color = group.stroke;
          if (Number.isFinite(group.strokeWidth)) layer.strokeWidth = group.strokeWidth;
          created.push(layer);
          this.app.engine.layers.push(layer);
          this.app.engine.generate(layer.id);
        });
        const primary = created[created.length - 1];
        if (primary && this.app.renderer) {
          this.app.engine.activeLayerId = primary.id;
          this.app.renderer.setSelection([primary.id], primary.id);
        }
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      };
      reader.readAsText(file);
    }

    parseSvgToLayerGroups(svgText) {
      if (!svgText) return [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return [];
      const parseNumber = (val, fallback = 0) => {
        if (!val) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };
      const viewBox = svg.getAttribute('viewBox');
      let vbMinX = 0;
      let vbMinY = 0;
      let vbW = parseNumber(svg.getAttribute('width'), 0);
      let vbH = parseNumber(svg.getAttribute('height'), 0);
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map((v) => parseFloat(v));
        if (parts.length >= 4) {
          [vbMinX, vbMinY, vbW, vbH] = parts;
        }
      }
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (viewBox) tempSvg.setAttribute('viewBox', viewBox);
      if (vbW && vbH) {
        tempSvg.setAttribute('width', vbW);
        tempSvg.setAttribute('height', vbH);
      }
      tempSvg.style.position = 'absolute';
      tempSvg.style.left = '-9999px';
      tempSvg.style.top = '-9999px';
      tempSvg.style.width = '0';
      tempSvg.style.height = '0';
      tempSvg.style.visibility = 'hidden';
      document.body.appendChild(tempSvg);

      const groups = new Map();
      const order = [];
      const addGroup = (key, name, stroke, strokeWidth) => {
        if (!groups.has(key)) {
          groups.set(key, { name, stroke, strokeWidth, paths: [] });
          order.push(key);
        }
        return groups.get(key);
      };
      const elements = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
      elements.forEach((el) => {
        const clone = el.cloneNode(true);
        tempSvg.appendChild(clone);
        const stroke = el.getAttribute('stroke') || el.style?.stroke || '';
        const strokeWidth = parseNumber(el.getAttribute('stroke-width') || el.style?.strokeWidth, NaN);
        const groupLabel =
          el.closest('g')?.getAttribute('data-name') ||
          el.closest('g')?.getAttribute('id') ||
          (stroke && stroke !== 'none' ? `Stroke ${stroke}` : 'Imported SVG');
        const key = `${groupLabel}|${stroke || 'none'}`;
        const group = addGroup(key, groupLabel || 'Imported SVG', stroke && stroke !== 'none' ? stroke : null, strokeWidth);
        const paths = this.svgElementToPaths(clone, vbMinX, vbMinY);
        paths.forEach((path) => group.paths.push(path));
        clone.remove();
      });
      tempSvg.remove();

      return order.map((key) => groups.get(key)).filter((group) => group.paths && group.paths.length);
    }

    svgElementToPaths(el, offsetX = 0, offsetY = 0) {
      if (!el) return [];
      const tag = el.tagName.toLowerCase();
      const applyMatrix = (pt, matrix) => {
        if (!matrix) return pt;
        return {
          x: pt.x * matrix.a + pt.y * matrix.c + matrix.e,
          y: pt.x * matrix.b + pt.y * matrix.d + matrix.f,
        };
      };
      const applyOffset = (pt) => ({ x: pt.x - offsetX, y: pt.y - offsetY });
      const matrix = typeof el.getCTM === 'function' ? el.getCTM() : null;
      const normalizePoints = (points) =>
        points.map((pt) => applyOffset(applyMatrix({ x: pt.x, y: pt.y }, matrix)));
      const parseNumber = (val, fallback = 0) => {
        if (val === undefined || val === null) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };

      if (tag === 'line') {
        const x1 = parseNumber(el.getAttribute('x1'));
        const y1 = parseNumber(el.getAttribute('y1'));
        const x2 = parseNumber(el.getAttribute('x2'));
        const y2 = parseNumber(el.getAttribute('y2'));
        return [normalizePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }])];
      }
      if (tag === 'polyline' || tag === 'polygon') {
        const pointsAttr = el.getAttribute('points') || '';
        const coords = pointsAttr
          .trim()
          .split(/[\s,]+/)
          .map((val) => parseFloat(val))
          .filter((val) => Number.isFinite(val));
        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push({ x: coords[i], y: coords[i + 1] });
        }
        if (tag === 'polygon' && points.length) points.push({ ...points[0] });
        return points.length ? [normalizePoints(points)] : [];
      }
      if (tag === 'rect') {
        const x = parseNumber(el.getAttribute('x'));
        const y = parseNumber(el.getAttribute('y'));
        const w = parseNumber(el.getAttribute('width'));
        const h = parseNumber(el.getAttribute('height'));
        const points = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ];
        return [normalizePoints(points)];
      }
      if (tag === 'circle' || tag === 'ellipse') {
        const cx = parseNumber(el.getAttribute('cx'));
        const cy = parseNumber(el.getAttribute('cy'));
        const rx = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'rx'));
        const ry = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'ry'));
        const steps = 48;
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          points.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        return [normalizePoints(points)];
      }
      if (tag === 'path') {
        try {
          const total = el.getTotalLength();
          if (!Number.isFinite(total) || total <= 0) return [];
          const step = Math.max(1, total / 300);
          const points = [];
          for (let d = 0; d <= total; d += step) {
            const pt = el.getPointAtLength(d);
            points.push({ x: pt.x, y: pt.y });
          }
          const end = el.getPointAtLength(total);
          points.push({ x: end.x, y: end.y });
          return [normalizePoints(points)];
        } catch (err) {
          return [];
        }
      }
      return [];
    }

    exportSVG() {
      const prof = this.app.engine.currentProfile;
      const precision = Math.max(0, Math.min(6, SETTINGS.precision ?? 3));
      const useOptimized = Boolean(SETTINGS.optimizationExport);
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
      if (useOptimized) {
        this.app.engine.optimizeLayers(this.app.engine.layers);
      }
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
          let paths = useOptimized && l.optimizedPaths ? l.optimizedPaths : l.paths;
          if (SETTINGS.cropExports) {
            const marginRect = {
              x: SETTINGS.margin,
              y: SETTINGS.margin,
              w: prof.width - SETTINGS.margin * 2,
              h: prof.height - SETTINGS.margin * 2,
            };
            paths = (paths || []).flatMap((p) => {
              if (p && p.meta && p.meta.kind === 'circle') {
                const expanded = expandCirclePath(p.meta, 72);
                return clipPathToRect(expanded, marginRect);
              }
              let geom = p;
              if (useCurves) geom = resampleCurvedPath(p);
              return clipPathToRect(geom, marginRect);
            });
          }
          (paths || []).forEach((p) => {
            if (seen) {
              const key = pathKey(p);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
            }
            const forceLinear = SETTINGS.cropExports;
            const markup = shapeToSvg(p, precision, forceLinear ? false : useCurves);
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
