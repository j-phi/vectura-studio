/**
 * Noise rack methods for the UI class — mixed into UI.prototype by ui.js.
 * Owns:
 *   - ensure*Noises / create*Noise factories per algorithm type
 *   - mountPetalisModifierNoiseRack
 *   - _buildNoiseRack (generic noise UI builder)
 *   - randomizeLayerParams (noise-aware random params helper)
 * Constants (WAVE/RINGS/TOPO/.../IMAGE_EFFECT/COMMON_CONTROLS) live in ui.js
 * and are exposed via window.Vectura._UINoiseDefs.
 */
(() => {
  const {
    ALGO_DEFAULTS = {},
    RandomizationUtils,
  } = window.Vectura || {};

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clone =
    typeof structuredClone === 'function' ? (obj) => structuredClone(obj) : (obj) => JSON.parse(JSON.stringify(obj));

  const roundToStep = (value, step) => (step ? Math.round(value / step) * step : value);
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
  const formatDisplayValue = (def, value) => {
    const displayVal = toDisplayValue(def, value);
    const { precision, unit } = getDisplayConfig(def);
    const factor = Math.pow(10, precision);
    const rounded = Math.round(displayVal * factor) / factor;
    return `${rounded}${unit}`;
  };
  const attachKeyboardRangeNudge = (input, applyValue) => {
    if (!input || !applyValue) return;
    const isArrowKey = (key) => ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(key);
    const clearFlag = () => { delete input.dataset.keyboardAdjust; };
    input.addEventListener('keydown', (e) => { if (!isArrowKey(e.key)) return; input.dataset.keyboardAdjust = '1'; });
    input.addEventListener('keyup', (e) => { if (!isArrowKey(e.key)) return; clearFlag(); });
    input.addEventListener('blur', () => { clearFlag(); });
    input.addEventListener('input', () => {
      if (!input.dataset.keyboardAdjust) return;
      const nextDisplay = parseFloat(input.value);
      if (!Number.isFinite(nextDisplay)) return;
      applyValue(nextDisplay);
    });
  };

  window.Vectura = window.Vectura || {};
  window.Vectura._UINoiseRackMixin = {
    getWavetableNoiseTemplates(source = 'wavetable') {
      const baseZoom =
        source === 'rings'
          ? 0.001
          : source === 'topo'
            ? 0.003
            : source === 'flowfield'
              ? 0.01
              : source === 'petalisDrift'
                ? 0.2
                : source === 'grid' || source === 'phylla'
                  ? 0.05
                  : 0.02;
      const base = {
        enabled: true,
        type: 'simplex',
        blend: 'add',
        amplitude: source === 'rings' ? 8 : source === 'wavetable' ? 9 : 1,
        zoom: baseZoom,
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
        applyMode: source === 'spiral' ? 'topdown' : source === 'rings' ? 'orbit' : undefined,
        ringDrift: source === 'rings' ? 0.5 : undefined,
        ringRadius: source === 'rings' ? 100 : undefined,
        octaves:
          source === 'topo'
            ? 3
            : source === 'flowfield' || source === 'petalisDrift'
              ? 2
              : source === 'grid' || source === 'phylla'
                ? 1
                : undefined,
        lacunarity:
          source === 'topo' || source === 'flowfield' || source === 'grid' || source === 'phylla' || source === 'petalisDrift'
            ? 2.0
            : undefined,
        gain:
          source === 'topo' || source === 'flowfield' || source === 'grid' || source === 'phylla' || source === 'petalisDrift'
            ? 0.5
            : undefined,
        fieldMode: source === 'flowfield' ? 'angle' : undefined,
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
        polygonZoomReference: baseZoom,
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
    },


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
    },

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
    },

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
    },

    ensureRingsNoises(layer) {
      if (!layer || layer.type !== 'rings') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('rings');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude: layer.params.amplitude ?? base.amplitude,
          zoom: layer.params.noiseScale ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: layer.params.noiseOffsetX ?? base.shiftX,
          shiftY: layer.params.noiseOffsetY ?? base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          applyMode: base.applyMode,
          ringDrift: layer.params.noiseLayer ?? base.ringDrift,
          ringRadius: layer.params.noiseRadius ?? base.ringRadius,
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
        if (!next.applyMode) next.applyMode = base.applyMode || 'orbit';
        if (next.ringDrift === undefined) next.ringDrift = base.ringDrift ?? 0.5;
        if (next.ringRadius === undefined) next.ringRadius = base.ringRadius ?? 100;
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
    },

    ensureTopoNoises(layer) {
      if (!layer || layer.type !== 'topo') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('topo');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: layer.params.noiseScale ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: layer.params.noiseOffsetX ?? base.shiftX,
          shiftY: layer.params.noiseOffsetY ?? base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          octaves: layer.params.octaves ?? base.octaves,
          lacunarity: layer.params.lacunarity ?? base.lacunarity,
          gain: layer.params.gain ?? base.gain,
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
        if (next.octaves === undefined) next.octaves = base.octaves ?? 3;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
    },

    ensureFlowfieldNoises(layer) {
      if (!layer || layer.type !== 'flowfield') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('flowfield');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const flowMode = layer.params.flowMode || (layer.params.noiseType === 'curl' ? 'curl' : base.fieldMode || 'angle');
        if (!layer.params.flowMode) layer.params.flowMode = flowMode;
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType === 'curl' ? base.type : layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: layer.params.noiseScale ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: layer.params.noiseOffsetX ?? base.shiftX,
          shiftY: layer.params.noiseOffsetY ?? base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          octaves: layer.params.octaves ?? base.octaves,
          lacunarity: layer.params.lacunarity ?? base.lacunarity,
          gain: layer.params.gain ?? base.gain,
          fieldMode: flowMode,
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
        if (next.fieldMode === undefined) next.fieldMode = base.fieldMode || 'angle';
        if (next.octaves === undefined) next.octaves = base.octaves ?? 2;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
    },

    ensureGridNoises(layer) {
      if (!layer || layer.type !== 'grid') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('grid');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: layer.params.noiseScale ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: layer.params.noiseOffsetX ?? base.shiftX,
          shiftY: layer.params.noiseOffsetY ?? base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          octaves: layer.params.octaves ?? base.octaves,
          lacunarity: layer.params.lacunarity ?? base.lacunarity,
          gain: layer.params.gain ?? base.gain,
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
        if (next.octaves === undefined) next.octaves = base.octaves ?? 1;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
    },

    ensurePhyllaNoises(layer) {
      if (!layer || layer.type !== 'phylla') return [];
      const { base, templates } = this.getWavetableNoiseTemplates('phylla');
      let noises = layer.params.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: layer.params.noiseType || base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: layer.params.noiseScale ?? base.zoom,
          freq: base.freq,
          angle: base.angle,
          shiftX: layer.params.noiseOffsetX ?? base.shiftX,
          shiftY: layer.params.noiseOffsetY ?? base.shiftY,
          tileMode: base.tileMode,
          tilePadding: base.tilePadding,
          patternScale: base.patternScale,
          warpStrength: base.warpStrength,
          cellularScale: base.cellularScale,
          cellularJitter: base.cellularJitter,
          stepsCount: base.stepsCount,
          seed: base.seed,
          octaves: layer.params.octaves ?? base.octaves,
          lacunarity: layer.params.lacunarity ?? base.lacunarity,
          gain: layer.params.gain ?? base.gain,
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
        if (next.octaves === undefined) next.octaves = base.octaves ?? 1;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
    },

    ensurePetalisDriftNoises(layer) {
      if (!layer || !isPetalisLayerType(layer.type)) return [];
      const { base, templates } = this.getWavetableNoiseTemplates('petalisDrift');
      let noises = layer.params.driftNoises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: layer.params.driftNoise ?? base.zoom,
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
          octaves: base.octaves,
          lacunarity: base.lacunarity,
          gain: base.gain,
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
        layer.params.driftNoises = noises;
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
        if (next.octaves === undefined) next.octaves = base.octaves ?? 2;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
      layer.params.driftNoises = noises;
      return noises;
    },

    getPetalisModifierLegacyZoom(modifier = {}) {
      if (modifier?.type === 'circularOffset') return 1;
      return clamp(modifier?.scale ?? 0.2, 0.001, 1);
    },

    isPetalisNoiseModifier(modifier = {}) {
      return ['radialNoise', 'circularOffset', 'noise'].includes(modifier?.type);
    },

    ensurePetalisModifierNoises(modifier) {
      if (!modifier || !this.isPetalisNoiseModifier(modifier)) return [];
      const { base, templates } = this.getWavetableNoiseTemplates('petalisDrift');
      let noises = modifier.noises;
      if (!Array.isArray(noises) || !noises.length) {
        const legacy = {
          id: 'noise-1',
          enabled: true,
          type: base.type,
          blend: base.blend,
          amplitude: 1,
          zoom: this.getPetalisModifierLegacyZoom(modifier),
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
          seed: modifier.seed ?? base.seed,
          octaves: base.octaves,
          lacunarity: base.lacunarity,
          gain: base.gain,
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
        modifier.noises = noises;
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
        if (next.octaves === undefined) next.octaves = base.octaves ?? 2;
        if (next.lacunarity === undefined) next.lacunarity = base.lacunarity ?? 2.0;
        if (next.gain === undefined) next.gain = base.gain ?? 0.5;
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
      modifier.noises = noises;
      return noises;
    },

    createWavetableNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('wavetable');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    },

    createSpiralNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('spiral');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
        applyMode: template.applyMode ?? 'topdown',
      };
    },

    createRingsNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('rings');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
        applyMode: template.applyMode ?? 'orbit',
      };
    },

    createTopoNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('topo');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    },

    createFlowfieldNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('flowfield');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
        fieldMode: template.fieldMode ?? 'angle',
      };
    },

    createGridNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('grid');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    },

    createPhyllaNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('phylla');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    },

    createPetalisDriftNoise(index = 0) {
      const { base, templates } = this.getWavetableNoiseTemplates('petalisDrift');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
      };
    },

    createPetalisModifierNoise(index = 0, modifier = null) {
      const { base, templates } = this.getWavetableNoiseTemplates('petalisDrift');
      const template = templates[index] || templates[templates.length - 1] || base;
      return {
        ...clone(template),
        id: `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        enabled: true,
        zoom: index === 0 ? this.getPetalisModifierLegacyZoom(modifier || {}) : template.zoom ?? base.zoom,
        seed: modifier?.seed ?? template.seed ?? base.seed,
      };
    },

    mountPetalisModifierNoiseRack(layer, target, modifier, options = {}) {
      if (!layer || !target || !modifier || !this.isPetalisNoiseModifier(modifier)) return;
      const noiseDefs = window.Vectura._UINoiseDefs.PETALIS_DRIFT_NOISE_DEFS;
      const { base: noiseBase, templates: noiseTemplates } = this.getWavetableNoiseTemplates('petalisDrift');
      const noises = this.ensurePetalisModifierNoises(modifier);
      const assignNoiseStack = (nextNoises) => { modifier.noises = nextNoises; };
      const getNoiseDefault = (index, key) => {
        if (key === 'amplitude' && modifier.noises?.[index]?.type === 'image') return IMAGE_NOISE_DEFAULT_AMPLITUDE;
        if (key === 'zoom' && index === 0 && (!modifier.noises || modifier.noises.length <= 1)) {
          return this.getPetalisModifierLegacyZoom(modifier);
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
          const legacyZoom = key === 'zoom' && index === 0 && (!modifier.noises || modifier.noises.length <= 1);
          const nextVal = legacyZoom
            ? this.getPetalisModifierLegacyZoom(modifier)
            : template[key] !== undefined ? template[key] : noiseBase[key];
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
        this.normalizeImageEffects(noise, noiseBase.imageEffects?.[0]);
      };
      this._buildNoiseRack(target, {
        layer,
        noiseDefs,
        noiseBase,
        noiseTemplates,
        noises,
        assignNoiseStack,
        getNoiseDefault,
        resetNoise,
        createNoise: (idx) => this.createPetalisModifierNoise(idx, modifier),
        label: options.label || 'Noise Rack',
        containerClass: 'noise-list mt-3',
      });
    },

        randomizeLayerParams(layer) {
      if (!layer || !RandomizationUtils?.randomizeLayerParams) return;
      RandomizationUtils.randomizeLayerParams({
        layer,
        controls: this.controls,
        commonControls: window.Vectura._UINoiseDefs.COMMON_CONTROLS,
        waveNoiseDefs: window.Vectura._UINoiseDefs.WAVE_NOISE_DEFS,
        ringsNoiseDefs: window.Vectura._UINoiseDefs.RINGS_NOISE_DEFS,
        topoNoiseDefs: window.Vectura._UINoiseDefs.TOPO_NOISE_DEFS,
        flowfieldNoiseDefs: window.Vectura._UINoiseDefs.FLOWFIELD_NOISE_DEFS,
        gridNoiseDefs: window.Vectura._UINoiseDefs.GRID_NOISE_DEFS,
        phyllaNoiseDefs: window.Vectura._UINoiseDefs.PHYLLA_NOISE_DEFS,
        petalisDriftNoiseDefs: window.Vectura._UINoiseDefs.PETALIS_DRIFT_NOISE_DEFS,
        ensureWavetableNoises: () => this.ensureWavetableNoises(layer),
        ensureSpiralNoises: () => this.ensureSpiralNoises(layer),
        ensureRingsNoises: () => this.ensureRingsNoises(layer),
        ensureTopoNoises: () => this.ensureTopoNoises(layer),
        ensureFlowfieldNoises: () => this.ensureFlowfieldNoises(layer),
        ensureGridNoises: () => this.ensureGridNoises(layer),
        ensurePhyllaNoises: () => this.ensurePhyllaNoises(layer),
        ensurePetalisDriftNoises: () => this.ensurePetalisDriftNoises(layer),
      });
      this.applyRandomizationBias(layer);
    },
    _buildNoiseRack(target, { layer, noiseDefs, noiseBase, noiseTemplates, noises, assignNoiseStack, getNoiseDefault, resetNoise, createNoise, label, containerClass, attachValueEditor: attachValueEditorOpt }) {
      const attachValueEditor = attachValueEditorOpt || (() => {});
      const hasNoiseConditional = noiseDefs.some((d) => typeof d.showIf === 'function');
      const maybeRebuildNoiseControls = () => { if (hasNoiseConditional) this.buildControls(); };

      const list = document.createElement('div');
      list.className = containerClass || 'noise-list mb-4';
      const header = document.createElement('div');
      header.className = 'noise-list-header';
      header.innerHTML = `
        <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${label}</span>
        <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
          + Add Noise
        </button>
      `;
      const addBtn = header.querySelector('.noise-add');
      if (addBtn) {
        addBtn.onclick = () => {
          if (this.app.pushHistory) this.app.pushHistory();
          const nextNoise = createNoise(noises.length);
          noises.push(nextNoise);
          assignNoiseStack(noises);
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
            if (def.key === 'tileMode' && next !== 'off' && prev === 'off' && noise.type === 'polygon') {
              noise.polygonRadius = 0.75;
              noise.amplitude = -1;
              noise.polygonTileScale = 1;
              noise.polygonTileShiftX = 0;
              noise.polygonTileShiftY = 0;
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

      const buildCheckboxControl = (noise, def, idx) => {
        const control = document.createElement('div');
        control.className = 'noise-control';
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const rawValue = noise[def.key];
        const checked =
          rawValue === undefined
            ? Boolean(getNoiseDefault(idx, def.key))
            : rawValue === true || rawValue === 'true' || rawValue === 1;
        noise[def.key] = checked;
        control.innerHTML = `
          <div class="flex justify-between mb-1">
            <div class="flex items-center gap-2">
              <label class="control-label mb-0">${def.label}</label>
              ${infoBtn}
            </div>
            <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
          </div>
          <input type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4">
        `;
        const input = control.querySelector('input');
        const span = control.querySelector('span');
        if (input && span) {
          input.disabled = !noise.enabled;
          input.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Boolean(e.target.checked);
            noise[def.key] = next;
            span.innerText = next ? 'ON' : 'OFF';
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          };
          input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const next = Boolean(getNoiseDefault(idx, def.key));
            if (this.app.pushHistory) this.app.pushHistory();
            noise[def.key] = next;
            input.checked = next;
            span.innerText = next ? 'ON' : 'OFF';
            this.storeLayerParams(layer);
            this.app.regen();
            this.updateFormula();
          });
        }
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
                <div class="noise-image-preview-content"></div>
                <button type="button" class="noise-image-clear text-[10px] text-vectura-muted hover:text-vectura-accent${hasImage ? '' : ' hidden'}">Clear</button>
              </div>
              <div class="text-[10px] text-vectura-muted mt-2 noise-image-name${hasImage ? '' : ' hidden'}"></div>
            </div>
          </div>
          <input type="file" accept="image/*" class="noise-image-input hidden">
        `;
        const dropzone = wrap.querySelector('.noise-dropzone');
        const selectBtn = wrap.querySelector('.noise-image-btn');
        const clearBtn = wrap.querySelector('.noise-image-clear');
        const nameEl = wrap.querySelector('.noise-image-name');
        if (nameEl) nameEl.textContent = name;
        const previewEl = wrap.querySelector('.noise-image-preview');

        const previewContent = wrap.querySelector('.noise-image-preview-content');
        if (previewContent) {
          if (hasImage) {
            const img = document.createElement('img');
            img.src = noise.imagePreview;
            img.alt = 'Noise preview';
            previewContent.appendChild(img);
          } else {
            const empty = document.createElement('div');
            empty.className = 'noise-image-empty text-[10px] text-vectura-muted';
            empty.textContent = 'Drop image';
            previewContent.appendChild(empty);
          }
        }
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
          window.Vectura._UINoiseDefs.IMAGE_EFFECT_DEFS.forEach((def) => {
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
              assignNoiseStack(nextOrder.map((id) => map.get(id)).filter(Boolean));
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
                body: `<p class="modal-text">At least one noise layer is required for this noise stack.</p>`,
              });
              return;
            }
            if (this.app.pushHistory) this.app.pushHistory();
            const index = noises.findIndex((item) => item.id === noise.id);
            if (index >= 0) noises.splice(index, 1);
            assignNoiseStack(noises);
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
            noiseDefs.forEach((nDef) => {
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
              if (nDef.type === 'checkbox') {
                noise[nDef.key] = Math.random() > 0.5;
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
        noiseDefs.forEach((nDef) => {
          if (nDef.showIf && !nDef.showIf(noise)) return;
          if (nDef.type === 'angle') {
            controls.appendChild(buildAngleControl(noise, nDef, idx));
          } else if (nDef.type === 'select') {
            controls.appendChild(buildSelectControl(noise, nDef, idx));
          } else if (nDef.type === 'checkbox') {
            controls.appendChild(buildCheckboxControl(noise, nDef, idx));
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
    },
  };
})();
