/**
 * wavetable algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.wavetable = {
      generate: (p, rng, noise, bounds) => {
        const { m, height, width } = bounds;
        const paths = [];
        const inset = bounds.truncate ? m : 0;
        const innerW = width - inset * 2;
        const innerH = height - inset * 2;
        const lines = Math.max(1, Math.floor(p.lines));
        const rowSpan = Math.max(1, lines - 1);
        const baseSpace = innerH / rowSpan;
        const gap = Math.max(0.1, p.gap);
        let lSpace = baseSpace * gap;
        let totalHeight = lines > 1 ? lSpace * (lines - 1) : 0;
        if (lines > 1 && totalHeight > innerH) {
          lSpace = innerH / (lines - 1);
          totalHeight = lSpace * (lines - 1);
        }
        const startY = inset + (innerH - totalHeight) / 2;
        const pts = Math.max(2, Math.floor(innerW / 2));
        const xStep = innerW / pts;
        const dampenExtremes = Boolean(p.dampenExtremes);
        const overlapPadding = Math.max(0, p.overlapPadding ?? 0);
        const flatCaps = Boolean(p.flatCaps);
        const edgeFade = Math.min(100, Math.max(0, p.edgeFade ?? 0));
        const edgeFadeStrength = Math.min(1, edgeFade / 100);
        const edgeFadeThreshold = Math.min(100, Math.max(0, p.edgeFadeThreshold ?? 0));
        const edgeFadeThresholdStrength = Math.min(1, edgeFadeThreshold / 100);
        const edgeFadeFeather = Math.min(100, Math.max(0, p.edgeFadeFeather ?? 0));
        const edgeFadeFeatherStrength = Math.min(1, edgeFadeFeather / 100);
        const edgeFadeMode = ['none', 'left', 'right', 'both'].includes(p.edgeFadeMode)
          ? p.edgeFadeMode
          : 'both';
        const verticalFade = Math.min(100, Math.max(0, p.verticalFade ?? 0));
        const verticalFadeStrength = Math.min(1, verticalFade / 100);
        const verticalFadeThreshold = Math.min(100, Math.max(0, p.verticalFadeThreshold ?? 0));
        const verticalFadeThresholdStrength = Math.min(1, verticalFadeThreshold / 100);
        const verticalFadeFeather = Math.min(100, Math.max(0, p.verticalFadeFeather ?? 0));
        const verticalFadeFeatherStrength = Math.min(1, verticalFadeFeather / 100);
        const verticalFadeMode = ['none', 'top', 'bottom', 'both'].includes(p.verticalFadeMode)
          ? p.verticalFadeMode
          : 'both';
        const lineOffsetAngle = ((p.lineOffset ?? 180) * Math.PI) / 180;
        const lineOffsetX = Math.sin(lineOffsetAngle);
        const lineOffsetY = -Math.cos(lineOffsetAngle);
        const baseNoise = (x, y) => noise.noise2D(x, y);
        const hash2D = (x, y) => {
          const n = Math.sin(x * 127.1 + y * 311.7 + (p.seed ?? 0) * 0.1) * 43758.5453;
          return n - Math.floor(n);
        };
        const lerp = (a, b, t) => a + (b - a) * t;
        const smoothstep = (t) => t * t * (3 - 2 * t);
        const valueNoise = (x, y, seed = 0, smooth = true) => {
          const xi = Math.floor(x);
          const yi = Math.floor(y);
          const xf = x - xi;
          const yf = y - yi;
          const u = smooth ? smoothstep(xf) : xf;
          const v = smooth ? smoothstep(yf) : yf;
          const sx = seed * 0.17;
          const sy = seed * 0.11;
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
        const fbmNoise = (x, y) => {
          let total = 0;
          let amp = 1;
          let freq = 1;
          let norm = 0;
          for (let i = 0; i < 4; i++) {
            total += baseNoise(x * freq, y * freq) * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2;
          }
          return norm ? total / norm : total;
        };
        const noiseValue = (x, y, noiseDef, meta = {}) => {
          const noiseType = noiseDef?.type || 'simplex';
          const n = baseNoise(x, y);
          const patternScale = Math.max(0.1, noiseDef?.patternScale ?? 1);
          const warpStrength = Math.max(0, noiseDef?.warpStrength ?? 1);
          const cellScale = Math.max(0.1, noiseDef?.cellularScale ?? 1);
          const cellJitter = Math.max(0, Math.min(1, noiseDef?.cellularJitter ?? 1));
          const stepsCount = Math.max(2, Math.round(noiseDef?.stepsCount ?? 5));
          const seed = noiseDef?.seed ?? 0;
          const px = x * patternScale;
          const py = y * patternScale;
          switch (noiseType) {
            case 'ridged':
              return (1 - Math.abs(n)) * 2 - 1;
            case 'billow':
              return Math.abs(n) * 2 - 1;
            case 'value':
              return valueNoise(x, y, seed, false);
            case 'perlin':
              return valueNoise(x, y, seed, true);
            case 'turbulence': {
              const n2 = baseNoise(x * 2, y * 2);
              const n3 = baseNoise(x * 4, y * 4);
              const t = (Math.abs(n) + Math.abs(n2) * 0.5 + Math.abs(n3) * 0.25) / 1.75;
              return t * 2 - 1;
            }
            case 'stripes':
              return Math.sin(px * 2 + n * 1.5);
            case 'marble':
              return Math.sin((px + py) * 1.5 + n * 2);
            case 'steps': {
              const shift = ((seed * 0.13) % 1 + 1) % 1;
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
              const t = ((px + py * 0.25) % 1 + 1) % 1;
              return t * 2 - 1;
            }
            case 'triangle': {
              const t = (n + 1) / 2;
              const tri = 1 - Math.abs((t % 1) * 2 - 1);
              return tri * 2 - 1;
            }
            case 'polygon': {
              const sides = Math.max(3, Math.round(noiseDef?.polygonSides ?? 6));
              const radius = Math.max(0.1, noiseDef?.polygonRadius ?? 2);
              const rotation = ((noiseDef?.polygonRotation ?? 0) * Math.PI) / 180;
              const outline = Math.max(0, noiseDef?.polygonOutline ?? 0);
              const edge = Math.max(0, noiseDef?.polygonEdgeRadius ?? 0);
              const ang = Math.atan2(py, px) - rotation;
              const sector = (Math.PI * 2) / sides;
              const rel = ((ang % sector) + sector) % sector;
              const dist = Math.cos(Math.PI / sides) / Math.cos(rel - Math.PI / sides);
              const maxR = radius * dist;
              const r = Math.hypot(px, py);
              const sd = r - maxR;
              const blend = (d) => {
                if (edge <= 0) return d <= 0 ? 1 : -1;
                const t = Math.max(0, Math.min(1, (d + edge) / (edge * 2)));
                return 1 - t * 2;
              };
              if (outline > 0) {
                const half = outline / 2;
                return blend(Math.abs(sd) - half);
              }
              return blend(sd);
            }
            case 'warp': {
              const warp = baseNoise(x + n * 1.5 * warpStrength, y + n * 1.5 * warpStrength);
              return warp;
            }
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
            case 'fbm':
              return fbmNoise(x, y);
            case 'swirl':
              return Math.sin(px * 2 + n * 2) * Math.cos(py * 2 + n);
            case 'radial':
              return Math.sin(Math.hypot(px, py) * 3 + n * 2);
            case 'checker': {
              const cx = Math.floor(px * 4);
              const cy = Math.floor(py * 4);
              return (cx + cy) % 2 === 0 ? 1 : -1;
            }
            case 'zigzag': {
              const t = Math.abs((px * 2) % 2 - 1);
              return (1 - t) * 2 - 1;
            }
            case 'ripple':
              return Math.sin((px + py) * 3 + n * 2);
            case 'spiral': {
              const ang = Math.atan2(py, px);
              const rad = Math.hypot(px, py);
              return Math.sin(ang * 4 + rad * 2 + n);
            }
            case 'grain':
              return hash2D(x * 10, y * 10) * 2 - 1;
            case 'crosshatch':
              return (Math.sin(px * 3) + Math.sin(py * 3)) * 0.5;
            case 'pulse': {
              const t = Math.abs(Math.sin(px * 2 + n) * Math.cos(py * 2 + n));
              return t * 2 - 1;
            }
            case 'domain': {
              const wx = baseNoise(x * 1.7, y * 1.7) * warpStrength;
              const wy = baseNoise(x * 1.7 + 5.2, y * 1.7 + 1.3) * warpStrength;
              return baseNoise(x + wx, y + wy);
            }
            case 'weave': {
              const wx = Math.sin(px * 2 + n);
              const wy = Math.sin(py * 2 + n);
              return wx * wy;
            }
            case 'moire': {
              const a = Math.sin(px * 2);
              const b = Math.sin(py * 2.2);
              return (a + b) * 0.5;
            }
            case 'dunes': {
              const band = Math.sin(px * 2 + n * 1.5);
              return band;
            }
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
              const clamp01 = (v) => Math.max(0, Math.min(1, v));
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
                const r = Math.max(0, Math.round(radius));
                if (!r) return sampleLum(u, v);
                let total = 0;
                let count = 0;
                for (let dy = -r; dy <= r; dy++) {
                  for (let dx = -r; dx <= r; dx++) {
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
                return [
                  {
                    ...noiseDef,
                    enabled: true,
                    mode: noiseDef?.imageAlgo || 'luma',
                  },
                ];
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
                  case 'brightness': {
                    const amt = Math.max(-1, Math.min(1, getParam(effect, 'imageBrightness', 0)));
                    lum = lum + amt;
                    break;
                  }
                  case 'levels': {
                    const low = Math.max(0, Math.min(1, getParam(effect, 'imageLevelsLow', 0)));
                    const high = Math.max(low + 0.001, Math.min(1, getParam(effect, 'imageLevelsHigh', 1)));
                    lum = (lum - low) / (high - low);
                    break;
                  }
                  case 'gamma': {
                    const gamma = Math.max(0.2, Math.min(3, getParam(effect, 'imageGamma', 1)));
                    lum = Math.pow(lum, gamma);
                    break;
                  }
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
                  case 'threshold': {
                    const t = Math.max(0, Math.min(1, getParam(effect, 'imageThreshold', 0.5)));
                    lum = lum >= t ? 1 : 0;
                    break;
                  }
                  case 'posterize': {
                    const levels = Math.max(2, Math.min(10, Math.round(getParam(effect, 'imagePosterize', 5))));
                    lum = Math.round(lum * (levels - 1)) / (levels - 1);
                    break;
                  }
                  case 'solarize': {
                    const t = Math.max(0, Math.min(1, getParam(effect, 'imageSolarize', 0.5)));
                    if (lum > t) lum = 1 - lum;
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
              const effects = resolveEffects();
              effects.forEach((effect) => {
                if (effect && effect.enabled === false) return;
                state = applyEffect(effect, state);
              });
              let lum = clamp01(state.lum);
              const darknessBase = 1 - lum;
              let impact = darknessBase;
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
                case 'linear':
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
                const cyclesPerMm = microFreq / 2;
                const wave = Math.sin((wx + wy) * cyclesPerMm * Math.PI * 2);
                value += wave * impact * 0.5;
              }
              value = Math.max(-1, Math.min(1, value));
              return value;
            }
            default:
              return n;
          }
        };
        const frac = (v) => v - Math.floor(v);
        const applyPad = (t, pad) => {
          if (pad <= 0) return t;
          const span = 1 - pad * 2;
          if (span <= 0) return 0.5;
          return Math.max(0, Math.min(1, (t - pad) / span));
        };
        const applyTile = (nx, ny, mode, padding = 0) => {
          const pad = Math.max(0, Math.min(0.45, padding));
          switch (mode) {
            case 'brick': {
              const row = Math.floor(ny);
              const fx = applyPad(frac(nx + (row % 2) * 0.5), pad);
              const fy = applyPad(frac(ny), pad);
              return { x: fx, y: fy };
            }
            case 'hex': {
              const hy = ny / 0.866;
              const row = Math.floor(hy);
              const fx = applyPad(frac(nx + (row % 2) * 0.5), pad);
              const fy = applyPad(frac(hy), pad);
              return { x: fx, y: fy };
            }
            case 'diamond': {
              const ax = nx + ny;
              const ay = -nx + ny;
              const fx = applyPad(frac(ax), pad);
              const fy = applyPad(frac(ay), pad);
              return { x: fx, y: fy };
            }
            case 'triangle': {
              let fx = frac(nx);
              let fy = frac(ny);
              if (fx + fy > 1) {
                fx = 1 - fx;
                fy = 1 - fy;
              }
              return { x: applyPad(fx, pad), y: applyPad(fy, pad) };
            }
            case 'offset': {
              const col = Math.floor(nx);
              const fx = applyPad(frac(nx), pad);
              const fy = applyPad(frac(ny + (col % 2) * 0.5), pad);
              return { x: fx, y: fy };
            }
            case 'radial': {
              const r = Math.hypot(nx, ny);
              const a = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5;
              const rr = applyPad(frac(r), pad);
              const aa = applyPad(frac(a), pad) * Math.PI * 2;
              return { x: rr * Math.cos(aa), y: rr * Math.sin(aa) };
            }
            case 'spiral': {
              const r = Math.hypot(nx, ny);
              const a = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5;
              const spiral = r + a * 0.5;
              const rr = applyPad(frac(spiral), pad);
              const aa = applyPad(frac(a), pad) * Math.PI * 2;
              return { x: rr * Math.cos(aa), y: rr * Math.sin(aa) };
            }
            case 'checker': {
              const cx = Math.floor(nx);
              const cy = Math.floor(ny);
              let fx = frac(nx);
              let fy = frac(ny);
              if ((cx + cy) % 2 !== 0) fx = 1 - fx;
              return { x: applyPad(fx, pad), y: applyPad(fy, pad) };
            }
            case 'wave': {
              const fx = applyPad(frac(nx + Math.sin(ny * Math.PI * 2) * 0.1), pad);
              const fy = applyPad(frac(ny + Math.sin(nx * Math.PI * 2) * 0.1), pad);
              return { x: fx, y: fy };
            }
            case 'grid':
            default: {
              const fx = applyPad(frac(nx), pad);
              const fy = applyPad(frac(ny), pad);
              return { x: fx, y: fy };
            }
          }
        };
        const noiseBase = {
          enabled: true,
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: p.amplitude ?? 0,
          zoom: p.zoom ?? 0.02,
          freq: p.freq ?? 1,
          angle: p.noiseAngle ?? 0,
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
          noiseStyle: 'linear',
          noiseThreshold: 0,
          imageWidth: 1,
          imageHeight: 1,
          microFreq: 0,
          imageInvertColor: false,
          imageInvertOpacity: false,
          imageId: p.noiseImageId || '',
          imageName: p.noiseImageName || '',
          imageAlgo: p.imageAlgo || 'luma',
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
          imageThreshold: p.imageThreshold ?? 0.5,
          imagePosterize: p.imagePosterize ?? 5,
          imageBlur: p.imageBlur ?? 0,
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
        const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : [noiseBase]).map((noiseLayer) => ({
          ...noiseBase,
          ...(noiseLayer || {}),
          enabled: noiseLayer?.enabled !== false,
          blend: noiseLayer?.blend || noiseBase.blend,
        }));
        const noiseSamplers = noiseStack
          .filter((noiseLayer) => noiseLayer.enabled !== false)
          .map((noiseLayer) => {
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const zoom = noiseLayer.zoom ?? noiseBase.zoom;
            const freq = noiseLayer.freq ?? noiseBase.freq;
            const amplitude = noiseLayer.amplitude ?? noiseBase.amplitude;
            const shiftX = (noiseLayer.shiftX ?? 0) * innerW * 0.5;
            const shiftY = (noiseLayer.shiftY ?? 0) * innerH * 0.5;
            const tileMode = noiseLayer.tileMode || 'grid';
            const tilePadding = noiseLayer.tilePadding ?? 0;
            const imageWidth = Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1);
            const imageWidthScale = 1 / imageWidth;
            const imageHeightScale = Math.max(0.05, noiseLayer.imageHeight ?? 1);
            const store = window.Vectura?.NOISE_IMAGES || {};
            const imageSource = noiseLayer?.imageId ? store[noiseLayer.imageId] : null;
            const imageAspect =
              imageSource && imageSource.width > 0 && imageSource.height > 0
                ? imageSource.width / imageSource.height
                : 1;
            const canvasAspect = Math.max(1e-6, innerW / Math.max(1e-6, innerH));
            // Keep image sampling proportional at Noise Width=1 (no aspect stretch).
            const aspectScaleX = canvasAspect >= imageAspect ? 1 : canvasAspect / Math.max(1e-6, imageAspect);
            const aspectScaleY = canvasAspect >= imageAspect ? imageAspect / canvasAspect : 1;
            return {
              blend: noiseLayer.blend || 'add',
              amplitude,
              sample: (x, y) => {
                if (noiseLayer.type === 'image' && tileMode === 'off') {
                  const imageZoom = Math.max(0.1, zoom * 50);
                  const u = (x - inset) / innerW - 0.5 + (noiseLayer.shiftX ?? 0);
                  const v = (y - inset) / innerH - 0.5 + (noiseLayer.shiftY ?? 0);
                  const ix = u * imageZoom * aspectScaleX * imageWidthScale;
                  const iy = v * imageZoom * aspectScaleY * imageHeightScale;
                  const rx = ix * cosA - iy * sinA;
                  const ry = ix * sinA + iy * cosA;
                  return noiseValue(rx, ry, noiseLayer, { worldX: x, worldY: y });
                }
                const widthScale = noiseLayer.type === 'image' ? imageWidthScale / Math.max(1e-6, imageAspect) : freq;
                const heightScale = noiseLayer.type === 'image' ? imageHeightScale : 1;
                const nx = (x + shiftX) * zoom * widthScale;
                const ny = (y + shiftY) * zoom * heightScale;
                const rx = nx * cosA - ny * sinA;
                const ry = nx * sinA + ny * cosA;
                let tx = rx;
                let ty = ry;
                if (tileMode && tileMode !== 'off') {
                  const tiled = applyTile(rx, ry, tileMode, tilePadding);
                  tx = tiled.x;
                  ty = tiled.y;
                }
                return noiseValue(tx, ty, noiseLayer, { worldX: x, worldY: y });
              },
            };
          });
        const maxAmp = noiseSamplers.reduce((sum, sampler) => sum + Math.abs(sampler.amplitude || 0), 0) || 1;
        let prevY = null;
        let prevOffset = 0;
        const rowOrder = overlapPadding > 0 ? [...Array(lines).keys()].reverse() : [...Array(lines).keys()];
        const rowPaths = new Array(lines);
        rowOrder.forEach((i) => {
          const path = [];
          const by = startY + i * lSpace;
          const tRow = lines <= 1 ? 0.5 : i / (lines - 1);
          let vTaper = 1;
          if (verticalFadeStrength > 0 && verticalFadeThresholdStrength > 0 && verticalFadeMode !== 'none') {
            let vDist = 0;
            let zone = 0;
            if (verticalFadeMode === 'top') {
              vDist = tRow;
              zone = verticalFadeThresholdStrength;
            } else if (verticalFadeMode === 'bottom') {
              vDist = 1 - tRow;
              zone = verticalFadeThresholdStrength;
            } else {
              vDist = Math.min(tRow, 1 - tRow);
              zone = verticalFadeThresholdStrength / 2;
            }
            if (vDist <= zone) {
              vTaper = Math.max(0, 1 - verticalFadeStrength);
            } else if (verticalFadeFeatherStrength > 0) {
              const featherZone = Math.max(0.0001, verticalFadeFeatherStrength / (verticalFadeMode === 'both' ? 2 : 1));
              if (vDist <= zone + featherZone) {
                const t = (vDist - zone) / featherZone;
                const eased = Math.max(0, Math.min(1, t));
                const damp = (1 - verticalFadeStrength) + eased * verticalFadeStrength;
                vTaper = Math.max(0, damp);
              }
            }
          }
          const xOffset = p.tilt * i;
          const currY = overlapPadding > 0 ? new Array(pts + 1) : null;
          for (let j = 0; j <= pts; j++) {
            const baseX = inset + j * xStep + xOffset;
            let combined = 0;
            let hasNoise = false;
            noiseSamplers.forEach((sampler) => {
              const value = sampler.sample(baseX, by) * sampler.amplitude;
              if (!hasNoise) {
                combined = value;
                hasNoise = true;
                return;
              }
              switch (sampler.blend) {
                case 'subtract':
                  combined -= value;
                  break;
                case 'multiply':
                  combined *= value;
                  break;
                case 'max':
                  combined = Math.max(combined, value);
                  break;
                case 'min':
                  combined = Math.min(combined, value);
                  break;
                case 'hatch-dark':
                case 'hatch-light': {
                  const baseTone = hasNoise ? Math.max(0, Math.min(1, (combined / maxAmp + 1) / 2)) : 0.5;
                  const weight = sampler.blend === 'hatch-dark' ? 1 - baseTone : baseTone;
                  const dirBias =
                    value >= 0
                      ? sampler.blend === 'hatch-dark'
                        ? 0.6
                        : 1.2
                      : sampler.blend === 'hatch-dark'
                        ? 1.2
                        : 0.6;
                  combined += value * weight * dirBias;
                  break;
                }
                case 'add':
                default:
                  combined += value;
                  break;
              }
            });
            const off = hasNoise ? combined : 0;
            let taper = 1.0;
            if (edgeFadeStrength > 0 && edgeFadeThresholdStrength > 0 && edgeFadeMode !== 'none') {
              const t = j / pts;
              let hDist = 0;
              let zone = 0;
              if (edgeFadeMode === 'left') {
                hDist = t;
                zone = edgeFadeThresholdStrength;
              } else if (edgeFadeMode === 'right') {
                hDist = 1 - t;
                zone = edgeFadeThresholdStrength;
              } else {
                hDist = Math.min(t, 1 - t);
                zone = edgeFadeThresholdStrength / 2;
              }
              if (hDist <= zone) {
                taper = Math.max(0, 1 - edgeFadeStrength);
              } else if (edgeFadeFeatherStrength > 0) {
                const featherZone = Math.max(0.0001, edgeFadeFeatherStrength / (edgeFadeMode === 'both' ? 2 : 1));
                if (hDist <= zone + featherZone) {
                  const tFeather = (hDist - zone) / featherZone;
                  const eased = Math.max(0, Math.min(1, tFeather));
                  const damp = (1 - edgeFadeStrength) + eased * edgeFadeStrength;
                  taper = Math.max(0, damp);
                }
              }
            }
            const amp = off * taper * vTaper;
            const dx = amp * lineOffsetX;
            const dy = amp * lineOffsetY;
            let x = baseX + dx;
            let y = by + dy;
            if (dampenExtremes) {
              const minY = inset;
              const maxY = height - inset;
              if (y < minY || y > maxY) {
                const limit = Math.max(0, y < minY ? by - minY : maxY - by);
                const denom = Math.max(0.001, Math.abs(amp));
                const scale = Math.min(1, limit / denom);
                y = by + amp * scale;
              }
            }
            if (overlapPadding > 0 && prevY) {
              const minGap = overlapPadding * 0.5;
              const prevIndex = (baseX - (inset + prevOffset)) / xStep;
              if (prevIndex >= 0 && prevIndex <= pts) {
                const i0 = Math.floor(prevIndex);
                const i1 = Math.min(pts, i0 + 1);
                const t = prevIndex - i0;
                const prevVal = prevY[i0] + (prevY[i1] - prevY[i0]) * t;
                const ceiling = prevVal - minGap;
                if (y > ceiling) {
                  y = ceiling;
                }
              }
            }
            path.push({ x, y });
            if (currY) currY[j] = y;
          }
          rowPaths[i] = path.length > 1 ? path : null;
          if (currY) {
            prevY = currY;
            prevOffset = xOffset;
          }
        });

        const continuity = ['none', 'single', 'double'].includes(p.continuity) ? p.continuity : 'none';
        if (continuity === 'single') {
          const snake = [];
          rowPaths.forEach((path, idx) => {
            if (!path || path.length < 2) return;
            const segment = idx % 2 === 0 ? path : path.slice().reverse();
            if (snake.length) {
              const last = snake[snake.length - 1];
              const start = segment[0];
              if (last.x !== start.x || last.y !== start.y) snake.push({ x: start.x, y: start.y });
            }
            snake.push(...segment);
          });
          if (snake.length) paths.push(snake);
        } else {
          rowPaths.forEach((path) => {
            if (path) paths.push(path);
          });
          if (continuity === 'double') {
            for (let i = 0; i < rowPaths.length - 1; i++) {
              const a = rowPaths[i];
              const b = rowPaths[i + 1];
              if (!a || !b) continue;
              const leftA = a[0];
              const rightA = a[a.length - 1];
              const leftB = b[0];
              const rightB = b[b.length - 1];
              if (leftA && leftB) paths.push([leftA, leftB]);
              if (rightA && rightB) paths.push([rightA, rightB]);
            }
          }
        }

        if (flatCaps) {
          const top = [];
          const bottom = [];
          const bottomOffset = p.tilt * (lines - 1);
          const topY = startY;
          const bottomY = startY + lSpace * (lines - 1);
          for (let j = 0; j <= pts; j++) {
            const xTop = inset + j * xStep;
            const xBottom = inset + j * xStep + bottomOffset;
            top.push({ x: xTop, y: topY });
            bottom.push({ x: xBottom, y: bottomY });
          }
          paths.push(top, bottom);
        }

        return paths;
      },
      formula: (p) =>
        `y = yBase + Σ noiseᵢ(rotate(x*zoomᵢ*freqᵢ, y*zoomᵢ)) * ampᵢ\nedge/vertical dampening scales noise`,
    };
})();
