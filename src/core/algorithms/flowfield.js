/**
 * flowfield algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.flowfield = {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const paths = [];
        const count = Math.max(1, Math.floor(p.density));
        const flowMode = p.flowMode || (p.noiseType === 'curl' ? 'curl' : 'angle');
        const angleOffset = ((p.angleOffset ?? 0) * Math.PI) / 180;
        const chaos = p.chaos ?? 0;
        const maxSteps = Math.max(1, Math.floor(p.maxSteps ?? 50));
        const minSteps = Math.max(2, Math.floor(p.minSteps ?? 2));
        const minLength = Math.max(0, p.minLength ?? 0);
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
        const legacyNoise = {
          enabled: true,
          type: p.noiseType === 'curl' ? 'simplex' : p.noiseType || 'simplex',
          blend: 'add',
          amplitude: 1,
          zoom: p.noiseScale ?? 0.01,
          freq: 1,
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
          octaves: Math.max(1, Math.floor(p.octaves ?? 2)),
          lacunarity: Math.max(1.1, p.lacunarity ?? 2),
          gain: Math.min(1, Math.max(0.1, p.gain ?? 0.5)),
          fieldMode: flowMode,
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

        const sampleField = (x, y) => {
          let combined;
          noiseLayers.forEach((noiseLayer) => {
            const sampleX = noiseLayer.type === 'polygon' ? x - width / 2 : x;
            const sampleY = noiseLayer.type === 'polygon' ? y - height / 2 : y;
            const value =
              rack.sampleScalar(sampleX, sampleY, noiseLayer, { worldX: x, worldY: y }) * (noiseLayer.amplitude ?? 1);
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: noiseLayer.blend || 'add',
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };

        const curlAngle = (x, y) => {
          const eps = 0.0005;
          const dx = sampleField(x + eps, y) - sampleField(x - eps, y);
          const dy = sampleField(x, y + eps) - sampleField(x, y - eps);
          return Math.atan2(dy, -dx);
        };
        for (let i = 0; i < count; i++) {
          const path = [];
          let x = m + rng.nextFloat() * dW;
          let y = m + rng.nextFloat() * dH;
          path.push({ x, y });
          let length = 0;
          for (let s = 0; s < maxSteps; s++) {
            let angle = 0;
            if (flowMode === 'curl') {
              angle = curlAngle(x, y) * (p.force ?? 1) + angleOffset;
            } else {
              const n = sampleField(x, y);
              angle = n * Math.PI * 2 * (p.force ?? 1) + angleOffset;
            }
            angle += (rng.nextFloat() - 0.5) * chaos;
            const dx = Math.cos(angle) * p.stepLen;
            const dy = Math.sin(angle) * p.stepLen;
            x += dx;
            y += dy;
            if (x < m || x > width - m || y < m || y > height - m) break;
            length += Math.hypot(dx, dy);
            path.push({ x, y });
          }
          if (path.length >= minSteps && length >= minLength) paths.push(path);
        }
        return paths;
      },
      formula: (p) =>
        `Flow angle = Noise Rack field (${p.flowMode || (p.noiseType === 'curl' ? 'curl' : 'angle')}) * ${p.force}\npos += [cos(θ), sin(θ)] * ${p.stepLen}`,
    };
})();
