/**
 * Parameter randomization service with algorithm-level bias profiles.
 */

const defaultClamp = (value, min, max) => Math.min(max, Math.max(min, value));
const defaultRoundToStep = (value, step) => (step ? Math.round(value / step) * step : value);

const safeRange = (min, max) => {
  const span = max - min;
  if (span <= 0) return { min, max };
  const pad = span * 0.1;
  const minSafe = min + pad;
  const maxSafe = max - pad;
  if (maxSafe <= minSafe) return { min, max };
  return { min: minSafe, max: maxSafe };
};

const rng = (min, max) => min + Math.random() * (max - min);

const applyRandomRange = (def, params, roundStep) => {
  const randMin = Number.isFinite(def.randomMin) ? def.randomMin : def.min;
  const randMax = Number.isFinite(def.randomMax) ? def.randomMax : def.max;
  const { min, max } = safeRange(randMin, randMax);
  const step = def.step ?? 1;
  params[def.id] = roundStep(rng(min, max), step, def.min, def.max);
};

const postProcessLissajous = (params, clamp) => {
  params.resolution = Math.round(clamp(params.resolution ?? 400, 260, 720));
  params.scale = clamp(params.scale ?? 0.9, 0.65, 1.2);
  params.damping = clamp(params.damping ?? 0.0015, 0.0003, 0.0055);
  params.closeLines = Math.random() > 0.2;

  let fx = params.freqX ?? 3;
  let fy = params.freqY ?? 2;
  let guard = 0;
  while (guard < 20) {
    const ratio = fy === 0 ? 1 : fx / fy;
    const simpleRatio = Math.abs(ratio - 1) < 0.12 || Math.abs(ratio - 2) < 0.12 || Math.abs(ratio - 0.5) < 0.12;
    if (Math.abs(fx - fy) > 0.6 && !simpleRatio) break;
    fx = rng(1.2, 10.8);
    fy = rng(1.2, 10.8);
    guard += 1;
  }
  params.freqX = Math.round(fx * 10) / 10;
  params.freqY = Math.round(fy * 10) / 10;
};

const postProcessShapePack = (params, clamp) => {
  params.count = Math.round(clamp(params.count ?? 250, 180, 680));
  params.attempts = Math.round(clamp(params.attempts ?? params.count * 2, params.count * 2, 2500));
  params.minR = clamp(params.minR ?? 1.5, 0.5, 8);
  params.maxR = clamp(params.maxR ?? 20, Math.max(params.minR + 0.5, 4), 36);
  params.padding = clamp(params.padding ?? 1, 0, 3.5);
  params.segments = Math.round(clamp(params.segments ?? 24, 5, 48));
};

const postProcessPetalis = (params, clamp) => {
  params.count = Math.round(clamp(params.count ?? 240, 80, 320));
  params.petalSteps = Math.round(clamp(params.petalSteps ?? 32, 16, 48));
  params.centerDensity = Math.round(clamp(params.centerDensity ?? 30, 6, 65));
  params.connectorCount = Math.round(clamp(params.connectorCount ?? 18, 4, 42));

  if (params.ringMode === 'dual') {
    params.innerCount = Math.round(clamp(params.innerCount ?? 110, 40, 180));
    params.outerCount = Math.round(clamp(params.outerCount ?? 150, 60, 220));
    const total = params.innerCount + params.outerCount;
    if (total > 340) {
      const scale = 340 / total;
      params.innerCount = Math.max(20, Math.round(params.innerCount * scale));
      params.outerCount = Math.max(20, Math.round(params.outerCount * scale));
    }
  }
};

const postProcessRainfall = (params, clamp) => {
  params.count = Math.round(clamp(params.count ?? 240, 60, 650));
  params.traceLength = clamp(params.traceLength ?? 80, 24, 180);
  params.traceStep = clamp(params.traceStep ?? 5, 2, 10);
  params.dropSize = clamp(params.dropSize ?? 3, 0, 6);
  params.fillDensity = clamp(params.fillDensity ?? 1.2, 0.1, 4);
  params.widthMultiplier = Math.round(clamp(params.widthMultiplier ?? 1, 1, 3));
  params.windStrength = clamp(params.windStrength ?? 0.3, 0, 1.1);
  params.turbulence = clamp(params.turbulence ?? 0.2, 0, 0.9);
};

const applyAlgorithmBias = (layer, clamp) => {
  if (!layer?.params) return;
  if (layer.type === 'lissajous') postProcessLissajous(layer.params, clamp);
  if (layer.type === 'shapePack') postProcessShapePack(layer.params, clamp);
  if (layer.type === 'petalis' || layer.type === 'petalisDesigner') postProcessPetalis(layer.params, clamp);
  if (layer.type === 'rainfall') postProcessRainfall(layer.params, clamp);
};

export const randomizeLayerParams = (layer, options = {}) => {
  if (!layer) return;

  const {
    controlsByType,
    commonControls,
    waveNoiseDefs,
    ensureWavetableNoises,
    ensureSpiralNoises,
    clamp = defaultClamp,
    roundToStep = defaultRoundToStep,
  } = options;

  const defs = [...(controlsByType?.[layer.type] || []), ...(commonControls || [])];

  const roundStep = (value, step, min, max) => {
    const snapped = roundToStep(value, step);
    return clamp(snapped, min, max);
  };

  const randomizeNoise = (noise) => {
    if (!noise || typeof noise !== 'object') return;
    (waveNoiseDefs || []).forEach((nDef) => {
      if (nDef.showIf && !nDef.showIf(noise)) return;
      if (nDef.type === 'select') {
        const opts = nDef.options || [];
        const available = nDef.randomExclude ? opts.filter((opt) => !nDef.randomExclude.includes(opt.value)) : opts;
        if (!available.length) return;
        const pick = available[Math.floor(Math.random() * available.length)];
        noise[nDef.key] = pick.value;
        return;
      }
      if (nDef.type === 'angle' || nDef.type === 'range') {
        const randMin = Number.isFinite(nDef.randomMin) ? nDef.randomMin : nDef.min;
        const randMax = Number.isFinite(nDef.randomMax) ? nDef.randomMax : nDef.max;
        const { min, max } = safeRange(randMin, randMax);
        const step = nDef.step ?? 1;
        noise[nDef.key] = roundStep(rng(min, max), step, nDef.min, nDef.max);
      }
    });
  };

  defs.forEach((def) => {
    if (!def || !def.id && !def.type) return;
    if (def.showIf && !def.showIf(layer.params)) return;
    if (layer.type === 'harmonograph' && def.id === 'showPendulumGuides') return;
    if (def.type === 'section' || def.type === 'file' || def.type === 'image') return;

    if (def.type === 'noiseList') {
      if (layer.type === 'wavetable' && ensureWavetableNoises) {
        const noises = ensureWavetableNoises(layer);
        noises.forEach((noise) => randomizeNoise(noise));
      } else if (layer.type === 'spiral' && ensureSpiralNoises) {
        const noises = ensureSpiralNoises(layer);
        noises.forEach((noise) => randomizeNoise(noise));
      }
      return;
    }

    if (def.type === 'angle' || def.type === 'range') {
      applyRandomRange(def, layer.params, roundStep);
      return;
    }

    if (def.type === 'checkbox') {
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
    }
  });

  applyAlgorithmBias(layer, clamp);
};
