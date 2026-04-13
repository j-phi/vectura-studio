(() => {
  window.Vectura = window.Vectura || {};

  const clamp01 = (value) => Math.max(0, Math.min(1, value));

  const combineBlend = ({ combined, value, blend = 'add', maxAmplitude = 1 }) => {
    if (combined === undefined) return value;

    switch (blend) {
      case 'subtract':
        return combined - value;
      case 'multiply':
        return combined * value;
      case 'max':
        return Math.max(combined, value);
      case 'min':
        return Math.min(combined, value);
      case 'hatch-dark':
      case 'hatch-light': {
        const baseTone = clamp01((combined / Math.max(1e-6, maxAmplitude) + 1) / 2);
        const weight = blend === 'hatch-dark' ? 1 - baseTone : baseTone;
        const dirBias =
          value >= 0
            ? blend === 'hatch-dark'
              ? 0.6
              : 1.2
            : blend === 'hatch-dark'
              ? 1.2
              : 0.6;
        return combined + value * weight * dirBias;
      }
      case 'add':
      default:
        return combined + value;
    }
  };

  const createEvaluator = ({ noise, seed = 0 } = {}) => {
    const baseNoise = (x, y) => noise.noise2D(x, y);
    // Hash constants from Inigo Quilez value-noise technique (iquilezles.org/articles/morenoise)
    const hash2D = (x, y) => {
      const n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.1) * 43758.5453;
      return n - Math.floor(n);
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = (t) => t * t * (3 - 2 * t);
    const valueNoise = (x, y, localSeed = 0, smooth = true) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = smooth ? smoothstep(xf) : xf;
      const v = smooth ? smoothstep(yf) : yf;
      const sx = localSeed * 0.17;
      const sy = localSeed * 0.11;
      const n00 = hash2D(xi + sx, yi + sy);
      const n10 = hash2D(xi + 1 + sx, yi + sy);
      const n01 = hash2D(xi + sx, yi + 1 + sy);
      const n11 = hash2D(xi + 1 + sx, yi + 1 + sy);
      const x1 = lerp(n00, n10, u);
      const x2 = lerp(n01, n11, u);
      const val = lerp(x1, x2, v);
      return val * 2 - 1;
    };
    const cellularData = (x, y, jitter = 1) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cx = xi + dx + hash2D(xi + dx, yi + dy) * jitter;
          const cy = yi + dy + hash2D(xi + dx + 7.21, yi + dy + 3.17) * jitter;
          const dist = Math.hypot(x - cx, y - cy);
          if (dist < f1) {
            f2 = f1;
            f1 = dist;
          } else if (dist < f2) {
            f2 = dist;
          }
        }
      }
      return { f1, f2 };
    };
    const cellularNoise = (x, y, jitter = 1) => {
      const { f1 } = cellularData(x, y, jitter);
      const v = Math.max(0, Math.min(1, 1 - f1));
      return v * 2 - 1;
    };
    const perlinNoise = (x, y, localSeed = 0) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = smoothstep(xf);
      const v = smoothstep(yf);
      const sx = localSeed * 0.17;
      const sy = localSeed * 0.11;
      const grad = (hx, hy, dx, dy) => {
        const h = hash2D(hx, hy) * Math.PI * 2;
        return Math.cos(h) * dx + Math.sin(h) * dy;
      };
      const g00 = grad(xi + sx, yi + sy, xf, yf);
      const g10 = grad(xi + 1 + sx, yi + sy, xf - 1, yf);
      const g01 = grad(xi + sx, yi + 1 + sy, xf, yf - 1);
      const g11 = grad(xi + 1 + sx, yi + 1 + sy, xf - 1, yf - 1);
      const x1 = lerp(g00, g10, u);
      const x2 = lerp(g01, g11, u);
      const val = lerp(x1, x2, v);
      return Math.max(-1, Math.min(1, val * 1.414));
    };

    const evaluate = (x, y, noiseDef, meta = {}) => {
      const noiseType = noiseDef?.type || 'simplex';
      const n = baseNoise(x, y);
      const patternScale = Math.max(0.1, noiseDef?.patternScale ?? 1);
      const warpStrength = Math.max(0, noiseDef?.warpStrength ?? 1);
      const cellScale = Math.max(0.1, noiseDef?.cellularScale ?? 1);
      const cellJitter = Math.max(0, Math.min(1, noiseDef?.cellularJitter ?? 1));
      const stepsCount = Math.max(2, Math.round(noiseDef?.stepsCount ?? 5));
      const localSeed = noiseDef?.seed ?? 0;
      const px = x * patternScale;
      const py = y * patternScale;
      const wp = n * warpStrength * 0.5;

      switch (noiseType) {
        case 'ridged':
          return (1 - Math.abs(n)) * 2 - 1;
        case 'billow':
          return Math.abs(n) * 2 - 1;
        case 'value':
          return valueNoise(x, y, localSeed, false);
        case 'value-smooth':
          return valueNoise(x, y, localSeed, true);
        case 'perlin':
          return perlinNoise(x, y, localSeed);
        case 'turbulence': {
          const n2 = baseNoise(x * 2, y * 2);
          const n3 = baseNoise(x * 4, y * 4);
          const t = (Math.abs(n) + Math.abs(n2) * 0.5 + Math.abs(n3) * 0.25) / 1.75;
          return t * 2 - 1;
        }
        case 'stripes':
          return Math.sin(px * 2 + wp * 3);
        case 'marble':
          return Math.sin((px + py) * 1.5 + wp * 4);
        case 'steps': {
          const shift = ((localSeed * 0.13) % 1 + 1) % 1;
          const t = ((n + 1) / 2 + shift) % 1;
          const stepped = Math.round(t * (stepsCount - 1)) / (stepsCount - 1);
          return stepped * 2 - 1;
        }
        case 'facet': {
          const t = (n + 1) / 2;
          const stepped = Math.floor(t * stepsCount) / stepsCount;
          return stepped * 2 - 1;
        }
        case 'sawtooth': {
          const t = ((px + py * 0.25 + wp) % 1 + 1) % 1;
          return t * 2 - 1;
        }
        case 'triangle': {
          const wx = Math.abs(((px * 1.5 + wp) % 2) - 1);
          const wy = Math.abs(((py * 1.5 + wp) % 2) - 1);
          return (wx + wy) - 1;
        }
        case 'polygon': {
          const sides = Math.max(3, Math.round(noiseDef?.polygonSides ?? 6));
          const radius = Math.max(0.1, noiseDef?.polygonRadius ?? 2);
          const rotation = ((noiseDef?.polygonRotation ?? 0) * Math.PI) / 180;
          const outline = Math.max(0, noiseDef?.polygonOutline ?? 0);
          const edge = Math.max(0, noiseDef?.polygonEdgeRadius ?? 0);
          const rx = px + wp * 0.5;
          const ry = py + wp * 0.5;
          const ang = Math.atan2(ry, rx) - rotation;
          const sector = (Math.PI * 2) / sides;
          const rel = ((ang % sector) + sector) % sector;
          const dist = Math.cos(Math.PI / sides) / Math.cos(rel - Math.PI / sides);
          const maxR = radius * dist;
          const r = Math.hypot(rx, ry);
          const sd = r - maxR;
          const blendShape = (d) => {
            if (edge <= 0) return d <= 0 ? 1 : -1;
            const t = Math.max(0, Math.min(1, (d + edge) / (edge * 2)));
            return 1 - t * 2;
          };
          if (outline > 0) {
            const half = outline / 2;
            return blendShape(Math.abs(sd) - half);
          }
          return blendShape(sd);
        }
        case 'warp':
          return baseNoise(x + n * 1.5 * warpStrength, y + n * 1.5 * warpStrength);
        case 'cellular':
          return cellularNoise(x * cellScale, y * cellScale, cellJitter);
        case 'voronoi': {
          const { f1 } = cellularData(x * cellScale, y * cellScale, cellJitter);
          const v = Math.max(0, Math.min(1, f1));
          return v * 2 - 1;
        }
        case 'crackle': {
          const { f1, f2 } = cellularData(x * cellScale, y * cellScale, cellJitter);
          const edge = Math.max(0, Math.min(1, (f2 - f1) * 3));
          return (1 - edge) * 2 - 1;
        }
        case 'swirl':
          return Math.sin(px * 2 + wp * 4) * Math.cos(py * 2 + wp * 2);
        case 'radial': {
          const r = Math.hypot(px, py);
          const bands = Math.sin(r * Math.PI * 6 + wp * 4);
          const wobble = baseNoise(px * 0.7 + localSeed * 0.13, py * 0.7 - localSeed * 0.17) * 0.2;
          return Math.max(-1, Math.min(1, bands + wobble));
        }
        case 'checker': {
          const cx = Math.floor((px + wp * 0.5) * 4);
          const cy = Math.floor((py + wp * 0.5) * 4);
          return (cx + cy) % 2 === 0 ? 1 : -1;
        }
        case 'zigzag': {
          const t = Math.abs(((px * 2 + wp * 2) % 2) - 1);
          return (1 - t) * 2 - 1;
        }
        case 'ripple': {
          const rx = px + wp * 0.5;
          const ry = py + wp * 0.5;
          const r = Math.hypot(rx, ry);
          const ang = Math.atan2(ry, rx);
          return Math.sin(r * Math.PI * 8 + Math.sin(ang * 6 + wp * 2) * 0.5 + wp * 0.7);
        }
        case 'spiral': {
          const rx = px + wp * 0.5;
          const ry = py + wp * 0.5;
          const ang = Math.atan2(ry, rx);
          const rad = Math.hypot(rx, ry);
          return Math.sin(ang * 4 + rad * 2 + wp * 2);
        }
        case 'grain':
          return hash2D(x * 10, y * 10) * 2 - 1;
        case 'crosshatch':
          return (Math.sin(px * 3 + wp * 2) + Math.sin(py * 3 + wp * 2)) * 0.5;
        case 'pulse': {
          const t = Math.abs(Math.sin((px + wp) * 2) * Math.cos((py + wp) * 2));
          return t * 2 - 1;
        }
        case 'domain': {
          const wx = baseNoise(x * 1.7, y * 1.7) * warpStrength;
          const wy = baseNoise(x * 1.7 + 5.2, y * 1.7 + 1.3) * warpStrength;
          return baseNoise(x + wx, y + wy);
        }
        case 'weave': {
          const wx = Math.sin((px + wp) * 2);
          const wy = Math.sin((py + wp) * 2);
          return wx * wy;
        }
        case 'moire': {
          const a = Math.sin(px * 2 + wp * 0.5);
          const b = Math.sin(py * 2.2 + wp * 0.5);
          return (a + b) * 0.5;
        }
        case 'dunes':
          return (1 - Math.pow(Math.abs(Math.sin(px * 2 + wp * 3)), 0.5)) * 2 - 1;
        case 'image': {
          const store = window.Vectura?.NOISE_IMAGES || {};
          const img = noiseDef?.imageId ? store[noiseDef.imageId] : null;
          if (!img || !img.data) return n;
          const wrap = noiseDef?.tileMode !== 'off';
          const invertColor = Boolean(noiseDef?.imageInvertColor);
          const invertOpacity = Boolean(noiseDef?.imageInvertOpacity);
          const noiseStyle = noiseDef?.noiseStyle || 'linear';
          const noiseThreshold = Math.max(0, Math.min(1, noiseDef?.noiseThreshold ?? 0));
          const microFreq = Math.max(0, noiseDef?.microFreq ?? 0);
          const sampleLum = (u, v) => {
            const uu = wrap ? ((u % 1) + 1) % 1 : Math.max(0, Math.min(1, u));
            const vv = wrap ? ((v % 1) + 1) % 1 : Math.max(0, Math.min(1, v));
            const ix = Math.min(img.width - 1, Math.max(0, Math.floor(uu * img.width)));
            const iy = Math.min(img.height - 1, Math.max(0, Math.floor(vv * img.height)));
            const idx = (iy * img.width + ix) * 4;
            const data = img.data;
            const r = data[idx] ?? 0;
            const g = data[idx + 1] ?? 0;
            const b = data[idx + 2] ?? 0;
            let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            if (invertColor) lum = 1 - lum;
            const alpha = (data[idx + 3] ?? 0) / 255;
            const a = invertOpacity ? 1 - alpha : alpha;
            return clamp01(lum) * a;
          };
          const sampleBlur = (u, v, radius = 0) => {
            const radiusInt = Math.max(0, Math.round(radius));
            if (!radiusInt) return sampleLum(u, v);
            let total = 0;
            let count = 0;
            for (let dy = -radiusInt; dy <= radiusInt; dy++) {
              for (let dx = -radiusInt; dx <= radiusInt; dx++) {
                total += sampleLum(u + dx / img.width, v + dy / img.height);
                count += 1;
              }
            }
            return count ? total / count : 0;
          };
          let u = x;
          let v = y;
          if (!wrap) {
            u += 0.5;
            v += 0.5;
          }
          const resolveEffects = () => {
            if (Array.isArray(noiseDef?.imageEffects) && noiseDef.imageEffects.length) return noiseDef.imageEffects;
            return [{ ...noiseDef, enabled: true, mode: noiseDef?.imageAlgo || 'luma' }];
          };
          const getParam = (effect, key, fallback) => {
            if (effect && effect[key] !== undefined) return effect[key];
            if (noiseDef && noiseDef[key] !== undefined) return noiseDef[key];
            return fallback;
          };
          const applyEffect = (effect, state) => {
            const mode = effect?.mode || noiseDef?.imageAlgo || 'luma';
            let nextU = state.u;
            let nextV = state.v;
            let lum = state.lum;
            switch (mode) {
              case 'luma':
                lum = sampleLum(nextU, nextV);
                break;
              case 'pixelate': {
                const blocks = Math.max(2, Math.round(getParam(effect, 'imagePixelate', 12)));
                const stepU = 1 / blocks;
                nextU = Math.floor(nextU / stepU) * stepU + stepU / 2;
                nextV = Math.floor(nextV / stepU) * stepU + stepU / 2;
                lum = sampleLum(nextU, nextV);
                break;
              }
              case 'edge': {
                const edgeBlur = Math.max(0, Math.min(4, getParam(effect, 'imageEdgeBlur', getParam(effect, 'imageBlur', 0))));
                const c = sampleBlur(nextU, nextV, edgeBlur);
                const sx =
                  -sampleBlur(nextU - 1 / img.width, nextV - 1 / img.height, edgeBlur) +
                  sampleBlur(nextU + 1 / img.width, nextV - 1 / img.height, edgeBlur) -
                  2 * sampleBlur(nextU - 1 / img.width, nextV, edgeBlur) +
                  2 * sampleBlur(nextU + 1 / img.width, nextV, edgeBlur) -
                  sampleBlur(nextU - 1 / img.width, nextV + 1 / img.height, edgeBlur) +
                  sampleBlur(nextU + 1 / img.width, nextV + 1 / img.height, edgeBlur);
                const sy =
                  -sampleBlur(nextU - 1 / img.width, nextV - 1 / img.height, edgeBlur) -
                  2 * sampleBlur(nextU, nextV - 1 / img.height, edgeBlur) -
                  sampleBlur(nextU + 1 / img.width, nextV - 1 / img.height, edgeBlur) +
                  sampleBlur(nextU - 1 / img.width, nextV + 1 / img.height, edgeBlur) +
                  2 * sampleBlur(nextU, nextV + 1 / img.height, edgeBlur) +
                  sampleBlur(nextU + 1 / img.width, nextV + 1 / img.height, edgeBlur);
                const mag = Math.min(1, Math.hypot(sx, sy) * 1.5);
                lum = mag + c * 0.2;
                break;
              }
              case 'blur': {
                const radius = Math.max(0, Math.min(6, getParam(effect, 'imageBlurRadius', 0)));
                const strength = Math.max(0, Math.min(1, getParam(effect, 'imageBlurStrength', 1)));
                const blurLum = sampleBlur(nextU, nextV, radius);
                lum = lum + (blurLum - lum) * strength;
                break;
              }
              case 'lowpass': {
                const radius = Math.max(0, Math.min(6, getParam(effect, 'imageLowpassRadius', 2)));
                const strength = Math.max(0, Math.min(1, getParam(effect, 'imageLowpassStrength', 0.6)));
                const blurLum = sampleBlur(nextU, nextV, radius);
                lum = lum + (blurLum - lum) * strength;
                break;
              }
              case 'highpass': {
                const radius = Math.max(0, Math.min(6, getParam(effect, 'imageHighpassRadius', 1)));
                const strength = Math.max(0, Math.min(2, getParam(effect, 'imageHighpassStrength', 1)));
                const blurLum = sampleBlur(nextU, nextV, radius);
                lum = clamp01((lum - blurLum) * strength + 0.5);
                break;
              }
              case 'brightness':
                lum = lum + Math.max(-1, Math.min(1, getParam(effect, 'imageBrightness', 0)));
                break;
              case 'levels': {
                const low = Math.max(0, Math.min(1, getParam(effect, 'imageLevelsLow', 0)));
                const high = Math.max(low + 0.001, Math.min(1, getParam(effect, 'imageLevelsHigh', 1)));
                lum = (lum - low) / (high - low);
                break;
              }
              case 'gamma':
                lum = Math.pow(lum, Math.max(0.2, Math.min(3, getParam(effect, 'imageGamma', 1))));
                break;
              case 'contrast': {
                const contrast = Math.max(0, Math.min(2, getParam(effect, 'imageContrast', 1)));
                lum = (lum - 0.5) * contrast + 0.5;
                break;
              }
              case 'emboss': {
                const strength = Math.max(0, Math.min(2, getParam(effect, 'imageEmbossStrength', 1)));
                const dx = sampleBlur(nextU + 1 / img.width, nextV, 1) - sampleBlur(nextU - 1 / img.width, nextV, 1);
                const dy = sampleBlur(nextU, nextV + 1 / img.height, 1) - sampleBlur(nextU, nextV - 1 / img.height, 1);
                lum = 0.5 + (dx + dy) * 0.5 * strength;
                break;
              }
              case 'sharpen': {
                const amount = Math.max(0, Math.min(2, getParam(effect, 'imageSharpenAmount', 1)));
                const radius = Math.max(0, Math.min(4, Math.round(getParam(effect, 'imageSharpenRadius', 1))));
                const blurred = sampleBlur(nextU, nextV, radius);
                lum = lum + (lum - blurred) * amount;
                break;
              }
              case 'invert':
                lum = 1 - lum;
                break;
              case 'threshold':
                lum = lum >= Math.max(0, Math.min(1, getParam(effect, 'imageThreshold', 0.5))) ? 1 : 0;
                break;
              case 'posterize': {
                const levels = Math.max(2, Math.min(10, Math.round(getParam(effect, 'imagePosterize', 5))));
                lum = Math.round(lum * (levels - 1)) / (levels - 1);
                break;
              }
              case 'solarize': {
                const threshold = Math.max(0, Math.min(1, getParam(effect, 'imageSolarize', 0.5)));
                if (lum > threshold) lum = 1 - lum;
                break;
              }
              case 'dither': {
                const amount = Math.max(0, Math.min(1, getParam(effect, 'imageDither', 0.5)));
                const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
                const ix = Math.floor(nextU * img.width) % 4;
                const iy = Math.floor(nextV * img.height) % 4;
                const threshold = bayer4[iy * 4 + ix] / 16;
                lum = lum + (threshold - 0.5) * amount;
                lum = lum >= 0.5 ? 1 : 0;
                break;
              }
              case 'median': {
                const radius = Math.max(1, Math.min(4, Math.round(getParam(effect, 'imageMedianRadius', 1))));
                const samples = [];
                for (let dy = -radius; dy <= radius; dy++) {
                  for (let dx = -radius; dx <= radius; dx++) {
                    samples.push(sampleLum(nextU + dx / img.width, nextV + dy / img.height));
                  }
                }
                samples.sort((a, b) => a - b);
                lum = samples[Math.floor(samples.length / 2)] ?? lum;
                break;
              }
              case 'vignette': {
                const strength = Math.max(0, Math.min(1, getParam(effect, 'imageVignetteStrength', 0.4)));
                const radius = Math.max(0.2, Math.min(1, getParam(effect, 'imageVignetteRadius', 0.85)));
                const dist = Math.hypot(nextU - 0.5, nextV - 0.5);
                const t = Math.max(0, Math.min(1, (dist - radius) / Math.max(0.001, 1 - radius)));
                lum = lum * (1 - t * strength);
                break;
              }
              case 'curve': {
                const strength = Math.max(0, Math.min(1, getParam(effect, 'imageCurveStrength', 0.4)));
                if (lum < 0.5) {
                  lum = Math.pow(lum * 2, 1 + strength * 2) / 2;
                } else {
                  lum = 1 - Math.pow((1 - lum) * 2, 1 + strength * 2) / 2;
                }
                break;
              }
              case 'bandpass': {
                const center = Math.max(0, Math.min(1, getParam(effect, 'imageBandCenter', 0.5)));
                const width = Math.max(0.05, Math.min(1, getParam(effect, 'imageBandWidth', 0.3)));
                const half = width / 2;
                const dist = Math.abs(lum - center);
                lum = Math.max(0, Math.min(1, 1 - dist / half));
                break;
              }
              default:
                break;
            }
            return { u: nextU, v: nextV, lum: clamp01(lum) };
          };

          let state = { u, v, lum: sampleLum(u, v) };
          resolveEffects().forEach((effect) => {
            if (effect && effect.enabled === false) return;
            state = applyEffect(effect, state);
          });
          let lum = clamp01(state.lum);
          let impact = 1 - lum;
          switch (noiseStyle) {
            case 'curve':
              impact = impact * impact;
              break;
            case 'angled':
              impact = Math.max(0, (impact - 0.5) * 2);
              break;
            case 'noisy':
              impact = clamp01(impact + n * 0.25);
              break;
            default:
              break;
          }
          if (noiseThreshold > 0) {
            impact = impact >= noiseThreshold ? 1 : impact / noiseThreshold;
          }
          let value = (lum * 2 - 1) * impact;
          if (microFreq > 0) {
            const wx = meta.worldX ?? x;
            const wy = meta.worldY ?? y;
            const wave = Math.sin((wx + wy) * (microFreq / 2) * Math.PI * 2);
            value += wave * impact * 0.5;
          }
          return Math.max(-1, Math.min(1, value));
        }
        default:
          return n;
      }
    };

    const sampleScalar = (x, y, noiseDef, meta = {}) => {
      const zoom = Math.max(0.0001, noiseDef?.zoom ?? 1);
      const baseFreq = Math.max(0.05, noiseDef?.freq ?? 1);
      const angle = ((noiseDef?.angle ?? 0) * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const shiftX = noiseDef?.shiftX ?? 0;
      const shiftY = noiseDef?.shiftY ?? 0;
      const gain = Math.max(0.05, Math.min(1, noiseDef?.gain ?? 0.5));
      const lacunarity = Math.max(1.05, noiseDef?.lacunarity ?? 2);
      const layeredOctaves = Math.max(1, Math.floor(noiseDef?.octaves ?? 1));
      let total = 0;
      let amp = 1;
      let freq = 1;
      let norm = 0;
      for (let i = 0; i < layeredOctaves; i++) {
        const tx = x * zoom * baseFreq * freq + shiftX;
        const ty = y * zoom * baseFreq * freq + shiftY;
        const rx = tx * cosA - ty * sinA;
        const ry = tx * sinA + ty * cosA;
        total += evaluate(rx, ry, noiseDef, { ...meta, worldX: meta.worldX ?? x, worldY: meta.worldY ?? y }) * amp;
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return norm ? total / norm : total;
    };

    return {
      evaluate,
      sampleScalar,
    };
  };

  window.Vectura.NoiseRack = {
    name: 'Noise Rack',
    version: 1,
    combineBlend,
    createEvaluator,
  };
})();
