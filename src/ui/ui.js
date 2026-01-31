/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MACHINES, Algorithms, SeededRNG, SimpleNoise } = window.Vectura || {};

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundToStep = (value, step) => (step ? Math.round(value / step) * step : value);

  const formatValue = (value) => {
    if (typeof value === 'number') {
      const rounded = Math.round(value * 1000) / 1000;
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
  ];

  const CONTROL_DEFS = {
    flowfield: [
      { id: 'noiseScale', label: 'Noise Scale', type: 'range', min: 0.001, max: 0.08, step: 0.001, infoKey: 'flowfield.noiseScale' },
      { id: 'density', label: 'Density', type: 'range', min: 200, max: 6000, step: 100, infoKey: 'flowfield.density' },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 1, max: 20, step: 1, infoKey: 'flowfield.stepLen' },
      { id: 'maxSteps', label: 'Max Steps', type: 'range', min: 20, max: 500, step: 10, infoKey: 'flowfield.maxSteps' },
      { id: 'force', label: 'Distortion Force', type: 'range', min: 0.1, max: 4.0, step: 0.1, infoKey: 'flowfield.force' },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 1.0, step: 0.05, infoKey: 'flowfield.chaos' },
      { id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 4, step: 1, infoKey: 'flowfield.octaves' },
    ],
    lissajous: [
      { id: 'freqX', label: 'Freq X', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqX' },
      { id: 'freqY', label: 'Freq Y', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqY' },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 0.01, step: 0.0001, infoKey: 'lissajous.damping' },
      { id: 'phase', label: 'Phase', type: 'range', min: 0, max: 6.28, step: 0.1, infoKey: 'lissajous.phase' },
      { id: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1, infoKey: 'lissajous.rotation' },
      { id: 'resolution', label: 'Resolution', type: 'range', min: 50, max: 800, step: 10, infoKey: 'lissajous.resolution' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.2, step: 0.05, infoKey: 'lissajous.scale' },
    ],
    wavetable: [
      { id: 'lines', label: 'Lines', type: 'range', min: 5, max: 160, step: 1, infoKey: 'wavetable.lines' },
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 2, max: 140, step: 1, infoKey: 'wavetable.amplitude' },
      { id: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.002, max: 0.08, step: 0.001, infoKey: 'wavetable.zoom' },
      { id: 'tilt', label: 'Row Shift', type: 'range', min: -12, max: 12, step: 1, infoKey: 'wavetable.tilt' },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'freq', label: 'Frequency', type: 'range', min: 0.2, max: 12.0, step: 0.1, infoKey: 'wavetable.freq' },
      { id: 'noiseAngle', label: 'Noise Angle', type: 'range', min: -180, max: 180, step: 5, infoKey: 'wavetable.noiseAngle' },
      { id: 'edgeFade', label: 'Edge Fade', type: 'range', min: 0, max: 0.5, step: 0.02, infoKey: 'wavetable.edgeFade' },
      { id: 'truncate', label: 'Truncate', type: 'checkbox', infoKey: 'wavetable.truncate' },
      { id: 'flatCaps', label: 'Flat Top/Bottom', type: 'checkbox', infoKey: 'wavetable.flatCaps' },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 40, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Resolution', type: 'range', min: 20, max: 240, step: 10, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 60, step: 1, infoKey: 'spiral.startR' },
      { id: 'noiseAmp', label: 'Noise Amp', type: 'range', min: 0, max: 40, step: 1, infoKey: 'spiral.noiseAmp' },
      { id: 'noiseFreq', label: 'Noise Freq', type: 'range', min: 0.01, max: 0.5, step: 0.01, infoKey: 'spiral.noiseFreq' },
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
      { id: 'count', label: 'Count', type: 'range', min: 100, max: 2000, step: 50, infoKey: 'phylla.count' },
      { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'phylla.spacing' },
      { id: 'angleStr', label: 'Angle', type: 'range', min: 130, max: 140, step: 0.01, infoKey: 'phylla.angleStr' },
      { id: 'divergence', label: 'Divergence', type: 'range', min: 0.5, max: 2.5, step: 0.1, infoKey: 'phylla.divergence' },
      { id: 'noiseInf', label: 'Noise Infl.', type: 'range', min: 0, max: 20, step: 1, infoKey: 'phylla.noiseInf' },
      { id: 'dotSize', label: 'Dot Size', type: 'range', min: 0.5, max: 3, step: 0.1, infoKey: 'phylla.dotSize' },
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
    circles: [
      { id: 'count', label: 'Max Count', type: 'range', min: 20, max: 800, step: 20, infoKey: 'circles.count' },
      { id: 'radiusRange', label: 'Radius Range', type: 'rangeDual', min: 0.5, max: 120, step: 0.5, minKey: 'minR', maxKey: 'maxR', infoKey: 'circles.radiusRange' },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'circles.padding' },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 100, max: 5000, step: 100, infoKey: 'circles.attempts' },
      { id: 'segments', label: 'Segments', type: 'range', min: 8, max: 64, step: 2, infoKey: 'circles.segments' },
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
    'global.machineProfile': {
      title: 'Machine Profile',
      description: 'Sets the physical drawing size used for bounds, centering, and export.',
    },
    'global.margin': {
      title: 'Margin',
      description: 'Keeps a safety border around the drawing area in millimeters.',
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
    'common.smoothing': {
      title: 'Smoothing',
      description: 'Softens sharp angles by averaging each point with its neighbors. 0 keeps raw lines.',
    },
    'common.curves': {
      title: 'Curves',
      description: 'Renders smooth quadratic curves between points instead of straight segments.',
    },
    'flowfield.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the size of the flow field. Lower values create broad, smooth flow; higher values add detail.',
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
      title: 'Distortion Force',
      description: 'Amplifies the influence of the noise field on direction.',
    },
    'flowfield.chaos': {
      title: 'Chaos',
      description: 'Adds random angular jitter on top of the flow field.',
    },
    'flowfield.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended together. More octaves add complexity.',
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
    'lissajous.rotation': {
      title: 'Rotation',
      description: 'Rotates the entire curve in degrees.',
    },
    'lissajous.resolution': {
      title: 'Resolution',
      description: 'Number of samples along the curve. Higher values create smoother lines.',
    },
    'lissajous.scale': {
      title: 'Scale',
      description: 'Overall size of the Lissajous curve.',
    },
    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of horizontal rows in the wavetable.',
    },
    'wavetable.amplitude': {
      title: 'Amplitude',
      description: 'Height of the waveform displacement.',
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
    'wavetable.edgeFade': {
      title: 'Edge Fade',
      description: 'Softens the waveform near the left and right edges.',
    },
    'wavetable.truncate': {
      title: 'Truncate',
      description: 'When enabled, removes segments that fall outside the drawing bounds.',
    },
    'wavetable.flatCaps': {
      title: 'Flat Top/Bottom',
      description: 'Adds flat lines at the top and bottom of the wavetable stack.',
    },
    'spiral.loops': {
      title: 'Loops',
      description: 'Number of revolutions in the spiral.',
    },
    'spiral.res': {
      title: 'Resolution',
      description: 'Points per revolution. Higher values create smoother spirals.',
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
    'circles.count': {
      title: 'Max Count',
      description: 'Maximum number of circles to place.',
    },
    'circles.radiusRange': {
      title: 'Radius Range',
      description: 'Minimum and maximum circle size. Wider ranges mix small and large disks.',
    },
    'circles.padding': {
      title: 'Padding',
      description: 'Extra spacing between circles.',
    },
    'circles.attempts': {
      title: 'Attempts',
      description: 'Placement iterations before stopping.',
    },
    'circles.segments': {
      title: 'Segments',
      description: 'Circle smoothness. Higher values create smoother curves.',
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
    return smoothed;
  };

  const createBounds = (width, height, margin) => {
    const m = margin;
    return { width, height, m, dW: width - m * 2, dH: height - m * 2 };
  };

  const transformPoint = (pt, params, bounds) => {
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    let x = pt.x - cx;
    let y = pt.y - cy;
    const scaleX = params.scaleX ?? 1;
    const scaleY = params.scaleY ?? 1;
    x *= scaleX;
    y *= scaleY;
    x += cx + (params.posX ?? 0);
    y += cy + (params.posY ?? 0);
    return { x, y };
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
      }
      total += next.length;
      if (total > PREVIEW.maxPoints) break;
      limited.push(next);
    }
    return limited;
  };

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
    const rng = new SeededRNG(seed);
    const noise = new SimpleNoise(seed);
    const rawPaths = Algorithms[type].generate(base, rng, noise, bounds) || [];
    const smooth = clamp(base.smoothing ?? 0, 0, 1);
    const transformed = rawPaths.map((path) => smoothPath(path.map((pt) => transformPoint(pt, base, bounds)), smooth));
    const limited = limitPaths(transformed);
    const useCurves = Boolean(base.curves);
    const precision = 2;
    const strokeWidth = options.strokeWidth ?? 1.2;
    const pathsSvg = limited
      .map((path) => pathToSvg(path, precision, useCurves))
      .filter(Boolean)
      .map((d) => `<path d="${d}" />`)
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

    const defs = CONTROL_DEFS[group];
    if (!defs) return null;
    const def = defs.find((item) => item.id === param);
    if (!def) return null;
    return {
      type: group,
      baseParams: {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS[group] ? ALGO_DEFAULTS[group] : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      },
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

      this.initModuleDropdown();
      this.initMachineDropdown();
      this.bindGlobal();
      this.bindInfoButtons();
      this.initPaneToggles();
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.initSettingsValues();
      this.attachStaticInfoButtons();
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
        { inputId: 'machine-profile', infoKey: 'global.machineProfile' },
        { inputId: 'set-margin', infoKey: 'global.margin' },
        { inputId: 'set-speed-down', infoKey: 'global.speedDown' },
        { inputId: 'set-speed-up', infoKey: 'global.speedUp' },
        { inputId: 'set-precision', infoKey: 'global.precision' },
        { inputId: 'set-stroke', infoKey: 'global.stroke' },
      ];

      entries.forEach(({ inputId, infoKey }) => {
        const input = getEl(inputId);
        if (!input) return;
        const label =
          input.parentElement?.querySelector('label') || input.closest('.control-group')?.querySelector('.control-label');
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
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = key.charAt(0).toUpperCase() + key.slice(1);
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
      select.value = Object.keys(MACHINES)[0] || '';
    }

    initSettingsValues() {
      const margin = getEl('set-margin');
      const speedDown = getEl('set-speed-down');
      const speedUp = getEl('set-speed-up');
      const stroke = getEl('set-stroke');
      const precision = getEl('set-precision');
      const bgColor = getEl('inp-bg-color');
      if (margin) margin.value = SETTINGS.margin;
      if (speedDown) speedDown.value = SETTINGS.speedDown;
      if (speedUp) speedUp.value = SETTINGS.speedUp;
      if (stroke) stroke.value = SETTINGS.strokeWidth;
      if (precision) precision.value = SETTINGS.precision;
      if (bgColor) bgColor.value = SETTINGS.bgColor;
    }

    initPaneToggles() {
      const leftPane = getEl('left-pane');
      const rightPane = getEl('right-pane');
      const leftBtn = getEl('btn-toggle-left');
      const rightBtn = getEl('btn-toggle-right');
      if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

      const isCollapsed = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed') && !pane.classList.contains('pane-force-open');
        return auto || pane.classList.contains('pane-collapsed');
      };

      const updateButtons = () => {
        const leftCollapsed = isCollapsed(leftPane);
        const rightCollapsed = isCollapsed(rightPane);
        leftBtn.textContent = leftCollapsed ? '[SHOW LEFT]' : '[HIDE LEFT]';
        rightBtn.textContent = rightCollapsed ? '[SHOW RIGHT]' : '[HIDE RIGHT]';
        leftBtn.setAttribute('aria-pressed', leftCollapsed ? 'true' : 'false');
        rightBtn.setAttribute('aria-pressed', rightCollapsed ? 'true' : 'false');
      };

      const applyAutoCollapse = () => {
        const shouldAuto = window.innerWidth < 1200;
        document.body.classList.toggle('auto-collapsed', shouldAuto);
        updateButtons();
      };

      const togglePane = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed');
        if (auto) {
          pane.classList.toggle('pane-force-open');
        } else {
          pane.classList.toggle('pane-collapsed');
        }
        updateButtons();
      };

      leftBtn.addEventListener('click', () => togglePane(leftPane));
      rightBtn.addEventListener('click', () => togglePane(rightPane));
      window.addEventListener('resize', applyAutoCollapse);
      applyAutoCollapse();
    }

    bindGlobal() {
      const addLayer = getEl('btn-add-layer');
      const moduleSelect = getEl('generator-module');
      const bgColor = getEl('inp-bg-color');
      const settingsPanel = getEl('settings-panel');
      const btnSettings = getEl('btn-settings');
      const btnCloseSettings = getEl('btn-close-settings');
      const machineProfile = getEl('machine-profile');
      const setMargin = getEl('set-margin');
      const setSpeedDown = getEl('set-speed-down');
      const setSpeedUp = getEl('set-speed-up');
      const setStroke = getEl('set-stroke');
      const setPrecision = getEl('set-precision');
      const btnExport = getEl('btn-export');
      const btnResetView = getEl('btn-reset-view');

      if (addLayer && moduleSelect) {
        addLayer.onclick = () => {
          const t = moduleSelect.value;
          this.app.engine.addLayer(t);
          this.renderLayers();
          this.app.render();
        };
      }

      if (moduleSelect) {
        moduleSelect.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            l.type = e.target.value;
            l.params = JSON.parse(JSON.stringify(ALGO_DEFAULTS[l.type]));
            const seed = getEl('inp-seed');
            const posX = getEl('inp-pos-x');
            const posY = getEl('inp-pos-y');
            const scaleX = getEl('inp-scale-x');
            const scaleY = getEl('inp-scale-y');
            l.params.seed = parseInt(seed?.value, 10) || Math.floor(Math.random() * 999);
            l.params.posX = parseFloat(posX?.value) || 0;
            l.params.posY = parseFloat(posY?.value) || 0;
            l.params.scaleX = parseFloat(scaleX?.value) || 1;
            l.params.scaleY = parseFloat(scaleY?.value) || 1;
            this.buildControls();
            this.app.regen();
          }
        };
      }

      if (bgColor) {
        bgColor.oninput = (e) => {
          SETTINGS.bgColor = e.target.value;
          this.app.render();
        };
      }

      if (btnSettings && settingsPanel) {
        btnSettings.onclick = () => settingsPanel.classList.toggle('open');
      }
      if (btnCloseSettings && settingsPanel) {
        btnCloseSettings.onclick = () => settingsPanel.classList.remove('open');
      }

      if (machineProfile) {
        machineProfile.onchange = (e) => {
          this.app.engine.setProfile(e.target.value);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setMargin) {
        setMargin.onchange = (e) => {
          SETTINGS.margin = parseInt(e.target.value, 10);
          this.app.regen();
        };
      }
      if (setSpeedDown) {
        setSpeedDown.onchange = (e) => {
          SETTINGS.speedDown = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setSpeedUp) {
        setSpeedUp.onchange = (e) => {
          SETTINGS.speedUp = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setStroke) {
        setStroke.onchange = (e) => {
          SETTINGS.strokeWidth = parseFloat(e.target.value);
          this.app.engine.layers.forEach((layer) => {
            layer.strokeWidth = SETTINGS.strokeWidth;
          });
          this.app.render();
        };
      }
      if (setPrecision) {
        setPrecision.onchange = (e) => {
          const next = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 3));
          SETTINGS.precision = next;
          e.target.value = next;
        };
      }

      if (btnExport) {
        btnExport.onclick = () => this.exportSVG();
      }
      if (btnResetView) {
        btnResetView.onclick = () => this.app.renderer.center();
      }

      const bindTrans = (id, key) => {
        const el = getEl(id);
        if (!el) return;
        el.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
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

      const randSeed = getEl('btn-rand-seed');
      if (randSeed) {
        randSeed.onclick = () => {
          const l = this.app.engine.getActiveLayer();
          const seedInput = getEl('inp-seed');
          if (l) {
            l.params.seed = Math.floor(Math.random() * 99999);
            if (seedInput) seedInput.value = l.params.seed;
            this.app.regen();
            this.updateFormula();
          }
        };
      }
    }

    renderLayers() {
      const container = getEl('layer-list');
      if (!container) return;
      container.innerHTML = '';
      this.app.engine.layers
        .slice()
        .reverse()
        .forEach((l) => {
          const el = document.createElement('div');
          const isActive = l.id === this.app.engine.activeLayerId;
          el.className = `layer-item flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2 group cursor-pointer hover:bg-vectura-border ${
            isActive ? 'active' : ''
          }`;
          el.innerHTML = `
            <div class="flex items-center gap-2 flex-1 overflow-hidden">
              <input type="checkbox" ${l.visible ? 'checked' : ''} class="cursor-pointer" aria-label="Toggle layer visibility">
              <span class="text-xs truncate ${isActive ? 'text-white font-bold' : 'text-vectura-muted'}">${l.name}</span>
            </div>
            <div class="flex items-center gap-1">
              <button class="text-[10px] text-vectura-muted hover:text-white px-1 btn-up" aria-label="Move layer up">▲</button>
              <button class="text-[10px] text-vectura-muted hover:text-white px-1 btn-down" aria-label="Move layer down">▼</button>
              <button class="text-[10px] text-vectura-muted hover:text-white px-1 btn-layer-settings" aria-label="Layer settings">⚙</button>
              <div class="relative w-3 h-3 overflow-hidden rounded-full border border-vectura-border ml-1">
                <input type="color" value="${l.color}" class="color-picker" aria-label="Layer color">
              </div>
              <button class="text-xs text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete layer">✕</button>
            </div>
          `;
          const nameEl = el.querySelector('span');
          const visibilityEl = el.querySelector('input[type=checkbox]');
          const colorEl = el.querySelector('.color-picker');
          const delBtn = el.querySelector('.btn-del');
          const upBtn = el.querySelector('.btn-up');
          const downBtn = el.querySelector('.btn-down');
          const settingsBtn = el.querySelector('.btn-layer-settings');

          if (nameEl) {
            nameEl.onclick = () => {
              this.app.engine.activeLayerId = l.id;
              this.renderLayers();
              this.buildControls();
              this.updateFormula();
            };
          }
          if (visibilityEl) {
            visibilityEl.onchange = (e) => {
              l.visible = e.target.checked;
              this.app.render();
              this.app.updateStats();
            };
          }
          if (colorEl) {
            colorEl.oninput = (e) => {
              l.color = e.target.value;
              this.app.render();
            };
          }
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.removeLayer(l.id);
              this.renderLayers();
              this.app.render();
            };
          }
          if (upBtn) {
            upBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.moveLayer(l.id, 1);
              this.renderLayers();
              this.app.render();
            };
          }
          if (downBtn) {
            downBtn.onclick = (e) => {
              e.stopPropagation();
              this.app.engine.moveLayer(l.id, -1);
              this.renderLayers();
              this.app.render();
            };
          }
          if (settingsBtn) {
            settingsBtn.onclick = (e) => {
              e.stopPropagation();
              this.openLayerSettings(l);
            };
          }
          container.appendChild(el);
        });
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
          layer.strokeWidth = parseFloat(e.target.value);
          this.app.render();
        };
      }
      if (capSelect) {
        capSelect.onchange = (e) => {
          layer.lineCap = e.target.value;
          this.app.render();
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
      if (moduleSelect) moduleSelect.value = layer.type;
      if (seed) seed.value = layer.params.seed;
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;

      const desc = getEl('algo-desc');
      if (desc) desc.innerText = DESCRIPTIONS[layer.type] || 'No description available.';

      const defs = [...(this.controls[layer.type] || []), ...COMMON_CONTROLS];
      if (!defs.length) return;

      defs.forEach((def) => {
        const val = layer.params[def.id];
        const div = document.createElement('div');
        div.className = 'mb-4';
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';

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
              const next = Boolean(e.target.checked);
              span.innerText = next ? 'ON' : 'OFF';
              layer.params[def.id] = next;
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
              const next = e.target.value;
              layer.params[def.id] = next;
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
            };
          }
        } else if (def.type === 'rangeDual') {
          const minVal = layer.params[def.minKey];
          const maxVal = layer.params[def.maxKey];
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${formatValue(minVal)}-${formatValue(maxVal)}</span>
            </div>
            <div class="dual-range">
              <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${minVal}" data-handle="min">
              <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${maxVal}" data-handle="max">
            </div>
          `;
          const minInput = div.querySelector('input[data-handle="min"]');
          const maxInput = div.querySelector('input[data-handle="max"]');
          const span = div.querySelector('span');

          const syncValues = (changed) => {
            let min = parseFloat(minInput.value);
            let max = parseFloat(maxInput.value);
            if (min > max) {
              if (changed === 'min') max = min;
              else min = max;
            }
            min = clamp(min, def.min, def.max);
            max = clamp(max, def.min, def.max);
            minInput.value = min;
            maxInput.value = max;
            layer.params[def.minKey] = min;
            layer.params[def.maxKey] = max;
            if (span) span.innerText = `${formatValue(min)}-${formatValue(max)}`;
            const minOnTop = min >= max - def.step;
            minInput.style.zIndex = minOnTop ? 2 : 1;
            maxInput.style.zIndex = minOnTop ? 1 : 2;
          };

          if (minInput && maxInput) {
            syncValues();
            minInput.oninput = () => syncValues('min');
            maxInput.oninput = () => syncValues('max');
            minInput.onchange = () => {
              syncValues('min');
              this.app.regen();
              this.updateFormula();
            };
            maxInput.onchange = () => {
              syncValues('max');
              this.app.regen();
              this.updateFormula();
            };
          }
        } else {
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${formatValue(val)}</span>
            </div>
            <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" class="w-full">
          `;
          const input = div.querySelector('input');
          const span = div.querySelector('span');
          if (input && span) {
            input.oninput = (e) => (span.innerText = formatValue(parseFloat(e.target.value)));
            input.onchange = (e) => {
              layer.params[def.id] = parseFloat(e.target.value);
              this.app.regen();
              this.updateFormula();
            };
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
      if (formula) formula.innerText = this.app.engine.getFormula(l.id);
      if (seedDisplay) seedDisplay.innerText = `Seed: ${l.params.seed}`;
    }

    exportSVG() {
      const prof = this.app.engine.currentProfile;
      const precision = Math.max(0, Math.min(6, SETTINGS.precision ?? 3));
      let svg = `<?xml version="1.0" standalone="no"?><svg width="${prof.width}mm" height="${prof.height}mm" viewBox="0 0 ${prof.width} ${prof.height}" xmlns="http://www.w3.org/2000/svg">`;
      this.app.engine.layers.forEach((l) => {
        if (!l.visible) return;
        const strokeWidth = (l.strokeWidth ?? SETTINGS.strokeWidth).toFixed(3);
        const lineCap = l.lineCap || 'round';
        const useCurves = Boolean(l.params && l.params.curves);
        svg += `<g id="${l.name.replace(/\s/g, '_')}" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="${lineCap}" stroke-linejoin="round" fill="none">`;
        l.paths.forEach((p) => {
          if (p.length < 2) return;
          const d = pathToSvg(p, precision, useCurves);
          if (d) svg += `<path d="${d}" />`;
        });
        svg += `</g>`;
      });
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
