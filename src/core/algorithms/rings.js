/**
 * rings algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.rings = {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const TAU = Math.PI * 2;
        const inset = bounds.truncate ? m : 0;
        const innerW = width - inset * 2;
        const innerH = height - inset * 2;
        const cx = width / 2 + (p.offsetX ?? 0);
        const cy = height / 2 + (p.offsetY ?? 0);
        const maxR = Math.max(1, Math.min(width, height) / 2 - inset);
        const rings = Math.max(1, Math.floor(p.rings ?? 1));
        const baseGap = rings > 1 ? maxR / (rings - 1) : maxR;
        const gap = baseGap * (p.gap ?? 1);
        const total = gap * (rings - 1);
        const centerRadiusBoost = Math.max(0, (p.centerDiameter ?? 0) / 2);
        const startR = Math.max(0, maxR - total) + centerRadiusBoost;
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });

        const legacyNoise = {
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: p.amplitude ?? 8,
          zoom: p.noiseScale ?? 0.001,
          freq: 1,
          angle: 0,
          shiftX: p.noiseOffsetX ?? 0,
          shiftY: p.noiseOffsetY ?? 0,
          tileMode: 'off',
          tilePadding: 0,
          patternScale: 1,
          warpStrength: 1,
          cellularScale: 1,
          cellularJitter: 1,
          stepsCount: 5,
          seed: 0,
          applyMode: 'orbit',
          ringDrift: p.noiseLayer ?? 0.5,
          ringRadius: p.noiseRadius ?? 100,
          noiseStyle: 'linear',
          noiseThreshold: 0,
          imageWidth: 1,
          imageHeight: 1,
          microFreq: 0,
          imageInvertColor: false,
          imageInvertOpacity: false,
          imageId: p.noiseImageId || '',
          imageName: p.noiseImageName || '',
          imagePreview: '',
          imageAlgo: p.imageAlgo || 'luma',
          imageEffects: [],
          polygonRadius: 2,
          polygonSides: 6,
          polygonRotation: 0,
          polygonOutline: 0,
          polygonEdgeRadius: 0,
        };

        const noiseLayers = (Array.isArray(p.noises) && p.noises.length ? p.noises : [legacyNoise])
          .map((noiseLayer) => ({
            ...legacyNoise,
            ...(noiseLayer || {}),
            enabled: noiseLayer?.enabled !== false,
          }))
          .filter((noiseLayer) => noiseLayer.enabled !== false);

        const maxAmp = noiseLayers.reduce((sum, noiseLayer) => sum + Math.abs(noiseLayer.amplitude ?? 0), 0) || 1;

        const sampleNoise = ({ theta, ringIndex, ringRadiusBase, worldX, worldY }) => {
          let combined;
          noiseLayers.forEach((noiseLayer) => {
            const amplitude = noiseLayer.amplitude ?? 0;
            const zoom = Math.max(0.0001, noiseLayer.zoom ?? 0.001);
            const freq = Math.max(0.05, noiseLayer.freq ?? 1);
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const shiftX = noiseLayer.shiftX ?? 0;
            const shiftY = noiseLayer.shiftY ?? 0;
            const applyMode = noiseLayer.applyMode || 'orbit';
            const ringDrift = noiseLayer.ringDrift ?? 0;
            const ringScale = Math.max(1e-6, noiseLayer.ringRadius ?? 100);

            let sampleX = 0;
            let sampleY = 0;
            let closureBlend = 0;
            let seamStartX = 0;
            let seamStartY = 0;
            let seamEndX = 0;
            let seamEndY = 0;

            if (applyMode === 'topdown') {
              const dx = worldX - cx + shiftX;
              const dy = worldY - cy + shiftY;
              const rx = dx * cosA - dy * sinA;
              const ry = dx * sinA + dy * cosA;

              if (noiseLayer.type === 'image' && (noiseLayer.tileMode || 'off') === 'off') {
                const u = (worldX - inset + shiftX) / Math.max(1, innerW) - 0.5;
                const v = (worldY - inset + shiftY) / Math.max(1, innerH) - 0.5;
                sampleX = u / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1);
                sampleY = v / Math.max(0.05, noiseLayer.imageHeight ?? 1);
              } else {
                const widthScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
                const heightScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
                sampleX = rx * zoom * widthScale;
                sampleY = ry * zoom * heightScale;
              }
            } else if (applyMode === 'concentric') {
              const pathT = Math.max(0, Math.min(1, theta / TAU));
              const localX = (pathT - 0.5) * ringScale + shiftX;
              const localY = ringIndex * ringDrift + shiftY;
              const rx = localX * cosA - localY * sinA;
              const ry = localX * sinA + localY * cosA;
              const seamLocalY = localY;
              const seamRawStartX = -0.5 * ringScale + shiftX;
              const seamRawEndX = 0.5 * ringScale + shiftX;
              const seamRxStart = seamRawStartX * cosA - seamLocalY * sinA;
              const seamRyStart = seamRawStartX * sinA + seamLocalY * cosA;
              const seamRxEnd = seamRawEndX * cosA - seamLocalY * sinA;
              const seamRyEnd = seamRawEndX * sinA + seamLocalY * cosA;
              closureBlend = pathT;

              const widthScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
              const heightScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
              sampleX = rx * zoom * widthScale;
              sampleY = ry * zoom * heightScale;
              seamStartX = seamRxStart * zoom * widthScale;
              seamStartY = seamRyStart * zoom * heightScale;
              seamEndX = seamRxEnd * zoom * widthScale;
              seamEndY = seamRyEnd * zoom * heightScale;
            } else {
              const orbitX = shiftX + Math.cos(theta) * ringScale;
              const orbitY = shiftY + Math.sin(theta) * ringScale;
              const rx = orbitX * cosA - orbitY * sinA;
              const ry = orbitX * sinA + orbitY * cosA;
              const drift = ringIndex * ringDrift;

              if (noiseLayer.type === 'image' && (noiseLayer.tileMode || 'off') === 'off') {
                const radiusNorm = maxR > 0 ? ringRadiusBase / maxR : 0;
                const polarX = Math.cos(theta) * radiusNorm * 0.5;
                const polarY = Math.sin(theta) * radiusNorm * 0.5;
                sampleX = polarX / Math.max(0.05, noiseLayer.imageWidth ?? 1) + drift;
                sampleY = polarY / Math.max(0.05, noiseLayer.imageHeight ?? 1) + drift;
              } else {
                const widthScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
                const heightScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
                sampleX = rx * zoom * widthScale + drift;
                sampleY = ry * zoom * heightScale + drift;
              }
            }

            let value = rack.evaluate(sampleX, sampleY, noiseLayer, { worldX, worldY });
            if (applyMode === 'concentric' && closureBlend > 0) {
              const seamStartValue = rack.evaluate(seamStartX, seamStartY, noiseLayer, { worldX, worldY });
              const seamEndValue = rack.evaluate(seamEndX, seamEndY, noiseLayer, { worldX, worldY });
              value -= (seamEndValue - seamStartValue) * closureBlend;
            }
            value *= amplitude;
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: noiseLayer.blend || 'add',
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };

        const paths = [];
        for (let i = 0; i < rings; i++) {
          const rBase = Math.max(0.1, startR + i * gap);
          const steps = Math.max(64, Math.floor(rBase * 2));
          const path = [];
          for (let k = 0; k < steps; k++) {
            const theta = (k / steps) * TAU;
            const baseX = cx + Math.cos(theta) * rBase;
            const baseY = cy + Math.sin(theta) * rBase;
            const n = sampleNoise({
              theta,
              ringIndex: i,
              ringRadiusBase: rBase,
              worldX: baseX,
              worldY: baseY,
            });
            const r = Math.max(0.1, rBase + n);
            path.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
          }
          if (path.length) path.push({ ...path[0] });
          paths.push(path);
        }

        return paths;
      },
      formula: (p) =>
        `Noise Rack stack on concentric rings\nTop Down = world-space XY field\nConcentric = seam-corrected ring-path field + ring drift\nOrbit Field = legacy ring-local orbital field\nr = r0 + Σ noise_i * amp_i`,
    };
})();
