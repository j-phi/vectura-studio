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
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
        const lerp = (a, b, t) => a + (b - a) * t;
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
          polygonZoomReference: p.zoom ?? 0.02,
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
            const zoom = window.Vectura.NoiseRack.resolveEffectiveZoom(noiseLayer, noiseBase.zoom);
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
                  return rack.evaluate(rx, ry, noiseLayer, { worldX: x, worldY: y });
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
                  if (noiseLayer.type === 'polygon') { tx = (tiled.x - 0.5) * 2; ty = (tiled.y - 0.5) * 2; }
                }
                return rack.evaluate(tx, ty, noiseLayer, { worldX: x, worldY: y });
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
          'horizon-3d',
          'horizontal-vanishing-point',
        ].includes(p.lineStructure)
          ? p.lineStructure
          : 'horizontal';
        const resolvedLineStructure =
          lineStructure === 'horizontal-vanishing-point' || lineStructure === 'horizon-3d'
            ? 'horizon'
            : lineStructure;
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
        const resolveVerticalNoiseAmplitude = (noiseValue, strength = 1) => -(noiseValue * strength);
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
          const amp = resolveVerticalNoiseAmplitude(
            off,
            getEdgeTaper(xNorm) * getVerticalTaper(yNorm) * strengthScale
          );
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
              y = baseY + dy * scale;
            }
          }
          return { x, y };
        };
        const pushSegmentPath = (x0, y0, x1, y1, strengthFn = null, samplePointFn = null, meta = null) => {
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
          if (path.length > 1) {
            if (meta) path.meta = meta;
            paths.push(path);
          }
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
              const amp = resolveVerticalNoiseAmplitude(off, getEdgeTaper(j / pts) * vTaper);
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
                  y = by + dy * scale;
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
          const isoCenterY = isoStartY + isoTotalH / 2;
          const rowShift = Number.isFinite(p.tilt) ? p.tilt : 0;
          const rowShiftShear = rowSpacing > 1e-6 ? rowShift / rowSpacing : 0;
          const corners = [
            { x: xMin, y: yMin },
            { x: xMax, y: yMin },
            { x: xMin, y: yMax },
            { x: xMax, y: yMax },
          ];
          const slope60 = Math.sqrt(3);
          const bStep = rowSpacing * 2; // equilateral triangular lattice spacing
          const bPhase = ((isoStartY % bStep) + bStep) % bStep; // phase-lock diagonals to horizontal rows
          const shearPoint = (point) => ({
            x: point.x + rowShiftShear * (point.y - isoCenterY),
            y: point.y,
          });
          const shearDirection = (dir) => ({
            x: dir.x + rowShiftShear * dir.y,
            y: dir.y,
          });
          const clipShearedInfiniteLineToBounds = (point, dir) => clipInfiniteLineToBounds(
            shearPoint(point),
            shearDirection(dir)
          );
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
              const seg = clipShearedInfiniteLineToBounds(point, dir);
              if (!seg) continue;
              pushSegmentPath(
                seg.a.x,
                seg.a.y,
                seg.b.x,
                seg.b.y,
                null,
                null,
                {
                  isometricRole: slopeSign > 0 ? 'positive-diagonal' : 'negative-diagonal',
                  isometricIndex: i,
                  isometricBaseIntercept: b,
                  isometricRowSpacing: rowSpacing,
                  isometricRowShift: rowShift,
                }
              );
            }
          };
          for (let i = 0; i < rowCount; i++) {
            const y = isoStartY + i * rowSpacing;
            const seg = clipShearedInfiniteLineToBounds({ x: xMin, y }, { x: 1, y: 0 });
            if (!seg) continue;
            pushSegmentPath(
              seg.a.x,
              seg.a.y,
              seg.b.x,
              seg.b.y,
              null,
              null,
              {
                isometricRole: 'horizontal',
                isometricIndex: i,
                isometricBaseY: y,
                isometricRowSpacing: rowSpacing,
                isometricRowShift: rowShift,
              }
            );
          }
          buildSlopeFamily(1);
          buildSlopeFamily(-1);
          paths.isometricMetrics = {
            rowCount,
            rowSpacing,
            rowShift,
            rowShiftShear,
            diagonalBaseStep: bStep,
            positiveSlope: slope60 / Math.max(1e-6, 1 + rowShiftShear * slope60),
            negativeSlope: -slope60 / Math.max(1e-6, 1 - rowShiftShear * slope60),
          };
          return paths;
        }
        if (resolvedLineStructure === 'lattice') {
          const [aCount, bCount] = splitLineBudget(lines, 2);
          buildParallelLinesAtAngle(45, 1, aCount);
          buildParallelLinesAtAngle(-45, 1, bCount);
          return paths;
        }
        if (resolvedLineStructure === 'horizon') {
          const localPaths = [];
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
          const horizonY = inset + innerH * horizonT;
          const baseY = inset + innerH;
          const safeDelta = Math.max(1, baseY - horizonY);
          const horizontalCount = Math.max(2, Math.round(p.horizonHorizontalLines ?? Math.max(5, Math.round(lines / 2))));
          const verticalCount = Math.max(2, Math.round(p.horizonVerticalLines ?? Math.max(5, Math.round(lines / 2))));
          const horizonCenterX = inset + innerW * 0.5;
          const planeHalfWidth = innerW * (0.72 + horizonFanReach * 0.85);
          const planeDepth = safeDelta * (3 + horizonVanishingPower * 1.7 + depthPerspective * 0.65);
          const cameraPullback = planeDepth * (0.34 + horizonVanishingPower * 0.28) + safeDelta * 0.18;
          const focalX = innerW * (1.05 + horizonVanishingPower * 1.25);
          const focalY = innerW * (0.36 + horizonVanishingPower * 0.34);
          const groundSpan = safeDelta * (1.58 + horizonVanishingPower * 0.35);
          const elevationScale = safeDelta * (0.018 + horizonRelief * 0.05 + horizonShoulderLift * 0.015);
          const targetWorldX = (horizonVanishingX * 2 - 1) * planeHalfWidth * 0.6;
          const bufferW = Math.max(360, Math.min(1200, Math.round(width * 2)));
          const bufferH = Math.max(240, Math.round(bufferW * (height / Math.max(1, width))));
          const depthBuffer = new Float32Array(bufferW * bufferH).fill(Number.POSITIVE_INFINITY);
          const accumulatedCeiling = new Float32Array(bufferW).fill(Number.POSITIVE_INFINITY);
          const depthEpsilon = Math.max(2.25, safeDelta * 0.018 + planeDepth * 0.0025);
          const edgeFn = (ax, ay, bx, by, px, py) => (px - ax) * (by - ay) - (py - ay) * (bx - ax);
          const toBufferX = (x) => (x / Math.max(1, width)) * (bufferW - 1);
          const toBufferY = (y) => (y / Math.max(1, height)) * (bufferH - 1);
          const clampBufferIndex = (value, max) => Math.max(0, Math.min(max, value));
          const getDepthState = (depthNorm) => {
            const farFactor = 1 - depthNorm;
            const nearFactor = depthNorm;
            const ampScale =
              0.08
              + farFactor * (0.08 + horizonRelief * 0.08)
              + nearFactor * (0.24 + depthPerspective * 0.08);
            return { depthNorm, farFactor, nearFactor, ampScale };
          };
          const getCenterProfile = (worldX, depthState) => {
            const centerNorm = Math.abs(worldX) / Math.max(1e-6, planeHalfWidth);
            const focus = Math.exp(-Math.pow(centerNorm / horizonCenterWidth, 2));
            const dampening = focus * horizonCenterDampening * (0.72 + depthState.farFactor * 0.28);
            const ridgeBoost = (1 - focus) * horizonCenterDampening * 0.28;
            const shoulderStart = Math.min(0.88, horizonCenterWidth * 0.72 + 0.1);
            const shoulderMask = clamp01((centerNorm - shoulderStart) / Math.max(0.08, 1 - shoulderStart));
            const shapedShoulder = shoulderMask * shoulderMask * (3 - 2 * shoulderMask);
            const mountainMask = Math.pow(shoulderMask, 1.35);
            const roadMask = clamp01(centerNorm / Math.max(0.08, horizonCenterWidth));
            const valleyMask = roadMask * roadMask * (3 - 2 * roadMask);
            const farTerrainWeight = Math.pow(depthState.farFactor, 0.74);
            const nearTerrainWeight = Math.pow(depthState.nearFactor, 0.92);
            return {
              amplitudeScale: Math.max(0.08, 1 - dampening + ridgeBoost + shapedShoulder * horizonShoulderLift * 0.42),
              basinLift:
                focus
                * horizonCenterBasin
                * elevationScale
                * (0.42 + farTerrainWeight * 0.48 + nearTerrainWeight * 0.86),
              shoulderLift:
                (shapedShoulder * 0.45 + mountainMask * 0.95)
                * horizonShoulderLift
                * elevationScale
                * (0.28 + farTerrainWeight * 2.05 + nearTerrainWeight * 0.1),
              valleyLift:
                valleyMask
                * horizonValleyProfile
                * elevationScale
                * (0.18 + farTerrainWeight * 0.95 + nearTerrainWeight * 0.16),
            };
          };
          const samplePlaneNoise = (sampleWorldX, depthNorm) => {
            const planeCoordX = (sampleWorldX / Math.max(1e-6, planeHalfWidth)) * innerW;
            const planeCoordZ = depthNorm * planeDepth;
            const imageSampleX = inset + ((sampleWorldX / Math.max(1e-6, planeHalfWidth)) * 0.5 + 0.5) * innerW;
            const imageSampleY = inset + depthNorm * innerH;
            return sampleCombinedNoise(
              planeCoordX,
              planeCoordZ,
              planeCoordX,
              planeCoordZ,
              imageSampleX,
              imageSampleY
            );
          };
          const sampleMirroredNoise = (sampleWorldX, depthNorm) => {
            const directNoise = samplePlaneNoise(sampleWorldX, depthNorm);
            const mirroredNoise = samplePlaneNoise(-sampleWorldX, depthNorm);
            return directNoise * (1 - horizonMirrorBlend) + mirroredNoise * horizonMirrorBlend;
          };
          const sampleSurfaceHeight = (worldX, depthNorm) => {
            const depthState = getDepthState(depthNorm);
            let noiseVal = sampleMirroredNoise(worldX, depthNorm);
            const smoothingStrength = Math.pow(depthState.farFactor, 1.45) * (0.38 + horizonCenterDampening * 0.34);
            if (smoothingStrength > 0.015) {
              const smoothingRadius = planeHalfWidth * (0.008 + smoothingStrength * 0.02);
              const leftNoise = sampleMirroredNoise(
                Math.max(-planeHalfWidth, Math.min(planeHalfWidth, worldX - smoothingRadius)),
                depthNorm
              );
              const rightNoise = sampleMirroredNoise(
                Math.max(-planeHalfWidth, Math.min(planeHalfWidth, worldX + smoothingRadius)),
                depthNorm
              );
              const averagedNoise = (leftNoise + noiseVal + rightNoise) / 3;
              noiseVal = lerp(noiseVal, averagedNoise, Math.min(0.82, smoothingStrength));
            }
            const centerProfile = getCenterProfile(worldX, depthState);
            const elevation =
              noiseVal
              * elevationScale
              * depthState.ampScale
              * centerProfile.amplitudeScale;
            return elevation + centerProfile.shoulderLift + centerProfile.valleyLift - centerProfile.basinLift;
          };
          const worldDepthAt = (rowT) => Math.pow(rowT, 1.08 + (1 - depthPerspective) * 0.7) * planeDepth;
          const projectWorldPoint = (worldX, worldY, worldZ) => {
            const cameraDepth = cameraPullback + worldZ;
            const nearNorm = cameraPullback / Math.max(1e-6, cameraPullback + planeDepth);
            const currentNorm = cameraPullback / Math.max(1e-6, cameraDepth);
            const screenDepthNorm = clamp01((currentNorm - nearNorm) / Math.max(1e-6, 1 - nearNorm));
            const invDepth = 1 / Math.max(1e-6, cameraDepth);
            return {
              worldX,
              worldY,
              worldZ,
              cameraDepth,
              x: horizonCenterX + (worldX - targetWorldX) * (focalX * invDepth),
              y: horizonY + groundSpan * screenDepthNorm - worldY * (focalY * invDepth),
            };
          };
          const mesh = Array.from({ length: horizontalCount }, (_, rowIndex) => {
            const rowT = horizontalCount <= 1 ? 0.5 : rowIndex / (horizontalCount - 1);
            const worldZ = worldDepthAt(rowT);
            return Array.from({ length: verticalCount }, (_, columnIndex) => {
              const colT = verticalCount <= 1 ? 0.5 : columnIndex / (verticalCount - 1);
              const worldX = -planeHalfWidth + colT * planeHalfWidth * 2;
              const worldY = sampleSurfaceHeight(worldX, rowT);
              return projectWorldPoint(worldX, worldY, worldZ);
            });
          });
          const rasterizeSurfaceTriangle = (a, b, c) => {
            if (!a || !b || !c) return;
            const ax = toBufferX(a.x);
            const ay = toBufferY(a.y);
            const bx = toBufferX(b.x);
            const by = toBufferY(b.y);
            const cx = toBufferX(c.x);
            const cy = toBufferY(c.y);
            const area = edgeFn(ax, ay, bx, by, cx, cy);
            if (Math.abs(area) < 1e-6) return;
            const minX = clampBufferIndex(Math.floor(Math.min(ax, bx, cx)), bufferW - 1);
            const maxX = clampBufferIndex(Math.ceil(Math.max(ax, bx, cx)), bufferW - 1);
            const minY = clampBufferIndex(Math.floor(Math.min(ay, by, cy)), bufferH - 1);
            const maxY = clampBufferIndex(Math.ceil(Math.max(ay, by, cy)), bufferH - 1);
            for (let y = minY; y <= maxY; y++) {
              const py = y + 0.5;
              for (let x = minX; x <= maxX; x++) {
                const px = x + 0.5;
                const w0 = edgeFn(bx, by, cx, cy, px, py);
                const w1 = edgeFn(cx, cy, ax, ay, px, py);
                const w2 = edgeFn(ax, ay, bx, by, px, py);
                const hasPositive = w0 >= 0 && w1 >= 0 && w2 >= 0;
                const hasNegative = w0 <= 0 && w1 <= 0 && w2 <= 0;
                if (!hasPositive && !hasNegative) continue;
                const alpha = w0 / area;
                const beta = w1 / area;
                const gamma = w2 / area;
                const depth = a.cameraDepth * alpha + b.cameraDepth * beta + c.cameraDepth * gamma;
                const idx = y * bufferW + x;
                if (depth < depthBuffer[idx]) depthBuffer[idx] = depth;
                const screenY = (py / Math.max(1, bufferH - 1)) * height;
                if (screenY < accumulatedCeiling[x]) accumulatedCeiling[x] = screenY;
              }
            }
          };
          for (let rowIndex = 0; rowIndex < horizontalCount - 1; rowIndex++) {
            for (let columnIndex = 0; columnIndex < verticalCount - 1; columnIndex++) {
              const a = mesh[rowIndex][columnIndex];
              const b = mesh[rowIndex][columnIndex + 1];
              const c = mesh[rowIndex + 1][columnIndex];
              const d = mesh[rowIndex + 1][columnIndex + 1];
              rasterizeSurfaceTriangle(a, c, b);
              rasterizeSurfaceTriangle(b, c, d);
            }
          }
          const pointVisibleAgainstSurface = (point) => {
            if (!point) return false;
            if (point.x < inset - 1 || point.x > width - inset + 1 || point.y < inset - 1 || point.y > height - inset + 1) {
              return false;
            }
            const bx = Math.round(toBufferX(point.x));
            const by = Math.round(toBufferY(point.y));
            if (bx < 0 || bx >= bufferW || by < 0 || by >= bufferH) return false;
            let nearestDepth = Number.POSITIVE_INFINITY;
            for (let yOffset = -1; yOffset <= 1; yOffset++) {
              const sy = by + yOffset;
              if (sy < 0 || sy >= bufferH) continue;
              for (let xOffset = -1; xOffset <= 1; xOffset++) {
                const sx = bx + xOffset;
                if (sx < 0 || sx >= bufferW) continue;
                const depth = depthBuffer[sy * bufferW + sx];
                if (depth < nearestDepth) nearestDepth = depth;
              }
            }
            if (!Number.isFinite(nearestDepth)) return false;
            return point.cameraDepth <= nearestDepth + depthEpsilon;
          };
          const segmentLength = (segment = []) => {
            let total = 0;
            for (let index = 1; index < segment.length; index++) {
              const a = segment[index - 1];
              const b = segment[index];
              if (!a || !b) continue;
              total += Math.hypot(b.x - a.x, b.y - a.y);
            }
            return total;
          };
          const clipSegmentBelowY = (segment = [], minY) => {
            if (!Array.isArray(segment) || segment.length < 2) return [];
            const clipped = [];
            let current = [];
            const pushCurrent = () => {
              if (current.length >= 2) clipped.push(current);
              current = [];
            };
            const appendPoint = (point) => {
              if (!point) return;
              const prev = current[current.length - 1];
              if (prev && Math.abs(prev.x - point.x) < 0.01 && Math.abs(prev.y - point.y) < 0.01) return;
              current.push(point);
            };
            for (let index = 1; index < segment.length; index++) {
              const a = segment[index - 1];
              const b = segment[index];
              const aVisible = a.y >= minY;
              const bVisible = b.y >= minY;
              if (aVisible && !current.length) appendPoint({ x: a.x, y: a.y });
              if (aVisible && bVisible) {
                appendPoint({ x: b.x, y: b.y });
                continue;
              }
              if (aVisible !== bVisible) {
                const t = clamp01((minY - a.y) / Math.max(1e-6, b.y - a.y));
                const intersection = {
                  x: lerp(a.x, b.x, t),
                  y: minY,
                };
                appendPoint(intersection);
                if (bVisible) {
                  if (!current.length) appendPoint(intersection);
                  appendPoint({ x: b.x, y: b.y });
                } else {
                  pushCurrent();
                }
                continue;
              }
              pushCurrent();
            }
            pushCurrent();
            return clipped;
          };
          const buildVisiblePolylineSegments = (nodes = [], minimumVisibleLength = 3.5, options = {}) => {
            const segments = [];
            const maxBridgeLength = Math.max(0, options.maxBridgeLength || 0);
            const sampled = [];
            let current = [];
            const pushCurrent = () => {
              if (current.length < 2) {
                current = [];
                return;
              }
              if (segmentLength(current) >= minimumVisibleLength) {
                segments.push(current.map((point) => ({ x: point.x, y: point.y })));
              }
              current = [];
            };
            const appendPoint = (point) => {
              if (!point) return;
              const prev = current[current.length - 1];
              if (prev && Math.abs(prev.x - point.x) < 0.01 && Math.abs(prev.y - point.y) < 0.01) return;
              current.push(point);
            };
            for (let nodeIndex = 1; nodeIndex < nodes.length; nodeIndex++) {
              const start = nodes[nodeIndex - 1];
              const end = nodes[nodeIndex];
              if (!start || !end) continue;
              const sampleCount = Math.max(6, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 4));
              for (let step = 0; step <= sampleCount; step++) {
                if (nodeIndex > 1 && step === 0) continue;
                const t = step / sampleCount;
                const sample = projectWorldPoint(
                  lerp(start.worldX, end.worldX, t),
                  lerp(start.worldY, end.worldY, t),
                  lerp(start.worldZ, end.worldZ, t)
                );
                sampled.push({ point: { x: sample.x, y: sample.y }, visible: pointVisibleAgainstSurface(sample) });
              }
            }
            if (maxBridgeLength > 0 && sampled.length >= 3) {
              for (let startIndex = 0; startIndex < sampled.length; startIndex++) {
                if (sampled[startIndex].visible) continue;
                const prevIndex = startIndex - 1;
                if (prevIndex < 0 || !sampled[prevIndex].visible) continue;
                let endIndex = startIndex;
                let gapLength = 0;
                while (endIndex < sampled.length && !sampled[endIndex].visible) {
                  const prevPoint = sampled[endIndex - 1]?.point;
                  const nextPoint = sampled[endIndex]?.point;
                  if (prevPoint && nextPoint) {
                    gapLength += Math.hypot(nextPoint.x - prevPoint.x, nextPoint.y - prevPoint.y);
                  }
                  endIndex++;
                }
                if (endIndex >= sampled.length || !sampled[endIndex].visible) {
                  startIndex = endIndex;
                  continue;
                }
                if (gapLength <= maxBridgeLength) {
                  for (let bridgeIndex = startIndex; bridgeIndex < endIndex; bridgeIndex++) {
                    sampled[bridgeIndex].visible = true;
                  }
                }
                startIndex = endIndex;
              }
            }
            sampled.forEach((entry) => {
              if (entry.visible) appendPoint(entry.point);
              else pushCurrent();
            });
            pushCurrent();
            return segments;
          };
          const buildVisibleClippedSegments = (nodes = [], minimumVisibleLength = 3.5, options = {}) => {
            const segments = [];
            const sampleSpacing = Math.max(1.5, options.sampleSpacing || 2.5);
            const transitionSteps = Math.max(6, Math.min(18, options.transitionSteps || 12));
            let current = [];
            const pushCurrent = () => {
              if (current.length < 2) {
                current = [];
                return;
              }
              if (segmentLength(current) >= minimumVisibleLength) {
                segments.push(current.map((point) => ({ x: point.x, y: point.y })));
              }
              current = [];
            };
            const appendPoint = (point) => {
              if (!point) return;
              const prev = current[current.length - 1];
              if (prev && Math.abs(prev.x - point.x) < 0.01 && Math.abs(prev.y - point.y) < 0.01) return;
              current.push({ x: point.x, y: point.y });
            };
            const sampleEdgePoint = (start, end, t) =>
              projectWorldPoint(
                lerp(start.worldX, end.worldX, t),
                lerp(start.worldY, end.worldY, t),
                lerp(start.worldZ, end.worldZ, t)
              );
            const refineTransitionPoint = (start, end, startT, endT, visibleAtStart) => {
              let lowT = startT;
              let highT = endT;
              let lowPoint = sampleEdgePoint(start, end, lowT);
              let highPoint = sampleEdgePoint(start, end, highT);
              for (let step = 0; step < transitionSteps; step++) {
                const midT = (lowT + highT) * 0.5;
                const midPoint = sampleEdgePoint(start, end, midT);
                const midVisible = pointVisibleAgainstSurface(midPoint);
                if (midVisible === visibleAtStart) {
                  lowT = midT;
                  lowPoint = midPoint;
                } else {
                  highT = midT;
                  highPoint = midPoint;
                }
              }
              const boundaryT = (lowT + highT) * 0.5;
              return sampleEdgePoint(start, end, boundaryT);
            };
            for (let nodeIndex = 1; nodeIndex < nodes.length; nodeIndex++) {
              const start = nodes[nodeIndex - 1];
              const end = nodes[nodeIndex];
              if (!start || !end) continue;
              const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
              const sampleCount = Math.max(8, Math.ceil(edgeLength / sampleSpacing));
              let previousT = 0;
              let previousPoint = sampleEdgePoint(start, end, previousT);
              let previousVisible = pointVisibleAgainstSurface(previousPoint);
              if (previousVisible && !current.length) appendPoint(previousPoint);
              for (let step = 1; step <= sampleCount; step++) {
                const t = step / sampleCount;
                const point = sampleEdgePoint(start, end, t);
                const visible = pointVisibleAgainstSurface(point);
                if (visible === previousVisible) {
                  if (visible) appendPoint(point);
                  previousT = t;
                  previousPoint = point;
                  continue;
                }
                const boundaryPoint = refineTransitionPoint(start, end, previousT, t, previousVisible);
                if (previousVisible) {
                  appendPoint(boundaryPoint);
                  pushCurrent();
                } else {
                  appendPoint(boundaryPoint);
                }
                if (visible) {
                  appendPoint(point);
                }
                previousT = t;
                previousPoint = point;
                previousVisible = visible;
              }
              if (!previousVisible) pushCurrent();
            }
            pushCurrent();
            return segments;
          };
          const hiddenFarRows = Math.max(2, Math.round(horizontalCount * 0.16));
          const filterUnexpectedHorizonSegments = (segments = [], role = 'row') =>
            segments.filter((segment) => {
              const avgY = segment.reduce((sum, point) => sum + point.y, 0) / Math.max(1, segment.length);
              const length = segmentLength(segment);
              if (role === 'row') {
                if (avgY < horizonY + safeDelta * 0.18) return false;
                if (avgY < horizonY + safeDelta * 0.24 && length < innerW * 0.35) return false;
                if (avgY < horizonY + safeDelta * 0.3 && length < innerW * 0.22) return false;
                if (length >= 24) return true;
                return avgY >= horizonY + safeDelta * 0.3;
              }
              if (avgY < horizonY + safeDelta * 0.12) return false;
              if (length >= 24) return true;
              return avgY >= horizonY + safeDelta * 0.24;
            });
          const horizonMetrics = {
            mode: 'horizon',
            horizontalCount,
            verticalCount,
            rows: [],
            columns: [],
          };
          const terrainRenderFloorY = horizonY + safeDelta * 0.16;
          const terrainColumnFloorY = horizonY + safeDelta * 0.22;
          for (let rowIndex = 0; rowIndex < horizontalCount; rowIndex++) {
            const rowNodes = mesh[rowIndex];
            const rowDepthNorm = horizontalCount <= 1 ? 0.5 : rowIndex / (horizontalCount - 1);
            const rowSegmentsRaw =
              rowIndex < hiddenFarRows
                ? []
                : filterUnexpectedHorizonSegments(
                  buildVisibleClippedSegments(rowNodes, 4 + (1 - rowDepthNorm) * 10, {
                    sampleSpacing: 2.25 + rowDepthNorm * 1.5,
                  }),
                  'row'
                );
            const rowSegments = rowSegmentsRaw.flatMap((segment) => clipSegmentBelowY(segment, terrainRenderFloorY));
            rowSegments.forEach((segment, segmentIndex) => {
              segment.meta = {
                ...(segment.meta || {}),
                horizonRole: 'row',
                horizonRowIndex: rowIndex,
                horizonRowSegmentIndex: segmentIndex,
              };
              localPaths.push(segment);
            });
            horizonMetrics.rows.push({
              rowIndex,
              points: rowNodes.map((node) => ({ x: node.x, y: node.y })),
              cameraDepth: rowNodes[0]?.cameraDepth ?? Number.NaN,
              visibleSegmentCount: rowSegments.length,
            });
          }
          for (let columnIndex = 0; columnIndex < verticalCount; columnIndex++) {
            const columnNodes = mesh.map((row) => row[columnIndex]);
            const columnSegmentsRaw = filterUnexpectedHorizonSegments(
              buildVisibleClippedSegments(columnNodes, 7, {
                sampleSpacing: 2.5,
              }),
              'column'
            );
            const columnSegments = columnSegmentsRaw.flatMap((segment) => clipSegmentBelowY(segment, terrainColumnFloorY));
            columnSegments.forEach((segment, segmentIndex) => {
              segment.meta = {
                ...(segment.meta || {}),
                horizonRole: 'column',
                horizonColumnIndex: columnIndex,
                horizonColumnSegmentIndex: segmentIndex,
              };
              localPaths.push(segment);
            });
            horizonMetrics.columns.push({
              columnIndex,
              points: columnNodes.map((node) => ({ x: node.x, y: node.y })),
              visibleSegmentCount: columnSegments.length,
            });
          }
          const envelope = [];
          for (let xIndex = 0; xIndex < bufferW; xIndex++) {
            const ceiling = accumulatedCeiling[xIndex];
            if (!Number.isFinite(ceiling)) continue;
            envelope.push({
              x: (xIndex / Math.max(1, bufferW - 1)) * width,
              y: ceiling,
            });
          }
          if (envelope.length >= 2) {
            const bottomY = height - inset;
            maskPolygons.push([
              ...envelope,
              { x: envelope[envelope.length - 1].x, y: bottomY },
              { x: envelope[0].x, y: bottomY },
              { x: envelope[0].x, y: envelope[0].y },
            ]);
          }
          localPaths.horizonMetrics = horizonMetrics;
          localPaths.maskPolygons = maskPolygons;
          return localPaths;
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
            const amp = resolveVerticalNoiseAmplitude(
              noiseVal,
              getEdgeTaper(xNorm)
              * getVerticalTaper(yNorm)
              * d.ampScale
              * centerProfile.amplitudeScale
              * strength
            );
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
              const dy = b.y - a.y;
              const safeDy = Math.abs(dy) < 1e-6 ? (dy < 0 ? -1e-6 : 1e-6) : dy;
              const intersects =
                (a.y > point.y) !== (b.y > point.y)
                && point.x < ((b.x - a.x) * (point.y - a.y)) / safeDy + a.x;
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
          const rowLayouts = [];
          for (let i = 0; i < horizontalCount; i++) {
            const t = horizontalCount <= 1 ? 0.5 : i / (horizontalCount - 1);
            const depth = horizonDepthOffset + Math.pow(t, 1.8) * (offscreenDepth - horizonDepthOffset);
            const y = horizonY + safeDelta * depth;
            if (y < inset - safeDelta * 0.1) continue;
            const rowPath = buildHorizonRow(y, (_s, _x, _y, d) =>
              Math.max(horizonRelief * 0.6, 0.24 + horizonRelief * 0.45 + Math.pow(d.nearFactor, 1.05) * 0.86)
            );
            if (!rowPath) continue;
            horizonRows.push(rowPath);
            rowLayouts.push({ rowIndex: horizonRows.length - 1, baseY: y });
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
          const horizonMetrics = {
            horizontalCount: displayRows.length,
            verticalCount,
            rows: rowLayouts.map((entry, rowIndex) => ({ rowIndex, baseY: entry.baseY })),
            columns: [],
          };
          for (let rowIndex = 0; rowIndex < visibleRows.length; rowIndex++) {
            const rowSegments = pushVisibleSegments(visibleRows[rowIndex], {
              horizonRole: 'row',
              horizonRowIndex: rowIndex,
            });
            rowSegments.forEach((segment, segmentIndex) => {
              segment.meta = {
                ...(segment.meta || {}),
                horizonRole: 'row',
                horizonRowIndex: rowIndex,
                horizonRowSegmentIndex: segmentIndex,
              };
            });
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
          const getColumnBaseX = (columnIndex) => {
            const t = verticalCount <= 1 ? 0.5 : columnIndex / (verticalCount - 1);
            const bottomT = -fanOverscan + t * (1 + fanOverscan * 2);
            return inset + innerW * bottomT;
          };
          const evaluateColumnNode = (columnIndex, rowIndex) => {
            const rowLayout = rowLayouts[rowIndex];
            if (!rowLayout) return null;
            const bottomX = getColumnBaseX(columnIndex);
            const rowNear = rowLayouts.length <= 1 ? 1 : rowIndex / (rowLayouts.length - 1);
            const convergence = horizonVanishingPower * Math.pow(1 - rowNear, 1.1);
            const baseX = bottomX + (horizonTargetX - bottomX) * convergence;
            return evaluateHorizonNode(baseX, rowLayout.baseY);
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
            const columnPoints = rowLayouts.map((_row, rowIndex) => evaluateColumnNode(i, rowIndex));
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
                if (isHiddenByNearerBand(midpoint, rowIndex)) {
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
                return start.y <= skylineY + skylineReconnectSlack || segment.length >= 6;
              })
              .forEach((segment, segmentIndex) => {
                segment.meta = {
                  ...(segment.meta || {}),
                  horizonRole: 'column',
                  horizonColumnIndex: i,
                  horizonColumnSegmentIndex: segmentIndex,
                };
                paths.push(segment);
              });
            horizonMetrics.columns.push({
              columnIndex: i,
              baseX: getColumnBaseX(i),
              points: columnPoints.filter(Boolean).map((point) => ({ x: point.x, y: point.y })),
              visibleSegmentCount: columnSegments.length,
            });
          }
          paths.horizonMetrics = horizonMetrics;
          paths.maskPolygons = maskPolygons;
          return paths;
        }
        return paths;
      },
      formula: (p) =>
        `structure = ${
          (p.lineStructure === 'horizontal-vanishing-point' || p.lineStructure === 'horizon-3d'
            ? 'horizon'
            : p.lineStructure) || 'horizontal'
        }\ny = yBase + Σ noiseᵢ(rotate(x*zoomᵢ*freqᵢ, y*zoomᵢ)) * ampᵢ\nedge/vertical dampening scales noise`,
    };
})();
