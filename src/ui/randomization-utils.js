/**
 * Randomization helpers for layer parameters.
 */
(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundToStep = (value, step) => (step ? Math.round(value / step) * step : value);

  const randomInRange = (min, max, random = Math.random) => min + random() * (max - min);

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

  const pickRandom = (items, random = Math.random) => {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(random() * items.length)] || null;
  };

  const randomizeNoise = ({ noise, waveNoiseDefs, random = Math.random }) => {
    if (!noise || typeof noise !== 'object') return;
    (waveNoiseDefs || []).forEach((def) => {
      if (def.showIf && !def.showIf(noise)) return;

      if (def.type === 'select') {
        const options = def.options || [];
        const available = def.randomExclude
          ? options.filter((opt) => !def.randomExclude.includes(opt.value))
          : options;
        const picked = pickRandom(available, random);
        if (picked) noise[def.key] = picked.value;
        return;
      }

      if (def.type === 'angle' || def.type === 'range') {
        const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
        const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
        const range = safeRange(randMin, randMax);
        const step = def.step ?? 1;
        noise[def.key] = roundStep(randomInRange(range.min, range.max, random), step, def.min, def.max);
      }
    });
  };

  const applyShapePackBias = (params, random = Math.random) => {
    params.count = roundStep(randomInRange(300, 780, random), 20, 20, 800);
    params.minR = roundStep(randomInRange(0.5, 5.5, random), 0.5, 0.5, 200);
    const maxTarget = Math.max(params.minR + 4, randomInRange(18, 70, random));
    params.maxR = roundStep(maxTarget, 0.5, 0.5, 200);
    params.padding = roundStep(randomInRange(0, 2, random), 0.5, 0, 10);
    params.attempts = roundStep(randomInRange(1800, 5000, random), 100, 100, 5000);
    if (params.shape === 'polygon') {
      params.segments = roundStep(randomInRange(4, 24, random), 1, 3, 64);
    }
  };

  const applyPetalisBias = (params, random = Math.random) => {
    const dualMode = random() < 0.35;
    params.ringMode = dualMode ? 'dual' : 'single';

    if (dualMode) {
      params.innerCount = roundStep(randomInRange(40, 170, random), 1, 5, 400);
      params.outerCount = roundStep(randomInRange(80, 260, random), 1, 5, 600);
      params.count = roundStep(params.innerCount + params.outerCount, 1, 5, 800);
      params.ringSplit = roundStep(randomInRange(0.25, 0.62, random), 0.01, 0.15, 0.85);
    } else {
      params.count = roundStep(randomInRange(90, 330, random), 1, 5, 800);
    }

    params.countJitter = roundStep(randomInRange(0.01, 0.16, random), 0.01, 0, 0.5);
    params.sizeJitter = roundStep(randomInRange(0.03, 0.2, random), 0.01, 0, 0.5);
    params.rotationJitter = roundStep(randomInRange(2, 16, random), 1, 0, 45);
    params.spiralTightness = roundStep(randomInRange(0.8, 7.5, random), 0.1, 0.5, 50);
    params.radialGrowth = roundStep(randomInRange(0.25, 3.6, random), 0.05, 0.05, 20);
    params.centerDensity = roundStep(randomInRange(8, 40, random), 1, 4, 120);

    params.centerRing = random() < 0.4;
    params.centerRingDensity = roundStep(randomInRange(10, 42, random), 1, 6, 120);
    params.centerConnectors = random() < 0.3;
    params.connectorCount = roundStep(randomInRange(8, 42, random), 1, 4, 120);

    if (Array.isArray(params.shadings)) {
      params.shadings.forEach((shade) => {
        if (!shade || typeof shade !== 'object') return;
        if (Number.isFinite(shade.lineSpacing)) {
          shade.lineSpacing = clamp(shade.lineSpacing, 0.6, 5.5);
        }
        if (Number.isFinite(shade.density)) {
          shade.density = clamp(shade.density, 0.4, 1.4);
        }
      });
    }
  };

  const applyRainfallBias = (params, random = Math.random) => {
    params.count = roundStep(randomInRange(80, 520, random), 10, 20, 2000);
    params.traceLength = roundStep(randomInRange(45, 180, random), 5, 20, 400);
    params.traceStep = roundStep(randomInRange(3, 11, random), 1, 2, 20);
    params.widthMultiplier = roundStep(randomInRange(1, 2.2, random), 1, 1, 4);
    params.turbulence = roundStep(randomInRange(0.05, 0.8, random), 0.05, 0, 1.5);
    params.windStrength = roundStep(randomInRange(0, 0.8, random), 0.05, 0, 1.5);
    params.gustStrength = roundStep(randomInRange(0, 0.45, random), 0.05, 0, 1);

    const dropRoll = random();
    if (dropRoll < 0.62) {
      params.dropShape = 'none';
    } else if (dropRoll < 0.84) {
      params.dropShape = 'circle';
    } else {
      params.dropShape = 'teardrop';
    }

    if (params.dropShape === 'none') {
      params.dropFill = 'none';
      params.fillDensity = roundStep(randomInRange(0.1, 1.4, random), 0.1, 0.1, 12);
    } else {
      const fill = pickRandom(['none', 'spiral', 'hash', 'sinusoidal'], random);
      params.dropFill = fill || 'none';
      params.fillDensity = roundStep(randomInRange(0.2, 3.5, random), 0.1, 0.1, 12);
    }

    params.trailBreaks = pickRandom(['none', 'sparse', 'regular', 'drop', 'dashes'], random) || 'drop';
  };

  const applyLissajousBias = (params, random = Math.random) => {
    const pickFreq = () => roundStep(randomInRange(1.8, 11.8, random), 0.1, 0.5, 12);
    let freqX = pickFreq();
    let freqY = pickFreq();

    for (let i = 0; i < 12; i++) {
      const diff = Math.abs(freqX - freqY);
      const ratio = freqX > freqY ? freqX / Math.max(0.001, freqY) : freqY / Math.max(0.001, freqX);
      if (diff >= 0.8 && ratio >= 1.12) break;
      freqY = pickFreq();
    }

    if (Math.abs(freqX - freqY) < 0.8) {
      freqY = clamp(freqX + 1.2, 0.5, 12);
    }

    params.freqX = freqX;
    params.freqY = freqY;
    params.resolution = roundStep(randomInRange(260, 780, random), 10, 50, 800);
    params.phase = roundStep(randomInRange(0.4, 5.8, random), 0.1, 0, 6.28);
    params.damping = roundStep(randomInRange(0.0002, 0.0035, random), 0.0001, 0, 0.01);
    params.scale = roundStep(randomInRange(0.55, 1.1, random), 0.05, 0.2, 1.2);
    params.closeLines = random() < 0.85;
  };

  const applyAlgorithmBias = (layer, random = Math.random) => {
    if (!layer || !layer.params) return;
    switch (layer.type) {
      case 'shapePack':
        applyShapePackBias(layer.params, random);
        break;
      case 'petalis':
      case 'petalisDesigner':
        applyPetalisBias(layer.params, random);
        break;
      case 'rainfall':
        applyRainfallBias(layer.params, random);
        break;
      case 'lissajous':
        applyLissajousBias(layer.params, random);
        break;
      default:
        break;
    }
  };

  const randomizeLayerParams = ({
    layer,
    controls,
    commonControls,
    waveNoiseDefs,
    ensureWavetableNoises,
    ensureSpiralNoises,
    random = Math.random,
  } = {}) => {
    if (!layer || !controls) return;

    const defs = [...(controls[layer.type] || []), ...(commonControls || [])];

    defs.forEach((def) => {
      if (def.showIf && !def.showIf(layer.params)) return;
      if (layer.type === 'harmonograph' && def.id === 'showPendulumGuides') return;
      if (def.type === 'section' || def.type === 'file' || def.type === 'image') return;

      if (def.type === 'noiseList') {
        if (layer.type === 'wavetable' && typeof ensureWavetableNoises === 'function') {
          const noises = ensureWavetableNoises();
          noises.forEach((noise) => randomizeNoise({ noise, waveNoiseDefs, random }));
        } else if (layer.type === 'spiral' && typeof ensureSpiralNoises === 'function') {
          const noises = ensureSpiralNoises();
          noises.forEach((noise) => randomizeNoise({ noise, waveNoiseDefs, random }));
        }
        return;
      }

      if (def.type === 'angle') {
        const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
        const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
        const range = safeRange(randMin, randMax);
        const step = def.step ?? 1;
        layer.params[def.id] = roundStep(randomInRange(range.min, range.max, random), step, def.min, def.max);
        return;
      }

      if (def.type === 'checkbox') {
        layer.params[def.id] = random() > 0.5;
        return;
      }

      if (def.type === 'select') {
        const options = def.options || [];
        const available = def.randomExclude
          ? options.filter((opt) => !def.randomExclude.includes(opt.value))
          : options;
        const picked = pickRandom(available, random);
        if (picked) layer.params[def.id] = picked.value;
        return;
      }

      if (def.type === 'rangeDual') {
        const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
        const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
        const range = safeRange(randMin, randMax);
        const step = def.step ?? 1;
        let a = randomInRange(range.min, range.max, random);
        let b = randomInRange(range.min, range.max, random);
        if (a > b) [a, b] = [b, a];
        if (b - a < step) b = Math.min(range.max, a + step);
        layer.params[def.minKey] = roundStep(a, step, def.min, def.max);
        layer.params[def.maxKey] = roundStep(b, step, def.min, def.max);
        return;
      }

      if (def.type === 'range') {
        const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
        const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
        const range = safeRange(randMin, randMax);
        const step = def.step ?? 1;
        layer.params[def.id] = roundStep(randomInRange(range.min, range.max, random), step, def.min, def.max);
      }
    });

    applyAlgorithmBias(layer, random);
  };

  const api = {
    randomizeLayerParams,
    applyAlgorithmBias,
    randomInRange,
  };

  if (typeof window !== 'undefined') {
    window.Vectura = window.Vectura || {};
    window.Vectura.RandomizationUtils = {
      ...(window.Vectura.RandomizationUtils || {}),
      ...api,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
