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
            case 'radial': {
              // Concentric radial bands with subtle wobble, not simplex-like drift.
              const r = Math.hypot(px, py);
              const bands = Math.sin(r * Math.PI * 6);
              const wobble = baseNoise(px * 0.7 + seed * 0.13, py * 0.7 - seed * 0.17) * 0.2;
              return Math.max(-1, Math.min(1, bands + wobble));
            }
            case 'checker': {
              const cx = Math.floor(px * 4);
              const cy = Math.floor(py * 4);
              return (cx + cy) % 2 === 0 ? 1 : -1;
            }
            case 'zigzag': {
              const t = Math.abs((px * 2) % 2 - 1);
              return (1 - t) * 2 - 1;
            }
            case 'ripple': {
              const r = Math.hypot(px, py);
              const ang = Math.atan2(py, px);
              return Math.sin(r * Math.PI * 8 + Math.sin(ang * 6) * 0.5 + n * 0.35);
            }
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
            const imageHeightScale = 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1);
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
              type: noiseLayer.type || 'simplex',
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
                const centeredX = noiseLayer.type === 'polygon' ? x - (inset + innerW * 0.5) : x;
                const centeredY = noiseLayer.type === 'polygon' ? y - (inset + innerH * 0.5) : y;
                const nx = (centeredX + shiftX) * zoom * widthScale;
                const ny = (centeredY + shiftY) * zoom * heightScale;
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
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const lineStructure = [
          'horizontal',
          'vertical',
          'horizontal-vertical',
          'isometric',
          'lattice',
          'horizon',
          'horizontal-vanishing-point',
        ].includes(p.lineStructure)
          ? p.lineStructure
          : 'horizontal';
        const resolvedLineStructure = lineStructure === 'horizontal-vanishing-point' ? 'horizon' : lineStructure;
        const sampleCombinedNoise = (
          baseX,
          baseY,
          sampleX = baseX,
          sampleY = baseY,
          imageSampleX = sampleX,
          imageSampleY = sampleY
        ) => {
          let combined;
          noiseSamplers.forEach((sampler) => {
            const sx = sampler.type === 'image' ? imageSampleX : sampleX;
            const sy = sampler.type === 'image' ? imageSampleY : sampleY;
            const value = sampler.sample(sx, sy) * sampler.amplitude;
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: sampler.blend,
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };
        const getEdgeTaper = (xNorm) => {
          if (edgeFadeStrength <= 0 || edgeFadeThresholdStrength <= 0 || edgeFadeMode === 'none') return 1;
          const t = clamp01(xNorm);
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
          if (hDist <= zone) return Math.max(0, 1 - edgeFadeStrength);
          if (edgeFadeFeatherStrength <= 0) return 1;
          const featherZone = Math.max(0.0001, edgeFadeFeatherStrength / (edgeFadeMode === 'both' ? 2 : 1));
          if (hDist > zone + featherZone) return 1;
          const tFeather = (hDist - zone) / featherZone;
          const eased = clamp01(tFeather);
          return Math.max(0, (1 - edgeFadeStrength) + eased * edgeFadeStrength);
        };
        const getVerticalTaper = (yNorm) => {
          if (verticalFadeStrength <= 0 || verticalFadeThresholdStrength <= 0 || verticalFadeMode === 'none') return 1;
          const tRow = clamp01(yNorm);
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
          if (vDist <= zone) return Math.max(0, 1 - verticalFadeStrength);
          if (verticalFadeFeatherStrength <= 0) return 1;
          const featherZone = Math.max(0.0001, verticalFadeFeatherStrength / (verticalFadeMode === 'both' ? 2 : 1));
          if (vDist > zone + featherZone) return 1;
          const t = (vDist - zone) / featherZone;
          const eased = clamp01(t);
          return Math.max(0, (1 - verticalFadeStrength) + eased * verticalFadeStrength);
        };
        const displacePoint = (
          baseX,
          baseY,
          strengthScale = 1,
          sampleX = baseX,
          sampleY = baseY,
          imageSampleX = sampleX,
          imageSampleY = sampleY
        ) => {
          const xNorm = clamp01((baseX - inset) / Math.max(1e-6, innerW));
          const yNorm = clamp01((baseY - inset) / Math.max(1e-6, innerH));
          const off = sampleCombinedNoise(baseX, baseY, sampleX, sampleY, imageSampleX, imageSampleY);
          const amp = off * getEdgeTaper(xNorm) * getVerticalTaper(yNorm) * strengthScale;
          const dx = amp * lineOffsetX;
          const dy = amp * lineOffsetY;
          let x = baseX + dx;
          let y = baseY + dy;
          if (dampenExtremes) {
            const minY = inset;
            const maxY = height - inset;
            if (y < minY || y > maxY) {
              const limit = Math.max(0, y < minY ? baseY - minY : maxY - baseY);
              const denom = Math.max(0.001, Math.abs(amp));
              const scale = Math.min(1, limit / denom);
              y = baseY + amp * scale;
            }
          }
          return { x, y };
        };
        const pushSegmentPath = (x0, y0, x1, y1, strengthFn = null, samplePointFn = null) => {
          const length = Math.hypot(x1 - x0, y1 - y0);
          const samples = Math.max(2, Math.floor(length / 2));
          const path = [];
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const baseX = x0 + (x1 - x0) * t;
            const baseY = y0 + (y1 - y0) * t;
            const strength = typeof strengthFn === 'function' ? strengthFn(t) : 1;
            const samplePoint =
              typeof samplePointFn === 'function' ? samplePointFn(baseX, baseY, t) : { x: baseX, y: baseY };
            const sampleX = samplePoint?.x ?? baseX;
            const sampleY = samplePoint?.y ?? baseY;
            const imageSampleX = samplePoint?.imageX ?? sampleX;
            const imageSampleY = samplePoint?.imageY ?? sampleY;
            path.push(displacePoint(baseX, baseY, strength, sampleX, sampleY, imageSampleX, imageSampleY));
          }
          if (path.length > 1) paths.push(path);
        };
        const clipInfiniteLineToBounds = (point, dir) => {
          const xMin = inset;
          const xMax = width - inset;
          const yMin = inset;
          const yMax = height - inset;
          const dx = dir.x;
          const dy = dir.y;
          const eps = 1e-6;
          const hits = [];
          const pushHit = (t) => {
            if (!Number.isFinite(t)) return;
            const x = point.x + dx * t;
            const y = point.y + dy * t;
            if (x < xMin - eps || x > xMax + eps || y < yMin - eps || y > yMax + eps) return;
            if (hits.some((h) => Math.abs(h.x - x) < 0.001 && Math.abs(h.y - y) < 0.001)) return;
            hits.push({ x: Math.max(xMin, Math.min(xMax, x)), y: Math.max(yMin, Math.min(yMax, y)), t });
          };
          if (Math.abs(dx) > eps) {
            pushHit((xMin - point.x) / dx);
            pushHit((xMax - point.x) / dx);
          }
          if (Math.abs(dy) > eps) {
            pushHit((yMin - point.y) / dy);
            pushHit((yMax - point.y) / dy);
          }
          if (hits.length < 2) return null;
          hits.sort((a, b) => a.t - b.t);
          return { a: hits[0], b: hits[hits.length - 1] };
        };
        const splitLineBudget = (total, parts) => {
          const safeParts = Math.max(1, Math.floor(parts));
          const safeTotal = Math.max(safeParts, Math.floor(total));
          const base = Math.floor(safeTotal / safeParts);
          const rem = safeTotal - base * safeParts;
          return Array.from({ length: safeParts }, (_, i) => base + (i < rem ? 1 : 0));
        };
        const buildParallelLinesAtAngle = (angleDeg, countScale = 1, countOverride = null) => {
          const count =
            Number.isFinite(countOverride) && countOverride !== null
              ? Math.max(2, Math.floor(countOverride))
              : Math.max(2, Math.round(lines * Math.max(0.1, countScale)));
          const rad = (angleDeg * Math.PI) / 180;
          const dir = { x: Math.cos(rad), y: Math.sin(rad) };
          const normal = { x: -dir.y, y: dir.x };
          const corners = [
            { x: inset, y: inset },
            { x: width - inset, y: inset },
            { x: inset, y: height - inset },
            { x: width - inset, y: height - inset },
          ];
          const projections = corners.map((pt) => pt.x * normal.x + pt.y * normal.y);
          const minProj = Math.min(...projections);
          const maxProj = Math.max(...projections);
          const center = { x: inset + innerW / 2, y: inset + innerH / 2 };
          const centerProj = center.x * normal.x + center.y * normal.y;
          for (let i = 0; i < count; i++) {
            const t = count <= 1 ? 0.5 : i / (count - 1);
            const proj = minProj + (maxProj - minProj) * t;
            const point = {
              x: center.x + normal.x * (proj - centerProj),
              y: center.y + normal.y * (proj - centerProj),
            };
            const seg = clipInfiniteLineToBounds(point, dir);
            if (!seg) continue;
            pushSegmentPath(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
          }
        };
        const buildHorizontalPaths = (lineCount = lines) => {
          const localRowSpan = Math.max(1, lineCount - 1);
          const localBaseSpace = innerH / localRowSpan;
          let localSpace = localBaseSpace * gap;
          let localTotalHeight = lineCount > 1 ? localSpace * (lineCount - 1) : 0;
          if (lineCount > 1 && localTotalHeight > innerH) {
            localSpace = innerH / (lineCount - 1);
            localTotalHeight = localSpace * (lineCount - 1);
          }
          const localStartY = inset + (innerH - localTotalHeight) / 2;
          let prevY = null;
          let prevOffset = 0;
          const rowOrder = overlapPadding > 0 ? [...Array(lineCount).keys()].reverse() : [...Array(lineCount).keys()];
          const rowPaths = new Array(lineCount);
          rowOrder.forEach((i) => {
            const path = [];
            const by = localStartY + i * localSpace;
            const tRow = lineCount <= 1 ? 0.5 : i / (lineCount - 1);
            const vTaper = getVerticalTaper(tRow);
            const xOffset = p.tilt * i;
            const currY = overlapPadding > 0 ? new Array(pts + 1) : null;
            for (let j = 0; j <= pts; j++) {
              const baseX = inset + j * xStep + xOffset;
              const off = sampleCombinedNoise(baseX, by);
              const amp = off * getEdgeTaper(j / pts) * vTaper;
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
                  if (y > ceiling) y = ceiling;
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
            const bottomOffset = p.tilt * (lineCount - 1);
            const topY = localStartY;
            const bottomY = localStartY + localSpace * (lineCount - 1);
            for (let j = 0; j <= pts; j++) {
              top.push({ x: inset + j * xStep, y: topY });
              bottom.push({ x: inset + j * xStep + bottomOffset, y: bottomY });
            }
            paths.push(top, bottom);
          }
        };
        if (resolvedLineStructure === 'horizontal') {
          buildHorizontalPaths();
          return paths;
        }
        if (resolvedLineStructure === 'horizontal-vertical') {
          const [hCount, vCount] = splitLineBudget(lines, 2);
          buildHorizontalPaths(hCount);
          buildParallelLinesAtAngle(90, 1, vCount);
          return paths;
        }
        if (resolvedLineStructure === 'vertical') {
          buildParallelLinesAtAngle(90);
          return paths;
        }
        if (resolvedLineStructure === 'isometric') {
          const xMin = inset;
          const xMax = width - inset;
          const yMin = inset;
          const yMax = height - inset;
          const rowCount = Math.max(2, lines);
          const rowSpacing = Math.max(0.25, lSpace);
          const isoTotalH = rowSpacing * (rowCount - 1);
          const isoStartY = yMin + (innerH - isoTotalH) / 2;
          const corners = [
            { x: xMin, y: yMin },
            { x: xMax, y: yMin },
            { x: xMin, y: yMax },
            { x: xMax, y: yMax },
          ];
          const slope60 = Math.sqrt(3);
          const bStep = rowSpacing * 2; // equilateral triangular lattice spacing
          const bPhase = ((isoStartY % bStep) + bStep) % bStep; // phase-lock diagonals to horizontal rows
          const buildSlopeFamily = (slopeSign = 1) => {
            const m = slope60 * slopeSign;
            const bVals = corners.map((pt) => pt.y - m * pt.x);
            const minB = Math.min(...bVals);
            const maxB = Math.max(...bVals);
            const bStart = Math.floor((minB - bPhase) / bStep) - 2;
            const bEnd = Math.ceil((maxB - bPhase) / bStep) + 2;
            const dirAngle = slopeSign > 0 ? 60 : -60;
            const rad = (dirAngle * Math.PI) / 180;
            const dir = { x: Math.cos(rad), y: Math.sin(rad) };
            for (let i = bStart; i <= bEnd; i++) {
              const b = bPhase + i * bStep;
              const point = { x: xMin, y: m * xMin + b };
              const seg = clipInfiniteLineToBounds(point, dir);
              if (!seg) continue;
              pushSegmentPath(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
            }
          };
          for (let i = 0; i < rowCount; i++) {
            const y = isoStartY + i * rowSpacing;
            pushSegmentPath(xMin, y, xMax, y);
          }
          buildSlopeFamily(1);
          buildSlopeFamily(-1);
          return paths;
        }
        if (resolvedLineStructure === 'lattice') {
          const [aCount, bCount] = splitLineBudget(lines, 2);
          buildParallelLinesAtAngle(45, 1, aCount);
          buildParallelLinesAtAngle(-45, 1, bCount);
          return paths;
        }
        if (resolvedLineStructure === 'horizon') {
          const maskPolygons = [];
          const legacyHeight = p.vanishingPointY !== undefined ? Math.round(clamp01(p.vanishingPointY) * 100) : 50;
          const horizonHeight = Math.max(1, Math.min(100, Math.round(p.horizonHeight ?? legacyHeight)));
          const depthPerspective = clamp01((p.horizonDepthPerspective ?? 70) / 100);
          const horizonVanishingX = clamp01((p.horizonVanishingX ?? 50) / 100);
          const horizonVanishingPower = clamp01((p.horizonVanishingPower ?? 60) / 100);
          const horizonFanReach = clamp01((p.horizonFanReach ?? 42) / 100);
          const horizonRelief = clamp01((p.horizonRelief ?? 22) / 100);
          const horizonCenterDampening = clamp01((p.horizonCenterDampening ?? 0) / 100);
          const horizonCenterWidth = Math.max(0.06, clamp01((p.horizonCenterWidth ?? 28) / 100));
          const horizonCenterBasin = clamp01((p.horizonCenterBasin ?? 0) / 100);
          const horizonShoulderLift = clamp01((p.horizonShoulderLift ?? 0) / 100);
          const horizonMirrorBlend = clamp01((p.horizonMirrorBlend ?? 0) / 100);
          const horizonValleyProfile = clamp01((p.horizonValleyProfile ?? 0) / 100);
          const horizonT = (horizonHeight - 1) / 99;
          const horizonCenterX = inset + innerW * 0.5;
          const horizonY = inset + innerH * horizonT;
          const baseY = inset + innerH;
          const safeDelta = Math.max(1, baseY - horizonY);
          const offscreenDepth = 1.35;
          const nearOffscreenY = horizonY + safeDelta * offscreenDepth;
          const horizonDepthOffset = horizonRelief * 0.03;
          const getCenterProfile = (baseX, depthState) => {
            const centerNorm = Math.abs(baseX - horizonCenterX) / Math.max(1e-6, innerW * 0.5);
            const focus = Math.exp(-Math.pow(centerNorm / horizonCenterWidth, 2));
            const dampening = focus * horizonCenterDampening * (0.72 + depthState.farFactor * 0.28);
            const ridgeBoost = (1 - focus) * horizonCenterDampening * 0.28;
            const shoulderStart = Math.min(0.88, horizonCenterWidth * 0.72 + 0.1);
            const shoulderMask = clamp01((centerNorm - shoulderStart) / Math.max(0.08, 1 - shoulderStart));
            const shapedShoulder = shoulderMask * shoulderMask * (3 - 2 * shoulderMask);
            const roadMask = clamp01(centerNorm / Math.max(0.08, horizonCenterWidth));
            const valleyProfile = Math.pow(roadMask, 1.35);
            const sideRise = valleyProfile * valleyProfile * (3 - 2 * valleyProfile);
            const basinOffset =
              focus * horizonCenterBasin * safeDelta * (0.05 + depthState.farFactor * 0.14 + depthState.nearFactor * 0.05);
            const shoulderOffset =
              shapedShoulder
              * horizonShoulderLift
              * safeDelta
              * (0.03 + depthState.farFactor * 0.1 + depthState.nearFactor * 0.04);
            const valleyOffset =
              sideRise
              * horizonValleyProfile
              * safeDelta
              * (0.05 + depthState.farFactor * 0.08 + depthState.nearFactor * 0.03);
            return {
              focus,
              amplitudeScale: Math.max(0.08, 1 - dampening + ridgeBoost + shapedShoulder * horizonShoulderLift * 0.42),
              basinOffset,
              shoulderOffset,
              valleyOffset,
            };
          };
          const getDepthState = (y) => {
            const depthNorm = clamp01((y - horizonY) / Math.max(1e-6, nearOffscreenY - horizonY)); // 0=far,1=near
            const farFactor = 1 - depthNorm;
            const nearFactor = depthNorm;
            const freqBoost = 1 + Math.pow(farFactor, 1.1) * depthPerspective * 1.45;
            const zShift = Math.pow(farFactor, 1.4) * depthPerspective * safeDelta * 0.42;
            const farAmpFloor = 0.08 + horizonRelief * 1.65;
            // Preserve stronger foreground relief while compressing distant terrain toward the horizon.
            const ampScale = Math.max(
              farAmpFloor,
              (horizonRelief + (1 - horizonRelief) * (1 - depthPerspective * 0.58))
                + Math.pow(nearFactor, 1.15) * depthPerspective * (1.95 - horizonRelief * 0.35)
            );
            return { depthNorm, farFactor, nearFactor, freqBoost, zShift, ampScale };
          };
          const samplePointForDepth = (baseX, baseY) => {
            const sampleBaseX = Math.max(inset, Math.min(width - inset, baseX));
            const clampedBaseY = Math.max(horizonY, Math.min(baseY, nearOffscreenY));
            const provisionalDepthNorm = clamp01((clampedBaseY - horizonY) / Math.max(1e-6, nearOffscreenY - horizonY));
            const skylineSampleOffset =
              safeDelta * (0.02 + horizonRelief * 0.16) * Math.pow(1 - provisionalDepthNorm, 0.85);
            const sampleBaseY = Math.max(horizonY + skylineSampleOffset, clampedBaseY);
            const d = getDepthState(sampleBaseY);
            const procX = horizonCenterX + (sampleBaseX - horizonCenterX) * d.freqBoost;
            const procY = horizonY + (sampleBaseY - horizonY) * d.freqBoost + d.zShift;
            const centerScale = Math.max(0.32, 1 - Math.pow(d.farFactor, 1.08) * depthPerspective * 0.36);
            const imgX = horizonCenterX + (sampleBaseX - horizonCenterX) * centerScale;
            const imgDepth = Math.max(0, Math.min(1, (sampleBaseY - horizonY) / Math.max(1e-6, safeDelta)));
            const imgY = horizonY + Math.pow(imgDepth, 0.92 + d.farFactor * depthPerspective * 0.88) * safeDelta;
            return {
              x: procX,
              y: procY,
              imageX: Math.max(inset, Math.min(width - inset, imgX)),
              imageY: Math.max(inset, Math.min(height - inset, imgY)),
            };
          };
          const evaluateHorizonNode = (baseX, baseY, strength = 1) => {
            const d = getDepthState(baseY);
            const sample = samplePointForDepth(baseX, baseY);
            const xNorm = clamp01((baseX - inset) / Math.max(1e-6, innerW));
            const clampedY = Math.max(inset, Math.min(height - inset, baseY));
            const yNorm = clamp01((clampedY - inset) / Math.max(1e-6, innerH));
            const centerProfile = getCenterProfile(baseX, d);
            const directNoise = sampleCombinedNoise(
              baseX,
              baseY,
              sample.x,
              sample.y,
              sample.imageX ?? sample.x,
              sample.imageY ?? sample.y
            );
            const mirroredBaseX = horizonCenterX - (baseX - horizonCenterX);
            const mirroredSample = samplePointForDepth(mirroredBaseX, baseY);
            const mirroredNoise = sampleCombinedNoise(
              mirroredBaseX,
              baseY,
              mirroredSample.x,
              mirroredSample.y,
              mirroredSample.imageX ?? mirroredSample.x,
              mirroredSample.imageY ?? mirroredSample.y
            );
            const noiseVal = directNoise * (1 - horizonMirrorBlend) + mirroredNoise * horizonMirrorBlend;
            const amp =
              noiseVal
              * getEdgeTaper(xNorm)
              * getVerticalTaper(yNorm)
              * d.ampScale
              * centerProfile.amplitudeScale
              * strength;
            const noiseDx = amp * lineOffsetX;
            const noiseDy = amp * lineOffsetY;
            const skylineLift = safeDelta * horizonRelief * (0.28 + d.farFactor * 0.5);
            const skylineCeiling = horizonY - skylineLift;
            const shapedBaseY = Math.min(
              baseY + centerProfile.basinOffset - centerProfile.shoulderOffset,
              baseY + centerProfile.basinOffset - centerProfile.shoulderOffset - centerProfile.valleyOffset
            );
            return {
              x: baseX + noiseDx,
              y: Math.max(skylineCeiling, shapedBaseY + noiseDy),
            };
          };
          const buildHorizonRow = (baseY, strengthFn = null) => {
            const samples = Math.max(96, Math.round(innerW / 4));
            const path = [];
            for (let i = 0; i <= samples; i++) {
              const t = i / samples;
              const baseX = inset + innerW * t;
              const d = getDepthState(baseY);
              const strength = typeof strengthFn === 'function' ? strengthFn(t, baseX, baseY, d) : 1;
              path.push(evaluateHorizonNode(baseX, baseY, strength));
            }
            return path.length > 1 ? path : null;
          };
          const samplePathYAtX = (path, x) => {
            if (!Array.isArray(path) || path.length < 2) return Number.NaN;
            for (let i = 1; i < path.length; i++) {
              const a = path[i - 1];
              const b = path[i];
              if (!a || !b) continue;
              const minX = Math.min(a.x, b.x);
              const maxX = Math.max(a.x, b.x);
              if (x < minX || x > maxX) continue;
              const span = Math.max(1e-6, b.x - a.x);
              const t = (x - a.x) / span;
              return a.y + (b.y - a.y) * t;
            }
            const first = path[0];
            const last = path[path.length - 1];
            if (!first || !last) return Number.NaN;
            return x <= first.x ? first.y : last.y;
          };
          const pushVisibleSegments = (points, meta = null) => {
            if (!Array.isArray(points) || points.length < 2) return [];
            const segments = [];
            let current = [];
            points.forEach((point) => {
              if (point) {
                current.push(point);
                return;
              }
              if (current.length > 1) segments.push(current);
              current = [];
            });
            if (current.length > 1) segments.push(current);
            segments.forEach((segment) => {
              if (meta) segment.meta = { ...(segment.meta || {}), ...meta };
              paths.push(segment);
            });
            return segments;
          };
          const pointInPolygon = (point, polygon = []) => {
            if (!point || !Array.isArray(polygon) || polygon.length < 4) return false;
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
              const a = polygon[i];
              const b = polygon[j];
              if (!a || !b) continue;
              const intersects =
                (a.y > point.y) !== (b.y > point.y)
                && point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-6, b.y - a.y) + a.x;
              if (intersects) inside = !inside;
            }
            return inside;
          };
          const clipPathToSkyline = (path, clipPath) => {
            if (!Array.isArray(path) || path.length < 2) return null;
            if (!clipPath) return path.map((point) => ({ x: point.x, y: point.y }));
            return path.map((point) => {
              const skylineY = samplePathYAtX(clipPath, point.x);
              return {
                x: point.x,
                y: Number.isFinite(skylineY) ? Math.max(point.y, skylineY) : point.y,
              };
            });
          };
          const legacySplit = splitLineBudget(lines, 2);
          const horizontalCount = Math.max(2, Math.round(p.horizonHorizontalLines ?? legacySplit[0]));
          const verticalCount = Math.max(2, Math.round(p.horizonVerticalLines ?? legacySplit[1]));
          const horizonRows = [];
          for (let i = 0; i < horizontalCount; i++) {
            const t = horizontalCount <= 1 ? 0.5 : i / (horizontalCount - 1);
            const depth = horizonDepthOffset + Math.pow(t, 1.8) * (offscreenDepth - horizonDepthOffset);
            const y = horizonY + safeDelta * depth;
            if (y < inset - safeDelta * 0.1) continue;
            const rowPath = buildHorizonRow(y, (_s, _x, _y, d) =>
              Math.max(horizonRelief * 0.6, 0.24 + horizonRelief * 0.45 + Math.pow(d.nearFactor, 1.05) * 0.86)
            );
            if (rowPath) horizonRows.push(rowPath);
          }
          if (horizonRows.length < 2) return paths;
          const skylinePath = clipPathToSkyline(horizonRows[0], null);
          skylinePath.meta = { ...(skylinePath.meta || {}), horizonRole: 'row', horizonRowIndex: 0 };
          paths.push(skylinePath);
          const displayRows = [skylinePath];
          for (let rowIndex = 1; rowIndex < horizonRows.length; rowIndex++) {
            const clippedRow = clipPathToSkyline(horizonRows[rowIndex], skylinePath);
            if (!clippedRow || clippedRow.length < 2) continue;
            clippedRow.meta = { ...(clippedRow.meta || {}), horizonRole: 'row', horizonRowIndex: rowIndex };
            paths.push(clippedRow);
            displayRows.push(clippedRow);
          }
          if (displayRows.length < 2) return paths;
          const sampleCount = Math.max(96, Math.round(innerW / 4));
          const xAtSample = (index) => inset + (innerW * index) / Math.max(1, sampleCount - 1);
          const samplePointAtX = (points, x) => {
            if (!Array.isArray(points) || points.length < 2) return null;
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1];
              const b = points[i];
              if (!a || !b) continue;
              const minX = Math.min(a.x, b.x);
              const maxX = Math.max(a.x, b.x);
              if (x < minX || x > maxX) continue;
              const span = Math.max(1e-6, b.x - a.x);
              const t = (x - a.x) / span;
              return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
              };
            }
            return null;
          };
          const sampleRowYAtX = (row, x) => {
            const point = samplePointAtX(row, x);
            return point ? point.y : Number.NaN;
          };
          const skylineSource = displayRows[0];
          const skylineSamples = Array.from({ length: sampleCount }, (_, index) => {
            const x = xAtSample(index);
            const y = samplePathYAtX(skylineSource, x);
            return Number.isFinite(y) ? { x, y } : null;
          });
          const visibleRows = new Array(displayRows.length);
          const occlusionSlack = Math.max(2, safeDelta * 0.035);
          const occlusionEnvelope = new Array(sampleCount).fill(Number.POSITIVE_INFINITY);
          for (let rowIndex = displayRows.length - 1; rowIndex >= 0; rowIndex--) {
            const sampledRow = Array.from({ length: sampleCount }, (_, index) => {
              const x = xAtSample(index);
              const y = samplePathYAtX(displayRows[rowIndex], x);
              if (!Number.isFinite(y)) return null;
              const skylinePoint = skylineSamples[index];
              const clippedY = skylinePoint ? Math.max(y, skylinePoint.y) : y;
              if (clippedY > occlusionEnvelope[index] + occlusionSlack) return null;
              return { x, y: clippedY };
            });
            visibleRows[rowIndex] = sampledRow;
            sampledRow.forEach((point, index) => {
              if (!point) return;
              occlusionEnvelope[index] = Math.min(occlusionEnvelope[index], point.y);
            });
          }
          paths.length = 0;
          for (let rowIndex = 0; rowIndex < visibleRows.length; rowIndex++) {
            pushVisibleSegments(visibleRows[rowIndex], { horizonRole: 'row', horizonRowIndex: rowIndex });
          }
          const rowBands = [];
          for (let rowIndex = 0; rowIndex < visibleRows.length - 1; rowIndex++) {
            const upper = visibleRows[rowIndex];
            const lower = visibleRows[rowIndex + 1];
            if (!Array.isArray(upper) || !Array.isArray(lower)) continue;
            const bandPolygons = [];
            for (let sampleIndex = 1; sampleIndex < sampleCount; sampleIndex++) {
              const a = upper[sampleIndex - 1];
              const b = upper[sampleIndex];
              const c = lower[sampleIndex];
              const d = lower[sampleIndex - 1];
              if (!a || !b || !c || !d) continue;
              const polygon = [
                { x: a.x, y: a.y },
                { x: b.x, y: b.y },
                { x: c.x, y: c.y },
                { x: d.x, y: d.y },
                { x: a.x, y: a.y },
              ];
              maskPolygons.push(polygon);
              const xs = [a.x, b.x, c.x, d.x];
              const ys = [a.y, b.y, c.y, d.y];
              bandPolygons.push({
                polygon,
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minY: Math.min(...ys),
                maxY: Math.max(...ys),
              });
            }
            rowBands[rowIndex] = bandPolygons;
          }
          const bottomY = height - inset;
          const lastRow = visibleRows[visibleRows.length - 1];
          if (Array.isArray(lastRow)) {
            for (let sampleIndex = 1; sampleIndex < sampleCount; sampleIndex++) {
              const a = lastRow[sampleIndex - 1];
              const b = lastRow[sampleIndex];
              if (!a || !b) continue;
              maskPolygons.push([
                { x: a.x, y: a.y },
                { x: b.x, y: b.y },
                { x: b.x, y: bottomY },
                { x: a.x, y: bottomY },
                { x: a.x, y: a.y },
              ]);
            }
          }
          const fanOverscan = horizonFanReach * (2.2 + horizonVanishingPower * 1.45);
          const horizonTargetX = inset + innerW * horizonVanishingX;
          const isHiddenByNearerRows = (point, startRowIndex) => {
            for (let rowIndex = startRowIndex + 1; rowIndex < visibleRows.length; rowIndex++) {
              const row = visibleRows[rowIndex];
              if (!Array.isArray(row) || !row.length) continue;
              const nearerY = sampleRowYAtX(row, point.x);
              if (!Number.isFinite(nearerY)) continue;
              if (nearerY <= point.y - occlusionSlack) return true;
            }
            return false;
          };
          const isHiddenByNearerBand = (point, startBandIndex) => {
            for (let bandIndex = startBandIndex; bandIndex < rowBands.length; bandIndex++) {
              const band = rowBands[bandIndex];
              if (!Array.isArray(band) || !band.length) continue;
              for (let polygonIndex = 0; polygonIndex < band.length; polygonIndex++) {
                const entry = band[polygonIndex];
                if (
                  point.x < entry.minX
                  || point.x > entry.maxX
                  || point.y < entry.minY
                  || point.y > entry.maxY
                ) {
                  continue;
                }
                if (pointInPolygon(point, entry.polygon)) return true;
              }
            }
            return false;
          };
          const skylineReconnectSlack = Math.max(3, safeDelta * 0.06);
          for (let i = 0; i < verticalCount; i++) {
            const t = verticalCount <= 1 ? 0.5 : i / (verticalCount - 1);
            const bottomT = -fanOverscan + t * (1 + fanOverscan * 2);
            const bottomX = inset + innerW * bottomT;
            const columnPoints = visibleRows.map((row, rowIndex) => {
              if (!Array.isArray(row) || !row.length) return null;
              const rowNear = visibleRows.length <= 1 ? 1 : rowIndex / (visibleRows.length - 1);
              const convergence = horizonVanishingPower * Math.pow(1 - rowNear, 1.1);
              const rowX = bottomX + (horizonTargetX - bottomX) * convergence;
              const sampled = samplePointAtX(row, rowX);
              return sampled;
            });
            const culledColumn = [];
            for (let rowIndex = 0; rowIndex < columnPoints.length; rowIndex++) {
              const point = columnPoints[rowIndex];
              if (!point) {
                culledColumn.push(null);
                continue;
              }
              if (rowIndex > 0) {
                const prev = columnPoints[rowIndex - 1];
                if (!prev) {
                  culledColumn.push(point);
                  continue;
                }
                const midpoint = {
                  x: (prev.x + point.x) * 0.5,
                  y: (prev.y + point.y) * 0.5,
                };
                if (isHiddenByNearerBand(midpoint, rowIndex) || isHiddenByNearerRows(midpoint, rowIndex)) {
                  culledColumn.push(null);
                  continue;
                }
              }
              culledColumn.push(point);
            }
            const columnSegments = [];
            let currentSegment = [];
            culledColumn.forEach((point) => {
              if (point) {
                currentSegment.push(point);
                return;
              }
              if (currentSegment.length > 1) columnSegments.push(currentSegment);
              currentSegment = [];
            });
            if (currentSegment.length > 1) columnSegments.push(currentSegment);
            columnSegments
              .filter((segment) => {
                const start = segment[0];
                if (!start) return false;
                const skylineY = sampleRowYAtX(visibleRows[0], start.x);
                if (!Number.isFinite(skylineY)) return false;
                if (start.y > skylineY + skylineReconnectSlack) return false;
                const centerDistance = Math.abs(start.x - horizonCenterX) / Math.max(1e-6, innerW * 0.5);
                const minVisiblePoints = 2 + Math.round(centerDistance * 4);
                return segment.length >= minVisiblePoints;
              })
              .forEach((segment) => {
                segment.meta = { ...(segment.meta || {}), horizonRole: 'column', horizonColumnIndex: i };
                paths.push(segment);
              });
          }
          paths.maskPolygons = maskPolygons;
          return paths;
        }
        return paths;
      },
      formula: (p) =>
        `structure = ${(p.lineStructure === 'horizontal-vanishing-point' ? 'horizon' : p.lineStructure) || 'horizontal'}\ny = yBase + Σ noiseᵢ(rotate(x*zoomᵢ*freqᵢ, y*zoomᵢ)) * ampᵢ\nedge/vertical dampening scales noise`,
    };
})();
