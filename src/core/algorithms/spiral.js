/**
 * spiral algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.spiral = {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const scx = width / 2;
        const scy = height / 2;
        const spath = [];
        let r = p.startR;
        const offset = ((p.angleOffset ?? 0) * Math.PI) / 180;
        let theta = offset;
        const maxR = Math.min(dW, dH) / 2;
        const loops = Math.max(1, p.loops ?? 1);
        const stepsPerQuad = Math.max(1, Math.floor(p.res ?? 40));
        const axisSnap = Boolean(p.axisSnap);
        const dTheta = axisSnap ? (Math.PI / 2) / stepsPerQuad : (Math.PI * 2) / stepsPerQuad;
        const stepsPerLoop = Math.max(4, Math.round((Math.PI * 2) / dTheta));
        const totalSteps = Math.max(1, Math.floor((Math.PI * 2 * loops) / dTheta));
        const dr = (maxR - p.startR) / totalSteps;
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
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
              const a = Math.atan2(ny, nx);
              const spiral = r + a * 0.5;
              const rr = applyPad(frac(spiral), pad);
              const aa = applyPad(frac(a / (Math.PI * 2) + 0.5), pad) * Math.PI * 2;
              return { x: rr * Math.cos(aa), y: rr * Math.sin(aa) };
            }
            case 'checker': {
              const fx = frac(nx);
              const fy = frac(ny);
              return { x: applyPad(fx, pad), y: applyPad(fy, pad) };
            }
            case 'wave': {
              const fx = frac(nx + Math.sin(ny * Math.PI) * 0.3);
              const fy = frac(ny + Math.sin(nx * Math.PI) * 0.3);
              return { x: applyPad(fx, pad), y: applyPad(fy, pad) };
            }
            case 'grid':
            default: {
              const fx = applyPad(frac(nx), pad);
              const fy = applyPad(frac(ny), pad);
              return { x: fx, y: fy };
            }
          }
        };

        const noiseLayers = Array.isArray(p.noises) && p.noises.length
          ? p.noises
          : [
              {
                type: 'turbulence',
                blend: 'add',
                amplitude: p.noiseAmp ?? 0,
                zoom: p.noiseFreq ?? 0.1,
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
                applyMode: 'topdown',
                noiseStyle: 'linear',
                noiseThreshold: 0,
                imageWidth: 1,
                imageHeight: 1,
                microFreq: 0,
                imageInvertColor: false,
                imageInvertOpacity: false,
                imageEffects: [],
              },
            ];
        const inset = bounds.truncate ? m : 0;
        const innerW = width - inset * 2;
        const innerH = height - inset * 2;
        const noiseSamplers = noiseLayers
          .filter((layer) => layer && layer.enabled !== false)
          .map((noiseLayer) => {
            const amplitude = noiseLayer.amplitude ?? 0;
            const zoom = Math.max(0.0001, noiseLayer.zoom ?? 0.02);
            const freq = Math.max(0.1, noiseLayer.freq ?? 1);
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const shiftX = noiseLayer.shiftX ?? 0;
            const shiftY = noiseLayer.shiftY ?? 0;
            const tileMode = noiseLayer.tileMode || 'off';
            const tilePadding = noiseLayer.tilePadding ?? 0;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const applyMode = noiseLayer.applyMode || 'topdown';
            return {
              amplitude,
              blend: noiseLayer.blend || 'add',
              sample: (x, y, t, r) => {
                if (noiseLayer.type === 'image' && tileMode === 'off') {
                  let u = (x - inset) / innerW - 0.5 + shiftX;
                  let v = (y - inset) / innerH - 0.5 + shiftY;
                  if (applyMode === 'linear') {
                    u = t - 0.5 + shiftX;
                    v = r / maxR - 0.5 + shiftY;
                  }
                  const imageZoom = Math.max(0.1, zoom * 50);
                  const widthScale = 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1);
                  const heightScale = 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1);
                  const ix = u * imageZoom * widthScale;
                  const iy = v * imageZoom * heightScale;
                  const rx = ix * cosA - iy * sinA;
                  const ry = ix * sinA + iy * cosA;
                  return rack.evaluate(rx, ry, noiseLayer, { worldX: x, worldY: y });
                }
                const widthScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
                const heightScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
                const centeredX = noiseLayer.type === 'polygon' && applyMode !== 'linear' ? x - (inset + innerW * 0.5) : x;
                const centeredY = noiseLayer.type === 'polygon' && applyMode !== 'linear' ? y - (inset + innerH * 0.5) : y;
                let nx = (centeredX + shiftX) * zoom * widthScale;
                let ny = (centeredY + shiftY) * zoom * heightScale;
                if (applyMode === 'linear') {
                  const u = t - 0.5 + shiftX;
                  const v = r / maxR - 0.5 + shiftY;
                  nx = u * innerW * zoom * widthScale;
                  ny = v * innerH * zoom * heightScale;
                }
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

        for (let i = 0; i <= totalSteps; i++) {
          const t = totalSteps > 0 ? i / totalSteps : 0;
          const pulse = 1 + Math.sin(theta * (p.pulseFreq ?? 0)) * (p.pulseAmp ?? 0);
          let combined;
          const px = scx + Math.cos(theta) * r;
          const py = scy + Math.sin(theta) * r;
          noiseSamplers.forEach((sampler) => {
            const value = sampler.sample(px, py, t, r) * sampler.amplitude;
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: sampler.blend,
              maxAmplitude: maxAmp,
            });
          });
          const rMod = r * pulse + (combined ?? 0);
          spath.push({ x: scx + Math.cos(theta) * rMod, y: scy + Math.sin(theta) * rMod });
          theta += dTheta;
          r += dr;
        }
        return [spath];
      },
      formula: () => 'r = r + (noise(θ) * amp)\nx = cos(θ)*r, y = sin(θ)*r',
    };
})();
