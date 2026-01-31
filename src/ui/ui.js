/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MACHINES } = window.Vectura || {};

  const getEl = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const svgWrap = (content) =>
    `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#fafafa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

  const dotsSvg = (cols, rows, r = 2) => {
    const xGap = cols > 1 ? 100 / (cols - 1) : 0;
    const yGap = rows > 1 ? 40 / (rows - 1) : 0;
    let dots = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        dots += `<circle cx="${10 + x * xGap}" cy="${10 + y * yGap}" r="${r}" fill="#fafafa" />`;
      }
    }
    return `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">${dots}</svg>`;
  };

  const waveSvg = (amp, cycles, steps = 40) => {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = t * 120;
      const y = 30 + Math.sin(t * Math.PI * 2 * cycles) * amp;
      points.push([x, y]);
    }
    const path = `M ${points.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ')}`;
    return svgWrap(`<path d="${path}" />`);
  };

  const lineSvg = (angle) => {
    const rad = (angle * Math.PI) / 180;
    const len = 42;
    const cx = 60;
    const cy = 30;
    const x1 = cx - Math.cos(rad) * len;
    const y1 = cy - Math.sin(rad) * len;
    const x2 = cx + Math.cos(rad) * len;
    const y2 = cy + Math.sin(rad) * len;
    return svgWrap(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`);
  };

  const circleSvg = (r) => svgWrap(`<circle cx="60" cy="30" r="${r}" />`);

  const blocksSvg = (cols, rows, fillCount) => {
    const total = cols * rows;
    let rects = '';
    const xGap = 100 / cols;
    const yGap = 40 / rows;
    for (let i = 0; i < total; i++) {
      const x = i % cols;
      const y = Math.floor(i / cols);
      const filled = i < fillCount;
      rects += `<rect x="${10 + x * xGap}" y="${10 + y * yGap}" width="${xGap - 4}" height="${yGap - 4}" fill="${
        filled ? '#fafafa' : 'transparent'
      }" stroke="#fafafa" stroke-width="1" />`;
    }
    return `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  };

  const arrowSvg = (length) => {
    const start = 20;
    const end = start + length;
    return svgWrap(
      `<line x1="${start}" y1="30" x2="${end}" y2="30" /><polyline points="${end - 8},22 ${end},30 ${end - 8},38" />`
    );
  };

  const ILLUSTRATIONS = {
    density: () =>
      illPair('LOW', dotsSvg(3, 2, 2), 'HIGH', dotsSvg(6, 4, 2)),
    amplitude: () =>
      illPair('LOW', waveSvg(4, 2), 'HIGH', waveSvg(14, 2)),
    frequency: () =>
      illPair('LOW', waveSvg(8, 1), 'HIGH', waveSvg(8, 4)),
    scale: () => illPair('SMALL', circleSvg(8), 'LARGE', circleSvg(18)),
    rotation: () => illPair('0°', lineSvg(0), '45°', lineSvg(45)),
    steps: () => illPair('COARSE', waveSvg(8, 2, 8), 'SMOOTH', waveSvg(8, 2, 40)),
    distortion: () => illPair('LOW', waveSvg(2, 2), 'HIGH', waveSvg(10, 2)),
    spacing: () => illPair('TIGHT', dotsSvg(6, 2, 2), 'LOOSE', dotsSvg(3, 2, 2)),
    probability: () => illPair('RARE', blocksSvg(4, 3, 3), 'COMMON', blocksSvg(4, 3, 9)),
    size: () =>
      illPair(
        'SMALL',
        svgWrap('<rect x="45" y="20" width="30" height="20" />'),
        'LARGE',
        svgWrap('<rect x="30" y="10" width="60" height="40" />')
      ),
    speed: () => illPair('SLOW', arrowSvg(40), 'FAST', arrowSvg(70)),
    noise: () => illPair('SMOOTH', waveSvg(6, 1), 'ROUGH', waveSvg(6, 5)),
    fade: () =>
      illPair(
        'SOFT',
        svgWrap('<line x1="10" y1="30" x2="110" y2="30" stroke-opacity="0.4" />'),
        'SHARP',
        svgWrap('<line x1="10" y1="30" x2="110" y2="30" />')
      ),
    gridType: () =>
      illPair(
        'WARP',
        svgWrap('<path d="M10 15 L110 15 M10 30 L110 30 M10 45 L110 45" /><path d="M15 10 L15 50 M60 10 L60 50 M105 10 L105 50" />'),
        'SHIFT',
        svgWrap('<path d="M10 18 L110 14 M10 32 L110 30 M10 46 L110 48" />')
      ),
    caps: () =>
      illPair(
        'OFF',
        svgWrap('<path d="M10 30 L110 30" />'),
        'ON',
        svgWrap('<path d="M10 15 L110 15" /><path d="M10 45 L110 45" />')
      ),
    truncate: () =>
      illPair(
        'OFF',
        svgWrap('<path d="M10 30 L110 30" />'),
        'ON',
        svgWrap('<path d="M10 30 L50 30 M70 30 L110 30" />')
      ),
  };

  function illPair(leftLabel, leftSvg, rightLabel, rightSvg) {
    return `
      <div class="modal-illustrations">
        <div class="modal-illustration">
          <div class="modal-ill-label">${leftLabel}</div>
          ${leftSvg}
        </div>
        <div class="modal-illustration">
          <div class="modal-ill-label">${rightLabel}</div>
          ${rightSvg}
        </div>
      </div>
    `;
  }

  const INFO = {
    'global.algorithm': {
      title: 'Algorithm',
      description: 'Switches the generator for the active layer. Changing this resets that layer’s parameters to defaults.',
    },
    'global.seed': {
      title: 'Seed',
      description: 'Controls the random sequence used to generate the layer. Same seed = same output.',
      illustration: 'noise',
    },
    'global.posX': {
      title: 'Pos X',
      description: 'Shifts the layer horizontally in millimeters.',
      illustration: 'spacing',
    },
    'global.posY': {
      title: 'Pos Y',
      description: 'Shifts the layer vertically in millimeters.',
      illustration: 'spacing',
    },
    'global.scaleX': {
      title: 'Scale X',
      description: 'Scales the layer horizontally around the center.',
      illustration: 'scale',
    },
    'global.scaleY': {
      title: 'Scale Y',
      description: 'Scales the layer vertically around the center.',
      illustration: 'scale',
    },
    'global.machineProfile': {
      title: 'Machine Profile',
      description: 'Sets the physical drawing size used for bounds, centering, and export.',
    },
    'global.margin': {
      title: 'Margin',
      description: 'Keeps a safety border around the drawing area in millimeters.',
      illustration: 'fade',
    },
    'global.speedDown': {
      title: 'Draw Speed',
      description: 'Used for time estimation when the pen is down.',
      illustration: 'speed',
    },
    'global.speedUp': {
      title: 'Travel Speed',
      description: 'Used for time estimation when the pen is up.',
      illustration: 'speed',
    },
    'global.precision': {
      title: 'Export Precision',
      description: 'Decimal precision for SVG coordinates. Higher = larger files, smoother output.',
      illustration: 'steps',
    },
    'global.stroke': {
      title: 'Default Stroke',
      description: 'Sets the base line width for all layers in millimeters.',
      illustration: 'size',
    },
    'global.background': {
      title: 'Background Color',
      description: 'Changes the paper color inside the drawing bounds.',
      illustration: 'fade',
    },
    'flowfield.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the size of the flow field. Lower values create broader, smoother flow; higher values add detail.',
      illustration: 'noise',
    },
    'flowfield.density': {
      title: 'Density',
      description: 'Number of particles seeded. Higher density adds more paths.',
      illustration: 'density',
    },
    'flowfield.stepLen': {
      title: 'Step Length',
      description: 'Distance a particle moves per step. Larger steps create more angular paths.',
      illustration: 'steps',
    },
    'flowfield.maxSteps': {
      title: 'Max Steps',
      description: 'Caps how long each particle travels before stopping.',
      illustration: 'steps',
    },
    'flowfield.force': {
      title: 'Distortion Force',
      description: 'Amplifies the influence of the noise field on direction.',
      illustration: 'distortion',
    },
    'flowfield.chaos': {
      title: 'Chaos',
      description: 'Adds random angular jitter on top of the flow field.',
      illustration: 'distortion',
    },
    'flowfield.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended together. More octaves add complexity.',
      illustration: 'frequency',
    },
    'lissajous.freqX': {
      title: 'Freq X',
      description: 'Oscillation rate along the X axis.',
      illustration: 'frequency',
    },
    'lissajous.freqY': {
      title: 'Freq Y',
      description: 'Oscillation rate along the Y axis.',
      illustration: 'frequency',
    },
    'lissajous.damping': {
      title: 'Damping',
      description: 'How quickly the curve decays over time. Higher values shorten the trail.',
      illustration: 'fade',
    },
    'lissajous.phase': {
      title: 'Phase',
      description: 'Shifts the X wave relative to Y, changing the knot shape.',
      illustration: 'frequency',
    },
    'lissajous.rotation': {
      title: 'Rotation',
      description: 'Rotates the entire curve in degrees.',
      illustration: 'rotation',
    },
    'lissajous.resolution': {
      title: 'Resolution',
      description: 'Number of samples along the curve. Higher values create smoother lines.',
      illustration: 'steps',
    },
    'lissajous.scale': {
      title: 'Scale',
      description: 'Overall size of the Lissajous curve.',
      illustration: 'scale',
    },
    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of horizontal rows in the wavetable.',
      illustration: 'density',
    },
    'wavetable.amplitude': {
      title: 'Amplitude',
      description: 'Height of the waveform displacement.',
      illustration: 'amplitude',
    },
    'wavetable.zoom': {
      title: 'Noise Zoom',
      description: 'Scale of the noise field along the wavetable.',
      illustration: 'noise',
    },
    'wavetable.tilt': {
      title: 'Row Tilt',
      description: 'Offsets each row vertically to create a slanted stack.',
      illustration: 'distortion',
    },
    'wavetable.gap': {
      title: 'Line Gap',
      description: 'Spacing multiplier between rows.',
      illustration: 'spacing',
    },
    'wavetable.freq': {
      title: 'Frequency',
      description: 'Noise frequency along the X axis.',
      illustration: 'frequency',
    },
    'wavetable.edgeFade': {
      title: 'Edge Fade',
      description: 'Softens the waveform near the left and right edges.',
      illustration: 'fade',
    },
    'wavetable.truncate': {
      title: 'Truncate',
      description: 'When enabled, removes segments that fall outside the drawing bounds.',
      illustration: 'truncate',
    },
    'wavetable.flatCaps': {
      title: 'Flat Top/Bottom',
      description: 'Adds flat lines at the top and bottom of the wavetable stack.',
      illustration: 'caps',
    },
    'spiral.loops': {
      title: 'Loops',
      description: 'Number of revolutions in the spiral.',
      illustration: 'frequency',
    },
    'spiral.res': {
      title: 'Resolution',
      description: 'Points per revolution. Higher values create smoother spirals.',
      illustration: 'steps',
    },
    'spiral.startR': {
      title: 'Inner Radius',
      description: 'Starting radius of the spiral.',
      illustration: 'scale',
    },
    'spiral.noiseAmp': {
      title: 'Noise Amp',
      description: 'Amount of radial jitter applied to the spiral.',
      illustration: 'distortion',
    },
    'spiral.noiseFreq': {
      title: 'Noise Freq',
      description: 'How quickly the noise changes around the spiral.',
      illustration: 'frequency',
    },
    'grid.rows': {
      title: 'Rows',
      description: 'Number of horizontal grid lines.',
      illustration: 'density',
    },
    'grid.cols': {
      title: 'Cols',
      description: 'Number of vertical grid lines.',
      illustration: 'density',
    },
    'grid.distortion': {
      title: 'Distortion',
      description: 'Strength of the grid displacement.',
      illustration: 'distortion',
    },
    'grid.noiseScale': {
      title: 'Noise Scale',
      description: 'Scale of noise used to distort the grid.',
      illustration: 'noise',
    },
    'grid.chaos': {
      title: 'Chaos',
      description: 'Random jitter added after distortion.',
      illustration: 'distortion',
    },
    'grid.type': {
      title: 'Mode',
      description: 'Warp bends both axes; Shift offsets rows vertically using noise.',
      illustration: 'gridType',
    },
    'phylla.count': {
      title: 'Count',
      description: 'Number of points in the phyllotaxis spiral.',
      illustration: 'density',
    },
    'phylla.spacing': {
      title: 'Spacing',
      description: 'Distance between successive points.',
      illustration: 'spacing',
    },
    'phylla.angleStr': {
      title: 'Angle',
      description: 'Divergence angle in degrees; near 137.5° yields sunflower-like spacing.',
      illustration: 'rotation',
    },
    'phylla.divergence': {
      title: 'Divergence',
      description: 'Scales radial growth rate.',
      illustration: 'scale',
    },
    'phylla.noiseInf': {
      title: 'Noise Influence',
      description: 'Adds organic wobble to point positions.',
      illustration: 'noise',
    },
    'phylla.dotSize': {
      title: 'Dot Size',
      description: 'Radius of each dot marker.',
      illustration: 'size',
    },
    'boids.count': {
      title: 'Agents',
      description: 'Number of flocking agents.',
      illustration: 'density',
    },
    'boids.steps': {
      title: 'Duration',
      description: 'Number of simulation steps; controls trail length.',
      illustration: 'steps',
    },
    'boids.speed': {
      title: 'Speed',
      description: 'Maximum speed of each agent.',
      illustration: 'speed',
    },
    'boids.sepDist': {
      title: 'Separation',
      description: 'Radius where agents repel each other.',
      illustration: 'spacing',
    },
    'boids.alignDist': {
      title: 'Alignment',
      description: 'Radius where agents align velocities.',
      illustration: 'spacing',
    },
    'boids.cohDist': {
      title: 'Cohesion',
      description: 'Radius where agents steer toward the group center.',
      illustration: 'spacing',
    },
    'boids.force': {
      title: 'Steer Force',
      description: 'Strength of steering corrections.',
      illustration: 'distortion',
    },
    'attractor.type': {
      title: 'Attractor Type',
      description: 'Selects the chaotic system used to generate the path.',
      illustration: 'gridType',
    },
    'attractor.scale': {
      title: 'Scale',
      description: 'Overall size of the attractor.',
      illustration: 'scale',
    },
    'attractor.iter': {
      title: 'Iterations',
      description: 'Number of steps plotted in the attractor.',
      illustration: 'steps',
    },
    'attractor.sigma': {
      title: 'Sigma',
      description: 'Lorenz system parameter controlling X/Y coupling.',
      illustration: 'distortion',
    },
    'attractor.rho': {
      title: 'Rho',
      description: 'Lorenz system parameter influencing chaotic spread.',
      illustration: 'distortion',
    },
    'attractor.beta': {
      title: 'Beta',
      description: 'Lorenz system parameter affecting Z damping.',
      illustration: 'distortion',
    },
    'attractor.dt': {
      title: 'Time Step',
      description: 'Integration step size; smaller values are smoother but slower.',
      illustration: 'steps',
    },
    'hyphae.sources': {
      title: 'Sources',
      description: 'Number of starting growth points.',
      illustration: 'density',
    },
    'hyphae.steps': {
      title: 'Growth Steps',
      description: 'Number of growth iterations.',
      illustration: 'steps',
    },
    'hyphae.branchProb': {
      title: 'Branch Probability',
      description: 'Chance of branching at each segment.',
      illustration: 'probability',
    },
    'hyphae.angleVar': {
      title: 'Wiggle',
      description: 'Randomness in branch direction.',
      illustration: 'distortion',
    },
    'hyphae.segLen': {
      title: 'Segment Length',
      description: 'Length of each growth segment.',
      illustration: 'steps',
    },
    'hyphae.maxBranches': {
      title: 'Max Branches',
      description: 'Hard cap to prevent runaway growth.',
      illustration: 'density',
    },
    'circles.count': {
      title: 'Max Count',
      description: 'Maximum number of circles to place.',
      illustration: 'density',
    },
    'circles.minR': {
      title: 'Min Radius',
      description: 'Smallest circle size.',
      illustration: 'size',
    },
    'circles.maxR': {
      title: 'Max Radius',
      description: 'Largest circle size.',
      illustration: 'size',
    },
    'circles.padding': {
      title: 'Padding',
      description: 'Extra spacing between circles.',
      illustration: 'spacing',
    },
    'circles.attempts': {
      title: 'Attempts',
      description: 'How many placement tries before stopping.',
      illustration: 'probability',
    },
    'circles.segments': {
      title: 'Segments',
      description: 'Circle smoothness. Higher values create smoother curves.',
      illustration: 'steps',
    },
    'cityscape.rows': {
      title: 'Rows',
      description: 'Number of depth layers in the skyline.',
      illustration: 'density',
    },
    'cityscape.minW': {
      title: 'Min Width',
      description: 'Minimum building width.',
      illustration: 'size',
    },
    'cityscape.maxW': {
      title: 'Max Width',
      description: 'Maximum building width.',
      illustration: 'size',
    },
    'cityscape.minH': {
      title: 'Min Height',
      description: 'Minimum building height.',
      illustration: 'size',
    },
    'cityscape.maxH': {
      title: 'Max Height',
      description: 'Maximum building height.',
      illustration: 'size',
    },
    'cityscape.windowProb': {
      title: 'Window Probability',
      description: 'Chance to draw window segments on each building.',
      illustration: 'probability',
    },
    'cityscape.detail': {
      title: 'Roof Detail',
      description: 'Probability of adding roof accents.',
      illustration: 'probability',
    },
    'cityscape.horizon': {
      title: 'Horizon',
      description: 'Vertical base line of the skyline.',
      illustration: 'spacing',
    },
  };

  const CONTROL_DEFS = {
    flowfield: [
      {
        id: 'noiseScale',
        label: 'Noise Scale',
        type: 'range',
        min: 0.001,
        max: 0.08,
        step: 0.001,
        infoKey: 'flowfield.noiseScale',
      },
      { id: 'density', label: 'Density', type: 'range', min: 200, max: 4000, step: 100, infoKey: 'flowfield.density' },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 1, max: 15, step: 1, infoKey: 'flowfield.stepLen' },
      { id: 'maxSteps', label: 'Max Steps', type: 'range', min: 20, max: 400, step: 10, infoKey: 'flowfield.maxSteps' },
      { id: 'force', label: 'Distortion Force', type: 'range', min: 0.1, max: 3.0, step: 0.1, infoKey: 'flowfield.force' },
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
      { id: 'lines', label: 'Lines', type: 'range', min: 5, max: 120, step: 1, infoKey: 'wavetable.lines' },
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 2, max: 120, step: 1, infoKey: 'wavetable.amplitude' },
      { id: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.002, max: 0.08, step: 0.001, infoKey: 'wavetable.zoom' },
      { id: 'tilt', label: 'Row Tilt', type: 'range', min: -10, max: 10, step: 1, infoKey: 'wavetable.tilt' },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'freq', label: 'Frequency', type: 'range', min: 0.2, max: 5.0, step: 0.1, infoKey: 'wavetable.freq' },
      { id: 'edgeFade', label: 'Edge Fade', type: 'range', min: 0, max: 0.4, step: 0.02, infoKey: 'wavetable.edgeFade' },
      { id: 'truncate', label: 'Truncate', type: 'checkbox', infoKey: 'wavetable.truncate' },
      { id: 'flatCaps', label: 'Flat Top/Bottom', type: 'checkbox', infoKey: 'wavetable.flatCaps' },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 40, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Resolution', type: 'range', min: 20, max: 240, step: 10, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 50, step: 1, infoKey: 'spiral.startR' },
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
      { id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 5, step: 0.1, infoKey: 'boids.speed' },
      { id: 'sepDist', label: 'Separation', type: 'range', min: 5, max: 50, step: 1, infoKey: 'boids.sepDist' },
      { id: 'alignDist', label: 'Alignment', type: 'range', min: 5, max: 60, step: 1, infoKey: 'boids.alignDist' },
      { id: 'cohDist', label: 'Cohesion', type: 'range', min: 5, max: 60, step: 1, infoKey: 'boids.cohDist' },
      { id: 'force', label: 'Steer Force', type: 'range', min: 0.01, max: 0.2, step: 0.01, infoKey: 'boids.force' },
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
      { id: 'minR', label: 'Min Radius', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'circles.minR' },
      { id: 'maxR', label: 'Max Radius', type: 'range', min: 2, max: 50, step: 1, infoKey: 'circles.maxR' },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'circles.padding' },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 100, max: 5000, step: 100, infoKey: 'circles.attempts' },
      { id: 'segments', label: 'Segments', type: 'range', min: 8, max: 64, step: 2, infoKey: 'circles.segments' },
    ],
    cityscape: [
      { id: 'rows', label: 'Rows', type: 'range', min: 1, max: 5, step: 1, infoKey: 'cityscape.rows' },
      { id: 'minW', label: 'Min Width', type: 'range', min: 5, max: 60, step: 1, infoKey: 'cityscape.minW' },
      { id: 'maxW', label: 'Max Width', type: 'range', min: 10, max: 120, step: 1, infoKey: 'cityscape.maxW' },
      { id: 'minH', label: 'Min Height', type: 'range', min: 5, max: 100, step: 1, infoKey: 'cityscape.minH' },
      { id: 'maxH', label: 'Max Height', type: 'range', min: 10, max: 180, step: 1, infoKey: 'cityscape.maxH' },
      { id: 'windowProb', label: 'Window Prob', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'cityscape.windowProb' },
      { id: 'detail', label: 'Roof Detail', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'cityscape.detail' },
      { id: 'horizon', label: 'Horizon', type: 'range', min: 0.4, max: 0.85, step: 0.01, infoKey: 'cityscape.horizon' },
    ],
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

    openModal({ title, body, onOpen }) {
      this.modal.titleEl.textContent = title;
      this.modal.bodyEl.innerHTML = body;
      this.modal.overlay.classList.add('open');
      if (onOpen) onOpen(this.modal.bodyEl);
    }

    closeModal() {
      this.modal.overlay.classList.remove('open');
    }

    showInfo(key) {
      const info = INFO[key];
      if (!info) return;
      const illustration = info.illustration && ILLUSTRATIONS[info.illustration]
        ? ILLUSTRATIONS[info.illustration]()
        : '';
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
        { inputId: 'inp-bg-color', infoKey: 'global.background', labelSelector: '#label-bg-color' },
      ];

      entries.forEach(({ inputId, infoKey, labelSelector }) => {
        const input = getEl(inputId);
        if (!input) return;
        const label = labelSelector
          ? document.querySelector(labelSelector)
          : input.parentElement?.querySelector('label') || input.closest('.control-group')?.querySelector('.control-label');
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
        onOpen: (bodyEl) => {
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
        },
      });
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

      const defs = this.controls[layer.type];
      if (!defs) return;

      const formatValue = (value) => {
        if (typeof value === 'number') {
          const rounded = Math.round(value * 1000) / 1000;
          return rounded.toString();
        }
        return value;
      };

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
              this.app.regen();
              this.updateFormula();
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
        svg += `<g id="${l.name.replace(/\s/g, '_')}" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="${lineCap}" fill="none">`;
        l.paths.forEach((p) => {
          if (p.length < 2) return;
          svg += `<path d="M ${p
            .map((pt) => `${pt.x.toFixed(precision)} ${pt.y.toFixed(precision)}`)
            .join(' L ')}" />`;
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
