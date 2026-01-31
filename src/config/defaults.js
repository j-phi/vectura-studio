/**
 * Default algorithm parameters and mutable app settings.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.ALGO_DEFAULTS = {
    flowfield: {
      noiseScale: 0.01,
      density: 1000,
      stepLen: 5,
      maxSteps: 50,
      force: 1.0,
      chaos: 0.0,
      octaves: 1,
    },
    lissajous: {
      freqX: 3,
      freqY: 2,
      damping: 0.001,
      phase: 1.5,
      rotation: 0,
      resolution: 100,
    },
    wavetable: {
      lines: 40,
      amplitude: 30,
      zoom: 0.02,
      tilt: 0,
      gap: 1.0,
      freq: 1.0,
    },
    spiral: { loops: 10, res: 100, noiseAmp: 10, noiseFreq: 0.1, startR: 5 },
    grid: {
      rows: 20,
      cols: 20,
      distortion: 10,
      noiseScale: 0.05,
      type: 'warp',
      chaos: 0,
    },
    phylla: { count: 500, spacing: 5, angleStr: 137.5, divergence: 1.0, noiseInf: 0 },
    boids: {
      count: 100,
      steps: 100,
      speed: 2,
      sepDist: 10,
      alignDist: 20,
      cohDist: 20,
      force: 0.05,
    },
    attractor: {
      type: 'lorenz',
      iter: 1000,
      scale: 3,
      sigma: 10,
      rho: 28,
      beta: 2.66,
      dt: 0.01,
    },
    hyphae: { sources: 2, steps: 50, branchProb: 0.05, angleVar: 0.5, segLen: 3 },
    circles: { count: 500, minR: 2, maxR: 20, padding: 1, attempts: 200 },
  };

  window.Vectura.SETTINGS = {
    margin: 20,
    speedDown: 250,
    speedUp: 300,
    precision: 3,
    strokeWidth: 0.3,
    bgColor: '#121214',
    globalLayerCount: 0,
  };
})();
